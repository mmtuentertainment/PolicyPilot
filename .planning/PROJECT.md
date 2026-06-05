# PROJECT — PolicyPilot

AI-powered policy & procedure management SaaS for SMBs (25–300 employees). Replaces Google Drive / SharePoint for company-policy management with AI drafting, acknowledgment tracking, and compliance-ready audit trails — at a price an SMB can afford.

---

## Core Value

PolicyPilot is the policy-and-procedure management tool an SMB can actually use. Three things must be true at all times for the product to mean what it claims:

1. **AI is present at MVP** — not a roadmap promise. Claude drafts policies in minutes, summarizes them in plain English, and answers employee questions from the published library (with citations).
2. **The audit trail is real** — every acknowledgment is append-only with timestamp + IP. Auditors can trust it.
3. **Tenant isolation is absolute** — `org_id` is in every query at the application layer and RLS is the last line of defense. Cross-org data leakage = product failure.

## Beat-Manual Success Metric

PolicyPilot must be **demonstrably faster and more reliable than a Google Drive folder** for the same use case. If a 50-person company can manage policies more easily in Drive, PolicyPilot doesn't ship. This is the ninth (meta) acceptance criterion from REQUIREMENTS.md §10 and the operator's go/no-go gate.

## Operator

Matthew (MMTU Entertainment LLC) — solo developer + Claude. Email: `mmtuentertainment@gmail.com`. Workflow is solo-with-AI; no team, no sprints, no resource allocation. Phases are buckets of work, not project-management artifacts.

## Runtime Target

Next.js 15 App Router on Vercel + a Railway worker for cron and bulk email. PostgreSQL on Supabase with RLS. External services: Clerk (auth), Stripe (billing), Anthropic Claude (AI), Resend (email). Single Next.js repo; no separate backend service.

---

<decisions>

The following 29 decisions are LOCKED (precedence 0–1 ADRs from `BLUEPRINT.md`, `reference/STACK.md`, and operator-approved architectural reviews). They cannot be changed without explicit operator approval and a new ADR. Full text lives in `.planning/intel/decisions.md` — short form preserved here for downstream consumers.

### ADR-001 — System Topology (locked)
Single Next.js 15 App Router app on Vercel + Railway worker + Supabase Postgres + external SaaS (Clerk, Stripe, Claude, Resend).

### ADR-002 — No Separate Backend (locked)
Next.js API routes + Server Actions handle all server logic. Railway is reserved exclusively for cron and background jobs that exceed Vercel serverless limits.

### ADR-003 — Drizzle ORM over Prisma (locked)
Drizzle is the ORM. No codegen. TypeScript-first. `lib/db/schema.ts` is the source of truth; types inferred at compile time.

### ADR-004 — Clerk Organization ID = Supabase org_id (locked)
Clerk's Organization ID is the canonical `org_id` in Supabase. Mapping established via Clerk webhook on org creation. Identity never duplicated.

### ADR-005 — TL;DR Summaries Cached at Publish Time (locked)
Policy TL;DR summaries are generated once at publish time (Haiku 4.5) and stored on the policy record. Not regenerated per view.

### ADR-006 — Prompt Caching on Q&A Endpoint (locked)
Employee Q&A uses Anthropic prompt caching on the policy-library context block. Target 60–80% hit rate. Cache directive: `cache_control: { type: "ephemeral" }`.

### ADR-007 — Build Sequence: 8 Sequential Phases (locked)
ASSEMBLY proceeds in 8 sequential phases. Phase N+1 cannot start until Phase N compiles clean (`tsc --noEmit`). Order: Foundation → Data Layer → Admin UI → AI Layer → Employee Portal → Billing → Crons + Email → Validation.

### ADR-008 — Repository Layout (locked)
Single Next.js monorepo. Route groups: `(marketing)`, `(auth)`, `(admin)`, `(employee)`, `(reviewer)` (5th group added by **ADR-030**, 2026-06-05). API routes: `/app/api/webhooks/{stripe,clerk}`, `/app/api/ai/{draft,summary,qa,consistency}`, `/app/api/cron/reminders`. Library modules: `lib/db`, `lib/ai`, `lib/stripe`, `lib/email`.

### ADR-009 — Middleware = Clerk Auth + Role Routing (locked)
`middleware.ts` is the single auth chokepoint. Public: `/`, `/pricing`, `/sign-in`, `/sign-up`. Webhook exempt: `/api/webhooks/{stripe,clerk}`. `/(admin)/*` requires `publicMetadata.role === 'admin'`. `/(employee)/*` requires auth. `/api/cron/*` requires `CRON_SECRET` header.

### ADR-010 — Next.js 15 (App Router only) (locked)
Next.js 15 App Router is the single framework for both frontend and API. TypeScript default. CRA rejected. Separate React + Node/FastAPI backend rejected.

### ADR-011 — Supabase (PostgreSQL + RLS) (locked)
Supabase is the data store. RLS enabled on every tenant-scoped table. Drizzle preferred over Prisma. Neon rejected (Supabase gives more for the same cost).

### ADR-012 — Clerk for Auth (B2B Organizations) (locked)
Clerk is the auth provider (~$0.02/MAU after 10K free). Auth0 rejected (3.5× MAU cost, worse B2B DX).

### ADR-013 — Stripe for Billing (locked)
Stripe (Checkout + Webhooks + Customer Portal). Paddle / Lemon Squeezy rejected.

### ADR-014 — Vercel + Railway Hybrid Hosting (locked)
Vercel hosts Next.js + serverless API routes. Railway hosts a persistent worker container for cron and bulk email (~$5/mo).

### ADR-015 — Claude Sonnet 4.6 (primary) + Haiku 4.5 (summaries) (locked)
Sonnet 4.6 for draft / Q&A / consistency. Haiku 4.5 for TL;DR summaries only. Opus 4.7 rejected as overkill. Projected cost <$300/mo at 200 customers with 70% prompt cache + Batch API.

### ADR-016 — Resend + React Email (locked)
Resend is the transactional email provider. React Email templates live in `lib/email/templates/`.

### ADR-017 — Tier Plan Model: Starter / Growth / Business (locked)
Three tiers. `TIER_LIMITS` in `lib/stripe/products.ts` is the single source of truth. Starter (25 users, 50 drafts/mo), Growth (100 users, 200 drafts/mo, workflows + Slack + consistency), Business (500 users, unlimited drafts, all features). Annual = 20% discount.

### ADR-018 — Append-Only Acknowledgment Audit Trail (locked)
Acknowledgment records are NEVER deleted or modified. On policy update, prior acks remain in history and the policy is flagged "requires re-acknowledgment" against the new `policy_version_id`.

### ADR-019 — Multi-Tenancy: org_id in Every Query + RLS as Last Line (locked)
Every DB query must include `org_id` in WHERE at the application layer. RLS is the last line of defense, not the primary gate. Cross-org queries are forbidden under any code path. RLS pattern: `org_isolation` policy `USING (org_id = auth.jwt()->>'org_id')` on every tenant-scoped table.

### ADR-020 — Stripe Webhook: All 5 Subscription Events, Idempotent (locked)
The `/api/webhooks/stripe` handler handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, and `customer.subscription.updated`. All handlers idempotent via `stripe_events` table. Webhook signatures verified against raw body (`request.text()`).

### ADR-021 — Batch API for Consistency Check (locked)
The Consistency Check uses Claude Batch API (async) for ~50% cost reduction. Endpoint returns `batchId`; client polls. The only async AI operation — draft, summary, Q&A remain synchronous.

### ADR-022 — Node 22 Active LTS (locked, 2026-05-16, supersedes Phase 1 D-01's Node 20 pin)
`engines.node` is `>=22.0.0 <23.0.0`. Node 22 became Active LTS in Oct 2024; Node 20 entered maintenance-LTS. The Phase-1 D-01 decision predated this cutover and pinned 20 as "the LTS at the time" — Node 22 satisfies the same spirit ("use Active LTS") with current security patches. Concretely required because Plan 01-04 chose `node --env-file=.env.local` for `pnpm check:db` and `pnpm verify:phase-1`; `--env-file` was experimental in Node 20.6 and only became stable in Node 22, so the previous `<21.0.0` upper bound silently made the project's own verify scripts incompatible with its declared runtime. Vercel + Railway both support Node 22 in production.

### ADR-023 — OrgContext + Per-Aggregate Repositories Enforce ADR-019 (locked, 2026-05-17; repository-signature amended by ADR-025)

ADR-019's "org_id in every WHERE" invariant is enforced by per-aggregate repositories under `lib/db/repositories/*.ts` (one module per tenant-scoped table). Repositories pre-apply `where(eq(table.orgId, scope.orgId))` and omit methods that would violate adjacent invariants (`Acknowledgments` has no update/delete per ADR-018; `Policies.create` doesn't accept `tldrSummary` per ADR-005). Raw `db` export is reserved for a 4-entry allow-list — Clerk webhook (creates the org row), Stripe webhook (looks up by `stripeCustomerId`), Railway cron jobs (cross-org reminders), Phase-8 test harness — enforced by `scripts/check-db-imports.ts` in CI. Repository methods take `OrgScope` (not bare `OrgContext`) as first parameter per ADR-025; `OrgScope = OrgContext & { tx }` carries the per-request transaction so all repository calls inside one `withOrgScope` share one transaction.

### ADR-024 — Middleware Stays Procedural; Tier Gating Is App-Layer (locked, 2026-05-17)

`middleware.ts` enforces only auth + role across all 8 phases: 5 route kinds (public / webhook / cron / authenticated / role-gated), 1 dimension. The procedural if-else chain is the deliberate implementation; no data-driven route-policy table. Tier gating is **403-at-API-routes** (per Validation-Gate item "403 + upgrade prompt") or **`redirect('/upgrade')`-from-Server-Components**, both via `requireTier(feature, org)` in `lib/stripe/limits.ts` (Phase 6). Middleware never imports `TIER_LIMITS` and never reads `organizations.planTier`.

### ADR-025 — RLS Enforced via Per-Transaction JWT Injection + `SET LOCAL ROLE` (locked, 2026-05-17; resolves ADR-023 § "Open architecture question")

User-facing repository traffic enters `withOrgScope(ctx, fn)` which opens a Drizzle transaction, runs `SET LOCAL ROLE authenticated` (Supabase built-in NOBYPASSRLS role) and `SELECT set_config('request.jwt.claims', <json>, true)`, then dispatches to repository methods that operate on the scoped transaction. After these two statements, the RLS policies in `reference/SCHEMA.md` (`USING (org_id = auth.jwt()->>'org_id')`) evaluate against the actual `ctx.orgId` — both the application-layer `where` and the database-layer RLS fire on every user-facing query. The four ADR-023 allow-listed cross-org callers continue to use raw `db` at the connection-level `postgres` role (BYPASSRLS). Migrations stay on the direct DB URL + `postgres` role per D-06 (need BYPASSRLS to ALTER tables). Performance cost: two extra round-trips per request transaction, amortized across all repository calls inside one `withOrgScope`. Rejected alternatives: dual-pool split (redundant with allow-list routing on a single pool) and accept-the-gap (sacrifices the SMB-compliance "isolation at both layers" claim for negligible perf gain). Phase 2 plan-phase deliverables: `lib/db/scoped.ts`, `lib/auth/context.ts`, the 9 repository modules, `scripts/check-db-imports.ts` CI gate, and `scripts/check-rls.ts` cross-org property test (runs in `verify:phase-2`).

### ADR-026 — Typed Error Classes for `lib/auth/` (locked, 2026-05-20; fast-follow from PR #3)

Every `throw` inside `lib/auth/` uses a typed class from `lib/auth/errors.ts` instead of `throw new Error("string literal")`; the v0 substring matcher in `lib/auth/bootstrap-errors.ts` is removed. A `BootstrapError` abstract base groups the five user-bootstrap conditions (`NotAuthenticatedError`, `NoActiveOrganizationError`, `InvalidRoleError`, plus a `ProvisioningRaceError` abstract base with `OrgNotProvisionedError` + `UserNotProvisionedError` subclasses). `ClerkAuthFailedError` is intentionally NOT a `BootstrapError` — it's an infrastructure-failure marker that must rethrow past both consumers; making it a `BootstrapError` would mask Clerk outages as onboarding race-windows. Consumers in `app/(admin)/dashboard/page.tsx` (race-recovery) and `app/(auth)/post-sign-in/page.tsx` (hard-fail) narrow via `err instanceof Class` rather than `err.message.includes(needle)`; the intentional asymmetry (dashboard catches `ProvisioningRaceError` for the 2s meta-refresh UX; trampoline rethrows it as hard-fail per Plan 03-02) is preserved by each consumer maintaining its own class allow-list. Class constructors follow the existing `IllegalTransitionError` pattern (`public readonly` params + `this.name = 'ClassName'`); each class additionally exposes a stable `code: string` constant for Phase-7+ structured logging (the hierarchy has multiple concrete classes — `name` alone is insufficient to discriminate in logs). Message strings preserved verbatim at `super(message)` for log-grep continuity. Scope is `lib/auth/` only — `scripts/check-error-discipline.ts` (ts-morph; in `verify:phase-3` chain) fails CI if `throw new Error(` survives in that subtree, but other layers (Stripe webhook, Claude API in Phase 4, repository invariants) are not yet bound; they may adopt the same pattern with their own ADRs when their surface complexity warrants. Rejected alternatives: discriminated union of plain objects (drops `instanceof` ergonomic); single `AuthError` class with discriminant field (more cumbersome narrowing than separate classes); transition-state matcher (keeps both string + class matchers — eliminates the win). Deliverables: new `lib/auth/errors.ts`, refactored `context.ts` (6 throws) + `bootstrap-errors.ts` matcher + 8 divergence-lock tests + both consumer pages, new `scripts/check-error-discipline.ts`, new `pnpm check:error-discipline` script wired into `verify:phase-3`.

### ADR-027 — User-Lookup Scoping by `org_id` in `getOrgContext` (locked, 2026-05-20; fast-follow from PR #5 CR outside-diff finding)

`lib/auth/context.ts:getOrgContext()` resolves Clerk text identifiers into internal UUIDs via two DB lookups (`organizations.clerk_org_id` for the org, `users.clerk_user_id` for the user). The v1 (PR #5) user lookup filtered only by `clerk_user_id`, accepting any matching user row regardless of the user's `org_id`. ADR-027 narrows this: the lookup now runs sequentially (`org → user`) and the user query additionally requires `eq(users.org_id, orgRow.id)`. If the user's DB row's `org_id` doesn't match the session's resolved org, `getOrgContext` throws `UserNotProvisionedError` (the typed class from ADR-026; same class as "no user row at all" — equivalent semantic from the consumer's perspective: bootstrap context cannot be completed). The boundary this enforces is **state consistency** between the session's claimed org and the user's DB record's org. The boundary that's NOT enforced — and never was — is cross-tenant data access; RLS in `withOrgScope` (per ADR-025) is the binding boundary for that, keyed off `session.orgId` not `users.org_id`. Why the narrowing matters: without it, a multi-org Clerk user whose `users.org_id` ≠ `session.orgId` still got an `OrgContext` returned and RLS scoped queries correctly to `session.orgId`, BUT the returned `userId` was for a user-record whose own `org_id` field claimed they were in a different org — a state inconsistency. No current code-path surfaces this as a user-visible bug (the 4 repositories — policies / policy_versions / workflow_stages / users — read their OWN tables' `orgId` against `scope.orgId`; only `users.ts` actually reads `users.orgId`, and it correctly scopes by `scope.orgId`, so a stale mismatch makes the user invisible to their own attribution but doesn't currently break any shipping feature). The load-bearing concern is forward-looking: when Phase 5+ acknowledgment views land attribution joins (`JOIN users ON acks.userId = users.id AND users.org_id = scope.orgId`), those joins will silently return empty rows for any cross-org-mismatched user — a subtle UX failure pretending to be a successful request. ADR-027 makes the `users.org_id = scope.orgId` invariant load-bearing at the auth boundary so Phase 5+ joins can rely on it without re-asserting. Cost: 1 extra DB round-trip per `getOrgContext()` call (sequential vs parallel). Acceptable; `getOrgContext` is a per-request boundary, not a hot loop. **Open question — full multi-org Clerk support:** the Clerk webhook handler at `app/api/webhooks/clerk/route.ts:296-303` (`organizationMembership.created`) **unconditionally overwrites** `users.org_id` on every membership-created event — so PolicyPilot's data model tracks only the user's most-recently-joined org. A multi-org Clerk user switching their active session back to an older org will mismatch and get locked out via this ADR's throw. Full multi-org support requires schema changes (composite unique on `(clerk_user_id, org_id)` on `users`, or a separate `user_organization_memberships` table) and is out of scope here; it will get its own ADR if/when product requirements demand it. Rejected alternatives: skip the change and accept silent attribution-failure UX (defense-in-depth value lost); fold the new mismatch case into `BOOTSTRAP_ERRORS` (trampoline allow-list) so the trampoline catches it (breaks ADR-026's intentional asymmetry — trampoline rethrows DB drift as hard-fail per Plan 03-02); inject `session.orgId` into a custom JWT claim and check inline (over-engineered; can't change Clerk's session-claim contract per ADR-024). Deliverables: refactored `getOrgContext` sequential lookup in `lib/auth/context.ts` with `and(eq(clerkUserId), eq(orgId))`; positive + negative control assertions in `scripts/check-auth-context.ts` (existing integration test against TEST DB); `scripts/check-artifacts.ts` assertion that the new predicate substring is in `context.ts`.

### ADR-028 — PolicyId Branded Type + `UserNotProvisionedError` Sub-Discriminant (locked, 2026-05-21; PR #13; bundles PR #7's 2 deferred MEDIUMs)

A new `lib/policies/types.ts` exports `PolicyIdSchema = z.string().uuid().brand<'PolicyId'>()` and `policyIdFromString(value)`. The `PolicyId` brand is threaded through repository / orchestrator / Server Action policyId-parameter signatures: `lib/db/repositories/policies.ts` (`findById` / `updateDraft` / `incrementVersion`), `policy_versions.ts` (`create` input + `listForPolicy` + `findByVersionNumber`), `policy_assignments.ts` (`listForPolicy`), `workflow_stages.ts` (`recordSubmission` + `listForPolicy`), `lib/policies/transitions.ts` (8 orchestrators), and `app/(admin)/policies/[id]/actions.ts` (`policyIdFrom(formData)` returns `PolicyId | null`; shared `PolicyIdSchema` in `EditPublishedSchema` + `UpdateDraftSchema`). Lift-into-brand happens at the Server-Action trust boundary; downstream code receives the already-branded value. Drizzle `$inferInsert` types are intentionally OUT OF brand scope per ADR-003 schema-as-source-of-truth — branding `$inferInsert` would require hand-constructing the input type and lose the schema invariant. The brand covers EXPLICIT policyId parameter positions only; FK + RLS catch any cross-org policyId at insert time regardless. `UserNotProvisionedError` (the ADR-026 class) gains a required `subCode: 'CLERK_USER_NOT_IN_DB' | 'USER_ORG_MISMATCH'` discriminant — the two throw paths created by ADR-027's lookup-scoping. The discriminant lives ONLY on the typed `subCode` field; internal `orgRow.id` UUIDs never appear in the `super(message)` string OR any exposed `public readonly` field. The throw site adds ONE indexed `users.clerk_user_id`-only lookup on the already-error path to determine subCode (happy-path cost: zero; error-path cost: ~1 RTT — correct asymmetry for a hot vs rare path). Verification: new `scripts/check-policy-id-brand.ts` ts-morph gate scans the 6 brand-bearing files for signature drift; `tests/types.ts` (D-07) gains a `@ts-expect-error` proving `const id: PolicyId = "raw-uuid-string"` rejects at compile time; `lib/auth/bootstrap-errors.test.ts` gains 3 cases pinning subCode discrimination + the message-text invariance contract. `pnpm check:policy-id-brand` wired into `verify:phase-3` (now 10 gates). Slippery-slope policy: do NOT brand `UserId`/`OrgId` yet — they're contained inside `OrgContext`/`OrgScope` with single-trust-boundary construction (`getOrgContext` → `withOrgScope`); brand coverage there would add ~20 signature touches with marginal additional safety. Brand coverage is opportunistic — future PRs touching User/Org-heavy code MAY brand those if friction warrants. PR #7's 2 deferred MEDIUM findings (subCode discriminant + `orgRow.id` info-disclosure) are CLOSED by §(3) and §(4) respectively. Rejected alternatives: optional `subCode` parameter (lets new throw sites silently ship without discriminating); fold subCode into `code` field (collapses ADR-026 hierarchy invariants); brand `UserId`/`OrgId` here too (over-broad for the immediate driving need).

### ADR-029 — Phase Parallelization Under Green-On-Main Constraint (locked, 2026-05-21; amends ADR-007)

ADR-007's phase ORDER is preserved (Foundation → Data Layer → Admin UI → AI Layer → Employee Portal → Billing → Crons + Email → Validation). ADR-007's clean-boundary intent is preserved (every phase's squash commit on `main` must exit `tsc --noEmit` 0 + `verify:phase-N` 0). Gating between in-flight phases is amended: **phase boundaries must remain green on `main`, but in-flight phases may run on parallel branches off a common `main` ancestor.** Each phase still lives on its own `gsd/phase-N-<slug>` branch; the first to merge defines the new `main` HEAD; the second rebases on top. Cross-phase semantic dependencies still hold (Phase 6 needs Phase 4's `checkTierLimit`; Phase 7 needs Phase 5's ack flow); the amendment relaxes only the gating between semantically-independent phases. True minimum `Depends on` chain from `/gsd-manager --analyze-deps` 2026-05-21: Phase 4 → 3 (unchanged); Phase 5 → 3 (was 4 — employee portal doesn't consume Phase 4 AI surfaces); Phase 6 → 4 (was 5 — `checkTierLimit` is the binding dependency per Phase 4 SC #1/#5); Phase 7 → 5 (was 6 — `ack_reminder` cron needs Phase 5 ack flow); Phase 8 → 6 + 7 (changed — under the new DAG Phase 7 alone no longer transitively covers Phase 6, and Phase 8 SC #4 requires the Phase 6 Stripe renewal test; both Wave 2 outputs are required). Enables Wave 1: Phase 4 ‖ Phase 5; Wave 2: Phase 6 ‖ Phase 7; Wave 3: Phase 8. Theoretical wall-clock compression 30-40% if Wave 1 + Wave 2 paired. Solo-dev context: parallelism is **opportunity, not mandate** — operator chooses per-phase cadence based on bandwidth and the specific phase pairing. File-collision risk register (rebase-discipline hotspots when parallel branches both touch): `scripts/check-artifacts.ts` (convention: append-only blocks at file bottom), `package.json` + `pnpm-lock.yaml` (convention: later-merged branch rebases lockfile from new `main`), `tests/types.ts` (append-only), `.planning/STATE.md` (bookkeep post-merge with bundled-update pattern), `.planning/PROJECT.md` `<decisions>` block (new ADRs append sequentially after merge). `middleware.ts` low-risk (Phase 5 adds `isEmployeeRoute` matcher only; Phase 6 doesn't modify middleware per ADR-024). No code/test/schema changes. ADR-007 remains LOCKED as ratified; its phase ORDER is unchanged. Rejected alternatives: keep strict-sequential (over-conservative for Phases 4-8); full DAG with no `main`-checkpoint (loses clean phase-boundary property — `verify:phase-N` semantics become ambiguous, audit cascade defers in unwanted ways); mandate parallel (inverts operator authority over execution cadence).

### ADR-030 — `(reviewer)` Route Group for the Phase 9 Reviewer Surface (locked, 2026-06-05; amends ADR-008)

ADR-008's route-group enumeration gains a 5th UI group: `(reviewer)`. The reviewer surface (`app/(reviewer)/`) stays in place — NOT relocated under `(admin)`. Under ADR-009 it is auth-only-at-the-edge (excluded from `ADMIN_URL_PATTERNS` in `middleware.ts`, same class as `(employee)`); the authoritative role gate is page-level `requireReviewerOrAdmin()` in `app/(reviewer)/layout.tsx` (`role ∈ {reviewer, admin}`). Relocation under `(admin)` rejected (CodeRabbit PR #42 suggestion): the `(admin)` layout's unconditional `requireAdmin()` runs for every descendant, so folding `(reviewer)` there would dark the surface for non-admin reviewers, or weakening that gate would widen the admin privilege boundary across the whole admin surface — reviving the header-bypass hole removed in CR-PR3-#16. Precedent: `(onboarding)`/`(employee)` already exist beyond ADR-008's literal list (`(employee)` ratified ADR-008-honored in `05-VERIFICATION.md`). No code change. Operator decision D-09-01 at the PR #42 ship gate, ratifying the s22 verification (`wf_abccf908-39f`) over the relocate suggestion. Locked decision count 29 → 30.

</decisions>

---

<non_goals>

The following are explicitly OUT OF SCOPE for MVP. Do not build, do not stub, do not plan for v1:

- Training module / LMS
- HR system integrations (BambooHR, Workday, etc.)
- Mobile native app — responsive web is sufficient
- Document generation (contracts, forms, generic templates)
- Custom domain per organization
- Offline mode
- Slack integration (deferred to v1.1)
- Zapier / Make outbound webhooks (deferred to v1.2; `apiAccess` flag in Business tier is the placeholder)
- Google Workspace bulk import (deferred to v1.3)

Source: REQUIREMENTS.md §9, REQ-non-goals, REQ-integrations.

</non_goals>

---

<key_files>

| File | Authoritative for |
|------|-------------------|
| `BLUEPRINT.md` | Architecture, repo layout, API surface |
| `REQUIREMENTS.md` (root) | Domain rules, business logic, acceptance gate |
| `.planning/REQUIREMENTS.md` | Merged + traceability (this planning copy) |
| `reference/STACK.md` | Stack decisions and rationale |
| `reference/SCHEMA.md` | Drizzle schema and RLS policies |
| `reference/API-SPEC.md` | Every API route contract |
| `reference/PROMPTS.md` | Claude system prompts |
| `reference/TIER-LIMITS.md` | Feature gates per tier |
| `.env.local.example` | Required environment variables |
| `.planning/intel/SYNTHESIS.md` | Ingest summary entry point |
| `.planning/intel/{decisions,requirements,constraints,context}.md` | Per-type intel detail |

</key_files>
