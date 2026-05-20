import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/auth/context';

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
// "user-bootstrap-incomplete" shapes route to /onboarding/create-org.
//
// Sourced verbatim from lib/auth/context.ts throw sites:
//   - 'Not authenticated'        (asRole when sessionClaims.role missing)
//   - 'Invalid role'             (asRole when value not in enum)
//   - 'No active organization'   (getOrgContext when orgId is null)
// Backend-failure shapes that must rethrow:
//   - 'Clerk auth() failed'      (try/catch around await auth())
//   - 'Org not provisioned'      (orgs lookup empty — race AFTER sign-in)
//   - 'User not provisioned'     (users lookup empty)
const BOOTSTRAP_ERRORS = [
  'Not authenticated',
  'Invalid role',
  'No active organization',
] as const;

function isBootstrapError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return BOOTSTRAP_ERRORS.some((needle) => err.message.includes(needle));
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
