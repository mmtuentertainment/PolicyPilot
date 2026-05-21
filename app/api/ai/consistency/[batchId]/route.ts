import 'server-only';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageBatch } from '@anthropic-ai/sdk/resources/messages/batches';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { CONSISTENCY_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { BatchJobs } from '@/lib/db/repositories/batch_jobs';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';

/**
 * Phase 4 SPEC R5 (poll half) — Consistency Check polling endpoint.
 *
 * Three CRITICAL behaviors:
 *   1. translateProcessingStatus — bridges the SDK enum drift documented in
 *      RESEARCH § Batch API Mechanics. SDK returns 'in_progress' | 'canceling' | 'ended'
 *      with request_counts; SPEC + API-SPEC.md describe 'in_progress' | 'completed' | 'failed'.
 *      The persisted batch_jobs.status uses the SPEC enum exclusively — raw SDK
 *      processing_status NEVER crosses the route-handler boundary.
 *   2. D-34 stale-window — DB-cache gate BEFORE Anthropic call. 25s window. AC-30: 10 polls
 *      in 5s ⇒ 1 SDK call. After 25s, next poll DOES hit Anthropic. Collapses worst-case
 *      200 retrieves/min (100 orgs × 30s) to 1 per 25s per batch — comfortably under
 *      Anthropic Tier-1 Batches API's 50RPM shared cap.
 *   3. WARNING-5 token aggregation — sum usage.input_tokens + output_tokens +
 *      cache_read_input_tokens + cache_creation_input_tokens across ALL
 *      MessageBatchIndividualResponse.result.message.usage objects where
 *      result.type === 'succeeded'. Populate ai_generations row with totals (NOT null).
 *      Phase 8 weighted-cost SQL (per CONTEXT D-35) assumes input_tokens > 0 for every
 *      ai_generations row — null token columns would silently zero-out batch costs
 *      and undercount Phase 8 cost analytics by 100%.
 *
 * SUCCESS-ONLY ai_generations write (D-06): only on translated status === 'completed'.
 * Failed/in-progress translations update batch_jobs.status only — no ai_generations row.
 */

/**
 * SDK → SPEC enum translator (RESEARCH § Batch API Mechanics lines 199-215).
 *
 * Anthropic SDK MessageBatch.processing_status values: 'in_progress' | 'canceling' | 'ended'.
 * SPEC R5 + API-SPEC.md + D-21 + D-30 describe: 'in_progress' | 'completed' | 'failed'.
 *
 * Mapping:
 *   - SDK 'in_progress' OR 'canceling' → SPEC 'in_progress' (canceling is transient per docs)
 *   - SDK 'ended' + request_counts.succeeded > 0 + zero (errored/expired/canceled) → SPEC 'completed'
 *   - SDK 'ended' + any of (errored/expired/canceled) > 0 → SPEC 'failed'
 *   - SDK 'ended' + zero of everything (anomalous — Anthropic invariant violation) → SPEC 'failed'
 *
 * Exported for direct unit-test fixture coverage (4 translator tests in the test file).
 */
export function translateProcessingStatus(
  batch: MessageBatch,
): 'in_progress' | 'completed' | 'failed' {
  if (
    batch.processing_status === 'in_progress' ||
    batch.processing_status === 'canceling'
  ) {
    return 'in_progress';
  }
  // batch.processing_status === 'ended' — differentiate via request_counts.
  const { succeeded, errored, expired, canceled } = batch.request_counts;
  if (errored > 0 || expired > 0 || canceled > 0) return 'failed';
  return succeeded > 0 ? 'completed' : 'failed';
}

/**
 * D-34 stale-window threshold. Polls within 25s of the last batch_jobs.updatedAt
 * return cached state without calling Anthropic. AC-30: 10 polls in 5s ⇒ 1 SDK call.
 */
const STALE_WINDOW_MS = 25_000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  // D-37 — auth gates OUTSIDE try. Typed errors propagate to Next.js error boundary.
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);
  const { batchId } = await params;

  try {
    const job = await withOrgScope(ctx, async (s) =>
      BatchJobs.findByAnthropicBatchId(s, batchId),
    );

    if (!job) {
      // 404 — batch_jobs has no row for this Anthropic batch ID (cross-org or
      // unknown ID). RLS scoping in findByAnthropicBatchId ensures we never
      // surface another org's batch state to this caller.
      return new Response(null, { status: 404 });
    }

    const updatedAt = job.updatedAt as unknown as Date;
    const isStale = Date.now() - updatedAt.getTime() > STALE_WINDOW_MS;

    // D-34 — DB-cache stale-window gate. Return cached state without Anthropic call IF:
    //   (a) batch already in a terminal state (completed or failed — no further SDK calls
    //       can change the outcome), OR
    //   (b) row is fresh (< 25s old since last poll).
    if (job.status === 'completed' || job.status === 'failed' || !isStale) {
      return NextResponse.json({
        status: job.status,
        result: job.resultJson ?? undefined,
      });
    }

    // Stale + still in_progress: call Anthropic, translate SDK→SPEC, persist.
    const batch = await getAnthropicClient().messages.batches.retrieve(batchId);
    const translatedStatus = translateProcessingStatus(batch);

    let findings: unknown = undefined;

    if (translatedStatus === 'completed') {
      // WARNING-5 — token aggregation across batch results stream.
      // For each succeeded result, accumulate usage.* into running totals. Insert SUM
      // into ai_generations row (NOT null). Phase 8 weighted-cost SQL (per CONTEXT D-35)
      // depends on input_tokens > 0 for every ai_generations row; null token columns
      // would silently zero-out batch costs and undercount analytics by 100%.
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheReadInputTokens = 0;
      let totalCacheCreationInputTokens = 0;
      let parsedFindings: unknown = undefined;

      // SDK results() returns Promise<JSONLDecoder<MessageBatchIndividualResponse>>;
      // the decoder is itself an AsyncIterable. Phase 4 batches have 1 request, so
      // first === only succeeded; the SUM primitive supports future multi-request
      // batches (WARNING-5 invariant).
      const resultsStream = await getAnthropicClient().messages.batches.results(batchId);
      for await (const r of resultsStream) {
        if (r.result.type !== 'succeeded') continue;

        // WARNING-5 — accumulate token usage from EACH succeeded result.
        const usage = r.result.message.usage;
        totalInputTokens += usage.input_tokens ?? 0;
        totalOutputTokens += usage.output_tokens ?? 0;
        totalCacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
        totalCacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;

        // Parse first succeeded result's text block as ConsistencyFinding[].
        // Future multi-request batches would need a per-request findings array
        // (out of scope here — Phase 4 batches have 1 request).
        if (parsedFindings === undefined) {
          const block = r.result.message.content.find(
            (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
          );
          if (block) {
            try {
              parsedFindings = JSON.parse(block.text);
            } catch (parseErr) {
              // D-36 PII-safe log. The batch result text MAY contain policy content
              // (consistency findings reference policy titles/IDs) — truncate to 120.
              console.warn('[ai/consistency/poll] result JSON unparseable', {
                orgId: ctx.orgId,
                err:
                  parseErr instanceof Error
                    ? {
                        name: parseErr.name,
                        message: parseErr.message.slice(0, 120),
                      }
                    : parseErr,
              });
              parsedFindings = [];
            }
          }
        }
      }

      findings = parsedFindings ?? [];

      // SUCCESS-ONLY ai_generations write (D-06) + WARNING-5 token totals.
      // One transaction: insert ai_generations row + update batch_jobs status+resultJson.
      await withOrgScope(ctx, async (s) => {
        await AiGenerations.insert(s, {
          policyId: null,
          type: 'consistency',
          prompt: CONSISTENCY_SYSTEM_PROMPT,
          result: JSON.stringify(findings ?? []),
          inputTokens: totalInputTokens, // WARNING-5 — sum across succeeded results
          outputTokens: totalOutputTokens,
          cacheReadInputTokens: totalCacheReadInputTokens,
          cacheCreationInputTokens: totalCacheCreationInputTokens,
          idempotencyKey: null,
          model: MODEL_SONNET,
        });
        await BatchJobs.updateStatus(s, batchId, {
          status: translatedStatus,
          resultJson: findings,
        });
      });
    } else {
      // 'in_progress' or 'failed' — update batch_jobs status + updatedAt only.
      // No ai_generations row (D-06 SUCCESS-ONLY). The updatedAt bump (via now() SQL
      // inside updateStatus) is load-bearing for the D-34 stale-window check on
      // subsequent polls — keeps the next poll from re-hitting Anthropic immediately.
      await withOrgScope(ctx, async (s) => {
        await BatchJobs.updateStatus(s, batchId, { status: translatedStatus });
      });
    }

    return NextResponse.json({
      status: translatedStatus,
      result: translatedStatus === 'completed' ? findings : undefined,
    });
  } catch (err) {
    // D-36 — PII-safe sanitized log. Include batchId so operator can correlate
    // failures back to specific Anthropic batches in production telemetry.
    console.error('[ai/consistency/poll] anthropic failed', {
      orgId: ctx.orgId,
      batchId,
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
