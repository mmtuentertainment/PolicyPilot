import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/auth/context';
import { matchesErrorClass } from '@/lib/auth/bootstrap-errors';
import {
  InvalidRoleError,
  NoActiveOrganizationError,
  NotAuthenticatedError,
} from '@/lib/auth/errors';

/**
 * L-03 / REG-P1-01 closure (Plan 03-02 Task 3). Replaces the Phase 1
 * `/sign-in-success` placeholder.
 *
 * Clerk's "After sign-in URL" was updated to `/post-sign-in` in Plan
 * 03-00 (operator-manual config). After a user signs in, Clerk
 * redirects here and we dispatch:
 *
 *   - no orgId / no role on session (getOrgContext throws) → /onboarding/create-org (D-08)
 *   - role === 'admin'                                    → /dashboard
 *   - role === 'employee' | 'reviewer'                    → /my-policies (Phase 5 stub OK)
 *
 * getOrgContext() throws when sessionClaims.publicMetadata.role is missing
 * (Phase 2 contract — see lib/auth/context.ts asRole()). The catch routes
 * those users to the onboarding flow; once Plan 03-XX ships
 * /onboarding/create-org with <CreateOrganization />, the webhook fires
 * and the next round-trip will populate publicMetadata.role.
 *
 * Pitfall — redirect() throws NEXT_REDIRECT and MUST be outside a try/catch
 * that would swallow it. Here the try/catch wraps only the getOrgContext()
 * call; once it returns, the redirect() calls run unwrapped. This file
 * intentionally has no surrounding try block at the function level.
 */
// CR-PR3-#19 closure — narrow the catch so backend failures (Clerk auth
// outage, DB unreachable, malformed Clerk text IDs) surface as real 500s
// instead of being masked as legitimate onboarding state. Only the three
// "user-bootstrap-incomplete" classes route to /onboarding/create-org.
// Upgraded to typed classes per ADR-026; the class hierarchy in
// lib/auth/errors.ts is the source of truth for what each error means.
//
// INTENTIONALLY EXCLUDES ProvisioningRaceError (and its OrgNotProvisioned
// + UserNotProvisioned subclasses) — the trampoline treats Clerk → DB
// drift as a real outage (hard-fail / 500), while
// app/(admin)/dashboard/page.tsx treats the same condition as a race
// window (soft retry with 2s meta-refresh). The divergence is by design:
// dashboard = soft retry on webhook race; trampoline = hard fail on DB
// drift. ClerkAuthFailedError is intentionally NOT a BootstrapError so it
// also cannot land here — see lib/auth/bootstrap-errors.test.ts §
// hierarchy-contract for the lock.
const BOOTSTRAP_ERRORS = [
  NotAuthenticatedError,
  InvalidRoleError,
  NoActiveOrganizationError,
] as const;

function isBootstrapError(err: unknown): boolean {
  return matchesErrorClass(err, BOOTSTRAP_ERRORS);
}

export default async function PostSignInPage(): Promise<never> {
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (err) {
    if (!isBootstrapError(err)) throw err;
    // No active org (no Clerk orgId, or session role missing) → onboard.
    redirect('/onboarding/create-org');
  }
  if (ctx.role === 'admin') redirect('/dashboard');
  redirect('/my-policies');
}
