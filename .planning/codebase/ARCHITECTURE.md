---
last_mapped_commit: 6f17412a2df1218e9a618d7b58df00fe1e595a7a
last_mapped_date: 2026-06-04
scan_mode: fast (tech+arch)
---

# Architecture

**Analysis Date:** 2026-06-04

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Next.js 15 App Router (Vercel)                       │
│                                                                              │
│  (marketing)/   (auth)/   (onboarding)/   (admin)/   (employee)/            │
│  Public pages   Clerk UI  Create org      Admin UI   Employee UI            │
│  `app/(marketing)` `app/(auth)` `app/(onboarding)` `app/(admin)` `app/(employee)` │
└──────────┬───────────────────────────────────────────────────────┬──────────┘
           │  Server Actions / API Route Handlers              │
           ▼                                                   ▼
┌──────────────────────────────┐    ┌─────────────────────────────────────────┐
│  app/api/                    │    │  lib/                                   │
│  ├── ai/draft                │    │  ├── auth/context.ts  (getOrgContext)   │
│  ├── ai/summary              │    │  ├── auth/require-admin.ts             │
│  ├── ai/qa                   │    │  ├── db/scoped.ts     (withOrgScope)   │
│  ├── ai/consistency/[batchId]│    │  ├── db/repositories/                  │
│  ├── webhooks/clerk          │    │  ├── policies/state-machine.ts         │
│  └── webhooks/stripe         │    │  ├── stripe/products.ts (tier gating)  │
└──────────┬───────────────────┘    │  ├── stripe/client.ts                  │
           │                        │  ├── stripe/catalog.ts (lazy)          │
           ▼                        │  ├── stripe/normalize.ts               │
┌──────────────────────────────────────────────────────────────────────────────┐
│  Data Layer                                                                  │
│  Drizzle ORM  →  Supabase PostgreSQL (port 6543, Transaction pooler)        │
│  14 tables (12 tenant-scoped + stripe_events + clerk_events)                │
│  RLS: USING (org_id = auth.jwt()->>'org_id')                                │
└──────────────────────────────────────────────────────────────────────────────┘
           │                                          │
           ▼                                          ▼
┌─────────────────────┐                   ┌───────────────────────────────────┐
│  Anthropic API      │                   │  Stripe API                       │
│  claude-sonnet-4-6  │                   │  Checkout / Portal / Webhooks     │
│  claude-haiku-4-5   │                   │  Subscription state written to    │
│  Prompt caching     │                   │  organizations table via webhook  │
└─────────────────────┘                   └───────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `ClerkProvider` | Root auth context, session tokens | `app/layout.tsx` |
| `middleware.ts` | Auth chokepoint — public/webhook/admin/employee routing, role gate | `middleware.ts` |
| `getOrgContext()` | Resolve session → internal `orgId`/`userId` UUIDs + role | `lib/auth/context.ts` |
| `withOrgScope()` | Open Drizzle transaction, inject JWT claims for RLS | `lib/db/scoped.ts` |
| `requireAdmin()` | Admin page gate — calls `notFound()` (404) on non-admin | `lib/auth/require-admin.ts` |
| `requireAdminFromCtx()` | Admin API gate — throws `ForbiddenError` (403) on non-admin | `lib/auth/require-admin.ts` |
| Repositories | Tenant-scoped DB reads/writes using `OrgScope.tx` | `lib/db/repositories/` |
| Policy state machine | Pure DAG: `draft → under_review → published → archived` | `lib/policies/state-machine.ts` |
| Policy transitions | Server-only orchestrators wrapping state machine + DB writes | `lib/policies/transitions.ts` |
| `requireTierLimit()` | Throw-based tier/feature gate before Anthropic calls | `lib/stripe/products.ts` |
| `normalizeSubscription()` | Map Stripe subscription → billing kind + planTier | `lib/stripe/normalize.ts` |
| Stripe webhook | Signature verify → idempotency → org resolution → DB update | `app/api/webhooks/stripe/route.ts` |
| Clerk webhook | Svix verify → idempotency → org/user provisioning | `app/api/webhooks/clerk/route.ts` |
| AI routes | Draft / summary / Q&A / consistency — admin-only, tier-gated | `app/api/ai/` |

## Pattern Overview

**Overall:** Multi-tenant SaaS — Next.js 15 App Router with route groups as access-control boundaries, a two-layer tenant isolation guarantee (app-layer `org_id` scoping + Supabase RLS), and webhook-driven billing state.

**Key Characteristics:**
- Every authenticated server request begins with `getOrgContext()` → `withOrgScope()`, injecting JWT claims into a Drizzle transaction so RLS fires on every query.
- Subscription state is never trusted from the client — `organizations.plan_tier` is the single source of truth, written only by the Stripe webhook handler.
- Typed error hierarchy (`BootstrapError` subclasses, `TierLimitExceededError`, `IllegalTransitionError`) propagates from domain layer to Next.js error boundary; catch sites discriminate by class, never by string.
- `server-only` guard on all lib/ modules that touch DB, AI, or Stripe — prevents accidental client-side import.

## Layers

**Middleware (Auth Chokepoint):**
- Purpose: Single gate before any route renders. Routes requests to public, webhook, admin, or employee branches. Verifies Clerk session and role for admin URLs.
- Location: `middleware.ts` (root)
- Admin URLs (patterns in `ADMIN_URL_PATTERNS`): `/dashboard`, `/policies`, `/settings` — non-admins get 404 per "advertise nothing" (D-10).
- Webhooks bypass Clerk: `/api/webhooks/stripe`, `/api/webhooks/clerk` — each verifies its own signature in-route.
- Depends on: `@clerk/nextjs/server`
- Used by: Every non-static request

**Route Groups (UI Layer):**
- Purpose: URL-segment-free layout boundaries; each has its own auth gate in its layout.
- `app/(marketing)/` — public, no auth. `app/layout.tsx`, `app/(marketing)/layout.tsx`
- `app/(auth)/` — Clerk-hosted sign-in/sign-up flows. `app/(auth)/layout.tsx`
- `app/(onboarding)/` — auth required, role NOT required. `app/(onboarding)/layout.tsx`
- `app/(admin)/` — `requireAdmin()` in layout; all admin pages are admin-only. `app/(admin)/layout.tsx`
- `app/(employee)/` — `getOrgContext()` in layout; any authenticated role. `app/(employee)/layout.tsx`
- Depends on: `lib/auth/context.ts`, `lib/auth/require-admin.ts`

**API Route Handlers:**
- Purpose: REST endpoints for AI operations and webhook ingestion.
- AI routes (`app/api/ai/`): admin-only, tier-gated via `requireTierLimit()`, write to `ai_generations`.
- Webhook routes (`app/api/webhooks/`): bypass Clerk middleware, verify their own credentials.
- Pattern (AI routes): auth outside `try` → tier check → AI call → DB write → return. Auth errors propagate to Next.js boundary; AI errors return 503 envelope with `Retry-After: 30`.

**Server Actions:**
- Purpose: Thin form-submission handlers under route pages.
- Pattern: `'use server'` directive, call `getOrgContext()` + `requireAdminFromCtx()`, delegate to lib orchestrators.
- Billing actions: `app/(admin)/settings/actions.ts` — `createCheckoutSessionAction`, `createPortalSessionAction`
- Policy actions: `app/(admin)/policies/[id]/actions.ts`, `app/(admin)/policies/new/actions.ts`
- Employee actions: `app/(employee)/my-policies/[id]/actions.ts`, `app/(employee)/my-policies/ask/actions.ts`

**Auth Context Layer:**
- Purpose: Per-request identity resolution — Clerk text IDs → internal UUIDs.
- Location: `lib/auth/context.ts`
- `OrgContext` carries: `orgId` (internal UUID), `userId` (internal UUID), `clerkOrgId`, `clerkUserId`, `role`.
- Sequential lookup: org row first (by `clerk_org_id`), then user row scoped by `eq(users.orgId, orgRow.id)` (ADR-027 — prevents multi-org mismatch silently producing wrong attribution).
- Error hierarchy: `NotAuthenticatedError`, `NoActiveOrganizationError`, `InvalidRoleError`, `OrgNotProvisionedError`, `UserNotProvisionedError` — all subtypes of `BootstrapError` except `ClerkAuthFailedError` (infra, not bootstrap).

**Data Access Layer (OrgScope + Repositories):**
- Purpose: Tenant-scoped, transactional DB access with RLS enforcement.
- `lib/db/scoped.ts` — `withOrgScope(ctx, fn)` opens Drizzle transaction, executes `SET LOCAL ROLE authenticated` and `set_config('request.jwt.claims', claims, true)` inside the transaction so RLS predicates evaluate against `ctx.orgId`.
- `lib/db/repositories/` — per-aggregate modules (`Policies`, `PolicyVersions`, `Acknowledgments`, `PolicyAssignments`, etc.). All take `OrgScope` first. None import raw `db` (enforced by `scripts/check-db-imports.ts`).
- Exception allow-list for raw `db` (app modules; source of truth = `scripts/check-db-imports.ts:39-51`): `app/api/webhooks/clerk/route.ts` (service-role provisioning), `app/api/webhooks/stripe/route.ts`, `lib/auth/context.ts`, `lib/db/scoped.ts`, `lib/stripe/products.ts` (tier-check runs before `withOrgScope` opens). `lib/db/index.ts` is the barrel that DEFINES `db`, not an importer; the allow-list also covers `tests/**`, `scripts/check-{rls,schema,db}.ts`, `lib/db/index.test.ts`, and `app/api/cron/**`.

**Billing Layer:**
- Purpose: Stripe subscription lifecycle management and tier-feature gating.
- Location: `lib/stripe/`
- `client.ts` — lazy singleton `getStripeClient()` from `STRIPE_SECRET_KEY`.
- `catalog.ts` — LAZY SINGLETON (PR #38); `getPriceCatalog()` called on first use, reads 6 env vars, throws `StripeCatalogConfigError` if misconfigured.
- `normalize.ts` — `normalizeSubscription()` maps a Stripe `Subscription` to a discriminated union: `entitled` (active/trialing → write `planTier`), `preserve-tier` (past_due → keep existing tier), `downgrade` (canceled/unpaid → set `starter`), `link-only` (incomplete → store IDs only).
- `products.ts` — `TIER_LIMITS` constant, `checkTierLimit()`, `requireTierLimit()`. Reads `organizations.plan_tier` from DB via `readPlanTier()` helper (spyable for tests via self-namespace import pattern).
- `errors.ts` — `TierLimitExceededError` (statusCode 429 for usage-bound, 403 for tier-bound), `StripeConfigError`, `StripeCatalogConfigError`.
- `mask.ts` — `maskCustomerId()`, `maskSubscriptionId()` for log safety.

**Policy Domain Layer:**
- Purpose: Policy lifecycle business rules.
- `lib/policies/state-machine.ts` — pure DAG, no DB import. `ALLOWED_TRANSITIONS`, `canTransition()`, `IllegalTransitionError`.
- `lib/policies/transitions.ts` — 7 server-only orchestrators (`submitForReview`, `approve`, `reject`, `publish`, `archive`, `restore`, `editPublished`). Each calls `getOrgContext()` + `requireAdminFromCtx()` + `withOrgScope()` + validates the transition + writes version snapshot + status update atomically.
- `lib/policies/acknowledgment.ts` — server-only acknowledgment write orchestrator. Wraps 4 DB operations in one transaction: policy read, assignment check, version lookup, `INSERT ON CONFLICT DO NOTHING`.

**AI Layer:**
- Purpose: Anthropic Claude API integration for draft generation, summarization, Q&A, consistency check.
- `lib/ai/client.ts` — lazy singleton `getAnthropicClient()`, `maxRetries: 0`, `timeout: 25_000ms`.
- `lib/ai/models.ts` — `MODEL_SONNET = 'claude-sonnet-4-6'`, `MODEL_HAIKU = 'claude-haiku-4-5-20251001'`.
- `lib/ai/cache.ts` — `EPHEMERAL_CACHE` (5min TTL), `LONG_CACHE` (1h TTL). Q&A builds system array with LONG_CACHE first, EPHEMERAL_CACHE second (Anthropic ordering requirement).
- `lib/ai/prompts.ts` — all system prompt templates.

## Data Flow

### Admin Request Lifecycle (e.g., policy draft)

1. Browser POST → `middleware.ts` intercepts — verifies Clerk session, checks role = `admin`, attaches `x-pathname` header, passes to App Router. (`middleware.ts`)
2. `app/(admin)/layout.tsx` calls `requireAdmin()` → `getOrgContext()` → Clerk `auth()` → DB lookups to translate Clerk IDs to internal UUIDs. (`lib/auth/context.ts`)
3. Server Action (e.g., `app/(admin)/policies/new/actions.ts`) calls `getOrgContext()` + `requireAdminFromCtx(ctx)`.
4. `await requireTierLimit(ctx.orgId, 'aiDraftsMonthly')` — reads `organizations.plan_tier` from DB, counts AI draft rows this month, throws `TierLimitExceededError` if over. (`lib/stripe/products.ts`)
5. `withOrgScope(ctx, async (s) => { ... })` — opens Drizzle transaction, injects JWT claims via `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`. (`lib/db/scoped.ts`)
6. Repository call (e.g., `Policies.create(s, input)`) executes with `s.tx` — both app-layer `where(eq(policies.orgId, s.orgId))` and Supabase RLS fire on the query. (`lib/db/repositories/policies.ts`)
7. Response returned to browser.

### Stripe Webhook → Subscription State Update

1. Stripe delivers event to `POST /api/webhooks/stripe`. (`app/api/webhooks/stripe/route.ts`)
2. `request.text()` reads raw body before any JSON parse (required for HMAC verification).
3. `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` — validates `stripe-signature` header. 400 on missing signature, 400 on bad signature.
4. `dispatchEvent()` routes to handler by event type: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`.
5. For subscription events: retrieve canonical subscription from Stripe API (not event snapshot) → `normalizeSubscription()` → determine kind (`entitled`/`preserve-tier`/`downgrade`/`link-only`).
6. `resolveOrg()` — matches org by `org_id` metadata hint, `stripe_customer_id`, or `stripe_subscription_id`. Requires exactly one matching row; logs no-op if ambiguous.
7. `commitProcessedEvent()` — DB transaction: INSERT into `stripe_events` with `ON CONFLICT DO NOTHING` (idempotency), then UPDATE `organizations` billing columns. If event already in `stripe_events`, returns `{ status: 'duplicate' }` and skips update.
8. `planTier` is updated only when `normalized.kind === 'entitled'` or `'downgrade'`; `preserve-tier` (past_due) keeps existing tier.

### Post-Sign-In Routing (Trampoline)

1. Clerk redirects to `GET /post-sign-in` after authentication. (`app/(auth)/post-sign-in/page.tsx`)
2. `getOrgContext()` called — throws one of the `BootstrapError` subclasses if session is incomplete.
3. `NotAuthenticatedError | InvalidRoleError | NoActiveOrganizationError` → redirect to `/onboarding/create-org`.
4. `OrgNotProvisionedError | UserNotProvisionedError` (provisioning race) → rethrow → 500 (not onboarding).
5. `ctx.role === 'admin'` → redirect to `/dashboard`; else → redirect to `/my-policies`.

### Clerk Webhook → User/Org Provisioning

1. Clerk delivers event to `POST /api/webhooks/clerk`. (`app/api/webhooks/clerk/route.ts`)
2. `request.text()` → Svix signature verification using `CLERK_WEBHOOK_SECRET`.
3. Idempotency: INSERT into `clerk_events` with `ON CONFLICT DO NOTHING`. If duplicate, return 200.
4. `organization.created` → INSERT into `organizations` with `planTier: 'starter'`, `stripeSubscriptionStatus: 'trialing'`.
5. `user.created` → INSERT into `users` with `orgId: null` (nullable window per D-03a), then `mirrorRoleToClerk('employee')`.
6. `organizationMembership.created` → lookup internal org UUID by `clerk_org_id`, UPDATE `users.orgId` + `users.role`, mirror role to Clerk publicMetadata.
7. On prerequisite-missing race (org/user row not yet present): delete the idempotency row before returning 409, so Clerk's retry re-fires.

## Key Abstractions

**OrgContext:**
- Purpose: Per-request tenant identity — internal UUIDs for `orgId` and `userId` translated from Clerk text IDs.
- Location: `lib/auth/context.ts`
- Fields: `orgId` (UUID), `userId` (UUID), `clerkOrgId` (Clerk text), `clerkUserId` (Clerk text), `role`.
- Never carry `stripeCustomerId` or `planTier` — always re-read billing state from DB.

**OrgScope:**
- Purpose: Extends OrgContext with a live Drizzle transaction handle (`tx`) and injected JWT claims for RLS.
- Location: `lib/db/scoped.ts`
- Pattern: `await withOrgScope(ctx, async (scope) => { await Policies.create(scope, ...) })`.
- All repository calls take `OrgScope` as first argument, use `scope.tx` for queries. Never import raw `db`.

**Policy State Machine:**
- Purpose: Single source of truth for allowed policy status transitions.
- Location: `lib/policies/state-machine.ts`
- Transitions: `draft → [under_review, published]`, `under_review → [published, draft]`, `published → [archived, draft]`, `archived → [draft]`.
- `approvalWorkflows` is defined as a Growth+ flag in `TIER_LIMITS` (`lib/stripe/products.ts`) but is NOT currently enforced: `requireTierLimit()` is invoked only in `app/api/ai/draft/route.ts:61` (`aiDraftsMonthly`) and `app/api/ai/consistency/route.ts:72` (`consistencyCheck`) — it is not called anywhere in `lib/policies/`, so the transition orchestrators are not tier-gated. (Tracked as a tier-gating gap; see the consultant risk register.)

**NormalizedSubscription:**
- Purpose: Discriminated union translating Stripe subscription state to billing intent.
- Location: `lib/stripe/normalize.ts`
- Kinds: `entitled` (write planTier), `preserve-tier` (past_due, keep tier), `downgrade` (write `starter`), `link-only` (incomplete, store IDs only).

**TIER_LIMITS:**
- Purpose: Single source of truth for feature flags and usage caps per plan.
- Location: `lib/stripe/products.ts`
- Tiers: `starter` (25 users, 50 AI drafts/mo, no approvals/consistency/SSO), `growth` (100 users, 200 drafts, approvals+consistency+slack), `business` (500 users, unlimited drafts, all features).

## Entry Points

**Root Layout:**
- Location: `app/layout.tsx`
- Wraps entire app in `<ClerkProvider>`.

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every non-static request.
- Pattern matching: static asset exclusions + API routes always run.

**Post-Sign-In Trampoline:**
- Location: `app/(auth)/post-sign-in/page.tsx`
- Triggers: Clerk "After sign-in URL" redirect.
- Dispatches to `/onboarding/create-org`, `/dashboard`, or `/my-policies`.

**Stripe Webhook:**
- Location: `app/api/webhooks/stripe/route.ts`
- Triggers: Stripe event delivery.
- `export const runtime = 'nodejs'` (required for raw body access via `request.text()`).

**Clerk Webhook:**
- Location: `app/api/webhooks/clerk/route.ts`
- Triggers: Clerk organization/user/membership events.
- One of the `app/` files allow-listed to import raw `db` directly (here for service-role org/user provisioning; allow-list at `scripts/check-db-imports.ts:39-51`) — the others are `app/api/webhooks/stripe/route.ts` and the planned `app/api/cron/**` routes.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop on Vercel serverless functions. Anthropic client configured with `maxRetries: 0` and `timeout: 25_000ms` to prevent function monopolization.
- **Global state (Lazy Modules):** Module-level singletons for `db` (`lib/db/index.ts`), `stripeClient` (`lib/stripe/client.ts`), and `anthropicClient` (`lib/ai/client.ts`). `db` and Stripe price catalog are LAZY-INITIALIZED (PRs #37 & #38) so `next build` doesn't crash on missing env vars.
  - `lib/db/index.ts`: `db` is a Proxy that defers connection until first property access via `resolveDb()`.
  - `lib/stripe/catalog.ts`: `getPriceCatalog()` function defers `buildCatalog()` until first call, caches on success.
  - Both allow build-time evaluation of route modules without side effects; the throw fires on first RUNTIME use where env vars ARE configured.
- **RLS + SET LOCAL ordering:** `SET LOCAL ROLE authenticated` MUST precede `set_config('request.jwt.claims', ..., true)` within the transaction. `is_local = true` is required to prevent claim leakage across pooled connections. (`lib/db/scoped.ts:61-66`)
- **Raw body requirement:** Both webhook routes read the raw body before any JSON parse — body streams are readable only once. (`app/api/webhooks/stripe/route.ts:453` `request.text()`; `app/api/webhooks/clerk/route.ts:160` `req.text()`)
- **Circular imports:** `lib/stripe/products.ts` uses a self-namespace import (`import * as self from './products'`) so `vi.spyOn` can intercept exported helper calls made inside the module. This is the one intentional self-reference in the codebase.
- **Drizzle raw-db allow-list:** Enforced by `scripts/check-db-imports.ts` (the regex allow-list at :39-51 is the source of truth). App-module importers: `lib/db/scoped.ts`, `lib/auth/context.ts`, `app/api/webhooks/clerk/route.ts`, `app/api/webhooks/stripe/route.ts`, `lib/stripe/products.ts` (plus `tests/**`, `scripts/check-{rls,schema,db}.ts`, `lib/db/index.test.ts`, `app/api/cron/**`). `lib/db/index.ts` is the barrel itself, not an importer. All other modules must use `scope.tx`.

## Anti-Patterns

### Reading planTier from Client or Session Claims

**What happens:** Some SaaS apps store subscription tier in session claims or pass it as a prop.
**Why it's wrong:** Stripe webhook events can be delayed; client-supplied tier cannot be verified.
**Do this instead:** Always read `organizations.plan_tier` from the DB via `readPlanTier(orgId)` inside `checkTierLimit()` or `requireTierLimit()`. (`lib/stripe/products.ts:120-128`)

### Calling Drizzle from a Repository Without OrgScope

**What happens:** Importing `db` directly from `@/lib/db` inside a repository module.
**Why it's wrong:** Bypasses the `SET LOCAL ROLE authenticated` and JWT injection — RLS never fires because the connection-string user is `BYPASSRLS`. Also runs outside the transaction.
**Do this instead:** Accept `OrgScope` as first argument, use `scope.tx` for all queries. (`lib/db/repositories/policies.ts:1-10`)

### Idempotency-Before-Dispatch in Clerk Webhook

**What happens:** The `clerk_events` row is written BEFORE the event is dispatched (current implementation).
**Why it's wrong:** A dispatch failure (FK violation, DB error) leaves the event marked processed. Clerk's retry short-circuits on idempotency and the event is silently lost. The interim fix deletes the idempotency row on dispatch error so Clerk retries, but the ordering is still inverted.
**Do this instead (Phase 7+):** Write the `clerk_events` row only after successful dispatch. (`app/api/webhooks/clerk/route.ts:386-409`)

### Trusting Event Snapshot for Subscription State

**What happens:** Using `event.data.object` subscription fields directly in `checkout.session.completed` or `customer.subscription.updated`.
**Why it's wrong:** Snapshot data may be stale if events arrive out of order.
**Do this instead:** Always re-fetch the canonical subscription with `stripe.subscriptions.retrieve(subscriptionId)` then pass it through `normalizeSubscription()`. (`app/api/webhooks/stripe/route.ts:303-313, 415-425`)

## Phase 6 Billing: Subscription State Machine

### Organization Billing Columns (`organizations` table)

> Column provenance: `plan_tier`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status` were added in `0000_initial.sql` (:49-52). The remaining 5 (`stripe_price_id`, `stripe_subscription_item_id`, `stripe_current_period_end`, `stripe_cancel_at_period_end`, `stripe_last_event_created`) were added by Phase 6 migration `drizzle/0012_billing_state.sql`.

| Column | Type | Purpose |
|--------|------|---------|
| `plan_tier` | `text` default `'starter'` | Active tier: `starter \| growth \| business` |
| `stripe_customer_id` | `text` nullable | Stripe `cus_...` — set on first checkout/webhook |
| `stripe_subscription_id` | `text` nullable | Stripe `sub_...` — set when subscription creates |
| `stripe_subscription_status` | `text` default `'trialing'` | Stripe status: `trialing \| active \| past_due \| canceled \| ...` |
| `stripe_price_id` | `text` nullable | Current price ID — maps back to tier via `priceIdToTier()` (`lib/stripe/catalog.ts`), backed by the lazy `getPriceCatalog()` singleton |
| `stripe_subscription_item_id` | `text` nullable | For future quantity/usage updates |
| `stripe_current_period_end` | `timestamptz` nullable | Next renewal date |
| `stripe_cancel_at_period_end` | `boolean` default `false` | Pending cancellation flag |
| `stripe_last_event_created` | `timestamptz` nullable | Timestamp of most-recent processed event (for ordering) |

Seed state for new orgs (set by `organization.created` Clerk webhook):
- `plan_tier = 'starter'`, `stripe_subscription_status = 'trialing'`, all Stripe ID columns `null`.
- A new org with `stripeCustomerId = null` and `stripeSubscriptionStatus = 'trialing'` is NOT blocked from checkout — the settings page and `createCheckoutSessionAction` gate on `stripeCustomerId` presence, not status.

### Subscription Status → planTier Mapping (`normalizeSubscription`, `lib/stripe/normalize.ts`)

| Stripe Status | kind | planTier written |
|---------------|------|-----------------|
| `active` / `trialing` | `entitled` | mapped from price ID |
| `past_due` | `preserve-tier` | unchanged |
| `canceled` / `incomplete_expired` / `paused` / `unpaid` | `downgrade` | `starter` |
| `incomplete` | `link-only` | unchanged |

### Tier Gating Flow (API routes)

1. `const ctx = await getOrgContext()` — resolves org (outside try/catch per D-37)
2. `requireAdminFromCtx(ctx)` — throws `ForbiddenError` (403) if not admin (outside try/catch)
3. Inside try: `await requireTierLimit(ctx.orgId, 'aiDraftsMonthly')` (or other feature)
4. `requireTierLimit` → `checkTierLimit` → `readPlanTier(orgId)` → DB read of `organizations.plan_tier`
5. For usage features: count rows in `ai_generations` / `users` for the month
6. If over limit: throw `TierLimitExceededError` with `statusCode: 429` (usage) or `403` (tier-bound feature)
7. Catch site: `if (err instanceof TierLimitExceededError) return NextResponse.json({...}, { status: err.statusCode })`

### Checkout + Customer Portal Flow

- **Start checkout:** Admin submits form on `/settings` → `createCheckoutSessionAction` → validates no active subscription (guards by `stripeCustomerId` presence + active-ish status) → `stripe.checkout.sessions.create()` with `client_reference_id: ctx.orgId` and `metadata.policyPilotOrgId` → redirect to Stripe-hosted checkout.
- **After checkout:** Stripe delivers `checkout.session.completed` → webhook handler retrieves canonical subscription → `normalizeSubscription()` → updates `organizations` billing columns.
- **Customer portal:** `createPortalSessionAction` → `stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId })` → redirect to Stripe-hosted portal.
- **Plan changes / renewals / cancellations:** Handled by `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` webhook events.

## Error Handling

**Strategy:** Typed error class hierarchy. Domain errors carry a `code` constant and `statusCode` (where applicable). Auth errors propagate to Next.js error boundary; AI errors return structured 503 envelope.

**Patterns:**
- Auth bootstrap errors (`BootstrapError` subclasses): thrown by `getOrgContext()`, caught by page layouts and the post-sign-in trampoline.
- `ForbiddenError` (403): thrown by `requireAdminFromCtx()` — API routes only. Page routes use `notFound()` (404 per D-10 "advertise nothing").
- `TierLimitExceededError`: thrown by `requireTierLimit()` — statusCode 429 (usage) or 403 (feature). Caught in API route try/catch.
- `IllegalTransitionError`: thrown by the transition orchestrators when `canTransition()` returns false — in `loadAndAssertTransition()` (`lib/policies/transitions.ts:96`) and `editPublished()` (`:301`). `canTransition()` itself (`lib/policies/state-machine.ts:29-31`) returns a boolean and does not throw.
- Anthropic errors: logged with PII-safe truncation, returned as 503 + `Retry-After: 30`.
- Stripe webhook errors: bad signature → 400; processing failure → 500 (Stripe retries).
- `ClerkAuthFailedError`: NOT a BootstrapError — represents infra failure, must not be caught by onboarding-redirect handlers.

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` with structured object literals. Sensitive IDs masked via `maskClerkId`, `maskClerkOrgId`, `maskCustomerId`, `maskSubscriptionId` helpers. Phase 7+ will add pino structured logging.

**Validation:** Zod at API route boundaries (`DraftSchema`, `CheckoutIntentSchema`). Strict schema: `.strict()` to reject unknown keys.

**Authentication:** Clerk for session management. Internal `getOrgContext()` translates Clerk text IDs to internal UUIDs per request.

**Idempotency:** `clerk_events` and `stripe_events` tables store processed event IDs. Both use `ON CONFLICT DO NOTHING` with a transaction wrapping the idempotency insert + state update atomically.

**Prompt caching:** All AI calls use `buildCachedSystem()` (EPHEMERAL, 5min) or `buildLongCachedSystem()` (LONG, 1h). Q&A orders LONG_CACHE block first, EPHEMERAL block second (Anthropic requirement).

---

*Architecture analysis: 2026-06-04*
