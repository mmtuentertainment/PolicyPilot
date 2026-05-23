-- drizzle/0009_org_id_indexes.sql
-- Phase 4.5 deploy-prep — btree(org_id) indexes on 9 tenant-scoped tables
-- (from .wiki/supabase research, 2026-05-22).
-- Drizzle-generated via lib/db/schema.ts updates; originally
-- 0009_lovely_lyja.sql, renamed for semantic clarity 2026-05-22.
--
-- WHAT
-- Adds a regular btree index on `org_id` to every tenant-scoped table whose
-- existing index coverage doesn't already lead with org_id.
--
-- COVERAGE RATIONALE — why these 9 tables, not all 11
--   - organizations: NO `org_id` column (it IS the org). RLS predicate filters
--     on `id::text` and the PK already provides that index.
--   - departments: has UNIQUE(org_id, id) composite from D-02 (composite-FK
--     target for users.department_id). The unique's leading column is org_id,
--     so it answers `WHERE org_id = $1` as a btree-leading-column lookup. No
--     additional index needed.
--
-- The 9 tables below all have either NO third-arg index entries (acknowledgments,
-- ai_generations, batch_jobs, notifications, policies, policy_assignments,
-- workflow_stages) OR existing constraints whose leading column is NOT org_id
-- (policy_versions's unique on (policy_id, version_number); users's composite
-- FK on (org_id, department_id) — and here, while the FK technically does
-- lead with org_id, Postgres does NOT auto-create a single-column index from
-- a composite FK, so the org-only filter still needs its own btree).
--
-- ai_generations note: the 0007 partial-unique `ai_generations_org_idempotency_key`
-- on (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL only covers
-- rows with a non-null key. The bulk `WHERE org_id = $1` filter — including
-- every RLS-policy evaluation — needs a regular btree.
--
-- INTERACTION WITH 0008
-- 0008 changes RLS policy USING from `org_id::text = auth.jwt()->>'org_id'`
-- to `org_id::text = (SELECT auth.jwt()->>'org_id')`. The `::text` cast on
-- the column still prevents the planner from using a uuid btree index for
-- the RLS predicate itself. However, these indexes immediately benefit:
--   1. App-layer OrgScope queries: `eq(table.orgId, ctx.orgId)` — uuid=uuid,
--      uses the btree directly.
--   2. A future migration (potential 0010) that flips cast direction to
--      `org_id = (SELECT auth.jwt()->>'org_id')::uuid` would then also
--      benefit on the RLS predicate.
--
-- BACKWARD COMPATIBILITY
-- ADDITIVE — pure CREATE INDEX. No data is read, written, or deleted. Index
-- creation locks the table briefly (ACCESS EXCLUSIVE during the catalog
-- update, then no further locking for the build because of small data size
-- pre-paying-customer). On tables with large row counts at production scale,
-- this would warrant CREATE INDEX CONCURRENTLY; not needed for our current
-- footprint per CLAUDE.md "pre-paying-customer" stance.
--
-- See: .wiki/supabase/04-rls-multitenant.md for the full research trail.

CREATE INDEX "acknowledgments_org_id_idx" ON "acknowledgments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ai_generations_org_id_idx" ON "ai_generations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "batch_jobs_org_id_idx" ON "batch_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notifications_org_id_idx" ON "notifications" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "policies_org_id_idx" ON "policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "policy_assignments_org_id_idx" ON "policy_assignments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "policy_versions_org_id_idx" ON "policy_versions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "users_org_id_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "workflow_stages_org_id_idx" ON "workflow_stages" USING btree ("org_id");
