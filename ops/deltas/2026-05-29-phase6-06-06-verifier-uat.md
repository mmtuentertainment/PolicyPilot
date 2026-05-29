# Delta - Phase 6 Plan 06-06 Verifier And UAT

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Stage: verifier, Plan 06-06 only
Scope: cumulative Phase 6 verifier wiring, hosted verification workflow, and
secret-safe Stripe sandbox/test-clock UAT checklist

---

## What Changed

Implemented the Plan 06-06 verifier/UAT slice without changing runtime billing
behavior, webhook behavior, product AI, acknowledgment behavior, packages,
migration files, or schema files:

- Added `verify:phase-6` in `package.json`.
- Extended `scripts/check-deploy-schema.ts` to assert the five Phase 6
  `organizations` billing columns and two partial unique Stripe indexes.
- Mirrored the same Phase 6 schema assertions in `scripts/check-schema.ts`.
- Extended `scripts/check-artifacts.ts` with Phase 6 billing artifact checks:
  Stripe webhook raw-body/signature shape, catalog/client/normalize/mask,
  `countOrgUsers`, settings checkout/portal actions, settings page, 0012
  migration/journal entry, `/settings` middleware, hosted workflow, and UAT
  checklist.
- Added `.github/workflows/verify-phase-6.yml`, a PR/push/workflow_dispatch
  job that runs `pnpm verify:phase-6` and references secrets by name only.
- Added `.planning/phases/06-billing/06-UAT.md`, a masked-only Stripe
  sandbox/test-clock UAT checklist.
- Added `.planning/phases/06-billing/06-06-SUMMARY.md`.
- Updated all five consultant files to mark verifier wiring complete while
  keeping Phase 6 unshipped.

## Branch / PR / Base

- Local branch: `gsd/phase-6-billing`.
- Starting HEAD: `0baee191a405a1bf4eead13f360d1fb6c55a40d6`
  (`feat(06-05): add customer portal settings`).
- `origin/main`: descendant of PR #30 merge `ee50880` and Phase 5 ship commit
  `3344847`.
- Upstream: none.
- PR: none opened or pushed by this run.

## Docs

ctx7 was used before verifier decisions:

- `/websites/stripe` for Customer Portal Session `customer` and `return_url`
  behavior.

## Verification

- Startup state checks - PASS.
- GSD command check - PASS/fallback:
  - `gsd-sdk --help` and `gsd-tools --help` expose generic command surface.
  - `gsd-sdk query init.verify-work 6` returned phase metadata with
    `has_verification: false`.
  - `gsd-sdk query init.execute-plan 06-06` failed because `execute-plan` is
    not a registered init workflow.
- Targeted 06-05 settings/customer portal tests - PASS, 20 tests.
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
  has 12/13 migrations and is missing `0012_billing_state`.
- `pnpm verify:phase-6` - FAIL/BLOCKED at `pnpm db:verify` for the same
  configured DB drift.
- `git diff --check` - PASS.
- `pnpm ls stripe` - PASS, `stripe 22.2.0`.

## Consultant File Status

- `working_context.md`: updated to mark Plan 06-06 verifier wiring complete,
  with `db:verify` and Stripe UAT pending.
- `system_map.md`: updated current phase map/status only; no runtime
  architecture shape changed.
- `feature_inventory.md`: added the Phase 6 verifier/UAT checklist as a
  hardening feature.
- `risk_register.md`: updated R-004 and R-008 for the surfaced deploy-schema
  drift and pending UAT.
- `backlog.md`: updated the next micro-batch to operator-controlled migration
  verification plus Stripe sandbox/test-clock UAT.

## Risks / Notes

- The new deploy-schema assertions intentionally fail against the configured
  `.env.local` deploy-verifier DB until existing migration `0012_billing_state`
  is applied there.
- The TEST sibling schema verifier passes, so the repo/test DB side already has
  the Phase 6 billing columns and indexes.
- Stripe sandbox/test-clock UAT remains BLOCKED/pending; no evidence was
  fabricated.
- `pnpm test -- --run <path>` is not executable through this repo's pnpm
  shortcut. The verifier uses `pnpm run test -- --run <path>`, which runs the
  same Vitest path filters.

## Next Micro-Batch

Operator-controlled: apply or verify existing migration `0012_billing_state` on
the configured `db:verify` target, rerun `pnpm db:verify` and
`pnpm verify:phase-6`, then perform masked Stripe sandbox/test-clock UAT.
