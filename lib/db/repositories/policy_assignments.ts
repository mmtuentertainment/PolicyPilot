// lib/db/repositories/policy_assignments.ts
// L-03 + D-06: per-aggregate PolicyAssignments repository.
// D-02: INSERT copies scope.orgId into the row.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyAssignments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

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

  listForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .select()
      .from(policyAssignments)
      .where(
        and(
          eq(policyAssignments.orgId, s.orgId),
          eq(policyAssignments.policyId, policyId),
        ),
      ),

  /**
   * Phase 5 D-15 — bulk-assignment writer with DB-enforced idempotency.
   * Returns the inserted array — length 1 on a fresh assignment, length 0
   * on duplicate (the UNIQUE fired + ON CONFLICT DO NOTHING swallowed the
   * row). Caller Server Action (Plan 05-06 bulkAssignToDepartmentAction)
   * treats `length === 0` as "already assigned" silent success.
   *
   * orgId comes from OrgScope (NEVER from input — defense against
   * cross-org writes; the composite FK on users(org_id, department_id) →
   * departments(org_id, id) already blocks cross-org dept assignment at
   * the Postgres level).
   */
  create: async (s: OrgScope, input: PolicyAssignmentCreateInput) => {
    const inserted = await s.tx
      .insert(policyAssignments)
      .values({ ...input, orgId: s.orgId })
      // D-15 — UNIQUE(policy_id, assignee_type, assignee_id) from migration
      // 0010 fires. UNIQUE permits BOTH (user, X) and (department, X) rows
      // for same policy (different assignee_type); D-01 SELECT DISTINCT
      // dedupes at query time when a user is targeted both individually
      // and via their department.
      .onConflictDoNothing()
      .returning();
    return inserted;
  },
};
