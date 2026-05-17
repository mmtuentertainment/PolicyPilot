# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 1-foundation
**Mode:** `--all` with operator no-clarifying-questions directive — decisions made autonomously with options-considered captured here for review.
**Areas discussed:** Package manager, scaffolding command, marketing landing page content, pricing-page scope, shadcn/ui initialization, Supabase local-dev strategy, Drizzle skeleton timing, TypeScript strictness, Clerk environment, middleware.ts scope, env-var management, git/repo setup, out-of-stack packages, testing infrastructure, Tailwind version

---

## Package Manager

| Option | Description | Selected |
|--------|-------------|----------|
| npm | Built-in to Node, no extra install, slowest installs | |
| pnpm | Content-addressable store, faster, strict peer-deps, BLUEPRINT.md references `pnpm install` | ✓ |
| bun | Fastest but bleeding-edge; Next.js 15 + Drizzle + Clerk surface not guaranteed-stable | |

**Selected:** pnpm.
**Notes:** Explicitly flagged in STATE.md as a pending todo. BLUEPRINT.md §5 Phase 1 verify references "fresh `pnpm install`" — locking in that signal. Engines pin is `>=22.0.0 <23.0.0` per ADR-022 (Node 22 Active LTS), which supersedes the original D-01 Node 20 LTS pin (commit e324e19 / PROJECT.md `<decisions>`).

---

## Scaffolding Command

| Option | Description | Selected |
|--------|-------------|----------|
| `--src-dir` (default to `src/app/`) | Common React convention | |
| No `--src-dir` (app at root) | BLUEPRINT.md §2 shows `app/` at repo root | ✓ |

**Selected:** `pnpm create next-app@latest policypilot --typescript --tailwind --app --eslint --src-dir=false --import-alias='@/*'`
**Notes:** Matches BLUEPRINT layout precisely. `--import-alias='@/*'` consistent with `lib/`, `components/` import patterns shown throughout.

---

## Marketing Landing Page Content

| Option | Description | Selected |
|--------|-------------|----------|
| Empty page ("Hello World") | Satisfies success criterion 2 trivially | |
| Minimal-real hero + 3 value props + CTAs | Ships a real-looking landing without prematurely investing in design | ✓ |
| Full marketing site with images / hero illustrations | Premature; designer-style work belongs after MVP validates | |

**Selected:** Minimal-real hero + 3 value props + Sign-in / Sign-up CTAs.
**Notes:** Text-only — no images in Phase 1. Tone: warm + concrete, speaks to HR Manager. Avoid "seamless / robust / best-in-class" filler. Operator can rewrite copy after Phase 1 ships without blocking the build.

---

## Pricing Page Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Skip pricing page in Phase 1 | Breaks `middleware.ts` public-route policy verification | |
| Stub: 3 plan cards from TIER-LIMITS.md, no checkout | Satisfies the public-route check; full wiring in Phase 6 | ✓ |
| Full pricing page with Checkout buttons | Premature — Stripe wiring is Phase 6 | |

**Selected:** Stub with disabled / `/sign-up`-pointing buttons.
**Notes:** Phase 1 success criterion 5 requires `/pricing` to be reachable unauthenticated. A stub satisfies that without dragging Stripe forward.

---

## shadcn/ui Initialization

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 3 (Admin UI) | shadcn isn't strictly needed for landing page | |
| Init in Phase 1 with Button + Card + Input | Landing CTAs need Button; pricing stub needs Card; minimal forward setup | ✓ |
| Init in Phase 1 with full component library | Bloat; pull components on demand | |

**Selected:** Init in Phase 1, install only Button + Card + Input.
**Notes:** Default zinc theme (neutral SaaS). Component output path `components/ui/` per BLUEPRINT §2. Other components pulled per-phase as needed.

---

## Supabase Local-Dev Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Cloud Supabase project only | Simpler; free tier sufficient for solo dev | ✓ |
| Local Supabase via Docker (`supabase start`) | Faster iteration but adds Docker overhead | |

**Selected:** Cloud only — `policypilot-dev` project.
**Notes:** Solo developer; Docker friction not worth the payoff at MVP scale. Pooler URI (`pooler.supabase.com:6543`) at runtime, direct URI for migrations.

---

## Drizzle Skeleton Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Defer all Drizzle setup to Phase 2 | Conflicts with Phase 1 success criterion 4 (`select 1` via Drizzle) | |
| Phase 1: config + client + empty schema; Phase 2: tables | Satisfies criterion 4 while keeping table definitions out of Phase 1 | ✓ |

**Selected:** Set up `drizzle.config.ts` + `lib/db/index.ts` + empty `lib/db/schema.ts` (`export {}`) in Phase 1.
**Notes:** Verification of criterion 4 done via `scripts/check-db.ts` (one-off script). Avoid a transient debug API route that would need cleanup in Phase 2.

---

## TypeScript Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js default `strict: true` | Baseline, but `any` still slips in via index access | |
| `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` | Catches more `any` situations | ✓ |
| Maximum strict (add `exactOptionalPropertyTypes`) | Noisy with Clerk/Stripe types | |

**Selected:** `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`.
**Notes:** Aligns with CLAUDE.md "Never use the `any` TypeScript type" rule. `exactOptionalPropertyTypes` skipped — too noisy with third-party types.

---

## Clerk Environment Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Dev keys only, prod app deferred | Standard MVP path | ✓ |
| Dev + prod app simultaneously | Premature; deploy phase concern | |

**Selected:** Dev only. Clerk Dashboard config:
- App name: "PolicyPilot (dev)"
- **Organizations feature enabled** (B2B — required by ADR-004)
- Email + Password + Google OAuth sign-up
- After-sign-in URL: `/sign-in-success` placeholder (admin / employee routes don't exist yet)

**Notes:** Placeholder after-sign-in URL gets replaced in Phase 3 (admin) / Phase 5 (employee) when those routes exist.

---

## middleware.ts Scope in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Only public-route policy in Phase 1 | Minimal but means re-editing middleware in Phases 3, 5, 6, 7 | |
| Full ADR-009 policy with role gates as no-ops in Phase 1 | Single edit; role gates become live as their routes arrive | ✓ |

**Selected:** Full policy structure, role gates and cron-secret check present but no-op (no matching routes yet in Phase 1).
**Notes:** Phase 1 success criterion 5 only verifies public-route policy. Role gates / `CRON_SECRET` check become enforceable as their routes ship.

---

## Environment Variable Management

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-by-phase keys, expand `.env.local.example` incrementally | Cleaner per-phase but introduces drift | |
| Keep current `.env.local.example` (all 8-phase keys present, blank values OK) | Single source of truth | ✓ |

**Selected:** Keep current `.env.local.example` shape; only Clerk + Supabase + `NEXT_PUBLIC_APP_URL` need real values for Phase 1.
**Notes:** Missing `DATABASE_URL` (direct Postgres URI for Drizzle migrations) — plan-phase must add it.

---

## Git + Repository

| Option | Description | Selected |
|--------|-------------|----------|
| Defer git init until end of Phase 1 | Loses incremental commit history | |
| `git init` at start of Phase 1, no GitHub remote yet | Local history per task; remote deferred until needed | ✓ |
| `git init` + GitHub remote + Vercel project linked | Premature — deploy-phase concern | |

**Selected:** Local `git init` only.
**Notes:** GSD handles per-task commits during execute. GitHub remote setup deferred (not blocking Phase 1 success criteria).

---

## Out-of-Stack Packages (Sentry + PostHog)

| Option | Description | Selected |
|--------|-------------|----------|
| Install Sentry + PostHog in Phase 1 because env vars exist | Violates CLAUDE.md "Stack non-negotiable" + "Ask First" rules | |
| Defer to pre-launch decision (parking lot) | Respects ASK FIRST; revisit before Phase 8 deploy | ✓ |
| Remove from `.env.local.example` | Loses the placeholder; revisiting is harder | |

**Selected:** Defer — leave env-var placeholders blank, revisit pre-launch.
**Notes:** Not in CLAUDE.md stack table. A new ADR would be required to add (the speculative "ADR-022" reference here predates the actual ADR-022 / Node 22 Active LTS, which now occupies that slot — telemetry would need a fresh ADR number).

---

## Testing Infrastructure

| Option | Description | Selected |
|--------|-------------|----------|
| Set up Vitest + Playwright in Phase 1 | Bloats foundation phase with framework choices no other Phase 1 criterion needs | |
| Defer until a phase actually requires regression guards | Lazy framework choice; pay cost when value appears | ✓ |

**Selected:** Defer.
**Notes:** Phase 1 success criteria are `tsc`-driven + manual. Test framework decision moves to whichever phase first needs automated regression guards (most likely Phase 8 Validation).

---

## Tailwind Version

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind v3 (downgrade if `create-next-app` defaults to v4) | Older, more docs, but going backward | |
| Whatever `create-next-app@latest` defaults to (likely v4 in 2026) | Stay current with framework default | ✓ |

**Selected:** Framework default.
**Notes:** shadcn/ui supports both. No reason to fight the default.

---

## Claude's Discretion

- **Landing-page hero JSX + copy** — operator can rewrite after Phase 1 ships. Plan-phase / executor writes reasonable defaults aligned with REQ-product-vision tone.
- **Server vs Client Components for landing page** — default Server Component unless interactivity required.
- **Tailwind palette beyond shadcn zinc default** — deferred to Phase 3.

## Deferred Ideas

- Sentry + PostHog instrumentation — parking lot, pre-launch decision.
- Production Clerk app + production Supabase project — deploy phase.
- GitHub remote + Vercel project linking — pre-deploy.
- Custom email domain — Phase 7.
- Tailwind theme tokens — Phase 3.
- Vitest / Playwright — Phase 8 (or earlier on demand).
- Pricing page real content + Stripe Checkout — Phase 6.
