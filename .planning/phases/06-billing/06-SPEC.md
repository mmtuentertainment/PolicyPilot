# Phase 6: Billing - Specification

**Created:** 2026-05-27
**Ambiguity score:** 0.170 (gate: <= 0.20)
**Requirements:** 6 locked

## Goal

A new PolicyPilot org can move from plan selection to Stripe Checkout, have Stripe webhook events sync the org's billing state into the database, and have server-side tier gates enforce the resulting plan. A Starter org attempting a Growth-only feature receives a clear 403 + upgrade path, while a paid org survives the first test-mode renewal without manual database intervention.

## Background

Phase 4 already shipped the tier-limit read path in `lib/stripe/products.ts`: `TIER_LIMITS`, `PlanTier`, `checkTierLimit`, `requireTierLimit`, typed `TierLimitExceededError`, and the 429-vs-403 distinction for usage-bound versus tier-bound features. The AI draft endpoint already gates `aiDraftsMonthly`; the consistency endpoint already gates `consistencyCheck` and returns `403 { error: 'tier_limit_exceeded', requiredTier: 'growth', upgradeUrl: '/pricing' }` for Starter orgs.

Phase 6 owns the write path. The `organizations` table already has `plan_tier`, `stripe_customer_id`, `stripe_subscription_id`, and `stripe_subscription_status`; the `stripe_events` table already exists as a service-role idempotency ledger. `app/api/webhooks/stripe/route.ts` does not exist yet. The public pricing page is currently static and links all plans to `/sign-up`; no checkout session or Customer Portal surface exists yet. `.env.local.example` already declares the Stripe secret, webhook secret, publishable key, and all six price-ID slots.

Context7 note: Stripe documentation was refreshed with `ctx7` on 2026-05-27 after Matthew's approvals. The refreshed Stripe docs confirm the raw-body signature-verification requirement, webhook-driven subscription lifecycle handling, and server-created Checkout/Customer Portal surfaces. Next.js route-shape requirements remain governed by the approved Phase 6 review direction and the project App Router conventions.

Planning reconciliation note (2026-05-28): `.planning/phases/06-billing/06-CONTEXT.md` is the authoritative HOW addendum to this SPEC. The approvals recorded in this SPEC and CONTEXT supersede older review copies that described the official `stripe` package, the additive billing-state migration, canonical Subscription retrieval, transaction-scoped webhook idempotency, or hosted cumulative `verify:phase-6` as still approval-gated.

## Requirements

1. **Stripe catalog and price-ID mapping are complete before checkout can run.**
   - Current: `reference/TIER-LIMITS.md` and `.env.local.example` name six price-ID env vars, but `lib/stripe/products.ts` only contains tier limits and no price mapping.
   - Target: Phase 6 has a server-only catalog that maps exactly six configured Stripe Price IDs to `{ tier: 'starter' | 'growth' | 'business', interval: 'monthly' | 'annual' }`. Missing, duplicate, or unknown price IDs fail closed before a checkout session or webhook mutation can proceed.
   - Acceptance: A test with all six env sentinels set proves round-trip mapping from `(tier, interval) -> priceId -> tier`; a test with an unknown price ID proves no `organizations.planTier` update occurs.

2. **Plan selection creates a checkout for the authenticated org, not for an anonymous browser.**
   - Current: `/pricing` is public static copy and every CTA points to `/sign-up`.
   - Target: Public pricing can carry non-authoritative plan intent through sign-up, but subscription creation happens only after Clerk auth + active organization context. An admin can start checkout for their current org from pricing or admin billing settings. The server derives `orgId` from `getOrgContext()`, validates admin role through `requireAdminFromCtx(ctx)`, chooses exactly one server-side price ID from the locked catalog, and creates the Checkout Session with `client_reference_id = orgId`, `metadata.policyPilotOrgId = orgId`, `subscription_data.metadata.policyPilotOrgId = orgId`, and `customer = organizations.stripeCustomerId` when already linked. The server ignores or rejects any client-supplied org ID, customer ID, subscription ID, price ID, client reference, or metadata.
   - Acceptance: A direct request that supplies a different org/customer/client reference is ignored or rejected; checkout creation for a signed-in admin uses the org from server auth context. `organizations.planTier` remains unchanged until a verified Stripe webhook arrives.

3. **The Stripe webhook is the only billing-state write source and handles all five locked events idempotently.**
   - Current: `stripe_events` exists, middleware already exempts `/api/webhooks/stripe`, and `scripts/check-db-imports.ts` allow-lists the future webhook route; no route exists yet.
   - Target: `POST /api/webhooks/stripe` lives at `app/api/webhooks/stripe/route.ts`, exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, calls `request.text()` exactly once before `stripe.webhooks.constructEvent(...)`, verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`, and deduplicates every processed `event.id` through `stripe_events` in the same DB transaction as the org mutation. For `checkout.session.completed`, `invoice.paid`, and `customer.subscription.updated`, entitlement is derived from the current Stripe Subscription retrieved through the Stripe SDK, not stale event snapshots. `customer.subscription.deleted` may use the signed event object for immediate hard downgrade only after proving it maps to exactly one org. `invoice.payment_failed` remains non-destructive for MVP.
   - Acceptance: Unit/integration tests cover all five events, signature failure, duplicate delivery, unknown price ID, missing or ambiguous org mapping, webhook replay, out-of-order delivery, and the deleted-then-stale-invoice-paid case so a canceled subscription is not accidentally re-enabled by an old invoice event.

4. **Tier gates read database state and enforce Starter/Growth/Business limits server-side.**
   - Current: `checkTierLimit` reads `organizations.planTier`; `aiDraftsMonthly` counting works; `maxUsers` currently returns `current = 0`; Starter consistency-check 403 behavior is already present in the AI endpoint.
   - Target: `checkTierLimit(orgId, feature)` continues to return `{ allowed, limit, current }` for all tier features, with real current counts for both `aiDraftsMonthly` and `maxUsers`. Tier-bound features (`consistencyCheck`, `approvalWorkflows`, `customBranding`, `sso`, `apiAccess`) return 403-style failures through `TierLimitExceededError`; usage-bound limits return 429-style failures. No route, page, or Server Action trusts client-side subscription or plan state.
   - Acceptance: Starter at 50/50 drafts returns 429; Starter attempting `consistencyCheck` returns 403 + `/pricing`; Growth allows `consistencyCheck`; Starter with 25 users returns `allowed=false` for `maxUsers`; Business returns unlimited drafts with `limit = -1`.

5. **Admin billing settings expose Stripe Customer Portal without leaking authority to the client.**
   - Current: no admin settings or billing page exists.
   - Target: An authenticated admin can open an admin billing settings surface that shows the org's current plan and subscription status from the database and creates a Stripe-hosted Customer Portal session for the org's stored `stripeCustomerId`. Employees and unauthenticated users cannot create portal sessions. The client never supplies a trusted customer ID.
   - Acceptance: Admin with a linked Stripe customer receives a portal URL; admin without a linked customer gets a clear setup/checkout prompt; employee and unauthenticated callers are denied; a forged customer ID in request input is ignored or rejected.

6. **Phase 6 ships with a real billing verification chain and a manual-safe Stripe test-mode checklist.**
   - Current: `verify:phase-6` does not exist; Phase 6 UAT is not defined.
   - Target: Phase 6 adds a `verify:phase-6` chain that includes typecheck, existing phase gates through Phase 5 as appropriate for the branch base, billing-specific unit/integration checks, webhook idempotency checks, and artifact assertions. Manual UAT uses Stripe sandbox/test-clock flows where practical and sentinel-only verification; no secret values are printed or pasted into chat.
   - Acceptance: The operator can run a checklist proving checkout -> webhook -> DB sync -> tier gate -> Customer Portal -> simulated `invoice.paid` renewal. The checklist records PASS/FAIL evidence without exposing API keys, webhook signing secrets, customer emails, or raw webhook payloads.

## Boundaries

**In scope:**
- Stripe product/price env mapping for Starter, Growth, Business x monthly, annual.
- Checkout session creation for the authenticated admin's active org.
- Public pricing page plan/interval intent, as non-authoritative input only.
- Admin billing settings page or equivalent admin billing surface.
- Customer Portal session creation for the org's stored Stripe customer.
- `POST /api/webhooks/stripe` with raw-body signature verification and all five locked events.
- Idempotency through `stripe_events` with tests proving replay safety.
- Official `stripe` npm package usage for Checkout Session creation, Customer Portal Session creation, webhook signature verification, Stripe Subscription retrieval, and typed Stripe object parsing.
- Additive organization billing-state migration for `stripePriceId`, `stripeSubscriptionItemId`, `stripeCurrentPeriodEnd`, `stripeCancelAtPeriodEnd`, and `stripeLastEventCreated`, plus unique partial indexes for `stripe_customer_id` and `stripe_subscription_id` if missing.
- `organizations.planTier`, `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripePriceId`, `stripeSubscriptionItemId`, `stripeCurrentPeriodEnd`, `stripeCancelAtPeriodEnd`, and `stripeLastEventCreated` synchronization.
- `checkTierLimit` / `requireTierLimit` correctness for `aiDraftsMonthly`, `maxUsers`, and tier-bound boolean features.
- `verify:phase-6`, billing tests, and manual Stripe test-mode UAT checklist.

**Out of scope:**
- Sales tax, coupons, trials, seat proration UX, invoice PDF generation, revenue analytics, custom dunning emails, or custom billing identity.
- Implementing the actual Growth/Business feature bodies that are not already present; Phase 6 gates them but does not build Slack, SSO, custom branding, or outbound API webhooks.
- Client-side subscription authority; client-visible plan state is display only.
- Persisting invoice history, raw Stripe payloads, webhook secrets, API keys, full invoice payloads, customer email, or full raw customer identifiers for display.
- Production migration/backfill of existing Stripe customers; Phase 6 may define an operator checklist but does not silently mutate production data.
- Replacing Clerk org membership with a custom billing identity model.

## Constraints

- Stripe signature verification MUST use the raw body (`request.text()`) before any JSON parse.
- Webhook route MUST be public from Clerk's perspective but authenticated by Stripe signature only.
- All billing writes MUST be server-side. Secret keys and webhook secrets stay server-only and are never echoed in logs, tests, or chat.
- The official `stripe` package and the minimal additive organization billing-state migration are approved for Phase 6. Any additional package, schema, security, or product-scope change still requires operator approval.
- `customer.subscription.deleted` is an immediate hard downgrade to Starter for MVP. No grace period is implied.
- `invoice.payment_failed` sets `past_due` but does not downgrade `planTier`; access remains governed by `planTier` until Stripe sends `subscription.updated` or `subscription.deleted`.
- Unknown price IDs, missing metadata, multi-org ambiguity, and unlinked Stripe customers fail closed with no plan-tier mutation.
- If webhook dispatch is extracted into `lib/stripe/webhooks.ts`, the raw-DB allow-list must remain explicit and pass `scripts/check-db-imports.ts`; no hidden raw `db` importer is allowed.
- Middleware remains auth/role routing only. Tier gating stays in application routes, Server Components, or server helpers per ADR-024.
- `pnpm tsc --noEmit` and `pnpm verify:phase-6` must exit 0 before Phase 6 closeout.

## Approved Phase 6 Implementation Decisions

Matthew approved both previously approval-gated Phase 6 decisions:

1. The official `stripe` npm package MAY be added and used for:
   - Checkout Session creation
   - Customer Portal Session creation
   - webhook signature verification
   - Stripe Subscription retrieval
   - typed Stripe object parsing in tests and handlers

2. A minimal DB schema migration MAY be added for durable billing state. The migration MUST be additive only and MUST NOT edit an already-registered migration.

Approved organization billing columns:

- `stripe_price_id text null`
- `stripe_subscription_item_id text null`
- `stripe_current_period_end timestamptz null`
- `stripe_cancel_at_period_end boolean not null default false`
- `stripe_last_event_created timestamptz null`

Approved constraints / indexes:

- Keep `organizations.stripe_customer_id` nullable but add a unique partial index where not null, unless one already exists.
- Keep `organizations.stripe_subscription_id` nullable but add a unique partial index where not null, unless one already exists.
- Do not store customer email, raw Stripe payloads, webhook secrets, API keys, or full invoice payloads.
- `stripe_last_event_created` is for observability and defensive debugging only. Entitlement MUST still be derived from the current validated Stripe Subscription, not from event snapshots alone.

## Billing Correctness Rules

### Stripe-to-org linkage

Checkout creation MUST happen server-side after:

- `getOrgContext()`
- server-side active org resolution
- admin authorization via `requireAdminFromCtx(ctx)`

The browser may submit only non-authoritative intent:

```ts
{
  tier: 'starter' | 'growth' | 'business',
  interval: 'monthly' | 'annual'
}
```

Checkout Session creation MUST set:

- `mode: 'subscription'`
- exactly one server-derived Price ID from the locked Phase 6 catalog
- `client_reference_id = orgId`
- `metadata.policyPilotOrgId = orgId`
- `subscription_data.metadata.policyPilotOrgId = orgId`
- `customer = organizations.stripeCustomerId` when present

The server MUST ignore or reject any client-supplied org ID, customer ID, subscription ID, price ID, client reference, or metadata.

Checkout creation MUST reject or redirect to Customer Portal when the org already has a linked subscription in `active`, `trialing`, or `past_due` status. Phase 6 does not implement custom upgrade/downgrade flows outside Stripe Portal. A fresh Checkout Session may be offered only when no subscription is linked or the current stored subscription state is non-entitling.

### Webhook canonical state

For these events, entitlement MUST be derived from the current Stripe Subscription retrieved through the Stripe SDK:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`

`invoice.paid` MUST NOT blindly reactivate an org. It may set `stripeSubscriptionStatus = 'active'` only after retrieving the current subscription and proving:

- the subscription maps to exactly one PolicyPilot org;
- the subscription ID matches the org's stored `stripeSubscriptionId` or trusted server-created metadata;
- the subscription has exactly one recognized recurring Price ID;
- the subscription status is entitlement-eligible.

`customer.subscription.deleted` MAY use the signed event object to hard-downgrade immediately, but it MUST still verify that the subscription maps to exactly one org before mutating state.

Unknown price IDs, missing trusted metadata, missing subscription, missing customer, zero org matches, or multiple org matches MUST fail closed with no `planTier` upgrade.

### Subscription entitlement status policy

Phase 6 entitlement state is stored in `organizations` and may be mutated only by verified Stripe webhooks.

Status handling:

- `active`: sync `planTier`, `stripePriceId`, `stripeSubscriptionItemId`, `stripeCurrentPeriodEnd`, and `stripeCancelAtPeriodEnd` from the current Stripe Subscription.
- `trialing`: sync the same fields as `active` if Stripe returns a recognized Phase 6 Price ID.
- `past_due`: preserve the last known paid `planTier`, set `stripeSubscriptionStatus = 'past_due'`, and sync diagnostic subscription fields when available.
- `incomplete`: link the customer/subscription only if org mapping is unambiguous; do not upgrade `planTier`.
- `unpaid`, `canceled`, `incomplete_expired`, and `paused`: set `planTier = 'starter'`, set `stripeSubscriptionStatus` to the Stripe status, and sync diagnostic fields when available.

`active` or `trialing` with `cancel_at_period_end = true` remains entitling. The UI may show scheduled-cancel state, but the webhook MUST NOT downgrade until the current Subscription reports a non-entitling status or `customer.subscription.deleted` maps exactly to the org.

`invoice.payment_failed` remains non-destructive for MVP:

- set `stripeSubscriptionStatus = 'past_due'`;
- do not downgrade `planTier`;
- do not clear `stripePriceId` or subscription IDs.

Later `customer.subscription.updated` or `customer.subscription.deleted` events may downgrade according to the status policy above.

### Organization billing columns

Phase 6 MUST add an additive migration for the approved durable billing fields:

```ts
stripePriceId: text('stripe_price_id')
stripeSubscriptionItemId: text('stripe_subscription_item_id')
stripeCurrentPeriodEnd: timestamp('stripe_current_period_end', { withTimezone: true })
stripeCancelAtPeriodEnd: boolean('stripe_cancel_at_period_end').notNull().default(false)
stripeLastEventCreated: timestamp('stripe_last_event_created', { withTimezone: true })
```

When syncing from a current Stripe Subscription, the handler MUST persist:

- `stripeCustomerId`
- `stripeSubscriptionId`
- `stripeSubscriptionStatus`
- `stripePriceId`
- `stripeSubscriptionItemId`
- `stripeCurrentPeriodEnd`
- `stripeCancelAtPeriodEnd`
- `stripeLastEventCreated`
- `planTier`

The active Price ID remains the authority for tier mapping. `planTier` is the app's cached entitlement field used by tier gates.

### Webhook idempotency transaction rule

After signature verification and required Stripe API re-fetches, each event MUST be processed in one DB transaction:

1. Attempt to insert `stripe_events.id = event.id`.
2. If the insert conflicts, return `200` with no org mutation.
3. If the insert succeeds, apply the validated org billing mutation in the same transaction.
4. If any org mutation fails, roll back the `stripe_events` insert so Stripe retry can reprocess the event.

The `stripe_events.id` dedupe is necessary for Stripe retry replay, but the billing mutation MUST also be idempotent for distinct Stripe Event IDs that reference the same underlying customer/subscription and event type. In that case, the final org state MUST still equal the canonical current Stripe Subscription state.

The handler MUST never log:

- raw webhook payloads
- Stripe API keys
- webhook signing secrets
- customer emails
- full customer IDs in plain text

### Stripe webhook route shape

The Stripe webhook MUST live at:

```text
app/api/webhooks/stripe/route.ts
```

It MUST export:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // request.text() before Stripe signature verification
}
```

The handler MUST call `request.text()` exactly once before `stripe.webhooks.constructEvent(...)`.

Do not call `request.json()` before signature verification.
Do not put billing authority in middleware.

### Customer Portal

Admin Customer Portal creation MUST:

- require authenticated admin org context;
- use only `organizations.stripeCustomerId`;
- ignore/reject client-supplied customer IDs;
- create a fresh Stripe Customer Portal Session on demand;
- return or redirect to the short-lived Stripe portal URL;
- show a checkout/setup prompt when no customer is linked.

The admin billing page may display:

- current plan
- subscription status
- current period end
- cancel-at-period-end state
- "Manage billing" when a linked customer exists
- checkout/setup CTA when no linked customer exists

Do not display invoice history or raw billing identities in Phase 6.

### Phase 6 verification and UAT

`pnpm verify:phase-6` MUST run:

```bash
pnpm tsc --noEmit
pnpm verify:phase-5
pnpm test -- --run lib/stripe
pnpm test -- --run app/api/webhooks/stripe
pnpm db:verify
pnpm check:artifacts
```

The PR hosted gate MUST include a required full verification job on pull requests and pushes.

Manual Stripe sandbox/test-clock UAT MUST prove:

- checkout creates a subscription for the authenticated org
- webhook syncs DB billing state
- `planTier` gates change only after verified webhook processing
- Customer Portal opens for linked admin/customer
- simulated renewal produces expected `invoice.paid`
- failed payment produces `past_due` without immediate downgrade
- canceled/unpaid state downgrades to Starter

UAT evidence may include:

- PASS/FAIL
- masked org ID
- masked customer ID
- masked subscription ID
- Stripe event ID
- event type
- observed DB status/tier

UAT evidence MUST NOT include:

- API keys
- webhook secrets
- raw payloads
- customer email
- full customer IDs

## Acceptance Criteria

- [ ] Six Stripe price IDs are mapped exactly once: Starter monthly/annual, Growth monthly/annual, Business monthly/annual.
- [ ] Missing or duplicate Stripe price configuration fails startup/test verification without printing secret values.
- [ ] The official `stripe` package is added and used server-side for Checkout, Customer Portal, webhook verification, subscription retrieval, and typed handler/test parsing.
- [ ] An additive migration adds the five approved organization billing fields and nullable unique partial indexes for linked Stripe customer/subscription IDs when missing.
- [ ] Public pricing exposes monthly/annual plan intent but does not create a trusted subscription for an anonymous browser.
- [ ] Authenticated admin checkout creation uses server-side org context and cannot be forged to bill another org.
- [ ] Checkout Session creation sets `client_reference_id`, session metadata, and subscription metadata from server-derived `orgId`.
- [ ] Checkout success does not change `organizations.planTier` until a verified webhook is processed.
- [ ] Checkout creation rejects or redirects to Customer Portal when the org already has a linked active/trialing/past_due subscription.
- [ ] `POST /api/webhooks/stripe` rejects invalid signatures before parsing JSON.
- [ ] Duplicate webhook delivery for the same Stripe `event.id` produces no duplicate org mutation.
- [ ] Two different Stripe event IDs for the same underlying subscription/customer and same event type leave org state equal to the canonical current Subscription state.
- [ ] `checkout.session.completed` links customer/subscription and sets `planTier` only after current Subscription retrieval proves a recognized recurring Price ID and unambiguous org mapping.
- [ ] `invoice.paid` re-fetches the current Subscription and never blindly reactivates a stale or canceled org.
- [ ] `invoice.payment_failed` sets `stripeSubscriptionStatus = 'past_due'` and leaves `planTier` unchanged.
- [ ] `customer.subscription.deleted` verifies exactly one org mapping, sets `stripeSubscriptionStatus = 'canceled'`, and downgrades `planTier = 'starter'`.
- [ ] `customer.subscription.updated` syncs tier, subscription status, Price ID, subscription item ID, current period end, cancel-at-period-end, and last-event-created fields from the current Subscription.
- [ ] Active/trialing subscriptions with `cancel_at_period_end = true` remain paid until Stripe reports a non-entitling status or a verified deletion event.
- [ ] Unknown price ID or ambiguous org mapping logs a sanitized failure and leaves org billing state unchanged.
- [ ] `checkTierLimit` returns real current counts for `aiDraftsMonthly` and `maxUsers`.
- [ ] Starter consistency-check attempt returns 403 with `error: 'tier_limit_exceeded'` and `upgradeUrl: '/pricing'`.
- [ ] Growth consistency-check attempt is allowed when `organizations.planTier = 'growth'`.
- [ ] Admin Customer Portal creation returns a Stripe-hosted portal URL for the org's stored customer.
- [ ] Employee/unauthenticated portal or checkout session creation is denied.
- [ ] Stripe sandbox/test-clock UAT proves checkout -> webhook -> DB sync -> tier gate -> portal -> simulated renewal/payment-failure handling.
- [ ] `pnpm verify:phase-6` exits 0.

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes |
|---------------------|-------|------|--------|-------|
| Goal Clarity        | 0.87  | 0.75 | met    | ROADMAP Phase 6 gives five concrete success criteria; this SPEC expands them into six testable requirements. |
| Boundary Clarity    | 0.84  | 0.70 | met    | Explicitly separates billing gates from unbuilt Growth/Business feature bodies, dunning, taxes, and non-approved schema expansion. |
| Constraint Clarity  | 0.75  | 0.65 | met    | Raw-body webhook, no client trust, approved minimal schema/package change, and hard downgrade behavior are locked. |
| Acceptance Criteria | 0.83  | 0.70 | met    | Criteria cover config, checkout, webhook events, idempotency, tier gates, portal, and UAT. |
| **Ambiguity**       | 0.170 | <=0.20 | met | `1 - (0.35*0.87 + 0.25*0.84 + 0.20*0.75 + 0.20*0.83)` |

Status: `met` = dimension meets the workflow minimum.

## Interview Log

Initial ambiguity was already <= 0.20 after codebase scout, so no blocking user questions were required. The interview loop collapsed to a non-interactive Round 0 using locked project artifacts: `.planning/ROADMAP.md` Phase 6, `.planning/STATE.md` Phase 6 entry, ADR-013/017/020/024, `reference/TIER-LIMITS.md`, `reference/API-SPEC.md`, current `lib/stripe/products.ts`, current schema, and the wiki billing entities.

| Round | Perspective | Decision locked |
|-------|-------------|-----------------|
| 0 | Researcher | Existing schema has baseline Stripe org fields and `stripe_events`; Matthew later approved the smallest useful additive schema delta for durable subscription state. |
| 0 | Boundary Keeper | Checkout may start from pricing/settings, but the trusted checkout creation boundary is authenticated admin + active org context. Public plan intent is never authoritative. |
| 0 | Security Reviewer | Stripe webhook must verify raw body before parse, dedupe by `event.id`, sanitize logs, and fail closed on unknown price IDs or ambiguous org mapping. |
| 0 | Product Owner | `customer.subscription.deleted` hard-downgrades to Starter in MVP; `invoice.payment_failed` records `past_due` but does not itself downgrade. |
| 0 | Test Designer | Phase 6 needs its own verify chain plus a Stripe test-mode UAT path that proves first renewal and tier-gate behavior without exposing secrets. |
| 0 | Tooling | Stripe docs were refreshed with `ctx7` on 2026-05-27; implementation planning should still keep SDK call syntax grounded in current docs and tests. |

---

*Phase: 06-billing*
*Spec created: 2026-05-27*
*Next step: /gsd-plan-phase 6 - use this SPEC plus `06-CONTEXT.md` as the authoritative planning inputs. Stripe SDK/package approval, the minimal additive billing-state migration, canonical Subscription retrieval, transaction-scoped webhook idempotency, and hosted cumulative verification are no longer blocking questions.*
