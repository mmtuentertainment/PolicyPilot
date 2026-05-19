// pnpm verify:phase-2 — runs the D-08 6-check chain + D-03a stale-null audit.
// Failures are accumulated; the summary prints the full failure set.
//
// Checks (D-08):
//   1. tsc --noEmit — zero errors (catches type-test regressions from D-07)
//   2. drizzle-kit migrate against the TEST DB — idempotent re-apply
//   3. scripts/check-db-imports.ts — L-05 raw-`db` allow-list
//   4. scripts/check-rls.ts — L-06 cross-org property test
//   5. scripts/check-schema.ts — D-08 step 5 schema audit
//   6. scripts/check-artifacts.ts — file-existence + content assertions
//      (extended for Phase 2)
//   7. (bonus, RESEARCH Pitfall 5) stale-null users audit
//
// Invocation: this script is spawned by `pnpm verify:phase-2`, which loads
// `.env.local` via `tsx --env-file=.env.local`. The TEST DB URLs live in
// `.env.local` under the `_TEST` suffix (DATABASE_URL_TEST, DIRECT_URL_TEST).
// For step 2 (migrate against TEST DB), we override DATABASE_URL/DIRECT_URL
// to the _TEST values via spawnSync's env field — drizzle.config.ts reads
// the canonical env names, so the override is transparent.
import { spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import postgres from 'postgres';

// CVE-2024-27980: spawning .cmd/.bat with `shell:false` errors on Node
// 20.12.2+. Route through `process.execPath` + the tool's JS entry so
// argv stays static and `shell:false` holds. Same pattern as
// scripts/check-foundation.ts.
const NODE_BIN = process.execPath;
const TSC_ENTRY = resolvePath(process.cwd(), 'node_modules/typescript/bin/tsc');
const TSX_ENTRY = resolvePath(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
const DRIZZLE_KIT_ENTRY = resolvePath(process.cwd(), 'node_modules/drizzle-kit/bin.cjs');

type Result = { ok: boolean; label: string; detail?: string };

/**
 * Logs a numbered check result to stdout in the format "[idx/total] OK/FAIL — label — detail".
 *
 * @param idx - 1-based index of the check
 * @param total - total number of checks
 * @param r - Result object whose `ok`, `label`, and optional `detail` are used for output
 */
function logResult(idx: number, total: number, r: Result): void {
  const status = r.ok ? 'OK  ' : 'FAIL';
  const detail = r.detail ? ` — ${r.detail}` : '';
  console.log(`[${idx}/${total}] ${status} — ${r.label}${detail}`);
}

/**
 * Return the first non-empty trimmed line from the input string.
 *
 * @param s - The input string to search for non-empty lines
 * @returns The first non-empty line after trimming whitespace, or an empty string if none exist
 */
function firstNonEmptyLine(s: string): string {
  return s.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
}

/**
 * Runs a Node child process with the given arguments and returns a unified `Result` describing success or failure.
 *
 * @param args - Argument vector passed to the Node executable
 * @param label - Short human-readable label used in the returned `Result`
 * @param extraEnv - Optional environment variables that override `process.env` for the child process
 * @returns A `Result` where `ok` is `true` when the child exits with status 0; otherwise `ok` is `false` and `detail` is the first non-empty line from the child process's stderr/stdout or a fallback message of the form "`<label> exited <status>`"
 */
function runChild(args: string[], label: string, extraEnv?: Record<string, string>): Result {
  const result = spawnSync(NODE_BIN, args, {
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...extraEnv },
  });
  if (result.status === 0) {
    return { ok: true, label };
  }
  const detail = firstNonEmptyLine(`${result.stderr ?? ''}\n${result.stdout ?? ''}`);
  return {
    ok: false,
    label,
    detail: detail || `${label} exited ${result.status ?? 'unknown'}`,
  };
}

/**
 * Verifies the repository typechecks with zero TypeScript errors.
 *
 * @returns A Result whose `ok` is `true` when `tsc --noEmit` exits successfully; otherwise `ok` is `false` and `detail` contains the first non-empty line of the compiler output or an exit status message.
 */
function checkTypecheck(): Result {
  return runChild([TSC_ENTRY, '--noEmit'], 'tsc --noEmit zero errors');
}

/**
 * Runs the drizzle-kit migration command targeting the test database defined by the `_TEST` environment variables.
 *
 * If `DATABASE_URL_TEST` or `DIRECT_URL_TEST` is missing, returns a failure `Result` describing the missing setup.
 * Otherwise overrides `DATABASE_URL` and `DIRECT_URL` with the `_TEST` values and invokes the migration command against the test DB.
 *
 * @returns A `Result` where `ok` is `true` when the migration command exits successfully; `ok` is `false` and `detail` contains diagnostic text when the environment is misconfigured or the migration fails.
 */
function checkMigrateTest(): Result {
  // Override DATABASE_URL + DIRECT_URL to the _TEST values so drizzle.config.ts
  // (which reads the canonical names) routes migrations to the TEST DB. The
  // _TEST values themselves come from `.env.local` (loaded by the parent
  // `tsx --env-file=.env.local` invocation in package.json verify:phase-2).
  const dbTest = process.env.DATABASE_URL_TEST;
  const directTest = process.env.DIRECT_URL_TEST;
  if (!dbTest || !directTest) {
    return {
      ok: false,
      label: 'drizzle-kit migrate against TEST DB (idempotent)',
      detail: 'DATABASE_URL_TEST and/or DIRECT_URL_TEST not set in .env.local (Plan 02-02 D-05)',
    };
  }
  return runChild(
    [TSX_ENTRY, DRIZZLE_KIT_ENTRY, 'migrate'],
    'drizzle-kit migrate against TEST DB (idempotent)',
    { DATABASE_URL: dbTest, DIRECT_URL: directTest },
  );
}

/**
 * Run the DB imports allow-list check using an AST-based script.
 *
 * @returns A `Result` whose `ok` is `true` if the check passed, `false` otherwise; when `ok` is `false`, `detail` contains diagnostic output. 
 */
function checkDbImports(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-db-imports.ts'],
    'L-05 — @/lib/db import allow-list (AST via ts-morph)',
  );
}

/**
 * Executes the cross-org RLS property test covering the positive case and the 10-table negative case.
 *
 * @returns The `Result` describing the check outcome — `ok` is `true` when the test passes, `false` otherwise; `detail` contains diagnostic text when the check fails.
 */
function checkRls(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-rls.ts'],
    'L-06 — cross-org RLS property test (positive + 10-table negative)',
  );
}

/**
 * Runs the schema audit that checks pg_catalog and information_schema for inconsistencies.
 *
 * @returns A `Result` whose `ok` is `true` if the audit passed, `false` otherwise; on failure `detail` contains diagnostic text. 
 */
function checkSchema(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-schema.ts'],
    'D-08 step 5 — schema audit (pg_catalog + information_schema)',
  );
}

/**
 * Checks for artifact regressions affecting Phase 1 and Phase 2.
 *
 * @returns A `Result` with `ok: true` if the artifact check passed, `ok: false` and a `detail` message if it failed.
 */
function checkArtifacts(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-artifacts.ts'],
    'Phase 1 + 2 artifact regression gate',
  );
}

/**
 * Audits the primary database for users whose `org_id` is NULL and were created more than 5 minutes ago.
 *
 * Checks `process.env.DATABASE_URL` to connect; if the variable is missing the function returns a failing `Result`.
 *
 * @returns A `Result` with `ok: true` when no stale rows are found; otherwise `ok: false` and `detail` contains either the count and comma-separated ids of stale users or an error message.
 */
async function checkStaleNullUsers(): Promise<Result> {
  // RESEARCH Pitfall 5: D-03a CHECK constraint allows users.org_id = NULL
  // within 5 minutes of created_at; after 5 min, the row is logically
  // invalid but Postgres doesn't re-evaluate CHECK on stable rows. This
  // audit finds them. Healthy DB returns 0 rows.
  const url = process.env.DATABASE_URL;
  if (!url) {
    return { ok: false, label: 'D-03a stale-null users audit', detail: 'DATABASE_URL not set' };
  }
  const sql = postgres(url, { prepare: false });
  try {
    const stale = await sql<{ id: string; clerk_user_id: string; created_at: Date }[]>`
      SELECT id, clerk_user_id, created_at
      FROM users
      WHERE org_id IS NULL AND created_at < now() - interval '5 minutes'
      LIMIT 10
    `;
    if (stale.length > 0) {
      const ids = stale.map((r) => r.id).join(', ');
      return {
        ok: false,
        label: 'D-03a stale-null users audit (RESEARCH Pitfall 5)',
        detail: `${stale.length} user row(s) NULL org_id past the 5-min window: ${ids}. Clerk webhook ordering broke — investigate.`,
      };
    }
    return { ok: true, label: 'D-03a stale-null users audit (0 stale rows)' };
  } catch (err) {
    return {
      ok: false,
      label: 'D-03a stale-null users audit',
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Orchestrates the Phase 2 data-layer verification by running the full sequence of checks, reporting each result, and terminating the process based on overall success.
 *
 * Runs the predefined set of verification checks in order, prints per-check status and a summary, and calls `process.exit(0)` when all checks pass or `process.exit(1)` if any check fails.
 */
async function main(): Promise<void> {
  console.log('─── Data Layer (Phase 2) — verification ───');
  console.log('');

  const results: Result[] = [];

  const c1 = checkTypecheck();
  results.push(c1);
  logResult(1, 7, c1);

  const c2 = checkMigrateTest();
  results.push(c2);
  logResult(2, 7, c2);

  const c3 = checkDbImports();
  results.push(c3);
  logResult(3, 7, c3);

  const c4 = checkRls();
  results.push(c4);
  logResult(4, 7, c4);

  const c5 = checkSchema();
  results.push(c5);
  logResult(5, 7, c5);

  const c6 = checkArtifacts();
  results.push(c6);
  logResult(6, 7, c6);

  const c7 = await checkStaleNullUsers();
  results.push(c7);
  logResult(7, 7, c7);

  console.log('');
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} of ${results.length} checks FAILED.`);
    for (const f of failed) {
      console.error(`  - ${f.label}${f.detail ? ` — ${f.detail}` : ''}`);
    }
    process.exit(1);
  }
  console.log(`✓ All ${results.length} checks passed. Phase 2 ready for /gsd-verify-work.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
