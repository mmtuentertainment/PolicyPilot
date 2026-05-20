// One-off manual recovery for the SF-W5 race we hit during Phase 3 live-smoke.
// The membership webhook short-circuited (known SF-W5 gap at
// app/api/webhooks/clerk/route.ts:237-244), so users.org_id stayed NULL and
// role stayed at 'employee'. This script:
//   1. Links the user to the org (sets users.org_id)
//   2. Promotes them to admin (sets users.role = 'admin' since they created the org)
//   3. Mirrors role onto Clerk publicMetadata (same path as CR-01 hotfix)
//
// SAFE to run only when:
//   - Exactly one organization exists
//   - Exactly one user exists
//   - That user's org_id is NULL OR matches the one org
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { createClerkClient } from '@clerk/backend';

const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(conn);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

(async () => {
  const orgRows: { id: string; name: string }[] = await db.execute(
    sql`select id, name from organizations`,
  );
  const userRows: {
    id: string;
    clerk_user_id: string;
    org_id: string | null;
    role: string;
  }[] = await db.execute(sql`select id, clerk_user_id, org_id, role from users`);
  if (orgRows.length !== 1) {
    console.error(`SAFETY: expected exactly 1 organization, found ${orgRows.length}. Refusing.`);
    process.exit(1);
  }
  if (userRows.length !== 1) {
    console.error(`SAFETY: expected exactly 1 user, found ${userRows.length}. Refusing.`);
    process.exit(1);
  }
  const org = orgRows[0]!;
  const user = userRows[0]!;
  if (user.org_id !== null && user.org_id !== org.id) {
    console.error(
      `SAFETY: user already linked to a different org (${user.org_id}); expected ${org.id}. Refusing.`,
    );
    process.exit(1);
  }

  // Step 1+2: DB write — link to org, promote to admin.
  console.log(
    `[1/3] DB: linking user ${user.clerk_user_id} → org ${org.id} (${org.name}), role 'admin'`,
  );
  await db.execute(
    sql`update users set org_id = ${org.id}::uuid, role = 'admin' where id = ${user.id}::uuid`,
  );

  // Step 3: Mirror role onto Clerk publicMetadata (matches CR-01 hotfix from Plan 02-07).
  console.log(`[2/3] Clerk: mirror publicMetadata.role = 'admin' on ${user.clerk_user_id}`);
  await clerk.users.updateUserMetadata(user.clerk_user_id, {
    publicMetadata: { role: 'admin' },
  });

  console.log(`[3/3] Done. User refresh-browser to pull new session claims.`);
  await conn.end();
})();
