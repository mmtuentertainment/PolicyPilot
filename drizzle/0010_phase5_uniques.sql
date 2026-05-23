-- drizzle/0010_phase5_uniques.sql
-- Phase 5 D-28 combined migration. Adds two UNIQUE constraints (additive only,
-- no DROP).
--
-- Operator approved via /gsd-discuss-phase 5 --power answers Q-22(a) + Q-23(a)
-- (2026-05-23, per .planning/phases/05-employee-portal/05-CONTEXT.md
-- `<decisions>` D-28). CLAUDE.md ASK-FIRST cleared per .planning/STATE.md
-- pre-paying-customer status — no production data exists; cannot fail on
-- duplicate-row conflict. The bundled-migration pattern mirrors Phase 4's
-- drizzle/0007_ai_generations_audit_extensions.sql.
--
-- Rationale:
--   * D-06 drives DB-enforced idempotency for `Acknowledgments.record`
--     (ON CONFLICT DO NOTHING on the new UNIQUE).
--   * D-15 drives DB-enforced idempotency for `PolicyAssignments.create`
--     (admin double-click safe).
--
-- Auto-creates btree indexes covering both UNIQUE column-tuples — Phase 5
-- D-01 LEFT JOIN dashboard query in
-- `Policies.listAssignedAndPublishedForUser` exploits the prefix
-- (user_id, policy_id) of the acknowledgments UNIQUE for its current_ack +
-- prior_ack JOIN predicates (per RESEARCH Pitfall 7 — no additional index
-- needed at MVP scale).

ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_user_id_policy_id_policy_version_id_unique" UNIQUE("user_id","policy_id","policy_version_id");
--> statement-breakpoint
ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_policy_id_assignee_type_assignee_id_unique" UNIQUE("policy_id","assignee_type","assignee_id");
