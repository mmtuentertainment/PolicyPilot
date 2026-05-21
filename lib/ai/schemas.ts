import 'server-only';
import { z } from 'zod';
import { POLICY_CATEGORIES } from '@/lib/policies/categories';

/**
 * Phase 4 D-42 + BLOCKER-2 fix — Zod request-body schemas for the 3 user-input AI endpoints.
 *
 * All schemas use `.strict()` (per AC-33 + F-25 + F-16): unknown keys produce a ZodError,
 * which the endpoint outer error boundary maps to HTTP 400. This closes OWASP API3
 * (mass-assignment / BOPLA) — an attacker cannot smuggle extra fields like
 * `{ question: "valid", extraKey: "evil" }` past the input contract.
 *
 * Length bounds (10_000 for prompt, 2_000 for question) limit Anthropic token cost
 * per call. SPEC R5 (Consistency Check) takes no body — uses the org's full published
 * library — so no schema here.
 *
 * BLOCKER-2 resolution: DraftSchema.policyType is `z.enum(POLICY_CATEGORIES).optional()` —
 * was previously `z.string().optional()`, which let the dialog (components/policy/
 * PolicyAiDraftDialog.tsx in Plan 04-12) submit ANY string and silently bypass the
 * server-side category enforcement that the Server Action (app/(admin)/policies/new/
 * actions.ts CreatePolicySchema.category) already enforced. The enum constraint here
 * makes the type-system + runtime invariant uniform across the Draft entry points.
 *
 * The `as readonly [string, ...string[]]` cast on POLICY_CATEGORIES is required because
 * Zod 3.x z.enum expects a tuple type (`[T, ...T[]]`), and TypeScript widens
 * `as const` tuples in some contexts. The tuple is non-empty by construction
 * (8 categories) so the runtime contract is preserved.
 */

const POLICY_CATEGORIES_TUPLE = POLICY_CATEGORIES as unknown as readonly [string, ...string[]];

export const DraftSchema = z.object({
  prompt: z.string().min(1).max(10_000),
  policyType: z.enum(POLICY_CATEGORIES_TUPLE).optional(),
}).strict();

export const SummarySchema = z.object({
  policyId: z.string().uuid(),
}).strict();

export const QaSchema = z.object({
  question: z.string().min(1).max(2_000),
}).strict();

export type DraftInput = z.infer<typeof DraftSchema>;
export type SummaryInput = z.infer<typeof SummarySchema>;
export type QaInput = z.infer<typeof QaSchema>;
