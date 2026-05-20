// Add user_3Dxws7hVqT3L96hXzIwpBnXJIum (JIum / mmtuproperties) as an admin
// member of org_3DxxQMgv1IiklJ0XtevTd7yyTtc (mmtu entertainment) in Clerk.
// After this, the user's next session will have the org as active and
// /dashboard will load.
//
// Side effect: Clerk will fire organizationMembership.created webhook for
// JIum → org. Our handler is idempotent (D-03b clerk_events ON CONFLICT
// DO NOTHING + UPDATE users SET org_id is a no-op when already linked).
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const JIUM_USER_ID = 'user_3Dxws7hVqT3L96hXzIwpBnXJIum';
const ORG_ID = 'org_3DxxQMgv1IiklJ0XtevTd7yyTtc';

(async () => {
  // Confirm current state before the membership call.
  const existing = await clerk.organizations.getOrganizationMembershipList({
    organizationId: ORG_ID,
  });
  const already = existing.data.find((m) => m.publicUserData?.userId === JIUM_USER_ID);
  if (already) {
    console.log(`User ${JIUM_USER_ID} already a member of ${ORG_ID} as ${already.role}.`);
    process.exit(0);
  }

  console.log(`Creating membership: ${JIUM_USER_ID} → ${ORG_ID} as admin…`);
  const membership = await clerk.organizations.createOrganizationMembership({
    organizationId: ORG_ID,
    userId: JIUM_USER_ID,
    role: 'org:admin',
  });
  console.log(`Done. Membership id: ${membership.id}`);
})();
