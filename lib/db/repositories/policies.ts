// lib/db/repositories/policies.ts
// L-03 + D-06: per-aggregate Policies repository. Methods take OrgScope first.
//
// RESEARCH Pitfall 6: this file MUST NOT import the raw `db` barrel.
// Repositories receive scope.tx (the transaction-bound query handle from
// withOrgScope). Importing raw db would bypass both the transaction AND
// the JWT injection — RLS would not fire because the connection-string
// user is BYPASSRLS. Plan 02-06's scripts/check-db-imports.ts catches
// any future raw-db import in this directory.
//
// ADR-005: Policies.create input type omits `tldrSummary` — the field is
// populated at publish time by the AI summary call (Phase 4), never
// user-supplied. The D-07 type test (tests/types.ts) asserts the omit.
//
// Phase 3 Plan 03-04 (D-11): real bodies for create, findById, listAll,
// listWithFilters, updateDraft, incrementVersion, statusCounts. The Phase 2
// `publish` / `archive` throw-stubs are intentionally REMOVED — Plan 03-06's
// transition orchestrators do the transactional work directly via
// s.tx.update(policies) + PolicyVersions.create() inside withOrgScope.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import {
  acknowledgments,
  policies,
  policyAssignments,
  policyVersions,
  users,
} from '@/lib/db/schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PolicyStatus } from '@/lib/policies/state-machine';
import type { PolicyId } from '@/lib/policies/types';

/**
 * Input type for Policies.create. Drizzle's $inferInsert produces the
 * full insertable shape; we Omit six fields:
 * - `orgId`: set from scope.orgId, not user-controlled
 * - `id`: auto-generated (uuid default)
 * - `tldrSummary`: ADR-005 — populated at publish time by AI summary
 * - `currentVersion`: repository sets to 1 on create (lifecycle invariant)
 * - `status`: repository sets to 'draft' on create (lifecycle invariant)
 * - `createdAt`, `updatedAt`: defaultNow()
 */
type PolicyCreateInput = Omit<
  typeof policies.$inferInsert,
  | 'orgId'
  | 'id'
  | 'tldrSummary'
  | 'currentVersion'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

export const Policies = {
  listAll: (s: OrgScope) =>
    s.tx.select().from(policies).where(eq(policies.orgId, s.orgId)),

  /**
   * Phase 4 D-12 — published-policies library source for Q&A endpoint + the
   * Consistency Check batch payload composition.
   *
   * SELECT id, title, contentJson FROM policies WHERE org_id = scope.orgId
   *   AND status = 'published'.
   *
   * Returns ONLY id + title + contentJson — no admin metadata leak via the
   * Q&A path. Cross-org isolation: application-layer eq(orgId, s.orgId) +
   * RLS reinforces. Caller (Plan 04-09 Q&A endpoint) builds the validIds
   * Set + libraryXml block from the SAME query result inside the SAME
   * withOrgScope closure (per D-41) — never from a hoisted variable,
   * global, cross-org Set, or separate query.
   *
   * No PolicyId branded type on the return shape — listPublishedForOrg
   * takes NO policyId argument, so ADR-028's brand gate doesn't apply.
   * Caller branding (if needed downstream) happens at the trust boundary.
   */
  listPublishedForOrg: (s: OrgScope) =>
    s.tx
      .select({
        id: policies.id,
        title: policies.title,
        contentJson: policies.contentJson,
      })
      .from(policies)
      .where(
        and(
          eq(policies.orgId, s.orgId),
          eq(policies.status, 'published'),
        ),
      ),

  /**
   * Phase 5 D-01..D-04 — Employee dashboard list. Returns every published
   * policy assigned to the requesting user (directly via `assignee_type='user'`
   * OR transitively via their department `assignee_type='department'`).
   * Each row carries a 3-state `ackState` enum + `ackedAt` timestamp for
   * the current version, sufficient for the AckStatusBadge render branches
   * shipped in Plan 05-07.
   *
   * - SELECT DISTINCT dedupes when an admin targets the same user both
   *   individually AND via their department for the same policy (D-15
   *   schema permits both rows; D-01 collapses them at query time).
   * - Dept-id resolved via inline sub-select per D-03 — no OrgContext
   *   extension. Standard SQL `IN (NULL-returning subquery)` semantics
   *   give a dept-less user (`users.department_id IS NULL`) zero
   *   dept-level rows per D-02.
   * - Two LEFT JOIN acknowledgments aliases per D-04:
   *     - current_ack on the policies.current_version row → ackState='current'
   *     - prior_ack on any DIFFERENT version row → ackState='stale'
   *   CASE column collapses to a 3-state enum that the UI exhaustively
   *   switches over (PolicyStatusBadge precedent — TS catches missing
   *   cases at compile time).
   *
   * Cross-org defense (T-05-03-02): the dept-id sub-select includes
   * `users.orgId = s.orgId` predicate — a malicious userId parameter from
   * a different org returns NULL → `IN NULL` → row excluded. The composite
   * FK on `users(org_id, department_id) → departments(org_id, id)` is the
   * Postgres-level backstop. RLS is the last line of defense (ADR-019).
   *
   * Index path (Pitfall 7): the migration-0010 UNIQUE on
   * acknowledgments(user_id, policy_id, policy_version_id) auto-creates a
   * composite btree usable by BOTH join predicates — prior_ack uses
   * (user_id, policy_id) which is a PREFIX of the unique index. No new
   * index needed for Phase 5; Phase 8 dashboard query may revisit.
   *
   * No LIMIT clause — employee lists are bounded by the org's assignment
   * count; pagination deferred to Phase 8 reporting.
   *
   * @param s - org-scoped transaction handle (ADR-023)
   * @param userId - the employee whose dashboard is being rendered
   * @returns Promise of rows shaped { id, title, category, currentVersion,
   *   tldrSummary, ackState: 'none' | 'current' | 'stale', ackedAt: Date | null }
   */
  listAssignedAndPublishedForUser: async (s: OrgScope, userId: string) => {
    // D-03 — inline sub-select for the requesting user's departmentId.
    // OrgContext stays minimal (no departmentId field added). The orgId
    // predicate locks the lookup to the requesting tenant (T-05-03-02).
    const userDeptSubquery = sql`(SELECT ${users.departmentId} FROM ${users} WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId})`;
    // D-04 — two aliased joins on the same acknowledgments table.
    const currentAck = alias(acknowledgments, 'current_ack');
    const priorAck = alias(acknowledgments, 'prior_ack');
    return s.tx
      .selectDistinct({
        id: policies.id,
        title: policies.title,
        category: policies.category,
        currentVersion: policies.currentVersion,
        tldrSummary: policies.tldrSummary,
        ackState: sql<'none' | 'current' | 'stale'>`
          CASE
            WHEN ${currentAck.id} IS NOT NULL THEN 'current'
            WHEN ${priorAck.id}   IS NOT NULL THEN 'stale'
            ELSE 'none'
          END`.as('ack_state'),
        ackedAt: currentAck.acknowledgedAt,
      })
      .from(policies)
      .innerJoin(
        policyAssignments,
        and(
          eq(policyAssignments.policyId, policies.id),
          eq(policyAssignments.orgId, s.orgId),
          or(
            and(
              eq(policyAssignments.assigneeType, 'user'),
              eq(policyAssignments.assigneeId, userId),
            ),
            and(
              eq(policyAssignments.assigneeType, 'department'),
              sql`${policyAssignments.assigneeId} = ${userDeptSubquery}`,
            ),
          ),
        ),
      )
      .innerJoin(
        policyVersions,
        and(
          eq(policyVersions.policyId, policies.id),
          eq(policyVersions.versionNumber, policies.currentVersion),
          eq(policyVersions.orgId, s.orgId),
        ),
      )
      .leftJoin(
        currentAck,
        and(
          eq(currentAck.userId, userId),
          eq(currentAck.policyId, policies.id),
          eq(currentAck.policyVersionId, policyVersions.id),
        ),
      )
      .leftJoin(
        priorAck,
        and(
          eq(priorAck.userId, userId),
          eq(priorAck.policyId, policies.id),
          // distinct from current — any prior-version ack
          sql`${priorAck.policyVersionId} <> ${policyVersions.id}`,
        ),
      )
      .where(
        and(
          eq(policies.orgId, s.orgId),
          eq(policies.status, 'published'),
        ),
      );
  },

  findById: (s: OrgScope, id: PolicyId) =>
    s.tx
      .select()
      .from(policies)
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .limit(1),

  create: (s: OrgScope, input: PolicyCreateInput) =>
    s.tx
      .insert(policies)
      .values({
        ...input,
        orgId: s.orgId,
        createdBy: s.userId,
        status: 'draft',
        currentVersion: 1,
      })
      .returning(),

  /**
   * Admin policy library search. WHERE = eq(orgId)
   *   + optional eq(status)
   *   + optional (ilike(title) OR ilike(category)).
   * Orders by updatedAt DESC, hard LIMIT 100 per D-05 (T-03-04-05 acceptance).
   * Drizzle parameterizes the ilike pattern — no string concatenation
   * (T-03-04-02 mitigation).
   */
  listWithFilters: async (
    s: OrgScope,
    { q, status }: { q?: string; status?: PolicyStatus },
  ) => {
    const conditions = [eq(policies.orgId, s.orgId)];
    if (status) conditions.push(eq(policies.status, status));
    const baseWhere = and(...conditions);
    const where = q
      ? and(
          baseWhere,
          or(
            ilike(policies.title, `%${q}%`),
            ilike(policies.category, `%${q}%`),
          ),
        )
      : baseWhere;
    return s.tx
      .select()
      .from(policies)
      .where(where)
      .orderBy(desc(policies.updatedAt))
      .limit(100);
  },

  /**
   * In-place edit of a Draft policy (D-04). Does NOT change status; the
   * lifecycle state-machine in lib/policies/state-machine.ts owns
   * status transitions. updatedAt is bumped via `now()` SQL.
   * WHERE includes BOTH orgId AND id (T-03-04-04 mitigation).
   */
  updateDraft: (
    s: OrgScope,
    id: PolicyId,
    patch: { title?: string; category?: string; contentJson?: unknown },
  ) =>
    s.tx
      .update(policies)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .returning(),

  /**
   * Phase 4 D-09 — single-purpose AI-write companion to updateDraft.
   *
   * ADR-005: tldrSummary is AI-generated only — never accepted from
   * `create()` (omitted via PolicyCreateInput Omit) or `updateDraft()`
   * (patch type excludes tldrSummary). Plan 04-08's
   * `generateSummaryForPolicy` orchestrator calls this method after a
   * successful Haiku 4.5 summary completion + an AiGenerations.insert
   * audit-ledger row (one transaction).
   *
   * ADR-028: takes PolicyId branded type (not raw string) — caller goes
   * through policyIdFromString at the trust boundary (e.g., /api/ai/summary
   * request body Zod validation produces PolicyId via SummarySchema).
   *
   * WHERE includes BOTH orgId AND id (T-03-04-04 cross-org write defense).
   * updatedAt bumped via `now()` SQL so the post-publish render reflects
   * the new summary timestamp.
   */
  updateSummary: (s: OrgScope, id: PolicyId, summary: string) =>
    s.tx
      .update(policies)
      .set({ tldrSummary: summary, updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .returning(),

  /**
   * Atomic increment of currentVersion. Used by the edit-published
   * orchestrator (Plan 03-06) inside withOrgScope after writing a new
   * policy_versions row. Returns the new value for caller use.
   * WHERE includes BOTH orgId AND id (T-03-04-04 mitigation).
   */
  incrementVersion: (s: OrgScope, id: PolicyId) =>
    s.tx
      .update(policies)
      .set({
        currentVersion: sql`${policies.currentVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .returning({ currentVersion: policies.currentVersion }),

  /**
   * GROUP BY status with zero-filled defaults — feeds /dashboard tiles
   * (Plan 03-11). Returns a complete map of every PolicyStatus value
   * so the UI never has to defend against missing keys.
   */
  statusCounts: async (s: OrgScope) => {
    const rows = await s.tx
      .select({
        status: policies.status,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(policies)
      .where(eq(policies.orgId, s.orgId))
      .groupBy(policies.status);
    const out = {
      draft: 0,
      under_review: 0,
      published: 0,
      archived: 0,
    } as Record<PolicyStatus, number>;
    for (const r of rows) {
      if (r.status) out[r.status as PolicyStatus] = r.count;
    }
    return out;
  },
};
