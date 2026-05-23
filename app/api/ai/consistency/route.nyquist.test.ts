// app/api/ai/consistency/route.nyquist.test.ts — Nyquist gap test (AC-18 SPEC R7)
//
// Gap: The existing app/api/ai/consistency/route.test.ts covers the Growth+ 200 path and
// the Starter 403 tier-limit path but has NO test for the 503 error contract on Anthropic
// Batch API failure. SPEC R7 states: all 4 AI endpoints must return 503 +
// { error: 'ai_service_unavailable', retryAfter: 30 } + Retry-After: 30 header when the
// Anthropic SDK throws, AND no ai_generations row is written.
//
// This test verifies: POST /api/ai/consistency with Anthropic batches.create throwing
// returns the correct 503 envelope, the Retry-After header, and writes no DB rows.

import { describe, expect, it, vi, beforeEach } from 'vitest';

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
// Mock auth context: admin by default.
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Tier-limit gate: passes by default (Growth+ admin).
// ============================================================================
const mockRequireTierLimit = vi.fn();
vi.mock('@/lib/stripe/products', () => ({
  requireTierLimit: (...args: unknown[]) => mockRequireTierLimit(...args),
}));

// ============================================================================
// Policies repository: listPublishedForOrg returns one policy.
// ============================================================================
const mockListPublishedForOrg = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    listPublishedForOrg: (...args: unknown[]) => mockListPublishedForOrg(...args),
  },
}));

// ============================================================================
// BatchJobs + AiGenerations: track both to assert SUCCESS-ONLY semantic on
// the Anthropic-failure path (no rows must be written when Anthropic throws).
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
// withOrgScope: passes stub scope to callback.
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

function policyFixture(id: string, title: string) {
  return {
    id,
    title,
    contentJson: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `Content of ${title}` }] }],
    },
  };
}

describe('POST /api/ai/consistency — 503 error contract on Anthropic Batch API failure (AC-18, SPEC R7)', () => {
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
    mockListPublishedForOrg.mockResolvedValue([policyFixture('policy-a', 'PTO Policy')]);
  });

  it('on Anthropic batches.create throw: returns 503 + { error: ai_service_unavailable, retryAfter: 30 } + Retry-After: 30 header + NO rows written (SPEC R7)', async () => {
    // Arrange: Anthropic Batch API throws (network error, 5xx, etc.)
    mockBatchCreate.mockRejectedValueOnce(new Error('Anthropic Batch API 500 Internal Server Error'));

    const { POST } = await import('@/app/api/ai/consistency/route');
    const req = new Request('http://localhost/api/ai/consistency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Act
    const res = await POST(req);

    // Assert: 503 status
    expect(res.status).toBe(503);

    // Assert: Retry-After header per SPEC R7
    expect(res.headers.get('Retry-After')).toBe('30');

    // Assert: body shape per SPEC R7
    const body = await res.json();
    expect(body.error).toBe('ai_service_unavailable');
    expect(body.retryAfter).toBe(30);

    // Assert: SUCCESS-ONLY semantic — no batch_jobs row and no ai_generations row on failure
    expect(mockBatchJobsInsert).not.toHaveBeenCalled();
    expect(mockAiGenerationsInsert).not.toHaveBeenCalled();
  });
});
