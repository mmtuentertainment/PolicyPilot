import 'server-only';
import { withOrgScope } from '@/lib/db/scoped';
import type { OrgContext } from '@/lib/auth/context';
import type { PolicyId } from '@/lib/policies/types';
import { Policies } from '@/lib/db/repositories/policies';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_HAIKU } from '@/lib/ai/models';
import { buildCachedSystem } from '@/lib/ai/cache';
import { SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { policyToPromptText } from '@/lib/ai/qa-extract';
import { extractText } from '@/lib/ai/extract';

/**
 * Phase 4 D-19 + SPEC R3 — TL;DR summary generation for a single policy.
 *
 * Two callers:
 *   1. POST /api/ai/summary (admin "Regenerate TL;DR" button) — Plan 04-08.
 *   2. publish() orchestrator post-commit hook — Plan 04-11.
 *
 * Idempotence (SPEC R3): if policy.tldrSummary is already set, returns early without calling
 * Anthropic. The second click of "Regenerate TL;DR" therefore returns the cached value AND
 * does NOT increment ai_generations count (preserves tier-limit math).
 *
 * Graceful-degrade (SP-3): publish() wraps THIS function in try/catch. Failure here logs
 * '[publish] summary failed' (D-18 + D-36) and publish() returns successfully — the policy
 * is published with policies.tldrSummary IS NULL; admin can regenerate later.
 *
 * Transaction scope: opens its OWN withOrgScope (NOT shared with caller). publish() commits
 * the state-transition transaction FIRST, then awaits this helper. This means a flaky Anthropic
 * call cannot roll back the publication. The AI work runs in its own short transaction:
 * one SELECT (Policies.findById) + one INSERT (AiGenerations.insert) + one UPDATE
 * (Policies.updateSummary).
 *
 * Model: MODEL_HAIKU (claude-haiku-4-5-20251001) per D-04 + ADR-015. max_tokens 512 per SPEC R3
 * "3 sentences max". System prompt cached at 5-min ephemeral TTL via buildCachedSystem (D-03
 * EPHEMERAL_CACHE) — publish events tend to cluster within sessions so cache hits are realistic.
 *
 * Token accounting (D-35): all 4 cache-token columns (inputTokens, outputTokens,
 * cacheReadInputTokens, cacheCreationInputTokens) populate from response.usage. Nullable in
 * schema so missing values from mocked responses are acceptable.
 *
 * Idempotency-Key (D-32): summary path does NOT use Idempotency-Key (only Draft does — Draft
 * is the costlier Sonnet path). idempotencyKey is set to null on insert.
 */
export async function generateSummaryForPolicy(
  policyId: PolicyId,
  ctx: OrgContext,
): Promise<void> {
  await withOrgScope(ctx, async (s) => {
    const rows = await Policies.findById(s, policyId);
    const policy = rows[0];
    if (!policy) throw new Error('Policy not found');

    // D-19 + SPEC R3 idempotence — short-circuit if cached.
    if (policy.tldrSummary) return;

    // Haiku 4.5 call (D-04 — MODEL_HAIKU; max_tokens 512 per SPEC R3 "3 sentences max").
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL_HAIKU,
      system: buildCachedSystem(SUMMARY_SYSTEM_PROMPT),
      messages: [{ role: 'user', content: policyToPromptText(policy) }],
      max_tokens: 512,
    });

    const summary = extractText(response);

    // SUCCESS-ONLY ai_generations write (D-06) — only after we have a valid response body.
    // D-35: 4 cache-token columns from response.usage; nullable so missing values acceptable.
    await AiGenerations.insert(s, {
      policyId,
      type: 'summary',
      prompt: SUMMARY_SYSTEM_PROMPT,
      result: summary,
      inputTokens: response.usage.input_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? null,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
      idempotencyKey: null,
      model: MODEL_HAIKU,
    });

    await Policies.updateSummary(s, policyId, summary);
  });
}
