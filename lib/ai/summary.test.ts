// lib/ai/summary.test.ts — Plan 04-03 Wave-0 RED stub.
// D-19 + SPEC R3: idempotent (skip when tldrSummary set) + cache-token tier columns.
// SUT module `lib/ai/summary.ts` does NOT exist yet — Plan 04-08 creates it.
import { describe, expect, it, vi } from 'vitest';

describe('lib/ai/summary — generateSummaryForPolicy (D-19, SPEC R3)', () => {
  it('idempotent — returns early when policies.tldrSummary already set (no Anthropic call)', async () => {
    // Plan 04-08 creates lib/ai/summary.ts.
    expect.fail('TODO: Plan 04-08 — policy.tldrSummary truthy ⇒ short-circuit (no .messages.create call)');
  });

  it('on first call: invokes Haiku 4.5, inserts ai_generations row with cache-token columns, updates policies.tldrSummary', async () => {
    expect.fail('TODO: Plan 04-08 — full happy path; assert AiGenerations.insert called with cacheReadInputTokens, cacheCreationInputTokens, etc.');
  });

  it('uses MODEL_HAIKU not MODEL_SONNET (D-04)', async () => {
    expect.fail('TODO: Plan 04-08 — assert messages.create called with model: claude-haiku-4-5-20251001');
  });
});
