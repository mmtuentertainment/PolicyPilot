"use client";

// EditPolicyForm — Plan 03-11 Task 4.
//
// Client Component that hosts the editor + form bindings for the edit
// page. Two modes:
//
//   updateDraft (default): when status is draft, the editor is editable
//     and Save submits updateDraftAction. NOT a state-machine transition —
//     just an in-place content edit (Plan 03-07 / D-04).
//
//   editPublished (editPublishedMode=true): when status='published' AND
//     the page received `?edit=1` from PolicyTransitionMenu → PolicyHeader-
//     Actions, the editor flips editable + a change-summary textarea
//     renders. Save submits editPublishedAction which (Plan 03-06):
//       1) snapshots the current published content into policy_versions,
//       2) overwrites policies.contentJson with the new content,
//       3) resets policies.status = 'draft',
//       4) bumps policies.currentVersion.
//     This is the SC #3 (ROADMAP) closure.
//
// For under_review / archived (and published without ?edit=1), the editor
// renders read-only and no Save button appears.

import { useActionState, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { PolicyEditor } from "@/components/policy/PolicyEditor";
import {
  updateDraftAction,
  editPublishedAction,
  type ActionState,
} from "@/app/(admin)/policies/[id]/actions";
import type { PolicyStatus } from "@/lib/policies/state-machine";

const CATEGORIES = [
  "HR",
  "Safety",
  "IT",
  "Finance",
  "Operations",
  "Compliance",
  "Legal",
  "Other",
] as const;

export function EditPolicyForm({
  policyId,
  initialTitle,
  initialCategory,
  initialContent,
  status,
  editPublishedMode = false,
}: {
  policyId: string;
  initialTitle: string;
  initialCategory: string;
  initialContent: unknown;
  status: PolicyStatus;
  editPublishedMode?: boolean;
}) {
  const action = editPublishedMode ? editPublishedAction : updateDraftAction;
  const [state, formAction] = useActionState<
    ActionState | undefined,
    FormData
  >(action, undefined);
  const [changeSummary, setChangeSummary] = useState("");

  // Editor is editable only in: (a) draft status normally, (b) editPublished
  // mode. Other statuses render read-only.
  const isReadOnly =
    !editPublishedMode &&
    (status === "under_review" ||
      status === "published" ||
      status === "archived");
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="space-y-4 max-w-3xl">
      <input type="hidden" name="policyId" value={policyId} />
      {editPublishedMode ? (
        <input type="hidden" name="changeSummary" value={changeSummary} />
      ) : null}

      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={initialTitle}
          maxLength={200}
          disabled={isReadOnly}
        />
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select
          name="category"
          defaultValue={initialCategory}
          disabled={isReadOnly}
        >
          <SelectTrigger id="category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Content</Label>
        <PolicyEditor
          name="content_json"
          initialContent={initialContent as never}
          readOnly={isReadOnly}
        />
      </div>

      {editPublishedMode ? (
        <div>
          <Label htmlFor="summary">Change summary (optional)</Label>
          <Textarea
            id="summary"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            maxLength={200}
            placeholder="Optional: describe what changed"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {state?.ok ? <p className="text-sm text-green-700">Saved.</p> : null}

      {!isReadOnly ? (
        <div className="flex items-center justify-end gap-2 pt-4">
          <button
            type="submit"
            className={buttonVariants({ variant: "default" })}
          >
            {editPublishedMode ? "Save changes" : "Save draft"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
