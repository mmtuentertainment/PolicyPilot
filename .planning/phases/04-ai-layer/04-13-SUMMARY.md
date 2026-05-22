---
phase: 04-ai-layer
plan: 04-13
subsystem: admin-ui-ai
tags: [ai, consistency-check, admin-ui, server-component, polling, batch-jobs]
dependency_graph:
  requires:
    - 04-07  # BatchJobs.findLatestForOrg + requireAdminFromCtx
    - 04-10  # POST /api/ai/consistency + GET /api/ai/consistency/[batchId]
    - "03-09 (AdminSidebar shell)"
  provides:
    - "/dashboard/consistency admin page (Server Component shell with D-30 mount-time resume)"
    - "5 admin components: Runner, RunButton, FindingsList, EmptyState, FailureState"
    - "AdminSidebar Consistency Check nav entry"
  affects:
    - "components/admin/AdminSidebar.tsx — D-20 nav entry + isExactActive helper added"
tech_stack:
  added: []
  patterns:
    - "Server Component shell with 4-branch render based on DB state (D-30)"
    - "Client Component polling with useEffect + setInterval(30_000ms) (D-21)"
    - "Component-identity assertion via direct import in vitest Server Component tests (PATTERNS § No Analog Found 1762)"
    - "Hand-rolled severity-grouped Collapsible-style UI (D-23 — no shadcn install)"
key_files:
  created:
    - "app/(admin)/dashboard/consistency/page.tsx (111 lines)"
    - "components/admin/ConsistencyCheckRunner.tsx (158 lines)"
    - "components/admin/ConsistencyCheckRunButton.tsx (99 lines)"
    - "components/admin/ConsistencyFindingsList.tsx (175 lines)"
    - "components/admin/ConsistencyEmptyState.tsx (47 lines)"
    - "components/admin/ConsistencyFailureState.tsx (54 lines)"
  modified:
    - "app/(admin)/dashboard/consistency/page.test.tsx (5 RED stubs → 5 GREEN, 150 lines)"
    - "components/admin/AdminSidebar.tsx (+36/-2; D-20 nav entry + isExactActive helper)"
decisions:
  - "D-30 mount-time resume in page.tsx Server Component shell branches into 4 sub-trees from BatchJobs.findLatestForOrg result"
  - "D-21 30s polling interval named constant POLL_INTERVAL_MS = 30_000 with explicit guard against terminal-state polling"
  - "D-23 hand-rolled severity-grouped expand/collapse instead of shadcn Collapsible install (Set<string> of expanded IDs)"
  - "D-37 + D-45 auth gates (getOrgContext + requireAdminFromCtx) run OUTSIDE try/catch — typed errors propagate to Next.js boundary"
  - "Component-identity vitest assertions via direct import (more robust than .type.name string match)"
  - "isExactActive helper added in AdminSidebar to prevent both Dashboard AND Consistency Check from showing active simultaneously (Rule-1 deviation)"
metrics:
  duration: "~7m 24s (2026-05-22T00:10:47Z → 2026-05-22T00:18:11Z)"
  commits: 5
  files_created: 6
  files_modified: 2
  tests_red_to_green: 5
  tests_passing_total: 169
  completed: "2026-05-22"
---

# Phase 4 Plan 04-13: Consistency Check UI Surface Summary

**One-liner:** Shipped the `/dashboard/consistency` Server Component shell with D-30 mount-time resume branching into 4 sub-trees (EmptyState | Runner | FindingsList | FailureState), 5 admin components, and the D-20 sidebar nav entry — flipping Plan 04-03's 5 RED stub tests GREEN.

## Objective Met

Wave 3 closed: the `/dashboard/consistency` page reads `BatchJobs.findLatestForOrg` at mount and chooses ONE sub-tree based on the persisted batch status, satisfying AC-25 (mount-time resume from persisted Anthropic batch ID without resubmitting). The 30s polling Runner (D-21), severity-grouped Collapsible findings list (D-23), and AdminSidebar "Consistency Check" entry (D-20) all shipped per the plan.

## Tasks Executed

| Task | Name                                                                 | Commit    | Files                                                                                                                      |
| ---- | -------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2    | ConsistencyCheckRunButton — shared Client run-CTA                    | `2394800` | `components/admin/ConsistencyCheckRunButton.tsx` (created)                                                                 |
| 1    | EmptyState + FailureState + FindingsList                             | `a953465` | `components/admin/ConsistencyEmptyState.tsx`, `ConsistencyFailureState.tsx`, `ConsistencyFindingsList.tsx` (created)       |
| 3    | ConsistencyCheckRunner — 30s polling Client Component                | `5c29083` | `components/admin/ConsistencyCheckRunner.tsx` (created)                                                                    |
| 4    | Server Component shell page.tsx + drive page.test.tsx RED→GREEN      | `ea87cdb` | `app/(admin)/dashboard/consistency/page.tsx` (created); `page.test.tsx` (modified — 5 tests GREEN)                         |
| 5    | AdminSidebar — add Consistency Check nav entry                       | `034588a` | `components/admin/AdminSidebar.tsx` (modified +36/-2)                                                                      |
| 6    | Final verification — typecheck + page test + no Phase 3 regression   | (no-commit) | Verification-only — `pnpm tsc --noEmit` exits 0; 169/169 tests across 20 files pass                                       |

**Task execution order deviated from plan-order (1→2→3→4→5→6):** Task 2 ran BEFORE Task 1 because Task 1's EmptyState + FailureState components both import `ConsistencyCheckRunButton` (Task 2's output). Per Rule 3 (blocking issue — Task 1's `pnpm tsc --noEmit` verify would fail without Task 2's component existing), reordered to 2→1→3→4→5→6 so each commit independently typechecks clean. Plan body's task numbering is preserved in commit messages and this SUMMARY; only execution order shifted.

**Task 6 produced no commit:** the verification task had zero source modifications. Per GSD commit protocol ("If there are no changes to commit, do not create an empty commit"), Task 6 runs as a final verification gate documented in this SUMMARY rather than a separate empty commit.

## Files Shipped

**6 NEW files (6 components + 1 test file modified):**

1. **`app/(admin)/dashboard/consistency/page.tsx`** (111 lines) — Server Component shell. Calls `getOrgContext` + `requireAdminFromCtx` OUTSIDE any try/catch (per D-37) so typed errors propagate to the Next.js boundary. Reads `BatchJobs.findLatestForOrg` inside `withOrgScope` (RLS + app-layer `org_id` WHERE both fire). Branches into 4 sub-trees per D-30 mount-time resume contract.
2. **`components/admin/ConsistencyCheckRunner.tsx`** (158 lines) — `'use client'` Component with `useEffect` + `setInterval(POLL_INTERVAL_MS = 30_000ms)` polling `/api/ai/consistency/[batchId]`. AC-25 mount-time resume: receives persisted `anthropicBatchId` from the Server Component shell, polls existing batch without resubmitting. Terminal status clears interval and renders `ConsistencyFindingsList` / `ConsistencyFailureState` inline.
3. **`components/admin/ConsistencyCheckRunButton.tsx`** (99 lines) — Shared `'use client'` Component used by EmptyState ("Run consistency check") + FailureState ("Run again"). POSTs `/api/ai/consistency`; on 200 calls `router.refresh()` to flip the page tree; 403 shows "Upgrade to Growth →" copy; 503/other shows generic AI-unavailable copy.
4. **`components/admin/ConsistencyFindingsList.tsx`** (175 lines) — `'use client'` Component with severity-grouped (high → medium → low per SPEC R5) click-to-expand findings list. Hand-rolled per D-23 (no shadcn Collapsible install) — `useState<Set<string>>(new Set())` of expanded finding IDs. Defensive `Array.isArray` + severity-set guard against malformed Anthropic responses. T-04-13-DT mitigation: React text-node escape (no `dangerouslySetInnerHTML`).
5. **`components/admin/ConsistencyEmptyState.tsx`** (47 lines) — Server Component Card hosting the "Run consistency check" CTA (no batch_jobs row branch of D-30).
6. **`components/admin/ConsistencyFailureState.tsx`** (54 lines) — Server Component Card hosting the "Run again" CTA (status=failed branch of D-30).

**2 MODIFIED files:**

1. **`app/(admin)/dashboard/consistency/page.test.tsx`** (150 lines) — Drove Plan 04-03's 5 RED `expect.fail` stubs to 5 GREEN. Mocks `BatchJobs.findLatestForOrg`, `getOrgContext`, and `withOrgScope`; uses the REAL `requireAdminFromCtx` to exercise the non-admin 403 path. Component-identity assertions via direct import (`result.type === ConsistencyEmptyState`) instead of `.type.name` string match — more robust, clearer intent.
2. **`components/admin/AdminSidebar.tsx`** (+36/-2) — Added `ScanSearch` icon import, new `SidebarMenuItem` linking to `/dashboard/consistency`, doc-comment update noting the Phase 4 D-20 addition + threat-model T-04-13-IL acceptance. Rule-1 deviation: added `isExactActive` helper (see below).

## Branch Render Verification (4 branches via page.test.tsx)

| `findLatestForOrg` returns                                  | Server Component returns           | Assertion                                                    |
| ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `undefined`                                                 | `<ConsistencyEmptyState />`        | `result.type === ConsistencyEmptyState`                      |
| `{ status: 'in_progress', anthropicBatchId, createdAt }`    | `<ConsistencyCheckRunner ... />`   | `result.type === ConsistencyCheckRunner`; props.batchId match; props.startedAt is Date |
| `{ status: 'completed', resultJson }`                       | `<ConsistencyFindingsList ... />`  | `result.type === ConsistencyFindingsList`; props.result deep-equals fixture |
| `{ status: 'failed' }`                                      | `<ConsistencyFailureState />`      | `result.type === ConsistencyFailureState`                    |
| (auth: role='employee')                                     | THROWS `ForbiddenError`            | `Page()` rejects; `findLatestForOrg` NOT called (auth-fires-first) |

## Test Deltas

- **`app/(admin)/dashboard/consistency/page.test.tsx`**: 5 RED → 5 GREEN ✓
- **Full test suite regression**: 169/169 tests pass across 20 files (was 169/169 before Plan 04-13 — zero new failures, zero regressions, +5 newly-passing tests offset by removing the 5 `expect.fail` stubs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] AdminSidebar prefix-match isActive lit BOTH Dashboard AND Consistency Check active when on /dashboard/consistency**

- **Found during:** Task 5 (AdminSidebar modification)
- **Issue:** The Phase 3 `isActive(href)` helper uses `pathname === href || pathname.startsWith(${href}/)`. When user is on `/dashboard/consistency`, both `isActive("/dashboard")` AND `isActive("/dashboard/consistency")` evaluate to true — both nav entries would render with `aria-current="page"` and active styling. This is a latent issue exposed directly by Plan 04-13 introducing the first `/dashboard/*` sub-route (Phase 3 only had `/dashboard` as a leaf route).
- **Fix:** Added `isExactActive(href) => pathname === href` helper and switched only the Dashboard-root entry to use it. All other entries (Policies, Consistency Check, placeholders) keep the original prefix-match `isActive` so future sub-routes (e.g., `/policies/[id]`) continue to highlight their parent.
- **Files modified:** `components/admin/AdminSidebar.tsx`
- **Commit:** `034588a`

### Process Deviations (no Rule classification — workflow housekeeping)

**1. Task execution order shifted from 1→2→3→4→5→6 to 2→1→3→4→5→6**

- **Rationale:** Task 1 (EmptyState + FailureState + FindingsList) imports `ConsistencyCheckRunButton` from Task 2. Running Task 1 first would have left its `pnpm tsc --noEmit` verify gate failing because the imported component didn't yet exist. Per deviation Rule 3 (blocking issues — auto-resolve when the fix doesn't change scope), reordered execution so each per-task commit independently typechecks. Plan body's task numbering preserved in commit messages + this SUMMARY's Task table.

**2. Task 6 produced no commit**

- **Rationale:** Task 6 was a final verification gate (typecheck + page test + Phase 3 regression). Zero source modifications. Per GSD commit protocol ("If there are no changes to commit, do not create an empty commit"), recorded as a verification-only task in this SUMMARY rather than as an empty commit.

## Authentication Gates

None encountered during this plan. All file creation, typecheck, and test execution ran cleanly on the local dev environment.

## Threat Surface Scan

No new threat surface beyond what's already documented in the plan's `<threat_model>`:

- **T-04-13-EL** (non-admin elevation): mitigated by `requireAdminFromCtx` OUTSIDE try/catch (D-37 + D-45). Page test verifies the non-admin path throws `ForbiddenError` AND that `findLatestForOrg` is NOT called (auth fires first).
- **T-04-13-DV** (poll storm): mitigated by 30s `POLL_INTERVAL_MS` constant + D-34 25s server-side stale-window (Plan 04-10) + browser tab-inactive throttling.
- **T-04-13-DT** (XSS via finding.description): mitigated by React text-node escape. No `dangerouslySetInnerHTML` anywhere in `ConsistencyFindingsList.tsx`. Plain `<p>{f.description}</p>` rendering.
- **T-04-13-IL** (Starter sees sidebar entry — accepted): documented in sidebar code comment + Phase 6 sync-of-planTier deferral noted in the threat model.

## Known Stubs

None. All four branches of `/dashboard/consistency/page.tsx` wire real components reading real props from real DB data; no placeholder text, hardcoded empty arrays, or mock data sources. The findings-list "No contradictions or conflicts detected." copy is the legitimate empty-success state when a completed batch returns an empty findings array (not a stub).

## Self-Check

**Files exist:**

- ✓ `app/(admin)/dashboard/consistency/page.tsx`
- ✓ `app/(admin)/dashboard/consistency/page.test.tsx`
- ✓ `components/admin/ConsistencyCheckRunner.tsx`
- ✓ `components/admin/ConsistencyCheckRunButton.tsx`
- ✓ `components/admin/ConsistencyFindingsList.tsx`
- ✓ `components/admin/ConsistencyEmptyState.tsx`
- ✓ `components/admin/ConsistencyFailureState.tsx`
- ✓ `components/admin/AdminSidebar.tsx` (modified — D-20 nav entry visible)

**Commits exist (verified via `git log --oneline -5`):**

- ✓ `034588a` (Task 5) — AdminSidebar D-20 nav entry
- ✓ `ea87cdb` (Task 4) — page.tsx + page.test.tsx GREEN
- ✓ `5c29083` (Task 3) — ConsistencyCheckRunner
- ✓ `a953465` (Task 1) — EmptyState + FailureState + FindingsList
- ✓ `2394800` (Task 2) — ConsistencyCheckRunButton

**Plan verification block checks (from `<verification>`):**

- ✓ `pnpm tsc --noEmit` exits 0
- ✓ `pnpm test "app/(admin)/dashboard/consistency/page.test.tsx"` — 5 tests GREEN
- ✓ 6 new component files exist (Runner, RunButton, FindingsList, EmptyState, FailureState + page.tsx)
- ✓ `head -n 1 ConsistencyCheckRunner.tsx` returns `'use client';`
- ✓ `head -n 1 ConsistencyCheckRunButton.tsx` returns `'use client';`
- ✓ `head -n 1 ConsistencyFindingsList.tsx` returns `'use client';`
- ✓ `head -n 1 ConsistencyEmptyState.tsx` returns a comment (Server Component — NOT `'use client'`)
- ✓ `head -n 1 ConsistencyFailureState.tsx` returns a comment (Server Component — NOT `'use client'`)
- ✓ `grep -c "findLatestForOrg" page.tsx` returns 8 (≥1, includes doc-comment refs + code call — well-documented)
- ✓ `grep -c "requireAdminFromCtx" page.tsx` returns 8 (≥1, includes doc-comment refs + import + call)
- ✓ `grep -c "/dashboard/consistency" AdminSidebar.tsx` returns 6 (≥1, includes isActive checks + href + comment)
- ✓ `grep -c "setInterval" ConsistencyCheckRunner.tsx` returns 1
- ✓ `grep -c "30_000" ConsistencyCheckRunner.tsx` returns 1 (in `POLL_INTERVAL_MS` named constant)

## Self-Check: PASSED

All file-existence, commit-existence, and plan-verification-block checks verified. Plan 04-14 can now proceed with end-to-end UAT against the live Consistency Check surface.
