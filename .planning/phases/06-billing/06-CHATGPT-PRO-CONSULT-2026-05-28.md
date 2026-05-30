# PolicyPilot Phase 6 Billing Consult Brief

**Produced:** 2026-05-28
**Audience:** ChatGPT Pro / external architecture reviewer
**Repo:** https://github.com/mmtuentertainment/PolicyPilot
**Local branch:** `gsd/phase-6-billing`
**Planning source commit reviewed:** `dd44278 docs(06): reconcile billing plan guardrails`
**Base main observed locally:** `3344847 Phase 5: Employee Portal`
**Remote branch / PR:** none observed at production time. The branch is local-only, so the GitHub repo link shows `main`, not these Phase 6 planning commits.

## Reviewer Mission

Review the current Phase 6 Billing planning state and advise on the implementation plan. Do not reopen already approved decisions unless there is a concrete correctness or security issue. The next intended workflow step is `/gsd-plan-phase 6`, not more discussion.

Focus especially on:

- Stripe subscription lifecycle correctness.
- Checkout-to-org linkage and duplicate subscription prevention.
- Webhook raw-body verification and App Router route shape.
- Webhook idempotency, out-of-order delivery, and retry behavior.
- Canonical entitlement sync from current Stripe Subscription retrieval.
- Minimal additive billing schema.
- Server-side tier gate safety.
- Customer Portal scope.
- CI/UAT proof, including Stripe sandbox/test-clock evidence.

## Current Repo State

- Working tree at source-state check: clean at `dd44278` before this consult artifact was created.
- Branch status: local `gsd/phase-6-billing`, no upstream.
- Commits ahead of `main` at source-state check: 5.
- Changed files versus `main` at source-state check: planning/handoff only, no implementation code.
- Diff scope at source-state check: 6 new planning/handoff files, 1189 insertions.
- Phase 6 plan files: none yet.
- Phase 6 implementation: not started.
- PR: none.

Core Phase 6 files present at source-state check:

- `.planning/phases/06-billing/06-SPEC.md`
- `.planning/phases/06-billing/06-CONTEXT.md`
- `.planning/phases/06-billing/06-DISCUSSION-LOG.md`
- `.planning/phases/06-billing/06-CHATGPT-PRO-REVIEW-BRIEF.md`
- `.planning/phases/06-billing/.continue-here.md`
- `.planning/HANDOFF.json`

This consult report is an added reviewer handoff artifact on top of that source state:

- `.planning/phases/06-billing/06-CHATGPT-PRO-CONSULT-2026-05-28.md`

## Documentation Refresh

Context7 Pro was used on 2026-05-28 to refresh current Stripe docs.

Resolved docs:

- `/websites/stripe`
- `/stripe/stripe-node`

Relevant confirmation from current docs:

- Stripe webhook signature verification uses the exact raw request body plus the Stripe signature header and endpoint secret.
- Stripe subscription integrations should handle checkout completion, paid invoices, payment failures, and subscription update/delete events.
- Stripe Customer Portal sessions are created on demand and return short-lived URLs.
- Stripe Node Checkout Session create params include `client_reference_id`, `customer`, `metadata`, `mode`, `line_items`, and `subscription_data`.
- Stripe Node supports `stripe.webhooks.constructEvent(rawBody, signature, secret)`.

## Phase 6 Status

Phase 6 is ready for plan-phase. It is not ready for execution because no plan files exist yet.

The Phase 6 discussion output is locked into `06-CONTEXT.md`. The discussion log is historical evidence only. `06-SPEC.md` is the WHAT contract, and `06-CONTEXT.md` is the authoritative HOW addendum.

Important reconciliation: older copies of the spec/review brief described the official `stripe` package and additive billing migration as approval-gated. Matthew has approved both. The live `06-SPEC.md` and `06-CONTEXT.md` now explicitly supersede the stale approval-gated language.

## Locked Goal

A new PolicyPilot org can choose a plan, complete Stripe Checkout, have verified Stripe webhook events sync durable billing state onto `organizations`, and have server-side tier gates enforce the resulting plan. Starter orgs attempting Growth-only features receive a clear 403 plus upgrade path. A paid org must survive a first test-mode renewal without manual DB intervention.

## In Scope

- Six Stripe Prices: Starter/Growth/Business x monthly/annual.
- Server-only Stripe Checkout creation for authenticated org admins.
- Public pricing may carry non-authoritative tier/interval intent.
- Admin billing/settings surface.
- Stripe Customer Portal session creation from DB-stored customer ID.
- `app/api/webhooks/stripe/route.ts`.
- Raw-body Stripe signature verification.
- Five event types: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`.
- Durable billing sync into `organizations`.
- `stripe_events` idempotency.
- `checkTierLimit` / `requireTierLimit` correctness, including real `maxUsers`.
- `verify:phase-6`.
- Masked Stripe sandbox/test-clock UAT.

## Out Of Scope

- Sales tax.
- Coupons.
- Trials.
- Seat proration UX.
- Custom dunning emails.
- Invoice PDFs.
- Revenue analytics.
- Custom billing identity.
- Invoice history display.
- Storing customer email, raw Stripe payloads, API keys, webhook secrets, or full customer IDs for display.
- New Growth/Business feature bodies such as Slack, SSO, custom branding, or outbound API webhooks.
- First-party user/invitation management beyond the `maxUsers` predicate.

## Approved Decisions

Matthew approved both previously gated decisions:

1. Add and use the official `stripe` npm package.
2. Add one minimal additive organization billing-state migration.

Approved new organization columns:

- `stripe_price_id text null`
- `stripe_subscription_item_id text null`
- `stripe_current_period_end timestamptz null`
- `stripe_cancel_at_period_end boolean not null default false`
- `stripe_last_event_created timestamptz null`

Approved indexes:

- Unique partial index on `organizations.stripe_customer_id` where not null, unless equivalent already exists.
- Unique partial index on `organizations.stripe_subscription_id` where not null, unless equivalent already exists.

## Current Implementation Baseline

No Phase 6 implementation exists yet.

Current repo facts:

- `package.json` does not yet include `stripe`.
- `package.json` does not yet include `verify:phase-6`.
- `lib/db/schema.ts` already has baseline org fields:
  - `planTier`
  - `stripeCustomerId`
  - `stripeSubscriptionId`
  - `stripeSubscriptionStatus`
- `lib/db/schema.ts` already has `stripeEvents`.
- `.env.local.example` already has:
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - all six `STRIPE_PRICE_*` env slots.
- `reference/TIER-LIMITS.md` already names the six price env vars.
- `lib/stripe/products.ts` already has `TIER_LIMITS`, `PlanTier`, `checkTierLimit`, and `requireTierLimit`.
- `lib/stripe/products.ts` currently returns `0` for `maxUsers`; Phase 6 must replace that with a real org-scoped active membership count.
- `app/api/webhooks/clerk/route.ts` is the closest raw-body/idempotency analog.

## Checkout Rules

Checkout creation must be server-side only and must happen after:

- `getOrgContext()`
- active org resolution
- `requireAdminFromCtx(ctx)`

The browser may submit only:

```ts
{
  tier: 'starter' | 'growth' | 'business',
  interval: 'monthly' | 'annual'
}
```

The server must reject or ignore any client-supplied:

- org ID
- customer ID
- subscription ID
- price ID
- client reference
- metadata

Checkout Session creation must set:

- `mode: 'subscription'`
- exactly one server-derived Price ID from the locked catalog
- `client_reference_id = orgId`
- `metadata.policyPilotOrgId = orgId`
- `subscription_data.metadata.policyPilotOrgId = orgId`
- `customer = organizations.stripeCustomerId` when present

Duplicate subscription guardrail:

- If the org already has linked `active`, `trialing`, or `past_due` subscription state, Checkout creation must reject or redirect to Customer Portal.
- Phase 6 does not implement custom upgrade/downgrade flows outside Stripe Portal.

## Webhook Rules

Route:

```text
app/api/webhooks/stripe/route.ts
```

Exports:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

Handler rule:

- `request.text()` exactly once before `stripe.webhooks.constructEvent(...)`.
- Never call `request.json()` before signature verification.
- Do not put billing authority in middleware.

For these events, entitlement must come from the current Stripe Subscription retrieved through the Stripe SDK:

- `checkout.session.completed`
- `invoice.paid`
- `customer.subscription.updated`

`customer.subscription.deleted` may hard-downgrade from the signed event object, but only after proving the subscription maps to exactly one org.

`invoice.payment_failed` is non-destructive for MVP:

- set `stripeSubscriptionStatus = 'past_due'`
- do not downgrade `planTier`
- do not clear price or subscription IDs

Fail closed cases:

- unknown Price ID
- missing trusted metadata
- missing subscription
- missing customer
- zero org matches
- multiple org matches
- multiple subscription items
- non-recurring price
- trusted signals disagree

## Status Policy

- `active`: sync paid entitlement and diagnostic fields.
- `trialing`: sync paid entitlement only when the Price ID is recognized.
- `past_due`: preserve last known paid `planTier`, set status to `past_due`, sync diagnostics when available.
- `incomplete`: link customer/subscription only if org mapping is unambiguous, no upgrade.
- `unpaid`, `canceled`, `incomplete_expired`, `paused`: downgrade to Starter and sync status/diagnostics.

Scheduled cancellation:

- `active` or `trialing` plus `cancel_at_period_end = true` remains entitling.
- Show scheduled-cancel state in UI.
- Do not downgrade until current Subscription status becomes non-entitling or a verified `customer.subscription.deleted` maps exactly to the org.

## Idempotency Contract

After signature verification and required Stripe API re-fetches, each event must be processed in one DB transaction:

1. Insert `stripe_events.id = event.id`.
2. If insert conflicts, return 200 with no org mutation.
3. If insert succeeds, apply the validated org mutation in the same transaction.
4. If mutation fails, roll back the event insert so Stripe retry can reprocess.

Additional safety:

- Event-ID dedupe handles exact replay.
- Billing mutation must also be harmless for two different Stripe Event IDs that reference the same underlying subscription/customer and event type.
- Final org state must equal canonical current Subscription state.
- `stripeLastEventCreated` is diagnostic only and must not be used as an entitlement ordering gate.

## Customer Portal

Admin Customer Portal creation must:

- require authenticated admin org context
- use only `organizations.stripeCustomerId`
- ignore/reject client-supplied customer IDs
- create a fresh Stripe Customer Portal Session on demand
- return or redirect to the short-lived Stripe portal URL
- show checkout/setup prompt when no customer is linked

The admin billing page may show:

- current plan
- subscription status
- current period end
- cancel-at-period-end state
- Manage billing when customer exists
- checkout/setup CTA when no customer exists

Do not show invoice history or raw billing identities.

## Verification Requirements

`pnpm verify:phase-6` must run:

```bash
pnpm tsc --noEmit
pnpm verify:phase-5
pnpm test -- --run lib/stripe
pnpm test -- --run app/api/webhooks/stripe
pnpm db:verify
pnpm check:artifacts
```

Hosted PR/push verification must include a full required Phase 6 verification job.

Automated tests must cover:

- catalog mapping
- missing/duplicate price config
- unknown Price ID
- status policy
- subscription normalization
- invalid signature
- duplicate `event.id`
- two different event IDs for same underlying object/type
- stale invoice after cancellation
- ambiguous org
- transaction rollback after mutation failure
- Checkout forged IDs/metadata
- Portal forged customer ID
- `maxUsers` org-scoped count

Manual Stripe test-mode UAT must prove:

- checkout creates subscription for authenticated org
- webhook syncs DB billing state
- `planTier` gates change only after verified webhook
- Customer Portal opens for linked admin/customer
- renewal produces expected `invoice.paid`
- failed payment produces `past_due` without immediate downgrade
- canceled/unpaid downgrades to Starter

UAT evidence may include masked org/customer/subscription IDs, Stripe event ID, event type, PASS/FAIL, and observed DB status/tier. It must not include API keys, webhook secrets, raw payloads, customer email, or full customer IDs.

## Known Caveats

- The local branch is not pushed. ChatGPT Pro cannot inspect this exact branch from GitHub unless the branch is pushed or this report is pasted.
- Active Codex chat previously did not expose Stripe MCP tools; implementation must not depend on Stripe MCP. The official SDK, Stripe CLI/sandbox, and current docs are sufficient.
- Vercel CLI is not installed locally. This is not a Phase 6 planning blocker, but hosted verification/deploy-adjacent work may benefit from installing it later.
- No production migration/backfill is in scope for Phase 6. Migration discipline remains forward-only and additive.

## Suggested Review Questions

1. Is the minimal organization schema delta sufficient for correct subscription entitlement sync without storing raw Stripe event snapshots?
2. Does the webhook status policy safely handle `invoice.paid`, stale/out-of-order events, cancellation, unpaid, paused, incomplete, and past_due states?
3. Is the org mapping rule strict enough when metadata, customer ID, subscription ID, and client reference signals disagree?
4. Is the Checkout duplicate-subscription guardrail enough for MVP, or should plan-phase add a stronger redirect rule for all linked subscription IDs regardless of status?
5. Are the transaction-scoped idempotency rules sufficient for Stripe retry behavior and mutation rollback?
6. Are the planned tests sufficient for both exact duplicate events and distinct events for the same underlying object?
7. Does the Customer Portal-only upgrade/downgrade posture keep MVP scope tight enough?
8. Does the proposed `verify:phase-6` chain properly preserve Phase 5 green status while adding billing coverage?
9. Are there any Stripe API-version or Node SDK details that should be locked before implementation begins?
10. What should the implementation plan split into first: catalog/schema, checkout/settings, webhook core, tier gates, or verification/UAT?

## Do Not Suggest Unless Framed As Later Scope

- Tax
- Coupons
- Trials
- Custom dunning emails
- Invoice PDFs
- Revenue analytics
- Custom billing identity
- Invoice history UI
- First-party seat management/invitations
- Middleware billing authority
- Client-side subscription authority
- Raw Stripe payload persistence

## Recommended Next Prompt

```text
Review this PolicyPilot Phase 6 Billing consult brief. Assume Matthew has approved the official `stripe` package and the minimal additive organization billing migration. Do not reopen those approvals.

The next local workflow is `/gsd-plan-phase 6`, not implementation. Please review whether the plan-phase should add or change anything before execution, focusing on Stripe lifecycle correctness, webhook idempotency/out-of-order delivery, org mapping, duplicate subscriptions, scheduled cancellation, Customer Portal scope, maxUsers gating, and verification/UAT.

Repo: https://github.com/mmtuentertainment/PolicyPilot
Note: the Phase 6 branch is currently local-only at `gsd/phase-6-billing`; the planning source state reviewed here is commit `dd44278`. GitHub may not show these planning artifacts unless the branch is pushed. Treat this pasted report as authoritative for the current Phase 6 state.
```
