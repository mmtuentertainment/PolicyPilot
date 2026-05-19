---
phase: 02-data-layer
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, multi-tenancy, clerk, typescript, type-system, server-only]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Drizzle client (lib/db/index.ts), Clerk session (auth()), middleware sessionClaims narrowing pattern, postgres-js connection with prepare:false
provides:
  - lib/db/schema.ts populated with 12 tables (10 tenant-scoped + 2 service-role aux)
  - D-02 org_id denormalization onto 5 child tables (policy_versions, policy_assignments, acknowledgments, notifications, workflow_stages)
  - D-03a nullable users.org_id (CHECK constraint enforcement deferred to Plan 02-03)
  - D-03b new clerk_events idempotency table (text PK = svix-msg-id, processedAt)
  - lib/auth/context.ts — getOrgContext() with SF-M4 try/catch + asRole() literal-enum guard
  - lib/db/scoped.ts — OrgScope type + withOrgScope() per-tx wrapper (SET LOCAL ROLE authenticated + set_config(..., true))
  - tests/types.ts — three @ts-expect-error invariants locking ADR-018 (no update/delete on Acks) + ADR-005 (Policies.create rejects tldrSummary)
affects: [02-data-layer, 03-admin-ui, 04-ai-layer, 05-employee-portal, 06-billing, 07-crons-email, 08-validation]

# Tech tracking
tech-stack:
  added: []  # No new packages — drizzle-orm@0.45.2, @clerk/nextjs@7.3.4, postgres@3.4.9 all pre-installed in Phase 1
  patterns:
    - "Per-transaction JWT injection (ADR-025): SET LOCAL ROLE authenticated → set_config('request.jwt.claims', json, true) inside Drizzle transaction"
    - "OrgScope = OrgContext & { tx } — repository methods take scope first, never open their own transactions"
    - "Type-system invariant locking via @ts-expect-error (D-07) — append-only / required-omit invariants are tsc-enforced"
    - "Single-line @typescript-eslint/no-explicit-any exception for PgTransaction<any, any, any> (operator-approved, bounded, audited)"
    - "Stricter session-claim narrowing: { role?: unknown } (Phase 2) vs middleware's { role?: string } (Phase 1) — forces literal-string check in asRole()"
    - "import 'server-only' at top of every server module (carried forward from lib/db/index.ts)"

key-files:
  created:
    - lib/auth/context.ts — getOrgContext() server-only auth-context reader (L-02 + SF-M4 fold)
    - lib/db/scoped.ts — OrgScope + withOrgScope() per-tx RLS injection wrapper (L-01 / ADR-025)
    - tests/types.ts — @ts-expect-error compile-time invariants (D-07; ADR-018 + ADR-005)
  modified:
    - lib/db/schema.ts — replaced `export {};` placeholder with full 12-table Drizzle schema

key-decisions:
  - "PgTransaction<any, any, any> typing kept (default) over Parameters<typeof db.transaction>[0] tightening — open Question 2 from RESEARCH resolved to defer tightening to Phase 8 refactor; single audited eslint-disable line in lib/db/scoped.ts"
  - "Tables ordered alphabetically (acknowledgments → workflowStages) in lib/db/schema.ts — Drizzle's references(() => ...) deferred-evaluation makes order irrelevant at runtime; alphabetical gives stable review diffs"
  - "Phase 2 stricter sessionClaims narrowing (`{ role?: unknown }`) chosen over middleware's looser `{ role?: string }` — forces asRole() literal-enum check, eliminates a class of role-spoof attacks where a non-Role string could leak through"
  - "tldrSummary kept as a column on policies (matches SCHEMA.md verbatim) but type-system invariant from D-07 will reject calls to Policies.create that pass tldrSummary — Plan 02-04 lands the Omit<..., 'tldrSummary'> in repositories"
  - "stripe_events + clerk_events both kept as text-PK (no UUID) — natural keys (Stripe evt_*, svix-msg-id) are stable and human-readable; service-role only, no org_id"

patterns-established:
  - "Schema file as single source of truth: drizzle-kit generate (Plan 02-03) reads lib/db/schema.ts → emits 0000_initial.sql; hand-written 0001_rls_policies.sql layers on ENABLE RLS + CREATE POLICY + GRANT"
  - "Inline citation comments at load-bearing security boundaries: every Pitfall-2 site MUST cite RESEARCH.md by section name so future readers know the comment is not advisory"
  - "Operator-approved any exceptions documented inline + carried in CONTEXT.md <specifics> + repeated in commit message — auditability over brevity"

requirements-completed: []
# Plan 02-01 partially addresses REQ-user-roles + REQ-multi-tenancy
# but does NOT complete them — schema + scope + context files are
# necessary infrastructure, not sufficient. Full completion lands
# at the end of Phase 2 when migrations + webhooks + repository
# skeletons + cross-org RLS test (Plan 02-06) are all green. Mark
# at Plan 02-06-SUMMARY, not here.

# Metrics
duration: 7min
completed: 2026-05-17
---

# Phase 2 Plan 01: Schema + OrgScope + getOrgContext + Type-Test Foundation Summary

**Drizzle schema (12 tables with D-02 denormalization + D-03a nullable users.org_id + D-03b clerk_events) plus the OrgScope/withOrgScope per-tx RLS wrapper and getOrgContext() Clerk-session reader — the type-system foundation every other Phase-2 plan consumes.**

## Performance

- **Duration:** 7 min (start 2026-05-17T08:25:14Z → finish 2026-05-17T08:31:38Z, ~6m 24s wall-clock; rounded up)
- **Started:** 2026-05-17T08:25:14Z
- **Completed:** 2026-05-17T08:31:38Z
- **Tasks:** 3 / 3
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments

- **Drizzle schema fully populated** with all 12 tables in alphabetical order: `acknowledgments`, `aiGenerations`, `clerkEvents`, `departments`, `notifications`, `organizations`, `policies`, `policyAssignments`, `policyVersions`, `stripeEvents`, `users`, `workflowStages`. Replaces the prior `export {};` placeholder. drizzle-orm version pinned at `0.45.2` in `pnpm-lock.yaml`.
- **D-02 denormalization applied** to all five required child tables (`policyVersions`, `policyAssignments`, `acknowledgments`, `notifications`, `workflowStages`): each carries `orgId: uuid('org_id').notNull().references(() => organizations.id)`. Repository WHERE clauses now uniformly read `where(eq(table.orgId, scope.orgId))`; RLS evaluates row-local on every tenant-scoped table.
- **D-03a executed**: `users.orgId` is `uuid('org_id').references(() => organizations.id)` with NO `.notNull()` — covers the brief Clerk webhook ordering window. CHECK constraint enforcing the 5-minute cap lives in `drizzle/0001_rls_policies.sql` (Plan 02-03).
- **D-03b added** `clerkEvents` table near `stripeEvents` (alphabetical placement between `clerkEvents` and `departments`): `id: text('id').primaryKey()`, `processedAt: timestamp('processed_at').defaultNow()` — service-role only, NO `org_id` (anti-pattern guard).
- **`lib/db/scoped.ts` shipped** with the ADR-025 body verbatim: `SET LOCAL ROLE authenticated` fires first (Pitfall 1 — `postgres` user is BYPASSRLS), then `set_config('request.jwt.claims', ${claims}, true)` with the load-bearing `is_local=true` third arg (Pitfall 2). Inline comment cites `02-RESEARCH.md` Pitfall 2 by exact section name. Single eslint-disable for `PgTransaction<any, any, any>` (operator-approved, bounded).
- **`lib/auth/context.ts` shipped** with SF-M4 try/catch around `await auth()` — Phase 1 PR-review follow-up closed. `asRole()` rejects anything outside `'admin' | 'reviewer' | 'employee'`; stricter `{ role?: unknown }` narrowing (vs middleware's `{ role?: string }`) forces literal-enum comparisons. Stable throw messages.
- **`tests/types.ts` shipped** with 3 (4 counting the docstring example) `@ts-expect-error` directives: `Acknowledgments.update`, `Acknowledgments.delete` (ADR-018 append-only), and `Policies.create({} as any, { tldrSummary: 'x' })` (ADR-005 — TL;DR is publish-time-generated, never user input). File-level eslint-disable scoped to no-unused-expressions + no-explicit-any.

## Task Commits

Each task was committed atomically:

1. **Task 1: Populate lib/db/schema.ts with 12 tables (D-02 + D-03a + D-03b)** — `75b397e` (`feat(02-01)`)
2. **Task 2: Create lib/auth/context.ts + lib/db/scoped.ts (L-01, L-02, SF-M4, ADR-025)** — `e7c6b43` (`feat(02-01)`)
3. **Task 3: Create tests/types.ts (D-07 @ts-expect-error invariants)** — `2fff189` (`feat(02-01)`)

**Plan metadata commit:** (next — `.planning/phases/02-data-layer/02-01-SUMMARY.md` + `.planning/STATE.md` + `.planning/ROADMAP.md`)

## Files Created/Modified

| File | Status | Role |
|------|--------|------|
| `lib/db/schema.ts` | Modified (replaced `export {};`) | Drizzle table definitions — 12 tables, D-02/D-03a/D-03b applied |
| `lib/auth/context.ts` | Created | `getOrgContext()` server-only Clerk session reader + Role enum + asRole guard |
| `lib/db/scoped.ts` | Created | `OrgScope` type + `withOrgScope()` per-tx RLS injection wrapper |
| `tests/types.ts` | Created | `@ts-expect-error` compile-time invariants (ADR-018 + ADR-005) |

## Decisions Made

- **Kept `PgTransaction<any, any, any>` typing** (CONTEXT.md `<specifics>` default + RESEARCH Open Question 2 resolution). Did NOT attempt the `Parameters<typeof db.transaction>[0]` tightening — would have produced a deep generic that's verbose and non-portable. Single audited `eslint-disable-next-line @typescript-eslint/no-explicit-any` line at `lib/db/scoped.ts:25` with a comment chain pointing back to CONTEXT and to CLAUDE.md NEVER #4's documented exception. Tightening is a Phase 8 refactor candidate, not a Phase 2 blocker.
- **Alphabetical table order in `lib/db/schema.ts`**. Drizzle's `references(() => ...)` is a thunk — evaluation is deferred until the schema graph is walked — so forward references like `acknowledgments` → `organizations` (defined later in the file) work fine. Alphabetical produces a stable review diff and reads cleanly top-to-bottom.
- **Stricter `{ role?: unknown }` cast in `lib/auth/context.ts`** (vs middleware's `{ role?: string }`). The looser middleware cast is Phase-1 history; the new file lands `unknown` so `asRole()` MUST do an explicit literal-string comparison. No `any` anywhere in `context.ts`. Diverges intentionally from middleware — documented in the inline comment.
- **`@ts-expect-error` count exceeds 3** (file contains 4 occurrences: 1 in the docstring "MUST remain a compile error" example + 3 active directives). The verify regex matches all 4; `>= 3` is the spec, so this is in spec. The docstring occurrence is a comment, not an active directive, so tsc treats it as plain text.
- **`tsconfig.json` left untouched**. Confirmed `include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]` already pulls in `tests/`. No `exclude` for `tests/` exists — D-07 requirement satisfied without modification.

## Deviations from Plan

None — plan executed exactly as written.

The plan explicitly states tsc IS expected to fail at the end of Task 3 with "Cannot find module '@/lib/db/repositories/acknowledgments'" + "Cannot find module '@/lib/db/repositories/policies'" — those repository files are Plan 02-04's responsibility. That's the documented intended state, not a deviation.

## Issues Encountered

- **Bash tool variable expansion** stripped PowerShell `$variable` syntax when the command was passed directly. Worked around by routing through `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command` with backtick-escaped `\$` for PowerShell variables. Verify blocks ran cleanly after that adjustment. No code changes required.

## Final tsc Status

```
pnpm tsc --noEmit
=> tests/types.ts(19,33): error TS2307: Cannot find module '@/lib/db/repositories/acknowledgments' or its corresponding type declarations.
   tests/types.ts(20,26): error TS2307: Cannot find module '@/lib/db/repositories/policies' or its corresponding type declarations.
   tests/types.ts(22,1): error TS2578: Unused '@ts-expect-error' directive.
   tests/types.ts(25,1): error TS2578: Unused '@ts-expect-error' directive.
   tests/types.ts(28,1): error TS2578: Unused '@ts-expect-error' directive.
```

**This is the intentional documented end state for Plan 02-01.** The `Cannot find module` errors disappear when Plan 02-04 ships the repository skeletons; the `Unused '@ts-expect-error'` errors are knock-ons of the missing-module imports and resolve simultaneously. Plan 02-06's `pnpm verify:phase-2` step 1 (`tsc --noEmit` exits 0) is the gate that closes this loop.

Per the plan's `<verification>` block, the "Expected: `pnpm tsc --noEmit` is EXPECTED to fail with 'Cannot find module ...' — this is closed by Plan 02-04" exit condition was met exactly.

## Verification Summary

| Check | Status |
|-------|--------|
| `lib/db/schema.ts` 12 `export const` declarations | ✓ (12 found) |
| 5 D-02 child tables (`policyVersions`, `policyAssignments`, `acknowledgments`, `notifications`, `workflowStages`) carry `orgId: uuid('org_id').notNull().references(() => organizations.id)` | ✓ |
| `users.orgId` is nullable (`uuid('org_id').references(() => organizations.id)` — no `.notNull()`) | ✓ |
| `stripeEvents` table block contains no `orgId` substring | ✓ |
| `clerkEvents` table block contains no `orgId` substring | ✓ |
| Both `lib/db/scoped.ts` + `lib/auth/context.ts` begin with `import 'server-only'` | ✓ |
| `lib/auth/context.ts` wraps `await auth()` in try/catch (SF-M4 fold) | ✓ |
| `lib/auth/context.ts` casts `sessionClaims?.publicMetadata` to `{ role?: unknown }` (stricter than middleware) | ✓ |
| `lib/auth/context.ts` contains no `any` outside comments | ✓ |
| `lib/db/scoped.ts` contains literal `SET LOCAL ROLE authenticated` | ✓ |
| `lib/db/scoped.ts` contains literal `set_config('request.jwt.claims'` AND ends `, true)` | ✓ |
| `lib/db/scoped.ts` comment cites Pitfall 2 (substring match on `Pitfall 2`, `set_config with is_local`, OR `claims across pool`) | ✓ (cites all three) |
| `lib/db/scoped.ts` has single `eslint-disable-next-line @typescript-eslint/no-explicit-any` for the `OrgScope` type alias | ✓ |
| `tests/types.ts` exists with 3 `@ts-expect-error` directives + literal `tldrSummary` substring | ✓ (4 occurrences total, 3 active) |
| `tsconfig.json` does NOT exclude `tests/` | ✓ |
| Schema-only tsc (after Task 1, before Task 3 added repository imports) | ✓ exit 0 |
| Task 2 tsc (after lib/auth/context.ts + lib/db/scoped.ts shipped, before tests/types.ts) | ✓ exit 0 |
| Final tsc (after Task 3 — missing repository imports) | EXPECTED FAIL (per `<verification>` block) — closed by Plan 02-04 |

## Drizzle Version Pinned

- `drizzle-orm@0.45.2` in `pnpm-lock.yaml` (exact integrity hash present).
- `drizzle-kit@0.31.10` (devDep) — used by Plan 02-03 for `db:generate` / `db:migrate`.
- No version bumps in this plan.

## PgTransaction Typing Decision

- **Kept** `PgTransaction<any, any, any>` (default from CONTEXT.md `<specifics>` block #1).
- Did NOT switch to `Parameters<typeof db.transaction>[0]` (RESEARCH Open Question 2 resolution: tightening produces a deep generic that doesn't re-export cleanly).
- Single `eslint-disable-next-line @typescript-eslint/no-explicit-any` at `lib/db/scoped.ts:25` is the only `any` use in the entire plan. Audited, bounded, documented in commit message + CONTEXT.md + inline comment.

## User Setup Required

None for this plan. Plan 02-02 carries the operator-manual-step list (Clerk Roles dashboard config, Clerk session token customization, Clerk webhook endpoint, Supabase test project, `.env.local` amendments).

## Next Phase Readiness

**Plan 02-02 (Operator manual config):** Ready. Plan 02-02 is the human-action checkpoint plan; no code dependencies on 02-01 outputs.

**Plan 02-03 (Drizzle migrations):** Ready. `lib/db/schema.ts` is now the single source of truth that `drizzle-kit generate` reads. Output: `drizzle/0000_initial.sql`. Hand-written `drizzle/0001_rls_policies.sql` adds RLS + GRANTs + the D-03a CHECK constraint.

**Plan 02-04 (Repository skeletons):** Ready and unblocks `tsc`. The 9 repository modules under `lib/db/repositories/*.ts` need `OrgScope` (✓ shipped here) and the schema tables (✓ shipped here). After 02-04 ships, `pnpm tsc --noEmit` returns to exit 0 — `tests/types.ts`'s 3 `@ts-expect-error` directives become live invariants.

**Plan 02-05 (Clerk webhook):** Ready. Needs `getOrgContext()` (✓ shipped) — actually, no: webhooks use raw `db` per ADR-023 allow-list. Plan 02-05 needs `clerkEvents` (✓ shipped) for idempotency.

**Plan 02-06 (CI gates):** Ready. `scripts/check-db-imports.ts` allow-list MUST include `lib/db/scoped.ts` (the second legitimate raw-`db` importer). `scripts/check-rls.ts` exercises the same `SET LOCAL ROLE` + `set_config(..., true)` sequence that `withOrgScope` ships. `scripts/check-schema.ts` audits the migrations from Plan 02-03.

**Phase 1 PR-review todo SF-M4 (try/catch around `auth()`):** Closed in `lib/auth/context.ts:25-32`. The middleware-side companion (`middleware.ts:51, 61`) is NOT touched in this plan — that lives in Plan 02-05 per the plan-of-plans (PATTERNS.md "Phase 2 candidate plan shape Wave 3 ‖ Plan 02-05").

**No blockers.**

## Self-Check: PASSED

All claimed files exist and all claimed commit hashes are reachable in `git log --all`:

| Claim | Verification |
|-------|--------------|
| `lib/db/schema.ts` exists | ✓ FOUND |
| `lib/auth/context.ts` exists | ✓ FOUND |
| `lib/db/scoped.ts` exists | ✓ FOUND |
| `tests/types.ts` exists | ✓ FOUND |
| `.planning/phases/02-data-layer/02-01-SUMMARY.md` exists | ✓ FOUND |
| Commit `75b397e` (Task 1 — schema) | ✓ FOUND |
| Commit `e7c6b43` (Task 2 — context + scoped) | ✓ FOUND |
| Commit `2fff189` (Task 3 — type tests) | ✓ FOUND |

---

*Phase: 02-data-layer*
*Completed: 2026-05-17*
