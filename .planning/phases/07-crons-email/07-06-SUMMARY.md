---
phase: 07-crons-email
plan: 07-06
status: complete-local
completed_at: 2026-06-05
scope: phase-7-event-emission-and-worker
---

# Plan 07-06 Summary - Event Emission And Worker

## Outcome

Plan 07-06 is complete locally. Policy assignment and policy update events now
create in-app notifications and attempt transactional emails after commit. The
Railway worker entrypoint is dependency-free and calls the protected cron route
with the configured secret.

No worker was deployed and no live email was sent.

## Files

- `app/(admin)/policies/[id]/actions.ts`: emits `policy_assigned`
  notifications/emails only when new assignment rows are inserted.
- `lib/policies/transitions.ts`: emits `policy_updated` notifications/emails
  after publishing a new version beyond first publish.
- `worker/trigger-reminders.mjs`: added the Railway cron trigger script.
- `railway.json`: added the Railway start command and daily cron schedule.

## Verification

- `node --check worker\trigger-reminders.mjs` - PASS.
- `npx pnpm@9.15.9 exec tsc --noEmit` - PASS.
- `npx pnpm@9.15.9 run build` - PASS.

## Residual Risk

Railway schedule execution, Vercel route reachability from Railway, and Resend
sender configuration remain operator-gated hosted checks.
