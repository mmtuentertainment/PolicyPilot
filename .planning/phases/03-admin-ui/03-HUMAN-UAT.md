---
status: partial
phase: 03-admin-ui
source: [03-VERIFICATION.md]
started: 2026-05-19T23:00:00Z
updated: 2026-05-19T23:00:00Z
---

## Current Test

[awaiting human testing — see 6 items below]

## Tests

### 1. ROADMAP SC #1 — Create policy from /dashboard
expected: Click "Create policy" on /dashboard → /policies/new → fill form → save → redirect to /policies/{id} → row visible on /policies with Draft badge
result: [pending]

### 2. ROADMAP SC #2 — Illegal transition rejected with UI surface
expected: On archived policy, the Actions menu only offers "Restore as draft" — no Publish option; server-side rejection of archived → published already covered by 24-case state-machine test suite
result: [pending]

### 3. ROADMAP SC #3 — Edit published creates new policy_versions row AND resets status to Draft
expected: Open published policy → Actions → Edit policy → confirm with change summary → ?edit=1 → save edits → status flips back to Draft → policy_versions row count increments by 1 → policies.current_version increments
result: [pending]

### 4. ROADMAP SC #4 — Cross-org list scoped by org_id
expected: Sign up second admin in a separate org → /dashboard shows zero policies → direct GET /policies/{first-org-policy-id} returns 404 (notFound) per D-10
result: [pending]

### 5. ROADMAP SC #5 — Search by title/category scoped by org_id
expected: Create 3 policies of varied titles/categories → /policies?q=Remote returns only matching rows → /policies?status=draft filters → /policies?q=HR&status=draft compound filter works → clearing returns all rows
result: [pending]

### 6. Webhook live-smoke (Plan 03-11 Task 6 / SF-WHSEC-1)
expected: Fresh sign-up → /post-sign-in trampoline → /onboarding/create-org → CreateOrganization widget → afterCreateOrganizationUrl=/dashboard → DB rows present in organizations + users; webhook logs show masked org_***xxxx / user_***yyyy format
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
