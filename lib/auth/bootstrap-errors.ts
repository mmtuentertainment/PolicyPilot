// lib/auth/bootstrap-errors.ts — CR-PR3-postreview (pr-test-analyzer FLAG).
//
// Extracted from app/(admin)/dashboard/page.tsx and app/(auth)/post-sign-in/page.tsx
// so the two error-message allow-lists are independently unit-testable.
// Both consumers continue to define their own typed const arrays (the
// dashboard race-error list intentionally includes 'Org/User not provisioned'
// while the trampoline bootstrap-error list intentionally excludes them —
// see the comment blocks in each consumer for the asymmetry rationale).
//
// This module ships ONLY the matcher helper. The lists themselves stay
// inline at each call site so the divergence stays explicit + grep-able
// from each consumer file.
//
// Future improvement (deferred to a fast-follow per CR-PR3 type-design
// agent FLAG): replace the substring-matching helper with `instanceof`
// checks against typed error classes thrown from lib/auth/context.ts.

/**
 * Returns true iff `err` is an Error whose message contains any of the
 * provided needle substrings. Used as a defensive runtime narrower
 * across the bootstrap-error allow-lists.
 *
 * @param err Unknown thrown value (caller's `catch (err)`).
 * @param needles Readonly array of substring fragments that the error
 *                message must contain at least one of for a match.
 */
export function matchesErrorMessage(
  err: unknown,
  needles: readonly string[],
): boolean {
  if (!(err instanceof Error)) return false;
  return needles.some((needle) => err.message.includes(needle));
}
