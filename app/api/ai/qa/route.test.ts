// app/api/ai/qa/route.test.ts — Plan 04-03 Wave-0 RED stub.
// AC-31 (D-36): PII-safe log truncation + D-40 cache-miss observability.
// WARNING-1 (legal disclaimer) and WARNING-4 (rawText source) are covered downstream by SPEC R4 ACs.
// SUT module `app/api/ai/qa/route.ts` does NOT exist yet — Plan 04-09 creates it.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

describe('POST /api/ai/qa — Sonnet 4.6 Q&A (SPEC R4)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('on 2nd successive call: usage.cache_read_input_tokens > 0 (cache-hit observable, SPEC R4)', async () => {
    mockCreate
      .mockResolvedValueOnce(mockTextResponse('A1', { cache_creation_input_tokens: 2048, cache_read_input_tokens: 0 }))
      .mockResolvedValueOnce(mockTextResponse('A2', { cache_creation_input_tokens: 0, cache_read_input_tokens: 2048 }));
    expect.fail('TODO: Plan 04-09 — assert 2nd response usage.cache_read_input_tokens > 0');
  });

  it('PII-safe log on Anthropic throw: error.message truncated to 120 chars OR structured-field branch used (AC-31 — D-36)', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCreate.mockRejectedValueOnce(new Error('FAKE_QUESTION_FROM_USER_BODY '.repeat(20)));
    try {
      expect.fail('TODO: Plan 04-09 — capture console.error arg, assert .error.message.length <= 120 OR shape is { name, status, code }');
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  it('cache-miss log when both cache token counters are zero (D-40 cold-miss observability)', async () => {
    mockCreate.mockResolvedValueOnce(mockTextResponse('A', { cache_creation_input_tokens: 0, cache_read_input_tokens: 0, input_tokens: 500 }));
    expect.fail('TODO: Plan 04-09 — console.warn with [ai/qa] cache miss likely + likelyCause');
  });
});
