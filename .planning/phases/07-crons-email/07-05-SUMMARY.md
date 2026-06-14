---
phase: 07-crons-email
plan: 07-05
status: complete-local
completed_at: 2026-06-05
scope: phase-7-cron-route
---

# Plan 07-05 Summary - Reminder Cron Route

## Outcome

Plan 07-05 is complete locally. The cron route is protected by bearer
`CRON_SECRET`, enumerates organizations only after the secret gate, runs each
org through `withOrgScope`, claims `reminder_sends` rows before creating
notifications, and sends email only after the database work commits.

Per-org failures are reported in counts; fatal pre-loop database failures return
503.

## Files

- `app/api/cron/reminders/route.ts`: added the Node runtime route with
  `force-dynamic`, authorization, per-org isolation, ledger claim, notification
  creation, and post-commit email dispatch.
- `app/api/cron/reminders/route.test.ts`: added authorization and success-path
  unit coverage.
- `scripts/check-artifacts.ts`: allowed this route as the deliberate cron
  organization-enumeration exception to the raw-DB artifact gate.

## Verification

- `npx pnpm@9.15.9 run test -- --run app/api/cron` - PASS, 3 tests.
- `npx pnpm@9.15.9 run build` - PASS after fixing one linted JSX entity.
- `npx pnpm@9.15.9 run check:artifacts` - PASS, 543 assertions.

## Residual Risk

The route has not been exercised from hosted Railway/Vercel infrastructure, and
no live Resend email was sent.
