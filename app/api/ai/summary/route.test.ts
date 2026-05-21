// app/api/ai/summary/route.test.ts — Plan 04-03 Wave-0 RED stub.
// SPEC R3: idempotent re-call (returns cached, no Anthropic call) + 503 on failure.
// SUT module `app/api/ai/summary/route.ts` does NOT exist yet — Plan 04-08 creates it.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

describe('POST /api/ai/summary — Haiku 4.5 TL;DR (SPEC R3)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('on first call: calls Anthropic, inserts row, returns { summary }', async () => {
    mockCreate.mockResolvedValueOnce(mockTextResponse('TL;DR text'));
    expect.fail('TODO: Plan 04-08 — happy path');
  });

  it('on second call same policy: returns cached summary, NO Anthropic call, NO new row (SPEC R3 idempotence)', async () => {
    expect.fail('TODO: Plan 04-08 — idempotent re-call');
  });

  it('on Anthropic throw: 503 + no row + tldrSummary stays NULL', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    expect.fail('TODO: Plan 04-08 — 503 contract');
  });
});
