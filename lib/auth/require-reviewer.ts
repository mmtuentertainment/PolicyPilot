// lib/auth/require-reviewer.ts — Phase 9 (R-017 / D-09-01) reviewer gates.
//
// Mirrors lib/auth/require-admin.ts. Two functions side-by-side:
//   - requireReviewerOrAdmin()      → page gate; notFound() (404, "advertise
//     nothing" per D-10) on non-(reviewer|admin). Used by app/(reviewer)/layout.tsx.
//   - requireReviewerOrAdminFromCtx → action/orchestrator gate; throws
//     ForbiddenError (→ 403) on non-(reviewer|admin).
//
// Admins are admitted alongside reviewers because §13(d) ALLOWS self-approval
// (no separation-of-duties): an admin may review/approve, including their own
// submission. The `reviewer` role already exists end-to-end (lib/auth/context.ts
// Role union + Clerk normalizeClerkRole) — these guards wire it, they do not add it.
import 'server-only';
import { notFound } from 'next/navigation';
import { getOrgContext, type OrgContext } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/auth/errors';

/**
 * Reviewer page-gate (mirrors requireAdmin()). Resolves OrgContext and calls
 * Next.js notFound() (HTTP 404) when the role is neither 'reviewer' nor
 * 'admin'. Returns the OrgContext on success.
 */
export async function requireReviewerOrAdmin(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (ctx.role !== 'reviewer' && ctx.role !== 'admin') notFound();
  return ctx;
}

/**
 * Reviewer action-gate (mirrors requireAdminFromCtx). Throws ForbiddenError
 * (Next.js error boundary → HTTP 403) when the role is neither 'reviewer' nor
 * 'admin'. Used by recordReviewDecision (lib/policies/transitions.ts) and the
 * reviewer Server Actions.
 */
export function requireReviewerOrAdminFromCtx(ctx: OrgContext): void {
  if (ctx.role !== 'reviewer' && ctx.role !== 'admin') {
    throw new ForbiddenError('reviewer or admin role required');
  }
}
