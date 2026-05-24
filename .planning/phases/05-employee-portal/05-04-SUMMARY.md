---
phase: 05-employee-portal
plan: 04
subsystem: api
tags: [next-15, server-actions, drizzle, anthropic, prompt-caching, withOrgScope, withOrgScope-tx, rls, refactor, eapi-h4]

# Dependency graph
requires:
  - phase: 05-02
    provides: PolicyDomainError hierarchy (PolicyArchivedError + PolicyNotAssignedError + PolicyNotFoundError) — typed throws for recordAcknowledgment per D-07/D-08
  - phase: 05-03
    provides: Acknowledgments.record + PolicyAssignments.listForPolicy + Policies.listAssignedAndPublishedForUser + QaCitationGrants.upsert/hasGrant — repository surfaces both orchestrators consume
  - phase: 04
    provides: lib/ai/{cache,client,extract,models,prompts,qa-extract,qa-parser,schemas}.ts + Policies.listPublishedForOrg + AiGenerations.insert — Phase 4 helpers re-assembled inside lib/ai/qa.ts::askQuestion per D-25
provides:
  - lib/policies/acknowledgment.ts — recordAcknowledgment(ctx, policyId, ipAddress) atomic orchestrator (D-10a single withOrgScope tx wrapping read + lookup + INSERT)
  - lib/ai/qa.ts — askQuestion(ctx, question) extracted Q&A orchestrator preserving Phase 4 invariants (D-41 same-closure validIds, D-33c LONG_CACHE ordering, WARNING-4 raw audit) + Phase 5 additions (D-26 grant UPSERT + D-27a accessibility annotation)
  - app/api/ai/qa/route.ts — refactored thin HTTP wrapper (147 → 49 lines) calling askQuestion; public contract unchanged modulo additive D-27a field
  - reference/API-SPEC.md — H-4 EAPI Critical Path finding closed (additive accessibility field documented + canonical Phase 4 citation-shape line preserved for contract-grep gates)
affects: [Plan 05-05 employee-routes, Plan 05-08 ci-gates (policy-id-brand widening), Plan 05-09 integration-test (H-5/H-6 grant negative cases)]

# Tech tracking
tech-stack:
  added: []  # No new packages — pure refactor + helper extraction
  patterns:
    - "Server-only orchestrator receives ctx (NOT calling getOrgContext internally) so Server Action's outer try/catch can split BootstrapError vs PolicyDomainError per Phase 3 D-09"
    - "D-10 silent-success: empty RETURNING from ON CONFLICT DO NOTHING returns existing-row timestamp (idempotent re-ack)"
    - "Cross-org isolation locked at 3 points inside same withOrgScope: validIds same-closure (D-41), grant UPSERT iterates post-validIds-filter list (RESEARCH gap-3), assignedIds query RLS-scoped"
    - "Additive API field for backward compat: D-27a accessibility documented as ignored by Phase 4 consumers per JSON contract convention + canonical Phase 4 shape line preserved for grep gates"

key-files:
  created:
    - lib/policies/acknowledgment.ts
    - lib/ai/qa.ts
    - .planning/phases/05-employee-portal/05-04-SUMMARY.md
  modified:
    - app/api/ai/qa/route.ts
    - app/api/ai/qa/route.test.ts
    - reference/API-SPEC.md
    - scripts/check-ai-layer.test.ts

key-decisions:
  - "D-25 / T-3=A — extracted askQuestion verbatim from app/api/ai/qa/route.ts:41-115 into lib/ai/qa.ts; HTTP wrapper now 49 lines (≤50 ceiling per Plan 05-04 acceptance)"
  - "D-10a — single withOrgScope tx in recordAcknowledgment wraps 4 sub-ops (Policies.findById + dept-id sub-query + PolicyAssignments.listForPolicy + PolicyVersions.findByVersionNumber + Acknowledgments.record); editPublished landing mid-flight commits or rolls back atomically"
  - "D-26 grant UPSERT loop iterates parsed.citations (post-validIds-filter), NOT raw fence — closes RESEARCH gap-3 (foreign-org UUID-collision would otherwise pollute qa_citation_grants with garbage rows)"
  - "D-27a accessibility annotation uses a single org-scoped query of assigned-and-published policy IDs (not per-citation hasAssignment round-trips) — MVP-scale (<100 assignments) optimization"
  - "H-4 EAPI Critical Path finding closed in-plan — reference/API-SPEC.md amended with additive accessibility field documentation; canonical Phase 4 citation-shape line preserved verbatim for the contract-grep regex in scripts/check-artifacts.ts:1909"
  - "Rule 1 test adaptation per Plan 05-04 <verification> fallback: app/api/ai/qa/route.test.ts + scripts/check-ai-layer.test.ts extended with mocks for the two new Phase 5 dependencies (Policies.listAssignedAndPublishedForUser + QaCitationGrants.upsert); citation-shape assertions updated to accept the additive accessibility field"

patterns-established:
  - "Pattern A: Orchestrator-receives-ctx (orchestrator does NOT call context-bootstrap helper; Server Action passes already-resolved ctx so outer try/catch can split auth-bootstrap vs domain errors per Phase 3 D-09)"
  - "Pattern B: Thin HTTP wrapper around lib/ai orchestrator — auth-outside-try + Zod parse + delegate + error-mapping (ZodError → 400 + Anthropic.APIError → 503+Retry-After per SPEC R7)"
  - "Pattern C: Additive API field + contract-gate compat — the canonical Phase 4 citation-shape line stays in API-SPEC.md verbatim for the regex anchor; the widened Phase 5 shape is documented as additive on a separate line with backward-compatibility wording"

requirements-completed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules

# Metrics
duration: ~28min
completed: 2026-05-23
---

# Phase 5 Plan 04: Orchestrators Summary

**Two server-only orchestrators land: `recordAcknowledgment` (atomic single-tx ack write per D-10a) and `askQuestion` (extracted Q&A orchestrator preserving every Phase 4 invariant + adding D-26 grant UPSERT + D-27a accessibility annotation); HTTP route slimmed 147 → 49 lines; API-SPEC.md H-4 contract-drift closed.**

## Performance

- **Duration:** ~28 min (3 tasks: 8 + 8 + 12 min including test mock adaptation)
- **Started:** 2026-05-23T21:30Z (approximate)
- **Completed:** 2026-05-23T22:00Z (approximate)
- **Tasks:** 3
- **Files created:** 2 (lib/policies/acknowledgment.ts + lib/ai/qa.ts)
- **Files modified:** 4 (app/api/ai/qa/route.ts + app/api/ai/qa/route.test.ts + reference/API-SPEC.md + scripts/check-ai-layer.test.ts)

## Accomplishments

1. **`lib/policies/acknowledgment.ts` (NEW, 180 lines)** — atomic `recordAcknowledgment(ctx, policyId, ipAddress)` orchestrator with single `withOrgScope` tx wrapping FOUR sub-operations per D-10a: (a) `Policies.findById` read + status='published' assert (D-07 throws `PolicyArchivedError`), (b) cheap user-dept sub-query + `PolicyAssignments.listForPolicy` match (D-08 throws `PolicyNotAssignedError`), (c) `PolicyVersions.findByVersionNumber` resolution, (d) `Acknowledgments.record` INSERT ON CONFLICT DO NOTHING (D-06 + D-10 silent-success per RESEARCH Pitfall 8 — empty RETURNING returns existing-row timestamp).

2. **`lib/ai/qa.ts` (NEW, 197 lines)** — extracted `askQuestion(ctx, question)` orchestrator from `app/api/ai/qa/route.ts:41-115` per D-25 / T-3=A. Every Phase 4 invariant preserved VERBATIM (D-41 same-closure validIds defense, D-33c LONG_CACHE-first-EPHEMERAL-second ordering, D-40 cold-miss observability, WARNING-4 raw-text `ai_generations.result` audit row). Two Phase 5 additions inside the same withOrgScope closure: (1) D-26 grant UPSERT loop iterating `parsed.citations` (post-validIds-filter per RESEARCH gap-3), (2) D-27a accessibility annotation via single org-scoped query of assigned-and-published policy IDs.

3. **`app/api/ai/qa/route.ts` (REFACTOR, 147 → 49 lines, 67% reduction)** — thin HTTP wrapper around `askQuestion`. Auth-outside-try preserved (D-37), Zod `.strict()` body parse preserved (D-42 → 400), Anthropic.APIError → 503 + Retry-After:30 preserved verbatim (SPEC R7), PII-safe sanitized log preserved (D-36).

4. **`reference/API-SPEC.md` — H-4 EAPI Critical Path finding CLOSED** — additive `accessibility: 'full' | 'tldr-only'` field documented per D-27a; canonical Phase 4 citation-shape line preserved verbatim (`citations: { title: string, id: string }[]`) for the regex anchor in `scripts/check-artifacts.ts:1909`; explicit backward-compatibility note (Phase 4 consumers ignore unknown fields per JSON contract convention).

5. **Test adaptations (Rule 1 per Plan `<verification>` fallback)** — `app/api/ai/qa/route.test.ts` extended with two new mocks (`Policies.listAssignedAndPublishedForUser` + `QaCitationGrants.upsert`); citation-shape assertion updated to include the additive `accessibility` field; new assertion that `QaCitationGrants.upsert` is called exactly once per validIds-filtered citation (D-26 + RESEARCH gap-3 regression-locked). `scripts/check-ai-layer.test.ts` extended with the same mocks routed through the outer postgres-js transaction; the SP-1 cross-org integration test now exercises D-26 grant UPSERT too.

## Task Commits

Each task was committed atomically. All commits on `gsd/phase-5-employee-portal`:

1. **Task 1: `lib/policies/acknowledgment.ts`** — `da235a5` (feat)
2. **Task 2: `lib/ai/qa.ts`** — `623f21e` (feat)
3. **Task 3: Refactor + API-SPEC + tests** — `8faf5e6` (refactor)

**Plan metadata commit (pending):** `docs(05-04): record Plan 05-04 orchestrator completion + Wave 2 close` will pick up `.planning/phases/05-employee-portal/05-04-SUMMARY.md` + `.planning/STATE.md` + `.planning/ROADMAP.md` + `.planning/REQUIREMENTS.md`.

## Files Created/Modified

- **`lib/policies/acknowledgment.ts`** (CREATED, 180 lines) — atomic ack-recording orchestrator with typed throws per D-07/D-08; single withOrgScope tx per D-10a; D-10 silent-success per RESEARCH Pitfall 8
- **`lib/ai/qa.ts`** (CREATED, 197 lines) — Phase 4 Q&A logic extracted per D-25; D-26 grant UPSERT + D-27a accessibility annotation added inside same withOrgScope closure
- **`app/api/ai/qa/route.ts`** (147 → 49 lines) — thin HTTP wrapper; HTTP contract unchanged modulo additive D-27a field
- **`app/api/ai/qa/route.test.ts`** (+53 lines net) — extended mocks for the 2 new Phase 5 dependencies; citation assertion updated for additive field; D-26 grant UPSERT count assertion added
- **`reference/API-SPEC.md`** (+30 / -18 lines net) — additive accessibility field documented; canonical Phase 4 shape line preserved for contract-grep regex; backward-compatibility note explicit
- **`scripts/check-ai-layer.test.ts`** (+72 lines net) — mocked `Policies.listAssignedAndPublishedForUser` + `QaCitationGrants.upsert/hasGrant/listForUser` routed through outer postgres-js transaction; SP-1 cross-org test now exercises D-26 grant UPSERT too

## Decisions Made

- **D-25 order of operations inside `askQuestion`:** D-26 grant UPSERT placed AFTER `parseQaResponse` returns (so iteration uses validIds-filtered list per RESEARCH gap-3); D-27a accessibility annotation placed AFTER grant UPSERT (both inside same withOrgScope closure for atomicity). The plan explicitly granted planner discretion on this ordering per CONTEXT `### Claude's Discretion` bullet 5.
- **D-27a annotation strategy:** chose single org-scoped `Policies.listAssignedAndPublishedForUser(s, s.userId)` query (one round trip total) over per-citation `hasAssignment` round-trips. At MVP scale (<100 assignments per user) the trade-off favors fewer DB round trips; the assigned-policy query is RLS-scoped so cross-org IDs cannot slip into the `assignedIds` Set even if hallucinated.
- **HTTP wrapper line-count:** trimmed to exactly 49 lines (≤50 ceiling). Initial pass landed at 71 lines due to expanded JSDoc; compressed comments to single block while preserving each `D-NN` invariant marker so future grep-traces stay routable.
- **Test adaptation as Rule 1 deviation (not Rule 4):** the plan `<verification>` block explicitly anticipated this — "If a Phase 4 vitest in `scripts/check-ai-layer.test.ts` strictly types citations as `{title, id}` only and rejects extras, Plan 05-04 may need to extend that type — flag in SUMMARY." The fallback authorizes test adaptation as additive (no Phase 4 semantics changed) so it counts as Rule 1 (test bug surfaced by additive API field), not Rule 4 (architectural).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Phase 4 vitest broke on additive `accessibility` field + new repo dependencies**
- **Found during:** Task 3 (route refactor verification via `pnpm verify:phase-4`)
- **Issue:** `app/api/ai/qa/route.test.ts` (8 tests) and `scripts/check-ai-layer.test.ts` (1 SP-1 integration test) failed after the Plan 05-04 refactor — root cause: askQuestion now calls `Policies.listAssignedAndPublishedForUser` + `QaCitationGrants.upsert` which the Phase 4 mocks didn't expose; and citation assertions strictly compared `{ title, id }` shape against the new `{ title, id, accessibility }` shape.
- **Fix:** Extended both test files with mocks for the two new dependencies (`mockListAssignedAndPublishedForUser` + `mockQaCitationGrantsUpsert` in the unit test; thin handwritten implementations routed through outer postgres-js tx in the integration test). Citation-shape assertions updated to accept the additive `accessibility: 'tldr-only'` field (default test fixture doesn't seed assignments so all citations are tldr-only — the 'full' branch will be exercised by Plan 05-09 H-5/H-6 negative-test fixtures). Added a new assertion in the SP-1 unit test asserting `QaCitationGrants.upsert` is called exactly once per validIds-filtered citation (regression-locks RESEARCH gap-3 — if grant-UPSERT ever iterates raw fence again, this assertion fails AND the integration test would surface a foreign-org garbage row).
- **Files modified:** `app/api/ai/qa/route.test.ts`, `scripts/check-ai-layer.test.ts`
- **Verification:** `pnpm verify:phase-4` exits 0 (393/393 artifacts + 21/21 test files + 1/1 integration test file); previously 392/393 + 7/8 + 7/8 due to (a) the Plan 05-03 carry-forward citation-shape check + (b) the additive-field test breakage.
- **Committed in:** `8faf5e6` (Task 3 commit, bundled with the route refactor and API-SPEC.md update since all 3 changes are coupled to the same plan-mandated D-25 extraction)
- **Plan-authorization:** the plan's `<verification>` block at lines 555-557 explicitly anticipates this as a Rule 1 path: "If a Phase 4 vitest in `scripts/check-ai-layer.test.ts` strictly types citations as `{title, id}` only and rejects extras, Plan 05-04 may need to extend that type — flag in SUMMARY."

---

**Total deviations:** 1 auto-fixed (Rule 1 test adaptation, authorized by plan `<verification>` fallback).
**Impact on plan:** None — additive API field per D-27a + new orchestrator dependencies per D-26 are explicit plan requirements; test adaptation was a downstream consequence anticipated by the plan author. No scope creep.

## Issues Encountered

None requiring problem-solving. The `pnpm verify:phase-4` initial run surfaced two distinct failure classes (Phase 4 unit test + Phase 4 integration test) but both root-caused to the same additive `accessibility` field + new orchestrator dependencies, and the fix was mechanical (extend mocks, accept additive field, add D-26 grant-count assertion). One transient TEST DB password authentication failure surfaced on the first `verify:phase-4` re-run; cleared on retry per the known Supabase pooler password-lookup lag pattern documented in STATE.md line 124.

## User Setup Required

None — no environment variables or external service configuration changed.

## Next Phase Readiness

**Wave 2 COMPLETE (2/2):** Plan 05-03 (repositories, `e23a4a4` + `b8de7f1`) + Plan 05-04 (orchestrators, `da235a5` + `623f21e` + `8faf5e6`) both shipped. Downstream consumers ready:

- **Plan 05-05** (Wave 3 employee routes) can now wire:
  - `app/(employee)/my-policies/[id]/actions.ts::acknowledgePolicyAction` → `recordAcknowledgment(ctx, policyId, ipAddress)`
  - `app/(employee)/my-policies/ask/actions.ts::askQuestionAction` → `askQuestion(ctx, question)` (Server Action calls directly, no HTTP)
  - `app/(employee)/my-policies/[id]/page.tsx` 3-branch access decision: assigned → full PolicyView / `QaCitationGrants.hasGrant` → TL;DR-only / else → notFound()
- **Plan 05-08** (Wave 4 CI gates) — `scripts/check-policy-id-brand.ts` widening to add `lib/policies/acknowledgment.ts::recordAcknowledgment` to ORCH_TARGETS already flagged in Plan 05-08 per ADR-028 (no new work here).
- **Plan 05-09** (Wave 4 integration test) — H-5 + H-6 negative test cases for grant UPSERT (pure hallucination + cross-org real-UUID) can now exercise `QaCitationGrants.listForUser` to assert zero garbage rows, complementing the SP-1 unit test's grant-call-count assertion landed today.

## Verify Chain Status

- `pnpm tsc --noEmit` — exits 0 (verified after each task commit)
- `pnpm verify:phase-4` — exits 0 (393/393 artifacts + 21/21 test files + 1/1 integration test file); Plan 05-03 carry-forward citation-shape check now PASSES (was the sole failing assertion)
- `pnpm verify:phase-5` — not yet wired (Plan 05-08 ships `verify:phase-5` chain composition per D-23)

## Threat Surface Scan

No new threat surface introduced by this plan. The new files extend existing trust boundaries already mapped in Phase 5 CONTEXT § R-6 Q&A Surface and Acknowledgment Server Action sections:
- `recordAcknowledgment` runs under the existing Server Action → orchestrator boundary (PolicyId brand at trust boundary per ADR-028 + D-10b; single withOrgScope per D-10a).
- `askQuestion` runs under the existing Phase 4 Q&A boundary plus the new D-26 grant write path (covered by Pitfall 3 / RESEARCH gap-3 mitigation now in place); cross-org isolation locked at three points (D-41 same-closure, post-validIds-filter iteration, RLS-scoped assignedIds query) all inside same withOrgScope.

## Self-Check: PASSED

- `lib/policies/acknowledgment.ts` — FOUND (verified via `wc -l`: 180 lines)
- `lib/ai/qa.ts` — FOUND (verified via `wc -l`: 197 lines)
- `app/api/ai/qa/route.ts` — refactored to 49 lines (verified)
- `reference/API-SPEC.md` — H-4 closure verified (3 `D-27a` matches, 2 `additive` matches, 5 `accessibility` matches via grep)
- Commit `da235a5` — FOUND in `git log` (Task 1 — recordAcknowledgment)
- Commit `623f21e` — FOUND in `git log` (Task 2 — askQuestion extraction)
- Commit `8faf5e6` — FOUND in `git log` (Task 3 — route refactor + API-SPEC.md + test adaptations)

---
*Phase: 05-employee-portal*
*Plan: 04*
*Completed: 2026-05-23*
