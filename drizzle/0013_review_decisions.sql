-- drizzle/0013_review_decisions.sql
-- Phase 9 (R-017) — append-only reviewer-decision audit ledger (②b data model).
-- Operator-approved §13(a)=②b 2026-06-04 (session 16), decision D-09-01.
--   CLAUDE.md ASK-FIRST (schema change after Phase 2) cleared by D-09-01.
--   ADDITIVE ONLY — new table; no existing column/constraint/table/data modified.
--   NOT destructive (no DROP / REVOKE / NOT NULL-on-existing) → no destructive-
--   migration ceremony required; this header records the approval per migration
--   discipline. Pre-paying-customer status per .planning/STATE.md.
--
-- DATA MODEL (②b): workflow_stages stays the mutable current-state projection
-- (drives the reviewer queue via listPendingForReviewer); review_decisions is
-- the immutable ledger of every Approve/Reject. Both written atomically in one
-- tx (recordReviewDecision, lib/policies/transitions.ts).
--
-- APPEND-ONLY is enforced at the APP layer (ADR-018), NOT the DB:
--   - lib/db/repositories/review_decisions.ts exposes insert+select only.
--   - scripts/check-acknowledgment-immutability.ts IMMUTABLE_TABLES + the
--     ts-morph AST gate + raw-SQL regex + --self-test fixture cover this table.
--   - tests/types.ts pins the no-update / no-delete compile-time invariant.
--   The GRANT below intentionally includes UPDATE+DELETE for RLS symmetry
--   (mirrors acknowledgments / qa_citation_grants; see 0001:65-73). DB-level
--   REVOKE / FORCE RLS is the deferred ASK-FIRST hardening, not shipped here.
--
-- RLS: wrapped (SELECT auth.jwt()->>'org_id') form per 0008_rls_subquery_wrap.
-- Drizzle does NOT emit ENABLE RLS / CREATE POLICY / GRANT — hand-written below
-- (mirrors drizzle/0011_qa_citation_grants.sql). review_decisions is added to
-- scripts/check-rls.ts TENANT_TABLES.
--
-- NOTE: `pnpm db:generate` also re-proposed the Phase 6 organizations billing
-- columns (a snapshot-drift artifact — 0012_billing_state.sql was hand-written
-- and added them with IF NOT EXISTS without updating the drizzle meta snapshot;
-- this generate run healed the snapshot). Those columns already exist on every
-- environment, so the re-add statements were intentionally removed from this
-- migration. The 0013 meta snapshot now reflects the full schema.

CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_stage_id_workflow_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_decisions_org_id_idx" ON "review_decisions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "review_decisions_policy_id_idx" ON "review_decisions" USING btree ("policy_id");--> statement-breakpoint

-- Phase 9 D-09-01 RLS + GRANT (hand-written; Drizzle does not emit). Wrapped form per 0008.
ALTER TABLE "review_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_isolation" ON "review_decisions"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "review_decisions" TO authenticated;
