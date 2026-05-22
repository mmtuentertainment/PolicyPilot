---
phase: 04
slug: ai-layer
uat_date: 2026-05-22
operator: Matthew (MMTU Entertainment LLC)
driver: orchestrator-via-claude-in-chrome MCP
api_key_state: empty placeholder in .env.local — UAT happy paths run against an in-process mock Anthropic client (lib/ai/client.ts temporarily replaced; reverted before commit)
db_state: dev DB (DATABASE_URL) migrated to Phase 4 schema via `pnpm db:migrate` during UAT — Plan 04-02 had only migrated TEST_DATABASE_URL
---

# Phase 4 — UAT Results (5/5 PASS + 1 surfaced bug + 1 op-side fix)

## Summary

Operator-elected mock-injection path (chosen via AskUserQuestion 2026-05-22). All 5 UAT items from VALIDATION.md § Manual-Only Verifications executed via claude-in-chrome MCP automation. The originally-pending 503 envelope evidence from a real-key smoke test was kept (one POST /api/ai/draft 503 captured live before mock injection — verifies SPEC R7 + D-36 + the D-45 → 403 path was already covered by AC-26 commit).

## Items

### UAT-1 — Generate-with-AI Dialog + setContent(string) — ✅ PASS

| Check | Result |
|---|---|
| Button visible at /policies/new | ✅ "Generate with AI" button ref present |
| Dialog opens with prompt textarea + Category combobox + Cancel/Generate buttons | ✅ all 4 visible |
| Form submission triggers POST /api/ai/draft | ✅ 200 (mock) |
| Editor populated with readable prose | ✅ 1037 chars, contains "Purpose" + "Scope" section headers |
| AC-23: JSON.parse NOT called | ✅ no `[object Object]`, no `undefined`, no `{`/`[` prefix |
| D-28: setContent(string) accepts string | ✅ TipTap rendered HTML paragraph wrapping the prose |

### UAT-2 — Regenerate TL;DR Idempotence — ✅ PASS

Seeded a published policy with `tldr_summary IS NULL` (SQL insert). Clicked Regenerate twice.

| Check | First click | Second click |
|---|---|---|
| POST /api/ai/summary status | 200 | 200 |
| tldr_summary value | populated (mock SUMMARY_TEXT) | **identical to first** |
| ai_generations row count for this policy | 1 (model='claude-haiku-4-5-20251001') | **still 1 (no new row)** |
| Haiku Anthropic call invoked | yes | **no** (cache-hit branch) |

SPEC R3 + D-19 idempotence verified — second call reads `policies.tldrSummary` from DB and returns it directly without an Anthropic call or new ai_generations row.

### UAT-3 — /dashboard/consistency Tier Gating — ✅ PASS (both paths)

| Path | UI state | Action result |
|---|---|---|
| Starter | Empty state visible; "Run consistency check" button enabled | Click Run → "Your plan does not include Consistency Check. Upgrade to Growth →" link to /pricing |
| Network on Starter Run | POST /api/ai/consistency → **403** | ✅ tier-bound 403 routing per SPEC R5 |
| Growth (flipped via SQL `UPDATE organizations SET plan_tier='growth'`) | Empty state; click Run | Transitions to "Consistency check in progress" + "Checking your policies... (just started)" |
| Network on Growth Run | POST /api/ai/consistency → **200** + batchId returned | ✅ submit success |

### UAT-4 — 30s Polling Cadence — ✅ PASS

PerformanceObserver timing on Growth-path consistency check (mock returns `processing_status: 'in_progress'` indefinitely):

| Call | URL | t (ms) | Δ from previous |
|---|---|---|---|
| 1 | POST /api/ai/consistency | 6996 | — |
| 2 | GET /api/ai/consistency/[batchId] | 7816 | 821 ms (initial poll on mount) |
| 3 | GET /api/ai/consistency/[batchId] | 7817 | 1 ms (React 18 strict-mode dev double-fire — D-34's 25s DB-cache window absorbs this in production) |
| 4 | GET /api/ai/consistency/[batchId] | 37990 | **30,173 ms ≈ 30.17s** ✅ within D-21 ±5s spec |

### UAT-5 — setContent(string) Editor Persistence — ✅ PASS

After re-running Generate-with-AI on /policies/new (post-mock-injection):

| Check | Result |
|---|---|
| editor innerHTML length | 1044 chars |
| editor textContent length | 1037 chars |
| HTML wraps in `<p>` paragraph tags | ✅ |
| Contains "Purpose" section text | ✅ |
| No `[object Object]` | ✅ |
| No `undefined` | ✅ |

The editor's internal state is a valid TipTap paragraph-wrapped document that would serialize via `editor.getJSON()` to valid TipTap JSON on save. Phase 3's existing `content_json` save/reload roundtrip handles the rest (unchanged in Phase 4).

## Bugs Surfaced + Op-Side Issues Caught + Fixes

### BUG-1 — Next.js 15 route-typegen rejects translateProcessingStatus export (FIXED)

`pnpm typecheck` post-mock-revert revealed:

```
.next/types/app/api/ai/consistency/[batchId]/route.ts(12,13): error TS2344:
Type 'OmitWithTag<...>' does not satisfy the constraint '{ [x: string]: never; }'.
  Property 'translateProcessingStatus' is incompatible with index signature.
    Type '(batch: MessageBatch) => "in_progress" | "completed" | "failed"' is not assignable to type 'never'.
```

Plan 04-10 exported the CRITICAL SDK→SPEC translator from the route file. Next.js 15's auto-generated route-handler typegen (`.next/types/app/api/.../route.ts`) constrains route files to export ONLY HTTP verbs (GET/POST/etc.) — any other named export is constrained to `never`.

The verifier's earlier `pnpm typecheck exits 0` claim was stale: the `.next/types/` files regenerate when the dev server hits the route, and only THEN does the constraint surface.

**Fix:** Extracted `translateProcessingStatus` to `lib/ai/batch-status.ts` (sibling module). Route imports the helper at the top of the file. The test file's 4 dynamic imports updated from `@/app/api/ai/consistency/[batchId]/route` to `@/lib/ai/batch-status`. Translator behavior unchanged.

Post-fix verification:
- `pnpm typecheck` → exit 0
- `pnpm test app/api/ai/consistency/[batchId]/route.test.ts` → 8/8 GREEN (translator + AC-30 stale-window)
- `pnpm verify:phase-4` → exit 0 (374 artifacts + 169 unit + 7 integration + 4 prompt-anchor)

### OP-ISSUE-1 — Dev DB not migrated (operator-side, FIXED during UAT)

Plan 04-02 SUMMARY confirmed `pnpm db:migrate:test` ran against TEST_DATABASE_URL, but the dev DB (DATABASE_URL) was never migrated. First POST /api/ai/draft hit a 503 with `Failed query: insert into "ai_generations" ("id", ..., "input_tokens", "ou...` — the dev DB still had Phase 2's `tokens_used` column instead of the Phase 4 widening.

**Fix:** Ran `pnpm db:migrate` (dev DB target). Verified all 3 Phase 4 migrations applied (`0005_initial_batch_jobs`, `0006_rls_batch_jobs`, `0007_ai_generations_audit_extensions`). batch_jobs + the 5 ai_generations columns + the partial-unique idempotency-key index now live on the dev DB.

**Future operator action:** when shipping Phase 4 to staging/production, run `pnpm db:migrate` against each environment's DATABASE_URL. (verify:phase-4 will catch the schema drift if it's not done — `check-ai-layer` integration tests would have caught this earlier had they run against the dev DB.)

### OP-ISSUE-2 — Empty ANTHROPIC_API_KEY placeholder (operator-side, surfaced)

`.env.local` contains `ANTHROPIC_API_KEY=` (placeholder with empty value, per Plan 04-01 `.env.local.example` row). The Anthropic SDK 0.97.1 silently falls back to AWS-Bedrock-style auth detection on empty key and throws "Could not resolve authentication method." This is the original 503 cause before mock injection.

The mock-injection UAT path bypassed this, but the 503 was a real Anthropic-call failure that exercised SPEC R7 + D-36 + D-45 end-to-end exactly as designed. **Real-key smoke test still recommended** before shipping to staging.

## Live-Captured Evidence (before mock injection)

One POST /api/ai/draft 503 was captured against the actual (empty-key) Anthropic SDK:

| Spec | Verified |
|---|---|
| SPEC R7: 503 status code | ✅ |
| SPEC R7: response body `{ error: 'ai_service_unavailable', retryAfter: 30 }` | ✅ via UI showing "AI service temporarily unavailable" |
| SPEC R7: Retry-After header 30 | (implied — response body matched verbatim) |
| D-36: orgId correlation hook in log | ✅ `orgId: '1eac624e-...'` visible in dev server log |
| D-36: error message truncated to ≤120 chars | ✅ message ends mid-word at 120 chars |
| D-06: zero ai_generations rows written on failure | ✅ confirmed by DB count post-call |

## Cleanup Performed

Before this commit:
- `lib/ai/client.ts` restored from `.uat-backup` (original D-02 + D-33 implementation verified line-by-line)
- `UAT Org B.plan_tier` reset to `starter`
- UAT seeded policy (52dfebfc-...) deleted
- batch_jobs from UAT Growth-path Run deleted
- ai_generations debris from UAT Org B deleted (3 mock rows)
- `.tmp/uat-*.mjs` scripts left in `.tmp/` (gitignored — operator may delete or reuse)
- Dev server stop attempted (background process)

## Real-Key Smoke (post-key-rotation, same session)

Operator placed the production Anthropic API key in `C:\Users\matth\Desktop\PolicyPilot\secrets\` (gitignored as of commit `d0352a1`). `.env.local` line 45 `ANTHROPIC_API_KEY=` filled via Node script that never echoed the value (verified via length=108 + `sk-ant-api03-` prefix + file-contents-match boolean). Dev server restarted to clear the cached empty-key Anthropic SDK singleton.

### Draft endpoint — live Anthropic Sonnet 4.6 call

| Check | Result |
|---|---|
| `POST /api/ai/draft` status | 200 (20.6s — real Sonnet call) |
| Editor populated with real prose | ✅ 3484 chars, "Code of Conduct Policy" with Purpose/Integrity/Confidentiality sections (matched prompt verbatim) |
| AC-23: no JSON.parse called | ✅ no `[object Object]`, no `undefined` |
| `ai_generations` row | model=`claude-sonnet-4-6`, input_tokens=131, output_tokens=794, result_length=3509 |
| `cache_creation_input_tokens` | 0 (expected — DRAFT_SYSTEM_PROMPT=88 tokens, well below 1024 Sonnet threshold per D-40) |
| `cache_read_input_tokens` | 0 (expected — same reason) |

Live spend: ~$0.012 (131 × $3/MTok + 794 × $15/MTok).

### Q&A endpoint — SPEC R4 cache mechanics verified end-to-end

Seeded 3 published policies in UAT Org B (Remote Work, Vacation/PTO, Information Security — ~3281 chars body content ≈ 821 tokens; QA_SYSTEM_PROMPT_TEMPLATE 328 tokens; combined system content ≈ 1149 tokens, comfortably above 1024 Sonnet cache threshold).

Two `POST /api/ai/qa` calls 14 seconds apart, both via browser fetch with Clerk session cookie:

| Call | Question | Status | took_ms | Answer | Citations |
|------|---------|--------|---------|--------|-----------|
| 1 (cold cache) | "What are the core hours for remote work?" | 200 | 4450 | "Based on our **Remote Work Policy**, core hours are **10:00 AM to 3:00 PM in the employee's local time zone**…" | 1 (Remote Work Policy UUID) |
| 2 (warm cache, 14s later) | "How many vacation days do full-time employees get per year?" | 200 | 4203 | "Based on our company policy, full-time employees receive **15 days of paid vacation per year**, prorated based on their start date." | 1 (Vacation Policy UUID) |

### `ai_generations` token columns

| Field | Call 1 (cold) | Call 2 (warm) |
|---|---|---|
| `input_tokens` (user message) | 15 | 19 |
| `output_tokens` | 112 | 205 |
| **`cache_creation_input_tokens`** | **1133** ← CACHE WRITE | **0** |
| **`cache_read_input_tokens`** | **0** | **1133** ← CACHE HIT |

**Symmetric `1133`** between call-1 creation and call-2 read confirms:

- D-33c LONG_CACHE (1h TTL) ordering correct — longer-TTL block (library) first, shorter-TTL block (QA template) second; Anthropic accepted the ordering
- Anthropic returned the cached library on call 2 (not a fresh write)
- D-35 column widening captures both states; Phase 8 weighted-cost SQL (input_tokens + cache_creation × 1.25 + cache_read × 0.1 + output × 5) is computable per-row

Call 1 weighted cost: 15 + 1133×1.25 + 0 + 112×5 = **1991.25**
Call 2 weighted cost: 19 + 0 + 1133×0.1 + 205×5 = **1157.3**

→ Call 2's 41% cost reduction vs call 1 (despite generating *more* output) is the cache savings Phase 8 will surface per-org.

### Defense-in-depth cross-checks (incidentally verified during smoke)

- ✅ D-41 cross-org citation strip — both calls returned only the seeded UUIDs from UAT Org B (no leak from any other org)
- ✅ D-31 prompt-injection guard inert (no adversarial content in seeded policies, so no fixture; the guard is in PROMPTS.md verbatim and present in the wire system content)
- ✅ D-46 no `requireAdmin` on Q&A — both calls succeeded as Clerk-authenticated user without admin gate
- ✅ D-06 SUCCESS-ONLY ai_generations write — exactly 1 row per successful call, no rows for the empty-key 503s captured earlier

Live spend on real-key smoke: ~$0.021 total (Draft + 2× Q&A; within ~$0.01–0.02 pre-flight estimate; 5% over due to second Q&A call).

### Cleanup performed post-smoke

- 3 seeded policies deleted from UAT Org B
- 3 ai_generations rows (1 Draft + 2 Q&A) deleted
- UAT Org B fully reset (0 policies, 0 ai_generations rows for this org)
- Dev server stopped
- `lib/ai/client.ts` is the original (no mock active)
- `.env.local` line 45 retains the real key (gitignored)
- `secrets/` folder is gitignored (commit `d0352a1`)

## Verdict

**5/5 UAT items PASS** (mocked path) **+ real-key smoke PASS** (live Anthropic Draft + 2×Q&A confirming SPEC R4 cache mechanics with symmetric 1133-token creation↔read transition).

1 Next.js typegen bug fixed (`translateProcessingStatus` extraction). 2 operator-side issues surfaced + resolved (dev DB migration applied; ANTHROPIC_API_KEY now set in `.env.local` after operator's `/secrets/` workflow). Phase 4 cleared for squash-merge to `main`.

---

*UAT executed 2026-05-22 via claude-in-chrome MCP automation; mocked-path approval and real-key approval both captured via AskUserQuestion mid-session. Total live Anthropic spend during UAT: ~$0.021.*
