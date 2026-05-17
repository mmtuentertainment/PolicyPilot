---
phase: 01-foundation
plan: 04
subsystem: auth-and-data-plumbing
tags: [middleware, clerk, drizzle, postgres-js, supabase-pooler, server-only, smoke-check]
one_liner: "Clerk middleware (ADR-009 / D-10 public-route + webhook/cron exemptions) + Drizzle skeleton (postgres-js over Supabase Transaction pooler with prepare:false + server-only guard) + scripts/check-db.ts smoke check (Phase 1 success criterion 4)"
dependency_graph:
  requires:
    - 01-01  # @clerk/nextjs, drizzle-orm, postgres, drizzle-kit, tsx installed; check:db script slot reserved
    - 01-02  # .env.local populated with DATABASE_URL + Clerk keys
  provides:
    - "middleware.ts at repo root — single auth chokepoint per ADR-009"
    - "Public routes (/ /pricing /sign-in /sign-up) reachable unauthenticated; everything else redirects to /sign-in"
    - "Webhook exemption /api/webhooks/{stripe,clerk} — Phase 2 + Phase 6 lands cleanly"
    - "Cron exemption /api/cron/* — Phase 7 lands cleanly"
    - "Admin role gate wired (inert in Phase 1 — no /(admin)/* routes yet)"
    - "Drizzle client at lib/db/index.ts (server-only guarded) over Supabase pooler with prepare:false"
    - "Empty lib/db/schema.ts placeholder (D-07 — Phase 2 fills tables)"
    - "drizzle.config.ts pointing at lib/db/schema.ts, type-safe via satisfies Config"
    - "pnpm check:db smoke test — select 1 round-trips against Supabase pooler"
  affects: [01-05, 02-*, 03-*, 06-*, 07-*]
tech_stack:
  added:
    runtime: []  # No new packages — all imports satisfied by Plan 01-01 install set
    dev: []
    shadcn_transitive: []
  patterns:
    - "clerkMiddleware (v5+ API) replacing the deprecated v4 authMiddleware"
    - "createRouteMatcher with glob patterns including trailing (.*) for Clerk catch-all child routes (/sign-in/factor-one etc.)"
    - "postgres-js driver with prepare:false for Supabase Transaction pooler (port 6543) — pooler does not cache prepared statements"
    - "import \"server-only\" gate on lib/db/index.ts — build-time error if a Client Component imports it (T-04-02)"
    - "tsx --conditions=react-server flag on the smoke script — resolves server-only's react-server export condition to empty.js, letting standalone Node import the same module that Next.js compiles for RSCs"
    - "tsx --env-file=.env.local — Node 22 native env-loader, no dotenv dependency added"
    - "Top-level throw on missing DATABASE_URL in both lib/db/index.ts and drizzle.config.ts — fail-loud at module evaluation, not at first query"
key_files:
  created:
    - middleware.ts
    - lib/db/index.ts
    - lib/db/schema.ts
    - drizzle.config.ts
    - scripts/check-db.ts
  modified:
    - package.json  # check:db script now: tsx --conditions=react-server --env-file=.env.local scripts/check-db.ts
decisions:
  - "Set tsx flag `--conditions=react-server` on `pnpm check:db` so the `server-only` npm package resolves to its `empty.js` no-op (per the package's own `exports` field). Production Next.js bundling still resolves `server-only` to the throwing `index.js`, so the T-04-02 client-component import gate is preserved. This was the cleanest path that honors Task 2's `import \"server-only\"` acceptance AND Task 3's `from \"@/lib/db\"` substring acceptance AND requires `pnpm check:db` to actually run end-to-end."
  - "Admin role gate uses 404 (not 403) on unauthorized access per D-10 — surfacing a 403 would imply the admin routes exist. Phase 3 may convert to a redirect once `/dashboard`, `/policies`, etc. are real."
  - "Matcher pattern /(admin)/(.*) is dead code in Phase 1 (route groups never appear in URLs). Phase plan-checker flagged this WARNING; comment in middleware.ts documents that Phase 3 will rewrite the matcher to target real admin route surface."
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  files_touched: 6  # 5 created + 1 modified
  commits: 3
completed: 2026-05-16
---

# Phase 01 Plan 04: middleware.ts + Drizzle skeleton + smoke check — Summary

## What was built

The auth + data-access plumbing for Phase 1. Three files materialized: `middleware.ts` (the single Clerk auth chokepoint per ADR-009 / D-10), the Drizzle skeleton (`lib/db/index.ts`, `lib/db/schema.ts`, `drizzle.config.ts`) per D-06 / D-07, and `scripts/check-db.ts` — the smoke test that satisfies Phase 1 success criterion 4 ("Supabase client connects via Drizzle").

After this plan, `pnpm check:db` round-trips `select 1` against Supabase's Transaction pooler in ~3.5s cold and exits 0 with output `OK`. `pnpm tsc --noEmit` exits 0. The middleware is wired but not yet HTTP-probed — Plan 01-05 takes that integration step.

## Task Breakdown

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | middleware.ts — Clerk auth + public-route policy (ADR-009 / D-10) | `49e2826` | `middleware.ts` |
| 2 | Drizzle skeleton — empty schema, db client, drizzle.config.ts (D-06 / D-07) | `6dcd38a` | `lib/db/{index,schema}.ts`, `drizzle.config.ts` |
| 3 | scripts/check-db.ts — `select 1` smoke check (success criterion 4) | `ca568ce` | `scripts/check-db.ts`, `package.json` (check:db script) |

## Resolved package versions (consumed from Plan 01-01 install)

| Package | Version | Used by |
|---------|---------|---------|
| @clerk/nextjs | 7.3.4 | middleware.ts (clerkMiddleware, createRouteMatcher) |
| drizzle-orm | 0.45.2 | lib/db/index.ts (drizzle factory, sql) |
| drizzle-kit | 0.31.10 | drizzle.config.ts (Config type) |
| postgres | 3.4.9 | lib/db/index.ts (postgres client) |
| tsx | 4.22.0 | scripts/check-db.ts execution |
| server-only | 0.0.1 | transitive via React — guards lib/db/index.ts from client-component imports |

No package upgrades required. The plan's Task 1 fallback ("if Clerk v5 API surface is missing, run `pnpm add @clerk/nextjs@latest`") was NOT triggered — 7.3.4 already exports `clerkMiddleware` and `createRouteMatcher` from `@clerk/nextjs/server`.

## `pnpm check:db` smoke test result

```
> tsx --conditions=react-server --env-file=.env.local scripts/check-db.ts
OK
```

- **Exit code:** 0
- **Round-trip latency (cold):** ~3.5s end-to-end (`pnpm check:db` invocation through `select 1` ack)
- **Network hop:** repo root → Supabase Transaction pooler (port 6543) → back. Of the ~3.5s, ~1s is pnpm + tsx startup; the actual `select 1` round-trip on the pooler is sub-second based on subsequent warm runs.

Latency is informational — there is no plan-stated threshold. Sanity check on pooler health: green.

## Middleware policy verification (literal-string assertions)

All seven plan-stated route entries are present in `middleware.ts`:

| Entry | Disposition |
|-------|-------------|
| `"/"` | Public (no auth) |
| `/pricing` | Public (no auth) |
| `/sign-in` (and `/sign-in(.*)` for Clerk catch-all child routes) | Public (no auth) |
| `/sign-up` (and `/sign-up(.*)` for Clerk catch-all child routes) | Public (no auth) |
| `/api/webhooks/stripe` | Exempt (Phase 6 verifies signature in-handler) |
| `/api/webhooks/clerk` | Exempt (Phase 2 verifies signature in-handler) |
| `/api/cron/(.*)` | Exempt (Phase 7 enforces CRON_SECRET in-handler) |
| `/(admin)/(.*)` matcher | Wired but inert — comment documents Phase 3 will rewrite to target real admin routes |
| any other route | Default: redirect to `/sign-in?redirect_url=…` |

Note: the route-group `(admin)` matcher pattern is documented in the code as dead code per the plan-checker WARNING from STATE.md — Phase 3 rewrites it once `/dashboard`, `/policies`, etc. exist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsx` runs `import "server-only"` outside Next.js → unconditional throw**

- **Found during:** Task 3 first `pnpm check:db` invocation.
- **Issue:** Plan 01-04 Task 2 mandates `import "server-only";` at the top of `lib/db/index.ts` (T-04-02 mitigation — build-time error if a Client Component imports `db`). Plan 01-04 Task 3 then requires `scripts/check-db.ts` to `import { db } from "@/lib/db"` and for `pnpm check:db` to exit 0. These are in tension: the `server-only` npm package throws unconditionally when imported by raw Node (it relies on Next.js's webpack/turbopack rewriting). Running `tsx --env-file=.env.local scripts/check-db.ts` reproduced the error:
  ```
  Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.
      at Object.<anonymous> (.../server-only/index.js:1:7)
  ```
- **Fix:** Inspected the `server-only` package's `exports` field:
  ```json
  "exports": { ".": { "react-server": "./empty.js", "default": "./index.js" } }
  ```
  Added `--conditions=react-server` to the `pnpm check:db` invocation. Node's `--conditions` flag activates the `react-server` export condition, which Next.js itself sets when bundling Server Components. With this flag, the import resolves to `empty.js` (a zero-byte no-op) instead of the throwing `index.js`. Production Next.js builds still resolve to `index.js` for any Client Component import path, so T-04-02 (DATABASE_URL never reaches the client bundle) is fully preserved.
- **Files modified:** `package.json` — `check:db` script now reads `tsx --conditions=react-server --env-file=.env.local scripts/check-db.ts`. Still matches the plan's verify regex `'check:db.*--env-file=\.env\.local'`.
- **Commit:** Folded into Task 3 commit `ca568ce`.

### Architectural changes

None.

## Threat-model dispositions

| Threat ID | Result |
|-----------|--------|
| T-04-01 (HIGH — middleware misconfiguration exposes private route as public) | MITIGATED. Task 1 verify-block PASSED with literal-string assertions on all 4 public routes + both webhook exemptions + cron exemption. Default branch is fail-closed (redirect to /sign-in). Plan 01-05 will add the integrated HTTP probe. |
| T-04-02 (HIGH — DATABASE_URL imported into Client Component bundle) | MITIGATED. `lib/db/index.ts` starts with `import "server-only"`. In Next.js builds, this resolves to the throwing `index.js` for non-RSC contexts → build error if any Client Component imports `db`. The `--conditions=react-server` flag on the smoke script is the only path that opts into the no-op resolution, and it's confined to the standalone script — never reaches the Next.js bundle. |
| T-04-03 (Tampering — Client Component imports `db` directly to bypass API-route validation) | MITIGATED (cross-phase). The server-only gate from T-04-02 catches the most basic misuse. Phase 2 establishes the `org_id`-in-every-query rule (ADR-019). |
| T-04-04 (DoS — misconfigured `prepare: false` exhausts Supabase pooler connection pool) | MITIGATED. Task 2 verify-block PASSED with literal `prepare:\s*false` assertion against `lib/db/index.ts`. Live smoke run with `pnpm check:db` confirms the pooler accepts the configured client (no `prepared statement cached plan` errors). |
| T-04-05 (Spoofing — attacker POSTs arbitrary JSON to /api/webhooks/stripe via matcher exemption) | MITIGATED (cross-phase). Phase 1 has no Stripe webhook handler — any request to /api/webhooks/stripe returns Next.js's default 404. Phase 6 wires `stripe.webhooks.constructEvent` for signature verification per ADR-020. |
| T-04-06 (Information disclosure — connection string in error message from check-db.ts) | MITIGATED. Error handler logs `err.message` only (postgres-js does not include connection URL in `Error.message`, only host/SQL). `try/catch` around the `await` prevents Node's default unhandled-rejection path from printing a stack with the URL. |
| T-04-07 (Tampering — smoke check accidentally mutates DB) | MITIGATED. Script runs `select 1` only — pure SELECT, zero CREATE/INSERT/UPDATE/DELETE. Task 3 verify asserts the literal `select 1` substring is present. |

ASVS L1 severity assessment: both HIGH threats (T-04-01, T-04-02) have literal-string assertions on the mitigation as part of the plan's verify-block and PASSED.

## Acceptance Criteria Status (Plan 01-04 success_criteria)

| Criterion | Result |
|-----------|--------|
| `middleware.ts` enforces ADR-009 / D-10 policy verbatim | PASS — Task 1 verify PASS, all 7 literal-string assertions confirmed |
| Webhook + cron route matchers are exempted (no Phase 2 / Phase 7 breakage later) | PASS |
| Drizzle client compiles + connects to Supabase pooler | PASS — `pnpm check:db` exits 0 |
| `lib/db/schema.ts` is intentionally empty (D-07) | PASS — contains exactly `export {};` |
| `pnpm check:db` exits 0 and prints `OK` | PASS |
| `pnpm tsc --noEmit` exits 0 | PASS — final post-Task-3 run clean |
| No `: any` annotations introduced | PASS — regex sweep clean across all 5 files |
| `lib/db/index.ts` declared `server-only` | PASS — `import "server-only";` is line 3 |

## Self-Check: PASSED

- File existence: `middleware.ts`, `lib/db/index.ts`, `lib/db/schema.ts`, `drizzle.config.ts`, `scripts/check-db.ts` — all FOUND.
- Commits: `49e2826`, `6dcd38a`, `ca568ce` — all FOUND in `git log --oneline -10`.
- `pnpm tsc --noEmit`: exit 0 verified post-Task-3.
- `pnpm check:db`: exit 0 verified, prints `OK`.
- No `: any` annotations: confirmed across all 5 files via regex sweep (`-match '\bany\b\s*[:,)]'`).

## Notes for downstream plans

- **Plan 01-05 (verify scripts):** Now has all the pieces for the integrated HTTP probe.
  - `pnpm verify:phase-1` should compose: `tsc --noEmit` → `check:db` → `next start` boot → HTTP probes against `/` (200), `/pricing` (200), `/sign-in` (200), some non-public path like `/foo` (307 to `/sign-in`). Use `--conditions=react-server` if the verify script also imports anything from `lib/db`.
- **Phase 2 (Data Layer):**
  - `lib/db/schema.ts` is the empty placeholder ready to be populated from `reference/SCHEMA.md`.
  - `lib/db/index.ts` already exports `db: PostgresJsDatabase` with the schema parameterized via `drizzle(client, { schema })`. Once tables land in schema.ts, every query on `db` gets typed automatically.
  - `drizzle.config.ts` is ready for `pnpm drizzle-kit generate` / `pnpm drizzle-kit migrate`. Note: `drizzle/` output directory is gitignored per Plan 01-01 — Phase 2 should make a deliberate decision about committing generated migration SQL.
  - Webhook route `/api/webhooks/clerk` (Phase 2) is already matcher-exempt in `middleware.ts` — Phase 2 can drop in the handler without revisiting middleware.
- **Phase 3 (Admin UI):**
  - The `/(admin)/(.*)` matcher in `middleware.ts` is currently dead code (Phase 1 has no `(admin)` route group folders). When Phase 3 adds real admin routes (`/dashboard`, `/policies`, etc.), the matcher should be rewritten to target those literal paths — `/(admin)/(.*)` will never match a URL because route groups don't appear in URLs.
- **Phase 6 (Billing):**
  - Webhook route `/api/webhooks/stripe` is already matcher-exempt in `middleware.ts`. Phase 6 lands the signature-verifying handler without middleware changes.
- **Phase 7 (Crons + Email):**
  - `/api/cron/*` is matcher-exempt. Phase 7's `/api/cron/reminders` route lands without middleware changes; the handler itself enforces `CRON_SECRET` header check.
- **Operator note on react-server flag for future scripts:** Any future tsx-invoked script that imports from `@/lib/db` (or any other module declaring `import "server-only"`) must pass `--conditions=react-server` to tsx — same as `pnpm check:db`. Plan 01-05's `scripts/check-foundation.ts` is the first such consumer.
