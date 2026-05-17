// lib/db/repositories/departments.ts
// L-03 + D-06: per-aggregate Departments repository.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { departments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type DepartmentCreateInput = Omit<
  typeof departments.$inferInsert,
  'orgId' | 'id'
>;

export const Departments = {
  listAll: (s: OrgScope) =>
    s.tx.select().from(departments).where(eq(departments.orgId, s.orgId)),

  create: (_s: OrgScope, _input: DepartmentCreateInput) => {
    throw new Error('Not yet implemented — Phase 3+ (admin department management)');
  },
};
