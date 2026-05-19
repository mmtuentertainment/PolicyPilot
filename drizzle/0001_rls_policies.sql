-- drizzle/0001_rls_policies.sql
-- Phase 2 — Data Layer security DDL.
-- Generated empty via: pnpm db:generate:rls (registers in _journal.json per RESEARCH Pitfall 3).
-- Body added by Plan 02-03 Task 3.
--
-- For each of the 10 tenant-scoped tables:
--   1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--   2. CREATE POLICY "org_isolation" USING (org_id::text = auth.jwt()->>'org_id')
--      (`organizations` is special — uses `id::text` instead of `org_id::text`)
--   3. GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated  -- L-04: without GRANTs,
--      RLS-eligible queries from the authenticated role return permission-denied
--
-- `auth.jwt()->>'org_id'` returns text. The org_id columns are uuid.
-- The `::text` cast on the LHS makes uuid=text comparison valid
-- (RESEARCH LANDMINE near "auth.jwt()->>'org_id' returns text").
--
-- The two service-role-only tables (`clerk_events`, `stripe_events`) get NO RLS,
-- NO policy, NO GRANT — only the connection-string `postgres` user (BYPASSRLS)
-- writes/reads these, from the allow-listed webhook + cron files (ADR-023).
--
-- D-03a: users.org_id is nullable for the brief unmapped-membership window.
-- A CHECK constraint requires org_id to be populated within 5 minutes of created_at.

-- == organizations (special: predicate uses `id::text` not `org_id::text`) ==
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "organizations"
  FOR ALL USING (id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO authenticated;

-- == users ==
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "users"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO authenticated;
-- D-03a: nullable users.org_id only for the unmapped-membership window.
-- Stale-null audit lives in scripts/check-data-layer.ts (Plan 02-06).
ALTER TABLE "users"
  ADD CONSTRAINT "users_org_id_required_after_5min"
  CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes');

-- == departments ==
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "departments"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "departments" TO authenticated;

-- == policies ==
ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "policies"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "policies" TO authenticated;

-- == policy_versions (D-02 denormalization — has org_id on the row) ==
ALTER TABLE "policy_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "policy_versions"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "policy_versions" TO authenticated;

-- == policy_assignments (D-02 denormalization) ==
ALTER TABLE "policy_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "policy_assignments"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "policy_assignments" TO authenticated;

-- == acknowledgments (D-02 denormalization; ADR-018 append-only at app layer) ==
ALTER TABLE "acknowledgments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "acknowledgments"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "acknowledgments" TO authenticated;
-- Note: the GRANT includes UPDATE+DELETE for symmetry — ADR-018 append-only
-- is enforced at the TYPE-SYSTEM layer (Acknowledgments repository has no
-- update/delete methods, locked by tests/types.ts @ts-expect-error). The
-- DB layer accepts UPDATE/DELETE from authenticated; nothing reaches it.

-- == ai_generations ==
ALTER TABLE "ai_generations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "ai_generations"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_generations" TO authenticated;

-- == notifications (D-02 denormalization) ==
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "notifications"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "notifications" TO authenticated;

-- == workflow_stages (D-02 denormalization) ==
ALTER TABLE "workflow_stages" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "workflow_stages"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "workflow_stages" TO authenticated;

-- == NO RLS on service-role tables ==
-- clerk_events  — service-role only (Clerk webhook handler, allow-listed per ADR-023)
-- stripe_events — service-role only (Stripe webhook handler, Phase 6)
