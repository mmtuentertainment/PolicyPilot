---
status: closed
phase: 03-admin-ui
source: [03-VERIFICATION.md]
started: 2026-05-19T23:00:00Z
updated: 2026-05-20T07:00:00Z
---

## Current Test

[ALL 6 PASS as of 2026-05-20 — see Summary at bottom for full record]

## Tests

### 1. ROADMAP SC #1 — Create policy from /dashboard
expected: Click "Create policy" on /dashboard → /policies/new → fill form → save → redirect to /policies/{id} → row visible on /policies with Draft badge
result: PASS (2026-05-20 ~02:50 local) — `/dashboard` "Create policy" → `/policies/new`; TipTap toolbar (Bold/Italic/Strikethrough/Code/H1/H2/H3/lists) rendered; title "UAT-1 Remote Work Policy" + category HR + body accepted; "Save draft" redirected to `/policies/41ab9db4-f328-4fdd-b3f5-c29739e7a28b`; `/policies` list shows row with Draft badge.

### 2. ROADMAP SC #2 — Illegal transition rejected with UI surface
expected: On archived policy, the Actions menu only offers "Restore as draft" — no Publish option; server-side rejection of archived → published already covered by 24-case state-machine test suite
result: PASS (2026-05-20 ~02:55 local) — Walked UAT-1 policy through Draft→Published→Archived. Menu set at each state exactly matched ALLOWED_TRANSITIONS: Draft={Submit for review, Publish}, Published={Archive, Edit policy}, Archived={Restore as draft}. No illegal options surfaced.

### 3. ROADMAP SC #3 — Edit published creates new policy_versions row AND resets status to Draft
expected: Open published policy → Actions → Edit policy → confirm with change summary → ?edit=1 → save edits → status flips back to Draft → policy_versions row count increments by 1 → policies.current_version increments
result: PASS (2026-05-20 ~03:13 local). Pre-edit baseline (policy 41ab9db4-...): status=published, current_version=1, policy_versions_count=2. Post-edit: status=draft ✓, current_version=2 ✓ (+1), policy_versions_count=3 ✓ (+1), new row inserted at 11:13:31 with version_number=1 (snapshot of pre-edit v1 — bump applies to policies row not snapshot row, matching transitions.ts:227+237). Sub-findings: (S1) Restore→Publish duplicate-vN bug surfaced during Phase A — diagnosed at .planning/debug/duplicate-policy-version.md; Option C fix planned as 03-G3 (restore bumps currentVersion + UNIQUE(policy_id, version_number) + duplicate cleanup migration). (S2) Change-summary UX gap — TransitionMenu dialog at PolicyTransitionMenu.tsx:295-302 discards the summary on published→draft path; EditPolicyForm.tsx:136 has its own "Change summary (optional)" input that re-collects it. Operator filled the first, left the second blank → persisted change_summary is "". Recommend folding into 03-G3 as an additional task: either remove the dialog summary field on this path OR pre-populate EditPolicyForm with whatever was typed in the dialog (URL param / session storage hand-off).

### 4. ROADMAP SC #4 — Cross-org list scoped by org_id
expected: Sign up second admin in a separate org → /dashboard shows zero policies → direct GET /policies/{first-org-policy-id} returns 404 (notFound) per D-10
result: PASS (2026-05-20 ~03:45 local). Org B = "UAT Org B" (clerk_org_id org_3DzEn..., internal uuid 1eac624e-...). 4-1: Org B /dashboard → "No policies yet" empty state ✓. 4-2: Org B /policies → empty list ✓. 4-3: direct nav to /policies/41ab9db4-... (Org A's policy) → DOM h1="404", title="404: This page could not be found." per D-10 advertise-nothing (no 403 leak) ✓. JWT refreshed naturally during Svix replay window (Clerk session token picked up mirrored publicMetadata.role=admin without a sign-out cycle). Unblocking required closing SF-W5 — commit 2da89b4 (03-G3 T7) ships the fix: webhook handler now deletes clerk_events row before any non-2xx return so Clerk's retry re-fires the handler instead of hitting D-03b idempotency short-circuit. Verified end-to-end via Svix Dashboard "Replay" of msg_3DzEmy2SCnImKwEcn6UBbTksJMF — handler ran cleanly, orgbtestuser.org_id linked + role=admin + Clerk publicMetadata mirrored.

### 5. ROADMAP SC #5 — Search by title/category scoped by org_id
expected: Create 3 policies of varied titles/categories → /policies?q=Remote returns only matching rows → /policies?status=draft filters → /policies?q=HR&status=draft compound filter works → clearing returns all rows
result: PASS (2026-05-20 ~04:00 local). Phase A: 3 policies created in MMTU Entertainment (Title Case orphan org — operator landed there due to Clerk org-switcher pinning; the original UAT-1 in "mmtu entertainment" lowercase org is unrelated artifact, see .planning/debug/org-topology-uat5.md). Phase B 5-1..5-8 measured PASS: 5-1 /policies=3, 5-2 ?q=Remote=1, 5-3 ?q=HR=2, 5-4 ?q=Conduct=1, 5-5 ?q=Compliance=1 (confirms category match), 5-6 ?status=draft=2, 5-7 ?status=published=1, 5-8 ?q=HR&status=draft=1. UI state restoration PASS — textbox + dropdown reflect URL params, clearing drops params. 5-9 (Org B /policies=0) covered by UAT-4 4-2. 5-10 measured live in UAT Org C fresh session: /policies?q=Remote → URL stable, empty-state card "No policies match your search" + Clear filters button, 0 results ✓. Cross-org scoping holds at both list AND search-filtered endpoints across 4 orgs (3 user-created + 1 orphan).

### 6. Webhook live-smoke (Plan 03-11 Task 6 / SF-WHSEC-1)
expected: Fresh sign-up → /post-sign-in trampoline → /onboarding/create-org → CreateOrganization widget → afterCreateOrganizationUrl=/dashboard → DB rows present in organizations + users; webhook logs show masked org_***xxxx / user_***yyyy format
result: PASS (2026-05-20 ~04:00 local). Two independent fresh sign-ups exercised the full chain: (1) orgbtestuser at 11:24Z hit SF-W5 race (membership.created before org.created → 409 + idempotency row stale → Svix replay needed after 03-G3 T7 fix shipped at 2da89b4 → recovered cleanly); (2) matthewutt at 16:49Z hit the ordered happy-path (user.created → org.created → membership.created all 200, no race). Strict SC #6 7/7 items PASS: (1) user.created fires ✓, (2) /post-sign-in trampoline routes via 307 ✓, (3) /onboarding/create-org renders 200 ✓, (4) CreateOrganization widget creates org (organizations.id=e7b37b2d-... for UAT Org C) ✓, (5) afterCreateOrganizationUrl=/dashboard configured at app/(admin)/onboarding/create-org/page.tsx:35 ✓, (6) DB rows present (organizations + users + users.org_id linked + role=admin) ✓, (7) All webhook log lines use masked IDs (user_***YCCo, org_***dPSF) per L-06b ✓. SF-WHSEC-1 closure: svix.verify() successfully validated payloads against rotated whsec_ in .env.local across both flows. Bonus: SF-W5 fix proven by two independent paths (Svix replay + fresh ordered chain). Sub-finding: matthewutt's first /dashboard load on the browser-agent had a transient "frame in error" state that self-resolved on the next clean nav; dev.log + verification F5 confirmed /dashboard renders correctly (header "Dashboard" + "Create policy" + "No policies yet" empty state + "UAT Org C" in topbar). Diagnosed as browser-agent inspection-timing artifact during Clerk's post-onboarding redirect interstitial, not a server issue.

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

Status: ALL 6 ITEMS PASS as of 2026-05-20 ~04:00 local. Phase 3 UAT closed; ready for 03-G3 hotfix execution and Phase 3 PR creation.

## Gaps
