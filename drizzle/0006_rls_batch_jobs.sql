-- Phase 4 D-29 — RLS for the new batch_jobs table (ai-layer consistency-check state).
-- Mirrors the 10-table pattern from drizzle/0001_rls_policies.sql per ADR-025.
-- Cross-org isolation verified by scripts/check-rls.ts extension in Plan 04-10 (AC-24).

-- 1. enable RLS (without this, the policy installs but is never evaluated)
ALTER TABLE "batch_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. org_isolation policy — mirrors all tenant tables per ADR-025
CREATE POLICY "org_isolation" ON "batch_jobs"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
--> statement-breakpoint

-- 3. grant DML to authenticated role (required by withOrgScope's SET LOCAL ROLE)
GRANT SELECT, INSERT, UPDATE, DELETE ON "batch_jobs" TO authenticated;
--> statement-breakpoint

-- 4. org_id NOT NULL enforced at DDL via .notNull() in lib/db/schema.ts batchJobs declaration
--    (no explicit ALTER COLUMN here — the CREATE TABLE in 0005 already emits NOT NULL).
