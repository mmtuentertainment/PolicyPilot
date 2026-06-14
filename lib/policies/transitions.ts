// lib/policies/transitions.ts
// Plan 03-06 Task 2 (GREEN) — server-only orchestrators (D-03 + D-04 + L-05).
//
// These 7 functions are the AUTHORITATIVE gate for every policy state
// change. Plan 03-07's Server Actions are thin wrappers; the real
// transactional business logic lives here. Each orchestrator:
//   1. Resolves OrgContext via getOrgContext (Clerk session)
//   2. Requires admin role before any DB/AI side effect.
//   3. Opens withOrgScope (one Drizzle transaction + SET LOCAL ROLE
//      authenticated + set_config('request.jwt.claims', ..., true) so
//      Supabase RLS evaluates against the actual ctx.orgId — ADR-025).
//   4. Loads the policy via Policies.findById (which already filters by
//      scope.orgId — defense in depth alongside RLS).
//   5. Validates the requested transition via canTransition; throws
//      IllegalTransitionError on illegal moves.
//   6. Performs any side-effects (PolicyVersions.create snapshot for
//      publish/editPublished/approve; WorkflowStages.recordSubmission for
//      submitForReview) AND the policies row update inside the SAME
//      transaction — so a partial write is impossible (T-03-06-02).
//
// Defense-in-depth: state machine + repository orgId-scope + Postgres RLS
// all fire on every transition. Removing any one layer keeps the other
// two; corrupting any one layer is caught by tests/types.ts (L-05) or
// scripts/check-rls.ts (Phase 2 / Plan 02-06).
//
// L-05 invariant: editPublished + publish + approve write NEW
// policy_versions rows via PolicyVersions.create — they NEVER update or
// delete existing rows. The PolicyVersions repository does not even
// export update/delete (Plan 03-04 / tests/types.ts @ts-expect-error).
//
// MUST NOT import raw `db` from '@/lib/db' — use withOrgScope's s.tx
// for any direct policies-table updates. scripts/check-db-imports.ts
// (Phase 2) enforces this at CI; the file's path is NOT in ALLOWLIST.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, sql } from 'drizzle-orm';
import { withOrgScope, type OrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { requireReviewerOrAdminFromCtx } from '@/lib/auth/require-reviewer';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { WorkflowStages } from '@/lib/db/repositories/workflow_stages';
import { ReviewDecisions } from '@/lib/db/repositories/review_decisions';
import { Notifications } from '@/lib/db/repositories/notifications';
import { Reminders } from '@/lib/db/repositories/reminders';
import { policies } from '@/lib/db/schema';
import { checkTierLimit } from '@/lib/stripe/products';
import { generateSummaryForPolicy } from '@/lib/ai/summary';
import { sendNotificationEmail } from '@/lib/email/send';
import { resolveRecipientEmail } from '@/lib/email/recipients';
import { acknowledgeUrl } from '@/lib/email/urls';
import {
  canTransition,
  IllegalTransitionError,
  type PolicyStatus,
} from './state-machine';
import {
  PolicyNotFoundError,
  WorkflowIncompleteError,
  StageNotActionableError,
} from './errors';
import type { PolicyId } from './types';

// Narrowed row shape returned by Policies.findById. The drizzle column
// types come back as `string` for status and `unknown` for contentJson
// (jsonb) — we cast through this internal shape so the orchestrators
// stay typed against the policy lifecycle.
type PolicyRow = {
  id: string;
  title: string;
  status: PolicyStatus;
  currentVersion: number;
  contentJson: unknown;
  reviewIntervalMonths: number | null;
};

async function getAdminOrgContext() {
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);
  return ctx;
}

/**
 * Phase 9 (R-017 / D-09-01) — resolve OrgContext and require reviewer OR admin.
 * Used by recordReviewDecision. Admins are admitted because §13(d) allows
 * self-approval (no separation-of-duties).
 */
async function getReviewerOrAdminOrgContext() {
  const ctx = await getOrgContext();
  requireReviewerOrAdminFromCtx(ctx);
  return ctx;
}

/**
 * Common "load + validate transition" sequence. Runs inside an already-
 * opened OrgScope; returns the loaded policy on success. Throws:
 *  - PolicyNotFoundError when the WHERE org_id + id miss (D-30 typed
 *    error per Plan 05-02; was `Error('Policy not found')` until Plan
 *    05-08 widened check-error-discipline.ts to scan lib/policies/**)
 *  - IllegalTransitionError when canTransition(from, to) is false
 *
 * Both throws abort the surrounding withOrgScope transaction, rolling
 * back any earlier writes in this orchestrator call.
 */
async function loadAndAssertTransition(
  s: OrgScope,
  policyId: PolicyId,
  to: PolicyStatus,
): Promise<PolicyRow> {
  const rows = await Policies.findById(s, policyId);
  const row = rows[0];
  if (!row) throw new PolicyNotFoundError(policyId);
  const policy: PolicyRow = {
    id: row.id,
    title: typeof row.title === 'string' ? row.title : 'Policy',
    status: row.status as PolicyStatus,
    currentVersion: row.currentVersion,
    contentJson: row.contentJson,
    reviewIntervalMonths: row.reviewIntervalMonths ?? 12,
  };
  if (!canTransition(policy.status, to)) {
    throw new IllegalTransitionError(policy.status, to);
  }
  return policy;
}

/**
 * draft → under_review. Also writes a workflow_stages row so the
 * (future) reviewer surface (Phase 6+) can pick it up. Single tx; if
 * either write fails, both roll back.
 */
export async function submitForReview(
  policyId: PolicyId,
  reviewerId: string | null,
): Promise<void> {
  const ctx = await getAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'under_review');
    // FIX-B (Phase 9 review): supersede any stale pending stage from a prior cycle
    // BEFORE recording the new submission, so each policy carries AT MOST one
    // pending stage. The admin reject() path leaves a pending row behind; without
    // this, submit→admin-reject→edit→resubmit would accumulate 2 pending stages and
    // wedge the publish gate (pending>0) forever. 'superseded' is projection-only —
    // no ledger row, and the publish gate + reviewer queue both ignore it.
    await WorkflowStages.supersedePending(s, policyId);
    // ADR-028: use the branded `policyId` (already in scope) rather than
    // `policy.id` (DB-row field typed as raw string) — semantically
    // identical (`policy.id` comes from a query keyed on `policyId`),
    // structurally cleaner because the orchestrator already holds the
    // branded form. Avoids needing a type cast on the row.
    await WorkflowStages.recordSubmission(s, policyId, reviewerId);
    await s.tx
      .update(policies)
      .set({ status: 'under_review', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * under_review → published. Identical D-04 snapshot semantics to publish()
 * — Phase 6 will gate this separately from publish() (approve will require
 * reviewer-tier; publish will be Starter-direct). Kept as a thin wrapper
 * over the publish() body so the snapshot-and-flip logic stays in one
 * place during Phase 3.
 */
export async function approve(policyId: PolicyId): Promise<void> {
  await publish(policyId);
}

/**
 * under_review → draft (reject the submission). Does NOT touch
 * policy_versions — versions only track the published lineage (D-04).
 */
export async function reject(policyId: PolicyId, _reason?: string): Promise<void> {
  void _reason;

  const ctx = await getAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'draft');
    // Phase 9 review fix (queue hygiene at the source) — supersede this policy's
    // still-pending stage as the admin sends it back to draft. Without it the
    // pending workflow_stages row is orphaned (policy=draft, stage=pending): it
    // lingers in the shared /reviewer queue (listPendingForOrg) where a reviewer
    // could Approve it, appending a contradictory row to the immutable
    // review_decisions ledger of a DRAFT policy. Mirrors submitForReview's supersede;
    // 'superseded' is projection-only (no ledger row, ignored by both the publish
    // gate and the reviewer queue).
    await WorkflowStages.supersedePending(s, policyId);
    await s.tx
      .update(policies)
      .set({ status: 'draft', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * Phase 9 (R-017 / D-09-01) — record a reviewer's decision on a workflow stage.
 * Reviewer-OR-admin scope (§13(d) allows self-approval). One transaction:
 *   1. mutate the workflow_stages projection (drives the /reviewer queue), AND
 *   2. append an immutable review_decisions ledger row (audit trail — ②b), AND
 *   3. on 'rejected' ONLY, return the policy to draft (under_review → draft) so
 *      the admin can revise + resubmit.
 * On 'approved' the policy STAYS under_review; the admin publishes separately
 * (the publish() gate then passes). The ledger's reviewerId is the ACTUAL
 * approver (s.userId), independent of any workflow_stages.reviewerId assignment.
 *
 * Atomicity: all three steps run in ONE withOrgScope transaction. If the reject
 * transition is illegal (policy not under_review) the IllegalTransitionError
 * rolls back the decision + ledger writes too — no partial state.
 */
export async function recordReviewDecision(
  policyId: PolicyId,
  stageId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<void> {
  const ctx = await getReviewerOrAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    // Phase 9 review fix (audit-ledger integrity) — the policy must be actively
    // `under_review` at decision time for BOTH approve and reject. Loaded ONCE here
    // so both branches are guarded uniformly. This defends the immutable
    // review_decisions ledger from recording a decision against a policy that the
    // admin reject() path returned to draft while its pending stage lingered in the
    // shared queue (the s19 review defect). A non-under_review policy → throw
    // StageNotActionableError BEFORE any stage mutation or ledger insert, so the whole
    // tx rolls back with ZERO rows. (under_review→draft for the reject branch below is
    // always a legal transition, so no further canTransition check is needed there.)
    const policyRows = await Policies.findById(s, policyId);
    const policy = policyRows[0];
    if (!policy || policy.status !== 'under_review') {
      throw new StageNotActionableError(policyId);
    }
    // FIX-A (Phase 9 review): recordDecision now binds policyId + status='pending'
    // in its WHERE, so a crafted (policyId=B, stageId=A's-pending) POST or an
    // already-decided stage hits ZERO rows. Assert that BEFORE the ledger insert
    // so the whole tx rolls back with no misattributed immutable ledger row and
    // no sibling-policy strand.
    const updated = await WorkflowStages.recordDecision(s, policyId, stageId, decision, comment);
    if (updated.length === 0) throw new StageNotActionableError(policyId);
    await ReviewDecisions.record(s, {
      policyId,
      stageId,
      reviewerId: s.userId,
      decision,
      comment: comment ?? null,
    });
    if (decision === 'rejected') {
      await s.tx
        .update(policies)
        .set({ status: 'draft', updatedAt: sql`now()` })
        .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
    }
  });
}

/**
 * draft → published OR under_review → published (D-04, REQ-policy-
 * lifecycle SC#2). Atomically:
 *   1. Snapshot the about-to-be-published content into policy_versions
 *      (versionNumber = current policies.current_version, createdBy =
 *      ctx.userId — the as-published vN row that future
 *      acknowledgments.policy_version_id will FK to).
 *   2. Flip policies.status = 'published'. currentVersion stays put —
 *      the just-snapshot value IS vN; the next edit-published will bump
 *      to v(N+1).
 * Both steps inside one withOrgScope tx — partial state impossible.
 */
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getAdminOrgContext();
  // Phase 9 (R-017 / D-09-01) — read the org's approval-workflow entitlement
  // BEFORE opening the scope (D-37 pattern: tier reads use the raw-db helper,
  // not s.tx). Starter → allowed:false → the completeness gate below is skipped
  // (direct publish unchanged). Growth+ → allowed:true → gate enforced.
  const approvalWorkflow = await checkTierLimit(ctx.orgId, 'approvalWorkflows');
  const publishedPolicy = await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    // Phase 9 (R-017 / D-09-01) — tier-aware approval-workflow completeness
    // gate. Lives INSIDE publish() so it also covers approve() (the literal
    // alias below), closing the publish-leak. §13(c) require-submission-first:
    if (approvalWorkflow.allowed) {
      // (i) Growth+ may publish ONLY from under_review — direct draft→published
      //     is blocked. This ALSO closes the stale-approval leak: a restored +
      //     edited policy is 'draft', so an OLD approved stage from a prior
      //     cycle cannot satisfy the gate; the admin must resubmit for review.
      if (policy.status !== 'under_review') {
        throw new WorkflowIncompleteError(policyId, 0, 0);
      }
      // (ii) The current review cycle must be complete: >=1 approved, 0 pending.
      const stages = await WorkflowStages.listForPolicy(s, policyId);
      const pending = stages.filter((st) => st.status === 'pending').length;
      const approved = stages.filter((st) => st.status === 'approved').length;
      if (pending > 0 || approved < 1) {
        throw new WorkflowIncompleteError(policyId, pending, approved);
      }
    }
    // D-04: create policy_versions row capturing the about-to-be-published
    // content. L-05: append-only — PolicyVersions doesn't even export
    // update/delete, so this cannot accidentally mutate prior rows.
    // ADR-028: pass the branded `policyId` (orchestrator input) into
    // PolicyVersions.create's branded `policyId` field — `policy.id` is
    // the same value but typed as raw `string` from the DB row.
    await PolicyVersions.create(s, {
      policyId,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: s.userId,
    });
    const publishedAt = new Date();
    const nextReviewDate = new Date(publishedAt);
    nextReviewDate.setUTCMonth(
      nextReviewDate.getUTCMonth() + (policy.reviewIntervalMonths ?? 12),
    );
    await s.tx
      .update(policies)
      .set({
        status: 'published',
        updatedAt: sql`now()`,
        // Phase 7 D-08: forward-only writer; no backfill for existing rows.
        nextReviewDate,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
    return {
      title: policy.title,
      currentVersion: policy.currentVersion,
    };
  });

  if (publishedPolicy.currentVersion > 1) {
    await emitPolicyUpdatedNotifications(ctx, policyId);
  }

  // Phase 4 D-19 + SPEC R3 — post-commit AI auto-trigger.
  //
  // Runs OUTSIDE the state-transition withOrgScope (i.e., after the transaction commits)
  // so a flaky Anthropic call cannot roll back the publish. The summary helper opens its
  // own withOrgScope for the ai_generations INSERT + policies.tldrSummary UPDATE.
  //
  // Graceful-degrade scope: only Anthropic.APIError is swallowed (D-19 — Anthropic
  // hiccups must not affect the published state; admin regenerates via the
  // "Regenerate TL;DR" button). Non-Anthropic errors (TierLimitExceededError,
  // BootstrapError, TypeError from a refactor bug, etc.) are RE-THROWN so they
  // surface in error monitoring. Without this narrowing, a programming bug in
  // generateSummaryForPolicy would silently corrupt every publish indefinitely.
  //
  // D-36 PII-safe log — Anthropic.APIError is sanitized to {name, status, code}; raw
  // error.message could contain the org's API-key prefix or policy content.
  //
  // SP-3 (Nyquist sub-path) — lib/policies/transitions.test.ts D-19 block verifies
  // both the graceful-degrade path (Anthropic.APIError) AND the propagation path
  // (non-Anthropic Error).
  try {
    await generateSummaryForPolicy(policyId, ctx);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      // PR #15 type-design review: read `error.type` (typed ErrorType | null on
      // APIError, per @anthropic-ai/sdk/core/error.d.ts:13) instead of
      // `error.error?.type`, which propagates `any` because TError defaults to
      // Object | undefined and .type isn't on that generic shape.
      console.error('[publish] summary failed (anthropic)', {
        policyId,
        error: { name: error.name, status: error.status, code: error.type },
      });
      return;
    }
    if (error instanceof Error) {
      console.error('[publish] summary failed (non-anthropic, propagating)', {
        policyId,
        error: { name: error.name, message: error.message.slice(0, 120) },
      });
    }
    throw error;
  }
}

async function emitPolicyUpdatedNotifications(
  ctx: Awaited<ReturnType<typeof getAdminOrgContext>>,
  policyId: PolicyId,
): Promise<void> {
  try {
    const recipients = await withOrgScope(ctx, (s) =>
      Reminders.listRecipientsForPolicy(s, policyId),
    );
    for (const recipient of recipients) {
      await withOrgScope(ctx, (s) =>
        Notifications.create(s, {
          userId: recipient.userId,
          type: 'policy_updated',
          payloadJson: {
            policyId: recipient.policyId,
            policyTitle: recipient.policyTitle,
            versionNumber: recipient.versionNumber,
          },
          read: false,
        }),
      );
      const email = await resolveRecipientEmail(recipient.clerkUserId);
      if (!email) continue;
      await sendNotificationEmail('policy_updated', email, {
        policyTitle: recipient.policyTitle,
        orgName: recipient.orgName,
        acknowledgeUrl: acknowledgeUrl(recipient.policyId),
      });
    }
  } catch (err) {
    console.error('[publish] policy_updated emission failed', {
      // Phase 7 D-04: event types are not gated by reminder_sends; the
      // policy_versions unique constraint naturally gates real republishes.
      event: 'policy_updated_emission_error',
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
  }
}

/**
 * published → archived. Just a status flip; no snapshot, no version bump
 * (the published vN row already exists in policy_versions from the
 * publish() call that landed it).
 */
export async function archive(policyId: PolicyId): Promise<void> {
  const ctx = await getAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'archived');
    await s.tx
      .update(policies)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * archived → draft. Does NOT create a version row, but DOES bump
 * currentVersion so the next publish writes v(N+1) — mirrors the
 * editPublished() invariant. Without this bump, a republish after restore
 * would re-snapshot at the same version_number, producing a duplicate row
 * in policy_versions (03-G3 T1 closure — diagnosed at
 * .planning/debug/duplicate-policy-version.md).
 *
 * The schema-level UNIQUE(policy_id, version_number) added in 03-G3 T2/T3
 * is the belt-and-suspenders backstop; this orchestrator-level bump is
 * the primary fix because it preserves the semantic intent that
 * restore→republish is a NEW version event (auditors expect a new vN row).
 */
export async function restore(policyId: PolicyId): Promise<void> {
  const ctx = await getAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'draft');
    await s.tx
      .update(policies)
      .set({
        status: 'draft',
        currentVersion: policy.currentVersion + 1,
        updatedAt: sql`now()`,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * Editing a Published policy (REQ-policy-lifecycle SC#3 + L-05). Atomic:
 *   1. Snapshot the CURRENT (still-published) contentJson + currentVersion
 *      into policy_versions (the as-of-publish vN snapshot is preserved
 *      EVEN AFTER the admin starts editing — what acknowledgments
 *      pointed at stays intact). changeSummary is optional admin copy.
 *   2. Overwrite policies.contentJson with newContent, reset status to
 *      'draft', and bump currentVersion (the next publish writes v(N+1)).
 *
 * ALLOWED_TRANSITIONS allows `under_review → draft` (reject), so
 * canTransition('under_review', 'draft') would return true here — but
 * THIS orchestrator is the published → draft path specifically. The
 * belt-and-suspenders `policy.status !== 'published'` check rejects
 * any other source (T-03-06-04 mitigation; tested explicitly via the
 * draft-status test case which canTransition('draft', 'draft') already
 * rejects, and would otherwise be a phantom version row).
 */
export async function editPublished(
  policyId: PolicyId,
  newContent: unknown,
  changeSummary?: string,
): Promise<void> {
  const ctx = await getAdminOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'draft');
    if (policy.status !== 'published') {
      throw new IllegalTransitionError(policy.status, 'draft');
    }
    // No snapshot needed here: publish() already wrote a
    // policy_versions row for `versionNumber = policy.currentVersion` when
    // this policy was originally published. Re-writing the same
    // (policy_id, version_number) pair would violate the 03-G3 T2 UNIQUE
    // constraint added to policy_versions and 23505 the editPublished flow.
    // We just bump currentVersion + reset to draft; the next publish() will
    // write the new vN+1 row from policies.currentVersion as the snapshot.
    // changeSummary is carried into the next publish via a different path
    // (operator can re-enter it before re-publishing) — Phase 3 originally
    // expected the snapshot here; the publish-side snapshot was added later
    // (03-G3 era) and the duplicate path was missed at the time.
    void changeSummary;
    await s.tx
      .update(policies)
      .set({
        contentJson: newContent,
        status: 'draft',
        currentVersion: policy.currentVersion + 1,
        updatedAt: sql`now()`,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}
