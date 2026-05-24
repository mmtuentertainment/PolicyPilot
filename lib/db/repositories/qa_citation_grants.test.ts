// lib/db/repositories/qa_citation_grants.test.ts — Plan 05-09 Task 2 (D-21 co-located).
//
// Contract-shape tests for Phase 5 D-29 QaCitationGrants. Covers:
//   - upsert returns row array on fresh insert
//   - upsert returns empty array on conflict (D-26 idempotency)
//   - upsert stamps scope.orgId (cross-org write defense)
//   - hasGrant returns true when COUNT > 0
//   - hasGrant returns false when COUNT === 0
//   - listForUser signature smoke
import { describe, it, expect, vi, beforeEach } from 'vitest';

const returningMock = vi.fn();
const onConflictMock = vi.fn(() => ({ returning: returningMock }));
const valuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));

// hasGrant select chain
const hasGrantLimitMock = vi.fn();
const hasGrantWhereMock = vi.fn(() => ({ limit: hasGrantLimitMock }));
const hasGrantFromMock = vi.fn(() => ({ where: hasGrantWhereMock }));
// listForUser select chain
const listWhereMock = vi.fn(() => Promise.resolve([]));
const listFromMock = vi.fn(() => ({ where: listWhereMock }));

// select() returns different shape depending on whether subsequent .from is on
// the COUNT path (hasGrant) vs the row path (listForUser). We dispatch based on
// the argument the test passed in — for hasGrant the .select takes the COUNT
// object; for listForUser the .select takes no arg. We branch on the select arg.
const selectMock = vi.fn((arg?: unknown) => {
  if (arg && typeof arg === 'object') {
    // hasGrant path — select({ c: sql<...>`COUNT(*)`.as('c') })
    return { from: hasGrantFromMock };
  }
  // listForUser path — select() with no args
  return { from: listFromMock };
});

const txMock = {
  insert: insertMock,
  select: selectMock,
};

import { QaCitationGrants } from './qa_citation_grants';
import type { OrgScope } from '@/lib/db/scoped';
import type { PolicyId } from '@/lib/policies/types';

const SCOPE = {
  orgId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  clerkOrgId: 'clerk_test_org',
  clerkUserId: 'clerk_test_user',
  role: 'employee' as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: txMock as any,
} as OrgScope;

const USER_ID = '00000000-0000-4000-8000-000000000002';
const POLICY_ID = '00000000-0000-4000-8000-000000000003' as unknown as PolicyId;
const INPUT = { userId: USER_ID, policyId: POLICY_ID };

beforeEach(() => {
  returningMock.mockReset();
  onConflictMock.mockClear();
  valuesMock.mockClear();
  insertMock.mockClear();
  hasGrantLimitMock.mockReset();
  hasGrantWhereMock.mockClear();
  hasGrantFromMock.mockClear();
  listWhereMock.mockClear();
  listFromMock.mockClear();
  selectMock.mockClear();
});

describe('QaCitationGrants.upsert (D-29 + D-26 contract)', () => {
  it('returns the inserted row array on fresh insert', async () => {
    const freshRow = { id: 'g-1' };
    returningMock.mockResolvedValueOnce([freshRow]);
    const result = await QaCitationGrants.upsert(SCOPE, INPUT);
    expect(result).toEqual([freshRow]);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onConflictMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty array on conflict — D-26 idempotency via ON CONFLICT DO NOTHING', async () => {
    returningMock.mockResolvedValueOnce([]);
    const result = await QaCitationGrants.upsert(SCOPE, INPUT);
    expect(result).toEqual([]);
  });

  it('stamps scope.orgId into the inserted row (cross-org write defense)', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'g-1' }]);
    await QaCitationGrants.upsert(SCOPE, INPUT);
    const calls = valuesMock.mock.calls as unknown as unknown[][];
    const valuesArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesArg).toBeDefined();
    expect(valuesArg?.orgId).toBe(SCOPE.orgId);
  });
});

describe('QaCitationGrants.hasGrant (D-27 page-handler predicate)', () => {
  it('returns true when COUNT > 0 (grant exists)', async () => {
    hasGrantLimitMock.mockResolvedValueOnce([{ c: 1 }]);
    const result = await QaCitationGrants.hasGrant(SCOPE, USER_ID, POLICY_ID);
    expect(result).toBe(true);
  });

  it('returns false when COUNT === 0 (no grant)', async () => {
    hasGrantLimitMock.mockResolvedValueOnce([{ c: 0 }]);
    const result = await QaCitationGrants.hasGrant(SCOPE, USER_ID, POLICY_ID);
    expect(result).toBe(false);
  });

  it('returns false when empty result set (defensive — should not happen but coerces safely)', async () => {
    hasGrantLimitMock.mockResolvedValueOnce([]);
    const result = await QaCitationGrants.hasGrant(SCOPE, USER_ID, POLICY_ID);
    expect(result).toBe(false);
  });
});

describe('QaCitationGrants.listForUser (signature smoke)', () => {
  it('returns array', async () => {
    const result = await QaCitationGrants.listForUser(SCOPE, USER_ID);
    expect(Array.isArray(result)).toBe(true);
  });
});
