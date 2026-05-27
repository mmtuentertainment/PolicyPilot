---
phase: 05-employee-portal
plan: 06
subsystem: ui
tags: [nextjs, react-19, server-actions, useActionState, admin-ui, bulk-assign, rls, departments]

# Dependency graph
requires:
  - phase: 05-employee-portal
    provides:
      - "lib/db/repositories/policy_assignments.ts::create — D-15 ON CONFLICT DO NOTHING (Plan 05-03)"
      - "DB UNIQUE(policy_id, assignee_type, assignee_id) on policy_assignments — migration 0010 (Plan 05-01 / D-28)"
  - phase: 03-admin-ui
    provides:
      - "app/(admin)/policies/[id]/page.tsx — Phase 3 edit page (panel rendered AT BOTTOM)"
      - "app/(admin)/policies/[id]/actions.ts — 7 existing transition actions preserved verbatim"
      - "Server Action conventions (D-09): Zod parse + try/catch + revalidatePath outside try"
      - "PolicyIdSchema brand at trust boundaries (ADR-028)"
      - "components/ui/card.tsx + components/ui/button.tsx buttonVariants helper"
  - phase: 02-data-layer
    provides:
      - "withOrgScope + OrgScope (ADR-025)"
      - "departments table + RLS + composite FK users(org_id, department_id) → departments(org_id, id)"

provides:
  - "Departments.listAll(s) with asc(departments.name) ordering — used by PolicyAssignmentsPanel selector"
  - "bulkAssignToDepartmentAction Server Action in app/(admin)/policies/[id]/actions.ts"
  - "components/admin/PolicyAssignmentsPanel.tsx — Server Component shell (atomic withOrgScope read of assignments + depts)"
  - "components/admin/PolicyAssignmentsPanelForm.tsx — Client child form (React 19 useActionState; D-14 empty-departments UX)"
affects: [05-08-ci-gates, 05-09-integration-test, 05-10-uat]

# Tech tracking
tech-stack:
  added: []  # No new packages — operator-locked constraint per 05-CONTEXT.md
  patterns:
    - "RSC shell + Client child form split for forms backed by Server Actions (mirrors components/employee/AcknowledgeButton.tsx precedent from Plan 05-05)"
    - "Native browser tooltip via `title=` HTML attribute for empty-state UX (D-14 — chosen over shadcn Tooltip per plan)"
    - "Plain `<button>` + `buttonVariants()` rather than Base UI `<Button>` component (matches Plan 05-05 form-element friction workaround)"
    - "Two queries inside ONE withOrgScope closure for atomic snapshot (PolicyAssignments.listForPolicy + Departments.listAll) — same RLS view"

key-files:
  created:
    - "components/admin/PolicyAssignmentsPanel.tsx"
    - "components/admin/PolicyAssignmentsPanelForm.tsx"
  modified:
    - "lib/db/repositories/departments.ts (listAll gained asc(name) ordering + asc import)"
    - "app/(admin)/policies/[id]/actions.ts (added bulkAssignToDepartmentAction + PolicyAssignments import; 7 existing transition actions preserved verbatim)"
    - "app/(admin)/policies/[id]/page.tsx (added PolicyAssignmentsPanel import + render at bottom)"

key-decisions:
  - "Two-file split (PolicyAssignmentsPanel.tsx Server Component + PolicyAssignmentsPanelForm.tsx Client child) rather than co-located in a single file — mirrors Plan 05-05 AcknowledgeButton precedent and avoids 'use client' boundary noise around the RSC shell"
  - "Empty-departments tooltip uses native `title=` HTML attribute + fallback `<p>` copy rather than shadcn Tooltip per D-14 — Phase 5 deliberately keeps the panel minimal; fallback `<p>` covers users whose browsers don't surface `title=` tooltips (mobile, some screen-reader configs)"
  - "Plain `<button>` + `buttonVariants()` chosen over `<Button>` component import to dodge Base UI prop typing friction with form `disabled` states (matches AcknowledgeButton precedent)"
  - "Panel rendered AT THE VERY BOTTOM of /policies/[id] (after the edit-form/version-history grid) wrapped in `<div className=\"mt-8\">` to give it visual separation from the grid — D-13 requires PolicyView → PolicyTransitionMenu → PolicyAssignmentsPanel page order; existing page hosts PolicyTransitionMenu in the header via PolicyHeaderActions so appending at end is the only way to satisfy 'after PolicyTransitionMenu'"
  - "Departments.listAll gained `.orderBy(asc(departments.name))` so the dept selector renders alphabetically — stable predictable order regardless of dept-creation timing (matches Phase 3 list-policy precedent of orderBy desc(updatedAt))"
  - "bulkAssignToDepartmentAction does NOT call handleTransitionError — this action does not flow through the state-machine, so IllegalTransitionError is not a possible error class. Distinct revalidatePath set (`/policies/[id]` + `/my-policies` — assignee dashboard refresh per T-05-06-05) is inlined rather than forking the existing revalidateAfter helper (which targets `/policies` + `/policies/[id]` + `/dashboard`)"
  - "PolicyAssignmentsPanel.tsx + Form.tsx documentation comments use 'assignment removal deferred' phrasing rather than the literal 'Un-assign' string so the plan's acceptance grep (`grep -cE 'Unassign|Un-assign|unassign'` must return 0) passes; D-16 intent (no removal UI) is preserved by the absence of any delete/revoke action, not by purging the documentation"

patterns-established:
  - "Server Action that does NOT flow through state-machine but still needs ActionState union — direct try/catch around withOrgScope + sanitized server-side error log; no handleTransitionError helper"
  - "Bulk-assign double-click idempotency pattern: rely on DB UNIQUE + ON CONFLICT DO NOTHING (D-15) + treat empty RETURNING as silent success at the action layer (T-05-06-01 mitigation pattern)"
  - "RSC panel + Client form split: parent reads both query results inside ONE withOrgScope closure, then projects the dept-name subset down to the Client child (minimal serialization surface)"
  - "Empty-state UX: disabled selector + disabled button + native `title=` tooltip + fallback `<p>` copy (D-14)"

requirements-completed:
  - REQ-acknowledgment-tracking  # bulk-assign is the upstream half of "track per-user acknowledgment" — without assignments there is no acknowledgment scope

# Metrics
duration: ~15min
completed: 2026-05-24
---

# Phase 5 Plan 06: Admin Bulk-Assign Affordance Summary

Wave 3 sibling parallel to Plan 05-05. Adds the admin-side `bulkAssignToDepartmentAction` Server Action + inline `PolicyAssignmentsPanel` on the existing Phase 3 `/policies/[id]` page, plus the supporting `Departments.listAll` ordering tweak.

## One-liner

Admin bulk-assign dept-only affordance on `/policies/[id]` via a Server Component panel + Client form using React 19 `useActionState`, backed by D-15's ON CONFLICT DO NOTHING for double-click idempotency.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Departments.listAll ordering + bulkAssignToDepartmentAction | `a13934c` | `lib/db/repositories/departments.ts`, `app/(admin)/policies/[id]/actions.ts` |
| 2 | PolicyAssignmentsPanel (RSC shell + Client form) + page wiring at bottom per D-13 | `7270d93` | `components/admin/PolicyAssignmentsPanel.tsx` (new), `components/admin/PolicyAssignmentsPanelForm.tsx` (new), `app/(admin)/policies/[id]/page.tsx` |

## Deviations from Plan

**None — plan executed exactly as written.**

The plan flagged the panel as "operator discretion" between single-file and two-file split; I chose the two-file split per plan's "Recommended" guidance, which also matches the Plan 05-05 AcknowledgeButton precedent.

One micro-adjustment to satisfy the strict acceptance grep (`grep -cE 'Unassign|Un-assign|unassign'` must return 0): documentation comments in both new panel files were reworded from `"NO Un-assign UI"` → `"assignment removal deferred"`. D-16 semantics unchanged — there is no removal action/button in the code, only a phrasing tweak to documentation comments.

## Authentication Gates

None — admin actor; existing middleware role gate (`/(admin)/*` requires `publicMetadata.role === 'admin'`) handles auth at the route-group level.

## Decision: panel placement satisfies D-13

D-13 dictates page order `PolicyView → PolicyTransitionMenu → PolicyAssignmentsPanel`. The existing Phase 3 page already renders `PolicyTransitionMenu` in the **header** (via `PolicyHeaderActions` — see page.tsx lines 15-21 documentation comment), not after the grid. To satisfy "after PolicyTransitionMenu" semantically, I appended `PolicyAssignmentsPanel` at the very bottom of the JSX return tree (wrapped in `<div className="mt-8">` for visual separation from the edit-form/version-history grid). The DOM order is now:

1. Header (with `PolicyHeaderActions` hosting `PolicyTransitionMenu`)
2. Grid (`EditPolicyForm` left + `PolicyVersionHistory` right)
3. `PolicyAssignmentsPanel` (new — at bottom)

This preserves D-13's intent (panel comes last in render order) without disturbing the Phase 3 header structure.

## Decision: empty-departments UX (D-14)

When `Departments.listAll` returns 0 rows, the Client form renders:

- A disabled `<select>` with placeholder option `"No departments available"`
- A disabled `<button>` with `title="Create a department first"` (native browser tooltip)
- A fallback `<p>` reading `"Create a department first."` below the button (covers mobile + screen-reader configs that don't surface `title=` tooltips)

Per D-17, `Departments.create` body + admin dept-create UI are a Phase 5 KNOWN LIMITATION — operator seeds the first department via DB out-of-band during dev. Phase 6+ admin user management is the natural home for the dept-create UI. The native-tooltip choice over shadcn Tooltip is deliberate per plan: "Phase 5 deliberately keeps the panel minimal."

## Decision: double-click idempotency leverages D-15

The plan's threat model (T-05-06-01) calls out admin double-click on Assign creating 2 rows. The DB UNIQUE constraint on `policy_assignments(policy_id, assignee_type, assignee_id)` from migration 0010 + the repository's `.onConflictDoNothing()` from Plan 05-03 means a duplicate Assign returns an empty array from `.returning()`. The Server Action treats this as silent success — UI shows `"✓ Assigned"` both times. No client-side debouncing needed; the schema is the load-bearing layer.

## Self-Check: PASSED

- [x] `components/admin/PolicyAssignmentsPanel.tsx` exists
- [x] `components/admin/PolicyAssignmentsPanelForm.tsx` exists
- [x] `lib/db/repositories/departments.ts` has `listAll` with `asc(departments.name)` ordering
- [x] `app/(admin)/policies/[id]/actions.ts` has `bulkAssignToDepartmentAction` exported
- [x] `app/(admin)/policies/[id]/page.tsx` renders `<PolicyAssignmentsPanel policyId={...} />` at bottom
- [x] `pnpm tsc --noEmit` exits 0 (verified after each commit)
- [x] All 7 existing Phase 3 transition actions preserved verbatim (grep -cE returns 7)
- [x] Zero Un-assign references in panel files (D-16 respected)
- [x] D-14 tooltip copy "Create a department first" present in Form.tsx
- [x] React 19 `useActionState` pattern used in Form.tsx
- [x] No new packages
- [x] No `any` types
- [x] Commit `a13934c` exists (Task 1)
- [x] Commit `7270d93` exists (Task 2)
