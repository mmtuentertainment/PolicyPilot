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
export default async function PostSignInPage() {
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch {
    // No active org (no Clerk orgId, or session role missing) → onboard.
    redirect('/onboarding/create-org');
  }
  if (ctx.role === 'admin') redirect('/dashboard');
  redirect('/my-policies');
}
