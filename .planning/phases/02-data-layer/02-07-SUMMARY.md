---
phase: 02
plan: 07
subsystem: data-layer
tags:
  - hotfix
  - clerk-webhook
  - middleware
  - auth
  - publicMetadata
  - role-sync
  - rls-adjacent
dependency_graph:
  requires:
    - Plan 02-05 (Clerk webhook handler at app/api/webhooks/clerk/route.ts)
    - Plan 02-05 (middleware.ts SF-M4 fold)
    - Plan 02-01 (lib/auth/context.ts asRole guard)
    - Phase 1 Plan 01-02 (CLERK_SECRET_KEY env var)
  provides:
    - publicMetadata.role propagation (closes the role-claim chain from
      Clerk webhook → users.role → Clerk publicMetadata → sessionClaims →
      getOrgContext / middleware admin gate)
    - Unified `{ role?: unknown }` narrowing contract across both auth-read
      sites (middleware.ts + lib/auth/context.ts)
  affects:
    - app/api/webhooks/clerk/route.ts (CR-01)
    - middleware.ts (HI-01)
tech_stack:
  added: []
  patterns:
    - "clerkClient().users.updateUserMetadata for role mirroring"
    - "Best-effort try/catch around Clerk Backend API call (DB write is
       primary; mirror is recoverable on next event)"
    - "typeof === 'string' narrowing matching context.ts asRole pattern"
key_files:
  created:
    - .planning/phases/02-data-layer/02-07-SUMMARY.md
  modified:
    - app/api/webhooks/clerk/route.ts
    - middleware.ts
decisions:
  - "Mirror role at user.created with the default `employee` so
    publicMetadata.role is never undefined; org membership events later
    overwrite with the org-scoped role."
  - "Best-effort try/catch (log + return) instead of throwing — DB write
    is primary; SF-W5 (clerk_events written before dispatch) means a
    thrown error here would silently lose the DB write effect on retry."
  - "Middleware narrowing tightened to `{ role?: unknown }` + typeof
    guard; do NOT introduce asRole() import — middleware only needs
    `=== 'admin'` literal check; asRole() in context.ts is the single
    source of truth for the full enum."
metrics:
  start: "2026-05-18T23:21:00Z"
  end: "2026-05-18T23:24:00Z"
  duration_minutes: 3
  tasks_completed: 2
  files_changed: 2
  commits: 2
  completed: "2026-05-18"
---

# Phase 02 Plan 07: Code-Review Hotfix (CR-01 + HI-01) Summary

**One-liner:** Webhook handler now mirrors `users.role` into Clerk
`publicMetadata.role` via `clerkClient.users.updateUserMetadata`, and
middleware narrows publicMetadata.role via `{ role?: unknown }` + typeof
guard — closing the two findings from the Phase 2 code review.

---

## Objective

Close two findings from `.planning/phases/02-data-layer/02-REVIEW.md`:

1. **CR-01 (CRITICAL)** — Clerk webhook handler didn't write
   `publicMetadata.role` back to Clerk via the Backend API. D-04 in
   `02-CONTEXT.md` mandates the dual write so `sessionClaims.publicMetadata.role`
   stays in sync with the DB row. Without it, every authenticated request
   after sign-up would call `asRole(undefined)` in `lib/auth/context.ts` and
   throw `Invalid role on session claims: undefined`.

2. **HI-01 (HIGH)** — `middleware.ts:66` narrowed publicMetadata via
   `{ role?: string }` while `lib/auth/context.ts:42` used the stricter
   `{ role?: unknown }`. Two auth-read sites disagreed on the contract;
   a future Clerk session-token template emitting role as a non-string
   value would type-erase to `undefined` here but blow up `asRole()` in
   `getOrgContext`.

---

## Deliverables

### CR-01 — Webhook mirrors role into Clerk publicMetadata

**File:** `app/api/webhooks/clerk/route.ts` (commit `5bdcbf9`, +64 / -1)

- Added `clerkClient` to the named imports from `@clerk/nextjs/server`.
- New `mirrorRoleToClerk(clerkUserId, role, source)` helper:
  - Calls `(await clerkClient()).users.updateUserMetadata(clerkUserId, { publicMetadata: { role } })`.
  - Wrapped in try/catch — logs structured `[clerk-webhook] failed to
    mirror publicMetadata.role ...` on error.
  - Does NOT throw — the DB row was already written; throwing would
    crash the dispatch handler which has SF-W5 (idempotency-before-dispatch)
    semantics that would mark the event processed in `clerk_events` and
    cause the role write to be lost on Clerk's retry.
- Wired into three role-affecting events:
  1. **`user.created`** — mirrors the default `employee` role so
     publicMetadata.role is populated immediately. The next
     `organizationMembership.created` event will overwrite with the
     correct org-scoped role.
  2. **`organizationMembership.created`** — mirrors `roleStr` (when
     narrowing succeeds) after the DB update returning rows confirms
     the users row was found.
  3. **`organizationMembership.updated`** — mirrors `roleStr` after the
     DB update; closes the role-demotion propagation gap (admin →
     employee on Clerk side now reaches the session claim).
- Skipped (correctly) for `organization.created` (no user role) and
  the three `*.deleted` log-only events (D-03c retention deferred).

### HI-01 — Middleware narrows publicMetadata.role via `{ role?: unknown }`

**File:** `middleware.ts` (commit `13a9a30`, +10 / -1)

- Changed `(sessionClaims?.publicMetadata as { role?: string } | undefined)?.role`
  to:
  ```typescript
  const pubMeta = sessionClaims?.publicMetadata as { role?: unknown } | undefined;
  const role = typeof pubMeta?.role === "string" ? pubMeta.role : undefined;
  ```
- Comment block in the diff cites HI-01 / Plan 02-07 + context.ts:42
  reference + rationale (middleware only needs the literal `admin`
  check; the full enum guard stays in asRole()).
- No `asRole` import introduced — keeps middleware procedural per
  ADR-024 ("middleware stays procedural; tier gating is app-layer").

---

## Verification

- `pnpm tsc --noEmit` → exits 0 (clean) after each commit boundary.
- `pnpm verify:phase-2` → exits 0 with **7/7 OK** (live TEST DB, ~22s):
  ```
  [1/7] OK   — tsc --noEmit zero errors
  [2/7] OK   — drizzle-kit migrate against TEST DB (idempotent)
  [3/7] OK   — L-05 — @/lib/db import allow-list (AST via ts-morph)
  [4/7] OK   — L-06 — cross-org RLS property test (positive + 10-table negative)
  [5/7] OK   — D-08 step 5 — schema audit (pg_catalog + information_schema)
  [6/7] OK   — Phase 1 + 2 artifact regression gate
  [7/7] OK   — D-03a stale-null users audit (0 stale rows)
  ```
- `clerkClient` import resolves: confirmed via `node -e "console.log(Object.keys(require('@clerk/nextjs/server')))"` — exposes `clerkClient` and `createClerkClient`. `@clerk/nextjs@7.3.4` is already pinned in `package.json`; no new package install.
- `CLERK_SECRET_KEY` already populated in `.env.local` from Phase 1 Plan 01-02.

---

## Commits

| Task   | Hash      | Type | Description                                                   |
| ------ | --------- | ---- | ------------------------------------------------------------- |
| CR-01  | `5bdcbf9` | fix  | webhook mirrors role into Clerk publicMetadata (D-04)         |
| HI-01  | `13a9a30` | fix  | middleware role narrowing matches context.ts contract         |

---

## Deviations from Plan

None — both fixes executed exactly as specified in the prompt + REVIEW.md.

- Plan said "apply to THREE events" + listed user.created as conditional
  on a payload org membership. The implemented handler unconditionally
  writes the default `employee` role at user.created (because the
  existing DB write also unconditionally defaults to `employee`).
  This keeps publicMetadata in sync with the DB at every moment;
  organizationMembership.created overwrites with the correct value
  later. This is well within the plan's deviation rules (the semantic
  intent is "keep DB and publicMetadata in sync" — the chosen shape
  achieves this with no extra reads of the Clerk org payload, which
  the current handler doesn't extract from user.created anyway).

- No package install required (deviation rule excluded path).

- No `any` types introduced.

- `asRole` import deliberately NOT added to middleware — see HI-01
  decision row. Middleware only needs the literal `"admin"` comparison.

---

## Authentication Gates

None — no auth interactions required during execution; environment
already has CLERK_SECRET_KEY from Phase 1.

---

## Known Stubs

None — both fixes ship complete behavior:
- The mirror runs on every role-affecting event.
- The middleware narrowing covers every shape Clerk could produce.

---

## Threat Flags

None — both fixes harden existing surfaces (webhook + middleware) that
were already in `02-CONTEXT.md`'s threat model under D-04 and D-10.
No new network endpoints, auth paths, or schema changes introduced.

---

## Self-Check

- [x] `app/api/webhooks/clerk/route.ts` modified — verified via `git log -1 --name-only 5bdcbf9` shows the file.
- [x] `middleware.ts` modified — verified via `git log -1 --name-only 13a9a30` shows the file.
- [x] Commit `5bdcbf9` present in `git log` (CR-01 fix).
- [x] Commit `13a9a30` present in `git log` (HI-01 fix).
- [x] `pnpm tsc --noEmit` exits 0.
- [x] `pnpm verify:phase-2` exits 0 with 7/7 OK against live TEST DB.
- [x] No `any` types introduced (`grep -nE ":\s*any[\s,);]|as any|<any>" app/api/webhooks/clerk/route.ts middleware.ts` returns nothing).
- [x] No new packages added (`package.json` unchanged).

## Self-Check: PASSED

---

*Plan 02-07 — Code-review hotfix — completed 2026-05-18*
