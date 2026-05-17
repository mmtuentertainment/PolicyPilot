// Server-only. Do NOT import from a Client Component — this module reads
// server-only env vars (DATABASE_URL) and instantiates a Postgres connection.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.local.example to .env.local and " +
      "paste the Supabase Transaction pooler URI (port 6543) per D-06.",
  );
}

// prepare: false is required by Supabase's Transaction pooler (port 6543).
// The pooler routes each query through a fresh connection and does not
// support prepared statement caching. See D-06.
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export type Database = typeof db;
