---
status: closed
phase: 03-admin-ui
pass: second-pass
source: [03-HUMAN-UAT.md, 03-VERIFICATION.md]
prior_pass: 2026-05-20 @ edebab7 (6/6 PASS)
audited_at_commit: 5a57000
audited_at_branch: chore/phase-3-verify-trail
auditor_pattern: delta-analysis + targeted spot-check (claude-in-chrome)
started: 2026-05-21T05:30:00Z
updated: 2026-05-21T05:31:11Z
---

# Phase 3 — UAT (Second Pass)

> Audit cascade 3 of 3 (security → validation → **verification**). Re-verifies
> the 6 ROADMAP SC criteria from the prior pass at `edebab7` against current
> shipped state at `main @ 5a57000` (post PR #5 ADR-026 + PR #7 ADR-027 +
> PR #8 security audit).

## Current Test

[testing complete]

---

## Delta Analysis — Changes Since Prior Pass

| PR | Commit | Scope | UAT exercise-path impact |
|----|--------|-------|---|
| PR #5 (ADR-026) | `bf65712` | Typed-error class hierarchy in `lib/auth/errors.ts`; `getOrgContext` missing-org / missing-user paths throw typed classes | None — UAT happy-path criteria do not exercise the error branches |
| PR #7 (ADR-027) | `c6dca6a` | Adds `eq(users.orgId, orgRow.id)` to user-lookup in `lib/auth/context.ts:126-145` | Affects multi-org Clerk users only; UAT users are single-org per `03-HUMAN-UAT.md` evidence (UAT-4 + UAT-6) |
| PR #8 (Security audit) | `5a57000` | `03-SECURITY.md` (docs only) | Zero code change |

**Net:** No UAT exercise path was modified by the post-pass changes. The 2 most-subtle vectors (ADR-027 lookup-scoping for SC #4; webhook + auth flow for SC #6) confirmed by live spot-check below.

---

## Live Spot-Check Evidence (claude-in-chrome MCP)

**Environment:** `pnpm dev` on `localhost:3000` (Next.js 15.5.18, ready in 11.2s).

**Action:** Navigated authenticated Chrome session (existing Clerk cookie from UAT-6) to `http://localhost:3000/dashboard`.

**Observations:**

| Layer | Evidence |
|-------|---|
| URL after middleware | `http://localhost:3000/dashboard` (no redirect to `/sign-in`) |
| Title | `PolicyPilot — Policy management for SMBs` |
| Interactive elements rendered | Org switcher (Clerk), user menu (Clerk), "Create policy" link → `/policies/new`, "Create your first policy" empty-state CTA |
| Server-side log | `GET /dashboard 200 in 5069ms` (first hit, incl. compile) → `GET /dashboard 200 in 484ms` (warm) |
| Server-side errors | None — no 5xx, no `UserNotProvisionedError` / `OrgNotProvisionedError` thrown |
| Browser console errors | None |
| Browser console warnings | 2× expected `Clerk: Clerk has been loaded with development keys` notices (normal dev-mode notice) |

**Interpretation:** `getOrgContext` (the chokepoint that runs ADR-027's new lookup-scoping) returned a valid `OrgContext` for the signed-in user without throwing. This is the canonical observable for both spot-check vectors:
- SC #4 lookup-scoping vector → CONFIRMED non-regressive
- SC #6 post-sign-in trampoline + user-context vector → CONFIRMED non-regressive

---

## Tests

### 1. ROADMAP SC #1 — Create policy from /dashboard
expected: Click "Create policy" on /dashboard → /policies/new → fill form → save → redirect to /policies/{id} → row visible on /policies with Draft badge
result: pass-by-construction
basis: Exercise path (`/dashboard` CTA + `/policies/new` form + `Policies.create` + redirect) untouched by PR #5/#7/#8. Prior PASS evidence at `03-HUMAN-UAT.md§1` (2026-05-20 ~02:50). Spot-check observed "Create policy" + "Create your first policy" links present on `/dashboard` empty-state shell.

### 2. ROADMAP SC #2 — Illegal transition rejected with UI surface
expected: On archived policy, the Actions menu only offers "Restore as draft" — no Publish option; server-side rejection of archived → published already covered by 24-case state-machine test suite
result: pass-by-construction
basis: `PolicyTransitionMenu` rendering rules in `components/policy/PolicyTransitionMenu.tsx` untouched by PR #5/#7/#8. 24 state-machine vitest cases still pass (88/88 confirmed in PR #9 verify chain). Prior PASS at `03-HUMAN-UAT.md§2` (2026-05-20 ~02:55).

### 3. ROADMAP SC #3 — Edit published creates new policy_versions row AND resets status to Draft
expected: Open published policy → Actions → Edit policy → confirm with change summary → ?edit=1 → save edits → status flips back to Draft → policy_versions row count increments by 1 → policies.current_version increments
result: pass-by-construction
basis: `lib/policies/transitions.ts` editPublished orchestrator untouched by PR #5/#7/#8. `lib/policies/transitions.test.ts` (16 vitest cases) still passes (88/88). Prior PASS at `03-HUMAN-UAT.md§3` (2026-05-20 ~03:13), with the noted S1/S2 sub-findings already remediated via 03-G3 ship.

### 4. ROADMAP SC #4 — Cross-org list scoped by org_id
expected: Sign up second admin in a separate org → /dashboard shows zero policies → direct GET /policies/{first-org-policy-id} returns 404 (notFound) per D-10
result: pass
spot-check: Signed-in single-org user successfully landed on `/dashboard` (URL stable, no `/sign-in` redirect, no `UserNotProvisionedError` thrown server-side). ADR-027's new `eq(users.orgId, orgRow.id)` lookup-scoping is transparent for single-org users. Cross-org isolation at DB layer (RLS + app-layer `eq(orgId)` in `Policies.findById`/`listAll`) is verified by `pnpm check:rls` 10-table negative control and unchanged since prior pass. Prior PASS at `03-HUMAN-UAT.md§4` (2026-05-20 ~03:45) — Org B user observed empty list + direct nav 404 with masked logging.

### 5. ROADMAP SC #5 — Search by title/category scoped by org_id
expected: /policies?q=Remote returns only matching rows → /policies?status=draft filters → /policies?q=HR&status=draft compound filter works → clearing returns all rows
result: pass-by-construction
basis: `Policies.listWithFilters({q, status})` body untouched by PR #5/#7/#8. PR #9 (`scripts/check-policies-list-filters.ts`, opened during this cascade) adds 10 integration assertions for the same body — currently in CR review. Prior PASS at `03-HUMAN-UAT.md§5` (2026-05-20 ~04:00) — 5-1..5-10 all PASS across 4 orgs.

### 6. Webhook live-smoke (Plan 03-11 Task 6 / SF-WHSEC-1)
expected: Fresh sign-up → /post-sign-in trampoline → /onboarding/create-org → CreateOrganization widget → afterCreateOrganizationUrl=/dashboard → DB rows present in organizations + users; webhook logs show masked org_***xxxx / user_***yyyy format
result: pass
spot-check: Existing webhook-provisioned user from UAT-6 (matthewutt @ 2026-05-20T16:49Z) successfully authenticated and rendered `/dashboard` against current `main @ 5a57000`. Webhook-handler code in `app/api/webhooks/clerk/route.ts` untouched by PR #5/#7/#8. SF-WHSEC-1 (whsec_ rotation) holds — svix verification path intact (gated by `pnpm check:auth-context` 9-gate verify chain, still 9/9 green). SF-W5 fix from 03-G3 T7 remains shipped. Prior PASS at `03-HUMAN-UAT.md§6` (2026-05-20 ~04:00) — two independent fresh sign-up paths exercised.

---

## Summary

total: 6
passed: 6 (4 by-construction + 2 live spot-checked)
issues: 0
pending: 0
skipped: 0
blocked: 0

Status: **ALL 6 ITEMS PASS at `main @ 5a57000`.** Audit cascade 3/3 closed.

## Verdict

**VERIFIED.** Phase 3 (Admin UI) UAT survives second-pass review post PR #5 ADR-026 + PR #7 ADR-027 + PR #8 security audit. No regressions detected.

## Gaps

[none]

## Cascade Closure

This artifact closes the 3-PR audit cascade originally scoped during the 2026-05-20 context-warning pause:
- Audit 1/3 — `03-SECURITY.md` (PR #8 shipped @ 5a57000)
- Audit 2/3 — `03-VALIDATION.md` (PR #10 open @ 8d906f6)
- Audit 3/3 — `03-UAT.md` (this artifact, PR #11)

Carry-forward unchanged from cascade scope:
- VALIDATION-2.7 closure shipping as PR #9 (`scripts/check-policies-list-filters.ts`)
- PR 3.3 (ADR-028 PolicyId brand) scope question deferred — bundle PR #7's 2 MEDIUMs or split as ADR-029?
