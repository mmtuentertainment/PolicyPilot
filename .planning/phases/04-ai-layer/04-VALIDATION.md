---
phase: 4
slug: ai-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-21
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

> Per-task entries populate during plan-phase. Wave/plan/task IDs and test commands are assigned by the planner per task. This table is a forward-declaration; planner expands into `<automated>` blocks on each task.

| Plan ID | Wave | Requirement / AC | SP Ref | Test Type | Wave-0 Dep | Status |
|---------|------|------------------|--------|-----------|------------|--------|
| 04-W0 (Wave 0 — test scaffold) | 0 | All REQ + ACs | All SP | scaffold | n/a (this IS Wave 0) | ⬜ pending |
| 04-NN (per-task entries populate during planning) | 1+ | REQ-ai-policy-assistant / REQ-ai-usage-rules | SP-1..SP-4 | unit / integration | Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (verified post-planning)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (verified post-planning)
- [ ] Wave 0 covers all MISSING references (17 new test files + 2 script extensions enumerated above)
- [ ] No watch-mode flags (Phase 4 uses `pnpm test` = `vitest run`, no `--watch`)
- [ ] Feedback latency <30s on per-task quick run
- [ ] `nyquist_compliant: true` set in frontmatter after planner confirms every task ties to a `<automated>` block or Wave-0 dependency

**Approval:** pending (set to `approved YYYY-MM-DD` after planner-checker pass)

---

*Phase: 04-ai-layer*
*Validation strategy drafted: 2026-05-21*
*Full sub-path detail: `04-RESEARCH.md` lines 394–471*
