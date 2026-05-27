// lib/policies/acknowledgment.ts — Plan 05-04 Task 1 (D-10a + D-07 + D-08).
// Server-only orchestrator for the single ack-recording flow.
//
// This is the AUTHORITATIVE atomic write path for an acknowledgment.
// Plan 05-05's `acknowledgePolicyAction` is a thin Server Action wrapper;
// the transactional business logic lives here. The function:
//   1. Receives an already-resolved OrgContext from the caller (Server Action
//      bears the auth-bootstrap-error vs domain-error try/catch split per
//      Phase 3 D-09 — orchestrator does NOT call the context-bootstrap
//      helper itself).
//   2. Opens withOrgScope — one Drizzle transaction wrapping FOUR sub-
//      operations atomically per D-10a:
//        a. Policies.findById — read current policy (status + currentVersion)
//        b. PolicyAssignments.listForPolicy — resolve assignment match
//           (user OR dept; the user's department_id is sourced via an
//           inline sub-query — OrgContext does NOT carry departmentId per D-03)
//        c. PolicyVersions.findByVersionNumber — resolve target
//           policyVersionId from policies.current_version
//        d. Acknowledgments.record — INSERT ON CONFLICT DO NOTHING per D-06
//
//   Any throw inside the closure rolls back all 4 operations as one unit —
//   an editPublished landing mid-flight commits cleanly or rolls back
//   atomically. The schema UNIQUE on policy_versions(policy_id,
//   version_number) from 03-G3 T2/T3 makes the lookup deterministic.
//
// RESEARCH Pitfall 6: this file MUST NOT import raw `db` from '@/lib/db' —
// use withOrgScope's s.tx (via repository methods) so the JWT injection
// fires + RLS evaluates. scripts/check-db-imports.ts (Plan 02-06) catches
// any future raw-db import in lib/policies/.
//
// RESEARCH Pitfall 8 — D-10 silent-success: Acknowledgments.record returns
// `[]` on UNIQUE conflict. The orchestrator treats empty RETURNING as
// success (re-ack of the same version is semantically a no-op) and returns
// the existing-or-just-inserted row's acknowledgedAt timestamp. The
// Server Action (Plan 05-05) surfaces "Acknowledged ✓" identically to a
// fresh write per D-10.
//
// THROW SHAPE:
//   - PolicyNotFoundError — policies row missing (RLS denial OR truly
//     missing; D-10 "advertise nothing" — caller cannot distinguish)
//   - PolicyArchivedError (D-07) — policy.status !== 'published'
//   - PolicyNotAssignedError (D-08) — neither user-level nor dept-level
//     assignment row matches
//
// SCOPE (intentional non-features per Plan 05-04):
//   - NO post-commit hook (different from publish — no Anthropic call to
//     fire after an acknowledgment).
//   - NO outer try/catch — the Server Action owns error mapping.
//   - NO Next.js navigation/cache side-effects — Server Action owns those
//     per Phase 3 D-09 + the Next.js 15 outside-try requirement.
//   - NO internal context-bootstrap call — caller passes ctx so the
//     Server Action's outer try/catch can distinguish BootstrapError types
//     (auth bootstrap) from PolicyDomainError subclasses (domain errors).
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { withOrgScope } from '@/lib/db/scoped';
import type { OrgContext } from '@/lib/auth/context';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { PolicyAssignments } from '@/lib/db/repositories/policy_assignments';
import { Acknowledgments } from '@/lib/db/repositories/acknowledgments';
import {
  PolicyArchivedError,
  PolicyNotAssignedError,
  PolicyNotFoundError,
} from '@/lib/policies/errors';
import type { PolicyId } from '@/lib/policies/types';
import { acknowledgments, users } from '@/lib/db/schema';

/**
 * Plan 05-04 Task 1 — atomic record-an-acknowledgment orchestrator.
 *
 * Single withOrgScope tx per D-10a; throws typed PolicyDomainError subclasses
 * per D-07 / D-08; treats empty RETURNING as silent success per D-10 +
 * RESEARCH Pitfall 8.
 *
 * @param ctx - org-scoped Clerk auth context (resolved by caller per D-09)
 * @param policyId - branded PolicyId per ADR-028 (Server Action validates at
 *   trust boundary via PolicyIdSchema per D-10b; Plan 05-08 widened
 *   scripts/check-policy-id-brand.ts ORCH_TARGETS to add this orchestrator)
 * @param ipAddress - x-forwarded-for first hop trimmed per D-05; null on
 *   local dev (where Vercel edge stripping does not apply)
 * @returns `{ ackedAt: ISO 8601 string }` — the acknowledgedAt timestamp
 *   that the UI renders. Fresh ack returns the just-inserted RETURNING
 *   timestamp; idempotent re-ack returns the existing row's timestamp.
 */
export async function recordAcknowledgment(
  ctx: OrgContext,
  policyId: PolicyId,
  ipAddress: string | null,
): Promise<{ ackedAt: string }> {
  return await withOrgScope(ctx, async (s) => {
    // Step 1 — Load policy + assert status='published' (D-07).
    // Policies.findById is org-scoped (applies eq(policies.orgId, s.orgId)
    // at the repository layer) — RLS reinforces. Empty result = RLS denial
    // OR truly missing; we cannot distinguish per D-10 "advertise nothing".
    const rows = await Policies.findById(s, policyId);
    const policy = rows[0];
    if (!policy) throw new PolicyNotFoundError(policyId);
    if (policy.status !== 'published') throw new PolicyArchivedError(policyId);

    // Step 2 — Assignment check (D-08).
    // A user is assigned IFF EITHER:
    //   - (assignee_type='user'       AND assignee_id = s.userId)
    //   - (assignee_type='department' AND assignee_id = the user's
    //     department_id, looked up via the cheap sub-query below).
    //
    // The dept-id lives in users.department_id; resolve via an inline
    // sub-query (matches D-03 dashboard-query pattern — no OrgContext
    // extension). orgId predicate locks the lookup to the requesting
    // tenant (T-05-04-02 defense). users.department_id may be NULL for
    // department-less users; in that case no dept-level row matches per
    // standard SQL semantics (D-02).
    const userDeptResult = await s.tx
      .select({ deptId: users.departmentId })
      .from(users)
      .where(and(eq(users.id, s.userId), eq(users.orgId, s.orgId)))
      .limit(1);
    const userDeptId = userDeptResult[0]?.deptId ?? null;

    const assignments = await PolicyAssignments.listForPolicy(s, policyId);
    const matched = assignments.some(
      (a) =>
        (a.assigneeType === 'user' && a.assigneeId === s.userId) ||
        (a.assigneeType === 'department' &&
          userDeptId !== null &&
          a.assigneeId === userDeptId),
    );
    if (!matched) throw new PolicyNotAssignedError(policyId);

    // Step 3 — Resolve target policyVersionId from policies.current_version
    // (D-10a). The 03-G3 T2/T3 UNIQUE on policy_versions(policy_id,
    // version_number) makes the lookup deterministic; an editPublished
    // landing mid-tx either rolls back or commits as one unit.
    const pvRows = await PolicyVersions.findByVersionNumber(
      s,
      policyId,
      policy.currentVersion,
    );
    const pv = pvRows[0];
    // Race: pv missing → treat as 404 not 500. Should not happen given the
    // FK + currentVersion contract, but guard defensively.
    if (!pv) throw new PolicyNotFoundError(policyId);

    // Step 4 — INSERT ON CONFLICT DO NOTHING (D-06 + D-10).
    // Acknowledgments.record stamps orgId from scope (NEVER from input —
    // cross-org write defense). On a fresh ack returns length-1 array;
    // on the silent-success branch (already-acked at this version) returns
    // length-0 array per RESEARCH Pitfall 8.
    const inserted = await Acknowledgments.record(s, {
      userId: s.userId,
      policyId,
      policyVersionId: pv.id,
      ipAddress,
    });

    if (inserted.length === 0) {
      // D-10 silent-success — UNIQUE fired + ON CONFLICT DO NOTHING
      // swallowed. The ops-log line already fired inside Acknowledgments.record.
      // Look up the existing row for the timestamp we return to the UI.
      const existing = await s.tx
        .select({ acknowledgedAt: acknowledgments.acknowledgedAt })
        .from(acknowledgments)
        .where(
          and(
            eq(acknowledgments.orgId, s.orgId),
            eq(acknowledgments.userId, s.userId),
            eq(acknowledgments.policyId, policyId),
            eq(acknowledgments.policyVersionId, pv.id),
          ),
        )
        .limit(1);
      const ackedAt = existing[0]?.acknowledgedAt ?? new Date();
      return { ackedAt: ackedAt.toISOString() };
    }

    const fresh = inserted[0]!;
    return { ackedAt: (fresh.acknowledgedAt ?? new Date()).toISOString() };
  });
}
