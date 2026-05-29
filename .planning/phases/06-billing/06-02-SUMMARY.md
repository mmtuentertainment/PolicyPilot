---
phase: 06-billing
plan: 06-02
status: complete
completed_at: 2026-05-29
scope: stripe-webhook
---

# Plan 06-02 Summary - Stripe Webhook

## Outcome

Plan 06-02 is complete on `gsd/phase-6-billing`. The patch adds the
Stripe webhook route, raw-body signature verification, transaction-scoped
`stripe_events` idempotency, canonical subscription re-fetch for
entitlement-affecting events, and the locked 06-02 HTTP status behavior.

Phase 6 is not shipped. Checkout, Customer Portal, pricing UI, tier-gating UI,
cron/email work, and Phase 7/8 surfaces remain untouched.

No `0013` migration was needed: Plan 06-01 already added the required
`stripe_events` table and organization billing-state columns/indexes. The TEST
DB migrate + introspection gate confirmed those schema objects are present.

## Files

- `app/api/webhooks/stripe/route.ts`: App Router route with `runtime='nodejs'`,
  `dynamic='force-dynamic'`, raw-body-first signature verification, 5-event
  dispatch, canonical subscription retrieval, fail-closed org mapping, and
  transaction-scoped event idempotency.
- `app/api/webhooks/stripe/route.test.ts`: signature, status-matrix,
  duplicate, retry rollback, canonical re-fetch, stale-payload, raw-body, and
  log-safety coverage.
- `lib/stripe/normalize.ts`: pure subscription normalization and SPEC status
  policy mapping.
- `lib/stripe/normalize.test.ts`: active/trialing, cancel-at-period-end,
  past-due preserve-tier, terminal downgrade, incomplete link-only, and
  malformed subscription fail-closed coverage.
- `scripts/check-artifacts.ts`: narrow verifier alignment so the legacy
  artifact backstop recognizes the intentional 06-02 raw DB webhook allow-list
  entry already enforced by `check:db-imports`.

## HTTP Status Matrix

| Case | Status | DB side effect |
|---|---:|---|
| Missing `STRIPE_WEBHOOK_SECRET` | 500 | none |
| Missing `Stripe-Signature` header | 400 | none |
| Invalid signature | 400 | none |
| Valid unhandled event | 200 | none |
| Valid handled fail-closed no-op | 200 | event id marked processed after deterministic no-op |
| Duplicate event id | 200 | no org mutation |
| Canonical Stripe subscription re-fetch failure | 500 | no processed marker |
| DB transaction failure | 500 | no processed marker |
| Success | 200 | event marker and org update commit together |

## Stripe Docs

Used ctx7 before changing Stripe webhook/API code:

- `/websites/stripe`: webhook endpoint raw-body signature verification and
  signature-failure behavior.
- `/stripe/stripe-node`: `webhooks.constructEvent`, test-header helper
  context, and `subscriptions.retrieve` Node SDK usage.

## TEST DB

- `pnpm db:migrate:test` exited 0.
- TEST DB introspection confirmed 13 migration rows, `stripe_events`,
  `organizations`, all 9 organization billing-state columns, and both partial
  unique billing indexes.
- No DB URL, password, Stripe key, webhook secret, or full Stripe ID was
  printed or committed.

## Verification

- `pnpm db:migrate:test` - PASS.
- `pnpm vitest run lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts` - PASS, 21 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:artifacts` - PASS after the intentional verifier allow-list update.
- `pnpm verify:phase-5` - PASS.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS (`stripe 22.2.0`).
- Refined no-`any` scan over changed TS/TSX files - PASS.
- Refined secret/full-ID/DB URL scan over changed additions and untracked files - PASS.
- Acknowledgment mutation scan over changed files - PASS.

## GSD Stage

No narrow single-plan GSD runtime command was exposed. The available
`gsd-execute-phase` and `gsd-verify-work` paths are phase-level, and
`gsd-sdk query init.execute-plan 06-02` was not available. This run therefore
emulated checker -> execute -> verifier for Plan 06-02 only and did not invent
GSD output.

## Deviations

- Updated `scripts/check-artifacts.ts` because `verify:phase-5` still carried
  a stale raw-DB importer backstop. The dedicated AST-based `check:db-imports`
  already allow-listed `app/api/webhooks/stripe/route.ts`; the artifact check
  now matches that intentional Plan 06-02 boundary.
- No `0013` migration was created because the existing `0012` schema already
  provides the webhook idempotency table and billing-state columns required by
  this plan.
