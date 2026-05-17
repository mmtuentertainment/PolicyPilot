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

The following 22 decisions are LOCKED (precedence 0–1 ADRs from `BLUEPRINT.md` and `reference/STACK.md`). They cannot be changed without explicit operator approval and a new ADR. Full text lives in `.planning/intel/decisions.md` — short form preserved here for downstream consumers.

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
Single Next.js monorepo. Route groups: `(marketing)`, `(auth)`, `(admin)`, `(employee)`. API routes: `/app/api/webhooks/{stripe,clerk}`, `/app/api/ai/{draft,summary,qa,consistency}`, `/app/api/cron/reminders`. Library modules: `lib/db`, `lib/ai`, `lib/stripe`, `lib/email`.

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
