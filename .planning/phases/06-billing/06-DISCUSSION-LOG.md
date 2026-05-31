# Phase 6: Billing - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-27T23:51:45-04:00
**Phase:** 06-billing
**Areas discussed:** Package and module shape, Stripe catalog and checkout, durable billing state, webhook correctness, admin billing UI and portal, tier gates, testing and UAT

---

## Package And Module Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Official `stripe` SDK only | Add the approved backend SDK; no Stripe.js or extra billing packages. | yes |
| Mixed Stripe SDK plus browser Stripe.js | Useful for custom payment UIs, but unnecessary for hosted Checkout. | |
| Defer SDK and use raw HTTP | Avoids package add but loses typed objects and signature helper. | |

**User's choice:** Matthew already approved the official `stripe` package.
**Notes:** Keep all Stripe SDK usage server-only. Stripe MCP remains optional tooling, not a runtime or planning dependency.

---

## Stripe Catalog And Checkout

| Option | Description | Selected |
|--------|-------------|----------|
| Public pricing intent plus admin checkout | Public `/pricing` carries `tier`/`interval`; trusted checkout creation occurs after admin auth/org context. | yes |
| Public pricing creates checkout directly | Faster path, but risks mixing anonymous/browser state with billing authority. | |
| Admin settings only, no pricing intent | Safe but weakens the sign-up plan-selection flow. | |

**User's choice:** Use public pricing as non-authoritative intent and the admin billing/settings surface as the trusted checkout launch point.
**Notes:** Checkout must set server-derived `client_reference_id`, session metadata, and subscription metadata. Existing customer ID is passed only from DB when present.

---

## Durable Billing State

| Option | Description | Selected |
|--------|-------------|----------|
| Approved minimal migration | Add five organization billing fields plus nullable partial unique indexes. | yes |
| No schema change | Previously blocked path; now insufficient for durable subscription sync. | |
| Larger billing schema | More flexible but outside Phase 6 MVP and approval. | |

**User's choice:** Matthew approved the smallest useful additive schema delta.
**Notes:** New migration must be forward-only after `0011_qa_citation_grants`; no existing migration may be edited.

---

## Webhook Correctness

| Option | Description | Selected |
|--------|-------------|----------|
| Current Subscription is canonical | Re-fetch current Subscription for entitlement events and fail closed on ambiguous mapping. | yes |
| Trust event snapshot fields | Simpler, but unsafe with stale/out-of-order webhook delivery. | |
| Store raw payload snapshots | Useful for forensics but explicitly out of scope and sensitive. | |

**User's choice:** Entitlement comes from current Stripe Subscription for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.updated`.
**Notes:** `customer.subscription.deleted` may hard-downgrade from the signed event only after exact org mapping. `invoice.payment_failed` remains non-destructive.

---

## Admin Billing UI And Portal

| Option | Description | Selected |
|--------|-------------|----------|
| Enable Settings as billing home | Reuses the existing disabled Phase 6 sidebar item and admin shell. | yes |
| Add a new Billing top-level nav item | Clearer label but creates a new nav pattern. | |
| Keep billing hidden behind pricing only | Too hard for admins to manage subscriptions after checkout. | |

**User's choice:** Use the Settings placeholder as the Phase 6 admin billing home.
**Notes:** Page displays current plan/status/period/cancel state and a Manage billing or checkout/setup action. Customer Portal uses only DB-stored customer ID.

---

## Tier Gates

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing tier helpers | Preserve Phase 4 `lib/stripe/products.ts` authority and response shape. | yes |
| New parallel billing gate module | More separation but risks two sources of tier truth. | |
| Middleware tier gating | Explicitly rejected by ADR-024. | |

**User's choice:** Extend `checkTierLimit`/`requireTierLimit` in the existing app-layer pattern.
**Notes:** `maxUsers` must become a real count. Clerk webhook rejection/user invite management remains out of scope unless a first-party user creation path exists.

---

## Testing And UAT

| Option | Description | Selected |
|--------|-------------|----------|
| Mocked automated tests plus Stripe sandbox UAT | Deterministic CI with real Stripe proof in manual sandbox/test-clock flow. | yes |
| Live Stripe calls in automated tests | Higher fidelity but brittle and secret-dependent. | |
| Manual UAT only | Too risky for webhook replay and out-of-order cases. | |

**User's choice:** Automated tests mock Stripe SDK boundaries; manual UAT uses sandbox/test-clock flows.
**Notes:** `verify:phase-6` must chain Phase 5, run billing tests, run DB schema verification, and participate in the hosted PR/push gate.

---

## Claude's Discretion

- Exact helper names and module split inside `lib/stripe/*`.
- Exact billing settings page layout/copy within the locked minimal information set.
- Exact test fixture organization and factory names.

## Deferred Ideas

- Tax, coupons, trials, custom dunning, invoice PDFs, revenue analytics, custom billing identity.
- First-party user invitation/seat-management flow.
- Invoice history inside PolicyPilot.
- Production backfill of pre-existing Stripe customers.
