---
phase: 05-employee-portal
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/db/schema.ts
  - drizzle/0010_phase5_uniques.sql
  - drizzle/0011_qa_citation_grants.sql
  - drizzle/meta/_journal.json
  - drizzle/meta/0010_snapshot.json
  - drizzle/meta/0011_snapshot.json
  - scripts/check-schema.ts
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "0010 + 0011 migrations applied to dev DB and TEST DB via pnpm db:migrate + pnpm db:migrate:test"
    - "acknowledgments has UNIQUE (user_id, policy_id, policy_version_id)"
    - "policy_assignments has UNIQUE (policy_id, assignee_type, assignee_id)"
    - "qa_citation_grants table exists with RLS using post-0008 (SELECT auth.jwt()->>'org_id') wrapped form"
    - "qa_citation_grants exposes UNIQUE(org_id, user_id, policy_id) + 2 indexes + 4 GRANTs"
    - "scripts/check-schema.ts asserts all three new constraints + the new table shape and exits 0"
  artifacts:
    - path: "drizzle/0010_phase5_uniques.sql"
      provides: "two ALTER TABLE ADD CONSTRAINT statements"
      contains: "acknowledgments_user_id_policy_id_policy_version_id_unique"
    - path: "drizzle/0011_qa_citation_grants.sql"
      provides: "CREATE TABLE qa_citation_grants + RLS + GRANT"
      contains: "(SELECT auth.jwt()->>'org_id')"
    - path: "lib/db/schema.ts"
      provides: "qaCitationGrants pgTable export + 2 unique() table-options additions"
      contains: "qa_citation_grants_org_user_policy_unique"
    - path: "drizzle/meta/_journal.json"
      provides: "two new journal entries for 0010 + 0011"
      contains: "0010_phase5_uniques"
  key_links:
    - from: "lib/db/schema.ts"
      to: "qaCitationGrants pgTable"
      via: "named export"
      pattern: "export const qaCitationGrants"
    - from: "drizzle/0011_qa_citation_grants.sql"
      to: "post-0008 RLS wrapped form"
      via: "CREATE POLICY USING ((SELECT auth.jwt()->>'org_id'))"
      pattern: "\\(SELECT auth\\.jwt\\(\\)->>'org_id'\\)"
    - from: "scripts/check-schema.ts"
      to: "Phase 5 column-shape assertions"
      via: "qa_citation_grants column + UNIQUE + RLS checks"
      pattern: "qa_citation_grants"
---

<objective>
Wave 1 foundation. Land all Phase 5 schema changes (two new UNIQUE constraints on existing tables per D-28 + brand-new qa_citation_grants table per D-29) in `lib/db/schema.ts`, generate snapshot metadata, hand-write both migrations with operator-approval headers, apply them to dev DB AND TEST DB via the existing `pnpm db:migrate` + `pnpm db:migrate:test` commands, and extend `scripts/check-schema.ts` to assert the new constraint + table shape. This plan is BLOCKING for every other Phase 5 plan.

Purpose: D-06 idempotent ack inserts depend on the UNIQUE on acknowledgments; D-15 idempotent assignment inserts depend on the UNIQUE on policy_assignments; D-26 grant writes from `askQuestion` depend on the qa_citation_grants table. Repository code (05-03) and orchestrator code (05-04) all reference these schema objects via Drizzle's `$inferInsert` and FK targets — the schema MUST be in place first.

Output: Three additive schema artifacts (zero DROP statements), both migrations registered in `_journal.json`, both applied cleanly to dev + test DBs, and the schema auditor (`check-schema.ts`) green against the new shape.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@reference/SCHEMA.md
@lib/db/schema.ts
@drizzle/0001_rls_policies.sql
@drizzle/0007_ai_generations_audit_extensions.sql
@drizzle/0008_rls_subquery_wrap.sql
@scripts/check-schema.ts

<wave_grouping_rationale>
Wave 1 = schema + errors (parallel, no inter-plan deps). Wave 2 = repositories + orchestrators (depend on Wave 1 schema + errors). Wave 3 = pages + components (depend on Wave 2 contracts). Wave 4 = CI gates + integration test (depend on Wave 3 production code). Wave 5 = verify chain + operator UAT. Schema MUST land first because Drizzle's `$inferInsert` types in repositories resolve at compile time against the typed table exports; no later plan can typecheck before schema ships AND migrates against TEST DB (Drizzle types come from `pgTable()` exports, not from the live DB, but check-schema.ts integration assertions need the live DB).
</wave_grouping_rationale>

<interfaces>
<!-- Phase 5 schema delta — what later plans import from `lib/db/schema.ts` -->

Existing exports (already present, unchanged structure but options arrays extended):
```typescript
export const acknowledgments = pgTable('acknowledgments', { ... }, (table) => [
  index('acknowledgments_org_id_idx').on(table.orgId),
  // Phase 5 adds: unique('acknowledgments_user_id_policy_id_policy_version_id_unique').on(table.userId, table.policyId, table.policyVersionId),
]);
export const policyAssignments = pgTable('policy_assignments', { ... }, (table) => [
  index('policy_assignments_org_id_idx').on(table.orgId),
  // Phase 5 adds: unique('policy_assignments_policy_id_assignee_type_assignee_id_unique').on(table.policyId, table.assigneeType, table.assigneeId),
]);
```

Brand-new export this plan creates (Wave 2's repository will consume):
```typescript
export const qaCitationGrants = pgTable('qa_citation_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  grantedAt: timestamp('granted_at').defaultNow().notNull(),
}, (table) => [
  unique('qa_citation_grants_org_user_policy_unique').on(table.orgId, table.userId, table.policyId),
  index('qa_citation_grants_org_id_idx').on(table.orgId),
  index('qa_citation_grants_user_policy_idx').on(table.userId, table.policyId),
]);
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend lib/db/schema.ts with two UNIQUE adds + new qaCitationGrants table</name>
  <files>lib/db/schema.ts</files>
  <read_first>
    - lib/db/schema.ts (whole file — see acknowledgments at 39-57, policyAssignments at 176-186, policyVersions at 188-216 unique() precedent, departments at 117-129 composite-FK target UNIQUE precedent, users at 225-255 composite FK)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Schema Migrations (D-28 + D-29 verbatim)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/db/schema.ts` (modify - 2 UNIQUE + qaCitationGrants)"
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 1 (RLS subquery wrap — relevant because schema RLS doc must match migration form)
  </read_first>
  <action>
Edit `lib/db/schema.ts` per D-28 + D-29.

For the existing `acknowledgments` table (currently at lines 39-57): keep the existing `index('acknowledgments_org_id_idx').on(table.orgId)` table-option; ADD a second table-option entry:
- `unique('acknowledgments_user_id_policy_id_policy_version_id_unique').on(table.userId, table.policyId, table.policyVersionId)` per D-06
- Inline comment: "Phase 5 D-06 + D-10 — DB-enforced idempotency. ON CONFLICT DO NOTHING on this UNIQUE drives D-10 silent-success semantics. Does NOT include org_id (the user_id+policy_id+policy_version_id UUIDs already imply org via composite FK)."

For the existing `policyAssignments` table (currently at lines 176-186): keep the existing `index('policy_assignments_org_id_idx').on(table.orgId)`; ADD a second table-option entry:
- `unique('policy_assignments_policy_id_assignee_type_assignee_id_unique').on(table.policyId, table.assigneeType, table.assigneeId)` per D-15
- Inline comment: "Phase 5 D-15 — DB-enforced idempotency for bulk-assignment writes. Permits both (user, X) and (department, X) rows (different assignee_type) for the same policy — admin can target the same user individually AND via their dept; D-01 SELECT DISTINCT dedupes at query time."

Add brand-new export `qaCitationGrants` per D-29 (place alphabetically between `policyVersions` and `stripeEvents` — Drizzle thunked `references(() => ...)` defers evaluation so any order works; alphabetical wins on review diffs per Phase 2 D-08 precedent). Use the exact column shape from the `<interfaces>` block above. Use `timestamp` (NOT `timestamp({ withTimezone: true })`) to match Phase 2 + Phase 4 precedent. The three table-options entries per D-29: the UNIQUE constraint `qa_citation_grants_org_user_policy_unique`, the btree index `qa_citation_grants_org_id_idx` (for RLS predicate + listForUser path), and the composite btree `qa_citation_grants_user_policy_idx` (for the `hasGrant(s, userId, policyId)` predicate fast-path).

File-header comment block (around lines 1-25): add one new bullet documenting Phase 5 schema delta — "Phase 5 D-28: combined ALTER TABLE ADD CONSTRAINT migration in 0010 adds two UNIQUE constraints (acknowledgments + policy_assignments). Phase 5 D-29: new qa_citation_grants table (Q&A→citation server-tracked grants per T-2(4c)) with RLS using post-0008 wrapped (SELECT auth.jwt()->>'org_id') form per RESEARCH gap-1."

Do NOT touch any other column shapes; do NOT add `extracted_text` or any other column to `policies` (out of scope per Phase 4 D-07). Do NOT change `acknowledgments` to remove or rename `ipAddress` (must stay `text`, nullable, per Phase 2 schema + D-05 verbatim-capture semantics). Append-only invariant on `acknowledgments` is preserved: this plan touches ONLY the table-options array; the existing "NEVER DELETE OR UPDATE ROWS" comment at lines 47-52 must remain.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0 (compile-time check that `qaCitationGrants` typechecks against existing `organizations`, `users`, `policies` references)
    - `grep -nE "acknowledgments_user_id_policy_id_policy_version_id_unique|policy_assignments_policy_id_assignee_type_assignee_id_unique|qa_citation_grants_org_user_policy_unique" lib/db/schema.ts` finds at least 3 distinct hits (one per UNIQUE name)
    - `grep -n "export const qaCitationGrants" lib/db/schema.ts` finds exactly 1 hit
    - `grep -n "qa_citation_grants_org_id_idx\|qa_citation_grants_user_policy_idx" lib/db/schema.ts` finds at least 2 hits
    - The existing `// NEVER DELETE OR UPDATE ROWS` comment at lines 47-52 of acknowledgments is preserved (grep `NEVER DELETE OR UPDATE ROWS` lib/db/schema.ts returns 1+ match)
  </acceptance_criteria>
  <done>
    All three schema additions present in `lib/db/schema.ts` (two UNIQUE table-options on existing tables + one new `qaCitationGrants` export with its own UNIQUE + 2 indexes + composite shape), `tsc --noEmit` exit 0.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Generate snapshot metadata + write drizzle/0010_phase5_uniques.sql + drizzle/0011_qa_citation_grants.sql + register both in _journal.json</name>
  <files>drizzle/0010_phase5_uniques.sql, drizzle/0011_qa_citation_grants.sql, drizzle/meta/_journal.json, drizzle/meta/0010_snapshot.json, drizzle/meta/0011_snapshot.json</files>
  <read_first>
    - drizzle/0007_ai_generations_audit_extensions.sql (whole file — header pattern, statement-breakpoint separators, operator-approval doc — verbatim model for both Phase 5 migrations per CONTEXT specifics)
    - drizzle/0001_rls_policies.sql (lines 1-30 header + lines 41-45 "departments" CREATE POLICY pattern + GRANT block)
    - drizzle/0008_rls_subquery_wrap.sql (lines 1-77 — post-0008 wrapped form (SELECT auth.jwt()->>'org_id') CRITICAL per RESEARCH gap-1)
    - drizzle/meta/_journal.json (whole file — observe entry shape: idx, version, when, tag, breakpoints; append 0010 then 0011 in order)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`drizzle/0010_phase5_uniques.sql`" + "`drizzle/0011_qa_citation_grants.sql`"
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 1 (0011 RLS predicate MUST use post-0008 wrapped form)
    - .planning/STATE.md (head — "pre-paying-customer status" is the basis for CLAUDE.md ASK-FIRST clearance on additive migrations)
  </read_first>
  <action>
Two hand-written migrations + their snapshot metadata + journal registration.

**File 1: `drizzle/0010_phase5_uniques.sql`** (per D-28 — combined bundle pattern matching 0007).

Header (verbatim shape, mirror 0007 lines 1-17):
- Plain-English description: "Phase 5 D-28 combined migration. Adds two UNIQUE constraints (additive only, no DROP)."
- Operator-approval reference: "Operator approved via /gsd-discuss-phase 5 --power answers Q-22(a) + Q-23(a) (2026-05-23, per .planning/phases/05-employee-portal/05-CONTEXT.md `<decisions>` D-28). CLAUDE.md ASK-FIRST cleared per .planning/STATE.md pre-paying-customer status — no production data exists; cannot fail on duplicate-row conflict."
- Rationale: "D-06 drives DB-enforced idempotency for `Acknowledgments.record` (ON CONFLICT DO NOTHING). D-15 drives DB-enforced idempotency for `PolicyAssignments.create` (admin double-click safe)."

Body (two ALTER TABLE statements separated by `--> statement-breakpoint`):
```sql
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_user_id_policy_id_policy_version_id_unique"
  UNIQUE ("user_id", "policy_id", "policy_version_id");
--> statement-breakpoint
ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_policy_id_assignee_type_assignee_id_unique"
  UNIQUE ("policy_id", "assignee_type", "assignee_id");
```

**File 2: `drizzle/0011_qa_citation_grants.sql`** (per D-29 + RESEARCH gap-1 — CRITICAL: wrapped form).

Header:
- Plain-English description: "Phase 5 D-29 — Q&A citation-referral grant table for R-6. Records {org_id, user_id, policy_id} for every Anthropic-returned citation in `askQuestion` (lib/ai/qa.ts) so that subsequent navigation to /my-policies/[id] can render a TL;DR-only view for cited-but-not-assigned policies (per D-27 access boundary). Non-expiring grants for MVP."
- Operator-approval reference: "Operator approved via /gsd-discuss-phase 5 --power ultrathink-tightening T-2(4c) (2026-05-23, per .planning/phases/05-employee-portal/05-CONTEXT.md `<decisions>` D-26 + D-29). CLAUDE.md ASK-FIRST cleared per .planning/STATE.md pre-paying-customer status."
- Critical-correctness note: "RLS predicate uses post-0008 `(SELECT auth.jwt()->>'org_id')` wrapped form, NOT the unwrapped baseline. See RESEARCH Pitfall 1 — the splinter `0003_auth_rls_initplan` lint rule fires on unwrapped form AND per-row JWT eval kills scale on the new table."

Body (CREATE TABLE + indexes + RLS + GRANT, statement-breakpoint between each top-level DDL):
- `CREATE TABLE qa_citation_grants` with all 5 columns + the inline `CONSTRAINT qa_citation_grants_org_user_policy_unique UNIQUE (org_id, user_id, policy_id)` per D-29 verbatim
- `CREATE INDEX qa_citation_grants_org_id_idx ON qa_citation_grants(org_id);`
- `CREATE INDEX qa_citation_grants_user_policy_idx ON qa_citation_grants(user_id, policy_id);`
- `ALTER TABLE qa_citation_grants ENABLE ROW LEVEL SECURITY;`
- `CREATE POLICY "org_isolation" ON qa_citation_grants FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));` — MUST be wrapped per RESEARCH gap-1
- `GRANT SELECT, INSERT, UPDATE, DELETE ON qa_citation_grants TO authenticated;`

**Snapshot metadata: `drizzle/meta/0010_snapshot.json` + `drizzle/meta/0011_snapshot.json`.**

Use `pnpm db:generate` to generate intermediate Drizzle snapshots, then RENAME the produced files to `0010_*.sql` + `0011_*.sql` and rewrite their bodies to match the hand-written SQL above. The generator will likely emit a `0010_<adjective>_<noun>.sql` + snapshot — discard the auto-generated SQL but keep the snapshot JSON (rename to `0010_snapshot.json` + `0011_snapshot.json`). If the generator over-emits or fails (e.g., generated SQL doesn't include the RLS DDL which is hand-written), use the Phase 4 0007 pattern documented in `04-02-SUMMARY.md`: micromanage `schema.ts` for two-step generation, then collapse intermediates into the final SQL files. Snapshot file `id` field MUST chain forward from 0009's snapshot's `id` (prevId pointer); 0011's snapshot prevId points to 0010's snapshot id.

**`drizzle/meta/_journal.json`** registration: APPEND two new entries to the `entries` array, in numerical order (0010 first, then 0011), each with `idx` incremented, `version` matching the existing entries' version, `when` field as a fresh `Date.now()` int, `tag` as `"0010_phase5_uniques"` then `"0011_qa_citation_grants"`, and `breakpoints: true` (matches 0007 + 0008 + 0009 precedent).

Do NOT collapse 0010 + 0011 into a single file (D-28 vs D-29 are explicitly separate per CONTEXT specifics — 0010 is the ALTER-CONSTRAINT bundle; 0011 is the brand-new table+RLS). Do NOT use the unwrapped `auth.jwt()->>'org_id'` form anywhere in 0011 (RESEARCH gap-1 is non-negotiable). Do NOT use UTC-timestamp-bearing `timestamp({ withTimezone: true })` — match the Phase 2/4 baseline `timestamp` shape.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -nE "auth\\.jwt\\(\\)->>'org_id'" drizzle/0011_qa_citation_grants.sql | grep -v "^#" | grep -v "^--" | grep -cE "\\(SELECT auth\\.jwt"</automated>
  </verify>
  <acceptance_criteria>
    - File `drizzle/0010_phase5_uniques.sql` exists and contains both ALTER TABLE statements joined by `--> statement-breakpoint`
    - File `drizzle/0011_qa_citation_grants.sql` exists and contains CREATE TABLE + 2 CREATE INDEX + ALTER TABLE ENABLE RLS + CREATE POLICY + GRANT
    - `grep -nE "Q-22\\(a\\).*Q-23\\(a\\)" drizzle/0010_phase5_uniques.sql` matches in header (operator-approval reference)
    - `grep -nE "T-2\\(4c\\)" drizzle/0011_qa_citation_grants.sql` matches in header
    - `grep -cE "\\(SELECT auth\\.jwt\\(\\)->>'org_id'\\)" drizzle/0011_qa_citation_grants.sql` returns at least 1 (wrapped form present; if 0 → RESEARCH gap-1 violation)
    - `grep -cE "^[^-]*auth\\.jwt\\(\\)->>'org_id'(?!\\))" drizzle/0011_qa_citation_grants.sql` returns 0 (no unwrapped `auth.jwt()->>'org_id'` outside a SELECT wrapper, ignoring SQL `--` comment lines)
    - `drizzle/meta/_journal.json` contains both `"0010_phase5_uniques"` and `"0011_qa_citation_grants"` tag entries
    - `drizzle/meta/0010_snapshot.json` and `drizzle/meta/0011_snapshot.json` exist
    - `pnpm tsc --noEmit` exits 0 (no type regression)
  </acceptance_criteria>
  <done>
    Both migrations and snapshot metadata exist on disk, `_journal.json` registers both tags in alphabetical/numerical order, 0011 RLS uses the wrapped form per RESEARCH gap-1.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: [BLOCKING] Apply migrations — pnpm db:migrate (dev DB) AND pnpm db:migrate:test (TEST DB)</name>
  <files>(no source files modified — runtime DB operation; one log artifact in stdout)</files>
  <read_first>
    - CLAUDE.md § "Database Migration Discipline" (pre-deploy gate; for Phase 5 the DEV+TEST scope is in-scope; staging/prod are operator-gated separate step)
    - .planning/STATE.md (Plan 02-06 + Plan 04-02 + 2026-05-23 staging deploy entries for migrate command precedent)
    - .planning/phases/02-data-layer/02-06-SUMMARY.md if available, otherwise pattern from STATE.md entries — for the `pnpm db:migrate:test` orchestrator override pattern
    - package.json lines 20-21 — confirm `db:migrate` + `db:migrate:test` script definitions
    - drizzle/meta/_journal.json (just-updated by Task 2 — confirm both 0010 + 0011 entries are present BEFORE running migrate)
  </read_first>
  <action>
Run the in-scope DEV+TEST DB migrations for Phase 5. Both commands are non-interactive (drizzle-kit migrate, not push) — no env hint needed.

Step 1: `pnpm db:migrate` — applies the new migrations 0010 + 0011 to the dev DB via `DATABASE_URL` + `DIRECT_URL` from `.env.local`.
- Expected stdout: `[✓] migrations applied successfully` plus per-migration NOTICE lines (none on first apply; NOTICEs about "relation already exists, skipping" would indicate a previous failed partial-apply needing operator intervention).
- If failure: STOP and surface to operator — likely causes are (a) `_journal.json` malformed (Task 2 didn't properly register entries — re-read & repair); (b) Drizzle snapshot id chain broken (0010_snapshot.prevId or 0011_snapshot.prevId mis-points — re-read & repair); (c) SQL syntax error in 0010 or 0011 (read pg error message verbatim and fix). Do NOT swallow errors.

Step 2: `pnpm db:migrate:test` — applies the same migrations to the TEST DB via `DATABASE_URL_TEST` + `DIRECT_URL_TEST` (Plan 02-02 D-05 env vars; SF-DB-1 CLOSED 2026-05-18 per STATE.md).
- Expected stdout: same `[✓] migrations applied successfully` shape.
- If failure: same triage as Step 1; SF-DB-1 CLOSED means TEST DB is reachable; if reachability error, surface immediately.

Step 3: Spot-check by running `pnpm db:verify` against dev DB if available, OR run a one-shot psql query proving 0011 landed:
- Use the existing `scripts/check-deploy-schema.ts` if it covers Phase 5 (it doesn't yet — that's deploy-prep scope) OR insert a minimal probe via `tsx --env-file=.env.local -e "import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL!); const rows = await sql\`SELECT 1 FROM information_schema.tables WHERE table_name='qa_citation_grants'\`; console.log(rows.length === 1 ? 'OK qa_citation_grants exists' : 'FAIL'); await sql.end();"`. The Task-4 next task (`check-schema.ts` extension) is the authoritative gate; this step is sanity-only.

Do NOT skip Step 2 — both DBs MUST be migrated before any subsequent integration script (`scripts/check-employee-portal.ts` in Wave 4) can pass. CLAUDE.md Database Migration Discipline requires staging+prod migration via the Pattern-3 wrapper (`pnpm db:migrate:staging` + `pnpm db:migrate:prod`) BUT those are operator-gated and out of scope for execute-phase — surface them as a follow-up in the SUMMARY.md.
  </action>
  <verify>
    <automated>tsx --env-file=.env.local -e "import postgres from 'postgres'; const sql = postgres(process.env.DATABASE_URL); const t = await sql\`SELECT 1 FROM information_schema.tables WHERE table_name='qa_citation_grants'\`; const u1 = await sql\`SELECT 1 FROM pg_constraint WHERE conname='acknowledgments_user_id_policy_id_policy_version_id_unique'\`; const u2 = await sql\`SELECT 1 FROM pg_constraint WHERE conname='policy_assignments_policy_id_assignee_type_assignee_id_unique'\`; if (t.length===1 && u1.length===1 && u2.length===1) console.log('OK'); else { console.error('FAIL', {t:t.length, u1:u1.length, u2:u2.length}); process.exit(1); } await sql.end();"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm db:migrate` against dev DB exits 0 (Drizzle-kit emits `[✓] migrations applied successfully`)
    - `pnpm db:migrate:test` against TEST DB exits 0
    - Live dev DB: `SELECT 1 FROM information_schema.tables WHERE table_name='qa_citation_grants'` returns 1 row
    - Live dev DB: `SELECT 1 FROM pg_constraint WHERE conname='acknowledgments_user_id_policy_id_policy_version_id_unique'` returns 1 row
    - Live dev DB: `SELECT 1 FROM pg_constraint WHERE conname='policy_assignments_policy_id_assignee_type_assignee_id_unique'` returns 1 row
    - SUMMARY.md notes "staging + prod migration is operator-gated follow-up per CLAUDE.md Database Migration Discipline; out of execute-phase scope" — and lists the exact two Pattern-3 commands the operator will run (`pnpm db:migrate:staging` + `pnpm db:migrate:prod`) plus the required `pnpm db:verify:staging` / `pnpm db:verify:prod` gates per CLAUDE.md
  </acceptance_criteria>
  <done>
    Dev DB + TEST DB both carry the 0010 + 0011 migrations; the inline probe verifying table + 2 constraint existence exits 0.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Extend scripts/check-schema.ts with Phase 5 column-shape + UNIQUE-constraint + RLS assertions</name>
  <files>scripts/check-schema.ts</files>
  <read_first>
    - scripts/check-schema.ts (whole file — TENANT_TABLES at lines 31-46, per-table assertion loop at lines 69-100, final summary log at line 164)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`scripts/check-schema.ts` (modify - Phase 5 column-shape assertions)"
    - drizzle/0010_phase5_uniques.sql + drizzle/0011_qa_citation_grants.sql (just-created in Task 2 — for exact constraint names + table shape to assert against)
  </read_first>
  <action>
Extend `scripts/check-schema.ts` per D-08 step-5 pattern + Phase 5 deltas.

Edit 1: Add `'qa_citation_grants'` to the `TENANT_TABLES` const at lines 31-46. Insert in alphabetical order (after `'policy_versions'` OR at the end with comment — match Phase 4's `'batch_jobs'` placement style: end of array with a `// Phase 5 D-29 — new tenant table for Q&A citation-referral grants per T-2(4c).` comment).

Edit 2: After the existing per-table assertion loop (which auto-covers RLS + policy + 4 GRANTs for the new table once it's in `TENANT_TABLES`), ADD a new assertion block specific to the Phase 5 UNIQUE constraints + column shape. Mirror the pattern around the existing `policy_versions_policy_id_version_number_unique` assertion if present at the file tail (line ~164 area):

```typescript
// Phase 5 D-28 + D-29 — assert new UNIQUE constraints exist
const phase5Constraints = await sql<{ conname: string }[]>`
  SELECT conname FROM pg_constraint
  WHERE conname IN (
    'acknowledgments_user_id_policy_id_policy_version_id_unique',
    'policy_assignments_policy_id_assignee_type_assignee_id_unique',
    'qa_citation_grants_org_user_policy_unique'
  )`;
if (phase5Constraints.length !== 3) {
  console.error('FAIL — Phase 5 UNIQUE constraints missing. Expected 3, got', phase5Constraints.length);
  process.exit(1);
}

// Phase 5 D-29 — assert qa_citation_grants column shape
const grantCols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_name = 'qa_citation_grants' AND table_schema = 'public'
  ORDER BY ordinal_position`;
const expectedGrantCols = [
  { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'org_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'user_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'policy_id', data_type: 'uuid', is_nullable: 'NO' },
  { column_name: 'granted_at', data_type: 'timestamp without time zone', is_nullable: 'NO' },
];
// Assert column-by-column shape (name + data_type + is_nullable)

// Phase 5 D-29 — assert qa_citation_grants RLS policy uses WRAPPED form per RESEARCH gap-1
const grantPolicy = await sql<{ qual: string | null }[]>`
  SELECT qual FROM pg_policies
  WHERE tablename = 'qa_citation_grants' AND policyname = 'org_isolation'`;
if (grantPolicy.length !== 1 || !grantPolicy[0].qual?.includes('(SELECT auth.jwt()')) {
  console.error('FAIL — qa_citation_grants org_isolation must use wrapped (SELECT auth.jwt()) form per RESEARCH gap-1');
  process.exit(1);
}

// Phase 5 D-29 — assert qa_citation_grants indexes exist
const grantIdx = await sql<{ indexname: string }[]>`
  SELECT indexname FROM pg_indexes
  WHERE tablename = 'qa_citation_grants'
  AND indexname IN ('qa_citation_grants_org_id_idx', 'qa_citation_grants_user_policy_idx')`;
if (grantIdx.length !== 2) {
  console.error('FAIL — qa_citation_grants indexes missing. Expected 2, got', grantIdx.length);
  process.exit(1);
}
```

Update the final summary log line (around line 164) to include the new counts. After update it should read approximately: `OK — schema audit: ${TENANT_TABLES.length} tenant-scoped tables verified (exists + RLS + policy + 4 GRANTs); 2 service-role tables verified (NO RLS); policy_versions UNIQUE + Phase 5 acknowledgments/policy_assignments UNIQUE + qa_citation_grants UNIQUE + columns + indexes + wrapped-RLS all present.`

Do NOT add new TENANT_TABLES entries beyond `'qa_citation_grants'` — the other Phase 5 changes (the two UNIQUE adds) are constraints on EXISTING tables and live in the constraint assertion block, not the table loop. Do NOT remove or weaken any existing assertion.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm check:rls && pnpm check:db 2>&1 | head -5 && tsx --env-file=.env.local scripts/check-schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `tsx --env-file=.env.local scripts/check-schema.ts` exits 0 against live dev DB (the migrations from Task 3 are in place)
    - `grep -c "'qa_citation_grants'" scripts/check-schema.ts` returns at least 1 (added to TENANT_TABLES)
    - `grep -nE "acknowledgments_user_id_policy_id_policy_version_id_unique|policy_assignments_policy_id_assignee_type_assignee_id_unique|qa_citation_grants_org_user_policy_unique" scripts/check-schema.ts | wc -l` returns at least 3 (all three new constraint names mentioned)
    - `grep -n "\\(SELECT auth.jwt" scripts/check-schema.ts` returns 1+ (wrapped-form assertion in place)
    - `pnpm check:rls` is NOT yet expected to pass for `qa_citation_grants` (Plan 05-08 extends `check-rls.ts` TENANT_TABLES) — but it MUST still exit 0 for the 11 pre-Phase-5 tables. This task does NOT touch `check-rls.ts`.
  </acceptance_criteria>
  <done>
    `scripts/check-schema.ts` extended to assert all 3 new UNIQUE names, the new table's 5-column shape, the new table's 2 indexes, and the wrapped-form RLS predicate. Script exits 0 against live dev DB.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| migration → live DB | Hand-written DDL crosses the application/DB boundary; SQL injection impossible (no parameterized input — these are migration files reviewed before commit) but RLS predicate correctness matters because every later RLS-protected SELECT depends on it |
| Drizzle schema.ts → tsc | Schema export shape is the source of truth for `$inferInsert` types consumed by repositories in Wave 2 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01-01 | Tampering | drizzle/0011_qa_citation_grants.sql RLS predicate | mitigate | RESEARCH gap-1 — MUST use post-0008 `(SELECT auth.jwt()->>'org_id')` wrapped form. Without the wrap, splinter lint `0003_auth_rls_initplan` fires AND every SELECT re-evaluates `auth.jwt()` per row at scale (perf-cliff). Task 2 enforces; Task 4 asserts via `scripts/check-schema.ts` pg_policies query. |
| T-05-01-02 | Information Disclosure | qa_citation_grants table → cross-org leak | mitigate | RLS predicate `org_id::text = (SELECT auth.jwt()->>'org_id')` blocks cross-org SELECT/INSERT/UPDATE/DELETE; FK `org_id REFERENCES organizations(id) ON DELETE CASCADE` ensures tenant offboarding wipes grants; UNIQUE `(org_id, user_id, policy_id)` ensures grant rows can't collide cross-org even if a hallucinated policyId UUID-collided. (RESEARCH § Pitfall 3 + § Security Domain row "Cross-org grant via UUID collision".) Plan 05-08 extends `scripts/check-rls.ts` TENANT_TABLES to add the new table — without that, the new table's RLS goes untested. |
| T-05-01-03 | Tampering | acknowledgments UNIQUE constraint as idempotency boundary | accept | D-06 + D-10 explicitly choose DB-enforced idempotency via ON CONFLICT DO NOTHING. A duplicate INSERT attempt rolls back to no-op + empty `RETURNING`. The risk that two concurrent acks race past the type-system layer is closed at the DB. |
| T-05-01-04 | Repudiation | acknowledgments append-only invariant | mitigate (defense-in-depth) | Schema header preserves the existing "NEVER DELETE OR UPDATE ROWS" comment (ADR-018). DB GRANTs include UPDATE+DELETE for `authenticated` role per 0001_rls_policies.sql:67-73 (documented asymmetry); the LOCK is at the app layer — `tests/types.ts` D-07 invariants + Plan 05-08 new ts-morph CI gate per D-18. This plan does NOT change the app-layer lock; it only adds the new UNIQUE constraint orthogonal to the append-only rule. |
| T-05-01-05 | Tampering | _journal.json malformation causing partial-apply | mitigate | Task 2 asserts journal entries appended in numerical order with monotonic idx + valid snapshot prevId chain. Task 3 stops + surfaces on migrate failure rather than swallowing — half-applied migrations would lose the wrapped-form RLS on 0011 (the most critical correctness invariant in this plan). |
| T-05-01-SC | Tampering | npm/pip/cargo installs | accept | No new packages — Phase 5 ships zero new dependencies per RESEARCH § "Package Legitimacy Audit". No slopcheck required. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0 after every task
- `pnpm db:migrate` exits 0 on dev DB
- `pnpm db:migrate:test` exits 0 on TEST DB
- `tsx --env-file=.env.local scripts/check-schema.ts` exits 0 against live dev DB
- `pnpm verify:phase-4` still exits 0 (no regression of prior phases) — run as final phase-baseline gate

Final commit boundary commands (run after all 4 tasks complete):
- `pnpm verify:phase-4` exits 0 (chains through all Phase 1-4 checks including schema audit for the now-extended TENANT_TABLES)
</verification>

<success_criteria>
- `lib/db/schema.ts` exports `qaCitationGrants` table + 2 UNIQUE additions to existing tables; tsc clean
- `drizzle/0010_phase5_uniques.sql` + `drizzle/0011_qa_citation_grants.sql` + their snapshot JSONs exist + journal registered
- Live dev DB carries both migrations applied cleanly
- Live TEST DB carries both migrations applied cleanly
- `scripts/check-schema.ts` extended and exits 0 against live dev DB with new assertions firing positive
- No regression — `pnpm verify:phase-4` still exits 0
- SUMMARY.md flags the staging+prod operator-gated migration as follow-up per CLAUDE.md Database Migration Discipline
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-01-SUMMARY.md` when done — document Task 1 schema edits (line ranges touched in schema.ts), Task 2 migration body verbatim + journal entry positions, Task 3 migrate command stdout (sanitized — no DB URLs), Task 4 check-schema.ts assertion delta. Surface "staging + prod migrations are operator-gated follow-up" to Next Steps section.
</output>
