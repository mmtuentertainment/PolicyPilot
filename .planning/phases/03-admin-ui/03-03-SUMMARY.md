---
phase: 03-admin-ui
plan: 03
subsystem: lib/policies (state-machine)
tags: [state-machine, pure-module, tdd, D-03, REQ-policy-lifecycle]
type: tdd
wave: 2
requires:
  - 03-01 (Phase 3 dev infrastructure: vitest + jsdom + server-only stub already in place)
provides:
  - lib/policies/state-machine.ts (D-03 source of truth)
  - canTransition / IllegalTransitionError / ALLOWED_TRANSITIONS / PolicyStatus
affects:
  - lib/policies/transitions.ts (Plan 03-06 consumer — orchestrators import canTransition + IllegalTransitionError)
  - components/policy/PolicyTransitionMenu.tsx (Plan 03-10 consumer — Client Component mirrors ALLOWED_TRANSITIONS for UX only)
tech-stack:
  added: []
  patterns:
    - "Pure module: no I/O, no DB, no server-only directive — testable in jsdom or node without setup"
    - "`as const` + `satisfies Record<...>` typing idiom locks the table shape at compile time"
    - "TDD RED→GREEN: RED commits failing tests (module-not-found is acceptable RED signal); GREEN commits implementation only"
key-files:
  created:
    - lib/policies/state-machine.ts
    - lib/policies/state-machine.test.ts
  modified: []
decisions:
  - "ALLOWED_TRANSITIONS encodes the locked DAG verbatim from 03-CONTEXT.md <specifics> § 2"
  - "No `'server-only'` directive on the pure module (genuine purity over defense-in-depth) — RESEARCH Pattern 2 explicit"
  - "16-case 4x4 truth-table written via cross-product complement rather than 9 hand-written forbidden cases — survives DAG amendments without test edits"
  - "IllegalTransitionError extends Error, carries from/to/name, message includes both status values + allowed-list (testable error message)"
metrics:
  duration: 3m5s
  started: 2026-05-19T18:49:08Z
  completed: 2026-05-19T18:52:13Z
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  deviations: 0
  commits: 2
---

# Phase 3 Plan 03: State Machine (D-03) Summary

**One-liner:** Pure `lib/policies/state-machine.ts` module + 24-case vitest suite — locks the policies-status DAG as the sole source of truth for Plan 03-06 (orchestrators) and Plan 03-10 (client transition menu); no DB, no server-only, no Drizzle import.

## Tasks Executed

| # | Task | Type | Commit | Status |
|---|------|------|--------|--------|
| 1 | RED — failing transition matrix tests | TDD RED | `2870da5` | passed (module-not-found is the RED signal) |
| 2 | GREEN — state machine implementation | TDD GREEN | `d1b7ce8` | passed (24/24 tests green, tsc clean) |

## TDD Cycle

### RED (`2870da5` — `test(03-03): RED — failing transition matrix tests`)

Wrote `lib/policies/state-machine.test.ts` BEFORE the implementation. Coverage:

- **16-case truth table**: explicitly enumerate the 7 legal transitions; iterate the 4×4 cross product and assert `false` for every cell NOT in the legal set (9 forbidden cells: 4 same-status round-trips — draft→draft, under_review→under_review, published→published, archived→archived — plus 5 cross-DAG forbidden hops: draft→archived, under_review→archived, published→under_review, archived→under_review, archived→published).
- **`ALLOWED_TRANSITIONS` shape**: assert all 4 status keys present; each per-status allow-list matches the locked DAG.
- **`IllegalTransitionError`**: subclass of `Error`, exposes `from` / `to` / `name`, message references both status values.

Expected RED state: `vitest` reported `Failed to resolve import "./state-machine"`. Exit non-zero. RED gate satisfied.

### GREEN (`d1b7ce8` — `feat(03-03): GREEN — state machine implementation`)

Wrote `lib/policies/state-machine.ts` pasted **verbatim** from 03-CONTEXT.md `<specifics>` § 2 (locked decision, no paraphrase). 40 lines total:

```typescript
export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';

export const ALLOWED_TRANSITIONS = {
  draft:        ['under_review', 'published'] as const,
  under_review: ['published', 'draft'] as const,
  published:    ['archived', 'draft'] as const,
  archived:     ['draft'] as const,
} satisfies Record<PolicyStatus, readonly PolicyStatus[]>;

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly PolicyStatus[]).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: PolicyStatus, public readonly to: PolicyStatus) {
    super(
      `Illegal policy transition: ${from} → ${to}. Allowed: ${ALLOWED_TRANSITIONS[from].join(', ')}`,
    );
    this.name = 'IllegalTransitionError';
  }
}
```

After GREEN landed: `pnpm vitest run lib/policies/state-machine.test.ts` → 24/24 pass; `pnpm tsc --noEmit` → exit 0.

No REFACTOR step needed — the implementation IS the locked decision; nothing to clean up.

## TDD Gate Compliance

| Gate | Commit | Verified |
|------|--------|----------|
| RED  | `2870da5` (`test(03-03): RED — failing transition matrix tests`) | yes — module-not-found, exit non-zero before implementation existed |
| GREEN | `d1b7ce8` (`feat(03-03): GREEN — state machine implementation`) | yes — 24/24 tests pass, tsc clean |
| REFACTOR | (omitted by design) | n/a — verbatim from locked CONTEXT specifics; no cleanup possible |

Sequence is correct: `test` commit precedes `feat` commit in git history.

## 16-Case Truth-Table Coverage

The cross-product describe block generates the 4×4 = 16 transition cells. 7 legal cells are explicitly listed in `LEGAL`; the iteration auto-generates `forbids` cases for the remaining 9 cells.

| From \ To       | draft | under_review | published | archived |
|-----------------|-------|--------------|-----------|----------|
| **draft**       | ❌ forbids | ✅ allows | ✅ allows | ❌ forbids |
| **under_review**| ✅ allows | ❌ forbids | ✅ allows | ❌ forbids |
| **published**   | ✅ allows | ❌ forbids | ❌ forbids | ✅ allows |
| **archived**    | ✅ allows | ❌ forbids | ❌ forbids | ❌ forbids |

- 7 ✅ cells = legal transitions explicitly listed in `LEGAL`
- 9 ❌ cells = 4 same-status round-trips + 5 cross-DAG forbidden hops

Plus 5 `ALLOWED_TRANSITIONS` shape tests + 3 `IllegalTransitionError` tests = **24 total vitest cases**.

## Verification (per plan `<verification>`)

| Command | Result |
|---------|--------|
| `pnpm vitest run lib/policies/state-machine.test.ts` | exit 0; 24/24 tests pass |
| `pnpm tsc --noEmit` | exit 0 |
| `pnpm verify:phase-3` | **deferred** — full Phase 3 gate runs at end of phase / wave 4; this plan ships the source primitive only. The plan's per-task verify (vitest + tsc) is the active gate. |

## Success Criteria (per plan `<success_criteria>`)

| Criterion | Status |
|-----------|--------|
| `ALLOWED_TRANSITIONS` encodes the locked DAG exactly | met — table matches 03-CONTEXT.md `<specifics>` § 2 byte-for-byte |
| `canTransition` truth table is comprehensive (4×4 grid, 16 cases, 7 legal, 9 forbidden) | met — 16 cells covered, 7 legal asserted true, 9 forbidden asserted false |
| `IllegalTransitionError` carries from/to/name and useful message | met — 3 tests verify subclass, fields, and message contents |
| Module is pure (no Drizzle / no DB / no `'server-only'`) | met — `grep -E "drizzle|@/lib/db"` returns no hits; no `import 'server-only'` |

## Deviations from Plan

None — plan executed exactly as written.

The implementation was pasted verbatim from the locked CONTEXT specifics block; the test file follows the pattern documented in 03-PATTERNS.md and the plan body's `<action>` block.

## Authentication Gates

None — pure unit-test work, no external services, no auth required.

## Stub Tracking

None — this plan introduces no UI surface and no data-rendering paths. The pure module is fully implemented (no placeholder values, no TODO stubs).

## Threat Flags

None — threat model in plan body lists T-03-03-01 (tampering — mitigated by full 4×4 truth-table coverage in tests) and T-03-03-02 (elevation — mitigated by server-side orchestrator authority per ADR-019 / Plan 03-06). Both mitigations are in scope here:

- **T-03-03-01 mitigation present**: any future amendment of `ALLOWED_TRANSITIONS` triggers test failure (the cross-product generator immediately re-asserts every cell).
- **T-03-03-02 mitigation present**: this module is library-only — `lib/policies/transitions.ts` (Plan 03-06) is the authoritative server gate; this module is its lookup table. Client components import for UX rendering only.

No new threat surface introduced (no I/O, no network, no DB).

## Deferred Issues

None — both tasks completed cleanly within the plan's scope.

## Self-Check

**Files created:**

- `lib/policies/state-machine.test.ts` — FOUND
- `lib/policies/state-machine.ts` — FOUND

**Commits:**

- `2870da5` (RED) — FOUND in `git log --all`
- `d1b7ce8` (GREEN) — FOUND in `git log --all`

## Self-Check: PASSED

All claims verified against disk + git log. Both files exist; both commits land on `gsd/phase-3-admin-ui` in correct RED→GREEN sequence.

---

*Plan 03-03 executed 2026-05-19T18:49:08Z → 2026-05-19T18:52:13Z (3m5s). 2 commits, 2 files created, 0 deviations, 0 auth gates.*
