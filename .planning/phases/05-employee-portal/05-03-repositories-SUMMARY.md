---
phase: 05-employee-portal
plan: 03
subsystem: database
tags: [drizzle, postgres, rls, repository, on-conflict, multi-tenant, qa-grants]

# Dependency graph
requires:
  - phase: 05-employee-portal
    provides: "Plan 05-01 — UNIQUE constraints on acknowledgments (D-06) + policy_assignments (D-15); new qa_citation_grants table (D-29) with composite indexes + post-0008 wrapped RLS"
  - phase: 05-employee-portal
    provides: "Plan 05-02 — PolicyDomainError hierarchy (consumed by orchestrators downstream, not by this plan)"
provides:
  - "Acknowledgments.record (functional body) — INSERT + ON CONFLICT DO NOTHING + D-10 silent-success + ops log"
  - "PolicyAssignments.create (functional body) — INSERT + ON CONFLICT DO NOTHING for bulk dept-assign idempotency"
  - "Policies.listAssignedAndPublishedForUser — single LEFT JOIN dashboard query with 3-state ackState enum + ackedAt"
  - "QaCitationGrants object — listForUser / upsert / hasGrant for R-6 citation-referral grants (D-29)"
affects: ["05-04 acknowledgment.ts orchestrator", "05-04 lib/ai/qa.ts askQuestion", "05-05 /my-policies page handlers", "05-06 admin bulk-assign Server Action"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern A — INSERT + ON CONFLICT DO NOTHING + RETURNING for DB-enforced idempotency on UNIQUE constraints; empty RETURNING is treated as silent-success at the orchestrator layer (D-10)"
    - "Pattern B — Two-alias self-join (current_ack + prior_ack) with CASE projection for 3-state UI enums in a single SQL query (D-04)"
    - "Pattern C — Inline sub-select for cross-table lookups (user's departmentId) without extending OrgContext, leveraging composite FK + RLS for cross-org safety (D-03)"

key-files:
  created:
    - "lib/db/repositories/qa_citation_grants.ts"
  modified:
    - "lib/db/repositories/acknowledgments.ts"
    - "lib/db/repositories/policy_assignments.ts"
    - "lib/db/repositories/policies.ts"

key-decisions:
  - "D-06 + D-10 acknowledged: Acknowledgments.record returns inserted array; empty length = silent success (no throw)"
  - "D-15 acknowledged: PolicyAssignments.create returns inserted array; empty length = 'already assigned' silent success"
  - "D-01..D-04 acknowledged: listAssignedAndPublishedForUser uses SELECT DISTINCT + 2x acknowledgments aliases + CASE → 3-state enum"
  - "D-29 acknowledged: QaCitationGrants exposes listForUser/upsert/hasGrant only — no update/delete per write-once D-26 invariant"
  - "ADR-028 acknowledged: QaCitationGrantUpsertInput keeps policyId as `string` per schema-inferred-insert-out-of-brand-scope slippery-slope policy; branded PolicyId on explicit hasGrant signature"

patterns-established:
  - "Pattern: ON CONFLICT DO NOTHING idempotency — applied 3x across acknowledgments + policy_assignments + qa_citation_grants; consistent silent-success semantics at the orchestrator layer"
  - "Pattern: SELECT DISTINCT + dual-LEFT-JOIN aliases for collapsing one-to-many ack-history into single 3-state UI enum (extensible to Phase 8 dashboard reports)"
  - "Pattern: hasGrant() COUNT(*) probe over composite btree — fast access-decision predicate for page-handler routing (D-27)"

requirements-completed:
  - "REQ-acknowledgment-tracking"
  - "REQ-acknowledgment-rules"

# Metrics
duration: 25min
completed: 2026-05-23
---

# Phase 5 Plan 03: Repository Surfaces Summary

**Filled 3 throw-stub repository methods (Acknowledgments.record + PolicyAssignments.create + Policies.listAssignedAndPublishedForUser) and shipped new QaCitationGrants repository per D-29, all four backing the Wave 2 acknowledgment + Q&A orchestrators that follow.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-23T21:18Z
- **Completed:** 2026-05-23T21:43Z
- **Tasks:** 2 (sequential)
- **Files modified:** 3
- **Files created:** 1

## Accomplishments

- `Acknowledgments.record` body shipped with INSERT + ON CONFLICT DO NOTHING per the migration-0010 UNIQUE(user_id, policy_id, policy_version_id). D-10 silent-success: empty RETURNING is treated as silent success at the orchestrator layer; ops-side console.log signal preserves observability for unusual duplicate-ack rates.
- `PolicyAssignments.create` body shipped with INSERT + ON CONFLICT DO NOTHING per the migration-0010 UNIQUE(policy_id, assignee_type, assignee_id). Returns inserted array; bulk-assign caller (Plan 05-06) treats length 0 as "already assigned" silent success.
- `Policies.listAssignedAndPublishedForUser` added — single SQL dashboard query with inline user-dept sub-select (D-03) + INNER JOIN policy_assignments (user OR dept assigneeType) + INNER JOIN policy_versions on currentVersion + 2x LEFT JOIN acknowledgments aliases (current_ack + prior_ack) + CASE projecting the 3-state `ackState` enum per D-04. SELECT DISTINCT dedupes when an admin targets the same user both individually AND via their department (D-15 schema permits both rows, D-01 collapses at query time).
- `lib/db/repositories/qa_citation_grants.ts` created per D-29 — exports `QaCitationGrants` object with `listForUser` / `upsert` / `hasGrant`. UPSERT idempotent via ON CONFLICT DO NOTHING on UNIQUE(org_id, user_id, policy_id); `hasGrant` COUNT(*) probe leverages the composite btree `qa_citation_grants_user_policy_idx` from migration 0011 for fast page-handler access decisions (D-27).
- ADR-018 append-only invariant preserved at type level: `tests/types.ts` D-07 `@ts-expect-error` lines still flag (no `update` / `delete` keys added to Acknowledgments or QaCitationGrants).
- ADR-019 invariant preserved: every method's WHERE includes `eq(orgId)`; every INSERT copies `s.orgId` into the row (NEVER from input).
- ADR-023 invariant preserved: every method takes `OrgScope` first.
- ADR-028 brand invariant preserved: `PolicyId` brand still threaded through `PolicyAssignmentCreateInput.policyId` via `$inferInsert` and via the explicit `hasGrant(s, userId, policyId: PolicyId)` signature.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fill 3 throw-stubs + add listAssignedAndPublishedForUser** — `e23a4a4` (feat)
   - `lib/db/repositories/acknowledgments.ts` (+42 lines net)
   - `lib/db/repositories/policy_assignments.ts` (+26 lines net)
   - `lib/db/repositories/policies.ts` (+125 lines net — new method + imports)
2. **Task 2: Create QaCitationGrants repository** — `b8de7f1` (feat)
   - `lib/db/repositories/qa_citation_grants.ts` (132 lines, new file)

**Plan metadata commit:** TBD after STATE.md + ROADMAP.md update (this commit).

## Files Created/Modified

### Modified

- `lib/db/repositories/acknowledgments.ts` — `record` body filled with `s.tx.insert(acknowledgments).values({ ...input, orgId: s.orgId }).onConflictDoNothing().returning()` + D-10 silent-success branch with `console.log('[ack] no-op (already acked)', { userId, policyId })`. JSDoc header, type def (`AcknowledgmentRecordInput` Omit), `listForUser` method, and "NO update method / NO delete method" comments all preserved verbatim per `<read_first>` directive. Approximate diff: lines 43-46 throw replaced with ~40-line functional body (JSDoc + insert + silent-success branch).
- `lib/db/repositories/policy_assignments.ts` — `create` body filled with `s.tx.insert(policyAssignments).values({ ...input, orgId: s.orgId }).onConflictDoNothing().returning()` plus return. `PolicyAssignmentCreateInput` Omit type preserved at lines 11-14. Approximate diff: lines 34-36 throw replaced with ~25-line functional body (JSDoc + insert).
- `lib/db/repositories/policies.ts` — Added 5 imports (`acknowledgments`, `policyAssignments`, `policyVersions`, `users` from `@/lib/db/schema`; `alias` from `drizzle-orm/pg-core`) and new method `listAssignedAndPublishedForUser` between `listPublishedForOrg` and `findById`. New method runs ~120 lines (substantive JSDoc + sub-select + 2 alias()s + selectDistinct() + 4-join chain + WHERE). All existing methods (`listAll`, `listPublishedForOrg`, `findById`, `create`, `listWithFilters`, `updateDraft`, `updateSummary`, `incrementVersion`, `statusCounts`) preserved unchanged.

### Created

- `lib/db/repositories/qa_citation_grants.ts` — 132-line per-aggregate repository per D-29. Three methods: `listForUser(s, userId)` (full SELECT scoped by orgId+userId for Phase 7+ cleanup cron and ops introspection), `upsert(s, input)` (INSERT + ON CONFLICT DO NOTHING on UNIQUE(org_id, user_id, policy_id) per D-29 — empty RETURNING is silent no-op for grant-already-exists), `hasGrant(s, userId, policyId: PolicyId)` (COUNT(*) probe with Number() coercion + > 0 boolean comparison; PolicyId branded per ADR-028, future Plan 05-08 will widen `check-policy-id-brand.ts` REPO_TARGETS). File header documents D-29 / D-26 / D-27 / ADR-018-spirit (write-once) / RESEARCH Pitfalls 3 and 6.

## SQL Composition Strategy — `Policies.listAssignedAndPublishedForUser`

The dashboard query is a single Postgres statement built from 4 joined tables. JOIN order chosen (per Claude's discretion in CONTEXT.md):

1. `FROM policies` (the entity being listed)
2. `INNER JOIN policyAssignments` (filters policies to only those the user is assigned to — the leftmost INNER JOIN narrows the row count earliest before downstream LEFT JOINs run)
3. `INNER JOIN policyVersions` (on `versionNumber = policies.currentVersion`; this gives us the `policyVersions.id` needed for `current_ack` join predicate)
4. `LEFT JOIN current_ack (alias of acknowledgments)` (matches the user's ack on the CURRENT version — non-null `current_ack.id` → `ackState='current'`)
5. `LEFT JOIN prior_ack (alias of acknowledgments)` (matches any user ack on a DIFFERENT version — non-null `prior_ack.id` → `ackState='stale'` if `current_ack.id IS NULL`)

The two LEFT JOINs use distinct aliases so Postgres treats them as independent scans even though both target `acknowledgments`. The migration-0010 UNIQUE on `(user_id, policy_id, policy_version_id)` auto-creates the btree both joins use (`prior_ack` uses `(user_id, policy_id)` which is a PREFIX of the unique index per RESEARCH Pitfall 7 — no new index needed).

**Why INNER joins first, LEFT joins second:** narrower row counts earliest is the planner-friendly path. INNER on assignments + versions caps each policies row at 1 (after SELECT DISTINCT collapses user+dept double-assignment). LEFT joins then add per-row decoration without expanding the result set.

**Why inline sub-select for dept-id (D-03):** the alternative is extending `OrgContext` with `departmentId`, adding a fetch in `getOrgContext` for every request. The inline sub-select trades 1 extra index lookup per dashboard query (executed inside the OR predicate's `IN`) for zero cost on every other request path. The composite FK on `users(org_id, department_id) → departments(org_id, id)` plus the explicit `users.orgId = s.orgId` predicate inside the sub-select close the cross-org leak vector at the Postgres level — the dept-id sub-select returns NULL for any cross-org userId, and `IN NULL` excludes the row (RESEARCH Pitfall 6).

**SELECT DISTINCT placement:** outermost, applied to the policies-projection columns. The migration-0010 UNIQUE on `policy_assignments(policy_id, assignee_type, assignee_id)` permits both `(user, X)` and `(department, X)` rows for the same policy targeting the same user (different `assignee_type`); DISTINCT collapses these to one row at query time.

## ADR-018 Type-Test Verification

`tests/types.ts` D-07 lines remain functional:

- `void Acknowledgments.update` — still fails to typecheck (the repository object has no `update` property) → `@ts-expect-error` correctly suppressed → invariant locked.
- `void Acknowledgments.delete` — still fails to typecheck → `@ts-expect-error` correctly suppressed → invariant locked.

`pnpm tsc --noEmit` exits 0, confirming the inverted-polarity guards (which fail the build IF the invariants ever erode) are operating correctly.

## Decisions Made

- **`AcknowledgmentRecordInput` preserved verbatim** — `<read_first>` directive was explicit about preserving the existing type def at lines 26-29; no widening needed because `acknowledgedAt` has `defaultNow()` and `id` auto-generates.
- **`PolicyAssignmentCreateInput` preserved verbatim** — same rationale.
- **JOIN order: assignments → versions → current_ack → prior_ack** — narrower-first plan per Postgres planner conventions; alternatives (assignments → ack joins → versions) would force a re-scan after the version lookup. Planner discretion per CONTEXT.md "Exact SQL formatting + JOIN order".
- **`QaCitationGrants.upsert` input type uses `string` for `policyId`** — schema-inferred via `$inferInsert`; ADR-028 explicitly waives brand coverage for $inferInsert types ("schema-inferred insert inputs are intentionally out of brand scope"). Brand IS preserved on the explicit `hasGrant(s, userId, policyId: PolicyId)` parameter position.
- **`QaCitationGrants.hasGrant` uses `Number(rows[0]?.c ?? 0) > 0`** — Drizzle returns count as `string` in some Postgres driver paths; explicit `Number(...)` coercion + `> 0` boolean comparison is portable across the postgres-js + node-postgres backends used by Phase 2 + Phase 5 respectively.

## Deviations from Plan

None — plan executed exactly as written.

The verify-script (`<automated>` block in Task 2) used `tsx -e ...` to runtime-probe the QaCitationGrants surface; this command initially failed because the file's `'server-only'` directive (correctly) blocks plain Node imports. Re-ran with `pnpm exec tsx --conditions=react-server -e ...` which mirrors Next.js Server Component condition resolution — probe returned `OK QaCitationGrants surface`. This is not a deviation: the `'server-only'` invariant is the intended defense per Phase 2 D-02 / RESEARCH Pitfall 6 + matches every other repository file's contract. The probe-flag adjustment is a one-line operational note, not a code change.

## Issues Encountered

None — both tasks compiled clean on the first iteration; all greppable acceptance criteria passed on the first run; the only repeat-work was the verify-script re-run noted above.

## Verification Results

**Task 1 acceptance criteria (`<verify>` block on Task 1):**

- ✓ `pnpm tsc --noEmit` exits 0
- ✓ `grep -c "throw new Error('Not yet implemented" lib/db/repositories/acknowledgments.ts lib/db/repositories/policy_assignments.ts` returns 0 (both stubs replaced)
- ✓ `grep -cE "\.onConflictDoNothing\(\)" lib/db/repositories/acknowledgments.ts` returns 1
- ✓ `grep -cE "\.onConflictDoNothing\(\)" lib/db/repositories/policy_assignments.ts` returns 1
- ✓ `grep -cE "no-op \(already acked\)" lib/db/repositories/acknowledgments.ts` returns 1 (D-10 ops log)
- ✓ `grep -c "listAssignedAndPublishedForUser" lib/db/repositories/policies.ts` returns 1
- ✓ `grep -c "selectDistinct" lib/db/repositories/policies.ts` returns 1
- ✓ `grep -cE "alias\(acknowledgments" lib/db/repositories/policies.ts` returns 2 (currentAck + priorAck)
- ✓ `grep -cE "NO update method|NO delete method" lib/db/repositories/acknowledgments.ts` returns 2
- ✓ `grep -cE "^\s*update:\s*\(|^\s*delete:\s*\(" lib/db/repositories/acknowledgments.ts` returns 0

**Task 2 acceptance criteria (`<verify>` block on Task 2):**

- ✓ `pnpm tsc --noEmit` exits 0
- ✓ File `lib/db/repositories/qa_citation_grants.ts` exists
- ✓ `grep -c "export const QaCitationGrants" lib/db/repositories/qa_citation_grants.ts` returns 1
- ✓ `grep -cE "^\s*(listForUser|upsert|hasGrant):" lib/db/repositories/qa_citation_grants.ts` returns 3
- ✓ `grep -c "'server-only'" lib/db/repositories/qa_citation_grants.ts` returns 1
- ✓ `grep -c ".onConflictDoNothing()" lib/db/repositories/qa_citation_grants.ts` returns 1
- ✓ `grep -cE "^\s*(update|delete):" lib/db/repositories/qa_citation_grants.ts` returns 0
- ✓ Runtime probe `tsx --conditions=react-server -e "import { QaCitationGrants } ..."` returns `OK QaCitationGrants surface`
- ✓ `grep -c "from '@/lib/db'$" lib/db/repositories/qa_citation_grants.ts` returns 0 (no raw db barrel import)

**Plan-level `<verification>` block:**

- ✓ `pnpm tsc --noEmit` exits 0 — tests/types.ts D-07 invariants still pass
- ✓ All four repository surfaces functional; ADR-018 + ADR-019 + ADR-023 + ADR-028 preserved
- ⚠️ `pnpm verify:phase-4` exits 1 with `Total: 393 | Passed: 392 | Failed: 1` — sole failure is `reference/API-SPEC.md amended with 'citations: { title: string, id: string }[]' (D-27)`. **This failure is pre-existing and out of scope for Plan 05-03** (verified by checking out 8156d94 — the baseline pre-Task-1 commit — and re-running verify:phase-4: same 1/393 failure). The pre-existing failure is a Phase 4 D-27 citation-shape amendment that never reached reference/API-SPEC.md. Per the SCOPE BOUNDARY rule in execute-plan.md, this is logged as a deferred item rather than auto-fixed under Rule 1.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Wave 2 sibling Plan 05-04 (orchestrators) can now consume all four repository surfaces:

- `lib/policies/acknowledgment.ts` will call `Acknowledgments.record` inside `withOrgScope` per D-10a (transactional read-policy + lookup-version + INSERT).
- `lib/ai/qa.ts::askQuestion` will iterate `parsed.citations` (post-D-41 validIds filter) and call `QaCitationGrants.upsert(s, { userId, policyId: cit.id })` per RESEARCH Pitfall 3 — content-agnostic from the repository's perspective.
- Wave 3 Plan 05-05 employee pages will call `Policies.listAssignedAndPublishedForUser` from Server Components and `QaCitationGrants.hasGrant` from the `/my-policies/[id]` page handler per D-27 access-decision routing.
- Wave 3 Plan 05-06 admin Server Action will call `PolicyAssignments.create` for bulk dept-assign.

No blockers introduced. Pre-existing `reference/API-SPEC.md` D-27 citation-shape amendment gap should be tracked separately (Phase 4 follow-up or absorbed by Plan 05-04 when wiring askQuestionAction's response shape).

## Deferred Issues

- **DEFERRED-PHASE4-API-SPEC:** `reference/API-SPEC.md` does not contain the substring `'citations: { title: string, id: string }[]'` per the Phase 4 D-27 amendment expected by `scripts/check-artifacts.ts`. Pre-existing on commit 8156d94. **Recommendation:** Plan 05-04 (Wave 2) is the natural home for this fix because it ships the askQuestion(ctx, q) extraction per D-25 — the response shape is documented at the same time the function lands. Alternative: a tiny doc-only follow-up commit on a separate branch.

## Self-Check: PASSED

- ✓ `lib/db/repositories/acknowledgments.ts` exists, contains `.onConflictDoNothing()` and `[ack] no-op (already acked)`
- ✓ `lib/db/repositories/policy_assignments.ts` exists, contains `.onConflictDoNothing()` (no throw-stub)
- ✓ `lib/db/repositories/policies.ts` exists, contains `listAssignedAndPublishedForUser` + `selectDistinct` + 2x `alias(acknowledgments`
- ✓ `lib/db/repositories/qa_citation_grants.ts` exists with `QaCitationGrants` export and 3 methods
- ✓ Commits e23a4a4 and b8de7f1 both present in `git log --oneline -3`
- ✓ `pnpm tsc --noEmit` exits 0

---
*Phase: 05-employee-portal*
*Completed: 2026-05-23*
