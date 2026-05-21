// scripts/check-policies-list-filters.ts
// VALIDATION-2.7 — Integration test for the Policies.listWithFilters body
// in lib/db/repositories/policies.ts:78-100. Closes the MISSING-2.7 gap
// surfaced by the 2026-05-21 Phase 3 background validation audit
// (03-VALIDATION.md): check-rls.ts proves table-level org scoping but
// not the listWithFilters body — the q/status/LIMIT-100 query shape was
// covered only by HUMAN-UAT 5-1..5-10 (PASS 2026-05-20) until now.
//
// Mirrors scripts/check-auth-context.ts for seed-and-rollback hygiene:
// override DATABASE_URL + DIRECT_URL with _TEST values before dynamic
// import of the scoped wrapper + repository, seed two orgs through the
// connection-string user (BYPASSRLS), exercise listWithFilters via
// withOrgScope, TRUNCATE on success AND failure for idempotency.
//
// Coverage matrix (10 assertions):
//   POSITIVE 1 — no filters, LIMIT 100 cap on 105-row org → returns 100
//   POSITIVE 2 — status=published returns exactly the 2 published rows
//   POSITIVE 3 — status=archived returns the 1 archived row
//   POSITIVE 4 — q matches against title (case-insensitive ILIKE)
//   POSITIVE 5 — q matches against category (case-insensitive ILIKE)
//   POSITIVE 6 — q + status compound predicate narrows to single row
//   POSITIVE 7 — q with no matches returns empty array
//   POSITIVE 8 — status=draft on 101-row subset still caps at LIMIT 100
//   CROSS-ORG 1 — Org B status=published count differs from Org A
//   CROSS-ORG 2 — Org B q match returns Org B row, NOT same-title Org A row
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

const TENANT_TABLES = [
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
];

async function truncate(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    for (const t of [...TENANT_TABLES, 'clerk_events', 'stripe_events']) {
      await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
    }
  });
}

async function main(): Promise<void> {
  const sql = postgres(TEST_URL, { prepare: false });

  const orgAUuid = randomUUID();
  const orgBUuid = randomUUID();
  const userAUuid = randomUUID();
  const userBUuid = randomUUID();
  const CLERK_ORG_A = 'clerk_org_check_list_filters_a';
  const CLERK_ORG_B = 'clerk_org_check_list_filters_b';
  const CLERK_USER_A = 'clerk_user_check_list_filters_a';
  const CLERK_USER_B = 'clerk_user_check_list_filters_b';

  try {
    await truncate(sql);

    // Seed both orgs + users + fixture policies.
    await sql.begin(async (tx) => {
      await tx`INSERT INTO organizations (id, clerk_org_id, name, slug)
               VALUES (${orgAUuid}, ${CLERK_ORG_A}, 'OrgA List-Filters', ${'orga-listfilt-' + orgAUuid.slice(0, 8)}),
                      (${orgBUuid}, ${CLERK_ORG_B}, 'OrgB List-Filters', ${'orgb-listfilt-' + orgBUuid.slice(0, 8)})`;
      await tx`INSERT INTO users (id, org_id, clerk_user_id, role)
               VALUES (${userAUuid}, ${orgAUuid}, ${CLERK_USER_A}, 'admin'),
                      (${userBUuid}, ${orgBUuid}, ${CLERK_USER_B}, 'admin')`;

      // Org A — 5 fixture policies covering q/status assertions, then
      // 100 bulk-draft fillers so total exceeds LIMIT 100 (assertion #1
      // verifies the cap from 105; assertion #8 verifies the cap on the
      // status='draft' subset of 101).
      await tx`INSERT INTO policies (org_id, title, content_json, category, status) VALUES
               (${orgAUuid}, 'Onboarding Policy',     '{}'::jsonb, 'HR',         'draft'),
               (${orgAUuid}, 'Security Policy',       '{}'::jsonb, 'IT',         'published'),
               (${orgAUuid}, 'HR Onboarding Steps',   '{}'::jsonb, 'HR',         'published'),
               (${orgAUuid}, 'Privacy Notice',        '{}'::jsonb, 'Legal',      'archived'),
               (${orgAUuid}, 'Compliance Calendar',   '{}'::jsonb, 'Compliance', 'under_review')`;

      // 100 bulk-draft fillers (numbered to keep titles unique; category
      // 'Bulk' deliberately distinct from fixture categories so q='Bulk'
      // would match these but no q assertion uses 'Bulk'). Each is a
      // single multi-row INSERT for transaction speed.
      //
      // `tx.unsafe()` is acceptable here because every interpolated token
      // is fully controlled: `orgAUuid` is from `randomUUID()` (hex+hyphens
      // only), `i` is a bounded integer loop counter, and the remaining
      // tokens are literal strings ('Bulk Policy', 'Bulk', 'draft'). No
      // external/user input touches this construction — same pattern as
      // scripts/check-auth-context.ts's truncate loop.
      const bulkValues: string[] = [];
      for (let i = 1; i <= 100; i++) {
        bulkValues.push(
          `('${orgAUuid}', 'Bulk Policy ${i}', '{}'::jsonb, 'Bulk', 'draft')`,
        );
      }
      await tx.unsafe(
        `INSERT INTO policies (org_id, title, content_json, category, status) VALUES ${bulkValues.join(',')}`,
      );

      // Org B — 3 policies; PB1 deliberately contains 'Onboarding' to
      // assert cross-org isolation in CROSS-ORG 2.
      await tx`INSERT INTO policies (org_id, title, content_json, category, status) VALUES
               (${orgBUuid}, 'OrgB Onboarding', '{}'::jsonb, 'HR',   'draft'),
               (${orgBUuid}, 'OrgB Security',   '{}'::jsonb, 'IT',   'published'),
               (${orgBUuid}, 'OrgB Archived',   '{}'::jsonb, 'Bulk', 'archived')`;
    });

    const { withOrgScope, Policies } = await loadScopedAndRepos();

    const ctxA: OrgContext = {
      orgId: orgAUuid,
      userId: userAUuid,
      clerkOrgId: CLERK_ORG_A,
      clerkUserId: CLERK_USER_A,
      role: 'admin',
    };
    const ctxB: OrgContext = {
      orgId: orgBUuid,
      userId: userBUuid,
      clerkOrgId: CLERK_ORG_B,
      clerkUserId: CLERK_USER_B,
      role: 'admin',
    };

    const eq = (label: string, actual: unknown, expected: unknown): void => {
      if (actual !== expected) {
        throw new Error(
          `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    };
    // Narrowing helper — TS strict-mode `noUncheckedIndexedAccess` makes
    // `rows[0]` typed `T | undefined`. The preceding `eq(label, rows.length, N)`
    // already throws on empty, so this `undefined` guard is defensive belt.
    const first = <T>(rows: T[], label: string): T => {
      const r = rows[0];
      if (r === undefined) throw new Error(`${label}: empty result row`);
      return r;
    };

    // POSITIVE 1 — no filters; 105 total → LIMIT 100.
    const r1 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, {}),
    );
    eq('POSITIVE 1 (no filters, LIMIT 100)', r1.length, 100);
    console.log('POSITIVE 1: no-filter Org A query capped at LIMIT 100 (105 rows seeded).');

    // POSITIVE 2 — status=published; 2 fixture rows.
    const r2 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { status: 'published' }),
    );
    eq('POSITIVE 2 (status=published count)', r2.length, 2);
    for (const row of r2) {
      eq('POSITIVE 2 (status field)', row.status, 'published');
    }
    console.log('POSITIVE 2: status=published returned exactly 2 published rows.');

    // POSITIVE 3 — status=archived; 1 fixture row.
    const r3 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { status: 'archived' }),
    );
    eq('POSITIVE 3 (status=archived count)', r3.length, 1);
    eq('POSITIVE 3 (archived title)', first(r3, 'POSITIVE 3').title, 'Privacy Notice');
    console.log('POSITIVE 3: status=archived returned the single archived fixture row.');

    // POSITIVE 4 — q='Onboarding' matches title for P1 + P3.
    const r4 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { q: 'Onboarding' }),
    );
    eq('POSITIVE 4 (q=Onboarding count)', r4.length, 2);
    const titlesP4 = r4.map((r) => r.title).sort();
    eq(
      'POSITIVE 4 (q=Onboarding titles)',
      JSON.stringify(titlesP4),
      JSON.stringify(['HR Onboarding Steps', 'Onboarding Policy']),
    );
    console.log('POSITIVE 4: q=Onboarding matched both fixture rows via title ILIKE.');

    // POSITIVE 5 — q='Legal' matches category for P4 only.
    const r5 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { q: 'Legal' }),
    );
    eq('POSITIVE 5 (q=Legal count)', r5.length, 1);
    const r5first = first(r5, 'POSITIVE 5');
    eq('POSITIVE 5 (q=Legal title)', r5first.title, 'Privacy Notice');
    eq('POSITIVE 5 (q=Legal category)', r5first.category, 'Legal');
    console.log('POSITIVE 5: q=Legal matched the single fixture row via category ILIKE.');

    // POSITIVE 6 — q='Onboarding' + status='draft' narrows to P1 only.
    const r6 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { q: 'Onboarding', status: 'draft' }),
    );
    eq('POSITIVE 6 (compound count)', r6.length, 1);
    const r6first = first(r6, 'POSITIVE 6');
    eq('POSITIVE 6 (compound title)', r6first.title, 'Onboarding Policy');
    eq('POSITIVE 6 (compound status)', r6first.status, 'draft');
    console.log('POSITIVE 6: q=Onboarding + status=draft narrowed to single fixture row.');

    // POSITIVE 7 — no-match q returns empty.
    const r7 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { q: 'NonexistentXYZ' }),
    );
    eq('POSITIVE 7 (no-match count)', r7.length, 0);
    console.log('POSITIVE 7: q=NonexistentXYZ returned empty array (no false positives).');

    // POSITIVE 8 — status=draft on 101 rows still caps at 100.
    const r8 = await withOrgScope(ctxA, async (s) =>
      Policies.listWithFilters(s, { status: 'draft' }),
    );
    eq('POSITIVE 8 (status=draft cap)', r8.length, 100);
    for (const row of r8) {
      eq('POSITIVE 8 (status field)', row.status, 'draft');
    }
    console.log('POSITIVE 8: status=draft capped at LIMIT 100 even with 101 matching rows.');

    // CROSS-ORG 1 — Org B published count differs from Org A.
    const r9 = await withOrgScope(ctxB, async (s) =>
      Policies.listWithFilters(s, { status: 'published' }),
    );
    eq('CROSS-ORG 1 (Org B published count)', r9.length, 1);
    eq('CROSS-ORG 1 (Org B published title)', first(r9, 'CROSS-ORG 1').title, 'OrgB Security');
    console.log(
      'CROSS-ORG 1: Org B status=published returned only Org B rows (count differs from Org A).',
    );

    // CROSS-ORG 2 — q='Onboarding' from Org B returns Org B's row, NOT Org A's.
    const r10 = await withOrgScope(ctxB, async (s) =>
      Policies.listWithFilters(s, { q: 'Onboarding' }),
    );
    eq('CROSS-ORG 2 (Org B q=Onboarding count)', r10.length, 1);
    eq('CROSS-ORG 2 (Org B q=Onboarding title)', first(r10, 'CROSS-ORG 2').title, 'OrgB Onboarding');
    console.log(
      'CROSS-ORG 2: Org B q=Onboarding returned only Org B row despite Org A holding 2 matching titles.',
    );

    await truncate(sql);

    console.log(
      'OK — VALIDATION-2.7: Policies.listWithFilters body verified end-to-end (q/status/compound/LIMIT-100/cross-org).',
    );
    process.exit(0);
  } catch (err) {
    // Best-effort cleanup so a failing run doesn't poison subsequent runs.
    try {
      await truncate(sql);
    } catch (cleanupErr) {
      console.error(
        `cleanup TRUNCATE also failed: ${
          cleanupErr instanceof Error
            ? `${cleanupErr.name}: ${cleanupErr.message}`
            : String(cleanupErr)
        }`,
      );
    }
    console.error(
      `VALIDATION-2.7 listWithFilters integration test failed: ${
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
