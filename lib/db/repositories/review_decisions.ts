// lib/db/repositories/review_decisions.ts
// Phase 9 (R-017 / D-09-01) — per-aggregate ReviewDecisions repository.
//
// APPEND-ONLY (ADR-018 spirit, mirrors policy_versions.ts / acknowledgments.ts):
// this module exports ONLY `record` (insert) + `listForPolicy` (select). It
// MUST NOT expose `update` or `delete` (not even stubs). review_decisions is
// the immutable ledger of every reviewer Approve/Reject decision; mutating or
// deleting a row would silently rewrite the audit trail. Enforcement layers:
//   - scripts/check-acknowledgment-immutability.ts IMMUTABLE_TABLES
//     (ts-morph .update/.delete AST gate + raw-SQL regex + --self-test)
//   - tests/types.ts @ts-expect-error no-update / no-delete invariant
//   - this file exports neither key
//
// D-02 (denormalization invariant): INSERT copies scope.orgId into the row
// directly — never re-read the parent policy's org_id. The FK + RLS catch a
// cross-org mismatch at insert time.
//
// RESEARCH Pitfall 6: NO raw `db` barrel import — repositories take s.tx.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { reviewDecisions } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

export const ReviewDecisions = {
  /**
   * Append one immutable decision row. Called by `recordReviewDecision`
   * (lib/policies/transitions.ts) in the SAME transaction that mutates the
   * workflow_stages projection — so the immutable ledger and the current-state
   * projection never diverge. `decision` is 'approved' | 'rejected'.
   *
   * ADR-028: the object input is schema-inferred → out of brand scope (like
   * PolicyVersions.create / QaCitationGrants.upsert). `policyId` still carries
   * the brand from the orchestrator; the FK + RLS catch any cross-org id.
   */
  record: (
    s: OrgScope,
    input: {
      policyId: PolicyId;
      stageId: string;
      reviewerId: string;
      decision: 'approved' | 'rejected';
      comment: string | null;
    },
  ) =>
    s.tx
      .insert(reviewDecisions)
      .values({ orgId: s.orgId, ...input })
      .returning(),

  /**
   * Immutable decision history for a single policy, scoped by orgId AND
   * policyId, newest-first. Feeds the reviewer audit view. PolicyId is branded
   * per ADR-028 (pinned in scripts/check-policy-id-brand.ts REPO_TARGETS).
   */
  listForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .select()
      .from(reviewDecisions)
      .where(
        and(
          eq(reviewDecisions.orgId, s.orgId),
          eq(reviewDecisions.policyId, policyId),
        ),
      )
      .orderBy(desc(reviewDecisions.decidedAt)),

  // NO update method. ADR-018 spirit — the decision ledger is immutable.
  // NO delete method. ADR-018 spirit — decision history is permanent.
  // If you find yourself wanting to add one, STOP — read ADR-018 first.
};
