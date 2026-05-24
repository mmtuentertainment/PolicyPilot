"use client";
// components/employee/AskQuestionForm.tsx — Plan 05-05 Task 3c.
//
// Client form posting to askQuestionAction via React 19 useActionState.
// Renders answer + clickable citation Links per R-6 acceptance + D-27a
// accessibility italic-hint for tldr-only citations.
//
// D-27a — citation accessibility flag:
//   - 'full'      → plain underlined Link (user is policy-assigned;
//                   clicking lands on Branch A of /my-policies/[id])
//   - 'tldr-only' → italic + muted underline Link (user only has grant;
//                   clicking lands on Branch B TL;DR-only view)
// The accessibility flag is a UI hint ONLY — the real security boundary
// is enforced server-side at /my-policies/[id]/page.tsx (Plan 05-05 Task
// 1c). Even if a tampered citations array somehow flipped the flag, the
// page handler's `assigned → grant → 404` chain would still gate access.
//
// RESEARCH Pitfall 5 not applicable here — askQuestionAction does NOT
// call revalidatePath (Q&A doesn't mutate library state). The isPending
// flag is safe to observe for the "Asking…" button label.
//
// Length cap on textarea matches the Server Action's Zod max(2000) —
// double-defense; client cap is UX hint, server cap is security boundary.
import { useActionState } from "react";
import Link from "next/link";
import {
  askQuestionAction,
  type AskActionState,
} from "@/app/(employee)/my-policies/ask/actions";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";

const initialState: AskActionState | undefined = undefined;

export function AskQuestionForm(): React.JSX.Element {
  const [state, formAction, isPending] = useActionState<
    AskActionState | undefined,
    FormData
  >(askQuestionAction, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <Textarea
          name="question"
          placeholder="Ask a question about your company's policies…"
          required
          minLength={1}
          maxLength={2000}
          rows={4}
        />
        <button
          type="submit"
          disabled={isPending}
          className={buttonVariants({ variant: "default" })}
        >
          {isPending ? "Asking…" : "Ask"}
        </button>
      </form>

      {state && !state.ok && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-900">{state.error}</p>
          </CardContent>
        </Card>
      )}

      {state?.ok && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <p className="whitespace-pre-wrap text-sm">{state.answer}</p>
            </CardContent>
          </Card>
          {state.citations.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Sources</h2>
              <ul className="space-y-1 text-sm">
                {state.citations.map((cit) => (
                  <li key={cit.id}>
                    <Link
                      href={`/my-policies/${cit.id}`}
                      className={
                        cit.accessibility === "tldr-only"
                          ? "italic underline text-muted-foreground"
                          : "underline"
                      }
                    >
                      {cit.title}
                    </Link>
                    {cit.accessibility === "tldr-only" && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (summary only)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
