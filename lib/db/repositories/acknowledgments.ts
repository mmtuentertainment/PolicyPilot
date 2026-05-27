/**
 * lib/db/repositories/acknowledgments.ts
 * L-03 + D-06: per-aggregate Acknowledgments repository.
 *
 * ADR-018 — APPEND ONLY. This object MUST NOT export `update` or `delete`
 * keys (not even unimplemented stubs). The type system enforces the
 * invariant at compile time; tests/types.ts (D-07) carries the
 * `@ts-expect-error` assertions that fail tsc if either key is ever added.
 * (Block-comment form intentional: TypeScript scans `//`-comments for
 * `@ts-expect-error` directives; a JSDoc block is safely ignored.)
 *
 * RESEARCH Pitfall 6: this file MUST NOT import `db` from '@/lib/db'.
 * See lib/db/repositories/policies.ts header for the full rationale.
 */
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { acknowledgments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Input type for Acknowledgments.record. Drizzle's $inferInsert; we Omit:
 * - `orgId`: set from scope.orgId
 * - `id`: auto-generated
 * - `acknowledgedAt`: defaultNow()
 */
type AcknowledgmentRecordInput = Omit<
  typeof acknowledgments.$inferInsert,
  'orgId' | 'id' | 'acknowledgedAt'
>;

export const Acknowledgments = {
  listForUser: (s: OrgScope, userId: string) =>
    s.tx
      .select()
      .from(acknowledgments)
      .where(
        and(
          eq(acknowledgments.orgId, s.orgId),
          eq(acknowledgments.userId, userId),
        ),
      ),

  /**
   * Phase 5 D-06 + D-10 — append an acknowledgment row, idempotent on the
   * (user_id, policy_id, policy_version_id) UNIQUE constraint added by
   * migration 0010. Returns the inserted array — length 1 on a fresh ack,
   * length 0 on duplicate (the UNIQUE fired + ON CONFLICT DO NOTHING
   * swallowed the row). Caller orchestrator (lib/policies/acknowledgment.ts
   * in Plan 05-04) treats `length === 0` as silent success per D-10; the
   * Server Action surfaces "Acknowledged ✓" identically to a fresh write.
   *
   * orgId comes from OrgScope (NEVER from input — defense against
   * cross-org writes; the UNIQUE intentionally omits org_id because the
   * 3 UUIDs already imply org via composite FK).
   *
   * D-10 silent-success observability: console.log on the no-op branch
   * gives ops a single-line signal for monitoring unusual duplicate-ack
   * rates (would indicate a double-submit UI bug or replay).
   *
   * SUCCESS-ONLY semantic (mirrors D-06 / ai_generations): a thrown
   * Anthropic-style upstream error halts before the INSERT — no partial
   * audit row written.
   */
  record: async (s: OrgScope, input: AcknowledgmentRecordInput) => {
    const inserted = await s.tx
      .insert(acknowledgments)
      .values({ ...input, orgId: s.orgId })
      // D-06 — UNIQUE(user_id, policy_id, policy_version_id) from migration
      // 0010 fires the conflict. D-10 silent-success: empty RETURNING array
      // on duplicate is treated as success (orchestrator + Server Action
      // both return ok=true). UNIQUE intentionally omits org_id — the 3
      // UUIDs already imply org via composite FK.
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      console.log('[ack] no-op (already acked)', {
        userId: s.userId,
        policyId: input.policyId,
      });
    }
    return inserted;
  },

  // NO update method. ADR-018 append-only.
  // NO delete method. ADR-018 append-only.
  // If you find yourself wanting to add one, STOP — read ADR-018 first.
};
