---
phase: 04-ai-layer
plan: 04-07
subsystem: wave1-repos-and-auth-amendment
tags:
  - lib-db-repositories
  - lib-auth
  - typed-errors
  - d-45-amendment
  - org-scope-first
  - adr-026
  - adr-028
requirements:
  - REQ-ai-policy-assistant
  - REQ-ai-usage-rules
dependency_graph:
  requires:
    - 04-02 (lib/db schema amendments — aiGenerations widened columns + batchJobs table + RLS migrations 0005/0006/0007 applied to TEST DB)
    - 04-03 (Wave 0 RED stub scaffolding — lib/auth/require-admin.test.ts existed from Phase 3)
  provides:
    - "lib/db/repositories/ai_generations.ts → insert + countByTypeInMonth + findByBatchId + findByIdempotencyKey (D-08 + D-32 + D-35; SUCCESS-ONLY per D-06)"
    - "lib/db/repositories/policies.ts → listPublishedForOrg (D-12) + updateSummary (D-09); Phase 3 methods unchanged"
    - "lib/db/repositories/batch_jobs.ts → insert + findByAnthropicBatchId + findLatestForOrg + updateStatus + listAll (D-06 + D-30 + D-34)"
    - "lib/auth/errors.ts → 'FORBIDDEN' added to BootstrapErrorCode union + new ForbiddenError class (D-45)"
    - "lib/auth/require-admin.ts → ADD requireAdminFromCtx(ctx) for Phase 4 routes (403 path); KEEP requireAdmin() no-arg for Phase 3 admin pages (404 path) — backward-compat dual-signature per plan strategy"
    - "lib/auth/require-admin.test.ts → 3 new vitest cases for requireAdminFromCtx; 4 original Phase 3 tests preserved"
    - "scripts/check-policy-id-brand.ts → REPO_TARGETS['lib/db/repositories/policies.ts'] extended with 'updateSummary' (18/18 signatures verified, was 17)"
  affects:
    - 04-08 (publish() orchestrator post-commit summary call uses Policies.updateSummary + AiGenerations.insert; generateSummaryForPolicy uses Policies.findById + Policies.updateSummary)
    - 04-09 (Q&A endpoint uses Policies.listPublishedForOrg inside withOrgScope per D-41 same-closure pattern)
    - 04-10 (Consistency submit + poll endpoints use BatchJobs.insert/findByAnthropicBatchId/updateStatus; both endpoints call requireAdminFromCtx OUTSIDE try block per D-37)
    - 04-14 (dashboard/consistency Server Component shell uses BatchJobs.findLatestForOrg for mount-time resume per D-30)
    - 04-08 + 04-10 + draft endpoint (idempotency-key dedup via AiGenerations.findByIdempotencyKey per D-32)
tech_stack:
  added: []
  patterns:
    - "Backward-compat dual-signature for require-admin (D-45): old no-arg requireAdmin() throws via notFound() (404 — Phase 3 'advertise nothing'); new requireAdminFromCtx(ctx) throws ForbiddenError (403 — Phase 4 REST API contract)"
    - "OrgScope-first repository pattern (ADR-023): every method takes OrgScope first; orgId comes from scope.orgId (NEVER from input — cross-org write defense); RLS reinforces via withOrgScope JWT injection"
    - "SUCCESS-ONLY ai_generations semantic (D-06): caller MUST NOT call AiGenerations.insert until Anthropic SDK call resolves without throwing; in-progress batch state lives in batch_jobs separately"
    - "Date.UTC month-boundary normalization (countByTypeInMonth): Date.UTC(year, month, 1, 0, 0, 0, 0) yields midnight UTC on the 1st of the current month regardless of runtime timezone — load-bearing for SMB users across timezones hitting the same monthly counter"
    - "Two-table batch state split (D-06): batch_jobs tracks in-progress + final state per Anthropic batch ID; ai_generations stays SUCCESS-ONLY"
    - "ts-morph brand-gate REPO_TARGETS extension pattern: adding a new repository method that takes PolicyId requires extending scripts/check-policy-id-brand.ts:REPO_TARGETS in the same commit (caught by CR if missed; gate fails closed on unregistered method)"
    - "ForbiddenError as BootstrapError subclass: extends the ADR-026 typed-error hierarchy; readonly code='FORBIDDEN' + readonly reason field for structured-log routing; message starts 'Forbidden:' for log-grep continuity"
key_files:
  created:
    - lib/db/repositories/batch_jobs.ts (201 lines)
  modified:
    - lib/db/repositories/ai_generations.ts (25 → 176 lines; record() stub replaced with 4 filled methods)
    - lib/db/repositories/policies.ts (161 → 219 lines; +listPublishedForOrg + +updateSummary; Phase 3 methods unchanged)
    - lib/auth/errors.ts (207 → 229 lines; BootstrapErrorCode union extended + ForbiddenError class added)
    - lib/auth/require-admin.ts (23 → 60 lines; new requireAdminFromCtx symbol + preserved requireAdmin no-arg)
    - lib/auth/require-admin.test.ts (76 → 137 lines; +3 vitest cases for requireAdminFromCtx; +1 ForbiddenError import)
    - scripts/check-policy-id-brand.ts (320 → 324 lines; REPO_TARGETS extended with 'updateSummary')
decisions:
  - "Backward-compat dual-signature CONFIRMED for D-45: requireAdmin() no-arg STAYS for Phase 3 admin pages (notFound() → 404 'advertise nothing'); requireAdminFromCtx(ctx) NEW for Phase 4 endpoints (throws ForbiddenError → 403 per AC-26). Plan 04-14 (or fast-follow) may consolidate Phase 3 pages onto the 403 path later — out of scope here."
  - "listPublishedForOrg does NOT take PolicyId argument (returns ALL published policies for the org), so it is intentionally NOT added to scripts/check-policy-id-brand.ts REPO_TARGETS. Only methods that TAKE PolicyId need the brand gate."
  - "AiGenerations.findByBatchId implemented via SQL LIKE on result column (batch ID embedded in JSON-stringified ConsistencyFinding[] result body per Plan 04-02 schema). Schema does NOT add an explicit anthropic_batch_id column to ai_generations — preserves the SUCCESS-ONLY semantic + two-table split (batch state lives in batch_jobs). Future migration MAY add an explicit batch_id column if Phase 8 cost-analytics needs faster lookup."
  - "BatchJobs.findLatestForOrg filters by type='consistency' explicitly (not relying on schema default) — future-proofs the query against multi-type batches in Phase 5+."
  - "BatchJobs.updateStatus uses conditional spread for resultJson: callers that only need to bump status (e.g., terminal 'failed' state without an Anthropic result payload) don't have to pass undefined explicitly."
  - "ForbiddenError extends BootstrapError (not Error directly): integrates with the existing typed-error matcher (matchesErrorClass) and the bootstrap-errors test hierarchy. NOT included in the existing 6-class enumeration in bootstrap-errors.test.ts code-uniqueness assertion (which pins the original 5 + ClerkAuthFailedError) — additive class, doesn't break the assertion since it isn't enumerated there."
  - "Task 6 verification-only step had no source modifications → no separate commit per GSD discipline (do not create empty commits); verification confirmation captured in this SUMMARY § Verification Gates Status."
metrics:
  duration: "~12 min"
  tasks_completed: 6
  files_created: 1
  files_modified: 6
  commits: 5
  completed_date: "2026-05-21"
---

# Phase 4 Plan 04-07: Wave 1 Repositories + D-45 require-admin Amendment Summary

## One-liner

Fills three repository surfaces (`ai_generations`, `policies`, `batch_jobs`) every Wave 2 endpoint will call, and ships the D-45 backward-compatible dual-signature amendment to `lib/auth/require-admin.ts` (Phase 4 endpoints get `requireAdminFromCtx(ctx)` throwing `ForbiddenError` → HTTP 403 per AC-26; Phase 3 admin pages keep `requireAdmin()` no-arg calling `notFound()` → 404 per D-10).

## What Shipped

### 1. `lib/db/repositories/ai_generations.ts` (176 lines, MODIFIED — D-08 + D-32 + D-35)

Phase 2 `record()` throw-stub replaced. Phase 2 `listAll` preserved verbatim. Four new methods:

- **`insert(s, input)`** (D-08) — SUCCESS-ONLY row write per D-06. `orgId` comes from `OrgScope.orgId` (NEVER from input — cross-org write defense). `id` + `createdAt` are DB-generated defaults. Input shape uses `Omit<typeof aiGenerations.$inferInsert, 'orgId' | 'id' | 'createdAt'>` — automatically picks up the D-35 4 token-cost columns (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`) and the D-32 `idempotencyKey` column.
- **`countByTypeInMonth(s, type)`** (D-08 + SPEC R6) — counts rows by `(orgId, type, createdAt >= UTC month start)`. Drives the `aiDraftsMonthly` Starter/Growth tier check (Business unlimited via sentinel `-1` short-circuits before this is consulted). `Date.UTC(year, month, 1, 0, 0, 0, 0)` normalization yields midnight UTC on the 1st of the current month regardless of runtime timezone — load-bearing for Windows dev (`America/New_York`) vs Vercel (UTC).
- **`findByBatchId(s, anthropicBatchId)`** (D-08) — Consistency Check audit-ledger cross-reference. Since schema does NOT add an explicit `anthropic_batch_id` column to `ai_generations` (preserves SUCCESS-ONLY + two-table split), lookup uses a parameterized SQL `LIKE` on the `result` JSON-stringified body. Acceptable at MVP scale (low-frequency surface).
- **`findByIdempotencyKey(s, idempotencyKey)`** (D-32) — `/api/ai/draft` dedup lookup. The partial-unique index `ai_generations_org_idempotency_key WHERE idempotency_key IS NOT NULL` (Plan 04-02 migration 0007) guarantees at most one row per `(org, key)` tuple. Body-mismatch 422 enforcement deferred to v0.2.

All methods use `OrgScope.tx` (no raw `db` import per ADR-023); RLS reinforces via withOrgScope JWT injection.

### 2. `lib/db/repositories/policies.ts` (219 lines, MODIFIED — D-12 + D-09)

Two new methods added (alphabetical-ish insertion to match existing style). Phase 3 methods (`listAll`, `findById`, `create`, `listWithFilters`, `updateDraft`, `incrementVersion`, `statusCounts`) preserved verbatim.

- **`listPublishedForOrg(s)`** (D-12) — `SELECT id, title, contentJson FROM policies WHERE org_id = scope.orgId AND status = 'published'`. Drives Q&A endpoint policy-library composition (Plan 04-09) + Consistency Check batch payload (Plan 04-10). Returns ONLY `id` + `title` + `contentJson` — no admin metadata leak via Q&A path. D-41 enforcement: caller (Plan 04-09) MUST source `validIds` Set from the SAME query result inside the SAME `withOrgScope` closure — citation-strip barrier against cross-tenant policyId disclosure via hallucinated citations. Method takes NO `PolicyId` argument → brand gate intentionally does NOT include it.
- **`updateSummary(s, id: PolicyId, summary)`** (D-09 + ADR-005 + ADR-028) — single-purpose AI-write companion to `updateDraft`. `tldrSummary` is AI-generated only (never accepted by `create()` per `PolicyCreateInput` Omit, never accepted by `updateDraft()` patch type). `PolicyId` branded type per ADR-028. WHERE includes BOTH `orgId` AND `id` (T-03-04-04 cross-org write defense). `updatedAt` bumped via `now()` SQL.

### 3. `lib/db/repositories/batch_jobs.ts` (201 lines, NEW — D-06 + D-30 + D-34)

NEW per-aggregate repository modeled on `policy_versions.ts` shape. Five methods:

- **`insert(s, input)`** (D-06) — Consistency-submit time write. `orgId` from `OrgScope` (cross-org defense). `id` + `createdAt` + `updatedAt` are DB-generated defaults. `status` defaults to `'in_progress'` at schema level (caller may override for terminal-state inserts; not a Phase 4 use case). `type` defaults to `'consistency'` at schema level. `anthropicBatchId` is globally unique per Anthropic namespace (schema `.unique()` enforces cross-org).
- **`findByAnthropicBatchId(s, batchId)`** (D-06 + D-34) — polling endpoint primary lookup. Returns `undefined` when missing (caller 404s). Polling endpoint pseudocode documented in JSDoc.
- **`findLatestForOrg(s)`** (D-30) — dashboard/consistency page mount-time resume per Plan 04-14. `ORDER BY created_at DESC LIMIT 1` + `type='consistency'` filter (future-proofs against multi-type batches in Phase 5+).
- **`updateStatus(s, batchId, patch)`** (D-34) — SDK→SPEC enum translator write. Bumps `updatedAt` via `now()` SQL (load-bearing for D-34 25s stale-window check on subsequent polls). `resultJson` conditionally spread so callers that only bump status don't pass undefined.
- **`listAll(s)`** — admin debugging / Phase 8 analytics. Matches `policy_versions.ts:listAll` pattern.

Two-table batch state split (D-06) documented in file header:
- `batch_jobs` tracks in-progress + final state per Anthropic batch ID.
- `ai_generations` stays SUCCESS-ONLY (one row written ON COMPLETION per CLAUDE.md ALWAYS rule #5 + SPEC R5).

L-05 / ADR-018 spirit: append + update-by-id only; no `delete` method.

### 4. `lib/auth/errors.ts` (229 lines, MODIFIED — D-45)

Two surgical edits:

- `BootstrapErrorCode` union extended with `'FORBIDDEN'` literal (Phase 4 D-45) — appended after the original 5 codes.
- New `ForbiddenError extends BootstrapError` class — readonly `code = 'FORBIDDEN'`, readonly `reason: string` param, `this.name = 'ForbiddenError'`, message format `Forbidden: ${reason}` (preserves log-grep continuity for "admin role required" substring matches across the v0 string-throw → typed-throw transition).

Original 5 BootstrapError subclasses + `ProvisioningRaceError` abstract base + `ClerkAuthFailedError` (intentionally NOT a BootstrapError) all preserved verbatim. The existing `bootstrap-errors.test.ts` code-uniqueness assertion enumerates 6 classes (original 5 + ClerkAuthFailed) and pins exact code values — `ForbiddenError` is NOT in that enumeration, so the addition is additive and does not break the assertion.

### 5. `lib/auth/require-admin.ts` (60 lines, MODIFIED — D-45 backward-compat dual-signature)

Per the plan's strategy (b): provide BOTH signatures side-by-side. The Phase 3 no-arg `requireAdmin(): Promise<OrgContext>` STAYS verbatim (still calls `notFound()` → 404 for `app/(admin)/layout.tsx` and any other Phase 3 admin page callers). NEW `requireAdminFromCtx(ctx: OrgContext): void` ships for Phase 4 endpoints — throws `ForbiddenError` → HTTP 403 per AC-26.

Rationale documented in JSDoc:
- Phase 3 admin PAGES want the "advertise nothing" 404 path (D-10 — prevents URL probing).
- Phase 4 API ROUTES want the contract-clean 403 path (AC-26 — well-formed REST error response).
- Caller pattern (D-37): place `getOrgContext()` + `requireAdminFromCtx` OUTSIDE the route's try/catch — auth errors propagate to the Next.js error boundary as 403, NOT collapsed into the inner 503 fallback for Anthropic failures.

This preserves `app/(admin)/layout.tsx` and all Phase 3 callers unchanged. Plan 04-14 (or a fast-follow) may consolidate Phase 3 pages onto the 403 path later — explicitly out of scope here.

### 6. `lib/auth/require-admin.test.ts` (137 lines, MODIFIED — net +3 GREEN tests)

Original 4 Phase 3 `requireAdmin()` tests preserved verbatim (admin returns OrgContext; employee → NEXT_NOT_FOUND; reviewer → NEXT_NOT_FOUND; getOrgContext() throw bubbles). Imports widened to include `requireAdminFromCtx` + `ForbiddenError`.

New `describe('requireAdminFromCtx (Phase 4 D-45 → 403 path)', ...)` block with 3 tests:
1. `returns silently when role is admin`.
2. `throws ForbiddenError when role is employee`.
3. `throws ForbiddenError with reason="admin role required" + code="FORBIDDEN" when role is reviewer` (also asserts `message` contains the reason for log-grep continuity).

**Test count: 7/7 GREEN** (4 original + 3 new).

### 7. `scripts/check-policy-id-brand.ts` (324 lines, MODIFIED — REPO_TARGETS extension)

One-line addition: `'updateSummary'` appended to the `'lib/db/repositories/policies.ts'` array. Inline comment explains why `'listPublishedForOrg'` is NOT added (takes no `PolicyId` argument — brand gate is about ENFORCING branded-type parameters; only methods that take `PolicyId` need the gate).

**Signature count: 18/18 verified** (was 17 pre-plan — the `+1` is `updateSummary`).

## Verification Gates Status (Task 6)

Task 6 is verification-only (no source modifications). All 4 verify gates GREEN after Task 5 completion:

| Gate                              | Command                              | Result                                                                  |
| --------------------------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Typecheck                         | `pnpm tsc --noEmit`                  | OK (exit 0)                                                             |
| DB import discipline (ADR-023)    | `pnpm check:db-imports`              | OK — 5 allow-listed `@/lib/db` imports, 0 violations                    |
| PolicyId brand (ADR-028)          | `pnpm check:policy-id-brand`         | OK — **18/18** signatures verified (9 repo + 8 orchestrator + 1 object-field) |
| Error discipline (ADR-026 + D-16) | `pnpm check:error-discipline`        | OK — 4 file(s) scanned in `lib/auth/` + `lib/stripe/`; no direct built-in `Error` throws |

Test deltas:

| Test File                              | Before | After | Delta                                                              |
| -------------------------------------- | ------ | ----- | ------------------------------------------------------------------ |
| `lib/auth/require-admin.test.ts`       | 4/4    | 7/7   | **+3 GREEN** (`requireAdminFromCtx` cases for D-45 → 403 path)     |
| `lib/auth/bootstrap-errors.test.ts`    | 24/24  | 24/24 | No change (`ForbiddenError` not enumerated in code-uniqueness test) |
| `lib/stripe/products.test.ts`          | 11/11  | 11/11 | No change (Plan 04-06 GREEN tests preserved; no regression)        |
| `lib/policies/state-machine.test.ts`   | GREEN  | GREEN | No change                                                          |
| `lib/policies/transitions.test.ts`     | 16 GREEN + 3 RED (TODO Plan 04-11) | 16 GREEN + 3 RED (TODO Plan 04-11) | No change (3 RED stubs are pre-existing Wave 0 scaffold for Plan 04-11; explicitly out of scope here) |

## Commits

| Task | Commit    | Title                                                                                                                  |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | `12461d5` | feat(04-07): lib/auth/errors.ts — add ForbiddenError per D-45 (AC-26 → 403)                                          |
| 2    | `fc88296` | feat(04-07): lib/auth/require-admin.ts — add requireAdminFromCtx per D-45 (backward-compat)                            |
| 3    | `88dbcf1` | feat(04-07): ai_generations repository — insert + countByTypeInMonth + findByBatchId + findByIdempotencyKey per D-08 + D-32 |
| 4    | `32d97ad` | feat(04-07): policies repository — listPublishedForOrg (D-12) + updateSummary (D-09) + ts-morph brand gate             |
| 5    | `7935021` | feat(04-07): batch_jobs repository — insert + findByAnthropicBatchId + findLatestForOrg + updateStatus + listAll per D-06 + D-30 + D-34 |
| 6    | (no source commit) | Task 6 was verification-only — all 4 gates + Phase 3 regression sweep GREEN (captured above)                  |

5 task commits total. Task 6's verification-only step intentionally has no separate commit per GSD discipline (do not create empty commits); verification confirmation lives in this SUMMARY.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written. All 4 verify gates passed on the first run after each task commit.

### Out-of-scope discoveries (logged, not fixed)

- `lib/policies/transitions.test.ts` has 3 pre-existing RED `expect.fail('TODO: Plan 04-11 — ...')` stubs covering the D-19 post-commit summary graceful-degrade tests. These were planted by Plan 04-03 (Wave 0 RED scaffold) and are explicitly out of scope for Plan 04-07 — they flip GREEN when Plan 04-11 (or whichever wave ships the publish() orchestrator post-commit summary call) lands. Verified via `git stash && pnpm test lib/policies/transitions.test.ts` (3 RED + 16 GREEN BEFORE my changes; 3 RED + 16 GREEN AFTER my changes — no regression caused by Plan 04-07).

## Authentication Gates Encountered

None. All work was filesystem + git + test commands; no Anthropic/Clerk/Supabase auth gates triggered.

## Self-Check: PASSED

Files verified to exist on disk + commits verified in `git log`:

- `lib/db/repositories/ai_generations.ts` — FOUND (commit `88dbcf1`)
- `lib/db/repositories/policies.ts` — FOUND (commit `32d97ad`)
- `lib/db/repositories/batch_jobs.ts` — FOUND (commit `7935021`)
- `lib/auth/errors.ts` — FOUND (commit `12461d5`)
- `lib/auth/require-admin.ts` — FOUND (commit `fc88296`)
- `lib/auth/require-admin.test.ts` — FOUND (commit `fc88296`)
- `scripts/check-policy-id-brand.ts` — FOUND (commit `32d97ad`)
- `.planning/phases/04-ai-layer/04-07-SUMMARY.md` — FOUND (this file, final-metadata commit)

All 5 task commits exist on `gsd/phase-4-ai-layer`. All 9 plan sentinel checks pass (`server-only` imports + method-name regexes).

## Plan-Phase Status

Plan 04-07 cleared. Wave 2 plans (04-08 / 04-09 / 04-10 / 04-14) can now ship their endpoint implementations:

- 04-08 Draft endpoint + publish() post-commit summary: `AiGenerations.insert` + `AiGenerations.countByTypeInMonth` + `AiGenerations.findByIdempotencyKey` + `Policies.updateSummary` + `Policies.findById` + `requireAdminFromCtx` all available.
- 04-09 Q&A endpoint: `Policies.listPublishedForOrg` available; D-41 same-closure pattern enforced via JSDoc.
- 04-10 Consistency submit + poll endpoints: `BatchJobs.insert` + `BatchJobs.findByAnthropicBatchId` + `BatchJobs.updateStatus` + `requireAdminFromCtx` all available.
- 04-14 Dashboard/consistency page: `BatchJobs.findLatestForOrg` available for mount-time resume.
- D-45 path: every Phase 4 endpoint can place `requireAdminFromCtx(ctx)` outside its try block per D-37; non-admin role → `ForbiddenError` → HTTP 403 with body `{ error: 'forbidden' }` matching SPEC R2 acceptance text.
