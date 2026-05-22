---
phase: 04-ai-layer
plan: 04-06
subsystem: tier-limit-gate
tags:
  - lib-stripe
  - tier-limits
  - typed-errors
  - warning-2-closure
  - error-discipline
requirements:
  - REQ-ai-usage-rules
  - REQ-ai-policy-assistant
dependency_graph:
  requires:
    - 04-01 (Anthropic SDK install + audit)
    - 04-02 (lib/db schema amendments — aiGenerations 4-counter + batchJobs)
    - 04-03 (Wave 0 RED stub at lib/stripe/products.test.ts)
  provides:
    - "lib/stripe/products.ts → TIER_LIMITS const + PlanTier type + readPlanTier + countDraftsThisMonth (WARNING-2 split-helpers) + checkTierLimit + requireTierLimit + findRequiredTier"
    - "lib/stripe/errors.ts → TierLimitExceededError typed-error class (D-16 ADR-026 pattern)"
    - "scripts/check-error-discipline.ts → ADR-026 scope widened to lib/stripe/**.ts(x)"
    - "scripts/check-db-imports.ts → L-05 allow-list extended for lib/stripe/products.ts"
  affects:
    - 04-08 (Draft endpoint imports requireTierLimit + TierLimitExceededError)
    - 04-10 (Consistency-submit endpoint imports requireTierLimit + TierLimitExceededError)
    - 04-09 (Q&A endpoint deliberately does NOT call requireTierLimit per D-46)
tech_stack:
  added: []
  patterns:
    - "Self-namespace import (`import * as self from './products'`) for vi.spyOn interception of intra-module helper calls"
    - "vi.mock('@/lib/db') + vi.mock('@/lib/db/schema') stubs in test file to avoid DATABASE_URL evaluation in vitest jsdom env (mirrors lib/policies/transitions.test.ts precedent)"
    - "Throw-based tier enforcement (D-15) with statusCode on the error instance (D-16)"
    - "Drizzle raw-`db` import outside lib/db/repositories/ — exception logged in check-db-imports.ts allowlist with D-37 rationale (gate runs before withOrgScope opens)"
key_files:
  created:
    - lib/stripe/products.ts (237 lines)
    - lib/stripe/errors.ts (40 lines)
    - .planning/phases/04-ai-layer/04-06-SUMMARY.md (this file)
  modified:
    - lib/stripe/products.test.ts (Wave 0 stub replaced — 30 → 171 lines; 6 expect.fail → 11 GREEN assertions)
    - scripts/check-error-discipline.ts (10 new mirror entries for lib/stripe/**; success log updated)
    - scripts/check-db-imports.ts (1-line ALLOWLIST entry for lib/stripe/products.ts)
decisions:
  - "WARNING-2 split-helpers MANDATED: checkTierLimit is a thin orchestrator over readPlanTier(orgId) + countDraftsThisMonth(orgId); tests vi.spyOn the helpers (not the Drizzle chain)"
  - "Self-namespace import pattern (`import * as self from './products'`) used by orchestrators to call helpers; required because vi.spyOn can only replace module-namespace properties, not local-binding closures"
  - "Rule-3 deviation: scripts/check-db-imports.ts ALLOWLIST extended with lib/stripe/products.ts per D-37 (gate runs before withOrgScope; app-layer org-scoping via eq(organizations.id) + eq(aiGenerations.orgId))"
  - "Rule-3 deviation: lib/stripe/products.test.ts adds vi.mock('@/lib/db') + vi.mock('@/lib/db/schema') so SUT module imports do not trigger DATABASE_URL throw in jsdom env"
  - "Task 4 (verification only) has no source modifications → no commit per GSD discipline (do not create empty commits); verification confirmation captured in this SUMMARY"
metrics:
  duration: "~20 min"
  tasks_completed: 4
  files_created: 2
  files_modified: 3
  commits: 3
  completed_date: "2026-05-21"
---

# Phase 4 Plan 04-06: Tier-Limit Module + WARNING-2 Closure Summary

## One-liner

Ships the Phase 4 tier-limit gate (`lib/stripe/products.ts` + `lib/stripe/errors.ts`) per D-14/D-15/D-16, closes WARNING-2 via the mandated split-helper architecture (8 GREEN tests, zero `expect.fail` placeholders), and widens the ADR-026 error-discipline gate to scan `lib/stripe/**.ts(x)`.

## What Shipped

### 1. `lib/stripe/errors.ts` (40 lines, NEW — D-16)

`TierLimitExceededError extends Error` (NOT `BootstrapError` — billing-domain, not auth-bootstrap). Carries:

- `readonly code = 'TIER_LIMIT_EXCEEDED' as const` — stable structured-log discriminant
- `readonly statusCode: 429 | 403` — usage-bound (`aiDraftsMonthly`, `maxUsers`) vs tier-bound routing
- Optional `readonly requiredTier?: PlanTier` — populated on 403 branch for "upgrade to X" UI copy
- Public readonly `feature`, `limit`, `current` for structured catch-handler logging
- Message body: `Tier limit exceeded: feature=<X> limit=<Y> current=<Z>` + optional `requiredTier=<T>` suffix

Forward-references `TIER_LIMITS` (value) and `PlanTier` (type) from `./products` — order-independent compile (TS resolves at compile time, not write time).

### 2. `lib/stripe/products.ts` (237 lines, NEW — D-14 + D-15 + WARNING-2)

Single source-of-truth for tier limits + feature gating:

- **`TIER_LIMITS`** const: verbatim from `reference/TIER-LIMITS.md` (3 tiers × 8 features). Spot-checks: Starter `maxUsers=25, aiDraftsMonthly=50, consistencyCheck=false`; Growth `consistencyCheck=true`; Business `aiDraftsMonthly=-1 (unlimited), sso=true`.
- **`PlanTier`** type = `'starter' | 'growth' | 'business'`; **`TierFeature`** type = `keyof typeof TIER_LIMITS.starter`.
- **`findRequiredTier(feature)`** — returns the lowest tier in which a boolean feature is true (`'growth'` for `consistencyCheck`, `'business'` for `sso`).
- **WARNING-2 split-helpers** (mandated, exported for `vi.spyOn`):
  - `readPlanTier(orgId): Promise<PlanTier>` — reads `organizations.planTier`; null/invalid → `'starter'`.
  - `countDraftsThisMonth(orgId): Promise<number>` — counts `ai_generations` rows where `type='draft'` AND `created_at >= UTC month start` (uses `Date.UTC(year, month, 1)` — NOT local time).
- **`checkTierLimit(orgId, feature)`** — orchestrator. Calls helpers via `self.readPlanTier` / `self.countDraftsThisMonth` (self-namespace pattern required for spy interception). Short-circuits on `limit === -1` (Business unlimited sentinel) BEFORE the DB count call. Returns `{ allowed, limit, current }`.
- **`requireTierLimit(orgId, feature)`** — D-15 throw-based enforcer. Calls `self.checkTierLimit`; on `!allowed`, throws `TierLimitExceededError` with `statusCode 429` (usage-bound) or `403 + requiredTier` (tier-bound).

The self-namespace import (`import * as self from './products'`) is the entire point of WARNING-2: without it, `vi.spyOn(productsMod, 'readPlanTier')` would not intercept calls from the orchestrators (Vitest can only replace module-namespace properties, not local-binding closures captured at parse time).

### 3. `lib/stripe/products.test.ts` (171 lines, MODIFIED — WARNING-2 closure)

Wave 0 stub (30 lines, 6 `expect.fail` placeholders) replaced with **11 GREEN tests, zero `expect.fail` placeholders**:

1. `TIER_LIMITS.starter` verbatim match against TIER-LIMITS.md.
2. `findRequiredTier('consistencyCheck') === 'growth'`.
3. `findRequiredTier('sso') === 'business'`.
4. UTC-month-boundary correctness (mocked helpers; fake timers at `2026-05-15T12:00:00Z`; verifies `checkTierLimit` correctly delegates to `countDraftsThisMonth` and returns its result as `current`).
5. Null `planTier` defaults to `'starter'`.
6. `planTier='growth'` returns limit 200 (NOT unlimited).
7. `planTier='business'` returns `{ limit: -1, allowed: true }` AND short-circuits (no DB count call — verified via spy `.toHaveBeenCalled()` assertion).
8. SP-4: `requireTierLimit('aiDraftsMonthly')` overage throws with `statusCode: 429`.
9. SP-4: `requireTierLimit('consistencyCheck')` on Starter throws with `statusCode: 403, requiredTier: 'growth'`.
10. D-16: `TierLimitExceededError.code === 'TIER_LIMIT_EXCEEDED'`, `.name === 'TierLimitExceededError'`, message contains feature/limit/current.
11. D-16: `TierLimitExceededError.message` includes `requiredTier=<T>` when provided.

Mock surface (Rule-3 deviation): `vi.mock('@/lib/db', ...)` + `vi.mock('@/lib/db/schema', ...)` at file top prevent the real `lib/db/index.ts` barrel from evaluating DATABASE_URL in the vitest jsdom env. Same pattern as `lib/policies/transitions.test.ts`. The Drizzle chain inside the helpers is exercised live in Plan 04-14's `check-ai-layer` integration test against the real test DB.

### 4. `scripts/check-error-discipline.ts` (MODIFIED — D-16 widening)

ADR-026 ts-morph gate scope extended from `lib/auth/**.ts(x)` to also scan `lib/stripe/**.ts(x)`. Added 10 mirror glob entries (10 includes + 10 exclusions parallel to lib/auth — `errors.ts`, `*.test.ts(x)`, `*.spec.ts(x)`, `*.d.ts`, `__mocks__/`, `__tests__/`). Success log updated to `OK — ADR-026 + Phase 4 D-16: 4 file(s) scanned in lib/auth/ + lib/stripe/...`.

Gate currently scans 4 files (lib/auth/context.ts, lib/auth/require-admin.ts, lib/stripe/products.ts, plus the lib/stripe/products.test.ts excluded by `!*.test.ts` glob → no, that's 3; the 4th is lib/auth/bootstrap-errors.ts). All passing — the only throw in lib/stripe/products.ts is the typed `throw new TierLimitExceededError(...)` which is exempt because the gate only forbids built-in Error constructors (Error, TypeError, RangeError, etc.).

### 5. `scripts/check-db-imports.ts` (MODIFIED — Rule-3 deviation)

ALLOWLIST extended with one line: `/^lib\/stripe\/products\.ts$/` per D-37 (gate runs BEFORE `withOrgScope` opens; app-layer org-scoping via `eq(organizations.id, orgId)` + `eq(aiGenerations.orgId, orgId)` inside the readPlanTier + countDraftsThisMonth split-helpers). WARNING-2 documented exception. `pnpm check:db-imports` now reports `OK — L-05: 5 allow-listed @/lib/db import(s), 0 violations.`.

## Verification Results

| Gate | Result |
|------|--------|
| `pnpm typecheck` (tsc --noEmit) | exits 0 |
| `pnpm test lib/stripe/products.test.ts` | 11/11 GREEN |
| `pnpm check:error-discipline` (widened to lib/auth + lib/stripe) | exits 0 |
| `pnpm check:db-imports` (allowlist extended) | exits 0 (5 allow-listed, 0 violations) |
| `pnpm test lib/policies/state-machine.test.ts lib/auth/bootstrap-errors.test.ts` (Phase 3 invariants) | 48/48 GREEN |
| `grep -c "expect\.fail" lib/stripe/products.test.ts` | 0 (WARNING-2 invariant) |
| `lib/stripe/products.ts` line 1 | `import 'server-only';` |
| `lib/stripe/errors.ts` line 1 | `import 'server-only';` |

### Wave-0 RED Stubs (Expected — Future Plans)

The full `pnpm test` reports 35 failed tests across Plans 04-07 through 04-11 surfaces (`lib/ai/summary.test.ts`, `lib/policies/transitions.test.ts` D-19 branch, `app/api/ai/*` route tests, `app/(admin)/dashboard/consistency/page.test.tsx`, `components/policy/PolicyAiDraftDialog.test.tsx`, `app/api/ai/consistency/[batchId]/route.test.ts`). These are all `expect.fail('TODO: Plan 04-XX — ...')` placeholders authored at Wave 0 (Plan 04-03) and are EXPECTED to remain RED until the future plans flip them GREEN. Plan 04-06 introduces NO regressions to previously-passing tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vitest jsdom env cannot evaluate `lib/stripe/products.ts` without DATABASE_URL**

- **Found during:** Task 2 (first `pnpm test lib/stripe/products.test.ts` run)
- **Issue:** `lib/stripe/products.ts` imports `db` from `@/lib/db`, which throws on import when `DATABASE_URL` is not set. The vitest test runner does not inject `.env.local`. The test file would fail to load.
- **Fix:** Added `vi.mock('@/lib/db', ...)` and `vi.mock('@/lib/db/schema', ...)` at the top of `lib/stripe/products.test.ts` (Vitest hoists these before any imports). Stub objects mirror minimal Drizzle builder shape so module load succeeds; the actual helpers are replaced by `vi.spyOn` in each test, so the stubs are never invoked. Mirror pattern of `lib/policies/transitions.test.ts:97`.
- **Files modified:** `lib/stripe/products.test.ts`
- **Commit:** `1d07eff`

**2. [Rule 3 — Blocking] `scripts/check-db-imports.ts` L-05 gate trips on `lib/stripe/products.ts` raw db import**

- **Found during:** Task 2 verification
- **Issue:** Plan 04-06's `products.ts` imports `db` from `@/lib/db` (the raw barrel) inside the `readPlanTier` and `countDraftsThisMonth` helpers. The L-05 ALLOWLIST in `scripts/check-db-imports.ts` does not include `lib/stripe/products.ts`. `pnpm check:db-imports` exits 1 with `ADR-023 / L-05 raw-db allow-list violations`.
- **Fix:** Added one ALLOWLIST regex entry `^lib\/stripe\/products\.ts$` with inline rationale citing D-37 (gate runs before withOrgScope opens) + Phase 4 Plan 04-06. This is explicitly anticipated in the Plan 04-06 Task 2 action block: "if `pnpm check:db-imports` fails after this file lands, append the path to the allow-list (one-line edit, commit as part of Task 2's diff)".
- **Files modified:** `scripts/check-db-imports.ts`
- **Commit:** `1d07eff` (bundled with Task 2 per plan instruction)

**3. [Rule 3 — Blocking] `vi.spyOn(productsMod, 'readPlanTier')` does not intercept intra-module helper calls**

- **Found during:** Task 2 (second `pnpm test` run after the vi.mock fix unblocked module evaluation)
- **Issue:** Initial implementation called helpers directly inside `checkTierLimit` (e.g., `await readPlanTier(orgId)`). The local-binding closure captured at parse time bypassed the `vi.spyOn` replacement on the module-namespace object. Tests 4-7 (Business-tier short-circuit, 429 routing, 403 routing, growth-tier limit) all failed because the orchestrator was invoking the original (un-mocked) helper that called the real Drizzle chain → unexpected behavior.
- **Fix:** Added a self-namespace import at the top of `lib/stripe/products.ts`: `import * as self from './products'`. Refactored both orchestrators (`checkTierLimit`, `requireTierLimit`) to call helpers via `self.readPlanTier(...)`, `self.countDraftsThisMonth(...)`, and `self.checkTierLimit(...)`. The self-namespace indirection ensures `vi.spyOn(productsMod, 'fn')` (which replaces a property on the module namespace) intercepts the calls. Inline comment block documents the WARNING-2 SPY CONTRACT.
- **Files modified:** `lib/stripe/products.ts`
- **Commit:** `1d07eff`

### Non-deviations (Plan-mandated, not deviation)

- The test file has 11 tests (not 8 as the plan title says). The plan's `<action>` block explicitly authored 10 tests; one of the `findRequiredTier` cases was duplicated in the spec verification table (test #2 and the line-89-94 sketch in the plan body). The actual test file ships 11 `it(...)` blocks because the plan body authored each test explicitly in the action block; the count discrepancy is cosmetic. The `must_haves.truths` says "8 tests" but the action block authored more (TIER_LIMITS verbatim×1, findRequiredTier×2, UTC-boundary×1, null planTier×1, growth-tier×1, business-tier short-circuit×1, 429 routing×1, 403 routing×1, error.code shape×1, error.message requiredTier×1 = 11). All assertions are concrete; zero `expect.fail`.

### Authentication Gates / Checkpoints

None. Plan was fully autonomous (no `type="checkpoint:*"` tasks).

## Threat Mitigations Honored

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|---------------|
| T-04-06-EL | mitigate | `requireTierLimit(orgId, 'consistencyCheck')` reads `organizations.planTier` (null → starter), returns `consistencyCheck: false` from TIER_LIMITS.starter, throws `TierLimitExceededError` with `statusCode: 403, requiredTier: 'growth'`. Test #9 verifies. |
| T-04-06-DV | mitigate | `requireTierLimit(orgId, 'aiDraftsMonthly')` counts current-month `ai_generations` rows where `type='draft'`; throws 429 at limit. Tier-Starter 50/mo, Growth 200/mo, Business -1 (unlimited short-circuit). Test #8 verifies the 429 path. |
| T-04-06-DV2 | accept | D-46 — Q&A endpoint does NOT call `requireTierLimit`. Honored in Plan 04-06 by NOT exporting any Q&A-related tier-feature constants. Phase 8 watch trigger at $50/org/mo Sonnet avg. |
| T-04-06-IL | accept | `TierLimitExceededError.message` contains feature/limit/current/optional requiredTier — none PII or org-private (TIER-LIMITS.md is public). Verified by tests #10 and #11. |
| T-04-06-DT | mitigate | `scripts/check-error-discipline.ts` widened to scan `lib/stripe/**.ts(x)` (Task 3) — forbids 8 raw-throw forms in this directory. |
| T-04-06-DT2 | mitigate | `countDraftsThisMonth` uses `Date.UTC(year, month, 1)` — NOT local time. Test #4 documents the UTC-boundary contract via fake timers at mid-month UTC; live verification in Plan 04-14 integration test. |

## Known Stubs

None. All exports from `lib/stripe/products.ts` and `lib/stripe/errors.ts` are wired and operational. Future Plans 04-08, 04-09, 04-10 will import + call `requireTierLimit` and `TierLimitExceededError` from these modules; the Wave-0 RED stubs in `app/api/ai/*/route.test.ts` reference these symbols and will flip GREEN as those plans land.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes introduced beyond those in the plan's `<threat_model>`.

## TDD Gate Compliance

Plan 04-06 frontmatter does NOT mark `type: tdd`; individual tasks have `tdd="true"` for Task 1 + Task 2. The Wave-0 RED stub at `lib/stripe/products.test.ts` (Plan 04-03 ship) IS the RED gate; Plan 04-06 flips it GREEN via the products.ts + errors.ts implementations. No separate `test(...)` commit was needed because the test file already existed RED. Commit sequence: Task 1 (`feat`) → Task 2 (`feat` with test-file update) → Task 3 (`chore` for scope widening). This matches the "Wave 0 / Wave 1" GSD pattern where Wave 0 lays the RED tests and Wave 1 ships the implementation.

## Self-Check: PASSED

**Files exist:**

- ✓ `lib/stripe/products.ts` — FOUND (237 lines)
- ✓ `lib/stripe/errors.ts` — FOUND (40 lines)
- ✓ `lib/stripe/products.test.ts` — FOUND (171 lines, GREEN)
- ✓ `scripts/check-error-discipline.ts` — FOUND (180 lines, lib/stripe added)
- ✓ `scripts/check-db-imports.ts` — FOUND (172 lines, lib/stripe/products.ts allowlisted)
- ✓ `.planning/phases/04-ai-layer/04-06-SUMMARY.md` — FOUND (this file)

**Commits exist:**

- ✓ `21031aa` — `feat(04-06): lib/stripe/errors.ts — TierLimitExceededError per D-16 + ADR-026 pattern`
- ✓ `1d07eff` — `feat(04-06): lib/stripe/products.ts — split-helper architecture (WARNING-2) + 8 GREEN tests`
- ✓ `37dff0b` — `chore(04-06): extend check-error-discipline scan to lib/stripe/ per D-16`

**Acceptance criteria satisfied:**

- ✓ All 4 tasks executed; per-task commits made (Tasks 1-3 produce diffs → 3 commits; Task 4 is verification-only → no empty commit per GSD discipline; verification logged in this SUMMARY)
- ✓ `lib/stripe/products.ts` exports TIER_LIMITS + PlanTier + readPlanTier + countDraftsThisMonth + checkTierLimit + requireTierLimit + findRequiredTier
- ✓ `lib/stripe/errors.ts` exports TierLimitExceededError with D-16 shape
- ✓ `scripts/check-error-discipline.ts` scope includes lib/stripe/
- ✓ `pnpm typecheck` exits 0
- ✓ `pnpm test lib/stripe/products.test.ts` GREEN (11/11)
- ✓ `grep -c "expect\.fail" lib/stripe/products.test.ts` returns 0 (WARNING-2 closure verified)
- ✓ `pnpm check:error-discipline` exits 0
- ✓ `pnpm check:db-imports` exits 0 (Rule-3 deviation closed)
- ✓ Phase 3 + Plan 04-04/04-05 tests still GREEN
- ✓ SUMMARY.md at `.planning/phases/04-ai-layer/04-06-SUMMARY.md`
- ✓ No mods to STATE/ROADMAP/PLAN files
