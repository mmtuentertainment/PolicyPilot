import { createClerkClient } from '@clerk/backend';
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
(async () => {
  const u = await clerk.users.getUser('user_3DpHee4nr7qw6lgoBR7cFQ2b2iy');
  console.log(JSON.stringify({ id: u.id, email: u.primaryEmailAddress?.emailAddress, publicMetadata: u.publicMetadata }, null, 2));
})();
