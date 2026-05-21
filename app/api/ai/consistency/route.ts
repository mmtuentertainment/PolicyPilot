import 'server-only';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { CONSISTENCY_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { policyToPromptText, xmlEscape } from '@/lib/ai/qa-extract';
import { Policies } from '@/lib/db/repositories/policies';
import { BatchJobs } from '@/lib/db/repositories/batch_jobs';
import { requireTierLimit } from '@/lib/stripe/products';
import { TierLimitExceededError } from '@/lib/stripe/errors';

/**
 * Phase 4 SPEC R5 — Consistency Check submit (admin-only, Growth+, Sonnet 4.6 via Batch API).
 *
 * Submits the org's full published-policy library to Anthropic's Messages.Batches API
 * (50% cost reduction per ADR-021 — synchronous Messages API is forbidden for this surface).
 *
 * Pattern B (D-37 + D-36 + D-17): auth gates OUTSIDE try (typed BootstrapError + ForbiddenError
 * propagate to Next.js error boundary → 401/403); tier check + Anthropic + DB-write INSIDE try;
 * catch discriminates TierLimitExceededError → 403 (D-15 tier-bound routing) and everything else
 * → 503 envelope (SPEC R7) + Retry-After:30 header.
 *
 * D-06 SUCCESS-ONLY semantic: batch_jobs row INSERTED at submission with status='in_progress'.
 * No ai_generations row here — the poll endpoint (app/api/ai/consistency/[batchId]/route.ts)
 * writes the ai_generations row when the batch transitions to status='completed'. This preserves
 * the "one ai_generations row per Anthropic SUCCESS" invariant (CLAUDE.md ALWAYS rule #5; SPEC R5).
 *
 * D-15 + D-16 — tier-bound 403 path. TIER_LIMITS.starter.consistencyCheck === false, so Starter
 * orgs hit requireTierLimit → throws TierLimitExceededError(statusCode: 403, requiredTier: 'growth').
 * Contrast with Draft endpoint's usage-bound 429 routing on aiDraftsMonthly counter overage.
 *
 * Anthropic Batch ID format example: `msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d`. Per SDK comments,
 * the format MAY change over time; we treat the ID as opaque text + lean on the .unique()
 * constraint at the schema level for cross-org collision defense.
 */

/**
 * Compose the per-org policy library payload for the batch's single-request user message.
 * XML-per-policy shape mirrors the Q&A endpoint (D-13) — each policy becomes a
 * `<policy id="..." title="...">` element with content embedded inside. The title is
 * XML-escaped (D-31 layer-2); the content is XML-escaped + tag-stripped by policyToPromptText.
 */
function buildLibraryPayload(
  policies: { id: string; title: string; contentJson: unknown }[],
): string {
  return policies
    .map(
      (p) =>
        `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`,
    )
    .join('\n');
}

export async function POST(_req: Request): Promise<Response> {
  // D-37 — auth gates OUTSIDE try. Typed errors (BootstrapError + ForbiddenError) propagate
  // to Next.js error boundary, NOT into the 503 fallback. Keeps auth/AI failure metrics distinct.
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  try {
    // D-15 — tier check (TIER-BOUND, NOT usage-bound). Throws TierLimitExceededError on overage;
    // caught below + routed to 403 (Starter → no consistencyCheck) per D-16 statusCode.
    // requireTierLimit determines tier-bound vs usage-bound via the USAGE_BOUND_FEATURES list
    // in lib/stripe/products.ts — 'consistencyCheck' is NOT in that list, so statusCode === 403.
    await requireTierLimit(ctx.orgId, 'consistencyCheck');

    // SPEC R5 — no request body; uses org's full published library. Empty library would still
    // submit a batch; Anthropic would return 'no contradictions' for a single-policy library.
    // The /dashboard/consistency page's empty-state branching is the operator-visible guard
    // against accidental empty submissions (Plan 04-14).
    const batch = await withOrgScope(ctx, async (s) => {
      const policies = await Policies.listPublishedForOrg(s);
      const libraryPayload = buildLibraryPayload(policies);

      // RESEARCH § Batch API Mechanics — request shape (lines 128-150 of 04-RESEARCH.md).
      // STABLE namespace: client.messages.batches.create (NOT client.beta.messages.batches.*) —
      // verified in SDK 0.97.1 source at src/resources/messages/batches.ts.
      const batchResponse = await getAnthropicClient().messages.batches.create({
        requests: [
          {
            custom_id: `consistency-${randomUUID()}`,
            params: {
              model: MODEL_SONNET,
              max_tokens: 8192,
              system: [{ type: 'text', text: CONSISTENCY_SYSTEM_PROMPT }],
              messages: [{ role: 'user', content: libraryPayload }],
            },
          },
        ],
      });

      // D-06 — INSERT batch_jobs row at submission. NO ai_generations row here (SUCCESS-ONLY).
      // status='in_progress' is the SPEC enum (NOT the SDK's processing_status enum which uses
      // 'in_progress' | 'canceling' | 'ended'). The poll endpoint translates SDK→SPEC.
      await BatchJobs.insert(s, {
        anthropicBatchId: batchResponse.id,
        type: 'consistency',
        status: 'in_progress',
        resultJson: null,
      });

      return batchResponse;
    });

    return NextResponse.json({ batchId: batch.id }, { status: 200 });
  } catch (err) {
    // D-15 + D-16 — tier overage routing. For consistencyCheck (tier-bound), statusCode === 403
    // and requiredTier === 'growth' (set by requireTierLimit via findRequiredTier).
    if (err instanceof TierLimitExceededError) {
      return NextResponse.json(
        {
          error: 'tier_limit_exceeded',
          requiredTier: err.requiredTier ?? 'growth',
          upgradeUrl: '/pricing',
        },
        { status: err.statusCode },
      );
    }

    // D-36 — PII-safe sanitized log. Anthropic.APIError gets structured fields
    // (name + HTTP status + Anthropic error code); generic Error gets truncated message.
    console.error('[ai/consistency] anthropic failed', {
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
