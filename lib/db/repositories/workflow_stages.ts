// lib/db/repositories/workflow_stages.ts
// L-03 + D-06: per-aggregate WorkflowStages repository.
// D-02: INSERT copies scope.orgId into the row.
// Phase 3 Plan 03-04 (D-11): real bodies for recordSubmission +
//   recordDecision + listForPolicy. The Phase 2 `create` throw-stub is
//   removed — orchestrators (Plan 03-06) call recordSubmission directly.
// RESEARCH Pitfall 6: NO raw `db` barrel import. See policies.ts header.
//
// SCHEMA NOTE — adaptation flagged in 03-04-SUMMARY:
//   The schema (lib/db/schema.ts) does NOT have `stageName` or
//   `completedAt` columns. It has `stageOrder` (integer) and
//   `reviewedAt` (timestamp). The plan body explicitly authorizes
//   adapting to the on-disk schema (do not add a migration in this
//   plan). The semantics map cleanly:
//     plan stageName: 'review' → stageOrder: 1 (single stage today;
//       multi-stage Growth+ workflows will bump the order when shipped)
//     plan completedAt: now()  → reviewedAt: now() (same lifecycle slot)
//   Phase 3.1 follow-up: if multi-stage workflows arrive, add a text
//   `stageName` migration and update this repository.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { workflowStages, policies } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

export const WorkflowStages = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(workflowStages)
      .where(eq(workflowStages.orgId, s.orgId)),

  listPendingForReviewer: (s: OrgScope, reviewerId: string) =>
    s.tx
      .select()
      .from(workflowStages)
      .where(
        and(
          eq(workflowStages.orgId, s.orgId),
          eq(workflowStages.reviewerId, reviewerId),
          eq(workflowStages.status, 'pending'),
        ),
      ),

  /**
   * Phase 9 (R-017 / D-09-01) — shared org review queue: every PENDING stage in
   * the org, joined to its policy title + status, ordered by stage order DESC.
   * Feeds the /reviewer queue. MVP uses a SHARED queue (any reviewer or admin
   * can action any pending review) rather than per-reviewer assignment — the
   * per-reviewer `listPendingForReviewer` seam above is retained for a future
   * reviewer-assignment-UI follow-up. Scoped by orgId on BOTH tables (+ RLS).
   */
  listPendingForOrg: (s: OrgScope) =>
    s.tx
      .select({
        stageId: workflowStages.id,
        policyId: workflowStages.policyId,
        policyTitle: policies.title,
        policyStatus: policies.status,
        comment: workflowStages.comment,
      })
      .from(workflowStages)
      .innerJoin(
        policies,
        and(
          eq(policies.id, workflowStages.policyId),
          eq(policies.orgId, s.orgId),
          // Phase 9 review (belt-and-suspenders) — only surface stages whose policy
          // is actively under_review. With the reject() supersede fix a pending stage
          // should never outlive its policy's under_review state, but this guarantees
          // the shared queue can never present a non-actionable item (pairs with the
          // decision-time status guard in recordReviewDecision).
          eq(policies.status, 'under_review'),
        ),
      )
      .where(
        and(
          eq(workflowStages.orgId, s.orgId),
          eq(workflowStages.status, 'pending'),
        ),
      )
      .orderBy(desc(workflowStages.stageOrder)),

  /**
   * INSERT a workflow row when a draft enters under_review. reviewerId
   * is nullable per schema — Growth+ workflows that assign a specific
   * reviewer pass a uuid; Starter (no workflow gate) passes null.
   * stageOrder: 1 represents the single review stage today; see schema
   * note in header for the multi-stage Phase 3.1 follow-up.
   */
  recordSubmission: (
    s: OrgScope,
    policyId: PolicyId,
    reviewerId: string | null,
  ) =>
    s.tx
      .insert(workflowStages)
      .values({
        orgId: s.orgId,
        policyId,
        stageOrder: 1,
        reviewerId,
        status: 'pending',
      })
      .returning(),

  /**
   * FIX-B (Phase 9 adversarial review) — supersede every still-PENDING stage of a
   * policy (status 'pending' → 'superseded'). Called by submitForReview BEFORE
   * recordSubmission so each submit cycle starts clean with AT MOST one pending
   * stage. Without it, the admin reject() path (which flips only policies.status
   * to draft and LEAVES the pending workflow_stages row) lets
   * submit→admin-reject→edit→resubmit accumulate TWO pending stages — which wedges
   * the publish completeness gate (pending>0 forever) and is undrainable from the
   * reviewer UI (it surfaces only the first pending). 'superseded' is
   * projection-only: it is NOT 'pending', so it neither blocks the publish gate
   * nor appears in the /reviewer queue (both filter status='pending'), and it
   * writes NO review_decisions ledger row (it is not a reviewer decision). The
   * status column is plain text (no enum/CHECK), so 'superseded' needs no migration.
   */
  supersedePending: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .update(workflowStages)
      .set({ status: 'superseded', reviewedAt: sql`now()` })
      .where(
        and(
          eq(workflowStages.orgId, s.orgId),
          eq(workflowStages.policyId, policyId),
          eq(workflowStages.status, 'pending'),
        ),
      )
      .returning(),

  /**
   * Approve or reject a PENDING stage row of a SPECIFIC policy. Stamps
   * reviewedAt = now() (the schema's lifecycle column; see header note re:
   * completedAt).
   *
   * FIX-A (Phase 9 adversarial review) — the WHERE now binds orgId AND policyId
   * AND id AND status='pending'. The original orgId+id form (T-03-04-04) let a
   * same-org reviewer/admin POST a (policyId=B, stageId=A's-pending-stage)
   * mismatch and flip/strand a SIBLING policy's stage + write a misattributed
   * immutable ledger row. Binding policyId makes a cross-policy stageId a 0-row
   * update; binding status='pending' makes an already-decided stage a 0-row
   * update (no re-flipping a settled stage). The caller (recordReviewDecision)
   * asserts returning().length > 0 BEFORE the ledger insert, so any mismatch
   * rolls the whole tx back with no ledger row and no sibling-policy change.
   */
  recordDecision: (
    s: OrgScope,
    policyId: PolicyId,
    stageId: string,
    decision: 'approved' | 'rejected',
    comment?: string,
  ) =>
    s.tx
      .update(workflowStages)
      .set({
        status: decision,
        comment: comment ?? null,
        reviewedAt: sql`now()`,
      })
      .where(
        and(
          eq(workflowStages.orgId, s.orgId),
          eq(workflowStages.policyId, policyId),
          eq(workflowStages.id, stageId),
          eq(workflowStages.status, 'pending'),
        ),
      )
      .returning(),

  /**
   * Workflow trail for a single policy, scoped by orgId AND policyId,
   * ordered by stage order DESC (most-recent / highest-order first).
   * `workflowStages` has no createdAt column today — stageOrder is the
   * canonical sequencing field. Feeds reviewer audit views.
   */
  listForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .select()
      .from(workflowStages)
      .where(
        and(
          eq(workflowStages.orgId, s.orgId),
          eq(workflowStages.policyId, policyId),
        ),
      )
      .orderBy(desc(workflowStages.stageOrder)),
};
