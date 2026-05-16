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

// ─── Plan 01-01: scaffold + tsconfig hardening + deps + shadcn ─────────────

function checkPackageJsonShape(): Check[] {
  const out: Check[] = [];
  if (!exists("package.json")) {
    out.push(fail("package.json exists", "missing at repo root"));
    return out;
  }
  out.push(ok("package.json exists"));
  const pkg = read("package.json");

  // Next 15 major
  if (/"next":\s*"(?:\^|~)?15\./.test(pkg) || /"next":\s*"15\./.test(pkg)) {
    out.push(ok("package.json pins next@15.x (ADR-010)"));
  } else {
    out.push(fail("package.json pins next@15.x (ADR-010)", "no '\"next\": \"15.' substring found"));
  }

  // engines.node — ADR-022 supersedes D-01: Node 22 Active LTS
  if (/"engines"\s*:\s*\{[^}]*"node"/.test(pkg)) {
    out.push(ok("package.json declares engines.node (ADR-022)"));
  } else {
    out.push(fail("package.json declares engines.node (ADR-022)", "engines.node not present"));
  }

  // Phase 1 stack-table dependencies
  const requiredDeps = [
    "@clerk/nextjs",
    "drizzle-orm",
    "postgres",
    "@supabase/supabase-js",
    "drizzle-kit",
    "tsx",
  ];
  for (const dep of requiredDeps) {
    if (pkg.includes(`"${dep}"`)) {
      out.push(ok(`package.json declares ${dep}`));
    } else {
      out.push(fail(`package.json declares ${dep}`, "dependency missing"));
    }
  }

  // pnpm scripts that downstream gates depend on
  for (const scriptKey of ["verify:phase-1", "check:db", "check:artifacts", "typecheck"]) {
    if (pkg.includes(`"${scriptKey}"`)) {
      out.push(ok(`package.json scripts contains ${scriptKey}`));
    } else {
      out.push(fail(`package.json scripts contains ${scriptKey}`, "script slot missing"));
    }
  }

  // verify:phase-1 wires the correct tsx invocation (Plan 01-05 strict regex,
  // relaxed to substring so the script may chain `&& pnpm check:artifacts`
  // for the Phase 1 VALIDATION static-artifact gate).
  if (
    /"verify:phase-1"\s*:\s*"[^"]*tsx --env-file=\.env\.local scripts\/check-foundation\.ts[^"]*"/.test(
      pkg,
    )
  ) {
    out.push(ok("verify:phase-1 includes tsx --env-file=.env.local scripts/check-foundation.ts"));
  } else {
    out.push(
      fail(
        "verify:phase-1 includes tsx --env-file=.env.local scripts/check-foundation.ts",
        "wiring missing (Plan 01-05 acceptance)",
      ),
    );
  }
  // Phase 1 VALIDATION: verify:phase-1 must also call this artifact gate
  // so the full Phase 1 acceptance surface (HTTP probes + static artifacts)
  // is one command.
  if (/"verify:phase-1"\s*:\s*"[^"]*check:artifacts[^"]*"/.test(pkg)) {
    out.push(ok("verify:phase-1 chains check:artifacts (Phase 1 VALIDATION)"));
  } else {
    out.push(
      fail(
        "verify:phase-1 chains check:artifacts (Phase 1 VALIDATION)",
        "static-artifact gate not wired into the verify command",
      ),
    );
  }

  // check:db uses --env-file=.env.local (Plan 01-04 Task 3 acceptance)
  if (/"check:db"\s*:\s*"tsx [^"]*--env-file=\.env\.local[^"]*"/.test(pkg)) {
    out.push(ok("check:db wires --env-file=.env.local (Plan 01-04 acceptance)"));
  } else {
    out.push(
      fail(
        "check:db wires --env-file=.env.local",
        "tsx --env-file flag missing from check:db script",
      ),
    );
  }

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
    if (tsconfig.includes(flag)) {
      out.push(ok(`tsconfig.json contains ${flag} (D-08)`));
    } else {
      out.push(fail(`tsconfig.json contains ${flag} (D-08)`, "D-08 strictness flag missing"));
    }
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
    if (exists(rel)) {
      out.push(ok(`${rel} exists (D-05 primitive)`));
    } else {
      out.push(fail(`${rel} exists (D-05 primitive)`, "shadcn artifact missing"));
    }
  }
  if (exists("lib/utils.ts")) {
    const utils = read("lib/utils.ts");
    if (utils.includes("export function cn")) {
      out.push(ok("lib/utils.ts exports cn() helper"));
    } else {
      out.push(fail("lib/utils.ts exports cn() helper", "cn() not exported"));
    }
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
  // D-11 / Plan 01-01 Task 3: DATABASE_URL line present
  if (/^DATABASE_URL=/m.test(env)) {
    out.push(ok(".env.local.example contains DATABASE_URL= (D-11)"));
  } else {
    out.push(fail(".env.local.example contains DATABASE_URL= (D-11)", "DATABASE_URL key missing"));
  }
  // Plan 01-01 Task 3 acceptance: Supabase block still has all three original keys
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL=",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=",
    "CLERK_SECRET_KEY=",
    "CLERK_WEBHOOK_SECRET=",
    "NEXT_PUBLIC_APP_URL=",
  ]) {
    if (env.includes(key)) {
      out.push(ok(`.env.local.example declares ${key}`));
    } else {
      out.push(fail(`.env.local.example declares ${key}`, "key removed?"));
    }
  }
  // Values must be blank in the template (no secret-shaped leaks)
  // Allowed non-secret defaults documented in 01-SECURITY.md T-01-02 evidence:
  //   RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_POSTHOG_HOST.
  // Anything else with a value after `=` would be a leak.
  const lines = env.split(/\r?\n/);
  const allowedNonBlank = new Set([
    "RESEND_FROM_EMAIL",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_POSTHOG_HOST",
  ]);
  let leaks = 0;
  for (const line of lines) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.+)$/.exec(line);
    if (m && m[1] && !allowedNonBlank.has(m[1])) {
      leaks += 1;
    }
  }
  if (leaks === 0) {
    out.push(ok(".env.local.example has no unexpected non-blank values (T-01-02)"));
  } else {
    out.push(
      fail(
        ".env.local.example has no unexpected non-blank values (T-01-02)",
        `${leaks} key(s) have a value — would commit a secret`,
      ),
    );
  }
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
  const envLocalIgnored =
    /(^|\n)\s*\.env\.local(\s|$)/.test(gi) || /(^|\n)\s*\.env\*\.local(\s|$)/.test(gi) ||
    /(^|\n)\s*\*\.local(\s|$)/.test(gi);
  if (envLocalIgnored) {
    out.push(ok(".gitignore blocks .env.local (T-01-01 / T-02-01)"));
  } else {
    out.push(
      fail(
        ".gitignore blocks .env.local (T-01-01 / T-02-01)",
        "neither .env.local nor .env*.local nor *.local pattern present",
      ),
    );
  }
  // Plan 01-01 Task 1 step 7 — .next/ ignored
  if (/\.next\//.test(gi)) {
    out.push(ok(".gitignore ignores .next/ (build output)"));
  } else {
    out.push(fail(".gitignore ignores .next/ (build output)", "Next.js build dir would be committed"));
  }
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
    if (env.includes(needle)) {
      out.push(ok(`.env.local sentinel: ${label}`));
    } else {
      out.push(fail(`.env.local sentinel: ${label}`, "sentinel substring missing"));
    }
  }
  return out;
}

// ─── Plan 01-03: app shell — Clerk + marketing + auth ──────────────────────

function checkAppShell(): Check[] {
  const out: Check[] = [];
  // ClerkProvider at root layout
  if (!exists("app/layout.tsx")) {
    out.push(fail("app/layout.tsx exists", "root layout missing"));
    return out;
  }
  out.push(ok("app/layout.tsx exists"));
  const layout = read("app/layout.tsx");
  if (/import\s*\{\s*ClerkProvider\s*\}\s*from\s*"@clerk\/nextjs"/.test(layout)) {
    out.push(ok("app/layout.tsx imports ClerkProvider (D-09)"));
  } else {
    out.push(fail("app/layout.tsx imports ClerkProvider (D-09)", "ClerkProvider import missing"));
  }
  if (/<ClerkProvider[\s>]/.test(layout) && /<\/ClerkProvider>/.test(layout)) {
    out.push(ok("app/layout.tsx wraps tree in <ClerkProvider>"));
  } else {
    out.push(fail("app/layout.tsx wraps tree in <ClerkProvider>", "JSX wrapper missing"));
  }
  if (/title:\s*"PolicyPilot/.test(layout)) {
    out.push(ok("app/layout.tsx metadata.title contains 'PolicyPilot'"));
  } else {
    out.push(fail("app/layout.tsx metadata.title contains 'PolicyPilot'", "title missing"));
  }

  // app/page.tsx must NOT exist — conflicts with app/(marketing)/page.tsx
  if (!exists("app/page.tsx")) {
    out.push(ok("app/page.tsx is deleted (route-conflict prevention)"));
  } else {
    out.push(
      fail(
        "app/page.tsx is deleted (route-conflict prevention)",
        "conflicts with app/(marketing)/page.tsx on /",
      ),
    );
  }

  // Marketing landing — D-03 hero copy + CTAs + Button import + Link import
  const landingPath = "app/(marketing)/page.tsx";
  if (!exists(landingPath)) {
    out.push(fail(`${landingPath} exists`, "marketing landing missing"));
  } else {
    out.push(ok(`${landingPath} exists`));
    const landing = read(landingPath);
    if (landing.includes("Policy management for SMBs that beats a Google Drive folder")) {
      out.push(ok("marketing landing contains D-03 hero copy"));
    } else {
      out.push(fail("marketing landing contains D-03 hero copy", "hero string missing"));
    }
    if (landing.includes('from "@/components/ui/button"')) {
      out.push(ok("marketing landing imports Button from @/components/ui/button"));
    } else {
      out.push(
        fail("marketing landing imports Button from @/components/ui/button", "Button import missing"),
      );
    }
    if (landing.includes('from "next/link"')) {
      out.push(ok("marketing landing imports Link from next/link"));
    } else {
      out.push(fail("marketing landing imports Link from next/link", "Link import missing"));
    }
    if (landing.includes("/sign-up")) {
      out.push(ok("marketing landing has /sign-up CTA"));
    } else {
      out.push(fail("marketing landing has /sign-up CTA", "/sign-up href missing"));
    }
    if (landing.includes("/sign-in")) {
      out.push(ok("marketing landing has /sign-in CTA"));
    } else {
      out.push(fail("marketing landing has /sign-in CTA", "/sign-in href missing"));
    }
  }

  // Pricing — D-04 tier names + prices + Card import
  const pricingPath = "app/(marketing)/pricing/page.tsx";
  if (!exists(pricingPath)) {
    out.push(fail(`${pricingPath} exists`, "pricing stub missing"));
  } else {
    out.push(ok(`${pricingPath} exists`));
    const pricing = read(pricingPath);
    if (pricing.includes('from "@/components/ui/card"')) {
      out.push(ok("pricing page imports Card from @/components/ui/card"));
    } else {
      out.push(fail("pricing page imports Card from @/components/ui/card", "Card import missing"));
    }
    for (const tier of ["Starter", "Growth", "Business"]) {
      if (pricing.includes(tier)) {
        out.push(ok(`pricing page mentions tier '${tier}'`));
      } else {
        out.push(fail(`pricing page mentions tier '${tier}'`, "tier missing"));
      }
    }
    for (const price of ["$79", "$199", "$449"]) {
      if (pricing.includes(price)) {
        out.push(ok(`pricing page contains price '${price}'`));
      } else {
        out.push(fail(`pricing page contains price '${price}'`, "price missing"));
      }
    }
  }

  // Marketing layout
  if (exists("app/(marketing)/layout.tsx")) {
    out.push(ok("app/(marketing)/layout.tsx exists"));
  } else {
    out.push(fail("app/(marketing)/layout.tsx exists", "marketing layout missing"));
  }

  // Auth routes — Clerk SignIn / SignUp mounts at optional catch-all
  const signInPath = "app/(auth)/sign-in/[[...sign-in]]/page.tsx";
  if (!exists(signInPath)) {
    out.push(fail(`${signInPath} exists`, "Clerk SignIn mount missing"));
  } else {
    out.push(ok(`${signInPath} exists`));
    const si = read(signInPath);
    if (si.includes('import { SignIn } from "@clerk/nextjs"')) {
      out.push(ok("sign-in page imports SignIn from @clerk/nextjs"));
    } else {
      out.push(fail("sign-in page imports SignIn from @clerk/nextjs", "SignIn import missing"));
    }
    if (/<SignIn\s*\/?>/.test(si)) {
      out.push(ok("sign-in page renders <SignIn />"));
    } else {
      out.push(fail("sign-in page renders <SignIn />", "<SignIn /> JSX missing"));
    }
  }

  const signUpPath = "app/(auth)/sign-up/[[...sign-up]]/page.tsx";
  if (!exists(signUpPath)) {
    out.push(fail(`${signUpPath} exists`, "Clerk SignUp mount missing"));
  } else {
    out.push(ok(`${signUpPath} exists`));
    const su = read(signUpPath);
    if (su.includes('import { SignUp } from "@clerk/nextjs"')) {
      out.push(ok("sign-up page imports SignUp from @clerk/nextjs"));
    } else {
      out.push(fail("sign-up page imports SignUp from @clerk/nextjs", "SignUp import missing"));
    }
    if (/<SignUp\s*\/?>/.test(su)) {
      out.push(ok("sign-up page renders <SignUp />"));
    } else {
      out.push(fail("sign-up page renders <SignUp />", "<SignUp /> JSX missing"));
    }
  }

  if (exists("app/(auth)/layout.tsx")) {
    out.push(ok("app/(auth)/layout.tsx exists"));
  } else {
    out.push(fail("app/(auth)/layout.tsx exists", "auth layout missing"));
  }

  // Sign-in-success placeholder — D-09
  const successPath = "app/sign-in-success/page.tsx";
  if (!exists(successPath)) {
    out.push(fail(`${successPath} exists`, "D-09 placeholder missing"));
  } else {
    out.push(ok(`${successPath} exists`));
    const s = read(successPath);
    // Plan 01-03 acceptance: "signed in" or "Signed in" substring
    if (/signed in/i.test(s)) {
      out.push(ok("sign-in-success placeholder copy includes 'signed in'"));
    } else {
      out.push(fail("sign-in-success placeholder copy includes 'signed in'", "placeholder copy drifted"));
    }
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
  if (m.includes('from "@clerk/nextjs/server"')) {
    out.push(ok("middleware.ts imports from @clerk/nextjs/server (v5+)"));
  } else {
    out.push(fail("middleware.ts imports from @clerk/nextjs/server (v5+)", "server import missing"));
  }
  if (/clerkMiddleware\s*\(/.test(m)) {
    out.push(ok("middleware.ts uses clerkMiddleware factory"));
  } else {
    out.push(fail("middleware.ts uses clerkMiddleware factory", "clerkMiddleware() not used"));
  }
  if (/export\s+const\s+config\s*=/.test(m) && /matcher\s*:/.test(m)) {
    out.push(ok("middleware.ts exports config with matcher array"));
  } else {
    out.push(fail("middleware.ts exports config with matcher array", "config/matcher missing"));
  }
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
    if (m.includes(literal)) {
      out.push(ok(`middleware.ts declares ${literal}`));
    } else {
      out.push(fail(`middleware.ts declares ${literal}`, "matcher entry missing"));
    }
  }
  // 446b554 sibling-prefix fix: must have BOTH /sign-in exact AND /sign-in/(.*) child
  if (m.includes('"/sign-in/(.*)"') && m.includes('"/sign-up/(.*)"')) {
    out.push(ok("middleware.ts has split-matcher form (446b554 sibling-prefix fix)"));
  } else {
    out.push(
      fail(
        "middleware.ts has split-matcher form (446b554 sibling-prefix fix)",
        "greedy /sign-in(.*) would match /sign-in-success — regression",
      ),
    );
  }
  // No `: any` annotation — CLAUDE.md NEVER #4.
  // Use Plan-01-04 verify-block regex: `any` must be in a type-position context
  // (followed by `:`, `,`, or `)` — same shape Plan 01-04 used). Also catch
  // `as any` and `<any>`. This avoids matching the English word "any" in code
  // comments (e.g. `// 5. Default: any other route requires authentication.`).
  const stripped = m.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/\bany\b\s*[:,)]/.test(stripped) || /\bas\s+any\b/.test(stripped) || /<any>/.test(stripped)) {
    out.push(fail("middleware.ts has no 'any' types (CLAUDE.md NEVER #4)", "any type detected"));
  } else {
    out.push(ok("middleware.ts has no 'any' types (CLAUDE.md NEVER #4)"));
  }
  return out;
}

function checkDrizzleSkeleton(): Check[] {
  const out: Check[] = [];

  // schema.ts must be the empty placeholder per D-07
  if (!exists("lib/db/schema.ts")) {
    out.push(fail("lib/db/schema.ts exists", "Drizzle schema file missing"));
  } else {
    out.push(ok("lib/db/schema.ts exists"));
    const s = read("lib/db/schema.ts");
    if (s.includes("export {}")) {
      out.push(ok("lib/db/schema.ts is empty placeholder per D-07"));
    } else {
      out.push(fail("lib/db/schema.ts is empty placeholder per D-07", "schema populated outside Phase 2"));
    }
  }

  // index.ts — server-only, postgres-js, prepare:false, DATABASE_URL
  if (!exists("lib/db/index.ts")) {
    out.push(fail("lib/db/index.ts exists", "Drizzle client missing"));
  } else {
    out.push(ok("lib/db/index.ts exists"));
    const i = read("lib/db/index.ts");
    if (i.includes('import "server-only"')) {
      out.push(ok("lib/db/index.ts declares import \"server-only\" (T-04-02)"));
    } else {
      out.push(
        fail(
          'lib/db/index.ts declares import "server-only" (T-04-02)',
          "server-only guard missing — Client Components could import DB",
        ),
      );
    }
    if (i.includes("drizzle-orm/postgres-js")) {
      out.push(ok("lib/db/index.ts uses drizzle-orm/postgres-js driver (D-06)"));
    } else {
      out.push(
        fail(
          "lib/db/index.ts uses drizzle-orm/postgres-js driver (D-06)",
          "wrong Drizzle driver",
        ),
      );
    }
    if (/process\.env\.DATABASE_URL/.test(i)) {
      out.push(ok("lib/db/index.ts reads process.env.DATABASE_URL"));
    } else {
      out.push(fail("lib/db/index.ts reads process.env.DATABASE_URL", "DATABASE_URL not read"));
    }
    if (/prepare\s*:\s*false/.test(i)) {
      out.push(ok("lib/db/index.ts sets prepare: false (Supabase pooler, D-06)"));
    } else {
      out.push(
        fail(
          "lib/db/index.ts sets prepare: false (Supabase pooler, D-06)",
          "pooler will error on prepared statements",
        ),
      );
    }
    const iStripped = i.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (
      /\bany\b\s*[:,)]/.test(iStripped) ||
      /\bas\s+any\b/.test(iStripped) ||
      /<any>/.test(iStripped)
    ) {
      out.push(fail("lib/db/index.ts has no 'any' types", "any type detected"));
    } else {
      out.push(ok("lib/db/index.ts has no 'any' types"));
    }
  }

  // drizzle.config.ts — schema path, postgresql dialect, satisfies Config
  if (!exists("drizzle.config.ts")) {
    out.push(fail("drizzle.config.ts exists", "drizzle-kit config missing"));
  } else {
    out.push(ok("drizzle.config.ts exists"));
    const cfg = read("drizzle.config.ts");
    if (/schema\s*:\s*"\.\/lib\/db\/schema\.ts"/.test(cfg)) {
      out.push(ok("drizzle.config.ts schema → ./lib/db/schema.ts"));
    } else {
      out.push(fail("drizzle.config.ts schema → ./lib/db/schema.ts", "schema path wrong"));
    }
    if (/dialect\s*:\s*"postgresql"/.test(cfg)) {
      out.push(ok("drizzle.config.ts dialect = postgresql"));
    } else {
      out.push(fail("drizzle.config.ts dialect = postgresql", "dialect wrong/missing"));
    }
    if (/satisfies\s+Config/.test(cfg)) {
      out.push(ok("drizzle.config.ts is type-safe (satisfies Config)"));
    } else {
      out.push(fail("drizzle.config.ts is type-safe (satisfies Config)", "missing satisfies clause"));
    }
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
    if (s.includes("select 1")) {
      out.push(ok("scripts/check-db.ts runs `select 1` (T-04-07: read-only)"));
    } else {
      out.push(fail("scripts/check-db.ts runs `select 1` (T-04-07: read-only)", "select 1 missing"));
    }
    if (s.includes('from "@/lib/db"')) {
      out.push(ok("scripts/check-db.ts imports db from @/lib/db"));
    } else {
      out.push(fail("scripts/check-db.ts imports db from @/lib/db", "import missing"));
    }
    if (/process\.exit\(0\)/.test(s) && /process\.exit\(1\)/.test(s)) {
      out.push(ok("scripts/check-db.ts has both exit(0) and exit(1) branches"));
    } else {
      out.push(
        fail(
          "scripts/check-db.ts has both exit(0) and exit(1) branches",
          "missing one of the exit branches — vacuous-pass risk",
        ),
      );
    }
    // T-04-07: no mutating SQL verbs
    if (/\b(insert|update|delete|drop|create|alter|truncate)\b\s/i.test(s)) {
      out.push(
        fail(
          "scripts/check-db.ts is read-only (T-04-07)",
          "mutating SQL verb detected — smoke check must be select-only",
        ),
      );
    } else {
      out.push(ok("scripts/check-db.ts is read-only (T-04-07)"));
    }
  }
  // check-foundation.ts — Plan 01-05 self-check
  if (!exists("scripts/check-foundation.ts")) {
    out.push(fail("scripts/check-foundation.ts exists", "verify gate script missing"));
  } else {
    out.push(ok("scripts/check-foundation.ts exists"));
    const s = read("scripts/check-foundation.ts");
    if (s.includes("Policy management for SMBs that beats a Google Drive folder")) {
      out.push(ok("check-foundation.ts asserts D-03 hero substring"));
    } else {
      out.push(fail("check-foundation.ts asserts D-03 hero substring", "hero assertion missing"));
    }
    for (const path of ['"/"', '"/sign-in"', '"/sign-up"', '"/sign-in-success"']) {
      if (s.includes(path)) {
        out.push(ok(`check-foundation.ts probes ${path}`));
      } else {
        out.push(fail(`check-foundation.ts probes ${path}`, "probe path missing"));
      }
    }
    if (/process\.exit\(0\)/.test(s) && /process\.exit\(1\)/.test(s)) {
      out.push(ok("check-foundation.ts has both exit(0) and exit(1) branches (T-05-01)"));
    } else {
      out.push(
        fail(
          "check-foundation.ts has both exit(0) and exit(1) branches (T-05-01)",
          "vacuous-pass risk",
        ),
      );
    }
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
    { encoding: "utf8", cwd: REPO_ROOT },
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
