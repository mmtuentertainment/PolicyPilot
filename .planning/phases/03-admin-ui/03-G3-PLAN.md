---
phase: 03-admin-ui
plan: G3
type: execute
wave: 1
depends_on: []
files_modified:
  - app/api/webhooks/clerk/route.ts
  - lib/policies/transitions.ts
  - lib/policies/transitions.test.ts
  - lib/db/schema.ts
  - drizzle/0004_policy_versions_unique.sql
  - drizzle/meta/_journal.json
  - scripts/check-schema.ts
  - app/(employee)/my-policies/page.tsx
  - app/(employee)/layout.tsx
autonomous: true
requirements:
  - REQ-policy-lifecycle
  - REQ-acknowledgment-tracking
gap_closure: true
gap_source:
  - .planning/debug/duplicate-policy-version.md
  - .planning/debug/org-topology-uat5.md
  - .planning/phases/03-admin-ui/03-HUMAN-UAT.md (UAT-3 sub-finding S1, UAT-4 SF-W5 trigger, UAT-6 sub-findings)
closes_gaps:
  - DUP-VN (BLOCKER) — Republish-after-restore creates duplicate policy_versions rows with same version_number (ledger ambiguity vs. audit-trail value prop). Diagnosed at .planning/debug/duplicate-policy-version.md. Root cause: restore() doesn't bump currentVersion + no schema UNIQUE constraint.
  - SF-W5 (HIGH, PARTIALLY CLOSED at T7) — Webhook race silently drops events when prerequisite is missing on first delivery. T7 fix shipped at commit 2da89b4 (delete clerk_events row before 409 return). T8 here adds the missing regression test.
  - MYPOL-STUB (MEDIUM) — /post-sign-in trampoline routes employee/reviewer roles to /my-policies which is a Phase 5 route that doesn't exist yet (404 trap for any non-admin user). Ship a minimal stub so the route returns 200.

must_haves:
  truths:
    - "restore() in lib/policies/transitions.ts bumps currentVersion by 1 in the same UPDATE that flips status to 'draft' — mirrors the editPublished() pattern at transitions.ts:237"
    - "policy_versions table has a UNIQUE constraint on (policy_id, version_number) declared via Drizzle's unique() on the table definition AND realized as a Postgres UNIQUE index"
    - "Migration drizzle/0004_policy_versions_unique.sql includes a self-healing DELETE pre-step that drops duplicate rows (keeps oldest by created_at per (policy_id, version_number)) BEFORE creating the unique constraint, so the migration applies cleanly even if duplicates exist"
    - "scripts/check-schema.ts asserts the unique constraint exists by querying pg_catalog.pg_constraint with conname matching the expected constraint name — failing the verify:phase-2 gate if the schema regresses"
    - "lib/policies/transitions.test.ts has at least 2 new it() blocks: (a) restore() result has currentVersion=N+1 given input currentVersion=N; (b) a multi-step archive→restore→publish flow yields exactly 2 policy_versions rows with version_numbers N and N+1 (no duplicate vN)"
    - "lib/policies/transitions.test.ts has at least 1 new it() block exercising the SF-W5 path: when publish handler returns 409 prerequisite-missing, the clerk_events row is deleted (NOT preserved)"
    - "app/(employee)/my-policies/page.tsx renders a placeholder page (server component, 'Coming in Phase 5' or similar) so /post-sign-in's employee/reviewer redirect lands on a 200, not a 404"
    - "pnpm tsc --noEmit exits 0; pnpm verify:phase-2 exits 0 with 7/7 OK including the new UNIQUE constraint assertion; pnpm verify:phase-3 exits 0 across all gates; new vitest cases pass"
  artifacts:
    - path: "lib/policies/transitions.ts"
      provides: "restore() currentVersion bump"
      contains: "currentVersion: policy.currentVersion + 1"
    - path: "lib/db/schema.ts"
      provides: "policy_versions UNIQUE(policyId, versionNumber)"
      contains: "unique('policy_versions_policy_id_version_number_unique')"
    - path: "drizzle/0004_policy_versions_unique.sql"
      provides: "Migration with cleanup pre-step + constraint creation"
      contains: "DELETE FROM policy_versions a USING policy_versions b"
    - path: "scripts/check-schema.ts"
      provides: "Schema audit assertion for the new constraint"
      contains: "policy_versions_policy_id_version_number_unique"
    - path: "lib/policies/transitions.test.ts"
      provides: "Regression cases for restore-bump + archive→restore→publish flow + SF-W5 409 cleanup"
      contains: "archive + restore + publish"
    - path: "app/(employee)/my-policies/page.tsx"
      provides: "Phase 5 stub returning 200"
      contains: "Coming in Phase 5"
  key_links:
    - from: "lib/policies/transitions.ts restore()"
      to: "lib/policies/transitions.ts editPublished()"
      via: "Shared currentVersion bump semantic — both transitions seed the next publish's version_number"
      pattern: "policy.currentVersion + 1"
    - from: "drizzle/0004_policy_versions_unique.sql"
      to: "scripts/check-schema.ts"
      via: "Constraint name match — script asserts the named constraint exists post-migration"
      pattern: "policy_versions_policy_id_version_number_unique"
    - from: "app/(auth)/post-sign-in/page.tsx (employee/reviewer redirect)"
      to: "app/(employee)/my-policies/page.tsx (Phase 5 stub)"
      via: "redirect('/my-policies') — stub closes the 404 trap"
      pattern: "/my-policies"
---

<objective>
Close three Phase 3 correctness gaps surfaced during HUMAN-UAT walkthrough on 2026-05-20 so the Phase 3 PR can ship without known-known compliance regressions:

1. **DUP-VN (BLOCKER)** — `restore()` doesn't bump `currentVersion`, and `publishPolicy()` snapshots unconditionally at the existing `currentVersion`. Result: republishing a previously-archived policy creates a duplicate `policy_versions` row with the same `version_number`. The schema has no `UNIQUE(policy_id, version_number)` constraint to catch this. Live evidence: UAT-3 baseline showed 2 rows with `version_number=1` for policy `41ab9db4-...` (one from initial publish, one from restore+republish). The audit-trail value prop ("audit-ready compliance trails", per CLAUDE.md) is undermined by ambiguous version_number entries — auditors can't reliably resolve "which version was active on date X".

2. **SF-W5 (HIGH, T7 already shipped at commit 2da89b4)** — Closed at the application layer when the webhook handler returns a non-2xx by deleting the `clerk_events` idempotency row first. T7 was a focused production-code commit; T8 adds the missing vitest regression that locks the behavior in.

3. **MYPOL-STUB (MEDIUM)** — `post-sign-in/page.tsx` routes employee/reviewer roles to `/my-policies`, which is documented as a Phase 5 route. The route doesn't exist yet → 404 for any non-admin user landing there. UAT-4 surfaced this when Org B's brand-new sign-up hit the trampoline with role=employee (the SF-W5 race meant the role mirror to admin hadn't completed). Even after Phase 3 ships, any employee/reviewer user (a real customer use case once Org admins invite team members) will hit the 404 trap. A 4-line stub closes it.

Purpose: Ship Phase 3 with a clean correctness story. The duplicate-version bug + the missing /my-policies stub are both directly observable as bad outcomes for the first customer who exercises the full lifecycle.

Output:
- Code: one bump line in restore(), one `.unique()` declaration in schema, one new migration, one schema-audit assertion, one stub page, three new vitest cases
- Test: pnpm tsc --noEmit + verify:phase-2 + verify:phase-3 + vitest all green
- Plan record: this PLAN.md + a SUMMARY.md after execution
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-admin-ui/03-HUMAN-UAT.md
@.planning/debug/duplicate-policy-version.md
@.planning/debug/org-topology-uat5.md
@CLAUDE.md
</context>

## Tasks

### T7 — DONE (commit 2da89b4, 2026-05-20)
SF-W5 webhook race fix: extract `deleteIdempotencyRow(svixId, reason)` helper in `app/api/webhooks/clerk/route.ts`; call it before each of the three 409 returns; replace the inline cleanup in the catch block with the helper; update the SF-W5 doc comment at the top of the file. Already shipped on this branch. T8 below adds the regression test.

### T1 — restore() bumps currentVersion
- File: `lib/policies/transitions.ts:185-194`
- Change: add `currentVersion: policy.currentVersion + 1` to the `.set({...})` clause of the `restore()` update
- Update the doc comment at lines 181-184: replace "admin must edit and re-publish to land a new v(N+1); restore is just an unarchive" with "restore creates the seed for v(N+1) — the next publish writes v(N+1), matching editPublished's invariant"
- No new dependencies, no breaking changes

### T2 — Schema UNIQUE(policy_id, version_number)
- File: `lib/db/schema.ts`
- Change: add `unique('policy_versions_policy_id_version_number_unique').on(table.policyId, table.versionNumber)` to the `policyVersions` table's index/constraint array (find the table-definition trailing callback that already declares other constraints; add the unique declaration there)
- The constraint name is explicit (NOT auto-generated) so `scripts/check-schema.ts` can match it by name

### T3 — Drizzle migration with cleanup pre-step
- Generate: `pnpm db:generate` produces `drizzle/0004_policy_versions_unique.sql` containing the `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` statement
- Hand-edit: prepend a self-healing DELETE pre-step. The migration body becomes:
  ```sql
  -- 03-G3 T3: drop accidental duplicate version_number rows accumulated under
  -- the pre-T1 restore→publish path. Keeps the oldest row per (policy_id,
  -- version_number) pair (audit-trail intent: earliest snapshot wins).
  DELETE FROM policy_versions a
  USING policy_versions b
  WHERE a.policy_id = b.policy_id
    AND a.version_number = b.version_number
    AND a.created_at > b.created_at;
  --> statement-breakpoint
  ALTER TABLE "policy_versions"
    ADD CONSTRAINT "policy_versions_policy_id_version_number_unique"
    UNIQUE ("policy_id", "version_number");
  ```
- Update `drizzle/meta/_journal.json` to include the new migration entry (Drizzle does this automatically on `db:generate`, but verify)
- T3 acceptance: the migration file exists with both the DELETE and the ALTER TABLE; `drizzle/meta/_journal.json` lists `0004_policy_versions_unique` as the most recent entry

### T4 — Apply migrations to live DBs
- Dev DB: `pnpm db:migrate` (reads `DATABASE_URL` from `.env.local`, applies all pending migrations including 0004)
- Test DB: `pnpm db:migrate:test` (reads `.env.local.test` — note this file is comments-only per Plan 02-03 SF-DB-1 deferral; orchestrator handles _TEST env-var override per Plan 02-06)
  - Actually: `pnpm db:migrate:test` may not work because `.env.local.test` was left as a placeholder. The cleanest path: temporarily override via `DATABASE_URL=$DATABASE_URL_TEST DIRECT_URL=$DIRECT_URL_TEST pnpm db:migrate` (or modify the script if needed)
- After both apply: verify live duplicate row `0a066929-...` is gone from dev DB; the orphan-org duplicate UAT-1 (from session confusion) is also gone if it exists
- Acceptance: `.tmp/list-versions.ts` for the original UAT-1 policy `41ab9db4-...` shows exactly 1 row at version_number=1 OR more rows but with strictly distinct version_numbers (depending on UAT-3 leftover state); no row IS a duplicate

### T5 — vitest regression cases for restore-bump + multi-step flow
- File: `lib/policies/transitions.test.ts`
- Add to the existing `describe('archive + restore', ...)` block (around line 229):
  1. `it('restore bumps currentVersion by 1')` — mock policy with currentVersion=3, status=archived; call restore(); assert `txUpdate.set` was called with `{ status: 'draft', currentVersion: 4, ... }`
  2. `it('archive → restore → publish creates v(N+1), not duplicate vN')` — chain three orchestrator calls; assert that PolicyVersions.create was called with `versionNumber: 2` on the second publish (NOT versionNumber: 1)

### T6 — check-schema.ts asserts the new UNIQUE constraint
- File: `scripts/check-schema.ts`
- Find the existing constraint-presence assertion block (it already checks for org_isolation policy + RLS enable per Plan 02-06 D-08)
- Add a query against `pg_catalog.pg_constraint` for `conname = 'policy_versions_policy_id_version_number_unique'` + `contype = 'u'`; if 0 rows returned, fail with a clear message
- Mark the check as part of the 7/7 OK output

### T8 — vitest for SF-W5 webhook 409 cleanup
- File: `lib/policies/transitions.test.ts` OR a new `app/api/webhooks/clerk/route.test.ts`
- Decision: put it in `transitions.test.ts` to avoid creating a new test file scaffold. Actually no — the webhook handler isn't a transition orchestrator. Better location: a new minimal `lib/__tests__/webhook-handler.test.ts` that imports the handler and exercises the 409 path with a mocked `db.delete()` to assert the clerk_events row is targeted for deletion.
  - Final decision: Defer creation of a new test file. Instead, document the T8 test as a tracked-but-deferred item if creating a fresh test scaffold is non-trivial. Audit trail: T7 production code is shipped + manually verified live during UAT-4 recovery (Svix replay) AND UAT-6 (the matthewutt fresh sign-up didn't hit the race, but the code path is exercised every time). Coverage gap is acknowledged.
  - **T8 actual scope:** add the test if it's a clean fit; otherwise document the deferral in SUMMARY.md and ROADMAP carry-forward.

### T9 — /my-policies Phase 5 stub
- New file: `app/(employee)/my-policies/page.tsx`
- Server component returning a simple "Coming in Phase 5" placeholder UI. Use shadcn/ui Card + a brief explainer ("Employee portal is launching in the next phase. You'll be able to see and acknowledge policies assigned to you here.")
- Also need: `app/(employee)/layout.tsx` if the route group isn't already configured. Check if `app/(employee)/` exists; if not, create a minimal layout that mirrors the auth layout (just children passthrough)
- Update `scripts/check-artifacts.ts` to assert the new file exists (or add to its expected file list — find the existing Phase 3 artifact check section)
- Acceptance: `curl http://localhost:3000/my-policies` (with a valid session) returns 200, not 404

### T10 — DROPPED
Originally scoped to backfill orgbtestuser membership manually. **Not needed** — the Svix Dashboard replay during UAT-4 unblock successfully exercised the T7-fixed code path and orgbtestuser is correctly linked to UAT Org B in DB. No manual SQL backfill happened.

## Acceptance criteria

- [ ] `pnpm tsc --noEmit` exits 0
- [ ] `pnpm verify:phase-2` exits 0 (still 7/7 OK; T6 extends the schema audit but the count stays 7 since T6 is one assertion among many in check-schema.ts)
- [ ] `pnpm verify:phase-3` exits 0 across all gates (8 gates pre-G3 + any added by T6/T9)
- [ ] vitest passes: all existing tests + 2 new from T5 + (conditional) 1 new from T8
- [ ] Live DB has no duplicate (policy_id, version_number) rows (verified post-migration via `.tmp/list-versions.ts`)
- [ ] `curl http://localhost:3000/my-policies` with an authenticated session returns 200 (or middleware redirects appropriately for unauthenticated)
- [ ] `.planning/phases/03-admin-ui/03-G3-SUMMARY.md` written

## Commit plan

- Plan landed (this file): `docs(03-G3): Phase 3 correctness hotfix plan (DUP-VN + SF-W5 vitest + MYPOL-STUB)`
- T1+T5: `fix(03-G3 T1+T5): restore() bumps currentVersion + regression tests`
- T2+T3+T4: `feat(03-G3 T2+T3): policy_versions UNIQUE constraint + cleanup migration`
- T6: `test(03-G3 T6): check-schema.ts asserts policy_versions unique constraint`
- T8 (if shipped): `test(03-G3 T8): SF-W5 webhook 409 path regression test`
- T9: `feat(03-G3 T9): /my-policies Phase 5 stub closes employee-redirect 404`
- SUMMARY: `docs(03-G3): SUMMARY + ROADMAP/STATE update post-hotfix`

## Risk callouts

- **TEST DB migration may need a manual override** if `.env.local.test` isn't populated. Already noted in T4. The dev DB migration is the priority — TEST DB is exercised by `verify:phase-2` which spawns `db:migrate:test` internally, so we need it working before the gate goes green.
- **The DELETE pre-step is destructive** — drops accidental duplicate rows. Only affects dev/test DBs (no prod tenant data exists). The migration is idempotent (DELETE is a no-op if no duplicates exist).
- **T8 might be deferred** if creating a fresh webhook-handler test scaffold proves non-trivial. The production code (T7) is shipped + manually validated. Mark as carry-forward to a future test-coverage plan if so.
