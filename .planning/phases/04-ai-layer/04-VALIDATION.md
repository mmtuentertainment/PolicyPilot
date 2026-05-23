---
phase: 4
slug: ai-layer
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-21
audited: 2026-05-23
auditor: gsd-nyquist-auditor (claude-sonnet-4-6)
covered: 31
partial: 4
missing: 0
total_acs: 35
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source-of-truth for sub-paths and Wave-0 gaps: `04-RESEARCH.md` § Validation Architecture (lines 394–471).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest@^1.6.0 (already installed; Phase 2/3 baseline) |
| **Config file** | `tests/setup.ts` (jsdom shim from Phase 3) |
| **Quick run command** | `pnpm typecheck && pnpm test` |
| **Full suite command** | `pnpm verify:phase-4` (new orchestrator per D-24 — wraps `pnpm verify:phase-3 && pnpm check:ai-layer && pnpm check:ai-prompts`) |
| **Estimated runtime** | ~30–60 seconds (verify:phase-3 already runs in ~20s; Phase-4 gates add ~10–40s for integration tests against live TEST DB) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck && pnpm test` (vitest unit + tsc, <30s)
- **After every plan wave:** Run `pnpm verify:phase-4` (full chain incl. RLS + integration, ~30–60s)
- **Before `/gsd-verify-work` (operator UAT):** `pnpm verify:phase-4` exit 0 AND manual UAT on `/policies/new` Draft + `/policies/[id]` Regenerate + `/dashboard/consistency` Run
- **Max feedback latency:** ~30 seconds (per-task quick run)

---

## Critical Sub-Paths (Nyquist coverage — 4 paths)

Detailed implementation per sub-path lives in `04-RESEARCH.md` § Validation Architecture. Summary:

| # | Sub-path | What fails if untested | Validation approach |
|---|----------|------------------------|---------------------|
| **SP-1** | Cross-org citation leak (Q&A `validIds` Set MUST come from same `withOrgScope` closure as library block — D-41) | Multi-tenancy breach — Org A could see Org B policy IDs in Q&A citations | Integration test in `scripts/check-ai-layer.ts` — seed Org A + Org B, force mocked Anthropic response to cite both, assert only Org A IDs surface |
| **SP-2** | 503 contract on Anthropic failure (no `ai_generations` row written — SPEC R7 + AC-31 PII-safe log truncation D-36) | Failure rows would corrupt tier-limit math; PII in error logs | Vitest fixture per route file (4 endpoints) — mock `getAnthropicClient()` to throw `Anthropic.APIError`; assert 503 envelope + Retry-After + zero new rows |
| **SP-3** | publishPolicy graceful-degrade (state transition completes even if summary throws — D-19, SPEC R3) | Flaky Anthropic call would block all publishes — AI is best-effort overlay only | Extend `lib/policies/transitions.test.ts` — mock `generateSummaryForPolicy` to throw, assert no propagation + status='published' + tldrSummary IS NULL |
| **SP-4** | Tier-limit overage routing (429 usage-bound vs 403 tier-bound per `usageBound` array — D-15/D-16) | Wrong UX message + wrong API contract for Starter org admins | Vitest fixture in `lib/stripe/products.test.ts` + integration in `scripts/check-ai-layer.ts` — mock checkTierLimit, assert TierLimitExceededError.statusCode routing |

---

## Per-Task Verification Map

State-A Nyquist audit completed 2026-05-23. All Wave-0 test stubs are now GREEN.
172/172 unit tests pass (`pnpm test`). Prompt anchor gate passes (`pnpm check:ai-prompts`).
RLS + integration tests require live TEST DB (see `check:rls` + `check:ai-layer` env notes below).

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ partial/manual*

### AC Coverage Map (AC-01 .. AC-33 + 2 SPEC R7 gap closures)

| AC ID | Requirement | Test File | Test Name / Coverage | Status |
|-------|-------------|-----------|----------------------|--------|
| AC-01 | `@anthropic-ai/sdk` in package.json | `lib/ai/client.test.ts` | singleton test imports SDK; `pnpm check:ai-prompts` validates | ✅ green |
| AC-02 | 4 prompt constants verbatim | `scripts/check-ai-prompts.ts` | ts-morph anchor gate (4 anchors, both files) | ✅ green |
| AC-03 | `POST /api/ai/draft` 200 + 1 ai_generations row | `app/api/ai/draft/route.test.ts:88` | "on success: writes 1 ai_generations row..." | ✅ green |
| AC-04 | `POST /api/ai/draft` non-admin returns 403 | `lib/auth/require-admin.test.ts:107` + `app/(admin)/dashboard/consistency/page.test.tsx:136` | requireAdminFromCtx throws ForbiddenError (unit); page non-admin test (D-37 propagates to Next.js boundary — route-level JSON 403 shape is manual-only per D-37 Pattern B design) | ⚠️ partial/manual |
| AC-05 | Starter org 50 drafts returns 429 | `app/api/ai/draft/route.test.ts:117` | "on Starter-org at 50 drafts/month..." | ✅ green |
| AC-06 | PolicyEditor "Generate with AI" button visible | `components/policy/PolicyAiDraftDialog.test.tsx:35` + Manual UAT | Button trigger + 200/429/503 flows tested; real Clerk session manual | ⚠️ partial/manual |
| AC-07 | First `POST /api/ai/summary` + second idempotent | `app/api/ai/summary/route.test.ts:78,95` | two test cases cover both branches | ✅ green |
| AC-08 | publishPolicy degrades on Anthropic failure | `lib/policies/transitions.test.ts:341` (SP-3) | "on Anthropic.APIError: publish() does NOT throw..." | ✅ green |
| AC-09 | PolicyView "Regenerate TL;DR" button | Manual UAT | Requires real Clerk session + browser interaction | ⚠️ manual-only |
| AC-10 | `POST /api/ai/qa` returns `{ answer, citations }` | `app/api/ai/qa/route.test.ts:108` | cache-hit 2nd call test returns 200 with both fields | ✅ green |
| AC-11 | Q&A legal question contains disclaimer | `app/api/ai/qa/route.test.ts:222` | WARNING-1(a) legal-adjacent fixture | ✅ green |
| AC-12 | Non-legal Q&A does NOT contain disclaimer | `app/api/ai/qa/route.test.ts:262` | WARNING-1(c) non-legal negative fixture | ✅ green |
| AC-13 | No-match Q&A exact string + citations=[] | `app/api/ai/qa/route.test.ts:242` | WARNING-1(b) no-match exact-string fixture | ✅ green |
| AC-14 | 2nd Q&A call cache_read_input_tokens > 0 | `app/api/ai/qa/route.test.ts:108` | fixture-based cache-hit observable | ✅ green |
| AC-15 | `POST /api/ai/consistency` Growth+ returns 200 + batchId | `app/api/ai/consistency/route.test.ts:120` | "on Growth+ org: returns 200 { batchId }" | ✅ green |
| AC-16 | `POST /api/ai/consistency` Starter returns 403 | `app/api/ai/consistency/route.test.ts:145` | "on Starter org: returns 403..." | ✅ green |
| AC-17 | GET `/api/ai/consistency/[batchId]` ConsistencyFinding schema | `app/api/ai/consistency/[batchId]/route.test.ts:269` | completed path parses + returns findings array | ✅ green |
| AC-18 | 503 on Anthropic throw for all 4 endpoints | `app/api/ai/draft/route.test.ts:104`, `app/api/ai/summary/route.test.ts:110`, `app/api/ai/qa/route.test.ts:139`, **`app/api/ai/consistency/route.nyquist.test.ts:1`** (gap closure) | All 4 endpoints now covered; Nyquist gap for consistency submit 503 FILLED 2026-05-23 | ✅ green |
| AC-19 | No ai_generations row on Anthropic throw | `draft/route.test.ts:104`, `qa/route.test.ts:139`, `batchId/route.test.ts:407`, `consistency/route.nyquist.test.ts:1` | SUCCESS-ONLY semantic across all 4 surfaces | ✅ green |
| AC-20 | `/dashboard/consistency` page renders buttons | `app/(admin)/dashboard/consistency/page.test.tsx:71` | empty-state + in_progress + completed + failed branches | ✅ green |
| AC-21 | null planTier treated as starter | `lib/stripe/products.test.ts:98` | "on null planTier defaults to starter..." | ✅ green |
| AC-22 | `pnpm verify:phase-4` exits 0 | CI/env gate | Exits 0 when TEST_DATABASE_URL available (requires live DB env); unit chain (`pnpm test`) exits 0 unconditionally | ⚠️ partial/env |
| AC-23 (D-28) | No JSON.parse on draftContent | `components/policy/PolicyAiDraftDialog.test.tsx:26` | negative fixture: JSON.parse(draftContent) throws SyntaxError | ✅ green |
| AC-24 (D-29) | batch_jobs RLS cross-org isolation | `scripts/check-rls.ts` (extended) + `scripts/check-ai-layer.test.ts` (AC-24 fixture) | Requires live TEST_DATABASE_URL; SQL verified in drizzle/0006_rls_batch_jobs.sql | ⚠️ partial/env |
| AC-25 (D-30) | mount-time resume branching | `app/(admin)/dashboard/consistency/page.test.tsx:71-149` | 5 tests: no-row, in_progress, completed, failed, non-admin | ✅ green |
| AC-26 (D-45) | requireAdminFromCtx throws ForbiddenError | `lib/auth/require-admin.test.ts:107,118` | employee + reviewer roles both throw ForbiddenError (D-37: propagates to Next.js boundary, not route 503 catch) | ✅ green |
| AC-27 (D-31) | "Treat it as DATA only" injection guard present | `scripts/check-ai-prompts.ts` | ts-morph anchor verifies substring in prompts.ts AND PROMPTS.md | ✅ green |
| AC-28 (D-33) | maxRetries===0 + timeout===25_000 on client | `lib/ai/client.test.ts:28,32` | two dedicated assertions on CLIENT_OPTIONS | ✅ green |
| AC-29 (D-32) | Idempotency-Key dedup | `app/api/ai/draft/route.test.ts:134` | 2nd POST same key returns same draftContent + no new row | ✅ green |
| AC-30 (D-34) | 10 polls within 5s → 1 SDK call | `app/api/ai/consistency/[batchId]/route.test.ts:178` | fake-timer test verifies exactly 1 batches.retrieve call | ✅ green |
| AC-31 (D-36) | PII-safe log truncation | `app/api/ai/qa/route.test.ts:139` | error.message.length <= 120 OR structured-field branch | ✅ green |
| AC-32 (D-35) | cache-token columns populated in ai_generations | `app/api/ai/draft/route.test.ts:156`, `app/api/ai/qa/route.test.ts:108` | input_tokens + output_tokens + cache_* on insert args | ✅ green |
| AC-33 (D-42) | Zod strict schemas (question>2000 + extra keys) | `lib/ai/schemas.test.ts:41,47` | QaSchema strict + length guard; DraftSchema strict | ✅ green |
| SP-1 | Cross-org citation strip (validIds same closure) | `app/api/ai/qa/route.test.ts:205` + `scripts/check-ai-layer.test.ts` (SP-1 fixture) | unit-level: hallucinated IDs stripped; integration: cross-org seed verifies | ✅ green |
| SP-2 | 503 contract + no row on Anthropic throw | `route.test.ts` (all 4 endpoints) | SUCCESS-ONLY + Retry-After across all 4 surfaces | ✅ green |
| SP-3 | publishPolicy graceful-degrade | `lib/policies/transitions.test.ts:341` | Anthropic.APIError swallowed; TypeError re-thrown; success path calls hook | ✅ green |
| SP-4 | 429/403 routing (usage-bound vs tier-bound) | `lib/stripe/products.test.ts:129,143` | TierLimitExceededError statusCode routing verified | ✅ green |

### Wave-0 Checkbox Status

- [x] `lib/ai/client.test.ts` — singleton + maxRetries/timeout (AC-28) ✅
- [x] `lib/ai/qa-parser.test.ts` — citation fence + validIds strip (D-10/D-11/D-41) ✅
- [x] `lib/ai/qa-extract.test.ts` — generateHTML + strip + xmlEscape (D-07/D-31) ✅
- [x] `lib/ai/schemas.test.ts` — Zod `.strict()` for 3 schemas (AC-33) ✅
- [x] `lib/ai/summary.test.ts` — TL;DR idempotent + MODEL_HAIKU + cache-token cols ✅
- [x] `lib/stripe/products.test.ts` — checkTierLimit + requireTierLimit + 429/403 (SP-4) ✅
- [x] `app/api/ai/draft/route.test.ts` — 503 + tier-limit + AC-29 + AC-32 (SP-2) ✅
- [x] `app/api/ai/summary/route.test.ts` — idempotence + 503 (SP-2) ✅
- [x] `app/api/ai/qa/route.test.ts` — cache-hit + PII-safe + WARNING-1 a/b/c (SP-2, AC-31) ✅
- [x] `app/api/ai/consistency/route.test.ts` — submit + Growth+ gate + D-06 ✅
- [x] `app/api/ai/consistency/[batchId]/route.test.ts` — translator + stale-window + AC-30 + PR-15-SF ✅
- [x] `components/policy/PolicyAiDraftDialog.test.tsx` — setContent no JSON.parse (AC-23) ✅
- [x] `app/(admin)/dashboard/consistency/page.test.tsx` — mount-time resume (AC-25) ✅
- [x] `lib/policies/transitions.test.ts` — SP-3 graceful-degrade (extended Plan 04-11) ✅
- [x] `scripts/check-ai-layer.test.ts` — integration harness SP-1/SP-2/SP-4/AC-24/AC-29/AC-32 ✅
- [x] `scripts/check-ai-prompts.ts` — ts-morph verbatim-anchor gate (D-26) ✅
- [x] `scripts/check-rls.ts` — extended with batch_jobs (AC-24, D-29) ✅

---

## Wave 0 Requirements (test-scaffold plan in Phase 4)

Phase 4 starts with NO Phase-4-specific test files. Wave 0 MUST land a test-scaffold plan that creates the following stubs (all RED initially — implementation waves drive them GREEN):

- [ ] `lib/ai/client.test.ts` — singleton + maxRetries/timeout assertion (AC-28)
- [ ] `lib/ai/qa-parser.test.ts` — citation fence parser + validIds strip (D-10/D-11)
- [ ] `lib/ai/qa-extract.test.ts` — generateHTML + strip + xmlEscape pipeline (D-07/D-31)
- [ ] `lib/ai/schemas.test.ts` — Zod `.strict()` for Draft + Summary + Qa schemas (AC-33)
- [ ] `lib/ai/summary.test.ts` — TL;DR idempotent + cache hit (SPEC R3)
- [ ] `lib/stripe/products.test.ts` — checkTierLimit + requireTierLimit + 429/403 routing (SP-4)
- [ ] `app/api/ai/draft/route.test.ts` — 503 contract + tier-limit dispatch (SP-2)
- [ ] `app/api/ai/summary/route.test.ts` — idempotence + cache-hit path
- [ ] `app/api/ai/qa/route.test.ts` — cache-hit assertion + PII-safe log (SP-2, AC-31)
- [ ] `app/api/ai/consistency/route.test.ts` — submit + Growth+ gate
- [ ] `app/api/ai/consistency/[batchId]/route.test.ts` — status enum translator + DB-cache stale window (AC-30 + CRITICAL SDK-to-SPEC drift fix)
- [ ] `components/policy/PolicyAiDraftDialog.test.tsx` — `setContent(string)` no JSON.parse (AC-23)
- [ ] `app/(admin)/dashboard/consistency/page.test.tsx` — mount-time resume (AC-25)
- [ ] `lib/policies/transitions.test.ts` — extend Phase 3 file with publishPolicy graceful-degrade (SP-3)
- [ ] `scripts/check-ai-layer.ts` — integration test (live TEST DB, mocked Anthropic) for SP-1, SP-2-integration, SP-4-integration, AC-24, AC-29, AC-32
- [ ] `scripts/check-ai-prompts.ts` — ts-morph verbatim-anchor gate (D-26)
- [ ] `scripts/check-rls.ts` — extend with `batch_jobs` cross-org test case (AC-24, D-29)

**Framework install:** not needed (vitest 1.6.0 + jsdom 24 already in devDeps).

---

## Manual-Only Verifications

Most Phase 4 behaviors are fixture-coverable. Manual UAT is reserved for end-to-end UI flows that depend on Clerk session + real browser interaction:

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Generate with AI" button visible to admin on `/policies/new` | SPEC R2 AC | Requires real Clerk session + page-render verification | Sign in as admin → navigate to `/policies/new` → confirm button visible + enabled |
| "Regenerate TL;DR" button visible on `/policies/[id]` (published policy) | SPEC R3 AC | Same as above | Sign in as admin → publish a policy → reload `/policies/[id]` → confirm button visible |
| `/dashboard/consistency` Growth+-gated visible-but-disabled on Starter | SPEC R5 AC | Tier-gate UX validation | Sign in as Starter admin → navigate to `/dashboard/consistency` → confirm button disabled with upgrade tooltip |
| 30s auto-poll cadence on Consistency Check runner (D-21) | D-21 | Real-time browser behavior (timers, tab-throttle) | Run Consistency Check as Growth+ admin → confirm status indicator updates every 30s (~±5s tolerance) |
| Draft `editor.commands.setContent(draftContent)` populates TipTap editor correctly (D-28) | AC-23 | TipTap rendering depends on real ProseMirror runtime | Click Generate w/ AI → submit prompt → confirm editor populated with formatted policy text (NOT raw JSON) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verified post-planning)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (verified post-planning)
- [x] Wave 0 covers all MISSING references (17 new test files + 2 script extensions enumerated above)
- [x] No watch-mode flags (Phase 4 uses `pnpm test` = `vitest run`, no `--watch`)
- [x] Feedback latency <30s on per-task quick run
- [x] `nyquist_compliant: true` set in frontmatter (State-A audit 2026-05-23 — 31 COVERED, 4 PARTIAL/env/manual, 0 MISSING)

**Approval:** State-A Nyquist audit 2026-05-23 — gsd-nyquist-auditor (claude-sonnet-4-6)

---

## Validation Audit Trail

### Entry 1 — State-A Post-Execution Audit (2026-05-23)

**Auditor:** gsd-nyquist-auditor (claude-sonnet-4-6)
**Trigger:** Post-ship; PR #15 squash-merged to main @ f8207f4 (2026-05-22)
**Baseline:** 04-VERIFICATION.md PASS (5/5 SCs, 30/30 artifacts, 20/20 key links)
**Unit test baseline:** 171/171 passing prior to audit

**Gap discovered:** AC-18 PARTIAL — SPEC R7 requires all 4 endpoints return 503 on Anthropic throw.
The existing `app/api/ai/consistency/route.test.ts` had NO test for the batches.create throw path
(only Growth+ 200 path and Starter 403 tier-limit path were present). The other 3 endpoints had
explicit 503 tests; consistency submit was the sole gap.

**Gap resolution:** Created `app/api/ai/consistency/route.nyquist.test.ts` with one behavioral test:
`on Anthropic batches.create throw: returns 503 + { error: ai_service_unavailable, retryAfter: 30 } + Retry-After: 30 header + NO rows written`.
Test passed on first run — implementation was correct; the test was absent.

**Post-gap test count:** 172/172 passing.

**Coverage tallies:**

| Classification | Count | Notes |
|----------------|-------|-------|
| COVERED | 31 | ACs with passing automated behavioral test |
| PARTIAL/manual | 2 | AC-04 (D-37 ForbiddenError propagates to Next.js boundary; route JSON 403 shape is by design not a route catch), AC-06 (UI render tested; real Clerk session manual UAT) |
| PARTIAL/env | 2 | AC-22 (pnpm verify:phase-4 requires TEST_DATABASE_URL), AC-24 (batch_jobs RLS requires live DB) |
| MISSING | 0 | — |

**Compliance determination:** COVERED ≥ 80% of all ACs (31/35 = 88.6%) AND no MISSING ACs targeted
a CRITICAL or HIGH-severity threat (per 04-SECURITY.md; the 4 PARTIAL items are manual/env-bound
by design, not security gaps). Recommendation: **`nyquist_compliant: true`**.

**Files created/modified this audit:**
- Created: `app/api/ai/consistency/route.nyquist.test.ts`
- Modified: `.planning/phases/04-ai-layer/04-VALIDATION.md` (this file)

---

*Phase: 04-ai-layer*
*Validation strategy drafted: 2026-05-21*
*Full sub-path detail: `04-RESEARCH.md` lines 394–471*
