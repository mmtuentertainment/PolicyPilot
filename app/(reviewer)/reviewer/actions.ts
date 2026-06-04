'use server';
// app/(reviewer)/reviewer/actions.ts — Phase 9 (R-017 / D-09-01) reviewer Server Actions.
//
// Thin wrappers over the authoritative orchestrator recordReviewDecision
// (lib/policies/transitions.ts), which owns the transactional business logic
// (mutate workflow_stages projection + append the immutable review_decisions
// ledger + reset to draft on reject) and the reviewer-or-admin gate. These
// actions validate the FormData payload at the trust boundary and map known
// domain errors to the typed ActionState contract (mirrors the admin
// transition actions' shape).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { recordReviewDecision } from '@/lib/policies/transitions';
import { IllegalTransitionError } from '@/lib/policies/state-machine';
import { StageNotActionableError } from '@/lib/policies/errors';
import { PolicyIdSchema } from '@/lib/policies/types';

export type ActionState = { ok: true } | { ok: false; error: string };

// stageId is a workflow_stages.id (Postgres uuid) — validate at the boundary so
// a malformed value returns a typed ActionState instead of a 22P02 → 500.
const StageIdSchema = z.string().uuid();
const INVALID_PAYLOAD: ActionState = { ok: false, error: 'Invalid action payload.' };

function parseDecisionPayload(
  formData: FormData,
): { policyId: ReturnType<typeof PolicyIdSchema.parse>; stageId: string; comment?: string } | null {
  const policyId = PolicyIdSchema.safeParse(String(formData.get('policyId') ?? '').trim());
  const stageId = StageIdSchema.safeParse(String(formData.get('stageId') ?? '').trim());
  if (!policyId.success || !stageId.success) return null;
  const commentRaw = String(formData.get('comment') ?? '').trim();
  const comment = commentRaw.length > 0 ? commentRaw.slice(0, 2000) : undefined;
  return { policyId: policyId.data, stageId: stageId.data, comment };
}

function handleReviewError(err: unknown): ActionState {
  // reject() can throw IllegalTransitionError if the policy is not under_review.
  if (err instanceof IllegalTransitionError) return { ok: false, error: err.message };
  // FIX-A (Phase 9 review): a crafted/stale (policyId, stageId) mismatch or an
  // already-decided stage rolls back as StageNotActionableError — surface a
  // benign "no longer available" message instead of bubbling to a 500.
  if (err instanceof StageNotActionableError) {
    return { ok: false, error: 'This review item is no longer available.' };
  }
  // Auth/bootstrap and unexpected errors bubble to the Next.js error boundary.
  throw err;
}

export async function approveStageAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseDecisionPayload(formData);
  if (!parsed) return INVALID_PAYLOAD;
  try {
    await recordReviewDecision(parsed.policyId, parsed.stageId, 'approved', parsed.comment);
  } catch (e) {
    return handleReviewError(e);
  }
  revalidatePath('/reviewer');
  revalidatePath(`/reviewer/${parsed.policyId}`);
  return { ok: true };
}

export async function rejectStageAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseDecisionPayload(formData);
  if (!parsed) return INVALID_PAYLOAD;
  try {
    await recordReviewDecision(parsed.policyId, parsed.stageId, 'rejected', parsed.comment);
  } catch (e) {
    return handleReviewError(e);
  }
  revalidatePath('/reviewer');
  revalidatePath(`/reviewer/${parsed.policyId}`);
  return { ok: true };
}
