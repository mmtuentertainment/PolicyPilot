---
phase: 05-employee-portal
plan: 06
type: execute
wave: 3
depends_on:
  - 05-01
  - 05-02
  - 05-03
  - 05-04
files_modified:
  - app/(admin)/policies/[id]/actions.ts
  - app/(admin)/policies/[id]/page.tsx
  - components/admin/PolicyAssignmentsPanel.tsx
  - lib/db/repositories/departments.ts
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
must_haves:
  truths:
    - "Admin /policies/[id] page has a PolicyAssignmentsPanel rendered AT THE BOTTOM, AFTER PolicyTransitionMenu per D-13"
    - "PolicyAssignmentsPanel shows read-only list of current assignments + dept selector + Assign-to-department button"
    - "When Departments.listAll returns 0, selector + button are disabled with tooltip 'Create a department first' per D-14"
    - "bulkAssignToDepartmentAction in app/(admin)/policies/[id]/actions.ts calls PolicyAssignments.create with assigneeType='department', assigneeId=$deptId"
    - "Bulk-assign UNIQUE conflict (already assigned) is silent success — UI does NOT show error"
    - "No Un-assign UI per D-16 (read-only assignment list only)"
    - "Departments repository exposes listAll(s: OrgScope) for the panel"
  artifacts:
    - path: "app/(admin)/policies/[id]/actions.ts"
      provides: "bulkAssignToDepartmentAction Server Action"
      contains: "bulkAssignToDepartmentAction"
    - path: "app/(admin)/policies/[id]/page.tsx"
      provides: "PolicyAssignmentsPanel renders at bottom of page after PolicyTransitionMenu"
      contains: "PolicyAssignmentsPanel"
    - path: "components/admin/PolicyAssignmentsPanel.tsx"
      provides: "Server Component panel with embedded Client form"
      contains: "PolicyAssignmentsPanel"
    - path: "lib/db/repositories/departments.ts"
      provides: "Departments.listAll repository method (used by panel)"
      contains: "listAll"
  key_links:
    - from: "components/admin/PolicyAssignmentsPanel.tsx"
      to: "PolicyAssignments.listForPolicy + Departments.listAll"
      via: "withOrgScope-wrapped reads inside the Server Component"
      pattern: "listForPolicy|listAll"
    - from: "app/(admin)/policies/[id]/actions.ts bulkAssignToDepartmentAction"
      to: "PolicyAssignments.create (post-Plan 05-03 filled body)"
      via: "withOrgScope-wrapped call inside try block"
      pattern: "PolicyAssignments\\.create"
---

<objective>
Wave 3 sibling parallel to Plan 05-05. Add the admin-side bulk-assign affordance to the existing `/policies/[id]` page per D-13..D-17:

1. Extend `app/(admin)/policies/[id]/actions.ts` with `bulkAssignToDepartmentAction` Server Action.
2. Edit `app/(admin)/policies/[id]/page.tsx` to render `PolicyAssignmentsPanel` AT THE BOTTOM, after `PolicyTransitionMenu`.
3. Create `components/admin/PolicyAssignmentsPanel.tsx` — Server Component listing assignments + Client form for dept-selector + Assign button.
4. Extend `lib/db/repositories/departments.ts` with `listAll(s: OrgScope)` method.

Purpose: SPEC R-4 requires bulk-department assignment with exactly-one row creation (verified by integration test in Plan 05-09). The admin actor for the assignment lives on the existing `/policies/[id]` page (Phase 3 surface) — Phase 5 extends rather than introducing a new admin route.

Output: Four file deltas in admin space; tsc clean; D-13 panel placement + D-14 empty-departments UX + D-15 schema UNIQUE leveraging + D-16 read-only assignment list (no Un-assign) all respected.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@app/(admin)/policies/[id]/actions.ts
@app/(admin)/policies/[id]/page.tsx
@components/admin/ConsistencyCheckRunner.tsx
@components/policy/PolicyTransitionMenu.tsx
@lib/db/scoped.ts
@lib/db/repositories/policies.ts
@lib/db/repositories/policy_assignments.ts
@lib/db/repositories/departments.ts
@lib/policies/types.ts

<interfaces>
<!-- Wave 2 dependencies — what this plan calls -->

From lib/db/repositories/policy_assignments.ts (post-Plan 05-03 filled body):
```typescript
listForPolicy: (s: OrgScope, policyId: PolicyId) => Promise<{...assignment}[]>;
create: async (s: OrgScope, input: { policyId: PolicyId; assigneeType: 'user' | 'department'; assigneeId: string; assignedBy?: string | null }) => Promise<{...row}[]>;  // length 0 on conflict per D-15 silent-success
```

From lib/db/repositories/departments.ts (this plan extends):
```typescript
listAll: (s: OrgScope) => Promise<{ id: string; orgId: string; name: string }[]>;  // NEW Phase 5
```

From app/(admin)/policies/[id]/page.tsx (Phase 3 existing — D-13 dictates new panel placement AFTER PolicyTransitionMenu):
Current order: header → PolicyView/EditPolicyForm → PolicyTransitionMenu → (NEW PolicyAssignmentsPanel)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend lib/db/repositories/departments.ts with listAll() + extend app/(admin)/policies/[id]/actions.ts with bulkAssignToDepartmentAction</name>
  <files>lib/db/repositories/departments.ts, app/(admin)/policies/[id]/actions.ts</files>
  <read_first>
    - lib/db/repositories/departments.ts (whole file — likely a Phase 2 skeleton; preserve all existing methods; add listAll if not present)
    - lib/db/repositories/policy_assignments.ts (post-Plan 05-03 — for the .create signature this Server Action calls)
    - app/(admin)/policies/[id]/actions.ts (whole file — existing 6+ transition actions; same file gains 1 new action; preserve all existing imports + helpers)
    - lib/policies/types.ts (PolicyIdSchema for Zod boundary)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Admin Bulk-Assignment UI (D-13..D-17 — especially D-15 ON CONFLICT silent + D-16 no Un-assign)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`app/(admin)/policies/[id]/actions.ts` (modify - add bulkAssignToDepartmentAction)"
  </read_first>
  <action>
**Sub-task 1a: Extend `lib/db/repositories/departments.ts` with `listAll`.**

Verify whether `listAll` already exists (Phase 2 skeleton may have stubbed it). If absent, add:
```typescript
listAll: (s: OrgScope) =>
  s.tx
    .select()
    .from(departments)
    .where(eq(departments.orgId, s.orgId))
    .orderBy(asc(departments.name)),
```
(Import `asc` from drizzle-orm if not already; mirror `PolicyAssignments.listAll` shape at policy_assignments.ts:17-21.)

PRESERVE any existing methods on `Departments` object. Keep `'server-only'` directive.

**Sub-task 1b: Add `bulkAssignToDepartmentAction` to `app/(admin)/policies/[id]/actions.ts`.**

Add imports (if not already present):
- `PolicyAssignments` from `@/lib/db/repositories/policy_assignments`

Add the new action AT THE END of the file (after all existing transition actions; before any default export if present). DO NOT modify existing actions.

Comment block above the new action:
```typescript
// ─── Phase 5 D-13..D-15 — admin bulk-assignment action ────────────────────
// Inline panel on /policies/[id] (per D-13) submits this action.
// D-15 — UNIQUE(policy_id, assignee_type, assignee_id) from migration 0010
// fires on duplicate; PolicyAssignments.create returns empty array silently;
// this action treats as success (admin double-click safe).
// D-16 — NO un-assign action in Phase 5 (read-only assignment list in panel).
```

Zod schema (department UUID is NOT branded per ADR-028 slippery-slope policy — Departments are pre-paying-customer scope; UserId/OrgId branding deferred):
```typescript
const BulkAssignSchema = z.object({
  policyId: PolicyIdSchema,
  departmentId: z.string().uuid(),
});
```

Action body:
```typescript
export async function bulkAssignToDepartmentAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = BulkAssignSchema.safeParse({
    policyId: formData.get('policyId'),
    departmentId: formData.get('departmentId'),
  });
  if (!parsed.success) return INVALID_PAYLOAD;

  try {
    const ctx = await getOrgContext();
    await withOrgScope(ctx, async (s) => {
      await PolicyAssignments.create(s, {
        policyId: parsed.data.policyId,
        assigneeType: 'department',
        assigneeId: parsed.data.departmentId,
        assignedBy: s.userId,
      });
      // D-15 — empty RETURNING on conflict is silent success; admin double-click safe.
      // The UNIQUE constraint blocks duplicate (policy_id, 'department', department_id) rows.
    });
  } catch (err) {
    // Phase 3 transition actions use handleTransitionError for IllegalTransitionError.
    // bulk-assign doesn't throw IllegalTransitionError; any other error is unexpected.
    if (err instanceof Error) {
      console.error('[bulkAssignToDepartmentAction] unexpected error', { message: err.message });
    }
    return { ok: false, error: 'Failed to assign policy. Please try again.' };
  }

  // D-09 — revalidatePath outside try/catch.
  // Refresh both the policy detail page (so PolicyAssignmentsPanel shows the new row)
  // and the dashboard (so the new assignee sees the policy in their /my-policies).
  revalidatePath(`/policies/${parsed.data.policyId}`);
  revalidatePath('/my-policies');  // re-render employee dashboards
  return { ok: true };
}
```

(Use the same `ActionState` and `INVALID_PAYLOAD` types from the existing file; they're already defined by Phase 3.)

DO NOT add an Un-assign action (D-16 OUT OF SCOPE). DO NOT add a single-user assignment action (D-16 / deferred per CONTEXT `<deferred>`). DO NOT call `handleTransitionError` for this action (different error semantics — no IllegalTransitionError path).

PRESERVE all existing Phase 3 / Phase 4 transition actions verbatim.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "listAll" lib/db/repositories/departments.ts && grep -c "bulkAssignToDepartmentAction" app/\\(admin\\)/policies/\\[id\\]/actions.ts && grep -c "assigneeType: 'department'" app/\\(admin\\)/policies/\\[id\\]/actions.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `grep -c "listAll" lib/db/repositories/departments.ts` returns at least 1 (the method exists)
    - `grep -c "export async function bulkAssignToDepartmentAction" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 1
    - `grep -c "assigneeType: 'department'" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 1 (D-15 dept-only Phase 5 scope)
    - `grep -c "PolicyAssignments.create" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 1
    - `grep -c "revalidatePath(\`/policies/" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns at least 1 (panel refresh)
    - `grep -c "revalidatePath('/my-policies')" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 1 (employee dashboard refresh)
    - File still contains all existing transition actions (`grep -cE "export async function (publishAction|archiveAction|restoreAction|editPublishedAction|approveAction|rejectAction|submitForReviewAction)" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 7 — Phase 3 D-09 7 actions all preserved)
    - File does NOT contain a `bulkUnassignAction` or `unassignDepartmentAction` (`grep -cE "(un|Un)assign" app/\\(admin\\)/policies/\\[id\\]/actions.ts` returns 0 — D-16)
  </acceptance_criteria>
  <done>
    Departments repository exposes listAll; bulkAssignToDepartmentAction added to admin actions file; tsc clean; ADR-029 Phase 3 actions all preserved.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create components/admin/PolicyAssignmentsPanel.tsx (RSC + embedded Client form) + edit app/(admin)/policies/[id]/page.tsx to render it at bottom per D-13</name>
  <files>components/admin/PolicyAssignmentsPanel.tsx, app/(admin)/policies/[id]/page.tsx</files>
  <read_first>
    - app/(admin)/policies/[id]/page.tsx (whole file — observe current page order; PolicyTransitionMenu is the existing bottom element)
    - components/admin/ConsistencyCheckRunner.tsx (whole file — closest Client Component shape with state + form submission via Server Action; mirror its 'use client' header + state pattern)
    - components/policy/PolicyTransitionMenu.tsx (whole file — for reference; the new panel renders below this)
    - lib/db/repositories/policy_assignments.ts (post-Plan 05-03 — listForPolicy signature)
    - lib/db/repositories/departments.ts (just-extended — listAll signature)
    - app/(admin)/policies/[id]/actions.ts (just-extended — bulkAssignToDepartmentAction signature)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Admin Bulk-Assignment UI (D-13..D-17 — especially D-14 empty-dept disabled-button + tooltip + D-16 read-only list)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`components/admin/PolicyAssignmentsPanel.tsx`"
  </read_first>
  <action>
**Sub-task 2a: Create `components/admin/PolicyAssignmentsPanel.tsx` (Server Component shell + Client form child).**

Single file with two components — outer RSC reads from DB, inner Client child handles the form. Decision: two-component-in-one-file pattern is acceptable; alternatively split into `PolicyAssignmentsPanel.tsx` + `PolicyAssignmentsPanelForm.tsx`. Operator discretion. Stick with single file unless tsc complains about Client/Server mixing.

File-header comment: "components/admin/PolicyAssignmentsPanel.tsx — Plan 05-06 Task 2a. D-13 inline panel at bottom of /policies/[id]. Server Component reads PolicyAssignments.listForPolicy + Departments.listAll inside withOrgScope; Client child renders the dept-selector form using React 19 useActionState wrapping bulkAssignToDepartmentAction. D-14 empty-departments UX: dept selector + button DISABLED + tooltip 'Create a department first' when 0 depts. D-16: read-only assignment list (no Un-assign)."

Imports for RSC shell:
- `withOrgScope` from `@/lib/db/scoped`
- `getOrgContext` from `@/lib/auth/context`
- `PolicyAssignments` from `@/lib/db/repositories/policy_assignments`
- `Departments` from `@/lib/db/repositories/departments`
- `Card, CardHeader, CardTitle, CardContent, CardDescription` from `@/components/ui/card`
- `type PolicyId` from `@/lib/policies/types`

Server Component (default export):
```typescript
import type { PolicyId } from '@/lib/policies/types';
import { withOrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { PolicyAssignments } from '@/lib/db/repositories/policy_assignments';
import { Departments } from '@/lib/db/repositories/departments';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { PolicyAssignmentsPanelForm } from './PolicyAssignmentsPanelForm';  // OR inline if single-file

export async function PolicyAssignmentsPanel({ policyId }: { policyId: PolicyId }) {
  const ctx = await getOrgContext();
  const [assignments, depts] = await withOrgScope(ctx, async (s) => {
    return Promise.all([
      PolicyAssignments.listForPolicy(s, policyId),
      Departments.listAll(s),
    ]);
  });

  // Build a deptId → name map for read-only list rendering of dept assignments.
  const deptNameById = new Map(depts.map((d) => [d.id, d.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignments</CardTitle>
        <CardDescription>Departments assigned to this policy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {assignments.map((a) => (
              <li key={a.id}>
                {a.assigneeType === 'department'
                  ? `Department: ${deptNameById.get(a.assigneeId) ?? 'Unknown'}`
                  : `User: ${a.assigneeId}`}
              </li>
            ))}
          </ul>
        )}
        <PolicyAssignmentsPanelForm policyId={policyId} departments={depts} />
      </CardContent>
    </Card>
  );
}
```

**Sub-task 2b: Client child component (same file OR new file).**

Recommended: split into a new file `components/admin/PolicyAssignmentsPanelForm.tsx` (cleaner; avoids RSC+Client mixing surprises).

```typescript
'use client';
import { useActionState, useState } from 'react';
import { bulkAssignToDepartmentAction } from '@/app/(admin)/policies/[id]/actions';
import type { ActionState } from '@/app/(admin)/policies/[id]/actions';  // import the existing type
import { Button } from '@/components/ui/button';

export function PolicyAssignmentsPanelForm({
  policyId,
  departments,
}: {
  policyId: string;
  departments: { id: string; name: string }[];
}) {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [state, formAction, isPending] = useActionState<ActionState | undefined, FormData>(
    bulkAssignToDepartmentAction,
    undefined,
  );

  const isEmpty = departments.length === 0;

  if (isEmpty) {
    // D-14 — empty-departments UX: disabled button + tooltip
    return (
      <div className="space-y-2">
        <select disabled className="w-full rounded-md border p-2 text-sm opacity-50">
          <option>No departments available</option>
        </select>
        <Button type="button" disabled title="Create a department first">
          Assign to department
        </Button>
        <p className="text-xs text-muted-foreground">Create a department first.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="policyId" value={policyId} />
      <select
        name="departmentId"
        value={selectedDeptId}
        onChange={(e) => setSelectedDeptId(e.target.value)}
        required
        className="w-full rounded-md border p-2 text-sm"
      >
        <option value="">Select a department…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <Button type="submit" disabled={isPending || !selectedDeptId}>
        {isPending ? 'Assigning…' : 'Assign to department'}
      </Button>
      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm text-green-700">✓ Assigned.</p>
      )}
    </form>
  );
}
```

NO Un-assign button per D-16. The empty-state tooltip uses `title=` HTML attribute (native browser tooltip) rather than shadcn Tooltip — Phase 5 deliberately keeps the panel minimal.

**Sub-task 2c: Edit `app/(admin)/policies/[id]/page.tsx` to render PolicyAssignmentsPanel at the BOTTOM per D-13.**

The Phase 3 page renders (in order): page header → PolicyView (or EditPolicyForm in edit mode) → PolicyTransitionMenu → PolicyVersionHistory (if present).

D-13 dictates: page order is `PolicyView → PolicyTransitionMenu → PolicyAssignmentsPanel`. Insert `<PolicyAssignmentsPanel policyId={idParsed.data} />` AFTER PolicyTransitionMenu and BEFORE PolicyVersionHistory (if present), OR at the very bottom of the JSX return tree if no PolicyVersionHistory.

Add import: `import { PolicyAssignmentsPanel } from '@/components/admin/PolicyAssignmentsPanel';`

DO NOT change any existing render order or remove any existing components from the page.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "PolicyAssignmentsPanel" components/admin/PolicyAssignmentsPanel.tsx && grep -c "PolicyAssignmentsPanel" app/\\(admin\\)/policies/\\[id\\]/page.tsx && grep -c "Create a department first" components/admin/PolicyAssignmentsPanelForm.tsx 2>/dev/null || grep -c "Create a department first" components/admin/PolicyAssignmentsPanel.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `components/admin/PolicyAssignmentsPanel.tsx` exists with the Server Component shell
    - Either `components/admin/PolicyAssignmentsPanelForm.tsx` exists OR the Client child is co-located in the same file (`grep -c "'use client'" components/admin/PolicyAssignmentsPanel*.tsx | head -1` returns at least 1)
    - The form child references `bulkAssignToDepartmentAction` from `@/app/(admin)/policies/[id]/actions`
    - `app/(admin)/policies/[id]/page.tsx` contains `<PolicyAssignmentsPanel policyId={...} />` element
    - The PolicyAssignmentsPanel JSX appears AFTER the PolicyTransitionMenu JSX in the file (`awk '/PolicyTransitionMenu/{found=1} found && /PolicyAssignmentsPanel/{print NR":found-after"; exit}' app/\\(admin\\)/policies/\\[id\\]/page.tsx` prints a line — D-13 order)
    - `grep -c "Create a department first" components/admin/PolicyAssignmentsPanel*.tsx | head -1` returns at least 1 (D-14 tooltip copy)
    - No Un-assign button anywhere (`grep -cE "Unassign|Un-assign|unassign" components/admin/PolicyAssignmentsPanel*.tsx` returns 0 — D-16)
    - `grep -c "useActionState" components/admin/PolicyAssignmentsPanel*.tsx | head -1` returns at least 1 (React 19 form pattern)
  </acceptance_criteria>
  <done>
    PolicyAssignmentsPanel renders at the bottom of /policies/[id] per D-13; D-14 empty-departments tooltip present; D-16 read-only assignment list (no Un-assign); tsc clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| FormData (admin) → bulkAssignToDepartmentAction | policyId branded via PolicyIdSchema; departmentId Zod-validated as UUID; rejected at boundary if invalid |
| bulkAssignToDepartmentAction → DB | `withOrgScope` opens tx with SET LOCAL ROLE authenticated + JWT claims; RLS predicate ensures cross-org assignment via spoofed deptId is blocked (composite FK on users(org_id, department_id) also blocks any user with that dept from being cross-org) |
| RSC PolicyAssignmentsPanel → withOrgScope reads | Both listForPolicy + listAll inside ONE withOrgScope closure for atomic snapshot of panel state |
| Client form selector dropdown | departments list source is the RSC-resolved list from same org (RLS-scoped); user cannot type a foreign deptId because the `<select>` is server-controlled |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-06-01 | Tampering | Admin double-click on Assign button creating 2 rows | mitigate | D-15 schema UNIQUE(policy_id, assignee_type, assignee_id) from migration 0010 fires; PolicyAssignments.create returns empty RETURNING on conflict; Server Action treats as silent success ({ok: true}). UI shows "✓ Assigned" both times. |
| T-05-06-02 | Tampering | Forged departmentId pointing at another org's dept | mitigate | Zod validates UUID format; composite FK on users(org_id, department_id) blocks cross-org assignment at FK time; RLS on departments blocks the read so the panel's listAll never returns foreign depts; the `<select>` is server-built from RLS-scoped list — admin cannot pick a foreign deptId via UI. Programmatic POST with foreign UUID would either FK-fail (if no users match) or RLS-deny the create. |
| T-05-06-03 | Information Disclosure | Admin sees dept names from another org via PolicyAssignmentsPanel | mitigate | listAll runs inside withOrgScope with `eq(departments.orgId, s.orgId)` predicate (ADR-019). RLS would also catch. Cross-org test in Plan 05-09 integration exercise. |
| T-05-06-04 | Repudiation | bulk-assign creates row but no audit trail beyond policy_assignments.assignedBy | accept | policy_assignments.assignedBy + assignedAt columns are the audit trail; Phase 8 reporting will surface admin actor names. No additional audit-event emission in MVP. |
| T-05-06-05 | Tampering | bulkAssign succeeds but employee dashboard doesn't refresh | mitigate | revalidatePath('/my-policies') in action body — Next.js cache invalidation triggers re-render on next employee navigation. The brief race window where employee already loaded /my-policies pre-assign would show stale; full SSE/websocket push deferred. |
| T-05-06-06 | Denial of Service | Admin spams Assign with same dept | accept | UNIQUE constraint + ON CONFLICT DO NOTHING means INSERT is one-row max per assignee-tuple; trivial cost; no DoS vector. |
| T-05-06-SC | Tampering | npm installs | accept | No new packages (panel uses native `<select>` rather than shadcn Select). |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0 across all 4 files
- `pnpm verify:phase-4` still exits 0 (all Phase 3 admin actions + Phase 4 AI components preserved)
- Manual smoke (Plan 05-10 operator UAT scope): admin signs in → visits /policies/{seeded-id} → sees PolicyAssignmentsPanel at bottom of page → selects a dept → clicks Assign → sees "✓ Assigned" → refreshes → sees the assignment in the read-only list.
</verification>

<success_criteria>
- `Departments.listAll(s)` repository method exists and is RLS-scoped via `eq(orgId, s.orgId)`
- `bulkAssignToDepartmentAction` exported from `app/(admin)/policies/[id]/actions.ts` with the full Zod + try/catch + revalidatePath shape per Phase 3 D-09
- `PolicyAssignmentsPanel` Server Component renders at bottom of `/policies/[id]` page per D-13
- D-14 empty-departments UX (disabled button + tooltip "Create a department first") implemented
- D-16 no Un-assign UI (read-only assignment list only)
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-06-SUMMARY.md` when done — document the panel placement decision (single file vs two files), the disabled-button tooltip implementation (`title=` attr vs shadcn Tooltip), and confirm no Phase 3 admin action signatures were modified.
</output>
