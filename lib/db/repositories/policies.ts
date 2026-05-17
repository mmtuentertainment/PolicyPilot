// lib/db/repositories/policies.ts
// L-03 + D-06: per-aggregate Policies repository. Methods take OrgScope first.
//
// RESEARCH Pitfall 6: this file MUST NOT import `db` from '@/lib/db'.
// Repositories receive scope.tx (the transaction-bound query handle from
// withOrgScope). Importing raw db would bypass both the transaction AND
// the JWT injection — RLS would not fire because the connection-string
// user is BYPASSRLS. Plan 02-06's scripts/check-db-imports.ts catches
// any future raw-db import in this directory.
//
// ADR-005: Policies.create input type omits `tldrSummary` — the field is
// populated at publish time by the AI summary call (Phase 4), never
// user-supplied. The D-07 type test (tests/types.ts) asserts the omit.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policies } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Input type for Policies.create. Drizzle's $inferInsert produces the
 * full insertable shape; we Omit five fields:
 * - `orgId`: set from scope.orgId, not user-controlled
 * - `id`: auto-generated (uuid default)
 * - `tldrSummary`: ADR-005 — populated at publish time by AI summary
 * - `createdAt`, `updatedAt`: defaultNow()
 */
type PolicyCreateInput = Omit<
  typeof policies.$inferInsert,
  'orgId' | 'id' | 'tldrSummary' | 'createdAt' | 'updatedAt'
>;

export const Policies = {
  listAll: (s: OrgScope) =>
    s.tx.select().from(policies).where(eq(policies.orgId, s.orgId)),

  findById: (s: OrgScope, id: string) =>
    s.tx
      .select()
      .from(policies)
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .limit(1),

  // Phase 3 (Admin UI) fills the body. Type signature is locked here so
  // tests/types.ts can assert ADR-005 from day one.
  create: (_s: OrgScope, _input: PolicyCreateInput) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },

  // Phase 3 stubs — placeholders for the lifecycle state machine.
  publish: (_s: OrgScope, _id: string) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },

  archive: (_s: OrgScope, _id: string) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },
};
