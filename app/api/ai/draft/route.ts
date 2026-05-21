import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { buildCachedSystem } from '@/lib/ai/cache';
import { DRAFT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { extractText } from '@/lib/ai/extract';
import { DraftSchema, type DraftInput } from '@/lib/ai/schemas';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { requireTierLimit } from '@/lib/stripe/products';
import { TierLimitExceededError } from '@/lib/stripe/errors';

/**
 * Phase 4 SPEC R2 — Draft generation endpoint (admin-only, Sonnet 4.6).
 *
 * Pattern B (D-37 + D-36 + D-17): auth gates OUTSIDE try (typed BootstrapError + ForbiddenError
 * propagate to Next.js error boundary → 401/403); tier check + Anthropic + DB-write INSIDE try;
 * catch discriminates TierLimitExceededError → 429/403 (D-15) and ZodError → 400 (D-42); everything
 * else → 503 envelope (SPEC R7) + Retry-After:30 header.
 *
 * Idempotency-Key (D-32): client may supply UUID in header; on cache hit, returns existing
 * draftContent + tokensUsed without a new Anthropic call AND without a new ai_generations row.
 * AC-29 fixture verifies.
 *
 * SUCCESS-ONLY ai_generations write (D-06): no row on Anthropic failure (SP-2 fixture verifies).
 *
 * Cache (D-03 EPHEMERAL_CACHE): system prompt cached at 5-min TTL — Draft pattern is bursty
 * (admin generates several drafts in a session). cache_creation_input_tokens on first call,
 * cache_read_input_tokens on subsequent calls within the 5-min window (AC-32 + D-25 verify).
 *
 * Tokens (D-35): all 4 cache-token columns (input_tokens, output_tokens,
 * cache_read_input_tokens, cache_creation_input_tokens) write to ai_generations from
 * response.usage. Phase 8 cost analytics query uses these columns.
 */

/**
 * Format the user message from the DraftSchema-parsed body. Mirrors reference/PROMPTS.md
 * Draft USER template (lines 18-20). companySize + industry placeholders are not collected
 * in Phase 4 (deferred to Phase 6+ org settings); the policyType + admin-supplied prompt
 * carry the operator intent.
 */
function formatDraftPrompt(body: DraftInput): string {
  const policyType = body.policyType ?? 'general';
  return `Write a ${policyType} policy. ${body.prompt}`;
}

export async function POST(req: Request): Promise<Response> {
  // D-37 — auth gates OUTSIDE try. Typed errors (BootstrapError + ForbiddenError) propagate
  // to Next.js error boundary, NOT into the 503 fallback. Keeps auth/AI failure metrics distinct.
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  try {
    // D-15 — tier check. Throws TierLimitExceededError on overage; caught below + routed to
    // 429 (usage-bound) or 403 (tier-bound) per D-16 statusCode.
    await requireTierLimit(ctx.orgId, 'aiDraftsMonthly');

    // D-42 — Zod .strict() body parse. Unknown keys → ZodError → 400 catch branch.
    const body = DraftSchema.parse(await req.json());

    // D-32 — Idempotency-Key dedup. Optional header; on hit, return cached row without
    // Anthropic call. Partial-unique index on (org_id, idempotency_key) WHERE idempotency_key
    // IS NOT NULL guarantees at most one row per (org, key) tuple.
    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existing = await withOrgScope(ctx, async (s) =>
        AiGenerations.findByIdempotencyKey(s, idempotencyKey),
      );
      if (existing) {
        return NextResponse.json(
          {
            draftContent: existing.result,
            tokensUsed: (existing.inputTokens ?? 0) + (existing.outputTokens ?? 0),
          },
          { status: 200 },
        );
      }
    }

    // Anthropic + insert inside one withOrgScope transaction. SUCCESS-ONLY semantic (D-06):
    // ai_generations row only written after Anthropic call resolves without throwing.
    const result = await withOrgScope(ctx, async (s) => {
      const response = await getAnthropicClient().messages.create({
        model: MODEL_SONNET,
        system: buildCachedSystem(DRAFT_SYSTEM_PROMPT),
        messages: [{ role: 'user', content: formatDraftPrompt(body) }],
        max_tokens: 4096,
      });

      const draftContent = extractText(response); // D-38 — shared helper, hoisted local

      // D-35 cache-token columns. Nullable in schema; SDK usage fields may be absent
      // on mocked fixtures so coalesce to null.
      await AiGenerations.insert(s, {
        policyId: null,
        type: 'draft',
        prompt: body.prompt,
        result: draftContent,
        inputTokens: response.usage.input_tokens ?? null,
        outputTokens: response.usage.output_tokens ?? null,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
        idempotencyKey: idempotencyKey ?? null,
        model: MODEL_SONNET,
      });

      return {
        draftContent,
        tokensUsed: (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0),
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    // D-15 + D-16 — tier overage routing (429 usage-bound or 403 tier-bound).
    if (err instanceof TierLimitExceededError) {
      return NextResponse.json(
        {
          error: 'tier_limit_exceeded',
          tierLimit: err.limit,
          currentUsage: err.current,
          upgradeUrl: '/pricing',
        },
        { status: err.statusCode },
      );
    }

    // D-42 — ZodError → 400 with structured details. Keeps validation failure distinct
    // from AI service failure for client-side handling (form re-render vs. retry hint).
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_body', details: err.flatten() },
        { status: 400 },
      );
    }

    // D-36 — PII-safe sanitized log. Anthropic.APIError gets structured fields
    // (name + HTTP status + Anthropic error code); generic Error gets truncated message.
    console.error('[ai/draft] anthropic failed', {
      orgId: ctx.orgId,
      error:
        err instanceof Anthropic.APIError
          ? { name: err.name, status: err.status, code: err.error?.type }
          : err instanceof Error
            ? { name: err.name, message: err.message.slice(0, 120) }
            : err,
    });

    // SPEC R7 — 503 envelope + Retry-After:30 header.
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
