// scripts/check-schema.ts
// D-08 step 5 — schema audit. For each of 10 tenant-scoped tables, asserts:
//   1. Table exists (pg_catalog.pg_tables)
//   2. RLS is enabled (pg_catalog.pg_class.relrowsecurity = true)
//   3. `org_isolation` policy is present (pg_catalog.pg_policies)
//   4. `authenticated` role has GRANT for SELECT/INSERT/UPDATE/DELETE
//      (information_schema.table_privileges)
//
// Also asserts the 2 service-role tables (clerk_events, stripe_events)
// have RLS DISABLED — RLS on a service-role idempotency table would
// block all writes from the webhook handlers.
//
// Closes the "migration claimed it but Postgres doesn't show it" gap that
// a transient transactional rollback could open. Uses DIRECT_URL_TEST for
// unambiguous pg_catalog visibility.
//
// The audit queries are metadata — they don't care about RLS — so the
// connection-string `postgres` user is correct here (RESEARCH Pitfall 1
// doesn't apply to metadata queries).
import postgres from 'postgres';

const TEST_URL: string = (() => {
  const v = process.env.DIRECT_URL_TEST ?? process.env.DATABASE_URL_TEST;
  if (!v) {
    console.error('Neither DIRECT_URL_TEST nor DATABASE_URL_TEST set. See Plan 02-02 D-05.');
    process.exit(1);
  }
  return v;
})();

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
  // Phase 4 — batch_jobs added in drizzle/0006_rls_batch_jobs.sql.
  // Symmetric with scripts/check-rls.ts's batch_jobs assertion;
  // pr-test-analyzer review caught the missing entry here.
  'batch_jobs',
  // Phase 5 D-29 — new tenant table for Q&A citation-referral grants per
  // T-2(4c). RLS, policy, and 4 GRANTs auto-asserted by the per-table loop
  // below; column shape + UNIQUE + indexes + wrapped-form RLS predicate
  // asserted by the Phase 5 assertion block at the file tail.
  'qa_citation_grants',
] as const;

const REQUIRED_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

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

type Failure = { table: string; check: string; detail: string };

/**
 * Performs a schema audit against the configured test Postgres database.
 *
 * Checks each tenant-scoped table for: existence in public, row-level security enabled,
 * presence of an `org_isolation` policy, and `SELECT/INSERT/UPDATE/DELETE` privileges
 * granted to the `authenticated` role. Verifies service-role tables `clerk_events` and
 * `stripe_events` do not have RLS enabled. Aggregates any failures and exits the process
 * with status `1` if issues are found; logs a success summary and exits `0` when all checks pass.
 *
 * Ensures the database connection is closed before exiting.
 */
async function main(): Promise<void> {
  // TEST_URL non-nullness is guaranteed by the IIFE guard at module load.
  const sql = postgres(TEST_URL, { prepare: false });
  const failures: Failure[] = [];

  try {
    for (const table of TENANT_TABLES) {
      // 1. Table exists
      const tableRows = await sql`
        SELECT 1 FROM pg_catalog.pg_tables
        WHERE schemaname = 'public' AND tablename = ${table}
      `;
      if (tableRows.length === 0) {
        failures.push({ table, check: 'exists', detail: 'not found in pg_tables' });
        continue;
      }

      // 2. RLS enabled
      const rlsRows = await sql<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity FROM pg_catalog.pg_class
        WHERE relname = ${table} AND relkind = 'r'
      `;
      const firstRlsRow = rlsRows[0];
      if (firstRlsRow?.relrowsecurity !== true) {
        failures.push({ table, check: 'RLS enabled', detail: `relrowsecurity = ${firstRlsRow?.relrowsecurity ?? '(no row)'}` });
      }

      // 3. org_isolation policy present.
      // pg_policies column is `policyname` (pg_catalog historic alias `polname`
      // exists on pg_policy — the underlying catalog — but the human-readable
      // view pg_policies exposes `policyname`). Verified via
      // information_schema.columns on pg_policies 2026-05-17.
      const polRows = await sql`
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = ${table} AND policyname = 'org_isolation'
      `;
      if (polRows.length !== 1) {
        failures.push({ table, check: 'org_isolation policy', detail: `${polRows.length} policy row(s) (expected 1)` });
      }

      // 4. authenticated has 4 GRANTs
      const grantRows = await sql<{ privilege_type: string }[]>`
        SELECT privilege_type FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND grantee = 'authenticated'
          AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
      `;
      const privs = new Set(grantRows.map((r) => r.privilege_type));
      const missingPrivs = REQUIRED_PRIVS.filter((p) => !privs.has(p));
      if (missingPrivs.length > 0) {
        failures.push({ table, check: 'GRANT to authenticated', detail: `missing: ${missingPrivs.join(', ')}` });
      }
    }

    // Service-role tables (clerk_events, stripe_events): must EXIST (webhook
    // idempotency depends on them) and must NOT have RLS (would block
    // service-role writes that bypass JWT context).
    for (const svcTable of ['clerk_events', 'stripe_events']) {
      const rlsRows = await sql<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity FROM pg_catalog.pg_class
        WHERE relname = ${svcTable} AND relkind = 'r'
      `;
      const firstSvcRow = rlsRows[0];
      if (firstSvcRow === undefined) {
        failures.push({ table: svcTable, check: 'NO RLS (service-role table)', detail: 'table missing from pg_class' });
        continue;
      }
      if (firstSvcRow.relrowsecurity === true) {
        failures.push({ table: svcTable, check: 'NO RLS (service-role table)', detail: 'relrowsecurity = true (must be false)' });
      }
    }

    // 03-G3 T6 — assert the policy_versions UNIQUE(policy_id, version_number)
    // constraint added by migration 0004_policy_versions_unique.sql exists.
    // This is the schema-level backstop for the DUP-VN bug: the primary fix
    // is the restore() currentVersion bump in transitions.ts (T1), but if
    // the bump is regressed OR direct SQL bypasses the orchestrators, this
    // UNIQUE constraint rejects duplicate (policy_id, version_number) rows
    // at the database layer. Diagnose: .planning/debug/duplicate-policy-version.md
    const uniqueRows = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_catalog.pg_constraint
      WHERE conname = 'policy_versions_policy_id_version_number_unique'
        AND contype = 'u'
    `;
    if (uniqueRows.length !== 1) {
      failures.push({
        table: 'policy_versions',
        check: '03-G3 T6 — UNIQUE(policy_id, version_number)',
        detail: `${uniqueRows.length} constraint row(s) (expected exactly 1)`,
      });
    }

    // Phase 5 D-28 + D-29 — assert the three new UNIQUE constraints exist.
    // D-28 (0010_phase5_uniques): acknowledgments + policy_assignments idempotency
    //   constraints driving Acknowledgments.record + PolicyAssignments.create
    //   ON CONFLICT DO NOTHING semantics (Plan 05-03).
    // D-29 (0011_qa_citation_grants): the new qa_citation_grants UNIQUE on
    //   (org_id, user_id, policy_id) drives QaCitationGrants.upsert idempotency
    //   in askQuestion orchestrator (Plan 05-04). Org_id included as
    //   defense-in-depth against cross-org UUID collision (RESEARCH Pitfall 3).
    const phase5Constraints = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_catalog.pg_constraint
      WHERE conname IN (
        'acknowledgments_user_id_policy_id_policy_version_id_unique',
        'policy_assignments_policy_id_assignee_type_assignee_id_unique',
        'qa_citation_grants_org_user_policy_unique'
      )
        AND contype = 'u'
    `;
    if (phase5Constraints.length !== 3) {
      failures.push({
        table: '(phase-5 multiple)',
        check: 'Phase 5 D-28 + D-29 — UNIQUE constraints',
        detail: `${phase5Constraints.length} of 3 expected (got: ${phase5Constraints.map((r) => r.conname).join(', ') || '(none)'})`,
      });
    }

    // Phase 5 D-29 — assert qa_citation_grants column shape (5 columns) in
    // ordinal-position order. Drift here means the migration was edited or the
    // schema export was hand-modified out of sync.
    const grantCols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'qa_citation_grants' AND table_schema = 'public'
      ORDER BY ordinal_position
    `;
    const expectedGrantCols = [
      { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'org_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'policy_id', data_type: 'uuid', is_nullable: 'NO' },
      { column_name: 'granted_at', data_type: 'timestamp without time zone', is_nullable: 'NO' },
    ];
    if (grantCols.length !== expectedGrantCols.length) {
      failures.push({
        table: 'qa_citation_grants',
        check: 'D-29 column count',
        detail: `${grantCols.length} columns (expected ${expectedGrantCols.length}: ${expectedGrantCols.map((c) => c.column_name).join(', ')})`,
      });
    } else {
      for (let i = 0; i < expectedGrantCols.length; i++) {
        const got = grantCols[i]!;
        const want = expectedGrantCols[i]!;
        if (
          got.column_name !== want.column_name ||
          got.data_type !== want.data_type ||
          got.is_nullable !== want.is_nullable
        ) {
          failures.push({
            table: 'qa_citation_grants',
            check: `D-29 column ${i} shape`,
            detail: `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
          });
        }
      }
    }

    // Phase 5 D-29 — assert qa_citation_grants RLS policy uses the WRAPPED form
    // (SELECT auth.jwt()->>'org_id') per RESEARCH gap-1. Unwrapped form would
    // (a) trigger splinter lint 0003_auth_rls_initplan and (b) re-evaluate JWT
    // per row at scale.
    const grantPolicy = await sql<{ qual: string | null }[]>`
      SELECT qual FROM pg_policies
      WHERE tablename = 'qa_citation_grants' AND policyname = 'org_isolation'
    `;
    if (grantPolicy.length !== 1) {
      failures.push({
        table: 'qa_citation_grants',
        check: 'D-29 org_isolation policy exists',
        detail: `${grantPolicy.length} policy row(s) (expected 1)`,
      });
    } else {
      // PG normalizes `(SELECT auth.jwt()->>'org_id')` to `( SELECT (auth.jwt() ->> 'org_id'::text))`
      // with whitespace between `(` and `SELECT` and inner parens around auth.jwt(). The wrapped
      // form is identified by BOTH `SELECT` and `auth.jwt(` substrings — the unwrapped form has
      // `auth.jwt(` but NO `SELECT` keyword in the qual.
      const qual = grantPolicy[0]!.qual ?? '';
      if (!qual.includes('SELECT') || !qual.includes('auth.jwt(')) {
        failures.push({
          table: 'qa_citation_grants',
          check: 'D-29 RLS wrapped (SELECT auth.jwt()) form per RESEARCH gap-1',
          detail: `qual=${qual || '(null)'} — unwrapped auth.jwt() will trigger splinter lint and per-row JWT eval`,
        });
      }
    }

    // Phase 5 D-29 — assert qa_citation_grants indexes exist (RLS-predicate
    // path + hasGrant fast-path).
    const grantIdx = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'qa_citation_grants'
        AND indexname IN ('qa_citation_grants_org_id_idx', 'qa_citation_grants_user_policy_idx')
    `;
    if (grantIdx.length !== 2) {
      failures.push({
        table: 'qa_citation_grants',
        check: 'D-29 indexes (org_id_idx + user_policy_idx)',
        detail: `${grantIdx.length} of 2 expected (got: ${grantIdx.map((r) => r.indexname).join(', ') || '(none)'})`,
      });
    }

    // Phase 6 D-13 - assert additive billing state columns and partial unique indexes.
    const billingCols = await sql<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'organizations'
        AND table_schema = 'public'
        AND column_name IN ${sql(PHASE_6_ORGANIZATION_BILLING_COLUMNS.map((c) => c.column_name))}
    `;
    const billingColsByName = new Map(billingCols.map((col) => [col.column_name, col]));
    for (const want of PHASE_6_ORGANIZATION_BILLING_COLUMNS) {
      const got = billingColsByName.get(want.column_name);
      if (!got) {
        failures.push({
          table: 'organizations',
          check: `Phase 6 billing column ${want.column_name}`,
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
          table: 'organizations',
          check: `Phase 6 billing column ${want.column_name} shape`,
          detail: `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`,
        });
      }
    }

    const billingIdx = await sql<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'organizations'
        AND indexname IN ${sql(PHASE_6_ORGANIZATION_BILLING_INDEXES.map((i) => i.indexname))}
    `;
    const billingIdxByName = new Map(billingIdx.map((idx) => [idx.indexname, idx.indexdef]));
    for (const want of PHASE_6_ORGANIZATION_BILLING_INDEXES) {
      const indexdef = billingIdxByName.get(want.indexname);
      if (!indexdef) {
        failures.push({
          table: 'organizations',
          check: `Phase 6 billing index ${want.indexname}`,
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
          table: 'organizations',
          check: `Phase 6 billing index ${want.indexname} shape`,
          detail: `indexdef=${indexdef}`,
        });
      }
    }

    if (failures.length > 0) {
      console.error(`Schema audit FAILED: ${failures.length} issue(s) found:`);
      for (const f of failures) {
        console.error(`  ${f.table}: ${f.check} — ${f.detail}`);
      }
      process.exit(1);
    }

    console.log(
      `OK — schema audit: ${TENANT_TABLES.length} tenant-scoped tables verified (exists + RLS + policy + 4 GRANTs); ` +
        `2 service-role tables verified (NO RLS); ` +
        `policy_versions UNIQUE + Phase 5 acknowledgments/policy_assignments UNIQUE + qa_citation_grants UNIQUE + columns + indexes + wrapped-RLS all present; ` +
        `Phase 6 billing columns + partial unique indexes present.`,
    );
    process.exit(0);
  } catch (err) {
    console.error(
      `Schema audit failed: ${
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      }`,
    );
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
