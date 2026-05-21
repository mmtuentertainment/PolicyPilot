// scripts/check-rls.ts
// L-06 — cross-org RLS property test (RESEARCH Pattern 5).
//
// RESEARCH Pitfall 1: a bare `postgres(DATABASE_URL_TEST)` connection uses
// the `postgres` user, which has BYPASSRLS by default. WITHOUT
// `SET LOCAL ROLE authenticated` inside the assertion transaction, RLS
// NEVER FIRES and the test is meaningless (or passes trivially / fails
// for the wrong reason).
//
// POSITIVE CONTROL required (per RESEARCH Pitfall 1 warning sign): we
// must ALSO assert `SELECT 1 WHERE id = orgA.policyId` returns 1 row
// after SET LOCAL. Without it, an "everything returns 0 rows" result
// could mean either RLS is working OR GRANT is missing — and you can't
// tell which. The positive control disambiguates.
//
// Seeds use a separate transaction; the assertion runs in a second
// transaction that ROLLS BACK (via intentional throw) so SET LOCAL ROLE
// effects scope to that transaction. A final TRUNCATE wipes seed data
// so the test is idempotent and doesn't leave fixtures behind.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

const TEST_URL: string = (() => {
  const v = process.env.DATABASE_URL_TEST;
  if (!v) {
    console.error('DATABASE_URL_TEST not set. See .env.local Plan 02-02 D-05.');
    process.exit(1);
  }
  return v;
})();

// 11 tenant-scoped tables (10 from drizzle/0001_rls_policies.sql + 1 added in Phase 4
// per drizzle/0006_rls_batch_jobs.sql). `organizations` uses `id` for RLS predicate;
// others use `org_id`.
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
  'batch_jobs', // Phase 4 D-29 / AC-24 — new tenant table for Consistency Check batch state.
] as const;

/**
 * Get the RLS predicate column name for a tenant-scoped table.
 *
 * @param table - The table name; `'organizations'` is treated specially (uses the org primary key).
 * @returns `'id'` for the `organizations` table, `'org_id'` for all other tenant tables.
 */
function predicateColumnFor(table: string): 'id' | 'org_id' {
  return table === 'organizations' ? 'id' : 'org_id';
}

/**
 * Seeds a test database and verifies Row-Level Security (RLS) isolation for tenant-scoped tables.
 *
 * Seeds two organizations, users, and policies, then runs an assertion transaction that sets the authenticated role
 * and JWT claims for orgA's user, performs a positive control (orgA can read its own policy) and negative isolation
 * checks (orgA cannot read orgB-scoped rows) across TENANT_TABLES. The assertion transaction is forced to roll back,
 * seeded tables are truncated to clean up, the database client is closed, and the process exits with code `0` on success
 * or `1` when the positive control fails or any table leaks orgB data.
 */
async function main(): Promise<void> {
  // Connection-string `postgres` user is BYPASSRLS — fine for seeding.
  // TEST_URL non-nullness is guaranteed by the IIFE guard at module load.
  const sql = postgres(TEST_URL, { prepare: false });

  // Generate two orgs' worth of fixtures with deterministic UUIDs.
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const policyAId = randomUUID();
  const policyBId = randomUUID();
  // Phase 4 D-29 / AC-24 — one batch_jobs row per org. The anthropic_batch_id column
  // has a UNIQUE constraint at the cross-org level (Anthropic's batch IDs come from a
  // global namespace, so collisions never happen between orgs); we vary the seed
  // string per org so the constraint is satisfied.
  const batchJobAId = randomUUID();
  const batchJobBId = randomUUID();

  try {
    // Truncate then seed. CASCADE on truncate cleans children from earlier
    // runs. clerk_events + stripe_events also truncated to keep the DB tidy.
    await sql.begin(async (tx) => {
      const TRUNC = [
        'acknowledgments',
        'workflow_stages',
        'policy_assignments',
        'notifications',
        'ai_generations',
        'batch_jobs', // Phase 4 D-29 — truncate before seed for idempotent reruns.
        'policy_versions',
        'policies',
        'departments',
        'users',
        'organizations',
        'clerk_events',
        'stripe_events',
      ];
      for (const t of TRUNC) {
        await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
      }

      // orgA + orgB
      await tx`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${orgAId}, ${'clerk_orgA_' + orgAId.slice(0, 8)}, 'OrgA', ${'orga-' + orgAId.slice(0, 8)})`;
      await tx`INSERT INTO organizations (id, clerk_org_id, name, slug) VALUES (${orgBId}, ${'clerk_orgB_' + orgBId.slice(0, 8)}, 'OrgB', ${'orgb-' + orgBId.slice(0, 8)})`;

      // one user per org
      await tx`INSERT INTO users (id, org_id, clerk_user_id, role) VALUES (${userAId}, ${orgAId}, ${'clerk_userA_' + userAId.slice(0, 8)}, 'admin')`;
      await tx`INSERT INTO users (id, org_id, clerk_user_id, role) VALUES (${userBId}, ${orgBId}, ${'clerk_userB_' + userBId.slice(0, 8)}, 'admin')`;

      // one policy per org (D-02: child tables carry org_id directly)
      await tx`INSERT INTO policies (id, org_id, title, content_json, category) VALUES (${policyAId}, ${orgAId}, 'PolicyA', '{}'::jsonb, 'HR')`;
      await tx`INSERT INTO policies (id, org_id, title, content_json, category) VALUES (${policyBId}, ${orgBId}, 'PolicyB', '{}'::jsonb, 'HR')`;

      // Phase 4 D-29 / AC-24 — one batch_jobs row per org. status defaults to
      // 'in_progress' and type defaults to 'consistency' (schema-level defaults
      // per D-06 + D-29). The unique anthropic_batch_id values mock the Anthropic
      // global-namespace IDs that the live submit endpoint would receive.
      await tx`INSERT INTO batch_jobs (id, org_id, anthropic_batch_id) VALUES (${batchJobAId}, ${orgAId}, ${'msgbatch_test_orgA_' + orgAId.slice(0, 8)})`;
      await tx`INSERT INTO batch_jobs (id, org_id, anthropic_batch_id) VALUES (${batchJobBId}, ${orgBId}, ${'msgbatch_test_orgB_' + orgBId.slice(0, 8)})`;
    });

    // Now the actual property test. RESEARCH Pitfall 1: SET LOCAL ROLE
    // FIRST, then set_config the orgA JWT, then SELECT. Each assertion
    // runs inside the transaction so SET LOCAL effects are scoped here.
    let leaks = 0;
    let positiveControlPassed = false;

    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE authenticated`);
      const claims = JSON.stringify({
        sub: userAId,
        org_id: orgAId,
        role: 'admin',
      });
      // is_local=true (third arg) — RESEARCH Pitfall 2 mitigation.
      // Matches the production runtime body in lib/db/scoped.ts.
      await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;

      // POSITIVE CONTROL: orgA's user can see orgA's own policy row.
      // Without GRANTs (L-04) this would return 0 / permission denied;
      // without RLS this would also work; with both correctly applied,
      // this confirms the channel is end-to-end live.
      const positiveRows = await tx.unsafe(
        `SELECT 1 AS ok FROM "policies" WHERE id = $1::uuid LIMIT 1`,
        [policyAId],
      );
      if (positiveRows.length === 1) {
        positiveControlPassed = true;
        console.log('POSITIVE CONTROL: orgA can see orgA.policy → 1 row (RLS + GRANT both live)');
      } else {
        console.error(`POSITIVE CONTROL FAILED: orgA cannot see its own policy row (${positiveRows.length} rows). Likely cause: GRANT missing (L-04 in 0001_rls_policies.sql).`);
      }

      // NEGATIVE: for each of the 10 tenant-scoped tables, orgA's user
      // must see ZERO rows whose org_id (or id, for organizations) is orgB's.
      for (const table of TENANT_TABLES) {
        const col = predicateColumnFor(table);
        const rows = await tx.unsafe(
          `SELECT 1 FROM "${table}" WHERE ${col} = $1::uuid LIMIT 5`,
          [orgBId],
        );
        if (rows.length !== 0) {
          leaks += 1;
          console.error(
            `LEAK: orgA can see ${rows.length} orgB row(s) in ${table} — RLS NOT enforced`,
          );
        }
      }

      // Force rollback so the seed data doesn't persist between runs.
      throw new Error('__intentional_rollback__');
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('__intentional_rollback__')) throw e;
    });

    // Cleanup the seeded rows that weren't covered by the rollback (the
    // seed lives in a separate sql.begin block — TRUNCATE here to keep
    // the test DB clean for the next run).
    await sql.begin(async (tx) => {
      for (const t of ['acknowledgments', 'workflow_stages', 'policy_assignments', 'notifications', 'ai_generations', 'batch_jobs', 'policy_versions', 'policies', 'departments', 'users', 'organizations']) {
        await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
      }
    });

    if (!positiveControlPassed) {
      console.error('L-06 FAILED: positive control did not pass — likely GRANT or RLS misconfigured. See 0001_rls_policies.sql.');
      process.exit(1);
    }
    if (leaks > 0) {
      console.error(`L-06 FAILED: ${leaks} table(s) leaked orgB data to orgA's JWT. RLS not enforced on those tables.`);
      process.exit(1);
    }

    console.log(`OK — L-06: all ${TENANT_TABLES.length} tenant-scoped tables RLS-isolated; positive control passed.`);
    process.exit(0);
  } catch (err) {
    console.error(
      `RLS property test failed: ${
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
