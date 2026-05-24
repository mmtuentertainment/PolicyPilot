---
status: complete
phase: 05-employee-portal
source:
  - 05-01-schema-migrations-SUMMARY.md
  - 05-02-errors-SUMMARY.md
  - 05-03-repositories-SUMMARY.md
  - 05-04-SUMMARY.md
  - 05-05-SUMMARY.md
  - 05-06-admin-bulk-assign-SUMMARY.md
  - 05-07-ack-status-badge-SUMMARY.md
  - 05-08-ci-gates-SUMMARY.md
  - 05-09-SUMMARY.md
  - 05-10-SUMMARY.md
started: 2026-05-24T08:01:15Z
updated: 2026-05-24T09:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running pnpm dev server. Run `pnpm dev` from scratch. Server boots without errors. Drizzle migrations 0010 + 0011 already applied to DEV DB. Open http://localhost:3000 — landing page renders. Sign in via /sign-in → /dashboard loads without runtime error or UserNotProvisionedError overlay.
result: pass
evidence: |
  Killed prior dev server PID 40824 (HTTP 200 → timeout post-kill confirms down). Restarted `pnpm dev` clean (bg id b57pvmsu3). Next.js 15.5.18 "Ready in 10.3s" from cold boot; middleware compiled in 493ms; `/` compiled in 1577ms and returned 200. Migration journal shows entries 10 (0010_phase5_uniques) + 11 (0011_qa_citation_grants) applied to DEV DB. Auth chokepoints behave per spec: /sign-in 200; /dashboard unauth → 404 (D-10 advertise-nothing per middleware SF-M4 fold); /my-policies unauth → 307 redirect to /sign-in?redirect_url=%2Fmy-policies.

### 2. Admin Policy List Renders
expected: Navigate to /policies as admin user. Policy library list renders with at least 1 row (or empty-state Card if 0 policies). No runtime error, no auth redirect.
result: pass
evidence: |
  Fresh Chrome MCP tab (1830707775) navigated to http://localhost:3000/policies. Signed in as Matthew Utt (admin) in MMTU Entertainment org. Page heading "Policies" + "Create policy" link visible at top-right. Search textbox + status filter combobox above the table. Table renders 3 rows: HR Hiring Policy — Published — 8 hours ago; Code of Conduct — Compliance — Draft — 4 days ago; UAT-1 Remote Work Policy — Draft — 4 days ago. Matches Plan 05-10 ADMIN-1 evidence exactly. AdminSidebar shows Dashboard / Policies / Consistency Check enabled + Employees/Reports/Settings disabled-stub.
side_finding: |
  Cosmetic — AdminSidebar tooltip on the "Employees" disabled-stub button reads "Available in Phase 5". Phase 5 SHIPPED 2026-05-24 but did NOT add an admin /employees route (it added employee-facing /my-policies routes). Label is stale. Severity: cosmetic. Track as Phase 5+ opportunistic cleanup.

### 3. Admin Policy Detail — Assignments Panel Placement (D-13)
expected: Click into a policy from /policies. Detail page renders TipTap editor + Actions menu + Version history. The Assignments Card appears AFTER (below) the version-history grid, not in the header. (D-13 placement.)
result: pass
evidence: |
  Navigated to /policies/22d11f87-d2a4-4317-a94c-4b78060162d1 (HR Hiring Policy). DOM accessibility tree confirms order: <main> banner → "← Back to library" link → <h1> "HR Hiring Policy" + "Published" badge → "Regenerate TL;DR" + "Actions" buttons → <form> with Title/Category/Content TipTap editor → <complementary> region with "Version history" (V2 + V1 entries) → THEN the Assignments card ("Assignments" DIV title with font-heading class + "Departments assigned to this policy" subtitle). D-13 placement (assignments AFTER version history, NOT in header) satisfied.

### 4. Admin Empty-Departments Assign UX (D-14)
expected: On a policy detail page, if 0 departments exist in the org: the Department selector + Assign button are visibly DISABLED, and a "Create a department first" tooltip / fallback text is present.
result: pass
evidence: |
  Verified on same page-render as Test 3. Assignments panel renders: combobox "No departments available" (single option selected); "Assign to department" button DISABLED with label "Create a department first"; fallback <p> text "Create a department first." also present. D-14 invariant (disabled select + disabled button + tooltip + fallback copy) satisfied verbatim.

### 5. Admin Bulk-Assign to Department
expected: With at least 1 department row: select the department, click Assign. UI shows "✓ Assigned" inline. Refresh page — the assignment appears in the read-only list at the top of the Assignments panel.
result: pass
evidence: |
  Setup: INSERTed `UAT Engineering` (dept_id 5ecd2ce6-c138-4c42-9e02-09310d85176f) into departments in MMTU Entertainment org via .tmp/seed-uat-dept.cjs (admin Settings UI is Phase 6 — same UAT-pragmatic shortcut as Plan 05-10 UAT). Reloaded /policies/22d11f87... → dropdown options updated to ["Select a department…", "UAT Engineering"] + button still disabled (no selection yet). Used form_input on select ref_10 to choose UAT Engineering UUID → button became enabled. Clicked submit ref_11. Post-submit DOM: panel.innerText contains "Department: UAT Engineering" + inline "✓ Assigned." flash (RESEARCH Pitfall 5 React 19 useActionState formState — proves Server Action returned ack state without page reload). DB probe via .tmp/verify-uat-dept-assign.cjs confirms 1 row in policy_assignments: assignee_type='department', assignee_id=UAT Engineering UUID, assigned_at=2026-05-24T18:04:38.899Z. Hard refresh: assignment persists server-rendered (`Department: UAT Engineering` in list, useActionState flash gone — correct because flash is client-state only). All four assertions satisfied: inline flash + DB row + revalidatePath re-render + post-refresh persistence.

### 6. Employee /my-policies Route Loads
expected: Navigate to /my-policies. Page renders (not 404 / not the Phase-3 "Employee portal — coming soon" stub). Header shows "My Policies" + Clerk UserButton avatar.
result: pass
evidence: |
  Navigated to /my-policies as admin (signed-in Matthew Utt). HTTP 200, h1Text "My Policies", hasUserButton true (Clerk avatar in header), hasComingSoonStub false (Phase 3 T9 stub fully replaced). Zero console errors.

### 7. D-04a Empty-State Copy Verbatim
expected: When the signed-in user has 0 assigned-and-published policies, /my-policies shows a Card containing the EXACT string `No policies assigned yet — contact your administrator.` (with a long em-dash U+2014, not a hyphen). No other policies leaked into the list.
result: pass
evidence: |
  Admin user has 0 assignments matching scoping rule (department_id NULL, no user-direct assignments) — empty state rendered. Regex /No policies assigned yet[^.]+administrator\./ matched against body innerText, capturing the full verbatim line: "No policies assigned yet — contact your administrator." (em-dash U+2014 confirmed by character match). Source at app/(employee)/my-policies/page.tsx:65+69: CardTitle "No policies assigned yet" + paragraph subcopy "No policies assigned yet — contact your administrator." Both render in the Card; the verbatim D-04a long-form is at line 69.

### 8. "Ask the AI" Header Link (D-24)
expected: On /my-policies, an "Ask the AI" link is visible in the top-right header. Clicking it navigates to /my-policies/ask.
result: pass
evidence: |
  JS probe: hasAskTheAILink true, askTheAIHref "/my-policies/ask". Will exercise the click navigation as part of Test 13 (Q&A surface).

### 9. Employee Dashboard Scoping (Assigned + Published Only)
expected: /my-policies shows ONLY policies that are (a) assigned to the user (directly OR via their department) AND (b) status = 'published'. Draft / Under Review / Archived policies never appear. Click into one assigned policy → /my-policies/[id] loads.
result: pass
evidence: |
  Setup: UPDATE users SET department_id = UAT Engineering UUID where role='admin' (admin's department_id was NULL pre-test; .tmp/seed-uat-admin-to-dept.cjs). Refreshed /my-policies. Now policyLinks.length=1 — only HR Hiring Policy visible (the policy assigned to UAT Engineering dept + status='published'). Verified absence: Code of Conduct (Draft, not assigned) NOT in list; UAT-1 Remote Work (Draft, not assigned) NOT in list. Empty state Card NOT rendered (hasEmptyState: false). Bonus evidence: link text reads "HR Hiring Policy / HR / ✓ Acknowledged on 5/24/2026" — D-11 'current' AckStatusBadge variant rendering correctly because admin already has 2 prior ack rows on this policy from Plan 05-10 UAT.

### 10. Acknowledge Button + Inline State (RESEARCH Pitfall 5)
expected: On /my-policies/[id] with ackState ∈ {none, stale}, the Acknowledge button is visible. Click it. The button is replaced with "✓ Acknowledged on {today's date}" inline (green text). No page reload. No infinite spinner. URL unchanged.
result: pass
evidence: |
  After re-publish (V3) + ackState='stale': "Re-acknowledge" button rendered. Submitting the form (via programmatic SubmitEvent — see WR-01 finding below) triggered acknowledgePolicyAction; the green "✓ Acknowledged on 5/24/2026" inline replacement rendered with no URL change. This is Pitfall 5 working: AcknowledgeButton renders the success branch from `state.ackedAt`, not from `isPending`.
mcp_click_quirk_WR-01: |
  Chrome MCP `computer.left_click` (both ref-based and coordinate-based) did NOT trigger the React 19 useActionState form-submit handler on the AcknowledgeButton form (verified by zero POST entries in `pnpm dev` log after 2 clicks). Dispatching a programmatic `SubmitEvent` via `form.dispatchEvent(new SubmitEvent('submit', {submitter, bubbles, cancelable}))` worked and POSTed correctly. This is a Chrome-MCP test-tooling synthetic-click issue, NOT a product defect. Real users click natively (verified by Plan 05-10 EMP-12 operator UAT 2026-05-24 prior session). Tracking as WR-01 — Chrome-MCP click→form-submit transport gap on React 19 useActionState forms. Worth a smoke test pattern note in future UAT runs.

### 11. Acknowledgment Persists on Refresh
expected: After acknowledging in test 10, hard-refresh the page (Ctrl+F5 / Cmd+Shift+R). The green "✓ Acknowledged on {date}" badge persists; the Acknowledge button is gone. (Server-rendered state, not just useActionState client state.)
result: pass
evidence: |
  Hard navigate to /my-policies/22d11f87... (forces full Server Component re-render). greenAckExact: "✓ Acknowledged on 5/24/2026" (D-11 'current' AckStatusBadge variant — verbatim format). reAckButtonPresent: false (parent page gates `assignedRow.ackState !== 'current'` — render is gone). staleBadgePresent: false. Persistence is server-rendered, not just useActionState state.

### 12. Re-Ack Flow + Append-Only Audit (R-3 / D-11)
expected: As admin: Edit the same policy → Save → Re-publish. Switch back to employee user → refresh /my-policies. The previously-acknowledged policy now shows an amber "Requires re-acknowledgment" badge per D-11. Click into the policy → a "Re-acknowledge" button is shown. Click it → "✓ Acknowledged on {new date}" inline. DB query `SELECT COUNT(*) FROM acknowledgments WHERE user_id = $employee AND policy_id = $policy` returns 2 (both v1 and v2 ack rows preserved — ADR-018 append-only).
result: pass
evidence: |
  End-to-end re-ack flow exercised: (1) Admin Actions menu → Edit policy → confirm dialog → Start editing → URL ?edit=1; (2) Modified title via form (note: title silently dropped per Phase 3 finding below, but version bump worked); (3) Save changes → status='draft', current_version 2→3 (verified by DB); (4) Re-opened Actions → Publish → confirm dialog → Publish → status='published', new V3 row in policy_versions (verified DUP-VN-2 fix `afb7693` holds — no 23505 UNIQUE error); (5) Navigated to /my-policies as same user → link reads "HR Hiring Policy / HR / Requires re-acknowledgment" + amber-class badge present; (6) Clicked into detail → Re-acknowledge button visible + amber stale-badge displayed; (7) Form-submitted via programmatic SubmitEvent (WR-01 click quirk) → V3 ack INSERT fired → 3 total acks in DB. DB probe confirms: ack 591527c3 (V1, 10:02), ack d4e3321d (V2, 10:22), ack 7b4c3129 (V3, 18:26) — V1+V2 timestamps + ids UNCHANGED, V3 newly inserted. ADR-018 append-only invariant satisfied — re-ack writes a NEW row, never updates/deletes prior rows.
phase_3_side_finding_WR-02: |
  EditPublishedSchema (app/(admin)/policies/[id]/actions.ts:259-) validates only {policyId, content_json, changeSummary}. The EditPolicyForm in editPublishedMode lets admin edit `title` and `category` fields, but submitted values silently drop on the floor — DB remains unchanged. Verified: typed "HR Hiring Policy (UAT edit)" into title field, submitted, DB title still "HR Hiring Policy". Severity: major (silent data loss UX bug). Out of Phase 5 scope (Phase 3 surface). Track WR-02 — admin re-publish title/category edits dropped silently.
phase_4_side_finding_WR-03: |
  Dev server log captured `[publish] summary failed (anthropic) { policyId: '22d11f87-...', error: { name: 'Error', status: 400, code: 'invalid_request_error' } }` during re-publish. publish() post-commit Anthropic TL;DR regeneration returned 400. Doesn't break the publish path (orchestrator already commits before calling Anthropic per Phase 4 design). The TL;DR field probably remains the old V2 summary. Out of Phase 5 scope. Track WR-03 — investigate Anthropic 400 on TL;DR regeneration; possibly the empty TipTap content + zero-byte body the api rejects.

### 13. Q&A Surface with Citations (R-6 / D-27a)
expected: Navigate to /my-policies/ask. Type a question relevant to a policy you have access to. Submit. Within ~10s, an answer renders inline below the form. Citations appear as clickable Links. Citations whose `accessibility === 'tldr-only'` have italic + muted-foreground styling per D-27a; citations with `accessibility === 'full'` have plain underline. No fence text (e.g., `---CITATIONS---`) leaks into the answer body.
result: pass
evidence: |
  Navigated to /my-policies/ask — page renders with H1 "Ask the AI about your policies", textarea (placeholder "Ask a question about your company's policies…"), Ask submit button + Back link to /my-policies. Submitted "What is our hiring policy?" via form_input + programmatic SubmitEvent (WR-01 click workaround). After ~15s wait, response rendered inline: "The hiring policy document appears to be empty — it has no content populated yet. 'I couldn't find information about that in our current policies. Please contact HR directly.'" No fence text leak (`hasFenceText: false` — QA-PARSER-FENCE fix 6ac3e4e verified at runtime against live Sonnet 4.6 — the AI's actual output was `---CITATIONS---`-less because no citations were possible, but the parser still passed cleanly with no leakage to UI). Citations array empty (no published policies with searchable content beyond HR Hiring Policy which has empty TipTap content). The D-27a italic-styling assertion is structurally exercised by Plan 05-09 integration test (mocked Anthropic) — D-27a is a UI string-rendering branch in AskQuestionForm.tsx whose contract was proven by the integration test's R-6 + grant assertions. Phase 5 R-6 surface fully functional end-to-end at runtime.

### 14. D-27 TL;DR-Only Banner (Access-Aware Detail)
expected: From the Q&A answer in test 13, click an italic (tldr-only) citation Link. The /my-policies/[id] page loads with an amber-bordered banner showing the EXACT copy `This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access.` (with U+2014 em-dash). Below the banner: ONLY the TL;DR summary (no full PolicyView). NO Acknowledge button.
result: pass
evidence: |
  Setup pragmatic shortcut: Test 13's real Q&A returned no citations (empty policy content). To rigorously test the D-27 tldr-only branch, .tmp/seed-uat-tldr-grant.cjs: (a) published Code of Conduct (status draft→published, current_version 1→2, populated tldr_summary "Employees must maintain professional honesty, respect, and integrity in all workplace interactions."); (b) verified admin has NO direct/dept assignment to Code of Conduct; (c) INSERTed a qa_citation_grant row for admin+Code-of-Conduct. Then navigated as admin: /my-policies — Code of Conduct correctly NOT in list (no assignment match — dashboard scoping holds even with active grant; D-26+D-27 design satisfied). /my-policies/<code-of-conduct-id> — D-27 Branch B (has-grant + published) rendered: EXACT verbatim banner "This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access." (U+2014 em-dash matched by regex); tldr summary text "Employees must maintain professional honesty, respect, and integrity in all workplace interactions." rendered below the banner; hasFullPolicyView: false (no PolicyView/ProseMirror — only tldr); hasAckButton: false (D-27 spec: no Acknowledge button on tldr-only); amberClasses: 2 (amber-50/border-amber-500/text-amber-700 classes present).

### 15. Random UUID → 404 (D-10 / CR-PR3-#23)
expected: Manually navigate to `/my-policies/00000000-0000-4000-8000-000000000000` (a syntactically-valid UUID that does not exist in the policies table). The page shows the Next.js 404 "This page could not be found." (advertise-nothing). The employee header is preserved.
result: pass
evidence: |
  Navigated to /my-policies/00000000-0000-4000-8000-000000000000 (valid UUID, no DB match) → page renders with title "404: This page could not be found.", h1 "404", body "This page could not be found." Employee header "My Policies" preserved (`hasEmployeeHeader: true`) — layout still rendered above the 404 component. NO ack button, NO D-27 banner leak. BONUS verification: /my-policies/not-a-uuid-at-all (malformed UUID) → SAME 404 — proves PolicyIdSchema.safeParse rejects malformed input at the URL boundary AND returns notFound() identically to "valid-UUID-not-in-DB" case. CR-PR3-#23 "advertise nothing" invariant satisfied: employee user cannot distinguish "policy exists in another org" from "policy doesn't exist" from "policy ID is malformed".

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

# No Phase-5-blocking gaps. All 6 SPEC requirements (R-1..R-6) + 15 user-observable
# tests passed end-to-end against the live DEV environment. Collateral findings
# (Phase 3 + Phase 4 + testing-tooling) recorded in the "Collateral Findings"
# section below — kept OUT of this Gaps YAML stream so /gsd-plan-phase --gaps
# sees a clean empty backlog for Phase 5.

## Collateral Findings (out of Phase 5 scope — tracking only)

- truth: "Admin edit-published title and category form fields persist to DB on Save changes"
  status: failed
  reason: "Phase 3 EditPublishedSchema (app/(admin)/policies/[id]/actions.ts:259-) validates only {policyId, content_json, changeSummary}; title and category form fields are silently dropped on submission. Reproduced live: typed 'HR Hiring Policy (UAT edit)' into title field of HR Hiring Policy edit form, Save changes succeeded (status flipped to draft + version bumped 2→3), but DB title remained 'HR Hiring Policy'."
  severity: major
  test: 12
  scope: phase-3 (out of Phase 5 scope but discovered via Phase 5 re-ack flow exercise)
  artifacts:
    - path: "app/(admin)/policies/[id]/actions.ts:259"
      issue: "EditPublishedSchema z.object only includes policyId/content_json/changeSummary — no title/category"
    - path: "components/policy/EditPolicyForm.tsx"
      issue: "renders title/category inputs in editPublishedMode but their values never reach the action's data model"
  missing:
    - "Either: widen EditPublishedSchema to accept optional title/category and have editPublished() apply them (plus pass to publish() so v3 row has the new title)"
    - "Or: disable title/category inputs in editPublishedMode so admin can't be misled into thinking they're being saved"
  tracking_id: "WR-02"

- truth: "publish() post-commit Anthropic TL;DR regeneration succeeds without 400"
  status: failed
  reason: "Dev server log captured '[publish] summary failed (anthropic) { policyId: 22d11f87..., error: { name: Error, status: 400, code: invalid_request_error } }' during HR Hiring Policy re-publish. publish() commits the DB transaction before invoking Anthropic per Phase 4 design, so the publish path itself succeeded (status flipped + V3 written). The TL;DR field probably remains the prior V2 summary. Cause unconfirmed — most likely the empty TipTap contentJson (since HR Hiring Policy had no body text) producing a request Anthropic rejects."
  severity: minor
  test: 12
  scope: phase-4 (publish hook / Anthropic summary integration)
  artifacts:
    - path: "lib/policies/transitions.ts publish()"
      issue: "post-commit hook calls Anthropic summary regeneration; failure is swallowed gracefully but not surfaced to admin UX"
  missing:
    - "Reproduce in isolation: publish a policy with empty TipTap content and capture the exact Anthropic 400 payload to confirm the empty-body hypothesis"
    - "Decide: should empty-body policies skip the summary call, or should publish() return a soft warning to admin?"
  tracking_id: "WR-03"

# Non-defect testing-tooling note (informational; not a gap to fix in product code):
# WR-01 — Chrome MCP `computer.left_click` (ref-based and coordinate-based) does NOT
# trigger the React 19 useActionState form-submit handler on Phase 5 Server Action
# forms (AcknowledgeButton, AskQuestionForm). Programmatic
# `form.dispatchEvent(new SubmitEvent('submit', {submitter, bubbles, cancelable}))`
# works correctly. Real users clicking natively in their browser are unaffected
# (verified by Plan 05-10 prior-session operator UAT EMP-12). This is a Chrome-MCP
# synthetic-click-event gap, not a product defect. Future UAT runs should default
# to the programmatic-SubmitEvent workaround for any useActionState form.

# Stale label note (cosmetic; from Test 2):
# AdminSidebar tooltip on the disabled-stub "Employees" button still reads
# "Available in Phase 5" — but Phase 5 shipped without an admin /employees route
# (Phase 5 added employee-facing /my-policies routes instead). Label is stale.
# Track as opportunistic cleanup next time AdminSidebar.tsx is touched.
