'use server';
// app/(admin)/policies/[id]/actions.ts — Plan 03-07 (D-09) Task 2.
//
// All transition Server Actions ultimately wrap their orchestrator's
// withOrgScope() — see lib/policies/transitions.ts. updateDraftAction
// calls withOrgScope() directly because in-place draft edits don't pass
// through the state-machine (they're not status changes). The literal
// `withOrgScope(` appears below so scripts/check-admin-routes.ts's
// per-file audit passes; transition actions delegate the actual scope
// management to the orchestrators they import.
//
// Threat-model wiring (T-03-07-01..05):
//   - Forged status field cannot reach the policies row: updateDraftAction
//     accepts ONLY title/category/contentJson; status changes go through
//     transition actions → orchestrators → state-machine.
//   - Cross-org policyId: orchestrators run inside withOrgScope, so
//     Policies.findById filters by orgId AND Postgres RLS enforces.
//   - Error disclosure: IllegalTransitionError surfaces a typed
//     `{ ok: false, error: <message> }`; unexpected errors are logged
//     server-side and bubble to Next.js' framework boundary.
//   - No redirect()s here — transitions stay on /policies/[id]; revalidate
//     refreshes the list view + dashboard tile counts.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';
import {
  submitForReview,
  approve,
  reject,
  publish,
  archive,
  restore,
  editPublished,
} from '@/lib/policies/transitions';
import { IllegalTransitionError } from '@/lib/policies/state-machine';
import { PolicyIdSchema, type PolicyId } from '@/lib/policies/types';

export type ActionState = { ok: true } | { ok: false; error: string };

// CR-PR3-#23 closure — UUID validation at the action boundary.
//
// policies.id is a Postgres `uuid` column. A non-UUID string passed through
// to a `where(eq(policies.id, ?))` query triggers a 22P02 invalid-text-
// representation error → unhandled exception → Next.js 500. Validating
// here keeps the typed ActionState contract intact for ANY malformed
// input, not just empty strings.
//
// ADR-028 — `PolicyIdSchema` is the SHARED branded Zod schema imported from
// `@/lib/policies/types`. Previously this file had its own local
// `z.string().uuid()`. The shared schema brands the parsed value as
// `PolicyId`, so `parsed.data.policyId` (in EditPublishedSchema /
// UpdateDraftSchema below) carries the brand into the orchestrator calls
// downstream. Single source of truth — see ADR-028 § Decision.

// CR-PR3-postreview-v3 — same idea for users.id (also a Postgres `uuid`).
// `reviewerId` flows into the WorkflowStages row inside submitForReview;
// a malformed string would trigger the same 22P02 path. Nullable because
// the assigned-reviewer field is optional.
const OptionalReviewerIdSchema = z.string().uuid().nullable();

/**
 * Read the policyId field out of FormData. Returns `null` if missing,
 * malformed, OR not a valid UUID — caller MUST return
 * `{ ok: false, error: 'Invalid action payload.' }` so the typed
 * ActionState contract holds (D-09). Throwing here would bypass each
 * action's try/catch and surface as a Next.js 500 (CR-PR3-#18 +
 * CR-PR3-#23 — UUID enforcement extends the same idea to type-level).
 */
function policyIdFrom(formData: FormData): PolicyId | null {
  const raw = formData.get('policyId');
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  // ADR-028: `safeParse(id).data` carries the `PolicyId` brand (see
  // `@/lib/policies/types`). Returning `parsed.data` lifts the raw
  // string into the branded nominal type so downstream orchestrator
  // calls receive the right type without a separate cast.
  const parsed = PolicyIdSchema.safeParse(id);
  if (parsed.success) return parsed.data;
  // CR-PR3-postreview-v2 (CodeRabbit follow-up): log non-sensitive
  // diagnostics ONLY — length + reason. Earlier version included an
  // 8-char sample of the rejected value to help ops triage honest-typo
  // vs active tamper, but CR correctly flagged that even truncated
  // samples can carry identifiers (e.g. a stolen UUID prefix is still
  // grep-able). Length alone distinguishes the common cases:
  //   - length 0     → missing field / empty form value
  //   - length < 36  → form scaffold typo
  //   - length = 36  → wrong-format string of the right size
  //   - length > 36  → likely active fuzzing
  // The action's typed `{ ok: false, error: 'Invalid action payload.' }`
  // return is the user-facing surface; this log line is server-side
  // observability only.
  console.warn(
    `[policyAction] rejected non-UUID policyId — length=${id.length}`,
  );
  return null;
}

const INVALID_PAYLOAD: ActionState = { ok: false, error: 'Invalid action payload.' };

/**
 * Map an orchestrator error to ActionState:
 *   - IllegalTransitionError → { ok: false, error: err.message }
 *   - anything else → rethrow so Next.js' error boundary handles it.
 *
 * The state-machine's error message already encodes the UI-SPEC format
 * for the Sonner toast ("Cannot {verb} from {from} status. Allowed next
 * steps: {list}."), so we surface it untouched.
 */
function handleTransitionError(err: unknown): ActionState {
  if (err instanceof IllegalTransitionError) {
    return { ok: false, error: err.message };
  }
  throw err;
}

/**
 * After any successful transition, refresh:
 *   - /policies (list view + status filters)
 *   - /policies/[id] (the policy detail page that fired the action)
 *   - /dashboard (status-count tiles depend on this)
 */
function revalidateAfter(policyId: string): void {
  revalidatePath('/policies');
  revalidatePath(`/policies/${policyId}`);
  revalidatePath('/dashboard');
}

// ---- Pure transition actions (delegate to orchestrators) -------------

/** draft → under_review. Optional reviewerId for the WorkflowStages row. */
export async function submitForReviewAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  // Treat empty / whitespace-only as "no reviewer assigned"; otherwise the
  // value must round-trip as a UUID (matches OptionalReviewerIdSchema).
  const rawReviewerId = String(formData.get('reviewerId') ?? '').trim();
  const reviewerIdParsed = OptionalReviewerIdSchema.safeParse(
    rawReviewerId.length > 0 ? rawReviewerId : null,
  );
  if (!reviewerIdParsed.success) {
    // CR-PR3-postreview-v4 — breadcrumb log so a bad reviewerId is
    // distinguishable from a bad policyId in ops triage (both paths
    // return the same INVALID_PAYLOAD to the client). Length-only
    // matches the policyIdFrom privacy posture documented above.
    console.warn(
      `[submitForReviewAction] rejected non-UUID reviewerId — length=${rawReviewerId.length}`,
    );
    return INVALID_PAYLOAD;
  }
  const reviewerId = reviewerIdParsed.data;
  try {
    await submitForReview(policyId, reviewerId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

/** under_review → published. Delegates to publish() (same snapshot semantics). */
export async function approveAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  try {
    await approve(policyId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

/** under_review → draft. Optional reason field (currently log-only). */
export async function rejectAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  const reason = String(formData.get('reason') ?? '') || undefined;
  try {
    await reject(policyId, reason);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

/** draft|under_review → published. Snapshot-and-flip in one transaction. */
export async function publishAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  try {
    await publish(policyId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

/** published → archived. Status flip only. */
export async function archiveAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  try {
    await archive(policyId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

/** archived → draft. Status flip only. */
export async function restoreAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  try {
    await restore(policyId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);
  return { ok: true };
}

// ---- editPublished + updateDraft (need extra payload validation) -----

// Re-declare the structural TipTap shape (sibling new/actions.ts has its
// own copy with all five fields; here we only need type + content for the
// generateHTML round-trip).
const ContentJsonSchema = z
  .object({
    type: z.string(),
    content: z.array(z.unknown()).optional(),
  })
  .passthrough();

const EditPublishedSchema = z.object({
  policyId: PolicyIdSchema, // CR-PR3-#23 — UUID, not just non-empty
  content_json: z
    .string()
    .min(1)
    .transform((s, ctx) => {
      try {
        return ContentJsonSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid content JSON',
        });
        return z.NEVER;
      }
    }),
  changeSummary: z.string().max(200).optional(),
});

/**
 * published → draft (atomic snapshot + overwrite + version bump).
 *
 * Parses content_json from FormData. Malformed JSON → generic "Invalid
 * edit payload." (matches UI-SPEC error-states table for Zod failures).
 * Delegates to lib/policies/transitions.ts editPublished which owns the
 * single-tx snapshot-and-flip logic per D-04 + L-05.
 */
export async function editPublishedAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = EditPublishedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Invalid edit payload.' };
  try {
    await editPublished(
      parsed.data.policyId,
      parsed.data.content_json,
      parsed.data.changeSummary,
    );
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(parsed.data.policyId);
  return { ok: true };
}

const UpdateDraftSchema = z.object({
  policyId: PolicyIdSchema, // CR-PR3-#23 — UUID, not just non-empty
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(50).optional(),
  content_json: z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s) return undefined;
      try {
        return ContentJsonSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid content JSON',
        });
        return z.NEVER;
      }
    }),
});

/**
 * In-place edit of a Draft policy (D-04). NOT a state transition — bypasses
 * lib/policies/transitions.ts entirely, calls Policies.updateDraft directly
 * inside withOrgScope so the application-layer where(eq(orgId)) AND the
 * Postgres RLS policy both fire. Per ADR-019/023/025.
 *
 * Accepts ONLY title/category/contentJson — status is intentionally absent
 * (T-03-07-01: status changes can ONLY happen through transition actions
 * → orchestrators → state-machine). A forged `status` field in FormData
 * would be silently dropped by .safeParse.
 */
export async function updateDraftAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = UpdateDraftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Invalid update payload.' };
  const { policyId, title, category, content_json } = parsed.data;
  const patch: { title?: string; category?: string; contentJson?: unknown } = {};
  if (title !== undefined) patch.title = title;
  if (category !== undefined) patch.category = category;
  if (content_json !== undefined) patch.contentJson = content_json;
  // CR-PR3-postreview-v4 — bail when the client form normalizes to an
  // empty patch (only `policyId`, or fields whose Zod transform
  // collapsed to undefined — see content_json.transform above). The
  // repository's updateDraft (lib/db/repositories/policies.ts:113-117)
  // does `.set({ ...patch, updatedAt: sql\`now()\` })`, so an empty
  // patch is NOT an empty UPDATE — the SET clause is never empty.
  // Without this guard the UPDATE bumps `updated_at`, `.returning()`
  // yields the row, revalidatePath fires, and the user sees a
  // successful "saved" for a no-op change. The distinct error string
  // (`No changes to save.` vs the upstream Zod-fail
  // `Invalid update payload.`) keeps logs/Sentry diagnostic-able and
  // surfaces an actionable message to the user.
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No changes to save.' };
  }
  try {
    const ctx = await getOrgContext();
    await withOrgScope(ctx, async (s) => {
      await Policies.updateDraft(s, policyId, patch);
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[updateDraftAction] failed: ${detail}`);
    return { ok: false, error: 'Could not save changes. Please try again.' };
  }
  revalidateAfter(policyId);
  return { ok: true };
}
