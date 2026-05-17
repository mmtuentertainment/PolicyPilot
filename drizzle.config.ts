import type { Config } from "drizzle-kit";

// D-05: drizzle-kit migrations need a direct connection (port 5432).
// The Supabase Transaction pooler (port 6543) chokes on some DDL forms
// (CREATE INDEX CONCURRENTLY, certain ALTER TABLE variants). DIRECT_URL
// takes priority; DATABASE_URL is the back-compat fallback so local dev
// keeps working without operator action. Production CI must set DIRECT_URL.
const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = directUrl ?? databaseUrl;

if (!directUrl && databaseUrl) {
  console.warn(
    "DIRECT_URL not set; falling back to DATABASE_URL for migrations. " +
      "Migrations over a pgbouncer pool may fail on some DDL. See D-05.",
  );
}
if (!migrationUrl) {
  throw new Error(
    "DIRECT_URL or DATABASE_URL must be set for drizzle-kit. See D-05.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
  verbose: true,
  strict: true,
} satisfies Config;
