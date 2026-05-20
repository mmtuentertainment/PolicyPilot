---
slug: duplicate-policy-version
status: root_cause_confirmed
trigger: Republishing a previously-published-then-archived policy creates a duplicate policy_versions row with the same version_number. Reproduced live during UAT-3 Phase A on policy 41ab9db4-f328-4fdd-b3f5-c29739e7a28b — walked Draft→Published→Archived→Draft(restore)→Published; policy_versions now has TWO rows both with version_number=1, policies.current_version=1.
created: 2026-05-20T11:10:00Z
updated: 2026-05-20T12:00:00Z
phase: 3
diagnose_only: true
---

# Debug Session: duplicate-policy-version

## Symptoms

- **expected:** Republishing a policy that was previously published and then archived should either (a) be a no-op for policy_versions (idempotent re-issue of same vN), or (b) snapshot at v(N+1). The current `policy_versions` ledger should have a stable, unique (policy_id, version_number) lineage that an auditor can read without ambiguity.

- **actual:** After the cycle Draft→Published→Archived→Draft(via restore)→Published, `policy_versions` contains TWO rows for the same policy, both with `version_number=1`, distinguishable only by `id` (UUID) and `created_at` timestamp. `policies.current_version` is still 1. Live evidence on policy `41ab9db4-f328-4fdd-b3f5-c29739e7a28b`:
  ```
  [
    { "id": "6f272452-1330-40ac-b473-46f8a8133820", "version_number": 1, "created_at": "2026-05-20T10:55:23.016Z", "change_summary": null },
    { "id": "0a066929-81b8-433a-800b-80a3389ada1d", "version_number": 1, "created_at": "2026-05-20T11:03:09.787Z", "change_summary": null }
  ]
  ```

- **error_messages:** None — no exception thrown, no constraint violation. Silent data duplication.

- **timeline:** Surfaced 2026-05-20 during UAT-3 of Phase 3 (Admin UI). The transition orchestrators landed in Plan 03-06 (commit `efa124f`). Behavior would have shipped from initial Phase 3 merge; this is the first end-to-end UAT exercising the Publish→Archive→Restore→Publish cycle.

- **reproduction:** Deterministic. 
  1. Create a Draft policy
  2. Click Actions → Publish → confirm (transitions Draft → Published; orchestrator inserts policy_versions row with version_number = currentVersion = 1)
  3. Click Actions → Archive → confirm (Published → Archived; no version row written)
  4. Click Actions → Restore as draft (Archived → Draft; no version row written, currentVersion NOT bumped)
  5. Click Actions → Publish → confirm (Draft → Published; orchestrator inserts ANOTHER row with version_number = currentVersion = 1, because currentVersion was never bumped after step 2)

## Code references

- `lib/policies/transitions.ts:149-159` — `publishPolicy` snapshots: `versionNumber: policy.currentVersion` and does NOT bump after insert.
- `lib/policies/transitions.ts:185-194` — `restore` only flips `status: 'draft'`; comment claims *"admin must edit and re-publish to land a new v(N+1); restore is just an unarchive"* — but the state machine surfaces the Publish option directly from Draft, so the UI does NOT enforce the edit step.
- `lib/policies/transitions.ts:213-242` — `editPublished` DOES bump `currentVersion: policy.currentVersion + 1`, which is the contractual hook for "next publish writes v(N+1)". Restore has no equivalent bump.
- `lib/db/schema.ts:139+` — `policy_versions` table has no `UNIQUE(policy_id, version_number)` constraint. Schema permits the duplicate.
- `lib/db/schema.ts:42` — `acknowledgments.policy_version_id` is a UUID FK to `policy_versions.id`, not to `(policy_id, version_number)`. So direct ack correctness is preserved despite the ambiguity.

## Current Focus

- **hypothesis:** CONFIRMED. See Resolution.

## Evidence

- timestamp: 2026-05-20T10:55:23Z — Initial Publish from UAT-2 inserted first v1 row (id 6f272452, change_summary=null)
- timestamp: 2026-05-20T10:55-11:03 — UAT-2 Archive: status→archived, NO policy_versions row inserted (consistent with archive orchestrator contract)
- timestamp: 2026-05-20T11:03:09Z — UAT-3 Phase A Restore + Publish: status→draft→published, second v1 row inserted (id 0a066929, change_summary=null). `policies.current_version` still 1 — no bump occurred from either restore or publish.
- file-evidence: transitions.ts:185-194 — `restore()` writes only `{ status: 'draft', updatedAt: sql\`now()\` }` — no `currentVersion` increment.
- file-evidence: transitions.ts:145-163 — `publish()` always snapshots at `policy.currentVersion` with no pre-check for an existing row with that version_number.
- file-evidence: schema.ts:139-148 — `policyVersions` table definition has no `unique()` constraint on `(policyId, versionNumber)`. The Drizzle `unique` import exists but is used only on `departments` (line 84).
- file-evidence: transitions.test.ts:229-250 — The `archive + restore` describe block tests restore→draft flip and archive illegal-transition but has NO test that chains restore→publish and asserts no duplicate version_number is created.
- file-evidence: state-machine.test.ts — Tests the transition DAG correctness (16 cases) and IllegalTransitionError shape; has no concern with policy_versions mutation semantics.
- file-evidence: transitions.ts:213-242 — `editPublished()` bumps `currentVersion` at line 237 (`currentVersion: policy.currentVersion + 1`). This is the ONLY site in transitions.ts that increments the version counter. `restore()` has no equivalent.

## Eliminated

- "Bug in archive orchestrator": archive() at transitions.ts:170-179 writes only `{ status: 'archived' }`. This is correct and intentional — no version row on archive.
- "Bug in canTransition / state-machine": The state machine correctly allows `archived → draft` and `draft → published`. The logic is sound; the invariant violation is upstream in version bookkeeping.
- "Acknowledgment data corruption": schema.ts:42 confirms `acknowledgments.policy_version_id` FKs to `policy_versions.id` (UUID), not to `(policy_id, version_number)`. Existing acks point to specific UUIDs and are unaffected by the duplicate row. Direct ack correctness is preserved.
- "Bug in the first Publish": The first publish is correct. It inserts version_number=1 at currentVersion=1. The bug manifests only on the second publish after restore.

## Resolution

### Root Cause (CONFIRMED)

**One-sentence summary:** `restore()` (archived→draft) does not increment `currentVersion`, so a subsequent `publish()` re-snapshots at the already-used version number, silently creating a duplicate `(policy_id, version_number)` row because no schema-level uniqueness constraint exists.

**Detailed chain:**

1. `publish()` at `transitions.ts:154` snapshots `versionNumber: policy.currentVersion` unconditionally. It does not check whether a `policy_versions` row for that `(policyId, versionNumber)` already exists.
2. `restore()` at `transitions.ts:188-192` updates only `{ status: 'draft', updatedAt }`. It does NOT increment `currentVersion`. The code comment at line 183 says "admin must edit and re-publish to land a new v(N+1); restore is just an unarchive" — documenting the intended invariant that an `editPublished` step will bump the counter before the next publish.
3. The state machine at `state-machine.ts:22-27` permits `draft → published` directly (no `editPublished` required), so the UI presents the Publish button after a restore without forcing an edit.
4. The schema at `schema.ts:139-148` has no `UNIQUE(policy_id, version_number)` constraint on `policy_versions`. The database therefore accepts the duplicate insert silently (no exception, no constraint violation).
5. The result: two `policy_versions` rows share `(policy_id='41ab9db4...', version_number=1)` with different UUIDs and `created_at` timestamps. `policies.current_version` remains 1.

**The invariant that was broken:** `restore()` relies on `editPublished()` being called before the next `publish()`, but nothing in the code, state machine, or schema enforces this sequencing. The assumption is only expressed in a source comment.

---

### Fix Options (Ranked)

**Option A — `restore()` bumps `currentVersion` eagerly (RECOMMENDED)**

- In `transitions.ts`, change `restore()`'s `s.tx.update` set-clause to include `currentVersion: sql\`current_version + 1\`` (or `policy.currentVersion + 1`).
- Semantics: "restoring from archive begins a new version cycle." The next `publish()` will land at v(N+1), matching the `editPublished` pattern.
- Mirrors `editPublished` exactly: `editPublished` bumps on the transition INTO draft; `restore` is also a transition INTO draft from a previously-published state.
- No schema migration needed.
- No API surface change.
- The v1 row in `policy_versions` already faithfully records the original published state; the restored-draft that gets published next is legitimately a new version.
- **One risk:** if a future product decision decides that restore + re-publish (with no content change) should be idempotent at the same version, Option A would force a version increment even for no-edit cycles. This is a product question; at present there is no such requirement, and the "audit-ready" value prop is better served by a unique, incrementing lineage.

**Option B — `publishPolicy` detects and skips duplicate snapshot (INSERT ... ON CONFLICT DO NOTHING) with a new UNIQUE(policy_id, version_number) schema constraint**

- Adds `unique('policy_versions_policy_id_version_number_unique').on(table.policyId, table.versionNumber)` to `schema.ts:policyVersions` and a corresponding Drizzle migration.
- Changes `PolicyVersions.create()` to use `onConflictDoNothing()`.
- Semantics: re-publishing at the same version_number is a no-op (idempotent).
- **Pro:** schema-level enforcement prevents the duplicate regardless of any future code path that forgets to bump.
- **Con:** the two v1 rows in UAT already exist; a migration adding the constraint will fail until the duplicate is cleaned up in the live DB. Also, silently swallowing a re-publish without a version row could hide an operator error (they thought they were publishing an edit, but the snapshot wasn't written because the version number hadn't been bumped). The "no-op re-publish" semantic is debatable and is not the current product spec.
- Requires a schema migration (new unique index) — adds migration overhead to Phase 3 PR.

**Option C — Hybrid: schema gets the UNIQUE constraint AND `restore()` bumps `currentVersion` (belt-and-suspenders)**

- Combines A and B: `restore()` bumps the counter so the normal path always creates a new row, AND the schema constraint provides a hard backstop against any future code path that forgets.
- **Pro:** Defense-in-depth; consistent with PolicyPilot's layered security/integrity philosophy (state machine + repo + RLS).
- **Con:** Requires a migration (new unique index). The migration is straightforward and non-destructive (only adds an index), but must be applied after any existing duplicate rows are cleaned up (which requires a one-time data fix for the UAT database record).
- This is the highest-confidence long-term option. The operational cost is low (one migration, one data fix for the one affected UAT row).

**Ranking:**
1. **Option A** — lowest cost, correct semantics, no migration, unblocks the PR immediately. Address schema constraint separately as a follow-on hardening task (Option C minus the immediate urgency).
2. **Option C** — ideal end-state; appropriate if the team wants the constraint before Phase 3 ships to staging/production. Requires cleaning the UAT duplicate row first.
3. **Option B** — not recommended as primary fix. Silent idempotency hides operator errors and the "same version re-publish" semantic is not in requirements.

---

### Severity Classification

**Severity: MEDIUM — does not block core ack correctness, but directly contradicts the "audit-ready compliance trails" value prop.**

Reasoning:

1. **Direct ack correctness is NOT broken.** `acknowledgments.policy_version_id` is a UUID FK (`schema.ts:42`) pointing to a specific `policy_versions.id`. Existing acknowledgments point to the first v1 row (id `6f272452`). The second v1 row is an orphan that no ack references yet.

2. **Audit trail readability IS broken.** An auditor or compliance officer querying `policy_versions` for "all published versions of policy X" receives two rows both labeled version 1, with different timestamps and no distinguishing `change_summary`. There is no correct way to determine from the data which row represents the "canonical" v1 publish. This is precisely the ambiguity that `D-04` (versions track published lineage) and the "audit-ready compliance trails" value prop exist to prevent.

3. **Risk escalates when employees acknowledge the restored-published version.** After step 5 of the reproduction, if employees acknowledge the second-published version, their `policy_version_id` will point to the second v1 row (id `0a066929`). An audit now shows two cohorts of acknowledgments: one on each v1 UUID. An auditor cannot determine whether both groups acknowledged "the same policy version" or different versions. This is a compliance reporting defect even if the underlying policy content is identical.

4. **Silent failure.** No error is raised, no warning is logged. This will not surface in monitoring or on-call alerting. It can accumulate silently across many policies in a production tenant.

5. **Not data loss, but data ambiguity** — existing data can be repaired with a targeted data fix (delete or re-key the duplicate row before any acks attach to it).

---

### Phase 3 PR Verdict

**This does NOT block the Phase 3 PR merge, but the fix MUST be included in the PR or gated by a documented follow-on plan before staging promotion.**

Rationale:
- Phase 3 is 14/14 plans shipped; 6 UAT items pending. The implementation is otherwise complete.
- The bug was introduced in Plan 03-06 code that is already on the branch. It will ship to `main` in the squash commit if not addressed.
- The fix for **Option A** (bump `currentVersion` in `restore()`) is a single-line change in `transitions.ts` with no schema migration. It is low-risk to include before the PR merge.
- The UAT reproduction is deterministic and the single affected row in UAT can be deleted before re-running UAT-3.
- **Recommended path:** apply Option A as a small commit on `gsd/phase-3-admin-ui` before the PR merge. Add the regression test (see below). Re-run UAT-3. The Option C schema constraint can be a follow-on item (Phase 4 or a standalone tech-debt plan) if the team wants belt-and-suspenders hardening before production.
- If Option C is preferred before merge: the schema migration is low-risk but requires cleaning the one duplicate UAT row and running `drizzle-kit generate + push` on the dev/staging DB. This adds perhaps 30 minutes of work.

---

### Regression Test Sketch

**Where it belongs:** `lib/policies/transitions.test.ts` — specifically a new `it()` inside the existing `describe('archive + restore', ...)` block (transitions.test.ts:229).

**Test name:** `"restore→publish does not duplicate version_number (currentVersion bumped on restore)"`

**Sketch:**
1. Mock `findById` to return a policy with `status: 'archived'`, `currentVersion: 1`.
2. Call `restore('p1')`.
3. Assert that `txUpdateMock` was called with a set-clause that includes `currentVersion: 2` (or equivalent increment).
4. Mock `findById` to return the now-restored policy with `status: 'draft'`, `currentVersion: 2`.
5. Call `publish('p1')`.
6. Assert `pvCreateMock` was called with `versionNumber: 2` (NOT 1).

**Additional assertion:** A second `it()` could assert that calling `restore()` then `publish()` (without `editPublished` in between) does NOT result in two `pvCreateMock` calls with the same `versionNumber`. With mocks this is straightforward: reset `pvCreateMock`, call the full cycle, assert `pvCreateMock.mock.calls.every(call => call[1].versionNumber !== 1)` — but the test above directly covers the root cause and is sufficient.

**Could `check-rls.ts` or `check-auth-context.ts` cover this?**
No. `check-rls.ts` validates that org_id scoping and RLS policies are correctly applied to DB queries. `check-auth-context.ts` validates that every server-side route/action extracts an authenticated org context. Neither has a model for version-number invariants. This is an application-logic invariant that belongs in `transitions.test.ts` (unit) and ideally in an end-to-end smoke test that queries `policy_versions` after the full lifecycle (Phase 8 acceptance test territory).

**Could `check-schema.ts` catch it?**
Only if Option C is applied: once a `UNIQUE(policy_id, version_number)` constraint exists in the schema, `check-schema.ts` (or `drizzle-kit check`) would catch any future schema drift. Without the constraint, schema checks are silent on this invariant.
