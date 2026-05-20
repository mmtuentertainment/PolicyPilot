-- 03-G3 T3 — Add UNIQUE(policy_id, version_number) to policy_versions.
-- The constraint is the belt-and-suspenders backstop for the restore()
-- currentVersion bump shipped in T1 (commit 437b77d). Even if a future
-- code change re-introduces the bump skip OR direct SQL bypasses the
-- orchestrators, the schema rejects duplicate version_number rows per
-- policy. See .planning/debug/duplicate-policy-version.md for full
-- diagnose of the DUP-VN bug surfaced during UAT-3.
--
-- Self-healing pre-step: drop accidental duplicate version_number rows
-- accumulated under the pre-T1 restore→publish path. Keeps the oldest
-- row per (policy_id, version_number) pair (audit-trail intent: the
-- earliest snapshot is the canonical record; later duplicates are
-- spurious artifacts of the missing currentVersion bump).
--
-- Safe to run on a DB with no duplicates — the DELETE is a no-op.
DELETE FROM policy_versions a
USING policy_versions b
WHERE a.policy_id = b.policy_id
  AND a.version_number = b.version_number
  AND a.created_at > b.created_at;
--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_version_number_unique" UNIQUE("policy_id","version_number");
