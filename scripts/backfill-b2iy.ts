// OPERATOR-APPROVED ONE-OFF (Phase 3 live-smoke recovery, 2026-05-19):
// Reconcile DB state with the actually-signed-in Clerk identity (b2iy).
// JIum is a leftover placeholder from cookies-state confusion; b2iy is the
// Clerk user who owns the org and is currently signed in.
//
// Three atomic steps:
//   1. DB: delete the JIum users row (placeholder, not in any Clerk session)
//   2. DB: insert the b2iy users row, linked to mmtu entertainment org, role=admin
//   3. Clerk: set b2iy publicMetadata.role = 'admin' (matches CR-01 dual-write)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { createClerkClient } from '@clerk/backend';

const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(conn);
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const JIUM_CLERK_ID = 'user_3Dxws7hVqT3L96hXzIwpBnXJIum';
const B2IY_CLERK_ID = 'user_3DpHee4nr7qw6lgoBR7cFQ2b2iy';
const ORG_DB_ID = '59d14320-7771-4964-a026-205b04b83277';

(async () => {
  const before = await db.execute(
    sql`select clerk_user_id, role, org_id from users order by created_at desc`,
  );
  console.log('=== Before ===');
  console.log(JSON.stringify(before, null, 2));

  console.log(`[1/3] DB: deleting placeholder JIum row…`);
  await db.execute(sql`delete from users where clerk_user_id = ${JIUM_CLERK_ID}`);

  console.log(`[2/3] DB: inserting b2iy row linked to org ${ORG_DB_ID} with role 'admin'…`);
  await db.execute(
    sql`insert into users (clerk_user_id, role, org_id) values (${B2IY_CLERK_ID}, 'admin', ${ORG_DB_ID}::uuid)`,
  );

  console.log(`[3/3] Clerk: setting publicMetadata.role='admin' on ${B2IY_CLERK_ID}…`);
  await clerk.users.updateUserMetadata(B2IY_CLERK_ID, {
    publicMetadata: { role: 'admin' },
  });

  const after = await db.execute(
    sql`select clerk_user_id, role, org_id from users order by created_at desc`,
  );
  console.log('=== After ===');
  console.log(JSON.stringify(after, null, 2));

  console.log('Done. Refresh browser (Ctrl+R) to pull a fresh session token with role/org claims.');
  await conn.end();
})();
