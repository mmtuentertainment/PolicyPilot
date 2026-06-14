import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Notifications } from '@/lib/db/repositories/notifications';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  isNotificationType,
  type NotificationRow,
} from '@/components/notifications/notification-href';

export async function NotificationBellServer({
  persona,
}: {
  persona: 'admin' | 'employee';
}): Promise<React.JSX.Element> {
  const ctx = await getOrgContext();
  const unreadRows = await withOrgScope(ctx, (s) =>
    Notifications.listUnreadForUser(s, ctx.userId),
  );
  const unread: NotificationRow[] = unreadRows.flatMap((row) => {
    if (!isNotificationType(row.type)) return [];
    return [{
      id: row.id,
      type: row.type,
      payloadJson: row.payloadJson,
      read: row.read,
    }];
  });

  return (
    <NotificationBell unread={unread} count={unread.length} persona={persona} />
  );
}
