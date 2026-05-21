---
phase: 04-ai-layer
plan: 04-02
subsystem: database
tags: [drizzle, postgres, rls, schema, migration, anthropic, batch-jobs, ai-generations, idempotency]

# Dependency graph
requires:
  - phase: 02-data-layer
    provides: "Phase 2 drizzle schema (12 tables + 10 RLS tenant tables + 4-statement RLS pattern at drizzle/0001_rls_policies.sql + GRANT-to-authenticated requirement for withOrgScope SET LOCAL ROLE)"
  - phase: 03-admin-ui
    provides: "drizzle/0004_policy_versions_unique.sql combined-migration analog (Drizzle-generated DDL + hand-written DELETE pre-step, statement-breakpoint separated)"
  - phase: 04-ai-layer/04-01
    provides: "SDK 0.97.1 installed (lockfile entry); reference/SCHEMA.md amended with batch_jobs + widened ai_generations as canonical contract; reference/API-SPEC.md citation-shape amendment"
provides:
  - "lib/db/schema.ts batchJobs table (8 columns including D-34 .notNull() updatedAt for 25s stale-window gate)"
  - "lib/db/schema.ts aiGenerations widened (5 new nullable cols: input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, idempotency_key; tokens_used dropped)"
  - "drizzle/0005_initial_batch_jobs.sql (Drizzle-generated CREATE TABLE batch_jobs + UNIQUE on anthropic_batch_id + FK org_id->organizations ON DELETE CASCADE)"
  - "drizzle/0006_rls_batch_jobs.sql (hand-written 4-statement RLS block per D-29 + ADR-025)"
  - "drizzle/0007_ai_generations_audit_extensions.sql (combined migration: DROP tokens_used + 5x ADD COLUMN + hand-written partial-unique index ai_generations_org_idempotency_key WHERE idempotency_key IS NOT NULL)"
  - "Live TEST DB advanced through migrations 5/6/7: batch_jobs exists with RLS; ai_generations widened with new columns + partial-unique index; tokens_used dropped"
affects: [04-ai-layer/04-07, 04-ai-layer/04-10, 04-ai-layer/04-14, 06-billing, 08-validation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle two-step generation workaround for column-rename ambiguity in non-TTY shells: micromanage schema.ts through transitional intermediates, then collapse the two emitted snapshots into one canonical-named file"
    - "Hand-written partial-unique index (CREATE UNIQUE INDEX ... WHERE) appended after --> statement-breakpoint inside a Drizzle-generated migration — analog: drizzle/0004_policy_versions_unique.sql"
    - "4-statement-per-table RLS pattern (ALTER ENABLE + CREATE POLICY org_isolation + GRANT to authenticated + NOT NULL comment) mirrored from drizzle/0001_rls_policies.sql per ADR-025"

key-files:
  created:
    - "drizzle/0005_initial_batch_jobs.sql"
    - "drizzle/0006_rls_batch_jobs.sql"
    - "drizzle/0007_ai_generations_audit_extensions.sql"
    - "drizzle/meta/0005_snapshot.json"
    - "drizzle/meta/0006_snapshot.json"
    - "drizzle/meta/0007_snapshot.json"
  modified:
    - "lib/db/schema.ts"
    - "drizzle/meta/_journal.json"

key-decisions:
  - "Drizzle-emitted ADD/DROP column DDL collapsed into a single canonical 0007 file (rather than shipping two Drizzle-numbered migrations) — preserves the plan's three-file output spec (0005/0006/0007) and matches the Phase 3 0004 analog precedent of a single combined-migration file per logical change."
  - "Snapshot at idx=7 derived from the post-DROP-COLUMN intermediate's content with prevId rewritten to point to 0006_rls_batch_jobs snapshot id — keeps the Drizzle snapshot chain linear without orphan entries after collapsing the intermediates."
  - "BLOCKING gate (Task 5) executed by exporting DATABASE_URL=$DATABASE_URL_TEST + DIRECT_URL=$DIRECT_URL_TEST from .env.local and invoking drizzle-kit migrate directly (mirrors scripts/check-data-layer.ts pattern), NOT via pnpm db:migrate:test (whose --env-file=.env.local.test points at the intentionally-empty placeholder file from the SF-DB-1 deferral)."

patterns-established:
  - "Pattern A — Drizzle column-rename ambiguity workaround: when adding new columns AND dropping a column with names that could plausibly be renames, stage the schema.ts edits in two passes (ADD first, then DROP) to bypass the non-TTY interactive prompt; collapse intermediate files into the canonical-named single migration"
  - "Pattern B — Verification via .tmp/verify-04-02-test-db.mjs: gitignored postgres.js script asserting column lists + RLS state + partial-unique index def via information_schema/pg_indexes/pg_policies queries — to be reused by future schema-push tasks"

requirements-completed:
  - REQ-ai-policy-assistant
  - REQ-ai-usage-rules

# Metrics
duration: ~17 min
completed: 2026-05-21
---

# Phase 4 Plan 04-02: Schema + Migrations + db:push BLOCKING Gate — Summary

**Phase 4 AI Layer schema scaffold: batch_jobs table for Consistency Check batch state tracking + aiGenerations widened to Anthropic Usage shape (4 cache-token cols + idempotency_key); 3 Drizzle migrations shipped (0005/0006/0007) and applied to the live TEST DB.**

## Performance

- **Duration:** ~17 minutes (2026-05-21T17:43Z → 2026-05-21T18:00Z)
- **Started:** 2026-05-21T17:43:00Z
- **Completed:** 2026-05-21T18:00:15Z
- **Tasks:** 5 / 5 complete (1 BLOCKING gate cleared)
- **Files created:** 6 (3 SQL migrations + 3 snapshot JSONs)
- **Files modified:** 2 (`lib/db/schema.ts`, `drizzle/meta/_journal.json`)
- **Commits:** 5 atomic (1 schema + 3 migrations + 1 ops)

## Accomplishments

- **schema.ts widened**: `aiGenerations` lost `tokensUsed` integer and gained 5 nullable cols (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, `idempotencyKey`) per D-35 + D-32; new `batchJobs` table added with 8 cols including D-34's `.notNull()` `updatedAt` for the 25s stale-window gate at the consistency polling endpoint
- **Three migrations shipped** at canonical names (0005/0006/0007) per RESEARCH § Drizzle Combined-Migration Pattern numbering correction:
  - `0005_initial_batch_jobs.sql` — Drizzle-generated CREATE TABLE `batch_jobs` (8 cols, UNIQUE on `anthropic_batch_id`, FK `org_id` → `organizations(id)` ON DELETE CASCADE)
  - `0006_rls_batch_jobs.sql` — Hand-written 4-statement RLS block (ENABLE RLS + CREATE POLICY org_isolation + GRANT to authenticated + NOT NULL comment)
  - `0007_ai_generations_audit_extensions.sql` — Combined (Drizzle-generated DROP + 5x ADD COLUMN + hand-written partial-unique index `ai_generations_org_idempotency_key WHERE (idempotency_key IS NOT NULL)`)
- **Live TEST DB advanced** through all three migrations via `drizzle-kit migrate` against `$DATABASE_URL_TEST`; psql verification confirmed the batch_jobs table + RLS policy, the 5 new `ai_generations` columns, the absence of `tokens_used`, and the partial-unique index definition
- **BLOCKING gate cleared**: Wave 1+ plans (04-07 repositories, 04-10 RLS extension, 04-14 integration tests) can now run against the live TEST DB without compile-clean / runtime-fail false-positives

## Task Commits

Each task was committed atomically:

1. **Task 1: Update lib/db/schema.ts — widen aiGenerations + add batchJobs** — `fe3217c` (schema)
2. **Task 2: Generate drizzle/0005_initial_batch_jobs.sql** — `45d3c12` (migration)
3. **Task 3: Hand-write drizzle/0006_rls_batch_jobs.sql** — `f5726e7` (migration)
4. **Task 4: Generate + hand-augment drizzle/0007_ai_generations_audit_extensions.sql** — `05f3951` (migration)
5. **Task 5: [BLOCKING] Apply migrations to TEST DB** — `126af63` (ops, empty commit recording the schema-push gate clearance)

## Files Created/Modified

### Created (6)

- `drizzle/0005_initial_batch_jobs.sql` — Drizzle-generated DDL: CREATE TABLE `batch_jobs` with the 8 columns (id, org_id, anthropic_batch_id, type='consistency', status='in_progress', created_at, updated_at NOT NULL, result_json) + UNIQUE constraint on `anthropic_batch_id` + FK `org_id` → `organizations(id)` ON DELETE CASCADE.
- `drizzle/0006_rls_batch_jobs.sql` — Hand-written 4-statement RLS block. Lines 1-3: ALTER TABLE ENABLE RLS. Lines 9-11: CREATE POLICY org_isolation FOR ALL USING (org_id::text = auth.jwt()->>'org_id'). Lines 14: GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated. Lines 17-18: NOT NULL comment (org_id NOT NULL emitted at DDL via .notNull() in schema.ts).
- `drizzle/0007_ai_generations_audit_extensions.sql` — Combined migration. Lines 16-20: 1x DROP COLUMN tokens_used. Lines 22-30: 5x ADD COLUMN (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, idempotency_key). Lines 36-38: Hand-written CREATE UNIQUE INDEX ai_generations_org_idempotency_key ON ai_generations(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL. All statements separated by `--> statement-breakpoint`. Lines 1-14: top-of-file header citing D-32 + D-35 + irreversible DROP + operator approval 2026-05-21.
- `drizzle/meta/0005_snapshot.json` — Snapshot at migration boundary idx=5 (batch_jobs added, ai_generations still has tokens_used).
- `drizzle/meta/0006_snapshot.json` — Snapshot at idx=6 (RLS migration is a `--custom` empty shell — schema columns unchanged from 0005).
- `drizzle/meta/0007_snapshot.json` — Snapshot at idx=7 reflecting final ai_generations shape (5 new cols, idempotency_key, tokens_used dropped; partial-unique index NOT tracked here per the analog 0004 precedent — Drizzle .unique() cannot emit partial indexes). Derived from intermediate 0008 snapshot's content with prevId rewritten to 0006's id (UUID `2a40af48-e24c-4749-a85f-6dfe2e7c787b`) so the snapshot chain stays linear after collapsing the two-step intermediates.

### Modified (2)

- `lib/db/schema.ts` — Lines 54-76: `aiGenerations` block rewritten (kept `id`, `orgId`, `policyId`, `type`, `prompt`, `result`, `model`, `createdAt`; dropped `tokensUsed`; added 5 nullable cols + `idempotencyKey`). Lines 78-93: NEW `batchJobs` block inserted between `aiGenerations` and `clerkEvents` (alphabetical order preserved). Imports unchanged (jsonb already imported in Phase 2).
- `drizzle/meta/_journal.json` — Added entries idx=5 / 6 / 7 with tags `0005_initial_batch_jobs`, `0006_rls_batch_jobs`, `0007_ai_generations_audit_extensions`. Monotonically increasing `when` timestamps. Two intermediate entries (`0007_funny_magma` idx=7, `0008_dry_masque` idx=8) were created during the two-step workaround then collapsed away.

## Live TEST DB Verification (Task 5 BLOCKING gate)

`drizzle-kit migrate` against `$DATABASE_URL_TEST` (from `.env.local`) applied all three migrations cleanly in **~3.5 seconds**. Post-migration psql queries (full log at `.tmp/verify-04-02-test-db.log`, gitignored):

```
=== batch_jobs columns (8) ===
  id (uuid, NOT NULL, default gen_random_uuid())
  org_id (uuid, NOT NULL)
  anthropic_batch_id (text, NOT NULL)
  type (text, NOT NULL, default 'consistency'::text)
  status (text, NOT NULL, default 'in_progress'::text)
  created_at (timestamp, nullable, default now())
  updated_at (timestamp, NOT NULL, default now())
  result_json (jsonb, nullable)

=== batch_jobs RLS state ===
  relrowsecurity=true (ENABLE ROW LEVEL SECURITY applied)
  policy: org_isolation / cmd=ALL /
          USING: ((org_id)::text = (auth.jwt() ->> 'org_id'::text))

=== ai_generations columns (13) ===
  id, org_id, policy_id, type, prompt, result, model, created_at,
  input_tokens, output_tokens, cache_read_input_tokens,
  cache_creation_input_tokens, idempotency_key
  (tokens_used confirmed ABSENT)

=== ai_generations partial-unique index ===
  CREATE UNIQUE INDEX ai_generations_org_idempotency_key
  ON public.ai_generations USING btree (org_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL)
```

All 6 assertions in `.tmp/verify-04-02-test-db.mjs` PASSED.

## Decisions Made

- **Drizzle generation strategy** — Followed the plan's CRITICAL workaround note for Task 2: when `pnpm db:generate` produced an ambiguous column-rename prompt (no TTY in this shell), temporarily reverted the `aiGenerations` widening, generated `0005` with only `batchJobs`, then restored the widening before committing. For Task 4 the same prompt fired again on the `tokens_used` drop vs the 5 new cols — extended the same workaround to a two-step generation (Step A: ADD 5 cols with `tokens_used` still present → intermediate 0007; Step B: DROP `tokens_used` → intermediate 0008), then collapsed the two SQL files into a single canonical-named 0007 and replaced the snapshot.
- **Empty ops commit for Task 5** — The BLOCKING gate is an operational action against a live DB, not a source-code change. Per the plan's "no source modifications" note and following the operational-commit convention from Phase 2's `check-data-layer` orchestrator pattern, committed with `--allow-empty` to record the gate clearance in git history with the full verification output embedded in the commit message body.
- **No state changes** — `.planning/STATE.md` and `.planning/ROADMAP.md` left untouched per the orchestrator's instructions ("Do NOT update STATE.md or ROADMAP.md — the orchestrator owns those writes after this plan completes"). Pre-existing modifications to those files from the orchestrator's prior session remain unstaged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two-step Drizzle generation workaround for column-rename ambiguity**
- **Found during:** Task 2 (first hit) and Task 4 (second hit, larger workaround needed)
- **Issue:** `pnpm db:generate` invoked Drizzle Kit's interactive column-resolver prompt because the diff between schema.ts and the prior snapshot had ambiguous candidates: in Task 2 the new `batchJobs` table being added simultaneously with `tokens_used` removal + 5 new `ai_generations` cols couldn't be cleanly inferred; in Task 4 the same `tokens_used` removal could plausibly be a rename to any of the 5 new column names. The shell environment provides no TTY (`process.stdin.isTTY` is false), so the Ink-based prompt cannot be answered. `winpty` was attempted but cannot upgrade `bash`'s non-interactive stdin into a true TTY.
- **Fix (Task 2):** Per the plan's Task 2 CRITICAL note, temporarily reverted the `aiGenerations` widening in `lib/db/schema.ts`, generated `0005` against only the `batchJobs` diff, then restored the widening before committing. Net schema.ts diff for Task 2's commit is zero (the widening from Task 1's commit `fe3217c` stays intact).
- **Fix (Task 4):** Extended the same workaround to a two-step pattern: schema.ts edited to keep `tokens_used` present alongside the 5 new cols (Step A → generated `0007_funny_magma.sql` with 5x ADD COLUMN ddl); then schema.ts edited to drop `tokens_used` (Step B → generated `0008_dry_masque.sql` with the single DROP COLUMN ddl). Hand-wrote the canonical `0007_ai_generations_audit_extensions.sql` combining both halves + the partial-unique index. Replaced `0007_snapshot.json` with the post-Step-B snapshot content (which reflects the final post-DROP schema state) and rewrote its `prevId` to point to `0006_rls_batch_jobs`'s snapshot id. Deleted the intermediate `0007_funny_magma.sql` + `0008_dry_masque.sql` + `0008_snapshot.json` + journal entries.
- **Files modified:** `lib/db/schema.ts` (transient state during workaround; restored at boundary), `drizzle/meta/_journal.json`, `drizzle/0007_ai_generations_audit_extensions.sql`, `drizzle/meta/0007_snapshot.json`
- **Verification:** `pnpm tsc --noEmit` exits 0; the plan's Task 2 + Task 4 inline verifier assertions all pass; live TEST DB post-migration verification confirms the on-disk state matches both the intent and the snapshot
- **Committed in:** `45d3c12` (Task 2) and `05f3951` (Task 4) — both commit-message bodies document the workaround in detail

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking — environment limitation)
**Impact on plan:** Workaround preserves the exact 3-file output (0005/0006/0007), the exact SQL contents, and the exact final schema.ts shape specified in the plan. The intermediate generation pattern is internally consistent (every change still flows through `pnpm db:generate`) and the collapsed snapshot remains a valid Drizzle artifact. No scope creep; no out-of-plan files created.

## Issues Encountered

- **Drizzle column-resolver TTY requirement** — Documented in detail above (Rule 3 deviation). The same non-TTY constraint will affect any future Drizzle column-rename scenarios in this environment; the two-step workaround should be encoded as a Pattern in `.planning/phases/04-ai-layer/04-PATTERNS.md` (deferred — operator can capture during the next discuss-phase if it's worth raising to first-class doctrine).
- **Drizzle-kit's `--custom` flag emits a snapshot identical to the previous one** — When using `--custom --name=...` to create empty migration shells (Task 3 + transient Task 4), Drizzle still emits a snapshot file. This is correct for `0006_rls_batch_jobs.json` (RLS DDL is outside Drizzle's schema-modeling surface, so the snapshot doesn't change) but means the snapshot at idx=N may NOT reflect the database's actual state if hand-written DDL diverges from `lib/db/schema.ts`. For Phase 4 this is benign — the partial-unique index in 0007 is intentionally out-of-band, and the analog `drizzle/0004_policy_versions_unique.sql` (Phase 3 G3 T3) sets the same precedent.

## User Setup Required

None — no external service configuration required by this plan. The TEST DB credentials in `.env.local` were already populated by the operator pre-Plan 02-06 (SF-DB-1 closed 2026-05-18 per STATE.md).

## Next Phase Readiness

- **Plan 04-07 (repositories)** can now consume `lib/db/schema.ts`'s widened `aiGenerations` shape + new `batchJobs` table. The `Omit<typeof aiGenerations.$inferInsert, ...>` type in the existing repository skeleton (`lib/db/repositories/ai_generations.ts`) auto-updates from the schema source — no repository code changes needed from Plan 04-02.
- **Plan 04-10 (`scripts/check-rls.ts` extension)** can extend `TENANT_TABLES` with `batch_jobs` for cross-org isolation verification (AC-24).
- **Plan 04-14 (integration tests)** can connect to TEST DB and exercise the new tables/columns without runtime schema errors.
- **No carry-forward blockers.** SF-DB-1 remains closed; no new SF tags introduced.
- **Threat-model surface:** The `batch_jobs` RLS policy is shipped but cross-org isolation is verified only at DDL level (the policy installed + RLS enabled + GRANT to authenticated) by this plan. Live cross-org test (T-04-02-DT mitigation per the plan's threat register) will land in Plan 04-10 via the `check-rls.ts` extension.

## Self-Check: PASSED

- [x] `lib/db/schema.ts` declares the widened `aiGenerations` (5 new nullable cols + `idempotencyKey`, no `tokensUsed`) — verified via Read at line 54-76.
- [x] `lib/db/schema.ts` declares the new `batchJobs` table (8 cols including `.notNull()` `updatedAt`) — verified at line 78-93.
- [x] `drizzle/0005_initial_batch_jobs.sql` exists with `CREATE TABLE "batch_jobs"` and no `ai_generations` references — verified.
- [x] `drizzle/0006_rls_batch_jobs.sql` exists with all 3 RLS DDL statements (ENABLE + CREATE POLICY + GRANT) — verified by grep.
- [x] `drizzle/0007_ai_generations_audit_extensions.sql` exists with DROP COLUMN tokens_used + 5x ADD COLUMN + the hand-written partial-unique index with `WHERE idempotency_key IS NOT NULL` — verified by grep.
- [x] `drizzle/meta/_journal.json` has entries idx=5, 6, 7 with canonical tags — verified.
- [x] Live TEST DB advanced: `batch_jobs` exists with RLS + org_isolation; `ai_generations` has 5 new cols + lacks `tokens_used`; partial-unique index `ai_generations_org_idempotency_key` exists — verified via `.tmp/verify-04-02-test-db.log`.
- [x] `pnpm tsc --noEmit` exits 0 — verified post-Task 4.
- [x] Commits exist: `fe3217c` (Task 1), `45d3c12` (Task 2), `f5726e7` (Task 3), `05f3951` (Task 4), `126af63` (Task 5) — verified via `git log c1eb22f..HEAD`.
- [x] No modifications to STATE.md, ROADMAP.md, or PLAN.md files — verified via `git status` and `git diff --stat`.

---
*Phase: 04-ai-layer*
*Plan: 04-02*
*Completed: 2026-05-21*
