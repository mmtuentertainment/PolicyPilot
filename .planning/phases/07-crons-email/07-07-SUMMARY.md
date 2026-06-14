---
phase: 07-crons-email
plan: 07-07
status: complete-local-verifier-blocked
completed_at: 2026-06-05
scope: phase-7-cumulative-verifier-and-ci
---

# Plan 07-07 Summary - Cumulative Verifier And CI

## Outcome

Plan 07-07 is implemented locally, but the cumulative verifier is not green.
The package script and hosted workflow exist, and focused Phase 7 gates pass.
The full inherited `verify:phase-7` chain failed inside the inherited full test
suite.

The failing files passed when rerun individually, so the current evidence points
to an inherited full-suite/concurrency issue rather than a proven Phase 7 code
defect. This is still a ship blocker until resolved or explicitly accepted by
the operator.

## Files

- `package.json`: added `verify:phase-7`.
- `.github/workflows/verify-phase-7.yml`: added the hosted verification job.
- `scripts/check-artifacts.ts`: added Phase 7 artifact assertions.
- `scripts/check-schema.ts`, `scripts/check-deploy-schema.ts`,
  `scripts/check-rls.ts`: included Phase 7 schema/RLS contracts.
- `app/api/webhooks/clerk/route.test.ts`: added T8 409/catch-path coverage.

## Verification

- `npx pnpm@9.15.9 run test -- --run app/api/webhooks/clerk` - PASS, 2 tests.
- `npx pnpm@9.15.9 run check:artifacts` - PASS, 543 assertions.
- `npx pnpm@9.15.9 run check:rls` - PASS.
- `npx pnpm@9.15.9 run db:verify` - PASS.
- `npx pnpm@9.15.9 run verify:phase-7` - FAIL in inherited full `pnpm test`.

## Failed Cumulative Test Surfaces

- `app/api/ai/consistency/route.test.ts`: failed in cumulative run; isolated
  rerun passed.
- `app/api/ai/qa/route.test.ts`: failed in cumulative run; isolated rerun
  passed.
- `app/api/webhooks/stripe/route.test.ts`: failed in cumulative run; isolated
  rerun passed.

## Residual Risk

Do not push/PR/ship until the cumulative verifier failure is resolved or
Matthew explicitly accepts the residual risk.
