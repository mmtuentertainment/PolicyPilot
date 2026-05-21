---
phase: 03-admin-ui
plan: 07
subsystem: server-actions
tags: [server-actions, zod, D-09, useActionState, revalidatePath, redirect-pitfall-3]
status: complete
completed: 2026-05-19
requires:
  - 03-06 (transitions.ts — 7 orchestrators)
  - 03-08 (zod ^3.23.5 installed + resolved to 3.25.76)
  - 03-04 (Policies.create + Policies.updateDraft repository bodies)
  - 02-01 (withOrgScope + getOrgContext)
provides:
  - "app/(admin)/policies/new/actions.ts: createPolicyAction (D-09) — Zod-validated INSERT inside withOrgScope, revalidatePath, redirect-outside-try/catch"
  - "app/(admin)/policies/[id]/actions.ts: 8 Server Actions — 7 transition wrappers + updateDraftAction (D-04 in-place edit)"
  - "Typed ActionState contract: { ok: true } | { ok: false; error: string }; createPolicyAction adds optional fieldErrors for Zod failures"
  - "IllegalTransitionError mapped to UI-SPEC toast copy verbatim; unexpected errors bubble to Next.js error boundary"
affects:
  - "Plan 03-11 (admin pages) — /policies/new form binds to createPolicyAction; /policies/[id] forms bind to the 8 transition actions via useActionState"
  - "Plan 03-10 (PolicyTransitionMenu, PolicyEditor) — client components fire transition actions through useActionState"
tech-stack:
  added: []
  patterns:
    - "useActionState contract: action signature `(_prev: State, formData: FormData) => Promise<State>` per React 19"
    - "redirect-outside-try/catch (RESEARCH Pitfall 3): redirect() throws NEXT_REDIRECT; a surrounding catch would swallow it"
    - "revalidatePath BEFORE redirect (RESEARCH Pitfall 4): ordering required so the destination renders fresh data"
    - "Single-file Zod schemas with z.transform for FormData → JSON parsing + structural validation"
    - "Action-level error categorization: IllegalTransitionError → typed error string; everything else bubbles"
    - "T-03-07-01 mitigation: updateDraftAction's Zod schema accepts ONLY title/category/contentJson — a forged status field is silently dropped (status changes ONLY through transition actions)"
key-files:
  created:
    - app/(admin)/policies/new/actions.ts
    - app/(admin)/policies/[id]/actions.ts
    - app/(admin)/policies/[id]/actions.test.ts
  modified: []
decisions:
  - "PolicyCreateInput in Policies.create() does NOT need widening — `createdBy` is nullable in the schema and Policies.create sets it from scope.userId internally, so the action passes only { title, category, contentJson } per the plan's must-haves truths block. No Drizzle returning() type narrowing needed."
  - "Used `redirect(\`/policies/${policyId}\`)` template literal inside the action (Pitfall 3 placement verified by W13 structural check: redirectIdx > catchClose)."
  - "ContentJsonSchema declared twice (once in new/actions.ts with all 5 TipTap fields, once in [id]/actions.ts with just type+content for editPublishedAction). Kept as separate-file scoped consts rather than extracting to a shared module — Server Action files are intentionally self-contained per D-09; the slight duplication is preferable to coupling them through a new lib/ module."
  - "Comment line `// All transition actions ultimately wrap their orchestrator's withOrgScope()` is present at the top of [id]/actions.ts AS DOCUMENTATION; the actual literal `withOrgScope(` that satisfies scripts/check-admin-routes.ts comes from updateDraftAction's body, not the comment (verified by inspection)."
  - "Test file uses vi.mock for @/lib/policies/transitions (publish + editPublished captured by reference; others vi.fn() stubs). Mocks next/cache's revalidatePath via a shared revalidateMock. No DB / no Clerk / no Next.js runtime — pure unit tests."
metrics:
  duration_minutes: ~10
  completed_date: "2026-05-19"
  task_count: 3
  file_count: 3
  total_lines: 575
  test_count: 5 (new) + 46 carryover = 51/51 green
  verification_runs:
    - "pnpm tsc --noEmit (exit 0)"
    - "pnpm check:admin-routes (OK — 0 admin URLs / 3 patterns / 0 violations; scaffold WARNs preserved per Phase-3 enforcement-pending)"
    - "pnpm vitest run app/(admin)/policies/[id]/actions.test.ts (5/5 green)"
    - "pnpm test (51/51 green, 6 files)"
    - "pnpm verify:phase-3 (typecheck + check:db-imports + check:rls + check:admin-routes + check:artifacts 234/234 + test 51/51 — exit 0)"
---

# Phase 03 Plan 07: Server Actions (D-09) Summary

Phase 3 form-mutation entry points. Two `actions.ts` files: `policies/new/actions.ts` ships `createPolicyAction` (Zod-validated INSERT + redirect-after-success), `policies/[id]/actions.ts` ships 8 actions that wrap the Plan 03-06 transition orchestrators plus an in-place `updateDraftAction` for Draft edits.

All actions follow the React 19 `useActionState` contract: `(_prev, formData) => Promise<ActionState>`. All transition errors that originate as `IllegalTransitionError` surface as typed `{ ok: false, error: string }` ActionState; unexpected errors bubble past the action to Next.js' framework error boundary.

`redirect()` is placed OUTSIDE the `try/catch` in `createPolicyAction` per RESEARCH Pitfall 3 — Next.js implements redirect by throwing `NEXT_REDIRECT`, which a user-level catch would swallow. `revalidatePath` runs BEFORE `redirect` per Pitfall 4 so the destination page renders fresh data. Verified by W13 structural check (`redirectIdx > catchClose`).

## Commits

| # | Hash      | Type | Files                                          | Description                                                                          |
| - | --------- | ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 | `f5ae552` | feat | `app/(admin)/policies/new/actions.ts`          | createPolicyAction Server Action (D-09)                                              |
| 2 | `8420238` | feat | `app/(admin)/policies/[id]/actions.ts`         | 8 transition Server Actions for /policies/[id] (D-09)                                |
| 3 | `1e6d6ef` | test | `app/(admin)/policies/[id]/actions.test.ts`    | Unit tests for transition Server Action error paths (5 tests)                        |

## Action Signatures

### `createPolicyAction` (app/(admin)/policies/new/actions.ts)

```typescript
export type CreatePolicyState =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: Record<string, string[]> };

export async function createPolicyAction(
  _prev: CreatePolicyState | undefined,
  formData: FormData,
): Promise<CreatePolicyState>;
```

On success, never returns — `redirect(\`/policies/${policyId}\`)` throws `NEXT_REDIRECT` outside the try/catch and Next.js handles the 303 navigation.

### Eight actions in app/(admin)/policies/[id]/actions.ts

```typescript
export type ActionState = { ok: true } | { ok: false; error: string };

export async function submitForReviewAction(_prev, formData): Promise<ActionState>;
export async function approveAction        (_prev, formData): Promise<ActionState>;
export async function rejectAction         (_prev, formData): Promise<ActionState>;
export async function publishAction        (_prev, formData): Promise<ActionState>;
export async function archiveAction        (_prev, formData): Promise<ActionState>;
export async function restoreAction        (_prev, formData): Promise<ActionState>;
export async function editPublishedAction  (_prev, formData): Promise<ActionState>;
export async function updateDraftAction    (_prev, formData): Promise<ActionState>;
```

All eight remain on `/policies/[id]` after success — no redirect, just `revalidateAfter(policyId)` which refreshes `/policies`, `/policies/[id]`, and `/dashboard`.

## Zod Schemas

### CreatePolicySchema (in new/actions.ts)

| Field          | Zod                                                                                   | Error string (UI-SPEC verbatim)              |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `title`        | `z.string().min(1).max(200)`                                                          | "Title is required." / "Title must be 200 characters or fewer." |
| `category`     | `z.enum(['HR','Safety','IT','Finance','Operations','Compliance','Legal','Other'])`     | "Category is required."                       |
| `content_json` | `z.string().min(1).transform(JSON.parse → ContentJsonSchema.parse)`                    | "Policy content is required." / "Invalid policy content." |

ContentJsonSchema: `{ type: string, content?: unknown[], text?: string, attrs?: Record<string,unknown>, marks?: unknown[] }.passthrough()` — structural validation only; sanitization happens server-side on the render path via `@tiptap/html.generateHTML(json, [StarterKit, Link])` (Plan 03-10).

### EditPublishedSchema (in [id]/actions.ts)

| Field           | Zod                                                                                   |
| --------------- | ------------------------------------------------------------------------------------- |
| `policyId`      | `z.string().min(1)`                                                                   |
| `content_json`  | `z.string().min(1).transform(JSON.parse → ContentJsonSchema.parse)`                    |
| `changeSummary` | `z.string().max(200).optional()`                                                       |

### UpdateDraftSchema (in [id]/actions.ts)

| Field           | Zod                                                                                   |
| --------------- | ------------------------------------------------------------------------------------- |
| `policyId`      | `z.string().min(1)`                                                                   |
| `title`         | `z.string().min(1).max(200).optional()`                                                |
| `category`      | `z.string().min(1).max(50).optional()`                                                 |
| `content_json`  | `z.string().optional().transform(...)` — undefined-passthrough                         |

**Critical:** no `status` field. T-03-07-01 mitigation — status changes can ONLY happen through transition actions → orchestrators → state-machine. A forged `status` field in FormData is silently dropped by `.safeParse`.

## Defense-in-Depth Wiring (per action)

| Layer                                                          | Where                                                                                     | Threat covered                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Zod input validation                                            | `.safeParse(Object.fromEntries(formData))` on every entry path                            | T-03-07-01 (tampering)               |
| OrgScope (`withOrgScope`)                                       | `createPolicyAction` directly; transition actions through `lib/policies/transitions.ts`   | T-03-07-02 (cross-org spoofing)      |
| Postgres RLS                                                    | `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` inside withOrgScope (ADR-025) | T-03-07-02 (deep defense)            |
| State machine                                                   | `canTransition(from, to)` in `loadAndAssertTransition` (transitions.ts)                   | Illegal status moves                  |
| Server-side error logging                                       | `console.error` with prefix; client receives generic copy                                  | T-03-07-03 (info disclosure)         |
| `redirect()` outside try/catch                                  | `createPolicyAction` — verified by W13 structural check                                    | T-03-07-04 (silent redirect failure) |

## Drizzle Returning Type Narrowing

**No narrowing required.** `Policies.create()` returns `s.tx.insert(policies).values(...).returning()` which Drizzle types as `Pick<...>[]` based on schema columns. My code reads `rows[0].id`, which TypeScript accepts because `id` is `uuid('id').primaryKey().defaultRandom()` (non-nullable) in `lib/db/schema.ts:111`. The `if (!first) throw new Error('Insert returned no row')` guards against the empty-array case so the `policyId` assignment is type-safe.

`PolicyCreateInput`'s `Omit<...>` does NOT strip `createdBy`. The repository sets `createdBy: s.userId` internally, so the action call site passes only `{ title, category, contentJson }` and TypeScript widens to the right shape (other optional fields like `reviewIntervalMonths` and `nextReviewDate` are nullable in the schema).

## Threat Register Mitigations

| Threat ID   | Disposition | How this plan mitigates                                                                                                                                                                                                              |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-03-07-01 (Tampering — forged status) | mitigate | UpdateDraftSchema accepts ONLY title/category/contentJson; status changes ONLY through transition actions → orchestrators → state-machine.                                                                                          |
| T-03-07-02 (Spoofing — forged policyId targets cross-org policy) | mitigate | Orchestrators run inside withOrgScope → Policies.findById filters by orgId AND Postgres RLS evaluates against ctx.orgId; cross-org policyId returns no rows → "Policy not found" error.                                              |
| T-03-07-03 (InfoDisc — error stack to client) | mitigate | createPolicyAction + updateDraftAction catch unexpected errors, log detail server-side via console.error, return generic "Could not …" copy to client. Transition action errors of type IllegalTransitionError surface their own message (which is already UI-SPEC-safe — "Cannot {verb} from {from} status…"). |
| T-03-07-04 (Tampering — silent redirect failure) | mitigate | `redirect()` placed AFTER the catch block closes in createPolicyAction; verified by W13 node-eval structural check (`redirectIdx > catchClose`).                                                                                  |
| T-03-07-05 (DoS — invalid Zod payloads)        | accept | Per plan body — Phase 7+ rate-limit; Vercel platform DDoS handles MVP.                                                                                                                                                              |

## Test Coverage (5 tests in app/(admin)/policies/[id]/actions.test.ts)

`publishAction`:

1. **resolves → `{ ok: true }` + 3 revalidatePath calls** — verifies `/policies`, `/policies/p1`, `/dashboard` all fired exactly once each.
2. **IllegalTransitionError → typed error** — verifies the returned error string contains both `from` and `to` (the state-machine's error format).
3. **unexpected error → bubbles** — `Error('DB connection lost')` rethrows past the action; revalidatePath does NOT fire.

`editPublishedAction`:

4. **invalid JSON → "Invalid edit payload."** — orchestrator NOT invoked when Zod fails on `content_json: '{not-json'`.
5. **IllegalTransitionError after valid payload → typed error** — content_json parses successfully, orchestrator throws, action surfaces the message.

Mocks: `@/lib/policies/transitions` (publish + editPublished captured by reference; siblings as vi.fn() stubs), `next/cache` (revalidatePath shared mock), `@/lib/auth/context`, `@/lib/db/scoped`, `@/lib/db/repositories/policies`. No DB / no Clerk / no Next.js runtime.

## Verification

| Check                                                          | Result                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm tsc --noEmit`                                            | exit 0                                                                                |
| `pnpm check:admin-routes`                                      | OK — 0 admin URL(s), 3 pattern(s), 0 violations (scaffold WARNs preserved per CR-02)  |
| `pnpm vitest run "app/(admin)/policies/[id]/actions.test.ts"`   | 5/5 green                                                                             |
| `pnpm test` (full suite)                                       | 51/51 green across 6 test files                                                       |
| `pnpm verify:phase-3` (orchestrator)                            | exit 0 — typecheck + check:db-imports + check:rls + check:admin-routes + check:artifacts (234/234) + test (51/51) |
| W13 redirect-outside-try/catch structural check                 | `redirectIdx (5632) > catchClose (5293)` — PASS                                       |

## Acceptance Criteria Trace

### Task 1 (createPolicyAction)

- [x] `app/(admin)/policies/new/actions.ts` exists
- [x] `head -1` returns `'use server';`
- [x] `grep -q "export async function createPolicyAction"` — present
- [x] `grep -q "withOrgScope("` — present
- [x] `grep -q "revalidatePath('/policies')"` — present
- [x] `grep -q "redirect(\`/policies/"` — present
- [x] `grep -q "from 'zod'"` — present
- [x] W13: redirect outside try/catch — verified (5632 > 5293)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm check:admin-routes` exits 0

### Task 2 (8 transition actions)

- [x] `app/(admin)/policies/[id]/actions.ts` exists
- [x] `head -1` returns `'use server';`
- [x] 8 `^export async function ` matches (submitForReview / approve / reject / publish / archive / restore / editPublished / updateDraft Actions)
- [x] `grep -q "IllegalTransitionError"` — present (imported + used in handleTransitionError)
- [x] `grep -q "revalidatePath('/policies')"` — present
- [x] `grep -q "revalidatePath('/dashboard')"` — present
- [x] `grep -q "withOrgScope("` — present (updateDraftAction body + the documentation comment)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm check:admin-routes` exits 0

### Task 3 (unit tests)

- [x] `app/(admin)/policies/[id]/actions.test.ts` exists
- [x] `grep -q "publishAction"` — present
- [x] `grep -q "editPublishedAction"` — present
- [x] `pnpm vitest run "app/(admin)/policies/[id]/actions.test.ts"` exits 0 (5/5 green)
- [x] `pnpm tsc --noEmit` exits 0

## Deviations from Plan

**None.** No Rule 1-4 deviations tripped during execution.

Three minor implementation refinements (Claude's discretion, explicitly invited by plan body's "If types don't quite line up…" notes):

1. **No `as any` casts** anywhere — the Drizzle returning() type from `Policies.create()` typed cleanly through `rows[0].id` without narrowing, because the schema's `id` column is non-nullable and the if-empty guard rules out the empty-array case.

2. **`createdBy` not in the action call site** — `Policies.create()` internally sets `createdBy: s.userId`, so the action passes only `{ title, category, contentJson }`. PolicyCreateInput's Omit type does not strip createdBy, but TypeScript widens correctly because createdBy is nullable in the schema. No repository signature change needed.

3. **Comment line satisfies the audit but the literal `withOrgScope(` that the audit actually picks up comes from `updateDraftAction`'s body, not the comment line.** scripts/check-admin-routes.ts greps the file text for the literal substring; both the comment and the actual call site are matches. Documented this in the file header comment for future readers.

## Auth Gates / Checkpoints

None. Task 1 + Task 2 + Task 3 all `type="auto"` per plan frontmatter; no checkpoint blocks were hit. `pnpm verify:phase-3` runs unattended.

## Self-Check

| Claim                                                                       | Verified                            |
| --------------------------------------------------------------------------- | ----------------------------------- |
| `app/(admin)/policies/new/actions.ts` exists                                | FOUND                               |
| `app/(admin)/policies/[id]/actions.ts` exists                               | FOUND                               |
| `app/(admin)/policies/[id]/actions.test.ts` exists                          | FOUND                               |
| Commit `f5ae552` in git log                                                 | FOUND                               |
| Commit `8420238` in git log                                                 | FOUND                               |
| Commit `1e6d6ef` in git log                                                 | FOUND                               |
| 8 `^export async function ` in [id]/actions.ts                              | 8                                    |
| 1 `^export async function ` in new/actions.ts                               | 1                                    |
| W13 redirect-outside-try/catch structural check                              | PASS (5632 > 5293)                  |
| `pnpm verify:phase-3` exit 0                                                | YES                                 |

## Self-Check: PASSED

Files and commits all verified on disk. Plan 03-07 complete; ready for Plans 03-09/10/11 to bind UI forms to these actions via `useActionState`.
