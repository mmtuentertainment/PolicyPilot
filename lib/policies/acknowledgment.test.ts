// lib/policies/acknowledgment.test.ts — Plan 05-09 Task 2 (D-21 co-located).
//
// Behavioral contract tests for lib/policies/acknowledgment.ts::recordAcknowledgment
// (Plan 05-04 atomic single-tx orchestrator). Mirrors lib/policies/transitions.test.ts
// shape — module-level vi.mock hoisting + beforeEach reset.
//
// Coverage per Plan 05-09 Task 2 spec:
//   - Happy path: findById → assignment check → findByVersionNumber → record → { ackedAt }
//   - throws PolicyArchivedError when policy.status !== 'published' (D-07)
//   - throws PolicyNotAssignedError when assignment check finds no match (D-08)
//   - throws PolicyNotFoundError when findById returns []
//   - throws PolicyNotFoundError when pv lookup returns [] (defensive race guard)
//   - passes ipAddress argument through to Acknowledgments.record (D-05 IP capture)
//   - D-10 silent success: empty RETURNING returns existing ack timestamp
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted tx mock for the s.tx.select() user-dept sub-query + acknowledgments lookup.
// Each helper returns a self-chaining mock that resolves to a fixed array per setup.
const txSelectLimitMock = vi.fn();
const txSelectWhereMock = vi.fn(() => ({ limit: txSelectLimitMock }));
const txSelectFromMock = vi.fn(() => ({ where: txSelectWhereMock }));
const txSelectMock = vi.fn(() => ({ from: txSelectFromMock }));
const txMock = { select: txSelectMock };

vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (
    _ctx: unknown,
    fn: (s: {
      orgId: string;
      userId: string;
      clerkOrgId: string;
      clerkUserId: string;
      role: 'admin' | 'reviewer' | 'employee';
      tx: typeof txMock;
    }) => Promise<unknown>,
  ) =>
    fn({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'employee',
      tx: txMock,
    }),
}));

const findByIdMock = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    findById: (...args: unknown[]) => findByIdMock(...args),
  },
}));

const findByVersionNumberMock = vi.fn();
vi.mock('@/lib/db/repositories/policy_versions', () => ({
  PolicyVersions: {
    findByVersionNumber: (...args: unknown[]) => findByVersionNumberMock(...args),
  },
}));

const listForPolicyMock = vi.fn();
vi.mock('@/lib/db/repositories/policy_assignments', () => ({
  PolicyAssignments: {
    listForPolicy: (...args: unknown[]) => listForPolicyMock(...args),
  },
}));

const recordMock = vi.fn();
vi.mock('@/lib/db/repositories/acknowledgments', () => ({
  Acknowledgments: {
    record: (...args: unknown[]) => recordMock(...args),
  },
}));

// Stub the schema barrel so acknowledgment.ts can `import { acknowledgments, users } from
// '@/lib/db/schema'` without pulling Drizzle's real table objects (which import postgres
// at module load and break vitest's jsdom env).
vi.mock('@/lib/db/schema', () => ({
  acknowledgments: { __stub: 'acknowledgments' } as unknown as Record<string, never>,
  users: { __stub: 'users' } as unknown as Record<string, never>,
}));

import { recordAcknowledgment } from './acknowledgment';
import {
  PolicyArchivedError,
  PolicyNotAssignedError,
  PolicyNotFoundError,
} from '@/lib/policies/errors';
import type { PolicyId } from '@/lib/policies/types';
import type { OrgContext } from '@/lib/auth/context';

const POLICY_ID = '00000000-0000-4000-8000-000000000001' as unknown as PolicyId;
const CTX: OrgContext = {
  orgId: 'org_1',
  userId: 'user_1',
  clerkOrgId: 'clerk_test_org',
  clerkUserId: 'clerk_test_user',
  role: 'employee',
};

beforeEach(() => {
  findByIdMock.mockReset();
  findByVersionNumberMock.mockReset();
  listForPolicyMock.mockReset();
  recordMock.mockReset();
  txSelectLimitMock.mockReset();
  txSelectMock.mockClear();
  txSelectFromMock.mockClear();
  txSelectWhereMock.mockClear();
});

describe('recordAcknowledgment happy path (Plan 05-04 D-10a)', () => {
  it('returns { ackedAt } after findById → assignment match → findByVersionNumber → record', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    // user-dept sub-query — return user with departmentId null (user-level assignment match below).
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    const ackedAt = new Date('2026-05-24T00:00:00Z');
    recordMock.mockResolvedValueOnce([{ id: 'ack-1', acknowledgedAt: ackedAt }]);

    const result = await recordAcknowledgment(CTX, POLICY_ID, '1.2.3.4');
    expect(result.ackedAt).toBe(ackedAt.toISOString());
    expect(findByIdMock).toHaveBeenCalledTimes(1);
    expect(listForPolicyMock).toHaveBeenCalledTimes(1);
    expect(findByVersionNumberMock).toHaveBeenCalledTimes(1);
    expect(recordMock).toHaveBeenCalledTimes(1);
  });

  it('passes ipAddress argument through to Acknowledgments.record (D-05 IP capture smoke)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    recordMock.mockResolvedValueOnce([
      { id: 'ack-1', acknowledgedAt: new Date() },
    ]);

    await recordAcknowledgment(CTX, POLICY_ID, '203.0.113.42');
    const recordInput = recordMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(recordInput?.ipAddress).toBe('203.0.113.42');
  });

  it('passes null ipAddress through unchanged (local-dev/no-header path)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    recordMock.mockResolvedValueOnce([
      { id: 'ack-1', acknowledgedAt: new Date() },
    ]);

    await recordAcknowledgment(CTX, POLICY_ID, null);
    const recordInput = recordMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(recordInput?.ipAddress).toBe(null);
  });
});

describe('recordAcknowledgment error paths (D-07 + D-08 + D-30)', () => {
  it('throws PolicyNotFoundError when findById returns []', async () => {
    findByIdMock.mockResolvedValueOnce([]);
    await expect(recordAcknowledgment(CTX, POLICY_ID, null)).rejects.toBeInstanceOf(
      PolicyNotFoundError,
    );
  });

  it('throws PolicyArchivedError when policy.status === \'archived\' (D-07)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'archived', currentVersion: 1 },
    ]);
    await expect(recordAcknowledgment(CTX, POLICY_ID, null)).rejects.toBeInstanceOf(
      PolicyArchivedError,
    );
  });

  it('throws PolicyArchivedError when policy.status === \'draft\' (D-07 — any non-published)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'draft', currentVersion: 1 },
    ]);
    await expect(recordAcknowledgment(CTX, POLICY_ID, null)).rejects.toBeInstanceOf(
      PolicyArchivedError,
    );
  });

  it('throws PolicyNotAssignedError when assignment check finds no match (D-08)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: 'dept_other' }]);
    listForPolicyMock.mockResolvedValueOnce([
      // Assignment exists, but to a DIFFERENT user + DIFFERENT dept.
      { assigneeType: 'user', assigneeId: 'user_someone_else' },
      { assigneeType: 'department', assigneeId: 'dept_someone_else' },
    ]);
    await expect(recordAcknowledgment(CTX, POLICY_ID, null)).rejects.toBeInstanceOf(
      PolicyNotAssignedError,
    );
  });

  it('throws PolicyNotFoundError when pv lookup returns [] (defensive race guard)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([]); // pv missing
    await expect(recordAcknowledgment(CTX, POLICY_ID, null)).rejects.toBeInstanceOf(
      PolicyNotFoundError,
    );
  });
});

describe('recordAcknowledgment dept-level assignment match (D-03 dept sub-query)', () => {
  it('matches via department assignment when user has matching department_id', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: 'dept_xyz' }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'department', assigneeId: 'dept_xyz' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    recordMock.mockResolvedValueOnce([
      { id: 'ack-1', acknowledgedAt: new Date('2026-05-24T00:00:00Z') },
    ]);

    const result = await recordAcknowledgment(CTX, POLICY_ID, null);
    expect(result.ackedAt).toBe('2026-05-24T00:00:00.000Z');
  });
});

describe('recordAcknowledgment D-10 silent success (RESEARCH Pitfall 8)', () => {
  it('returns existing-row timestamp when record returns [] (UNIQUE conflict path)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    // record returns [] — UNIQUE conflict fired.
    recordMock.mockResolvedValueOnce([]);
    // The orchestrator looks up the existing row's timestamp via tx.select().
    const existingAckedAt = new Date('2026-05-23T12:00:00Z');
    txSelectLimitMock.mockResolvedValueOnce([{ acknowledgedAt: existingAckedAt }]);

    const result = await recordAcknowledgment(CTX, POLICY_ID, null);
    expect(result.ackedAt).toBe(existingAckedAt.toISOString());
  });

  it('returns new Date timestamp when record returns [] AND existing-row lookup also returns []', async () => {
    // Defensive: even if the existing-row lookup misses (which should not happen given
    // the UNIQUE just fired), the orchestrator falls back to new Date() so the UI still
    // renders a "Acknowledged ✓" without a crash.
    findByIdMock.mockResolvedValueOnce([
      { id: POLICY_ID, status: 'published', currentVersion: 1 },
    ]);
    txSelectLimitMock.mockResolvedValueOnce([{ deptId: null }]);
    listForPolicyMock.mockResolvedValueOnce([
      { assigneeType: 'user', assigneeId: 'user_1' },
    ]);
    findByVersionNumberMock.mockResolvedValueOnce([{ id: 'pv-1' }]);
    recordMock.mockResolvedValueOnce([]);
    txSelectLimitMock.mockResolvedValueOnce([]); // no existing row

    const before = Date.now();
    const result = await recordAcknowledgment(CTX, POLICY_ID, null);
    const after = Date.now();
    const returnedMs = new Date(result.ackedAt).getTime();
    expect(returnedMs).toBeGreaterThanOrEqual(before);
    expect(returnedMs).toBeLessThanOrEqual(after);
  });
});
