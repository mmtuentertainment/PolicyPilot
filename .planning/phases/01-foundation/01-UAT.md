---
phase: 01-foundation
type: UAT
status: complete
total_items: 11
passed: 11
failed: 0
pending: 0
skipped: 0
human_needed: 0
operator_signoff: "all approved — 2026-05-16"
related_artifacts:
  verification: 7dcfeae
  security: 370f8b7
  validation: e8f5172
last_audited: 2026-05-16
---

# Phase 01 (Foundation) — User Acceptance Testing

Consolidated UAT record for Phase 1. All 11 acceptance items are **PASSED** as of 2026-05-16 — 6 by automated gate (`pnpm verify:phase-1`) and 5 by operator visual confirmation. This file is the canonical UAT artifact for future `/gsd-audit-uat` runs; the underlying evidence lives in `01-05-SUMMARY.md` (operator-approval addendum) and `VERIFICATION.md` (goal-backward audit).

---

## Automated UAT — `pnpm verify:phase-1` (6/6 OK)

The gate ran live against `pnpm dev` on `localhost:3000` after the matcher fix landed (`446b554`). Each check is an independent assertion; the gate continues through all six and exits 1 if any fail.

| # | UAT item | Verifies | Status | Evidence |
|---|----------|----------|--------|----------|
| 1 | `tsc --noEmit zero errors` | ROADMAP criterion 1 | **PASSED** | Live gate `[1/6] OK`; reproducible via `pnpm typecheck` |
| 2 | `GET / returns 200 with D-03 hero copy` | ROADMAP criterion 2 (marketing landing renders) | **PASSED** | Live gate `[2/6] OK`; body assertion against literal D-03 string `Policy management for SMBs that beats a Google Drive folder.` |
| 3 | `GET /sign-in returns 200 (Clerk SignIn mount)` | ROADMAP criterion 3a | **PASSED** | Live gate `[3/6] OK`; render-only check (interactive flow handled by item 9 below) |
| 4 | `GET /sign-up returns 200 (Clerk SignUp mount)` | ROADMAP criterion 3b | **PASSED** | Live gate `[4/6] OK` |
| 5 | `Drizzle select 1 round-trip` | ROADMAP criterion 4 (Supabase pooler connects) | **PASSED** | Live gate `[5/6] OK` — delegates to `pnpm check:db` (D-06 Transaction pooler at `pooler.supabase.com:6543`) |
| 6 | `Middleware redirects /sign-in-success → /sign-in unauthenticated` | ROADMAP criterion 5 (public-route policy) | **PASSED** | Live gate `[6/6] OK` after matcher fix `446b554` (split `/sign-in(.*)` greedy into exact + slash-prefixed). First gate run caught the bug (`expected 307 redirect, got 200`); operator restarted dev server post-fix and got 6/6 |

---

## Visual / Interactive UAT (operator-performed)

ROADMAP criterion 3 has an interactive half ("Clerk sign-in flow successfully completes") that no HTTP probe can fully assert without a real Clerk credential dance. ROADMAP criterion 5 also benefits from a manual incognito-window confirmation that the redirect works in a real browser, not just under `fetch({redirect: 'manual'})`. Operator walked all five steps and replied `all approved`.

| # | UAT item | URL / action | Status | Evidence |
|---|----------|--------------|--------|----------|
| 7 | Landing page D-03 copy + footer + console clean | `http://localhost:3000/` | **PASSED** | Operator confirmed hero, 3 value-prop bullets, 2 CTAs (Get started / Sign in), `© 2026 MMTU Entertainment LLC · PolicyPilot` footer, no console errors |
| 8 | Pricing tiles with literal prices + `Get started` → `/sign-up` | `http://localhost:3000/pricing` | **PASSED** | Operator confirmed 3 cards (Starter, Growth, Business), prices `$79` / `$199` / `$449`, hover-href on Get-started buttons points to `/sign-up` |
| 9 | Clerk sign-in form renders without `Missing publishable key` banner | `http://localhost:3000/sign-in` | **PASSED** | Operator confirmed Email + Password fields, `Sign in with Google` button visible, no red banner — proves `.env.local` is well-formed even though no values were ever echoed in chat |
| 10 | Real test sign-up completes and lands on `/sign-in-success` placeholder | `/sign-up` → email verification → `/sign-in-success` | **PASSED** | Operator-confirmed via real Gmail test signup; Clerk redirected to `/sign-in-success` showing "You're signed in"; user visible in Clerk dashboard → Users page — proves D-09 path config (`After sign-in URL = /sign-in-success`) was applied correctly in Plan 01-02 Task 1 |
| 11 | Incognito window redirects unauthenticated `/sign-in-success` request to `/sign-in?redirect_url=...` | `http://localhost:3000/sign-in-success` (incognito) | **PASSED** | Operator pasted observed URL: `http://localhost:3000/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fsign-in-success` — middleware preserved the original destination in `redirect_url`, matching Clerk's post-sign-in flow convention |

---

## Coverage to ROADMAP Phase 1 success criteria

| ROADMAP criterion | UAT items satisfying it | Status |
|-------------------|-------------------------|--------|
| 1 — `tsc --noEmit` zero errors against `pnpm install` | UAT #1 | **PASSED** |
| 2 — `localhost:3000` loads marketing landing without runtime errors | UAT #2 (automated body assertion) + UAT #7 (operator visual + console-clean) | **PASSED** |
| 3 — Clerk sign-in/sign-up flow renders AND completes against dev keys | UAT #3 + #4 (renders) + UAT #9 + #10 (interactive completion) | **PASSED** |
| 4 — Supabase client connects (Drizzle `select 1`) | UAT #5 (live ~3.5s round-trip against Transaction pooler) | **PASSED** |
| 5 — `middleware.ts` enforces public-route policy | UAT #6 (automated probe) + UAT #11 (manual incognito visual) — both post matcher fix `446b554` | **PASSED** |

---

## Cross-references

| Artifact | Commit | Status |
|----------|--------|--------|
| `VERIFICATION.md` (gsd-verifier goal-backward audit) | `7dcfeae` | PASS — all 5 success criteria observable in codebase |
| `01-SECURITY.md` (gsd-security-auditor threat verification) | `370f8b7` | 29/29 threats CLOSED |
| `01-VALIDATION.md` (gsd-nyquist-auditor coverage audit) | `e8f5172` | 17/19 gaps filled (2 locked by D-13/D-14) |
| `scripts/check-artifacts.ts` (114 static-artifact regression assertions) | `14bc69a` | All 114 green |

Phase 1 is now **fully audited across four dimensions**: behavioral (UAT — this file), goal-backward (VERIFICATION), threat (SECURITY), and coverage (VALIDATION).

---

## Audit Trail

### 2026-05-16 — Initial creation
- Operator returned `all approved` after completing all 6 automated + 5 visual UAT items live against `pnpm dev`.
- 11/11 PASSED, 0 PENDING, 0 BLOCKED, 0 STALE.
- File generated retroactively from `01-05-SUMMARY.md` operator-approval section and `VERIFICATION.md` so future `/gsd-audit-uat` runs have a queryable artifact. Underlying evidence existed at the time of operator approval; this file is documentation, not new verification.

---

## Re-test guidance

If you need to re-run Phase 1 UAT (e.g., before deploying to a fresh environment or after a major dependency bump):

1. **Automated half (items 1–6):** `pnpm dev` in one terminal, `pnpm verify:phase-1` in another. Expect 6/6 OK + a final line about 114/114 static artifact assertions passing (the `&& pnpm check:artifacts` chain landed in `14bc69a`).
2. **Visual half (items 7–11):** walk the five browser steps. The full step-by-step procedure with confirm-this-exactly criteria is in this file's Visual UAT table above (URL + status + evidence columns describe the expected outcome).
3. **Cross-reference checks:** confirm SECURITY.md still shows 29/29, VALIDATION.md still shows 17/19 filled + 2 locked-by-decision, and check-artifacts.ts still exits 0.

If any item moves to PENDING / FAILED after a future change, update its row's Status column and append a new audit-trail entry with the regression's commit hash.
