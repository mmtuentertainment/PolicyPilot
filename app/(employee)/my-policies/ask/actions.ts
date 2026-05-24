"use server";
// app/(employee)/my-policies/ask/actions.ts — Plan 05-05 Task 3a.
//
// R-6 askQuestionAction Server Action wrapping lib/ai/qa.ts::askQuestion.
// React 19 useActionState Client form (AskQuestionForm) posts here.
//
// askQuestion (Plan 05-04 D-25) owns ALL Phase 4 invariants:
//   - D-41 — same-closure validIds defense (SP-1 cross-org-citation-leak)
//   - D-33c — LONG_CACHE first, EPHEMERAL second system-array ordering
//   - D-36 — PII-safe Anthropic error log
//   - D-40 — cache cold-miss observability
//   - WARNING-4 — raw rawText stored in ai_generations
//   - D-26 — grant UPSERT loop iterates post-validIds-filter citations
//   - D-27a — accessibility flag annotation
// This Server Action contributes ONLY: auth + Zod input cap + error
// mapping. Anthropic.APIError → semantic 503-equivalent error string for
// inline display (mirrors HTTP route /api/ai/qa response envelope).
//
// Zod max(2000) char cap matches Phase 4 D-42 .strict() convention; 2000
// chars is generous for any reasonable Q&A — limits attack surface for
// T-05-05-07 (Q&A injection via crafted question).
//
// NO revalidatePath — Q&A doesn't mutate the policy library state. The
// useActionState formState carries the answer + citations for inline
// render in the Client form.
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getOrgContext } from "@/lib/auth/context";
import { askQuestion } from "@/lib/ai/qa";

export type AskActionState =
  | {
      ok: true;
      answer: string;
      citations: {
        title: string;
        id: string;
        accessibility: "full" | "tldr-only";
      }[];
    }
  | { ok: false; error: string };

// Length cap per Phase 4 D-42 .strict() convention; 2000 chars is generous
// for any reasonable Q&A. T-05-05-07 attack-surface limit.
const Schema = z.object({ question: z.string().min(1).max(2000) });
const INVALID_PAYLOAD: AskActionState = {
  ok: false,
  error: "Invalid action payload.",
};

export async function askQuestionAction(
  _prev: AskActionState | undefined,
  formData: FormData,
): Promise<AskActionState> {
  const parsed = Schema.safeParse({ question: formData.get("question") });
  if (!parsed.success) return INVALID_PAYLOAD;
  try {
    const ctx = await getOrgContext();
    const result = await askQuestion(ctx, parsed.data.question);
    return {
      ok: true,
      answer: result.answer,
      citations: result.citations,
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Match the HTTP route's 503 envelope semantically (UI-level).
      // HTTP route returns { error: 'ai_service_unavailable', retryAfter: 30 }
      // with status 503 + Retry-After header; the Server Action surface is
      // inline-render, so we surface the same intent as a UI error string.
      return {
        ok: false,
        error: "AI service temporarily unavailable. Please try again.",
      };
    }
    throw err; // bubble unknown errors to Next.js error boundary
  }
}
