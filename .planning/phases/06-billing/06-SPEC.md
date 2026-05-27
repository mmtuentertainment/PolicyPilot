# Phase 6: Billing - Specification

**Created:** 2026-05-27
**Ambiguity score:** 0.170 (gate: <= 0.20)
**Requirements:** 6 locked

## Goal

A new PolicyPilot org can move from plan selection to Stripe Checkout, have Stripe webhook events sync the org's billing state into the database, and have server-side tier gates enforce the resulting plan. A Starter org attempting a Growth-only feature receives a clear 403 + upgrade path, while a paid org survives the first test-mode renewal without manual database intervention.

## Background

Phase 4 already shipped the tier-limit read path in `lib/stripe/products.ts`: `TIER_LIMITS`, `PlanTier`, `checkTierLimit`, `requireTierLimit`, typed `TierLimitExceededError`, and the 429-vs-403 distinction for usage-bound versus tier-bound features. The AI draft endpoint already gates `aiDraftsMonthly`; the consistency endpoint already gates `consistencyCheck` and returns `403 { error: 'tier_limit_exceeded', requiredTier: 'growth', upgradeUrl: '/pricing' }` for Starter orgs.

Phase 6 owns the write path. The `organizations` table already has `plan_tier`, `stripe_customer_id`, `stripe_subscription_id`, and `stripe_subscription_status`; the `stripe_events` table already exists as a service-role idempotency ledger. `app/api/webhooks/stripe/route.ts` does not exist yet. The public pricing page is currently static and links all plans to `/sign-up`; no checkout session or Customer Portal surface exists yet. `.env.local.example` already declares the Stripe secret, webhook secret, publishable key, and all six price-ID slots.

Context7 note: the required Stripe documentation lookup failed with a monthly quota error on 2026-05-27. This SPEC therefore locks product and repository requirements from PolicyPilot's local source-of-truth files only. Discuss/plan phase must refresh Stripe API syntax with Context7 once quota or authentication is available before choosing SDK calls or webhook parsing details.

## Requirements

1. **Stripe catalog and price-ID mapping are complete before checkout can run.**
   - Current: `reference/TIER-LIMITS.md` and `.env.local.example` name six price-ID env vars, but `lib/stripe/products.ts` only contains tier limits and no price mapping.
   - Target: Phase 6 has a server-only catalog that maps exactly six configured Stripe Price IDs to `{ tier: 'starter' | 'growth' | 'business', interval: 'monthly' | 'annual' }`. Missing, duplicate, or unknown price IDs fail closed before a checkout session or webhook mutation can proceed.
   - Acceptance: A test with all six env sentinels set proves round-trip mapping from `(tier, interval) -> priceId -> tier`; a test with an unknown price ID proves no `organizations.planTier` update occurs.

2. **Plan selection creates a checkout for the authenticated org, not for an anonymous browser.**
   - Current: `/pricing` is public static copy and every CTA points to `/sign-up`.
   - Target: Public pricing can carry non-authoritative plan intent through sign-up, but subscription creation happens only after Clerk auth + active organization context. An admin can start checkout for their current org from pricing or admin billing settings. The server derives `orgId` from `getOrgContext()`, validates admin role, chooses the server-side price ID from the locked catalog, and stores enough Stripe metadata or customer linkage for the webhook to update exactly one org.
   - Acceptance: A direct request that supplies a different org/customer/client reference is ignored or rejected; checkout creation for a signed-in admin uses the org from server auth context. `organizations.planTier` remains unchanged until a verified Stripe webhook arrives.

3. **The Stripe webhook is the only billing-state write source and handles all five locked events idempotently.**
   - Current: `stripe_events` exists, middleware already exempts `/api/webhooks/stripe`, and `scripts/check-db-imports.ts` allow-lists the future webhook route; no route exists yet.
   - Target: `POST /api/webhooks/stripe` reads `request.text()` before parsing, verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`, deduplicates every processed `event.id` through `stripe_events`, and handles:
     - `checkout.session.completed`: link Stripe customer/subscription to the org and set `planTier` from the purchased price.
     - `invoice.paid`: set `stripeSubscriptionStatus = 'active'`, clear the prior payment-failed state, and preserve the synced tier.
     - `invoice.payment_failed`: set `stripeSubscriptionStatus = 'past_due'` without mutating `planTier`.
     - `customer.subscription.deleted`: set `stripeSubscriptionStatus = 'canceled'` and hard-downgrade `planTier = 'starter'`.
     - `customer.subscription.updated`: sync `planTier` and `stripeSubscriptionStatus` from the current subscription price/status.
   - Acceptance: Unit/integration tests cover all five events, signature failure, duplicate delivery, unknown price ID, and the deleted-then-stale-invoice-paid case so a canceled subscription is not accidentally re-enabled by an old invoice event.

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
   - Target: Phase 6 adds a `verify:phase-6` chain that includes typecheck, existing phase gates through Phase 5 as appropriate for the branch base, billing-specific unit/integration checks, webhook idempotency checks, and artifact assertions. Manual UAT uses Stripe test mode and sentinel-only verification; no secret values are printed or pasted into chat.
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
- `organizations.planTier`, `stripeCustomerId`, `stripeSubscriptionId`, and `stripeSubscriptionStatus` synchronization.
- `checkTierLimit` / `requireTierLimit` correctness for `aiDraftsMonthly`, `maxUsers`, and tier-bound boolean features.
- `verify:phase-6`, billing tests, and manual Stripe test-mode UAT checklist.

**Out of scope:**
- Sales tax, coupons, trials, seat proration UX, invoice PDF generation, revenue analytics, or custom dunning emails.
- Implementing the actual Growth/Business feature bodies that are not already present; Phase 6 gates them but does not build Slack, SSO, custom branding, or outbound API webhooks.
- Client-side subscription authority; client-visible plan state is display only.
- Persisting Stripe current-period timestamps or invoice history unless discuss-phase obtains explicit operator approval for a schema change.
- Production migration/backfill of existing Stripe customers; Phase 6 may define an operator checklist but does not silently mutate production data.
- Replacing Clerk org membership with a custom billing identity model.

## Constraints

- Stripe signature verification MUST use the raw body (`request.text()`) before any JSON parse.
- Webhook route MUST be public from Clerk's perspective but authenticated by Stripe signature only.
- All billing writes MUST be server-side. Secret keys and webhook secrets stay server-only and are never echoed in logs, tests, or chat.
- Adding the `stripe` package or any package not already in `package.json` requires operator approval before implementation.
- No DB schema change is approved by this SPEC. If plan/discuss discovers the existing columns cannot satisfy a requirement, it must stop for operator approval.
- `customer.subscription.deleted` is an immediate hard downgrade to Starter for MVP. No grace period is implied.
- `invoice.payment_failed` sets `past_due` but does not downgrade `planTier`; access remains governed by `planTier` until Stripe sends `subscription.updated` or `subscription.deleted`.
- Unknown price IDs, missing metadata, multi-org ambiguity, and unlinked Stripe customers fail closed with no plan-tier mutation.
- If webhook dispatch is extracted into `lib/stripe/webhooks.ts`, the raw-DB allow-list must remain explicit and pass `scripts/check-db-imports.ts`; no hidden raw `db` importer is allowed.
- Middleware remains auth/role routing only. Tier gating stays in application routes, Server Components, or server helpers per ADR-024.
- `pnpm tsc --noEmit` and `pnpm verify:phase-6` must exit 0 before Phase 6 closeout.

## Acceptance Criteria

- [ ] Six Stripe price IDs are mapped exactly once: Starter monthly/annual, Growth monthly/annual, Business monthly/annual.
- [ ] Missing or duplicate Stripe price configuration fails startup/test verification without printing secret values.
- [ ] Public pricing exposes monthly/annual plan intent but does not create a trusted subscription for an anonymous browser.
- [ ] Authenticated admin checkout creation uses server-side org context and cannot be forged to bill another org.
- [ ] Checkout success does not change `organizations.planTier` until a verified webhook is processed.
- [ ] `POST /api/webhooks/stripe` rejects invalid signatures before parsing JSON.
- [ ] Duplicate webhook delivery for the same Stripe `event.id` produces no duplicate org mutation.
- [ ] `checkout.session.completed` links customer/subscription and sets `planTier` from a known price ID.
- [ ] `invoice.paid` sets `stripeSubscriptionStatus = 'active'` and preserves the paid tier.
- [ ] `invoice.payment_failed` sets `stripeSubscriptionStatus = 'past_due'` and leaves `planTier` unchanged.
- [ ] `customer.subscription.deleted` sets `stripeSubscriptionStatus = 'canceled'` and downgrades `planTier = 'starter'`.
- [ ] `customer.subscription.updated` syncs both tier and subscription status from the current subscription state.
- [ ] Unknown price ID or ambiguous org mapping logs a sanitized failure and leaves org billing state unchanged.
- [ ] `checkTierLimit` returns real current counts for `aiDraftsMonthly` and `maxUsers`.
- [ ] Starter consistency-check attempt returns 403 with `error: 'tier_limit_exceeded'` and `upgradeUrl: '/pricing'`.
- [ ] Growth consistency-check attempt is allowed when `organizations.planTier = 'growth'`.
- [ ] Admin Customer Portal creation returns a Stripe-hosted portal URL for the org's stored customer.
- [ ] Employee/unauthenticated portal or checkout session creation is denied.
- [ ] Stripe test-mode UAT proves checkout -> webhook -> DB sync -> tier gate -> portal -> simulated renewal.
- [ ] `pnpm verify:phase-6` exits 0.

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes |
|---------------------|-------|------|--------|-------|
| Goal Clarity        | 0.87  | 0.75 | met    | ROADMAP Phase 6 gives five concrete success criteria; this SPEC expands them into six testable requirements. |
| Boundary Clarity    | 0.84  | 0.70 | met    | Explicitly separates billing gates from unbuilt Growth/Business feature bodies, dunning, taxes, and schema changes. |
| Constraint Clarity  | 0.75  | 0.65 | met    | Raw-body webhook, no client trust, no schema change, no unapproved package, and hard downgrade behavior are locked. |
| Acceptance Criteria | 0.83  | 0.70 | met    | Criteria cover config, checkout, webhook events, idempotency, tier gates, portal, and UAT. |
| **Ambiguity**       | 0.170 | <=0.20 | met | `1 - (0.35*0.87 + 0.25*0.84 + 0.20*0.75 + 0.20*0.83)` |

Status: `met` = dimension meets the workflow minimum.

## Interview Log

Initial ambiguity was already <= 0.20 after codebase scout, so no blocking user questions were required. The interview loop collapsed to a non-interactive Round 0 using locked project artifacts: `.planning/ROADMAP.md` Phase 6, `.planning/STATE.md` Phase 6 entry, ADR-013/017/020/024, `reference/TIER-LIMITS.md`, `reference/API-SPEC.md`, current `lib/stripe/products.ts`, current schema, and the wiki billing entities.

| Round | Perspective | Decision locked |
|-------|-------------|-----------------|
| 0 | Researcher | Existing schema already has the Stripe-owned org fields and `stripe_events`; Phase 6 should avoid schema changes unless discuss-phase proves the current contract insufficient. |
| 0 | Boundary Keeper | Checkout may start from pricing/settings, but the trusted checkout creation boundary is authenticated admin + active org context. Public plan intent is never authoritative. |
| 0 | Security Reviewer | Stripe webhook must verify raw body before parse, dedupe by `event.id`, sanitize logs, and fail closed on unknown price IDs or ambiguous org mapping. |
| 0 | Product Owner | `customer.subscription.deleted` hard-downgrades to Starter in MVP; `invoice.payment_failed` records `past_due` but does not itself downgrade. |
| 0 | Test Designer | Phase 6 needs its own verify chain plus a Stripe test-mode UAT path that proves first renewal and tier-gate behavior without exposing secrets. |
| 0 | Tooling | Context7 Stripe doc refresh is blocked by monthly quota; plan/discuss must retry docs before implementation details are selected. |

---

*Phase: 06-billing*
*Spec created: 2026-05-27*
*Next step: /gsd-discuss-phase 6 - implementation decisions for checkout route shape, Stripe SDK/package approval, webhook transaction/idempotency ordering, admin billing UI placement, fixture strategy, and test-mode UAT checklist.*
