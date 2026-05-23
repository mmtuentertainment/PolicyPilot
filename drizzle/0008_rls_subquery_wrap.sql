-- drizzle/0008_rls_subquery_wrap.sql
-- Phase 4.5 deploy-prep — RLS initPlan optimization (from .wiki/supabase research, 2026-05-22).
-- Generated empty via: drizzle-kit generate --custom --name=rls_subquery_wrap.
-- Body added 2026-05-22 per operator approval to proceed with research-derived
-- migration 0008 (subquery-wrap rewrite).
--
-- WHAT
-- Wraps every org_isolation policy's `auth.jwt()->>'org_id'` call in a
-- `(SELECT …)` subquery. This triggers Postgres's `initPlan` optimization:
-- the JWT call evaluates ONCE per statement (subplan node) instead of ONCE
-- PER ROW. Documented speedup: 94.97–99.993% on multi-thousand-row queries
-- per supabase.com/docs/guides/database/postgres/row-level-security#performance.
--
-- The `splinter` lint rule `0003_auth_rls_initplan` flags the unwrapped
-- pattern as a perf gap — pre-migration baseline: ALL 11 policies flagged.
--
-- WHY ALTER POLICY (not DROP+CREATE)
-- ALTER POLICY mutates the USING predicate atomically. DROP+CREATE has a
-- transactional window (which inside a single migration is moot, since
-- Postgres DDL is transactional), but ALTER produces less churn in the
-- pg_policies catalog and preserves the policy's identity for auditing.
--
-- SCOPE BOUNDARIES — what this migration intentionally does NOT change
--   1. Cast direction. We preserve `org_id::text = text` rather than
--      switching to `org_id = (text)::uuid`. The uuid-cast direction is
--      faster (uses btree index on org_id, see 0009) BUT errors hard on a
--      malformed JWT instead of silently returning false. That behavior
--      change deserves its own migration after we audit auth.jwt() shape
--      invariants in the asAppRole code path. Tracked for potential 0010.
--   2. Per-command split. Policies remain `FOR ALL`. A future migration
--      may split into SELECT/INSERT/UPDATE/DELETE with explicit WITH CHECK,
--      tightening the surface for write-side validation. Not in scope here.
--   3. WITH CHECK. Currently omitted; Postgres defaults WITH CHECK to USING
--      when omitted (postgresql.org/docs/current/sql-createpolicy.html), so
--      INSERT/UPDATE behavior is unchanged.
--
-- BACKWARD COMPATIBILITY
-- ADDITIVE behavior. Same set of rows passes the predicate as before; only
-- the evaluation strategy changes. Application code, RLS test fixtures,
-- and the `auth.jwt()`/`asAppRole` GUC plumbing all continue to work
-- unchanged. No data is read, written, or deleted.
--
-- VERIFICATION
-- After applying, EXPLAIN ANALYZE on a tenant-scoped SELECT should show
-- `InitPlan 1 (returns $0)` node BEFORE the row-source nodes. Without
-- the subquery wrap, the `auth.jwt()` call appears in the Filter expression
-- and re-evaluates per row.
--
-- See: .wiki/supabase/04-rls-multitenant.md for the full research trail.

ALTER POLICY "org_isolation" ON "organizations"
  USING (id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "users"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "departments"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "policies"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "policy_versions"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "policy_assignments"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "acknowledgments"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "ai_generations"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "notifications"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "workflow_stages"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "batch_jobs"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
