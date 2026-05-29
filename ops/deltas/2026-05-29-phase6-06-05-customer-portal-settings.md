# Delta - Phase 6 Plan 06-05 Customer Portal Settings

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Stage: checker -> execute -> verifier, Plan 06-05 only
Scope: admin settings billing surface and Stripe Customer Portal session action

---

## What Changed

Implemented the Plan 06-05 settings/Customer Portal slice without changing
webhooks, checkout/pricing behavior, migrations, schema, public pricing, Product
AI, acknowledgment behavior, cron/email, or Phase 7/8 work:

- Added `createPortalSessionAction` under `app/(admin)/settings/actions.ts`.
- Derived org and role from `getOrgContext()` + `requireAdminFromCtx(ctx)`.
- Read the stored Stripe customer through `withOrgScope` and
  `organizations.id = scope.orgId`.
- Created Stripe Billing Portal sessions with server-derived `customer` and
  trusted `return_url`.
- Redirected missing-customer orgs to `/settings?billing=setup`.
- Added `/settings` as an admin-gated route in middleware and enabled the
  Settings sidebar link.
- Added a minimal admin settings billing page showing DB-sourced plan/status,
  current period end, and cancel-at-period-end state.
- Added tests proving authorization, tenant scoping, forged-client-field
  rejection, safe missing-customer behavior, and no local state mutation.
- Updated the consultant packet to mark 06-05 complete locally and 06-06 as the
  next micro-batch.

No new package, migration, schema change, webhook behavior, `planTier` write,
custom subscription management, or first-party cancellation/upgrade/downgrade
logic was added.

## Branch / PR / Base

- Local branch: `gsd/phase-6-billing`.
- Starting HEAD: `f3005721204d81354fd759901eae8a1e47cdb102`
  (`feat(06-04): add checkout pricing intent`).
- `origin/main`: `af01f0a6378ab3c38421d5d495da8a72ee7e6887`.
- Upstream: none.
- PR: no PR was opened or pushed by this run.

## Docs

ctx7 was used before source changes:

- `/stripe/stripe-node` for `billingPortal.sessions.create` parameters.

## Verification

- Startup state checks - PASS.
- GSD command check - PASS/fallback: no narrow Plan 06-05 command exposed.
- RED test run before implementation - EXPECTED FAIL, missing portal action.
- `pnpm vitest run "app/(admin)/settings/actions.test.ts"` - PASS, 20 tests.
- Existing Stripe/billing suite - PASS, 67 tests.
- `pnpm check:admin-routes` - PASS.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS, 459 artifact assertions.
- `pnpm verify:phase-5` - PASS.
- `pnpm verify:phase-6` - unavailable; no script exists yet and Plan 06-06
  owns it.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS, `stripe 22.2.0`.
- Scans - PASS for no explicit TypeScript `any`, no secrets/full Stripe IDs/DB
  URLs, no acknowledgment mutation drift, auth/role-only middleware, no raw ID
  display in the settings UI source, and org-scoped settings reads.

## Consultant File Status

- `working_context.md`: updated to mark 06-05 complete and 06-06 pending.
- `system_map.md`: updated route/trust-boundary map for Customer Portal.
- `feature_inventory.md`: added admin billing settings + Customer Portal as a
  Phase 6 hardening feature.
- `risk_register.md`: updated R-004 mitigation; score remains 15 until Stripe
  test-clock UAT and the full verify chain prove the billing loop.
- `backlog.md`: updated next micro-batch to Plan 06-06 verify chain/UAT only.

## Risks / Notes

- Customer Portal has mocked SDK coverage only; live portal and Stripe
  test-clock proof remain in Plan 06-06.
- The settings page deliberately displays no invoice history, customer email, or
  full Stripe IDs.
- Phase 6 is not shipped.

## Next Micro-Batch

Plan 06-06 only: cumulative `verify:phase-6`, hosted CI/verification wiring,
artifact/schema checks as planned, and secret-safe Stripe sandbox/test-clock UAT.
