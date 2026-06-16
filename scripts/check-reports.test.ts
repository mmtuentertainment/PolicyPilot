import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrgContext } from '@/lib/auth/context';
import type { AckComplianceFilters } from '@/lib/db/repositories/reports';

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
if (!TEST_URL) {
  throw new Error(
    '[check-reports] FAIL - TEST_DATABASE_URL (or DATABASE_URL_TEST) required. ' +
      'Run through pnpm check:reports so .env.local is loaded.',
  );
}
process.env.DATABASE_URL = TEST_URL;

let pgSql: postgres.Sql;

type ReportFixtures = {
  orgA: string;
  orgB: string;
  adminA: string;
  pCurrent: string;
  pStale: string;
  pNone: string;
  pDraft: string;
  pB: string;
  deptDual: string;
  deptFanout: string;
  userCurrent: string;
  userStale: string;
  userDept: string;
};

beforeAll(() => {
  pgSql = postgres(TEST_URL, { prepare: false, onnotice: () => {} });
});

afterAll(async () => {
  await cleanupTenantTables();
  await pgSql.end({ timeout: 5 });
});

async function cleanupTenantTables(): Promise<void> {
  for (const table of [
    'review_decisions',
    'qa_citation_grants',
    'reminder_sends',
    'acknowledgments',
    'policy_assignments',
    'policy_versions',
    'ai_generations',
    'batch_jobs',
    'notifications',
    'workflow_stages',
    'policies',
    'departments',
    'users',
    'organizations',
    'clerk_events',
    'stripe_events',
  ]) {
    await pgSql.unsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

async function seedReportFixtures(): Promise<ReportFixtures> {
  const ids: ReportFixtures = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    adminA: randomUUID(),
    pCurrent: randomUUID(),
    pStale: randomUUID(),
    pNone: randomUUID(),
    pDraft: randomUUID(),
    pB: randomUUID(),
    deptDual: randomUUID(),
    deptFanout: randomUUID(),
    userCurrent: randomUUID(),
    userStale: randomUUID(),
    userDept: randomUUID(),
  };
  const userB = randomUUID();
  const pCurrentV1 = randomUUID();
  const pStaleV1 = randomUUID();
  const pStaleV2 = randomUUID();
  const pNoneV1 = randomUUID();
  const pDraftV1 = randomUUID();
  const pBV1 = randomUUID();
  const content = pgSql.json({ type: 'doc', content: [{ type: 'paragraph' }] });

  await cleanupTenantTables();
  await pgSql.begin(async (tx) => {
    await tx`
      INSERT INTO organizations (id, clerk_org_id, name, slug)
      VALUES
        (${ids.orgA}, ${`clerk_org_a_${ids.orgA.slice(0, 8)}`}, 'Org A Reports', ${`org-a-reports-${ids.orgA.slice(0, 8)}`}),
        (${ids.orgB}, ${`clerk_org_b_${ids.orgB.slice(0, 8)}`}, 'Org B Reports', ${`org-b-reports-${ids.orgB.slice(0, 8)}`})
    `;
    await tx`
      INSERT INTO departments (id, org_id, name)
      VALUES
        (${ids.deptDual}, ${ids.orgA}, 'Dual Team'),
        (${ids.deptFanout}, ${ids.orgA}, 'Ops')
    `;
    await tx`
      INSERT INTO users (id, org_id, clerk_user_id, role, department_id)
      VALUES
        (${ids.adminA}, ${ids.orgA}, ${`clerk_admin_${ids.adminA.slice(0, 8)}`}, 'admin', NULL),
        (${ids.userCurrent}, ${ids.orgA}, 'clerk_user_current', 'employee', ${ids.deptDual}),
        (${ids.userStale}, ${ids.orgA}, 'clerk_user_stale', 'employee', NULL),
        (${ids.userDept}, ${ids.orgA}, 'clerk_user_dept', 'employee', ${ids.deptFanout}),
        (${userB}, ${ids.orgB}, 'clerk_user_b', 'employee', NULL)
    `;
    await tx`
      INSERT INTO policies (id, org_id, title, content_json, category, status, current_version)
      VALUES
        (${ids.pCurrent}, ${ids.orgA}, 'Overlapping Handbook', ${content}, 'HR', 'published', 1),
        (${ids.pStale}, ${ids.orgA}, 'Safety Manual', ${content}, 'Safety', 'published', 2),
        (${ids.pNone}, ${ids.orgA}, 'IT Guide', ${content}, 'IT', 'published', 1),
        (${ids.pDraft}, ${ids.orgA}, 'Draft Only', ${content}, 'HR', 'draft', 1),
        (${ids.pB}, ${ids.orgB}, 'Overlapping Handbook', ${content}, 'HR', 'published', 1)
    `;
    await tx`
      INSERT INTO policy_versions (id, org_id, policy_id, version_number, content_json)
      VALUES
        (${pCurrentV1}, ${ids.orgA}, ${ids.pCurrent}, 1, ${content}),
        (${pStaleV1}, ${ids.orgA}, ${ids.pStale}, 1, ${content}),
        (${pStaleV2}, ${ids.orgA}, ${ids.pStale}, 2, ${content}),
        (${pNoneV1}, ${ids.orgA}, ${ids.pNone}, 1, ${content}),
        (${pDraftV1}, ${ids.orgA}, ${ids.pDraft}, 1, ${content}),
        (${pBV1}, ${ids.orgB}, ${ids.pB}, 1, ${content})
    `;
    await tx`
      INSERT INTO policy_assignments (org_id, policy_id, assignee_type, assignee_id, assigned_by, assigned_at)
      VALUES
        (${ids.orgA}, ${ids.pCurrent}, 'user', ${ids.userCurrent}, ${ids.adminA}, ${new Date('2026-05-01T00:00:00.000Z')}),
        (${ids.orgA}, ${ids.pCurrent}, 'department', ${ids.deptDual}, ${ids.adminA}, ${new Date('2026-05-02T00:00:00.000Z')}),
        (${ids.orgA}, ${ids.pStale}, 'user', ${ids.userStale}, ${ids.adminA}, ${new Date('2026-05-03T00:00:00.000Z')}),
        (${ids.orgA}, ${ids.pNone}, 'department', ${ids.deptFanout}, ${ids.adminA}, ${new Date('2026-05-04T00:00:00.000Z')}),
        (${ids.orgA}, ${ids.pDraft}, 'user', ${ids.userCurrent}, ${ids.adminA}, ${new Date('2026-05-05T00:00:00.000Z')}),
        (${ids.orgB}, ${ids.pB}, 'user', ${userB}, NULL, ${new Date('2026-05-01T00:00:00.000Z')})
    `;
    await tx`
      INSERT INTO acknowledgments (org_id, user_id, policy_id, policy_version_id, ip_address, acknowledged_at)
      VALUES
        (${ids.orgA}, ${ids.userCurrent}, ${ids.pCurrent}, ${pCurrentV1}, '203.0.113.10', ${new Date('2026-06-01T00:00:00.000Z')}),
        (${ids.orgA}, ${ids.userStale}, ${ids.pStale}, ${pStaleV1}, '203.0.113.11', ${new Date('2026-05-20T00:00:00.000Z')}),
        (${ids.orgB}, ${userB}, ${ids.pB}, ${pBV1}, '203.0.113.99', ${new Date('2026-06-01T00:00:00.000Z')})
    `;
  });

  return ids;
}

async function runReport(
  ctx: OrgContext,
  filters?: AckComplianceFilters,
) {
  const [{ withOrgScope }, { Reports }] = await Promise.all([
    import('@/lib/db/scoped'),
    import('@/lib/db/repositories/reports'),
  ]);
  return withOrgScope(ctx, (s) => Reports.listAckComplianceForOrg(s, filters));
}

describe('Reports.listAckComplianceForOrg', () => {
  it('derives ack state, dedupes assignments, excludes drafts, and enforces org isolation through RLS', async () => {
    const ids = await seedReportFixtures();
    const ctxA: OrgContext = {
      orgId: ids.orgA,
      userId: ids.adminA,
      clerkOrgId: 'clerk_org_a_reports',
      clerkUserId: 'clerk_admin_reports',
      role: 'admin',
    };

    try {
      const rows = await runReport(ctxA);
      const keys = new Set(rows.map((row) => `${row.userId}:${row.policyId}`));

      expect(rows).toHaveLength(3);
      expect(keys.has(`${ids.userCurrent}:${ids.pCurrent}`)).toBe(true);
      expect(keys.has(`${ids.userStale}:${ids.pStale}`)).toBe(true);
      expect(keys.has(`${ids.userDept}:${ids.pNone}`)).toBe(true);
      expect(keys.has(`${ids.userCurrent}:${ids.pDraft}`)).toBe(false);
      expect(rows.some((row) => row.policyId === ids.pB)).toBe(false);
      expect(rows.filter((row) => row.userId === ids.userCurrent && row.policyId === ids.pCurrent)).toHaveLength(1);

      const current = rows.find((row) => row.policyId === ids.pCurrent);
      expect(current?.ackState).toBe('current');
      expect(current?.acknowledgedAt).toBeInstanceOf(Date);
      expect(current?.ipAddress).toBe('203.0.113.10');
      expect(current?.departmentName).toBe('Dual Team');

      const stale = rows.find((row) => row.policyId === ids.pStale);
      expect(stale?.ackState).toBe('stale');
      expect(stale?.acknowledgedAt).toBeNull();
      expect(stale?.ipAddress).toBeNull();

      const none = rows.find((row) => row.policyId === ids.pNone);
      expect(none?.ackState).toBe('none');
      expect(none?.departmentName).toBe('Ops');

      await expect(runReport(ctxA, { policyId: ids.pB })).resolves.toEqual([]);
      // RLS-isolating negative: a predicate-free probe the repo's app-layer
      // org_id filter cannot satisfy. Only RLS should strip Org B here.
      const { withOrgScope } = await import('@/lib/db/scoped');
      const rlsProbe = await withOrgScope(ctxA, (s) =>
        s.tx.execute(sql`SELECT id FROM policies WHERE id = ${ids.pB}`),
      );
      expect(rlsProbe).toHaveLength(0);

      await expect(runReport(ctxA, { policyId: ids.pStale })).resolves.toMatchObject([
        { userId: ids.userStale, policyId: ids.pStale, ackState: 'stale' },
      ]);
      await expect(runReport(ctxA, { departmentId: ids.deptFanout })).resolves.toMatchObject([
        { userId: ids.userDept, policyId: ids.pNone, ackState: 'none' },
      ]);
    } finally {
      await cleanupTenantTables();
    }
  });
});
