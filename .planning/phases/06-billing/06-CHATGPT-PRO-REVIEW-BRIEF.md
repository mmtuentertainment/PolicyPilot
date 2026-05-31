# Phase 6 Billing - ChatGPT Pro Review Brief

**Prepared:** 2026-05-27
**Repo:** `C:\Users\matth\Desktop\PolicyPilot`
**Branch:** `gsd/phase-6-billing`
**Primary spec:** `.planning/phases/06-billing/06-SPEC.md`
**Purpose:** Give ChatGPT Pro a focused, evidence-backed package to review the Phase 6 Billing spec and repo state, then recommend best-practice optimizations before discuss/plan/execute.

## Context7 Status

The local project rule says to use Context7 for current library/framework/SDK/API/cloud-service docs. The original preparation attempt hit a monthly quota error, but the Phase 6 amendment pass refreshed Stripe docs successfully on 2026-05-27:

```powershell
npx ctx7@latest library Stripe "Update Phase 6 spec and plan with Matthew's approvals: add official stripe package, additive billing-state migration on organizations, Stripe Checkout client_reference_id and subscription_data.metadata org linkage, webhook signature verification raw request body, canonical subscription state from current Stripe Subscription, Customer Portal, Billing test clocks and subscription status handling"
npx ctx7@latest docs /websites/stripe "Update Phase 6 spec and plan with Matthew's approvals: add official stripe package, additive billing-state migration on organizations, Stripe Checkout client_reference_id and subscription_data.metadata org linkage, webhook signature verification raw request body, canonical subscription state from current Stripe Subscription, Customer Portal short-lived sessions, Billing test clocks and subscription status handling"
```

Result: `/websites/stripe` was selected as the best official Stripe documentation source. The docs reinforced raw-body signature verification, subscription lifecycle webhook handling, and server-created billing surfaces. Next.js route-handler details remain anchored by the approved review direction and project App Router conventions.

## Paste This Into ChatGPT Pro

```text
You are reviewing PolicyPilot, a Next.js 15 App Router + TypeScript + Supabase/Postgres + Drizzle + Clerk + Stripe SaaS repo. Date for current best-practice review: 2026-05-27.

Goal: Review the repo and the Phase 6 Billing spec before implementation. Optimize the spec and upcoming plan for Stripe Checkout, Stripe webhooks, Customer Portal, tier gating, multi-tenancy, security, testing, and Next.js App Router best practices. Be strict, concrete, and evidence-backed.

Repository path: C:\Users\matth\Desktop\PolicyPilot
Branch: gsd/phase-6-billing
Primary spec: .planning/phases/06-billing/06-SPEC.md

Review rules:
- Do not assume client-side subscription state is trusted. Billing authority must be server-side and database-backed.
- Treat the official `stripe` package and the minimal additive organization billing-state migration as Matthew-approved. Mark any additional package, schema, security, or architecture change as "requires Matthew approval".
- Do not introduce unlisted product scope such as tax, coupons, trials, revenue analytics, dunning emails, or custom billing identity unless you mark it out-of-scope or approval-gated.
- Treat ADRs in .planning/PROJECT.md as locked unless you explicitly identify a conflict and propose an approval path.
- Protect secrets. Do not ask for or print Stripe keys, webhook secrets, customer emails, or raw webhook payloads.
- Use current official docs for Stripe and Next.js before making API-syntax claims.

Read these files first, in order:
1. .planning/phases/06-billing/06-SPEC.md
2. AGENTS.md
3. .planning/PROJECT.md
4. .planning/ROADMAP.md lines around Phase 6
5. reference/TIER-LIMITS.md
6. reference/API-SPEC.md
7. reference/SCHEMA.md
8. lib/db/schema.ts
9. lib/stripe/products.ts
10. lib/stripe/errors.ts
11. lib/stripe/products.test.ts
12. app/api/ai/draft/route.ts
13. app/api/ai/consistency/route.ts
14. app/(marketing)/pricing/page.tsx
15. app/api/webhooks/clerk/route.ts as the existing webhook/idempotency analog
16. scripts/check-db-imports.ts
17. scripts/check-artifacts.ts
18. package.json
19. .env.local.example

Deliver a review with:
1. Executive verdict: keep spec as-is, amend before discuss-phase, or block until questions are answered.
2. Top findings ranked P0/P1/P2 with file/section references.
3. Best-practice gaps against current Stripe and Next.js docs.
4. Proposed SPEC amendments as copy-paste Markdown bullets or a patch-style section.
5. Proposed discuss-phase questions Matthew should answer.
6. Proposed implementation plan outline: modules/files, sequence, validation gates, and manual UAT.
7. Testing strategy: unit, integration, webhook replay/idempotency, out-of-order events, Stripe test clocks/sandbox, and no-secret evidence capture.
8. Explicit "requires approval" list for any additional package, schema, architecture, security, or product-scope change beyond the approved Stripe SDK and minimal billing-state migration.
9. A concise final recommendation for what Codex should do next.

Areas to stress-test:
- Treat current_period_end, price_id, subscription item id, cancel_at_period_end, and last event timestamp as approved minimal organization billing fields; stress-test whether any further state is required and mark only extra state as approval-gated.
- Whether hard downgrade on customer.subscription.deleted and no downgrade on invoice.payment_failed are good MVP decisions.
- Verify that `invoice.paid` always re-derives entitlement from the current Stripe Subscription and never blindly preserves or reactivates stale tier state.
- Out-of-order and duplicate webhook delivery, including stale invoice.paid after cancellation and subscription.updated after checkout.
- Atomic idempotency ordering: insert event before dispatch, after dispatch, or with transactional status tracking.
- How to map Stripe customer/subscription to exactly one Clerk/Supabase org without trusting client metadata.
- How to handle unknown price IDs, missing metadata, missing customer, missing subscription, and multi-org ambiguity.
- How maxUsers should be enforced when users are created through Clerk webhooks and there may not be a first-party invitation flow yet.
- Whether Customer Portal should be available only after checkout sync, and how to handle unlinked customers.
- Whether the pricing page should use Server Actions, Route Handlers, or a Server Component form for checkout creation.
- Whether the webhook route needs explicit Node runtime/dynamic config in Next.js 15 on Vercel.
- Whether verify:phase-6 should include verify:phase-5 or only the stable branch-base gates, given Phase 6 can run in parallel with Phase 7 under ADR-029.
```

## Current Phase 6 Spec Summary

The current spec locks six requirements:

1. Six Stripe price IDs map exactly to Starter/Growth/Business and monthly/annual intervals.
2. Checkout creation is authenticated and org-scoped; public pricing only carries non-authoritative plan intent.
3. `/api/webhooks/stripe` is the only billing-state write source and handles five events idempotently.
4. Tier gates read database state and enforce `aiDraftsMonthly`, `maxUsers`, and tier-bound boolean features.
5. Admin billing settings expose Stripe Customer Portal without trusting client-supplied customer IDs.
6. Phase 6 adds `verify:phase-6` and a manual-safe Stripe test-mode UAT checklist.

Key locked choices in the spec:

- `customer.subscription.deleted` hard-downgrades to Starter for MVP.
- `invoice.payment_failed` sets `past_due` but does not downgrade `planTier`.
- Unknown price IDs, ambiguous mappings, and missing metadata fail closed with no plan-tier mutation.
- The official `stripe` package is approved for server-side Stripe SDK usage.
- A minimal additive `organizations` billing-state migration is approved for Price ID, subscription item ID, current period end, cancel-at-period-end, last event created, and nullable unique partial indexes for Stripe customer/subscription IDs when missing.
- Webhook entitlement must be derived from the current Stripe Subscription for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.updated`, not from stale event snapshots.
- Middleware remains auth/role routing only; tier gates stay in application code.

## Repo Evidence Map

| Area | Files | What to verify |
|---|---|---|
| Phase spec | `.planning/phases/06-billing/06-SPEC.md` | Requirements, constraints, acceptance criteria, ambiguity, Context7 gap |
| Locked ADRs | `.planning/PROJECT.md` | ADR-013 Stripe, ADR-017 tier model, ADR-020 webhook, ADR-024 app-layer tier gating, ADR-023 raw DB allow-list |
| Roadmap | `.planning/ROADMAP.md` | Phase 6 success criteria and Wave 2 dependency shape |
| Tier limits | `reference/TIER-LIMITS.md`, `lib/stripe/products.ts`, `lib/stripe/products.test.ts` | `TIER_LIMITS`, current `checkTierLimit`, missing price map, `maxUsers` currently not counted |
| API contract | `reference/API-SPEC.md` | Stripe webhook event list and tier response shape |
| Schema | `reference/SCHEMA.md`, `lib/db/schema.ts` | `organizations.planTier`, Stripe columns, `stripe_events` idempotency table |
| Current UI | `app/(marketing)/pricing/page.tsx` | Static pricing cards point to `/sign-up`; no checkout or interval switch |
| Current gates | `app/api/ai/draft/route.ts`, `app/api/ai/consistency/route.ts` | Existing `requireTierLimit` usage and 429/403 response behavior |
| Webhook analog | `app/api/webhooks/clerk/route.ts` | Existing raw-body, verification, idempotency, retry cleanup, logging patterns |
| Static gates | `scripts/check-db-imports.ts`, `scripts/check-artifacts.ts`, `package.json` | Raw DB allow-list already includes future Stripe route; no `verify:phase-6` yet |
| Env template | `.env.local.example` | Stripe secret/webhook/publishable keys and six price ID env vars are declared |

## Official Documentation Anchors To Refresh

Use Context7 first if available. If not, use these official docs and record the date reviewed:

- Stripe Checkout Sessions API: https://docs.stripe.com/api/checkout/sessions
- Stripe Checkout overview: https://docs.stripe.com/payments/checkout-sessions
- Stripe webhooks and signature verification: https://docs.stripe.com/webhooks
- Stripe signature troubleshooting for Node/Next.js: https://docs.stripe.com/webhooks/signature?lang=node
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe Customer Portal overview: https://docs.stripe.com/customer-management
- Stripe Customer Portal sessions API: https://docs.stripe.com/api/customer_portal/sessions
- Stripe Billing testing and test clocks: https://docs.stripe.com/billing/testing
- Next.js App Router Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route

Important doc-derived checks to validate:

- Checkout Sessions should be created server-side and a new session should be created for each payment attempt.
- Stripe webhook verification needs the exact raw request body, `Stripe-Signature`, and endpoint secret.
- Next.js App Router Route Handlers can read the raw body with `request.text()` and do not require Pages Router `bodyParser` config.
- Customer Portal sessions are short-lived and should be created on demand for a known customer.
- Stripe recommends testing Billing with sandbox/test clocks; CLI-triggered events can be useful but may contain fake data that does not correlate to real subscription state.

## Review Questions For ChatGPT Pro

### Product And Scope

- Does Phase 6 correctly define the MVP billing boundary, or is it missing a must-have Stripe Billing capability for a production SaaS launch?
- Is hard downgrade on `customer.subscription.deleted` acceptable, or should the spec distinguish immediate cancellation, cancel-at-period-end, unpaid cancellation, and portal-driven cancellation?
- Should `invoice.payment_failed` leave `planTier` unchanged, set a grace state, or gate premium features immediately?
- Are coupons, tax, trials, and dunning correctly out-of-scope for this MVP phase?

### Data Model

- Are the approved fields (`stripe_customer_id`, `stripe_subscription_id`, `stripe_subscription_status`, `plan_tier`, active Price ID, subscription item ID, current period end, cancel-at-period-end, and last event created) enough to safely sync subscription state?
- Do not add customer email hash, raw payload storage, invoice payload storage, or custom billing identity in Phase 6.
- Can stale/out-of-order events be handled safely with canonical Subscription re-fetch plus the approved fields?

### Webhook Correctness

- What is the safest idempotency strategy for this repo: insert event before dispatch, insert after dispatch, or store event status in a transaction?
- Verify webhook handlers re-fetch the current Stripe Subscription for `checkout.session.completed`, `invoice.paid`, and `subscription.updated`, and do not trust event payload snapshots for entitlement.
- How should the implementation prove duplicate, replayed, stale, and out-of-order events are safe?
- What should happen for unknown price IDs, missing org metadata, missing customer, or multiple org rows with the same Stripe customer?

### Checkout And Customer Mapping

- What server-side metadata should Checkout include to map back to the Supabase org without trusting the browser?
- Should the system create/reuse Stripe Customers before checkout or allow Checkout to create them and link on completion?
- Where should checkout creation live: Server Action, Route Handler, or a small server-only helper called from both pricing/settings?
- Should public `/pricing` preserve selected plan across sign-up, and if so how can it do so without creating authority?

### Tier Gating

- Should `checkTierLimit` remain in `lib/stripe/products.ts` or split price catalog / usage gates / enforcement errors into separate modules?
- How should `maxUsers` be counted and enforced when users come from Clerk webhooks?
- Should a Starter org be blocked from reviewer role assignment, workflow creation, or only from using workflow surfaces?
- Are the existing 403/429 response shapes consistent enough for UI and tests?

### UI And UX

- What should the admin billing settings page display before checkout, during `trialing`, active, past_due, and canceled states?
- Should pricing include monthly/annual toggle in Phase 6, since six Stripe prices exist?
- What should the Customer Portal fallback be when no `stripeCustomerId` exists?
- Is `/pricing` still public after checkout wiring, and how should authenticated admins reach checkout from it?

### Verification

- What should `verify:phase-6` chain exactly?
- Which tests should be unit-level mocks versus live TEST DB integration tests?
- How should Stripe sandbox/test clocks be used for renewal UAT?
- What evidence should the UAT checklist collect without exposing secrets?

## Desired Output Shape From ChatGPT Pro

Use this format:

```markdown
# Phase 6 Billing Review

## Verdict
Keep / Amend / Block

## P0 Findings
- [P0] Title
  Evidence:
  Risk:
  Recommendation:
  Spec amendment:

## P1 Findings
...

## P2 Findings
...

## Spec Amendments
Copy-paste Markdown edits for 06-SPEC.md.

## Implementation Plan Recommendations
Numbered sequence with files and verification gates.

## Remaining Approval-Gated Items
Additional packages, schema changes, security decisions, or product-scope changes beyond the approved Stripe SDK and minimal additive billing-state migration.

## Tests And UAT
Automated tests, manual Stripe sandbox steps, and expected evidence.

## Open Questions For Matthew
Only questions that block a correct plan.
```

## Reviewer Cautions

- Do not recommend moving tier gating into middleware. ADR-024 explicitly rejects that.
- Do not recommend client-side Stripe authority. Client state is display/intent only.
- Do not recommend editing migrations already registered in `drizzle/meta/_journal.json`; migrations are immutable.
- Do not recommend logging raw Stripe payloads, secrets, or customer identifiers.
- Use the refreshed Context7 Stripe docs and rerun Context7 for any SDK/API syntax question that remains unclear before implementation.
- If using Vercel guidance, account for the repo's current Node 22 pin and the project's existing Next.js App Router patterns.
