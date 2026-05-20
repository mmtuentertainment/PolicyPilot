// List sessions for BOTH Clerk users so we can see which identity is logged in.
import { createClerkClient } from '@clerk/backend';
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

(async () => {
  const users = await clerk.users.getUserList({ limit: 10 });
  for (const u of users.data) {
    const sessions = await clerk.sessions.getSessionList({ userId: u.id });
    const active = sessions.data.filter((s) => s.status === 'active');
    console.log(`User ${u.id} (${u.primaryEmailAddress?.emailAddress}):`);
    console.log(`  total sessions: ${sessions.totalCount}, active: ${active.length}`);
    for (const s of active) {
      console.log(`    ACTIVE sess ${s.id} created=${new Date(s.createdAt).toISOString()} lastActiveOrg=${s.lastActiveOrganizationId ?? 'null'}`);
    }
  }
})();
