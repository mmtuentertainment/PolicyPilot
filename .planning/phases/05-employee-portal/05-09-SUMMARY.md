---
phase: 05-employee-portal
plan: 09
subsystem: integration-test
tags: [vitest, postgres-js, anthropic-mock, cross-org-isolation, h5-h6-eapi]
requires:
  - 05-01-uniques-and-grants
  - 05-02-error-classes
  - 05-03-repositories
  - 05-04-orchestrators
  - 05-05-employee-routes
  - 05-06-admin-bulk-assign
  - 05-07-ack-status-badge
provides:
  - check:employee-portal vitest integration test (R-1+R-3+R-4+R-6+AC-10+H-5+H-6)
  - 7 co-located unit test files for all Phase 5 repository/orchestrator/Server Action surfaces
  - package.json check:employee-portal script entry (Plan 05-10 verify:phase-5 chain target)
affects:
  - scripts/check-employee-portal.test.ts (new — 9 tests, all pass against live TEST DB)
  - scripts/check-employee-portal.vitest.config.ts (new — dedicated vitest config, node env, single-fork)
  - lib/db/repositories/policies.test.ts (new)
  - lib/db/repositories/acknowledgments.test.ts (new)
  - lib/db/repositories/policy_assignments.test.ts (new)
  - lib/db/repositories/qa_citation_grants.test.ts (new)
  - lib/policies/acknowledgment.test.ts (new)
  - app/(employee)/my-policies/[id]/actions.test.ts (new)
  - app/(employee)/my-policies/ask/actions.test.ts (new)
  - package.json (+ check:employee-portal script)
  - vitest.config.ts (+ scripts/check-employee-portal.test.ts excluded from default glob)
tech-stack:
  added: []
  patterns:
    - vi.mock + scopedRef.tx pattern from scripts/check-ai-layer.test.ts:124-303 (Phase 4 D-23a)
    - withRollback(__INTENTIONAL_ROLLBACK__) wrapper for per-test seed isolation
    - SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ..., true) for AC-10
    - Repository test contract-shape pattern (mock-level Drizzle composition assertions)
    - Hoisted vi.mock state + beforeEach reset + FormData helper for Server Action tests
key-files:
  created:
    - scripts/check-employee-portal.test.ts
    - scripts/check-employee-portal.vitest.config.ts
    - lib/db/repositories/policies.test.ts
    - lib/db/repositories/acknowledgments.test.ts
    - lib/db/repositories/policy_assignments.test.ts
    - lib/db/repositories/qa_citation_grants.test.ts
    - lib/policies/acknowledgment.test.ts
    - app/(employee)/my-policies/[id]/actions.test.ts
    - app/(employee)/my-policies/ask/actions.test.ts
  modified:
    - package.json
    - vitest.config.ts
decisions:
  - D-21 closed at the wire — all 6 Phase 5 surfaces (4 repositories + 1 orchestrator + 2 Server Actions) have co-located vitest files; integration script covers R-1+R-3+R-4+R-6+AC-10
  - D-22 closed at the wire — scripts/check-employee-portal.test.ts uses raw postgres-js + BYPASSRLS seed + SET LOCAL ROLE authenticated + intentional ROLLBACK + final TRUNCATE pattern (mirrors check-rls.ts:130-180 + check-policies-list-filters.ts:26-308)
  - D-23a closed at the wire — vi.mock('@/lib/ai/client') mirrors Phase 4 check-ai-layer.test.ts:34-115 pattern; no live Anthropic calls in CI
  - Naming choice (planner discretion per Plan 05-09 CLARIFICATION) — vitest framing chosen (`.test.ts` not `.ts`) because D-23a Anthropic mocking + D-22 raw-postgres tx-routing both require vi.mock which only vitest provides; documented in test header
  - EAPI advisor H-5 closure — pure-hallucination UUID (not in any policies row) is stripped by parseQaResponse validIds filter AND zero rows land in qa_citation_grants for that UUID (asserted via raw SELECT COUNT)
  - EAPI advisor H-6 closure — foreign-org real policy UUID is stripped before citation return AND zero grants written under any user for the foreign UUID; runtime complement to the structural `grep -c "validIds = new Set"` Plan 05-04 acceptance — proves Phase 4 D-41 same-closure defense holds in extracted lib/ai/qa.ts at runtime, not just by source-pattern presence
metrics:
  duration: ~12min (Task 1 ~6min + Task 2 ~6min)
  completed: 2026-05-24T03:27Z
---

# Phase 5 Plan 09: Integration Test Summary

R-1+R-3+R-4+R-6+AC-10+H-5+H-6 integration coverage via vitest-framed scripts/check-employee-portal.test.ts (against live TEST DB) + 7 co-located mock-level unit tests; D-23a Anthropic mock + D-22 raw postgres-js seed + ROLLBACK pattern preserved; EAPI advisor H-5/H-6 runtime negative tests close the structural-vs-behavioral gap.

## Implementation Decisions

### `.test.ts` over `.ts` for the integration script

Plan 05-09 CLARIFICATION left the planner discretion to choose between `scripts/check-employee-portal.ts` (plain tsx runner) and `scripts/check-employee-portal.test.ts` (vitest framing). The `.test.ts` form is the correct choice because:

1. **D-23a Anthropic mocking** requires `vi.mock('@/lib/ai/client')` which only vitest can hoist.
2. **D-22 raw-postgres tx routing** requires `vi.mock('@/lib/db/scoped')` to bind a `scopedRef.tx` ref so repository methods participate in the outer test transaction.
3. **Phase 4 precedent** (`scripts/check-ai-layer.test.ts`) ships in the same vitest-framed form for the same reasons.

The package.json entry uses the same shape as Phase 4's `check:ai-layer`:
```
"check:employee-portal": "tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-employee-portal.test.ts --config scripts/check-employee-portal.vitest.config.ts"
```

### `vitest.config.ts` exclusion

Added `scripts/check-employee-portal.test.ts` to the default `pnpm test` exclude list (mirrors the Phase 4 exclusion of `scripts/check-ai-layer.test.ts`). The integration harness requires DB env vars and would fail under the default jsdom config; it fires only via the dedicated `pnpm check:employee-portal` invocation.

### AC-10 cross-org isolation test reframing (Rule-3 scope-fix)

The plan body called for D_A.id and D_B.id to collide by UUID seed choice. **This seed is impossible at the schema level** — `departments.id` carries a PostgreSQL PRIMARY KEY constraint that BYPASSRLS cannot bypass, so two `departments` rows with the same UUID violate the table-level PK regardless of org.

The test was reframed to use distinct UUIDs + still verify the AC-10 invariant: under SET LOCAL ROLE authenticated with userA's JWT claims, userA cannot see orgB policies via either:
- Direct SELECT (`SELECT id, org_id FROM policies WHERE id = $pB` returns 0 rows)
- listAssigned-style query (orgB policy stripped from the result set)

The defense layers asserted: RLS at the DB + Phase 4 Pattern 4 same-closure validIds + lookup-scoping (ADR-027) in the dept sub-query (`eq(users.orgId, s.orgId)`). The AC-10 invariant — cross-org policies invisible to org-A-scoped session — is asserted end-to-end. Documented inline in the test header and listed under "Deviations from Plan" below.

## Coverage Summary

### `scripts/check-employee-portal.test.ts` (Task 1 — 9 tests against live TEST DB)

| Describe block | It count | What it asserts |
| --- | --- | --- |
| R-1 Dashboard query | 3 | 4-row seed (P1/P2 visible; P3 draft + P4 unassigned excluded) + D-02 dept-less-user empty result + D-01 SELECT DISTINCT dedup |
| R-3 Re-acknowledgment indicator | 1 | publish v1 → ack v1 → bump current_version=2 → ackState='stale' + COUNT=1 preserved → re-ack v2 → ackState='current' + COUNT=2 |
| R-4 Bulk department assignment | 1 | bulkAssign creates EXACTLY 1 row + all 3 dept members see P + duplicate bulkAssign is idempotent (D-15) |
| R-6 Q&A surface + grant UPSERT | 1 | accessibility='tldr-only' for unassigned U6 + grant UPSERT 1 row per cited policy + idempotent on repeat (D-26) |
| R-6 H-5 (EAPI advisor) | 1 | pure-hallucination UUID stripped by parseQaResponse validIds + zero grants for hallucinated UUID across entire table |
| R-6 H-6 (EAPI advisor) | 1 | foreign-org real policy UUID stripped before citation return + zero grants under any user for the foreign UUID (defensive cross-table assertion) |
| SPEC AC-10 Cross-org isolation | 1 | SET LOCAL ROLE authenticated + set_config — userA cannot see orgB policies even with positive-control validation that userA CAN see orgA policies |

### Co-located unit tests (Task 2 — 56 new tests across 7 files)

| File | Tests | Surface tested |
| --- | --- | --- |
| `lib/db/repositories/policies.test.ts` | 4 | listAssignedAndPublishedForUser composition (selectDistinct + 2x innerJoin + 2x leftJoin) + listPublishedForOrg regression smoke |
| `lib/db/repositories/acknowledgments.test.ts` | 8 | record() fresh/conflict/silent-success/D-10 ops log + scope.orgId stamp + brand preservation + ADR-018 runtime check (update / delete undefined) |
| `lib/db/repositories/policy_assignments.test.ts` | 6 | create() ON CONFLICT idempotency (D-15) + scope.orgId stamp + brand preservation + listForPolicy / listAll signature |
| `lib/db/repositories/qa_citation_grants.test.ts` | 7 | upsert() D-26 idempotency + scope.orgId stamp + hasGrant true/false/empty + listForUser signature |
| `lib/policies/acknowledgment.test.ts` | 11 | Happy path + 4 typed-error branches + D-05 IP capture (string + null) + D-03 dept-level match + D-10 silent-success (existing timestamp + fallback new Date) |
| `app/(employee)/my-policies/[id]/actions.test.ts` | 12 | 4 UUID-validation cases (CR-PR3-#23) + happy path (revalidatePath 2x) + D-05 IP capture (null + first-hop + multi-hop + trim) + 3 typed-error mappings + unknown rethrow |
| `app/(employee)/my-policies/ask/actions.test.ts` | 8 | Happy path + D-27a accessibility preservation + Zod min/max(2000) boundary cases + Anthropic.APIError → 503 envelope + non-Anthropic rethrow |

## `pnpm test` discovery

Confirmed `pnpm vitest run` picks up all 7 new co-located files via the default `**/*.{test,spec}.{ts,tsx}` glob — no `vitest.config.ts` change needed beyond the integration-script exclusion. Final discovery: 28 test files / 228 tests all pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - AC-10 schema constraint blocker] Reframed cross-org isolation seed**

- **Found during:** Task 1 integration test execution
- **Issue:** Plan body called for seeding `departments` with two rows sharing the same UUID (one in orgA, one in orgB) to test "what if a UUID collision happens." The first test run failed with `duplicate key value violates unique constraint "departments_pkey"` — `departments.id` has a PostgreSQL PRIMARY KEY which BYPASSRLS cannot bypass.
- **Fix:** Reframed the test to use distinct UUIDs per dept + assert the AC-10 invariant (orgB policies invisible to org-A-scoped session) via SET LOCAL ROLE authenticated + RLS + lookup-scoping. The cross-org isolation contract is still proven end-to-end; the unrealistic "UUID collision" framing is replaced with the realistic "RLS isolates orgs even when UUIDs are distinct" framing. Defense layers asserted: RLS at DB + listAssigned's own `eq(policies.orgId)` predicate + the dept sub-query's `eq(users.orgId, s.orgId)` lookup-scope (ADR-027).
- **Files modified:** `scripts/check-employee-portal.test.ts` (AC-10 describe block — reseed with distinct UUIDs + add defense-in-depth listAssigned-style assertion)
- **Commit:** d3b2215

**2. [Rule 3 - vitest config exclusion] Added `scripts/check-employee-portal.test.ts` to default vitest exclude list**

- **Found during:** Task 1 commit prep
- **Issue:** Without exclusion, `pnpm test` (default vitest config) would try to load the integration script in jsdom env without DB env vars → silent failure.
- **Fix:** Mirrored the Phase 4 `scripts/check-ai-layer.test.ts` exclusion line in `vitest.config.ts`. Documented in the inline comment.
- **Files modified:** `vitest.config.ts`
- **Commit:** d3b2215

## Threat Flags

None — no new tenant-scoped tables / endpoints / auth paths introduced. The integration test is read-only on the production code path (uses TEST DB only, gated by env-var presence + vitest fork pool isolation).

## verify chain status

- `pnpm tsc --noEmit` exits 0 (both commits)
- `pnpm check:employee-portal` exits 0 (9/9 tests against live TEST DB)
- `pnpm verify:phase-4` exits 0 — chain composition unchanged (no regression)
- `pnpm vitest run` exits 0 — 228 tests across 28 files (56 new + 172 pre-existing)

## Plan 05-10 prerequisites (downstream consumer)

Plan 05-10 (verify-chain-uat — Wave 5) needs to wire `verify:phase-5` chain target:
```
"verify:phase-5": "pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal"
```

All four chain targets ship today (after this plan) — `pnpm check:employee-portal` is the wiring point and exists at `package.json` line 44. Plan 05-10 also runs the operator UAT checkpoint per ROADMAP Phase 5 SC.

## Self-Check: PASSED

- [x] `scripts/check-employee-portal.test.ts` exists (9 tests; passes against live TEST DB)
- [x] `scripts/check-employee-portal.vitest.config.ts` exists (mirrors check-ai-layer.vitest.config.ts)
- [x] All 7 co-located vitest unit test files exist (4 repos + 1 orchestrator + 2 Server Actions)
- [x] `package.json` carries `check:employee-portal` script entry (1 occurrence)
- [x] `vitest.config.ts` excludes the integration script from default `pnpm test` glob
- [x] R-1 / R-3 / R-4 / R-6 / AC-10 / H-5 / H-6 all covered in integration test
- [x] Anthropic mocked per D-23a (vi.mock('@/lib/ai/client') — 1 occurrence)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm check:employee-portal` exits 0 against live TEST DB
- [x] `pnpm verify:phase-4` exits 0 (no regression)
- [x] Commits d3b2215 + 5ab844d in git log
