// lib/db/repositories/policy_assignments.test.ts — Plan 05-09 Task 2 (D-21 co-located).
//
// Contract-shape tests for Phase 5 D-15 PolicyAssignments.create body. Covers:
//   - create returns row array on fresh insert
//   - create returns empty array on conflict (D-15 idempotency via ON CONFLICT DO NOTHING)
//   - create stamps scope.orgId (D-02 denormalization + cross-org defense)
//   - create preserves input.policyId verbatim (brand-preservation smoke)
//   - listForPolicy + listAll shape (signature smoke)
import { describe, it, expect, vi, beforeEach } from 'vitest';

const returningMock = vi.fn();
const onConflictMock = vi.fn(() => ({ returning: returningMock }));
const valuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));

const listWhereMock = vi.fn(() => Promise.resolve([]));
const listFromMock = vi.fn(() => ({ where: listWhereMock }));
const listSelectMock = vi.fn(() => ({ from: listFromMock }));

const txMock = {
  insert: insertMock,
  select: listSelectMock,
};

import { PolicyAssignments } from './policy_assignments';
import type { OrgScope } from '@/lib/db/scoped';
import type { PolicyId } from '@/lib/policies/types';

const SCOPE = {
  orgId: '00000000-0000-4000-8000-000000000001',
  userId: '00000000-0000-4000-8000-000000000002',
  clerkOrgId: 'clerk_test_org',
  clerkUserId: 'clerk_test_user',
  role: 'admin' as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: txMock as any,
} as OrgScope;

const POLICY_ID = '00000000-0000-4000-8000-000000000003' as unknown as PolicyId;
const INPUT = {
  policyId: POLICY_ID,
  assigneeType: 'department' as const,
  assigneeId: '00000000-0000-4000-8000-000000000004',
  assignedBy: '00000000-0000-4000-8000-000000000002',
};

beforeEach(() => {
  returningMock.mockReset();
  onConflictMock.mockClear();
  valuesMock.mockClear();
  insertMock.mockClear();
  listWhereMock.mockClear();
  listFromMock.mockClear();
  listSelectMock.mockClear();
});

describe('PolicyAssignments.create (D-15 contract)', () => {
  it('returns the inserted row array on fresh insert', async () => {
    const freshRow = { id: 'pa-1' };
    returningMock.mockResolvedValueOnce([freshRow]);
    const result = await PolicyAssignments.create(SCOPE, INPUT);
    expect(result).toEqual([freshRow]);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onConflictMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty array on conflict — D-15 idempotency via ON CONFLICT DO NOTHING', async () => {
    returningMock.mockResolvedValueOnce([]);
    const result = await PolicyAssignments.create(SCOPE, INPUT);
    expect(result).toEqual([]);
  });

  it('stamps scope.orgId into the inserted row (D-02 denormalization + cross-org defense)', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'pa-1' }]);
    await PolicyAssignments.create(SCOPE, INPUT);
    const calls = valuesMock.mock.calls as unknown as unknown[][];
    const valuesArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesArg).toBeDefined();
    expect(valuesArg?.orgId).toBe(SCOPE.orgId);
  });

  it('preserves input.policyId verbatim (brand-preservation smoke per ADR-028)', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'pa-1' }]);
    await PolicyAssignments.create(SCOPE, INPUT);
    const calls = valuesMock.mock.calls as unknown as unknown[][];
    const valuesArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesArg?.policyId).toBe(POLICY_ID);
  });
});

describe('PolicyAssignments.listForPolicy + listAll (signature smoke)', () => {
  it('listForPolicy returns array', async () => {
    const result = await PolicyAssignments.listForPolicy(SCOPE, POLICY_ID);
    expect(Array.isArray(result)).toBe(true);
  });

  it('listAll returns array', async () => {
    const result = await PolicyAssignments.listAll(SCOPE);
    expect(Array.isArray(result)).toBe(true);
  });
});
