// app/api/ai/consistency/route.test.ts — Plan 04-10 GREEN.
// SP-4 tier-bound 403 + Growth+ Batch submit + D-06 SUCCESS-ONLY semantic.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TierLimitExceededError } from '@/lib/stripe/errors';

// ============================================================================
// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
// ============================================================================
const mockBatchCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(),
      batches: {
        create: mockBatchCreate,
        retrieve: vi.fn(),
        results: vi.fn(),
      },
    },
  }),
}));

// ============================================================================
// Mock auth context: getOrgContext returns admin by default; tests can override.
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Mock the tier-limit gate. By default allows; Starter test overrides.
// ============================================================================
const mockRequireTierLimit = vi.fn();
vi.mock('@/lib/stripe/products', () => ({
  requireTierLimit: (...args: unknown[]) => mockRequireTierLimit(...args),
}));

// ============================================================================
// Mock the Policies repository: listPublishedForOrg.
// ============================================================================
const mockListPublishedForOrg = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    listPublishedForOrg: (...args: unknown[]) => mockListPublishedForOrg(...args),
  },
}));

// ============================================================================
// Mock the BatchJobs + AiGenerations repositories. Track both — Test 3 verifies
// that ONLY BatchJobs.insert is called at submission time (D-06 SUCCESS-ONLY).
// ============================================================================
const mockBatchJobsInsert = vi.fn();
vi.mock('@/lib/db/repositories/batch_jobs', () => ({
  BatchJobs: {
    insert: (...args: unknown[]) => mockBatchJobsInsert(...args),
  },
}));

const mockAiGenerationsInsert = vi.fn();
vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: {
    insert: (...args: unknown[]) => mockAiGenerationsInsert(...args),
  },
}));

// ============================================================================
// withOrgScope passes a stub scope to the callback (no real transaction).
// ============================================================================
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (_ctx: unknown, fn: (s: unknown) => Promise<unknown>) =>
    fn({ orgId: 'org_1', userId: 'user_1', tx: {} }),
}));

const ADMIN_CTX = {
  orgId: 'org_1',
  userId: 'user_1',
  role: 'admin' as const,
  clerkOrgId: 'org_clerk_1',
  clerkUserId: 'user_clerk_1',
};

function makeReq(): Request {
  return new Request('http://localhost/api/ai/consistency', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

function policyFixture(id: string, title: string) {
  return {
    id,
    title,
    contentJson: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: `Content of ${title}` }] },
      ],
    },
  };
}

describe('POST /api/ai/consistency — Batch API submit (SPEC R5)', () => {
  beforeEach(() => {
    mockBatchCreate.mockReset();
    mockGetOrgContext.mockReset();
    mockRequireTierLimit.mockReset();
    mockListPublishedForOrg.mockReset();
    mockBatchJobsInsert.mockReset();
    mockAiGenerationsInsert.mockReset();
    // Defaults: Growth+ admin context, tier check passes, 1 published policy.
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
    mockRequireTierLimit.mockResolvedValue(undefined);
    mockListPublishedForOrg.mockResolvedValue([
      policyFixture('policy-a', 'PTO Policy'),
    ]);
    mockBatchJobsInsert.mockResolvedValue([{ id: 'batch_job_1' }]);
  });

  it('on Growth+ org: returns 200 { batchId: <msgbatch_...> }', async () => {
    mockBatchCreate.mockResolvedValueOnce({
      id: 'msgbatch_01abc',
      type: 'message_batch',
      processing_status: 'in_progress',
    });
    const { POST } = await import('@/app/api/ai/consistency/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batchId).toBe('msgbatch_01abc');
    // batches.create called once with single-request batch.
    expect(mockBatchCreate).toHaveBeenCalledOnce();
    // BatchJobs.insert called once with the Anthropic batch ID + in_progress status.
    expect(mockBatchJobsInsert).toHaveBeenCalledOnce();
    const insertArgs = mockBatchJobsInsert.mock.calls[0]![1] as {
      anthropicBatchId: string;
      type: string;
      status: string;
    };
    expect(insertArgs.anthropicBatchId).toBe('msgbatch_01abc');
    expect(insertArgs.type).toBe('consistency');
    expect(insertArgs.status).toBe('in_progress');
  });

  it('on Starter org: returns 403 with body.error === "tier_limit_exceeded", requiredTier === "growth"', async () => {
    mockRequireTierLimit.mockRejectedValueOnce(
      new TierLimitExceededError('consistencyCheck', -1, 0, 403, 'growth'),
    );
    const { POST } = await import('@/app/api/ai/consistency/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('tier_limit_exceeded');
    expect(body.requiredTier).toBe('growth');
    expect(body.upgradeUrl).toBe('/pricing');
    // Tier overage short-circuits BEFORE any Anthropic call AND BEFORE any insert.
    expect(mockBatchCreate).not.toHaveBeenCalled();
    expect(mockBatchJobsInsert).not.toHaveBeenCalled();
    expect(mockAiGenerationsInsert).not.toHaveBeenCalled();
  });

  it('batch_jobs row INSERTED at submission (status: in_progress); NO ai_generations row yet (SUCCESS-ONLY semantic per D-06)', async () => {
    mockBatchCreate.mockResolvedValueOnce({
      id: 'msgbatch_01def',
      type: 'message_batch',
      processing_status: 'in_progress',
    });
    const { POST } = await import('@/app/api/ai/consistency/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    // BatchJobs.insert called exactly once at submission.
    expect(mockBatchJobsInsert).toHaveBeenCalledOnce();
    // SUCCESS-ONLY semantic (D-06): NO ai_generations row at submission —
    // the poll endpoint writes it on translated status === 'completed'.
    expect(mockAiGenerationsInsert).not.toHaveBeenCalled();
  });
});
