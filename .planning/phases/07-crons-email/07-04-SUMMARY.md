---
phase: 07-crons-email
plan: 07-04
status: complete-local
completed_at: 2026-06-05
scope: phase-7-notification-reminder-repositories
---

# Plan 07-04 Summary - Repository And Publish Hooks

## Outcome

Plan 07-04 is complete locally. The notification repository write methods are
implemented, org-wide reminder candidate queries exist, and publish writes
`next_review_date` forward-only from the current publish event.

The cron `userId=''` audit is documented in the repository: notification writes
do not use scoped `s.userId` as a UUID foreign key, and reminder send `user_id`
comes from the candidate row.

## Files

- `lib/db/repositories/notifications.ts`: implemented `create`, `markRead`,
  and later `markAllReadForUser`, with explicit org scoping.
- `lib/db/repositories/reminders.ts`: added org-wide review-due and
  acknowledgment-reminder candidate queries.
- `lib/policies/transitions.ts`: added forward-only `nextReviewDate` write on
  publish and post-commit `policy_updated` notification/email emission for
  subsequent published versions.

## Verification

- `npx pnpm@9.15.9 exec tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-crons-email.ts --config scripts/check-crons-email.vitest.config.ts` - PASS.
- `npx pnpm@9.15.9 exec tsc --noEmit` - PASS.
- `npx pnpm@9.15.9 run check:db-imports` - PASS.

## Residual Risk

The reminder candidate query behavior is covered by source/static gates, not by
a dedicated seeded TEST-DB scenario per reminder edge case.
