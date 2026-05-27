// lib/db/repositories/departments.ts
// L-03 + D-06: per-aggregate Departments repository.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
//
// Phase 5 Plan 05-06: listAll() gains alphabetical ordering by name (asc)
// so the PolicyAssignmentsPanel dept selector renders a stable, predictable
// dropdown order regardless of dept-creation order. The org-scoped
// `eq(orgId)` predicate is the application-layer half of the ADR-019
// defense; the Postgres RLS policy on the departments table is the
// last line of defense.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { departments } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

type DepartmentCreateInput = Omit<
  typeof departments.$inferInsert,
  'orgId' | 'id'
>;

export const Departments = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(departments)
      .where(eq(departments.orgId, s.orgId))
      .orderBy(asc(departments.name)),

  findById: (s: OrgScope, id: string) =>
    s.tx
      .select()
      .from(departments)
      .where(and(eq(departments.orgId, s.orgId), eq(departments.id, id)))
      .limit(1),

  create: (_s: OrgScope, _input: DepartmentCreateInput) => {
    void _s;
    void _input;
    throw new Error('Not yet implemented — Phase 3+ (admin department management)');
  },
};
