// lib/db/repositories/workflow_stages.ts
// L-03 + D-06: per-aggregate WorkflowStages repository.
// D-02: INSERT copies scope.orgId into the row.
// Phase 3 (Growth+ workflows) + Phase 6 (Reviewer role tier gate) fill bodies.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { workflowStages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type WorkflowStageCreateInput = Omit<
  typeof workflowStages.$inferInsert,
  'orgId' | 'id'
>;

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

  create: (_s: OrgScope, _input: WorkflowStageCreateInput) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI — workflows)');
  },
};
