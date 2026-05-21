---
phase: 03-admin-ui
plan: 06
subsystem: transitions
tags: [orchestrators, transitions, withOrgScope, D-03, D-04, L-05, tdd, ADR-018-spirit]
status: complete
completed: 2026-05-19
requires:
  - 03-03 (state-machine — canTransition + IllegalTransitionError)
  - 03-04 (Policies + PolicyVersions + WorkflowStages repository bodies)
  - 02-01 (withOrgScope + getOrgContext + Drizzle schema)
provides:
  - "lib/policies/transitions.ts: 7 server-only orchestrators (submitForReview, approve, reject, publish, archive, restore, editPublished)"
  - "Authoritative transactional gate for every policy state change — Plan 03-07 Server Actions are thin wrappers"
  - "D-04 snapshot semantics: PolicyVersions.create on publish + editPublished + approve"
  - "L-05 invariant respected at the call-site: only PolicyVersions.create is invoked (repository doesn't even expose update/delete)"
affects:
  - "app/(admin)/policies/[id]/actions.ts (Plan 03-07) — Server Action wrappers import the 7 orchestrators"
  - "components/policy/PolicyTransitionMenu.tsx (Plan 03-10) — triggers transitions through Plan 03-07 actions"
  - "policy_versions table (D-04) — new rows on publish + editPublished + approve only"
tech-stack:
  added: []
  patterns:
    - "Orchestrator-per-transition + shared loadAndAssertTransition helper (canTransition gate)"
    - "Single-transaction snapshot-and-flip via withOrgScope + s.tx.update (T-03-06-02 mitigation)"
    - "Belt-and-suspenders source-status check in editPublished (T-03-06-04 mitigation)"
    - "approve() delegates to publish() — Phase 6 will split the gating without modifying the snapshot logic"
    - "TDD: RED (failing test) → GREEN (implementation) in two atomic commits"
key-files:
  created:
    - lib/policies/transitions.ts
    - lib/policies/transitions.test.ts
  modified: []
decisions:
  - "approve() implemented as a thin delegate to publish() (same draft|under_review → published snapshot semantics). Plan body's `publishCommon` indirection collapsed to a direct call — same single-source-of-truth outcome, fewer lines. Phase 6 tier-gating will inject its check at approve() before the delegate; publish() will keep the Starter-direct path unchanged."
  - "loadAndAssertTransition helper takes typed OrgScope (not `s as any`) — uses the exported `OrgScope` type from @/lib/db/scoped directly. Avoids the plan body's escape-hatch cast and keeps tsc strict."
  - "editPublished keeps the belt-and-suspenders `policy.status !== 'published'` check even though canTransition('draft', 'draft') already rejects same-state. Rationale (per plan + threat register T-03-06-04): canTransition('under_review', 'draft') returns true (the reject path), so an editPublished call originating from an under_review policy would otherwise create a phantom version row. The explicit check makes editPublished the published-only entry point."
  - "Tests use vi.mock for @/lib/db/schema's `policies` table object (stub) — without this, transitions.ts's `import { policies } from '@/lib/db/schema'` would pull the real Drizzle table object, which imports postgres at module load and breaks vitest's jsdom env."
metrics:
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  commits: 2
  total_lines: 496
  test_count: 14
  duration_minutes: ~10
  verification_runs:
    - "pnpm vitest run lib/policies/transitions.test.ts (14/14 green)"
    - "pnpm test (43/43 green, 4 files)"
    - "pnpm tsc --noEmit (exit 0)"
    - "pnpm check:db-imports (3 allow-listed, 0 violations — transitions.ts not in ALLOWLIST)"
    - "pnpm verify:phase-3 (full orchestrator: typecheck + check:db-imports + check:rls + check:admin-routes + check:artifacts 234/234 + test 43/43, exit 0)"
---

# Phase 03 Plan 06: Transition Orchestrators (D-03 + D-04 + L-05) Summary

Server-only orchestrators for the 7 policy state transitions. These are the AUTHORITATIVE gate for every policy state change — Plan 03-07's Server Actions are thin wrappers around them, Plan 03-10's `PolicyTransitionMenu` renders the allowed-from-current-status moves, but the transactional snapshot-and-flip logic lives here, in one place, inside one `withOrgScope` per call.

TDD: failing tests committed first (`563449b`), implementation committed second (`9c24557`). RED → GREEN, no refactor commit (the implementation matched the test contract first pass).

## Commits

| # | Hash      | Type | Files                              | Description |
| - | --------- | ---- | ---------------------------------- | ----------- |
| 1 | `563449b` | test | `lib/policies/transitions.test.ts` | RED — orchestrator tests for publish/editPublished + 5 simpler transitions |
| 2 | `9c24557` | feat | `lib/policies/transitions.ts`      | GREEN — 7 transition orchestrators (D-03 + D-04 + L-05) |

## Orchestrators Shipped

All 7 functions are `async (...) => Promise<void>`, all wrap `withOrgScope(ctx, async (s) => { ... })`, all delegate the canTransition gate to a shared `loadAndAssertTransition` helper.

| Function                                                     | Source statuses → target | Side effects                                                              |
| ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------- |
| `submitForReview(policyId, reviewerId \| null)`              | `draft → under_review`   | `WorkflowStages.recordSubmission` + status flip                           |
| `approve(policyId)`                                          | `under_review → published` | Delegates to `publish(policyId)` — same snapshot semantics              |
| `reject(policyId, reason?)`                                  | `under_review → draft`   | Status flip only (D-04: no version row on reject)                         |
| `publish(policyId)`                                          | `draft \| under_review → published` | `PolicyVersions.create(currentVersion, contentJson, createdBy=userId)` THEN status flip |
| `archive(policyId)`                                          | `published → archived`   | Status flip only                                                          |
| `restore(policyId)`                                          | `archived → draft`       | Status flip only (admin must edit + republish for v(N+1))                 |
| `editPublished(policyId, newContent, changeSummary?)`        | `published → draft`      | Snapshots PRIOR `(versionNumber, contentJson, changeSummary)` THEN overwrite content + status='draft' + currentVersion+1 |

### Snapshot Semantics (D-04 + L-05)

**`publish(policyId)`** — the as-published vN row is created BEFORE the status flip:

```typescript
await PolicyVersions.create(s, {
  policyId: policy.id,
  versionNumber: policy.currentVersion,   // the value being snapshotted
  contentJson: policy.contentJson,         // about-to-be-published content
  createdBy: s.userId,
});
await s.tx
  .update(policies)
  .set({ status: 'published', updatedAt: sql`now()` })
  .where(eq(policies.id, policyId));
```

`currentVersion` stays put — the just-snapshot value IS vN; the next edit-published will bump to v(N+1). Both operations run inside one `withOrgScope` transaction — partial state impossible (T-03-06-02 mitigation).

**`editPublished(policyId, newContent, changeSummary?)`** — preserves the as-of-publish vN snapshot BEFORE overwriting:

```typescript
await PolicyVersions.create(s, {
  policyId: policy.id,
  versionNumber: policy.currentVersion,    // captures the STILL-PUBLISHED version
  contentJson: policy.contentJson,          // captures the STILL-PUBLISHED content
  createdBy: s.userId,
  changeSummary,                            // optional admin copy
});
await s.tx
  .update(policies)
  .set({
    contentJson: newContent,
    status: 'draft',
    currentVersion: policy.currentVersion + 1,
    updatedAt: sql`now()`,
  })
  .where(eq(policies.id, policyId));
```

The prior published version row remains intact — that's what `acknowledgments.policy_version_id` FKs point at (Phase 5). The new edit becomes a Draft with the next version number; the next `publish()` call writes v(N+1) and flips status back to Published.

## Defense-in-Depth Layers (per transition)

Every orchestrator path triggers all three gates. Removing any ONE leaves the other two; corrupting any one is caught by tests + scripts:

| Layer             | Where                                                                  | Catches                                                |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| State machine     | `loadAndAssertTransition` → `canTransition(from, to)`                  | Illegal status moves (archived→published, etc.)         |
| Repository orgId  | `Policies.findById` WHERE org_id + id; `s.tx.update(policies).where(eq(id))` inside scope | Cross-org policy mutation (T-03-06-03)                  |
| Postgres RLS      | `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` inside `withOrgScope` (Plan 02-01 / ADR-025) | Cross-org bypass even if app forgot WHERE              |

The L-05 invariant adds a fourth structural layer at the type level: `PolicyVersions` doesn't even export `update` / `delete`, so orchestrators CANNOT accidentally mutate prior version rows. `tests/types.ts` `@ts-expect-error` directives (Plan 03-04) make any future addition a tsc failure.

## Threat Register Mitigations (from plan)

| Threat ID | Disposition | How this plan mitigates                                                                                                  |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| T-03-06-01 (EoP — illegal transition slip) | mitigate | `loadAndAssertTransition` is called by every orchestrator before any side-effect; cannot be bypassed without breaking a unit test |
| T-03-06-02 (Integrity — partial snapshot/flip) | mitigate | All side-effects inside one `withOrgScope` = one Postgres transaction; failure rolls back BOTH the snapshot and the status update |
| T-03-06-03 (InfoDisc — cross-org mutation) | mitigate | `Policies.findById` (repository) + `s.tx.update(policies).where(eq(policies.id, ...))` both run inside `withOrgScope` → RLS evaluates against the actual `ctx.orgId` at the DB layer |
| T-03-06-04 (Tampering — phantom editPublished version row) | mitigate | Explicit `if (policy.status !== 'published') throw IllegalTransitionError` — tested via the `draft → draft` case; rejects the `under_review → draft` overlap that canTransition would otherwise allow |
| T-03-06-05 (Repudiation — lost status-change provenance) | accept | `policy_versions` rows on publish/editPublished/approve carry `createdBy = s.userId`. Phase 3 ships the version trail; Phase 8 audit trail covers status-change events more broadly |

## Test Coverage (14 tests across 6 describe blocks)

- **publish (4 tests)** — empty findById throws "Policy not found"; archived→published throws IllegalTransitionError; D-04 snapshot semantics (PolicyVersions.create with currentVersion + contentJson before flip); under_review→published legal.
- **editPublished (2 tests)** — IllegalTransitionError when status≠published; snapshots prior content + resets status + bumps version + carries `changeSummary`.
- **submitForReview (2 tests)** — archived rejected; draft→under_review writes WorkflowStages.recordSubmission AND flips status.
- **reject (2 tests)** — under_review→draft legal; same-state (draft→draft) forbidden.
- **archive + restore (3 tests)** — published→archived legal; draft→archived illegal; archived→draft legal.
- **approve (1 test)** — under_review→published with snapshot (validates the delegate-to-publish path).

## Deviations from Plan

None of the four GSD deviation rules tripped. Two minor implementation refinements vs. the plan body (both surface in the Decisions section above):

1. **`approve` direct delegate vs. `publishCommon` indirection** — the plan body shows a small `publishCommon(policyId, _expectedFrom)` helper that `approve` would call. I collapsed this to `approve = (id) => publish(id)` since the helper had no actual logic distinct from `publish` itself and would have added a layer to debug through. Phase 6 tier-gating can still inject at `approve` before the delegate call. Same behavior, fewer lines.

2. **`OrgScope` typing without `as any` cast** — the plan body uses `s as any` to bridge the loadAndAssertTransition helper's scope param. I imported the exported `OrgScope` type from `@/lib/db/scoped` directly, so the helper is fully typed end-to-end with no casts. tsc passes strict; behavior unchanged.

Neither is a Rule 1-4 deviation — both are Claude's-discretion refinements explicitly invited by the plan body ("If TypeScript surfaces typing issues with the `s as any` cast on OrgScope, replace with a typed import...").

## Verification

| Check                                    | Result                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `pnpm vitest run lib/policies/transitions.test.ts` | 14/14 green                                                         |
| `pnpm test` (full suite)                 | 43/43 green across 4 files (smoke, state-machine, require-admin, transitions) |
| `pnpm tsc --noEmit`                      | exit 0                                                              |
| `pnpm check:db-imports`                  | 3 allow-listed, 0 violations — transitions.ts NOT in ALLOWLIST (imports `withOrgScope`, not raw `db`) |
| `pnpm check:rls`                         | positive control passed (no change vs Plan 02-06 baseline)         |
| `pnpm check:admin-routes`                | OK (no change vs Plan 03-04 baseline)                              |
| `pnpm check:artifacts`                   | 234/234 passed                                                      |
| `pnpm verify:phase-3` (orchestrator)     | exit 0                                                              |

## Self-Check

| Claim                                                                          | Verified                            |
| ------------------------------------------------------------------------------ | ----------------------------------- |
| `lib/policies/transitions.ts` exists                                           | FOUND                               |
| `lib/policies/transitions.test.ts` exists                                      | FOUND                               |
| RED commit `563449b` in git log                                                | FOUND                               |
| GREEN commit `9c24557` in git log                                              | FOUND                               |
| 7 `export async function` in transitions.ts                                    | 7 (submitForReview, approve, reject, publish, archive, restore, editPublished) |
| `import 'server-only'` is the first non-comment line                            | YES                                 |
| No raw `import ... from '@/lib/db'` (only sub-paths)                            | YES (regex `^import.*from '@/lib/db'$` returns 0)         |
| 14 tests pass GREEN                                                            | 14/14                               |

## Self-Check: PASSED

Files and commits all verified on disk. Plan complete; ready for Plan 03-07 (Server Action wrappers) to consume these orchestrators.
