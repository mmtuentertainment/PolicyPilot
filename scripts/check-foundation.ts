// pnpm verify:phase-1 — runs all 5 ROADMAP Phase 1 success criteria.
//
// Invoked with `tsx --env-file=.env.local scripts/check-foundation.ts`. The
// `--env-file` flag populates process.env from .env.local so APP_URL and any
// other server-only values are visible here.
//
// Note on the Drizzle smoke check (criterion 4): rather than importing
// `@/lib/db` directly (which would force this script to also pass
// `--conditions=react-server` to defeat the `server-only` guard — see Plan
// 01-04 SUMMARY for the full story), we spawn `pnpm check:db` as a child
// process. That command was wired in Plan 01-04 specifically for this kind
// of out-of-Next.js context and already runs the `select 1` round-trip
// against the Supabase pooler. Reusing it keeps responsibilities crisp —
// `check:db` owns the DB-connectivity gate; this script orchestrates.
//
// USAGE
//   Terminal 1: pnpm dev               (waits until "Ready in …ms" on :3000)
//   Terminal 2: pnpm verify:phase-1
//
// The script runs all checks sequentially and exits 0 only if every one
// passes. Failures are accumulated and printed in a summary at the end so
// the operator sees the full failure set, not just the first.
import { spawnSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// IN-02 (01-REVIEW) — direct-Node spawn helpers (shell:false).
//
// `spawnSync('pnpm', [...], {shell:true})` works on Windows but joins argv
// into a single shell-interpreted command, leaving a future-injection
// footgun if anyone later parameterizes the args. The naive fix
// `spawnSync('pnpm.cmd', [...], {shell:false})` triggers `EINVAL` on
// Node 20.12.2+ / 22.x per CVE-2024-27980 — Windows refuses to spawn
// .cmd/.bat without a shell.
//
// The portable solution: skip pnpm entirely and spawn the underlying
// Node tools (tsc, tsx) via the current Node binary (`process.execPath`)
// with their resolved JS entry points. The args remain static literals,
// `shell:false` holds, and the .cmd-resolution problem disappears.
const NODE_BIN = process.execPath;
const TSC_ENTRY = resolvePath(process.cwd(), "node_modules/typescript/bin/tsc");
const TSX_ENTRY = resolvePath(process.cwd(), "node_modules/tsx/dist/cli.mjs");

type Result = { ok: boolean; label: string; detail?: string };

function logResult(idx: number, total: number, r: Result): void {
  const status = r.ok ? "OK  " : "FAIL";
  const detail = r.detail ? ` — ${r.detail}` : "";
  console.log(`[${idx}/${total}] ${status} — ${r.label}${detail}`);
}

function checkTypecheck(): Result {
  // IN-02 (01-REVIEW) fix: invoke `tsc` directly via Node (`process.execPath`
  // + node_modules/typescript/bin/tsc) instead of `pnpm tsc` through a shell.
  // shell:false removes the future-injection footgun without falling into
  // CVE-2024-27980's .cmd-spawn restriction. Static argv invariant preserved.
  const result = spawnSync(NODE_BIN, [TSC_ENTRY, "--noEmit"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 0) {
    return { ok: true, label: "tsc --noEmit zero errors" };
  }
  const firstLine = (result.stderr || result.stdout || "")
    .trim()
    .split("\n")[0];
  return {
    ok: false,
    label: "tsc --noEmit zero errors",
    detail: firstLine && firstLine.length > 0 ? firstLine : "tsc failed",
  };
}

async function checkHttp(
  path: string,
  expectedStatus: number,
  label: string,
  bodyAssertion?: (body: string) => boolean,
): Promise<Result> {
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status !== expectedStatus) {
      return {
        ok: false,
        label,
        detail: `expected ${expectedStatus}, got ${res.status}`,
      };
    }
    if (bodyAssertion) {
      const body = await res.text();
      if (!bodyAssertion(body)) {
        return {
          ok: false,
          label,
          detail: "body assertion failed (D-03 hero text missing)",
        };
      }
    }
    return { ok: true, label };
  } catch (err) {
    return {
      ok: false,
      label,
      detail:
        err instanceof Error
          ? `${err.name}: ${err.message}`
          : "fetch failed (is `pnpm dev` running?)",
    };
  }
}

async function checkRedirect(
  path: string,
  expectedLocation: string,
  label: string,
): Promise<Result> {
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status !== 307 && res.status !== 308 && res.status !== 302) {
      return {
        ok: false,
        label,
        detail: `expected 307 redirect, got ${res.status}`,
      };
    }
    const loc = res.headers.get("location") ?? "";
    if (!loc.includes(expectedLocation)) {
      return {
        ok: false,
        label,
        detail: `expected Location to include "${expectedLocation}", got "${loc}"`,
      };
    }
    return { ok: true, label };
  } catch (err) {
    return {
      ok: false,
      label,
      detail:
        err instanceof Error ? `${err.name}: ${err.message}` : "fetch failed",
    };
  }
}

function checkSelectOne(): Result {
  // Spawn `pnpm check:db` — the Plan 01-04 gate. It runs
  // `tsx --conditions=react-server --env-file=.env.local scripts/check-db.ts`
  // which executes `await db.execute(sql\`select 1 as ok\`)` and prints "OK"
  // on success / a single-line error and process.exit(1) on failure.
  //
  // Reusing this child process is intentional: it sidesteps the
  // `server-only` guard on `lib/db/index.ts` without forcing this script
  // (the orchestrator) to also opt into `--conditions=react-server`. The
  // surface contract — `select 1` round-trips — is the same; the gate is
  // just one process boundary away.
  //
  // IN-02 (01-REVIEW) fix: invoke `tsx` directly via Node (same pattern as
  // checkTypecheck above) and inline the flags that `pnpm check:db` passes —
  // see package.json: "check:db": "tsx --conditions=react-server
  // --env-file=.env.local scripts/check-db.ts". The contract is identical;
  // we just drop the shell-mediated pnpm layer. Static argv preserved.
  const result = spawnSync(
    NODE_BIN,
    [
      TSX_ENTRY,
      "--conditions=react-server",
      "--env-file=.env.local",
      "scripts/check-db.ts",
    ],
    {
      encoding: "utf8",
      shell: false,
    },
  );
  if (result.status === 0) {
    return { ok: true, label: "Drizzle select 1 round-trip" };
  }
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  // postgres-js error messages mention host + port but not the password
  // portion of the URL (T-04-06 / T-05-02 mitigation). We surface only the
  // first non-empty line to keep the failure summary terse.
  const lines = (stderr + "\n" + stdout)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const firstLine = lines[0];
  return {
    ok: false,
    label: "Drizzle select 1 round-trip",
    detail: firstLine ?? `check:db exited ${result.status ?? "unknown"}`,
  };
}

async function main(): Promise<void> {
  console.log("─── Phase 1 Foundation — verification ───");
  console.log(`App URL: ${APP_URL}`);
  console.log("");

  const results: Result[] = [];

  // Criterion 1: tsc --noEmit zero errors.
  const c1 = checkTypecheck();
  results.push(c1);
  logResult(1, 6, c1);

  // Criterion 2: landing page loads with the D-03 hero copy.
  const c2 = await checkHttp(
    "/",
    200,
    "GET / returns 200 with D-03 hero copy",
    (body) =>
      body.includes(
        "Policy management for SMBs that beats a Google Drive folder",
      ),
  );
  results.push(c2);
  logResult(2, 6, c2);

  // Criterion 3a: /sign-in renders (Clerk SignIn mount).
  const c3a = await checkHttp(
    "/sign-in",
    200,
    "GET /sign-in returns 200 (Clerk SignIn mount)",
  );
  results.push(c3a);
  logResult(3, 6, c3a);

  // Criterion 3b: /sign-up renders (Clerk SignUp mount).
  // Logged as supplemental to criterion 3 — the interactive half (completing
  // a sign-up) is the operator's checkpoint (Task 2 of Plan 01-05).
  const c3b = await checkHttp(
    "/sign-up",
    200,
    "GET /sign-up returns 200 (Clerk SignUp mount)",
  );
  results.push(c3b);
  logResult(4, 6, c3b);

  // Criterion 4: Drizzle `select 1` round-trip against Supabase pooler
  // (delegated to `pnpm check:db` — see checkSelectOne above).
  const c4 = checkSelectOne();
  results.push(c4);
  logResult(5, 6, c4);

  // Criterion 5: middleware redirects a private route to /sign-in for
  // unauthenticated visitors. `/sign-in-success` is the canonical private
  // placeholder (D-09); reaching it without a session must redirect.
  console.log("");
  console.log("─── Criterion 5 (middleware redirect) ───");
  const c5 = await checkRedirect(
    "/sign-in-success",
    "/sign-in",
    "Middleware redirects /sign-in-success → /sign-in unauthenticated",
  );
  results.push(c5);
  logResult(6, 6, c5);

  console.log("");
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} of ${results.length} checks FAILED.`);
    for (const f of failed) {
      console.error(`  - ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    process.exit(1);
  }
  console.log(
    `✓ All ${results.length} checks passed. Phase 1 ready for Phase 2.`,
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
