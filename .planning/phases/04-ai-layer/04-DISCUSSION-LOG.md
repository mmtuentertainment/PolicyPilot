# Phase 4: AI Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` — this log preserves the alternatives considered and the resolution thread for the one inconsistency caught during refresh.

**Date:** 2026-05-21
**Phase:** 04-ai-layer
**Mode:** `--power` (offline HTML editor; SPEC.md-locked, ambiguity score 0.109)
**Areas discussed:** AI Foundation, Schema & Persistence, Q&A Implementation, Tier-Limit Module Layout, Error Contract + publishPolicy Auto-Trigger, Admin UI Hooks, Verify Chain + Tests

---

## AI Foundation (`lib/ai/*`)

### Q-01 — Anthropic SDK version pin strategy

| Option | Description | Selected |
|--------|-------------|----------|
| a | Exact pin (`"@anthropic-ai/sdk": "0.65.1"`). Matches svix/ts-morph/@tiptap precedent. Reproducible builds; security-patch upgrades require deliberate bump + audit. | ✓ |
| b | Caret range (`^0.65.1`). Auto patch-bumps on pnpm install. Faster security fixes; risks unannounced behavior shifts in a 0.x SDK. | |
| c | Tilde range (`~0.65.1`). Allows patch only, not minor. Middle ground; adds a fourth strategy to the codebase. | |
| d | Custom. | |

**User's choice:** a — Exact pin.
**Notes:** Matches the operator's `audit-before-security-changes` memory rule + the prior exact-pin precedent for security-sensitive deps. Plan-phase picks the exact stable version current at install time.

### Q-02 — `lib/ai/client.ts` singleton shape

| Option | Description | Selected |
|--------|-------------|----------|
| a | Lazy module-level singleton — `let cached = null; getAnthropicClient() { return cached ??= new Anthropic(...) }`. Defers env-var read; mock-friendly. | ✓ |
| b | Eager module-top const — `export const anthropic = new Anthropic(...)`. Fails fast on missing env; mirrors `lib/db/index.ts`. | |
| c | Per-request instantiation. Trivially mock-friendly; wasteful (connection pool). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Pairs with D-05 (vitest mocks the wrapper, not the SDK). Lazy singleton is the unit-test-friendly choice.

### Q-03 — `lib/ai/cache.ts` prompt-cache helper shape

| Option | Description | Selected |
|--------|-------------|----------|
| a | Minimal const + builder — `EPHEMERAL_CACHE` constant + `buildCachedSystem(text)` returning the full `[{ type, text, cache_control }]` array. | ✓ |
| b | Two-block composer — `buildQACachedSystem(static, libraryBlock)` returns the full two-block array with cache_control on the policy library only. | |
| c | Skip cache.ts entirely — inline the cache_control object literal at each call site. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Q&A's two-block pattern (static + library) is composed inline at the Q&A endpoint by calling the builder twice — no Q&A-specific composer needed.

### Q-04 — Where model IDs live as constants

| Option | Description | Selected |
|--------|-------------|----------|
| a | Dedicated `lib/ai/models.ts` exports `MODEL_SONNET`, `MODEL_HAIKU`. | ✓ |
| b | Co-located with prompts in `lib/ai/prompts.ts`. | |
| c | Inline at each endpoint. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Single grep target for model migrations; mirrors `POLICY_CATEGORIES` const precedent from Phase 3.

### Q-05 — Anthropic SDK mock approach for vitest

| Option | Description | Selected |
|--------|-------------|----------|
| a | Mock the `lib/ai/client` wrapper — `vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => mockAnthropicClient }))`. | ✓ |
| b | Mock the SDK directly — `vi.mock('@anthropic-ai/sdk', ...)`. | |
| c | MSW at HTTP layer. Adds new dependency (ASK FIRST gate). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Tightest match to Phase 3 `vi.mock('@/lib/policies/transitions')` pattern. No new dev deps.

---

## Schema & Persistence

### Q-06 — Consistency Check batch-state tracking

| Option | Description | Selected |
|--------|-------------|----------|
| a | New `batch_jobs` table. Clean separation: `ai_generations` stays SUCCESS-ONLY. | ✓ |
| b | Add `batchId` column to `ai_generations`. Row inserted at submission with `result='PENDING:<batchId>'`. | |
| c | Hybrid — `batch_jobs` table AND mirror final result into `ai_generations` on completion. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Preserves the "one row per SUCCESSFUL Claude call" semantic from CLAUDE.md ALWAYS rule #5. SPEC R5: ai_generations row written ON COMPLETION. The polling endpoint writes BOTH (a) batch_jobs.result_json and (b) the ai_generations success row in one transaction on completion.

### Q-07 — Q&A content extraction from TipTap JSON

| Option | Description | Selected |
|--------|-------------|----------|
| a | `@tiptap/html` `generateHTML` + strip tags at Q&A query time. | ✓ |
| b | Add `extracted_text` column to policies (populated by publishPolicy hook). | |
| c | Walk the ProseMirror JSON tree directly in `lib/ai/qa-extract.ts`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** No schema migration. Per-Q&A-call cost ~5ms. tsvector content-search deferred to a post-MVP phase if customers ask.

### Q-08 — `AiGenerations` repository method set

| Option | Description | Selected |
|--------|-------------|----------|
| a | Minimal SPEC set: `insert`, `countByTypeInMonth`, `findByBatchId`. | ✓ |
| b | SPEC set + `listByType(s, type, limit?)` for future admin debug. | |
| c | SPEC set + `updateResultForBatch(s, batchId, resultJson)` (only if Q-06=b). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Consistent with Q-06=a (no in-row UPDATE on ai_generations). No methods beyond what SPEC asks for.

### Q-09 — `Policies.updateSummary` method signature

| Option | Description | Selected |
|--------|-------------|----------|
| a | Dedicated method `updateSummary(s, id, summary)`. | ✓ |
| b | Extend `updateDraft` with optional `tldrSummary?` field. | |
| c | New `PoliciesAi` repository in `lib/db/repositories/policies-ai.ts`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Single-purpose method; matches `Policies.incrementVersion` precedent. ADR-005 says tldrSummary is AI-generated only.

---

## Q&A Implementation

### Q-10 — Citation block delimiter format

| Option | Description | Selected |
|--------|-------------|----------|
| a | Plain-text fence: `--- CITATIONS ---\n[...]\n--- END CITATIONS ---`. | ✓ |
| b | XML tags: `<citations>[...]</citations>`. | |
| c | Anthropic tool use with synthetic `cite_policy(id, title)` tool. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Per SPEC.md example. Regex parser easy to debug. Plain fence stays in sync with the Q&A prompt amendment.

### Q-11 — Citation parser failure mode

| Option | Description | Selected |
|--------|-------------|----------|
| a | Tolerant — return `{ answer: <raw>, citations: [] }` when delimiters absent; log warning. | ✓ |
| b | Strict — throw `CitationParseError` when delimiters present-but-malformed. | |
| c | Always-attempt-parse with regex fallback for `[id]` mentions. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Matches the "no-match" answer-text invariant (citations=[] is correct there too). Loud-but-non-fatal on broken delimiters via console.warn.

### Q-12 — Published-policies query caching strategy

| Option | Description | Selected |
|--------|-------------|----------|
| a | Direct DB query per call. ADR-006 prompt-cache absorbs upstream cost. | ✓ |
| b | Next.js `unstable_cache` keyed on `(orgId, maxUpdatedAt)`. | |
| c | In-memory per-server-instance LRU with 60s TTL. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Simplest at SMB scale. No invalidation logic to maintain.

### Q-13 — Policy library block format inside the prompt

| Option | Description | Selected |
|--------|-------------|----------|
| a | XML — `<policy id="uuid" title="..."><content>...</content></policy>` per policy. | ✓ |
| b | Plain text with fenced sections — `=== {title} (id: {uuid}) ===`. | |
| c | Markdown headings — `## {title}\n(id: {uuid})\n\n{content}`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Anthropic's prompting docs recommend XML for retrieval/citation. The id attribute maps cleanly to the citation block JSON.

---

## Tier-Limit Module Layout

### Q-14 — `lib/stripe/products.ts` single file vs split with `limits.ts`

| Option | Description | Selected |
|--------|-------------|----------|
| a | Single file `lib/stripe/products.ts`. Phase 6 adds `requireTier` helper to the SAME file. | ✓ |
| b | Split: `products.ts` (constants only) + `limits.ts` (checkTierLimit + future requireTier). | |
| c | Three files: `products.ts` + `limits.ts` + `gates.ts`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Honors SPEC R6 literal path. ADR-024's "lib/stripe/limits.ts" mention is reconciled to "lib/stripe/products.ts" by Phase 4 (see D-14 in CONTEXT.md).

### Q-15 — Tier-check enforcement: helper wrapper vs inline guard

| Option | Description | Selected (initial) | Selected (resolved) |
|--------|-------------|---------------------|---------------------|
| a | Inline guard in each endpoint — `if (!check.allowed) return NextResponse.json(...)`. | ✓ (initial) | |
| b | Throw-based — `requireTierLimit(orgId, feature)` throws `TierLimitExceededError`; endpoint catches and maps to 429/403. | | ✓ (resolved) |
| c | Higher-order wrapper `withTierCheck(feature)(handler)`. | | |
| d | Custom. | | |

**User's choice (initial):** a.
**User's choice (resolved 2026-05-21 on refresh):** b.
**Notes:** Refresh surfaced an internal contradiction with Q-16. Initial choice was inline guards (Q-15=a, no throw) but Q-16 picked "new `lib/stripe/errors.ts` exports `TierLimitExceededError`" — that class would be unused dead code without throws. Resolution: flip Q-15 to (b) throw-based so the typed error class has a consumer. Captured in Q-15 `chat_more`:
> "Resolved 2026-05-21: paired with Q-16=a. Endpoint pattern becomes try { await requireTierLimit(orgId, feature); await anthropic.messages.create(...) } catch (err) { if (err instanceof TierLimitExceededError) return 429/403 with documented body; else (Anthropic failure) return 503 ai_service_unavailable. Extends ADR-026 typed-error pattern to lib/stripe/."

### Q-16 — Tier-limit error class location

| Option | Description | Selected |
|--------|-------------|----------|
| a | New `lib/stripe/errors.ts` exports `TierLimitExceededError`. | ✓ |
| b | Add to existing `lib/auth/errors.ts`. | |
| c | New top-level `lib/errors.ts` for cross-domain shared errors. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Captured in Q-16 `chat_more`:
> "Paired with Q-15=b. lib/stripe/errors.ts exports TierLimitExceededError (carries feature, limit, current, requiredTier for response mapping). scripts/check-error-discipline.ts gate extended to scan lib/stripe/ too."

---

## Error Contract + publishPolicy Auto-Trigger

### Q-17 — Anthropic error mapping: shared helper vs inline per endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| a | Inline try/catch + `NextResponse.json` in each endpoint. | ✓ |
| b | Shared helper `lib/ai/errors.ts` exports `ai503Response()`. | |
| c | Higher-order wrapper `withAnthropicErrorMapping(fn)`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Inline keeps each endpoint self-contained; the catch block discriminates `TierLimitExceededError` (D-15) before falling through to 503. Plan-phase free to extract a tiny `ai503Response()` helper if the duplication noise warrants — operator OK with either.

### Q-18 — Anthropic failure logging format

| Option | Description | Selected |
|--------|-------------|----------|
| a | Per-endpoint prefix — `console.error('[ai/draft] anthropic failed', { error })`. | ✓ |
| b | Single prefix `[ai]` with endpoint as a field. | |
| c | Minimal `console.error(err)`; let Phase 7+ logger reshape. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Matches Phase 3 `[createPolicyAction]` precedent. Object literal preserves structured fields for Phase 7+ JSON-log migration.

### Q-19 — publishPolicy auto-trigger of TL;DR: synchronous vs fire-and-forget

| Option | Description | Selected |
|--------|-------------|----------|
| a | Synchronous after commit — `await generateSummaryForPolicy(...)` inside publishPolicy with inner try/catch. | ✓ |
| b | Fire-and-forget — `void generateSummaryForPolicy(...).catch(...)` after commit. | |
| c | Sync with explicit timeout — `await Promise.race([..., timeout(10000)])`. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Admin clicking Publish sees TL;DR populated in the same request. Vercel serverless waitUntil concerns avoided. Haiku ~1-3s typical latency is acceptable on a Publish action.

---

## Admin UI Hooks

### Q-20 — Consistency Check admin page URL

| Option | Description | Selected |
|--------|-------------|----------|
| a | `/dashboard/consistency` — nested under /dashboard. | ✓ |
| b | `/consistency` — top-level admin URL. | |
| c | `/policies/consistency` — under /policies. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Matches Phase 3 D-01 admin URL convention. Zero middleware matcher changes (existing `/dashboard(/|$)` covers it).

### Q-21 — Consistency Check polling UX

| Option | Description | Selected |
|--------|-------------|----------|
| a | Auto-poll every 30s via `useEffect` + setInterval. | ✓ |
| b | Manual "Refresh status" button only. | |
| c | Auto-poll with exponential backoff (10s → 2min cap). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Hands-off UX. 30s × 30min = ~60 polls per batch; cheap.

### Q-22 — Draft "Generate with AI" form fields shape

| Option | Description | Selected |
|--------|-------------|----------|
| a | Two fields — `prompt` (textarea) + `policyType` (select from `POLICY_CATEGORIES`). | ✓ |
| b | Three fields — `prompt` + `policyType` + `additionalContext`. | |
| c | Single prompt field; backend infers policyType. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Matches SPEC R2 API shape `{ prompt, policyType }`. Reuses Phase 3 category constant.

### Q-23 — Consistency findings UI rendering within severity grouping

| Option | Description | Selected |
|--------|-------------|----------|
| a | Collapsed by default with click-to-expand (shadcn Collapsible). | ✓ |
| b | Always expanded with severity column / icon at left. | |
| c | Table view (Severity / Policy A / Policy B / Issue type / Description truncated). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Compact list view for scanning. Multiple findings can be open simultaneously (rules out Accordion).

---

## Verify Chain + Tests

### Q-24 — `verify:phase-4` composition relative to `verify:phase-3`

| Option | Description | Selected |
|--------|-------------|----------|
| a | `verify:phase-4` wraps `verify:phase-3`: `pnpm verify:phase-3 && pnpm check:ai-layer && pnpm check:ai-prompts`. | ✓ |
| b | Replicate full chain inline. | |
| c | Extend `verify:phase-3` itself (no separate `verify:phase-4`). | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Honors ADR-029 phase-boundary green-on-main requirement. Phase 3 stays untouched; rolling back a Phase-4 change doesn't disturb Phase 3.

### Q-25 — Cache-hit assertion fixture

| Option | Description | Selected |
|--------|-------------|----------|
| a | Vitest fixture — mockAnthropicClient returns `{ usage: { cache_read_input_tokens: N } }` on 2nd call. | ✓ |
| b | Integration test against live Anthropic API in `pnpm check:ai-layer`. | |
| c | Skip the assertion — log inspection only. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Verifies the endpoint reads the cache_read field. Does NOT verify Anthropic actually caches — that's a manual / live-smoke concern.

### Q-26 — Prompt-substring verification gate implementation

| Option | Description | Selected |
|--------|-------------|----------|
| a | `scripts/check-ai-prompts.ts` (ts-morph) extracts the 4 constants + asserts each contains a 40-char anchor from PROMPTS.md. | ✓ |
| b | Vitest test in `lib/ai/prompts.test.ts` (same logic, vitest-hosted). | |
| c | Inline assertion at module-load time. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** Matches ADR-026 ts-morph precedent (`check-error-discipline.ts`, `check-policy-id-brand.ts`). One-shot CI gate.

### Q-27 — API-SPEC.md amendment for citation shape — ADR or no ADR?

| Option | Description | Selected |
|--------|-------------|----------|
| a | Doc-only — amend `reference/API-SPEC.md` inline; SPEC.md R2 captures the rationale. | ✓ |
| b | New ADR-030. | |
| c | Both. | |
| d | Custom. | |

**User's choice:** a.
**Notes:** SPEC.md R4 (Notable cross-contract impact) already captures the rationale. No new ADR needed.

---

## Claude's Discretion

The following are left to plan-phase / executor judgment within the constraints above (see CONTEXT.md `<decisions>` "Claude's Discretion" section for the full list):

- Exact `@anthropic-ai/sdk` version pinned at install time.
- Shadcn primitive choice for the Draft dialog (likely plain `Dialog`).
- Whether to install shadcn `Collapsible` or hand-roll the expand/collapse state for findings.
- Exact 40-char anchors used by `scripts/check-ai-prompts.ts`.
- TipTap-text-extraction implementation in `lib/ai/qa-extract.ts` (regex strip vs JSON walker).
- `generateSummaryForPolicy` exact signature within the inferred `(policyId, ctx) → Promise<void>` shape.
- Whether `check-ai-layer.ts` reuses `check-policies-list-filters.ts` seed pattern.
- PolicyEditor "Generate with AI" button placement details.
- `/dashboard/consistency` page layout composition within the existing admin shell.

## Deferred Ideas

See CONTEXT.md `<deferred>` section. Highlights:

- Q&A UI surface → Phase 5
- `extracted_text` column + tsvector content search → deferred indefinitely
- Cron-driven batch polling → Phase 7+
- `requireTier` (boolean-feature 403 redirect helper) → Phase 6
- Anthropic API live-integration smoke test → manual pre-ship, not CI
- Streaming responses on Draft / Q&A → out of scope per SPEC
- Tool-use / structured outputs for Q&A citations → revisit if regex parser proves flaky in telemetry
- Per-org Anthropic API key (BYOK) → not in scope
- AI usage analytics dashboard → Phase 8 or post-MVP
- Multi-turn Q&A → SPEC explicit out-of-scope
- Self-hosted model migration → SPEC explicit post-MVP
- Phase 2 / Phase 3 audit carry-forwards (SF-CASCADE-AUDIT, Nyquist G-08a/G-09a/G-03a, F-03/F-05/F-06) → unrelated to Phase 4
