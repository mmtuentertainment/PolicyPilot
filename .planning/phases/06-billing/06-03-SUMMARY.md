---
phase: 06-billing
plan: 06-03
status: complete
completed_at: 2026-05-29
scope: tier-gates-maxusers
---

# Plan 06-03 Summary - Tier Gates And maxUsers

## Outcome

Plan 06-03 is complete on `gsd/phase-6-billing`. The patch turns
`maxUsers` from a placeholder `current = 0` branch into a real org-scoped user
count while preserving the existing Phase 4 tier-gate contract.

Phase 6 is not shipped. Checkout, Customer Portal, pricing UI, admin settings,
cron/email work, and Phase 7/8 surfaces remain untouched.

No migration was added and no schema expectation changed.

## Files

- `lib/stripe/products.ts`: added exported `countOrgUsers(orgId)` and wired
  `checkTierLimit(orgId, 'maxUsers')` through `self.countOrgUsers(...)`.
- `lib/stripe/products.test.ts`: added maxUsers Starter/Growth/Business cases
  plus regression coverage for missing billing state defaulting to Starter and
  Growth `consistencyCheck` remaining allowed.

## Tier-Gate Matrix

| Feature / tier | Result |
|---|---|
| Starter `maxUsers` at 25 users | `{ allowed: false, limit: 25, current: 25 }` |
| Growth `maxUsers` at 25 users | `{ allowed: true, limit: 100, current: 25 }` |
| Business `maxUsers` at 25 users | `{ allowed: true, limit: 500, current: 25 }` |
| Missing billing row -> Starter + `consistencyCheck` | `{ allowed: false, limit: -1, current: 0 }` |
| Growth + `consistencyCheck` | `{ allowed: true, limit: -1, current: 0 }` |
| Business + `aiDraftsMonthly` | unlimited short-circuit, `limit: -1`, no draft count |
| Starter `aiDraftsMonthly` at 50/50 | `TierLimitExceededError`, status `429` |
| Starter `consistencyCheck` | `TierLimitExceededError`, status `403`, required tier `growth` |

## maxUsers Count

`countOrgUsers` uses Drizzle to select `cast(count(*) as int)` from `users`
with `where(eq(users.orgId, orgId))`. The count includes all current org user
rows regardless of role, matching the Plan 06-03 assumption that maxUsers is an
org-wide seat predicate. It does not create, invite, delete, or mutate users.

## Docs

Used ctx7 before changing Drizzle usage:

- `/drizzle-team/drizzle-orm-docs`: Drizzle select aggregations and typed
  `sql<number>\`cast(count(... ) as int)\`` / count helper patterns.

No broad web browsing was used.

## Verification

- Startup state checks - PASS (`gsd/phase-6-billing`, clean, expected 06-02
  HEAD, `origin/main` ancestor, no PR).
- GSD command check - PASS/fallback: no narrow Plan 06-03 command exposed; used
  manual checker -> execute -> verifier for Plan 06-03 only.
- `pnpm test -- --run lib/stripe/products.test.ts` - unavailable in this repo
  wiring (`Unknown option: 'run'`); used the established equivalent below.
- RED test run before implementation - EXPECTED FAIL, `countOrgUsers does not exist`.
- `pnpm vitest run lib/stripe/products.test.ts` - PASS, 16 tests.
- `pnpm db:migrate:test` - PASS.
- `pnpm vitest run lib/stripe/products.test.ts lib/stripe/catalog.test.ts lib/stripe/mask.test.ts lib/stripe/client.test.ts lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts` - PASS, 47 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS.
- `pnpm verify:phase-5` - PASS.

## GSD Stage

No narrow single-plan GSD runtime command was exposed. The available
`gsd-execute-phase` and `gsd-verify-work` paths are phase-level. Exact probe:
`gsd-sdk query init.execute-plan 06-03` failed with `Unknown init workflow:
execute-plan`; available init workflows included `execute-phase`, `plan-phase`,
and `verify-work`. This run therefore emulated checker -> execute -> verifier
for Plan 06-03 only and did not invent GSD output.

## Deviations

- Added a missing-billing-state `consistencyCheck` regression test because the
  current user prompt explicitly asked for fail-closed tier-gate behavior; it
  stays within the existing `readPlanTier` -> Starter default contract.
- Did not implement subscription-status gating in `checkTierLimit`; Plan 06-03
  authorizes the `maxUsers` predicate and Phase 4 403/429 contract only. Status
  downgrade/preserve behavior remains owned by Plan 06-02 webhook sync and its
  normalizer tests.
