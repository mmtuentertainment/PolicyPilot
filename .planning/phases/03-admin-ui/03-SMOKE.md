---
phase: 03-admin-ui
type: smoke-report
status: gaps-found
date: 2026-05-19
operator: matthew (mmtuentertainment@gmail.com / b2iy, mmtuproperties@gmail.com / JIum)
---

# Phase 3 — Webhook Live-Smoke Report

Run during /gsd-execute-phase 3 --auto on 2026-05-19. The webhook live-smoke
walkthrough (Plan 03-11 Task 6) exposed two distinct defects. Phase 3 *code*
ships clean (252/252 artifact assertions, 51/51 vitest, all 6 verify:phase-3
gates green), but the end-to-end flow does NOT work in production shape.

## What was verified end-to-end

| # | Path | Result |
|---|------|--------|
| 1 | cloudflared quick tunnel → svix → /api/webhooks/clerk | ✓ working (verified via curl: GET 405, POST 400 — handler reachable + correctly rejecting unsigned) |
| 2 | sign-up → svix signature verify | ✓ POST /api/webhooks/clerk 200 with rotated whsec_ (closes SF-WHSEC-1) |
| 3 | sign-up → user.created handler → users DB row | ✓ inserted with org_id NULL pending membership (D-03a) |
| 4 | sign-up → CR-01 dual-write: DB role → Clerk publicMetadata.role | ✓ `[clerk-webhook] publicMetadata.role mirrored user=user_***JIum role=employee source=user.created` |
| 5 | CreateOrganization widget → organization.created handler → organizations DB row | ✓ org row inserted (org_3DxxQMgv1IiklJ0XtevTd7yyTtc + later org_3Dy5O...4cy0) |
| 6 | maskClerkOrgId helper applied at log sites (L-06b) | ✓ all org logs show `org_***yTtc` form |
| 7 | clerk_events idempotency (D-03b) | ✓ duplicate svix-msg-id short-circuits to 200 |
| 8 | organizationMembership.created handler — happy path | ✓ via manual Backend API call: `[clerk-webhook] organizationMembership.created user=user_***JIum org=org_***yTtc role=admin` (DB written, role mirrored) |
| 9 | Embedded `<SignIn />` afterSignIn redirect to /post-sign-in | ✓ after adding NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in to .env.local (env var fix needed — see GAP-3 below) |

## GAP-1 (BLOCKER) — Clerk text org_id vs DB UUID type mismatch

**Severity:** BLOCKER. No Phase 3 admin page can render at runtime.

**Where:** `lib/auth/context.ts:57` getOrgContext returns `session.orgId` (Clerk's
text format like `org_3Dy5O8496Dm11t8d16w8dXD4cy0`). All repository queries
filter by `eq(table.orgId, scope.orgId)` where the column type is UUID. Postgres
rejects with `invalid input syntax for type uuid: "org_3Dy5O..."` (SQLSTATE 22P02).

**First failure:** `app/(admin)/dashboard/page.tsx:47` → `Policies.statusCounts`
→ `select "status", cast(count(*) as int) from "policies" where "policies"."org_id" = $1`
with params `["org_3Dy5O8496Dm11t8d16w8dXD4cy0"]`.

**Why automated checks missed it:**
- `lib/policies/state-machine.test.ts` (24 cases) — pure module, no DB
- `lib/policies/transitions.test.ts` (14 cases) — mocks withOrgScope
- `app/(admin)/policies/[id]/actions.test.ts` (5 cases) — mocks transitions
- `lib/auth/require-admin.test.ts` (4 cases) — mocks getOrgContext
- `scripts/check-rls.ts` — uses fixed internal UUIDs, not Clerk session shape
- `scripts/check-data-layer.ts` — same: tests RLS with internal UUIDs

**The schema is correctly designed:**
- `organizations.id uuid` (internal PK)
- `organizations.clerk_org_id text NOT NULL UNIQUE` (Clerk's foreign ref)
- `policies.org_id uuid REFERENCES organizations.id`

The bug is purely in the auth context layer: `getOrgContext()` must translate
`session.orgId` (Clerk text) → `organizations.id` (UUID) via a DB lookup
before returning. The same applies to `userId` — `session.user.id` is Clerk's
text format; `users.id` is UUID. Currently no Phase 3 query exercises this
on userId, but createPolicyAction's `createdBy` field would hit the same
bug as soon as a policy is created.

**Recommended fix (Phase 3.1 gap-closure plan):**
1. Modify `getOrgContext()` to look up `organizations.id` from `organizations.clerk_org_id`
   and `users.id` from `users.clerk_user_id`. Cache the lookup (request-scoped at minimum).
2. Update the `OrgContext` type signature to clarify: `orgId` is internal UUID, not Clerk's text.
3. Add a `clerkOrgId: string` field for callers that legitimately need the Clerk ref
   (webhooks, mirror-to-Clerk paths).
4. Add an end-to-end test that signs a Clerk-shaped JWT, runs through middleware +
   getOrgContext + a repository call against a real test DB. This is the integration
   gap the existing tests don't cover.

**Acceptance criteria for gap closure:**
- `pnpm verify:phase-3` still 6/6 green
- A new test: spin up a fresh org in TEST DB with a known internal UUID, mock Clerk
  session with the Clerk text org_id, call `Policies.statusCounts` via `withOrgScope`,
  expect a clean result (not a Postgres 22P02 error)
- /dashboard renders for the test fixture without 500

## GAP-2 (CARRY-FORWARD) — SF-W5: webhook race recovery silently drops events

**Severity:** Operator-recoverable. Documented at
`app/api/webhooks/clerk/route.ts:237-244`. Phase 7 obligation per the inline
SF-W5 comment + REQUIREMENTS.md.

**Where:** When `organizationMembership.created` arrives before its prerequisite
`user.created` (or `organization.created` arrives without prior user), the
handler returns 409. But the `clerk_events` row was already inserted (idempotency
write happens BEFORE the dispatch). When Clerk retries with the same svix-msg-id,
the D-03b idempotency short-circuit returns 200 without re-attempting the DB
write. Result: the event is silently lost.

**Live-smoke trigger:** Operator hit this 3× during the smoke. Once with the
JIum/b2iy account-mixup (user_b2iy in membership event before user.created
arrived); once on the second CreateOrg attempt (org_***4cy0 created without
membership write); the third we manually recovered via `link-jium-to-org.ts`.

**Recommended fix (Phase 7 obligation):**
- Either: delete the clerk_events row when returning 409, so Clerk's retry
  re-fires (current L-06a only does this on dispatch error, not on
  prerequisite-not-found 409)
- Or: implement explicit `pending_membership` queue + cron retry from Phase 7
  Crons + Email workstream — structured logging + alerts on stuck rows

The current "operator-visible Clerk dashboard log" contract (the inline
comment's stated tradeoff) is acceptable for now since it surfaces stuck
events to the operator for manual recovery.

## GAP-3 (MINOR) — Embedded SignIn redirect needs explicit env var

**Severity:** Minor / docs. Embedded `<SignIn />` defaults to redirect-to-`/`
unless `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in` (and
`SIGN_UP_FALLBACK`) is set in `.env.local`. The Clerk Account Portal "After
sign-in fallback" config (changed in Plan 03-00) only governs Clerk's hosted
portal — not the embedded component shipped by Plan 03-11.

**Fix applied during smoke** (already in .env.local):
```
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in
```

**For Phase 3.1 gap closure:** add the two env vars to `.env.local.example`
and document under `reference/STACK.md` Clerk section.

## Operator state at end of smoke

(Recovery scripts left in `scripts/` for the gap-closure plan to clean up.)

- Clerk users: `user_3Dxws...JIum` (mmtuproperties@gmail.com) + `user_3DpHee...b2iy` (mmtuentertainment@gmail.com). Both real, same operator.
- Clerk orgs: `org_3DxxQ...yTtc` (mmtu entertainment, created by b2iy, members: JIum + b2iy both admin) + a duplicate `org_3Dy5O...4cy0` (created in the smoke retry, single member b2iy)
- DB: 1 user (b2iy, role=admin, org_id=59d14320.../mmtu entertainment), 1 org (mmtu entertainment), 0 policies
- Browser session: b2iy, lastActiveOrg=org_3DxxQ...yTtc (which translates to internal UUID 59d14320...)

The DB state is **consistent and correct** post-recovery. /dashboard would render
end-to-end IF GAP-1 (orgId UUID translation) were fixed.

## Recovery scripts committed under scripts/ (for gap-closure cleanup)

- `scripts/check-org-state.ts` — dumps newest organizations, users, clerk_events
- `scripts/debug-clerk-state.ts` — dumps Clerk user + memberships + sessions for the DB user
- `scripts/debug-all-sessions.ts` — same as above but for ALL Clerk users
- `scripts/debug-clerk-org.ts` — lists all Clerk orgs + memberships + users
- `scripts/debug-b2iy.ts` — dumps b2iy's publicMetadata
- `scripts/sf-w5-manual-recovery.ts` — one-off: link the single DB user to single DB org, set role admin, mirror to Clerk publicMetadata
- `scripts/force-clerk-session-refresh.ts` — revoke all active Clerk sessions for the single DB user
- `scripts/link-jium-to-org.ts` — operator-authorized: add JIum to mmtu entertainment as Clerk org admin (recovered the SF-W5 race)
- `scripts/backfill-b2iy.ts` — operator-authorized: delete JIum row, insert b2iy row in DB, mirror role to Clerk publicMetadata (reconciles DB with active Clerk identity)
- `app/(auth)/__activate-org/page.tsx` — one-time client-side `setActive()` helper to populate session.orgId claim from lastActiveOrganizationId

**Cleanup task for Phase 3.1 gap-closure:** delete all 9 of the above after
the real fix lands, leaving only the test-friendly check-org-state utility
(or move it under scripts/test-helpers/).

## Next step

`/gsd-plan-phase 3 --gaps` to create the Phase 3 gap-closure plans that:
1. Fix GAP-1 (orgId UUID translation in getOrgContext + add the integration test)
2. Add GAP-3 fix to .env.local.example + STACK.md
3. Move GAP-2 (SF-W5) carry-forward forward to Phase 7's REQUIREMENTS

After gap closure, re-run /gsd-execute-phase 3 --gaps-only and the smoke should
complete cleanly (signed-in admin clicks Create policy → ROADMAP SC walkthrough
all 5 criteria observable).
