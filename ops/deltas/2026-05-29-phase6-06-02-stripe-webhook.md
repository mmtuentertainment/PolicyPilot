# Delta - Phase 6 Plan 06-02 Stripe Webhook

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Stage: checker -> execute -> verifier, Plan 06-02 only
Scope: Stripe webhook raw-body verification, idempotency, canonical subscription sync

---

## What Changed

Implemented the Plan 06-02 webhook slice without starting checkout, portal,
pricing UI, tier-gating UI, cron/email, or Phase 7/8 work:

- Added `POST /api/webhooks/stripe` as a Next.js App Router route with
  `runtime='nodejs'` and `dynamic='force-dynamic'`.
- Verified `Stripe-Signature` against the raw request body string using the
  official Stripe SDK before dispatching.
- Handled all 5 locked events:
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`, and `customer.subscription.updated`.
- Re-fetched canonical Stripe Subscriptions for checkout completed, invoice
  paid, and subscription updated before deriving billing state.
- Committed `stripe_events` idempotency and organization billing updates in one
  DB transaction.
- Preserved paid tier on `past_due`; downgraded terminal statuses to Starter;
  treated `incomplete` as link-only.
- Added pure normalization tests and webhook route tests for signature,
  duplicate, rollback, stale payload, raw body, and log-safety behavior.
- Updated the legacy artifact checker to recognize the intentional Stripe
  webhook raw DB importer already enforced by `check:db-imports`.

No new migration was needed. `0012_billing_state` already provides
`stripe_events` and the required organization billing fields.

## Branch / PR / Base

- Local branch: `gsd/phase-6-billing`.
- PR lookup for head `gsd/phase-6-billing`: no PRs returned.
- Starting HEAD: `5c9f8c5 feat(06-01): add billing foundation`.
- `origin/main`: `af01f0a docs(state): refresh post-pr30 merge bookkeeping (#31)`.
- `origin/main` is an ancestor of the branch HEAD.

## HTTP Status Matrix

- Missing webhook secret: 500, no DB write.
- Missing signature: 400, no DB write.
- Invalid signature: 400, no DB write.
- Valid unhandled event: 200, no DB write.
- Valid fail-closed handled event: 200, processed marker only.
- Duplicate event: 200, no org mutation.
- Canonical Stripe retrieve failure: 500, no processed marker.
- DB transaction failure: 500, no processed marker.
- Success: 200, processed marker and org update commit together.

## Stripe Docs

ctx7 was used before source changes:

- `/websites/stripe` for raw-body webhook signature verification behavior.
- `/stripe/stripe-node` for `webhooks.constructEvent` and
  `subscriptions.retrieve` SDK usage.

## Verification

- Startup state checks - PASS (`gsd/phase-6-billing`, clean, expected 06-01
  HEAD, `origin/main` ancestor, no PR).
- GSD command check - PASS/fallback: no narrow Plan 06-02 command exposed; used
  manual checker -> execute -> verifier for Plan 06-02 only.
- `pnpm db:migrate:test` - PASS.
- TEST DB schema introspection - PASS, 13 migration rows, `stripe_events`,
  `organizations`, 9/9 billing columns, 2/2 billing indexes.
- `pnpm vitest run lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts` - PASS, 21 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:artifacts` - PASS.
- `pnpm verify:phase-5` - PASS.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS, `stripe 22.2.0`.
- Refined no-`any` scan over changed TS/TSX files - PASS.
- Refined secret/full-ID/DB URL scan over changed additions and untracked files - PASS.
- Acknowledgment mutation scan over changed files - PASS.

## Consultant File Status

- `working_context.md`: updated to mark 06-02 complete and 06-03..06-06 pending.
- `system_map.md`: updated billing runtime status; Phase 6 still not shipped.
- `feature_inventory.md`: updated Stripe webhook status to hardening, pending
  Stripe test-clock/UAT.
- `risk_register.md`: updated R-004 mitigation with 06-02 completion; score
  remains 15 until checkout/UAT prove the full billing loop.
- `backlog.md`: updated next micro-batch to Plan 06-03 only.

## Risks / Notes

- Stripe test-clock UAT is still pending; this patch uses mocked SDK tests plus
  local verification gates.
- Checkout and Customer Portal are still pending, so the webhook route is not
  yet exercised by a live purchase flow in-app.
- Phase 6 is not shipped.

## Next Micro-Batch

Plan 06-03 only: tier gates and real `maxUsers` counting, preserving the
Phase 4 403/429 contract and avoiding checkout, portal, UI, cron/email, and
Phase 7/8 work.
