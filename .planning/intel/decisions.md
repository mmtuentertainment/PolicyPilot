# Decisions (ADR Intel)

Extracted from classified ADR sources. Each decision preserves its origin so downstream consumers can trace provenance. LOCKED decisions cannot be auto-overridden.

---

## ADR-001: System Architecture — Next.js + Supabase + External Services

- source: `BLUEPRINT.md`
- status: locked (precedence 0, manifest authority — FOUNDRY committed architecture)
- scope: system topology, deployment targets

### Decision

PolicyPilot runs as a single Next.js 15 App Router application hosted on Vercel, paired with a Railway worker for cron + background jobs. PostgreSQL is hosted by Supabase with Row Level Security. External SaaS providers fill auth (Clerk), billing (Stripe), AI (Anthropic Claude), and transactional email (Resend).

Topology:
- Vercel — Next.js 15 App Router (frontend + API routes under `/app/api/*`)
- Supabase — PostgreSQL + RLS (sole data store)
- Railway — worker process for cron + email batches that exceed serverless limits
- External — Clerk, Stripe, Claude, Resend

---

## ADR-002: No Separate Backend Service

- source: `BLUEPRINT.md` § 3
- status: locked
- scope: backend boundary

### Decision

Next.js API routes handle all server logic. No standalone Node/FastAPI service. Railway is reserved exclusively for cron jobs and background tasks that exceed Vercel's serverless execution limits — not a general application backend.

---

## ADR-003: Drizzle ORM over Prisma

- source: `BLUEPRINT.md` § 3, `reference/STACK.md`
- status: locked
- scope: ORM selection

### Decision

Drizzle ORM is the chosen ORM. No code generation step. TypeScript-first. The schema file (`lib/db/schema.ts`) is the source of truth; types are inferred at compile time. Prisma was explicitly considered and rejected (code-gen friction).

---

## ADR-004: Clerk Organization ID = Supabase org_id

- source: `BLUEPRINT.md` § 3
- status: locked
- scope: identity / multi-tenancy

### Decision

Clerk's Organization ID is the canonical `org_id` used in Supabase. The mapping is established via a Clerk webhook on org creation. Identity is never duplicated; Supabase does not maintain its own org identity outside the Clerk-provided ID.

---

## ADR-005: TL;DR Summaries Cached at Publish Time

- source: `BLUEPRINT.md` § 3
- status: locked
- scope: AI cost model / summary lifecycle

### Decision

Policy TL;DR summaries are generated once at publish time (Haiku 4.5) and stored on the policy record. They are not regenerated per view. This keeps AI cost minimal and decouples reads from the AI provider.

---

## ADR-006: Prompt Caching on Q&A Endpoint

- source: `BLUEPRINT.md` § 3, `reference/PROMPTS.md`
- status: locked
- scope: AI cost optimization

### Decision

The Employee Q&A endpoint uses Anthropic prompt caching on the policy-library context block. Expected hit rate is 60–80%, projecting roughly 70% cost reduction on the endpoint. Cache directive: `cache_control: { type: "ephemeral" }`.

---

## ADR-007: Build Sequence — 8 Sequential Phases

- source: `BLUEPRINT.md` § 5
- status: locked
- scope: ASSEMBLY phase ordering

### Decision

ASSEMBLY proceeds in 8 sequential phases. Phase N+1 cannot start until Phase N compiles clean (`tsc --noEmit`).

1. Foundation — Next.js init, Clerk, Supabase, env vars
2. Data Layer — Drizzle schema, RLS, Clerk webhooks, basic CRUD
3. Admin UI — Layout, policy library, TipTap editor, publish flow
4. AI Layer — Draft, summary, employee Q&A
5. Employee Portal — My-policies, acknowledgment flow, notifications
6. Billing — Stripe products, checkout, webhooks, tier gating
7. Crons + Email — Railway worker, Resend templates, reminders
8. Validation — Dashboard charts, CSV export, acceptance tests

---

## ADR-008: Repository Layout (Single Next.js Monorepo)

- source: `BLUEPRINT.md` § 2
- status: locked
- scope: repo structure

### Decision

Single repository, Next.js App Router layout. Top-level: `app/`, `components/`, `lib/`, `middleware.ts`, `drizzle.config.ts`, `reference/`, plus root planning docs. Route groups: `(marketing)`, `(auth)`, `(admin)`, `(employee)`. API routes: `/app/api/webhooks/{stripe,clerk}`, `/app/api/ai/{draft,summary,qa,consistency}`, `/app/api/cron/reminders`. Library modules: `lib/db`, `lib/ai`, `lib/stripe`, `lib/email`.

---

## ADR-009: Middleware = Clerk Auth + Role Routing

- source: `BLUEPRINT.md` § 4
- status: locked
- scope: routing / auth boundary

### Decision

`middleware.ts` is the single auth + role-routing chokepoint. Public routes: `/`, `/pricing`, `/sign-in`, `/sign-up`. Webhook routes are exempt: `/api/webhooks/stripe`, `/api/webhooks/clerk`. `/(admin)/*` requires `publicMetadata.role === 'admin'`. `/(employee)/*` requires any authenticated user. `/api/cron/*` requires `CRON_SECRET` header match.

---

## ADR-010: Stack — Next.js 15 (App Router only)

- source: `reference/STACK.md`
- status: locked (precedence 1)
- scope: frontend + API framework

### Decision

Next.js 15 App Router is the single framework for both frontend and API. TypeScript is the default language. Create React App is rejected. A separate React + Node.js (or FastAPI) backend is rejected — App Router API routes + Server Actions replace it at MVP.

Rejected alternative: FastAPI backend (adds infra complexity with no benefit at this scale).

---

## ADR-011: Stack — Supabase (PostgreSQL + RLS)

- source: `reference/STACK.md`
- status: locked (precedence 1)
- scope: database + tenant isolation

### Decision

Supabase (PostgreSQL) is the data store. RLS is enabled on every tenant-scoped table. Auth fallback, Realtime, and Storage are available on the free tier. Drizzle ORM is preferred over Prisma (no codegen, TypeScript-first, SQL-transparent).

Rejected alternative: Neon (database only — Supabase gives more for same cost).

---

## ADR-012: Stack — Clerk for Auth (B2B Organizations)

- source: `reference/STACK.md`
- status: locked (precedence 1)
- scope: authentication / multi-tenant identity

### Decision

Clerk is the auth provider. Clerk pricing is ~$0.02/MAU after 10K free (Auth0 is ~$0.07/MAU after 7.5K free — 3.5× more expensive). Clerk has pre-built Organization management for multi-tenant B2B, SAML SSO, and native Next.js components.

Rejected alternative: Auth0 (3.5× MAU cost, worse DX for B2B; only wins for Fortune 500 HIPAA — not the target buyer).

---

## ADR-013: Stack — Stripe for Billing

- source: `reference/STACK.md`
- status: locked (precedence 1)
- scope: billing / subscriptions

### Decision

Stripe (Checkout + Webhooks + Customer Portal) is the billing provider. Stripe (2.9% + 0.7% billing) beats Paddle (5%+) for MRR above ~$3K/month. Paddle's Merchant of Record model is overkill at MVP.

Rejected alternative: Paddle / Lemon Squeezy (higher fees, less control over checkout UX).

---

## ADR-014: Stack — Vercel + Railway (Hybrid Hosting)

- source: `reference/STACK.md`
- status: locked (precedence 1)
- scope: hosting

### Decision

Vercel hosts the Next.js frontend + serverless API routes. Railway hosts a persistent worker container for cron jobs and bulk email — workloads that exceed serverless execution limits. The hybrid is presented as the 2026 standard for Next.js SaaS, at ~$5/month worker cost.

---

## ADR-015: Stack — Claude Sonnet 4.6 (primary) + Haiku 4.5 (summaries)

- source: `reference/STACK.md`, `BLUEPRINT.md` § 3
- status: locked (precedence 1)
- scope: AI model selection

### Decision

Claude Sonnet 4.6 ($3/$15 per M tokens) is the primary model — used for draft generation, employee Q&A, and consistency check. Claude Haiku 4.5 ($1/$5 per M tokens) is used for TL;DR summaries only. Opus 4.7 ($5/$25 per M tokens) is explicitly rejected as overkill for policy drafting. With ~70% prompt cache hit rate plus Batch API for async tasks, projected cost is under $300/month at 200 customers (< 1% of revenue).

Rejected alternative: Claude Opus 4.7.

---

## ADR-016: Stack — Resend + React Email

- source: `BLUEPRINT.md` § 2 (`lib/email/`), `CLAUDE.md` Stack table
- status: locked (precedence 1 by inheritance from STACK + BLUEPRINT scope)
- scope: transactional email

### Decision

Resend is the transactional email provider. React Email is the template framework. Email templates live in `lib/email/templates/`.

---

## ADR-017: Tier Plan Model — Starter / Growth / Business

- source: `reference/TIER-LIMITS.md` (constants), `reference/STACK.md` (rationale), `BLUEPRINT.md` § 5 (Phase 6)
- status: locked (tier definitions are FOUNDRY-committed)
- scope: pricing / feature gates

### Decision

Three plan tiers exist: `starter`, `growth`, `business`. `TIER_LIMITS` is the single source of truth in `lib/stripe/products.ts`. Type: `PlanTier = keyof typeof TIER_LIMITS`.

- starter: 25 users, 50 AI drafts/mo, no workflows/Slack/consistency/branding/SSO/API
- growth: 100 users, 200 AI drafts/mo, workflows + Slack + consistency
- business: 500 users, unlimited AI drafts, all features (branding, SSO, API)

Monthly/Annual prices and Stripe price IDs are defined in `reference/TIER-LIMITS.md`. Annual = 20% discount. All 6 products created in Stripe Dashboard before Phase 6.

---

## ADR-018: Append-Only Acknowledgment Audit Trail

- source: `reference/SCHEMA.md` (acknowledgments table comment), `CLAUDE.md` NEVER #5, `REQUIREMENTS.md` § 7
- status: locked
- scope: data integrity / compliance

### Decision

Acknowledgment records are append-only. They are NEVER deleted or modified — audit trail integrity is a hard invariant. When a policy is updated, prior acknowledgments remain in history; the policy then displays "requires re-acknowledgment" and a new acknowledgment row is captured against the new `policy_version_id`.

---

## ADR-019: Multi-Tenancy — org_id in Every Query + RLS as Last Line

- source: `CLAUDE.md` Multi-Tenancy Rules, `BLUEPRINT.md` § 3, `REQUIREMENTS.md` § 6, `reference/SCHEMA.md`
- status: locked
- scope: tenant isolation invariant

### Decision

Every database query must include `org_id` in its WHERE clause at the application layer. RLS in Supabase is the last line of defense, not the primary gate. The RLS pattern for all tenant-scoped tables is:

```sql
CREATE POLICY "org_isolation" ON [table]
  FOR ALL USING (org_id = auth.jwt()->>'org_id');
```

Cross-organization queries are forbidden under any code path.

---

## ADR-020: Stripe Webhook Handling — All 5 Subscription Events, Idempotent

- source: `CLAUDE.md` Stripe Rules, `BLUEPRINT.md` § 5 (Phase 6), `reference/API-SPEC.md`
- status: locked
- scope: billing reliability

### Decision

The Stripe webhook handler at `/api/webhooks/stripe` handles all five subscription lifecycle events, not just initial checkout:

- `checkout.session.completed` — initial subscription
- `invoice.paid` — renewal (missing this loses access after cycle 1)
- `invoice.payment_failed` — flag org for dunning
- `customer.subscription.deleted` — cancel org
- `customer.subscription.updated` — plan change

All handlers MUST be idempotent. Processed Stripe event IDs are stored in the `stripe_events` table and checked before processing. Webhook signatures are verified against the raw request body (`request.text()`).

---

## ADR-021: Batch API for Consistency Check

- source: `CLAUDE.md` AI API Rules, `BLUEPRINT.md` § 3 (implied), `reference/PROMPTS.md`, `reference/API-SPEC.md`
- status: locked
- scope: AI cost / async pattern

### Decision

The Consistency Check uses the Claude Batch API (async) for ~50% cost reduction. The endpoint returns a `batchId`; the client polls for the result. This is the only async AI operation; draft, summary, and Q&A remain synchronous.

---

## ADR-022: Node 22 Active LTS

- source: `package.json` `engines.node` + `BLUEPRINT.md` § Runtime
- status: locked (2026-05-16; supersedes Phase 1 D-01 Node 20 pin)
- scope: runtime version

### Decision

`engines.node` is `>=22.0.0 <23.0.0`. Node 22 became Active LTS in Oct 2024; Node 20 entered maintenance-LTS. The Phase-1 D-01 decision predated this cutover and pinned 20 as "the LTS at the time" — Node 22 satisfies the same spirit ("use Active LTS") with current security patches. Concretely required because Plan 01-04 chose `node --env-file=.env.local` for `pnpm check:db` and `pnpm verify:phase-1`; `--env-file` was experimental in Node 20.6 and only became stable in Node 22, so the previous `<21.0.0` upper bound silently made the project's own verify scripts incompatible with its declared runtime.

Vercel + Railway both support Node 22 in production. Full text mirrored in `.planning/PROJECT.md` short-form ADR-022.

---

## ADR-023: OrgContext + Per-Aggregate Repositories Enforce ADR-019

- source: derived from `/improve-codebase-architecture` grilling session (2026-05-17)
- status: locked (2026-05-17)
- scope: tenant isolation enforcement mechanism (operationalizes ADR-019)

### Decision

ADR-019 establishes the invariant "every DB query includes `org_id` in WHERE at the application layer." This ADR specifies the mechanism by which that invariant is enforced.

**`OrgContext`** is the typed carrier of the active organization identity:

```typescript
// lib/auth/context.ts
type OrgContext = {
  orgId: string;
  userId: string;
  role: 'admin' | 'reviewer' | 'employee';
};
async function getOrgContext(): Promise<OrgContext>;  // throws on missing Clerk session or org
```

It is constructed once per request (route handler entry) or per Server Action invocation, from the Clerk session, and threaded as the **first parameter** to every database call site.

**Per-aggregate repositories** under `lib/db/repositories/*.ts` are the only public path to tenant-scoped tables. One module per aggregate:

- `policies.ts`, `policy_versions.ts`, `policy_assignments.ts`
- `acknowledgments.ts`
- `users.ts`, `departments.ts`
- `ai_generations.ts`
- `notifications.ts`, `workflow_stages.ts`

Each repository:
1. Takes `ctx: OrgContext` as its first parameter on every method.
2. Internally applies `where(and(eq(table.orgId, ctx.orgId), <caller-supplied predicates>))` on every SELECT/UPDATE/DELETE.
3. Internally sets `orgId: ctx.orgId` on every INSERT.
4. Encodes domain operations as named verbs — `Policies.publish(ctx, id)`, `Acknowledgments.record(ctx, ...)` — not raw query-builder access.
5. Omits methods that would violate adjacent invariants. `Acknowledgments` exposes no `update` or `delete` (ADR-018 append-only). `Policies.create` does not accept `tldrSummary` (ADR-005 cache-at-publish-time only). The type system enforces the invariants, not discipline.

**Raw `db` export** in `lib/db/index.ts` is reserved for a finite, documented allow-list of legitimately-cross-org callers:

1. `app/api/webhooks/clerk/route.ts` — `organization.created` event creates the row that *defines* the org; no `OrgContext` exists yet.
2. `app/api/webhooks/stripe/route.ts` — looks up the org by `stripeCustomerId`; no Clerk session at the webhook entrypoint.
3. Railway worker cron jobs (Phase 7) — operate across all orgs (review-date scans, ack-reminder scans).
4. The test harness (Phase 8) — cross-tenant property tests.

A static check in CI enforces this: imports of `db` from `lib/db/index.ts` outside the four allow-listed paths fail the build. The allow-list lives in a single comment block at the top of `lib/db/index.ts` and is verified by `scripts/check-db-imports.ts`.

### Rationale

ADR-019 specifies the invariant but leaves the enforcement mechanism unspecified. Without one, every Phase-2-through-Phase-8 query call site (estimated ~30 sites) must remember and correctly re-implement the rule. The first forgotten WHERE clause is the cross-tenant leak — and the Validation-Gate item "Org A cannot access Org B data under any code path" becomes unverifiable in practice.

`OrgContext` + repositories make the invariant load-bearing on the type system: a repository method *cannot* be invoked without an `OrgContext`, and the `where(eq(table.orgId, ctx.orgId))` clause lives in exactly one place per aggregate. The cross-tenant test becomes finite (test the repository module + the four allow-listed raw-`db` callers) instead of a wish that depends on every developer remembering CLAUDE.md.

Rejected alternatives:

- **AsyncLocalStorage scoping** — eliminates threading but introduces non-explicit context propagation. Harder to reason about in nested Server Components; AI sessions reading a route handler don't see the org dependency at the call site. AI-navigability is an explicit codebase value.
- **Wrap Drizzle's fluent query builder** — preserves the full Drizzle API surface but requires either rebuilding the chain (brittle to Drizzle version bumps) or generating per-table wrappers (which collapses to the repository pattern with extra abstraction).
- **Trust RLS as the primary gate** — explicitly rejected by ADR-019, and made non-viable in practice by the connection topology (see open architecture question below).

### Open architecture question — RESOLVED by ADR-025 (2026-05-17)

The current connection topology — Drizzle + `postgres-js` via the Supabase Transaction pooler (D-06), connecting as the default `postgres` role — causes Supabase RLS to **bypass entirely** on app traffic. The `postgres` role is a superuser; superusers bypass RLS unconditionally. The `org_isolation USING (org_id = auth.jwt()->>'org_id')` policies in `reference/SCHEMA.md` are never evaluated for queries Drizzle issues. This would have made ADR-019's "RLS is the last line of defense" framing aspirational; the application layer (this ADR's repositories) would have been the only line of defense.

**Resolution:** ADR-025 chooses per-transaction role switching + JWT claim injection. User-facing traffic enters `withOrgScope`, which starts an explicit transaction, runs `SET LOCAL ROLE authenticated` (NOBYPASSRLS) and `set_config('request.jwt.claims', <json>, true)`, then dispatches to repository methods that operate on the scoped transaction. The four allow-listed cross-org callers (Clerk webhook, Stripe webhook, Railway cron, test harness) continue to use raw `db` at the connection-level `postgres` role, which retains BYPASSRLS. Both layers — repositories AND RLS — fire on user-facing traffic. ADR-019's "last line of defense" framing is operationally accurate. See ADR-025 below.

This ADR (023) makes the app layer rigorous; ADR-025 makes RLS the actual second line.

### Consequences

- Phase 2 plan-phase deliverable: `lib/db/repositories/*.ts` (9 files) + `lib/auth/context.ts` + `scripts/check-db-imports.ts` (CI gate).
- All Phase-3-through-Phase-8 query call sites use repositories. Ad-hoc analytics queries (Phase 8 dashboard, CSV export) either get new repository methods or go through a dedicated `lib/reports/` module that uses raw `db` but is in the allow-list with audit comments.
- The Validation-Gate cross-tenant test becomes a single property test against the repository layer + a static check on the import graph.
- This ADR does not change ADR-003 (Drizzle stays), ADR-009 (middleware shape stays), or ADR-018 / ADR-005 (append-only / cache-at-publish — repositories *enforce* these now instead of merely respecting them).

---

## ADR-024: Middleware Stays Procedural; Tier Gating Is App-Layer

- source: derived from `/improve-codebase-architecture` grilling session (2026-05-17)
- status: locked (2026-05-17)
- scope: middleware responsibility boundary (narrows ADR-009)

### Decision

`middleware.ts` enforces only **auth + role** across all 8 phases. Its complete responsibility surface:

1. Public routes — pass.
2. Webhook routes — pass (each verifies its own credentials in-route).
3. Cron routes — pass (each verifies `CRON_SECRET` in-route).
4. Authenticated routes — require any Clerk session; redirect to `/sign-in` otherwise.
5. Role-gated routes — require `publicMetadata.role` to match (404 on mismatch, per D-10).

The procedural if-else chain in `middleware.ts` is the deliberate implementation shape over a data-driven route-policy table. With ≤5 route kinds and one constraint dimension (role), the chain is more readable and easier to audit than a table abstraction.

**Tier gating lives in two places, neither of which is middleware:**

- **API routes** — return `403 { error: 'tier_limit_exceeded', tierLimit, currentUsage, upgradeUrl: '/pricing' }` per `reference/API-SPEC.md`.
- **Server Components / Server Actions** — call `requireTier(feature, org)` (a helper that throws `TierLimitError`), caught by a layout-level error boundary that renders the upgrade prompt or invokes `redirect('/upgrade')`.

The `requireTier` helper lives in `lib/stripe/limits.ts` (Phase 6) and reads `organizations.planTier` via the `Organizations` repository.

### Rationale

The Validation-Gate item explicitly specifies **403 + upgrade prompt**, not a 307 redirect. 403 is a request-response semantic, not a routing decision; encoding it in middleware would require middleware to import `TIER_LIMITS` and reach into `organizations.planTier` — both application concerns, not request-routing concerns.

The data-driven route-policy refactor (a list of `{matcher, kind, constraint?}` rows iterated by middleware) pays off when route kinds × constraint dimensions exceeds ~7–8 cells. This ADR locks middleware to 5 route kinds × 1 dimension; the procedural chain wins on readability for the lifetime of the codebase.

### Consequences

- Phase 5 (Employee Portal) adds the `(employee)` route group; `middleware.ts` gains one `isEmployeeRoute` matcher + one branch. No abstraction refactor.
- Phase 6 (Billing) introduces tier gating via `lib/stripe/limits.ts`. API routes and Server Components call it; `middleware.ts` is not modified.
- Architectural-review tools that re-suggest "make middleware data-driven" are forestalled: the procedural form is intentional under this ADR.

---

## ADR-025: RLS Enforced via Per-Transaction JWT Injection + `SET LOCAL ROLE`

- source: derived from `/improve-codebase-architecture` grilling session (2026-05-17); resolves ADR-023 § "Open architecture question"
- status: locked (2026-05-17)
- scope: operational mechanism for the ADR-019 "RLS as last line of defense" framing; defense-in-depth on tenant isolation

### Decision

The application uses Drizzle on a single connection pool that operates in two modes determined by call site, not by separate clients:

**Mode 1 — Service-role (raw `db`).** The pool in `lib/db/index.ts` connects via the Transaction pooler (D-06) as the Supabase `postgres` role (BYPASSRLS). Used only by the four ADR-023-allow-listed callers: Clerk webhook, Stripe webhook, Railway cron jobs, the Phase-8 test harness. RLS is intentionally bypassed; the allow-list + the `scripts/check-db-imports.ts` CI gate is the trust boundary.

**Mode 2 — Tenant-scoped (`withOrgScope`).** All user-facing repository calls go through:

```typescript
// lib/db/scoped.ts
export type OrgScope = OrgContext & { tx: PgTransaction };

export async function withOrgScope<T>(
  ctx: OrgContext,
  fn: (scope: OrgScope) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    const claims = JSON.stringify({
      sub: ctx.userId,
      org_id: ctx.orgId,
      role: ctx.role,
    });
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
    return fn({ ...ctx, tx });
  });
}
```

Two transaction-scoped statements fire at the top of every user-facing transaction:

1. `SET LOCAL ROLE authenticated` — switches from the connection-level `postgres` role (BYPASSRLS) to Supabase's built-in `authenticated` role (NOBYPASSRLS). Reverts on COMMIT/ROLLBACK; the next transaction on the same pgbouncer-routed backend starts fresh at `postgres`.
2. `SELECT set_config('request.jwt.claims', <claims-json>, true)` — sets the session variable that `auth.jwt()` reads in RLS policies. The third arg `true` makes it transaction-local.

After these run, the RLS policy `USING (org_id = auth.jwt()->>'org_id')` in `reference/SCHEMA.md` evaluates with the real `ctx.orgId`. Both layers fire on every user-facing query:

- **Application layer** (ADR-023): `where(eq(table.orgId, scope.orgId))` from the repository method.
- **Database layer** (this ADR): RLS policy filters server-side.

A forgotten WHERE clause in a future repository method is blocked by RLS. A bug in an RLS policy is caught by the application layer. Defense-in-depth is real.

### Amendment to ADR-023 (repository signature)

ADR-023 specified that repository methods take `OrgContext` as their first parameter. This ADR narrows that: repository methods take **`OrgScope`** (which extends `OrgContext` with the active transaction) as their first parameter. The transaction is supplied by `withOrgScope` and threaded through; repositories never open their own transactions.

```typescript
// lib/db/repositories/policies.ts
export const Policies = {
  listPublished: (s: OrgScope) =>
    s.tx.query.policies.findMany({
      where: (p, { and, eq }) => and(eq(p.orgId, s.orgId), eq(p.status, 'published')),
    }),
  // ...
};

// Call site (one transaction per request, multiple repository calls share it):
await withOrgScope(ctx, async (s) => {
  const policy = await Policies.findById(s, policyId);
  if (!policy) return notFound();
  await Acknowledgments.record(s, { policyId, versionId: policy.currentVersion });
});
```

### Rationale

The three paths surfaced in ADR-023 § "Open architecture question":

1. **Per-transaction JWT injection** (this ADR) — chosen.
2. **Dual-role split** (two connection pools — one `postgres` for service-role, one `authenticated`+JWT for user reads) — **rejected as redundant**. The ADR-023 allow-list already routes service-role traffic through raw `db` (BYPASSRLS) on the single pool. Adding a second pool buys nothing because mode switching happens per-transaction on the existing pool via `SET LOCAL ROLE`. A second pool would double connection-slot consumption with no isolation benefit.
3. **Accept the gap** (RLS bypassed; app layer sole) — **rejected**. PolicyPilot targets the SMB compliance buyer; "tenant isolation enforced at both application and database layers" is a load-bearing claim in security questionnaires and the audit-readiness story. The ~1ms per-transaction overhead (two SET LOCAL statements amortized across all repository calls inside one `withOrgScope`) is negligible at PolicyPilot's load profile.

The implementation pattern is the published Supabase + Drizzle interop pattern; we are following the trodden path, not innovating.

A fourth alternative considered and rejected: switching the **connection-level** role from `postgres` to `authenticated` (no per-transaction switch). Rejected because (a) drizzle-kit migrations need BYPASSRLS to ALTER tables, (b) the four allow-listed cross-org callers need BYPASSRLS, and (c) the per-transaction switch on a single pool achieves the same isolation with no operational complexity.

### Consequences

- **Phase 2 plan-phase deliverables (amends ADR-023 to include these):**
  - `lib/db/scoped.ts` — `OrgScope` type + `withOrgScope` wrapper.
  - `lib/auth/context.ts` — `getOrgContext()` reads the Clerk session, throws on missing org.
  - `lib/db/repositories/*.ts` — 9 modules; every method takes `OrgScope` as its first parameter; none open transactions.
  - `scripts/check-db-imports.ts` — CI gate locks raw `db` imports to the ADR-023 four-entry allow-list.
  - Phase-2 migration applies all RLS policies from `reference/SCHEMA.md` AND grants `SELECT, INSERT, UPDATE, DELETE` on all tenant-scoped tables to the `authenticated` role.
  - Phase-2 verify script (`scripts/check-rls.ts`): connect as `authenticated`, attempt cross-org SELECT, assert it returns zero rows. Runs in `verify:phase-2`.

- **Migrations** stay on the direct DB URL with the `postgres` role per D-06. Migrations need BYPASSRLS to alter tables; this remains intentional.

- **Performance:** one user-facing request pays two extra round-trips (the SET LOCAL statements) at the start of its transaction, then amortizes across N repository calls inside the same `withOrgScope`. Recommendation in code style: batch repository calls per request into a single `withOrgScope`, not multiple.

- **`OrgContext` vs `OrgScope`:** application code (route handlers, Server Actions) constructs `OrgContext` once via `getOrgContext()` and immediately wraps it in `withOrgScope` to obtain an `OrgScope`. Repositories never see bare `OrgContext`.

- **ADR-019's "last line of defense" framing** is now operationally accurate. RLS is the actual second line of defense, not aspirational. No amendment to ADR-019 needed.

- **No change to:** ADR-003 (Drizzle), ADR-009 / ADR-024 (middleware), ADR-011 (Supabase), ADR-018 (append-only), ADR-005 (cache-at-publish), ADR-023 allow-list. Only the ADR-023 repository signature is amended (from `OrgContext` first-param to `OrgScope` first-param).

---

## ADR-026: Typed Error Classes for `lib/auth/`

- source: pr-review-toolkit type-design-analyzer FLAG against PR #3 (2026-05-20); deferred from PR #3 per CLAUDE.md ASK FIRST rule #2; closed in this fast-follow PR
- status: locked (2026-05-20)
- scope: error-handling discipline in `lib/auth/` only; establishes a pattern other layers may adopt later

### Decision

Every `throw` inside `lib/auth/` uses a typed error class declared in `lib/auth/errors.ts`. The v0 substring-matcher in `lib/auth/bootstrap-errors.ts` is removed entirely (no transition state); consumer pages narrow via `err instanceof Class`.

Class hierarchy (`lib/auth/errors.ts`):

```typescript
// Stable wire-format discriminant for the BootstrapError hierarchy.
// Pre-merge type-design review pinned this as a literal union (not
// `string`) so a typo at a concrete-subclass initializer is a
// compile-time error, not a silent log-router miss. Adding a new
// BootstrapError subclass requires adding the literal here first.
export type BootstrapErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NO_ACTIVE_ORGANIZATION'
  | 'INVALID_ROLE'
  | 'ORG_NOT_PROVISIONED'
  | 'USER_NOT_PROVISIONED';

abstract class BootstrapError extends Error {
  abstract readonly code: BootstrapErrorCode;
}

class NotAuthenticatedError extends BootstrapError {
  readonly code = 'NOT_AUTHENTICATED';
  constructor() {
    super('Not authenticated: no Clerk session');
    this.name = 'NotAuthenticatedError';
  }
}

class NoActiveOrganizationError extends BootstrapError {
  readonly code = 'NO_ACTIVE_ORGANIZATION';
  constructor() {
    super('No active organization');
    this.name = 'NoActiveOrganizationError';
  }
}

class InvalidRoleError extends BootstrapError {
  readonly code = 'INVALID_ROLE';
  constructor(public readonly value: unknown) {
    super(`Invalid role on session claims: ${String(value)}`);
    this.name = 'InvalidRoleError';
  }
}

abstract class ProvisioningRaceError extends BootstrapError {}

class OrgNotProvisionedError extends ProvisioningRaceError {
  readonly code = 'ORG_NOT_PROVISIONED';
  constructor(public readonly maskedClerkOrgId: string) {
    super(
      `Org not provisioned in DB for ${maskedClerkOrgId} — Clerk organization.created webhook may not have fired or DB-Clerk drift`,
    );
    this.name = 'OrgNotProvisionedError';
  }
}

class UserNotProvisionedError extends ProvisioningRaceError {
  readonly code = 'USER_NOT_PROVISIONED';
  constructor(public readonly maskedClerkUserId: string) {
    super(
      `User not provisioned in DB for ${maskedClerkUserId} — Clerk user.created webhook may not have fired or DB-Clerk drift`,
    );
    this.name = 'UserNotProvisionedError';
  }
}

// Intentionally NOT a BootstrapError — infrastructure failure must rethrow
// past both bootstrap consumers. See Rationale § "Why ClerkAuthFailedError
// is not a BootstrapError" below.
class ClerkAuthFailedError extends Error {
  readonly code = 'CLERK_AUTH_FAILED';
  constructor(public readonly cause: unknown) {
    const detail =
      cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Clerk auth() failed: ${detail}`);
    this.name = 'ClerkAuthFailedError';
  }
}
```

Throw-site mapping in `lib/auth/context.ts` (keyed by stable anchors so the mapping survives line-number drift from future edits — e.g. the CR docstring autofix that shifted these by 6-8 lines):

| Throw site (anchor) | v0 message | new class |
|---------------------|-----------|-----------|
| `asRole(value)` (Role validation) | `Invalid role on session claims: ${value}` | `InvalidRoleError(value)` |
| `auth()` catch | `Clerk auth() failed: ${detail}` | `ClerkAuthFailedError(cause)` |
| `!userId` guard | `Not authenticated: no Clerk session` | `NotAuthenticatedError()` |
| `!orgId` guard | `No active organization` | `NoActiveOrganizationError()` |
| `!orgRow` guard (org lookup empty) | `Org not provisioned in DB for ${masked}...` | `OrgNotProvisionedError(masked)` |
| `!userRow` guard (user lookup empty) | `User not provisioned in DB for ${masked}...` | `UserNotProvisionedError(masked)` |

`super(message)` preserves the existing message strings verbatim so log-greps for "No active organization" continue to match `err.message`. Future structured-logging swaps can switch to `err.code` (stable across translations and message refactors).

Matcher refactor in `lib/auth/bootstrap-errors.ts`:

```typescript
export function matchesErrorClass(
  err: unknown,
  classes: readonly (abstract new (...args: never[]) => Error)[],
): boolean {
  return classes.some((C) => err instanceof C);
}
```

The v0 `matchesErrorMessage(err, needles: readonly string[])` export is removed; no transition state.

Consumer pages keep their documented asymmetric allow-lists, now typed as class references rather than string literals:

```typescript
// app/(admin)/dashboard/page.tsx — race-recovery (2s meta-refresh UX)
const ONBOARDING_RACE_ERRORS = [
  NoActiveOrganizationError,
  ProvisioningRaceError,  // catches both Org + User subclasses via base
  InvalidRoleError,
] as const;

// app/(auth)/post-sign-in/page.tsx — hard-fail (rethrow on DB drift)
const BOOTSTRAP_ERRORS = [
  NotAuthenticatedError,
  InvalidRoleError,
  NoActiveOrganizationError,
] as const;
// INTENTIONALLY excludes ProvisioningRaceError — trampoline treats DB
// drift as a real outage (hard-fail), dashboard treats it as a race window
// (soft retry). Divergence by design — see consumer file comment blocks.
```

Verify gate (`scripts/check-error-discipline.ts`): a ts-morph script scans `lib/auth/**.ts` (excluding `errors.ts` itself and test files) and fails CI if any `throw new Error(...)` syntax survives. Wired into the `verify:phase-3` chain via a new `pnpm check:error-discipline` script. The gate is intentionally scoped to `lib/auth/` only; other layers may have their own typed-error ADRs later.

Naming conventions:
- Class names: PascalCase, `*Error` suffix.
- `this.name`: set explicitly to the class name (for log readability and serialization).
- `code`: SCREAMING_SNAKE_CASE string constant, declared `readonly`, abstract on `BootstrapError` and concrete on subclasses.
- Extra data: captured as `public readonly` constructor parameters (matches the `IllegalTransitionError` precedent in `lib/policies/state-machine.ts:33-40`).

### Rationale

**Why typed classes over the v0 substring matcher.** The matcher was a runtime contract pretending to be a type contract. If `context.ts` reflows a throw-string — say "No active organization" becomes "No active organization (please sign in again)", or all messages gain an "Auth error: " prefix — the consumer allow-lists silently rot. The user sees a raw 500 where the dashboard meant to render "Setting up your organization..." or where the trampoline meant to redirect to `/onboarding/create-org`. The 8 divergence-lock tests in `bootstrap-errors.test.ts` mitigate this for specific reflow shapes (they pin specific message snippets), but a uniform reflow defeats them all simultaneously. `instanceof` is the type-level discriminator that survives any message edit.

**Why `ProvisioningRaceError` is an abstract base class, not just two flat subclasses of `BootstrapError`.** Dashboard catches "Clerk-webhook-hasn't-landed-yet" as a single conceptual condition (the 2s meta-refresh handles both org-side and user-side races identically). With a marker base, the dashboard allow-list reads `[NoActiveOrganizationError, ProvisioningRaceError, InvalidRoleError]` — three concepts. Without the base, the same allow-list reads `[NoActiveOrganizationError, OrgNotProvisionedError, UserNotProvisionedError, InvalidRoleError]` — four concepts that the reader has to mentally re-group. The trampoline's divergence ("I do NOT want to catch the race subclasses") is also expressed more cleanly: the absence of `ProvisioningRaceError` from `BOOTSTRAP_ERRORS` is a single visible omission, not two.

**Why `ClerkAuthFailedError` is NOT a `BootstrapError`.** Clerk's `auth()` call itself failing is an infrastructure signal — Clerk outage, network timeout, malformed Clerk response. Treating it as a bootstrap condition would mask real outages as onboarding race-windows (the dashboard would show "Setting up your organization..." indefinitely while Clerk is actually down). Both consumers MUST rethrow it; that's enforced by `ClerkAuthFailedError` not extending `BootstrapError` so neither allow-list can include it. A test in `bootstrap-errors.test.ts` asserts `ClerkAuthFailedError` does NOT match either consumer's allow-list — if someone later "DRYs the hierarchy" by making `ClerkAuthFailedError extends BootstrapError`, that test fails immediately.

**Why preserve message strings verbatim at `super(message)`.** Operator log-greps (and any Sentry filters that may be wired up later) currently key on the message text. A refactor that drops the messages would invalidate that observability surface silently. The `code` field provides the path forward: structured logs can switch from message-grep to `err.code` lookup at their own pace, and message-text can drift independently once the migration is done.

**Why the verify gate scopes to `lib/auth/` only.** Other layers — Stripe webhook (Phase 6), Claude API errors (Phase 4), repository invariants (already partially typed via `IllegalTransitionError`) — have richer error surfaces that warrant their own typed-error decisions. Locking the convention project-wide right now would either force premature refactors or create dead-letter clauses in the gate. Scoping narrowly keeps the gate enforceable and lets the convention spread organically as each layer earns its ADR.

### Rejected alternatives

- **Keep the substring matcher; add typed errors only at throw sites.** Loses the type-level discriminator at the consume site — the matcher remains a runtime contract pretending to be a type contract.
- **Single `AuthError` class with a discriminant `kind: 'no-active-org' | 'invalid-role' | ...` field.** Discriminated unions of class instances are more cumbersome to narrow than separate classes (`err instanceof AuthError && err.kind === 'no-active-org'` vs `err instanceof NoActiveOrganizationError`). Standard TS guidance prefers separate classes for distinct conditions; the codebase already has this pattern via `IllegalTransitionError`.
- **Discriminated union of plain objects, no classes.** Drops the `instanceof` ergonomic; consumer code becomes `if (isAuthError(err) && err.kind === '...')` with no automatic `name` property for log output. Classes earn their weight here.
- **Bind the typed-error convention project-wide in this ADR.** Stripe webhook (Phase 6), Claude API integration (Phase 4), repository violations all have richer error surfaces and warrant their own typed-error decisions when they ship. Pre-committing the project to a convention before its application is understood at each layer creates retroactive cleanup work and dead-letter clauses in the verify gate.
- **Use ES2022 `Error.cause` via the 2-arg `super(message, { cause })` constructor.** tsconfig target is ES2017 — `Error.cause` works at runtime (Node 22) but the 2-arg constructor signature isn't guaranteed at the lower target. Storing the cause as a `public readonly cause: unknown` field is equivalent in diagnostic value with no target-version dependency. The `IllegalTransitionError` precedent doesn't capture cause; this ADR extends that pattern only where the diagnostic value is real (the `ClerkAuthFailedError` case).

### Consequences

- New file: `lib/auth/errors.ts` (~100 LOC including JSDoc).
- `lib/auth/context.ts` throws refactored at 6 sites (no behavior change in resolved cases; message strings preserved at `super(message)`).
- `lib/auth/bootstrap-errors.ts` exports `matchesErrorClass`; `matchesErrorMessage` removed entirely.
- `lib/auth/bootstrap-errors.test.ts` — all 5 divergence-lock test names + intents preserved; assertion shapes change from `new Error('string')` + `string[]` allow-lists to `new ConcreteErrorClass()` + class-constructor allow-lists. Three additional tests are added to lock the `ClerkAuthFailedError` rethrow contract (asserting it does NOT match either consumer's allow-list).
- Consumer pages (`app/(admin)/dashboard/page.tsx` + `app/(auth)/post-sign-in/page.tsx`) update their allow-list constants from `string[]` to `Class[]` and call `matchesErrorClass`. The "Sourced verbatim from lib/auth/context.ts" comment blocks are simplified — the type system now sources the truth, no line-number tracking required.
- New file: `scripts/check-error-discipline.ts` (~50 LOC) — ts-morph AST scan, fails on any `throw new Error(...)` syntax in `lib/auth/**.ts`. Uses the existing `ts-morph: 28.0.0` devDependency.
- New `pnpm check:error-discipline` script; wired into the `verify:phase-3` chain.
- `scripts/check-artifacts.ts` extended to assert the new script declaration in `package.json` (mirrors how `verify:phase-2` was registered there).
- Future structured-logging swap (Phase 7+) can read `err.code` as the stable log-discriminant instead of substring-matching messages.
- No change to ADR-023 (repository pattern), ADR-024 (middleware shape), or ADR-025 (RLS mechanism). This ADR refines the error-handling layer on top of those.

Full text mirrored in `.planning/PROJECT.md` short-form ADR-026.

---

## ADR-027: User-Lookup Scoping by `org_id` in `getOrgContext`

- source: CodeRabbit outside-diff finding on PR #5 (`lib/auth/context.ts:126-145` — "user lookup currently only filtered by clerkUserId which can cross tenant boundaries"); deferred from PR #5 per CLAUDE.md `ASK FIRST` rule #4 (security-relevant decision needs explicit ratification); closed in this fast-follow PR
- status: locked (2026-05-20)
- scope: the `getOrgContext()` lookup pattern in `lib/auth/context.ts`; refines the application-layer state-consistency invariant on top of ADR-019's "every query scoped by org_id" + ADR-025's "RLS as the second line of defense"

### Decision

The user lookup inside `getOrgContext()` is scoped by **both** `clerk_user_id` AND `org_id` matching the org resolved from the session's `clerkOrgId`. The previous parallel `Promise.all` over the two lookups becomes a sequential `org → user` flow because the user query needs `orgRow.id` as a predicate input:

```typescript
// Before (PR #5 / v1): parallel, user filtered only by clerk_user_id
const [orgRows, userRows] = await Promise.all([
  db.select({ id: organizations.id })
    .from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1),
  db.select({ id: users.id })
    .from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1),
]);
const orgRow = orgRows[0];
if (!orgRow) throw new OrgNotProvisionedError(maskClerkOrgId(clerkOrgId));
const userRow = userRows[0];
if (!userRow) throw new UserNotProvisionedError(maskClerkId(clerkUserId));

// After (ADR-027 / v2): sequential, user filtered by both clerk_user_id AND org_id
const orgRows = await db
  .select({ id: organizations.id }).from(organizations)
  .where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1);
const orgRow = orgRows[0];
if (!orgRow) throw new OrgNotProvisionedError(maskClerkOrgId(clerkOrgId));

const userRows = await db
  .select({ id: users.id }).from(users)
  .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgRow.id)))
  .limit(1);
const userRow = userRows[0];
if (!userRow) throw new UserNotProvisionedError(maskClerkId(clerkUserId));
```

If the user's DB row's `org_id` doesn't match the session's resolved `orgRow.id`, the user lookup returns no rows and `getOrgContext` throws `UserNotProvisionedError` — the typed class from ADR-026, **same class** as "no user row at all." From the consumer's perspective (`app/(admin)/dashboard/page.tsx` race-recovery + `app/(auth)/post-sign-in/page.tsx` hard-fail), the new mismatch case is indistinguishable from the existing "user not provisioned" case; both mean "bootstrap context cannot be completed." That symmetry is intentional — the asymmetric divergence locked by ADR-026 (`ProvisioningRaceError` caught by dashboard, rethrown by trampoline) extends cleanly to this new throw path because `UserNotProvisionedError` is a subclass of `ProvisioningRaceError`.

Test coverage: `scripts/check-auth-context.ts` (existing integration test against the live TEST DB) gains two new control assertions — a **positive** lock (`SELECT id FROM users WHERE clerk_user_id = $1 AND org_id = $2` returns the user row when both predicates match) and a **negative** lock (same query returns empty when `org_id` is from a different org). The integration test runs as part of `verify:phase-3`. A `scripts/check-artifacts.ts` assertion pins the `and(eq(users.clerkUserId, ...)..., eq(users.orgId, ...))` substring in `lib/auth/context.ts` so a future refactor that drops the `eq(users.orgId, ...)` predicate fails CI immediately.

### Rationale

**What boundary this enforces — and what it doesn't.** The narrowing enforces **state consistency** between the session's claimed org and the user's DB record's org. The boundary it does NOT enforce — and never did at this layer — is cross-tenant data access. RLS in `withOrgScope` (ADR-025) is the binding tenant boundary for that, keyed off `session.orgId` via JWT injection, not off `users.org_id`. So even without ADR-027's narrowing, a user could NOT read another tenant's data through the application layer — RLS would block it. The CodeRabbit finding's "can cross tenant boundaries" framing was overstated; the genuine concern is state inconsistency, which has its own harm surface.

**Why state inconsistency matters anyway.** Without the narrowing, a multi-org Clerk user whose `users.org_id ≠ session.orgId` still got an `OrgContext` returned. RLS scoped queries to `session.orgId` correctly. BUT the returned `OrgContext.userId` was for a user whose own DB record claimed they were in a different org. Downstream code that later reads `users.org_id` for attribution joins (the future-state UX surface; not currently in `policies.ts`/`policy_versions.ts`/`workflow_stages.ts` but anticipated for Phase 5+ acknowledgment views) would silently return empty rows for that user — a subtle UX failure pretending to be a successful request. Forward-looking attribution joins (`JOIN users ON acks.userId = users.id AND users.org_id = scope.orgId`) need the invariant `users.org_id = scope.orgId` to hold for the requesting user; ADR-027 makes that invariant load-bearing at the entry point.

**Why the cost is acceptable.** Sequential vs parallel adds one DB round-trip per `getOrgContext()` call (the user query waits for the org query's result). `getOrgContext` is a per-request boundary, not a hot loop — the typical request makes one call. The added latency is on the order of single-digit milliseconds against the same connection pool. ADR-025 already pays two extra round-trips per request transaction (`SET LOCAL ROLE` + `set_config`) for RLS-binding; this PR adds one more to the bootstrap path. Acceptable trade for the invariant gain.

**Why throw `UserNotProvisionedError` rather than a new dedicated class.** From the consumer's perspective, both "no user row at all" and "user row exists but in a different org" mean the same thing: bootstrap context cannot be completed; the dashboard renders the race-recovery panel (2s meta-refresh), the trampoline rethrows as a 500. The new class would be a distinction without a behavioral difference. Adding it would also require updating both consumer allow-lists, the divergence-lock tests, and the JSDoc — for no consumer-visible benefit. If structured logging (Phase 7+) ever needs to distinguish the two cases for triage, the `code` field on the existing class can be supplemented or split then.

**Why the trampoline rethrows the new mismatch case.** `UserNotProvisionedError` is a subclass of `ProvisioningRaceError`, and the trampoline (`app/(auth)/post-sign-in/page.tsx`) intentionally excludes `ProvisioningRaceError` from `BOOTSTRAP_ERRORS` per ADR-026's documented asymmetry (trampoline treats Clerk-DB drift as hard-fail; dashboard treats it as race-with-meta-refresh). The new mismatch case slots cleanly into that taxonomy: the trampoline rethrows because a multi-org user landing on `/post-sign-in` with mismatched `users.org_id` is genuinely broken state from the trampoline's perspective — it should fall through to a 500 and force the user to investigate. The dashboard catches and meta-refreshes, which (correctly) doesn't recover the mismatch but at least doesn't crash with a raw error page.

### Rejected alternatives

- **Skip the change; accept the silent attribution-failure UX.** Defense-in-depth value lost. The downstream-join UX bug isn't a current production issue because `policies`/`policy_versions`/`workflow_stages` don't yet do attribution joins (Phase 5+ acknowledgment views will), but the lookup-scoping is cheap insurance that compounds in value as the UX surface grows.

- **Fold the new mismatch case into `BOOTSTRAP_ERRORS` (the trampoline allow-list).** Breaks ADR-026's intentional asymmetry. The trampoline's hard-fail-on-DB-drift behavior exists because a user landing on `/post-sign-in` with DB drift is genuinely a broken state worth surfacing as a 500, not masking with a redirect to onboarding.

- **Inject `session.orgId` into a custom JWT claim and check it against `users.org_id` inline (no DB query needed).** Over-engineered for the marginal latency saving. Custom JWT claims require changes to Clerk's session-template configuration (per ADR-024, middleware stays procedural and doesn't read tier-like or org-membership-like claims), and the integration test surface would become awkward (requires generating signed JWTs in the test harness). The sequential DB query is simpler.

- **Add `users.org_id` to the OrgScope JWT claim already injected by `withOrgScope`, so RLS itself enforces the user-side org match.** Reverses cause and effect — RLS keys off `session.orgId` (per ADR-025), and the user's own `users.org_id` isn't a tenant-isolation predicate; it's the user's home-org attribution. Conflating the two would require migrating ADR-025's JWT-injection contract for no benefit (RLS already does its job; this ADR addresses state consistency at the application layer).

- **Add full multi-org Clerk support by changing `users.clerk_user_id`'s uniqueness from globally-unique to composite-unique on `(clerk_user_id, org_id)`, plus a separate `user_organization_memberships` join table.** Big-bang schema change with cascading effects on every users-related query in the codebase and every webhook handler. Out of scope; deferred to its own ADR if multi-org product requirements emerge. See "Open question" below.

### Open question — full multi-org Clerk support

Clerk allows a user to be a member of multiple organizations at the auth layer. PolicyPilot's data model implicitly assumes one user = one org because `users.clerk_user_id` is globally `.unique()` (see `lib/db/schema.ts:184`) and `users.org_id` is a single FK column. The webhook handler at `app/api/webhooks/clerk/route.ts:296-303` (`organizationMembership.created`) **unconditionally overwrites** `users.org_id` on every membership-created event — no check for "does the user already have an org_id." So:

| Clerk state | PolicyPilot `users.org_id` |
|---|---|
| User in org A only | A |
| User joins org B (now in both A and B) | B (overwritten by the later webhook) |
| User leaves org A (still in B) | B (no change; `organizationMembership.deleted` is log-only per D-03c) |
| User active session switched to A | session.orgId = A, users.org_id = B → **mismatch** |

In that last row's state, ADR-027's lookup-scoping throws `UserNotProvisionedError`. The dashboard race-recovery panel renders, but the meta-refresh doesn't actually recover anything — the user is structurally locked out of org A from PolicyPilot's perspective until either the data model changes or they switch back to org B. The trampoline (`/post-sign-in`) returns 500.

This is a **product behavior, not a bug**, given the current data model. PolicyPilot today is a one-user-one-org product. ADR-027 makes that constraint visible (locked-out users get a specific error class) rather than silent (drifted state with empty attribution joins). If multi-org Clerk membership becomes a product requirement, the resolution will be a separate ADR with one of:

- Composite unique `(clerk_user_id, org_id)` on `users` instead of globally unique on `clerk_user_id`, with per-org-membership user rows.
- A separate `user_organization_memberships` join table; `users` becomes one-row-per-Clerk-user, attribution joins go through the membership table scoped by `scope.orgId`.
- Something else that emerges from product design.

Resolution is deferred — not blocking ADR-027's narrower decision.

### Consequences

- `lib/auth/context.ts` adds `and` to the drizzle-orm import + rewrites the parallel `Promise.all` block as a sequential `org → user` flow. The user query gains the `eq(users.orgId, orgRow.id)` predicate.
- `scripts/check-auth-context.ts` gains two new assertions: positive lock (same query, matching `org_id`, returns the user row) + negative lock (mismatched `org_id`, returns empty). Both run against the live TEST DB via the existing `verify:phase-3` integration-test harness.
- `scripts/check-artifacts.ts` gains an assertion that the `eq(users.orgId,` substring is present in `lib/auth/context.ts`, so a future refactor that drops the predicate fails CI before reaching review.
- Per-request `getOrgContext()` cost: +1 DB round-trip (sequential vs parallel). Single-digit-millisecond impact in the typical case.
- Multi-org Clerk users acting in non-most-recently-joined org get `UserNotProvisionedError` → dashboard race-recovery (2s meta-refresh; doesn't actually recover) or trampoline 500. Documented as a known product limitation in this ADR's "Open question" section.
- Sets up the testing pattern for Phase 5+: when attribution joins land in repositories (e.g. acknowledgment views), the joins can safely assume `users.org_id = scope.orgId` for the requesting user because this ADR has enforced that invariant upstream.
- No change to ADR-019 (RLS still the second line), ADR-023 (repos still take `OrgScope`), ADR-024 (middleware unchanged), ADR-025 (JWT injection unchanged), ADR-026 (uses `UserNotProvisionedError` class from there).

Full text mirrored in `.planning/PROJECT.md` short-form ADR-027.

