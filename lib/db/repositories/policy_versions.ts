// lib/db/repositories/policy_versions.ts
// L-03 + D-06: per-aggregate PolicyVersions repository.
//
// D-02 (denormalization invariant): INSERT methods MUST copy scope.orgId
// into the row directly. Do NOT re-read the parent policy's org_id —
// that's a redundant query AND opens a window for transient inconsistency.
// The FK + RLS catch a cross-org mismatch at insert time.
//
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyVersions } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type PolicyVersionCreateInput = Omit<
  typeof policyVersions.$inferInsert,
  'orgId' | 'id' | 'createdAt'
>;

export const PolicyVersions = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.orgId, s.orgId)),

  listForPolicy: (s: OrgScope, policyId: string) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policyId),
        ),
      ),

  // Phase 3 fills body. INSERT copies scope.orgId into the row (D-02).
  create: (_s: OrgScope, _input: PolicyVersionCreateInput) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },
};
