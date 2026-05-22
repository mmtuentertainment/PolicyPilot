// app/(admin)/dashboard/consistency/page.tsx — Phase 4 D-30 + Plan 04-13 Task 4.
//
// Consistency Check admin page — Server Component shell with mount-time
// resume from batch_jobs (D-30). Queries BatchJobs.findLatestForOrg on first
// render and chooses ONE of 4 sub-trees:
//
//   - no batch row              ⇒ <ConsistencyEmptyState />     (first visit)
//   - row.status='in_progress'  ⇒ <ConsistencyCheckRunner />    (AC-25 resume)
//   - row.status='completed'    ⇒ <ConsistencyFindingsList />   (results)
//   - row.status='failed'       ⇒ <ConsistencyFailureState />   (retry CTA)
//
// AC-25 mount-time resume (D-30): the in_progress branch renders the Runner
// with the persisted anthropicBatchId — polling resumes against the EXISTING
// Anthropic batch without resubmitting. Refreshing the page or returning
// later therefore never duplicates work, never starts a new Anthropic batch
// from a still-running one. This is the core SPEC R5 contract.
//
// Auth (per D-37 + D-45):
//   - getOrgContext() runs OUTSIDE any try/catch — typed BootstrapError
//     subclasses propagate to the Next.js error boundary mapping to 401/404.
//   - requireAdminFromCtx(ctx) throws ForbiddenError (D-45) → HTTP 403 with
//     body { error: 'forbidden' } per AC-26. Phase 3 admin pages use the
//     legacy requireAdmin() (notFound() path); Phase 4 API+admin surfaces use
//     the AC-26-locked 403 path. The middleware ADMIN_URL_PATTERNS gate also
//     covers /dashboard/* per Phase 3 (defense-in-depth — middleware fires
//     first on direct URL access; the Server Component check is the
//     authoritative source of truth).
//
// Tier gating: SPEC R5 + D-46 deferred Q&A unlimited-cost, but Consistency
// Check IS tier-gated. The /api/ai/consistency POST endpoint (Plan 04-10)
// enforces requireTierLimit('consistencyCheck') — Starter admins navigating
// here see the EmptyState, but clicking Run yields a 403 with the
// "Upgrade to Growth →" copy in ConsistencyCheckRunButton. Per the threat
// model T-04-13-IL: this UX path is accepted; Phase 6 syncs planTier to
// make a true visible-but-disabled sidebar state.
//
// No 'use client' directive: pure Server Component. Branching happens at
// render time; the Runner is the only Client Component branch.

import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { BatchJobs } from '@/lib/db/repositories/batch_jobs';
import { ConsistencyEmptyState } from '@/components/admin/ConsistencyEmptyState';
import { ConsistencyFailureState } from '@/components/admin/ConsistencyFailureState';
import { ConsistencyFindingsList } from '@/components/admin/ConsistencyFindingsList';
import { ConsistencyCheckRunner } from '@/components/admin/ConsistencyCheckRunner';

/**
 * Server Component shell for /dashboard/consistency (D-30). Per the AC-25
 * mount-time resume contract, this function:
 *   1. Resolves the org context (Clerk session → internal UUIDs).
 *   2. Asserts admin role via requireAdminFromCtx (D-45 — throws
 *      ForbiddenError → 403 on non-admin).
 *   3. Reads BatchJobs.findLatestForOrg inside withOrgScope (RLS + app-layer
 *      org_id WHERE both fire).
 *   4. Branches into ONE sub-tree based on the result.
 *
 * The auth gates run OUTSIDE withOrgScope (per D-37) — they don't need DB
 * access, and their typed errors propagate cleanly to the Next.js error
 * boundary instead of being swallowed by an outer try/catch.
 */
export default async function ConsistencyPage(): Promise<React.JSX.Element> {
  // D-37: auth gates OUTSIDE try/catch. Typed errors (NotAuthenticatedError,
  // ForbiddenError, etc.) flow to the Next.js error boundary mapping to
  // 401/403/404 — never swallowed by a 503 fallback.
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  // D-30: mount-time resume from batch_jobs. The findLatestForOrg query
  // filters by type='consistency' so future batch surfaces (other types)
  // won't collide with this page's resume logic.
  const latest = await withOrgScope(ctx, async (s) =>
    BatchJobs.findLatestForOrg(s),
  );

  if (!latest) {
    return <ConsistencyEmptyState />;
  }
  if (latest.status === 'completed') {
    return <ConsistencyFindingsList result={latest.resultJson} />;
  }
  if (latest.status === 'failed') {
    return <ConsistencyFailureState />;
  }

  // 'in_progress' — AC-25 resume. Pass the persisted Anthropic batch ID to
  // the Client Component Runner; no POST happens here, no fresh batch is
  // created. The Runner polls the existing batch via GET
  // /api/ai/consistency/[batchId] every 30s.
  //
  // batch_jobs.createdAt is typed as Date | null from Drizzle's schema
  // inference (schema declares `defaultNow()`). The TS type is nullable
  // because the column doesn't have NOT NULL at the DB level; in practice
  // it's always populated by defaultNow(). Coerce to Date defensively —
  // if somehow null, fall back to `new Date()` so the "started Xm ago"
  // copy shows "just started" instead of crashing.
  const startedAt =
    latest.createdAt instanceof Date
      ? latest.createdAt
      : latest.createdAt
        ? new Date(latest.createdAt as unknown as string)
        : new Date();

  return (
    <ConsistencyCheckRunner
      batchId={latest.anthropicBatchId}
      startedAt={startedAt}
    />
  );
}
