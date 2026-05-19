---
phase: 02
plan: 04
subsystem: data-layer
tags: [repositories, drizzle, rls, multi-tenancy, type-invariants]
requires:
  - 02-01  # OrgScope type + lib/db/scoped.ts + tests/types.ts
provides:
  - lib/db/repositories/policies.ts
  - lib/db/repositories/policy_versions.ts
  - lib/db/repositories/policy_assignments.ts
  - lib/db/repositories/acknowledgments.ts
  - lib/db/repositories/users.ts
  - lib/db/repositories/departments.ts
  - lib/db/repositories/ai_generations.ts
  - lib/db/repositories/notifications.ts
  - lib/db/repositories/workflow_stages.ts
affects:
  - tests/types.ts                  # D-07 type tests now resolve (closes Plan 02-01 Task 3 baseline failure)
  - pnpm tsc --noEmit               # exits 0 (was failing on the 5 errors from tests/types.ts)
tech-stack:
  added: []
  patterns:
    - "per-aggregate repository as a const X = {...} object literal"
    - "OrgScope-first method signature with eq(table.orgId, s.orgId) filter"
    - "Omit<typeof table.$inferInsert, ...> for INSERT input types"
    - "@ts-expect-error-via-tests/types.ts compile-time invariant locking (ADR-018 / ADR-005)"
key-files:
  created:
    - lib/db/repositories/policies.ts
    - lib/db/repositories/policy_versions.ts
    - lib/db/repositories/policy_assignments.ts
    - lib/db/repositories/acknowledgments.ts
    - lib/db/repositories/users.ts
    - lib/db/repositories/departments.ts
    - lib/db/repositories/ai_generations.ts
    - lib/db/repositories/notifications.ts
    - lib/db/repositories/workflow_stages.ts
  modified: []
decisions:
  - "Acknowledgments header switched from // line-comments to /** JSDoc block */ — TypeScript scans `//`-comments for @ts-expect-error directives and was treating the header phrase 'the @ts-expect-error assertions' as a real directive on the next line (TS2578). Block-comment headers are immune to this scanning. ADR-018 + 'append-only' substrings preserved verbatim — acceptance criteria still pass. Tracked as Rule-1 deviation below."
  - "All other 8 repository headers kept as // line-comments — none of them mention `@ts-expect-error` literally, so no directive collision."
  - "`listAll(s)` on each of the 9 aggregates ships a real body (the half of Plan 02-06's cross-org property test that asserts 'orgA sees orgA rows'). All other methods are stubs throwing `Error('Not yet implemented — Phase N')` per D-06 skeleton-with-minimum-bodies."
  - "Acknowledgments exports `listForUser` (not `listAll`) — the plan's Task 1 acceptance criterion required `listForUser` specifically; an org-wide list of all acknowledgments would be a very wide table at scale and is not in Plan 02-06's positive-control needs (the property test bypasses repositories for cross-org probes anyway and uses raw SQL via scope.tx)."
metrics:
  duration: "~4m15s (2026-05-17T14:26:23Z → 2026-05-17T14:30:38Z)"
  tasks_completed: 2
  commits: 2
  files_created: 9
  files_modified: 0
  lines_added: 351
  tsc_duration: "~2.7s clean exit"
  completed_at: "2026-05-17T14:30:38Z"
---

# Phase 2 Plan 04: Repository Skeletons — Summary

**One-liner:** Shipped 9 per-aggregate repository modules under `lib/db/repositories/` with OrgScope-first methods, ADR-018 + ADR-005 type-system invariants, and zero raw-`db` imports — closing the `tsc --noEmit` baseline failure that Plan 02-01 Task 3 deliberately left red.

## Scope

Created 9 repository files under `lib/db/repositories/` per L-03. Each module exports a per-aggregate `const X = {...}` whose methods take `OrgScope` first and apply `where(eq(table.orgId, s.orgId))` to every query (ADR-019 invariant enforced at the source). Phase 2 ships only the methods needed for (a) Plan 02-06's `scripts/check-rls.ts` positive-control half (`listAll(s)` on each aggregate, plus aggregate-specific helpers) and (b) the D-07 type-system invariants from ADR-018 (Acknowledgments has no `update`/`delete` keys, even as stubs) and ADR-005 (Policies.create input omits `tldrSummary`). All other methods are typed stubs that throw `Error('Not yet implemented — Phase N')` so a runtime call surfaces the gap.

## Outcomes

| Repository File | Exported Methods (`= real body` / `(stub)` / `(NO key)`) |
|-----------------|----------------------------------------------------------|
| `policies.ts` (`Policies`) | `listAll =`, `findById =`, `create (stub)`, `publish (stub)`, `archive (stub)` |
| `policy_versions.ts` (`PolicyVersions`) | `listAll =`, `listForPolicy =`, `create (stub)` |
| `policy_assignments.ts` (`PolicyAssignments`) | `listAll =`, `listForPolicy =`, `create (stub)` |
| `acknowledgments.ts` (`Acknowledgments`) | `listForUser =`, `record (stub)` · **NO `update`, NO `delete`** (ADR-018) |
| `users.ts` (`Users`) | `listAll =`, `findByClerkUserId =`, `create (stub)` |
| `departments.ts` (`Departments`) | `listAll =`, `create (stub)` |
| `ai_generations.ts` (`AiGenerations`) | `listAll =`, `record (stub)` |
| `notifications.ts` (`Notifications`) | `listAll =`, `listUnreadForUser =`, `create (stub)`, `markRead (stub)` |
| `workflow_stages.ts` (`WorkflowStages`) | `listAll =`, `listPendingForReviewer =`, `create (stub)` |

**Total:** 9 files / 351 lines.

### ADR-018 Invariant Confirmation (Acknowledgments append-only)

- `Acknowledgments` exports exactly two methods: `listForUser` (real body) and `record` (stub).
- It does **not** export `update`.
- It does **not** export `delete`.
- D-07's `tests/types.ts` lines 23 + 26 — `void Acknowledgments.update;` and `void Acknowledgments.delete;` — are both now compile errors successfully matching their `@ts-expect-error` directives. `tsc --noEmit` exits 0 (an unused `@ts-expect-error` would re-introduce a TS2578 error).
- Grep against the file: 0 occurrences of `^\s*(update|delete)\s*:` — verified during the Task 1 verify step.

### ADR-005 Invariant Confirmation (Policies.create omits tldrSummary)

- `Policies.create` signature uses exactly:
  ```typescript
  type PolicyCreateInput = Omit<
    typeof policies.$inferInsert,
    'orgId' | 'id' | 'tldrSummary' | 'createdAt' | 'updatedAt'
  >;
  ```
- D-07's `tests/types.ts` line 29 — `void Policies.create({} as any, { tldrSummary: 'x' });` — is a compile error successfully matching its `@ts-expect-error` directive.

### Pitfall 6 Confirmation (no raw `@/lib/db` import)

- Recursive grep across `lib/db/repositories/`: **zero** matches for `from\s+['"]@/lib/db['"](?![/A-Za-z])`.
- Each file imports only `@/lib/db/scoped` (for `OrgScope` type) and `@/lib/db/schema` (for its table object) plus `drizzle-orm` (for `and`, `eq`).
- Each file's header comment cites "RESEARCH Pitfall 6" — verified across all 9 files.
- The `scripts/check-db-imports.ts` allow-list (Plan 02-06) does NOT need to add `lib/db/repositories/` — repositories must remain disallowed.

### tsc Status

| Metric | Value |
|--------|-------|
| Before Plan 02-04 (baseline from Plan 02-01) | 5 errors in `tests/types.ts` (2 × TS2307 "Cannot find module" + 3 × TS2578 "Unused @ts-expect-error directive") |
| After Task 1 commit (4 repos: `2973555`) | 0 errors — `tests/types.ts` imports `Acknowledgments` + `Policies`, both shipped in Task 1 |
| After Task 2 commit (5 repos: `e71000a`) | 0 errors — full skeleton |
| `pnpm tsc --noEmit` runtime | ~2.7s (warm cache) |

## Files Created

```
lib/db/repositories/
├── acknowledgments.ts        51 lines  (listForUser, record stub; NO update, NO delete — ADR-018)
├── ai_generations.ts         25 lines  (listAll, record stub — Phase 4)
├── departments.ts            21 lines  (listAll, create stub — Phase 3+)
├── notifications.ts          41 lines  (listAll, listUnreadForUser, create + markRead stubs — Phase 7)
├── policies.ts               57 lines  (listAll, findById, create + publish + archive stubs; ADR-005 Omit)
├── policy_assignments.ts     36 lines  (listAll, listForPolicy, create stub — Phase 5)
├── policy_versions.ts        42 lines  (listAll, listForPolicy, create stub — Phase 3; D-02 cited)
├── users.ts                  40 lines  (listAll, findByClerkUserId, create stub — Phase 3+; D-03a cited)
└── workflow_stages.ts        38 lines  (listAll, listPendingForReviewer, create stub — Phase 3/6)
                             ───
                             351 lines
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Acknowledgments header switched from `//` line-comments to `/** */` JSDoc block**

- **Found during:** Task 1 verify (`pnpm tsc --noEmit` after writing the 4 files).
- **Issue:** The plan's literal source for `acknowledgments.ts` placed the phrase "the `@ts-expect-error` assertions that fail tsc" inside a `//` line-comment header. TypeScript scans `//` line-comments for directive tokens (`@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `@ts-check`). With `@ts-expect-error` appearing on header line 7, TypeScript interpreted it as a real directive applied to line 8 (the empty separator line), then errored TS2578 "Unused '@ts-expect-error' directive."
- **Fix:** Converted the entire `acknowledgments.ts` file header from `//` line-comments to a single `/** ... */` JSDoc block. TypeScript does not scan block comments for directive tokens, so the literal text is harmless inside `/** */`. The `@ts-expect-error` token is also explicitly wrapped in backticks (`` `@ts-expect-error` ``) for prose-correct formatting. All other acceptance substrings preserved verbatim: `ADR-018`, `append-only`, `Pitfall 6`, `raw \`db\``.
- **Files modified:** `lib/db/repositories/acknowledgments.ts` (header lines 1–14 only — function bodies untouched).
- **Commit:** `2973555` (Task 1 commit — fix folded into the initial file creation rather than a separate fix-up commit).
- **Verification:** `pnpm tsc --noEmit` exits 0 with the fix in place. Without the fix, tsc emitted TS2578 on line 7 of `acknowledgments.ts`.

**Why this counts as Rule 1 not Rule 4:** The plan's exact source intent — "header cites ADR-018 + cites the @ts-expect-error invariant" — is preserved. The only change is the comment style (block vs line). No architectural decision; pure mechanical fix for a TypeScript-directive-parser collision the plan author didn't anticipate. Acceptance criteria all still pass: the header cites ADR-018 (4 occurrences), the file has no `update`/`delete` keys (verified by grep), the file has no raw `db` import, etc.

### Architectural Deviations

None. The plan was executed exactly as written modulo the line→block comment fix above. No package adds. No schema changes. No new env vars. No changes to the locked architectural decisions.

### Authentication Gates

None encountered — Plan 02-04 is pure code-only work; no DB connection, no Clerk API call, no external service.

## Self-Check: PASSED

**Files exist:**
- `lib/db/repositories/policies.ts` → FOUND
- `lib/db/repositories/policy_versions.ts` → FOUND
- `lib/db/repositories/policy_assignments.ts` → FOUND
- `lib/db/repositories/acknowledgments.ts` → FOUND
- `lib/db/repositories/users.ts` → FOUND
- `lib/db/repositories/departments.ts` → FOUND
- `lib/db/repositories/ai_generations.ts` → FOUND
- `lib/db/repositories/notifications.ts` → FOUND
- `lib/db/repositories/workflow_stages.ts` → FOUND

**Commits exist (on main):**
- `2973555` (Task 1 — 4 critical repos) → FOUND in git log
- `e71000a` (Task 2 — remaining 5 repos) → FOUND in git log

**Acceptance criteria:**
- 9 of 9 repository files exist under `lib/db/repositories/` → PASS
- Each begins with `import 'server-only'` → PASS (9/9)
- Each imports `OrgScope` from `@/lib/db/scoped` and a table from `@/lib/db/schema` → PASS (9/9)
- No file imports raw `db` from `@/lib/db` (Pitfall 6) → PASS (0 violations)
- Each file's header cites RESEARCH Pitfall 6 → PASS (9/9)
- `Policies.create` input type uses `Omit<typeof policies.$inferInsert, ...>` and includes `'tldrSummary'` in the omit list → PASS
- `Acknowledgments` has NO `update` key and NO `delete` key → PASS (0 violations)
- `Acknowledgments` cites `ADR-018` (or `append-only`) in header → PASS (4 occurrences)
- `Acknowledgments` exports `listForUser` → PASS
- `Users` exports `findByClerkUserId` AND cites `D-03a` in header → PASS
- `PolicyVersions` cites `D-02` in header → PASS (2 occurrences)
- No `any` types in any of the 9 files → PASS (0 violations)
- `pnpm tsc --noEmit` exits 0 → PASS (~2.7s)
- Each of the 5 Task-2 files exports `listAll(s: OrgScope)` with a real body → PASS (5/5)

**Commits (final):**
- `2973555`: `feat(02-04): repositories — Policies + Acknowledgments + Users + PolicyVersions skeletons (D-06, ADR-018 type invariant)`
- `e71000a`: `feat(02-04): repositories — remaining 5 skeletons (PolicyAssignments + Departments + AiGenerations + Notifications + WorkflowStages); closes D-07 tsc gap`

## Downstream Impact

- **Plan 02-05** (Clerk webhook handler + middleware SF-M4 fold) now has the typed repository surface to import for app-side user-creation paths (the admin-invite flow in Phase 3 will route through `Users.create`; the webhook itself stays on raw `db` per ADR-023 allow-list entry #1).
- **Plan 02-06** (`scripts/check-rls.ts` + `scripts/check-db-imports.ts` + `verify:phase-2`) now has the positive-control surface: `Plan-02-06's RLS property test can call `Policies.listAll(s)` etc. inside `withOrgScope` to confirm "orgA sees orgA rows" — the negative-control half (cross-org probes) bypasses repositories and uses raw SQL via `scope.tx` per the L-06 spec.
- **Phase 3 (Admin UI)** will fill the Phase-3-stubbed bodies: `Policies.create`, `Policies.publish`, `Policies.archive`, `PolicyVersions.create`, `WorkflowStages.create` (Growth+ workflows), `Users.create` (admin invite), `Departments.create`. Method signatures are locked from this plan.
- **Phase 4 (AI Layer)** will fill `AiGenerations.record` and the Haiku-4.5 TL;DR pipeline that writes back to `policies.tldrSummary` (the field repositories' `create` types deliberately omit, per ADR-005).
- **Phase 5 (Employee Portal)** will fill `Acknowledgments.record`, `PolicyAssignments.create`.
- **Phase 7 (Crons + Email)** will fill `Notifications.create`, `Notifications.markRead`.

## Known Stubs

All non-`listAll` / non-`findBy*` / non-`listForUser` / non-`listForPolicy` / non-`listUnreadForUser` / non-`listPendingForReviewer` methods are intentional stubs throwing `Error('Not yet implemented — Phase N')`. Per D-06 (skeleton-with-minimum-bodies), Phase 2 ships only the methods needed by Plan 02-06's positive-control and the D-07 type invariants. Each stub's error message names the resolving phase:

- Phase 3 (Admin UI): `Policies.create`, `Policies.publish`, `Policies.archive`, `PolicyVersions.create`, `WorkflowStages.create`, `Departments.create`, `Users.create`
- Phase 4 (AI Layer): `AiGenerations.record`
- Phase 5 (Employee Portal): `Acknowledgments.record`, `PolicyAssignments.create`
- Phase 7 (Crons + Email): `Notifications.create`, `Notifications.markRead`

These are not stubs in the "missing data wiring breaks the user experience" sense — they're typed-but-unimplemented method signatures whose only runtime caller in Phase 2 is the type system. The verifier should NOT flag these as MVP-completion blockers; they are explicitly tracked here for Phase 3+ planners.

## Threat Flags

None. This plan adds no new network endpoints, no auth paths, no file-system access, no schema changes. Surface area expanded: 9 module exports in `lib/db/repositories/`, all already mitigated by the threat register's T-04-01..T-04-06 entries (Plan 02-06's L-05 import check + D-07 type tests + ADR-019 `where(eq(orgId))` pattern).
