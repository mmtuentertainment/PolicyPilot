---
phase: 04-ai-layer
plan: 04-10
subsystem: ai-consistency
tags: [ai-layer, consistency-check, batch-api, sdk-spec-drift, rls, warning-5]
dependency-graph:
  requires:
    - 04-02  # Phase 4 schema + RLS migrations 0005/0006/0007 for batch_jobs + widened ai_generations
    - 04-05  # lib/ai/client + cache + prompts
    - 04-06  # lib/stripe/products + errors
    - 04-07  # batch_jobs + ai_generations repository methods
  provides:
    - POST /api/ai/consistency (submit endpoint, SPEC R5)
    - GET /api/ai/consistency/[batchId] (poll endpoint, SPEC R5)
    - translateProcessingStatus (exported SDK→SPEC enum translator)
    - scripts/check-rls.ts batch_jobs cross-org case (AC-24)
  affects:
    - 04-14  # check-ai-layer.ts integration test will consume the polled response
    - 04-13  # /dashboard/consistency page mount-time resume reads BatchJobs
tech-stack:
  added: []
  patterns:
    - Pattern B (D-37): auth gates outside try; tier/AI/DB inside try
    - D-06 SUCCESS-ONLY: batch_jobs at submit; ai_generations on completion
    - D-34 DB-cache stale-window (25s) BEFORE Anthropic retrieve
    - D-36 PII-safe sanitized error log
    - WARNING-5 token aggregation across batch results stream
    - SDK→SPEC enum translator (NO prior analog — first in codebase)
key-files:
  created:
    - app/api/ai/consistency/route.ts (143 lines)
    - app/api/ai/consistency/[batchId]/route.ts (227 lines)
    - .planning/phases/04-ai-layer/04-10-SUMMARY.md
  modified:
    - app/api/ai/consistency/route.test.ts (flipped 3 RED stubs to 3 GREEN tests)
    - app/api/ai/consistency/[batchId]/route.test.ts (flipped 7 RED stubs + added WARNING-5 8th)
    - scripts/check-rls.ts (TENANT_TABLES + seed + truncate lists extended with batch_jobs)
decisions:
  - SDK→SPEC enum drift closed at the route-handler boundary via translateProcessingStatus.
    Raw SDK processing_status enum NEVER crosses the persistence layer — batch_jobs.status
    stores SPEC enum exclusively.
  - WARNING-5 resolution: token columns AGGREGATED from MessageBatchIndividualResponse.result
    .message.usage objects across all succeeded results. Previously specified as null per the
    original CONTEXT-specifics comment "batch results don't surface per-request usage cleanly"
    — that assumption was wrong. SUM populates ai_generations row so Phase 8 weighted-cost SQL
    sees > 0 input_tokens on consistency rows.
  - AiGenerations is NOT IMPORTED in the submit route — D-06 SUCCESS-ONLY enforced at
    import-time (impossible to write ai_generations at submission).
metrics:
  duration_minutes: 10
  completed_date: 2026-05-21
  commits: 4
  tests_red_to_green: 11
  source_files_created: 2
  source_files_modified: 3
  test_files_modified: 2
---

# Phase 04 Plan 04-10: Wave 2 — Consistency Check Submit + Poll + CRITICAL SDK→SPEC Translator Summary

Shipped the two-endpoint Consistency Check surface (POST submit + GET poll) plus the
canonical SDK→SPEC enum translator that closes the CRITICAL drift documented in 04-RESEARCH.md
§ Batch API Mechanics. Poll endpoint includes WARNING-5 token aggregation so Phase 8
weighted-cost SQL doesn't undercount Consistency batches by 100%. Extended check-rls.ts with
the new batch_jobs tenant table — AC-24 cross-org isolation verified live against TEST DB
(11 tenant-scoped tables now under property test). 11 RED test stubs flipped GREEN across two
files (3 submit + 8 poll, including the new WARNING-5 token-sum acceptance). No deviations.

## Files

| File                                              | Lines | Role       |
| ------------------------------------------------- | ----- | ---------- |
| `app/api/ai/consistency/route.ts`                 | 143   | POST submit (Pattern B + Batch API submit + 403 routing) |
| `app/api/ai/consistency/[batchId]/route.ts`       | 227   | GET poll (translator + D-34 stale-window + WARNING-5)    |
| `scripts/check-rls.ts`                            | 222   | Extended TENANT_TABLES + seed + truncate for batch_jobs  |

## Translator Behavior Table (4 Fixture Cases × Outcomes)

| Fixture                                                            | Translator Output | Test Case |
| ------------------------------------------------------------------ | ----------------- | --------- |
| `processing_status: 'in_progress'`                                 | `'in_progress'`   | Test 1    |
| `processing_status: 'canceling'`                                   | `'in_progress'`   | Test 2    |
| `processing_status: 'ended'` + `request_counts.succeeded > 0` only | `'completed'`     | Test 3    |
| `processing_status: 'ended'` + `request_counts.errored > 0`        | `'failed'`        | Test 4    |

All 4 translator fixtures GREEN — drift between SDK enum (`'in_progress' | 'canceling' | 'ended'`)
and SPEC enum (`'in_progress' | 'completed' | 'failed'`) closed inside the route handler. Raw SDK
processing_status NEVER persists; batch_jobs.status uses SPEC enum exclusively.

## D-34 Stale-Window Verification

| Scenario                                                    | SDK Retrieve Calls | Test Case |
| ----------------------------------------------------------- | ------------------ | --------- |
| 10 polls within 5s of stale batch_jobs row                  | 1                  | AC-30 ✓   |
| 11th poll after 26s elapse (past STALE_WINDOW_MS=25_000)    | +1 (new SDK call)  | Test 6 ✓  |

10-poll storm collapses to exactly 1 SDK retrieve call — comfortably under Anthropic Tier-1
Batches API's 50RPM shared cap. After 25s expiry, next poll DOES hit Anthropic. Both branches
covered by `vi.useFakeTimers()` + `vi.setSystemTime()` advancement.

## AC-24 Result (batch_jobs Cross-Org Isolation)

`pnpm check:rls` against live TEST DB:
- TENANT_TABLES extended from 10 → 11 (batch_jobs appended)
- Seeded orgA + orgB with one batch_jobs row each (unique anthropic_batch_id values)
- Connected as `authenticated` role with orgA's JWT
- Positive control: orgA reads its own policy row → 1 row ✓
- Negative: orgA's JWT SELECTs every TENANT_TABLES entry for orgB → 0 rows for batch_jobs
- Output: `OK — L-06: all 11 tenant-scoped tables RLS-isolated; positive control passed.`

## WARNING-5 Result (Token Aggregation Invariant)

| Surface          | Check                                                      | Status |
| ---------------- | ---------------------------------------------------------- | ------ |
| Source           | `grep -c "totalInputTokens" [batchId]/route.ts` → 3        | ✓      |
| Source           | `grep -c "totalOutputTokens" [batchId]/route.ts` → 3       | ✓      |
| Source           | Declared (4 counters) + accumulated (4 fields) + inserted  | ✓      |
| Unit test        | WARNING-5 8th test asserts SUMS = expected (1800/900/350/150) | ✓      |
| Cost invariant   | `insertArgs.inputTokens` > 0 (NOT null) on completed batch | ✓      |
| Live SQL (Plan 04-14) | `SELECT input_tokens FROM ai_generations WHERE type='consistency' AND policy_id IS NULL ORDER BY created_at DESC LIMIT 1 > 0` — deferred to integration test | pending |

Aggregation logic:
```ts
for await (const r of resultsStream) {
  if (r.result.type !== 'succeeded') continue;
  const usage = r.result.message.usage;
  totalInputTokens += usage.input_tokens ?? 0;
  totalOutputTokens += usage.output_tokens ?? 0;
  totalCacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
  totalCacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
}
await AiGenerations.insert(s, { inputTokens: totalInputTokens, /* ... */ });
```

## Test Deltas

| File                                                       | Before     | After     | Delta |
| ---------------------------------------------------------- | ---------- | --------- | ----- |
| `app/api/ai/consistency/route.test.ts`                     | 3 RED      | 3 GREEN   | +3    |
| `app/api/ai/consistency/[batchId]/route.test.ts`           | 7 RED      | 8 GREEN   | +8 (incl. new WARNING-5) |
| **Total**                                                  | 10 RED     | 11 GREEN  | **+11** |

Combined run:
```
pnpm test "app/api/ai/consistency/route.test.ts" "app/api/ai/consistency/[batchId]/route.test.ts"
Test Files  2 passed (2)
Tests       11 passed (11)
```

## Commits

| Hash      | Subject                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `62a51d2` | feat(04-10): POST /api/ai/consistency per SPEC R5 + tier-bound 403 routing + D-06 SUCCESS-ONLY        |
| `9831a49` | feat(04-10): GET /api/ai/consistency/[batchId] + translator + D-34 stale-window + WARNING-5 aggregation |
| `2502f4e` | chore(04-10): extend check-rls.ts with batch_jobs (AC-24, D-29)                                       |
| `a691a36` | test(04-10): verify Consistency endpoints + translator + check-rls extended + WARNING-5 GREEN          |

## Architectural Notes

### SUCCESS-ONLY Enforcement at Import Time

The submit route does NOT import `AiGenerations`. The plan-level invariant "no ai_generations
row at submission" is enforced compile-time + import-time:
```
grep -c "AiGenerations" app/api/ai/consistency/route.ts → 0
```
Future regressions (e.g., adding an audit-log row at submission) would require explicitly
adding the import — making the violation surface visible in code review.

### Translator Anchors Persistence Boundary

The exported `translateProcessingStatus` function is the ONLY place in the codebase where the
SDK `processing_status` enum is read. Every other read of batch_jobs.status uses the SPEC enum
(`'in_progress' | 'completed' | 'failed'`). This single point of translation makes the drift
non-systemic — future SDK upgrades only need to update this one function if Anthropic adds new
processing_status values.

### Pattern B Continuation

This plan ships the 3rd and 4th endpoints to follow Pattern B (D-37 + D-36 + D-17): auth gates
outside try; tier check + AI + DB-write inside try; catch discriminates TierLimitExceededError
→ 403/429 and everything else → 503. The submit route deviates by routing 403 (tier-bound) not
429 (usage-bound) — handled by `requireTierLimit` looking up `USAGE_BOUND_FEATURES` and the
TierLimitExceededError instance carrying `statusCode: 403, requiredTier: 'growth'`.

## Verification Snapshot

```
pnpm typecheck                                                                          → exit 0
pnpm test app/api/ai/consistency/route.test.ts "app/api/ai/consistency/[batchId]/..."    → 11/11 GREEN
pnpm check:rls                                                                          → exit 0
```

## Deviations from Plan

None — plan executed exactly as written. The 4 tasks completed atomically with no deferred
issues, no auth gates, and no Rule 1-4 deviations.

## Known Stubs

None.

## Self-Check: PASSED

| Claim                                                                | Verification |
| -------------------------------------------------------------------- | ------------ |
| `app/api/ai/consistency/route.ts` exists                             | FOUND        |
| `app/api/ai/consistency/[batchId]/route.ts` exists                   | FOUND        |
| `scripts/check-rls.ts` modified (batch_jobs in TENANT_TABLES)        | FOUND        |
| `app/api/ai/consistency/route.test.ts` modified (3 RED → 3 GREEN)    | FOUND        |
| `app/api/ai/consistency/[batchId]/route.test.ts` modified (7+1 GREEN)| FOUND        |
| Commit `62a51d2` (Task 1 — submit endpoint)                          | FOUND in log |
| Commit `9831a49` (Task 2 — poll endpoint + translator + WARNING-5)   | FOUND in log |
| Commit `2502f4e` (Task 3 — check-rls.ts extension)                   | FOUND in log |
| Commit `a691a36` (Task 4 — verification record)                      | FOUND in log |
| 11 tests RED → GREEN (3 + 8)                                         | VERIFIED     |
| pnpm typecheck exits 0                                               | VERIFIED     |
| pnpm check:rls exits 0 with "all 11 tenant-scoped tables RLS-isolated" | VERIFIED   |
| translateProcessingStatus exported with 4-fixture coverage           | VERIFIED     |
| STALE_WINDOW_MS = 25_000 present                                     | VERIFIED     |
| WARNING-5 token sum invariant present (declare/accumulate/insert)    | VERIFIED     |
| Submit route does NOT import AiGenerations (D-06 import-time gate)   | VERIFIED     |
