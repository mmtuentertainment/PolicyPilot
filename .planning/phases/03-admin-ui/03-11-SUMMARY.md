---
phase: 03-admin-ui
plan: 11
subsystem: ui
tags: [pages, server-components, client-components, search, url-state, webhook-smoke, final-wave, phase-3-complete]

# Dependency graph
requires:
  - phase: 03-admin-ui
    provides: Policies.statusCounts + Policies.listWithFilters + Policies.findById from Plan 03-04
  - phase: 03-admin-ui
    provides: createPolicyAction + 8 transition actions + updateDraftAction + editPublishedAction from Plan 03-07
  - phase: 03-admin-ui
    provides: AdminLayout + AdminSidebar + AdminTopbar + /onboarding bypass from Plan 03-09
  - phase: 03-admin-ui
    provides: PolicyEditor + PolicyStatusBadge + PolicyTransitionMenu (with onEditPublished) + PolicyVersionHistory from Plan 03-10
  - phase: 02-data-layer
    provides: withOrgScope (ADR-025) + Clerk webhook handler (svix-verified)
provides:
  - app/(admin)/dashboard/page.tsx (Server Component — status-count tiles + Create CTA + W7 webhook-race fallback)
  - app/(admin)/policies/page.tsx (Server Component — Table + URL-state search/filter)
  - app/(admin)/policies/new/page.tsx (Server Component shell + CreatePolicyForm Client)
  - app/(admin)/policies/[id]/page.tsx (Server Component — editor + version history + transition menu)
  - app/(admin)/onboarding/create-org/page.tsx (Clerk <CreateOrganization /> wrapper)
  - components/policy/PolicyListSearch.tsx (Client — debounced ?q= URL push)
  - components/policy/PolicyStatusFilter.tsx (Client — Base UI Select wrapper, ?status= URL push)
  - components/policy/CreatePolicyForm.tsx (Client — useActionState + inline field errors)
  - components/policy/EditPolicyForm.tsx (Client — dual-mode editor: updateDraft vs editPublished)
  - components/policy/PolicyHeaderActions.tsx (Client — useRouter host for onEditPublished navigation)
affects: [04-ai-layer, 05-employee-portal, 06-billing, 08-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Component page + Client Component form-wrapper for useActionState"
    - "URL-state with debounced router.replace() (250ms) — search-as-you-type without history pollution"
    - "Status enum narrowing via VALID_STATUSES.includes() — forged ?status= values silently drop"
    - "Clerk webhook-race fallback: try/catch getOrgContext + meta-refresh after 2s"
    - "Cross-org RLS surface: notFound() on findById empty array (D-10 advertise nothing)"
    - "B2 cross-wave wiring: Server Component renders Client wrapper that hosts useRouter and forwards onEditPublished callback"
    - "Base UI Select URL-state wrapper (Base UI's onValueChange differs from radix's form-submit semantics — uses router.replace instead)"

key-files:
  created:
    - app/(admin)/dashboard/page.tsx
    - app/(admin)/policies/page.tsx
    - app/(admin)/policies/new/page.tsx
    - app/(admin)/policies/[id]/page.tsx
    - app/(admin)/onboarding/create-org/page.tsx
    - components/policy/PolicyListSearch.tsx
    - components/policy/PolicyStatusFilter.tsx
    - components/policy/CreatePolicyForm.tsx
    - components/policy/EditPolicyForm.tsx
    - components/policy/PolicyHeaderActions.tsx
  modified: []

key-decisions:
  - "PolicyStatusFilter Client wrapper instead of plan literal's <form>-wrapped Select — Base UI Select onValueChange fires client-side and does not emit form data, so plain <form action=...> would lose the selection. Wrapped in a router.replace() Client Component to keep URL state working; semantic parity preserved."
  - "<noscript> fallback links for status filter — graceful no-JS degradation; the Server Component re-reads ?status= regardless of which path set it."
  - "W7 webhook-race fallback uses meta-refresh (Option B from plan) — simpler than client-side polling; renders during the SSR pass with no client JS shipped."
  - "B2 LOCKED — PolicyHeaderActions Client wrapper hosts useRouter and passes onEditPublished to PolicyTransitionMenu. Server Component edit page cannot host useRouter; this tiny wrapper bridges them and keeps the Server Component pure."
  - "editPublishedMode driven by ?edit=1 query param + status==='published' AND check at page level — prevents drive-by URL manipulation from offering edit on non-published rows."
  - "TL;DR textarea disabled+readOnly with 'Phase 4' placeholder — communicates the field shape without accepting input that would be ignored. AI summary lands in Phase 4."
  - "Cancel link on /policies/new uses Link to /policies (no useRouter needed; not a Client Component yet)."

patterns-established:
  - "Server Component page + Client form wrapper splitting useActionState across the boundary while keeping the page itself a Server Component."
  - "Base UI Select with URL state: dedicated Client wrapper hosting onValueChange + router.replace(), Server Component re-renders on URL change."
  - "Cross-Server-/Client-Component callback bridging: Client wrapper component that hosts useRouter and forwards a callback prop to a deeper Client Component."
  - "Editor dual-mode flag: editPublishedMode prop drives editability + Save action choice + change-summary visibility from a single boolean."

requirements-completed: [REQ-policy-library, REQ-policy-lifecycle, REQ-access-control]

# Metrics
metrics:
  duration: "approximately 30 minutes (5 atomic CODE tasks + verifications)"
  completed: 2026-05-19
  commits: 5
  tasks-completed: 5  # task 6 is operator checkpoint (handed back to orchestrator per auto mode)
---

# Phase 3 Plan 11: Admin Pages — Final Wave Summary

Shipped 5 admin pages + 5 supporting Client Components that assemble Plans 03-04..03-10 into the user-facing surface. Every ROADMAP success criterion is now observable in code; live-browser verification (Task 6) is queued as an operator smoke.

## What shipped

| Surface | File | Notes |
| --- | --- | --- |
| Admin landing | `app/(admin)/dashboard/page.tsx` | 4 status-count tiles + Create-policy CTA + W7 webhook-race fallback panel |
| Library list | `app/(admin)/policies/page.tsx` | Server-rendered Table + URL-state ?q= and ?status= filters |
| Create page | `app/(admin)/policies/new/page.tsx` | Server shell + Client form wrapper with useActionState inline errors |
| Edit page | `app/(admin)/policies/[id]/page.tsx` | Editor (dual-mode) + PolicyVersionHistory aside + PolicyHeaderActions menu |
| Onboarding | `app/(admin)/onboarding/create-org/page.tsx` | Clerk `<CreateOrganization />` wrapper, afterCreateOrganizationUrl=/dashboard |
| Search input | `components/policy/PolicyListSearch.tsx` | 250ms debounced router.replace (T-03-11-05) |
| Status filter | `components/policy/PolicyStatusFilter.tsx` | Base UI Select wrapper → router.replace |
| Create form | `components/policy/CreatePolicyForm.tsx` | useActionState renders Zod fieldErrors inline |
| Edit form | `components/policy/EditPolicyForm.tsx` | updateDraftAction (draft) vs editPublishedAction (?edit=1 + published) |
| Header actions | `components/policy/PolicyHeaderActions.tsx` | Client wrapper hosting useRouter + onEditPublished → ?edit=1 nav |

## Commits

| Task | Commit | Subject |
| --- | --- | --- |
| 1 | `dbefa7a` | `feat(03-11): admin dashboard page with status-count tiles + W7 webhook-race fallback` |
| 2 | `ef254c9` | `feat(03-11): policies library page + URL-state search/filter` |
| 3 | `3875b94` | `feat(03-11): create-policy page with useActionState error rendering` |
| 4 | `dcdab2d` | `feat(03-11): edit-policy page with editor + version history + transition menu` |
| 5 | `90b12aa` | `feat(03-11): onboarding create-org page (Clerk widget); flip PHASE_3 artifact gate` |

## Verification snapshot

```
pnpm verify:phase-3
  ✓ typecheck            exit 0
  ✓ check:db-imports     3 allow-listed imports, 0 violations
  ✓ check:rls            passed
  ✓ check:admin-routes   5 admin URL(s), 3 pattern(s), 0 violations  (full enforcement)
  ✓ check:artifacts      252/252 assertions pass (every Phase 3 file-existence row green)
  ✓ test                 51 tests across 6 files, all green
```

W10 closure confirmed — `scripts/check-artifacts.ts::checkPhase3FileExistence` auto-detected the dashboard page on disk and flipped into enforcement mode. Every required Phase 3 file from Plans 03-02..03-11 is present and accounted for.

## Deviations from Plan

### [Rule 3 — Blocking issue] Plan literal `<form>`-wrapped Select wouldn't carry the value

**Found during:** Task 2

**Issue:** The plan's literal code wrapped the status `<Select>` in a `<form>` expecting `name="status"` on the Select to surface `?status=draft` on submit. The installed shadcn primitive at `components/ui/select.tsx` is built on Base UI (`@base-ui/react/select`), whose `Select.Trigger` does NOT render a real `<select name>` HTML element — it's a controlled component using `onValueChange`. A `<form>` submit therefore would not carry the filter value.

**Fix:** Created `components/policy/PolicyStatusFilter.tsx` — a tiny Client Component wrapping the Base UI Select that pushes `?status=...` via `router.replace()` on `onValueChange`. Semantic parity: still URL-state, still Server-Component-first, still graceful (the Server Component page re-renders on URL change). Added a `<noscript>` block in the page header listing static links to each status as a no-JS fallback.

**Files modified:** `app/(admin)/policies/page.tsx`, `components/policy/PolicyStatusFilter.tsx` (new — added to plan literal's `files_modified` list).

**Commit:** `ef254c9`

The plan's action block acknowledged this trade-off explicitly ("an additional Client Component wrapper around Select would auto-submit on change... Phase 3 ships the basic form-submit version"). Empirically the form-submit version wouldn't carry the value, so the Client wrapper is the only correct path. SUMMARY notes this for Phase 8 UX-polish backlog if anyone wants to revisit.

### Auto-mode checkpoint disposition

Plan Task 6 is a `checkpoint:human-verify` for the end-to-end webhook live-smoke + ROADMAP SC walkthrough. Per the executor's `<auto_mode>` instructions ("Treat the end-of-plan `checkpoint:human-verify` webhook live-smoke as a CHECKPOINT TO RETURN — do NOT attempt to perform the live-smoke yourself"), the operator runs Task 6 after this plan is committed and the orchestrator records the result. The CODE tasks are complete.

## Pending operator smoke

The operator runs this smoke against a live Clerk dev tenant before declaring Phase 3 fully shipped. All CODE artifacts are in place; this verifies the END-TO-END WIRING that no unit test covers (Clerk dashboard config + Svix webhook delivery + Supabase row creation + L-04 rotation effective + ROADMAP SCs observable in a live browser).

### Setup (one-time)

1. Confirm `.env.local` still has the rotated `whsec_…` from Plan 03-00. Run `pnpm verify:phase-2` — must exit 0 with 7/7 OK rows.
2. Start dev server: `pnpm dev` (defaults to `http://localhost:3000`).
3. Note the URL Clerk's dashboard webhook endpoint is pointed at. If using ngrok / Vercel preview, restart the tunnel and update Clerk if the URL changed.

### A. Webhook live-smoke (D-08 / SF-WHSEC-1 / webhook-live-smoke carry-forward)

1. Open an incognito window. Sign UP as a new user (test admin email).
2. After sign-up, Clerk redirects to its "After sign-in URL" → `/post-sign-in` (Plan 03-02 + Plan 03-00 Clerk dashboard change).
3. `/post-sign-in` should detect `orgId === null` and redirect to `/onboarding/create-org`.
4. Clerk `<CreateOrganization />` widget renders. Type org name "Test Org Phase 3" and submit.
5. Wait ~2 seconds. Clerk redirects to `/dashboard`. (W7 fallback panel may briefly appear if the page load wins the race against the webhook — that's expected; meta-refresh resolves it.)
6. Switch to Supabase Studio (or `psql` via DIRECT_URL). Query:
   ```sql
   SELECT id, clerk_org_id, name, plan_tier, created_at
     FROM organizations ORDER BY created_at DESC LIMIT 1;
   ```
   Expected: a row with `name='Test Org Phase 3'` and `clerk_org_id` starting with `org_`.
7. Query `users`:
   ```sql
   SELECT id, clerk_user_id, role, org_id
     FROM users
    WHERE clerk_user_id = '<the new user clerk id>' LIMIT 1;
   ```
   Expected: row with `role='admin'` (Clerk's built-in Admin role) and `org_id` matching the org row.
8. Check dev server logs for `[clerk-webhook] organization.created org_***xxxx` and `[clerk-webhook] organizationMembership.created user=user_***yyyy org=org_***xxxx role=admin`. L-06b masking should be in effect — confirm NO raw `org_<full id>` literal appears in the log.

### B. ROADMAP success criteria walkthrough

**SC #1 — Create policy from Dashboard:**
1. On /dashboard, click "Create policy".
2. /policies/new loads. Type "Test Remote Work Policy", select "HR", type some content in the TipTap editor (a bold word + a bullet list to exercise the toolbar).
3. Click "Save draft". You're redirected to /policies/{id}.
4. The new row appears on /policies with Draft badge.

**SC #2 — Illegal transition rejected:**
1. On /policies/{id} (status=draft), click "Actions" → "Publish".
2. Confirm dialog ("Publish this policy?") → click "Publish".
3. Status flips to Published; reload /policies and confirm Published badge.
4. On /policies/{id} (status=published), click "Actions" → "Archive" → confirm. Status flips to Archived.
5. On /policies/{id} (status=archived), open Actions menu. Only "Restore as draft" should be offered — NO Publish option. This is the visible enforcement; server-side rejection of `archived → published` is already unit-tested in Plan 03-06.

**SC #3 — Edit-published creates new version:**
1. Create a fresh policy, save as Draft, publish it (Published, version 1).
2. Open /policies/{id}, click "Actions" → "Edit policy" → confirm dialog with change-summary "First revision".
3. Page reloads with `?edit=1`. Editor flips editable. Make a change (add a sentence). Click "Save changes".
4. Status flips back to Draft. Query `policy_versions WHERE policy_id = ...` — exactly ONE row (versionNumber=1, capturing the prior-published content). `policies.current_version` should now be 2.
5. Publish again. `policy_versions` now has 2 rows: v1 (original publish) + v2 (re-publish of edited draft).

**SC #4 — Cross-org list scoped by org_id:**
1. Sign out. Sign UP a SECOND admin (different email, second incognito window).
2. Onboard → create org "Test Org Phase 3 — Second".
3. Land on /dashboard — should show ZERO policies. The first org's policies must NOT be visible.
4. Try to visit `/policies/{first-org-policy-id}` directly. Expected: 404 (notFound() because findById returns no rows scoped by org_id).
5. Defense-in-depth confirmation: `pnpm check:rls` still green.

**SC #5 — Search by title + category scoped by org_id:**
1. As either admin, create 3 policies with varied titles ("Remote Work Policy", "Travel Expense Policy", "HR Onboarding") and categories.
2. Visit `/policies?q=Remote`. URL-state debounces 250ms. Table shows only the Remote-titled row.
3. Visit `/policies?status=draft`. Table shows only Draft rows.
4. Visit `/policies?q=HR&status=draft`. Compound filter.
5. Visit `/policies` (clear filters) — all rows return.

### Reporting back

Paste a quick result line for each SC into the orchestrator (or this SUMMARY). On failure, paste the URL, error, and dev-log line so the planner can route a fix.

## Threat model wiring (T-03-11-01..06)

| Threat | Status | Evidence |
| --- | --- | --- |
| T-03-11-01 Cross-org policy list leakage | mitigated | All 4 page calls go through `withOrgScope`; `check-rls` (Plan 02-06) verifies cross-org returns 0 rows; SC #4 walkthrough confirms in browser. |
| T-03-11-02 Forged ?status= URL param | mitigated | `parseStatus` narrows to `PolicyStatus` union; unknown values silently drop to undefined. |
| T-03-11-03 Direct /policies/{id} of another org's policy | mitigated | `findById` scoped by orgId → empty array → `notFound()` → 404 (D-10). |
| T-03-11-04 edit-published bypasses change-summary | accepted | changeSummary is optional per UI-SPEC; audit trail sufficient via `policy_versions.created_at`. |
| T-03-11-05 Search hammers DB on every keystroke | mitigated | 250ms debounce in PolicyListSearch; LIMIT 100 hard cap on `listWithFilters`. |
| T-03-11-06 `<CreateOrganization />` spoofs existing org name | accepted | Clerk handles org-name uniqueness at provider; DB has `clerk_org_id` unique constraint. |

No new threat flags introduced — every new surface lives behind existing trust boundaries (admin layout requireAdmin + middleware role gate + withOrgScope).

## Known stubs

- **TL;DR textarea** on /policies/new is disabled + readOnly with placeholder "TL;DR will be auto-generated by AI on publish (Phase 4)". Intentional — the field shape is shown so Phase 4 (REQ-ai-features) can populate it without UI churn.
- **Version-history author name** is NOT displayed (Plan 03-10 SUMMARY documents this; same surface here). Phase 8 polish ticket.
- **`<noscript>` status-filter fallback** on /policies — works but is an unstyled link list rather than a full-fidelity Select. Phase 8 polish if the operator decides progressive enhancement matters for v1.

## Phase 3 — COMPLETE banner

Carry-forward closure inventory (all CLOSED in code; live-browser verification queued in Task 6):

| ID | Closure |
| --- | --- |
| L-01 | requireAdmin authoritative gate (Plan 03-02) |
| L-02 | CR-02 admin URL matcher (Plan 03-02 middleware) |
| L-03 | REG-P1-01 /post-sign-in trampoline (Plan 03-02) |
| L-04 | whsec rotation (Plan 03-00) |
| L-05 | PolicyVersions append-only (Plan 02-04 + Plan 03-04) |
| L-06a | Silent-loss fix (Plan 03-04) |
| L-06b | Webhook-log org-id masking (Plan 03-05) |
| L-06c | .tmp/svix-url.json cleanup (Plan 03-01 verify chain) |
| W7 | Clerk webhook race UI mitigation (this plan, Task 1) |
| W10 | check-artifacts auto-detection of Phase 3 completion (this plan, Task 5) |
| B2 | Edit-published wiring via onEditPublished callback (this plan, Task 4) |
| CR-02 | Admin URL matcher in lockstep with disk (this plan, Task 5 — full enforcement) |
| REG-P1-01 | /post-sign-in trampoline shipped + sign-in-success removed (Plan 03-02) |
| SF-WHSEC-1 | Webhook live-smoke target shipped (this plan, Task 5; smoke RUN queued in Task 6) |
| webhook-live-smoke | <CreateOrganization /> page is the live-test trigger (this plan, Task 5; smoke RUN queued in Task 6) |

After Task 6 reports "shipped", Phase 3 ASSEMBLY is complete and Phase 4 (AI layer) can begin.

## Self-Check: PASSED

- [x] All 10 created files exist on disk (verified via `pnpm check:artifacts` → 252/252 OK)
- [x] All 5 task commits present in `git log` (dbefa7a, ef254c9, 3875b94, dcdab2d, 90b12aa — verified)
- [x] `pnpm verify:phase-3` exits 0 (typecheck + db-imports + rls + admin-routes + artifacts + tests)
- [x] check-admin-routes in full enforcement: 5 admin URLs ↔ 3 patterns, 0 violations
- [x] check-artifacts Phase 3 file-existence rows all green (auto-detect via dashboard/page.tsx)
- [x] No modifications to STATE.md or ROADMAP.md (parallel-execution rule honored)
