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

  // Phase 5 (Employee Portal) fills the body. Type signature is locked.
  record: (_s: OrgScope, _input: AcknowledgmentRecordInput) => {
    throw new Error('Not yet implemented — Phase 5 (Employee Portal)');
  },

  // NO update method. ADR-018 append-only.
  // NO delete method. ADR-018 append-only.
  // If you find yourself wanting to add one, STOP — read ADR-018 first.
};
