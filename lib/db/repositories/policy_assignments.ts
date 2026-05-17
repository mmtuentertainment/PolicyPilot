// lib/db/repositories/policy_assignments.ts
// L-03 + D-06: per-aggregate PolicyAssignments repository.
// D-02: INSERT copies scope.orgId into the row.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyAssignments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type PolicyAssignmentCreateInput = Omit<
  typeof policyAssignments.$inferInsert,
  'orgId' | 'id' | 'assignedAt'
>;

export const PolicyAssignments = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(policyAssignments)
      .where(eq(policyAssignments.orgId, s.orgId)),

  listForPolicy: (s: OrgScope, policyId: string) =>
    s.tx
      .select()
      .from(policyAssignments)
      .where(
        and(
          eq(policyAssignments.orgId, s.orgId),
          eq(policyAssignments.policyId, policyId),
        ),
      ),

  create: (_s: OrgScope, _input: PolicyAssignmentCreateInput) => {
    throw new Error('Not yet implemented — Phase 5 (Employee Portal — bulk assign)');
  },
};
