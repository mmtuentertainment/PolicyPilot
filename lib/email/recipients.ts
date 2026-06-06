import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';

export async function resolveRecipientEmail(
  clerkUserId: string,
): Promise<string | null> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  return (
    user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? null
  );
}
