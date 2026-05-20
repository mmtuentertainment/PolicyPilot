// pnpm check:artifacts — Phase 1 static-artifact regression gate.
//
// Re-asserts every plan-level `<verify><automated>` static substring/file
// check that previously ran only at execute-phase time, plus the
// security-side `server-only` and gitignore guards.
//
// Invoked by `pnpm verify:phase-1` (spawned via spawnSync from
// `scripts/check-foundation.ts`) so a single command catches regressions
// against any of the 5 plans' acceptance criteria — not just the 5
// ROADMAP success criteria proven by the HTTP probes.
//
// Operator's `secrets-never-in-chat` rule is honored: this script never
// reads or echoes secret values from `.env.local`. Sentinel-substring
// presence is checked with `String.includes` and only the boolean result
// (or the substring NAME — never the value) is surfaced on failure.
//
// USAGE
//   pnpm check:artifacts            (standalone)
//   pnpm verify:phase-1             (spawns this gate alongside the HTTP probes)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type Check = { ok: boolean; label: string; detail?: string };

const REPO_ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

function exists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

function ok(label: string): Check {
  return { ok: true, label };
}

function fail(label: string, detail: string): Check {
  return { ok: false, label, detail };
}

function assert(
  out: Check[],
  cond: boolean,
  label: string,
  detail: string,
): void {
  out.push(cond ? ok(label) : fail(label, detail));
}

// Strip line + block comments before regex-matching for `any` types so the
// English word "any" inside a sentence comment doesn't trigger a false
// positive in the three type-position regexes below.
function hasAnyType(source: string): boolean {
  const stripped = source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    /\bany\b\s*[:,)]/.test(stripped) ||
    /\bas\s+any\b/.test(stripped) ||
    /<any>/.test(stripped)
  );
}

// ─── Plan 01-01: scaffold + tsconfig hardening + deps + shadcn ─────────────

function checkPackageJsonShape(): Check[] {
  const out: Check[] = [];
  if (!exists("package.json")) {
    out.push(fail("package.json exists", "missing at repo root"));
    return out;
  }
  out.push(ok("package.json exists"));
  const pkg = read("package.json");

  assert(
    out,
    /"next":\s*"(?:\^|~)?15\./.test(pkg) || /"next":\s*"15\./.test(pkg),
    "package.json pins next@15.x (ADR-010)",
    "no '\"next\": \"15.' substring found",
  );
  assert(
    out,
    /"engines"\s*:\s*\{[^}]*"node"/.test(pkg),
    "package.json declares engines.node (ADR-022)",
    "engines.node not present",
  );

  // Stack-table dependencies (CLAUDE.md "Stack" section)
  for (const dep of [
    "@clerk/nextjs",
    "drizzle-orm",
    "postgres",
    "@supabase/supabase-js",
    "drizzle-kit",
    "tsx",
  ]) {
    assert(out, pkg.includes(`"${dep}"`), `package.json declares ${dep}`, "dependency missing");
  }

  // pnpm scripts that downstream gates depend on
  for (const scriptKey of ["verify:phase-1", "check:db", "check:artifacts", "typecheck"]) {
    assert(
      out,
      pkg.includes(`"${scriptKey}"`),
      `package.json scripts contains ${scriptKey}`,
      "script slot missing",
    );
  }

  assert(
    out,
    /"verify:phase-1"\s*:\s*"[^"]*tsx --env-file=\.env\.local scripts\/check-foundation\.ts[^"]*"/.test(
      pkg,
    ),
    "verify:phase-1 includes tsx --env-file=.env.local scripts/check-foundation.ts",
    "wiring missing (Plan 01-05 acceptance)",
  );
  assert(
    out,
    /"verify:phase-1"\s*:\s*"[^"]*check:artifacts[^"]*"/.test(pkg),
    "verify:phase-1 chains check:artifacts (Phase 1 VALIDATION)",
    "static-artifact gate not wired into the verify command",
  );
  assert(
    out,
    /"check:db"\s*:\s*"tsx [^"]*--env-file=\.env\.local[^"]*"/.test(pkg),
    "check:db wires --env-file=.env.local (Plan 01-04 acceptance)",
    "tsx --env-file flag missing from check:db script",
  );

  return out;
}

function checkTsconfigHardening(): Check[] {
  const out: Check[] = [];
  if (!exists("tsconfig.json")) {
    out.push(fail("tsconfig.json exists", "missing at repo root"));
    return out;
  }
  out.push(ok("tsconfig.json exists"));
  const tsconfig = read("tsconfig.json");
  // D-08: strict + noUncheckedIndexedAccess + noImplicitOverride
  for (const flag of [
    '"strict": true',
    '"noUncheckedIndexedAccess": true',
    '"noImplicitOverride": true',
  ]) {
    assert(
      out,
      tsconfig.includes(flag),
      `tsconfig.json contains ${flag} (D-08)`,
      "D-08 strictness flag missing",
    );
  }
  return out;
}

function checkShadcnPrimitives(): Check[] {
  const out: Check[] = [];
  // D-05: Button, Card, Input only — at components/ui/
  for (const rel of [
    "components.json",
    "components/ui/button.tsx",
    "components/ui/card.tsx",
    "components/ui/input.tsx",
    "lib/utils.ts",
  ]) {
    assert(out, exists(rel), `${rel} exists (D-05 primitive)`, "shadcn artifact missing");
  }
  if (exists("lib/utils.ts")) {
    assert(
      out,
      read("lib/utils.ts").includes("export function cn"),
      "lib/utils.ts exports cn() helper",
      "cn() not exported",
    );
  }
  return out;
}

function checkPnpmLock(): Check {
  return exists("pnpm-lock.yaml")
    ? ok("pnpm-lock.yaml exists (D-01)")
    : fail("pnpm-lock.yaml exists (D-01)", "lockfile missing — pnpm install incomplete?");
}

function checkEnvExample(): Check[] {
  const out: Check[] = [];
  if (!exists(".env.local.example")) {
    out.push(fail(".env.local.example exists", "env template missing"));
    return out;
  }
  out.push(ok(".env.local.example exists"));
  const env = read(".env.local.example");
  assert(
    out,
    /^DATABASE_URL=/m.test(env),
    ".env.local.example contains DATABASE_URL= (D-11)",
    "DATABASE_URL key missing",
  );
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=",
    "CLERK_SECRET_KEY=",
    "CLERK_WEBHOOK_SECRET=",
    "NEXT_PUBLIC_APP_URL=",
  ]) {
    assert(out, env.includes(key), `.env.local.example declares ${key}`, "key removed?");
  }
  // Values must be blank in the template (no secret-shaped leaks)
  // Allowed non-secret defaults documented in 01-SECURITY.md T-01-02 evidence:
  //   RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_POSTHOG_HOST.
  // Anything else with a value after `=` would be a leak.
  const allowedNonBlank = new Set([
    "RESEND_FROM_EMAIL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_POSTHOG_HOST",
  ]);
  let leaks = 0;
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);
    if (m && m[1] && !allowedNonBlank.has(m[1])) {
      leaks += 1;
    }
  }
  assert(
    out,
    leaks === 0,
    ".env.local.example has no unexpected non-blank values (T-01-02)",
    `${leaks} key(s) have a value — would commit a secret`,
  );
  return out;
}

function checkGitignore(): Check[] {
  const out: Check[] = [];
  if (!exists(".gitignore")) {
    out.push(fail(".gitignore exists", "missing"));
    return out;
  }
  out.push(ok(".gitignore exists"));
  const gi = read(".gitignore");
  // T-01-01 / T-02-01: .env.local and .env*.local must be ignored
  // (the *.local pattern from Plan 01-01 also covers .env.local)
  assert(
    out,
    /(^|\n)\s*\.env\.local(\s|$)/.test(gi) ||
      /(^|\n)\s*\.env\*\.local(\s|$)/.test(gi) ||
      /(^|\n)\s*\*\.local(\s|$)/.test(gi),
    ".gitignore blocks .env.local (T-01-01 / T-02-01)",
    "neither .env.local nor .env*.local nor *.local pattern present",
  );
  assert(
    out,
    /\.next\//.test(gi),
    ".gitignore ignores .next/ (build output)",
    "Next.js build dir would be committed",
  );
  return out;
}

function checkEnvLocalGitIgnoreLive(): Check {
  // Runtime cross-check via `git check-ignore -v` — defence-in-depth on top
  // of the static .gitignore string check above. Honors the operator's
  // `secrets-never-in-chat` rule by never reading the file's contents.
  if (!exists(".env.local")) {
    // Not a failure: a fresh clone wouldn't have it. Skip silently.
    return ok(".env.local gitignore live check (skipped — file not present)");
  }
  const result = spawnSync("git", ["check-ignore", "-v", ".env.local"], {
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 0) {
    return ok("git check-ignore -v .env.local exits 0 (T-02-01 live)");
  }
  return fail(
    "git check-ignore -v .env.local exits 0 (T-02-01 live)",
    `exit ${result.status ?? "unknown"} — .env.local is NOT gitignored, secret leak risk`,
  );
}

function checkEnvLocalSentinels(): Check[] {
  // Only runs if .env.local exists. Never reads or echoes values — only
  // checks for sentinel substring presence and reports the sentinel NAME
  // on failure, never the value.
  const out: Check[] = [];
  if (!exists(".env.local")) {
    out.push(ok(".env.local sentinel checks (skipped — file not present)"));
    return out;
  }
  const env = read(".env.local");
  // Sentinels mirror Plan 01-02 Task 3 verify block exactly — D-11 keys.
  const sentinels: Array<[string, string]> = [
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_", "Clerk publishable key (pk_test_ prefix)"],
    ["CLERK_SECRET_KEY=sk_test_", "Clerk secret key (sk_test_ prefix)"],
    ["DATABASE_URL=postgresql://", "Drizzle DATABASE_URL"],
    ["NEXT_PUBLIC_SUPABASE_URL=https://", "Supabase URL (https://)"],
    ["pooler.supabase.com:6543", "Supabase Transaction pooler URI (D-06)"],
    ["NEXT_PUBLIC_APP_URL=http://localhost:3000", "App URL"],
  ];
  for (const [needle, label] of sentinels) {
    assert(out, env.includes(needle), `.env.local sentinel: ${label}`, "sentinel substring missing");
  }
  return out;
}

// ─── Plan 01-03: app shell — Clerk + marketing + auth ──────────────────────

function checkAppShell(): Check[] {
  const out: Check[] = [];
  if (!exists("app/layout.tsx")) {
    out.push(fail("app/layout.tsx exists", "root layout missing"));
    return out;
  }
  out.push(ok("app/layout.tsx exists"));
  const layout = read("app/layout.tsx");
  assert(
    out,
    /import\s*\{\s*ClerkProvider\s*\}\s*from\s*"@clerk\/nextjs"/.test(layout),
    "app/layout.tsx imports ClerkProvider (D-09)",
    "ClerkProvider import missing",
  );
  assert(
    out,
    /<ClerkProvider[\s>]/.test(layout) && /<\/ClerkProvider>/.test(layout),
    "app/layout.tsx wraps tree in <ClerkProvider>",
    "JSX wrapper missing",
  );
  assert(
    out,
    /title:\s*"PolicyPilot/.test(layout),
    "app/layout.tsx metadata.title contains 'PolicyPilot'",
    "title missing",
  );

  // app/page.tsx must NOT exist — conflicts with app/(marketing)/page.tsx
  assert(
    out,
    !exists("app/page.tsx"),
    "app/page.tsx is deleted (route-conflict prevention)",
    "conflicts with app/(marketing)/page.tsx on /",
  );

  // Marketing landing — D-03 hero copy + CTAs + Button import + Link import
  const landingPath = "app/(marketing)/page.tsx";
  if (!exists(landingPath)) {
    out.push(fail(`${landingPath} exists`, "marketing landing missing"));
  } else {
    out.push(ok(`${landingPath} exists`));
    const landing = read(landingPath);
    assert(
      out,
      landing.includes("Policy management for SMBs that beats a Google Drive folder"),
      "marketing landing contains D-03 hero copy",
      "hero string missing",
    );
    assert(
      out,
      landing.includes('from "@/components/ui/button"'),
      "marketing landing imports Button from @/components/ui/button",
      "Button import missing",
    );
    assert(
      out,
      landing.includes('from "next/link"'),
      "marketing landing imports Link from next/link",
      "Link import missing",
    );
    assert(out, landing.includes("/sign-up"), "marketing landing has /sign-up CTA", "/sign-up href missing");
    assert(out, landing.includes("/sign-in"), "marketing landing has /sign-in CTA", "/sign-in href missing");
  }

  // Pricing — D-04 tier names + prices + Card import
  const pricingPath = "app/(marketing)/pricing/page.tsx";
  if (!exists(pricingPath)) {
    out.push(fail(`${pricingPath} exists`, "pricing stub missing"));
  } else {
    out.push(ok(`${pricingPath} exists`));
    const pricing = read(pricingPath);
    assert(
      out,
      pricing.includes('from "@/components/ui/card"'),
      "pricing page imports Card from @/components/ui/card",
      "Card import missing",
    );
    for (const tier of ["Starter", "Growth", "Business"]) {
      assert(out, pricing.includes(tier), `pricing page mentions tier '${tier}'`, "tier missing");
    }
    for (const price of ["$79", "$199", "$449"]) {
      assert(out, pricing.includes(price), `pricing page contains price '${price}'`, "price missing");
    }
  }

  assert(out, exists("app/(marketing)/layout.tsx"), "app/(marketing)/layout.tsx exists", "marketing layout missing");

  // Auth routes — Clerk SignIn / SignUp mounts at optional catch-all
  const signInPath = "app/(auth)/sign-in/[[...sign-in]]/page.tsx";
  if (!exists(signInPath)) {
    out.push(fail(`${signInPath} exists`, "Clerk SignIn mount missing"));
  } else {
    out.push(ok(`${signInPath} exists`));
    const si = read(signInPath);
    assert(
      out,
      si.includes('import { SignIn } from "@clerk/nextjs"'),
      "sign-in page imports SignIn from @clerk/nextjs",
      "SignIn import missing",
    );
    assert(out, /<SignIn\s*\/?>/.test(si), "sign-in page renders <SignIn />", "<SignIn /> JSX missing");
  }

  const signUpPath = "app/(auth)/sign-up/[[...sign-up]]/page.tsx";
  if (!exists(signUpPath)) {
    out.push(fail(`${signUpPath} exists`, "Clerk SignUp mount missing"));
  } else {
    out.push(ok(`${signUpPath} exists`));
    const su = read(signUpPath);
    assert(
      out,
      su.includes('import { SignUp } from "@clerk/nextjs"'),
      "sign-up page imports SignUp from @clerk/nextjs",
      "SignUp import missing",
    );
    assert(out, /<SignUp\s*\/?>/.test(su), "sign-up page renders <SignUp />", "<SignUp /> JSX missing");
  }

  assert(out, exists("app/(auth)/layout.tsx"), "app/(auth)/layout.tsx exists", "auth layout missing");

  // Plan 03-02 L-03 / REG-P1-01: the Phase 1 /sign-in-success placeholder
  // (D-09) is REPLACED by the Server Component trampoline at /post-sign-in.
  // The old file MUST be deleted; the new file MUST contain the dispatch
  // calls. Negative + positive assertions together close REG-P1-01.
  const oldSuccessPath = "app/sign-in-success/page.tsx";
  assert(
    out,
    !exists(oldSuccessPath),
    `${oldSuccessPath} does NOT exist (Plan 03-02 L-03 — deleted)`,
    "REG-P1-01 closure incomplete — placeholder still on disk",
  );
  const postSignInPath = "app/(auth)/post-sign-in/page.tsx";
  if (!exists(postSignInPath)) {
    out.push(fail(`${postSignInPath} exists`, "Plan 03-02 L-03 trampoline missing"));
  } else {
    out.push(ok(`${postSignInPath} exists (Plan 03-02 L-03)`));
    const psi = read(postSignInPath);
    assert(
      out,
      psi.includes("getOrgContext"),
      "post-sign-in page imports getOrgContext",
      "getOrgContext import missing",
    );
    assert(
      out,
      psi.includes("redirect('/onboarding/create-org')"),
      "post-sign-in dispatches to /onboarding/create-org on no-org",
      "no-org redirect missing (D-08)",
    );
    assert(
      out,
      psi.includes("redirect('/dashboard')"),
      "post-sign-in dispatches to /dashboard for admin role",
      "admin redirect missing",
    );
    assert(
      out,
      psi.includes("redirect('/my-policies')"),
      "post-sign-in dispatches to /my-policies for non-admin role",
      "non-admin redirect missing",
    );
  }

  return out;
}

// ─── Plan 01-04: middleware + Drizzle skeleton ─────────────────────────────

function checkMiddleware(): Check[] {
  const out: Check[] = [];
  if (!exists("middleware.ts")) {
    out.push(fail("middleware.ts exists at repo root", "single auth chokepoint missing"));
    return out;
  }
  out.push(ok("middleware.ts exists at repo root (ADR-009)"));
  const m = read("middleware.ts");
  assert(
    out,
    m.includes('from "@clerk/nextjs/server"'),
    "middleware.ts imports from @clerk/nextjs/server (v5+)",
    "server import missing",
  );
  assert(
    out,
    /clerkMiddleware\s*\(/.test(m),
    "middleware.ts uses clerkMiddleware factory",
    "clerkMiddleware() not used",
  );
  assert(
    out,
    /export\s+const\s+config\s*=/.test(m) && /matcher\s*:/.test(m),
    "middleware.ts exports config with matcher array",
    "config/matcher missing",
  );
  // D-10 public-route policy — all 4 routes literal + post-446b554 split
  for (const literal of [
    '"/"',
    '"/pricing"',
    '"/sign-in"',
    '"/sign-up"',
    '"/api/webhooks/stripe"',
    '"/api/webhooks/clerk"',
    '"/api/cron/(.*)"',
  ]) {
    assert(out, m.includes(literal), `middleware.ts declares ${literal}`, "matcher entry missing");
  }
  // 446b554 sibling-prefix fix: must have BOTH /sign-in exact AND /sign-in/(.*) child
  assert(
    out,
    m.includes('"/sign-in/(.*)"') && m.includes('"/sign-up/(.*)"'),
    "middleware.ts has split-matcher form (446b554 sibling-prefix fix)",
    "greedy /sign-in(.*) would match /sign-in-success — regression",
  );
  assert(
    out,
    !hasAnyType(m),
    "middleware.ts has no 'any' types (CLAUDE.md NEVER #4)",
    "any type detected",
  );
  return out;
}

/**
 * Validate that Drizzle's schema, client entry, and drizzle-kit config exist and meet baseline invariants.
 *
 * Performs existence checks and content-level assertions for:
 * - lib/db/schema.ts presence,
 * - lib/db/index.ts (server-only import, postgres-js driver, reads DATABASE_URL, `prepare: false`, no `any` types),
 * - drizzle.config.ts (schema path points to ./lib/db/schema.ts, dialect is `postgresql`, and it uses a `satisfies Config` clause).
 *
 * @returns An array of `Check` objects describing each existence/assertion result for the Drizzle-related files.
 */
function checkDrizzleSkeleton(): Check[] {
  const out: Check[] = [];

  // schema.ts — Phase 1 D-07 required an empty `export {}` placeholder.
  // Phase 2 (Plan 02-01) populated it with 12 tables — that's the
  // expected post-Phase-2 state. checkPhase2Schema() below covers the
  // populated-schema invariants; this Phase 1 check now only asserts
  // file existence (the empty-placeholder assertion is intentionally
  // dropped — Phase 2 superseded it).
  if (!exists("lib/db/schema.ts")) {
    out.push(fail("lib/db/schema.ts exists", "Drizzle schema file missing"));
  } else {
    out.push(ok("lib/db/schema.ts exists"));
  }

  // index.ts — server-only, postgres-js, prepare:false, DATABASE_URL
  if (!exists("lib/db/index.ts")) {
    out.push(fail("lib/db/index.ts exists", "Drizzle client missing"));
  } else {
    out.push(ok("lib/db/index.ts exists"));
    const i = read("lib/db/index.ts");
    assert(
      out,
      i.includes('import "server-only"'),
      'lib/db/index.ts declares import "server-only" (T-04-02)',
      "server-only guard missing — Client Components could import DB",
    );
    assert(
      out,
      i.includes("drizzle-orm/postgres-js"),
      "lib/db/index.ts uses drizzle-orm/postgres-js driver (D-06)",
      "wrong Drizzle driver",
    );
    assert(
      out,
      /process\.env\.DATABASE_URL/.test(i),
      "lib/db/index.ts reads process.env.DATABASE_URL",
      "DATABASE_URL not read",
    );
    assert(
      out,
      /prepare\s*:\s*false/.test(i),
      "lib/db/index.ts sets prepare: false (Supabase pooler, D-06)",
      "pooler will error on prepared statements",
    );
    assert(out, !hasAnyType(i), "lib/db/index.ts has no 'any' types", "any type detected");
  }

  // drizzle.config.ts — schema path, postgresql dialect, satisfies Config
  if (!exists("drizzle.config.ts")) {
    out.push(fail("drizzle.config.ts exists", "drizzle-kit config missing"));
  } else {
    out.push(ok("drizzle.config.ts exists"));
    const cfg = read("drizzle.config.ts");
    assert(
      out,
      /schema\s*:\s*"\.\/lib\/db\/schema\.ts"/.test(cfg),
      "drizzle.config.ts schema → ./lib/db/schema.ts",
      "schema path wrong",
    );
    assert(
      out,
      /dialect\s*:\s*"postgresql"/.test(cfg),
      "drizzle.config.ts dialect = postgresql",
      "dialect wrong/missing",
    );
    assert(
      out,
      /satisfies\s+Config/.test(cfg),
      "drizzle.config.ts is type-safe (satisfies Config)",
      "missing satisfies clause",
    );
  }
  return out;
}

function checkSmokeScripts(): Check[] {
  const out: Check[] = [];
  // check-db.ts — Plan 01-04 Task 3
  if (!exists("scripts/check-db.ts")) {
    out.push(fail("scripts/check-db.ts exists", "DB smoke script missing"));
  } else {
    out.push(ok("scripts/check-db.ts exists"));
    const s = read("scripts/check-db.ts");
    assert(
      out,
      s.includes("select 1"),
      "scripts/check-db.ts runs `select 1` (T-04-07: read-only)",
      "select 1 missing",
    );
    assert(
      out,
      s.includes('from "@/lib/db"'),
      "scripts/check-db.ts imports db from @/lib/db",
      "import missing",
    );
    assert(
      out,
      /process\.exit\(0\)/.test(s) && /process\.exit\(1\)/.test(s),
      "scripts/check-db.ts has both exit(0) and exit(1) branches",
      "missing one of the exit branches — vacuous-pass risk",
    );
    // T-04-07: no mutating SQL verbs
    assert(
      out,
      !/\b(insert|update|delete|drop|create|alter|truncate)\b\s/i.test(s),
      "scripts/check-db.ts is read-only (T-04-07)",
      "mutating SQL verb detected — smoke check must be select-only",
    );
  }
  // check-foundation.ts — Plan 01-05 self-check
  if (!exists("scripts/check-foundation.ts")) {
    out.push(fail("scripts/check-foundation.ts exists", "verify gate script missing"));
  } else {
    out.push(ok("scripts/check-foundation.ts exists"));
    const s = read("scripts/check-foundation.ts");
    assert(
      out,
      s.includes("Policy management for SMBs that beats a Google Drive folder"),
      "check-foundation.ts asserts D-03 hero substring",
      "hero assertion missing",
    );
    // Plan 03-02 L-03: the /sign-in-success probe was re-pointed to
    // /post-sign-in once the Phase 1 placeholder was deleted and the
    // Server Component trampoline shipped.
    for (const path of ['"/"', '"/sign-in"', '"/sign-up"', '"/post-sign-in"']) {
      assert(out, s.includes(path), `check-foundation.ts probes ${path}`, "probe path missing");
    }
    assert(
      out,
      /process\.exit\(0\)/.test(s) && /process\.exit\(1\)/.test(s),
      "check-foundation.ts has both exit(0) and exit(1) branches (T-05-01)",
      "vacuous-pass risk",
    );
  }
  return out;
}

/**
 * Ensures only allowed server-side modules import from `@/lib/db`.
 *
 * Searches repository source files for occurrences of `from "@/lib/db"` (comments excluded)
 * and produces a passing check when all matches are in the internal allowlist; produces a failing
 * check describing any unexpected importer paths otherwise.
 *
 * @returns An array of `Check` results: a single passing `Check` when all importers are allowed,
 * or a failing `Check` whose detail lists the unexpected importer file paths.
 */

function checkServerOnlyBoundary(): Check[] {
  // Grep all source files for `from "@/lib/db"`. Until Server Components or
  // server actions consume the DB client, the only legitimate importer is
  // `scripts/check-db.ts`. Any other importer is a server-only-guard breach
  // — Client Component imports fail the build, but Server Components could
  // silently leak. The allowlist below must grow alongside legitimate
  // server-side consumers as they land.
  const out: Check[] = [];
  const result = spawnSync(
    "node",
    [
      "-e",
      // Cross-platform grep replacement using Node fs walker.
      // Strips // line-comments + /* block */ comments before substring
      // search so doc/anti-pattern comments mentioning "from '@/lib/db'"
      // don't false-positive (Plan 02-06 Rule-1 fix). Superseded by L-05
      // AST check; kept as a regression backstop.
      `const fs = require('node:fs'); const path = require('node:path');
       const SKIP = new Set(['node_modules','.next','.git','.planning','.wiki','docs','reference','drizzle']);
       const hits = [];
       function stripComments(s) {
         return s.replace(/\\/\\/[^\\n]*/g, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');
       }
       function walk(dir) {
         for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
           if (SKIP.has(entry.name)) continue;
           const full = path.join(dir, entry.name);
           if (entry.isDirectory()) { walk(full); continue; }
           if (!/\\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
           const raw = fs.readFileSync(full, 'utf8');
           const content = stripComments(raw);
           if (content.includes('from "@/lib/db"') || content.includes("from '@/lib/db'")) {
             hits.push(full.replace(/\\\\/g, '/'));
           }
         }
       }
       walk('.');
       console.log(hits.join('\\n'));`,
    ],
    { encoding: "utf8", cwd: REPO_ROOT, shell: false },
  );
  if (result.status !== 0) {
    out.push(
      fail(
        "grep `from \"@/lib/db\"` — importer enumeration",
        `walker error: ${(result.stderr || "").trim()}`,
      ),
    );
    return out;
  }
  const hits = (result.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Currently allowed: scripts/check-db.ts (the DB smoke gate). Plus the
  // walker-template substring inside this file itself — not a real import,
  // whitelisted the same way to keep the regex check honest.
  //
  // Phase 2 additions (Plan 02-06): lib/db/scoped.ts is the wrapper that
  // secures the channel (OrgScope + withOrgScope per ADR-025), and
  // app/api/webhooks/clerk/route.ts is ADR-023 allow-list entry #1.
  // Both are legitimate raw-db importers; this regex check is now
  // superseded by scripts/check-db-imports.ts (AST-based, L-05) for
  // catching unauthorized importers — kept here as a regression
  // backstop that doesn't false-positive on the legitimate importers.
  const allowed = new Set([
    "scripts/check-db.ts",
    "./scripts/check-db.ts",
    "scripts/check-artifacts.ts",
    "./scripts/check-artifacts.ts",
    "lib/db/scoped.ts",
    "./lib/db/scoped.ts",
    "app/api/webhooks/clerk/route.ts",
    "./app/api/webhooks/clerk/route.ts",
    // 03-G1 ADR-023 allow-list entry: getOrgContext now imports the raw db
    // barrel to translate Clerk text ids → internal UUIDs per gap-closure.
    "lib/auth/context.ts",
    "./lib/auth/context.ts",
  ]);
  const unexpected = hits.filter((h) => !allowed.has(h));
  if (unexpected.length === 0) {
    out.push(
      ok(
        `@/lib/db importers limited to scripts/check-db.ts (T-03-05 / T-04-03) — ${hits.length} hit(s)`,
      ),
    );
  } else {
    out.push(
      fail(
        "@/lib/db importers limited to scripts/check-db.ts (T-03-05 / T-04-03)",
        `unexpected importer(s): ${unexpected.join(", ")}`,
      ),
    );
  }
  return out;
}

/**
 * Validates the populated Drizzle schema in lib/db/schema.ts against Phase 2 table and column invariants.
 *
 * Checks performed:
 * - Ensures exports exist for the expected tables: organizations, users, departments, policies, policyVersions, policyAssignments, acknowledgments, aiGenerations, notifications, workflowStages, stripeEvents, clerkEvents.
 * - For policyVersions, policyAssignments, acknowledgments, notifications, and workflowStages, asserts an `orgId` column is defined with `uuid('org_id').notNull().references(...)`.
 * - Asserts the users table's `orgId` is nullable (does not include `.notNull()`).
 * - Asserts the clerkEvents table block does not contain an `orgId` column.
 *
 * @returns An array of Check objects representing each assertion result; each Check indicates pass or fail and may include a detail message.
 */

function checkPhase2Schema(): Check[] {
  const out: Check[] = [];
  if (!exists("lib/db/schema.ts")) {
    out.push(fail("lib/db/schema.ts exists", "missing"));
    return out;
  }
  const s = read("lib/db/schema.ts");
  // Should contain 12 tables after Plan 02-01 (was `export {}` in Phase 1).
  const tables = ["organizations","users","departments","policies","policyVersions","policyAssignments","acknowledgments","aiGenerations","notifications","workflowStages","stripeEvents","clerkEvents"];
  for (const t of tables) {
    assert(out, s.includes(`export const ${t} `), `lib/db/schema.ts exports ${t} (Plan 02-01)`, `missing 'export const ${t} '`);
  }
  // End-of-block marker `);` matches both `pgTable('name', {...});` and
  // `pgTable('name', {...}, (table) => [...]);`. Do not tighten to `});`
  // — the array-callback form would slip past, scanning into the next
  // table and producing a wrong-block slice. `end === -1` is treated as a
  // hard failure rather than letting `slice(idx, -1)` cut to EOF-1 and
  // silently approve (D-02 positive regex) or silently fail (D-03a /
  // D-03b negated regex) against an out-of-band block.
  // D-02: 5 child tables have non-null org_id
  for (const t of ["policyVersions","policyAssignments","acknowledgments","notifications","workflowStages"]) {
    const idx = s.indexOf(`export const ${t} `);
    if (idx === -1) continue;
    const end = s.indexOf(");", idx);
    if (end === -1) {
      assert(out, false, `lib/db/schema.ts: ${t} has D-02 org_id .notNull().references`, `couldn't locate ${t} block close ');' — schema.ts malformed?`);
      continue;
    }
    const block = s.slice(idx, end);
    assert(out, /orgId:\s*uuid\('org_id'\)\.notNull\(\)\.references/.test(block), `lib/db/schema.ts: ${t} has D-02 org_id .notNull().references`, "D-02 denormalization missing");
  }
  // D-03a: users.org_id is nullable.
  const usersIdx = s.indexOf("export const users ");
  if (usersIdx !== -1) {
    const end = s.indexOf(");", usersIdx);
    if (end === -1) {
      assert(out, false, "lib/db/schema.ts: users.orgId is nullable (D-03a)", "couldn't locate users block close ');' — schema.ts malformed?");
    } else {
      const block = s.slice(usersIdx, end);
      assert(out, !/orgId:\s*uuid\('org_id'\)\.notNull\(\)/.test(block), "lib/db/schema.ts: users.orgId is nullable (D-03a)", "D-03a violation — users.orgId has .notNull()");
    }
  }
  // D-03b: clerk_events present, NO orgId
  const clerkIdx = s.indexOf("export const clerkEvents ");
  if (clerkIdx !== -1) {
    const end = s.indexOf(");", clerkIdx);
    if (end === -1) {
      assert(out, false, "lib/db/schema.ts: clerk_events has NO orgId (service-role table)", "couldn't locate clerkEvents block close ');' — schema.ts malformed?");
    } else {
      const block = s.slice(clerkIdx, end);
      assert(out, !block.includes("orgId"), "lib/db/schema.ts: clerk_events has NO orgId (service-role table)", "anti-pattern: orgId on clerk_events");
    }
  }
  return out;
}

/**
 * Performs Phase 2 validations for the server-only org-scoping and auth context modules.
 *
 * Verifies that `lib/db/scoped.ts` and `lib/auth/context.ts` exist and contain required server-only and scoping invariants:
 * - top-of-file `import 'server-only'`
 * - role switch via `SET LOCAL ROLE authenticated`
 * - `set_config('request.jwt.claims', ..., true)` with `is_local=true` semantics in the scoped DB wrapper
 * - a `Role` union enumerating `'admin' | 'reviewer' | 'employee'` in the auth context
 * - a `try { ... await auth() }` pattern (SF-M4 fold) in the auth context
 *
 * @returns An array of `Check` objects describing each assertion's pass/fail outcome for the scoped/context validations.
 */

function checkPhase2ScopedAndContext(): Check[] {
  const out: Check[] = [];
  for (const path of ["lib/db/scoped.ts", "lib/auth/context.ts"]) {
    if (!exists(path)) {
      out.push(fail(`${path} exists`, "missing"));
      continue;
    }
    out.push(ok(`${path} exists (Plan 02-01)`));
    const s = read(path);
    assert(out, s.includes("import 'server-only'"), `${path}: 'server-only' import (top-of-file guard)`, "missing 'server-only'");
  }
  const scoped = exists("lib/db/scoped.ts") ? read("lib/db/scoped.ts") : "";
  assert(out, scoped.includes("SET LOCAL ROLE authenticated"), "lib/db/scoped.ts: SET LOCAL ROLE authenticated (Pitfall 1 mitigation)", "missing role switch");
  assert(out, scoped.includes("set_config('request.jwt.claims',") && /,\s*\$\{claims\}\s*,\s*true\)|,\s*true\)/.test(scoped), "lib/db/scoped.ts: set_config(..., true) is_local=true (Pitfall 2)", "missing is_local=true");
  const ctx = exists("lib/auth/context.ts") ? read("lib/auth/context.ts") : "";
  assert(out, ctx.includes("Role = 'admin' | 'reviewer' | 'employee'") || /Role\s*=\s*['"]admin['"]\s*\|\s*['"]reviewer['"]\s*\|\s*['"]employee['"]/.test(ctx), "lib/auth/context.ts: Role enum (admin|reviewer|employee)", "enum missing");
  assert(out, /try\s*\{[\s\S]*?await\s+auth\(\)/.test(ctx), "lib/auth/context.ts: try/catch around await auth() (SF-M4 fold)", "SF-M4 fold missing");
  return out;
}

/**
 * Validate repository module skeletons and repository-specific invariants for Phase 2.
 *
 * Performs file- and content-level checks for each repository under `lib/db/repositories`:
 * presence, a top-of-file `import 'server-only'` guard, import of `OrgScope` from `@/lib/db/scoped`,
 * prohibition of raw `@/lib/db` imports, and required listing methods (`listAll` or `listForUser` for acknowledgments).
 * Also enforces ADR-018 (no top-level `update`/`delete` keys in acknowledgments) and ADR-005
 * (`Policies.create` input omits `tldrSummary`).
 *
 * @returns An array of `Check` results describing which assertions passed or failed.
 */

function checkPhase2Repositories(): Check[] {
  const out: Check[] = [];
  const repos = ["policies","policy_versions","policy_assignments","acknowledgments","users","departments","ai_generations","notifications","workflow_stages"];
  for (const r of repos) {
    const path = `lib/db/repositories/${r}.ts`;
    if (!exists(path)) {
      out.push(fail(`${path} exists`, "missing"));
      continue;
    }
    const s = read(path);
    // Strip comments before regex-matching so doc/anti-pattern mentions
    // of "from '@/lib/db'" inside JSDoc / // comments don't false-positive
    // (Plan 02-06 Rule-1 fix).
    const noComments = s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert(out, s.includes("import 'server-only'"), `${path}: 'server-only' guard`, "missing 'server-only'");
    assert(out, s.includes("from '@/lib/db/scoped'") || s.includes('from "@/lib/db/scoped"'), `${path}: imports OrgScope from @/lib/db/scoped`, "OrgScope import missing");
    // Pitfall 6: must NOT import raw `db` (only @/lib/db/scoped, @/lib/db/schema)
    assert(out, !/from\s+['"]@\/lib\/db['"](?!\/)/.test(noComments), `${path}: NO raw @/lib/db import (Pitfall 6)`, "raw db import detected");
    // listAll method exists — exception: Acknowledgments uses listForUser
    // (user-scoped, not org-scoped at the listing level per ADR-018 +
    // CONTEXT.md L-03 spec). Plan body says "listAll or equivalent".
    if (r === "acknowledgments") {
      assert(out, s.includes("listForUser") || s.includes("listAll"), `${path}: listForUser method exists (equivalent to listAll per L-03 — user-scoped)`, "listForUser missing");
    } else {
      assert(out, s.includes("listAll"), `${path}: listAll method exists (Plan 02-06 cross-org positive control needs it)`, "listAll missing");
    }
  }
  // ADR-018: Acknowledgments has NO update/delete keys
  if (exists("lib/db/repositories/acknowledgments.ts")) {
    const ack = read("lib/db/repositories/acknowledgments.ts");
    assert(out, !/^\s*update\s*:/m.test(ack), "lib/db/repositories/acknowledgments.ts: NO update key (ADR-018)", "ADR-018 violation: update method present");
    assert(out, !/^\s*delete\s*:/m.test(ack), "lib/db/repositories/acknowledgments.ts: NO delete key (ADR-018)", "ADR-018 violation: delete method present");
  }
  // ADR-005: Policies.create input Omits tldrSummary
  if (exists("lib/db/repositories/policies.ts")) {
    const pol = read("lib/db/repositories/policies.ts");
    assert(out, /Omit<[\s\S]*?\$inferInsert,[\s\S]*?['"]tldrSummary['"]/.test(pol), "lib/db/repositories/policies.ts: Policies.create input Omits tldrSummary (ADR-005)", "ADR-005 violation: Omit pattern missing");
  }
  return out;
}

/**
 * Validates the Clerk webhook handler and its svix integration against Phase 2 requirements.
 *
 * Performs file-level checks for app/api/webhooks/clerk/route.ts and package.json, asserting:
 * - the handler file exists,
 * - `Webhook` is imported from `svix`,
 * - the request body is read via `await req.text()` and that this occurs before any `JSON.parse(`,
 * - idempotency is implemented via `.onConflictDoNothing()`,
 * - the handler recognizes the events `organization.created`, `user.created`, `organizationMembership.created`, and `organizationMembership.updated`,
 * - `package.json` declares the `svix` dependency matching version 1.93.
 *
 * @returns An array of `Check` results where each element indicates a passed or failed assertion for the webhook handler checks.
 */

function checkPhase2WebhookHandler(): Check[] {
  const out: Check[] = [];
  const path = "app/api/webhooks/clerk/route.ts";
  if (!exists(path)) {
    out.push(fail(`${path} exists`, "missing"));
    return out;
  }
  out.push(ok(`${path} exists (Plan 02-05)`));
  const s = read(path);
  assert(out, s.includes("import { Webhook") && s.includes("from 'svix'"), `${path}: imports svix Webhook`, "svix import missing");
  assert(out, s.includes("await req.text()"), `${path}: awaits req.text() for raw body (Pitfall 4)`, "Pitfall 4 violation: no req.text()");
  // Pitfall 4 ordering: req.text() before any JSON.parse
  const textIdx = s.indexOf("await req.text()");
  const jsonIdx = s.indexOf("JSON.parse(");
  assert(out, jsonIdx === -1 || jsonIdx > textIdx, `${path}: req.text() before any JSON.parse (Pitfall 4 ordering)`, "Pitfall 4 ordering violation");
  assert(out, s.includes(".onConflictDoNothing()"), `${path}: idempotency via ON CONFLICT DO NOTHING (D-03b)`, "D-03b idempotency missing");
  for (const evt of ["organization.created","user.created","organizationMembership.created","organizationMembership.updated"]) {
    assert(out, s.includes(`'${evt}'`) || s.includes(`"${evt}"`), `${path}: handles ${evt} (D-03)`, `event missing: ${evt}`);
  }
  // Package.json has svix
  const pkg = read("package.json");
  assert(out, /"svix":\s*"\^?1\.93/.test(pkg), "package.json declares svix@1.93 (Plan 02-05)", "svix dep missing");
  return out;
}

/**
 * Verifies that middleware.ts includes the SF-M4 fold marker and at least two `try` blocks.
 *
 * This returns a set of check results: it fails if `middleware.ts` is missing, fails if fewer than
 * two `try {` blocks are present (SF-M4 expects folding around both auth calls), and fails if the
 * literal `SF-M4` marker is not found.
 *
 * @returns A list of check results indicating which assertions about `middleware.ts` passed or failed.
 */

function checkPhase2MiddlewareFold(): Check[] {
  const out: Check[] = [];
  if (!exists("middleware.ts")) {
    out.push(fail("middleware.ts exists", "missing"));
    return out;
  }
  const mw = read("middleware.ts");
  const tryCount = (mw.match(/\btry\s*\{/g) ?? []).length;
  assert(out, tryCount >= 2, "middleware.ts: at least 2 try blocks (SF-M4 fold around both auth() calls)", `found ${tryCount} try blocks`);
  assert(out, mw.includes("SF-M4"), "middleware.ts: SF-M4 fold comment cited", "SF-M4 marker missing");
  return out;
}

/**
 * Validates required migration files and key invariants in migration SQL and drizzle config.
 *
 * Performs existence checks for drizzle/0000_initial.sql, drizzle/0001_rls_policies.sql, and drizzle/meta/_journal.json;
 * verifies the journal registers the RLS migration; inspects 0001_rls_policies.sql (with line comments ignored) to
 * ensure expected counts of RLS enablement, policy definitions, grants to the `authenticated` role, and the specific
 * users CHECK constraint; and confirms drizzle.config.ts references `DIRECT_URL` and includes a fallback `console.warn`.
 *
 * @returns An array of `Check` results describing each migration and drizzle config validation (one entry per asserted invariant).
 */

function checkPhase2Migrations(): Check[] {
  const out: Check[] = [];
  for (const path of ["drizzle/0000_initial.sql", "drizzle/0001_rls_policies.sql", "drizzle/meta/_journal.json"]) {
    assert(out, exists(path), `${path} exists (Plan 02-03)`, "missing");
  }
  if (exists("drizzle/meta/_journal.json")) {
    const journal = read("drizzle/meta/_journal.json");
    assert(out, journal.includes("rls_policies"), "drizzle/meta/_journal.json registers 0001_rls_policies (Pitfall 3)", "Pitfall 3 violation: 0001 not registered");
  }
  if (exists("drizzle/0001_rls_policies.sql")) {
    const sql = read("drizzle/0001_rls_policies.sql");
    const body = sql.replace(/^\s*--[^\n]*\r?\n?/gm, "");
    const rlsCount = (body.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length;
    const policyCount = (body.match(/CREATE POLICY "org_isolation"/g) ?? []).length;
    const grantCount = (body.match(/GRANT SELECT, INSERT, UPDATE, DELETE ON .+ TO authenticated/g) ?? []).length;
    const checkCount = (body.match(/CHECK \(org_id IS NOT NULL OR created_at > now\(\) - interval/g) ?? []).length;
    assert(out, rlsCount === 10, "0001_rls_policies.sql: 10 ENABLE RLS statements", `found ${rlsCount}`);
    assert(out, policyCount === 10, "0001_rls_policies.sql: 10 CREATE POLICY org_isolation statements", `found ${policyCount}`);
    assert(out, grantCount === 10, "0001_rls_policies.sql: 10 GRANT to authenticated statements (L-04)", `found ${grantCount}`);
    assert(out, checkCount === 1, "0001_rls_policies.sql: 1 D-03a CHECK constraint on users", `found ${checkCount}`);
  }
  if (exists("drizzle.config.ts")) {
    const cfg = read("drizzle.config.ts");
    assert(out, cfg.includes("DIRECT_URL"), "drizzle.config.ts: reads DIRECT_URL (D-05)", "D-05 missing");
    assert(out, cfg.includes("console.warn"), "drizzle.config.ts: fallback warn (D-05)", "D-05 fallback missing");
  }
  return out;
}

/**
 * Validates the repository's `tests/types.ts` file for Phase 2 type-test invariants.
 *
 * Checks that the file exists, contains at least three `@ts-expect-error` occurrences, and includes
 * the `void Acknowledgments.update`, `void Acknowledgments.delete`, and `tldrSummary` markers.
 *
 * @returns An array of `Check` objects reporting success or failure for each asserted invariant.
 */

function checkPhase2TypeTests(): Check[] {
  const out: Check[] = [];
  if (!exists("tests/types.ts")) {
    out.push(fail("tests/types.ts exists (D-07)", "missing"));
    return out;
  }
  const t = read("tests/types.ts");
  const expectErrCount = (t.match(/@ts-expect-error/g) ?? []).length;
  assert(out, expectErrCount >= 3, "tests/types.ts: 3+ @ts-expect-error invariants (D-07)", `found ${expectErrCount}`);
  assert(out, t.includes("void Acknowledgments.update"), "tests/types.ts: ADR-018 update invariant", "missing");
  assert(out, t.includes("void Acknowledgments.delete"), "tests/types.ts: ADR-018 delete invariant", "missing");
  assert(out, t.includes("tldrSummary"), "tests/types.ts: ADR-005 tldrSummary invariant", "missing");
  return out;
}

/**
 * Verifies presence of Phase 2 verification and database-related script files and required package.json script entries.
 *
 * Ensures these files exist: `scripts/check-db-imports.ts`, `scripts/check-rls.ts`, `scripts/check-schema.ts`, `scripts/check-data-layer.ts`.
 * Ensures `package.json` declares these scripts: `db:generate`, `db:generate:rls`, `db:migrate`, `db:migrate:test`, and `verify:phase-2`.
 *
 * @returns An array of `Check` objects indicating which assertions passed and which failed.
 */
function checkPhase2VerifyScripts(): Check[] {
  const out: Check[] = [];
  for (const path of ["scripts/check-db-imports.ts","scripts/check-rls.ts","scripts/check-schema.ts","scripts/check-data-layer.ts"]) {
    assert(out, exists(path), `${path} exists (Plan 02-06)`, "missing");
  }
  const pkg = read("package.json");
  for (const script of ["db:generate","db:generate:rls","db:migrate","db:migrate:test","verify:phase-2"]) {
    assert(out, pkg.includes(`"${script}":`), `package.json declares ${script}`, "script missing");
  }
  return out;
}

// ─── Plan 03-01: Wave-0 test + verify harness ──────────────────────────────

/**
 * Verifies the Phase 3 Wave-0 test + verify harness artifacts (Plan 03-01).
 *
 * Asserts vitest config + setup + smoke test files exist, the
 * check-admin-routes.ts ts-morph scaffold exists, and the package.json
 * declares the verify:phase-3 orchestrator (with its L-06c
 * .tmp/svix-url.json cleanup tail) plus the check:admin-routes / test
 * scripts that chain into it.
 *
 * @returns An array of `Check` objects indicating which assertions passed and which failed.
 */
function checkPhase3Scaffold(): Check[] {
  const out: Check[] = [];
  assert(out, exists("vitest.config.ts"), "vitest.config.ts exists (Plan 03-01)", "missing");
  assert(out, exists("tests/setup.ts"), "tests/setup.ts exists (Plan 03-01)", "missing");
  assert(out, exists("tests/smoke.test.ts"), "tests/smoke.test.ts exists (Plan 03-01)", "missing");
  assert(out, exists("scripts/check-admin-routes.ts"), "scripts/check-admin-routes.ts exists (Plan 03-01)", "missing");
  const pkg = read("package.json");
  assert(out, pkg.includes('"verify:phase-3"'), "package.json declares verify:phase-3", "script missing");
  assert(out, pkg.includes('"check:admin-routes"'), "package.json declares check:admin-routes", "script missing");
  assert(out, pkg.includes('"check:db-imports"'), "package.json declares check:db-imports", "script missing");
  assert(out, pkg.includes('"check:rls"'), "package.json declares check:rls", "script missing");
  assert(out, pkg.includes('"test":'), "package.json declares test (vitest run)", "script missing");
  assert(
    out,
    pkg.includes("rmSync('.tmp/svix-url.json'"),
    "verify:phase-3 tail cleans .tmp/svix-url.json (L-06c)",
    "missing rmSync('.tmp/svix-url.json' literal",
  );
  // Setup/config sentinel substrings to catch silent rewrites.
  const cfg = read("vitest.config.ts");
  assert(out, cfg.includes("defineConfig"), "vitest.config.ts contains defineConfig", "missing");
  const setup = read("tests/setup.ts");
  assert(
    out,
    setup.includes("@testing-library/jest-dom"),
    "tests/setup.ts imports @testing-library/jest-dom",
    "missing",
  );
  const car = read("scripts/check-admin-routes.ts");
  assert(out, car.includes("ADMIN_URL_PATTERNS"), "check-admin-routes.ts references ADMIN_URL_PATTERNS", "missing");
  assert(out, car.includes("scaffold mode"), "check-admin-routes.ts has scaffold-mode branch", "missing");
  assert(out, car.includes("withOrgScope("), "check-admin-routes.ts greps for withOrgScope(", "missing");
  return out;
}

/**
 * Verifies the existence of every Phase 3 downstream artifact (Plans
 * 03-02..03-11) — auto-detected by the presence of
 * `app/(admin)/dashboard/page.tsx` on disk (W10 closure).
 *
 * When the dashboard page does NOT exist (Phase 3 still in flight after
 * Plan 03-01), this function emits a single `ok` row and returns. Once
 * Plan 03-11 ships `app/(admin)/dashboard/page.tsx`, the function flips
 * to enforcement automatically — no env-flag plumbing required. Each
 * missing artifact below that point becomes a RED `fail` row tagged with
 * the plan number that owns its delivery.
 *
 * @returns An array of `Check` objects.
 */
function checkPhase3FileExistence(): Check[] {
  // W10: auto-detect Phase 3 completion via dashboard page presence.
  // When Plan 03-11 ships app/(admin)/dashboard/page.tsx, this gate flips
  // to enforcement automatically — no env flag plumbing required.
  if (!exists("app/(admin)/dashboard/page.tsx")) {
    return [
      ok(
        "Phase 3 file-existence rows skipped (dashboard page not yet on disk — gate enabled by Plan 03-11)",
      ),
    ];
  }
  const out: Check[] = [];
  const targets: Array<{ path: string; plan: string }> = [
    { path: "lib/auth/require-admin.ts", plan: "03-02" },
    { path: "app/(auth)/post-sign-in/page.tsx", plan: "03-02" },
    { path: "lib/policies/state-machine.ts", plan: "03-03" },
    { path: "lib/policies/transitions.ts", plan: "03-06" },
    { path: "app/(admin)/layout.tsx", plan: "03-09" },
    { path: "app/(admin)/dashboard/page.tsx", plan: "03-11" },
    { path: "app/(admin)/policies/page.tsx", plan: "03-11" },
    { path: "app/(admin)/policies/new/page.tsx", plan: "03-11" },
    { path: "app/(admin)/policies/new/actions.ts", plan: "03-07" },
    { path: "app/(admin)/policies/[id]/page.tsx", plan: "03-11" },
    { path: "app/(admin)/policies/[id]/actions.ts", plan: "03-07" },
    { path: "app/(admin)/onboarding/create-org/page.tsx", plan: "03-11" },
    { path: "components/admin/AdminSidebar.tsx", plan: "03-09" },
    { path: "components/admin/AdminTopbar.tsx", plan: "03-09" },
    { path: "components/policy/PolicyEditor.tsx", plan: "03-10" },
    { path: "components/policy/PolicyView.tsx", plan: "03-10" },
    { path: "components/policy/PolicyStatusBadge.tsx", plan: "03-10" },
    { path: "components/policy/PolicyTransitionMenu.tsx", plan: "03-10" },
    { path: "components/policy/PolicyVersionHistory.tsx", plan: "03-10" },
  ];
  for (const { path, plan } of targets) {
    assert(out, exists(path), `${path} exists (Plan ${plan})`, `Plan ${plan} will create this`);
  }
  return out;
}

/**
 * Phase 3 gap-closure 03-G1 — artifact regression assertions for the
 * Clerk-text → internal-UUID translation inside getOrgContext + the new
 * scripts/check-auth-context.ts integration test + its wiring into the
 * verify orchestrator + the bumped allow-list positive control.
 *
 * @returns An array of `Check` results indicating which 03-G1 invariants passed or failed.
 */
function checkPhase3G1Artifacts(): Check[] {
  const out: Check[] = [];

  // lib/auth/context.ts — the file Task 1 rewrote.
  const ctxPath = "lib/auth/context.ts";
  if (!exists(ctxPath)) {
    out.push(fail(`${ctxPath} exists`, "missing"));
  } else {
    const ctx = read(ctxPath);
    assert(
      out,
      ctx.includes("clerkOrgId: string"),
      `${ctxPath}: OrgContext declares clerkOrgId: string (03-G1)`,
      "clerkOrgId field missing from OrgContext type",
    );
    assert(
      out,
      ctx.includes("clerkUserId: string"),
      `${ctxPath}: OrgContext declares clerkUserId: string (03-G1)`,
      "clerkUserId field missing from OrgContext type",
    );
    assert(
      out,
      ctx.includes("eq(organizations.clerkOrgId"),
      `${ctxPath}: DB lookup uses eq(organizations.clerkOrgId, ...) (03-G1)`,
      "organizations.clerkOrgId lookup missing",
    );
    assert(
      out,
      ctx.includes("eq(users.clerkUserId"),
      `${ctxPath}: DB lookup uses eq(users.clerkUserId, ...) (03-G1)`,
      "users.clerkUserId lookup missing",
    );
    assert(
      out,
      ctx.includes("from '@/lib/db'"),
      `${ctxPath}: imports db from @/lib/db (03-G1 ADR-023 allow-list entry)`,
      "db barrel import missing",
    );
    assert(
      out,
      ctx.includes("Org not provisioned in DB for"),
      `${ctxPath}: missing-org error path uses 'Org not provisioned in DB for' (03-G1)`,
      "missing-org error message missing",
    );
    assert(
      out,
      ctx.includes("User not provisioned in DB for"),
      `${ctxPath}: missing-user error path uses 'User not provisioned in DB for' (03-G1)`,
      "missing-user error message missing",
    );
  }

  // scripts/check-auth-context.ts — Task 2 new integration test.
  const checkAuthCtxPath = "scripts/check-auth-context.ts";
  if (!exists(checkAuthCtxPath)) {
    out.push(fail(`${checkAuthCtxPath} exists`, "missing (03-G1 Task 2)"));
  } else {
    out.push(ok(`${checkAuthCtxPath} exists (03-G1 Task 2)`));
    const cac = read(checkAuthCtxPath);
    assert(
      out,
      cac.includes("Policies.statusCounts"),
      `${checkAuthCtxPath}: exercises Policies.statusCounts`,
      "first-failure repo call missing",
    );
    assert(
      out,
      cac.includes("bugTriggered"),
      `${checkAuthCtxPath}: negative-control sentinel 'bugTriggered' present`,
      "negative control missing",
    );
    assert(
      out,
      cac.includes("clerk_org_check_authctx"),
      `${checkAuthCtxPath}: unique seed sentinel 'clerk_org_check_authctx' present (prevents accidental delete)`,
      "seed sentinel missing",
    );
  }

  // scripts/check-data-layer.ts — Task 2 orchestrator wiring.
  const cdlPath = "scripts/check-data-layer.ts";
  if (!exists(cdlPath)) {
    out.push(fail(`${cdlPath} exists`, "missing"));
  } else {
    const cdl = read(cdlPath);
    assert(
      out,
      cdl.includes("checkAuthContext"),
      `${cdlPath}: declares + calls checkAuthContext (03-G1 wiring)`,
      "checkAuthContext not wired",
    );
    assert(
      out,
      cdl.includes("03-G1 — auth-context Clerk-text → UUID translation"),
      `${cdlPath}: contains 03-G1 label string`,
      "03-G1 label missing",
    );
    // Step count bumped 7 → 8: logResult(1, 8, ...) must appear exactly once
    // (the first check). Use a substring match — the regex form
    // logResult\([0-9]+, 8, would also work but substring is simpler and
    // sufficient for the mechanical-edit confirmation.
    const matches1of8 = (cdl.match(/logResult\(1, 8,/g) ?? []).length;
    assert(
      out,
      matches1of8 === 1,
      `${cdlPath}: logResult(1, 8, ...) appears exactly once (step count bumped 7→8)`,
      `found ${matches1of8} match(es) — expected 1`,
    );
  }

  // scripts/check-db-imports.ts — Task 1 ALLOWLIST + positive-control bump.
  const cdiPath = "scripts/check-db-imports.ts";
  if (!exists(cdiPath)) {
    out.push(fail(`${cdiPath} exists`, "missing"));
  } else {
    const cdi = read(cdiPath);
    assert(
      out,
      cdi.includes("lib/auth/context.ts"),
      `${cdiPath}: ALLOWLIST contains lib/auth/context.ts (03-G1)`,
      "ADR-023 allow-list entry missing",
    );
    assert(
      out,
      !cdi.includes("allowListedHits >= 2"),
      `${cdiPath}: positive control bumped from >= 2 (03-G1)`,
      "stale 'allowListedHits >= 2' still present",
    );
    assert(
      out,
      cdi.includes("allowListedHits >= 3"),
      `${cdiPath}: positive control bumped to >= 3 (03-G1)`,
      "expected 'allowListedHits >= 3' present",
    );
  }

  return out;
}

/**
 * Runs the full set of artifact regression checks, prints results, and terminates the process.
 *
 * Aggregates Phase 1 and Phase 2 checks, prints a line for each check indicating pass or fail,
 * prints a summary count, and exits the Node process with status `0` when all checks pass or
 * non-zero when any check fails.
 */

function main(): void {
  console.log("─── Foundation — artifact regression gate ───");
  console.log(`Repo root: ${REPO_ROOT}`);
  console.log("");

  const all: Check[] = [
    ...checkPackageJsonShape(),
    ...checkTsconfigHardening(),
    ...checkShadcnPrimitives(),
    checkPnpmLock(),
    ...checkEnvExample(),
    ...checkGitignore(),
    checkEnvLocalGitIgnoreLive(),
    ...checkEnvLocalSentinels(),
    ...checkAppShell(),
    ...checkMiddleware(),
    ...checkDrizzleSkeleton(),
    ...checkSmokeScripts(),
    ...checkServerOnlyBoundary(),
    // Phase 2 additions:
    ...checkPhase2Schema(),
    ...checkPhase2ScopedAndContext(),
    ...checkPhase2Repositories(),
    ...checkPhase2WebhookHandler(),
    ...checkPhase2MiddlewareFold(),
    // Phase 3 additions:
    ...checkPhase3Scaffold(),
    ...checkPhase3FileExistence(),
    // Phase 3 gap-closure 03-G1 additions:
    ...checkPhase3G1Artifacts(),
    ...checkPhase2Migrations(),
    ...checkPhase2TypeTests(),
    ...checkPhase2VerifyScripts(),
  ];

  let passed = 0;
  let failed = 0;
  for (const c of all) {
    if (c.ok) {
      passed += 1;
      console.log(`  OK    ${c.label}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${c.label}${c.detail ? `  —  ${c.detail}` : ""}`);
    }
  }

  console.log("");
  console.log(`Total: ${all.length} | Passed: ${passed} | Failed: ${failed}`);
  if (failed > 0) {
    console.error(`✗ ${failed} artifact assertion(s) failed.`);
    process.exit(1);
  }
  console.log(`✓ All ${passed} artifact assertions passed.`);
  process.exit(0);
}

main();
