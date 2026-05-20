// Dump Clerk's view of the user: orgs they belong to, last active org, sessions.
import { createClerkClient } from '@clerk/backend';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(conn);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

(async () => {
  const userRows: { clerk_user_id: string }[] = await db.execute(
    sql`select clerk_user_id from users`,
  );
  const clerkUserId = userRows[0]!.clerk_user_id;

  const user = await clerk.users.getUser(clerkUserId);
  console.log('=== Clerk user ===');
  console.log(JSON.stringify({
    id: user.id,
    publicMetadata: user.publicMetadata,
    lastActiveAt: user.lastActiveAt,
    primaryEmailAddress: user.primaryEmailAddress?.emailAddress,
    createOrganizationEnabled: user.createOrganizationEnabled,
  }, null, 2));

  const memberships = await clerk.users.getOrganizationMembershipList({ userId: clerkUserId });
  console.log('\n=== Clerk org memberships ===');
  console.log(JSON.stringify(memberships.data.map(m => ({
    id: m.id,
    role: m.role,
    organization: { id: m.organization.id, name: m.organization.name, slug: m.organization.slug },
  })), null, 2));

  const sessions = await clerk.sessions.getSessionList({ userId: clerkUserId });
  console.log('\n=== All sessions (any status) ===');
  console.log(JSON.stringify(sessions.data.map(s => ({
    id: s.id,
    status: s.status,
    lastActiveOrganizationId: s.lastActiveOrganizationId,
    createdAt: new Date(s.createdAt).toISOString(),
    expireAt: new Date(s.expireAt).toISOString(),
  })), null, 2));

  await conn.end();
})();
