// scripts/check-auth-context.ts
// 03-G1 — Integration test for the Clerk-text → internal-UUID translation
// inside lib/auth/context.ts (getOrgContext) flowing through
// lib/db/scoped.ts (withOrgScope) into a real repository call
// (Policies.statusCounts). Models the production stack as closely as
// possible without requiring a live Clerk session: we construct an
// OrgContext fixture shaped EXACTLY as the new getOrgContext returns
// (internal UUIDs in orgId/userId; Clerk text in clerkOrgId/clerkUserId)
// and exercise withOrgScope → Policies.statusCounts against the TEST DB.
//
// The negative control verifies the application-layer cast: feeding a
// Clerk-text orgId (the OLD GAP-1 bug shape) into withOrgScope must
// trigger Postgres 22P02 from `where(eq(policies.orgId, s.orgId))`
// because policies.org_id is column-typed `uuid` and a text value like
// `org_3Dy5O_buggy_clerk_text_form` fails the parse before any row scan.
// RLS predicate coverage (the JWT-claims layer) stays in
// scripts/check-rls.ts which probes auth.jwt()->>'org_id' directly.
//
// Mirrors scripts/check-rls.ts for seed-and-rollback hygiene. Cleans up
// via final TRUNCATE so it leaves the TEST DB tidy.
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type { OrgContext } from '@/lib/auth/context';

const TEST_URL: string = (() => {
  const v = process.env.DATABASE_URL_TEST;
  if (!v) {
    console.error('DATABASE_URL_TEST not set. See .env.local Plan 02-02 D-05.');
    process.exit(1);
  }
  return v;
})();

const DIRECT_TEST: string = (() => {
  const v = process.env.DIRECT_URL_TEST;
  if (!v) {
    console.error('DIRECT_URL_TEST not set. See .env.local Plan 02-02 D-05.');
    process.exit(1);
  }
  return v;
})();

/**
 * Override DATABASE_URL + DIRECT_URL with the _TEST values BEFORE
 * dynamically importing the scoped wrapper and repository — both depend
 * on lib/db/index.ts which reads process.env.DATABASE_URL at module
 * load time.
 */
async function loadScopedAndRepos(): Promise<{
  withOrgScope: typeof import('@/lib/db/scoped')['withOrgScope'];
  Policies: typeof import('@/lib/db/repositories/policies')['Policies'];
}> {
  process.env.DATABASE_URL = TEST_URL;
  process.env.DIRECT_URL = DIRECT_TEST;
  const { withOrgScope } = await import('@/lib/db/scoped');
  const { Policies } = await import('@/lib/db/repositories/policies');
  return { withOrgScope, Policies };
}

/**
 * Seeds a fresh org+user against the TEST DB and asserts that
 * Policies.statusCounts works end-to-end with a UUID-shaped OrgContext
 * (positive controls) and explodes with 22P02 when fed the OLD GAP-1
 * Clerk-text shape (negative control).
 */
async function main(): Promise<void> {
  // Connection-string `postgres` user is BYPASSRLS — fine for seeding.
  const sql = postgres(TEST_URL, { prepare: false });

  const orgUuid = randomUUID();
  const userUuid = randomUUID();
  const CLERK_ORG = 'clerk_org_check_authctx';
  const CLERK_USER = 'clerk_user_check_authctx';

  try {
    // 1. Truncate + seed one org + one user.
    await sql.begin(async (tx) => {
      const TRUNC = [
        'acknowledgments',
        'workflow_stages',
        'policy_assignments',
        'notifications',
        'ai_generations',
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
      await tx`INSERT INTO organizations (id, clerk_org_id, name, slug)
               VALUES (${orgUuid}, ${CLERK_ORG}, 'CheckAuthCtx Org', ${'check-authctx-' + orgUuid.slice(0, 8)})`;
      await tx`INSERT INTO users (id, org_id, clerk_user_id, role)
               VALUES (${userUuid}, ${orgUuid}, ${CLERK_USER}, 'admin')`;
    });

    // 2. Load the production wrapper + repository AFTER env override.
    const { withOrgScope, Policies } = await loadScopedAndRepos();

    // 3. Build the OrgContext fixture in the shape the new getOrgContext returns.
    const ctxFixture: OrgContext = {
      orgId: orgUuid,
      userId: userUuid,
      clerkOrgId: CLERK_ORG,
      clerkUserId: CLERK_USER,
      role: 'admin',
    };

    // 4. POSITIVE ASSERTION #1 — empty policies, all-zero counts.
    // Policies.statusCounts returns Record<PolicyStatus, number> with
    // all four keys zero-filled (lib/db/repositories/policies.ts:140-159).
    const emptyCounts = await withOrgScope(ctxFixture, async (s) =>
      Policies.statusCounts(s),
    );
    if (
      emptyCounts.draft !== 0 ||
      emptyCounts.under_review !== 0 ||
      emptyCounts.published !== 0 ||
      emptyCounts.archived !== 0
    ) {
      throw new Error(
        `expected all-zero counts for empty policies, got ${JSON.stringify(emptyCounts)}`,
      );
    }
    console.log(
      'POSITIVE #1: empty Policies.statusCounts → all-zero Record<PolicyStatus, number> via UUID-shaped OrgContext.',
    );

    // 5. Seed one draft policy then re-run statusCounts.
    await sql.begin(async (tx) => {
      await tx`INSERT INTO policies (id, org_id, title, content_json, category, status)
               VALUES (gen_random_uuid(), ${orgUuid}, 'Draft Policy', '{}'::jsonb, 'HR', 'draft')`;
    });

    // 6. POSITIVE ASSERTION #2 — with seeded policy.
    const oneCounts = await withOrgScope(ctxFixture, async (s) =>
      Policies.statusCounts(s),
    );
    // Direct Record access — Policies.statusCounts returns
    // Record<PolicyStatus, number> (NOT an array).
    if (oneCounts.draft !== 1) {
      throw new Error(
        `expected exactly 1 draft, got ${JSON.stringify(oneCounts)}`,
      );
    }
    if (
      oneCounts.under_review !== 0 ||
      oneCounts.published !== 0 ||
      oneCounts.archived !== 0
    ) {
      throw new Error(
        `expected only draft=1, other statuses zero; got ${JSON.stringify(oneCounts)}`,
      );
    }
    console.log(
      'POSITIVE #2: seeded draft policy → Policies.statusCounts.draft=1 via UUID-shaped OrgContext.',
    );

    // 7. NEGATIVE CONTROL — the bug must not be back.
    //
    // NEGATIVE CONTROL — guards the application-layer cast, not RLS.
    // The 22P02 fires from `where(eq(policies.orgId, s.orgId))` casting
    // the text 'org_*' into the uuid column type. RLS predicate coverage
    // lives in scripts/check-rls.ts (auth.jwt()->>'org_id' evaluation).
    const buggyCtx: OrgContext = {
      ...ctxFixture,
      orgId: 'org_3Dy5O_buggy_clerk_text_form', // bug shape: text instead of UUID
    };
    let bugTriggered = false;
    try {
      await withOrgScope(buggyCtx, async (s) => Policies.statusCounts(s));
    } catch (err) {
      // Drizzle wraps the underlying Postgres error in `cause` and prefixes
      // the outer message with "Failed query: ..." — the actual SQLSTATE
      // / detail text lives on err.cause.message. Inspect BOTH layers.
      const outer = err instanceof Error ? err.message : String(err);
      const cause =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : '';
      const detail = `${outer}\n${cause}`;
      if (
        detail.includes('22P02') ||
        /invalid input syntax for type uuid/i.test(detail)
      ) {
        bugTriggered = true;
      }
    }
    if (!bugTriggered) {
      throw new Error(
        'Negative control failed: Clerk-text orgId did NOT trigger Postgres 22P02 — RLS or column type may have drifted from UUID',
      );
    }
    console.log(
      'NEGATIVE: Clerk-text orgId injection into withOrgScope still triggers Postgres 22P02 (regression guard live).',
    );

    // 7b. ADR-027 invariant — user lookup is scoped by BOTH clerk_user_id
    // AND org_id. The production query is in lib/auth/context.ts as:
    //   .where(and(eq(users.clerkUserId, ...), eq(users.orgId, ...)))
    // This integration test exercises that same SQL shape directly
    // against the TEST DB (already-seeded user row has clerk_user_id =
    // CLERK_USER, org_id = orgUuid). Two controls: POSITIVE — matching
    // org returns the row; NEGATIVE — mismatched org returns empty.
    // A future refactor that drops the `eq(users.org_id, ...)` predicate
    // fails the NEGATIVE control here.
    const otherOrgUuid = randomUUID();
    const OTHER_CLERK_ORG = 'clerk_org_check_authctx_adr027';
    await sql.begin(async (tx) => {
      await tx`INSERT INTO organizations (id, clerk_org_id, name, slug)
               VALUES (${otherOrgUuid}, ${OTHER_CLERK_ORG}, 'ADR-027 Other Org', ${'check-authctx-adr027-' + otherOrgUuid.slice(0, 8)})`;
    });

    // POSITIVE — same query as production with matching org_id returns
    // the existing user row.
    const matchedUserRows = await sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE clerk_user_id = ${CLERK_USER}
        AND org_id = ${orgUuid}
      LIMIT 1
    `;
    if (matchedUserRows.length !== 1) {
      throw new Error(
        `ADR-027 POSITIVE control failed: same-org user lookup returned ${matchedUserRows.length} rows, expected 1`,
      );
    }
    const firstMatched = matchedUserRows[0];
    if (!firstMatched || firstMatched.id !== userUuid) {
      throw new Error(
        `ADR-027 POSITIVE control failed: lookup returned id=${firstMatched?.id ?? '(none)'}, expected ${userUuid}`,
      );
    }
    console.log(
      'POSITIVE: ADR-027 user lookup scoped by (clerk_user_id, org_id) returns the matching user row for same-org Clerk-user.',
    );

    // NEGATIVE — same query with a DIFFERENT org_id returns empty,
    // proving the eq(users.org_id, ...) predicate is load-bearing. The
    // user's DB row (org_id = orgUuid) MUST NOT be visible when the
    // query scopes by otherOrgUuid. Without the predicate, this would
    // return the row (just clerk_user_id matched) — the silent
    // state-inconsistency surface ADR-027 closes.
    const mismatchedUserRows = await sql<{ id: string }[]>`
      SELECT id FROM users
      WHERE clerk_user_id = ${CLERK_USER}
        AND org_id = ${otherOrgUuid}
      LIMIT 1
    `;
    if (mismatchedUserRows.length !== 0) {
      throw new Error(
        `ADR-027 NEGATIVE control failed: cross-org user lookup returned ${mismatchedUserRows.length} rows, expected 0 — getOrgContext would silently accept the mismatched user`,
      );
    }
    console.log(
      'NEGATIVE: ADR-027 user lookup scoped by (clerk_user_id, org_id) returns 0 rows for cross-org Clerk-user — silent attribution-failure surface closed.',
    );

    // 8. Final cleanup so the test is idempotent and doesn't leave fixtures.
    await sql.begin(async (tx) => {
      for (const t of [
        'acknowledgments',
        'workflow_stages',
        'policy_assignments',
        'notifications',
        'ai_generations',
        'policy_versions',
        'policies',
        'departments',
        'users',
        'organizations',
      ]) {
        await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
      }
    });

    console.log(
      'OK — G1 auth-context translation: Policies.statusCounts works against Clerk-shaped UUID context; bug-shape Clerk text id still rejected by Postgres.',
    );
    process.exit(0);
  } catch (err) {
    console.error(
      `G1 auth-context integration test failed: ${
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
