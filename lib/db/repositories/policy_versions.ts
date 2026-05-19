/**
 * lib/db/repositories/policy_versions.ts
 * L-03 + D-06: per-aggregate PolicyVersions repository.
 *
 * L-05 / ADR-018-spirit — APPEND ONLY. This module exports ONLY
 * `create`, `listAll`, `listForPolicy`, `findByVersionNumber`. It MUST NOT
 * expose `update` or `delete` (not even unimplemented stubs).
 *
 * Rationale: a `policy_versions` row IS the as-of-publish content snapshot
 * that an acknowledgment row points at (acknowledgments.policy_version_id
 * FK). Mutating or deleting a prior version would silently rewrite the
 * audit trail — the very thing ADR-018 forbids for acknowledgments and
 * REQ-policy-lifecycle for versions. If you find yourself wanting to add
 * one, STOP — read L-05 + ADR-018 first.
 *
 * Type-system enforcement: tests/types.ts (D-07) carries the
 * @ts-expect-error rows that fail tsc if either key is ever added.
 * (Block-comment form intentional: TypeScript scans `//`-comments for
 * @ts-expect-error directives; a JSDoc block is safely ignored.)
 *
 * D-02 (denormalization invariant): INSERT methods MUST copy scope.orgId
 * into the row directly. Do NOT re-read the parent policy's org_id —
 * that's a redundant query AND opens a window for transient inconsistency.
 * The FK + RLS catch a cross-org mismatch at insert time.
 *
 * RESEARCH Pitfall 6: NO raw `db` barrel import. See policies.ts header.
 */
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyVersions } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export const PolicyVersions = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.orgId, s.orgId)),

  /**
   * Append: writes a new version row stamped with s.orgId (D-02).
   * Used by Plan 03-06 transition orchestrators inside withOrgScope
   * when (a) publishing a draft or (b) editing a published policy
   * (the latter creates a new version row AND resets status='draft').
   */
  create: (
    s: OrgScope,
    input: {
      policyId: string;
      versionNumber: number;
      contentJson: unknown;
      createdBy: string;
      changeSummary?: string;
    },
  ) =>
    s.tx
      .insert(policyVersions)
      .values({
        ...input,
        orgId: s.orgId,
      })
      .returning(),

  /**
   * Version history for a single policy, scoped by orgId AND policyId,
   * ordered newest-first. Feeds Plan 03-10's <PolicyVersionHistory />.
   */
  listForPolicy: (s: OrgScope, policyId: string) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policyId),
        ),
      )
      .orderBy(desc(policyVersions.versionNumber)),

  /**
   * Look up the row that an acknowledgment points at. Used by Plan 05+
   * acknowledgment audit views and by edit-published orchestrators to
   * verify the next versionNumber to assign.
   */
  findByVersionNumber: (
    s: OrgScope,
    policyId: string,
    versionNumber: number,
  ) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policyId),
          eq(policyVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1),

  // NO update method. L-05 / ADR-018-spirit — version snapshots immutable.
  // NO delete method. L-05 / ADR-018-spirit — version history is permanent.
  // If you find yourself wanting to add one, STOP — read L-05 first.
};
