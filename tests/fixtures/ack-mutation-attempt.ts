// tests/fixtures/ack-mutation-attempt.ts — Plan 05-08 Task 1b (D-20).
//
// NEGATIVE-CONTROL fixture for scripts/check-acknowledgment-immutability.ts
// --self-test mode. Intentionally violates ADR-018 append-only spirit for
// both acknowledgments and qa_citation_grants by both:
//   1. Calling .update(table) — Drizzle-API CallExpression (Sub-pass 1)
//   2. Calling sql`UPDATE table ...` — raw-SQL template literal
//      (Sub-pass 2 per EAPI advisor H-1 closure)
//
// The self-test mode of the gate scans THIS FILE and exits 0 ONLY when
// BOTH detection paths fire (>= 2 violations with both hasDrizzle &&
// hasRawSql flags set).
//
// DO NOT IMPORT OR CALL FROM PRODUCTION CODE.
// DO NOT EXECUTE — this is a STATIC fixture for AST scanning; the function
// bodies are unreachable at runtime.
//
// The production gate's default-mode glob (lib/**/*.ts) EXCLUDES
// tests/fixtures/** so this file does not trigger the production gate
// per D-19.
//
// EAPI advisor H-1 context: Phase 2 drizzle/0001_rls_policies.sql:69 GRANTs
// UPDATE + DELETE on acknowledgments to the authenticated role (mandatory
// for RLS symmetry). The DB layer therefore does NOT block raw-SQL
// mutations; the ts-morph gate (Sub-pass 2 regex) is the sole runtime
// defense. The deferred 0012 REVOKE migration would close the gap at the
// DB layer (ASK-FIRST per CLAUDE.md).
import 'server-only';
import { sql } from 'drizzle-orm';
import { acknowledgments, qaCitationGrants } from '@/lib/db/schema';

type FakeTx = {
  update: (t: typeof acknowledgments | typeof qaCitationGrants) => {
    set: (v: Record<string, unknown>) => Promise<unknown>;
  };
  execute: (q: unknown) => Promise<unknown>;
};

// Violation 1: Drizzle-API .update(acknowledgments) — Sub-pass 1 AST walk
// MUST detect this via PropertyAccessExpression + Identifier-symbol resolution.
export function _violationFixtureDrizzle(tx: FakeTx) {
  return tx.update(acknowledgments).set({});
}

// Violation 2: Raw-SQL bypass — Sub-pass 2 regex (EAPI advisor H-1 closure).
// Phase 2 drizzle/0001_rls_policies.sql:69 GRANTs UPDATE + DELETE to the
// authenticated role so this would succeed at DB level; the ts-morph gate
// regex scan is the sole runtime defense for raw-SQL mutations.
export function _violationFixtureRawSql(tx: FakeTx) {
  return tx.execute(sql`UPDATE acknowledgments SET ip_address = '0.0.0.0'`);
}

// Violation 3: Drizzle-API .update(qaCitationGrants) — proves the same AST
// path catches the Phase 5 write-once grant table.
export function _violationFixtureGrantDrizzle(tx: FakeTx) {
  return tx.update(qaCitationGrants).set({});
}

// Violation 4: Raw-SQL bypass for qa_citation_grants.
export function _violationFixtureGrantRawSql(tx: FakeTx) {
  return tx.execute(sql`DELETE FROM qa_citation_grants WHERE true`);
}
