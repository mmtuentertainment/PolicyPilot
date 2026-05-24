"use server";
// app/(employee)/my-policies/[id]/actions.ts — Plan 05-05 Task 2a.
// acknowledgePolicyAction Server Action per Phase 5 D-09 + D-10b + D-10c.
//
// Wraps lib/policies/acknowledgment.ts::recordAcknowledgment. The
// orchestrator owns the transactional business logic; this file is the
// Server Action trust boundary (Zod parse + IP capture + typed-error
// mapping + revalidatePath).
//
// D-05 — IP capture from request:
//   headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
// Vercel strips client-supplied x-forwarded-for at edge; local dev returns
// null. Documented trust boundary; no IPv6 normalization (deferred per
// 05-CONTEXT.md <deferred>).
//
// D-10b — Zod schema z.object({ policyId: PolicyIdSchema }) — the brand
// from ADR-028 applies at the trust boundary; downstream orchestrator
// receives already-branded PolicyId.
//
// D-10c — revalidatePath OUTSIDE try/catch per Phase 3 D-09 +
// Next.js 15 requirement. Next.js 15 throws specially for redirect/
// revalidatePath; catching them breaks the revalidation.
//
// RESEARCH Pitfall 5 — return `ackedAt` in formState so the Client
// AcknowledgeButton doesn't depend on `isPending` from useActionState
// (which stays stuck after revalidatePath under known Next.js issue
// #82289). The Client component renders the success branch from
// state.ackedAt directly, bypassing the isPending observation problem.
//
// Typed-error mapping per D-07/D-08/D-30:
//   - PolicyArchivedError (D-07) → { code: 'POLICY_ARCHIVED' }
//   - PolicyNotAssignedError (D-08) → { code: 'POLICY_NOT_ASSIGNED' }
//   - PolicyNotFoundError → { code: 'POLICY_NOT_FOUND' }
//   - any other error → rethrow (Next.js framework boundary catches)
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getOrgContext } from "@/lib/auth/context";
import { recordAcknowledgment } from "@/lib/policies/acknowledgment";
import { PolicyIdSchema } from "@/lib/policies/types";
import {
  PolicyArchivedError,
  PolicyNotAssignedError,
  PolicyNotFoundError,
} from "@/lib/policies/errors";

export type AcknowledgeActionState =
  | { ok: true; ackedAt: string }
  | {
      ok: false;
      error: string;
      code?: "POLICY_ARCHIVED" | "POLICY_NOT_ASSIGNED" | "POLICY_NOT_FOUND";
    };

const Schema = z.object({ policyId: PolicyIdSchema });
const INVALID_PAYLOAD: AcknowledgeActionState = {
  ok: false,
  error: "Invalid action payload.",
};

export async function acknowledgePolicyAction(
  _prev: AcknowledgeActionState | undefined,
  formData: FormData,
): Promise<AcknowledgeActionState> {
  const parsed = Schema.safeParse({ policyId: formData.get("policyId") });
  if (!parsed.success) return INVALID_PAYLOAD;

  // D-05 — read x-forwarded-for OUTSIDE try (so error path doesn't lose
  // IP for ops logs in Phase 7+ structured logging).
  const ipAddress =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let result: { ackedAt: string };
  try {
    const ctx = await getOrgContext();
    result = await recordAcknowledgment(ctx, parsed.data.policyId, ipAddress);
  } catch (err) {
    if (err instanceof PolicyArchivedError) {
      return {
        ok: false,
        error: "This policy was archived. Refresh to update your list.",
        code: "POLICY_ARCHIVED",
      };
    }
    if (err instanceof PolicyNotAssignedError) {
      return {
        ok: false,
        error: "You are no longer assigned this policy.",
        code: "POLICY_NOT_ASSIGNED",
      };
    }
    if (err instanceof PolicyNotFoundError) {
      return {
        ok: false,
        error: "Policy not found.",
        code: "POLICY_NOT_FOUND",
      };
    }
    throw err; // bubble unknown errors to Next.js error boundary
  }

  // D-10c — revalidatePath OUTSIDE try/catch (Next.js 15 throws specially
  // for these; catching breaks the revalidation).
  revalidatePath("/my-policies");
  revalidatePath(`/my-policies/${parsed.data.policyId}`);
  return { ok: true, ackedAt: result.ackedAt };
}
