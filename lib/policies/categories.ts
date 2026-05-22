// lib/policies/categories.ts — BLOCKER-2 resolution.
//
// SINGLE source-of-truth for the 8 policy categories. Imported by:
//   - app/(admin)/policies/new/actions.ts CreatePolicySchema.category (Phase 3 ship — replaces
//     inline const declaration that previously existed at lines 29-38 of that file)
//   - lib/ai/schemas.ts DraftSchema.policyType (Phase 4 Task 4 — z.enum constraint)
//   - components/policy/PolicyAiDraftDialog.tsx Select options (Phase 4 Plan 04-12 Task 1)
//
// BEFORE this extraction, the const was re-declared in actions.ts AND was about to be
// re-declared in PolicyAiDraftDialog.tsx (per the original Plan 04-12 Task 1 sketch).
// That allowed silent drift: a change to one inline copy could leave the others stale
// without any typecheck or test failure. With this module as the SINGLE site:
//   - Adding/removing a category here ripples through all three consumers via tsc.
//   - lib/ai/schemas.ts DraftSchema's z.enum(POLICY_CATEGORIES) provides runtime enforcement.
//   - components/policy/PolicyAiDraftDialog.tsx Select.options is type-narrowed to the same union.
//
// No 'server-only' import here — this module is shape-only (const + type), safe to import
// from Server Actions, Server Components, AND Client Components. The const value is a tuple
// of plain strings (no secrets); the type is a string-literal union (no runtime).
//
// Future-proofing: if a category is ever conditionally-shown per-org (e.g., "Legal" only
// for Business-tier orgs), the const stays here; the predicate moves to lib/stripe/products.ts
// or similar. The list itself remains universal.

/**
 * The 8 policy categories used by the Server Action (create new policy), the Draft AI
 * endpoint (categorize generated draft), and the Draft dialog (Select UI options).
 *
 * Order is the UI-display order from the original Phase 3 declaration in actions.ts:29-38
 * — preserved here verbatim so the dialog's Select renders categories in the same order
 * existing admins see in the new-policy form.
 */
export const POLICY_CATEGORIES = [
  'HR',
  'Safety',
  'IT',
  'Finance',
  'Operations',
  'Compliance',
  'Legal',
  'Other',
] as const;

/**
 * String-literal union derived from POLICY_CATEGORIES. Use as the type for any variable
 * that holds a single category value — UI state, function parameters, DB-column inputs.
 *
 * Pattern matches `lib/policies/types.ts:PolicyId` (the other shared lib/policies/* module).
 */
export type PolicyCategory = typeof POLICY_CATEGORIES[number];
