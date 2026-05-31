---
phase: 06-billing
plan: 06-04
status: complete
completed_at: 2026-05-29
scope: checkout-pricing-intent
---

# Plan 06-04 Summary - Checkout Pricing Intent

## Outcome

Plan 06-04 is complete on `gsd/phase-6-billing`. The patch adds the
trusted admin checkout Server Action and updates public pricing so it carries
only non-authoritative tier/interval intent.

Phase 6 is not shipped. Customer Portal, the admin settings page UI, billing
UAT, cron/email work, and Phase 7/8 surfaces remain untouched.

## Files

- `app/(admin)/settings/actions.ts`: new admin-only
  `createCheckoutSessionAction` that derives org context server-side, validates
  only `{ tier, interval }`, chooses the Stripe Price ID from the locked
  catalog, reads stored billing state through `withOrgScope`, blocks duplicate
  active/trialing/past_due subscriptions, and creates a Stripe Checkout Session
  with server-derived `client_reference_id`, session metadata, subscription
  metadata, customer when linked, and trusted success/cancel URLs.
- `app/(admin)/settings/actions.test.ts`: checkout tests for all six
  tier/interval combinations, forged client billing fields, auth/admin
  enforcement, duplicate-subscription guard, stored customer reuse, invalid
  input fail-closed behavior, and metadata/reference safety.
- `app/(marketing)/pricing/page.tsx`: monthly/annual selector, annual display
  pricing, and `/sign-up?tier=...&interval=...` CTA intent with no Stripe or DB
  authority.

## Stripe And Next.js Docs

Used ctx7 before and during implementation:

- `/stripe/stripe-node`: Checkout Session create params including
  `mode`, `line_items`, `customer`, `client_reference_id`, `metadata`,
  `subscription_data`, `success_url`, and `cancel_url`.
- `/vercel/next.js`: Server Action `redirect()` guidance; redirect remains
  outside `try/catch` and returns 303 for Server Actions.

## Behavior

- Public pricing never calls Stripe and never reads org/customer/subscription
  state.
- Checkout creation accepts only tier and interval from the form.
- Client-supplied org, customer, subscription, price, client reference, or
  metadata fields are ignored.
- The Checkout Session uses the active server auth org for
  `client_reference_id`, `metadata.policyPilotOrgId`, and
  `subscription_data.metadata.policyPilotOrgId`.
- Existing `stripeCustomerId` is passed as `customer`; absent customer lets
  Checkout create one.
- Existing `active`, `trialing`, or `past_due` subscription status redirects to
  `/settings?billing=manage` and does not create a new session.
- `organizations.planTier` is never mutated by checkout creation.

## Verification

- Startup state checks - PASS (`gsd/phase-6-billing`, clean, expected 06-03
  HEAD, `origin/main` at `af01f0a`, no upstream, no material PR/upstream state).
- GSD command check - PASS/fallback: no narrow Plan 06-04 command exposed; used
  manual checker -> execute -> verifier for Plan 06-04 only.
- RED test run before implementation - EXPECTED FAIL, missing
  `app/(admin)/settings/actions.ts`.
- `pnpm vitest run app/(admin)/settings/actions.test.ts` - PASS, 15 tests.
- `pnpm vitest run lib/stripe/normalize.test.ts` - PASS, 9 tests.
- `pnpm vitest run lib/stripe/catalog.test.ts lib/stripe/mask.test.ts lib/stripe/client.test.ts lib/stripe/products.test.ts lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts app/(admin)/settings/actions.test.ts` - PASS, 62 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS after retaining the legacy literal monthly
  price strings in the pricing source.
- `pnpm verify:phase-5` - PASS.

## GSD Stage

No narrow single-plan GSD runtime command was exposed. The available
`gsd-execute-phase` and `gsd-verify-work` paths are phase-level. Exact probe:
`gsd-sdk query init.execute-plan 06-04` failed with `Unknown init workflow:
execute-plan`; available init workflows included `execute-phase`, `plan-phase`,
and `verify-work`. This run therefore emulated checker -> execute -> verifier
for Plan 06-04 only and did not invent GSD output.

## Deviations

- Used `/settings?billing=manage` as the duplicate-subscription redirect target
  because Customer Portal is intentionally deferred to Plan 06-05.
- `lib/stripe/normalize.test.ts` is the actual existing normalizer test path;
  the prompt's `normalizer.test.ts` spelling does not exist in the repo.
- The first `check:artifacts` run failed because the pricing page no longer
  contained literal `$79`, `$199`, and `$449` strings. The page now keeps those
  literals in tier data while still displaying annual pricing from the new
  interval selector.
