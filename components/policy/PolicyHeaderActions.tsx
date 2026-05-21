"use client";

// PolicyHeaderActions — Plan 03-11 Task 4 (B2 closure).
//
// Tiny Client Component wrapper around PolicyTransitionMenu that hosts
// `useRouter` and forwards the `onEditPublished` callback. The edit page
// (`app/(admin)/policies/[id]/page.tsx`) is a Server Component and cannot
// own a router; this wrapper bridges the two.
//
// The state-machine in lib/policies/state-machine.ts allows
// published → draft as a legal transition, but the Phase 3 UI treats it
// as "Edit policy" — not a status flip. When the user confirms the
// transition dialog with published as the current status, the menu
// invokes onEditPublished() instead of calling editPublishedAction with
// stale content. onEditPublished navigates the user to
// `/policies/[id]?edit=1` where EditPolicyForm flips the editor into
// editable mode and the change-summary textarea appears. Save changes
// then submits editPublishedAction with the NEW content (SC #3 closure).
//
// All other transition actions are forwarded as-is: submitForReview,
// approve, reject, publish, archive, restore.

import { useRouter } from "next/navigation";
import {
  PolicyTransitionMenu,
  type TransitionActions,
} from "@/components/policy/PolicyTransitionMenu";
import {
  submitForReviewAction,
  approveAction,
  rejectAction,
  publishAction,
  archiveAction,
  restoreAction,
  editPublishedAction,
} from "@/app/(admin)/policies/[id]/actions";
import type { PolicyStatus } from "@/lib/policies/state-machine";

export function PolicyHeaderActions({
  policyId,
  currentStatus,
}: {
  policyId: string;
  currentStatus: PolicyStatus;
}) {
  const router = useRouter();

  const actions: TransitionActions = {
    submitForReviewAction,
    approveAction,
    rejectAction,
    publishAction,
    archiveAction,
    restoreAction,
    editPublishedAction,
  };

  return (
    <PolicyTransitionMenu
      policyId={policyId}
      currentStatus={currentStatus}
      actions={actions}
      onEditPublished={() => router.push(`/policies/${policyId}?edit=1`)}
    />
  );
}
