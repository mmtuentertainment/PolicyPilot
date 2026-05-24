// lib/policies/transitions.ts
// Plan 03-06 Task 2 (GREEN) — server-only orchestrators (D-03 + D-04 + L-05).
//
// These 7 functions are the AUTHORITATIVE gate for every policy state
// change. Plan 03-07's Server Actions are thin wrappers; the real
// transactional business logic lives here. Each orchestrator:
//   1. Resolves OrgContext via getOrgContext (Clerk session)
//   2. Opens withOrgScope (one Drizzle transaction + SET LOCAL ROLE
//      authenticated + set_config('request.jwt.claims', ..., true) so
//      Supabase RLS evaluates against the actual ctx.orgId — ADR-025).
//   3. Loads the policy via Policies.findById (which already filters by
//      scope.orgId — defense in depth alongside RLS).
//   4. Validates the requested transition via canTransition; throws
//      IllegalTransitionError on illegal moves.
//   5. Performs any side-effects (PolicyVersions.create snapshot for
//      publish/editPublished/approve; WorkflowStages.recordSubmission for
//      submitForReview) AND the policies row update inside the SAME
//      transaction — so a partial write is impossible (T-03-06-02).
//
// Defense-in-depth: state machine + repository orgId-scope + Postgres RLS
// all fire on every transition. Removing any one layer keeps the other
// two; corrupting any one layer is caught by tests/types.ts (L-05) or
// scripts/check-rls.ts (Phase 2 / Plan 02-06).
//
// L-05 invariant: editPublished + publish + approve write NEW
// policy_versions rows via PolicyVersions.create — they NEVER update or
// delete existing rows. The PolicyVersions repository does not even
// export update/delete (Plan 03-04 / tests/types.ts @ts-expect-error).
//
// MUST NOT import raw `db` from '@/lib/db' — use withOrgScope's s.tx
// for any direct policies-table updates. scripts/check-db-imports.ts
// (Phase 2) enforces this at CI; the file's path is NOT in ALLOWLIST.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, sql } from 'drizzle-orm';
import { withOrgScope, type OrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { WorkflowStages } from '@/lib/db/repositories/workflow_stages';
import { policies } from '@/lib/db/schema';
import { generateSummaryForPolicy } from '@/lib/ai/summary';
import {
  canTransition,
  IllegalTransitionError,
  type PolicyStatus,
} from './state-machine';
import { PolicyNotFoundError } from './errors';
import type { PolicyId } from './types';

// Narrowed row shape returned by Policies.findById. The drizzle column
// types come back as `string` for status and `unknown` for contentJson
// (jsonb) — we cast through this internal shape so the orchestrators
// stay typed against the policy lifecycle.
type PolicyRow = {
  id: string;
  status: PolicyStatus;
  currentVersion: number;
  contentJson: unknown;
};

/**
 * Common "load + validate transition" sequence. Runs inside an already-
 * opened OrgScope; returns the loaded policy on success. Throws:
 *  - PolicyNotFoundError when the WHERE org_id + id miss (D-30 typed
 *    error per Plan 05-02; was `Error('Policy not found')` until Plan
 *    05-08 widened check-error-discipline.ts to scan lib/policies/**)
 *  - IllegalTransitionError when canTransition(from, to) is false
 *
 * Both throws abort the surrounding withOrgScope transaction, rolling
 * back any earlier writes in this orchestrator call.
 */
async function loadAndAssertTransition(
  s: OrgScope,
  policyId: PolicyId,
  to: PolicyStatus,
): Promise<PolicyRow> {
  const rows = await Policies.findById(s, policyId);
  const row = rows[0];
  if (!row) throw new PolicyNotFoundError(policyId);
  const policy: PolicyRow = {
    id: row.id,
    status: row.status as PolicyStatus,
    currentVersion: row.currentVersion,
    contentJson: row.contentJson,
  };
  if (!canTransition(policy.status, to)) {
    throw new IllegalTransitionError(policy.status, to);
  }
  return policy;
}

/**
 * draft → under_review. Also writes a workflow_stages row so the
 * (future) reviewer surface (Phase 6+) can pick it up. Single tx; if
 * either write fails, both roll back.
 */
export async function submitForReview(
  policyId: PolicyId,
  reviewerId: string | null,
): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'under_review');
    // ADR-028: use the branded `policyId` (already in scope) rather than
    // `policy.id` (DB-row field typed as raw string) — semantically
    // identical (`policy.id` comes from a query keyed on `policyId`),
    // structurally cleaner because the orchestrator already holds the
    // branded form. Avoids needing a type cast on the row.
    await WorkflowStages.recordSubmission(s, policyId, reviewerId);
    await s.tx
      .update(policies)
      .set({ status: 'under_review', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * under_review → published. Identical D-04 snapshot semantics to publish()
 * — Phase 6 will gate this separately from publish() (approve will require
 * reviewer-tier; publish will be Starter-direct). Kept as a thin wrapper
 * over the publish() body so the snapshot-and-flip logic stays in one
 * place during Phase 3.
 */
export async function approve(policyId: PolicyId): Promise<void> {
  await publish(policyId);
}

/**
 * under_review → draft (reject the submission). Does NOT touch
 * policy_versions — versions only track the published lineage (D-04).
 */
export async function reject(policyId: PolicyId, _reason?: string): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'draft');
    await s.tx
      .update(policies)
      .set({ status: 'draft', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * draft → published OR under_review → published (D-04, REQ-policy-
 * lifecycle SC#2). Atomically:
 *   1. Snapshot the about-to-be-published content into policy_versions
 *      (versionNumber = current policies.current_version, createdBy =
 *      ctx.userId — the as-published vN row that future
 *      acknowledgments.policy_version_id will FK to).
 *   2. Flip policies.status = 'published'. currentVersion stays put —
 *      the just-snapshot value IS vN; the next edit-published will bump
 *      to v(N+1).
 * Both steps inside one withOrgScope tx — partial state impossible.
 */
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    // D-04: create policy_versions row capturing the about-to-be-published
    // content. L-05: append-only — PolicyVersions doesn't even export
    // update/delete, so this cannot accidentally mutate prior rows.
    // ADR-028: pass the branded `policyId` (orchestrator input) into
    // PolicyVersions.create's branded `policyId` field — `policy.id` is
    // the same value but typed as raw `string` from the DB row.
    await PolicyVersions.create(s, {
      policyId,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: s.userId,
    });
    await s.tx
      .update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });

  // Phase 4 D-19 + SPEC R3 — post-commit AI auto-trigger.
  //
  // Runs OUTSIDE the state-transition withOrgScope (i.e., after the transaction commits)
  // so a flaky Anthropic call cannot roll back the publish. The summary helper opens its
  // own withOrgScope for the ai_generations INSERT + policies.tldrSummary UPDATE.
  //
  // Graceful-degrade scope: only Anthropic.APIError is swallowed (D-19 — Anthropic
  // hiccups must not affect the published state; admin regenerates via the
  // "Regenerate TL;DR" button). Non-Anthropic errors (TierLimitExceededError,
  // BootstrapError, TypeError from a refactor bug, etc.) are RE-THROWN so they
  // surface in error monitoring. Without this narrowing, a programming bug in
  // generateSummaryForPolicy would silently corrupt every publish indefinitely.
  //
  // D-36 PII-safe log — Anthropic.APIError is sanitized to {name, status, code}; raw
  // error.message could contain the org's API-key prefix or policy content.
  //
  // SP-3 (Nyquist sub-path) — lib/policies/transitions.test.ts D-19 block verifies
  // both the graceful-degrade path (Anthropic.APIError) AND the propagation path
  // (non-Anthropic Error).
  try {
    await generateSummaryForPolicy(policyId, ctx);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      // PR #15 type-design review: read `error.type` (typed ErrorType | null on
      // APIError, per @anthropic-ai/sdk/core/error.d.ts:13) instead of
      // `error.error?.type`, which propagates `any` because TError defaults to
      // Object | undefined and .type isn't on that generic shape.
      console.error('[publish] summary failed (anthropic)', {
        policyId,
        error: { name: error.name, status: error.status, code: error.type },
      });
      return;
    }
    if (error instanceof Error) {
      console.error('[publish] summary failed (non-anthropic, propagating)', {
        policyId,
        error: { name: error.name, message: error.message.slice(0, 120) },
      });
    }
    throw error;
  }
}

/**
 * published → archived. Just a status flip; no snapshot, no version bump
 * (the published vN row already exists in policy_versions from the
 * publish() call that landed it).
 */
export async function archive(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    await loadAndAssertTransition(s, policyId, 'archived');
    await s.tx
      .update(policies)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * archived → draft. Does NOT create a version row, but DOES bump
 * currentVersion so the next publish writes v(N+1) — mirrors the
 * editPublished() invariant. Without this bump, a republish after restore
 * would re-snapshot at the same version_number, producing a duplicate row
 * in policy_versions (03-G3 T1 closure — diagnosed at
 * .planning/debug/duplicate-policy-version.md).
 *
 * The schema-level UNIQUE(policy_id, version_number) added in 03-G3 T2/T3
 * is the belt-and-suspenders backstop; this orchestrator-level bump is
 * the primary fix because it preserves the semantic intent that
 * restore→republish is a NEW version event (auditors expect a new vN row).
 */
export async function restore(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'draft');
    await s.tx
      .update(policies)
      .set({
        status: 'draft',
        currentVersion: policy.currentVersion + 1,
        updatedAt: sql`now()`,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}

/**
 * Editing a Published policy (REQ-policy-lifecycle SC#3 + L-05). Atomic:
 *   1. Snapshot the CURRENT (still-published) contentJson + currentVersion
 *      into policy_versions (the as-of-publish vN snapshot is preserved
 *      EVEN AFTER the admin starts editing — what acknowledgments
 *      pointed at stays intact). changeSummary is optional admin copy.
 *   2. Overwrite policies.contentJson with newContent, reset status to
 *      'draft', and bump currentVersion (the next publish writes v(N+1)).
 *
 * ALLOWED_TRANSITIONS allows `under_review → draft` (reject), so
 * canTransition('under_review', 'draft') would return true here — but
 * THIS orchestrator is the published → draft path specifically. The
 * belt-and-suspenders `policy.status !== 'published'` check rejects
 * any other source (T-03-06-04 mitigation; tested explicitly via the
 * draft-status test case which canTransition('draft', 'draft') already
 * rejects, and would otherwise be a phantom version row).
 */
export async function editPublished(
  policyId: PolicyId,
  newContent: unknown,
  changeSummary?: string,
): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'draft');
    if (policy.status !== 'published') {
      throw new IllegalTransitionError(policy.status, 'draft');
    }
    // No snapshot needed here: publish() (line 156-176) ALREADY wrote a
    // policy_versions row for `versionNumber = policy.currentVersion` when
    // this policy was originally published. Re-writing the same
    // (policy_id, version_number) pair would violate the 03-G3 T2 UNIQUE
    // constraint added to policy_versions and 23505 the editPublished flow.
    // We just bump currentVersion + reset to draft; the next publish() will
    // write the new vN+1 row from policies.currentVersion as the snapshot.
    // changeSummary is carried into the next publish via a different path
    // (operator can re-enter it before re-publishing) — Phase 3 originally
    // expected the snapshot here; the publish-side snapshot was added later
    // (03-G3 era) and the duplicate path was missed at the time.
    void changeSummary;
    await s.tx
      .update(policies)
      .set({
        contentJson: newContent,
        status: 'draft',
        currentVersion: policy.currentVersion + 1,
        updatedAt: sql`now()`,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}
