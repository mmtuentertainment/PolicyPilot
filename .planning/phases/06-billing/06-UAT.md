---
phase: 06-billing
plan: 06-06
type: uat-checklist
status: operator-uat-pending
created_at: 2026-05-29
---

# Phase 6 UAT - Stripe Sandbox/Test Clock

## Scope

This checklist is the manual Stripe test-mode evidence gate for Phase 6. It
proves the billing loop that cannot be fully covered by deterministic mocked
tests:

checkout -> webhook -> DB sync -> tier gate -> Customer Portal -> simulated
renewal/payment-failure/cancel.

Phase 6 is not shipped until `pnpm verify:phase-6` exits 0 and the operator
records masked PASS evidence for every required row below.

## Current Local Verifier Status

- 2026-05-29 Codex local verifier: automated verifier wiring is present.
- `pnpm verify:phase-6` currently FAILS at `pnpm db:verify` because the
  configured `.env.local` deploy-verifier database has 12 migrations applied
  while `drizzle/meta/_journal.json` has 13 entries through
  `0012_billing_state`.
- `pnpm exec tsx --env-file=.env.local scripts/check-schema.ts` PASSed against
  the TEST sibling schema and confirmed the five Phase 6 billing columns plus
  two partial unique indexes.
- No Stripe sandbox/test-clock UAT was performed by Codex because no hosted
  deployment session, linked test org, signed webhook endpoint, or dashboard
  test-clock run was available in this local verifier turn.

## Evidence Rules

Evidence may include:

- PASS/FAIL/BLOCKED result.
- Masked org ID.
- Masked Stripe customer ID.
- Masked Stripe subscription ID.
- Stripe event ID in masked form.
- Stripe event type.
- Observed DB plan tier, subscription status, period end, and cancel flag.
- Short note about the page or workflow observed.

Evidence MUST NOT include:

- API keys.
- Webhook signing secrets.
- Raw webhook payloads.
- Customer email addresses.
- Full Stripe customer IDs.
- Full Stripe subscription IDs.
- Full Stripe event IDs.
- Full DB URLs.
- Invoice history screenshots or invoice detail exports.

Use only Stripe test mode/sandbox objects. Do not use live mode.

## Masked Evidence Template

```text
Result:
Environment: Stripe test mode / sandbox
Org: org_***<last4 or short alias>
Customer: cus_***<last4>
Subscription: sub_***<last4>
Event: evt_***<last4>
Event type:
Observed DB tier/status:
Notes:
```

## Operator Checklist

| # | Check | Status | Masked evidence |
|---:|---|---|---|
| 1 | Admin can reach `/settings` billing page in the hosted/test environment. | BLOCKED - hosted environment access not available in this local verifier run. | Record route, role, and observed billing card only; no screenshots with secrets. |
| 2 | Unlinked org is sent to checkout/setup path, not Customer Portal. | BLOCKED - requires hosted/test org setup. | Record org alias and observed `/settings?billing=setup` or checkout path. |
| 3 | Admin checkout creates a Stripe test-mode subscription for the authenticated org only. | BLOCKED - requires Stripe sandbox checkout. | Record masked org/customer/subscription and `checkout.session.completed` event. |
| 4 | Webhook syncs DB billing state after verified signed webhook processing. | BLOCKED - requires signed Stripe test webhook delivery. | Record event type, masked event ID, observed DB tier/status/period end. |
| 5 | Tier gates change only after webhook/database state changes. | BLOCKED - requires pre-webhook and post-webhook observation. | Record before/after DB tier and app behavior; do not use client-supplied state as proof. |
| 6 | Linked admin can create a Customer Portal session using the stored customer ID only. | BLOCKED - requires linked test org and Stripe Customer Portal. | Record masked stored customer ID and trusted return URL `${APP_URL}/settings`; do not record portal URL. |
| 7 | Portal return goes to trusted `${APP_URL}/settings`. | BLOCKED - requires Stripe Customer Portal. | Record return destination only. |
| 8 | Portal update/cancel flows do not directly mutate local subscription state outside webhook/database truth. | BLOCKED - requires Stripe Portal flow and webhook observation. | Record portal action, event type, and DB status after webhook. |
| 9 | Simulated renewal produces `invoice.paid` and keeps plan tier correct. | BLOCKED - requires Stripe test clock. | Record masked event ID, `invoice.paid`, and observed DB tier/status. |
| 10 | Simulated payment failure produces `invoice.payment_failed` and `past_due` without immediate downgrade. | BLOCKED - requires Stripe test clock or sandbox failure flow. | Record masked event ID, `invoice.payment_failed`, observed `past_due`, and unchanged paid tier. |
| 11 | Canceled or unpaid subscription downgrades to Starter and preserves acknowledgment and AI audit rows. | BLOCKED - requires Stripe cancellation/unpaid simulation. | Record masked subscription/event, observed Starter tier, and row-count preservation check. |

## Deferred Or Accepted Limits

- SF-CASCADE-AUDIT remains DEFERRED. Phase 6 adds no org-delete path;
  cancellation downgrades billing state and must preserve organization rows,
  acknowledgments, and `ai_generations`.
- `past_due` is an accepted MVP dunning state: the app should not immediately
  downgrade until Stripe escalates to a non-entitling subscription state.

## Operator Sign-Off

Do not mark this checklist complete until all required rows are PASS with
masked-only evidence.
