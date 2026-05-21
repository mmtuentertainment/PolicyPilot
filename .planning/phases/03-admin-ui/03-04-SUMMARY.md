---
phase: 03-admin-ui
plan: 04
subsystem: data-access
tags: [repositories, drizzle, orgscope, L-05, D-11, ADR-018-spirit, ADR-023, ADR-025]
status: complete
completed: 2026-05-19
requires:
  - 03-01 (Phase 3 verify harness — vitest.config.ts, check-admin-routes.ts, verify:phase-3 orchestrator)
  - 02-04 (Phase 2 repository skeletons + tests/types.ts D-07 invariants)
  - 02-05 (Phase 2 schema with D-02 org_id denormalization)
provides:
  - Policies.create / findById / listAll / listWithFilters / updateDraft / incrementVersion / statusCounts
  - PolicyVersions.create / listAll / listForPolicy / findByVersionNumber (append-only)
  - WorkflowStages.recordSubmission / recordDecision / listForPolicy (+ existing listAll/listPendingForReviewer)
  - tests/types.ts L-05 type-system guards (PolicyVersions.update/.delete must not exist)
affects:
  - lib/policies/transitions.ts (Plan 03-06) — calls these repositories inside withOrgScope
  - app/(admin)/policies/page.tsx (Plan 03-11) — Policies.listWithFilters
  - app/(admin)/dashboard/page.tsx (Plan 03-11) — Policies.statusCounts
  - app/(admin)/policies/new/actions.ts (Plan 03-07) — Policies.create
  - app/(admin)/policies/[id]/actions.ts (Plan 03-07) — Policies.updateDraft + PolicyVersions.create + WorkflowStages.recordSubmission
tech-stack:
  added: []
  patterns:
    - "OrgScope-first repository methods (ADR-023; reuses Phase 2 pattern from users.ts/acknowledgments.ts)"
    - "Drizzle ilike + and(...conditions) + or(...) for parameterized search (T-03-04-02)"
    - "Inverted-polarity @ts-expect-error type guards for append-only invariants (L-05 / ADR-018-spirit)"
    - "SQL aggregate via sql<number>`cast(count(*) as int)` for /dashboard tiles"
key-files:
  created: []
  modified:
    - lib/db/repositories/policies.ts
    - lib/db/repositories/policy_versions.ts
    - lib/db/repositories/workflow_stages.ts
    - tests/types.ts
decisions:
  - "PolicyCreateInput now Omits status + currentVersion in addition to tldrSummary — both are lifecycle invariants the repository sets, not caller inputs."
  - "Removed Phase-2 publish/archive throw stubs from Policies — Plan 03-06 transition orchestrators own those lifecycle moves directly via s.tx.update + PolicyVersions.create inside withOrgScope (matches plan body's stated intent)."
  - "WorkflowStages column adaptation: schema has stageOrder/reviewedAt, not stageName/completedAt. Mapped stageName='review' to stageOrder=1, completedAt to reviewedAt. No migration in this plan — flagged as Phase 3.1 follow-up if multi-stage workflows ship."
  - "listForPolicy on workflow_stages orders by stageOrder DESC (no createdAt column on this table)."
metrics:
  tasks_completed: 2
  files_modified: 4
  commits: 2
  duration_minutes: ~25
  verification_runs:
    - "pnpm tsc --noEmit (exit 0)"
    - "pnpm check:db-imports (3 allow-listed, 0 violations)"
    - "pnpm check:rls (positive control passed)"
    - "pnpm check:admin-routes (OK)"
    - "pnpm check:artifacts (234/234)"
    - "pnpm test (29/29)"
    - "pnpm verify:phase-3 (exit 0 — full orchestrator)"
---

# Phase 03 Plan 04: Repository Bodies — Policies + PolicyVersions + WorkflowStages Summary

Filled the three Phase-2-stubbed repository bodies for the Phase 3 aggregates (D-11). All bodies wrap `OrgScope` (no raw `@/lib/db` imports), `PolicyVersions` is type-system-locked append-only via L-05, and `tests/types.ts` now carries the inverted-polarity guards. This is the data-layer bedrock for Plan 03-06's transition orchestrators and Plan 03-11's admin pages.

## Commits

| # | Hash      | Type | Files                                                                                 | Description |
| - | --------- | ---- | ------------------------------------------------------------------------------------- | ----------- |
| 1 | `89634d3` | feat | `lib/db/repositories/policies.ts`                                                     | Fill Policies repository body (D-11) — 7 methods; remove publish/archive stubs |
| 2 | `8c3a2a6` | feat | `lib/db/repositories/policy_versions.ts`, `lib/db/repositories/workflow_stages.ts`, `tests/types.ts` | PolicyVersions append-only (L-05) + WorkflowStages body + L-05 type guards |

## Methods Shipped

### Policies (7 methods — `lib/db/repositories/policies.ts`)

| Method | Signature | Purpose |
| ------ | --------- | ------- |
| `listAll(s)` | unchanged from Phase 2 | All org policies (Plan 02-06 cross-org positive control) |
| `findById(s, id)` | unchanged from Phase 2 | Single policy by id, scoped by orgId |
| `create(s, input)` | filled — sets orgId, createdBy=s.userId, status='draft', currentVersion=1 | New draft policy. PolicyCreateInput Omits orgId/id/tldrSummary/currentVersion/status/createdAt/updatedAt. |
| `listWithFilters(s, { q, status })` | new | Admin library search: WHERE = eq(orgId) + optional eq(status) + optional ilike(title)/ilike(category). ORDER BY updatedAt DESC. LIMIT 100 (D-05 / T-03-04-05). |
| `updateDraft(s, id, patch)` | new | In-place draft edit. Updates {title?, category?, contentJson?} + bumps updatedAt. NO status change (state machine owns transitions). |
| `incrementVersion(s, id)` | new | Atomic UPDATE: `currentVersion = currentVersion + 1`. Returns new value. Used by Plan 03-06 edit-published orchestrator. |
| `statusCounts(s)` | new | GROUP BY status, zero-filled into `{ draft, under_review, published, archived }`. Feeds /dashboard tiles. |

### PolicyVersions (4 methods — `lib/db/repositories/policy_versions.ts`)

| Method | Signature | Purpose |
| ------ | --------- | ------- |
| `listAll(s)` | unchanged from Phase 2 | Org-wide version cross-section |
| `create(s, { policyId, versionNumber, contentJson, createdBy, changeSummary? })` | filled — stamps s.orgId (D-02 denormalization invariant) | Append a new version row. |
| `listForPolicy(s, policyId)` | new | Version history ordered by versionNumber DESC. Feeds `<PolicyVersionHistory />` (Plan 03-10). |
| `findByVersionNumber(s, policyId, versionNumber)` | new | Look up the version row an acknowledgment points at. |

**L-05 invariant:** NO `update`, NO `delete`. Code comment + tests/types.ts `@ts-expect-error` rows enforce.

### WorkflowStages (5 methods — `lib/db/repositories/workflow_stages.ts`)

| Method | Signature | Purpose |
| ------ | --------- | ------- |
| `listAll(s)` | unchanged from Phase 2 | Phase 2 cross-org positive control |
| `listPendingForReviewer(s, reviewerId)` | unchanged from Phase 2 | Reviewer queue (Phase 6 surface) |
| `recordSubmission(s, policyId, reviewerId)` | new — replaces Phase-2 `create` throw stub | INSERT `{ orgId, policyId, stageOrder: 1, reviewerId, status: 'pending' }`. Written when a draft enters under_review. reviewerId nullable per schema (Starter passes null; Growth+ assigns a uuid). |
| `recordDecision(s, stageId, decision, comment?)` | new | UPDATE status, comment, reviewedAt=now(). WHERE orgId+id (T-03-04-04 mitigation). |
| `listForPolicy(s, policyId)` | new | Workflow trail ordered by `stageOrder DESC`. |

## tests/types.ts Extension

Two new `@ts-expect-error` rows appended (after the Phase 2 block):

```typescript
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';

// @ts-expect-error — PolicyVersions must not expose `update` (L-05 / ADR-018-spirit)
void PolicyVersions.update;
// @ts-expect-error — PolicyVersions must not expose `delete` (L-05 / ADR-018-spirit)
void PolicyVersions.delete;
```

These directives FIRE (i.e., suppress the expected error) as long as `PolicyVersions` lacks `update`/`delete`. If a future commit adds either key, `tsc` will report "Unused @ts-expect-error directive" and fail the build.

Total `@ts-expect-error` invariants in `tests/types.ts` now: **5** (3 Phase-2 + 2 Phase-3 L-05).

## Verification (all green)

```
pnpm tsc --noEmit              exit 0
pnpm check:db-imports          OK — 3 allow-listed @/lib/db imports, 0 violations
pnpm check:rls                 OK — L-06: 10 tables RLS-isolated; positive control passed
pnpm check:admin-routes        OK
pnpm check:artifacts           234/234 passed (incl. 5 Phase-2 ADR-005/018 invariants + tests/types.ts D-07 row counts)
pnpm test                      29/29 passed (smoke + state-machine + require-admin)
pnpm verify:phase-3            exit 0 (full orchestrator chain)
```

## Threat Model Status

| Threat ID | Disposition | Realized Mitigation |
| --------- | ----------- | ------------------- |
| T-03-04-01 (Information Disclosure — cross-org leak) | mitigate | Every method's WHERE includes `eq(table.orgId, s.orgId)`. `check:rls` cross-org positive control confirms isolation at the DB layer too. |
| T-03-04-02 (Tampering — SQL injection via ilike) | mitigate | Drizzle parameterizes `ilike(col, ${pattern})` as a bind variable; the `q` user input never enters as raw SQL. |
| T-03-04-03 (Elevation of Privilege — L-05 regression) | mitigate | tests/types.ts `@ts-expect-error` rows guard PolicyVersions.update/.delete absence. tsc fails the build if either is ever added. |
| T-03-04-04 (Tampering — mass cross-tenant UPDATE) | mitigate | `updateDraft`, `incrementVersion`, `recordDecision` all WHERE on `and(eq(orgId), eq(id))` — no id-only mutations. |
| T-03-04-05 (Information Disclosure — large result leak) | accept | `listWithFilters` hard-LIMIT 100. UI footer (Plan 03-11) informs operator to refine. SMB scale (<500 policies/org) makes overflow unlikely. |

No new threat flags introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue: schema column mismatch] WorkflowStages column adaptation**
- **Found during:** Task 2 (writing workflow_stages.ts)
- **Issue:** Plan body's `recordSubmission` referenced `stageName: 'review'`; plan body's `recordDecision` referenced `completedAt: now()`. The on-disk `lib/db/schema.ts` `workflowStages` table has **no `stageName` and no `completedAt` columns** — it has `stageOrder: integer notNull` and `reviewedAt: timestamp`.
- **Plan authorization:** The plan body's `<action>` for Task 2 explicitly authorizes this: *"If schema doesn't have one of these columns, ADAPT (do not add migration in this plan — flag in SUMMARY as a Phase 3.1 follow-up)."*
- **Fix:**
  - `stageName: 'review'` → `stageOrder: 1` (single review stage today; multi-stage Growth+ workflows will bump the order if introduced)
  - `completedAt: sql\`now()\`` → `reviewedAt: sql\`now()\`` (same lifecycle slot)
  - `listForPolicy` ordering: plan body said `createdAt DESC`, but `workflowStages` has no `createdAt` either — I used `stageOrder DESC` (canonical sequencing field on this table).
- **Files modified:** `lib/db/repositories/workflow_stages.ts`
- **Commit:** `8c3a2a6`
- **Phase 3.1 follow-up:** If multi-stage workflows arrive in Phase 6, add a text `stageName` migration and update this repository.

**2. [Rule 3 — Blocking issue: false-positive on grep -L comment] Tighten Pitfall 6 comment phrasing**
- **Found during:** Task 1 (running plan's `grep -L "from '@/lib/db'"` acceptance check)
- **Issue:** The Phase-2 header comment in `policies.ts` literally read `MUST NOT import \`db\` from '@/lib/db'`. The plan's literal `grep -L` text check would falsely fail because the *text* `from '@/lib/db'` was present in a comment (not an import).
- **Fix:** Rephrased the comment to `MUST NOT import the raw \`db\` barrel.` — same educational intent, no false positive on the grep gate.
- **Note:** The authoritative gate is `scripts/check-db-imports.ts` (AST-based), which always identified this file correctly as a non-importer; this tweak just keeps the literal grep acceptance check honest.
- **Files modified:** `lib/db/repositories/policies.ts`
- **Commit:** Folded into `89634d3` (Task 1 commit).

### Sequencing decision (explicit in plan body)

The plan body's Task 1 acceptance criteria appended L-05 `@ts-expect-error` rows for `PolicyVersions.update`/`.delete` to `tests/types.ts`. Doing this BEFORE Task 2 would have left tsc red because `PolicyVersions.update`/`.delete` did not yet exist (the directives REQUIRE the methods to be absent — which they were in the Phase 2 skeleton too, but the imported module had no `update`/`delete` keys and the directives would FIRE correctly). On re-reading I found that the plan body explicitly authorizes the executor's sequencing choice: *"Or sequence Task 1 and Task 2 as one commit at the executor's discretion."* I chose to commit them as two commits keyed to the actual file groupings:

- Commit 1 (`89634d3`): `policies.ts` only — tsc stays green (no `tests/types.ts` change yet).
- Commit 2 (`8c3a2a6`): `policy_versions.ts` + `workflow_stages.ts` + `tests/types.ts` together — the new L-05 directives land alongside the repository that they guard.

Both commits keep tsc, check:db-imports, and verify:phase-3 green; no intermediate red state was committed. This sequencing matches the plan's stated executor-discretion clause.

## Known Stubs

None introduced by this plan. The PolicyAssignments repository remains as a Phase-2 stub (out of scope per D-11: Phase 5 owns the assignment surface).

## Success Criteria Confirmed

- [x] All three repositories shipped with real bodies; Phase 2 throw-stubs gone (verified: `grep -c "throw new Error('Not yet implemented" lib/db/repositories/{policies,policy_versions,workflow_stages}.ts` → 0/0/0)
- [x] L-05 enforced by `tests/types.ts` — `PolicyVersions.update` and `.delete` guarded
- [x] No raw `@/lib/db` import added — `pnpm check:db-imports` returns 0 violations
- [x] `listWithFilters` supports the `q + status` URL-state pattern Plan 03-11 needs
- [x] `statusCounts` feeds /dashboard tiles (Plan 03-11)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm verify:phase-3` exits 0 — 234 artifact assertions + 29 tests all green
- [x] SUMMARY.md at `.planning/phases/03-admin-ui/03-04-SUMMARY.md` (this file)
- [x] STATE.md and ROADMAP.md NOT modified (executor responsibility — orchestrator will update)

## Self-Check: PASSED

Files verified:
- `lib/db/repositories/policies.ts` — FOUND (modified, commit `89634d3`)
- `lib/db/repositories/policy_versions.ts` — FOUND (modified, commit `8c3a2a6`)
- `lib/db/repositories/workflow_stages.ts` — FOUND (modified, commit `8c3a2a6`)
- `tests/types.ts` — FOUND (modified, commit `8c3a2a6`)
- `.planning/phases/03-admin-ui/03-04-SUMMARY.md` — FOUND (this file)

Commits verified in `git log`:
- `89634d3` — FOUND (`feat(03-04): fill Policies repository body (D-11)`)
- `8c3a2a6` — FOUND (`feat(03-04): PolicyVersions append-only (L-05) + WorkflowStages body + L-05 type guards`)
