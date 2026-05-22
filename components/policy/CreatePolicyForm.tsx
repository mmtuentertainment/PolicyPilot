"use client";

// CreatePolicyForm — Plan 03-11 Task 3.
//
// Client Component wrapper around the create-policy form. Hosts
// useActionState so per-field validation errors (returned by Plan 03-07's
// createPolicyAction Zod safeParse) render inline as `text-destructive`
// copy under the offending input.
//
// On success the Server Action calls redirect(`/policies/${id}`) — Next's
// NEXT_REDIRECT propagates through useActionState; no client-side
// navigation needed.
//
// Form fields map 1:1 to Plan 03-07's CreatePolicySchema:
//   - title       → required, 1..200 chars
//   - category    → required, enum
//   - content_json → emitted by PolicyEditor as a stringified JSONContent
//
// TL;DR field is read-only / disabled — Phase 3 stub; AI summary lands in
// Phase 4 (REQ-ai-features). The disabled textarea is intentional: it
// communicates the upcoming field shape without accepting user input that
// would be ignored.

import { useActionState, useRef } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
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
import { PolicyAiDraftDialog } from "@/components/policy/PolicyAiDraftDialog";
import {
  createPolicyAction,
  type CreatePolicyState,
} from "@/app/(admin)/policies/new/actions";
// Phase 4 Plan 04-12 (BLOCKER-2 cleanup) — POLICY_CATEGORIES is the single
// shared source of truth in lib/policies/categories.ts. The previous local
// CATEGORIES const here was a duplicate of the same 8-entry list that
// actions.ts (Server Action) and lib/ai/schemas.ts (DraftSchema z.enum) both
// consume; replacing it with the shared import means adding/removing a
// category in one place ripples through all consumers via tsc.
import { POLICY_CATEGORIES } from "@/lib/policies/categories";

export function CreatePolicyForm() {
  const [state, formAction] = useActionState<
    CreatePolicyState | undefined,
    FormData
  >(createPolicyAction, undefined);

  // Phase 4 Plan 04-12 — editor ref captured via PolicyEditor's new onMount
  // callback. The sibling PolicyAiDraftDialog calls its onDraftReady(raw)
  // callback with the response.draftContent STRING from /api/ai/draft, and
  // this form pipes it into the editor via editor.commands.setContent(raw).
  // D-28 + AC-23: setContent(string), NEVER JSON.parse — the Draft response
  // is narrative prose (PROMPTS.md:8-21), not ProseMirror JSON.
  const editorRef = useRef<Editor | null>(null);

  const fieldErrors =
    state && !state.ok && "fieldErrors" in state ? state.fieldErrors : undefined;
  const formError =
    state && !state.ok && "error" in state ? state.error : undefined;

  return (
    <form action={formAction} className="space-y-4 max-w-3xl">
      <div>
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          maxLength={200}
          placeholder="Policy title (e.g., Remote Work Policy)"
          aria-describedby={fieldErrors?.title ? "title-err" : undefined}
          aria-invalid={!!fieldErrors?.title}
        />
        {fieldErrors?.title ? (
          <p id="title-err" className="text-sm text-destructive mt-1">
            {fieldErrors.title.join(", ")}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select name="category" required>
          <SelectTrigger id="category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {POLICY_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldErrors?.category ? (
          <p className="text-sm text-destructive mt-1">
            {fieldErrors.category.join(", ")}
          </p>
        ) : null}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Content</Label>
          {/*
            Phase 4 D-22 + AC-23 — PolicyAiDraftDialog is a SIBLING of
            PolicyEditor (NOT inside it; PATTERNS Pattern I). On Draft 200,
            the dialog hands the RAW STRING here; we route it through TipTap's
            setContent which accepts HTML/markdown/string — D-28 forbids
            JSON.parse on the response (Draft is prose, not ProseMirror JSON).
          */}
          <PolicyAiDraftDialog
            onDraftReady={(rawContent) => {
              editorRef.current?.commands.setContent(rawContent);
            }}
          />
        </div>
        <PolicyEditor
          name="content_json"
          onMount={(editor) => {
            editorRef.current = editor;
          }}
        />
        {fieldErrors?.content_json ? (
          <p className="text-sm text-destructive mt-1">
            {fieldErrors.content_json.join(", ")}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor="tldr">TL;DR (auto-generated)</Label>
        <Textarea
          id="tldr"
          readOnly
          disabled
          placeholder="TL;DR will be auto-generated by AI on publish (Phase 4)"
        />
      </div>

      {formError ? (
        <p className="text-sm text-destructive">{formError}</p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-4">
        <Link
          href="/policies"
          className={buttonVariants({ variant: "outline" })}
        >
          Cancel
        </Link>
        <button
          type="submit"
          className={buttonVariants({ variant: "default" })}
        >
          Save draft
        </button>
      </div>
    </form>
  );
}
