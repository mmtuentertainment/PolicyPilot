// lib/db/scoped.ts — L-01 (OrgScope + withOrgScope) per ADR-025.
//
// Bridges the OrgContext (auth-derived identity) into a per-request Drizzle
// transaction with the JWT claims injected via set_config so Supabase RLS
// policies (USING (org_id = auth.jwt()->>'org_id')) evaluate against the
// actual ctx.orgId. After SET LOCAL ROLE authenticated + set_config, both
// the application-layer `where(eq(table.orgId, scope.orgId))` AND the
// database-layer RLS fire on every user-facing repository query.
//
// This module is the second legitimate raw-`db` importer alongside
// lib/db/index.ts's webhook + cron + test-harness allow-list (ADR-023).
// scripts/check-db-imports.ts (Plan 02-06) MUST include this path in its
// ALLOWLIST.
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { OrgContext } from '@/lib/auth/context';

// PgTransaction<any, any, any> is Drizzle's documented transaction-handle
// type. Tightening via Parameters<typeof db.transaction>[0] produces a
// deep generic that doesn't re-export cleanly. Operator-approved exception
// to CLAUDE.md NEVER #4 (no `any`) per .planning/phases/02-data-layer/
// 02-CONTEXT.md <specifics> block #1. Single, audited, bounded `any` use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrgScope = OrgContext & { tx: PgTransaction<any, any, any> };

export async function withOrgScope<T>(
  ctx: OrgContext,
  fn: (scope: OrgScope) => Promise<T>,
): Promise<T> {
  return await db.transaction(async (tx) => {
    const claims = JSON.stringify({
      sub: ctx.userId,
      org_id: ctx.orgId,
      role: ctx.role,
    });
    // RESEARCH Pitfall 2: SET LOCAL ROLE authenticated MUST come first.
    // Without it, the connection-string `postgres` user keeps BYPASSRLS
    // and RLS never fires (RESEARCH Pitfall 1 — symmetric concern). The
    // `true` (is_local) arg to set_config is ALSO load-bearing: `false`
    // would leak claims across pooled connections to other users on the
    // Supabase Transaction pooler. See 02-RESEARCH.md "Pitfall 2:
    // set_config with is_local=false leaks JWT claims across users on a
    // transaction pool." postgresql.org docs confirm: "If is_local is
    // true, the new value will only apply during the current transaction"
    // — SET LOCAL resets at COMMIT or ROLLBACK regardless of pool reuse.
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    );
    return fn({ ...ctx, tx });
  });
}
