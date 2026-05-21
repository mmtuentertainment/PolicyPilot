---
phase: 03-admin-ui
plan: 05
subsystem: webhook
tags: [webhook, audit-fix, L-06a, L-06b, hardening]
dependency_graph:
  requires: []
  provides:
    - "L-06a closure: clerk_events row deleted on dispatch error so Clerk retry can re-fire"
    - "L-06b closure: maskClerkOrgId helper + applied at every org-id log site"
  affects:
    - app/api/webhooks/clerk/route.ts
tech_stack:
  added: []
  patterns:
    - "inner try/catch around idempotency-row cleanup (catch failure does not shadow original error)"
    - "log-site PII masking via small pure helper (mirrors maskClerkId at L33-36)"
key_files:
  created: []
  modified:
    - app/api/webhooks/clerk/route.ts
decisions:
  - "L-06a kept as INTERIM fix per CONTEXT — TODO(Phase 7+) idempotency-before-dispatch inversion comment preserved verbatim above the dispatch-failure detail log"
  - "L-06b masking applied at 5 call sites (4 enumerated in plan + 1 Rule-2 auto-fix on the missing-fields console.error object payload at lines 220-225) — strictly closes T-03-05-02 across every log surface in this file"
metrics:
  duration: "~6 minutes (2026-05-19T18:08Z → 2026-05-19T18:14Z UTC)"
  completed_date: "2026-05-19"
  task_count: 2
  file_count: 1
---

# Phase 3 Plan 05: Phase 2 Webhook Hardening (L-06a + L-06b) Summary

Folded the two Phase-2 API-audit closures (L-06a silent-loss fix + L-06b org-id masking) into the existing webhook handler at `app/api/webhooks/clerk/route.ts`. Single file touched; no new exports, no contract change; `pnpm tsc --noEmit` clean and `pnpm verify:phase-2` 7/7 OK on every commit boundary.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | L-06a — delete clerk_events row on dispatch error so Clerk retry re-fires | `fbcefcb` |
| 2 | L-06b — maskClerkOrgId helper + applied at every org-id log site | `e035bdc` |

## What Shipped

### Task 1 — L-06a (silent-loss fix on dispatch error) — CLOSED

Inside the outer `catch (err)` block at the bottom of the `switch (evt.type)` try in `app/api/webhooks/clerk/route.ts`, BEFORE the final `return new Response('Dispatch error logged', { status: 200 })`, inserted a cleanup `await db.delete(clerkEvents).where(eq(clerkEvents.id, svixId))` wrapped in its own inner try/catch. The clerk_events row was previously written BEFORE dispatch (per Phase 2 D-03b + Plan-checker WARNING-05 / SF-W5), so a silent dispatch failure left the event marked processed AND returned 200 → Clerk never retried → event permanently lost. Now the cleanup deletes the idempotency row so the next Clerk retry can re-fire the exact same event. Cleanup failure is logged separately via the `cd` (cleanup-detail) string and does not shadow the original dispatch error.

The existing `TODO(Phase 7+): invert idempotency-before-dispatch order — write clerk_events row only after successful dispatch` comment was preserved verbatim — L-06a is explicitly an INTERIM fix; the transactional inversion remains a Phase 7+ obligation.

The final `return new Response('Dispatch error logged', { status: 200 })` was kept UNCHANGED — Clerk will retry now because the idempotency row is gone, so 200 is no longer a silent-loss signal.

### Task 2 — L-06b (maskClerkOrgId helper + apply at all log sites) — CLOSED

Added a `maskClerkOrgId(id: string): string` helper directly after the existing `maskClerkId` (lines ~38-48 of the route). Pattern: `org_***${id.slice(-4)}` — preserves the `org_` prefix for grep-ability across log aggregators while removing the bulk of the tenant identifier from log streams.

Applied at every log surface that interpolates a Clerk organization id:

1. `organization.created` success log — was `${data.id}`, now `${maskClerkOrgId(data.id)}`.
2. `organizationMembership.created` "org not found" `console.error` — was `${clerkOrgId}`, now `${maskClerkOrgId(clerkOrgId)}`.
3. `organizationMembership.created` defensive-narrowing `console.error` — was `${clerkOrgId}`, now `${maskClerkOrgId(clerkOrgId)}`.
4. `organizationMembership.created` final success log — was `org=${clerkOrgId}`, now `org=${maskClerkOrgId(clerkOrgId)}`.
5. `organizationMembership.created` "missing user_id or organization.id" `console.error` object payload — was `{ clerkUserId: ..., clerkOrgId }`, now `{ clerkUserId: ..., clerkOrgId: clerkOrgId ? maskClerkOrgId(clerkOrgId) : null }`. (Rule 2 auto-fix — see Deviations below.)

`grep -nE '\$\{clerkOrgId\}|\$\{data\.id\}' app/api/webhooks/clerk/route.ts` now returns zero hits. The remaining raw `clerkOrgId` references are all non-log code: DB INSERT column assignment (`organizations.clerkOrgId: data.id` at the schema level), variable declaration (`const clerkOrgId = data.organization?.id`), null-check guard (`if (!clerkUserId || !clerkOrgId)`), object property key (left side of `:`), and the `where(eq(organizations.clerkOrgId, clerkOrgId))` Drizzle query.

The `clerkOrgId` value flowing into DB queries (`organizations.clerkOrgId, clerkOrgId`) is intentionally NOT masked — it goes to PostgreSQL, not logs. L-06b is scoped to log interpolations only, per CONTEXT.

## L-06c Status (cross-reference)

L-06c (`.tmp/svix-url.json` cleanup) is NOT part of this plan. Already shipped by Plan 03-01's `verify:phase-3` tail per `package.json` line 29:

```
node -e "require('fs').rmSync('.tmp/svix-url.json', { force: true })"
```

CONFIRMED present in `package.json`'s `verify:phase-3` script at the end of the chain.

## F-03 / F-05 / F-06 — Deferred Per CONTEXT

These were intentionally not folded into Phase 3:

- **F-03** (no app-level rate limit on the webhook) — requires Phase 7+ Railway worker. Vercel platform DDoS handles Phase 2/3 deploy. Tracked in STATE.md as Phase 7+ deliverable.
- **F-05** (`sk_test_*` Stripe key rotation) — pre-Phase-6-launch hygiene; no Phase 3 code change. Operator obligation.
- **F-06** (structured log shipping with pino + redaction filter) — requires Phase 7+ Observability phase. Until then, L-06b's hand-applied masking is the contract; the pino redaction filter will replace it later.

## Deviations from Plan

### Rule 2 — Auto-added missing critical functionality

**1. [Rule 2 - Security] Masked clerkOrgId in the "missing user_id or organization.id" console.error object payload**

- **Found during:** Task 2 final scan
- **Issue:** The `console.error` call at lines 220-225 (in the `if (!clerkUserId || !clerkOrgId)` branch of `organizationMembership.created`) passes an object literal `{ clerkUserId: ..., clerkOrgId }` where `clerkOrgId` reaches the log unmasked. Although this branch fires only when one of the two is falsy, the falsy variable can be `clerkUserId` (leaving `clerkOrgId` truthy and being logged in the clear). This is the same threat surface as the four log sites the plan enumerated (T-03-05-02 — aggregated logs expose tenant base).
- **Fix:** Changed the object payload to `{ clerkUserId: clerkUserId ? maskClerkId(clerkUserId) : null, clerkOrgId: clerkOrgId ? maskClerkOrgId(clerkOrgId) : null }`, mirroring the conditional-mask pattern already used for `clerkUserId` on the same line. When the value is falsy (the very trigger for this branch), we log `null`; when truthy, we mask.
- **Files modified:** `app/api/webhooks/clerk/route.ts`
- **Commit:** `e035bdc` (folded into the Task 2 commit since it's the same audit closure)
- **Why Rule 2 not a separate plan item:** the plan explicitly anticipates this in Task 2's instructions ("Also scan for any OTHER log line that interpolates `data.id` from `organization.created`, `clerkOrgId` from membership events, or any raw `org_xxxxx` literal in templates. Mask each one. There should be 4 sites minimum."). Five was the floor; six (1 def + 5 call sites) satisfies it.

No other deviations. No new packages installed. No `any` types introduced. No CLAUDE.md directives crossed (raw `db` usage was already allow-listed for this file per ADR-023 entry #1).

## Authentication Gates

None — fully autonomous execution.

## Verification

`pnpm tsc --noEmit` exits 0 on every commit boundary (before Task 1, between Task 1 and Task 2, after Task 2). `pnpm verify:phase-2` exits 0 with 7/7 OK against the live TEST DB on every commit boundary. The 4 must_haves truths from PLAN frontmatter all hold:

1. L-06a fixed — verified by grep on `await db.delete(clerkEvents)` and `clerk_events row deleted so Clerk retry`. Both present at lines 361 and 363 inside the catch block, BEFORE the final `return new Response('Dispatch error logged', { status: 200 })`.
2. L-06b fixed — `function maskClerkOrgId` present at line 45; `org_***` pattern at line 47; 6 occurrences of `maskClerkOrgId(` (≥5 satisfied: 1 definition + 5 call sites — original 4 enumerated sites + 1 Rule-2 deviation on the missing-fields error object).
3. No contract change to the webhook route — still 4 active events (`organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated`) + 3 delete events log-only per D-03c; same idempotency invariant via `clerk_events` + `ON CONFLICT DO NOTHING`; same 200/4xx response shapes (200 OK | 200 duplicate | 200 dispatch-error-logged | 500 missing-secret | 400 missing-headers | 401 sig-fail | 409 org-not-yet-created | 409 user-not-yet-created).
4. `pnpm tsc --noEmit` clean; `pnpm verify:phase-2` still 7/7 OK.

## Known Stubs

None.

## Threat Flags

None — no new threat surface introduced. This plan's scope was strictly hardening an existing surface (the webhook handler), so the existing threat-model rows (T-03-05-01..T-03-05-04 in PLAN frontmatter) cover everything.

## Self-Check: PASSED

- `app/api/webhooks/clerk/route.ts` — FOUND (modified, 377 lines after edits).
- Commit `fbcefcb` (L-06a) — FOUND in `git log --oneline gsd/phase-3-admin-ui`.
- Commit `e035bdc` (L-06b) — FOUND in `git log --oneline gsd/phase-3-admin-ui`.
- `pnpm tsc --noEmit` — exits 0.
- `pnpm verify:phase-2` — exits 0 with 7/7 OK.
- `grep -nE '\$\{clerkOrgId\}|\$\{data\.id\}' app/api/webhooks/clerk/route.ts` — zero hits.
- `grep -c 'maskClerkOrgId(' app/api/webhooks/clerk/route.ts` — 6 (exceeds ≥5 threshold).
