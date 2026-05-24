// lib/db/repositories/acknowledgments.test.ts — Plan 05-09 Task 2 (D-21 co-located unit tests).
//
// Contract-shape tests for Phase 5 D-06 + D-10 Acknowledgments.record body. Covers:
//   - record returns row array on fresh insert (mocked RETURNING returns [{...row}])
//   - record returns empty array on conflict (mocked RETURNING returns []) — D-10
//   - record logs '[ack] no-op (already acked)' on the no-op branch — D-10 ops log
//   - record does NOT throw on empty RETURNING — D-10 silent-success
//   - record stamps scope.orgId (NEVER from input — cross-org write defense)
//   - record preserves input.policyId verbatim (brand-preservation smoke)
//   - Acknowledgments STILL does NOT export update/delete keys (ADR-018 runtime check)
//
// The ADR-018 type-system enforcement lives in tests/types.ts D-07 (compile-time);
// this file adds a complementary runtime check that proves the field is undefined.
// Together they form the type-system + ts-morph + runtime defense triad documented
// in 05-CONTEXT.md.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the schema barrel so acknowledgments.ts can `import { acknowledgments } from
// '@/lib/db/schema'` without pulling Drizzle's real table object (which imports postgres
// at module load and breaks vitest's jsdom env).
vi.mock('@/lib/db/schema', () => ({
  acknowledgments: { __stub: 'acknowledgments' } as unknown as Record<string, never>,
}));

// Hoist a chainable insert mock that returns a fixed inserted-row array.
// Tests set mockReturnValueOnce to override per-case.
const returningMock = vi.fn();
const onConflictMock = vi.fn(() => ({ returning: returningMock }));
const valuesMock = vi.fn(() => ({ onConflictDoNothing: onConflictMock }));
const insertMock = vi.fn(() => ({ values: valuesMock }));

const txMock = {
  insert: insertMock,
  // Acknowledgments.listForUser needs select().from().where()
  select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
};

import { Acknowledgments } from './acknowledgments';
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

const INPUT = {
  userId: '00000000-0000-4000-8000-000000000002',
  policyId: '00000000-0000-4000-8000-000000000003',
  policyVersionId: '00000000-0000-4000-8000-000000000004',
  ipAddress: '1.2.3.4',
};

beforeEach(() => {
  returningMock.mockReset();
  onConflictMock.mockClear();
  valuesMock.mockClear();
  insertMock.mockClear();
});

describe('Acknowledgments.record (D-06 + D-10 contract)', () => {
  it('returns the inserted row array on fresh insert', async () => {
    const freshRow = { id: 'ack-1', acknowledgedAt: new Date() };
    returningMock.mockResolvedValueOnce([freshRow]);
    const result = await Acknowledgments.record(SCOPE, INPUT);
    expect(result).toEqual([freshRow]);
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(onConflictMock).toHaveBeenCalledTimes(1); // ON CONFLICT DO NOTHING fires
  });

  it('returns empty array on conflict (mocked RETURNING returns []) — D-10 silent success', async () => {
    returningMock.mockResolvedValueOnce([]);
    const result = await Acknowledgments.record(SCOPE, INPUT);
    expect(result).toEqual([]);
    // D-10: empty RETURNING is success, not failure — orchestrator treats as no-op.
  });

  it("logs '[ack] no-op (already acked)' on the empty-RETURNING branch — D-10 ops log", async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      returningMock.mockResolvedValueOnce([]);
      await Acknowledgments.record(SCOPE, INPUT);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ack] no-op (already acked)',
        expect.objectContaining({
          userId: SCOPE.userId,
          policyId: INPUT.policyId,
        }),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('does NOT throw on empty RETURNING — D-10 silent-success path', async () => {
    returningMock.mockResolvedValueOnce([]);
    await expect(Acknowledgments.record(SCOPE, INPUT)).resolves.toBeDefined();
  });

  it('stamps scope.orgId into the inserted row (cross-org write defense)', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'ack-1', acknowledgedAt: new Date() }]);
    await Acknowledgments.record(SCOPE, INPUT);
    // Inspect the values mock's first call to confirm orgId came from scope, NOT input.
    expect(valuesMock).toHaveBeenCalledTimes(1);
    const calls = valuesMock.mock.calls as unknown as unknown[][];
    const valuesArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesArg).toBeDefined();
    expect(valuesArg?.orgId).toBe(SCOPE.orgId);
  });

  it('preserves input.policyId verbatim (brand-preservation smoke per ADR-028)', async () => {
    returningMock.mockResolvedValueOnce([{ id: 'ack-1', acknowledgedAt: new Date() }]);
    await Acknowledgments.record(SCOPE, INPUT);
    const calls = valuesMock.mock.calls as unknown as unknown[][];
    const valuesArg = calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesArg?.policyId).toBe(INPUT.policyId);
  });
});

describe('Acknowledgments append-only invariant (ADR-018 runtime check)', () => {
  // tests/types.ts D-07 already enforces these at COMPILE time via @ts-expect-error.
  // This block adds a complementary RUNTIME check — the field MUST be undefined at
  // runtime, not just type-rejected. Layered defense per 05-CONTEXT.md.
  it('Acknowledgments.update is undefined (append-only — no row mutation path)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((Acknowledgments as any).update).toBeUndefined();
  });

  it('Acknowledgments.delete is undefined (append-only — no row deletion path)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((Acknowledgments as any).delete).toBeUndefined();
  });
});
