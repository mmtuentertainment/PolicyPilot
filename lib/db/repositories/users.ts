// lib/db/repositories/users.ts
// L-03 + D-06: per-aggregate Users repository.
//
// D-03a: users.orgId may be null briefly between user.created and
// organizationMembership.created webhook events. The repository's
// happy-path methods filter by scope.orgId, so unmapped users never
// appear in same-org queries — they're invisible until the membership
// webhook fires and the CHECK constraint's 5-minute window closes.
//
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { users } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

// Omits `orgId` so callers cannot supply it — repository implementation
// must copy `scope.orgId` into the new row (matches the pattern used by
// policy_versions / workflow_stages / acknowledgments).
type UserCreateInput = Omit<
  typeof users.$inferInsert,
  'id' | 'orgId' | 'createdAt'
>;

export const Users = {
  listAll: (s: OrgScope) =>
    s.tx.select().from(users).where(eq(users.orgId, s.orgId)),

  findByClerkUserId: (s: OrgScope, clerkUserId: string) =>
    s.tx
      .select()
      .from(users)
      .where(
        and(eq(users.orgId, s.orgId), eq(users.clerkUserId, clerkUserId)),
      )
      .limit(1),

  // Phase 3+ — note: user creation from Clerk webhook uses RAW db (the
  // webhook handler is allow-listed per ADR-023). User creation from
  // app code (admin invites another user, etc.) goes through here.
  create: (_s: OrgScope, _input: UserCreateInput) => {
    throw new Error('Not yet implemented — Phase 3+ (admin user management)');
  },
};
