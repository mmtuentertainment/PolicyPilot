---
phase: 05-employee-portal
plan: 09
type: execute
wave: 4
depends_on:
  - 05-01
  - 05-02
  - 05-03
  - 05-04
  - 05-05
  - 05-06
  - 05-07
files_modified:
  - scripts/check-employee-portal.ts
  - scripts/check-employee-portal.vitest.config.ts
  - lib/db/repositories/policies.test.ts
  - lib/db/repositories/acknowledgments.test.ts
  - lib/db/repositories/policy_assignments.test.ts
  - lib/db/repositories/qa_citation_grants.test.ts
  - lib/policies/acknowledgment.test.ts
  - app/(employee)/my-policies/[id]/actions.test.ts
  - app/(employee)/my-policies/ask/actions.test.ts
  - package.json
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "scripts/check-employee-portal.ts exists per D-22 — postgres-js + BYPASSRLS seed + SET LOCAL ROLE authenticated + intentional ROLLBACK + final TRUNCATE for idempotency"
    - "Integration test covers R-1 (4-row dashboard query), R-3 (re-ack indicator after editPublished+publish), R-4 (bulk-assign 1 row + 3 members see it), R-6 (Q&A returns citations + grant UPSERT), cross-org isolation (SPEC AC-10)"
    - "Anthropic mocking per D-23a — vi.mock('@/lib/ai/client') mirroring Phase 4 check-ai-layer.test.ts pattern"
    - "Co-located vitest test files exist for all 6 Phase 5 surfaces per D-21"
    - "tests/types.ts D-07 @ts-expect-error invariants STILL pass (R-5 type-system layer preserved)"
    - "package.json gains check:employee-portal script entry (verify:phase-5 chain target wired in Plan 05-10)"
  artifacts:
    - path: "scripts/check-employee-portal.ts"
      provides: "R-1+R-3+R-4+R-6+cross-org integration test"
      contains: "BYPASSRLS|withOrgScope"
      min_lines: 250
    - path: "scripts/check-employee-portal.vitest.config.ts"
      provides: "vitest config for R-6 mocking pattern (if R-6 runs via vitest)"
      contains: "vitest"
    - path: "lib/db/repositories/policies.test.ts"
      provides: "Co-located unit tests for listAssignedAndPublishedForUser (R-1 fixture)"
      contains: "listAssignedAndPublishedForUser"
    - path: "lib/db/repositories/acknowledgments.test.ts"
      provides: "Co-located unit tests for record() ON CONFLICT semantics"
      contains: "onConflictDoNothing"
    - path: "lib/db/repositories/policy_assignments.test.ts"
      provides: "Co-located unit tests for create() ON CONFLICT semantics"
    - path: "lib/db/repositories/qa_citation_grants.test.ts"
      provides: "Co-located unit tests for upsert + hasGrant + listForUser"
    - path: "lib/policies/acknowledgment.test.ts"
      provides: "Co-located unit tests for recordAcknowledgment orchestrator"
    - path: "app/(employee)/my-policies/[id]/actions.test.ts"
      provides: "Co-located vitest for acknowledgePolicyAction Server Action"
    - path: "app/(employee)/my-policies/ask/actions.test.ts"
      provides: "Co-located vitest for askQuestionAction Server Action"
  key_links:
    - from: "scripts/check-employee-portal.ts"
      to: "DATABASE_URL_TEST + DIRECT_URL_TEST live TEST DB"
      via: "tsx --env-file=.env.local + dynamic-import-after-env-override pattern"
      pattern: "loadScopedAndRepos|DATABASE_URL_TEST"
    - from: "scripts/check-employee-portal.ts R-6 block"
      to: "vi.mock('@/lib/ai/client')"
      via: "Anthropic mock injected via test-only import re-exec"
      pattern: "vi\\.mock"
---

<objective>
Wave 4 sibling parallel with Plan 05-08. Build the integration test layer per D-21..D-23a:

1. **NEW** `scripts/check-employee-portal.ts` per D-22 — raw postgres-js + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + intentional ROLLBACK + final TRUNCATE pattern. Covers R-1 (4-row dashboard query), R-3 (re-ack lifecycle), R-4 (bulk-assign idempotency + 3-member visibility), R-6 (Q&A + grant UPSERT) + cross-org isolation per SPEC AC-10.
2. **OPTIONAL** `scripts/check-employee-portal.vitest.config.ts` — if R-6 Anthropic mocking requires vitest framing (mirror Phase 4 `scripts/check-ai-layer.vitest.config.ts`); else inline mock setup inside the script.
3. **NEW** 6 co-located unit test files per D-21 — mock-based vitest tests covering each repository surface, orchestrator, and Server Action with the established Phase 3 mock pattern (`app/(admin)/policies/[id]/actions.test.ts` lines 17-98 vi.mock + beforeEach + FormData helper).
4. **AMEND** `package.json` with the `check:employee-portal` script entry.

Purpose: SPEC R-5 acceptance requires `pnpm check:acknowledgment-immutability` exits 0 AND the gate is proven non-vacuous (Plan 05-08 ships that). R-1..R-6 acceptance ALL require integration-level proof against the TEST DB — this plan ships that proof. D-23a mocks Anthropic for R-6 to keep CI fast and key-free.

Output: 8 new files (1 integration script + optional config + 6 co-located test files) + 1 package.json amend. `pnpm check:employee-portal` exits 0 against live TEST DB. `pnpm test` exit 0 covers the 6 co-located unit tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@.planning/phases/05-employee-portal/05-VALIDATION.md
@CLAUDE.md
@scripts/check-rls.ts
@scripts/check-policies-list-filters.ts
@scripts/check-ai-layer.test.ts
@scripts/check-ai-layer.vitest.config.ts
@app/(admin)/policies/[id]/actions.test.ts
@lib/db/scoped.ts
@lib/db/schema.ts
@lib/auth/context.ts
@lib/policies/acknowledgment.ts
@lib/policies/errors.ts
@lib/ai/qa.ts
@app/(employee)/my-policies/[id]/actions.ts
@app/(employee)/my-policies/ask/actions.ts
@tests/types.ts

<interfaces>
<!-- D-22 integration test pattern source — closest existing analog -->

scripts/check-policies-list-filters.ts (full integration pattern):
- lines 26-57: postgres-js DATABASE_URL_TEST + DIRECT_URL_TEST bootstrap with IIFE-guarded process.exit(1)
- lines 60-100: loadScopedAndRepos async helper for dynamic-import-after-env-override
- lines 72-78: TRUNCATE-then-seed pattern using sql.begin
- lines 200-308: per-assertion calls inside withOrgScope blocks

scripts/check-rls.ts (cross-org SET LOCAL ROLE pattern):
- lines 130-180: SET LOCAL ROLE authenticated + set_config request.jwt.claims + intentional __intentional_rollback__ pattern

scripts/check-ai-layer.test.ts (Anthropic mocking pattern for D-23a):
- lines 34-145: vi.mock('@/lib/ai/client') factory shape
- lines 419-511: scopedRef pattern for swapping mock between test cases

app/(admin)/policies/[id]/actions.test.ts (co-located Server Action test pattern):
- lines 17-75: hoisted vi.mock state + 4 mocks (transitions, next/cache, getOrgContext, withOrgScope)
- lines 85-98: beforeEach + FormData helper
- lines 106-120: UUID-validation cases pattern (4 cases per CR-PR3-#23)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create scripts/check-employee-portal.ts integration test per D-22 + optional vitest config for R-6 mocking + package.json script entry</name>
  <files>scripts/check-employee-portal.ts, scripts/check-employee-portal.vitest.config.ts, package.json</files>
  <read_first>
    - scripts/check-policies-list-filters.ts (whole file — D-22 explicit mirror; lines 26-308 verbatim pattern; TENANT_TABLES const at lines 60-70 for the TRUNCATE pattern)
    - scripts/check-rls.ts (lines 130-180 — SET LOCAL ROLE + set_config + intentional ROLLBACK pattern for cross-org-isolation block)
    - scripts/check-ai-layer.test.ts (lines 34-145 — vi.mock pattern for R-6 Anthropic mocking per D-23a)
    - scripts/check-ai-layer.vitest.config.ts (file as a whole — for the R-6 vitest framing if chosen)
    - lib/ai/qa.ts (Plan 05-04 — askQuestion signature)
    - lib/policies/acknowledgment.ts (Plan 05-04 — recordAcknowledgment signature)
    - lib/db/schema.ts (post-Plan 05-01 — qaCitationGrants + UNIQUEs)
    - lib/db/repositories/policies.ts (post-Plan 05-03 — listAssignedAndPublishedForUser signature)
    - lib/db/repositories/qa_citation_grants.ts (post-Plan 05-03 — QaCitationGrants signatures)
    - app/(admin)/policies/[id]/actions.ts (post-Plan 05-06 — bulkAssignToDepartmentAction signature)
    - .planning/phases/05-employee-portal/05-SPEC.md § Acceptance Criteria (all 13)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Test Strategy & verify:phase-5 (D-21..D-23a)
    - .planning/phases/05-employee-portal/05-VALIDATION.md § Per-Task Verification Map + Wave 0 Requirements (this plan populates the integration test row)
    - package.json scripts block (lines 9-46)
  </read_first>
  <action>
**Sub-task 1a: Create `scripts/check-employee-portal.ts`.**

This is a large script — target 250-400 lines. Mirror `scripts/check-policies-list-filters.ts` structure verbatim for the bootstrap; layer in cross-org seed pattern from `scripts/check-rls.ts` for the AC-10 block; layer in vitest framing for R-6 Anthropic mocking per D-23a.

DECISION POINT (planner discretion per CONTEXT): R-6 Anthropic mocking requires either (a) a separate `.test.ts` companion file run via vitest with `vi.mock('@/lib/ai/client')` OR (b) inline mock injection using Node's `module.require` interception. Recommended: option (a) — split R-6 into a co-located test file at `scripts/check-employee-portal.test.ts` and run via the new vitest config; the main `check-employee-portal.ts` script handles R-1/R-3/R-4/AC-10 (the DB-only assertions).

Actually, simpler: keep R-6 inline via `vi.mock` at module level using vitest as the test runner. Pattern from `scripts/check-ai-layer.test.ts`:
- Wire `scripts/check-employee-portal.test.ts` as the vitest entry; the corresponding vitest config `scripts/check-employee-portal.vitest.config.ts` points at it
- The script body uses `vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => ({ messages: { create: vi.fn().mockResolvedValue(MOCK_RESPONSE) } }) }))` at top of file
- R-1, R-3, R-4, AC-10 blocks run in `describe(...)` blocks; R-6 block runs in its own `describe('R-6 ...')` block with Anthropic mocked

For simplicity and operator alignment with Phase 4 D-23a pattern, ship `scripts/check-employee-portal.test.ts` (NOT `scripts/check-employee-portal.ts` — the script form is for non-vitest needs) + `scripts/check-employee-portal.vitest.config.ts`. The package.json entry becomes `"check:employee-portal": "tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-employee-portal.test.ts --config scripts/check-employee-portal.vitest.config.ts"` — matching Phase 4 `check:ai-layer` script shape.

CLARIFICATION: The PATTERNS.md and CONTEXT.md sometimes refer to `scripts/check-employee-portal.ts`; the actual deliverable filename can be either `.ts` (plain tsx runner) or `.test.ts` (vitest runner). Given D-23a Anthropic mocking + D-22 raw-postgres TEST DB pattern, the test-file form is correct. Ship `scripts/check-employee-portal.test.ts` and document the naming in SUMMARY.

File-header comment (in `scripts/check-employee-portal.test.ts`):
- "scripts/check-employee-portal.test.ts — Plan 05-09 Task 1 (D-22 + D-23a)."
- "R-1 + R-3 + R-4 + R-6 + AC-10 (cross-org isolation) integration test against live TEST DB."
- "Pattern source: scripts/check-policies-list-filters.ts (postgres-js + BYPASSRLS seed + withOrgScope reads) + scripts/check-rls.ts (SET LOCAL ROLE + ROLLBACK cross-org block) + scripts/check-ai-layer.test.ts (vi.mock Anthropic for R-6 per D-23a)."

Imports:
- `postgres` from `postgres`
- `randomUUID` from `node:crypto`
- `vi, beforeAll, afterAll, beforeEach, describe, it, expect` from `vitest`
- All needed schema + repository + orchestrator types via dynamic import (after env override per loadScopedAndRepos pattern)

Mocks (D-23a):
```typescript
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: 'The expense policy says $1000 limit. \\n```citations\\n[{"title":"Expense Policy","id":"__will_be_replaced__"}]\\n```',
        }],
        usage: {
          input_tokens: 1500,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 1500,
        },
      }),
    },
  }),
}));
```
(The fixture data above must mirror Phase 4 D-43 citation-shape from `lib/ai/qa-parser.ts`. Adjust the citation id to a real seeded policy id at test-time via mock.mockResolvedValue dynamic substitution.)

Bootstrap (lines 26-100 of check-policies-list-filters.ts pattern):
- IIFE-guarded `DATABASE_URL_TEST` + `DIRECT_URL_TEST` read with process.exit(1) on missing
- `loadScopedAndRepos()` helper dynamically importing `@/lib/db/scoped`, `@/lib/db/repositories/{policies, acknowledgments, policy_assignments, qa_citation_grants, policy_versions}`, `@/lib/policies/acknowledgment`, `@/lib/ai/qa` AFTER env-var override
- `truncate(sql)` helper TRUNCATEing all 12 TENANT_TABLES + clerk_events + stripe_events (mirror `check-policies-list-filters.ts:72-78`; ensure `'qa_citation_grants'` is in the list per Plan 05-08 RLS-table extension)

Test structure:

**describe('R-1 Dashboard query - listAssignedAndPublishedForUser', ...) — SPEC AC-1 + AC-2:**
- beforeAll: seed via BYPASSRLS — org A, user U1 in dept D1, 4 policies (P1 published+assigned-to-U1; P2 published+assigned-to-D1; P3 draft+assigned-to-U1; P4 published+unassigned). Add policy_versions row for each. Add a dept-less user U2 in same org for D-02 semantics check.
- it('returns exactly P1 + P2 for U1 (assigned-user OR assigned-dept), excludes draft P3 and unassigned P4'): assert query result length === 2 + ids match {P1, P2}
- it('returns 0 rows for U2 (dept-less user with no individual assignments)'): D-02 semantic check
- it('returns DISTINCT row when user is targeted both individually + via dept'): seed an additional assignment of P5 to both U1 AND D1 → assert query returns P5 EXACTLY ONCE (D-01 SELECT DISTINCT)
- it('returns ackState=\\'none\\' for assigned-never-acked, ackState=\\'current\\' for assigned-and-acked, ackState=\\'stale\\' after editPublished+publish'): R-3 lifecycle covered separately below; this asserts the basic enum shape

**describe('R-3 Re-acknowledgment indicator lifecycle', ...) — SPEC AC-5 + AC-6:**
- it('after publish v1 → ack v1 → editPublished+publish v2: ackState=\\'stale\\', ackedAt=null, COUNT(*) FROM acknowledgments unchanged at 1 (v1 row preserved)'): seed P at v1, call recordAcknowledgment, then directly via raw SQL bump policies.currentVersion + insert policy_versions v2 (mimicking editPublished+publish without touching the orchestrators), then re-query listAssignedAndPublishedForUser → assert row.ackState === 'stale' + raw COUNT(*) FROM acknowledgments WHERE policyId=P unchanged at 1
- it('after re-ack at v2: ackState=\\'current\\', COUNT=2, ipAddress captured'): call recordAcknowledgment again → assert ackState === 'current' + raw COUNT(*)=2

**describe('R-4 Bulk department assignment', ...) — SPEC AC-7 + AC-8:**
- Seed: dept D2 with 3 users U3, U4, U5; policy P at status='published'
- it('bulkAssignToDepartmentAction(P, D2) creates EXACTLY 1 row in policy_assignments'): call orchestrator (via direct PolicyAssignments.create — Server Action testing is in the co-located actions.test.ts file) → assert raw COUNT(*) FROM policy_assignments WHERE policyId=P AND assigneeType='department' AND assigneeId=D2 === 1
- it('all 3 dept members see P in /my-policies query'): call listAssignedAndPublishedForUser for U3, U4, U5 → assert each returns P
- it('duplicate bulkAssign creates 0 additional rows (ON CONFLICT DO NOTHING)'): call again → assert raw COUNT === 1 still (D-15 idempotency)

**describe('R-6 Q&A surface + grant UPSERT', ...) — SPEC AC-11:**
- Mock Anthropic via top-level vi.mock (D-23a)
- Seed: org A, user U6 (NOT assigned to anything), 2 policies P1 (published) + P2 (published) — U6 has zero assignments
- Mock askQuestion to return citations to BOTH P1 and P2 (override mockResolvedValue with dynamic policy ids)
- it('askQuestion returns answer + citations[]; each citation gets accessibility=\\'tldr-only\\' because U6 has no assignments'): call askQuestion(ctxU6, 'what is the limit?') → assert result.citations.length === 2 + all carry `accessibility: 'tldr-only'`
- it('grant UPSERT inserts 1 row per cited policy in qa_citation_grants'): raw COUNT(*) FROM qa_citation_grants WHERE userId=U6 AND policyId IN (P1, P2) === 2
- it('grant UPSERT is idempotent on repeated calls'): call askQuestion again with same citations → raw COUNT still === 2 (UNIQUE on (org_id, user_id, policy_id) fires)
- it('grant UPSERT iterates over parseQaResponse-validated citations, NOT raw fence — hallucinated foreign-org UUID is stripped'): mock Anthropic to return a citation with id = a foreign-org policy's UUID → call askQuestion → assert qa_citation_grants has NO row for that UUID (validIds filter at lib/ai/qa-parser.ts:54 stripped it before reaching grant write; RESEARCH gap-3)

**describe('SPEC AC-10 Cross-org isolation', ...) — uses SET LOCAL ROLE + intentional ROLLBACK:**
- Seed in BYPASSRLS: orgA + orgB; userA-in-orgA with departmentId D_A; userB-in-orgB with departmentId D_B; CRUCIAL — make D_A.id and D_B.id collide by SEED CHOICE (insert with same UUID — bypassing RLS allows this; in production the composite FK would prevent any user from referencing another org's dept, but the test setup directly bypasses for the threat scenario). Policy P_A in orgA, policy P_B in orgB.
- Within `sql.begin(async (tx) => { ... throw __intentional_rollback__ })`:
  - `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub":"<userA>","org_id":"<orgA>","role":"employee"}', true)`
  - POSITIVE CONTROL: userA's listAssignedAndPublishedForUser returns P_A (proves RLS channel is live)
  - NEGATIVE: userA's listAssignedAndPublishedForUser does NOT return P_B (cross-org leak blocked by RLS + composite FK + listAssigned's own `eq(policies.orgId, s.orgId)` predicate)
- Throw `__intentional_rollback__` + catch in `.catch(...)` per check-rls.ts pattern; final TRUNCATE in afterAll for idempotency

**afterAll**: TRUNCATE all 12 tenant tables + 2 service-role tables for idempotency.

NO live Anthropic call. NO new env vars beyond DATABASE_URL_TEST + DIRECT_URL_TEST. NO modification to existing scripts/check-rls.ts (Plan 05-08 already extends it for qa_citation_grants).

**Sub-task 1b: Create `scripts/check-employee-portal.vitest.config.ts`.**

Mirror `scripts/check-ai-layer.vitest.config.ts` verbatim — same `defineConfig` shape, swap the `include` path to point at `scripts/check-employee-portal.test.ts`. If `scripts/check-ai-layer.vitest.config.ts` doesn't exist or has been collapsed, use Phase 3's `vitest.config.ts` as a reference and write a minimal config:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['scripts/check-employee-portal.test.ts'],
    testTimeout: 30000,  // generous for postgres-js round trips
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '..') },
  },
});
```

**Sub-task 1c: Add `"check:employee-portal"` to package.json.**

After the `"check:ai-layer"` entry (around line 41), ADD:
```json
"check:employee-portal": "tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-employee-portal.test.ts --config scripts/check-employee-portal.vitest.config.ts",
```

PRESERVE all existing script entries.

DO NOT yet wire `verify:phase-5` chain target (Plan 05-10 does this).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm check:employee-portal</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `pnpm check:employee-portal` exits 0 against live TEST DB (DATABASE_URL_TEST set per Plan 02-02 D-05; SF-DB-1 CLOSED 2026-05-18 per STATE.md)
    - File `scripts/check-employee-portal.test.ts` (or `.ts` if planner chose the script form) exists
    - `grep -c "describe.*R-1" scripts/check-employee-portal.test.ts` returns at least 1 (R-1 block)
    - `grep -cE "describe.*R-(3|4|6)" scripts/check-employee-portal.test.ts` returns at least 3 (R-3 + R-4 + R-6 blocks)
    - `grep -c "Cross-org isolation\\|AC-10" scripts/check-employee-portal.test.ts` returns at least 1
    - `grep -c "vi.mock('@/lib/ai/client'" scripts/check-employee-portal.test.ts` returns 1 (D-23a Anthropic mock)
    - `grep -c "DATABASE_URL_TEST" scripts/check-employee-portal.test.ts` returns at least 1
    - `grep -c "SET LOCAL ROLE authenticated" scripts/check-employee-portal.test.ts` returns at least 1 (AC-10 block)
    - `grep -c "__intentional_rollback__" scripts/check-employee-portal.test.ts` returns at least 1 (AC-10 block scope-LOCAL session-config pattern)
    - `grep -c "qa_citation_grants" scripts/check-employee-portal.test.ts` returns at least 1 (R-6 grant UPSERT assertions)
    - `grep -c "check:employee-portal" package.json` returns 1
    - File `scripts/check-employee-portal.vitest.config.ts` exists (or operator chose inline-config — flag in SUMMARY)
    - The integration test asserts the RESEARCH gap-3 invariant (R-6 mocked with foreign-org citation id → grant UPSERT does NOT create row for foreign id)
  </acceptance_criteria>
  <done>
    Integration test ships with R-1+R-3+R-4+R-6+AC-10 coverage; exits 0 against live TEST DB; Anthropic mocked per D-23a; package.json wired for the new script entry.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create 6 co-located vitest unit test files per D-21</name>
  <files>lib/db/repositories/policies.test.ts, lib/db/repositories/acknowledgments.test.ts, lib/db/repositories/policy_assignments.test.ts, lib/db/repositories/qa_citation_grants.test.ts, lib/policies/acknowledgment.test.ts, app/(employee)/my-policies/[id]/actions.test.ts, app/(employee)/my-policies/ask/actions.test.ts</files>
  <read_first>
    - app/(admin)/policies/[id]/actions.test.ts (whole file — closest co-located unit test pattern; vi.mock hoisting + beforeEach + FormData helper; UUID-validation cases per CR-PR3-#23 at lines 106-120)
    - lib/policies/transitions.test.ts (whole file — orchestrator-test pattern for lib/policies/acknowledgment.test.ts)
    - app/(employee)/my-policies/[id]/actions.ts (Plan 05-05 — Server Action signature for action.test.ts)
    - app/(employee)/my-policies/ask/actions.ts (Plan 05-05 — askQuestionAction signature)
    - lib/policies/acknowledgment.ts (Plan 05-04 — recordAcknowledgment signature)
    - lib/db/repositories/{acknowledgments,policy_assignments,policies,qa_citation_grants}.ts (Plans 05-03 — surfaces to unit test)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Test Strategy (D-21..D-23a)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § all `.test.ts` rows
    - .planning/phases/05-employee-portal/05-VALIDATION.md § Wave 0 Requirements
  </read_first>
  <action>
Create 6 (or 7 if extending existing policies.test.ts) co-located vitest test files. Pattern source: `app/(admin)/policies/[id]/actions.test.ts` lines 17-98 (mock + beforeEach + FormData helper); for orchestrator tests, mirror `lib/policies/transitions.test.ts`.

ALL 6 test files follow the same conventions:
1. Top-level `vi.mock(...)` hoisting state (NOT inside describe/it)
2. `beforeEach(() => { mock.mockReset() })` to isolate cases
3. Mock `@/lib/auth/context` getOrgContext to return a fixed OrgContext literal
4. Mock `@/lib/db/scoped` withOrgScope to pass through to a mocked OrgScope object (`{ orgId, userId, role, clerkOrgId, clerkUserId, tx: <mocked-tx> }`)
5. Test only the surface owned by this file (mock its dependencies)

**File 1: `lib/db/repositories/policies.test.ts` (extend if exists; create if not).**

If existing file (Phase 3 may have created it for `listWithFilters`), ADD new describe block for `listAssignedAndPublishedForUser`. Else create with full vi.mock + describe shape.

Tests:
- `listAssignedAndPublishedForUser returns expected shape (mock-level — full integration coverage in scripts/check-employee-portal.test.ts)`:
  - Mock `s.tx.selectDistinct` to return predefined array
  - Assert function signature matches `(s: OrgScope, userId: string) => Promise<{...row}[]>`
  - Assert call composition includes `selectDistinct` + `innerJoin` (2x) + `leftJoin` (2x) + `where eq(orgId)` + `eq(status, 'published')`
- (Optional) `listPublishedForOrg` regression check (smoke that Phase 4 method still works)

NOTE: Mock-level repository tests are limited — the real query correctness is in scripts/check-employee-portal.test.ts (Task 1) against live TEST DB. Co-located vitest is primarily a contract-shape test.

**File 2: `lib/db/repositories/acknowledgments.test.ts` (NEW).**

Tests for `Acknowledgments.record`:
- `record returns row array on fresh insert (mocked RETURNING returns [{...row}])`
- `record returns empty array on conflict (mocked RETURNING returns []) — D-10 silent success`
- `record on conflict logs '[ack] no-op (already acked)' via console.log (spyOn console.log + assert called)` — D-10 ops log
- `record does NOT throw on empty RETURNING` — D-10 verbatim
- `record passes input.policyId without modification` (brand-preservation smoke)

Verify Acknowledgments STILL does NOT export update/delete keys:
- `expect((Acknowledgments as any).update).toBeUndefined()` — ADR-018 type-system layer cross-check at runtime
- `expect((Acknowledgments as any).delete).toBeUndefined()`

**File 3: `lib/db/repositories/policy_assignments.test.ts` (NEW).**

Tests for `PolicyAssignments.create`:
- `create returns row array on fresh insert`
- `create returns empty array on conflict (D-15 idempotency)`
- `create copies s.orgId into the inserted row` (ADR-019 + D-02 denormalization smoke)
- `create passes input.policyId without modification` (brand-preservation smoke)

Also smoke-test `listForPolicy` and `listAll` shape (Phase 2/3 didn't co-locate them).

**File 4: `lib/db/repositories/qa_citation_grants.test.ts` (NEW).**

Tests for `QaCitationGrants`:
- `upsert returns inserted row on fresh insert`
- `upsert returns empty array on conflict (D-26 idempotency)`
- `hasGrant returns true when COUNT > 0` (mock SELECT COUNT(*) → [{c: 1}])
- `hasGrant returns false when COUNT === 0` (mock SELECT COUNT(*) → [{c: 0}])
- `listForUser returns array (signature smoke)`

**File 5: `lib/policies/acknowledgment.test.ts` (NEW).**

Mirror `lib/policies/transitions.test.ts` shape. Mock all 5 dependencies (Policies, PolicyVersions, PolicyAssignments, Acknowledgments, getOrgContext+withOrgScope). Tests:
- Happy path: `recordAcknowledgment` calls findById → assignment check → findByVersionNumber → record → returns { ackedAt }
- `throws PolicyArchivedError when policy.status !== 'published'` (D-07)
- `throws PolicyNotAssignedError when assignment check finds no match` (D-08)
- `throws PolicyNotFoundError when findById returns []`
- `tx rolls back atomically — when record throws, no prior side effects committed` (mock withOrgScope to track tx state)
- `passes ipAddress argument through to Acknowledgments.record` (D-05 IP capture smoke)
- `D-10 silent success: when record returns [], orchestrator returns { ackedAt: <new Date()> }` (looks up existing row's ackedAt)

**File 6: `app/(employee)/my-policies/[id]/actions.test.ts` (NEW).**

Mirror admin/policies/[id]/actions.test.ts shape verbatim — mock `@/lib/policies/acknowledgment`, `@/lib/auth/context`, `next/cache`, `next/headers`. Tests:
- UUID-validation cases (4 same as Phase 3 CR-PR3-#23 pattern at admin actions test):
  - Missing policyId field → INVALID_PAYLOAD; recordAcknowledgment NOT called; revalidatePath NOT called
  - Non-UUID string ("p1") → INVALID_PAYLOAD
  - Empty-after-trim ("   ") → INVALID_PAYLOAD
  - Malformed UUID (invalid char) → INVALID_PAYLOAD
- Happy path: valid policyId + x-forwarded-for → orchestrator called with `(ctx, policyId, '1.2.3.4')` → revalidatePath called twice (`/my-policies` + `/my-policies/[id]`) → returns `{ ok: true, ackedAt }`
- No x-forwarded-for: orchestrator called with `ipAddress = null` (D-05 NULL fallback)
- x-forwarded-for multi-hop: orchestrator receives first hop only ('1.1.1.1, 2.2.2.2, 3.3.3.3' → '1.1.1.1' per D-05 first-hop)
- PolicyArchivedError thrown: returns `{ ok: false, error: 'This policy was archived. Refresh to update your list.', code: 'POLICY_ARCHIVED' }`; revalidatePath NOT called
- PolicyNotAssignedError thrown: returns `{ ok: false, error: 'You are no longer assigned this policy.', code: 'POLICY_NOT_ASSIGNED' }`
- PolicyNotFoundError thrown: returns 'Policy not found.', code 'POLICY_NOT_FOUND'

**File 7: `app/(employee)/my-policies/ask/actions.test.ts` (NEW).**

Mock `@/lib/ai/qa::askQuestion` to return `{ answer: 'mocked', citations: [{title: 'P1', id: '...', accessibility: 'full'}] }`. Tests:
- Happy path: valid question → askQuestion called with `(ctx, question)` → returns `{ ok: true, answer, citations }`
- Invalid input: missing question / empty string / oversized (>2000 chars) → `{ ok: false, error: 'Invalid action payload.' }`
- Anthropic.APIError thrown: returns `{ ok: false, error: 'AI service temporarily unavailable. Please try again.' }`
- Non-Anthropic Error thrown: rethrow (test catches and asserts the throw propagates)
- Citations preserved in returned state (deep equality check)

All 6 (or 7) test files MUST be discoverable by `pnpm test` (the existing vitest run command picks up `**/*.test.ts` per Phase 3 vitest.config.ts).

DO NOT modify the existing `vitest.config.ts` to exclude these files. DO NOT add `*.test.ts` files outside the listed paths (no extra coverage in Phase 5 — scope is locked).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm test --run lib/db/repositories lib/policies "app/(employee)"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - All 6 (or 7) test files exist
    - `pnpm test --run lib/db/repositories lib/policies "app/(employee)"` exits 0
    - `grep -c "vi.mock" lib/db/repositories/acknowledgments.test.ts` returns at least 1
    - `grep -c "Acknowledgments.update" lib/db/repositories/acknowledgments.test.ts` returns at least 1 (the runtime smoke that the field is undefined — verifies ADR-018 type-system layer holds at runtime too)
    - `grep -c "PolicyArchivedError" lib/policies/acknowledgment.test.ts` returns at least 1
    - `grep -c "PolicyNotAssignedError" lib/policies/acknowledgment.test.ts` returns at least 1
    - `grep -c "POLICY_ARCHIVED" app/\\(employee\\)/my-policies/\\[id\\]/actions.test.ts` returns at least 1 (the typed-code discriminant tested)
    - `grep -c "x-forwarded-for" app/\\(employee\\)/my-policies/\\[id\\]/actions.test.ts` returns at least 1 (D-05 IP capture tested)
    - `grep -c "Anthropic.APIError" app/\\(employee\\)/my-policies/ask/actions.test.ts` returns at least 1 (503-mapping tested)
    - `grep -c "accessibility:" app/\\(employee\\)/my-policies/ask/actions.test.ts` returns at least 1 (D-27a citation shape preserved in formState)
    - `pnpm verify:phase-4` still exits 0 (no regression; the existing vitest config picks up new tests + they don't break)
  </acceptance_criteria>
  <done>
    6 (or 7) co-located test files exist; all pass via `pnpm test`; ADR-018 type-system invariant cross-checked at runtime; typed-error catch branches verified.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| TEST DB → integration test | postgres-js connection uses DATABASE_URL_TEST connection-string (privileged BYPASSRLS user for seed; `SET LOCAL ROLE authenticated` flips to RLS-enforcing for cross-org-isolation block) |
| Anthropic mock → R-6 block | vi.mock isolates from real Anthropic API; mock fixture data mirrors Phase 4 D-43 citation-shape contract |
| Mock fixtures → assertion correctness | Mocked function returns drive test outcomes; if a future Phase changes a repository signature without updating the test mocks, tests may pass with stale mocks — type-test (tsc) catches signature drift via the actual import |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-09-01 | Information Disclosure | Test fixture data persists in TEST DB if cleanup fails | mitigate | afterAll TRUNCATE pattern (mirrors check-policies-list-filters.ts); intentional ROLLBACK in cross-org block scopes SET LOCAL session-config changes to one tx. Operator can re-run any time; idempotent. |
| T-05-09-02 | Tampering | Test asserts mock return value, not actual repository behavior — repository regression slips past tests | accept | Co-located vitest tests are CONTRACT shape tests, not full-flow tests. The integration test in `scripts/check-employee-portal.test.ts` (Task 1) covers the end-to-end behavior against live TEST DB; the contract tests are fast feedback for shape changes only. Acceptable. |
| T-05-09-03 | Information Disclosure | Cross-org-isolation test reveals attack pattern in TEST DB seed | accept | Test fixtures are gitignored ROLLBACK-scoped; no production data. Attack documentation = security knowledge gain, not vulnerability. Acceptable. |
| T-05-09-04 | Tampering | R-6 mocked Anthropic returns malformed citations breaking parseQaResponse | mitigate | Test fixture data validated against Phase 4 D-43 citation-shape (`{title, id}` JSON in citations fence). If a future Phase changes the parseQaResponse contract, both the script's mock AND the real Anthropic prompt contract would need updating in lockstep. |
| T-05-09-05 | Tampering | Cross-org grant test seeds use BYPASSRLS to insert UUID-colliding rows; might mask a real defense gap | mitigate | The seed pattern is intentional — we WANT to test "what if a hallucinated UUID happens to collide?" by manufacturing the collision. The test asserts: (a) cit gets filtered out at parseQaResponse.validIds — grant row NOT inserted for foreign-org id (RESEARCH gap-3); (b) page handler at /my-policies/[id] re-evaluates RLS — even if grant existed, the policy SELECT under RLS returns 0 rows for foreign org (T-05-05-01 mitigation). |
| T-05-09-06 | Information Disclosure | Test logs include sample policy IDs / user IDs / org IDs in stdout | accept | Test logs are operator-only; UUIDs are not secrets. Phase 4 audit-log pattern (PII-safe logging) doesn't apply to test fixtures — only to production. |
| T-05-09-SC | Tampering | npm installs | accept | No new packages — postgres + vitest + @vitejs/plugin-react all installed Phase 1-4. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `pnpm check:employee-portal` exits 0 against live TEST DB (R-1 + R-3 + R-4 + R-6 + AC-10 all green)
- `pnpm test --run lib/db/repositories lib/policies "app/(employee)"` exits 0 (co-located vitests green)
- `pnpm verify:phase-4` still exits 0 (no regression)
- Plan 05-10 wires `verify:phase-5` chain target — this plan does NOT yet update verify:phase-5
</verification>

<success_criteria>
- `scripts/check-employee-portal.test.ts` (or .ts) exists and covers R-1 + R-3 + R-4 + R-6 + AC-10
- 6 (or 7) co-located vitest test files exist and pass via `pnpm test`
- R-6 mocks Anthropic per D-23a (no live API calls)
- RESEARCH gap-3 cross-org grant-via-collision tested explicitly
- `pnpm check:employee-portal` script entry wired in package.json
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-09-SUMMARY.md` when done — document the choice between `.test.ts` (vitest framing) vs `.ts` (plain tsx) for `scripts/check-employee-portal*`, list each describe-block coverage area, confirm pnpm test picks up co-located files, and flag any Plan 05-10 prerequisites (e.g., verify:phase-5 chain wiring still pending).
</output>
