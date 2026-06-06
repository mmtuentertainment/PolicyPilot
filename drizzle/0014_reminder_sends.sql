-- drizzle/0014_reminder_sends.sql
-- Phase 7 D-05 / R7-2 - additive send-ledger table for cron reminder dedup.
-- Operator-approved 2026-06-05 via Phase 7 Codex execution brief, decision D-05.
--   CLAUDE.md ASK-FIRST (schema change after Phase 2) cleared by Matthew's
--   Phase 7 execution authorization. Apply to dev/TEST only in this phase;
--   staging/prod remain operator-gated by the migration discipline.
--   ADDITIVE ONLY - new table; no existing column/constraint/table/data modified.
--   NOT destructive (no DROP / REVOKE / NOT NULL-on-existing).
--
-- RATIONALE: enforce at-most-once notification/email attempts per
-- (org_id, user_id, policy_id, type, window_date) for daily review_due and
-- ack_reminder cron windows. Counts are committed ledger/notification rows.
--
-- RLS: wrapped (SELECT auth.jwt()->>'org_id') form per 0008_rls_subquery_wrap.
-- Drizzle does NOT emit ENABLE RLS / CREATE POLICY / GRANT - hand-written below.

CREATE TABLE "reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"type" text NOT NULL,
	"window_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_sends_dedup_key" UNIQUE("org_id","user_id","policy_id","type","window_date")
);
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "reminder_sends_org_id_idx" ON "reminder_sends" USING btree ("org_id");
--> statement-breakpoint

ALTER TABLE "reminder_sends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation" ON "reminder_sends"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "reminder_sends" TO authenticated;
