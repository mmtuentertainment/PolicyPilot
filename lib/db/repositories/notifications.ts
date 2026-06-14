// lib/db/repositories/notifications.ts
// L-03 + D-06: per-aggregate Notifications repository.
// D-02: INSERT copies scope.orgId into the row.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
//
// Phase 7 FK audit: cron calls repository methods with a synthesized
// OrgContext whose userId is intentionally empty. Notifications.create never
// writes s.userId; it injects only s.orgId. reminder_sends.user_id is sourced
// from the candidate recipient row, not from the scoped caller.
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

  create: (s: OrgScope, input: NotificationCreateInput) =>
    s.tx
      .insert(notifications)
      .values({ ...input, orgId: s.orgId })
      .returning(),

  markRead: (s: OrgScope, id: string) =>
    s.tx
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.orgId, s.orgId), eq(notifications.id, id)))
      .returning({ id: notifications.id }),

  markAllReadForUser: (s: OrgScope, userId: string) =>
    s.tx
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.orgId, s.orgId),
          eq(notifications.userId, userId),
          eq(notifications.read, false),
        ),
      )
      .returning({ id: notifications.id }),
};
