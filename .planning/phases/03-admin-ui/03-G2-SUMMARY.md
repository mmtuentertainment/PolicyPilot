---
phase: 03-admin-ui
plan: G2
subsystem: clerk-auth
tags: [gap-closure, env-vars, verify-gate, docs, clerk]
gap_closure: true
gap_source: .planning/phases/03-admin-ui/03-SMOKE.md
closes_gaps:
  - GAP-3 (MINOR) — Embedded SignIn redirect needs explicit env var
requirements:
  - REQ-access-control
dependency_graph:
  requires: []
  provides:
    - "verify:phase-1 7th check asserting Clerk fallback redirect env vars present"
    - ".env.local.example documents NEXT_PUBLIC_CLERK_SIGN_(IN|UP)_FALLBACK_REDIRECT_URL"
    - "reference/STACK.md embedded-vs-hosted-portal documentation"
  affects:
    - "scripts/check-foundation.ts (step count 6 → 7)"
    - "scripts/check-artifacts.ts (T-01-02 allowedNonBlank Set extended)"
tech_stack:
  added: []
  patterns:
    - "env-var presence assertion with exact-value pinning (mismatch surfaces detail string)"
key_files:
  created: []
  modified:
    - .env.local.example
    - reference/STACK.md
    - scripts/check-foundation.ts
    - scripts/check-artifacts.ts
decisions:
  - "Pre-populate /post-sign-in in .env.local.example (public route path, not a secret) so a fresh-clone copy → .env.local Just Works"
  - "Exact-match (not just non-empty) value pin on both env vars in checkClerkFallbackRedirectEnvVars — wrong value indicates the operator misread the example, fail loudly"
  - "Bundle the check-artifacts.ts T-01-02 allowlist extension into Task 3's commit (Rule 3 auto-fix — Task 1's pre-populated values would otherwise trip the existing 'no unexpected non-blank values' assertion)"
metrics:
  duration: "10m 23s"
  completed: 2026-05-20T02:43:56Z
  tasks_completed: 3
  files_modified: 4
---

# Phase 03 Plan G2: Embedded Clerk Fallback Redirect — Gap Closure Summary

Lock GAP-3 (MINOR) from 03-SMOKE.md by adding both `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in` to `.env.local.example`, documenting the embedded-vs-hosted-portal distinction in `reference/STACK.md`, and adding a 7th `verify:phase-1` regression check so a fresh clone can never silently re-hit the gap.

## What shipped

| Task | Description | Commit |
|------|-------------|--------|
| 1 | `.env.local.example` extended with both env vars + 11-line explanatory comment block; pre-populated with `/post-sign-in` so fresh-clone copy → `.env.local` Just Works | `ebda9c2` |
| 2 | `reference/STACK.md` gains `### Embedded component redirect config` subsection (lines 24-51) under `## Why Clerk`, pinning the canonical value and explaining the embedded-vs-hosted-portal boundary | `d5307b6` |
| 3 | `scripts/check-foundation.ts` adds `checkClerkFallbackRedirectEnvVars()` as the 7th `verify:phase-1` step; all 6 prior `logResult(N, 6, ...)` callsites bumped to total=7. `scripts/check-artifacts.ts` T-01-02 `allowedNonBlank` Set extended with both new keys (Rule 3 auto-fix). | `1dc34b1` |

## Verification

- **`pnpm tsc --noEmit`**: exit 0 (zero TypeScript errors).
- **`pnpm verify:phase-3`**: exit 0. `Total: 269 | Passed: 269 | Failed: 0` artifact assertions; `Test Files: 6 passed`, `Tests: 51 passed`. No regression from prior `03-G1` gap-closure.
- **`pnpm verify:phase-1`**: the new 7th check `[7/7] OK — GAP-3 — Clerk fallback redirect env vars present` passes against the operator's current `.env.local`. Checks 1 (tsc), 2 (`GET /`), 5 (Drizzle), 6 (middleware redirect), and the new check 7 all OK. **Checks 3 (`GET /sign-in`) and 4 (`GET /sign-up`) return 500 — see "Pre-existing environmental issue" below.**

## STACK.md additions

`reference/STACK.md` lines 24-51 — new `### Embedded component redirect config` subsection under `## Why Clerk (not Auth0)`. Pre-edit file was 47 lines; post-edit is 74 lines. Purely additive — no existing content removed or reordered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `scripts/check-artifacts.ts` T-01-02 allowedNonBlank Set**

- **Found during:** Task 3 verification (`pnpm verify:phase-3`).
- **Issue:** Task 1's pre-populated `/post-sign-in` values for both env vars tripped the existing T-01-02 assertion `".env.local.example has no unexpected non-blank values (T-01-02)"` — `2 key(s) have a value — would commit a secret`. The checker rightly fails on unknown non-blank keys (defense against accidental secret commits) but didn't know `/post-sign-in` is a public route path, not a secret.
- **Fix:** Added `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` to the `allowedNonBlank` Set with a comment block referencing GAP-3 and Plan 03-G2. Follows the existing pattern for `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_POSTHOG_HOST` (the other allow-listed public defaults).
- **Files modified:** `scripts/check-artifacts.ts` (5 inserted, 1 deleted around the `allowedNonBlank` literal — purely additive set members + an explanatory comment).
- **Commit:** `1dc34b1` (bundled with Task 3 since both are extensions of the verification machinery for the same env vars).
- **Rationale:** Rule 3 (auto-fix blocking issues directly caused by current task's changes). Without this fix, `verify:phase-3` would regress from 268/268 to 268/269 and the plan would falsely appear to break artifact assertions. The plan's design intent (pre-populate the canonical value) requires this allowlist update — it's not an architectural change, just a configuration update to match the new file shape.

### Pre-existing environmental issue (out of scope)

**`pnpm verify:phase-1` checks 3 (`GET /sign-in returns 200`) and 4 (`GET /sign-up returns 200`) return 500.**

- **Root cause:** Next.js dev-server's Jest worker pool has crashed and exhausted its retry limit. The response body's `__NEXT_DATA__` payload contains: `"Jest worker encountered 2 child process exceptions, exceeding retry limit"`. This is a Next.js dev-server runtime issue, not an application bug.
- **Why this is out of scope:**
  1. Per the deviation rules' Scope Boundary: "Only auto-fix issues DIRECTLY caused by the current task's changes." My Task 3 edit to `checkHttp` callsites only changed `logResult(N, 6, ...)` → `logResult(N, 7, ...)` — the assertion logic and routes themselves are identical to the pre-edit checks that worked previously (per `03-SMOKE.md` line 28: "Embedded `<SignIn />` afterSignIn redirect to /post-sign-in ✓" — `/sign-in` rendered successfully during the smoke).
  2. The dev server is an operator-spawned process (PID 24736 on port 3000) outside this agent's process tree. The deviation rules explicitly exclude operator-owned background-process restart from auto-fix territory.
  3. Restarting `pnpm dev` clears the crashed worker pool — that is the operator's one-line manual recovery.
- **What's NOT broken:** The actual sign-in/sign-up pages compile clean (tsc exit 0), the Clerk env-vars are correctly loaded (`[7/7] OK` GAP-3 check), and the smoke walkthrough already verified end-to-end functionality. Re-running `verify:phase-1` after the operator restarts `pnpm dev` will produce `7/7 OK`.
- **Impact on plan success criteria:** Task 3's "done" criterion is satisfied: the 7th check is the load-bearing assertion for this plan, and it passes. The other two failures are a stale-dev-server condition that exists independent of any 03-G2 change.

## Known Stubs

None. No stubs introduced — all changes are documented env-vars, verbose comment blocks, and a deterministic env-var presence/value assertion.

## Threat Flags

None. The 03-G2 threat register (T-03-G2-01 through T-03-G2-SC) covers all surfaces introduced by this plan; no new threat surface beyond what the planner anticipated.

## Self-Check: PASSED

**Files verified to exist:**

- `FOUND`: `.env.local.example` (modified, 68 lines, both new env vars + comment block landed)
- `FOUND`: `reference/STACK.md` (74 lines, new subsection at lines 24-51)
- `FOUND`: `scripts/check-foundation.ts` (new function `checkClerkFallbackRedirectEnvVars`, all 7 logResult callsites use total=7)
- `FOUND`: `scripts/check-artifacts.ts` (allowedNonBlank Set extended)
- `FOUND`: `.planning/phases/03-admin-ui/03-G2-SUMMARY.md` (this file)

**Commits verified in git log:**

- `FOUND`: `ebda9c2` — `docs(03-G2): add NEXT_PUBLIC_CLERK_SIGN_(IN|UP)_FALLBACK_REDIRECT_URL to .env.local.example`
- `FOUND`: `d5307b6` — `docs(03-G2): document embedded vs hosted-portal redirect config in STACK.md`
- `FOUND`: `1dc34b1` — `feat(03-G2): assert Clerk fallback redirect env vars in verify:phase-1`

**Acceptance criteria summary:**

- [x] All 3 tasks executed and committed individually
- [x] `.env.local.example` contains both env vars set to `/post-sign-in`
- [x] `reference/STACK.md` has `### Embedded component redirect config` subsection
- [x] `scripts/check-foundation.ts` has 7th `logResult` call asserting both env vars present, non-empty, equal to `/post-sign-in`
- [x] All 6 existing `logResult` totals updated from 6 to 7
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm verify:phase-3` exits 0 (no regressions from G1; 269/269 artifact assertions, 51/51 vitest)
- [x] New 7th check passes against operator's `.env.local`
- [x] SUMMARY.md created at `.planning/phases/03-admin-ui/03-G2-SUMMARY.md`
- [x] No modifications to STATE.md or ROADMAP.md
- [-] `pnpm verify:phase-1` exits 0 — **blocked by pre-existing dev-server Jest-worker crash on /sign-in and /sign-up routes; out of scope per Scope Boundary rule. Operator restarts `pnpm dev` to clear.**
