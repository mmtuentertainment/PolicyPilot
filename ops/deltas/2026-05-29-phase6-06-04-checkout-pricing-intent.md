# Delta - Phase 6 Plan 06-04 Checkout Pricing Intent

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Stage: checker -> execute -> verifier, Plan 06-04 only
Scope: admin Checkout Session creation and public pricing intent

---

## What Changed

Implemented the Plan 06-04 checkout/pricing slice without starting Customer
Portal, settings page UI, webhook changes, dashboard billing settings, cron,
email, or Phase 7/8 work:

- Added `createCheckoutSessionAction` under `app/(admin)/settings/actions.ts`.
- Validated only `{ tier, interval }` from submitted form data.
- Derived org and role from `getOrgContext()` + `requireAdminFromCtx(ctx)`.
- Selected Stripe Price IDs server-side through the existing closed catalog.
- Read organization billing state through `withOrgScope`, avoiding a raw DB
  allow-list change.
- Created Stripe Checkout Sessions with server-derived
  `client_reference_id`, session metadata, subscription metadata, optional
  stored customer, and trusted success/cancel URLs.
- Blocked duplicate checkout creation when stored status is active, trialing,
  or past_due.
- Updated public pricing with monthly/annual display and sign-up query intent
  only.
- Updated the consultant packet to mark 06-04 complete locally and 06-05 as
  the next micro-batch.

No new package, migration, schema change, webhook behavior, or `planTier`
write was added.

## Branch / PR / Base

- Local branch: `gsd/phase-6-billing`.
- Starting HEAD: `5abe38c feat(06-03): add billing tier gates`.
- Required ancestry: `ebd5708 feat(06-02): add stripe webhook idempotency` is
  an ancestor.
- `origin/main`: `af01f0a6378ab3c38421d5d495da8a72ee7e6887`.
- Upstream: none.
- PR: no PR was opened or pushed by this run.

## Docs

ctx7 was used before source changes:

- `/stripe/stripe-node` for Checkout Session creation parameters.
- `/vercel/next.js` for Server Action redirect behavior.

## Verification

- Startup state checks - PASS.
- GSD command check - PASS/fallback: no narrow Plan 06-04 command exposed.
- RED test run before implementation - EXPECTED FAIL, missing checkout action.
- `pnpm vitest run app/(admin)/settings/actions.test.ts` - PASS, 15 tests.
- `pnpm vitest run lib/stripe/normalize.test.ts` - PASS, 9 tests.
- `pnpm vitest run lib/stripe/catalog.test.ts lib/stripe/mask.test.ts lib/stripe/client.test.ts lib/stripe/products.test.ts lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts app/(admin)/settings/actions.test.ts` - PASS, 62 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS after preserving legacy monthly price
  literals in the pricing source.
- `pnpm verify:phase-5` - PASS.
- `pnpm verify:phase-6` - unavailable; script does not exist yet and is owned
  by Plan 06-06.

## Consultant File Status

- `working_context.md`: updated to mark 06-04 complete and 06-05..06-06 pending.
- `system_map.md`: updated billing workflow and Phase 6 map for checkout intent.
- `feature_inventory.md`: updated Stripe Checkout from planned to hardening.
- `risk_register.md`: updated R-004 mitigation; score remains 15 until Portal
  and Stripe test-clock UAT prove the full loop.
- `backlog.md`: updated next micro-batch to Plan 06-05 admin settings/Customer
  Portal only.

## Risks / Notes

- Checkout has mocked SDK coverage only; live Stripe checkout/webhook/UAT is
  still pending later Phase 6 work.
- Customer Portal and a real admin billing settings page remain pending in
  Plan 06-05.
- Phase 6 is not shipped.

## Next Micro-Batch

Plan 06-05 only: admin settings and Customer Portal, using DB-stored
`stripeCustomerId` only and preserving the same server-derived billing trust
boundary.
