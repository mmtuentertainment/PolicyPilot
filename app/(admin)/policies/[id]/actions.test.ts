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
const submitForReviewMock = vi.fn();

vi.mock('@/lib/policies/transitions', () => ({
  submitForReview: (...args: unknown[]) => submitForReviewMock(...args),
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
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'admin' as const,
  })),
}));

vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (
    _ctx: unknown,
    fn: (s: {
      orgId: string;
      userId: string;
      clerkOrgId: string;
      clerkUserId: string;
      role: 'admin' | 'reviewer' | 'employee';
      tx: Record<string, unknown>;
    }) => Promise<unknown>,
  ) =>
    fn({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'admin',
      tx: {},
    }),
}));

const updateDraftMock = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: { updateDraft: (...args: unknown[]) => updateDraftMock(...args) },
}));

import { IllegalTransitionError } from '@/lib/policies/state-machine';
import {
  publishAction,
  editPublishedAction,
  submitForReviewAction,
  updateDraftAction,
} from './actions';

beforeEach(() => {
  publishMock.mockReset();
  editPublishedMock.mockReset();
  submitForReviewMock.mockReset();
  updateDraftMock.mockReset();
  updateDraftMock.mockImplementation(async () => []);
  revalidateMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

// CR-PR3-postreview (pr-test-analyzer criticality 9) — lock in the
// UUID-only validation contract from CR-PR3-#23. Non-UUID strings used
// to pass `id.length > 0` and reach `where(eq(policies.id, ?))` which
// triggered Postgres 22P02 → 500. These tests pin the typed-ActionState
// reject path so a future refactor that loosens the schema or drops the
// `if (policyId === null) return INVALID_PAYLOAD` guard fails loudly.
describe('policyId UUID validation (CR-PR3-#23)', () => {
  const cases = [
    { label: 'missing policyId field', input: {} as Record<string, string> },
    { label: 'non-UUID string ("p1")', input: { policyId: 'p1' } },
    { label: 'empty-after-trim ("   ")', input: { policyId: '   ' } },
    { label: 'malformed UUID (invalid char)', input: { policyId: '00000000-0000-4000-8000-00000000000G' } },
  ] as const;
  for (const c of cases) {
    it(`publishAction returns INVALID_PAYLOAD on ${c.label}`, async () => {
      const result = await publishAction(undefined, fd(c.input));
      expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
      expect(publishMock).not.toHaveBeenCalled();
      expect(revalidateMock).not.toHaveBeenCalled();
    });
  }

  it('editPublishedAction returns "Invalid edit payload." on non-UUID policyId', async () => {
    const result = await editPublishedAction(
      undefined,
      fd({ policyId: 'p1', content_json: JSON.stringify({ type: 'doc' }) }),
    );
    expect(result).toEqual({ ok: false, error: 'Invalid edit payload.' });
    expect(editPublishedMock).not.toHaveBeenCalled();
  });
});

describe('publishAction', () => {
  it('returns { ok: true } and revalidates 3 paths when publish resolves', async () => {
    publishMock.mockResolvedValueOnce(undefined);
    const result = await publishAction(undefined, fd({ policyId: '00000000-0000-4000-8000-000000000001' }));
    expect(result).toEqual({ ok: true });
    expect(revalidateMock).toHaveBeenCalledWith('/policies');
    expect(revalidateMock).toHaveBeenCalledWith('/policies/00000000-0000-4000-8000-000000000001');
    expect(revalidateMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidateMock).toHaveBeenCalledTimes(3);
  });

  it('returns ActionState { ok: false, error } when IllegalTransitionError is thrown', async () => {
    publishMock.mockRejectedValueOnce(
      new IllegalTransitionError('archived', 'published'),
    );
    const result = await publishAction(undefined, fd({ policyId: '00000000-0000-4000-8000-000000000001' }));
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
      publishAction(undefined, fd({ policyId: '00000000-0000-4000-8000-000000000001' })),
    ).rejects.toThrow('DB connection lost');
  });
});

describe('editPublishedAction', () => {
  it('returns "Invalid edit payload." on malformed content_json', async () => {
    const result = await editPublishedAction(
      undefined,
      fd({ policyId: '00000000-0000-4000-8000-000000000001', content_json: '{not-json' }),
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
        policyId: '00000000-0000-4000-8000-000000000001',
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

// CR-PR3-postreview-v3 — reviewerId is a Postgres `uuid` column on users.id.
// Before this guard, a malformed string passed through to submitForReview →
// WorkflowStages insert → 22P02 → unhandled 500. These tests pin the typed
// reject path AND lock in the "empty string / missing field = null reviewer"
// passthrough so legitimate "submit without assigning a reviewer" still works.
describe('submitForReviewAction reviewerId validation', () => {
  const POLICY_ID = '00000000-0000-4000-8000-000000000001';

  it('returns INVALID_PAYLOAD on non-UUID reviewerId', async () => {
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID, reviewerId: 'not-a-uuid' }),
    );
    expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
    expect(submitForReviewMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('returns INVALID_PAYLOAD on UUID with one bad character', async () => {
    const result = await submitForReviewAction(
      undefined,
      fd({
        policyId: POLICY_ID,
        reviewerId: '00000000-0000-4000-8000-00000000000G',
      }),
    );
    expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
    expect(submitForReviewMock).not.toHaveBeenCalled();
  });

  it('passes null reviewerId when field is missing', async () => {
    submitForReviewMock.mockResolvedValueOnce(undefined);
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID }),
    );
    expect(result).toEqual({ ok: true });
    expect(submitForReviewMock).toHaveBeenCalledWith(POLICY_ID, null);
  });

  it('passes null reviewerId when field is whitespace-only', async () => {
    submitForReviewMock.mockResolvedValueOnce(undefined);
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID, reviewerId: '   ' }),
    );
    expect(result).toEqual({ ok: true });
    expect(submitForReviewMock).toHaveBeenCalledWith(POLICY_ID, null);
  });

  it('passes through a valid UUID reviewerId', async () => {
    submitForReviewMock.mockResolvedValueOnce(undefined);
    const reviewerId = '11111111-1111-4111-8111-111111111111';
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID, reviewerId }),
    );
    expect(result).toEqual({ ok: true });
    expect(submitForReviewMock).toHaveBeenCalledWith(POLICY_ID, reviewerId);
  });

  // CR-PR3-postreview-v4 — divergence-lock additions surfaced by the
  // pre-merge pr-test-analyzer review against `bd25409..a9ba7f5`. Both
  // pin contracts that the existing v3 cases didn't exercise.
  it('accepts uppercase UUID reviewerId (RFC 4122 case-insensitive)', async () => {
    // Zod's .uuid() accepts uppercase hex per RFC 4122 §3 — a future
    // swap to a stricter regex (e.g. `[0-9a-f]{8}-...`) would silently
    // reject valid pasted UUIDs in production. This test catches that.
    submitForReviewMock.mockResolvedValueOnce(undefined);
    const reviewerId = 'ABCDEF01-2345-4678-8901-ABCDEF234567';
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID, reviewerId }),
    );
    expect(result).toEqual({ ok: true });
    expect(submitForReviewMock).toHaveBeenCalledWith(POLICY_ID, reviewerId);
  });

  it('trims leading/trailing whitespace around a valid UUID reviewerId', async () => {
    // Production trims via String(formData.get('reviewerId') ?? '').trim()
    // in actions.ts. A refactor that drops .trim() (e.g. switching to
    // the raw FormData value for "performance") would silently reject
    // forms that paste a UUID with surrounding whitespace — exactly
    // the kind of off-by-one regression that's hard to spot in review.
    submitForReviewMock.mockResolvedValueOnce(undefined);
    const reviewerId = '22222222-2222-4222-8222-222222222222';
    const result = await submitForReviewAction(
      undefined,
      fd({ policyId: POLICY_ID, reviewerId: `  ${reviewerId}  ` }),
    );
    expect(result).toEqual({ ok: true });
    // Orchestrator must receive the trimmed value, not the padded form value.
    expect(submitForReviewMock).toHaveBeenCalledWith(POLICY_ID, reviewerId);
  });
});

// CR-PR3-postreview-v3 — without this guard, a form with only policyId (no
// editable fields) would issue an empty UPDATE through Policies.updateDraft
// and surface a misleading generic save-failed error. Pin the typed reject
// path AND verify the repo is NOT called when the patch is empty.
describe('updateDraftAction empty-patch rejection', () => {
  const POLICY_ID = '00000000-0000-4000-8000-000000000001';

  it('returns "No changes to save." when no editable fields are present', async () => {
    const result = await updateDraftAction(
      undefined,
      fd({ policyId: POLICY_ID }),
    );
    // CR-PR3-postreview-v4 — distinct from the Zod-schema-failure
    // string 'Invalid update payload.' (returned at line ~320 of
    // actions.ts) so logs/Sentry can distinguish "client posted a
    // malformed payload" from "user clicked save with no edits."
    expect(result).toEqual({ ok: false, error: 'No changes to save.' });
    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });

  it('still updates when at least one editable field (title) is present', async () => {
    const result = await updateDraftAction(
      undefined,
      fd({ policyId: POLICY_ID, title: 'New Title' }),
    );
    expect(result).toEqual({ ok: true });
    expect(updateDraftMock).toHaveBeenCalledTimes(1);
    // Args: (scope, policyId, patch) — assert the patch carries the field.
    const [, calledPolicyId, calledPatch] = updateDraftMock.mock.calls[0] as [
      unknown,
      string,
      Record<string, unknown>,
    ];
    expect(calledPolicyId).toBe(POLICY_ID);
    expect(calledPatch).toEqual({ title: 'New Title' });
  });
});
