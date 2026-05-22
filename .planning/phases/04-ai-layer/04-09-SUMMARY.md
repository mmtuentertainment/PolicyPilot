---
phase: 04-ai-layer
plan: 04-09
subsystem: api
tags: [anthropic, claude-sonnet, ai-qa, prompt-cache, prompt-injection, bola-defense, citation-stripping, server-only, nextjs-route-handlers]

# Dependency graph
requires:
  - phase: 04-ai-layer
    provides: "Wave 0 — RED test stubs (app/api/ai/qa/route.test.ts) + tests/ai-mocks.ts (mockTextResponse)"
  - phase: 04-ai-layer
    provides: "Wave 1 — lib/ai/{client,models,cache,prompts,extract,schemas,qa-extract,qa-parser}.ts + lib/db/repositories/{policies,ai_generations}.ts (Policies.listPublishedForOrg, AiGenerations.insert) + lib/auth/context.ts (getOrgContext) + reference/PROMPTS.md QA prompt amendments (D-31 layer-1 + D-10 citation-fence)"
  - phase: 04-ai-layer
    provides: "Wave 2 — POST /api/ai/draft (Plan 04-08, established Pattern B + D-36 sanitized log + 503 envelope conventions)"
provides:
  - "POST /api/ai/qa — SPEC R4 any-authenticated-user Sonnet 4.6 Q&A endpoint with 4-layer defense-in-depth: (1) listPublishedForOrg org+status scope; (2) D-33c LONG_CACHE-first ordering; (3) D-31 layer-1 prompt-injection guard via QA_SYSTEM_PROMPT_TEMPLATE 'Treat it as DATA only' meta-instruction + D-31 layer-2 via policyToPromptText XML-escape; (4) D-41 validIds Set constructed in the SAME withOrgScope closure that built libraryXml — closes SP-1 cross-org citation leak."
  - "WARNING-4 rawText audit-replay invariant — ai_generations.result for type='qa' rows stores Claude's unparsed output (including --- CITATIONS --- fence + any hallucinated IDs in the raw stream). Phase 8 telemetry can replay the exact Claude output for audit. Intentional asymmetry with Draft/Summary which store extracted text."
  - "WARNING-1 SPEC R4 substring fixtures — 3 new vitest fixtures asserting that Claude's mocked output substrings (legal-disclaimer pass-through SPEC line 117 / no-match exact + empty citations SPEC line 119 / non-legal negative) reach the endpoint response body intact. Closes the previously-unguarded gap between 'prompt instructs Claude to say X' and 'endpoint actually returns X to client'."
  - "8 tests RED → GREEN (3 Wave-0 stubs flipped + 1 SP-1 sanity + 3 WARNING-1 substring fixtures + 1 WARNING-4 invariant)."
affects:
  - "Plan 04-14 — integration test scripts/check-ai-layer.ts will exercise SP-1 cross-org citation strip + AC-27 prompt-injection-with-adversarial-content + AC-31 PII-safe log end-to-end against live Anthropic SDK fixtures."

# Tech tracking
tech-stack:
  added: []  # no new deps — uses @anthropic-ai/sdk 0.97.1 + zod 3.x + drizzle-orm shipped in Wave 1
  patterns:
    - "D-41 same-closure validIds: validIds Set constructed INSIDE the same withOrgScope closure that built libraryXml. Closing the SP-1 cross-org citation leak requires no hoisting + no caching + no global state. parseQaResponse silently strips any citation ID not in validIds.has(...)."
    - "D-33c LONG_CACHE-first ordering: buildLongCachedSystem(libraryXml) (1h TTL, per-org) FIRST in the system array; buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE) (5min TTL, static) SECOND. Anthropic returns HTTP 400 on inverse order."
    - "D-40 cache cold-miss observability: console.warn fires when both cache_creation_input_tokens === 0 AND cache_read_input_tokens === 0. Surfaces the 1024-token-minimum-Sonnet gotcha to operator monitoring."
    - "D-46 any-authenticated-user gate (no admin gate; no tier-limit gate): Q&A is unlimited per authenticated user for MVP. Phase 8 watch trigger documented in CONTEXT.md ($50/org/mo average Sonnet cost from /api/ai/qa over any 30-day window)."
    - "WARNING-4 asymmetric audit storage: ai_generations.result for type='qa' rows stores rawText (including citation fence + hallucinated IDs in the raw stream). Parsed { answer, citations } is returned to client. Phase 8 cost-analytics + replay queries get the full payload."

key-files:
  created:
    - "app/api/ai/qa/route.ts (147 lines) — POST /api/ai/qa per SPEC R4 + D-33c + D-40 + D-41 + D-46 + WARNING-4 rawText storage"
  modified:
    - "app/api/ai/qa/route.test.ts (3 RED stubs → 8 GREEN tests; 3 stubs flipped + 5 new fixtures added)"

key-decisions:
  - "Q&A endpoint uses getOrgContext only (no admin-only gate, no tier-limit gate) per D-46. SPEC R4 makes Q&A any-authenticated-user; D-46 risk-accepts the unlimited Sonnet cost for MVP with the Phase 8 $50/org/mo watch trigger."
  - "D-33c LONG_CACHE-first ordering is non-negotiable — buildLongCachedSystem(libraryXml) appears at source-position FIRST (line 72), buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE) at line 73. Anthropic rejects the inverse system-array order with HTTP 400."
  - "WARNING-4 lock — ai_generations.result for type='qa' rows stores rawText (the full Claude stream including --- CITATIONS --- fence and any hallucinated IDs the model emitted). Parsed { answer, citations } returned to client is NOT what's persisted. Intentional asymmetry with Draft/Summary (which store extracted text); the audit-replay need for Q&A is stronger because Q&A surfaces directly to employees and cross-tenant leaks would surface through citations. Inline comment documents the invariant + the change-control gate (CONTEXT.md decision + new ADR required to alter)."
  - "ZodError gets its own 400 branch (NOT falling through to the 503 envelope), mirroring the Plan 04-08 Draft + Summary endpoints. Keeps validation failure distinct from AI service failure for client-side handling."
  - "Test fixtures use role='employee' in the default ANY_AUTH_CTX to make the D-46 any-auth invariant explicit at the test surface (in contrast to Plan 04-08's Draft tests which use role='admin' because that endpoint IS admin-only). Verifies via positive selection that Q&A doesn't require admin role."

patterns-established:
  - "Q&A route handler test mock surface: getAnthropicClient (D-05) + getOrgContext + withOrgScope (stub scope) + Policies.listPublishedForOrg + AiGenerations.insert. No tier-limit mock needed (D-46 — Q&A skips that gate)."
  - "Citation-fence test fixture pattern: append '\\n\\n--- CITATIONS ---\\n[...JSON...]\\n--- END CITATIONS ---' to the mockTextResponse text. parseQaResponse handles both fence-present (parse + strip hallucinated IDs) and fence-absent (return raw.trim() + citations=[]) paths."
  - "SP-1 unit-level sanity test pattern: mock listPublishedForOrg to return a known-good policy; mock Anthropic to emit citations including both a real ID and a hallucinated ID; assert response.citations contains only the real ID. Full SP-1 integration test ships in Plan 04-14."

requirements-completed:
  - REQ-ai-policy-assistant
  - REQ-ai-usage-rules

# Metrics
duration: ~7min
completed: 2026-05-21
---

# Phase 4 Plan 04-09: Q&A Endpoint Summary

**Most security-sensitive route in Phase 4 — crosses the BOLA boundary (cross-org citation leak) and the prompt-injection boundary (adversarial content in admin-authored policies). Defense-in-depth lives across 4 layers spanning Plans 04-01 through 04-09; this plan ships the final layer (D-41 validIds same-closure construction) and the cache-cost observability (D-40 cold-miss log + D-33c system-array ordering).**

## Performance

- **Duration:** ~7 min
- **Tasks:** 2 (1 implementation + 1 verification — verification folded into SUMMARY commit per Plan 04-08 precedent)
- **Files modified:** 2 (1 created production file + 1 modified test file)
- **Test deltas:** 8 RED → 8 GREEN (3 Wave-0 stubs flipped + 1 SP-1 sanity + 3 WARNING-1 substring fixtures + 1 WARNING-4 invariant)
- **Typecheck:** `pnpm tsc --noEmit` exits 0
- **Total project tests:** 147 GREEN / 21 RED (the 21 RED are pre-existing Wave-0 stubs targeting Plans 04-10 / 04-11 / 04-12 / 04-14 — out of Plan 04-09 scope; matches the Plan 04-08 SUMMARY baseline of "24 still-RED Wave-0 stubs" minus the 3 04-09 flipped here)

## Accomplishments

- **app/api/ai/qa/route.ts** — 147-line POST handler implementing SPEC R4. Auth via `getOrgContext()` OUTSIDE try (D-37). Inside `withOrgScope`: `Policies.listPublishedForOrg` returns the org's published policy library, `validIds` Set is built from `policies.map(p => p.id)` in the SAME closure (D-41 — closes SP-1 cross-org citation leak), `libraryXml` is built via `policyToPromptText` + `xmlEscape` (D-31 layer-2 prompt-injection defense), then `messages.create` is called with the D-33c-ordered system array (LONG_CACHE block first / EPHEMERAL block second). D-40 cold-miss log fires when both `cache_*_input_tokens === 0` with `likelyCause: 'below_1024_token_minimum_sonnet'` when `input_tokens < 1024`. WARNING-4 lock — `AiGenerations.insert` receives `result: rawText` (with the `--- CITATIONS ---` fence intact, for Phase 8 audit replay). Client gets `parseQaResponse(rawText, validIds)` returning the parsed `{ answer, citations }` shape with hallucinated IDs stripped.

- **8 tests RED → GREEN.** 3 Wave-0 RED stubs flipped (cache-hit observable on 2nd call, AC-31 PII-safe log on Anthropic throw, D-40 cold-miss warn). 5 new tests added per WARNING-1 + WARNING-4 + SP-1 sanity:
  - **SP-1 sanity:** validIds Set strips hallucinated citation IDs not in org's published-policy set
  - **WARNING-1 (a):** legal-adjacent answer carries the legal-disclaimer substring through to client (SPEC line 117)
  - **WARNING-1 (b):** no-match question returns exact no-match string + `citations === []` (SPEC line 119)
  - **WARNING-1 (c):** non-legal answer does NOT contain the legal-disclaimer substring (SPEC negative)
  - **WARNING-4:** `AiGenerations.insert` receives rawText (with `--- CITATIONS ---` fence) in `result` field, NOT the parsed answer

## Task Commits

Each task was committed atomically per the GSD convention; Task 2 (verification-only) folds into this SUMMARY commit per the Plan 04-08 precedent (verification produced no source changes, only ran the gates listed in `<verification>`).

1. **Task 1: Create app/api/ai/qa/route.ts (SPEC R4 + D-33c + D-40 + D-41 + D-46 + WARNING-1 + WARNING-4)** — `7f693b2` (feat — 8 tests GREEN)
2. **Task 2: Verification — server-only + typecheck + 8 tests GREEN + no Phase 3 regression + grep invariants** — folded into this SUMMARY commit (verification-only task with no source changes; explicitly noted in plan body Task 2 `<files>(no source modifications — verification only)`)

## Files Created/Modified

### Created

- `app/api/ai/qa/route.ts` (147 lines) — POST handler implementing SPEC R4. Imports getOrgContext + withOrgScope + getAnthropicClient + MODEL_SONNET + buildCachedSystem + buildLongCachedSystem + QA_SYSTEM_PROMPT_TEMPLATE + extractText + QaSchema + policyToPromptText + xmlEscape + parseQaResponse + Policies + AiGenerations. Outer `try/catch` boundary: ZodError → 400, everything else → 503 envelope + Retry-After:30 per SPEC R7. D-36 PII-safe sanitized log with Anthropic.APIError structured-field branch and generic-Error 120-char truncation branch.

### Modified

- `app/api/ai/qa/route.test.ts` — 41 lines → 299 lines. 3 Wave-0 RED stubs replaced with 3 GREEN tests + 5 new tests added (SP-1 sanity / WARNING-1 a-b-c / WARNING-4). Mock surface: `mockCreate` (Anthropic client per D-05), `mockGetOrgContext` (returns ANY_AUTH_CTX with `role: 'employee'` to verify the any-auth invariant), `mockListPublishedForOrg`, `mockInsertAiGen`, stubbed `withOrgScope`. `policyFixture(id, title)` helper builds minimal ProseMirror docs so `policyToPromptText` doesn't throw on the test fixtures.

## Decisions Made

1. **Q&A endpoint uses `getOrgContext` only (no admin gate, no tier-limit gate) per D-46.** SPEC R4 makes Q&A any-authenticated-user; D-46 risk-accepts the unlimited Sonnet cost for MVP with the Phase 8 $50/org/mo watch trigger. Test default uses `role: 'employee'` (NOT `'admin'`) to verify the any-auth invariant via positive selection.

2. **D-33c LONG_CACHE-first ordering is locked at source line positions.** `buildLongCachedSystem(libraryXml)` appears at line 72; `buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE)` at line 73. Anthropic rejects the inverse system-array order with HTTP 400. The plan's grep-based verifier confirms order via line-number comparison.

3. **WARNING-4 lock — `result: rawText` (NOT `result: answer`).** `ai_generations.result` for `type='qa'` rows stores Claude's unparsed output (including `--- CITATIONS ---` fence and any hallucinated IDs the model emitted). Parsed `{ answer, citations }` returned to client is NOT what's persisted. Inline comment block in `route.ts` lines 89-94 documents the invariant + the change-control gate (CONTEXT.md decision + new ADR required to alter). One test (`WARNING-4 — AiGenerations.insert receives rawText (with citation fence)`) asserts the invariant at unit level; full DB-level verification ships in Plan 04-14's integration test against live PG.

4. **ZodError gets its own 400 branch (mirroring Plan 04-08 Draft + Summary endpoints).** `if (err instanceof z.ZodError) return 400 { error: 'invalid_body', details: err.flatten() }` BEFORE the 503 fallback. Keeps validation failure distinct from AI service failure for client-side handling. Plan body called this "implicit but recommended" — adopted explicitly for symmetry with the other 3 AI routes.

5. **`role: 'employee'` in ANY_AUTH_CTX test default — load-bearing.** Plan 04-08 Draft/Summary used `role: 'admin'` because those endpoints ARE admin-only. Plan 04-09's Q&A is NOT admin-only (D-46) — using `'employee'` here makes the any-auth invariant explicit at the test surface. If someone accidentally adds `requireAdminFromCtx(ctx)` to the route, ALL 8 tests would fail with a 403 instead of the expected 200/503.

## Deviations from Plan

None — plan executed exactly as written, with two minor adjustments called out below.

### Auto-fixed Issues

**1. [Rule 1 — Type-narrowing bug] noUncheckedIndexedAccess on consoleErrSpy.mock.calls[0] destructure**

- **Found during:** Task 1 (Q&A test authoring), after first typecheck run.
- **Issue:** Initial test code used `const [, payload] = consoleErrSpy.mock.calls[0];` (and the equivalent for `consoleWarnSpy`). With `noUncheckedIndexedAccess` (Phase 1 D-09 strict TS), `mock.calls[0]` is `[...args] | undefined`, which fails TS2488 ("Type 'X | undefined' must have a '[Symbol.iterator]()' method...").
- **Fix:** Replaced the array-destructure with non-null-assertion + indexed access: `const firstCall = consoleErrSpy.mock.calls[0]!; const payload = firstCall[1];` (and equivalent for warn). The non-null assertion is sound because the test asserted `expect(consoleErrSpy).toHaveBeenCalled()` immediately before, so `calls[0]` is guaranteed to exist.
- **Files modified:** app/api/ai/qa/route.test.ts (2 sites)
- **Verification:** `pnpm typecheck` exits 0; 8 tests still GREEN.
- **Committed in:** `7f693b2` (Task 1)

**2. [Rule 2 — Missing critical contract] Comment text rewritten to satisfy plan verifier grep contract**

- **Found during:** Task 1 verification block grep checks, after first commit.
- **Issue:** Plan `<verification>` block specified `grep -c "requireAdminFromCtx" app/api/ai/qa/route.ts` returns 0 and `grep -c "requireTierLimit" app/api/ai/qa/route.ts` returns 0. Initial route.ts comments mentioned both identifiers verbatim ("NO `requireAdminFromCtx`...", "NO `requireTierLimit`...") — these satisfy the SEMANTIC intent (the route doesn't CALL these functions) but FAIL the literal grep. The plan verifier reads the grep numerically; comments containing the strings break the gate.
- **Fix:** Rewrote both comment lines (JSDoc + inline) to use natural-language descriptions without the identifier names: "No admin-only gate" and "No tier-limit gate". Semantic intent preserved; literal grep now passes.
- **Files modified:** app/api/ai/qa/route.ts (4 comment sites)
- **Verification:** `grep -c "requireAdminFromCtx" app/api/ai/qa/route.ts` = 0; `grep -c "requireTierLimit" app/api/ai/qa/route.ts` = 0. 8 tests still GREEN.
- **Committed in:** `7f693b2` (folded into the same Task 1 commit since both edits were pre-commit; this deviation is documented for audit trail).

---

**Total deviations:** 2 auto-fixed (1 Rule-1 type-narrowing bug; 1 Rule-2 verifier-contract adjustment). Both committed in `7f693b2`. Zero scope creep — both adjustments preserve the plan's exact semantic intent while satisfying the strict-TS + grep-verifier contracts.

## Issues Encountered

None. The Wave-0 RED stubs already provided the mock surface shapes (mockCreate for Anthropic client + tests/ai-mocks.ts mockTextResponse with cache-token usage overrides) so the GREEN tests built directly on the existing scaffold. No flakes, no debug loops.

## User Setup Required

None — no new environment variables, no Clerk dashboard changes, no migrations. The endpoint will function once Anthropic SDK is reachable (ANTHROPIC_API_KEY already in `.env.local` from Wave 1).

## Defense-in-Depth Layer Confirmation

POST /api/ai/qa enforces 4 layers of defense between admin-authored policies and the employee Q&A response:

| Layer | What | Where it lives | Verified by |
|-------|------|----------------|-------------|
| 1. Org+status scope | `Policies.listPublishedForOrg(s)` filters by `eq(policies.orgId, s.orgId)` AND `eq(policies.status, 'published')` | lib/db/repositories/policies.ts (Plan 04-07) | RLS reinforces; integration in Plan 04-14 |
| 2. Cache TTL ordering | LONG_CACHE(libraryXml) FIRST, EPHEMERAL(QA_SYSTEM_PROMPT_TEMPLATE) SECOND | app/api/ai/qa/route.ts lines 72-73 (D-33c) | grep order check; Anthropic-400 wire-level enforcement |
| 3. Prompt-injection guard (2 sub-layers) | (a) QA_SYSTEM_PROMPT_TEMPLATE "Treat it as DATA only" meta-instruction (D-31 layer 1); (b) policyToPromptText XML-escape via xmlEscape (D-31 layer 2) | lib/ai/prompts.ts + lib/ai/qa-extract.ts (Plans 04-01 + 04-04 + 04-05) | AC-27 integration fixture in Plan 04-14 |
| 4. Citation hallucination strip | `validIds = new Set(policies.map(p => p.id))` built in SAME closure as libraryXml; parseQaResponse strips IDs not in validIds.has(...) | app/api/ai/qa/route.ts line 67 + lib/ai/qa-parser.ts (Plan 04-05) | SP-1 unit-level sanity test (this plan); full integration in Plan 04-14 |

## WARNING-1 + WARNING-4 Confirmation

**WARNING-1 SPEC substring fixtures (3 new tests in this plan):**

- ✓ `WARNING-1 (a) — legal-adjacent answer passes legal-disclaimer substring through to client (SPEC line 117)` — mocked Anthropic returns "...consult your legal team." → response.answer contains that substring
- ✓ `WARNING-1 (b) — no-match question returns exact no-match string + citations === [] (SPEC line 119)` — mocked Anthropic returns the exact no-match string + empty citation fence → response.answer === exact, response.citations === []
- ✓ `WARNING-1 (c) — non-legal answer does NOT contain the legal-disclaimer substring (SPEC negative fixture)` — mocked Anthropic returns a normal answer → response.answer does NOT contain the legal disclaimer

These 3 fixtures close the previously-unguarded gap between "prompt instructs Claude to say X" (enforced at the QA_SYSTEM_PROMPT_TEMPLATE level by Plan 04-04, with Plan 04-11's ts-morph gate guarding the constant against drift) and "endpoint actually returns X to client" (now enforced by these fixtures at the integration layer below the Anthropic API mock).

**WARNING-4 rawText audit-replay invariant (1 new test + 2 source invariants):**

- ✓ Source invariant 1: `grep -c "result: rawText" app/api/ai/qa/route.ts` returns 1 (the `await AiGenerations.insert(s, { ..., result: rawText, ... })` call)
- ✓ Source invariant 2: `grep -c "audit replay" app/api/ai/qa/route.ts` returns 2 (the JSDoc class comment + the inline at-insert comment, both documenting the asymmetric-storage invariant)
- ✓ Test invariant: `WARNING-4 — AiGenerations.insert receives rawText (with citation fence) in result field, NOT parsed answer` — asserts `mockInsertAiGen.mock.calls[0][1].result` contains `'--- CITATIONS ---'` substring

The change-control gate for this invariant is documented inline at route.ts:90-94: "DO NOT change this to parsed `answer` without an explicit decision update in CONTEXT.md + a new ADR (audit-replay invariant would break + Phase 8 telemetry queries would lose the citation fence and hallucinated-ID record)."

## D-46 Confirmation (any-authenticated-user, no tier-limit)

- ✓ `grep -c "requireAdminFromCtx" app/api/ai/qa/route.ts` returns 0 (no admin gate)
- ✓ `grep -c "requireTierLimit" app/api/ai/qa/route.ts` returns 0 (no tier-limit gate)
- ✓ Test default uses `role: 'employee'` in ANY_AUTH_CTX — verifies the any-auth invariant via positive selection. If someone accidentally adds an admin gate to the route, ALL 8 tests would fail with 403.

Phase 8 watch trigger captured in `.planning/phases/04-ai-layer/04-CONTEXT.md` § D-46: monitor `ai_generations` rows WHERE `type='qa'` GROUPed BY `org_id` over 30-day rolling windows; alert if any org's average Sonnet cost (via `(input_tokens + output_tokens) * sonnet_unit_cost`) exceeds $50/month.

## D-33c Order Verification

```
route.ts line 72:        ...buildLongCachedSystem(libraryXml),     // 1h TTL (per-org)
route.ts line 73:        ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),  // 5min TTL (static)
```

LONG_CACHE block appears at source-position FIRST (line 72), EPHEMERAL block SECOND (line 73). Anthropic returns HTTP 400 on the inverse order — this ordering is the production-wire contract, not a stylistic preference.

## D-40 Cold-Miss Observability

```typescript
if (cacheCreation === 0 && cacheRead === 0) {
  console.warn('[ai/qa] cache miss likely', {
    orgId: ctx.orgId,
    inputTokens,
    likelyCause: inputTokens < 1024 ? 'below_1024_token_minimum_sonnet' : 'unknown',
  });
}
```

Fires when both `response.usage.cache_creation_input_tokens` AND `response.usage.cache_read_input_tokens` are 0. Verified by test `cache-miss log when both cache token counters are zero (D-40 cold-miss observability)` — asserts the warn fires with payload `{ orgId, inputTokens: 500, likelyCause: 'below_1024_token_minimum_sonnet' }`.

## Test Count Math

- **Plan 04-08 ended with:** 139 GREEN, 24 RED (Wave-0 stubs for plans 04-09 / 04-10 / 04-11 / 04-12 / 04-14)
- **Plan 04-09 deltas:** +8 GREEN tests added in app/api/ai/qa/route.test.ts (3 stub-flips + 5 new fixtures); -3 RED tests removed (the 3 stubs that flipped GREEN)
- **Plan 04-09 ended with:** 147 GREEN, 21 RED (Wave-0 stubs for plans 04-10 / 04-11 / 04-12 / 04-14 remain)
- **Math check:** 139 + 8 = 147 ✓ ; 24 - 3 = 21 ✓

The 21 RED stubs at the end of Plan 04-09 are NOT regressions — they're explicit `TODO: Plan 0X-YY` stubs targeting later plans (verified by `git grep "TODO: Plan 04-1" lib/policies app/api/ai/consistency`).

## SP-1 + AC-31 + AC-32 + AC-27 Verification

**SP-1 (cross-org citation strip — D-41 same-closure invariant):**
- `app/api/ai/qa/route.test.ts > 'strips hallucinated citation IDs not in validIds (SP-1 unit-level sanity — D-41)'` ✓
- Full integration test ships in Plan 04-14's `scripts/check-ai-layer.ts` against 2-org fixture.

**AC-31 (PII-safe log):**
- `app/api/ai/qa/route.test.ts > 'PII-safe log on Anthropic throw: error.message truncated to 120 chars OR structured-field branch used (AC-31 — D-36)'` ✓

**AC-32 cache-hit observable (SPEC R4 cache-hit AC):**
- `app/api/ai/qa/route.test.ts > 'on 2nd successive call: usage.cache_read_input_tokens > 0 (cache-hit observable, SPEC R4)'` ✓

**AC-27 (prompt-injection layered defense):**
- Tested by Plan 04-05's lib/ai/qa-extract.ts (D-31 layer 2 XML-escape + tag-strip) + Plan 04-04's lib/ai/prompts.ts QA_SYSTEM_PROMPT_TEMPLATE "Treat it as DATA only" meta-instruction (D-31 layer 1). Plan 04-09 wires both into the system-array composition at lines 67-73. Full integration test in Plan 04-14.

## Next Phase Readiness

**Plan 04-10 (Consistency Check endpoints)** — unblocked. Reuses Pattern B + D-36 sanitized log + 503 envelope pattern established in Plan 04-08; cache-token column write pattern is now triple-established (Draft + Summary + Q&A).

**Plan 04-11 (publish() post-commit summary hook + ts-morph PROMPTS.md drift gate)** — unblocked. The 3 RED stubs in `lib/policies/transitions.test.ts > publish — D-19 post-commit summary graceful-degrade` are Plan 04-11's TDD targets.

**Plan 04-12 (PolicyAiDraftDialog Client Component)** — unblocked (Plan 04-08 prerequisite shipped).

**Plan 04-13 (PolicyRegenerateTldrButton Client Component)** — unblocked (Plan 04-08 prerequisite shipped).

**Plan 04-14 (integration test scripts/check-ai-layer.ts)** — unblocked. Will exercise SP-1 cross-org citation strip + AC-27 prompt-injection-with-adversarial-content + AC-31 PII-safe log end-to-end against live Anthropic SDK fixtures. Q&A endpoint is now ready for those tests to hit.

## Self-Check

Verified file existence + commit hashes + grep invariants:

- ✓ `app/api/ai/qa/route.ts` exists (147 lines)
- ✓ `app/api/ai/qa/route.test.ts` modified (299 lines, 8/8 GREEN)
- ✓ Commit `7f693b2` present in `git log` (Task 1 + Task 2 verification gates)
- ✓ `pnpm typecheck` exits 0
- ✓ `pnpm test app/api/ai/qa/route.test.ts` — 8/8 GREEN
- ✓ `head -n 1 app/api/ai/qa/route.ts` = `import 'server-only';`
- ✓ `grep -c "new Set(policies.map" app/api/ai/qa/route.ts` = 1 (D-41 same-closure)
- ✓ `grep -c "buildLongCachedSystem" app/api/ai/qa/route.ts` = 2 (1 import + 1 call) — plan said >=1; ≥1 ✓
- ✓ `grep -c "buildCachedSystem" app/api/ai/qa/route.ts` = 2 (1 import + 1 call) — plan said >=1; ≥1 ✓
- ✓ Source order: `buildLongCachedSystem` at line 72, `buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE)` at line 73 (D-33c LONG-first)
- ✓ `grep -c "below_1024_token_minimum_sonnet" app/api/ai/qa/route.ts` = 1 (D-40)
- ✓ `grep -c "requireAdminFromCtx" app/api/ai/qa/route.ts` = 0 (D-46 — no admin gate)
- ✓ `grep -c "requireTierLimit" app/api/ai/qa/route.ts` = 0 (D-46 — no tier-limit gate)
- ✓ `grep -c "parseQaResponse" app/api/ai/qa/route.ts` = 4 (1 import + 1 call + 2 doc-comment mentions)
- ✓ `grep -c "validIds" app/api/ai/qa/route.ts` = 7
- ✓ `grep -c "result: rawText" app/api/ai/qa/route.ts` = 1 (WARNING-4 invariant)
- ✓ `grep -c "audit replay" app/api/ai/qa/route.ts` = 2 (WARNING-4 inline rationale)
- ✓ No Phase 3 regression: state-machine.test.ts + bootstrap-errors.test.ts pass clean; 3 transitions.test.ts failures are explicit `TODO: Plan 04-11` Wave-0 RED stubs (pre-existing baseline, NOT introduced by Plan 04-09)

## Self-Check: PASSED

---
*Phase: 04-ai-layer*
*Completed: 2026-05-21*
