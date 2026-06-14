'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Notifications } from '@/lib/db/repositories/notifications';

export type NotificationActionState =
  | { ok: true }
  | { ok: false; error: string };

const MarkReadSchema = z.object({
  id: z.string().min(1),
  persona: z.enum(['admin', 'employee']),
});

const MarkAllSchema = z.object({
  persona: z.enum(['admin', 'employee']),
});

function revalidateForPersona(persona: 'admin' | 'employee'): void {
  revalidatePath(persona === 'admin' ? '/dashboard' : '/my-policies');
}

export async function markNotificationReadAction(
  _prev: NotificationActionState | undefined,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = MarkReadSchema.safeParse({
    id: formData.get('id'),
    persona: formData.get('persona'),
  });
  if (!parsed.success) return { ok: false, error: 'Invalid action payload.' };

  const ctx = await getOrgContext();
  try {
    await withOrgScope(ctx, (s) =>
      Notifications.markRead(s, parsed.data.id),
    );
  } catch (err) {
    console.error('[markNotificationReadAction] failed', {
      idLength: parsed.data.id.length,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { ok: false, error: 'Could not update notification.' };
  }

  revalidateForPersona(parsed.data.persona);
  return { ok: true };
}

export async function markAllNotificationsReadAction(
  _prev: NotificationActionState | undefined,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = MarkAllSchema.safeParse({
    persona: formData.get('persona'),
  });
  if (!parsed.success) return { ok: false, error: 'Invalid action payload.' };

  const ctx = await getOrgContext();
  try {
    await withOrgScope(ctx, (s) =>
      Notifications.markAllReadForUser(s, ctx.userId),
    );
  } catch (err) {
    console.error('[markAllNotificationsReadAction] failed', {
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { ok: false, error: 'Could not update notifications.' };
  }

  revalidateForPersona(parsed.data.persona);
  return { ok: true };
}
