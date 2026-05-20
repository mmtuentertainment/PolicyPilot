// Look up the "mmtu entertainment" org in Clerk; list its members; show all
// Clerk users so we can identify the orphan b2iy.
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

(async () => {
  // List all orgs (should be very small in dev).
  const orgs = await clerk.organizations.getOrganizationList({ limit: 10 });
  console.log('=== All Clerk orgs ===');
  for (const o of orgs.data) {
    console.log(JSON.stringify({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdBy: o.createdBy,
      membersCount: o.membersCount,
    }));
    const mems = await clerk.organizations.getOrganizationMembershipList({ organizationId: o.id });
    console.log('  members:');
    for (const m of mems.data) {
      console.log('   ', JSON.stringify({
        userId: m.publicUserData?.userId,
        identifier: m.publicUserData?.identifier,
        role: m.role,
      }));
    }
  }

  // List all Clerk users.
  const users = await clerk.users.getUserList({ limit: 10 });
  console.log('\n=== All Clerk users ===');
  for (const u of users.data) {
    console.log(JSON.stringify({
      id: u.id,
      email: u.primaryEmailAddress?.emailAddress,
      createdAt: new Date(u.createdAt).toISOString(),
    }));
  }
})();
