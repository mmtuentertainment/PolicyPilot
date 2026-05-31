---
phase: 06-billing
plan: 06-05
status: complete
completed_at: 2026-05-29
scope: admin-settings-customer-portal
---

# Plan 06-05 Summary - Admin Settings Customer Portal

## Outcome

Plan 06-05 is complete on `gsd/phase-6-billing`. The patch adds the admin
settings billing surface and Stripe Customer Portal Server Action.

Phase 6 is not shipped. Cumulative `verify:phase-6`, hosted CI wiring, Stripe
sandbox/test-clock UAT, cron/email work, and Phase 7/8 surfaces remain
untouched.

## Files

- `app/(admin)/settings/actions.ts`: added `createPortalSessionAction`, which
  derives org/admin context server-side, reads the org billing row through
  `withOrgScope`, uses only `organizations.stripeCustomerId`, creates a fresh
  Stripe Billing Portal session with trusted `return_url`, redirects to setup
  when no customer is linked, and does not mutate local billing state.
- `app/(admin)/settings/actions.test.ts`: added Customer Portal coverage for
  linked-customer success, forged client fields, missing customer setup path,
  auth/admin rejection, org-scoped reads, and no local mutation.
- `app/(admin)/settings/page.tsx`: new admin billing settings page showing
  DB-sourced plan, subscription status, current period end, and
  cancel-at-period-end state. It distinguishes no-subscription from `trialing`
  by checking `stripeSubscriptionId == null`, exposes Manage billing when a
  customer is linked, and uses the checkout action for setup when unlinked.
- `components/admin/AdminSidebar.tsx`: enabled Settings as an active `/settings`
  link.
- `middleware.ts`: added `/settings` to both admin URL and admin-role-required
  pattern arrays; middleware remains auth/role-only.

## Stripe Docs

Used ctx7 before implementation:

- `/stripe/stripe-node`: `billingPortal.sessions.create` and
  `BillingPortal.SessionCreateParams`, including `customer` and `return_url`.

## Behavior

- Portal creation accepts no trusted client billing parameters.
- Client-supplied customer, return URL, subscription, price, metadata, and flow
  data are ignored.
- The Portal session customer comes only from the org billing row read under
  the current org scope.
- The Portal session return URL is derived from `NEXT_PUBLIC_APP_URL` with a
  localhost fallback.
- Missing `stripeCustomerId` redirects to `/settings?billing=setup` instead of
  creating an unplanned customer.
- The settings page displays no invoice history, customer email, or full Stripe
  customer/subscription IDs.
- The portal action does not write `planTier`, subscription status,
  acknowledgments, or webhook/idempotency rows.

## Verification

- Startup state checks - PASS (`gsd/phase-6-billing`, clean, exact expected
  06-04 HEAD, no upstream, no PR, no confusing divergence from `origin/main`).
- GSD command check - PASS/fallback: no narrow Plan 06-05 command exposed; used
  manual checker -> execute -> verifier for Plan 06-05 only.
- RED test run before implementation - EXPECTED FAIL, missing
  `createPortalSessionAction`; existing checkout tests stayed green.
- `pnpm vitest run "app/(admin)/settings/actions.test.ts"` - PASS, 20 tests.
- `pnpm check:admin-routes` - PASS; `/settings` recognized as admin-gated.
- `pnpm tsc --noEmit` - PASS after adding a typed server-action wrapper for
  the checkout setup form.
- Existing Stripe/billing suite - PASS, 67 tests:
  `pnpm vitest run lib/stripe/catalog.test.ts lib/stripe/mask.test.ts
  lib/stripe/client.test.ts lib/stripe/products.test.ts
  lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts
  "app/(admin)/settings/actions.test.ts"`.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS, 459 artifact assertions.
- `pnpm verify:phase-5` - PASS, including Phase 3/4/5 chains and 301 unit
  tests in the main Vitest run.
- `pnpm verify:phase-6` - unavailable; no script exists yet in `package.json`.
  Plan 06-06 owns it.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS; `stripe 22.2.0` installed as a production
  dependency.
- Scans - PASS: no new explicit TypeScript `any`, no secrets/full Stripe IDs/DB
  URLs in the diff, no acknowledgment mutation drift, middleware remains
  auth/role-only, settings UI source displays no invoice history/customer
  email/full Stripe IDs, and settings reads include
  `where(eq(organizations.id, scope.orgId))`.

## GSD Stage

No narrow single-plan GSD runtime command was exposed. Exact probe:
`gsd-sdk query init.execute-plan 06-05` failed with `Unknown init workflow:
execute-plan`; available init workflows included `execute-phase`, `plan-phase`,
and `verify-work`. This run therefore used manual checker -> execute ->
verifier for Plan 06-05 only and did not invent GSD output.

## Deviations

- `createCheckoutSessionAction` keeps its Plan 06-04 `useActionState`-compatible
  signature, so the RSC settings page wraps it with a small `Promise<void>`
  server action before using it as a plain form action.

## Remaining

- Plan 06-06 still owns cumulative `verify:phase-6`, hosted verification, and
  secret-safe Stripe sandbox/test-clock UAT.
