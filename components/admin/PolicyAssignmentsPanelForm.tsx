'use client';
// components/admin/PolicyAssignmentsPanelForm.tsx — Plan 05-06 Task 2b.
//
// Client child of PolicyAssignmentsPanel (Server Component shell). React
// 19 `useActionState` wraps bulkAssignToDepartmentAction; the form
// posts policyId + selected departmentId.
//
// D-14 — empty-departments UX: when `departments.length === 0`, the
// selector and Assign button are DISABLED and a `title="Create a
// department first"` HTML attribute renders the native browser tooltip.
// Native tooltip chosen over shadcn Tooltip per plan D-14 — Phase 5
// deliberately keeps the panel minimal, and the empty-state copy also
// appears as a plain `<p>` below the button as a fallback for users
// whose browsers don't surface the `title=` tooltip on hover (mobile,
// some screen-reader configs).
//
// D-16 — assignment removal is OUT OF SCOPE for Phase 5. The form
// only writes; the read-only assignment list lives in the parent
// Server Component. Workaround for misassign per D-16: edit-policy +
// re-publish forces re-ack on the new version (existing Phase 3 flow).
//
// Pattern mirror: AcknowledgeButton (components/employee/) uses the
// same useActionState + buttonVariants pattern and the same
// formState-over-isPending success rendering per RESEARCH Pitfall 5
// (Next.js #82289 — isPending can stick after revalidatePath inside
// the action).
import { useActionState, useState } from 'react';
import {
  bulkAssignToDepartmentAction,
  type ActionState,
} from '@/app/(admin)/policies/[id]/actions';
import { buttonVariants } from '@/components/ui/button';

const initialState: ActionState | undefined = undefined;

export function PolicyAssignmentsPanelForm({
  policyId,
  departments,
}: {
  policyId: string;
  departments: { id: string; name: string }[];
}): React.JSX.Element {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [state, formAction, isPending] = useActionState<
    ActionState | undefined,
    FormData
  >(bulkAssignToDepartmentAction, initialState);

  const isEmpty = departments.length === 0;

  if (isEmpty) {
    // D-14 — empty-departments UX: disabled selector + disabled button
    // + native browser tooltip via `title=` + fallback copy below.
    // Per D-17 the Departments.create body + admin dept-create UI are
    // Phase 5 KNOWN LIMITATION; operator seeds first department via DB
    // out-of-band during dev. Phase 6+ admin user management is the
    // natural home for the dept-create UI.
    return (
      <div className="space-y-2">
        <select
          disabled
          className="w-full rounded-md border p-2 text-sm opacity-50"
          aria-label="No departments available"
        >
          <option>No departments available</option>
        </select>
        <button
          type="button"
          disabled
          title="Create a department first"
          className={buttonVariants({ variant: 'default' })}
        >
          Assign to department
        </button>
        <p className="text-xs text-muted-foreground">
          Create a department first.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="policyId" value={policyId} />
      <label className="block text-xs font-medium text-muted-foreground">
        Assign to department
      </label>
      <select
        name="departmentId"
        value={selectedDeptId}
        onChange={(e) => setSelectedDeptId(e.target.value)}
        required
        className="w-full rounded-md border p-2 text-sm"
      >
        <option value="">Select a department…</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending || !selectedDeptId}
        className={buttonVariants({ variant: 'default' })}
      >
        {isPending ? 'Assigning…' : 'Assign to department'}
      </button>
      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-sm text-green-700">✓ Assigned.</p>
      )}
    </form>
  );
}
