// app/api/ai/draft/route.test.ts — Plan 04-03 Wave-0 RED stub.
// SP-2: 503 contract + AC-29 idempotency dedup + AC-32 cache-token columns.
// SUT module `app/api/ai/draft/route.ts` does NOT exist yet — Plan 04-08 creates it.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

describe('POST /api/ai/draft — Sonnet 4.6 draft generation (SPEC R2 + D-37)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('on success: writes 1 ai_generations row, returns { draftContent, tokensUsed } (200)', async () => {
    mockCreate.mockResolvedValueOnce(mockTextResponse('## Purpose\nDraft body...'));
    expect.fail('TODO: Plan 04-08 — POST happy path with admin Clerk session');
  });

  it('on Anthropic SDK throw: returns 503 envelope + Retry-After: 30 + NO ai_generations row (SP-2, SPEC R7)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    expect.fail('TODO: Plan 04-08 — 503 contract + no row written');
  });

  it('on Starter-org at 50 drafts/month: returns 429 with body.error === "tier_limit_exceeded" (SP-4)', async () => {
    expect.fail('TODO: Plan 04-08 — tier-overage path');
  });

  it('with Idempotency-Key header: 2nd POST same key returns identical draftContent + no new row (AC-29 — D-32)', async () => {
    expect.fail('TODO: Plan 04-08 — Idempotency-Key dedup via AiGenerations.findByIdempotencyKey');
  });

  it('inserted ai_generations row populates input_tokens, output_tokens, cache_*_input_tokens (AC-32 — D-35)', async () => {
    mockCreate.mockResolvedValueOnce(mockTextResponse('body', { cache_creation_input_tokens: 1024, cache_read_input_tokens: 0 }));
    expect.fail('TODO: Plan 04-08 — assert insert.inputTokens, .outputTokens, .cacheCreationInputTokens, .cacheReadInputTokens are populated');
  });
});
