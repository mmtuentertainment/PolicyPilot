// scripts/check-deploy-schema.ts
//
// Phase 5 deploy-prep (Issue #16 carry + Phase 5 hardening, 2026-05-27). Env-agnostic schema
// verifier for deploy-time validation: asserts the target database has all
// expected migrations applied AND the resulting schema matches the journal +
// RLS + Phase 4/5 column shapes + required unique indexes/constraints.
//
// Usage:
//   tsx --env-file=.env.local              scripts/check-deploy-schema.ts   # dev
//   tsx --env-file=.env.local.test         scripts/check-deploy-schema.ts   # test
//   tsx --env-file=secrets/staging.env     scripts/check-deploy-schema.ts   # staging
//   tsx --env-file=secrets/prod.env        scripts/check-deploy-schema.ts   # prod
//
// Exits 0 if all checks pass; exits 1 with structured failure report otherwise.
//
// Distinct from scripts/check-schema.ts (verify:phase-2 orchestrator step):
// that script is hard-coded to the TEST DB pattern (TEST_URL); this one is
// fully env-agnostic so the same binary runs against any environment. The two
// gates check overlapping invariants intentionally — Phase 2 verifies the test
// DB during development; this verifies staging/prod during deploy.

import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const DB_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('check-deploy-schema: DIRECT_URL or DATABASE_URL must be set in env');
  process.exit(1);
}

// Tenant-scoped tables — RLS + org_isolation policy + 4 GRANTs to authenticated.
// Phase 4 added batch_jobs; Phase 5 added qa_citation_grants. Keep this in
// lockstep with scripts/check-schema.ts and scripts/check-rls.ts.
const TENANT_TABLES = [
  'organizations',
  'users',
  'departments',
  'policies',
  'policy_versions',
  'policy_assignments',
  'acknowledgments',
  'ai_generations',
  'notifications',
  'workflow_stages',
  'batch_jobs',
  'qa_citation_grants',
] as const;

// Service-role tables — webhook idempotency state, no RLS.
const SERVICE_ROLE_TABLES = ['clerk_events', 'stripe_events'] as const;

const REQUIRED_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

// Phase 4 D-32 (drizzle/0007_ai_generations_audit_extensions.sql) replaced the
// legacy tokens_used integer with the Anthropic Usage 4-column shape + added
// idempotency_key column. Verify all 5 landed.
const AI_GENERATIONS_PHASE_4_COLUMNS = [
  'input_tokens',
  'output_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'idempotency_key',
] as const;

// Phase 4 D-32 hand-written partial-unique index for Idempotency-Key dedup.
const AI_GENERATIONS_IDEMPOTENCY_INDEX = 'ai_generations_org_idempotency_key';

const PHASE_5_UNIQUE_CONSTRAINTS = [
  'acknowledgments_user_id_policy_id_policy_version_id_unique',
  'policy_assignments_policy_id_assignee_type_assignee_id_unique',
  'qa_citation_grants_org_user_policy_unique',
] as const;

const QA_CITATION_GRANTS_COLUMNS = [
  { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'org_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'policy_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'granted_at', data_type: 'timestamp without time zone', is_nullable: 'NO' },
] as const;

const QA_CITATION_GRANTS_INDEXES = [
  'qa_citation_grants_org_id_idx',
  'qa_citation_grants_user_policy_idx',
] as const;

const PHASE_6_ORGANIZATION_BILLING_COLUMNS = [
  { column_name: 'stripe_price_id', data_type: 'text', is_nullable: 'YES' },
  { column_name: 'stripe_subscription_item_id', data_type: 'text', is_nullable: 'YES' },
  { column_name: 'stripe_current_period_end', data_type: 'timestamp with time zone', is_nullable: 'YES' },
  {
    column_name: 'stripe_cancel_at_period_end',
    data_type: 'boolean',
    is_nullable: 'NO',
    defaultIncludes: 'false',
  },
  { column_name: 'stripe_last_event_created', data_type: 'timestamp with time zone', is_nullable: 'YES' },
] as const;

const PHASE_6_ORGANIZATION_BILLING_INDEXES = [
  {
    indexname: 'organizations_stripe_customer_id_unique_idx',
    columnName: 'stripe_customer_id',
  },
  {
    indexname: 'organizations_stripe_subscription_id_unique_idx',
    columnName: 'stripe_subscription_id',
  },
] as const;

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Failure {
  check: string;
  detail: string;
}

function loadJournal(): JournalEntry[] {
  const journalPath = resolvePath(process.cwd(), 'drizzle/meta/_journal.json');
  const raw = readFileSync(journalPath, 'utf8');
  const parsed = JSON.parse(raw) as { entries: JournalEntry[] };
  return parsed.entries;
}

async function main(): Promise<void> {
  const journal = loadJournal();
  // PR #18 silent-failure review: log connection target (host only, never
  // credentials) so operator can correlate failures to the right Supabase project.
  const dbHost = (() => {
    try {
      return new URL(DB_URL!).host;
    } catch {
      return '(invalid DB_URL — cannot parse)';
    }
  })();
  console.log(`[check-deploy-schema] connecting to ${dbHost}`);
  // PR #18 silent-failure review: add connect_timeout to fail fast on stalled
  // networks (paused Supabase project, wrong host, etc.) instead of hanging.
  const sql = postgres(DB_URL!, {
    prepare: false,
    connect_timeout: 30,
    idle_timeout: 5,
  });
  const failures: Failure[] = [];
  let migrationsApplied = 0;
  // PR #18 silent-failure review: flag-based early-skip instead of `return`.
  // Original implementation `return`-ed from main() inside the try block on
  // the fresh-DB path — which exited main() cleanly via the finally and made
  // process.exit(1) (the failure-print block below) UNREACHABLE. Net effect:
  // verifier reported "schema OK" on a brand-new Supabase project — the worst
  // possible silent success. Flag pattern keeps the early-skip semantic but
  // routes through the failure-print block at end of main().
  let dbIsEmpty = false;

  try {
    // 1. drizzle.__drizzle_migrations: all journal entries applied?
    // The table may not exist if NO migration has ever been run against this DB
    // — treat that as a single named failure rather than crashing the script.
    try {
      const applied = await sql<{ id: number }[]>`
        SELECT id FROM drizzle.__drizzle_migrations ORDER BY id
      `;
      migrationsApplied = applied.length;
      if (applied.length !== journal.length) {
        // Distinguish under-applied (operator forgot db:migrate) from over-applied
        // (operator hand-applied an extra via psql — indicates a procedural drift
        // that the operator must investigate via Supabase audit log, NOT re-run migrate).
        const remediation =
          applied.length < journal.length
            ? `Run pnpm db:migrate against this DB.`
            : `Investigate the Supabase project audit log — drizzle.__drizzle_migrations has MORE entries than _journal.json. Do NOT re-run pnpm db:migrate; consult docs/runbooks/deploy-migrations.md § Troubleshooting.`;
        failures.push({
          check: 'migrations applied',
          detail: `expected ${journal.length} (journal 0000..${String(journal.length - 1).padStart(4, '0')}); found ${applied.length} applied. ${remediation}`,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/relation .*__drizzle_migrations.* does not exist/i.test(errMsg)) {
        failures.push({
          check: 'migrations applied',
          detail: `drizzle.__drizzle_migrations table missing — no migrations have been applied to this DB. Run pnpm db:migrate (or the env-specific variant).`,
        });
        // PR #18 silent-failure review: flag instead of return — see comment
        // on `dbIsEmpty` declaration above.
        dbIsEmpty = true;
      } else if (/permission denied/i.test(errMsg)) {
        // Permission-denied is structurally different from missing-table —
        // operator's DB user lacks SELECT on drizzle schema. Surface explicitly.
        failures.push({
          check: 'migrations applied',
          detail: `permission denied on drizzle.__drizzle_migrations (host=${dbHost}). The DB role used here lacks SELECT on the drizzle schema. Check Supabase project's RBAC config.`,
        });
        dbIsEmpty = true;
      } else {
        throw err;
      }
    }

    // Skip downstream checks when DB has no migrations applied — no point
    // looking for tenant tables that haven't been created.
    if (!dbIsEmpty) {

    // 2. All tenant tables exist
    for (const table of TENANT_TABLES) {
      const rows = await sql`
        SELECT 1 FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = ${table}
      `;
      if (rows.length === 0) {
        failures.push({ check: `table ${table}`, detail: 'not found in pg_tables' });
      }
    }

    // 3. RLS enabled + org_isolation policy + 4 GRANTs on each tenant table
    for (const table of TENANT_TABLES) {
      const rlsRows = await sql<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity FROM pg_catalog.pg_class
        WHERE relname = ${table} AND relkind = 'r'
      `;
      const rls = rlsRows[0]?.relrowsecurity;
      if (rls !== true) {
        failures.push({
          check: `${table}: RLS enabled`,
          detail: `relrowsecurity=${rls ?? '(no row)'}`,
        });
      }
      const policyRows = await sql`
        SELECT policyname FROM pg_policies
        WHERE tablename = ${table} AND policyname = 'org_isolation'
      `;
      if (policyRows.length === 0) {
        failures.push({
          check: `${table}: org_isolation policy`,
          detail: 'missing — Plan 04-10 / ADR-025 mandates org_isolation on every tenant table',
        });
      }
      for (const priv of REQUIRED_PRIVS) {
        const grantRows = await sql`
          SELECT 1 FROM information_schema.role_table_grants
          WHERE table_schema = 'public'
            AND table_name = ${table}
            AND grantee = 'authenticated'
            AND privilege_type = ${priv}
        `;
        if (grantRows.length === 0) {
          failures.push({
            check: `${table}: ${priv} grant`,
            detail: `not granted to 'authenticated' role`,
          });
        }
      }
    }

    // 4. Service-role tables: exist + NO RLS (Plan 02-06 / Plan 04-10 pattern)
    for (const table of SERVICE_ROLE_TABLES) {
      const rlsRows = await sql<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity FROM pg_catalog.pg_class
        WHERE relname = ${table} AND relkind = 'r'
      `;
      const rls = rlsRows[0]?.relrowsecurity;
      if (rls === undefined) {
        failures.push({ check: `${table}: exists`, detail: 'not found (service-role table)' });
      } else if (rls === true) {
        failures.push({
          check: `${table}: NO RLS`,
          detail: `relrowsecurity=true — service-role tables MUST have RLS disabled (webhook idempotency requires service-role writes)`,
        });
      }
    }

    // 5. Phase 4 D-32: ai_generations has the 5 new columns from 0007
    for (const col of AI_GENERATIONS_PHASE_4_COLUMNS) {
      const colRows = await sql`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_generations'
          AND column_name = ${col}
      `;
      if (colRows.length === 0) {
        failures.push({
          check: `ai_generations.${col}`,
          detail: 'column missing — drizzle/0007_ai_generations_audit_extensions.sql not applied?',
        });
      }
    }

    // 6. Phase 4 D-32: ai_generations has the partial-unique idempotency index
    const idxRows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'ai_generations'
        AND indexname = ${AI_GENERATIONS_IDEMPOTENCY_INDEX}
    `;
    if (idxRows.length === 0) {
      failures.push({
        check: `ai_generations idempotency partial-unique index`,
        detail: `missing index '${AI_GENERATIONS_IDEMPOTENCY_INDEX}' — drizzle/0007_ai_generations_audit_extensions.sql not applied?`,
      });
    }

    // 7. Phase 3 G3 T3: policy_versions UNIQUE(policy_id, version_number)
    const pvUniqRows = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.policy_versions'::regclass
        AND contype = 'u'
    `;
    if (pvUniqRows.length === 0) {
      failures.push({
        check: 'policy_versions UNIQUE constraint',
        detail: 'missing — drizzle/0004_policy_versions_unique.sql not applied?',
      });
    }

    // 8. Phase 4 D-29: batch_jobs has UNIQUE(anthropic_batch_id) (0005 migration)
    const bjUniqRows = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.batch_jobs'::regclass
        AND contype = 'u'
    `;
    if (bjUniqRows.length === 0) {
      failures.push({
        check: 'batch_jobs UNIQUE(anthropic_batch_id)',
        detail: 'missing — drizzle/0005_initial_batch_jobs.sql not applied?',
      });
    }

    // 9. Phase 5 D-28 + D-29: idempotency UNIQUE constraints.
    const phase5ConstraintRows = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_catalog.pg_constraint
      WHERE conname IN ${sql([...PHASE_5_UNIQUE_CONSTRAINTS])}
        AND contype = 'u'
    `;
    if (phase5ConstraintRows.length !== PHASE_5_UNIQUE_CONSTRAINTS.length) {
      failures.push({
        check: 'Phase 5 UNIQUE constraints',
        detail:
          `${phase5ConstraintRows.length} of ${PHASE_5_UNIQUE_CONSTRAINTS.length} expected ` +
          `(got: ${phase5ConstraintRows.map((r) => r.conname).join(', ') || '(none)'})`,
      });
    }

    // 10. Phase 5 D-29: qa_citation_grants exact column shape.
    const grantCols = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'qa_citation_grants'
      ORDER BY ordinal_position
    `;
    if (grantCols.length !== QA_CITATION_GRANTS_COLUMNS.length) {
      failures.push({
        check: 'qa_citation_grants column count',
        detail:
          `${grantCols.length} columns (expected ${QA_CITATION_GRANTS_COLUMNS.length}: ` +
          `${QA_CITATION_GRANTS_COLUMNS.map((c) => c.column_name).join(', ')})`,
      });
    } else {
      for (let i = 0; i < QA_CITATION_GRANTS_COLUMNS.length; i++) {
        const got = grantCols[i]!;
        const want = QA_CITATION_GRANTS_COLUMNS[i]!;
        if (
          got.column_name !== want.column_name ||
          got.data_type !== want.data_type ||
          got.is_nullable !== want.is_nullable
        ) {
          failures.push({
            check: `qa_citation_grants column ${i} shape`,
            detail: `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
          });
        }
      }
    }

    // 11. Phase 5 D-29: qa_citation_grants RLS policy uses wrapped JWT form.
    const grantPolicy = await sql<{ qual: string | null }[]>`
      SELECT qual FROM pg_policies
      WHERE tablename = 'qa_citation_grants' AND policyname = 'org_isolation'
    `;
    if (grantPolicy.length !== 1) {
      failures.push({
        check: 'qa_citation_grants org_isolation policy exists',
        detail: `${grantPolicy.length} policy row(s) (expected 1)`,
      });
    } else {
      const qual = grantPolicy[0]!.qual ?? '';
      if (!qual.includes('SELECT') || !qual.includes('auth.jwt(')) {
        failures.push({
          check: 'qa_citation_grants wrapped RLS policy',
          detail: `qual=${qual || '(null)'} — expected wrapped (SELECT auth.jwt()) form`,
        });
      }
    }

    // 12. Phase 5 D-29: qa_citation_grants indexes exist.
    const grantIdx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'qa_citation_grants'
        AND indexname IN ${sql([...QA_CITATION_GRANTS_INDEXES])}
    `;
    if (grantIdx.length !== QA_CITATION_GRANTS_INDEXES.length) {
      failures.push({
        check: 'qa_citation_grants indexes',
        detail:
          `${grantIdx.length} of ${QA_CITATION_GRANTS_INDEXES.length} expected ` +
          `(got: ${grantIdx.map((r) => r.indexname).join(', ') || '(none)'})`,
      });
    }

    // 13. Phase 6 D-13: organizations billing column shape from 0012.
    const billingCols = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'organizations'
        AND column_name IN ${sql(PHASE_6_ORGANIZATION_BILLING_COLUMNS.map((c) => c.column_name))}
    `;
    const billingColsByName = new Map(billingCols.map((col) => [col.column_name, col]));
    for (const want of PHASE_6_ORGANIZATION_BILLING_COLUMNS) {
      const got = billingColsByName.get(want.column_name);
      if (!got) {
        failures.push({
          check: `organizations.${want.column_name}`,
          detail: 'column missing - drizzle/0012_billing_state.sql not applied?',
        });
        continue;
      }
      if (
        got.data_type !== want.data_type ||
        got.is_nullable !== want.is_nullable ||
        ('defaultIncludes' in want &&
          !((got.column_default ?? '').includes(want.defaultIncludes)))
      ) {
        failures.push({
          check: `organizations.${want.column_name} shape`,
          detail: `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
        });
      }
    }

    // 14. Phase 6 D-13: nullable Stripe IDs have partial unique indexes.
    const billingIdx = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'organizations'
        AND indexname IN ${sql(PHASE_6_ORGANIZATION_BILLING_INDEXES.map((i) => i.indexname))}
    `;
    const billingIdxByName = new Map(billingIdx.map((idx) => [idx.indexname, idx.indexdef]));
    for (const want of PHASE_6_ORGANIZATION_BILLING_INDEXES) {
      const indexdef = billingIdxByName.get(want.indexname);
      if (!indexdef) {
        failures.push({
          check: `organizations ${want.indexname}`,
          detail: 'missing partial unique index - drizzle/0012_billing_state.sql not applied?',
        });
        continue;
      }
      if (
        !indexdef.includes('UNIQUE') ||
        !indexdef.includes(want.columnName) ||
        !indexdef.includes('WHERE')
      ) {
        failures.push({
          check: `organizations ${want.indexname} shape`,
          detail: `indexdef=${indexdef}`,
        });
      }
    }
    } // end if (!dbIsEmpty)
  } finally {
    await sql.end();
  }

  if (failures.length === 0) {
    console.log(
      `OK — deploy schema audit passed: ${migrationsApplied} migrations applied, ` +
        `${TENANT_TABLES.length} tenant-scoped tables (RLS + policy + ${REQUIRED_PRIVS.length} GRANTs each), ` +
        `${SERVICE_ROLE_TABLES.length} service-role tables (no RLS), ` +
        `Phase 4 column shape + partial-unique index present, ` +
        `Phase 3 G3 + Phase 4/5 unique constraints present, ` +
        `qa_citation_grants columns + wrapped RLS + indexes present, ` +
        `Phase 6 billing columns + partial unique indexes present.`,
    );
    process.exit(0);
  }

  console.error(`\n✗ deploy schema audit FAILED — ${failures.length} check(s) failed:\n`);
  for (const f of failures) {
    console.error(`  - [${f.check}] ${f.detail}`);
  }
  console.error('');
  console.error('Remediation:');
  console.error('  - For "no migrations applied" / "X applied (expected Y)": run pnpm db:migrate against this DB.');
  console.error('  - For missing tables/columns/indexes: a migration ran partially; investigate before re-running.');
  console.error('  - For RLS / GRANT failures: re-apply the relevant RLS migration(s), including 0006/0011.');
  console.error('  - See docs/runbooks/deploy-migrations.md for the full procedure.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-deploy-schema: unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
