// pnpm verify:phase-1 — runs the ROADMAP success criteria for this phase.
// Failures are accumulated; the summary prints the full failure set.
import { spawnSync } from "node:child_process";
import { resolve as resolvePath } from "node:path";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// CVE-2024-27980: spawning .cmd/.bat with `shell:false` errors on Node
// 20.12.2+. Route through `process.execPath` + the tool's JS entry so
// argv stays static and `shell:false` holds.
const NODE_BIN = process.execPath;
const TSC_ENTRY = resolvePath(process.cwd(), "node_modules/typescript/bin/tsc");
const TSX_ENTRY = resolvePath(process.cwd(), "node_modules/tsx/dist/cli.mjs");

type Result = { ok: boolean; label: string; detail?: string };

function logResult(idx: number, total: number, r: Result): void {
  const status = r.ok ? "OK  " : "FAIL";
  const detail = r.detail ? ` — ${r.detail}` : "";
  console.log(`[${idx}/${total}] ${status} — ${r.label}${detail}`);
}

// Callers concat stderr first, then stdout (`${stderr}\n${stdout}`) so the
// "first non-empty line" deterministically favours stderr when both produce
// output — keeps failure summaries terse and ordered by likely-cause.
function firstNonEmptyLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

function checkTypecheck(): Result {
  const result = spawnSync(NODE_BIN, [TSC_ENTRY, "--noEmit"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 0) {
    return { ok: true, label: "tsc --noEmit zero errors" };
  }
  const detail = firstNonEmptyLine(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
  return {
    ok: false,
    label: "tsc --noEmit zero errors",
    detail: detail || "tsc failed",
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
  // Delegate to `scripts/check-db.ts` so the `server-only` guard on
  // `lib/db/index.ts` stays intact — `--conditions=react-server` is
  // applied in the child only.
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
  // postgres-js error messages mention host + port but not the password
  // portion of the URL (T-04-06 / T-05-02 mitigation). Surface only the
  // first non-empty line of combined stderr+stdout.
  const detail = firstNonEmptyLine(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
  return {
    ok: false,
    label: "Drizzle select 1 round-trip",
    detail: detail || `check:db exited ${result.status ?? "unknown"}`,
  };
}

async function main(): Promise<void> {
  console.log("─── Foundation — verification ───");
  console.log(`App URL: ${APP_URL}`);
  console.log("");

  const results: Result[] = [];

  const c1 = checkTypecheck();
  results.push(c1);
  logResult(1, 6, c1);

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

  const c3a = await checkHttp(
    "/sign-in",
    200,
    "GET /sign-in returns 200 (Clerk SignIn mount)",
  );
  results.push(c3a);
  logResult(3, 6, c3a);

  const c3b = await checkHttp(
    "/sign-up",
    200,
    "GET /sign-up returns 200 (Clerk SignUp mount)",
  );
  results.push(c3b);
  logResult(4, 6, c3b);

  const c4 = checkSelectOne();
  results.push(c4);
  logResult(5, 6, c4);

  console.log("");
  console.log("─── Middleware redirect check ───");
  // Plan 03-02 L-03 / REG-P1-01: the Phase 1 placeholder at /sign-in-success
  // was deleted and replaced by the Server Component trampoline at
  // /post-sign-in (app/(auth)/post-sign-in/page.tsx). Unauthenticated
  // requests still funnel through middleware.ts and bounce to /sign-in
  // (the trampoline lives behind the auth chokepoint).
  const c5 = await checkRedirect(
    "/post-sign-in",
    "/sign-in",
    "Middleware redirects /post-sign-in → /sign-in unauthenticated",
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
  console.log(`✓ All ${results.length} checks passed.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
