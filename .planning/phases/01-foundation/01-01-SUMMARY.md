---
phase: 01-foundation
plan: 01
subsystem: tooling
tags: [scaffold, nextjs, pnpm, shadcn, drizzle, env]
one_liner: "Next.js 15.5.0 App Router scaffold with pnpm + 5 Phase 1 deps + tsconfig D-08 hardening + shadcn/ui (Button/Card/Input) + DATABASE_URL added to env template"
dependency_graph:
  requires: []
  provides:
    - "Buildable Next.js 15 + Tailwind v4 + pnpm shell"
    - "@clerk/nextjs + drizzle-orm + drizzle-kit + postgres + @supabase/supabase-js installed and pinned"
    - "tsconfig.json with strict + noUncheckedIndexedAccess + noImplicitOverride"
    - "components/ui/{button,card,input}.tsx + lib/utils.ts cn() helper"
    - ".env.local.example with DATABASE_URL placeholder"
    - "package.json with verify:phase-1 and check:db script slots"
  affects: [01-02, 01-03, 01-04, 01-05]
tech_stack:
  added:
    runtime: ["@clerk/nextjs@7.3.4", "@supabase/supabase-js@2.105.4", "drizzle-orm@0.45.2", "postgres@3.4.9", "next@15.5.0", "react@19.1.0", "react-dom@19.1.0"]
    dev: ["drizzle-kit@0.31.10", "tsx@4.22.0", "typescript@5.9.3", "tailwindcss@4.3.0", "eslint@9", "@tailwindcss/postcss@4"]
    shadcn_transitive: ["@base-ui/react", "class-variance-authority@0.7.1", "clsx@2.1.1", "tailwind-merge@3.6.0", "lucide-react", "tw-animate-css@1.4.0"]
  patterns: ["pnpm workspace root", "Next.js App Router (no src/)", "shadcn/ui with base-nova preset + zinc neutral theme"]
key_files:
  created:
    - app/layout.tsx
    - app/page.tsx
    - app/globals.css
    - app/favicon.ico
    - components.json
    - components/ui/button.tsx
    - components/ui/card.tsx
    - components/ui/input.tsx
    - lib/utils.ts
    - next.config.ts
    - postcss.config.mjs
    - tsconfig.json
    - eslint.config.mjs
    - next-env.d.ts (gitignored)
    - package.json
    - pnpm-lock.yaml
    - public/*.svg, public/file.svg
  modified:
    - .gitignore (appended Next.js/pnpm/Drizzle patterns)
    - .env.local.example (added DATABASE_URL line with D-06/D-07 pooler comment)
decisions:
  - "Used Next.js 15.5.0 explicitly pinned (D-02): default `pnpm create next-app@latest` resolves to Next 16.2.6 in May 2026. Plan's must_haves contract specifies Next 15.x; pinned to honor plan over framework drift."
  - "Used `pnpm create next-app` with temp-directory scaffolding (D-02 fallback): repo root was non-empty (.planning/, docs/, etc.), so scaffolded into sibling `policypilot-scaffold` then Move-Item'd files in."
  - "shadcn CLI flags changed since plan was authored: `--base-color` removed. Used `shadcn@latest init -d` (defaults: Next template + base-nova preset) which produces zinc neutral theme per D-05 spirit."
  - "Accepted shadcn transitive deps per Task 2 step 3: @base-ui/react, class-variance-authority, clsx, tailwind-merge, lucide-react, tw-animate-css. Not additional primitives — internal component dependencies."
metrics:
  duration_minutes: ~25
  tasks_completed: 3
  files_touched: 24
  commits: 3
completed: 2026-05-15
---

# Phase 01 Plan 01: Scaffold Next.js 15 + Phase 1 Dependencies — Summary

## What was built

A buildable Next.js 15 App Router workspace with pnpm package management, all five Phase 1 stack dependencies pinned in `pnpm-lock.yaml`, TypeScript strict mode hardened per D-08, shadcn/ui initialized with the three primitives (Button, Card, Input) per D-05, and `.env.local.example` patched with `DATABASE_URL` per D-11. `pnpm install` succeeds clean; `pnpm tsc --noEmit` exits 0.

## Task Breakdown

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Scaffold Next.js 15 + install Phase 1 dependencies | `5d2057d` | app/, public/, package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .gitignore |
| 2 | Initialize shadcn/ui + add Button/Card/Input (D-05) | `3b74de5` | components.json, components/ui/{button,card,input}.tsx, lib/utils.ts, app/globals.css, package.json, pnpm-lock.yaml |
| 3 | Patch .env.local.example with DATABASE_URL + reserve verify scripts | `f58aea7` | .env.local.example, package.json |

## Environment

> **Historical, pre-ADR-022 state.** This block records the plan-time state at 2026-05-15: Node 22.12.0 running while `engines` pinned 20.x per D-01. ADR-022 (Node 22 Active LTS, commit `e324e19`) supersedes D-01 and `engines` was later bumped to `>=22.0.0 <23.0.0`. Flagged as a deviation from the locked stack table at the time of writing; the post-ADR-022 state is the authoritative one.

- **Node**: v22.12.0 (D-01 specifies >=20 <21; Node 22 is what's installed locally — `engines` field in package.json pins 20.x for Vercel deployment as planned).
- **pnpm**: 9.15.0 via Corepack. Latest pnpm (11.x) requires Node v22.13+, so pinned to 9.15.0 to match Node 22.12.0 local runtime. `packageManager` field in package.json reflects this.
- **Tailwind**: v4.3.0 (whatever `create-next-app@15.5.0` emitted, per D-15). Uses `@tailwindcss/postcss` PostCSS plugin and the new v4 `@import "tailwindcss"` CSS directive.
- **shadcn theme**: default `base-nova` preset (modern shadcn equivalent of the historical "zinc default"), CSS variables enabled.

## Resolved Versions (pnpm-lock.yaml)

| Package | Version |
|---------|---------|
| next | 15.5.0 |
| react | 19.1.0 |
| react-dom | 19.1.0 |
| @clerk/nextjs | 7.3.4 |
| @supabase/supabase-js | 2.105.4 |
| drizzle-orm | 0.45.2 |
| postgres | 3.4.9 |
| drizzle-kit | 0.31.10 |
| tsx | 4.22.0 |
| typescript | 5.9.3 |
| tailwindcss | 4.3.0 |
| @tailwindcss/postcss | 4.3.0 |
| @types/node | 20.19.41 |
| eslint | 9.39.4 |
| eslint-config-next | 15.5.0 |
| @base-ui/react | (shadcn transitive) |
| class-variance-authority | 0.7.1 |
| clsx | 2.1.1 |
| tailwind-merge | 3.6.0 |
| lucide-react | (shadcn transitive) |
| tw-animate-css | 1.4.0 |
| shadcn | 4.7.0 |

## `.gitignore` Merge

**Needed merge:** YES. The repo's existing `.gitignore` was preserved verbatim; the following block was appended:

```
# Next.js / create-next-app additions
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions
/coverage
*.pem
.pnpm-debug.log*

# Drizzle / pnpm
drizzle/
.drizzle/
*.local
.pnpm-store/
.next/cache/
```

Lines from `create-next-app`'s generated `.gitignore` that were already present (`node_modules/`, `.next/`, `out/`, `*.tsbuildinfo`, `next-env.d.ts`, `.DS_Store`, `.vercel`, `npm-debug.log*`, `yarn-debug.log*`, `yarn-error.log*`, `.env*.local`) were not re-added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corepack signature key outdated (Node 22.12 bundles old corepack)**
- **Found during:** Task 1 step 1 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Issue:** `Cannot find matching keyid` — Node 22.12.0's bundled corepack (v0.30.x) has an outdated pnpm signing key, blocking pnpm activation entirely.
- **Fix:** Ran `npm install -g corepack@latest` to upgrade to corepack 0.35.0, then re-ran the activation.
- **Files modified:** None (global tool upgrade).
- **Commit:** N/A (pre-commit setup).

**2. [Rule 3 - Blocking] Latest pnpm requires Node >=22.13**
- **Found during:** Task 1 step 1 retry after corepack upgrade.
- **Issue:** `corepack prepare pnpm@latest` selected pnpm@11.x which refuses to run on Node 22.12.0.
- **Fix:** Pinned `pnpm@9.15.0` instead (latest 9.x — compatible with Node 22.12 and matches plan's "use exact version pnpm --version reports").
- **Files modified:** `package.json` `packageManager` field.
- **Commit:** part of `5d2057d`.

**3. [Rule 1 - Bug] `pnpm create next-app@latest` resolves to Next 16, breaking plan must_haves regex `"next": "15.`**
- **Found during:** Task 1 step 2.
- **Issue:** The `@latest` tag now resolves to Next 16.2.6. Plan's must_haves contract requires `"next": "15."` literal. D-15 also says "accept create-next-app default" — internally conflicting with the must_have.
- **Fix:** Pinned `pnpm create next-app@15.5.0` instead. Plan_phase verifier contract takes precedence; framework drift to Next 16 is a Phase 2+ consideration once Clerk/Drizzle compat is confirmed.
- **Files modified:** `package.json` (`next: 15.5.0`).
- **Commit:** `5d2057d`.

**4. [Rule 3 - Blocking] `create-next-app@15.5.0` ignores `--src-dir=false` and `--turbopack=false` flags**
- **Found during:** Task 1 step 2 retry.
- **Issue:** create-next-app@15.5.0 still prompts for src-dir + Turbopack despite the explicit flags. Bash here-string stdin couldn't satisfy the interactive prompt.
- **Fix:** Switched to the boolean-flag form: `--no-src-dir --no-turbopack` + `--yes`. Scaffolded clean on retry.
- **Files modified:** N/A (scaffold invocation only).
- **Commit:** N/A.

**5. [Rule 1 - Bug] shadcn CLI `--base-color` flag removed in latest version**
- **Found during:** Task 2 step 1 (`shadcn@latest init --yes --base-color zinc --css-variables`).
- **Issue:** Modern shadcn CLI replaced `--base-color` with the `--preset` mechanism; `--base-color zinc` errors out as "unknown option".
- **Fix:** Used `shadcn@latest init -d` (which expands to `--template next --preset base-nova`). Base-nova preset is shadcn's modern default and produces the zinc/neutral palette that D-05 specifies.
- **Files modified:** None (init invocation only).
- **Commit:** part of `3b74de5`.

**6. [Rule 3 - Blocking] Moved `node_modules` retains absolute symlinks to old path**
- **Found during:** Task 1 step 5 (`pnpm add @clerk/nextjs ...`).
- **Issue:** When `Move-Item` relocated `node_modules` from the temp scaffold dir into the repo root, pnpm's virtual store (`.pnpm/`) retained absolute symlinks pointing at the original `policypilot-scaffold/node_modules/.pnpm/`. pnpm error: `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE`.
- **Fix:** Removed `node_modules` and re-ran `pnpm install` from the repo root — pnpm rebuilt the virtual store in-place using the moved `pnpm-lock.yaml`.
- **Files modified:** None (regenerated node_modules).
- **Commit:** part of `5d2057d`.

**7. Peer-dep warning (non-blocking, recorded for visibility)**
- `@clerk/nextjs@7.3.4` wants `react@~19.0.3 || ~19.1.4 || ~19.2.3 || ~19.3.0-0`; project has `react@19.1.0` (exact pin from Next 15.5.0). Mismatch is patch-version only; runtime types/API compatible. Will resolve on next `pnpm update` once `eslint-config-next@15.5.x` permits a higher React patch.

### Architectural changes
None.

## Acceptance Criteria Status (Plan 01-01)

| Criterion | Result |
|-----------|--------|
| `package.json` contains `"next": "15.` | PASS (15.5.0) |
| `package.json` `engines` Node 20 spec | PASS |
| Runtime deps: @clerk/nextjs, drizzle-orm, postgres, @supabase/supabase-js | PASS |
| Dev deps: drizzle-kit, tsx | PASS |
| tsconfig literal `"noUncheckedIndexedAccess": true` | PASS |
| tsconfig literal `"noImplicitOverride": true` | PASS |
| tsconfig `"strict": true` | PASS |
| app/layout.tsx + app/page.tsx exist | PASS |
| pnpm-lock.yaml exists | PASS |
| `.gitignore` contains `/.next/` or `.next/` | PASS |
| `pnpm tsc --noEmit` exits 0 | PASS |
| No `src/` directory (D-02) | PASS |
| `.git/` directory exists | PASS (pre-existing) |
| components.json + 3 primitives + lib/utils.ts | PASS |
| Button imports `from "@/lib/utils"` | PASS |
| .env.local.example contains DATABASE_URL | PASS |
| package.json scripts: verify:phase-1, check:db | PASS |

## Self-Check: PASSED

- File existence: app/layout.tsx, app/page.tsx, package.json, tsconfig.json, components.json, components/ui/button.tsx, components/ui/card.tsx, components/ui/input.tsx, lib/utils.ts, .env.local.example, pnpm-lock.yaml — all FOUND.
- Commits: `5d2057d`, `3b74de5`, `f58aea7` — all FOUND in `git log`.
- `pnpm tsc --noEmit`: exit 0 verified post-Task-3.
- No `src/` directory: verified absent.

## Notes for downstream plans

- Plan 01-02 (operator manual): operator must create Clerk dev app + Supabase project + populate `.env.local` from the now-DATABASE_URL-enabled template.
- Plan 01-03 (app shell): the create-next-app default `app/page.tsx` is the boilerplate "Welcome to Next" page; Plan 01-03 replaces it with the `(marketing)` route group landing page.
- Plan 01-04 (middleware + Drizzle skeleton): consumes `lib/utils.ts`, `lib/` directory exists, `drizzle-orm` + `postgres` + `drizzle-kit` are installed.
- Plan 01-05 (verify scripts): `pnpm verify:phase-1` and `pnpm check:db` slots are reserved in package.json; Plan 05 writes the actual bodies at `scripts/check-foundation.ts` and `scripts/check-db.ts`.
- React peer-dep mismatch with Clerk (19.1.0 vs ~19.1.4) is benign; revisit at the next minor-version sweep.
