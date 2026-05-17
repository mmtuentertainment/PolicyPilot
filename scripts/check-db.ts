// Phase 1 success criterion 4: Supabase client connects via Drizzle.
// Runs `select 1` and prints OK on success. Invoked by `pnpm check:db`.
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

async function main(): Promise<void> {
  try {
    const rows = await db.execute(sql`select 1 as ok`);
    // postgres-js result shape: array-like with column accessors.
    // Drizzle's execute returns a `Row[]`-compatible array; the row at [0]
    // exposes columns by name. With `noUncheckedIndexedAccess`, rows[0] is
    // possibly-undefined — narrow before reading.
    //
    // IN-03 (01-REVIEW) fix: replace `(first as { ok?: number }).ok !== 1`
    // with proper `in` + `typeof` narrowing. Expresses the actual invariant
    // ("did postgres return a column named `ok` with numeric value 1?")
    // without a type assertion that bypasses the unknown narrowing.
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
