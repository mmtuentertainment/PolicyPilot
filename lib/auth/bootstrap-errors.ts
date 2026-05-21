// lib/auth/bootstrap-errors.ts — ADR-026 typed matcher for bootstrap
// error classes from lib/auth/errors.ts.
//
// Replaces the v0 `matchesErrorMessage(err, needles: string[])` substring
// matcher with `matchesErrorClass(err, classes[])`. The substring matcher
// was a runtime contract pretending to be a type contract: if
// lib/auth/context.ts reflowed a throw-string ("No active organization"
// → "no active organization", or all messages gain a uniform prefix),
// the consumer allow-lists silently rotted. `instanceof` is the
// type-level discriminator that survives any message reflow.
//
// Both consumers (app/(admin)/dashboard/page.tsx race-recovery and
// app/(auth)/post-sign-in/page.tsx hard-fail) maintain their own class
// allow-list and call matchesErrorClass(err, ALLOW_LIST). The
// intentional asymmetry (dashboard catches ProvisioningRaceError;
// trampoline rethrows it) is preserved by each consumer's list
// composition — see the comment blocks in those files for the
// asymmetry rationale.

/**
 * Returns true iff `err` is an instance of any of the provided error
 * class constructors. Used as the runtime narrower across bootstrap-
 * error allow-lists.
 *
 * @param err Unknown thrown value (caller's `catch (err)`).
 * @param classes Readonly array of error class constructors to match
 *                against. Abstract bases (e.g. `ProvisioningRaceError`)
 *                ARE valid entries — `instanceof` works on the prototype
 *                chain so passing a base catches all concrete subclasses.
 */
export function matchesErrorClass(
  err: unknown,
  classes: readonly (abstract new (...args: never[]) => Error)[],
): boolean {
  return classes.some((C) => err instanceof C);
}
