// lib/db/repositories/notifications.ts
// L-03 + D-06: per-aggregate Notifications repository.
// D-02: INSERT copies scope.orgId into the row.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { notifications } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type NotificationCreateInput = Omit<
  typeof notifications.$inferInsert,
  'orgId' | 'id' | 'createdAt'
>;

export const Notifications = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(notifications)
      .where(eq(notifications.orgId, s.orgId)),

  listUnreadForUser: (s: OrgScope, userId: string) =>
    s.tx
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.orgId, s.orgId),
          eq(notifications.userId, userId),
          eq(notifications.read, false),
        ),
      ),

  create: (_s: OrgScope, _input: NotificationCreateInput) => {
    void _s;
    void _input;
    throw new Error('Not yet implemented — Phase 7 (Crons + Email)');
  },

  markRead: (_s: OrgScope, _id: string) => {
    void _s;
    void _id;
    throw new Error('Not yet implemented — Phase 7 (Crons + Email)');
  },
};
