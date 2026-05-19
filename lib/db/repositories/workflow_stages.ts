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
import { workflowStages } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

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
   * INSERT a workflow row when a draft enters under_review. reviewerId
   * is nullable per schema — Growth+ workflows that assign a specific
   * reviewer pass a uuid; Starter (no workflow gate) passes null.
   * stageOrder: 1 represents the single review stage today; see schema
   * note in header for the multi-stage Phase 3.1 follow-up.
   */
  recordSubmission: (
    s: OrgScope,
    policyId: string,
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
   * Approve or reject a pending stage row. Stamps reviewedAt = now()
   * (the schema's lifecycle column; see header note re: completedAt).
   * WHERE includes BOTH orgId AND id (T-03-04-04 mitigation —
   * no row updated by id alone).
   */
  recordDecision: (
    s: OrgScope,
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
          eq(workflowStages.id, stageId),
        ),
      )
      .returning(),

  /**
   * Workflow trail for a single policy, scoped by orgId AND policyId,
   * ordered by stage order DESC (most-recent / highest-order first).
   * `workflowStages` has no createdAt column today — stageOrder is the
   * canonical sequencing field. Feeds reviewer audit views.
   */
  listForPolicy: (s: OrgScope, policyId: string) =>
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
