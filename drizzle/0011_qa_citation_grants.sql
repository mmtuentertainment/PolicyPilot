-- drizzle/0011_qa_citation_grants.sql
-- Phase 5 D-29 — Q&A citation-referral grant table for R-6. Records
-- {org_id, user_id, policy_id} for every Anthropic-returned citation in
-- `askQuestion` (lib/ai/qa.ts) so that subsequent navigation to
-- /my-policies/[id] can render a TL;DR-only view for cited-but-not-assigned
-- policies (per D-27 access boundary). Non-expiring grants for MVP per
-- T-2(4c); Phase 7+ cleanup cron can prune via separate ADR if data volume
-- warrants.
--
-- Operator approved via /gsd-discuss-phase 5 --power ultrathink-tightening
-- T-2(4c) (2026-05-23, per .planning/phases/05-employee-portal/05-CONTEXT.md
-- `<decisions>` D-26 + D-29). CLAUDE.md ASK-FIRST cleared per
-- .planning/STATE.md pre-paying-customer status — no production data exists.
--
-- CRITICAL CORRECTNESS NOTE:
-- The RLS predicate below uses the post-0008 `(SELECT auth.jwt()->>'org_id')`
-- wrapped form, NOT the unwrapped baseline. See
-- .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 1 — the
-- splinter lint rule `0003_auth_rls_initplan` fires on the unwrapped form
-- AND per-row JWT eval kills scale on the new table. Mirrors the wrapped
-- form applied to all 11 prior tenant tables by 0008_rls_subquery_wrap.sql.
--
-- BACKWARD COMPATIBILITY:
-- ADDITIVE — new table only; no existing schema objects mutated. Existing
-- RLS policies on the 11 prior tables are untouched (0008 already wrapped
-- those). New table joins the tenant-scoped set; Plan 05-08 extends
-- scripts/check-rls.ts TENANT_TABLES to add it.

CREATE TABLE "qa_citation_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qa_citation_grants_org_user_policy_unique" UNIQUE("org_id","user_id","policy_id")
);
--> statement-breakpoint
ALTER TABLE "qa_citation_grants" ADD CONSTRAINT "qa_citation_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "qa_citation_grants" ADD CONSTRAINT "qa_citation_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "qa_citation_grants" ADD CONSTRAINT "qa_citation_grants_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "qa_citation_grants_org_id_idx" ON "qa_citation_grants" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "qa_citation_grants_user_policy_idx" ON "qa_citation_grants" USING btree ("user_id","policy_id");
--> statement-breakpoint

-- Phase 5 D-29 RLS + GRANT (hand-written; Drizzle does not emit ENABLE RLS /
-- CREATE POLICY / GRANT). Wrapped form per RESEARCH gap-1.
ALTER TABLE "qa_citation_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation" ON "qa_citation_grants"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "qa_citation_grants" TO authenticated;
