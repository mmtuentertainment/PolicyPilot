import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const conn = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(conn);

(async () => {
  const orgs = await db.execute(sql`select id, name, clerk_org_id, created_at from organizations order by created_at desc limit 3`);
  const users = await db.execute(sql`select id, role, org_id, clerk_user_id, department_id, created_at from users order by created_at desc limit 5`);
  const memberships = await db.execute(sql`select id, processed_at from clerk_events order by processed_at desc limit 10`);
  console.log('=== organizations (newest 3) ===');
  console.log(JSON.stringify(orgs, null, 2));
  console.log('=== users (newest 5) ===');
  console.log(JSON.stringify(users, null, 2));
  console.log('=== clerk_events (newest 10) ===');
  console.log(JSON.stringify(memberships, null, 2));
  await conn.end();
})();
