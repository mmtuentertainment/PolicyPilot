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
// English word "any" inside code comments (e.g. `// 5. Default: any other
// route...`) doesn't trigger a false positive.
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

  // Phase 1 stack-table dependencies
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

  // Sign-in-success placeholder — D-09
  const successPath = "app/sign-in-success/page.tsx";
  if (!exists(successPath)) {
    out.push(fail(`${successPath} exists`, "D-09 placeholder missing"));
  } else {
    out.push(ok(`${successPath} exists`));
    assert(
      out,
      /signed in/i.test(read(successPath)),
      "sign-in-success placeholder copy includes 'signed in'",
      "placeholder copy drifted",
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

function checkDrizzleSkeleton(): Check[] {
  const out: Check[] = [];

  // schema.ts must be the empty placeholder per D-07
  if (!exists("lib/db/schema.ts")) {
    out.push(fail("lib/db/schema.ts exists", "Drizzle schema file missing"));
  } else {
    out.push(ok("lib/db/schema.ts exists"));
    assert(
      out,
      read("lib/db/schema.ts").includes("export {}"),
      "lib/db/schema.ts is empty placeholder per D-07",
      "schema populated outside Phase 2",
    );
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
    for (const path of ['"/"', '"/sign-in"', '"/sign-up"', '"/sign-in-success"']) {
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

// ─── T-03-05 / T-04-03 — `lib/db` is server-only-imported ──────────────────

function checkServerOnlyBoundary(): Check[] {
  // Grep all source files for `from "@/lib/db"` — the only legitimate
  // consumer in Phase 1 is scripts/check-db.ts. Any other file would be a
  // server-only-guard breach (Client Component imports would trigger build
  // failure, but App-Router Server Components could still leak data in
  // Phase 1 if they exist — and none should in Phase 1 per ROADMAP).
  const out: Check[] = [];
  const result = spawnSync(
    "node",
    [
      "-e",
      // Cross-platform grep replacement using Node fs walker.
      `const fs = require('node:fs'); const path = require('node:path');
       const SKIP = new Set(['node_modules','.next','.git','.planning','.wiki','docs','reference','drizzle']);
       const hits = [];
       function walk(dir) {
         for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
           if (SKIP.has(entry.name)) continue;
           const full = path.join(dir, entry.name);
           if (entry.isDirectory()) { walk(full); continue; }
           if (!/\\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
           const content = fs.readFileSync(full, 'utf8');
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
        "grep `from \"@/lib/db\"` — Phase 1 importers",
        `walker error: ${(result.stderr || "").trim()}`,
      ),
    );
    return out;
  }
  const hits = (result.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Only allowed Phase 1 consumer: scripts/check-db.ts.
  // scripts/check-artifacts.ts (this file) contains the needle `from "@/lib/db"`
  // as a literal string inside the grep walker template — not a real import —
  // so we whitelist it the same way.
  const allowed = new Set([
    "scripts/check-db.ts",
    "./scripts/check-db.ts",
    "scripts/check-artifacts.ts",
    "./scripts/check-artifacts.ts",
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

// ─── Main ─────────────────────────────────────────────────────────────────

function main(): void {
  console.log("─── Phase 1 Foundation — artifact regression gate ───");
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
