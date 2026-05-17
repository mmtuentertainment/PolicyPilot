// lib/auth/context.ts — L-02 (getOrgContext) + D-04 (publicMetadata.role
// narrowing) + SF-M4 fold (try/catch around await auth()).
//
// Single source of truth for "who is the current user, in which org, with
// which role" on the server. Repositories take an OrgScope (which extends
// OrgContext with the per-tx handle); withOrgScope is the bridge.
//
// Throws hard on missing session / missing org / missing role — callers
// catch and redirect (to /sign-in or the Clerk <OrganizationSwitcher />)
// per the operational invariant in D-04.
import 'server-only';
import { auth } from '@clerk/nextjs/server';

export type Role = 'admin' | 'reviewer' | 'employee';
export type OrgContext = { orgId: string; userId: string; role: Role };

function asRole(value: unknown): Role {
  if (value === 'admin' || value === 'reviewer' || value === 'employee') return value;
  throw new Error(`Invalid role on session claims: ${String(value)}`);
}

export async function getOrgContext(): Promise<OrgContext> {
  let session;
  try {
    // SF-M4 fold: wrap auth() in try/catch (Phase 1 PR-review follow-up).
    // Without this, a network blip or Clerk outage surfaces as an
    // unhandled-promise rejection in Server Components / Server Actions
    // with no observability hook.
    session = await auth();
  } catch (err) {
    throw new Error(
      `Clerk auth() failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
    );
  }
  const { userId, orgId, sessionClaims } = session;
  if (!userId) throw new Error('Not authenticated: no Clerk session');
  if (!orgId) throw new Error('No active organization');
  // Narrow `role` from `unknown` (stricter than middleware.ts's
  // `{ role?: string }` cast) so asRole() must do explicit literal-string
  // comparisons. No `any` anywhere; the asRole() throw branch is the only
  // exit from a non-Role value.
  const pubMeta = (sessionClaims?.publicMetadata as { role?: unknown } | undefined) ?? {};
  return { userId, orgId, role: asRole(pubMeta.role) };
}
