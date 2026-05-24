# Technology Stack

**Analysis Date:** 2026-05-24

## Languages

**Primary:**
- TypeScript ^5 (strict mode + `noUncheckedIndexedAccess`) — All app, lib, scripts, and tests. `any` is forbidden by project convention (`CLAUDE.md` NEVER rule #4).

**Secondary:**
- SQL — Hand-written Drizzle migrations under `drizzle/` (11 numbered migrations + 1 RLS subquery rewrite); PL/pgSQL only inside RLS predicates.
- PowerShell (`scripts/with-deploy-creds.ps1`) — staging/prod migration credential wrapper.

## Runtime

**Node.js:** `>=22.0.0 <23.0.0` (pinned via `package.json` `engines`).

**Package Manager:** `pnpm@9.15.9` (locked via `packageManager` field; pnpm `overrides` pin `postcss >=8.5.10`).

**Lockfile:** `pnpm-lock.yaml` (present).

## Frameworks

**Core:**
- `next@15.5.18` (App Router ONLY — no Pages Router code permitted). React Server Components + Server Actions.
- `react@19.1.0` + `react-dom@19.1.0` — React 19 `useActionState` is the canonical form-state pattern (Phase 5 RESEARCH Pitfall 5).
- Tailwind CSS `^4` (next-gen plugin via `@tailwindcss/postcss`); `tw-animate-css` for animation utilities; `tailwind-merge` + `class-variance-authority` + `clsx` for class composition.

**UI / shadcn:**
- `shadcn@^4.7.0` (CLI; components copied into `components/ui/` — Button, Input, Card, Dialog, Sheet, Sidebar, Select, Form, Table, Dropdown, Tooltip, Skeleton, Badge, Label, Separator, Textarea).
- `@base-ui/react@^1.4.1` — primitive layer beneath shadcn.
- `lucide-react@^1.16.0` — icon set.

**Editor:**
- `@tiptap/react@2.27.2` + `@tiptap/starter-kit@2.27.2` + `@tiptap/extension-link@2.27.2` + `@tiptap/html@2.27.2` — rich-text policy editor (`components/policy/PolicyEditor.tsx`).

**Validation:**
- `zod@^3.23.5` — request-body validation at trust boundaries (Server Actions + Route Handlers).

**Testing:**
- `vitest@^1.6.0` (`jsdom@^24` environment) + `@testing-library/react@^16` + `@testing-library/jest-dom@^6.4.0` + `@vitejs/plugin-react@^4`.
- 228 tests across 28 files (172 baseline + 56 Phase 5).
- Custom verifier suites in `scripts/check-*.ts` (CI gates — see Tooling).

**Build / Dev:**
- `tsx@^4.22.0` — TS execution for scripts, migrations, env-aware verifiers (`tsx --env-file=.env.local ...`).
- `drizzle-kit@^0.31.10` — migration generator + applier (`db:generate`, `db:migrate`).
- `eslint@^9` + `eslint-config-next@15.5.18` + `@eslint/eslintrc@^3`.
- `ts-morph@28.0.0` — AST-walking enforced by CI gates (`scripts/check-acknowledgment-immutability.ts`, `scripts/check-db-imports.ts`, `scripts/check-auth-context.ts`, `scripts/check-policy-id-brand.ts`, etc.).
- `ajv@^8.20.0` + `js-yaml@^4.1.1` (+ `@types/js-yaml`) — artifact + CodeRabbit config validation.

## Key Dependencies

**Critical (server runtime):**

| Package | Version | Role |
|---|---|---|
| `@clerk/nextjs` | `^7.3.4` | Auth, Organizations, session claims (`publicMetadata.role`), webhook types. |
| `@supabase/supabase-js` | `^2.105.4` | Supabase client (RLS verification path; runtime queries go through Drizzle). |
| `drizzle-orm` | `^0.45.2` | ORM (zero codegen step). All repository queries in `lib/db/repositories/`. |
| `postgres` | `^3.4.9` | `postgres-js` driver — Drizzle's underlying Postgres client. |
| `@anthropic-ai/sdk` | `0.97.1` | Claude API (Sonnet 4.6 + Haiku 4.5 + Batch API). Pinned EXACT (no `^`). |
| `svix` | `1.93.0` | Clerk webhook signature verification. Pinned EXACT. |

**Infrastructure / utilities:**
- `class-variance-authority@^0.7.1`, `clsx@^2.1.1`, `tailwind-merge@^3.6.0` — `cn()` class composition.

**NOT yet installed (planned but not in `package.json`):**
- Stripe SDK (`stripe`) — Phase 6 placeholder; env vars present but no client.
- Resend SDK (`resend`) + React Email — Phase 7.
- Sentry SDK — env var `SENTRY_DSN` declared but no client wired.
- PostHog SDK — env vars `NEXT_PUBLIC_POSTHOG_*` declared but no client wired.
- Railway-side cron worker — Phase 7 dedicated process; not in this repo yet.

## Configuration

**Environment:**
- `.env.local` (gitignored; template at `.env.local.example` — all values intentionally blank per project convention).
- `.env.local.test` — second Supabase project for RLS cross-org property test (`DATABASE_URL_TEST`, `DIRECT_URL_TEST`).
- `secrets/staging.env` + `secrets/prod.env` (gitignored) — staging + prod `DATABASE_URL` / `DIRECT_URL`. Loaded by `scripts/with-deploy-creds.ps1`.
- Vercel deploy-time gate: `pnpm deploy:preflight` (`scripts/deploy-preflight.ts`) runs `vercel.json`-driven schema check before build.

**Required env vars (high-signal subset):**

| Var | Surface | Notes |
|---|---|---|
| `DATABASE_URL` | Drizzle runtime | Supabase pooler `:6543` (transaction mode). |
| `DIRECT_URL` | Drizzle migrations | Supabase pooler `:5432` (session mode — DDL-safe). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser | Reserved for client-side Supabase calls (none today). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | RLS-bypass paths (webhooks, deploy checks). |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Server + client | `@clerk/nextjs` SDK. |
| `CLERK_WEBHOOK_SECRET` | Webhook handler | Svix HMAC. Hard-fail with 500 if missing. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Embedded auth | MUST = `/post-sign-in`. Asserted by `scripts/check-foundation.ts`. |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Embedded auth | MUST = `/post-sign-in`. |
| `ANTHROPIC_API_KEY` | Server only | Claude SDK. NEVER expose client-side (CLAUDE.md NEVER #2). |
| `CRON_SECRET` | Cron route handlers | Reserved for Phase 7 Railway → Next.js cron callbacks. |

**Build:** `next.config.ts` (Next 15 conventions), `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `vitest.config.ts`, `drizzle.config.ts`.

## Platform Requirements

**Development:**
- Windows 11 supported (PowerShell wrappers handle staging/prod credential loading: `scripts/with-deploy-creds.ps1`).
- Node 22 + pnpm 9.15.9.
- Local Postgres NOT required — dev hits Supabase project `kdoahaxhmaftxaiwbtdw` directly.

**Production:**
- Hosting: Vercel (Next.js frontend + API routes).
- Database: Supabase (managed Postgres 17.6) — pooler endpoint `aws-1-us-east-1.pooler.supabase.com`.
- Workers (Phase 7+): Railway (persistent containers for cron + bulk email — not deployed yet).

## CI Verification Gates (per-phase)

| Script | Gate enforced |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` zero errors (always — CLAUDE.md ALWAYS #1). |
| `pnpm verify:phase-1` | Foundation env vars + artifacts present. |
| `pnpm verify:phase-2` | Data layer (RLS, journal sync, FK shape). |
| `pnpm verify:phase-3` | Phase 2 + db-imports allow-list + RLS predicates + auth-context shape + policy-list filters + admin routes + error discipline + policy-id brand + tests + artifacts. |
| `pnpm verify:phase-4` | Phase 3 + AI prompt structure (`check:ai-prompts`) + AI layer test suite. |
| `pnpm verify:phase-5` | Phase 4 + acknowledgment immutability (ts-morph AST scan) + employee portal test suite. |
| `pnpm check:db` | Live DB ping + schema parity. |
| `pnpm db:verify[:staging|:prod]` | All migrations applied + RLS + GRANTs + Phase 4 column shape OK (exit 0 gates code deploy). |

Phase 6 (Billing), Phase 7 (Crons+Email), Phase 8 (Validation) verifiers do not yet exist.

---

*Stack analysis: 2026-05-24 — Phase 5 (Employee Portal) shipped via PR #27.*
