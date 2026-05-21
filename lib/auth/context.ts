// lib/auth/context.ts — L-02 (getOrgContext) + D-04 (publicMetadata.role
// narrowing) + SF-M4 fold (try/catch around await auth()) + 03-G1
// (Clerk text id → internal UUID translation; closes GAP-1 from
// .planning/phases/03-admin-ui/03-SMOKE.md).
//
// OrgContext.orgId / OrgContext.userId are INTERNAL UUIDs (organizations.id,
// users.id). OrgContext.clerkOrgId / OrgContext.clerkUserId carry the
// original Clerk text refs for the webhook + Clerk-mirror namespace.
// The translation is a per-request DB lookup against organizations.clerk_org_id
// and users.clerk_user_id (unique). RLS predicates compare auth.jwt()->>'org_id'
// against the UUID-typed org_id column, so withOrgScope MUST inject the
// UUID form — NOT the Clerk text id (the production bug GAP-1 closed).
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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, users } from '@/lib/db/schema';
import {
  ClerkAuthFailedError,
  InvalidRoleError,
  NoActiveOrganizationError,
  NotAuthenticatedError,
  OrgNotProvisionedError,
  UserNotProvisionedError,
} from '@/lib/auth/errors';

export type Role = 'admin' | 'reviewer' | 'employee';
export type OrgContext = {
  /** Internal organizations.id (UUID). Use this for all tenant-scoped queries. */
  orgId: string;
  /** Internal users.id (UUID). Use this for createdBy / FK references. */
  userId: string;
  /** Clerk's external organization id (e.g. "org_3Dy5O..."). Use ONLY for mirror-to-Clerk paths. */
  clerkOrgId: string;
  /** Clerk's external user id (e.g. "user_3DpHee..."). Use ONLY for mirror-to-Clerk paths. */
  clerkUserId: string;
  role: Role;
};

/**
 * Narrow an unknown session role value to the `Role` union or fail.
 *
 * @param value - The session claim value to validate as a role
 * @returns The validated role as a `Role`
 * @throws InvalidRoleError if `value` is not `'admin'`, `'reviewer'`, or `'employee'`; the error preserves the received value as a `public readonly` field for diagnostic logging.
 */
function asRole(value: unknown): Role {
  if (value === 'admin' || value === 'reviewer' || value === 'employee') return value;
  throw new InvalidRoleError(value);
}

/**
 * Mask a Clerk user id for log + error messages — last-4 chars preserved.
 * Mirrors the shape used in app/api/webhooks/clerk/route.ts (L-06b).
 */
function maskClerkId(id: string): string {
  if (id.length <= 4) return '***';
  return `user_***${id.slice(-4)}`;
}

/**
 * Mask a Clerk organization id for log + error messages — last-4 chars preserved.
 * Mirrors the shape used in app/api/webhooks/clerk/route.ts (L-06b).
 */
function maskClerkOrgId(id: string): string {
  if (id.length <= 4) return '***';
  return `org_***${id.slice(-4)}`;
}

/**
 * Resolve the current tenant-scoped authentication context from the active Clerk session.
 *
 * Validates that a session with `userId` and `orgId` exists, narrows and validates the session
 * role to one of `'admin' | 'reviewer' | 'employee'`, and maps Clerk text identifiers to the
 * internal UUIDs used by the database.
 *
 * @returns An object containing `orgId` (internal UUID), `userId` (internal UUID), `clerkOrgId` (Clerk text id), `clerkUserId` (Clerk text id), and `role`.
 * @throws ClerkAuthFailedError when Clerk's `auth()` call fails.
 * @throws NotAuthenticatedError if the session has no `userId`.
 * @throws NoActiveOrganizationError if the session has no `orgId`.
 * @throws InvalidRoleError if the session role claim is missing or not one of the allowed role strings.
 * @throws OrgNotProvisionedError when the Clerk org id has no matching row in `organizations`.
 * @throws UserNotProvisionedError when the Clerk user id has no matching row in `users`.
 */
export async function getOrgContext(): Promise<OrgContext> {
  let session;
  try {
    // SF-M4 fold: wrap auth() in try/catch (Phase 1 PR-review follow-up).
    // Without this, a network blip or Clerk outage surfaces as an
    // unhandled-promise rejection in Server Components / Server Actions
    // with no observability hook.
    session = await auth();
  } catch (err) {
    throw new ClerkAuthFailedError(err);
  }
  const { userId, orgId, sessionClaims } = session;
  if (!userId) throw new NotAuthenticatedError();
  if (!orgId) throw new NoActiveOrganizationError();
  // Narrow `role` from `unknown` (stricter than middleware.ts's
  // `{ role?: string }` cast) so asRole() must do explicit literal-string
  // comparisons. No `any` anywhere; the asRole() throw branch is the only
  // exit from a non-Role value.
  const pubMeta = (sessionClaims?.publicMetadata as { role?: unknown } | undefined) ?? {};
  const role = asRole(pubMeta.role);

  // 03-G1: Clerk's `userId`/`orgId` from the session are TEXT identifiers
  // (e.g. `user_3DpHee...`, `org_3Dy5O...`). Every tenant-scoped query
  // filters by an internal UUID column. Translate text → UUID via the
  // unique columns `users.clerk_user_id` and `organizations.clerk_org_id`.
  // Parallelized — each query hits a UNIQUE index.
  const clerkOrgId = orgId;
  const clerkUserId = userId;
  const [orgRows, userRows] = await Promise.all([
    db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1),
    db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1),
  ]);
  const orgRow = orgRows[0];
  if (!orgRow) {
    throw new OrgNotProvisionedError(maskClerkOrgId(clerkOrgId));
  }
  const userRow = userRows[0];
  if (!userRow) {
    throw new UserNotProvisionedError(maskClerkId(clerkUserId));
  }
  return {
    orgId: orgRow.id,
    userId: userRow.id,
    clerkOrgId,
    clerkUserId,
    role,
  };
}
