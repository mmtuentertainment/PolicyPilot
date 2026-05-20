// One-off: revoke all active Clerk sessions for the single user in our DB so
// the next request forces Clerk to mint a fresh session — which will pick up
// the user's single org membership as the active org (Clerk's default
// behavior when a user belongs to exactly one org).
//
// SAFE to run only when exactly one user exists.
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
  if (userRows.length !== 1) {
    console.error(`SAFETY: expected exactly 1 user, found ${userRows.length}. Refusing.`);
    process.exit(1);
  }
  const clerkUserId = userRows[0]!.clerk_user_id;
  console.log(`Revoking active sessions for ${clerkUserId}…`);
  const sessions = await clerk.sessions.getSessionList({ userId: clerkUserId, status: 'active' });
  console.log(`Found ${sessions.totalCount} active session(s).`);
  for (const s of sessions.data) {
    await clerk.sessions.revokeSession(s.id);
    console.log(`  ✓ revoked ${s.id}`);
  }
  console.log('Done. Refresh the browser and sign in again to get a fresh session with the org active.');
  await conn.end();
})();
