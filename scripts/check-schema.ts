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
] as const;

const REQUIRED_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

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

    // Service-role tables (clerk_events, stripe_events) must EXIST and NOT have RLS.
    // A missing table is a hard fail (the webhook handlers depend on it for
    // idempotency); a present table with RLS enabled is also a fail (RLS on a
    // service-role idempotency table would block all writes by the webhook
    // handlers, which authenticate as `postgres` / service-role and rely on
    // the schema being readable/writable without JWT context).
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

    if (failures.length > 0) {
      console.error(`Schema audit FAILED: ${failures.length} issue(s) found:`);
      for (const f of failures) {
        console.error(`  ${f.table}: ${f.check} — ${f.detail}`);
      }
      process.exit(1);
    }

    console.log(`OK — schema audit: ${TENANT_TABLES.length} tenant-scoped tables verified (exists + RLS + policy + 4 GRANTs); 2 service-role tables verified (NO RLS).`);
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
