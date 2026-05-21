'use server';
// app/(admin)/policies/new/actions.ts — Plan 03-07 (D-09) Task 1.
//
// Server Action that owns the "create new policy" form submission. The
// Phase 3 form-mutation entry point: Zod-validates FormData, opens a
// per-request OrgScope so the INSERT runs inside ADR-025's
// SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ..., true)
// transaction (RLS fires + application-layer where(eq(orgId, ...)) fires),
// then revalidatePath + redirect — redirect intentionally OUTSIDE the
// try/catch per RESEARCH Pitfall 3 (Next.js implements redirect() by
// throwing NEXT_REDIRECT; a surrounding catch would swallow it).
//
// Defense in depth aligns with the orchestrator-wrapper pattern from
// `app/(admin)/policies/[id]/actions.ts` even though this file does NOT
// delegate to lib/policies/transitions.ts — there is no transition for
// "create" (the lifecycle is INSERT-as-draft per Policies.create's own
// invariants in lib/db/repositories/policies.ts).
//
// scripts/check-admin-routes.ts requires every actions.ts under
// app/(admin)/ to contain `withOrgScope(` literally — satisfied below.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';

// UI-SPEC Microcopy table — fixed Phase 3 category list (REQ-policy-library).
const POLICY_CATEGORIES = [
  'HR',
  'Safety',
  'IT',
  'Finance',
  'Operations',
  'Compliance',
  'Legal',
  'Other',
] as const;

// TipTap JSONContent has a recursive shape (type/content/text/attrs/marks).
// Structural validation is sufficient — generateHTML on the read side
// (Plan 03-10 PolicyView) relies on the StarterKit + Link allow-list for
// safety, not Zod. The .passthrough() preserves any TipTap-internal fields
// (mark order metadata, ProseMirror attrs) that may appear at deeper nodes.
const ContentJsonSchema = z
  .object({
    type: z.string(),
    content: z.array(z.unknown()).optional(),
    text: z.string().optional(),
    attrs: z.record(z.unknown()).optional(),
    marks: z.array(z.unknown()).optional(),
  })
  .passthrough();

// UI-SPEC Error-states table verbatim error strings:
//   "Title is required."
//   "Title must be 200 characters or fewer."
//   "Category is required."
const CreatePolicySchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(200, 'Title must be 200 characters or fewer.'),
  category: z.enum(POLICY_CATEGORIES, {
    errorMap: () => ({ message: 'Category is required.' }),
  }),
  content_json: z
    .string()
    .min(1, 'Policy content is required.')
    .transform((s, ctx) => {
      try {
        return ContentJsonSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid policy content.',
        });
        return z.NEVER;
      }
    }),
});

export type CreatePolicyState =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Create a new Draft policy from a multipart/form-data submission.
 *
 * Signature matches React 19's `useActionState` contract: receives the
 * previous state (unused here — kept for the binding) plus the FormData.
 * Returns a typed CreatePolicyState on validation failure or unexpected
 * error; on success the function never returns — redirect() throws
 * NEXT_REDIRECT and Next.js handles the 303 outside this frame.
 *
 * Failure modes (return `{ ok: false, ... }`):
 *   - Zod validation: returns `{ ok: false, fieldErrors }` per-field for
 *     useFormState rendering as inline `text-destructive` copy.
 *   - Unexpected error (DB connection, RLS reject, etc.): returns
 *     `{ ok: false, error: <generic copy> }` AFTER logging the detail
 *     server-side (T-03-07-03 mitigation — never leak stack to client).
 *
 * Success: revalidatePath('/policies') THEN redirect(`/policies/{id}`).
 * Ordering matters (RESEARCH Pitfall 4): revalidate BEFORE redirect so
 * the list view renders fresh data after the navigation.
 */
export async function createPolicyAction(
  _prev: CreatePolicyState | undefined,
  formData: FormData,
): Promise<CreatePolicyState> {
  let policyId: string;
  try {
    const parsed = CreatePolicySchema.safeParse(
      Object.fromEntries(formData),
    );
    if (!parsed.success) {
      return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
    }
    const ctx = await getOrgContext();
    policyId = await withOrgScope(ctx, async (s) => {
      const rows = await Policies.create(s, {
        title: parsed.data.title,
        category: parsed.data.category,
        contentJson: parsed.data.content_json,
        // createdBy is set by Policies.create() from scope.userId.
        // Other Drizzle $inferInsert fields are nullable / defaulted.
      });
      const first = rows[0];
      if (!first) throw new Error('Insert returned no row');
      return first.id;
    });
  } catch (err) {
    // T-03-07-03: log detail server-side, return generic copy to client.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[createPolicyAction] failed: ${detail}`);
    return { ok: false, error: 'Could not create policy. Please try again.' };
  }
  // T-03-07-04 + RESEARCH Pitfall 4: revalidate BEFORE redirect, and
  // redirect MUST be outside the try/catch — Next.js implements redirect
  // by throwing NEXT_REDIRECT, which the user-level catch would swallow.
  revalidatePath('/policies');
  redirect(`/policies/${policyId}`);
}
