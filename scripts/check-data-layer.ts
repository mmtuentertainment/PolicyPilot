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

function logResult(idx: number, total: number, r: Result): void {
  const status = r.ok ? 'OK  ' : 'FAIL';
  const detail = r.detail ? ` — ${r.detail}` : '';
  console.log(`[${idx}/${total}] ${status} — ${r.label}${detail}`);
}

function firstNonEmptyLine(s: string): string {
  return s.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
}

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

function checkTypecheck(): Result {
  return runChild([TSC_ENTRY, '--noEmit'], 'tsc --noEmit zero errors');
}

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

function checkDbImports(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-db-imports.ts'],
    'L-05 — @/lib/db import allow-list (AST via ts-morph)',
  );
}

function checkRls(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-rls.ts'],
    'L-06 — cross-org RLS property test (positive + 10-table negative)',
  );
}

function checkSchema(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-schema.ts'],
    'D-08 step 5 — schema audit (pg_catalog + information_schema)',
  );
}

function checkArtifacts(): Result {
  return runChild(
    [TSX_ENTRY, 'scripts/check-artifacts.ts'],
    'Phase 1 + 2 artifact regression gate',
  );
}

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
