# Codebase Structure

**Analysis Date:** 2026-05-30

## Directory Layout

```
policypilot/                          # Next.js 15 project root
├── app/                              # App Router — all routes
│   ├── layout.tsx                    # Root layout: ClerkProvider, fonts
│   ├── globals.css                   # Tailwind base styles
│   ├── (marketing)/                  # Route group — public pages (no URL segment)
│   │   ├── layout.tsx                # Marketing shell
│   │   ├── page.tsx                  # / — landing page
│   │   └── pricing/page.tsx          # /pricing
│   ├── (auth)/                       # Route group — Clerk auth UI
│   │   ├── layout.tsx                # Auth shell (minimal)
│   │   ├── post-sign-in/page.tsx     # /post-sign-in — trampoline dispatcher
│   │   ├── sign-in/[[...sign-in]]/page.tsx   # Clerk <SignIn />
│   │   └── sign-up/[[...sign-up]]/page.tsx   # Clerk <SignUp />
│   ├── (onboarding)/                 # Route group — auth required, no role gate
│   │   ├── layout.tsx                # Passthrough layout
│   │   └── onboarding/create-org/page.tsx    # /onboarding/create-org
│   ├── (admin)/                      # Route group — admin role required
│   │   ├── layout.tsx                # requireAdmin() gate + AdminSidebar shell
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # /dashboard — policy status counts
│   │   │   └── consistency/          # /dashboard/consistency
│   │   │       ├── page.tsx
│   │   │       └── page.test.tsx
│   │   ├── policies/
│   │   │   ├── page.tsx              # /policies — policy library list
│   │   │   ├── new/
│   │   │   │   ├── page.tsx          # /policies/new
│   │   │   │   └── actions.ts        # createPolicyAction server action
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # /policies/[id] — policy detail/editor
│   │   │       ├── actions.ts        # policy transition server actions
│   │   │       └── actions.test.ts
│   │   └── settings/
│   │       ├── page.tsx              # /settings — billing settings (Phase 6)
│   │       ├── actions.ts            # createCheckoutSessionAction, createPortalSessionAction
│   │       └── actions.test.ts
│   ├── (employee)/                   # Route group — any authenticated role
│   │   ├── layout.tsx                # getOrgContext() gate + header shell
│   │   └── my-policies/
│   │       ├── page.tsx              # /my-policies — assigned policies list
│   │       ├── ask/
│   │       │   ├── page.tsx          # /my-policies/ask — Q&A interface
│   │       │   ├── actions.ts        # askQuestionAction
│   │       │   └── actions.test.ts
│   │       └── [id]/
│   │           ├── page.tsx          # /my-policies/[id] — policy view + ack
│   │           ├── actions.ts        # acknowledgePolicyAction
│   │           └── actions.test.ts
│   └── api/                          # API route handlers
│       ├── ai/
│       │   ├── draft/route.ts        # POST /api/ai/draft — AI policy drafting
│       │   ├── summary/route.ts      # POST /api/ai/summary — TL;DR generation
│       │   ├── qa/route.ts           # POST /api/ai/qa — employee Q&A
│       │   └── consistency/
│       │       ├── route.ts          # POST /api/ai/consistency — batch submit
│       │       └── [batchId]/route.ts # GET /api/ai/consistency/[batchId] — poll
│       └── webhooks/
│           ├── clerk/route.ts        # POST /api/webhooks/clerk — Svix-verified
│           └── stripe/route.ts       # POST /api/webhooks/stripe — HMAC-verified
│
├── components/                       # Shared UI components
│   ├── admin/                        # Admin-specific components
│   │   ├── AdminSidebar.tsx          # Left nav rail
│   │   ├── AdminTopbar.tsx           # Top bar with org switcher
│   │   ├── ConsistencyCheck*.tsx     # Consistency check UI components
│   │   └── PolicyAssignments*.tsx    # Assignment panel + form
│   ├── employee/                     # Employee-specific components
│   │   ├── AcknowledgeButton.tsx     # Acknowledgment submit button
│   │   └── AskQuestionForm.tsx       # Q&A form (React 19 useActionState)
│   ├── policy/                       # Policy-related shared components
│   │   ├── PolicyEditor.tsx          # TipTap rich text editor
│   │   ├── PolicyAiDraftDialog.tsx   # AI draft generation dialog
│   │   ├── PolicyTransitionMenu.tsx  # Status transition dropdown
│   │   ├── PolicyView.tsx            # Read-only policy display
│   │   ├── PolicyVersionHistory.tsx  # Version list
│   │   ├── PolicyStatusBadge.tsx     # Status chip
│   │   ├── AckStatusBadge.tsx        # Acknowledgment status chip
│   │   └── PolicyListSearch.tsx      # Search/filter control
│   └── ui/                           # shadcn/ui primitives
│       ├── badge.tsx, button.tsx, card.tsx, dialog.tsx
│       ├── dropdown-menu.tsx, form.tsx, input.tsx, label.tsx
│       ├── select.tsx, separator.tsx, sheet.tsx, sidebar.tsx
│       ├── skeleton.tsx, table.tsx, textarea.tsx, tooltip.tsx
│
├── lib/                              # Server-only business logic + clients
│   ├── ai/                           # Anthropic integration
│   │   ├── client.ts                 # getAnthropicClient() singleton
│   │   ├── models.ts                 # MODEL_SONNET, MODEL_HAIKU constants
│   │   ├── cache.ts                  # EPHEMERAL_CACHE, LONG_CACHE helpers
│   │   ├── prompts.ts                # System prompt templates
│   │   ├── schemas.ts                # Zod schemas for AI request bodies
│   │   ├── extract.ts                # extractText() from Anthropic response
│   │   ├── summary.ts                # generateSummaryForPolicy()
│   │   ├── qa.ts                     # askQuestion() orchestrator
│   │   ├── qa-extract.ts             # Parse citations from Q&A response
│   │   ├── qa-parser.ts              # Q&A response parser
│   │   └── batch-status.ts           # Consistency batch status translator
│   ├── auth/                         # Auth context + guards
│   │   ├── context.ts                # getOrgContext() — Clerk → internal UUIDs
│   │   ├── require-admin.ts          # requireAdmin() / requireAdminFromCtx()
│   │   ├── errors.ts                 # BootstrapError hierarchy
│   │   └── bootstrap-errors.ts       # matchesErrorClass() helper
│   ├── db/                           # Data access
│   │   ├── index.ts                  # db singleton (Drizzle + postgres-js)
│   │   ├── schema.ts                 # All 14 Drizzle table definitions
│   │   ├── scoped.ts                 # withOrgScope() + OrgScope type
│   │   └── repositories/             # Per-aggregate DB access
│   │       ├── acknowledgments.ts    # Acknowledgments.record() (append-only)
│   │       ├── ai_generations.ts     # AiGenerations.insert(), findByIdempotencyKey()
│   │       ├── batch_jobs.ts         # BatchJobs.*
│   │       ├── departments.ts        # Departments.*
│   │       ├── notifications.ts      # Notifications.*
│   │       ├── policies.ts           # Policies.create(), findById(), listAll(), etc.
│   │       ├── policy_assignments.ts # PolicyAssignments.*
│   │       ├── policy_versions.ts    # PolicyVersions.create() (no update/delete)
│   │       ├── qa_citation_grants.ts # QaCitationGrants.upsert(), hasGrant()
│   │       ├── users.ts              # Users.*
│   │       └── workflow_stages.ts    # WorkflowStages.*
│   ├── policies/                     # Policy domain business logic
│   │   ├── state-machine.ts          # ALLOWED_TRANSITIONS, canTransition()
│   │   ├── transitions.ts            # Server-only transition orchestrators
│   │   ├── acknowledgment.ts         # recordAcknowledgment() orchestrator
│   │   ├── categories.ts             # Policy category list
│   │   ├── errors.ts                 # PolicyNotFoundError, etc.
│   │   └── types.ts                  # PolicyId branded type
│   ├── stripe/                       # Stripe integration
│   │   ├── client.ts                 # getStripeClient() singleton
│   │   ├── catalog.ts                # PRICE_CATALOG, priceIdToTier(), tierAndIntervalToPriceId()
│   │   ├── normalize.ts              # normalizeSubscription() → NormalizedSubscription
│   │   ├── products.ts               # TIER_LIMITS, checkTierLimit(), requireTierLimit()
│   │   ├── mask.ts                   # maskCustomerId(), maskSubscriptionId()
│   │   └── errors.ts                 # TierLimitExceededError, StripeConfigError
│   └── utils.ts                      # cn() Tailwind class merger
│
├── drizzle/                          # Database migrations (immutable + ordered)
│   ├── 0000_initial.sql              # Initial schema
│   ├── 0001_rls_policies.sql         # RLS + CHECK constraints
│   ├── 0002_users_department_fk.sql  # Composite FK
│   ├── 0003_fk_hardening.sql
│   ├── 0004_policy_versions_unique.sql
│   ├── 0005_initial_batch_jobs.sql
│   ├── 0006_rls_batch_jobs.sql
│   ├── 0007_ai_generations_audit_extensions.sql
│   ├── 0008_rls_subquery_wrap.sql    # Wraps auth.jwt() in subquery (RLS gap-1 fix)
│   ├── 0009_org_id_indexes.sql
│   ├── 0010_phase5_uniques.sql       # Ack + assignment UNIQUE constraints
│   ├── 0011_qa_citation_grants.sql   # Phase 5 — Q&A citation grants table
│   ├── 0012_billing_state.sql        # Phase 6 — billing columns + partial unique indexes
│   └── meta/                         # Drizzle snapshot journal (source of truth)
│       ├── _journal.json
│       └── 0000_snapshot.json … 0011_snapshot.json
│
├── scripts/                          # CI/CD + verification scripts
│   ├── check-foundation.ts           # Phase 1 verifier
│   ├── check-data-layer.ts           # Phase 2 verifier
│   ├── check-schema.ts               # Schema shape verifier
│   ├── check-deploy-schema.ts        # Pre-deploy env-agnostic schema gate
│   ├── check-db-imports.ts           # Enforce raw-db import allow-list
│   ├── check-rls.ts                  # Verify RLS policies exist + enabled
│   ├── check-auth-context.ts         # Verify auth context module shape
│   ├── check-admin-routes.ts         # Verify admin route patterns
│   ├── check-error-discipline.ts     # No bare `throw new Error()` in lib/
│   ├── check-policy-id-brand.ts      # PolicyId branded type check
│   ├── check-acknowledgment-immutability.ts # Verify no delete/update exports
│   ├── check-ai-prompts.ts           # Verify AI prompt templates
│   ├── check-ai-layer.test.ts        # Phase 4 verifier (Vitest)
│   ├── check-employee-portal.test.ts # Phase 5 verifier (Vitest)
│   ├── check-artifacts.ts            # Verify planning artifact presence
│   ├── deploy-preflight.ts           # Vercel build-time gate
│   └── wait-pooler-auth.ts           # Wait for Supabase pooler readiness
│
├── tests/                            # Test infrastructure
│   ├── setup.ts                      # Vitest global setup
│   ├── smoke.test.ts                 # Smoke tests
│   ├── types.ts                      # @ts-expect-error type invariants
│   ├── ai-mocks.ts                   # Anthropic client mocks
│   ├── stubs/server-only.ts          # server-only stub for test env
│   ├── fixtures/                     # Test fixture data
│   └── e2e/route-smoke.spec.ts       # Playwright route smoke tests
│
├── hooks/                            # React hooks (currently empty or minimal)
├── reference/                        # Frozen spec documents
│   ├── STACK.md                      # Stack decisions + rationale
│   ├── SCHEMA.md                     # Frozen DB schema contract
│   ├── API-SPEC.md                   # API route specs
│   ├── PROMPTS.md                    # AI prompt templates
│   └── TIER-LIMITS.md                # Feature gates per tier
├── docs/
│   └── runbooks/
│       └── deploy-migrations.md      # Step-by-step migration procedure
├── .planning/                        # GSD planning artifacts (on branch, not main)
│   ├── codebase/                     # Codebase map documents (this directory)
│   ├── consultant/                   # Consultant memory files
│   ├── phases/                       # Per-phase planning documents
│   └── STATE.md, ROADMAP.md, etc.
├── ops/deltas/                       # Consultant delta reports
├── .github/workflows/                # CI/CD workflows
├── middleware.ts                     # Clerk auth middleware (root)
├── CLAUDE.md                         # AI operator rules
├── AGENTS.md                         # Codex implementation contract
├── CONSULTANT.md                     # Consultant operating instructions
├── BLUEPRINT.md                      # Frozen architecture reference
├── REQUIREMENTS.md                   # Frozen business requirements
├── next.config.ts                    # Next.js config
├── tailwind.config.ts                # Tailwind config
├── drizzle.config.ts                 # Drizzle Kit config
├── vitest.config.ts                  # Vitest config
└── package.json                      # Dependencies + scripts
```

## Directory Purposes

**`app/(marketing)/`:**
- Purpose: Public-facing marketing pages, no auth required.
- Contains: Landing page, pricing page.
- Key files: `app/(marketing)/page.tsx`, `app/(marketing)/pricing/page.tsx`

**`app/(auth)/`:**
- Purpose: Clerk-hosted authentication flows and the post-sign-in routing trampoline.
- Key files: `app/(auth)/post-sign-in/page.tsx` — critical dispatch logic for role-based routing.

**`app/(onboarding)/`:**
- Purpose: Org creation flow — authenticated but no role requirement. Separated from `(admin)` to avoid the admin role gate.
- Key files: `app/(onboarding)/onboarding/create-org/page.tsx`

**`app/(admin)/`:**
- Purpose: All admin UI — dashboard, policy library, billing settings. Layout calls `requireAdmin()` unconditionally.
- Key files: `app/(admin)/layout.tsx`, `app/(admin)/settings/page.tsx` (billing), `app/(admin)/settings/actions.ts` (checkout + portal).

**`app/(employee)/`:**
- Purpose: Employee-facing policy portal — view assigned policies, acknowledge, ask questions.
- Key files: `app/(employee)/my-policies/ask/actions.ts`, `app/(employee)/my-policies/[id]/actions.ts`

**`app/api/webhooks/`:**
- Purpose: External webhook ingestion. Both routes bypass Clerk middleware and verify their own credentials.
- Key files: `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/clerk/route.ts`

**`lib/auth/`:**
- Purpose: All authentication context resolution and guards.
- Key files: `lib/auth/context.ts` (getOrgContext), `lib/auth/require-admin.ts`, `lib/auth/errors.ts`

**`lib/db/`:**
- Purpose: Database client, schema, OrgScope bridge, per-aggregate repositories.
- Key files: `lib/db/index.ts`, `lib/db/schema.ts`, `lib/db/scoped.ts`
- Rule: Only `lib/db/index.ts`, `lib/db/scoped.ts`, `app/api/webhooks/clerk/route.ts`, and `lib/stripe/products.ts` may import raw `db`.

**`lib/stripe/`:**
- Purpose: All Stripe integration — client, price catalog, subscription normalization, tier gating.
- Key files: `lib/stripe/catalog.ts`, `lib/stripe/normalize.ts`, `lib/stripe/products.ts`

**`lib/policies/`:**
- Purpose: Policy domain — state machine, transition orchestrators, acknowledgment logic.
- Key files: `lib/policies/state-machine.ts`, `lib/policies/transitions.ts`

**`drizzle/`:**
- Purpose: Ordered, immutable SQL migration files. `meta/_journal.json` is the source of truth.
- Generated: Migration files are generated by `pnpm db:generate`; hand-edited for RLS, partial indexes, and custom constraints.
- Committed: Yes — all migration files are committed.

**`scripts/`:**
- Purpose: Automated verification gates run by `pnpm verify:phase-N`. Catch structural invariants that TypeScript alone cannot enforce (RLS presence, raw-db import policy, acknowledgment immutability, etc.).
- Generated: No.
- Committed: Yes.

## Key File Locations

**Entry Points:**
- `middleware.ts` — auth chokepoint for all non-static requests
- `app/layout.tsx` — root layout with ClerkProvider
- `app/(auth)/post-sign-in/page.tsx` — post-authentication role dispatcher

**Auth / Identity:**
- `lib/auth/context.ts` — `getOrgContext()`, `OrgContext` type
- `lib/auth/require-admin.ts` — `requireAdmin()`, `requireAdminFromCtx()`
- `lib/auth/errors.ts` — full BootstrapError hierarchy
- `lib/db/scoped.ts` — `withOrgScope()`, `OrgScope` type

**Schema / Migrations:**
- `lib/db/schema.ts` — all 14 Drizzle table definitions
- `drizzle/0012_billing_state.sql` — Phase 6 billing columns
- `drizzle/meta/_journal.json` — migration journal

**Billing / Stripe:**
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler
- `app/(admin)/settings/page.tsx` — billing settings UI
- `app/(admin)/settings/actions.ts` — checkout + portal server actions
- `lib/stripe/catalog.ts` — price ID ↔ tier mapping
- `lib/stripe/normalize.ts` — subscription state normalization
- `lib/stripe/products.ts` — tier limits + `requireTierLimit()`
- `lib/stripe/client.ts` — Stripe SDK singleton

**AI Layer:**
- `app/api/ai/draft/route.ts` — draft generation (Sonnet 4.6)
- `app/api/ai/summary/route.ts` — TL;DR (Haiku 4.5)
- `app/api/ai/qa/route.ts` — employee Q&A (Sonnet 4.6)
- `app/api/ai/consistency/route.ts` — batch consistency check
- `lib/ai/client.ts` — Anthropic client singleton
- `lib/ai/cache.ts` — prompt cache helpers
- `lib/ai/prompts.ts` — system prompt templates

**Policy Domain:**
- `lib/policies/state-machine.ts` — transition DAG (pure, no DB)
- `lib/policies/transitions.ts` — transactional orchestrators
- `lib/policies/acknowledgment.ts` — ack write orchestrator

**Provisioning Webhooks:**
- `app/api/webhooks/clerk/route.ts` — Clerk org/user provisioning

**Testing:**
- `vitest.config.ts` — test runner config
- `tests/setup.ts` — global test setup
- `tests/ai-mocks.ts` — Anthropic mock helpers
- `tests/stubs/server-only.ts` — `server-only` stub for test environment

## Naming Conventions

**Files:**
- Route files: `page.tsx`, `layout.tsx`, `route.ts`, `actions.ts` — Next.js convention.
- Component files: PascalCase matching export (`AdminSidebar.tsx`, `PolicyEditor.tsx`).
- Library modules: kebab-case (`state-machine.ts`, `require-admin.ts`, `batch-status.ts`).
- Test files: co-located alongside source, suffix `.test.ts` or `.test.tsx`.

**Directories:**
- Route groups: lowercase in parens, `(admin)`, `(employee)`, no URL segment.
- Dynamic segments: `[id]`, `[batchId]` — Next.js convention.
- Catch-all auth routes: `[[...sign-in]]`, `[[...sign-up]]`.

**Exports:**
- Repositories: namespace-style exports (`Policies.create`, `Policies.listAll`).
- Auth helpers: named function exports (`getOrgContext`, `requireAdmin`).
- Stripe helpers: named function exports (`requireTierLimit`, `normalizeSubscription`).
- Constants: SCREAMING_SNAKE_CASE (`TIER_LIMITS`, `ALLOWED_TRANSITIONS`, `PRICE_CATALOG`, `MODEL_SONNET`).

**Types:**
- `OrgContext`, `OrgScope`, `NormalizedSubscription`, `PlanTier` — PascalCase.
- `PolicyStatus`, `Role`, `TierFeature` — PascalCase union types.
- `PolicyId` — branded type (`lib/policies/types.ts`).

## Where to Add New Code

**New admin page:**
- Page: `app/(admin)/<route>/page.tsx`
- Server actions: `app/(admin)/<route>/actions.ts` (with `'use server'` directive)
- Gate: `await requireAdmin()` at the top of the page Server Component (inherited from layout, but add to actions too).
- DB read: `await withOrgScope(ctx, async (scope) => Repository.method(scope, ...))`

**New employee page:**
- Page: `app/(employee)/<route>/page.tsx`
- Server actions: `app/(employee)/<route>/actions.ts`
- Gate: `await getOrgContext()` (layout handles it, but actions must call explicitly).

**New API route (admin-only):**
- File: `app/api/<domain>/route.ts`
- Pattern:
  ```typescript
  export async function POST(req: Request): Promise<Response> {
    const ctx = await getOrgContext();        // outside try — auth errors → boundary
    requireAdminFromCtx(ctx);                  // outside try — 403 → boundary
    try {
      await requireTierLimit(ctx.orgId, 'feature');  // throws TierLimitExceededError
      // ... business logic with withOrgScope
    } catch (err) {
      if (err instanceof TierLimitExceededError) return NextResponse.json({...}, { status: err.statusCode });
      // ... other error handling
    }
  }
  ```

**New repository:**
- File: `lib/db/repositories/<table-name>.ts`
- Add `import 'server-only'` at top.
- All methods accept `OrgScope` as first argument, use `scope.tx` for queries, always filter by `scope.orgId`.
- Never import raw `db` — `scripts/check-db-imports.ts` will catch it.

**New Stripe event handler:**
- Add event type to `HANDLED_EVENT_TYPES` in `app/api/webhooks/stripe/route.ts`.
- Add handler function following the `handle*` naming pattern.
- Add case to `dispatchEvent()` switch.
- Always retrieve canonical subscription from API (not from event snapshot) for subscription events.
- Use `commitProcessedEvent()` for the idempotency + state-update transaction.

**New migration:**
- Generate: `pnpm db:generate` (for Drizzle-managed changes) or `pnpm db:generate:rls` (for custom SQL).
- Migrate test DB: `pnpm db:migrate:test`.
- Verify: `pnpm db:verify`.
- NEVER edit an existing migration file — only add forward migrations.

**New tier-gated feature:**
- Add feature to `TIER_LIMITS` in `lib/stripe/products.ts`.
- Add feature to `reference/TIER-LIMITS.md` (frozen spec — ask first per ASK-FIRST rules).
- Call `await requireTierLimit(ctx.orgId, 'newFeature')` at the API route before the feature logic.

**New component:**
- Admin-specific: `components/admin/ComponentName.tsx`
- Employee-specific: `components/employee/ComponentName.tsx`
- Policy-related shared: `components/policy/ComponentName.tsx`
- Generic UI primitive: `components/ui/component-name.tsx` (shadcn pattern)

## Special Directories

**`.planning/`:**
- Purpose: GSD planning artifacts — phases, consultant memory, codebase maps, STATE.md.
- Generated: Partially (by GSD tooling).
- Committed: On phase branch only; squash-merged to main with phase ship commit. `.planning/phases/**` files do NOT land on `main` directly.

**`drizzle/meta/`:**
- Purpose: Drizzle Kit snapshot journal — source of truth for migration history.
- Generated: By `drizzle-kit generate` / `drizzle-kit migrate`.
- Committed: Yes — `_journal.json` is authoritative.

**`.next/`:**
- Purpose: Next.js build output.
- Generated: Yes.
- Committed: No (gitignored).

**`audit-cache/`, `audit-report/`:**
- Purpose: Static analysis audit artifacts.
- Generated: Yes (by audit tooling).
- Committed: Check `.gitignore`; generally not committed.

**`reference/`:**
- Purpose: Frozen specification documents — STACK.md, SCHEMA.md, API-SPEC.md, PROMPTS.md, TIER-LIMITS.md.
- These are the frozen FOUNDRY-stage originals. For live architecture, see `.planning/`.
- Committed: Yes.

**`secrets/`:**
- Purpose: Local secret storage. Contents are gitignored.
- Committed: No.

---

*Structure analysis: 2026-05-30*
