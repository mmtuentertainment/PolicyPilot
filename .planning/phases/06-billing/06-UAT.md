---
phase: 06-billing
plan: 06-06
type: uat-checklist
status: uat-complete-11-of-11-live-verified
created_at: 2026-05-29
---

# Phase 6 UAT - Stripe Sandbox/Test Clock

## Scope

This checklist is the manual Stripe test-mode evidence gate for Phase 6. It
proves the billing loop that cannot be fully covered by deterministic mocked
tests:

checkout -> webhook -> DB sync -> tier gate -> Customer Portal -> simulated
renewal/payment-failure/cancel.

Phase 6 is not shipped until the operator records masked PASS evidence for
every required row below and Matthew chooses the PR/ship path.

## Current Local Verifier Status

- 2026-05-30 keep-current status after `b92a15f` and `b818805`: automated
  verifier wiring is present and committed.
- Additive migration `0012_billing_state` is applied to the approved TEST/dev
  Supabase target; this does not represent staging/prod migration approval.
- `pnpm db:verify` PASSes.
- `pnpm verify:phase-6` PASSes.
- Live Stripe test-mode UAT verified rows 1-11.
- Hosted PR #32 checks are green/acceptable at PR head `fe60709`: `Phase 6
  verifier` PASS, `Verify full gate` PASS, `Browser e2e smoke` PASS, `Live
  full verification` intentionally SKIPPED, CodeRabbit PASS/skipped, and
  `mergeStateStatus` CLEAN.
- Row 9 PASS: a true test-clock renewal produced a fresh `invoice.paid` and
  kept the org Growth/active.
- Row 10 PASS: a test-clock payment failure produced `invoice.payment_failed`
  and the app observed Growth/`past_due` without immediate downgrade.
- No live mode and no live keys were used.
- Launch-blocking checkout bug fixed in `b92a15f`: first checkout for new orgs
  seeded as `trialing` by Clerk `organization.created` now proceeds unless the
  org has a real `stripeCustomerId`.

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

Security sequencing for future public-tunnel proof: repository Actions secrets
were configured by operator-authorized Claude Code action from `.env.local` via
stdin, with no values printed or committed. This is a one-off exception and not
the default operating pattern. SF-WHSEC-1 remains an operator follow-up before
any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used
before rotation. Codex must not inspect, print, configure, or rotate secrets
without explicit operator approval.

Hosted CI note: the Phase 6 verifier is allowed to mutate the approved dev/test
Supabase target through TRUNCATE/seed. This is not staging/prod evidence and
does not approve staging/prod migration or data mutation.

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
| 1 | Admin can reach `/settings` billing page in the hosted/test environment. | PASS | Stripe test mode only. Org `org_***d5ff75`; billing card rendered for an admin session. No screenshots or secret-bearing URLs recorded. |
| 2 | Unlinked org is sent to checkout/setup path, not Customer Portal. | PASS | Unlinked org path used checkout/setup behavior; Customer Portal was not offered without a stored Stripe customer. |
| 3 | Admin checkout creates a Stripe test-mode subscription for the authenticated org only. | PASS | Org `org_***d5ff75`; customer `cus_***rYU5`; subscription `sub_***wVxy`; no raw checkout session ID recorded. |
| 4 | Webhook syncs DB billing state after verified signed webhook processing. | PASS | Signed test-mode webhook processed `checkout.session.completed`; DB observed Growth/active for `org_***d5ff75`, customer `cus_***rYU5`, subscription `sub_***wVxy`. |
| 5 | Tier gates change only after webhook/database state changes. | PASS | Tier-gate behavior followed DB/server truth after webhook sync; no client-supplied subscription state used as proof. |
| 6 | Linked admin can create a Customer Portal session using the stored customer ID only. | PASS | Linked admin used stored customer `cus_***rYU5`; portal URL was not recorded. |
| 7 | Portal return goes to trusted `${APP_URL}/settings`. | PASS | Return destination observed as the settings page only; no tokenized Stripe dashboard or portal URL recorded. |
| 8 | Portal update/cancel flows do not directly mutate local subscription state outside webhook/database truth. | PASS | Portal-side action did not directly mutate app state; local billing state changed only through webhook/database truth. |
| 9 | Simulated renewal produces `invoice.paid` and keeps plan tier correct. | PASS | Test-clock renewal produced fresh `invoice.paid` event `evt_***Q1PA` for org `org_***644e12`, customer `cus_***Pmjg`, subscription `sub_***3MCc`, clock `clock_***sGj8`; DB observed Growth/active and `cancelAtPeriodEnd=false`. |
| 10 | Simulated payment failure produces `invoice.payment_failed` and `past_due` without immediate downgrade. | PASS | Test-clock payment failure produced `invoice.payment_failed` event `evt_***oOKc` for org `org_***b495c9`, customer `cus_***scf6`, subscription `sub_***4M2U`, clock `clock_***NAHe`; DB observed Growth/`past_due` and `cancelAtPeriodEnd=false` at first failure, before any later terminal retry/deletion behavior. |
| 11 | Canceled or unpaid subscription downgrades to Starter and preserves acknowledgment and AI audit rows. | PASS | Test subscription `sub_***wVxy` cancellation/unpaid path downgraded to Starter while preserving organization, acknowledgment, and AI audit rows. |

## Deferred Or Accepted Limits

- SF-CASCADE-AUDIT remains DEFERRED. Phase 6 adds no org-delete path;
  cancellation downgrades billing state and must preserve organization rows,
  acknowledgments, and `ai_generations`.
- `past_due` is an accepted MVP dunning state: the app should not immediately
  downgrade until Stripe escalates to a non-entitling subscription state.
- Stripe account mismatch reconciled for this local UAT: the default Stripe CLI
  profile still reports a different masked account than the app test key, so
  this run used a `STRIPE_API_KEY` environment override sourced from the app
  test key. The app test key and CLI override targeted `acct_***ujJo`; the
  active listener webhook secret was captured in-process, injected into the
  local dev server process, and not printed or committed. Temporary listener
  logs were deleted after UAT.
- Clerk dev org provisioning without a webhook tunnel can produce
  `OrgNotProvisionedError`. Treat this as a dev ops/process gap, not a Phase 6
  code blocker.
- Throwaway cleanup: operator may delete the "Acme Test Co" Clerk org and the
  canceled Stripe test subscription.

## Operator Sign-Off

All rows are PASS with masked-only evidence. Phase 6 is still not shipped until
Matthew chooses the PR/ship path after ChatGPT reviews the final handoff.
