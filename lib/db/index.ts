// Server-only. Do NOT import from a Client Component — this module reads
// server-only env vars (DATABASE_URL) and instantiates a Postgres connection.
//
// LAZY INIT (Cause-B fix): the DATABASE_URL check + the Postgres client + the
// drizzle instance all defer to the FIRST property access on `db`, via a Proxy.
// Importing this module is therefore side-effect-free. This is required so
// Next 15's `next build` — which evaluates every route module during the
// "Collecting page data" phase — does not crash when DATABASE_URL is absent at
// build time (the failure mode: "Failed to collect page data for
// /api/ai/consistency/[batchId]"). The connection + the helpful error still
// happen on the first RUNTIME use of `db`. `export const dynamic` is NOT a
// substitute: Next still evaluates the module to read the directive, so only
// removing the import-time side effect is durable.
import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

let cached: Database | undefined;

function resolveDb(): Database {
  if (cached) return cached;
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
  cached = drizzle(client, { schema });
  return cached;
}

// Keep `export const db` (NOT a getDb() function) so all importers,
// every `vi.mock('@/lib/db')`, and the ADR-023 check-db-imports linter stay
// valid with zero call-site changes. The Proxy forwards property access to the
// lazily-resolved drizzle instance and binds methods so chained query-builder
// `this` (`db.select()...`, `db.transaction(...)`, `db.execute(...)`) stays
// correct.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = resolveDb();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return prop in (resolveDb() as object);
  },
});
