# Delta - Phase 6 Plan 06-03 Tier Gates

Date: 2026-05-29
Branch: `gsd/phase-6-billing`
Stage: checker -> execute -> verifier, Plan 06-03 only
Scope: real `maxUsers` count and Phase 4 tier-contract regression guard

---

## What Changed

Implemented the Plan 06-03 tier-gate slice without starting checkout, portal,
pricing UI, admin settings, cron/email, or Phase 7/8 work:

- Added `countOrgUsers(orgId)` in `lib/stripe/products.ts`.
- Counted users with an explicit `eq(users.orgId, orgId)` predicate.
- Wired `checkTierLimit(orgId, 'maxUsers')` through
  `self.countOrgUsers(...)` so the existing vi.spyOn split-helper contract
  still works.
- Added focused tests for Starter/Growth/Business maxUsers behavior and
  preserved Phase 4 `consistencyCheck` / `aiDraftsMonthly` contracts.

No migration was added and no schema expectation changed.

## Branch / PR / Base

- Local branch: `gsd/phase-6-billing`.
- PR lookup for head `gsd/phase-6-billing`: no PRs returned.
- Starting HEAD: `ebd5708 feat(06-02): add stripe webhook idempotency`.
- `origin/main`: `af01f0a docs(state): refresh post-pr30 merge bookkeeping (#31)`.
- `origin/main` is an ancestor of the branch HEAD.

## Docs

ctx7 was used before changing Drizzle usage:

- `/drizzle-team/drizzle-orm-docs` for Drizzle select aggregation/count
  patterns with typed SQL casts.

No broad web browsing was used.

## Verification

- Startup state checks - PASS.
- GSD command check - FALLBACK: `gsd-sdk query init.execute-plan 06-03` failed
  with `Unknown init workflow: execute-plan`; only phase-level workflows were
  exposed.
- `pnpm db:migrate:test` - PASS.
- `pnpm vitest run lib/stripe/products.test.ts` - PASS, 16 tests.
- `pnpm vitest run lib/stripe/products.test.ts lib/stripe/catalog.test.ts lib/stripe/mask.test.ts lib/stripe/client.test.ts lib/stripe/normalize.test.ts app/api/webhooks/stripe/route.test.ts` - PASS, 47 tests.
- `pnpm tsc --noEmit` - PASS.
- `pnpm check:error-discipline` - PASS.
- `pnpm check:db-imports` - PASS.
- `pnpm check:acknowledgment-immutability` - PASS.
- `pnpm check:artifacts` - PASS.
- `pnpm verify:phase-5` - PASS.

## Consultant File Status

- `working_context.md`: updated to mark 06-03 complete and 06-04..06-06 pending.
- `system_map.md`: updated Phase 6 runtime status; Phase 6 still not shipped.
- `feature_inventory.md`: updated tier-gating status to hardening, pending checkout/UAT.
- `risk_register.md`: updated billing and AI-cost mitigations with 06-03 completion; scores unchanged.
- `backlog.md`: updated next micro-batch to Plan 06-04 only.

## Risks / Notes

- The Plan 06-03 local artifact does not authorize subscription-status checks
  inside `checkTierLimit`; status policy remains enforced by the Plan 06-02
  webhook/normalizer that writes `organizations.planTier`.
- `maxUsers` remains a non-destructive predicate only. There is still no
  first-party invite/user-management flow to block in Phase 6.
- Stripe test-clock UAT remains pending for the full billing loop.

## Next Micro-Batch

Plan 06-04 only: checkout and pricing intent. Do not start Customer Portal,
settings UI beyond what 06-04 explicitly requires, cron/email, Phase 7, or
Phase 8 work in that slice.
