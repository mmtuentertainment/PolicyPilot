# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
policypilot/
├── app/                        # Next.js 15 App Router
│   ├── (marketing)/            # Public landing + pricing (route group, no URL segment)
│   ├── (auth)/                 # Clerk sign-in / sign-up / post-sign-in trampoline
│   ├── (onboarding)/           # Post-signup onboarding flow (split out from (admin) per CR-PR3-#16)
│   ├── (admin)/                # Admin surfaces — dashboard + policy library
│   ├── (employee)/             # Employee surfaces — my-policies + ask
│   ├── api/                    # Route handlers (webhooks, AI)
│   ├── layout.tsx              # Root layout
│   ├── globals.css             # Tailwind v4 globals
│   └── favicon.ico
├── components/                 # React components
│   ├── policy/                 # Shared admin+employee policy UI
│   ├── admin/                  # Admin-only components
│   ├── employee/               # Employee-only components
│   └── ui/                     # shadcn primitives
├── lib/                        # Server modules
│   ├── auth/                   # Identity + role resolution
│   ├── db/                     # Drizzle client + scope + repositories
│   │   └── repositories/       # 9 per-aggregate repositories (ADR-023)
│   ├── policies/               # State machine + orchestrators + errors
│   ├── ai/                     # Anthropic client + Q&A + summary + extract
│   ├── stripe/                 # (Phase 6 placeholder)
│   └── utils.ts                # shadcn `cn` helper
├── drizzle/                    # SQL migrations + drizzle-kit metadata
│   └── meta/                   # _journal.json + snapshots
├── scripts/                    # CI gates + DB tools (11 active check-* + 3 integration tests)
├── tests/                      # Compile-time types + fixtures + smoke
│   ├── fixtures/
│   ├── stubs/
│   ├── types.ts                # D-07 compile-time invariants
│   ├── setup.ts                # vitest setup
│   ├── ai-mocks.ts             # Anthropic mocks
│   └── smoke.test.ts
├── reference/                  # FROZEN contracts (do not edit during phase work)
│   ├── STACK.md
│   ├── SCHEMA.md
│   ├── PROMPTS.md
│   ├── TIER-LIMITS.md
│   └── API-SPEC.md
├── docs/                       # Runbooks, designs
├── hooks/                      # Pre-commit + other repo hooks
├── public/                     # Static assets
├── secrets/                    # Local-only encrypted deploy creds (gitignored)
├── .planning/                  # GSD overlay (live planning, supersedes frozen FOUNDRY)
│   ├── PROJECT.md              # Live architecture (supersedes BLUEPRINT.md)
│   ├── REQUIREMENTS.md         # Live requirements
│   ├── ROADMAP.md              # Active roadmap with Phase Details
│   ├── STATE.md                # Session memory + Session Continuity log
│   ├── codebase/               # ← THIS DIRECTORY (codebase maps)
│   ├── phases/                 # 05-employee-portal/, 04-ai-layer/, etc.
│   ├── intel/                  # External research / advisor reports
│   ├── debug/                  # Ad-hoc debugging notes
│   ├── reports/
│   └── config.json
├── BLUEPRINT.md                # FROZEN FOUNDRY-stage architecture
├── REQUIREMENTS.md             # FROZEN FOUNDRY-stage requirements
├── CLAUDE.md                   # Project guardrails (machine + per-project)
├── middleware.ts               # Single auth chokepoint
├── drizzle.config.ts
├── next.config.ts
├── vercel.json                 # Build-time gate: `pnpm deploy:preflight`
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
├── components.json             # shadcn config
├── package.json
└── pnpm-lock.yaml
```

## Directory Purposes

**`app/(marketing)/`:**
- Purpose: Public marketing surfaces (landing + pricing); unauthenticated
- Contains: `layout.tsx`, `page.tsx`, `pricing/`
- Key files: `app/(marketing)/page.tsx`, `app/(marketing)/pricing/page.tsx`

**`app/(auth)/`:**
- Purpose: Clerk-hosted auth flows + post-sign-in trampoline
- Contains: `sign-in/[[...sign-in]]/`, `sign-up/[[...sign-up]]/`, `post-sign-in/`
- Key files: `app/(auth)/post-sign-in/page.tsx` (trampoline → routes new admin to onboarding, others to /dashboard or /my-policies)
- Layout: `app/(auth)/layout.tsx` — Clerk wrapper

**`app/(onboarding)/`:**
- Purpose: First-time admin onboarding flow (split out from (admin) per CR-PR3-#16 to remove header-derived role-bypass from the admin layout)
- Contains: `onboarding/page.tsx`
- Layout: `app/(onboarding)/layout.tsx` — auth required, no role check

**`app/(admin)/`:**
- Purpose: Admin dashboard + policy library + (future) reports
- Contains: `dashboard/`, `policies/`
- Layout: `app/(admin)/layout.tsx` — calls `requireAdmin()` unconditionally
- Key files: `app/(admin)/policies/page.tsx` (list), `app/(admin)/policies/[id]/page.tsx` (detail), `app/(admin)/policies/[id]/actions.ts` (Server Actions for transitions), `app/(admin)/policies/new/page.tsx`, `app/(admin)/dashboard/consistency/page.tsx`

**`app/(employee)/`:**
- Purpose: Employee my-policies + AI Q&A surfaces
- Contains: `my-policies/`, `my-policies/[id]/`, `my-policies/ask/`
- Layout: `app/(employee)/layout.tsx` — resolves `getOrgContext()` (auth required, no role check)
- Key files: `app/(employee)/my-policies/page.tsx` (list), `app/(employee)/my-policies/[id]/page.tsx` (D-27 3-branch access-aware handler), `app/(employee)/my-policies/[id]/actions.ts` (acknowledge Server Action), `app/(employee)/my-policies/ask/page.tsx` + `actions.ts`

**`app/api/`:**
- Purpose: Route handlers — webhooks (signature-verified) + AI (auth-required)
- Contains: `webhooks/clerk/`, `ai/draft/`, `ai/summary/`, `ai/qa/`, `ai/consistency/`
- Key files: `app/api/webhooks/clerk/route.ts` (svix signature + user/org mirror), `app/api/ai/qa/route.ts` (employee Q&A endpoint)

**`components/policy/` (shared admin+employee):**
- Purpose: UI used on BOTH admin and employee surfaces — single source for rendering
- Key files: `PolicyView.tsx`, `PolicyEditor.tsx` (TipTap), `PolicyStatusBadge.tsx`, `PolicyTransitionMenu.tsx` (renders from `ALLOWED_TRANSITIONS`), `PolicyVersionHistory.tsx`, `CreatePolicyForm.tsx`, `EditPolicyForm.tsx`, `PolicyHeaderActions.tsx`, `PolicyListSearch.tsx`, `PolicyStatusFilter.tsx`, `AckStatusBadge.tsx`, `PolicyAiDraftDialog.tsx`, `PolicyRegenerateTldrButton.tsx`

**`components/admin/`:**
- Purpose: Admin-only UI (sidebar, topbar, assignments panel, consistency-check views)
- Key files: `AdminSidebar.tsx`, `AdminTopbar.tsx`, `PolicyAssignmentsPanel.tsx`, `PolicyAssignmentsPanelForm.tsx`, `ConsistencyCheckRunButton.tsx`, `ConsistencyCheckRunner.tsx`, `ConsistencyEmptyState.tsx`, `ConsistencyFailureState.tsx`, `ConsistencyFindingsList.tsx`

**`components/employee/`:**
- Purpose: Employee-only UI
- Key files: `AcknowledgeButton.tsx`, `AskQuestionForm.tsx`

**`components/ui/`:**
- Purpose: shadcn primitives (Tailwind v4)
- Key files: `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `form.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `sidebar.tsx`, `skeleton.tsx`, `table.tsx`, `textarea.tsx`, `tooltip.tsx`

**`lib/auth/`:**
- Purpose: Identity + role resolution + typed error hierarchy
- Key files:
  - `context.ts` — `getOrgContext()` + `OrgContext` type (Clerk text-id → internal UUID)
  - `require-admin.ts` — admin layout enforcer
  - `errors.ts` — `BootstrapError` hierarchy + `ForbiddenError` + `InvalidRoleError` + `OrgNotProvisionedError` + `UserNotProvisionedError` (with subCode)
  - `bootstrap-errors.ts` — `BootstrapError` abstract base + `BootstrapErrorCode` literal union (ADR-026)

**`lib/db/`:**
- Purpose: Single-source DB access layer
- Key files:
  - `index.ts` — singleton Drizzle client (allow-listed raw importer)
  - `scoped.ts` — `withOrgScope` + `OrgScope` type (allow-listed raw importer)
  - `schema.ts` — Drizzle table definitions (source of truth for `pnpm db:generate`)
  - `repositories/` — 9 files: `policies.ts`, `policy_assignments.ts`, `policy_versions.ts`, `acknowledgments.ts`, `ai_generations.ts`, `batch_jobs.ts`, `departments.ts`, `notifications.ts`, `qa_citation_grants.ts`, `users.ts`, `workflow_stages.ts`
  - Test siblings: `*.test.ts` alongside each repo

**`lib/policies/`:**
- Purpose: Policy domain — state machine + orchestrators + acknowledgment + typed errors
- Key files:
  - `state-machine.ts` — pure module; `ALLOWED_TRANSITIONS` DAG + `canTransition` + `IllegalTransitionError`
  - `transitions.ts` — 7 orchestrators: `submitForReview` / `approve` / `reject` / `publish` / `archive` / `restore` (bumps version per 03-G3) / `editPublished` (bumps version + resets to Draft per Plan 05-10 DUP-VN-2 fix)
  - `acknowledgment.ts` — Plan 05-04 orchestrator (idempotent create, maps Drizzle 23505 to silent success)
  - `errors.ts` — `PolicyDomainError` hierarchy: `PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError`
  - `types.ts` — `PolicyIdSchema` (branded UUID per ADR-028) + `policyIdFromString` helper
  - `categories.ts` — fixed policy-category enum

**`lib/ai/`:**
- Purpose: Anthropic client + Q&A + summary + extract + caching
- Key files:
  - `client.ts` — singleton Anthropic client; tier-limit check + `ai_generations` persist wrapper
  - `models.ts` — model name constants (Sonnet 4.6 primary, Haiku 4.5 summaries)
  - `prompts.ts` — system prompts (frozen contracts; `scripts/check-ai-prompts.ts` gates wording)
  - `schemas.ts` — Zod schemas for AI response shapes
  - `cache.ts` — prompt-caching helpers
  - `qa.ts` — `askQuestion` orchestrator (D-25 extraction from HTTP route per Plan 05-04, preserves Phase 4 D-41 same-closure `validIds` defense)
  - `qa-parser.ts` — citation parsing
  - `qa-extract.ts` — cited-ID extraction
  - `summary.ts` — `generateSummaryForPolicy` (Haiku TL;DR; post-publish auto-trigger with D-19 graceful-degrade)
  - `extract.ts` — text extraction helpers
  - `batch-status.ts` — Anthropic Batch API status polling (consistency-check flow)

**`lib/stripe/`:**
- Purpose: Phase 6 placeholder (billing not yet shipped)

**`drizzle/`:**
- Purpose: SQL migrations (immutable, ordered) + drizzle-kit metadata
- Contains: `0000_initial.sql` through `0011_qa_citation_grants.sql` + `meta/_journal.json` + `meta/*.snapshot.json`
- Key files:
  - `0001_rls_policies.sql` — initial RLS via `db:generate:rls --custom`
  - `0007_ai_generations_audit_extensions.sql` — destructive migration (DROP `tokens_used`) with operator-approval header
  - `0008_rls_subquery_wrap.sql` — RLS subquery hardening
  - `0009_org_id_indexes.sql` — composite indexes for `org_id`-scoped queries
  - `0010_phase5_uniques.sql` — acknowledgment uniqueness
  - `0011_qa_citation_grants.sql` — Phase 5 D-26 server-tracked Q&A grants
  - `meta/_journal.json` — source of truth for "which migrations are applied"

**`scripts/` (CI gates + DB tools):**
- 11 active `check-*` static analyzers + 3 integration tests + 4 DB tooling scripts
- Static analyzers: `check-foundation.ts`, `check-artifacts.ts`, `check-coderabbit-config.ts`, `check-db-imports.ts`, `check-rls.ts`, `check-auth-context.ts`, `check-policies-list-filters.ts`, `check-admin-routes.ts`, `check-error-discipline.ts`, `check-policy-id-brand.ts`, `check-acknowledgment-immutability.ts`, `check-ai-prompts.ts`, `check-org-state.ts`
- Integration tests (vitest with own config): `check-data-layer.ts` (no vitest — direct tsx), `check-ai-layer.test.ts` + `.vitest.config.ts`, `check-employee-portal.test.ts` + `.vitest.config.ts`
- DB tooling: `check-db.ts`, `check-schema.ts` (test-DB sibling), `check-deploy-schema.ts` (env-agnostic), `deploy-preflight.ts` (Vercel build-time gate), `wait-pooler-auth.ts`, `with-deploy-creds.ps1`, `store-deploy-password.ps1`
- Config: `deploy-config.json`

**`tests/`:**
- Purpose: Cross-cutting test infrastructure
- Key files:
  - `types.ts` — D-07 compile-time invariants (`@ts-expect-error` lines that fail tsc if invariants regress; pinned by `check-acknowledgment-immutability.ts`)
  - `setup.ts` — vitest global setup
  - `ai-mocks.ts` — Anthropic SDK mocks
  - `fixtures/` — DB seeds
  - `stubs/` — manual stub modules
  - `smoke.test.ts` — sanity smoke test

**`reference/` (FROZEN — do not edit during phase work):**
- Purpose: Frozen contracts; live updates go in `.planning/`
- Key files: `STACK.md`, `SCHEMA.md`, `PROMPTS.md`, `TIER-LIMITS.md`, `API-SPEC.md`

**`.planning/` (GSD overlay):**
- Purpose: Live planning + per-phase work artifacts; supersedes frozen FOUNDRY-stage `BLUEPRINT.md` / `REQUIREMENTS.md`
- Key files:
  - `PROJECT.md` — live architecture
  - `REQUIREMENTS.md` — live requirements
  - `ROADMAP.md` — phase plan with parallel-wave grouping (ADR-029)
  - `STATE.md` — session memory + Session Continuity log (migration audit appended here)
  - `phases/05-employee-portal/`, `phases/04-ai-layer/`, etc. — per-phase planning artifacts
  - `intel/` — external advisor reports (EAPI critical path, etc.)
  - `codebase/` — this directory; codebase maps consumed by `/gsd:plan-phase` and `/gsd:execute-phase`
  - `debug/` — ad-hoc debugging notes (e.g. `duplicate-policy-version.md`)

**`docs/`:**
- Purpose: Runbooks, designs, ADRs
- Key files: `docs/runbooks/deploy-migrations.md` (step-by-step deploy procedure)

**`hooks/`:**
- Purpose: Repo-level hooks (pre-commit etc.)

**`secrets/`:**
- Purpose: Local-only encrypted deploy credentials (used by `with-deploy-creds.ps1`); gitignored

## Key File Locations

**Entry Points:**
- `middleware.ts`: Single auth chokepoint
- `app/layout.tsx`: Root layout
- `app/(admin)/layout.tsx`: Admin gate (calls `requireAdmin()`)
- `app/(employee)/layout.tsx`: Employee gate (resolves `getOrgContext()`)

**Configuration:**
- `package.json`: Scripts (verify chain), deps (Next 15.5.18, React 19.1.0, Drizzle 0.45.2, Clerk @clerk/nextjs ^7.3.4, Anthropic SDK 0.97.1)
- `tsconfig.json`: Strict TS
- `next.config.ts`: Next 15 config
- `drizzle.config.ts`: Drizzle ORM config (schema source + migrations folder)
- `vercel.json`: Build-time gate via `pnpm deploy:preflight`
- `eslint.config.mjs`: ESLint v9 flat config
- `vitest.config.ts`: Vitest config (jsdom for component tests)
- `components.json`: shadcn primitives config

**Core Logic:**
- `lib/auth/context.ts`: `getOrgContext()` — single source of "who am I"
- `lib/db/scoped.ts`: `withOrgScope` — single source of per-request RLS-scoped tx
- `lib/db/schema.ts`: Drizzle schema (drives `pnpm db:generate`)
- `lib/policies/transitions.ts`: 7 transition orchestrators
- `lib/policies/state-machine.ts`: Pure transition DAG
- `lib/ai/client.ts`: Anthropic SDK wrapper (tier-check + ai_generations persist)

**Testing:**
- `tests/types.ts`: D-07 compile-time invariants
- `tests/setup.ts`: Vitest setup
- `vitest.config.ts`: Default test runner config
- `scripts/check-ai-layer.vitest.config.ts`: Phase 4 integration vitest config
- `scripts/check-employee-portal.vitest.config.ts`: Phase 5 integration vitest config

## Naming Conventions

**Files:**
- Server modules: lowercase + hyphens (`scoped.ts`, `state-machine.ts`, `qa-parser.ts`)
- Server Actions: always `actions.ts` (NOT `Actions.ts`) co-located with `page.tsx`
- Test siblings: `<module>.test.ts` next to `<module>.ts`
- Components: PascalCase (`PolicyView.tsx`, `AcknowledgeButton.tsx`)
- shadcn primitives: lowercase (`button.tsx`, `card.tsx`)
- Migrations: `NNNN_<description>.sql` zero-padded (4 digits)
- CI gate scripts: `check-<area>.ts` (e.g. `check-acknowledgment-immutability.ts`)

**Directories:**
- Next route groups: parentheses `(marketing)`, `(admin)`, `(employee)`, `(auth)`, `(onboarding)` (no URL segment)
- Lowercase: `lib/`, `components/`, `scripts/`, `drizzle/`
- shadcn `components/ui/` lowercase convention preserved

**Module identifiers:**
- Repository exports: PascalCase singleton namespaces (`export const Policies = { findById, ... }`) — see `lib/db/repositories/*.ts`
- Type aliases: PascalCase (`PolicyId`, `OrgContext`, `OrgScope`)
- Pure functions: camelCase (`canTransition`, `getOrgContext`, `withOrgScope`)
- Error classes: PascalCase + `Error` suffix (`PolicyNotFoundError`, `IllegalTransitionError`)

## Where to Add New Code

**New page (admin):**
- Primary code: `app/(admin)/<route>/page.tsx` (Server Component)
- Server Actions: `app/(admin)/<route>/actions.ts` (co-located)
- Components: `components/admin/<Component>.tsx` for admin-only; `components/policy/<Component>.tsx` if shared with employee
- Update: `middleware.ts` `ADMIN_URL_PATTERNS` if the URL prefix is new
- Update: `scripts/check-admin-routes.ts` may pin the admin layout's role check

**New page (employee):**
- Primary code: `app/(employee)/<route>/page.tsx`
- Server Actions: `app/(employee)/<route>/actions.ts`
- Components: `components/employee/<Component>.tsx` for employee-only

**New API route handler:**
- Primary code: `app/api/<area>/<route>/route.ts`
- Webhook: under `app/api/webhooks/<provider>/route.ts` — auto-bypassed by `middleware.ts` `isWebhookRoute`; MUST verify signature in-handler
- Cron: under `app/api/cron/<job>/route.ts` — auto-bypassed by `middleware.ts` `isCronRoute`; MUST check `CRON_SECRET` header in-handler

**New repository (new aggregate root):**
- Primary code: `lib/db/repositories/<aggregate>.ts` (PascalCase singleton export)
- Test sibling: `lib/db/repositories/<aggregate>.test.ts`
- Schema: extend `lib/db/schema.ts`
- Migration: `pnpm db:generate` → emits new `drizzle/NNNN_*.sql` (NEVER hand-edit existing migrations)
- Update: `scripts/check-rls.ts` if a new table needs RLS policy

**New transition orchestrator:**
- Primary code: `lib/policies/transitions.ts` (add export alongside the existing 7)
- Update: `lib/policies/state-machine.ts` `ALLOWED_TRANSITIONS` if a new edge is needed
- Test: `lib/policies/transitions.test.ts`
- Server Action wrapper: `app/(admin)/policies/[id]/actions.ts`

**New typed error in `lib/policies/`:**
- Primary code: extend `lib/policies/errors.ts` (add literal to `PolicyDomainErrorCode` union FIRST — compile-time gate enforces typo-safety)
- Subclass: `extends PolicyDomainError` with `readonly code = '<LITERAL>'` + `this.name = '<ClassName>'`
- Server Action: catch `PolicyDomainError` and narrow on `err.code`

**New AI orchestrator:**
- Primary code: `lib/ai/<area>.ts`
- Test sibling: `lib/ai/<area>.test.ts`
- Prompt: extend `lib/ai/prompts.ts` (and `scripts/check-ai-prompts.ts` if grep-pinned)
- Schema: `lib/ai/schemas.ts`
- Persist via `lib/ai/client.ts` — never call Anthropic SDK directly elsewhere

**New CI gate (static analyzer):**
- Primary code: `scripts/check-<area>.ts`
- Wire into `package.json` scripts as `check:<area>`
- Add to `verify:phase-N` chain (cumulative composition — adding to phase N runs on all subsequent phases too)

**New CI gate (integration test):**
- Primary code: `scripts/check-<area>.test.ts` + `scripts/check-<area>.vitest.config.ts` (separate config so the test suite isolates from default `vitest run`)
- Wire into `package.json` as `check:<area>` invoking `vitest run scripts/check-<area>.test.ts --config scripts/check-<area>.vitest.config.ts`

**New migration:**
- Schema edit: `lib/db/schema.ts`
- Generate: `pnpm db:generate` (additive) OR `pnpm db:generate:rls` (custom RLS policies)
- Destructive: ASK FIRST per CLAUDE.md ASK-FIRST #3; migration header MUST document rationale + operator-approval timestamp + decision ID
- Deploy: `pnpm db:migrate:<env> && pnpm db:verify:<env>` (both exit 0) BEFORE shipping code that depends on it

**New shadcn primitive:**
- Install via shadcn CLI; lands in `components/ui/<primitive>.tsx`
- Configure in `components.json`

## Special Directories

**`.planning/codebase/`:**
- Purpose: Codebase maps (STACK.md, INTEGRATIONS.md, ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md) consumed by `/gsd:plan-phase` and `/gsd:execute-phase`
- Generated: Yes (via `/gsd:map-codebase`)
- Committed: Yes (lives on phase branches; squashed into `main` with each phase ship)

**`drizzle/meta/`:**
- Purpose: drizzle-kit-managed journal + snapshots
- Generated: Yes (by `pnpm db:generate`)
- Committed: Yes (`_journal.json` is the source of truth for "which migrations are applied")
- NEVER hand-edit

**`secrets/`:**
- Purpose: Local-only encrypted deploy creds (consumed by `with-deploy-creds.ps1`)
- Generated: No (operator-created via `store-deploy-password.ps1`)
- Committed: No (gitignored)

**`audit-cache/`, `audit-report/`:**
- Purpose: Output of dependency-audit tooling (per `C:\Users\matth\CLAUDE.md` MEMORY.md "Audit before security changes")
- Generated: Yes
- Committed: Operator decision per audit

**`node_modules/`, `tsconfig.tsbuildinfo`:**
- Generated; gitignored

**`.tmp/svix-url.json`:**
- Generated by Clerk webhook test setup; cleaned up at end of `verify:phase-3` via `node -e \"require('fs').rmSync('.tmp/svix-url.json', { force: true })\"`

**`scratch/`:**
- Operator scratchpad; not load-bearing

---

*Structure analysis: 2026-05-24*
