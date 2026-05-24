"use client";
// components/employee/AcknowledgeButton.tsx — Plan 05-05 Task 2b.
//
// Client wrapper around acknowledgePolicyAction using React 19
// `useActionState`. Renders based on D-11 ackState branches:
//   - 'none'   → "Acknowledge" button
//   - 'stale'  → "Re-acknowledge" button (AckStatusBadge in sibling
//                renders the amber "Requires re-acknowledgment" badge)
//
// The parent page (app/(employee)/my-policies/[id]/page.tsx) gates this
// component's render via `assignedRow.ackState !== 'current'`, so the
// 'current' branch is intentionally not represented in this component's
// ackState union — TypeScript narrows the prop to the two button-rendering
// branches only.
//
// RESEARCH Pitfall 5 — render from formState, not isPending (which can
// stick after revalidatePath under Next.js #82289). Successful submission
// sets state.ok === true and state.ackedAt — UI shows "Acknowledged on
// {date}" inline rather than observing the in-flight transition.
//
// Discretion note (per 05-CONTEXT.md <decisions> "Claude's Discretion"):
// components/employee/ (NEW directory) chosen over components/policy/.
// Rationale: keeps the policy/ namespace for shared admin+employee
// components (PolicyView, AckStatusBadge, PolicyStatusBadge) while
// components/employee/ holds employee-only Client Components. Operator may
// reorganize later — this is a layout discretion, not a contract.
import { useActionState } from "react";
import {
  acknowledgePolicyAction,
  type AcknowledgeActionState,
} from "@/app/(employee)/my-policies/[id]/actions";
import { buttonVariants } from "@/components/ui/button";

const initialState: AcknowledgeActionState | undefined = undefined;

export function AcknowledgeButton({
  policyId,
  ackState,
}: {
  policyId: string;
  ackState: "none" | "stale";
}): React.JSX.Element {
  const [state, formAction, isPending] = useActionState<
    AcknowledgeActionState | undefined,
    FormData
  >(acknowledgePolicyAction, initialState);

  const buttonLabel = ackState === "stale" ? "Re-acknowledge" : "Acknowledge";

  // RESEARCH Pitfall 5 — render success from formState (state.ackedAt),
  // not from isPending (Next.js #82289 leaves isPending stuck after
  // revalidatePath inside the action).
  if (state?.ok) {
    return (
      <p className="text-sm text-green-700">
        ✓ Acknowledged on{" "}
        {new Date(state.ackedAt).toLocaleDateString("en-US")}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="policyId" value={policyId} />
      <button
        type="submit"
        disabled={isPending}
        className={buttonVariants({ variant: "default" })}
      >
        {isPending ? "Submitting…" : buttonLabel}
      </button>
      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
