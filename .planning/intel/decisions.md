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
