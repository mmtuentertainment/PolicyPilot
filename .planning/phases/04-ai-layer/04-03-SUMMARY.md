---
phase: 04-ai-layer
plan: 04-03
subsystem: ai-layer
tags:
  - wave-0
  - test-scaffold
  - red-stubs
  - tdd
  - validation
requires:
  - 04-01-PLAN.md (reference contracts amended)
  - 04-02-PLAN.md (schema + migrations applied to TEST DB)
provides:
  - tests/ai-mocks.ts (shared mockTextResponse + mockBatch fixtures)
  - 13 net-new RED test stubs (6 lib/* + 5 route + 1 component + 1 page)
  - lib/policies/transitions.test.ts EXTENDED with SP-3 D-19 describe block
affects:
  - Plans 04-04..04-14 (each downstream plan drives one or more of these stubs from RED → GREEN)
tech-stack:
  added: []
  patterns:
    - "Phase 3 vi.mock orchestrator pattern (lib/policies/transitions.test.ts:39-99) reused for D-05 Anthropic-client mock shape"
    - "expect.fail('TODO: Plan 04-NN — ...') placeholders make RED state explicit (not just absent imports)"
    - "Variable-indirection const CLIENT_PATH = '@/lib/ai/client' bypasses TS module-resolution-at-compile-time in client.test.ts only"
    - "Test fixtures import from tests/ai-mocks.ts for centralized Anthropic.Messages.Message shape (closes RESEARCH Pitfall 6)"
key-files:
  created:
    - tests/ai-mocks.ts
    - lib/ai/client.test.ts
    - lib/ai/qa-parser.test.ts
    - lib/ai/qa-extract.test.ts
    - lib/ai/schemas.test.ts
    - lib/ai/summary.test.ts
    - lib/stripe/products.test.ts
    - app/api/ai/draft/route.test.ts
    - app/api/ai/summary/route.test.ts
    - app/api/ai/qa/route.test.ts
    - app/api/ai/consistency/route.test.ts
    - app/api/ai/consistency/[batchId]/route.test.ts
    - components/policy/PolicyAiDraftDialog.test.tsx
    - app/(admin)/dashboard/consistency/page.test.tsx
  modified:
    - lib/policies/transitions.test.ts (APPEND ONLY — new SP-3 D-19 describe block at EOF; existing Phase 3 blocks untouched)
decisions:
  - "Variable-indirection in client.test.ts ONLY: const CLIENT_PATH = '@/lib/ai/client' + await import(CLIENT_PATH) so TS compile passes before Plan 04-04 lands SUT. Other lib/* stubs use expect.fail() in test bodies — no imports of yet-to-exist modules needed since the tests don't run yet."
  - "Q&A route.test.ts wraps expect.fail in try/finally so consoleErrSpy.mockRestore() runs even when expect.fail throws (otherwise the spy would leak into subsequent tests in the same suite)."
  - "[batchId]/route.test.ts adds `const _fixtureRef = mockBatch; void _fixtureRef;` to keep the mockBatch import live before SUT consumers exist (defends against future strict unused-import elision in CI)."
  - "PolicyAiDraftDialog.test.tsx drops the @testing-library/react import for this RED stub (Plan 04-12 will add it). Includes 1 runtime-passing negative-fixture sanity test asserting JSON.parse('## Purpose\\n...') throws SyntaxError — this is the AC-23 (D-28) defense and is GREEN immediately."
  - "SP-3 D-19 describe block APPENDED to lib/policies/transitions.test.ts after the existing 'approve' describe block. Plan 04-11 will mock @/lib/ai/summary:generateSummaryForPolicy by adding vi.mock at the top of the file when implementing."
metrics:
  duration: ~12min
  completed: 2026-05-21
---

# Phase 04 Plan 04-03: Wave-0 RED Test Scaffold Summary

Plan 04-03 lands 13 net-new RED test stubs + 1 shared mock helper (`tests/ai-mocks.ts`) + extends `lib/policies/transitions.test.ts` with the SP-3 D-19 graceful-degrade describe block, completing the Wave-0 test scaffold per VALIDATION.md § Wave 0 Requirements. All new stubs FAIL at runtime (expected RED state); Phase 3 baseline tests stay GREEN.

## Deliverables

### Files created (14 net-new)

| # | File | Purpose | AC / Decision |
|---|------|---------|---------------|
| 1 | `tests/ai-mocks.ts` | `mockTextResponse(text, usage?)` + `mockBatch(processing_status, counts?)` shared fixtures | RESEARCH Pitfall 6 closure |
| 2 | `lib/ai/client.test.ts` | Singleton + `maxRetries:0` + `timeout:25_000` | AC-28 / D-33 |
| 3 | `lib/ai/qa-parser.test.ts` | Citation fence parser + validIds strip | D-10 / D-11 / D-41 |
| 4 | `lib/ai/qa-extract.test.ts` | generateHTML + strip + xmlEscape pipeline | D-07 / D-31 |
| 5 | `lib/ai/schemas.test.ts` | Zod `.strict()` + length-exceed (Draft/Summary/Qa) | AC-33 / D-42 |
| 6 | `lib/ai/summary.test.ts` | Idempotent re-call + cache-token columns | SPEC R3 / D-19 |
| 7 | `lib/stripe/products.test.ts` | TIER_LIMITS + checkTierLimit + 429/403 routing | SP-4 / D-14..D-16 |
| 8 | `app/api/ai/draft/route.test.ts` | SP-2 503 + AC-29 idempotency + AC-32 cache tokens | SP-2 / AC-29 / AC-32 |
| 9 | `app/api/ai/summary/route.test.ts` | SPEC R3 idempotent + 503 contract | SPEC R3 / SPEC R7 |
| 10 | `app/api/ai/qa/route.test.ts` | AC-31 PII-safe log + D-40 cache-miss + cache-hit | AC-31 / D-36 / D-40 |
| 11 | `app/api/ai/consistency/route.test.ts` | SP-4 Growth+ gate + D-06 SUCCESS-ONLY semantic | SP-4 / D-06 |
| 12 | `app/api/ai/consistency/[batchId]/route.test.ts` | CRITICAL SDK→SPEC translator (4 fixtures) + AC-30 stale window | AC-30 / D-34 / RESEARCH § Batch API Mechanics |
| 13 | `components/policy/PolicyAiDraftDialog.test.tsx` | `setContent(string)` no JSON.parse | AC-23 / D-28 |
| 14 | `app/(admin)/dashboard/consistency/page.test.tsx` | Mount-time resume 5 branches | AC-25 / D-30 / D-45 |

### Files modified (1)

- `lib/policies/transitions.test.ts` — APPEND-ONLY new `describe('publish — D-19 post-commit summary graceful-degrade (SP-3, SPEC R3)')` block at EOF with 3 `it()` stubs. Existing Phase 3 blocks (publish / editPublished / submitForReview / reject / archive / restore / approve) untouched.

## Acceptance Tests

```bash
$ pnpm typecheck     # exits 0 — clean TS compile
$ pnpm test          # RED state confirmed
```

### Test result baseline (RED-state)

```
Test Files  14 failed |  6 passed (20)
     Tests  55 failed | 92 passed (147)
```

**Failure breakdown (RED stub by file):**

| File | Failing tests | Notes |
|------|---------------|-------|
| `lib/ai/client.test.ts` | 3 | All 3 expect.fail stubs (singleton check fails because SUT missing) |
| `lib/ai/qa-parser.test.ts` | 3 | All expect.fail |
| `lib/ai/qa-extract.test.ts` | 3 | All expect.fail |
| `lib/ai/schemas.test.ts` | 5 | All expect.fail |
| `lib/ai/summary.test.ts` | 3 | All expect.fail |
| `lib/stripe/products.test.ts` | 6 | All expect.fail |
| `app/api/ai/draft/route.test.ts` | 5 | All expect.fail |
| `app/api/ai/summary/route.test.ts` | 3 | All expect.fail |
| `app/api/ai/qa/route.test.ts` | 3 | All expect.fail |
| `app/api/ai/consistency/route.test.ts` | 3 | All expect.fail |
| `app/api/ai/consistency/[batchId]/route.test.ts` | 7 | All expect.fail (4 translator + 2 stale-window + 1 completed) |
| `components/policy/PolicyAiDraftDialog.test.tsx` | 3 | 3 expect.fail (1 runtime-passing JSON.parse sanity test is GREEN — counted in 92 passing) |
| `app/(admin)/dashboard/consistency/page.test.tsx` | 5 | All expect.fail |
| `lib/policies/transitions.test.ts` (SP-3 block only) | 3 | All expect.fail (Phase 3 existing 16 publish/editPublished/.../approve tests STAY GREEN) |
| **Total RED** | **55** | matches vitest summary |

**Phase 3 GREEN preservation:**

- `lib/policies/transitions.test.ts`: 16 of 19 tests passing (16 Phase 3 + 3 new RED Phase 4 stubs)
- `lib/policies/state-machine.test.ts`: 24 of 24 passing
- `lib/auth/require-admin.test.ts`: passing
- `lib/auth/bootstrap-errors.test.ts`: passing
- `components/policy/PolicyEditor.test.tsx`: passing
- `tests/smoke.test.ts`: passing

`pnpm test lib/policies/` confirms: 40 passing / 3 failing (only the new SP-3 RED stubs fail; all Phase 3 transition tests stay GREEN — no regression).

### tsc baseline

`pnpm tsc --noEmit` exits 0 on every commit boundary (after Task 1, Task 2, Task 3, Task 4). No new TS errors introduced.

## Commits

| Task | Commit | Files | Description |
|------|--------|-------|-------------|
| 1 | `389ff6f` | 1 created (tests/ai-mocks.ts) | shared fixtures — closes RESEARCH Pitfall 6 |
| 2 | `e69b5f8` | 6 created (lib/ai/*.test.ts × 5 + lib/stripe/products.test.ts) | lib/* RED stubs — client + qa-parser + qa-extract + schemas + summary + stripe/products |
| 3 | `ed09815` | 5 created (app/api/ai/**/route.test.ts) | route RED stubs — 5 endpoints incl. translator fixtures |
| 4 | `13aa86c` | 2 created + 1 modified | component + page stubs + transitions.test.ts D-19 extension |

## Deviations from Plan

### Rule 3 — Auto-fix blocking issue (Task 2)

**1. [Rule 3 - TS module resolution] Variable-indirection in `lib/ai/client.test.ts`**
- **Found during:** Task 2 — first `pnpm tsc --noEmit` post-write
- **Issue:** TypeScript resolved the literal string `await import('@/lib/ai/client')` at compile time and emitted TS2307 "Cannot find module '@/lib/ai/client'" because Plan 04-04 hasn't created the SUT yet. The plan body's claim "TypeScript defers module resolution to runtime" is only true for **variable-indirected** dynamic imports.
- **Fix:** Introduced `const CLIENT_PATH = '@/lib/ai/client'` then `await import(CLIENT_PATH)`. TS module resolution skips string-from-variable dynamic imports. Plan 04-04 can drop the indirection once the SUT lands (or keep it — it's not load-bearing in the GREEN state).
- **Also fixed in same edit:** `beforeEach(() => vi.resetModules())` — vi.resetModules returns the entire VitestUtils object, which doesn't match `Awaitable<HookCleanupCallback>`. Wrapped in block body so the return value is `void`.
- **Files modified:** `lib/ai/client.test.ts` only
- **Commit:** `e69b5f8` (Task 2; pre-commit fix folded into the same staging block)

### Rule 3 — Auto-fix blocking issue (Task 3)

**2. [Rule 3 - Unused-import elision risk] Reference of `mockBatch` in [batchId]/route.test.ts**
- **Found during:** Task 3 (pre-emptive based on the test body shape)
- **Issue:** `[batchId]/route.test.ts` imports `mockBatch` from `@/tests/ai-mocks` but no `it()` block currently calls it (they're all `expect.fail` placeholders awaiting Plan 04-10). Future strict-mode lint configs (`isolatedModules`, `noUnusedLocals`) would flag the unused import. The import IS load-bearing for Plan 04-10 — leaving it unused would force a re-add.
- **Fix:** Added `const _fixtureRef = mockBatch; void _fixtureRef;` after the `vi.mock` block. This keeps the symbol live for TS without affecting runtime behavior. Plan 04-10 deletes both lines when it wires `mockBatch` into the translator fixture bodies.
- **Files modified:** `app/api/ai/consistency/[batchId]/route.test.ts` only
- **Commit:** `ed09815`

### Rule 3 — Auto-fix blocking issue (Task 3, second instance)

**3. [Rule 3 - vi.spyOn restore safety] try/finally around expect.fail in qa/route.test.ts**
- **Found during:** Task 3 — review of the Q&A PII-safe log test body
- **Issue:** The plan body sketch had `vi.spyOn(console, 'error').mockImplementation(...)` then `expect.fail(...)` then `consoleErrSpy.mockRestore()`. Because `expect.fail` throws, the `mockRestore()` line never runs — the spy leaks into subsequent tests in the same suite (cache-miss log test) AND any other test file that uses `console.error`.
- **Fix:** Wrapped the body in `try { expect.fail(...) } finally { consoleErrSpy.mockRestore(); }`. Plan 04-09 can keep or refactor — either way the spy is now leak-free.
- **Files modified:** `app/api/ai/qa/route.test.ts` only
- **Commit:** `ed09815` (folded into same Task 3 commit)

### Rule 3 — Auto-fix blocking issue (Task 4)

**4. [Rule 3 - @testing-library/react import elision] PolicyAiDraftDialog.test.tsx**
- **Found during:** Task 4 (per plan body alternate snippet at lines 707-731)
- **Issue:** The plan body had two variants of PolicyAiDraftDialog.test.tsx — one importing `userEvent` (not in package.json) and one stripped-down. Plan body recommends the stripped-down version; followed that recommendation.
- **Fix:** Used the second variant — no `@testing-library/react` or `userEvent` imports. The 1 runtime-passing negative-fixture sanity test (`JSON.parse('## Purpose\\n...')` throws SyntaxError) is the AC-23 (D-28) defense and runs immediately as GREEN. Plan 04-12 will add `@testing-library/react` imports + `render` calls when implementing the SUT.
- **Files modified:** `components/policy/PolicyAiDraftDialog.test.tsx`
- **Commit:** `13aa86c`

### Auth gates / Architectural changes / Bugs

None. No Rule 1 (bugs), no Rule 2 (missing critical functionality), no Rule 4 (architectural decisions) deviations occurred during this Wave-0 scaffold plan.

## Threat Surface Scan

No new threat-relevant surface introduced. All 14 files are test stubs that import from yet-to-exist SUT modules; they do not establish network endpoints, auth paths, file access patterns, or schema changes. The threat register entries T-04-03-MS (mockTextResponse helper closes RESEARCH Pitfall 6 — content array always populated) and T-04-03-HD (hoisted mock state — reset via vi.clearAllMocks in route.test.ts beforeEach) are both mitigated as planned.

## Known Stubs

All 14 net-new test files are stubs awaiting implementation. They are tracked in the plan's `<artifacts>` block and each downstream plan (04-04..04-14) drives the corresponding stub from RED → GREEN. This is INTENDED and is the Wave-0 contract — `nyquist_compliant: true` will flip to true at the end of Plan 04-14 when every task has its `<automated>` block tied to one of these stubs.

## Open Items for Downstream Plans

- **Plan 04-04** (`lib/ai/client.ts` + `lib/ai/schemas.ts`): Drives `lib/ai/client.test.ts` (3) + `lib/ai/schemas.test.ts` (5) RED→GREEN. Requires `CLIENT_OPTIONS` re-export for the maxRetries/timeout assertions per the test stubs.
- **Plan 04-05** (`lib/ai/qa-parser.ts` + `lib/ai/qa-extract.ts`): Drives 6 RED stubs.
- **Plan 04-06** (`lib/stripe/products.ts` + `lib/stripe/errors.ts`): Drives `lib/stripe/products.test.ts` (6) RED→GREEN.
- **Plan 04-08** (`app/api/ai/draft/route.ts` + `app/api/ai/summary/route.ts` + `lib/ai/summary.ts`): Drives 11 RED stubs.
- **Plan 04-09** (`app/api/ai/qa/route.ts`): Drives 3 RED stubs.
- **Plan 04-10** (`app/api/ai/consistency/route.ts` + `app/api/ai/consistency/[batchId]/route.ts`): Drives 10 RED stubs (incl. the 4 translator fixtures). Will also delete the `_fixtureRef` shim from `[batchId]/route.test.ts`.
- **Plan 04-11** (`lib/policies/transitions.ts` `publish` modification): Drives the 3 SP-3 D-19 RED stubs in the existing `lib/policies/transitions.test.ts`. Must add `vi.mock('@/lib/ai/summary', ...)` at the top of the file when implementing.
- **Plan 04-12** (`components/policy/PolicyAiDraftDialog.tsx`): Drives 4 RED stubs (3 expect.fail + 1 already-GREEN sanity test).
- **Plan 04-14** (`app/(admin)/dashboard/consistency/page.tsx`): Drives 5 RED stubs.

## Self-Check: PASSED

- [x] `tests/ai-mocks.ts` exists with `mockTextResponse` + `mockBatch` exports
- [x] All 14 net-new test file paths exist (verified via `node -e "for (const f of [...]) { if (!require('fs').existsSync(f)) ... }"`)
- [x] `lib/policies/transitions.test.ts` contains `describe('publish — D-19 post-commit summary graceful-degrade')` block
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm test` shows 55 failures (RED stubs as expected) + 92 passing (Phase 3 GREEN baseline + 1 sanity test preserved)
- [x] Phase 3 tests still pass — `pnpm test lib/policies/state-machine.test.ts lib/auth/bootstrap-errors.test.ts lib/auth/require-admin.test.ts components/policy/PolicyEditor.test.tsx tests/smoke.test.ts` all GREEN (verified inline via the 92-pass count + per-file file-failure list)
- [x] No prod-code modifications (only test files + tests/ai-mocks.ts helper)
- [x] No STATE.md / ROADMAP.md modifications (orchestrator owns those writes per the executor prompt)
- [x] Each task committed individually (4 commits: 389ff6f, e69b5f8, ed09815, 13aa86c)

All 14 new test files: PRESENT.
All 4 commits: PRESENT (verified via `git log --oneline -8`).
Phase 3 baseline: PRESERVED.

Wave-0 test scaffold complete. Plans 04-04..04-14 can now drive each stub from RED to GREEN.
