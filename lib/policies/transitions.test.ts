// lib/policies/transitions.test.ts
// Plan 03-06 Task 1 (RED) — orchestrator behavioral contract for the 7
// server-only transition orchestrators (D-03 + D-04 + L-05). The
// implementation file `lib/policies/transitions.ts` does NOT yet exist at
// the time this test file is committed — module-not-found is the expected
// RED state.
//
// Coverage matrix:
//   - publish (REQ-policy-lifecycle SC#2):
//       * "Policy not found" when findById is empty
//       * IllegalTransitionError on archived → published
//       * D-04 snapshot semantics: PolicyVersions.create called with the
//         currentVersion + contentJson BEFORE status flip; tx.update fires
//       * under_review → published is also legal
//   - editPublished (REQ-policy-lifecycle SC#3 + L-05 / ADR-018-spirit):
//       * IllegalTransitionError when status !== 'published'
//       * Snapshots PRIOR content + resets status='draft' + bumps version
//   - submitForReview: WorkflowStages.recordSubmission + status flip
//   - reject: under_review → draft path; same-state forbidden
//   - archive + restore: published → archived legal; draft → archived illegal;
//     archived → draft legal
//   - approve: under_review → published with snapshot
//
// Mirrors CONTEXT.md `<specifics>` § 3 + § 4, 03-PATTERNS.md
// `lib/policies/transitions.ts` section, 03-RESEARCH.md Pattern 2, and the
// L-05 invariant carried forward from Plan 03-04.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

// txUpdateMock + txSetMock are captured by reference so every test can
// assert on them AND so the mocked withOrgScope can hand the same `tx` to
// every callback. txSetMock is lifted from inside the update-factory to
// the module scope (03-G3 T5) so tests can assert the actual values
// passed to .set(...) — needed to lock in the restore() currentVersion
// bump from 03-G3 T1.
const txSetMock = vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) }));
const txUpdateMock = vi.fn(() => ({ set: txSetMock }));
const txMock = { update: txUpdateMock };

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
      role: 'admin',
      tx: txMock,
    }),
}));

const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: (...args: unknown[]) => mockGetOrgContext(...args),
}));

const findByIdMock = vi.fn();
const updateDraftMock = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    findById: (...args: unknown[]) => findByIdMock(...args),
    updateDraft: (...args: unknown[]) => updateDraftMock(...args),
  },
}));

const pvCreateMock = vi.fn();
vi.mock('@/lib/db/repositories/policy_versions', () => ({
  PolicyVersions: {
    create: (...args: unknown[]) => pvCreateMock(...args),
  },
}));

const wfSubmitMock = vi.fn();
const wfRecordDecisionMock = vi.fn();
const wfSupersedePendingMock = vi.fn();
const wfListForPolicyMock = vi.fn();
vi.mock('@/lib/db/repositories/workflow_stages', () => ({
  WorkflowStages: {
    recordSubmission: (...args: unknown[]) => wfSubmitMock(...args),
    // Phase 9 D-09-01 — wired by recordReviewDecision + the publish() gate.
    recordDecision: (...args: unknown[]) => wfRecordDecisionMock(...args),
    // Phase 9 FIX-B — submitForReview supersedes stale pending stages first.
    supersedePending: (...args: unknown[]) => wfSupersedePendingMock(...args),
    listForPolicy: (...args: unknown[]) => wfListForPolicyMock(...args),
  },
}));

// Phase 9 D-09-01 — immutable review-decision ledger repo (recordReviewDecision).
const reviewRecordMock = vi.fn();
vi.mock('@/lib/db/repositories/review_decisions', () => ({
  ReviewDecisions: {
    record: (...args: unknown[]) => reviewRecordMock(...args),
  },
}));

// Phase 9 D-09-01 — publish() reads the approval-workflow entitlement via
// checkTierLimit. Default mock returns allowed:false (Starter) so EVERY existing
// publish test skips the gate and behaves exactly as before; the Growth+ gate
// tests below override with allowed:true per case.
const checkTierLimitMock = vi.fn();
vi.mock('@/lib/stripe/products', () => ({
  checkTierLimit: (...args: unknown[]) => checkTierLimitMock(...args),
}));

// Plan 04-11 D-19 — mock the post-commit summary hook. publish() invokes
// generateSummaryForPolicy AFTER the withOrgScope state-transition commits.
// Tests in the SP-3 describe block configure mockResolvedValueOnce /
// mockRejectedValueOnce per case to exercise the graceful-degrade path.
const generateSummaryForPolicyMock = vi.fn();
vi.mock('@/lib/ai/summary', () => ({
  generateSummaryForPolicy: (...args: unknown[]) => generateSummaryForPolicyMock(...args),
}));

// Stub the schema barrel so transitions.ts can `import { policies } from
// '@/lib/db/schema'` without pulling Drizzle's real table object (which
// would import postgres at module load and break vitest's jsdom env).
vi.mock('@/lib/db/schema', () => ({
  policies: { __stub: 'policies' } as unknown as Record<string, never>,
}));

import {
  publish,
  editPublished,
  submitForReview,
  approve,
  reject,
  recordReviewDecision,
  archive,
  restore,
} from './transitions';
import { IllegalTransitionError } from './state-machine';
import { WorkflowIncompleteError, StageNotActionableError } from './errors';
import type { PolicyId } from './types';

// ADR-028 — orchestrator signatures now require `policyId: PolicyId` (the
// branded nominal type from `@/lib/policies/types`). Tests bypass the
// runtime UUID validation (these are pure-orchestrator unit tests with
// mocked repositories — `'p1'` is a fixture identifier, not a real UUID),
// so we cast through the brand at the fixture boundary. The cast is safe
// because the mocks never call the runtime validator; production callers
// MUST go through `policyIdFromString(...)` or `PolicyIdSchema.parse(...)`.
const POLICY_ID_FIXTURE = 'p1' as unknown as PolicyId;

beforeEach(() => {
  mockGetOrgContext.mockReset();
  mockGetOrgContext.mockResolvedValue({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'admin' as const,
  });
  findByIdMock.mockReset();
  updateDraftMock.mockReset();
  pvCreateMock.mockReset();
  wfSubmitMock.mockReset();
  wfRecordDecisionMock.mockReset();
  // FIX-A — recordReviewDecision now asserts recordDecision hit >=1 row before the
  // ledger write; default to a non-empty (success) result so the existing
  // happy-path tests pass. The 0-row case is exercised explicitly below.
  wfRecordDecisionMock.mockResolvedValue([{ id: 's1' }]);
  wfSupersedePendingMock.mockReset();
  wfSupersedePendingMock.mockResolvedValue([]);
  wfListForPolicyMock.mockReset();
  wfListForPolicyMock.mockResolvedValue([]);
  reviewRecordMock.mockReset();
  reviewRecordMock.mockResolvedValue([]);
  checkTierLimitMock.mockReset();
  // Default: Starter (no approval-workflow entitlement) → publish() gate skipped.
  checkTierLimitMock.mockResolvedValue({ allowed: false, limit: -1, current: 0 });
  generateSummaryForPolicyMock.mockReset();
  // Default — summary helper resolves cleanly so the Phase-3 publish() tests
  // (which don't care about the post-commit hook) stay green. Individual
  // SP-3 tests override with mockRejectedValueOnce / mockResolvedValueOnce.
  generateSummaryForPolicyMock.mockResolvedValue(undefined);
  txUpdateMock.mockClear();
  txSetMock.mockClear();
});

describe('admin role gate', () => {
  it('rejects before transition reads or writes when caller is not admin', async () => {
    mockGetOrgContext.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'employee' as const,
    });

    await expect(publish(POLICY_ID_FIXTURE)).rejects.toThrow('admin role required');
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(pvCreateMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
  });
});

describe('publish (REQ-policy-lifecycle SC#2)', () => {
  it('throws "Policy not found" when findById is empty', async () => {
    findByIdMock.mockResolvedValueOnce([]);
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toThrow('Policy not found');
  });

  it('throws IllegalTransitionError on archived → published', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('creates a policy_versions snapshot of currentVersion before flipping status (draft → published)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 2, contentJson: { type: 'doc' } },
    ]);
    await publish(POLICY_ID_FIXTURE);
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', userId: 'user_1', role: 'admin' }),
      expect.objectContaining({
        policyId: 'p1',
        versionNumber: 2,
        contentJson: { type: 'doc' },
        createdBy: 'user_1',
      }),
    );
    expect(txUpdateMock).toHaveBeenCalled(); // status flip happened
  });

  it('allows under_review → published', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: {} },
    ]);
    await expect(publish(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
  });
});

describe('editPublished (REQ-policy-lifecycle SC#3)', () => {
  it('throws IllegalTransitionError when status is not published', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(editPublished(POLICY_ID_FIXTURE, { type: 'doc' })).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });

  it('does NOT create a PolicyVersions snapshot — just resets status + bumps version (DUP-VN-2 fix afb7693)', async () => {
    // Post-DUP-VN-2 (commit afb7693): editPublished no longer writes a snapshot row.
    // publish() (line 156-176) already wrote the policy_versions row with
    // versionNumber=currentVersion when this policy was originally published.
    // Re-inserting that same (policy_id, version_number) pair would 23505 against
    // the 03-G3 T2 UNIQUE constraint. editPublished's job is now just to flip
    // status='draft' + bump currentVersion + overwrite contentJson; the next
    // publish() will write the new vN+1 snapshot row.
    const priorContent = { type: 'doc', content: [{ type: 'paragraph' }] };
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'published', currentVersion: 3, contentJson: priorContent },
    ]);
    const newContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }],
    };
    await editPublished(POLICY_ID_FIXTURE, newContent, 'fixed typo');

    // 1. PolicyVersions.create NOT called — that was the DUP-VN-2 bug.
    expect(pvCreateMock).not.toHaveBeenCalled();
    // 2. tx.update called (status='draft' + content overwrite + version bump
    //    from 3 to 4 — the next publish() will write that v4 row).
    expect(txUpdateMock).toHaveBeenCalled();
  });
});

describe('submitForReview', () => {
  it('throws on archived → under_review', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(submitForReview(POLICY_ID_FIXTURE, null)).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });

  it('writes WorkflowStages.recordSubmission AND flips status to under_review on draft → under_review', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await submitForReview(POLICY_ID_FIXTURE, null);
    expect(wfSubmitMock).toHaveBeenCalledWith(expect.anything(), 'p1', null);
    expect(txUpdateMock).toHaveBeenCalled();
  });

  it('supersedes any stale pending stage before recording the new submission (FIX-B)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await submitForReview(POLICY_ID_FIXTURE, null);
    // supersedePending clears any stale pending stage (e.g. from a prior
    // admin-reject cycle) and is bound to this policy — guaranteeing the publish
    // gate's pending count can never wedge above the current cycle.
    expect(wfSupersedePendingMock).toHaveBeenCalledWith(expect.anything(), POLICY_ID_FIXTURE);
    expect(wfSubmitMock).toHaveBeenCalledWith(expect.anything(), 'p1', null);
  });
});

describe('reject', () => {
  it('flips under_review → draft', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: {} },
    ]);
    await expect(reject(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
    expect(txUpdateMock).toHaveBeenCalled();
  });

  it('throws on draft → draft (illegal same-state)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(reject(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(IllegalTransitionError);
  });
});

describe('archive + restore', () => {
  it('archive flips published → archived', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'published', currentVersion: 1, contentJson: {} },
    ]);
    await expect(archive(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
  });

  it('archive throws on draft → archived (illegal)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(archive(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('restore flips archived → draft', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(restore(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
  });

  // 03-G3 T5 — close DUP-VN: restore() now bumps currentVersion so the
  // next publish writes v(N+1) instead of re-snapshotting at vN. See
  // .planning/debug/duplicate-policy-version.md for full diagnose.
  it('restore bumps currentVersion by 1 (T1 closure of DUP-VN)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 3, contentJson: {} },
    ]);
    await restore(POLICY_ID_FIXTURE);
    expect(txSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', currentVersion: 4 }),
    );
  });

  it('archive → restore → publish writes v(N+1), NOT duplicate vN (regression: DUP-VN)', async () => {
    // Step 1: archive a published v1
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'published', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await archive(POLICY_ID_FIXTURE);

    // Step 2: restore → must bump currentVersion to 2
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await restore(POLICY_ID_FIXTURE);
    expect(txSetMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'draft', currentVersion: 2 }),
    );

    // Step 3: publish the restored draft → snapshot MUST be v2, not v1
    // (the restore bump from step 2 is what makes this happen).
    pvCreateMock.mockClear();
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 2, contentJson: { type: 'doc' } },
    ]);
    await publish(POLICY_ID_FIXTURE);
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId: 'p1', versionNumber: 2 }),
    );
  });
});

describe('approve', () => {
  it('approve flips under_review → published AND snapshots version', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await expect(approve(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
    expect(pvCreateMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 4 D-19 — SP-3 graceful-degrade: publish() auto-triggers TL;DR but
// summary failures MUST NOT propagate. The state transition stays committed.
// Plan 04-03 Wave-0 RED stubs — Plan 04-11 modifies lib/policies/transitions.ts
// to add the post-commit generateSummaryForPolicy call wrapped in try/catch
// AND adds a vi.mock for @/lib/ai/summary at the top of this file.
// ---------------------------------------------------------------------------
describe('publish — D-19 post-commit summary graceful-degrade (SP-3, SPEC R3)', () => {
  it('on Anthropic.APIError: publish() does NOT throw; state transition stays committed', async () => {
    // Mock the state-transition prerequisite — Draft policy ready to publish.
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    // PR #15 silent-failure review: catch is now narrowed to Anthropic.APIError.
    // Use a real APIError instance so the instanceof check passes and the
    // graceful-degrade swallow path fires per D-19. The 5th arg populates
    // APIError.type (which we now log as `code` per the type-design fix).
    const apiError = new Anthropic.APIError(
      503,
      { type: 'overloaded_error' },
      'Anthropic 503',
      undefined as unknown as Headers,
      'overloaded_error',
    );
    generateSummaryForPolicyMock.mockRejectedValueOnce(apiError);
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // D-19 contract: publish() resolves cleanly even when the post-commit hook
    // throws an Anthropic.APIError (Anthropic 5xx, rate-limit, etc.).
    await expect(publish(POLICY_ID_FIXTURE)).resolves.toBeUndefined();

    // State-transition transaction committed FIRST (before the AI call):
    //   1. PolicyVersions.create captured the snapshot
    //   2. tx.update flipped status -> 'published'
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId: 'p1', versionNumber: 1 }),
    );
    expect(txSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );

    // generateSummaryForPolicy was invoked AFTER the state-transition commit
    // (graceful-degrade hook ran, then threw — publish() caught it).
    expect(generateSummaryForPolicyMock).toHaveBeenCalledOnce();

    consoleErrSpy.mockRestore();
  });

  it('on non-Anthropic Error: publish() RE-THROWS (programming bugs propagate)', async () => {
    // PR #15 silent-failure review: catch must not swallow programming bugs
    // (TypeError, ReferenceError, BootstrapError, etc.) — only Anthropic.APIError
    // is graceful-degraded per D-19. This locks the narrowing contract.
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    const programmingBug = new TypeError("Cannot read properties of undefined (reading 'foo')");
    generateSummaryForPolicyMock.mockRejectedValueOnce(programmingBug);
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Contract: publish() re-throws non-Anthropic errors so they surface in
    // monitoring. The state transition still committed before the throw.
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toThrow(programmingBug);

    // State-transition transaction DID commit before the AI call threw.
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId: 'p1', versionNumber: 1 }),
    );
    expect(txSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );

    // Sanitized non-anthropic log fires before re-throw.
    expect(consoleErrSpy).toHaveBeenCalledWith(
      '[publish] summary failed (non-anthropic, propagating)',
      expect.objectContaining({ policyId: POLICY_ID_FIXTURE }),
    );

    consoleErrSpy.mockRestore();
  });

  it('on Anthropic-success path: publish() calls generateSummaryForPolicy ONCE after state commit', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 2, contentJson: { type: 'doc' } },
    ]);
    generateSummaryForPolicyMock.mockResolvedValueOnce(undefined);

    await publish(POLICY_ID_FIXTURE);

    // Called exactly once with (policyId, ctx) per the D-19 helper signature.
    expect(generateSummaryForPolicyMock).toHaveBeenCalledOnce();
    const call = generateSummaryForPolicyMock.mock.calls[0];
    expect(call?.[0]).toBe(POLICY_ID_FIXTURE);
    // ctx is the OrgContext from getOrgContext (mocked at module scope above).
    expect(call?.[1]).toMatchObject({ orgId: 'org_1', userId: 'user_1', role: 'admin' });

    // The state-transition snapshot fired BEFORE the AI call (post-commit hook).
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId: 'p1', versionNumber: 2 }),
    );
  });

  it('logs sanitized Anthropic error shape on graceful-degrade path (D-19 + D-18 + D-36)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    // PR #15 silent-failure review: log is now sanitized to {name, status, code}
    // — never the raw error object (D-36 PII-safe; raw error.message could carry
    // policy content or API-key prefixes). The 5th arg populates APIError.type
    // which is read as `code` in the sanitized log payload.
    const apiError = new Anthropic.APIError(
      500,
      { type: 'api_error' },
      'Anthropic 500',
      undefined as unknown as Headers,
      'api_error',
    );
    generateSummaryForPolicyMock.mockRejectedValueOnce(apiError);
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await publish(POLICY_ID_FIXTURE);

    // Verify the new sanitized log shape (D-36): prefix differentiates anthropic
    // vs non-anthropic; payload carries only {name, status, code}, never raw error.
    // We check status + code (Anthropic-specific fields that prove the narrowed
    // branch fired) — the `name` field's exact value depends on Anthropic SDK
    // version (some versions override Error.name, some don't).
    expect(consoleErrSpy).toHaveBeenCalledWith(
      '[publish] summary failed (anthropic)',
      expect.objectContaining({
        policyId: POLICY_ID_FIXTURE,
        error: expect.objectContaining({ status: 500, code: 'api_error' }),
      }),
    );

    consoleErrSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Phase 9 (R-017 / D-09-01) — approval-workflow publish gate (require-submission-
// first, incl. the stale-approval fix) + the recordReviewDecision orchestrator.
// checkTierLimit is mocked per case: default allowed:false (Starter) skips the
// gate; allowed:true exercises the Growth+ paths.
// ---------------------------------------------------------------------------
describe('publish — Phase 9 approval-workflow gate (D-09-01)', () => {
  it('Starter (entitlement allowed:false) publishes a draft directly — gate skipped', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await expect(publish(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
    expect(pvCreateMock).toHaveBeenCalled();
    expect(wfListForPolicyMock).not.toHaveBeenCalled(); // gate body never entered
  });

  it('Growth+ blocks a DIRECT draft→published (require-submission-first / stale-approval fix)', async () => {
    checkTierLimitMock.mockResolvedValueOnce({ allowed: true, limit: -1, current: 0 });
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(WorkflowIncompleteError);
    // Gate fires before the snapshot/flip — nothing written.
    expect(pvCreateMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
  });

  it('Growth+ blocks under_review with a PENDING stage (cycle incomplete)', async () => {
    checkTierLimitMock.mockResolvedValueOnce({ allowed: true, limit: -1, current: 0 });
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    wfListForPolicyMock.mockResolvedValueOnce([{ id: 's1', status: 'pending' }]);
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(WorkflowIncompleteError);
    expect(pvCreateMock).not.toHaveBeenCalled();
  });

  it('Growth+ blocks under_review with ZERO approved stages', async () => {
    checkTierLimitMock.mockResolvedValueOnce({ allowed: true, limit: -1, current: 0 });
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    wfListForPolicyMock.mockResolvedValueOnce([{ id: 's1', status: 'rejected' }]);
    await expect(publish(POLICY_ID_FIXTURE)).rejects.toBeInstanceOf(WorkflowIncompleteError);
  });

  it('Growth+ ALLOWS publish from under_review with an approved, no-pending workflow', async () => {
    checkTierLimitMock.mockResolvedValueOnce({ allowed: true, limit: -1, current: 0 });
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 2, contentJson: { type: 'doc' } },
    ]);
    wfListForPolicyMock.mockResolvedValueOnce([
      { id: 's1', status: 'approved' },
      { id: 's0', status: 'rejected' }, // a prior rejected cycle does NOT block
    ]);
    await expect(publish(POLICY_ID_FIXTURE)).resolves.toBeUndefined();
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ policyId: 'p1', versionNumber: 2 }),
    );
  });
});

describe('recordReviewDecision (Phase 9, D-09-01)', () => {
  it('approve: writes the stage decision + immutable ledger row; does NOT flip policy status', async () => {
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'approved', 'lgtm'),
    ).resolves.toBeUndefined();
    expect(wfRecordDecisionMock).toHaveBeenCalledWith(
      expect.anything(),
      POLICY_ID_FIXTURE,
      's1',
      'approved',
      'lgtm',
    );
    expect(reviewRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        policyId: POLICY_ID_FIXTURE,
        stageId: 's1',
        reviewerId: 'user_1',
        decision: 'approved',
        comment: 'lgtm',
      }),
    );
    // approve does NOT transition the policy — no load, no status flip.
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
  });

  it('reject: writes decision + ledger AND returns the policy to draft (under_review → draft)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: {} },
    ]);
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'rejected'),
    ).resolves.toBeUndefined();
    expect(wfRecordDecisionMock).toHaveBeenCalledWith(
      expect.anything(),
      POLICY_ID_FIXTURE,
      's1',
      'rejected',
      undefined,
    );
    expect(reviewRecordMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: 'rejected', comment: null }),
    );
    expect(txSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' }),
    );
  });

  it('reject when the →draft transition is illegal throws IllegalTransitionError (e.g. already draft)', async () => {
    // The reject path flips status to 'draft'; draft→draft is the one illegal
    // case (archived/published/under_review → draft are all legal). A reject on
    // an already-draft policy therefore rolls back the whole tx.
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'rejected'),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('reviewer role is permitted (not only admin) — §13(d) self-approval allowed', async () => {
    mockGetOrgContext.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'reviewer' as const,
    });
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'approved'),
    ).resolves.toBeUndefined();
    expect(reviewRecordMock).toHaveBeenCalled();
  });

  it('employee role is rejected before any write', async () => {
    mockGetOrgContext.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'employee' as const,
    });
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'approved'),
    ).rejects.toThrow('reviewer or admin role required');
    expect(wfRecordDecisionMock).not.toHaveBeenCalled();
    expect(reviewRecordMock).not.toHaveBeenCalled();
  });

  it('throws StageNotActionableError when recordDecision hits no actionable pending stage — and writes NO ledger row (FIX-A)', async () => {
    // A crafted/stale (policyId, stageId) mismatch or an already-decided stage
    // makes recordDecision a 0-row update; recordReviewDecision must throw BEFORE
    // the immutable ledger insert so no misattributed row is written and no
    // sibling-policy state is changed.
    wfRecordDecisionMock.mockResolvedValueOnce([]);
    await expect(
      recordReviewDecision(POLICY_ID_FIXTURE, 's1', 'approved', 'lgtm'),
    ).rejects.toBeInstanceOf(StageNotActionableError);
    expect(reviewRecordMock).not.toHaveBeenCalled();
    expect(txUpdateMock).not.toHaveBeenCalled();
  });
});
