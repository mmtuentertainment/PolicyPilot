// scripts/check-deploy-schema.ts
//
// Phase 4 deploy-prep (Issue #16 carry, 2026-05-22). Env-agnostic schema
// verifier for deploy-time validation: asserts the target database has all
// expected migrations applied AND the resulting schema matches the journal +
// RLS + Phase 4 column shape + partial-unique index.
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
// Phase 4 added batch_jobs (drizzle/0006_rls_batch_jobs.sql) — mirrors check-rls.ts
// and the Phase 4.5 addition to scripts/check-schema.ts.
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
  const sql = postgres(DB_URL!, { prepare: false });
  const failures: Failure[] = [];
  let migrationsApplied = 0;

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
        failures.push({
          check: 'migrations applied',
          detail: `expected ${journal.length} (journal 0000..${String(journal.length - 1).padStart(4, '0')}); found ${applied.length} applied. Run pnpm db:migrate against this DB.`,
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (/relation .*__drizzle_migrations.* does not exist/i.test(errMsg)) {
        failures.push({
          check: 'migrations applied',
          detail: `drizzle.__drizzle_migrations table missing — no migrations have been applied to this DB. Run pnpm db:migrate (or the env-specific variant).`,
        });
        // Skip downstream checks — DB has no schema yet
        return;
      }
      throw err;
    }

    // 2. All 11 tenant tables exist
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
  } finally {
    await sql.end();
  }

  if (failures.length === 0) {
    console.log(
      `OK — deploy schema audit passed: ${migrationsApplied} migrations applied, ` +
        `${TENANT_TABLES.length} tenant-scoped tables (RLS + policy + ${REQUIRED_PRIVS.length} GRANTs each), ` +
        `${SERVICE_ROLE_TABLES.length} service-role tables (no RLS), ` +
        `Phase 4 column shape + partial-unique index present, ` +
        `Phase 3 G3 + Phase 4 unique constraints present.`,
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
  console.error('  - For RLS / GRANT failures: re-apply drizzle/0001_rls_policies.sql + drizzle/0006_rls_batch_jobs.sql.');
  console.error('  - See docs/runbooks/deploy-migrations.md for the full procedure.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-deploy-schema: unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
