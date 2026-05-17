# Phase 1: Foundation - Context

**Gathered:** 2026-05-15
**Status:** Ready for planning
**Mode:** `--all` (auto-selected all gray areas, decisions made autonomously per operator's no-clarifying-questions directive)

<domain>
## Phase Boundary

A deployable Next.js 15 shell exists, with Clerk auth and Supabase wired, that compiles clean (`tsc --noEmit` zero errors) and serves the marketing landing page at `localhost:3000`.

**In scope (from ROADMAP.md Phase 1):**
- `npx create-next-app@latest` scaffold (TypeScript + Tailwind + App Router)
- Install + configure `@clerk/nextjs`, `drizzle-orm`, `drizzle-kit`, `@supabase/supabase-js`
- `middleware.ts` enforcing public-route policy (`/`, `/pricing`, `/sign-in`, `/sign-up` public; everything else redirects to sign-in)
- Clerk sign-in / sign-up flows rendering and completing against dev keys
- Supabase client connection (`select 1` succeeds via Drizzle)
- Marketing landing page at `/` (route group `(marketing)`)
- `(auth)` route group with Clerk-hosted sign-in / sign-up pages
- `.env.local` populated from existing `.env.local.example` (Clerk + Supabase keys required to compile; other keys may be blank)

**Out of scope (deferred to later phases):**
- Drizzle table definitions (Phase 2 — schema lives in `lib/db/schema.ts` only as empty export)
- RLS policies (Phase 2)
- Clerk webhooks (Phase 2)
- Admin / employee UI (Phases 3, 5)
- Any Claude / Stripe / Resend integration (Phases 4, 6, 7)
- Pricing page content (Phase 6 — keep as stub in Phase 1, just enough to satisfy the public-route policy)

</domain>

<decisions>
## Implementation Decisions

### Package Manager
- **D-01: pnpm** is the package manager.
  - **Why:** BLUEPRINT.md §5 references "fresh `pnpm install`" in the verify step. STATE.md explicitly flagged this as needing confirmation; pnpm chosen over npm for faster installs, smaller `node_modules`, strict peer-dep resolution. Bun rejected — too new for the Next.js 15 + Drizzle + Clerk surface to be guaranteed-stable.
  - **Lock file:** `pnpm-lock.yaml` committed.
  - **Node engine:** pin to Node 22 LTS in `package.json` engines field (per ADR-022, which supersedes the original D-01 Node 20 pin; Vercel still supports Node 22 as Active LTS).

### Scaffolding command
- **D-02:** `pnpm create next-app@latest policypilot --typescript --tailwind --app --eslint --src-dir=false --import-alias='@/*'`
  - **Why:** Matches BLUEPRINT.md §2 layout (no `src/` directory; `app/` at repo root). `--import-alias='@/*'` mirrors the import pattern used throughout BLUEPRINT (`lib/db`, `lib/ai`, etc.).
  - **No Turbopack flag** — Next.js 15 makes Turbopack dev default; production build stays Webpack.

### Marketing landing page content
- **D-03:** Landing page at `app/(marketing)/page.tsx` ships with:
  - One-line hero stating the product purpose (e.g., "Policy management for SMBs that beats a Google Drive folder.")
  - Three value-prop bullets aligned to the core differentiators: AI drafts, real audit trail, fits an SMB budget.
  - Two CTAs: "Sign in" → `/sign-in`, "Get started" → `/sign-up`.
  - No images / no marketing illustrations in Phase 1 (text-only is faster, ships clean).
  - Tone: warm + concrete. Speaks to HR Manager / Office Manager. No buzzwords ("seamless", "robust", "best-in-class"). Reference: REQ-product-vision.
- **D-04:** Pricing page at `app/(marketing)/pricing/page.tsx` is a stub in Phase 1:
  - Three plan cards (Starter / Growth / Business) with the names + prices from `reference/TIER-LIMITS.md`, no checkout wiring.
  - "Subscribe" buttons disabled or pointing to `/sign-up`.
  - **Why:** The route must exist for `middleware.ts` public-route policy verification (success criterion 5), but Stripe Checkout wiring is Phase 6.

### shadcn/ui initialization
- **D-05:** `npx shadcn@latest init` runs in Phase 1 with the **default theme** (zinc base, slate-700 accent — neutral SaaS, not playful).
  - Install **Button, Card, Input** components only in Phase 1. Add more on demand in later phases.
  - **Why:** Landing page CTAs need Button. Pricing stub needs Card. Sign-in/sign-up handled by Clerk's `<SignIn />` / `<SignUp />` components, not custom forms — so no Input strictly required in Phase 1, but install for forward use.
  - Component output path: `components/ui/` per BLUEPRINT §2.

### Local development — Supabase
- **D-06:** Cloud Supabase project only — **no Docker / local CLI**.
  - **Why:** Solo developer; local Supabase via `supabase start` adds Docker overhead with no payoff at MVP scale. Free tier is sufficient for development. Project name: `policypilot-dev` (matched second project `policypilot-prod` to be created at deploy time).
  - Connection: `postgres-js` driver via `drizzle-orm/postgres-js`. Use Supabase's connection-pooled URI (`pooler.supabase.com:6543`) for runtime, direct URI for migrations.

### Drizzle skeleton in Phase 1
- **D-07:** Create `drizzle.config.ts` + `lib/db/index.ts` + **empty** `lib/db/schema.ts` (just `export {}`) in Phase 1.
  - **Why:** Phase 1 success criterion 4 requires "Supabase client connects (a trivial `select 1` succeeds via Drizzle's connection)". That requires the Drizzle client to exist. The actual table definitions are Phase 2.
  - Verify step for criterion 4: a small server-side smoke check (e.g., `await db.execute(sql\`select 1 as ok\`)`) — call site is either a one-off script in `scripts/check-db.ts` or a transient debug route that gets removed in Phase 2. **Use the script approach** to avoid leaving debug routes in code.

### TypeScript configuration
- **D-08:** `tsconfig.json` extends Next.js default and adds:
  - `"strict": true` (Next.js default)
  - `"noUncheckedIndexedAccess": true`
  - `"noImplicitOverride": true`
  - **Why:** CLAUDE.md says "Never use the `any` TypeScript type." These flags reduce situations where `any` is the path of least resistance. Skip `exactOptionalPropertyTypes` — it's noisy with third-party types from Clerk/Stripe.

### Clerk environment setup
- **D-09:** Clerk dev keys only in Phase 1. In the Clerk Dashboard:
  - Create app "PolicyPilot (dev)" — production app deferred.
  - **Enable Organizations** (B2B feature) — required by ADR-004. Organizations are the multi-tenancy primitive.
  - Disable Email magic-link sign-up; enable Email + Password and Google OAuth (HR managers will appreciate Google).
  - Set `<ClerkProvider>` at `app/layout.tsx` — top of tree.
  - Sign-in URL: `/sign-in`, Sign-up URL: `/sign-up`, After sign-in URL: `/dashboard` (admin) or `/my-policies` (employee) — middleware routes by `publicMetadata.role` per ADR-009. **Phase 1 ships with after-sign-in redirect to `/sign-in-success` placeholder** because admin / employee routes don't exist yet; that placeholder gets ripped out in Phase 3 / Phase 5.

### middleware.ts in Phase 1
- **D-10:** `middleware.ts` enforces the locked policy from ADR-009 verbatim, but the role gating returns 404 (not redirect) in Phase 1 because admin / employee routes don't exist yet:
  - Public: `/`, `/pricing`, `/sign-in`, `/sign-up`
  - Webhook exempt: `/api/webhooks/stripe`, `/api/webhooks/clerk` (the routes don't exist in Phase 1; matcher still excludes them to avoid breaking Phase 2/6)
  - `/api/cron/*` requires `CRON_SECRET` (route doesn't exist; matcher exempted)
  - Everything else redirects to `/sign-in`
  - **Why split the role gates:** Phase 1 success criterion 5 only requires the public-route policy. Role gating for `/(admin)/*` and `/(employee)/*` is meaningful only once those routes exist (Phases 3, 5). Add the role checks as no-op-but-present in Phase 1 so they're ready to enforce when routes arrive.

### Environment variables — `.env.local.example`
- **D-11:** Keep `.env.local.example` as currently authored — all phase keys present.
  - **Why:** Single source of truth across all 8 phases. Confusing to add keys phase-by-phase.
  - **Phase 1 must-have keys** (everything else stays blank locally without breaking dev):
    - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
    - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
    - `NEXT_PUBLIC_APP_URL=http://localhost:3000`
  - **Note:** `.env.local.example` is missing `DATABASE_URL` for Drizzle migrations (separate from Supabase URLs). **Plan-phase should add it.**

### Git + repository
- **D-12:** `git init` in Phase 1; GitHub remote deferred (not blocking).
  - First commit message style: imperative present (e.g., "phase 1: scaffold next.js + clerk + supabase"). GSD already handles commits per-task during execute.
  - `.gitignore`: extend the existing root `.gitignore` with Next.js / Drizzle / pnpm patterns from `create-next-app` template.

### Out-of-stack packages
- **D-13: Sentry and PostHog are deferred.** Listed in `.env.local.example` but not in CLAUDE.md stack table.
  - **Why:** No Phase 1 success criterion requires telemetry. CLAUDE.md "Ask First" rule applies. Leave env vars blank; revisit before launch (parking lot).

### Testing infrastructure
- **D-14:** No test framework in Phase 1.
  - **Why:** Phase 1 success criteria are all manual / `tsc`-driven. Test framework choice (Vitest vs Jest, Playwright for E2E) is a Phase 8 decision when validation criteria need automation.

### Tailwind version
- **D-15:** Use whatever `create-next-app@latest` defaults to (likely Tailwind v4 in 2026).
  - **Why:** Next.js 15 + Tailwind v4 is the 2026 standard. No reason to downgrade. shadcn/ui supports both v3 and v4. If `create-next-app` defaults flip back to v3 during installation, do not override — accept the framework default.

### Claude's Discretion
- File naming inside `app/(marketing)/page.tsx` and the exact JSX of the landing-page hero — operator can tweak copy after Phase 1 ships. Plan-phase / executor should write reasonable defaults and not block on prose.
- Tailwind color palette beyond shadcn's default zinc theme — designer flexibility deferred to Phase 3 (Admin UI) where the visual system actually matters.
- Whether to use Server Components vs Client Components for the marketing landing page — default to Server Component (no `'use client'` directive) unless a button needs interactivity.

### Folded Todos
- **`Confirm pnpm vs npm package manager preference before Phase 1 init`** (STATE.md) — resolved via **D-01** (pnpm).
- **`Verify .env.local.example is complete before Phase 1 plan execution`** (STATE.md) — resolved via **D-11**: keys are complete except `DATABASE_URL` which plan-phase must add.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (gsd-phase-researcher, gsd-planner) MUST read these before planning or implementing.**

### Architecture + repo structure
- `BLUEPRINT.md` §1 — Architecture overview (Vercel + Railway + Supabase + external SaaS)
- `BLUEPRINT.md` §2 — Repository structure (route groups, lib modules)
- `BLUEPRINT.md` §3 — Key design decisions
- `BLUEPRINT.md` §4 — Middleware architecture (verbatim policy)
- `BLUEPRINT.md` §5 Phase 1 — Build sequence steps 1–6

### Locked decisions touching Phase 1
- `.planning/intel/decisions.md` — full ADR text for ADR-001 (system topology), ADR-008 (repo layout), ADR-009 (middleware), ADR-010 (Next.js 15 App Router), ADR-012 (Clerk)
- `.planning/PROJECT.md` `<decisions>` block — short-form ADR-001, ADR-008, ADR-009, ADR-010, ADR-012

### Requirements
- `.planning/REQUIREMENTS.md` REQ-product-vision — buyer persona, MVP-AI rule, pricing positioning
- `.planning/ROADMAP.md` Phase 1 — goal, depends, anchoring decisions, 5 success criteria

### Stack rationale (read before adding any dependency)
- `reference/STACK.md` — full rationale for every locked tool; "Runner-ups considered and rejected" section
- `CLAUDE.md` "Stack (non-negotiable)" table — short reference

### Environment variables
- `.env.local.example` — all 8-phase env vars (only Clerk + Supabase + APP_URL required for Phase 1)

### Operating rules
- `CLAUDE.md` "Always / Ask First / Never" — TypeScript-strict, no-`any`, ask-before-unlisted-packages
- `CLAUDE.md` "Multi-Tenancy Rules" — `org_id` invariant (informational for Phase 1; enforcement is Phase 2)

### Constraints from intel
- `.planning/intel/constraints.md` — `SPEC-schema-*` (informational, applied in Phase 2)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None yet.** Repo is pre-scaffold: only docs (`BLUEPRINT.md`, `CLAUDE.md`, `REQUIREMENTS.md`, `STATE-FOUNDRY.md`), `reference/*.md`, `.gitignore`, and `.planning/` exist. Phase 1 creates the codebase.

### Established Patterns
- **None yet** — Phase 1 establishes them:
  - Route-group layout (`(marketing)`, `(auth)`, `(admin)`, `(employee)`)
  - Library module layout (`lib/db`, `lib/ai`, `lib/stripe`, `lib/email`)
  - `middleware.ts` as the single auth chokepoint
  - shadcn/ui as the component baseline

### Integration Points
- **External services touched in Phase 1:**
  - **Clerk** (auth provider) — needs dev app created, Organizations feature enabled
  - **Supabase** (Postgres) — needs project created, connection string in env
- **No data integration yet** (no tables in Phase 1; schema is empty).
- **No external API calls yet** (Claude / Stripe / Resend wired in later phases).

### Reference files already on disk
- `.env.local.example` (root) — exists; reference shape verified
- `.gitignore` (root) — exists; needs Next.js / pnpm patterns appended after scaffold

</code_context>

<specifics>
## Specific Ideas

- **Verify step automation:** A single `scripts/check-foundation.ts` (or `pnpm verify:phase-1`) that runs:
  1. `tsc --noEmit`
  2. `select 1` against Supabase via Drizzle
  3. HTTP probe to `localhost:3000` returning 200
  4. HTTP probe to `/sign-in` returning 200
  5. HTTP probe to a non-public route returning 307 to `/sign-in`
  Output: green/red per criterion. **Plan-phase should write this script.**

- **Operator note on Clerk Organizations:** This is the feature behind the locked ADR-004 (`Clerk Organization ID = Supabase org_id`). Even though no organization-related code ships in Phase 1, the **dashboard flag must be on** before Phase 2 webhooks can fire. Plan-phase should call this out as a manual step in the Phase 1 plan.

- **Operator note on Supabase project creation:** Phase 1 plan must include the manual Supabase Dashboard steps: (a) create project, (b) note the project ref / API keys, (c) copy DB pooler URL. These are not commands the executor can run — they're operator-side prerequisites.

</specifics>

<deferred>
## Deferred Ideas

- **Sentry + PostHog instrumentation** — present in `.env.local.example` but out of stack. Park for pre-launch decision (after Phase 8). If kept, add ADR-022.
- **Production Clerk app + production Supabase project** — Phase 8 / deploy phase. Phase 1 ships dev-only.
- **GitHub remote setup + Vercel project linking** — pre-deploy, not Phase 1.
- **Custom email domain (`noreply@policypilot.com`)** — Phase 7 (when Resend is wired up).
- **Tailwind theme tokens beyond shadcn's default** — Phase 3 (when Admin UI gives the visual system somewhere to live).
- **Vitest / Playwright test infrastructure** — Phase 8 Validation, or earlier if a phase needs regression guards.
- **Pricing page real content + checkout wiring** — Phase 6 Billing.

### Reviewed Todos (not folded)
- None — both pending todos in STATE.md were folded above.

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-05-15*
