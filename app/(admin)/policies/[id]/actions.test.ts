// app/(admin)/policies/[id]/actions.test.ts — Plan 03-07 Task 3.
//
// Behavioral contract for the typed-error return paths of the transition
// Server Actions. Mocks the orchestrators (lib/policies/transitions) +
// next/cache + the auth/scope/repository surface so the tests stay pure
// unit tests (no DB / no Clerk / no Next.js runtime).
//
// Coverage (per plan body <behavior>):
//   publishAction:
//     - resolves: returns { ok: true } AND revalidatePath fires 3 times
//     - IllegalTransitionError: returns { ok: false, error } with the
//       message from the state-machine (includes 'archived' + 'published')
//     - unexpected error: bubbles up (rethrows past the action)
//   editPublishedAction:
//     - invalid JSON: returns { ok: false, error: 'Invalid edit payload.' }
//     - IllegalTransitionError after a valid payload: returns ok=false
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state — captured by reference so the vi.mock factories
// can dispatch to them and beforeEach can reset them.
const publishMock = vi.fn();
const editPublishedMock = vi.fn();

vi.mock('@/lib/policies/transitions', () => ({
  submitForReview: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  publish: (...args: unknown[]) => publishMock(...args),
  archive: vi.fn(),
  restore: vi.fn(),
  editPublished: (...args: unknown[]) => editPublishedMock(...args),
}));

const revalidateMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidateMock(p),
}));

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    role: 'admin' as const,
  })),
}));

vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (
    _ctx: unknown,
    fn: (s: {
      orgId: string;
      userId: string;
      role: 'admin' | 'reviewer' | 'employee';
      tx: Record<string, unknown>;
    }) => Promise<unknown>,
  ) =>
    fn({
      orgId: 'org_1',
      userId: 'user_1',
      role: 'admin',
      tx: {},
    }),
}));

vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: { updateDraft: vi.fn(async () => []) },
}));

import { IllegalTransitionError } from '@/lib/policies/state-machine';
import { publishAction, editPublishedAction } from './actions';

beforeEach(() => {
  publishMock.mockReset();
  editPublishedMock.mockReset();
  revalidateMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe('publishAction', () => {
  it('returns { ok: true } and revalidates 3 paths when publish resolves', async () => {
    publishMock.mockResolvedValueOnce(undefined);
    const result = await publishAction(undefined, fd({ policyId: 'p1' }));
    expect(result).toEqual({ ok: true });
    expect(revalidateMock).toHaveBeenCalledWith('/policies');
    expect(revalidateMock).toHaveBeenCalledWith('/policies/p1');
    expect(revalidateMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidateMock).toHaveBeenCalledTimes(3);
  });

  it('returns ActionState { ok: false, error } when IllegalTransitionError is thrown', async () => {
    publishMock.mockRejectedValueOnce(
      new IllegalTransitionError('archived', 'published'),
    );
    const result = await publishAction(undefined, fd({ policyId: 'p1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('archived');
      expect(result.error).toContain('published');
    }
    // No revalidation on a rejected transition.
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('bubbles unexpected errors past the action (framework error boundary handles them)', async () => {
    publishMock.mockRejectedValueOnce(new Error('DB connection lost'));
    await expect(
      publishAction(undefined, fd({ policyId: 'p1' })),
    ).rejects.toThrow('DB connection lost');
  });
});

describe('editPublishedAction', () => {
  it('returns "Invalid edit payload." on malformed content_json', async () => {
    const result = await editPublishedAction(
      undefined,
      fd({ policyId: 'p1', content_json: '{not-json' }),
    );
    expect(result).toEqual({ ok: false, error: 'Invalid edit payload.' });
    // editPublished orchestrator must NOT have been invoked on a Zod fail.
    expect(editPublishedMock).not.toHaveBeenCalled();
  });

  it('returns IllegalTransitionError message on rejected orchestrator', async () => {
    editPublishedMock.mockRejectedValueOnce(
      new IllegalTransitionError('draft', 'draft'),
    );
    const result = await editPublishedAction(
      undefined,
      fd({
        policyId: 'p1',
        content_json: JSON.stringify({ type: 'doc' }),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // IllegalTransitionError message format includes both from + to.
      expect(result.error).toContain('draft');
    }
  });
});
