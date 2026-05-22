import 'server-only';
import type { MessageBatch } from '@anthropic-ai/sdk/resources/messages/batches';

/**
 * Phase 4 SDK → SPEC enum translator (RESEARCH § Batch API Mechanics lines 199-215).
 *
 * Extracted from app/api/ai/consistency/[batchId]/route.ts during Phase 4 UAT.
 * Next.js 15 route-handler typegen rejects any named export from route files that
 * is not an HTTP verb (GET, POST, DELETE, etc.) — `OmitWithTag` indexes to `never`
 * for unknown identifiers. Keeping the translator in a sibling module preserves
 * unit-test access (the existing tests use dynamic import) without violating the
 * route-file contract.
 *
 * Anthropic SDK MessageBatch.processing_status values: 'in_progress' | 'canceling' | 'ended'.
 * SPEC R5 + API-SPEC.md + D-21 + D-30 describe: 'in_progress' | 'completed' | 'failed'.
 *
 * Mapping:
 *   - SDK 'in_progress' OR 'canceling' → SPEC 'in_progress' (canceling is transient per docs)
 *   - SDK 'ended' + request_counts.succeeded > 0 + zero (errored/expired/canceled) → SPEC 'completed'
 *   - SDK 'ended' + any of (errored/expired/canceled) > 0 → SPEC 'failed'
 *   - SDK 'ended' + zero of everything (anomalous — Anthropic invariant violation) → SPEC 'failed'
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
