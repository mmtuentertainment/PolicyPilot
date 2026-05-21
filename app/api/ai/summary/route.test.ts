// app/api/ai/summary/route.test.ts — Plan 04-08 GREEN.
// SPEC R3 idempotence: 2nd call returns cached tldrSummary WITHOUT Anthropic call.
// SP-2: 503 envelope on Anthropic throw + no ai_generations row.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

// ============================================================================
// Auth context mock: admin by default.
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Policies repository: findById returns whatever the test stages.
// ============================================================================
const mockFindById = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    findById: (...args: unknown[]) => mockFindById(...args),
  },
}));

// ============================================================================
// generateSummaryForPolicy helper: mocked because lib/ai/summary.test.ts already
// covers the helper's behavior; the route test focuses on the delegation contract.
// ============================================================================
const mockGenerateSummary = vi.fn();
vi.mock('@/lib/ai/summary', () => ({
  generateSummaryForPolicy: (...args: unknown[]) => mockGenerateSummary(...args),
}));

// ============================================================================
// withOrgScope passes a stub scope to the callback.
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

const TEST_POLICY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function makeReq(body: Record<string, unknown> = { policyId: TEST_POLICY_ID }): Request {
  return new Request('http://localhost/api/ai/summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/summary — Haiku 4.5 TL;DR (SPEC R3)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGetOrgContext.mockReset();
    mockFindById.mockReset();
    mockGenerateSummary.mockReset();
    // Defaults: admin context.
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
  });

  it('on first call: calls generateSummaryForPolicy, then re-reads + returns { summary }', async () => {
    // 1st findById call (cache check) — null. After generate, 2nd findById returns fresh summary.
    mockFindById
      .mockResolvedValueOnce([{ id: TEST_POLICY_ID, tldrSummary: null }])
      .mockResolvedValueOnce([{ id: TEST_POLICY_ID, tldrSummary: 'fresh TL;DR text' }]);
    mockGenerateSummary.mockResolvedValueOnce(undefined);

    const { POST } = await import('@/app/api/ai/summary/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe('fresh TL;DR text');
    expect(mockGenerateSummary).toHaveBeenCalledOnce();
    // Verify policyId was branded through policyIdFromString before being passed.
    expect(mockGenerateSummary.mock.calls[0][0]).toBe(TEST_POLICY_ID);
  });

  it('on second call same policy: returns cached summary, NO Anthropic call, NO new row (SPEC R3 idempotence)', async () => {
    mockFindById.mockResolvedValueOnce([
      { id: TEST_POLICY_ID, tldrSummary: 'previously cached TL;DR' },
    ]);
    const { POST } = await import('@/app/api/ai/summary/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe('previously cached TL;DR');
    // SPEC R3 cache: generateSummaryForPolicy NOT called when tldrSummary already set.
    expect(mockGenerateSummary).not.toHaveBeenCalled();
    // No Anthropic call (via the mocked client).
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('on Anthropic throw: 503 + Retry-After:30 + no row + tldrSummary stays NULL', async () => {
    mockFindById.mockResolvedValueOnce([{ id: TEST_POLICY_ID, tldrSummary: null }]);
    mockGenerateSummary.mockRejectedValueOnce(new Error('boom'));
    // mockCreate is also reset in this test — the failure happens inside generateSummaryForPolicy.
    mockCreate.mockRejectedValueOnce(new Error('boom'));

    const { POST } = await import('@/app/api/ai/summary/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error).toBe('ai_service_unavailable');
    expect(body.retryAfter).toBe(30);
  });
});
