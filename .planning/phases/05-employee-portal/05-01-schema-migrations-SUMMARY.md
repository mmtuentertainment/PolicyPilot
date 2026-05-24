---
phase: 05-employee-portal
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, supabase, multi-tenancy, migrations]

# Dependency graph
requires:
  - phase: 02-data-layer
    provides: Drizzle schema (12 tables), RLS policies, GRANTs, check-schema.ts audit pattern
  - phase: 04-ai-layer
    provides: 0007 combined-migration header pattern (operator-approval doc); 0008 wrapped-form RLS predicate baseline; check-schema.ts policy_versions UNIQUE assertion precedent
provides:
  - "Two new UNIQUE constraints on existing tables (acknowledgments + policy_assignments) — drive ON CONFLICT DO NOTHING idempotency in Wave 2 repositories"
  - "Brand-new qa_citation_grants table with RLS + 4 GRANTs + composite UNIQUE + 2 indexes — backs D-26 Q&A→citation server-tracked grants"
  - "qaCitationGrants Drizzle export for $inferInsert types in QaCitationGrants repository (Plan 05-03)"
  - "scripts/check-schema.ts extended with column-shape + UNIQUE + wrapped-RLS assertions for the new table"
affects: [05-03-repositories, 05-04-orchestrators, 05-08-ci-gates, 05-09-integration-test]

# Tech tracking
tech-stack:
  added: []  # Zero new packages — Phase 5 invariant
  patterns:
    - "Two-step Drizzle generation for split migrations (micromanage schema.ts to emit intermediate snapshot, then restore for final emission; collapse adjective_noun filenames in journal tags) — extends Phase 4 0007 pattern"
    - "Wrapped-form RLS predicate (SELECT auth.jwt()->>'org_id') applied to brand-new tenant tables from inception — extends 0008 baseline forward"

key-files:
  created:
    - drizzle/0010_phase5_uniques.sql
    - drizzle/0011_qa_citation_grants.sql
    - drizzle/meta/0010_snapshot.json
    - drizzle/meta/0011_snapshot.json
    - .planning/phases/05-employee-portal/05-01-schema-migrations-SUMMARY.md
  modified:
    - lib/db/schema.ts
    - drizzle/meta/_journal.json
    - scripts/check-schema.ts

key-decisions:
  - "0010 + 0011 split into two SEPARATE migration files per D-28 vs D-29 (NOT combined) — operator-locked via CONTEXT.md decision boundaries"
  - "0011 RLS predicate uses post-0008 wrapped (SELECT auth.jwt()->>'org_id') form per RESEARCH gap-1 — new tenant tables MUST start at the post-0008 baseline; unwrapped form triggers splinter lint 0003_auth_rls_initplan and re-evaluates JWT per row"
  - "qaCitationGrants placed alphabetically between policyVersions and stripeEvents in schema.ts (Phase 2 D-08 alphabetical-wins-on-diffs convention)"
  - "Snapshot chain integrity (prevId monotonic) verified manually: 0009 (3a2f17ac...) → 0010 (6f80ecbb...) → 0011 (8fe0d053...)"

patterns-established:
  - "Hand-written ALTER TABLE bundle migration with operator-approval header (mirrors Phase 4 0007 pattern) — Q-NN selections + STATE.md pre-paying-customer status citation"
  - "Drizzle-generated CREATE TABLE + FK + INDEX retained verbatim; RLS + GRANT hand-appended (Drizzle does not emit ENABLE RLS / CREATE POLICY / GRANT)"
  - "Drizzle adjective_noun migration tag renamed in _journal.json to descriptive Phase-suffix tag; auto-generated SQL files discarded; snapshot JSONs retained intact"

requirements-completed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules

# Metrics
duration: 16min (code) + 8min (wait-pooler discovery for TEST DB diagnostic) = ~24min wall
completed: 2026-05-23
---

# Phase 5 Plan 01: Schema Migrations Summary

**Phase 5 schema delta landed in DEV DB — 2 additive UNIQUE constraints + new qa_citation_grants table with wrapped-form RLS — and audit script extended; TEST DB blocked by pooler auth gate awaiting operator credential rotation.**

## Performance

- **Duration:** ~16 min code execution + 8 min wait-pooler discovery for TEST DB diagnostic
- **Started:** 2026-05-23T23:14Z (approximate — first commit landed within minutes of context load)
- **Completed (code):** 2026-05-23T23:30:47Z
- **Tasks:** 4 / 4 code-complete; Task 3 step 2 (TEST DB) + Task 4 live verification AWAIT operator TEST-DB credential rotation
- **Files modified:** 3 modified (lib/db/schema.ts, drizzle/meta/_journal.json, scripts/check-schema.ts) + 4 created (0010 + 0011 SQL + 0010 + 0011 snapshot JSONs)
- **DEV DB:** Migrations applied successfully; all 3 new constraints + qa_citation_grants table verified live
- **TEST DB:** 28P01 password authentication failed — operator action required

## Accomplishments

- `lib/db/schema.ts` extended with two UNIQUE constraint additions to existing `acknowledgments` and `policy_assignments` tables + brand-new `qaCitationGrants` pgTable export (5 columns + UNIQUE + 2 indexes)
- `drizzle/0010_phase5_uniques.sql` written with operator-approval header citing Q-22(a) + Q-23(a) + STATE.md pre-paying-customer status — additive only (no DROP)
- `drizzle/0011_qa_citation_grants.sql` written with operator-approval header citing T-2(4c) — CREATE TABLE + 3 FKs + 2 indexes + ENABLE RLS + CREATE POLICY (WRAPPED form per RESEARCH gap-1) + GRANT to authenticated
- `drizzle/meta/_journal.json` extended with idx 10 + 11 entries (tags `0010_phase5_uniques` + `0011_qa_citation_grants`)
- `drizzle/meta/0010_snapshot.json` + `drizzle/meta/0011_snapshot.json` chained (0009 → 0010 → 0011 prevId monotonic)
- `pnpm db:migrate` against DEV DB exited 0 — all 3 new constraints + qa_citation_grants table verified live via direct postgres-js probe
- `scripts/check-schema.ts` extended with: TENANT_TABLES + `'qa_citation_grants'`, 3-UNIQUE assertion block, 5-column shape assertion (id/org_id/user_id/policy_id/granted_at all uuid/timestamp NO-NULL), wrapped-RLS predicate assertion per RESEARCH gap-1, 2-index assertion, updated success-log line

## Task Commits

Each task was committed atomically on `gsd/phase-5-employee-portal`:

1. **Task 1: Extend lib/db/schema.ts** — `0552341` (feat) — 1 file changed, 62 insertions, 1 deletion
2. **Task 2: Write 0010 + 0011 SQL + snapshot metadata + journal entries** — `b54ff02` (feat) — 5 files changed, 2837 insertions
3. **Task 3 step 1: Apply migrations to DEV DB** — no source-file commit (runtime DB operation only); verified live via direct postgres-js probe showing 12 migrations recorded + all 3 constraints present + qa_citation_grants table present
4. **Task 3 step 2: Apply migrations to TEST DB** — BLOCKED on operator action (see Issues Encountered)
5. **Task 4: Extend scripts/check-schema.ts** — `298cb59` (feat) — 1 file changed, 111 insertions, 1 deletion (live-DB verification step deferred per Task 3 step 2 blocker)

**Plan metadata:** _(this SUMMARY.md commit pending — final metadata commit will land after STATE.md + ROADMAP.md updates)_

## Files Created/Modified

### Created
- `drizzle/0010_phase5_uniques.sql` — hand-written ALTER TABLE bundle adding 2 UNIQUEs (acknowledgments idempotency + policy_assignments idempotency) with operator-approval header citing Q-22(a) + Q-23(a)
- `drizzle/0011_qa_citation_grants.sql` — Drizzle-generated CREATE TABLE + FKs + indexes RETAINED verbatim + hand-appended ENABLE RLS + CREATE POLICY (WRAPPED form) + GRANT to authenticated; operator-approval header cites T-2(4c)
- `drizzle/meta/0010_snapshot.json` — Drizzle-emitted snapshot of post-UNIQUE-adds state (prevId points to 0009)
- `drizzle/meta/0011_snapshot.json` — Drizzle-emitted snapshot of post-qa_citation_grants state (prevId points to 0010)
- `.planning/phases/05-employee-portal/05-01-schema-migrations-SUMMARY.md` — this document

### Modified
- `lib/db/schema.ts` — file-header comment updated to reflect 13 tables (11 tenant-scoped) and Phase 5 schema delta documentation; `acknowledgments` table-options array gains UNIQUE on (user_id, policy_id, policy_version_id) per D-06+D-10; `policyAssignments` table-options array gains UNIQUE on (policy_id, assignee_type, assignee_id) per D-15; new `qaCitationGrants` export inserted alphabetically between `policyVersions` and `stripeEvents` (5 columns + UNIQUE on (org_id, user_id, policy_id) + 2 indexes); ADR-018 "NEVER DELETE OR UPDATE ROWS" comment preserved verbatim on acknowledgments
- `drizzle/meta/_journal.json` — append idx 10 (tag `0010_phase5_uniques`) + idx 11 (tag `0011_qa_citation_grants`); both `breakpoints: true` matching precedent
- `scripts/check-schema.ts` — `'qa_citation_grants'` added to TENANT_TABLES (auto-covers RLS + policy + 4 GRANTs assertions); new Phase 5 assertion block after the policy_versions 03-G3 T6 block asserts 3-UNIQUE existence + qa_citation_grants 5-column shape + wrapped-form RLS predicate + 2 expected indexes; success-log line updated

## Decisions Made

- **TEST env-file population approach** — operator left the TEST env-file as a placeholder per Plan 02-06 SUMMARY (orchestrator overrode env via spawnSync). Plan 05-01 Task 3 step 2 requires the TEST DB migrate command which reads that env-file; it was populated from the local env-file's TEST-suffixed entries via a one-shot tsx script (no secret echo). The TEST env-file is gitignored. Rotation procedure documented in `docs/runbooks/deploy-migrations.md` § Rotation.
- **Drizzle two-step generation workflow** — micromanaged `lib/db/schema.ts` to temporarily omit `qaCitationGrants` for 0010 generation, then restored for 0011 generation. Auto-generated adjective_noun SQL filenames discarded; final SQL bodies hand-written for both files; journal tags rewritten to descriptive Phase-suffix names. This was necessary because: (a) D-28 vs D-29 are explicitly separate migrations per CONTEXT.md; (b) Drizzle does not emit RLS DDL, so 0011 needs hand-appending of ENABLE RLS + CREATE POLICY + GRANT.
- **Wrapped-form RLS in 0011** — per RESEARCH gap-1, the new tenant table starts at the post-0008 baseline. Unwrapped `auth.jwt()->>'org_id'` would (a) trigger splinter lint 0003_auth_rls_initplan and (b) per-row JWT eval would kill scale on the qa_citation_grants table (which scales linearly with employee × Q&A submissions × unique citations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TEST-DB env-file population required**
- **Found during:** Task 3 step 2 (TEST DB migrate)
- **Issue:** TEST-DB env-file was a documentation-only placeholder (SF-DB-1 deferral artifact from Plan 02-03); the planned migrate command needs an env-file present. Per CLAUDE.md ASK-FIRST rule #1, env-var population isn't a new dependency — it's a runtime config requirement to execute the planned command.
- **Fix:** One-shot env-file population (helper script, deleted after run). Procedure documented in the team rotation runbook at `docs/runbooks/deploy-migrations.md`. Values were never printed to chat; the populated file is gitignored at `.gitignore:5` and NOT committed.
- **Files modified:** TEST env-file (gitignored, NOT committed)
- **Verification:** Direct DB probe confirmed populated values match source bytes; the auth failure that followed is NOT caused by population error (DEV DB connection works perfectly via the same driver; TEST DB credential was genuinely stale).
- **Committed in:** No source-file commit (gitignored)

---

**Total deviations:** 1 auto-fixed (1 blocking — Rule 3)
**Impact on plan:** Population was necessary to execute the planned TEST DB migrate command. No scope creep; the TEST env-file remained gitignored throughout.

## Issues Encountered

### Authentication gate: TEST DB password authentication failed (BLOCKING TASK 3 STEP 2 + TASK 4 LIVE-DB VERIFICATION)

- **Symptom:** Planned TEST DB migrate command exits non-zero; direct DB probe surfaces `PostgresError [28P01]: password authentication failed`. Pooler-auth wait gate observed 10 consecutive auth failures with no propagation transient — indicates a genuinely stale credential, NOT pooler-auth lag.
- **Cross-validated:** DEV DB connection works perfectly via the same driver — DEV migration applied successfully and live verification confirms 12 migrations + qa_citation_grants table + 3 new constraints present. Auth failure is TEST-DB-specific.
- **REST probe:** Project is alive (returns 401, not DNS-fail or 5xx); only the postgres-role password is rejected.
- **Root cause:** TEST DB postgres-role password in the local env-file was no longer valid against the live Supabase TEST project. Most likely cause: operator rotated the TEST DB password in Supabase Dashboard at some point after the last successful Plan 02-06 verification (2026-05-18) and the local env-file was not refreshed.
- **Credential exposure (handled — see secure runbook):** During diagnostic file-Read of the populated TEST env-file, the stale TEST DB password was briefly surfaced in the chat transcript. Credential has since been rotated by the operator (see `.planning/STATE.md` Session Continuity 2026-05-24 entries). Specific endpoint identifiers, password-segment patterns, and rotation command snippets are **intentionally redacted from this SUMMARY**; the rotation procedure lives in `docs/runbooks/deploy-migrations.md` § Rotation section (added by PR #20 along with a 28P01 troubleshooting subsection). Memory rule applies: never echo/print/summarize secret values in committed artifacts; pointer-only references to the runbook.
- **Operator action required:** Rotate both DEV + TEST credentials per `docs/runbooks/deploy-migrations.md` § Rotation, then re-run TEST DB migrate + `pnpm exec tsx --env-file=.env.local scripts/check-schema.ts` to complete Plan 05-01 Task 3 step 2 + Task 4 live verification. (STATE.md 2026-05-24 entries record the post-rotation runs that closed these gates against TEST DB.)

## User Setup Required

**Operator must complete the TEST DB credential rotation described in Issues Encountered above before:**
- Plan 05-01 Task 3 step 2 (`pnpm db:migrate:test`) can succeed
- Plan 05-01 Task 4 live-DB verification (`pnpm exec tsx --env-file=.env.local scripts/check-schema.ts`) can succeed
- Plan 05-08 + Plan 05-09 (Wave 4) CI gates that depend on TEST DB connectivity can succeed
- `pnpm verify:phase-4` (the phase baseline gate from this plan's `<verification>` block) can succeed — it chains through `check:rls` and `check:schema` which both query TEST DB

**Operator must also complete the staging + prod migration follow-up per CLAUDE.md Database Migration Discipline:**
- `pnpm db:migrate:staging` (then `pnpm db:verify:staging` exits 0)
- `pnpm db:migrate:prod` (then `pnpm db:verify:prod` exits 0)
- Append the audit-log line to `.planning/STATE.md` § Session Continuity per the `docs/runbooks/deploy-migrations.md` § Audit log template

These are operator-gated migrations OUT OF SCOPE for `/gsd-execute-phase` per CLAUDE.md ASK-FIRST rule #3 and the plan's Task 3 acceptance criteria. Plan 05-01 only ships DEV + TEST.

## Next Phase Readiness

**Wave 1 partial readiness:**
- Schema delta committed and live in DEV DB → unblocks Plan 05-03 (`Acknowledgments.record` + `PolicyAssignments.create` + `QaCitationGrants.upsert` repository bodies use `$inferInsert` types resolved against the new exports)
- `qaCitationGrants` Drizzle export available for Plan 05-04 (`askQuestion` orchestrator UPSERTs grant rows)
- 3 UNIQUE constraints live in DEV → unblocks Plan 05-03 `ON CONFLICT DO NOTHING` semantics for all three idempotent writes
- `scripts/check-schema.ts` extended → ready to fire positive once TEST DB unblocks

**Wave 1 parallel plans NOT BLOCKED by Plan 05-01:**
- Plan 05-02 (`lib/policies/errors.ts`) — pure code, no DB dependency
- Plan 05-07 (`components/policy/AckStatusBadge.tsx`) — pure UI, no DB dependency
- Both can execute immediately after this SUMMARY commits

**Wave 2 readiness (blocked on Plan 05-01 TEST DB completion AND Plan 05-02 + 05-03 + 05-04 ship):**
- Plan 05-03 (repositories) — schema deltas in place; depends on Plan 05-02 errors for `PolicyArchivedError` import
- Plan 05-04 (orchestrators) — depends on Plan 05-03 repository methods

**Blockers:**
- Operator TEST DB credential rotation (see Issues Encountered)
- Operator staging + prod migration application (out of scope; tracked as follow-up)

## Threat Flags

No new security-relevant surface beyond the planned `<threat_model>`. The qa_citation_grants table was already enumerated in T-05-01-02 with mitigation (wrapped RLS predicate, FK cascade, UNIQUE constraint), all of which shipped exactly as specified.

## Self-Check: PASSED

All 8 claimed files exist on disk. All 3 task commit hashes (0552341, b54ff02, 298cb59) exist in git log on `gsd/phase-5-employee-portal`.

---

*Phase: 05-employee-portal*
*Completed: 2026-05-23 (code) — DB live verification pending operator TEST DB credential rotation*
