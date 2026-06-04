---
last_mapped_commit: 6f17412a2df1218e9a618d7b58df00fe1e595a7a
last_mapped_date: 2026-06-04
scan_mode: fast (tech+arch)
---

# External Integrations

**Analysis Date:** 2026-06-04

---

## Clerk — Authentication & Organizations

**Purpose:** Auth provider; manages users, organizations, session JWTs, role claims.

**SDK:** `@clerk/nextjs ^7.3.4`

**Surface:**
- `middleware.ts` — `clerkMiddleware` / `createRouteMatcher`; protects all non-public routes; role gate for admin URLs returns 404 (not 401) to avoid advertising route existence
- `lib/auth/context.ts` — `getOrgContext()`: reads `auth()` session, resolves Clerk text IDs to internal UUIDs, validates role from `publicMetadata.role`
- `lib/auth/require-admin.ts` — convenience wrapper around `getOrgContext()` for admin-only endpoints
- `app/api/webhooks/clerk/route.ts` — Svix-verified webhook handler; creates `organizations` + `users` rows and mirrors roles to `publicMetadata`
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx` — embedded Clerk components

**Webhook Events Handled (`app/api/webhooks/clerk/route.ts`):**

| Event | Action |
|-------|--------|
| `organization.created` | Inserts `organizations` row with `planTier: 'starter'`, `stripeSubscriptionStatus: 'trialing'` |
| `user.created` | Inserts `users` row; mirrors `employee` role to `publicMetadata` |
| `organizationMembership.created` | Backfills `users.orgId` + `users.role`; mirrors role to `publicMetadata` |
| `organizationMembership.updated` | Updates `users.role`; mirrors role to `publicMetadata` |
| `user.deleted`, `organization.deleted`, `organizationMembership.deleted` | Log-only (Phase 7+ retention TODO) |

**Idempotency:** `clerk_events` table; `ON CONFLICT DO NOTHING`; idempotency row deleted on prerequisite-missing 409 so Clerk retries can re-fire.

**Signature Verification:** `svix 1.93.0` — verifies `svix-id`, `svix-timestamp`, `svix-signature` headers; raw `request.text()` read before any JSON parse.

**Auth Data Flow:**
1. Clerk session JWT carries `publicMetadata.role` (mirrored by webhook handler)
2. `getOrgContext()` translates Clerk text IDs (`org_xxx`, `user_xxx`) → internal UUIDs via indexed lookups on `organizations.clerkOrgId` + `users.clerkUserId`
3. `withOrgScope()` (`lib/db/scoped.ts`) injects `request.jwt.claims` into Postgres via `SET LOCAL ROLE authenticated` + `set_config` so RLS policies evaluate correctly

**Required Env Vars:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` (must be `/post-sign-in`)
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` (must be `/post-sign-in`)

---

## Supabase / PostgreSQL + Drizzle ORM

**Purpose:** Primary data store; Row-Level Security enforces tenant isolation at DB layer.

**SDK:** `drizzle-orm ^0.45.2` (primary query interface) over `postgres ^3.4.9` (driver). NOTE: `@supabase/supabase-js ^2.105.4` is pinned in `package.json` but currently UNUSED in app code (fallow flags it an unused dep) — all DB access is via Drizzle/`postgres`, and RLS claims are injected through `set_config` in `lib/db/scoped.ts`, not this client.

**Surface:**
- `lib/db/index.ts` — Drizzle singleton over `postgres` driver; LAZY-INITIALIZED (PR #37, 2026-06-03) so `next build` doesn't crash without `DATABASE_URL`; `prepare: false` required for Supabase Transaction pooler
- `lib/db/schema.ts` — all 14 tables defined with Drizzle table builders
- `lib/db/scoped.ts` — `withOrgScope()`: wraps every user-facing query in a transaction with JWT claims injected for RLS
- `lib/db/repositories/` — repository objects (one per table aggregate); only way to access DB outside webhook/cron allow-list
- `drizzle/` — 13 migrations (`0000` → `0012`) + meta snapshots

**Module Init Behavior (PR #37 — Lazy Init Pattern):**
- `lib/db/index.ts` exports `db` as a Proxy instead of a direct instance
- On first property access (`db.select()`, `db.transaction()`, etc.), the proxy calls `resolveDb()` which:
  1. Checks `DATABASE_URL` env var; throws helpful error if absent
  2. Creates Postgres connection with `prepare: false` (Supabase pooler requirement)
  3. Wraps in Drizzle ORM and caches
- All methods are bound so `this` context for chained query builders stays correct
- This allows `next build` to evaluate route modules without crashing on missing `DATABASE_URL` — the connection is deferred to first runtime use

**Schema — 14 Tables:**

| Table | Tenant-Scoped | Notes |
|-------|--------------|-------|
| `acknowledgments` | Yes | Append-only audit trail; unique constraint on `(userId, policyId, policyVersionId)` |
| `ai_generations` | Yes | Every successful Anthropic call; idempotency key support; 4 token-cost columns |
| `batch_jobs` | Yes | Anthropic batch status tracking for Consistency Check |
| `clerk_events` | No (service-role) | Webhook idempotency table; no `org_id` |
| `departments` | Yes | Composite FK target for `users(org_id, department_id)` |
| `notifications` | Yes | `policy_assigned`, `policy_updated`, `review_due`, `ack_reminder` types |
| `organizations` | Parent | Billing state columns added Phase 6 (see below) |
| `policies` | Yes | Policy state machine; `status`: `draft` → `pending_review` → `published` → `archived` |
| `policy_assignments` | Yes | `assigneeType`: `user` \| `department`; unique on `(policyId, assigneeType, assigneeId)` |
| `policy_versions` | Yes | Unique on `(policyId, versionNumber)`; append-only version history |
| `qa_citation_grants` | Yes | Q&A cross-policy citation access grants; unique on `(orgId, userId, policyId)` |
| `stripe_events` | No (service-role) | Webhook idempotency table; no `org_id` |
| `users` | Yes | `org_id` nullable for Clerk webhook race window; composite FK to `departments` |
| `workflow_stages` | Yes | Approval workflow steps per policy |

**Phase 6 Schema Delta (`drizzle/0012_billing_state.sql`):**
- Added to `organizations`: `stripe_price_id`, `stripe_subscription_item_id`, `stripe_current_period_end` (timestamptz), `stripe_cancel_at_period_end` (boolean, default false), `stripe_last_event_created` (timestamptz)
- Partial unique indexes: `organizations_stripe_customer_id_unique_idx WHERE stripe_customer_id IS NOT NULL`, `organizations_stripe_subscription_id_unique_idx WHERE stripe_subscription_id IS NOT NULL`
- Existing columns already in schema: `stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status` (default `'trialing'`), `plan_tier` (default `'starter'`)

**RLS Pattern:** All tenant tables use `org_id = auth.jwt()->>'org_id'`; post-migration 0008 uses the subquery-wrapped form `(SELECT auth.jwt()->>'org_id')`. Application layer also filters `WHERE org_id = scope.orgId` as defense-in-depth.

**Connection Strings:**
- Runtime: `DATABASE_URL` — Supabase Transaction pooler (port 6543); `prepare: false` mandatory
- Migrations: `DIRECT_URL` — Supabase direct connection (port 5432); required for DDL; falls back to `DATABASE_URL` with warning

**Required Env Vars:**
- `DATABASE_URL` (pooler URI, port 6543)
- `DIRECT_URL` (direct URI, port 5432, migrations only)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Test DB:**
- `DATABASE_URL_TEST` / `DIRECT_URL_TEST` — second Supabase project for RLS cross-org property test; keeps test fixtures from polluting dev data

---

## Stripe — Billing (Phase 6)

**Purpose:** Subscription billing; Checkout for new subscriptions, Customer Portal for plan management, Webhooks for billing state machine.

**SDK:** `stripe ^22.2.0`

**Surface:**
- `lib/stripe/client.ts` — lazy singleton `getStripeClient()`; reads `STRIPE_SECRET_KEY`
- `lib/stripe/catalog.ts` — LAZY-INITIALIZED (PR #38, 2026-06-03); `getPriceCatalog()` builds `PRICE_CATALOG` from 6 price ID env vars on first access; `priceIdToTier()`, `tierAndIntervalToPriceId()` lookups
- `lib/stripe/normalize.ts` — `normalizeSubscription()`: maps Stripe subscription status → billing state machine kind (`entitled` | `preserve-tier` | `downgrade` | `link-only`)
- `lib/stripe/products.ts` — `TIER_LIMITS` constant; `checkTierLimit()` / `requireTierLimit()` gate functions; `readPlanTier()`, `countDraftsThisMonth()`, `countOrgUsers()` DB helpers
- `lib/stripe/errors.ts` — `TierLimitExceededError` (429 for usage-bound, 403 for tier-bound), `StripeConfigError`, `StripeCatalogConfigError`
- `lib/stripe/mask.ts` — `maskCustomerId()` / `maskSubscriptionId()` for log safety
- `app/api/webhooks/stripe/route.ts` — Stripe webhook handler (see events below)
- `app/(admin)/settings/actions.ts` — `createCheckoutSessionAction()`, `createPortalSessionAction()` Server Actions
- `app/(admin)/settings/page.tsx` — Billing settings UI; reads live billing state from DB

**Module Init Behavior (PR #38 — Lazy Catalog Patch):**
- `lib/stripe/catalog.ts` exports `getPriceCatalog()` function instead of eagerly calling `buildCatalog()`
- On first call to `getPriceCatalog()`:
  1. Reads all six `STRIPE_PRICE_*` env vars
  2. Validates presence and uniqueness; throws `StripeCatalogConfigError` if misconfigured (fail-closed)
  3. Caches result in module-level variable
- This allows `next build` to evaluate route modules (including `app/api/webhooks/stripe/route.ts` which transitively imports the catalog) without crashing on missing price IDs — the build environment is not expected to have them

**Webhook Handler (`app/api/webhooks/stripe/route.ts`):**

| Event | Handler | Action |
|-------|---------|--------|
| `checkout.session.completed` | `handleCheckoutCompleted()` | Retrieves canonical subscription from Stripe API; calls `normalizeSubscription()`; updates `organizations` billing columns |
| `invoice.paid` | `handleInvoicePaid()` | Retrieves canonical subscription; normalizes and updates org billing state (covers renewal cycle — critical) |
| `invoice.payment_failed` | `handlePaymentFailed()` | Sets `stripeSubscriptionStatus = 'past_due'`; does NOT downgrade tier |
| `customer.subscription.deleted` | `handleSubscriptionDeleted()` | Downgrades `planTier → 'starter'`; sets `stripeSubscriptionStatus = 'canceled'` |
| `customer.subscription.updated` | `handleSubscriptionUpdated()` | Retrieves canonical subscription; normalizes; updates org billing state |

All 5 events from CLAUDE.md Stripe Rules are handled. No gaps.

**Webhook Security:**
- Raw body read via `request.text()` before any parsing
- `stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` — HMAC signature verification
- Idempotency via `stripe_events` table; `ON CONFLICT DO NOTHING` inside a DB transaction

**Billing State Machine — `normalizeSubscription()` Kinds:**

| Stripe Status | Kind | planTier Update |
|--------------|------|----------------|
| `active`, `trialing` | `entitled` | Set to tier from price ID |
| `past_due` | `preserve-tier` | No change |
| `canceled`, `incomplete_expired`, `paused`, `unpaid` | `downgrade` | Force to `'starter'` |
| `incomplete` | `link-only` | No change |

**Tier Gating (`lib/stripe/products.ts`):**
- Three tiers: `starter` | `growth` | `business`
- `TIER_LIMITS` object defines per-tier limits; `maxUsers`: 25 / 100 / 500; `aiDraftsMonthly`: 50 / 200 / unlimited
- Boolean features gated to Growth+: `approvalWorkflows`, `slackIntegration`, `consistencyCheck`
- Boolean features gated to Business: `customBranding`, `sso`, `apiAccess`
- `requireTierLimit(orgId, feature)` — throws `TierLimitExceededError`; status 429 for usage-bound, 403 for tier-bound
- All AI API routes call `requireTierLimit` before Anthropic call

**Checkout Flow:**
- `createCheckoutSessionAction()` — creates `stripe.checkout.sessions.create` with `mode: 'subscription'`; sets `client_reference_id: ctx.orgId`, `metadata.policyPilotOrgId`, `subscription_data.metadata.policyPilotOrgId`; blocks duplicate subscription if `stripeCustomerId` exists with active/trialing/past_due status
- `createPortalSessionAction()` — creates `stripe.billingPortal.sessions.create`; requires existing `stripeCustomerId`
- Redirect return URLs: `NEXT_PUBLIC_APP_URL/settings?billing=success|canceled`

**Price Catalog Env Vars (lazy-accessed):**
- `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`
- `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUAL`
- `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_ANNUAL`
- All 6 required at first `getPriceCatalog()` call; `StripeCatalogConfigError` thrown on missing or duplicate values

**Required Env Vars:**
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- 6 price ID vars above

**Local Development:** Stripe CLI — bind via `STRIPE_API_KEY` from `.env.local` to avoid two-account mismatch; see `memory/gsd-tooling-quirks.md`.

---

## Anthropic Claude API — AI Layer

**Purpose:** Policy draft generation, TL;DR summaries, employee Q&A, policy consistency check.

**SDK:** `@anthropic-ai/sdk 0.97.1` (pinned exact)

**Models:**
- `claude-sonnet-4-6` — draft, Q&A, consistency check (defined as `MODEL_SONNET` in `lib/ai/models.ts`)
- `claude-haiku-4-5-20251001` — TL;DR summary only (defined as `MODEL_HAIKU` in `lib/ai/models.ts`)

**Client:** `lib/ai/client.ts` — lazy singleton; `maxRetries: 0` (no auto-retry); `timeout: 25_000ms`

**Surface:**
- `lib/ai/prompts.ts` — system prompt constants: `DRAFT_SYSTEM_PROMPT`, `SUMMARY_SYSTEM_PROMPT`, `QA_SYSTEM_PROMPT_TEMPLATE`, `CONSISTENCY_SYSTEM_PROMPT`; contents gated by `scripts/check-ai-prompts.ts` (40-char anchor match against `reference/PROMPTS.md`)
- `lib/ai/cache.ts` — prompt cache helpers; `EPHEMERAL_CACHE` (5min default TTL), `LONG_CACHE` (1h TTL for Q&A policy library block); D-33c ordering: LONG_CACHE block FIRST, EPHEMERAL SECOND
- `lib/ai/qa.ts` — Q&A orchestrator; builds per-org policy library XML; calls Anthropic; parses citations; writes `qa_citation_grants`
- `lib/ai/summary.ts` — TL;DR summary with Haiku
- `lib/ai/batch-status.ts` — `translateProcessingStatus()` SDK → SPEC enum for Consistency Check
- `lib/ai/extract.ts`, `lib/ai/qa-extract.ts`, `lib/ai/qa-parser.ts`, `lib/ai/schemas.ts` — XML/citation extraction + parsing utilities
- `app/api/ai/draft/route.ts` — policy draft endpoint; checks `aiDraftsMonthly` tier limit before calling Anthropic; stores idempotency key
- `app/api/ai/summary/route.ts` — TL;DR summary endpoint
- `app/api/ai/qa/route.ts` — employee Q&A HTTP route (wraps `lib/ai/qa.ts`)
- `app/api/ai/consistency/route.ts` — submits Anthropic Batch API job; returns `batchId`
- `app/api/ai/consistency/[batchId]/route.ts` — polls batch status; writes `ai_generations` row on completion

**Audit Trail:** Every successful Anthropic call writes one row to `ai_generations` via `AiGenerations.insert()` in `lib/db/repositories/ai_generations.ts`. Columns: `orgId`, `policyId`, `type` (`draft|summary|qa|consistency`), `prompt`, `result`, `model`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `idempotencyKey`.

**Tier Gating:** `requireTierLimit(orgId, 'aiDraftsMonthly')` called before every draft; `requireTierLimit(orgId, 'consistencyCheck')` before consistency check (Growth+ feature).

**Batch API (Consistency Check):** Anthropic Batch API used for async consistency check; 50% cost reduction. Batch state tracked in `batch_jobs` table. `ai_generations` row written on completion only (SUCCESS-ONLY semantic).

**Prompt Injection Guard:** Q&A system prompt includes explicit instruction treating all text inside `<policy>` XML tags as DATA only, not directives.

**Required Env Vars:**
- `ANTHROPIC_API_KEY` — server-only; never exposed client-side

---

## Resend — Email (Phase 7, Planned)

**Purpose:** Transactional email for policy assignment reminders, acknowledgment reminders. Not yet implemented.

**SDK:** Not installed in current `package.json` dependencies.

**Config:** `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars present in `.env.local.example` (pre-provisioned for Phase 7). `RESEND_FROM_EMAIL` defaults to `noreply@policypilot.com`.

**Status:** Scaffolded in environment config only. No application code exists yet.

---

## Railway — Background Worker (Phase 7, Planned)

**Purpose:** Cron-based reminder jobs (acknowledgment reminders, review due alerts). Not yet deployed.

**Status:** Planned as a separate Railway worker service. `CRON_SECRET` env var present in `.env.local.example` for future cron route authentication (`/api/cron/(.*)`). Middleware already has the `isCronRoute` matcher that bypasses Clerk auth (cron routes verify `CRON_SECRET` header instead). No Railway worker code exists yet.

---

## Analytics & Monitoring (Scaffolded)

**PostHog:**
- `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` env vars present
- No PostHog SDK installed in current `package.json`

**Sentry:**
- `SENTRY_DSN` env var present
- No Sentry SDK installed in current `package.json`

Both are scaffolded in environment configuration and CI workflows for future activation.

---

## CI/CD

**GitHub Actions Workflows:**
- `.github/workflows/verify.yml` — general PR + push verification
- `.github/workflows/verify-phase-6.yml` — Phase 6 full verification (runs `pnpm verify:phase-6` with all secrets); triggers on `pull_request`, `push` to `main` only (`gsd/**` push was removed — concurrent push+PR jobs deadlocked on TRUNCATE against the shared verification DB; see workflow comment), and `workflow_dispatch`
- `.github/workflows/migrate.yml` — migration application pipeline

**Vercel:**
- Auto-deploy via `vercel.json`; `buildCommand: "pnpm deploy:preflight && pnpm build"` — schema gate fires before every deploy
- Secret storage: GitHub repository secrets for all env vars listed in `.github/workflows/verify-phase-6.yml`

---

## Environment Variable Summary

| Variable | Service | Required For |
|----------|---------|-------------|
| `DATABASE_URL` | Supabase | Runtime queries (pooler port 6543) |
| `DIRECT_URL` | Supabase | Migrations (direct port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Client SDK init |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Client SDK init |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Service-role operations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Client SDK |
| `CLERK_SECRET_KEY` | Clerk | Server SDK |
| `CLERK_WEBHOOK_SECRET` | Clerk | Webhook signature verification |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Clerk | Must be `/post-sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | Clerk | Must be `/post-sign-in` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | Client-side Stripe.js |
| `STRIPE_SECRET_KEY` | Stripe | Server-side Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signature verification |
| `STRIPE_PRICE_STARTER_MONTHLY` | Stripe | Price catalog (lazy-loaded) |
| `STRIPE_PRICE_STARTER_ANNUAL` | Stripe | Price catalog (lazy-loaded) |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Stripe | Price catalog (lazy-loaded) |
| `STRIPE_PRICE_GROWTH_ANNUAL` | Stripe | Price catalog (lazy-loaded) |
| `STRIPE_PRICE_BUSINESS_MONTHLY` | Stripe | Price catalog (lazy-loaded) |
| `STRIPE_PRICE_BUSINESS_ANNUAL` | Stripe | Price catalog (lazy-loaded) |
| `ANTHROPIC_API_KEY` | Anthropic | All AI endpoints — server-only |
| `RESEND_API_KEY` | Resend | Phase 7 email (not yet used) |
| `RESEND_FROM_EMAIL` | Resend | Phase 7 email (not yet used) |
| `NEXT_PUBLIC_APP_URL` | App | Stripe redirect URLs |
| `CRON_SECRET` | App | Phase 7 cron route auth |
| `DATABASE_URL_TEST` | Supabase | Test DB for RLS cross-org tests |
| `DIRECT_URL_TEST` | Supabase | Test DB migrations |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | Analytics (not yet active) |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog | Analytics (not yet active) |
| `SENTRY_DSN` | Sentry | Error tracking (not yet active) |

---

*Integration audit: 2026-06-04*
