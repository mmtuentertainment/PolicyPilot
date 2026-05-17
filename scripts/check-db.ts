// pnpm check:db — Drizzle smoke check, runs `select 1` against Supabase.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main(): Promise<void> {
  try {
    const rows = await db.execute(sql`select 1 as ok`);
    // noUncheckedIndexedAccess: rows[0] is Row | undefined. The `&& "ok" in
    // first` narrows before reading; the unknown→number equality check
    // covers absent row, missing column, wrong type, and wrong value in one.
    const first = rows[0];
    const okValue = first && "ok" in first ? first.ok : undefined;
    if (okValue !== 1) {
      console.error("Unexpected result from `select 1`");
      process.exit(1);
    }
    console.log("OK");
    process.exit(0);
  } catch (err) {
    console.error(
      `Drizzle smoke check failed: ${
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      }`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
