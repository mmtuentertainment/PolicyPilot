---
phase: 07-crons-email
plan: 07-08
status: complete-local
completed_at: 2026-06-05
scope: phase-7-notification-bell-ui
---

# Plan 07-08 Summary - Notification Bell UI

## Outcome

Plan 07-08 is complete locally. The notification bell has a server wrapper,
client dropdown/sheet UI, mark-read and mark-all actions, and admin/employee
mount points. The reviewer header remains untouched.

The UI follows the approved bell design constraints: server repository access
stays in the wrapper/action layer, the client component receives props, and
Base UI dropdown primitives are wired with the repo's existing conventions.

## Files

- `app/(employee)/notifications/actions.ts`: added mark-one and mark-all
  server actions with org-scoped repository calls and revalidation.
- `components/notifications/NotificationBellServer.tsx`: fetches unread rows
  through `getOrgContext` and `withOrgScope`.
- `components/notifications/NotificationBell.tsx`: added desktop dropdown,
  mobile sheet, optimistic unread count, item actions, empty/loading/error
  states, and 9+ badge cap.
- `components/notifications/notification-href.ts`: maps notification payloads
  to persona-safe links and display text.
- `app/(admin)/layout.tsx`: mounts the bell in the admin topbar.
- `app/(employee)/layout.tsx`: mounts the bell in the employee header.

## Verification

- `npx pnpm@9.15.9 exec tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-crons-email.ts --config scripts/check-crons-email.vitest.config.ts` - PASS.
- `npx pnpm@9.15.9 exec tsc --noEmit` - PASS.
- `npx pnpm@9.15.9 run build` - PASS.

## Residual Risk

No browser/UAT pass was run against live seeded notifications in the UI.
