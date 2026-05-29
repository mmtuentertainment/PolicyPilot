---
phase: 06-billing
plan: 06-06
status: verifier-wired-db-uat-blocked
completed_at: 2026-05-29
scope: phase-6-verifier-ci-uat
---

# Plan 06-06 Summary - Phase 6 Verifier And UAT Evidence

## Outcome

Plan 06-06 verifier wiring is complete on `gsd/phase-6-billing`.

This patch adds the cumulative Phase 6 verifier script, extends schema and
artifact gates for billing closeout, adds a hosted GitHub Actions workflow for
`verify:phase-6`, and creates the secret-safe Stripe sandbox/test-clock UAT
checklist.

Phase 6 is not shipped. `pnpm verify:phase-6` currently fails at
`pnpm db:verify` because the configured `.env.local` deploy-verifier database
has 12 migrations applied while the repo journal has 13 through
`0012_billing_state`. Codex did not apply migrations or run live Stripe UAT.

## Files

- `package.json`: added `verify:phase-6` cumulative chain.
- `scripts/check-deploy-schema.ts`: added Phase 6 assertions for the five
  billing columns on `organizations` and the two partial unique Stripe indexes.
- `scripts/check-schema.ts`: mirrored the same Phase 6 column/index assertions
  for the TEST sibling schema verifier.
- `scripts/check-artifacts.ts`: added Phase 6 billing artifact assertions for
  webhook raw-body shape, Stripe helper modules, settings actions/page,
  `0012_billing_state`, `/settings` middleware, the hosted workflow, and
  `06-UAT.md`.
- `.github/workflows/verify-phase-6.yml`: added a PR/push/workflow_dispatch
  hosted verification job that runs `pnpm verify:phase-6` with secrets
  referenced by name only.
- `.planning/phases/06-billing/06-UAT.md`: added the masked evidence checklist
  for checkout, webhook sync, tier gate, Customer Portal, renewal, payment
  failure, and cancel/unpaid flows.
- `.planning/consultant/*.md`: refreshed the consultant overlay to mark
  verifier wiring complete while keeping Phase 6 unshipped.
- `ops/deltas/2026-05-29-phase6-06-06-verifier-uat.md`: added this delta.

## GSD Stage

Requested stage: verifier for Plan 06-06 only.

GSD command surface:

- `gsd-sdk --help` - available generic commands only.
- `gsd-tools --help` - same generic command surface.
- `gsd-sdk query init.verify-work 6` - returned phase metadata with
  `has_verification: false`.
- `gsd-sdk query init.execute-plan 06-06` - failed:
  `Unknown init workflow: execute-plan`.

Fallback used: manual verifier execution against Plan 06-06 only. No GSD output
was invented.

## Stripe Docs

Used ctx7 before verifier decisions:

- `/websites/stripe`: Customer Portal Session API confirms creating a portal
  session with required `customer` and optional `return_url`.
- The UAT checklist keeps Stripe sandbox/test-clock proof operator-run and
  masked-only.

## Verification

- Startup state checks - PASS: branch `gsd/phase-6-billing`, clean start,
  exact expected HEAD `0baee191a405a1bf4eead13f360d1fb6c55a40d6`, no upstream,
  no PR, and branch descended from `ee50880`.
- 06-05 summary/delta/consultant consistency - PASS; 06-05 was present and
  pointed to 06-06 as the next micro-batch.
- `pnpm vitest run "app/(admin)/settings/actions.test.ts"` - PASS, 20 tests.
- Existing billing suite - PASS, 67 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS, 520 assertions.
- `pnpm verify:phase-5` - PASS.
- `pnpm exec tsx --env-file=.env.local scripts/check-schema.ts` - PASS,
  including Phase 6 billing column/index assertions against the TEST sibling
  schema.
- `pnpm db:verify` - FAIL/BLOCKED: configured `.env.local` deploy-verifier DB
  has 12/13 migrations applied and is missing the five Phase 6 billing columns
  plus both partial unique Stripe indexes.
- `pnpm verify:phase-6` - FAIL/BLOCKED at `pnpm db:verify` for the same 12/13
  migration drift.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS, `stripe 22.2.0`.

## Command-Surface Deviation

The Plan 06-06 text used `pnpm test -- --run <path>`, but this repo's pnpm
shortcut rejects that form with `Unknown option: 'run'`. The verifier uses the
executable equivalent `pnpm run test -- --run <path>`, which passes the same
Vitest path filters.

## Hosted/UAT Status

- Vercel CLI exists locally (`54.6.0` native), but no push/PR/deployment was
  requested or performed.
- Stripe CLI exists locally (`1.42.0`), but no Stripe API/dashboard/test-clock
  access was used and no live/test objects were created.
- Hosted `/settings`, linked/unlinked org portal behavior, checkout, webhook,
  tier-gate transition, portal return, renewal, payment-failure, and cancel
  flows are BLOCKED pending operator-run Stripe sandbox/test-clock UAT.

## Scans

- Secret/full-ID diff scan - PASS: no `sk_*`, `whsec_*`, full Stripe customer,
  full subscription, full price, DB URL, or billing portal URL leaked in the
  diff.
- Explicit TypeScript `any` scan - NO NEW MATCHES in this patch. Existing
  pre-existing matches remain in `lib/db/scoped.ts` and test mocks.
- Webhook raw-body/idempotency scan - PASS: `request.text()`,
  `constructEvent`, `stripeEvents`, and `onConflictDoNothing()` remain present;
  `request.json()` absent.
- Acknowledgment mutation drift scan - PASS in `app/` and `lib/`.
- Middleware/settings scan - PASS: `/settings` remains admin-gated; billing
  settings reads use `where(eq(organizations.id, scope.orgId))`.
- Client-supplied billing authority scan - PASS: checkout parses only
  `tier`/`interval`; portal uses stored `org.stripeCustomerId` and trusted
  `${APP_URL}/settings`.

## Remaining

- Apply or verify existing migration `0012_billing_state` on the configured
  `.env.local` deploy-verifier DB target, then rerun `pnpm db:verify` and
  `pnpm verify:phase-6`.
- Run Stripe sandbox/test-clock UAT and record masked PASS evidence in
  `.planning/phases/06-billing/06-UAT.md`.
- Do not mark Phase 6 shipped until both are complete.
