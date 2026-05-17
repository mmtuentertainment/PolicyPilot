// pnpm check:db — Drizzle smoke check, runs `select 1` against Supabase.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main(): Promise<void> {
  try {
    const rows = await db.execute(sql`select 1 as ok`);
    // noUncheckedIndexedAccess: narrow rows[0] via `in` + `typeof` before
    // reading `.ok` (no cast — preserves the unknown-narrowing invariant).
    const first = rows[0];
    if (
      !first ||
      !("ok" in first) ||
      typeof first.ok !== "number" ||
      first.ok !== 1
    ) {
      console.error("Unexpected result from `select 1`");
      process.exit(1);
    }
    console.log("OK");
    process.exit(0);
  } catch {
    console.error("Drizzle smoke check failed");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
