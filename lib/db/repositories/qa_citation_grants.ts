// lib/db/repositories/qa_citation_grants.ts — Phase 5 T-2(4c) per-aggregate
// QaCitationGrants repository (D-29 / Plan 05-01 migration 0011).
//
// ADR-023 OrgScope-first; D-02 INSERT copies scope.orgId into the row;
// D-26 grant-issue step in lib/ai/qa.ts::askQuestion calls upsert() per
// cited policy (post-validIds-filter per RESEARCH gap-3). hasGrant() is
// the page-handler predicate for D-27 access decision at
// /my-policies/[id]: assigned → full PolicyView; else hasGrant + published
// → TL;DR-only view; else 404.
//
// ADR-018 spirit — grants are WRITE-ONCE per D-26 ("non-expiring grants
// for MVP"). This module exports ONLY listForUser + upsert + hasGrant; NO
// update / delete keys (the cleanup cron is deferred to Phase 7+ if data
// volume warrants).
//
// RESEARCH Pitfall 6: this file MUST NOT import `db` from '@/lib/db'.
// See lib/db/repositories/policies.ts header for the full rationale —
// repositories receive scope.tx from withOrgScope so RLS fires; raw db
// bypasses both the transaction AND the JWT injection.
//
// RESEARCH Pitfall 3 (delegated to caller): upsert() is content-agnostic.
// The orchestrator in lib/ai/qa.ts MUST iterate over the post-
// `parseQaResponse(rawText, validIds)` filtered citations array (Phase 4
// D-41 same-closure validIds defense). Issuing grants for hallucinated
// policy UUIDs would be a no-op via RLS at /my-policies/[id], but would
// pollute qa_citation_grants with garbage rows.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { qaCitationGrants } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

/**
 * Input type for QaCitationGrants.upsert. Drizzle's $inferInsert; we Omit:
 * - `orgId`: set from scope.orgId, not user-controlled (cross-org write
 *   defense)
 * - `id`: auto-generated (uuid default)
 * - `grantedAt`: defaultNow()
 *
 * `policyId` is inferred as `string` (not branded PolicyId) per ADR-028
 * "schema-inferred insert inputs are intentionally out of brand scope" —
 * see lib/policies/types.ts:23-31. The brand is preserved at the
 * orchestrator boundary in Plan 05-04 (`askQuestion` receives `cit.id`
 * already validated by `parseQaResponse(rawText, validIds)`).
 */
type QaCitationGrantUpsertInput = Omit<
  typeof qaCitationGrants.$inferInsert,
  'orgId' | 'id' | 'grantedAt'
>;

export const QaCitationGrants = {
  /**
   * List every grant currently held by the requesting user. Used for
   * Phase 7+ cleanup cron candidate-set discovery and ops introspection.
   * Scoped by (orgId, userId) — the migration-0011 composite btree
   * `qa_citation_grants_user_policy_idx` covers (user_id, policy_id) so
   * Postgres uses the org_id index for the SELECT predicate.
   */
  listForUser: (s: OrgScope, userId: string) =>
    s.tx
      .select()
      .from(qaCitationGrants)
      .where(
        and(
          eq(qaCitationGrants.orgId, s.orgId),
          eq(qaCitationGrants.userId, userId),
        ),
      ),

  /**
   * D-29 — upsert-or-no-op for grant issuance. Returns the inserted array
   * (length 1 on fresh grant, length 0 when the UNIQUE(org_id, user_id,
   * policy_id) from migration 0011 fires + ON CONFLICT DO NOTHING swallowed
   * the row). Caller orchestrator (lib/ai/qa.ts::askQuestion in Plan 05-04)
   * treats `length === 0` as "grant already exists" no-op (idempotent per
   * D-26 — askQuestion re-runs are safe even if the user re-asks the same
   * question multiple times).
   *
   * orgId comes from OrgScope (NEVER from input — defense against
   * cross-org writes; the UNIQUE includes org_id as defense-in-depth
   * against a hallucinated policy-UUID collision across orgs per Pitfall 3).
   */
  upsert: async (s: OrgScope, input: QaCitationGrantUpsertInput) => {
    const inserted = await s.tx
      .insert(qaCitationGrants)
      .values({ ...input, orgId: s.orgId })
      // D-29 — UNIQUE(org_id, user_id, policy_id) from migration 0011
      // fires; empty RETURNING on duplicate is treated as 'grant already
      // exists' no-op (idempotent per D-26).
      .onConflictDoNothing()
      .returning();
    return inserted;
  },

  /**
   * D-27 page-handler access predicate at /my-policies/[id]:
   *   assigned → full PolicyView (uses Policies.listAssignedAndPublishedForUser)
   *   else hasGrant + published → TL;DR-only view (uses THIS predicate)
   *   else → notFound() // 404
   *
   * Fast COUNT(*) probe scoped by (orgId, userId, policyId). The composite
   * btree `qa_citation_grants_user_policy_idx` (migration 0011) covers the
   * (user_id, policy_id) leading edge; Postgres planner picks it for the
   * predicate. LIMIT 1 hint short-circuits even though COUNT inherently
   * scans the matching rows — the UNIQUE constraint guarantees ≤ 1 match.
   *
   * Returns Promise<boolean>. Drizzle returns count as string in some
   * drivers; Number(...) coerces safely for the boolean comparison.
   *
   * ADR-028: takes PolicyId branded type (not raw string). This method
   * WILL be added to scripts/check-policy-id-brand.ts REPO_TARGETS in
   * Plan 05-08.
   */
  hasGrant: async (
    s: OrgScope,
    userId: string,
    policyId: PolicyId,
  ): Promise<boolean> => {
    const rows = await s.tx
      .select({ c: sql<number>`COUNT(*)`.as('c') })
      .from(qaCitationGrants)
      .where(
        and(
          eq(qaCitationGrants.orgId, s.orgId),
          eq(qaCitationGrants.userId, userId),
          eq(qaCitationGrants.policyId, policyId),
        ),
      )
      .limit(1);
    return Number(rows[0]?.c ?? 0) > 0;
  },
};
