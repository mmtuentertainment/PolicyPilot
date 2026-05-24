// app/(employee)/my-policies/[id]/actions.test.ts — Plan 05-09 Task 2 (D-21 co-located).
//
// Behavioral contract for acknowledgePolicyAction (Plan 05-05 Task 2a). Mirrors
// app/(admin)/policies/[id]/actions.test.ts:17-98 shape — module-level vi.mock hoisting +
// beforeEach reset + FormData helper.
//
// Coverage per Plan 05-09 Task 2 spec:
//   - UUID-validation cases (CR-PR3-#23 pattern: missing/non-UUID/whitespace/malformed)
//   - Happy path: valid policyId + x-forwarded-for → orchestrator called → revalidatePath
//     called twice → returns { ok: true, ackedAt }
//   - No x-forwarded-for: ipAddress=null (D-05 NULL fallback)
//   - x-forwarded-for multi-hop: first hop only (D-05)
//   - PolicyArchivedError → { code: 'POLICY_ARCHIVED' } + no revalidatePath
//   - PolicyNotAssignedError → { code: 'POLICY_NOT_ASSIGNED' }
//   - PolicyNotFoundError → { code: 'POLICY_NOT_FOUND' }
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state.
const recordAcknowledgmentMock = vi.fn();
vi.mock('@/lib/policies/acknowledgment', () => ({
  recordAcknowledgment: (...args: unknown[]) => recordAcknowledgmentMock(...args),
}));

const revalidateMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidateMock(p),
}));

const headersGetMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'employee' as const,
  })),
}));

import { acknowledgePolicyAction } from './actions';
import {
  PolicyArchivedError,
  PolicyNotAssignedError,
  PolicyNotFoundError,
} from '@/lib/policies/errors';

const VALID_POLICY_ID = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  recordAcknowledgmentMock.mockReset();
  revalidateMock.mockClear();
  headersGetMock.mockReset();
  headersGetMock.mockReturnValue(null); // default: no x-forwarded-for
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

// CR-PR3-#23 pattern — UUID-validation cases. Without these guards, a malformed
// string would pass through to PolicyIdSchema.parse, reach the orchestrator with
// a brand mismatch, and produce a misleading 500. These pin the typed-INVALID_PAYLOAD
// reject path so a future refactor that loosens the schema fails loudly.
describe('acknowledgePolicyAction policyId validation (CR-PR3-#23 pattern)', () => {
  const cases = [
    { label: 'missing policyId field', input: {} as Record<string, string> },
    { label: 'non-UUID string ("p1")', input: { policyId: 'p1' } },
    { label: 'empty-after-trim ("   ")', input: { policyId: '   ' } },
    {
      label: 'malformed UUID (invalid char)',
      input: { policyId: '00000000-0000-4000-8000-00000000000G' },
    },
  ] as const;

  for (const c of cases) {
    it(`returns INVALID_PAYLOAD on ${c.label} — orchestrator NOT called, revalidatePath NOT called`, async () => {
      const result = await acknowledgePolicyAction(undefined, fd(c.input));
      expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
      expect(recordAcknowledgmentMock).not.toHaveBeenCalled();
      expect(revalidateMock).not.toHaveBeenCalled();
    });
  }
});

describe('acknowledgePolicyAction happy path (D-05 + D-10c)', () => {
  it('returns { ok: true, ackedAt } + revalidatePath fires twice on valid policyId', async () => {
    headersGetMock.mockReturnValue('1.2.3.4');
    const ackedAt = '2026-05-24T00:00:00.000Z';
    recordAcknowledgmentMock.mockResolvedValueOnce({ ackedAt });

    const result = await acknowledgePolicyAction(
      undefined,
      fd({ policyId: VALID_POLICY_ID }),
    );

    expect(result).toEqual({ ok: true, ackedAt });
    expect(recordAcknowledgmentMock).toHaveBeenCalledTimes(1);
    expect(recordAcknowledgmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }),
      VALID_POLICY_ID,
      '1.2.3.4', // x-forwarded-for first hop
    );
    // D-10c — revalidatePath fires for both /my-policies and /my-policies/[id].
    expect(revalidateMock).toHaveBeenCalledTimes(2);
    expect(revalidateMock).toHaveBeenCalledWith('/my-policies');
    expect(revalidateMock).toHaveBeenCalledWith(`/my-policies/${VALID_POLICY_ID}`);
  });

  it('passes ipAddress=null when x-forwarded-for header is absent (D-05 NULL fallback)', async () => {
    headersGetMock.mockReturnValue(null);
    recordAcknowledgmentMock.mockResolvedValueOnce({
      ackedAt: '2026-05-24T00:00:00.000Z',
    });

    await acknowledgePolicyAction(undefined, fd({ policyId: VALID_POLICY_ID }));

    expect(recordAcknowledgmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1' }),
      VALID_POLICY_ID,
      null,
    );
  });

  it('parses x-forwarded-for multi-hop and passes ONLY the first hop (D-05)', async () => {
    headersGetMock.mockReturnValue('1.1.1.1, 2.2.2.2, 3.3.3.3');
    recordAcknowledgmentMock.mockResolvedValueOnce({
      ackedAt: '2026-05-24T00:00:00.000Z',
    });

    await acknowledgePolicyAction(undefined, fd({ policyId: VALID_POLICY_ID }));

    expect(recordAcknowledgmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1' }),
      VALID_POLICY_ID,
      '1.1.1.1', // first hop only per D-05
    );
  });

  it('trims whitespace around the first x-forwarded-for hop (D-05)', async () => {
    headersGetMock.mockReturnValue('  192.168.1.1  ,  10.0.0.1');
    recordAcknowledgmentMock.mockResolvedValueOnce({
      ackedAt: '2026-05-24T00:00:00.000Z',
    });

    await acknowledgePolicyAction(undefined, fd({ policyId: VALID_POLICY_ID }));

    expect(recordAcknowledgmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1' }),
      VALID_POLICY_ID,
      '192.168.1.1',
    );
  });
});

describe('acknowledgePolicyAction typed-error mapping (D-07 + D-08 + D-30)', () => {
  it('PolicyArchivedError → { ok: false, code: POLICY_ARCHIVED } + revalidatePath NOT called', async () => {
    headersGetMock.mockReturnValue(null);
    recordAcknowledgmentMock.mockRejectedValueOnce(new PolicyArchivedError(VALID_POLICY_ID));

    const result = await acknowledgePolicyAction(
      undefined,
      fd({ policyId: VALID_POLICY_ID }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('POLICY_ARCHIVED');
      expect(result.error).toContain('archived');
    }
    // No revalidation on error path.
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('PolicyNotAssignedError → { ok: false, code: POLICY_NOT_ASSIGNED }', async () => {
    headersGetMock.mockReturnValue(null);
    recordAcknowledgmentMock.mockRejectedValueOnce(
      new PolicyNotAssignedError(VALID_POLICY_ID),
    );

    const result = await acknowledgePolicyAction(
      undefined,
      fd({ policyId: VALID_POLICY_ID }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('POLICY_NOT_ASSIGNED');
      expect(result.error).toContain('no longer assigned');
    }
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('PolicyNotFoundError → { ok: false, code: POLICY_NOT_FOUND }', async () => {
    headersGetMock.mockReturnValue(null);
    recordAcknowledgmentMock.mockRejectedValueOnce(new PolicyNotFoundError(VALID_POLICY_ID));

    const result = await acknowledgePolicyAction(
      undefined,
      fd({ policyId: VALID_POLICY_ID }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('POLICY_NOT_FOUND');
      expect(result.error).toContain('not found');
    }
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('bubbles unexpected errors past the action (framework error boundary handles them)', async () => {
    headersGetMock.mockReturnValue(null);
    recordAcknowledgmentMock.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(
      acknowledgePolicyAction(undefined, fd({ policyId: VALID_POLICY_ID })),
    ).rejects.toThrow('DB connection lost');
  });
});
