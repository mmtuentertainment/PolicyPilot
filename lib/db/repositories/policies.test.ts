// lib/db/repositories/policies.test.ts — Plan 05-09 Task 2 (D-21 co-located unit tests).
//
// Mock-level contract-shape tests for the Phase 5 surface on Policies:
//   - listAssignedAndPublishedForUser — composition + signature
//   - listPublishedForOrg — regression smoke (Phase 4 method still works)
//
// Mock-level tests are LIMITED — the real query correctness is in
// scripts/check-employee-portal.test.ts (Plan 05-09 Task 1) against live TEST DB.
// Co-located vitest is primarily a contract-shape test that fails LOUDLY if a
// future refactor narrows the public surface or breaks the call composition
// (selectDistinct, innerJoin, leftJoin, where eq orgId + eq status='published').
//
// Pattern source: app/(admin)/policies/[id]/actions.test.ts:17-98 (hoisted vi.mock
// state + vitest contract test shape).
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist a chainable tx-mock that returns itself from every Drizzle composition method
// (.from, .innerJoin, .leftJoin, .where) and resolves to a fixed result array. The mock
// records every method call so we can assert the composition shape. Type annotations are
// explicit because vitest's vi.fn type inference can't resolve recursive self-references
// (leftJoinMock returns an object that contains leftJoinMock itself).

// Shape returned by .leftJoin — supports further .leftJoin chaining + .where terminator.
interface LeftJoinable {
  leftJoin: typeof leftJoinMock;
  where: typeof whereMock;
}
// Shape returned by .innerJoin — supports .innerJoin + .leftJoin + .where.
interface InnerJoinable extends LeftJoinable {
  innerJoin: typeof innerJoinMock;
}

const whereMock = vi.fn(
  (): Promise<
    Array<{
      id: string;
      title: string;
      category: string;
      currentVersion: number;
      tldrSummary: string | null;
      ackState: 'none' | 'current' | 'stale';
      ackedAt: Date | null;
    }>
  > =>
    Promise.resolve([
      {
        id: 'p1',
        title: 'P1',
        category: 'HR',
        currentVersion: 1,
        tldrSummary: null,
        ackState: 'none',
        ackedAt: null,
      },
    ]),
);
const leftJoinMock = vi.fn(
  (): LeftJoinable => ({ leftJoin: leftJoinMock, where: whereMock }),
);
const innerJoinMock = vi.fn(
  (): InnerJoinable => ({
    innerJoin: innerJoinMock,
    leftJoin: leftJoinMock,
    where: whereMock,
  }),
);
const fromMock = vi.fn(
  (): InnerJoinable => ({
    innerJoin: innerJoinMock,
    leftJoin: leftJoinMock,
    where: whereMock,
  }),
);
const selectDistinctMock = vi.fn(() => ({ from: fromMock }));
const selectFromWhereMock = vi.fn(
  (): Promise<Array<{ id: string; title: string; contentJson: unknown }>> =>
    Promise.resolve([{ id: 'p1', title: 'P1', contentJson: {} }]),
);
const selectFromMock = vi.fn(() => ({ where: selectFromWhereMock }));
const selectMock = vi.fn(() => ({ from: selectFromMock }));

const txMock = {
  selectDistinct: selectDistinctMock,
  select: selectMock,
};

import { Policies } from './policies';
import type { OrgScope } from '@/lib/db/scoped';

const SCOPE = {
  orgId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  clerkOrgId: 'clerk_test_org',
  clerkUserId: 'clerk_test_user',
  role: 'employee' as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: txMock as any,
} as OrgScope;

beforeEach(() => {
  selectDistinctMock.mockClear();
  fromMock.mockClear();
  innerJoinMock.mockClear();
  leftJoinMock.mockClear();
  whereMock.mockClear();
  selectMock.mockClear();
  selectFromMock.mockClear();
  selectFromWhereMock.mockClear();
});

describe('Policies.listAssignedAndPublishedForUser (Phase 5 D-01..D-04 contract)', () => {
  it('returns the expected row shape (id, title, category, currentVersion, tldrSummary, ackState, ackedAt)', async () => {
    const result = await Policies.listAssignedAndPublishedForUser(SCOPE, '00000000-0000-4000-8000-000000000003');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const row = result[0];
    expect(row).toBeDefined();
    expect(typeof row?.id).toBe('string');
    expect(typeof row?.title).toBe('string');
    expect(typeof row?.category).toBe('string');
    expect(typeof row?.currentVersion).toBe('number');
    // ackState is 'none' | 'current' | 'stale' per D-04 enum
    expect(['none', 'current', 'stale']).toContain(row?.ackState);
  });

  it('composition includes selectDistinct + 2 innerJoin + 2 leftJoin + where (D-01 SELECT DISTINCT + D-04 two-ack-aliases)', async () => {
    await Policies.listAssignedAndPublishedForUser(SCOPE, '00000000-0000-4000-8000-000000000003');
    // D-01: SELECT DISTINCT to dedup user-and-dept double-assignment.
    expect(selectDistinctMock).toHaveBeenCalledTimes(1);
    // 2 INNER JOINs: policy_assignments + policy_versions (D-04).
    expect(innerJoinMock).toHaveBeenCalledTimes(2);
    // 2 LEFT JOINs: current_ack + prior_ack aliases (D-04).
    expect(leftJoinMock).toHaveBeenCalledTimes(2);
    expect(whereMock).toHaveBeenCalledTimes(1);
  });
});

describe('Policies.listPublishedForOrg (Phase 4 D-12 regression smoke)', () => {
  it('returns the published-policies library shape (id, title, contentJson)', async () => {
    const result = await Policies.listPublishedForOrg(SCOPE);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    const row = result[0];
    expect(row).toBeDefined();
    expect(typeof row?.id).toBe('string');
    expect(typeof row?.title).toBe('string');
    expect(row?.contentJson).toBeDefined();
  });

  it('composition uses select + from + where (no JOINs — single-table query)', async () => {
    await Policies.listPublishedForOrg(SCOPE);
    expect(selectMock).toHaveBeenCalledTimes(1);
    expect(selectFromMock).toHaveBeenCalledTimes(1);
    expect(selectFromWhereMock).toHaveBeenCalledTimes(1);
  });
});
