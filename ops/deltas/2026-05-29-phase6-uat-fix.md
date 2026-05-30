# Delta - Phase 6 UAT Fix And Verification State

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Starting HEAD: `b81880546576af6f41e20f99671d75efe8053e3a` (`docs(ops): add historical forensic realignment brief`)
Parent: `b92a15f610a3b848358d089c72a96176f9588da1` (`fix(06-billing): allow first checkout for new orgs with trialing seed status`)
Scope: docs/state hygiene only after verifier green and UAT checkout fix
PR/push: none; branch remains local-only with no upstream

---

## What Changed

This delta records the current Phase 6 reality after `b92a15f` and `b818805`.
No app code, tests, migrations, schema files, packages, Stripe catalog config,
Supabase config, or env files were changed by this keep-current patch.

Current status:

- DB blocker cleared: additive migration `0012_billing_state` was applied to
  the approved TEST/dev Supabase target, not staging/prod.
- `pnpm db:verify` is green.
- `pnpm verify:phase-6` is green.
- Live Stripe test-mode UAT rows 1-8 and 11 are PASS.
- Row 9 renewal is PARTIAL: `invoice.paid` resend kept Growth/active, but true
  next-period renewal still requires Stripe test clock.
- Row 10 payment-failure-to-`past_due` is NOT RUN live: it requires Stripe test
  clock plus failing card; handler logic is unit-tested.

## Checkout Fix

UAT found a launch-blocking checkout bug: `createCheckoutSessionAction` blocked
first checkout for new orgs seeded as `trialing` by Clerk `organization.created`
because the guard did not require a real `stripeCustomerId`.

Fix in `b92a15f`: gate the duplicate-subscription block on `stripeCustomerId`,
aligned with the settings page. Regression coverage confirms new orgs without a
stored Stripe customer can start first checkout while linked orgs remain guarded.

## Stripe Account Ops Risk

The app `STRIPE_SECRET_KEY` account differed from the CLI/login/webhook-secret
account during local testing. Local `.env.local` was realigned without echoing
or committing secret values.

Residual blocker: reconcile Stripe CLI login, webhook secret, and app test
credentials before more live webhook testing.

## UAT Table Summary

| Rows | Status | Notes |
|---|---|---|
| 1-8 | PASS | Settings, checkout, webhook DB sync, tier-gate transition, portal session/return, and portal state-truth behavior verified in Stripe test mode with masked evidence only. |
| 9 | PARTIAL | `invoice.paid` resend kept Growth/active; true next-period renewal still needs Stripe test clock. |
| 10 | NOT RUN live | Needs Stripe test clock plus failing card; handler logic is unit-tested. |
| 11 | PASS | Canceled/unpaid path downgraded to Starter and preserved organization, acknowledgment, and AI audit rows. |

No live mode and no live keys were used.

## Ops Notes

- `.env.local` changed locally but is gitignored and was not committed; no
  secret values are reproduced here.
- No new packages were added.
- No migration/schema file changes were made in `b92a15f`.
- Clerk dev org provisioning without a webhook tunnel can produce
  `OrgNotProvisionedError`; this is a dev ops/process note, not a Phase 6 code
  defect.
- Throwaway cleanup: operator may delete the "Acme Test Co" Clerk org and the
  canceled Stripe test subscription.

## Consultant File Status

- `working_context.md`: updated for verifier green, UAT partial, local-only
  `b92a15f`/`b818805`, and next action.
- `system_map.md`: updated current Phase 6 status only; checkout/webhook/portal
  trust-boundary description remains accurate.
- `feature_inventory.md`: updated billing feature statuses from blocker/pending
  to verifier green / UAT partial.
- `risk_register.md`: updated remaining test-clock residual and added Stripe
  account mismatch plus dev org provisioning process risk.
- `backlog.md`: added/updated Stripe account reconciliation, test-clock rows
  9-10, throwaway test object cleanup, and dev org provisioning process items.

## Verification Snapshot

- `pnpm db:verify` - PASS.
- `pnpm verify:phase-6` - PASS.
- Changed-docs secret/identifier review - PASS; only masked identifiers,
  historical sentinel text, and `org_isolation` false positives were present.

## Next Smallest Task

Reconcile Stripe CLI/login/webhook-secret and app test credentials, finish
Stripe test-clock UAT rows 9-10 with masked evidence, then push/open the Phase 6
PR after keep-current and UAT completion.
