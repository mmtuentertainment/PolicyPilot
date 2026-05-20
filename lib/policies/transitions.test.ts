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

// txUpdateMock is captured by reference so every test can assert on it
// AND so the mocked withOrgScope can hand the same `tx` to every callback.
const txUpdateMock = vi.fn(() => ({
  set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
}));
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

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'admin' as const,
  }),
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
vi.mock('@/lib/db/repositories/workflow_stages', () => ({
  WorkflowStages: {
    recordSubmission: (...args: unknown[]) => wfSubmitMock(...args),
  },
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
  archive,
  restore,
} from './transitions';
import { IllegalTransitionError } from './state-machine';

beforeEach(() => {
  findByIdMock.mockReset();
  updateDraftMock.mockReset();
  pvCreateMock.mockReset();
  wfSubmitMock.mockReset();
  txUpdateMock.mockClear();
});

describe('publish (REQ-policy-lifecycle SC#2)', () => {
  it('throws "Policy not found" when findById is empty', async () => {
    findByIdMock.mockResolvedValueOnce([]);
    await expect(publish('p1')).rejects.toThrow('Policy not found');
  });

  it('throws IllegalTransitionError on archived → published', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(publish('p1')).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('creates a policy_versions snapshot of currentVersion before flipping status (draft → published)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 2, contentJson: { type: 'doc' } },
    ]);
    await publish('p1');
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
    await expect(publish('p1')).resolves.toBeUndefined();
  });
});

describe('editPublished (REQ-policy-lifecycle SC#3)', () => {
  it('throws IllegalTransitionError when status is not published', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(editPublished('p1', { type: 'doc' })).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });

  it('snapshots prior published content + resets status + bumps version', async () => {
    const priorContent = { type: 'doc', content: [{ type: 'paragraph' }] };
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'published', currentVersion: 3, contentJson: priorContent },
    ]);
    const newContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }],
    };
    await editPublished('p1', newContent, 'fixed typo');

    // 1. PolicyVersions.create called with the OLD content + OLD version number
    expect(pvCreateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        policyId: 'p1',
        versionNumber: 3,
        contentJson: priorContent,
        createdBy: 'user_1',
        changeSummary: 'fixed typo',
      }),
    );
    // 2. tx.update called (status='draft' + content overwrite + version bump)
    expect(txUpdateMock).toHaveBeenCalled();
  });
});

describe('submitForReview', () => {
  it('throws on archived → under_review', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(submitForReview('p1', null)).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });

  it('writes WorkflowStages.recordSubmission AND flips status to under_review on draft → under_review', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await submitForReview('p1', null);
    expect(wfSubmitMock).toHaveBeenCalledWith(expect.anything(), 'p1', null);
    expect(txUpdateMock).toHaveBeenCalled();
  });
});

describe('reject', () => {
  it('flips under_review → draft', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: {} },
    ]);
    await expect(reject('p1')).resolves.toBeUndefined();
    expect(txUpdateMock).toHaveBeenCalled();
  });

  it('throws on draft → draft (illegal same-state)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(reject('p1')).rejects.toBeInstanceOf(IllegalTransitionError);
  });
});

describe('archive + restore', () => {
  it('archive flips published → archived', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'published', currentVersion: 1, contentJson: {} },
    ]);
    await expect(archive('p1')).resolves.toBeUndefined();
  });

  it('archive throws on draft → archived (illegal)', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'draft', currentVersion: 1, contentJson: {} },
    ]);
    await expect(archive('p1')).rejects.toBeInstanceOf(IllegalTransitionError);
  });

  it('restore flips archived → draft', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'archived', currentVersion: 1, contentJson: {} },
    ]);
    await expect(restore('p1')).resolves.toBeUndefined();
  });
});

describe('approve', () => {
  it('approve flips under_review → published AND snapshots version', async () => {
    findByIdMock.mockResolvedValueOnce([
      { id: 'p1', status: 'under_review', currentVersion: 1, contentJson: { type: 'doc' } },
    ]);
    await expect(approve('p1')).resolves.toBeUndefined();
    expect(pvCreateMock).toHaveBeenCalled();
  });
});
