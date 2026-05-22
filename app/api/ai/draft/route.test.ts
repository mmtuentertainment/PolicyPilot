// app/api/ai/draft/route.test.ts — Plan 04-08 GREEN.
// SPEC R2 + D-37 + D-36 + D-32 + AC-29 (Idempotency-Key dedup) + AC-32 (cache-token cols)
// + SP-2 (503 contract on Anthropic throw + no row written).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';
import { TierLimitExceededError } from '@/lib/stripe/errors';

// ============================================================================
// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
// ============================================================================
const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

// ============================================================================
// Mock auth context: getOrgContext returns admin by default; tests can override.
// requireAdminFromCtx is the real implementation (just throws on non-admin role).
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Mock the tier-limit gate. By default allows; tier-overage test overrides.
// ============================================================================
const mockRequireTierLimit = vi.fn();
vi.mock('@/lib/stripe/products', () => ({
  requireTierLimit: (...args: unknown[]) => mockRequireTierLimit(...args),
}));

// ============================================================================
// Mock the AiGenerations repository: insert + findByIdempotencyKey.
// ============================================================================
const mockInsertAiGen = vi.fn();
const mockFindByIdempotencyKey = vi.fn();
vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: {
    insert: (...args: unknown[]) => mockInsertAiGen(...args),
    findByIdempotencyKey: (...args: unknown[]) => mockFindByIdempotencyKey(...args),
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

function makeReq(
  body: Record<string, unknown> = { prompt: 'Write a vacation policy' },
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/ai/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/draft — Sonnet 4.6 draft generation (SPEC R2 + D-37)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGetOrgContext.mockReset();
    mockRequireTierLimit.mockReset();
    mockInsertAiGen.mockReset();
    mockFindByIdempotencyKey.mockReset();
    // Defaults: admin context, tier check passes, no idempotency hit.
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
    mockRequireTierLimit.mockResolvedValue(undefined);
    mockFindByIdempotencyKey.mockResolvedValue(undefined);
    mockInsertAiGen.mockResolvedValue([{ id: 'aigen_1' }]);
  });

  it('on success: writes 1 ai_generations row, returns { draftContent, tokensUsed } (200)', async () => {
    mockCreate.mockResolvedValueOnce(mockTextResponse('## Purpose\nDraft body...'));
    const { POST } = await import('@/app/api/ai/draft/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draftContent).toBe('## Purpose\nDraft body...');
    expect(typeof body.tokensUsed).toBe('number');
    expect(mockInsertAiGen).toHaveBeenCalledOnce();
    const insertArgs = mockInsertAiGen.mock.calls[0][1];
    expect(insertArgs.type).toBe('draft');
    expect(insertArgs.policyId).toBeNull();
    expect(insertArgs.result).toBe('## Purpose\nDraft body...');
    expect(insertArgs.model).toBe('claude-sonnet-4-6');
  });

  it('on Anthropic SDK throw: returns 503 envelope + Retry-After: 30 + NO ai_generations row (SP-2, SPEC R7)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    const { POST } = await import('@/app/api/ai/draft/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    const body = await res.json();
    expect(body.error).toBe('ai_service_unavailable');
    expect(body.retryAfter).toBe(30);
    // SUCCESS-ONLY semantic: no ai_generations row written on Anthropic failure.
    expect(mockInsertAiGen).not.toHaveBeenCalled();
  });

  it('on Starter-org at 50 drafts/month: returns 429 with body.error === "tier_limit_exceeded" (SP-4)', async () => {
    mockRequireTierLimit.mockRejectedValueOnce(
      new TierLimitExceededError('aiDraftsMonthly', 50, 50, 429),
    );
    const { POST } = await import('@/app/api/ai/draft/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('tier_limit_exceeded');
    expect(body.tierLimit).toBe(50);
    expect(body.currentUsage).toBe(50);
    expect(body.upgradeUrl).toBe('/pricing');
    // Tier overage short-circuits BEFORE Anthropic call AND BEFORE any row write.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInsertAiGen).not.toHaveBeenCalled();
  });

  it('with Idempotency-Key header: 2nd POST same key returns identical draftContent + no new row (AC-29 — D-32)', async () => {
    const key = '11111111-1111-4111-8111-111111111111';
    // Simulate hit: findByIdempotencyKey returns an existing row.
    mockFindByIdempotencyKey.mockResolvedValueOnce({
      id: 'aigen_prior',
      result: 'PRIOR draft body',
      inputTokens: 100,
      outputTokens: 50,
    });
    const { POST } = await import('@/app/api/ai/draft/route');
    const res = await POST(makeReq({ prompt: 'anything' }, { 'Idempotency-Key': key }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draftContent).toBe('PRIOR draft body');
    expect(body.tokensUsed).toBe(150);
    // On hit: NO Anthropic call, NO new ai_generations row.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInsertAiGen).not.toHaveBeenCalled();
    expect(mockFindByIdempotencyKey).toHaveBeenCalledOnce();
    expect(mockFindByIdempotencyKey.mock.calls[0][1]).toBe(key);
  });

  it('inserted ai_generations row populates input_tokens, output_tokens, cache_*_input_tokens (AC-32 — D-35)', async () => {
    mockCreate.mockResolvedValueOnce(
      mockTextResponse('body', {
        input_tokens: 200,
        output_tokens: 80,
        cache_creation_input_tokens: 1024,
        cache_read_input_tokens: 0,
      }),
    );
    const { POST } = await import('@/app/api/ai/draft/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockInsertAiGen).toHaveBeenCalledOnce();
    const insertArgs = mockInsertAiGen.mock.calls[0][1];
    expect(insertArgs.inputTokens).toBe(200);
    expect(insertArgs.outputTokens).toBe(80);
    expect(insertArgs.cacheCreationInputTokens).toBe(1024);
    expect(insertArgs.cacheReadInputTokens).toBe(0);
    // D-32: idempotencyKey defaults to null when no header sent.
    expect(insertArgs.idempotencyKey).toBeNull();
  });
});
