# Technology Stack

**Analysis Date:** 2026-05-30

## Languages

**Primary:**
- TypeScript 5.x — all application code, API routes, lib modules, scripts, tests
- SQL — Drizzle migrations in `drizzle/*.sql` (hand-authored for RLS and partial indexes)

**Secondary:**
- JavaScript (MJS) — `scripts/run-react-server-check.mjs`, `postcss.config.mjs`, `eslint.config.mjs`

## Runtime

**Environment:**
- Node.js `>=22.0.0 <23.0.0` (pinned via `engines` in `package.json`)

**Package Manager:**
- pnpm 9.15.9 (pinned via `packageManager` in `package.json`)
- Lockfile: `pnpm-lock.yaml` — present, frozen-lockfile enforced in CI

## Frameworks

**Core:**
- Next.js 15.5.18 — App Router only; pages/API Routes pattern NOT used
- React 19.1.0 — co-shipped with Next.js 15; Server Components, Server Actions
- Tailwind CSS 4.x — utility-first CSS; configured via `@tailwindcss/postcss` in `postcss.config.mjs`

**Rich Text:**
- TipTap 2.27.2 — policy document editor (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/html`)

**UI Primitives:**
- Base UI React `^1.4.1` — headless primitives
- shadcn (CLI `^4.7.0`) — component scaffolding; components live in `components/ui/`
- Lucide React `^1.16.0` — icon set
- clsx + tailwind-merge — conditional className utilities
- class-variance-authority — variant-based component styling

**Testing:**
- Vitest `^1.6.0` — unit + integration test runner; config at `vitest.config.ts`
- `@testing-library/react ^16` + `@testing-library/jest-dom ^6.4.0` — component testing
- jsdom `^24` — DOM environment for unit tests
- Playwright `^1.60.0` — E2E browser testing; config at `playwright.config.ts`

**Build/Dev:**
- tsx `^4.22.0` — TypeScript execution for scripts and drizzle-kit invocations
- drizzle-kit `^0.31.10` — migration generation and apply tooling
- ESLint 9.x + `eslint-config-next 15.5.18` — linting; flat config at `eslint.config.mjs`
- ts-morph 28.0.0 — TypeScript AST analysis for custom verify scripts
- js-yaml / ajv — YAML parsing + JSON schema validation used in artifact checks

## Key Dependencies

**Critical:**
- `drizzle-orm ^0.45.2` — ORM over Supabase Postgres; repository pattern enforced
- `postgres ^3.4.9` — Postgres driver; `prepare: false` required for Supabase Transaction pooler
- `@anthropic-ai/sdk 0.97.1` — Anthropic Claude API (pinned exact); `maxRetries: 0`, `timeout: 25_000ms`
- `@clerk/nextjs ^7.3.4` — Auth + organization management; middleware at `middleware.ts`
- `stripe ^22.2.0` — Stripe Checkout, Customer Portal, Webhooks (Phase 6)
- `svix 1.93.0` — Svix webhook verification for Clerk events (pinned exact)
- `@supabase/supabase-js ^2.105.4` — Supabase client (primarily used for RLS JWT injection; runtime queries go through Drizzle)
- `zod ^3.23.5` — Input validation at API and Server Action boundaries

**Infrastructure:**
- `@vitejs/plugin-react ^4` — React plugin for Vitest
- `@tailwindcss/postcss ^4` — Tailwind v4 PostCSS integration

## Configuration

**TypeScript (`tsconfig.json`):**
- `strict: true` — full strict mode
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`
- `noImplicitOverride: true` — explicit `override` keyword required
- `noEmit: true` — type-check only, Next.js handles emit
- `moduleResolution: bundler` — Next.js 15 bundler resolution
- `paths: { "@/*": ["./*"] }` — root alias; used throughout as `@/lib/...`, `@/components/...`, `@/app/...`

**Build (`vercel.json`):**
- `buildCommand: "pnpm deploy:preflight && pnpm build"` — pre-deploy schema gate fires before every Vercel build
- `framework: nextjs`

**Drizzle (`drizzle.config.ts`):**
- Schema: `lib/db/schema.ts`
- Migrations output: `drizzle/`
- Dialect: PostgreSQL
- Prefers `DIRECT_URL` (port 5432) for migrations; falls back to `DATABASE_URL` (port 6543 pooler) with a warning
- `verbose: true`, `strict: true`

**Linting (`eslint.config.mjs`):**
- Extends `next/core-web-vitals` + `next/typescript` via `@eslint/eslintrc` FlatCompat
- Ignores: `node_modules/**`, `.next/**`, `.tmp/**`, `Designprototypes/**`, `out/**`, `build/**`

**PostCSS (`postcss.config.mjs`):**
- Single plugin: `@tailwindcss/postcss` (Tailwind v4 form)
- Vitest overrides this to empty plugin list so unit tests skip CSS compilation

## Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Next.js dev server |
| `build` | Next.js production build |
| `lint` | ESLint |
| `typecheck` | `tsc --noEmit` — zero type errors required |
| `test` | Vitest unit/component tests |
| `test:e2e` | Playwright E2E tests |
| `db:generate` | Drizzle migration generation |
| `db:migrate` / `db:migrate:staging` / `db:migrate:prod` | Apply migrations to target env |
| `db:verify` / `db:verify:staging` / `db:verify:prod` | Schema state verification |
| `deploy:preflight` | Build-time gate: verifies schema before Vercel deploy |
| `verify:phase-N` | Cumulative phase verification chains |
| `verify:phase-6` | Phase 6 gate: `tsc --noEmit`, verify:phase-5, Stripe unit tests, webhook tests, db:verify, artifact checks |
| `check:rls` | RLS policy presence check |
| `check:ai-layer` | Vitest integration harness against live DB |
| `check:acknowledgment-immutability` | Append-only audit trail invariant |

## Platform Requirements

**Development:**
- Node.js 22.x (no other minor accepted)
- pnpm 9.15.9
- `.env.local` populated from `.env.local.example`
- Supabase project for dev DB (port 6543 for runtime, 5432 for migrations)
- Stripe CLI for local webhook forwarding

**Production:**
- Vercel (frontend + API routes; `nodejs` runtime for webhook handlers)
- Railway worker service (planned Phase 7 — cron reminders; not yet deployed)
- Supabase for staging + production Postgres
- GitHub Actions for CI (`.github/workflows/verify.yml`, `.github/workflows/verify-phase-6.yml`, `.github/workflows/migrate.yml`)

---

*Stack analysis: 2026-05-30*
