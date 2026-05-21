# Phase 4: AI Layer - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Mode:** `--power` (27 questions captured via offline HTML editor; 26 picked the recommended-first option; Q-15 resolved to typed-error path on second pass paired with Q-16)
**Locked upstream:** SPEC.md (7 requirements, ambiguity score 0.109)

<domain>
## Phase Boundary

Four Claude-powered AI surfaces (Draft, TL;DR, Q&A, Consistency Check) ship as server-side API endpoints with admin-facing UI hooks (Draft button on `/policies/new`, "Regenerate TL;DR" on `/policies/[id]`, Consistency Check runner page at `/dashboard/consistency`). Q&A UI is deferred to Phase 5. Every successful Anthropic call is logged to `ai_generations` and respects tier limits via `lib/stripe/products.ts`'s `TIER_LIMITS` and `checkTierLimit` with a `'starter'` default until Phase 6 wires Stripe. Anthropic SDK failures map to a 503 envelope with no `ai_generations` row written. The `publishPolicy` orchestrator auto-triggers TL;DR generation synchronously after state commit and graceful-degrades on failure (logs and continues; policy stays published with null `tldrSummary`).

**In scope (from SPEC.md Boundaries):**

- `@anthropic-ai/sdk` installation + `lib/ai/` foundation (client singleton, prompt constants, cache helper, parser for Q&A citations, model-ID constants).
- 5 server-side API route handlers: `/api/ai/draft`, `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency` (POST submit), `/api/ai/consistency/[batchId]` (GET poll).
- `lib/stripe/products.ts` exporting `TIER_LIMITS` + `checkTierLimit` + `requireTierLimit` (the Phase 6 `requireTier` helper will join the same file).
- `lib/stripe/errors.ts` exporting `TierLimitExceededError` (typed-error pattern extends ADR-026 to `lib/stripe/`).
- Admin-facing UI hooks: "Generate with AI" button + dialog in `PolicyEditor` at `/policies/new`; "Regenerate TL;DR" button in `PolicyView` at `/policies/[id]`; new admin page at `/dashboard/consistency` (Growth+ tier gate visible-but-disabled on Starter) with runner + polled findings list grouped by severity.
- `publishPolicy` transition modification: invoke `generateSummaryForPolicy` helper synchronously after state-transition commit; graceful-degrade on failure.
- `ai_generations` repository body: `insert`, `countByTypeInMonth`, `findByBatchId` (Phase 2 ships skeleton).
- New `batch_jobs` table + `lib/db/repositories/batch_jobs.ts` (Anthropic batch state tracking; `ai_generations` stays SUCCESS-ONLY).
- `Policies.listPublishedForOrg` + `Policies.updateSummary` methods added to the policies repository.
- API-SPEC.md amendment for the `citations` shape change (`string[]` → `{ title: string, id: string }[]`).
- PROMPTS.md amendment for the Q&A citation block instruction.
- `pnpm verify:phase-4` orchestrator script + `scripts/check-ai-layer.ts` integration test that exercises all 4 endpoints against mocked Anthropic + the live TEST DB.
- `scripts/check-ai-prompts.ts` (ts-morph) verbatim-match gate.
- `scripts/check-error-discipline.ts` extended to scan `lib/stripe/` too.
- Vitest unit tests for: prompt-constant verbatim match (also covered by ts-morph gate), citation parser, tier-check math + `TierLimitExceededError` discrimination, 503 error contract, publishPolicy graceful-degrade path, prompt-cache hit fixture.

**Out of scope (from SPEC.md Boundaries — preserved verbatim where they matter for plan-phase):**

- **Q&A UI surfaces** — Phase 5 (employee chat panel); admin Q&A surface is not planned.
- **Stripe billing / `planTier` population** — Phase 6.
- **Notification emails for AI events** — Phase 7.
- **AI usage analytics dashboard** — Phase 8 or post-MVP.
- **Streaming responses** — single JSON responses across all 4 endpoints.
- **Multi-turn Q&A** — single-shot only.
- **Auto-retry on Anthropic 5xx** — 503 contract surfaces the failure cleanly.
- **Custom model selection per request** — Sonnet 4.6 + Haiku 4.5 LOCKED per ADR-005/006.
- **Self-hosted open-source model migration** — post-MVP per SPEC.md §Background.
- **AI cost monitoring / Anthropic billing dashboard** — operator monitors via Anthropic's console.
- **Background-worker plumbing for batch polling** — Consistency Check polls client-side per the locked API-SPEC + Q-21 (auto-poll every 30s in the admin Client Component).
- **`extracted_text` column on `policies`** (this discussion's call per Q-07=a) — Q&A uses on-the-fly `generateHTML`+strip extraction; tsvector content-search is post-MVP.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `04-SPEC.md` for full requirement bodies, acceptance criteria (22 falsifiable checks), and the Interview Log (Round 1 Boundary Keeper + Round 2 Failure Analyst).

Downstream agents MUST read `04-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**Constraints carried into this phase (from SPEC.md Constraints, verbatim):**

- **Model IDs locked**: `claude-sonnet-4-6` for Draft + Q&A + Consistency Check; `claude-haiku-4-5-20251001` (or current Haiku 4.5 stable ID) for TL;DR. Per ADR-005, ADR-006, ADR-015. No alternate models permitted without a new ADR.
- **Anthropic SDK**: install latest stable `@anthropic-ai/sdk`. Node `>=22.0.0 <23.0.0` already satisfied.
- **Prompt caching mandatory** on Q&A (system prompt + policy library block). Cache-hit rate target: 60-80%.
- **Batch API mandatory** for Consistency Check (50% cost reduction). Synchronous Messages API forbidden for this surface.
- **Server-side only**: all Claude calls in API routes or server actions; `lib/ai/client.ts` uses `'server-only'` import.
- **All Claude calls logged**: one `ai_generations` row per SUCCESSFUL call. Failed calls write nothing.
- **`ai_generations.result` shape**: text content for draft/summary/qa; JSON-stringified `ConsistencyFinding[]` for consistency.
- **Q&A citation extraction**: response parsed by `lib/ai/qa-parser.ts` into `{ answer, citations: { title, id }[] }`. Citation IDs validated against the org's published policies before returning to client (hallucinations stripped).
- **TL;DR idempotence**: `policies.tldrSummary` set once per policy version; second `/api/ai/summary` call returns cached value without Anthropic call.
- **`publishPolicy` graceful degradation**: summary failure logged but does NOT propagate.

</spec_lock>

<decisions>
## Implementation Decisions

27 HOW decisions captured via `--power` mode. Each maps to one question in `04-QUESTIONS.json` (preserved alongside this file for audit). Numbering D-01..D-27 mirrors Q-01..Q-27 for cross-reference.

### AI Foundation (`lib/ai/*`)

- **D-01 (Q-01): Anthropic SDK pinned at exact version.** `"@anthropic-ai/sdk": "0.x.y"` (no caret, no tilde) — matches the codebase precedent for security-sensitive trust-boundary deps (svix@1.93.0, ts-morph@28.0.0, @tiptap/*@2.27.2). Plan-phase picks the exact stable version at install time; future bumps go through the `audit-before-security-changes` memory rule.
- **D-02 (Q-02): `lib/ai/client.ts` is a lazy module-level singleton.** `let cached: Anthropic | null = null; export function getAnthropicClient(): Anthropic { return cached ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }); }`. Defers env-var read until first call (unit-test friendly). `'server-only'` at top. Mock surface = the single exported function via `vi.mock('@/lib/ai/client', ...)` (pairs with D-05).
- **D-03 (Q-03): `lib/ai/cache.ts` minimal const + builder.** Exports `EPHEMERAL_CACHE = { type: 'ephemeral' } as const` plus `buildCachedSystem(text: string)` returning the `[{ type: 'text', text, cache_control: EPHEMERAL_CACHE }]` array shape Anthropic's `messages.create({ system })` accepts. Endpoints import the builder; centralizes the shape for future TTL additions. Q&A's two-block split (static system prompt + per-org policy library block) is composed inline at the Q&A endpoint using the same builder helper applied twice — no Q&A-specific composer needed.
- **D-04 (Q-04): Model IDs in dedicated `lib/ai/models.ts`.** Exports `MODEL_SONNET = 'claude-sonnet-4-6' as const` and `MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const`. Single grep target for future model-deprecation migrations. Matches `POLICY_CATEGORIES` constant precedent from `app/(admin)/policies/new/actions.ts`.
- **D-05 (Q-05): Vitest mocks the `lib/ai/client` wrapper, not the SDK.** Pattern: `vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => mockAnthropicClient }))` where `mockAnthropicClient` exposes `messages.create()` + `messages.batches.{create,retrieve}()` as `vi.fn()` instances. Mirrors the Phase 3 `vi.mock('@/lib/policies/transitions')` pattern. No `msw` dep added.

### Schema & Persistence

- **D-06 (Q-06): New `batch_jobs` table; `ai_generations` stays SUCCESS-ONLY.** New table `batch_jobs (id uuid pk, org_id uuid fk → organizations, anthropic_batch_id text unique, type text default 'consistency', status text default 'in_progress', created_at timestamp default now(), result_json jsonb)` + RLS `org_isolation` policy. Preserves the "one `ai_generations` row per successful Claude call" semantic (CLAUDE.md ALWAYS rule #5; SPEC R5: row written ON COMPLETION). The `/api/ai/consistency` submit endpoint writes a `batch_jobs` row at submission; `/api/ai/consistency/[batchId]` polling reads `batch_jobs` for current status; on completion the polling endpoint writes BOTH (a) the result JSON onto the `batch_jobs.result_json` and (b) one `ai_generations` row with `type='consistency'` capturing the canonical "call succeeded" ledger entry. Single transaction.
- **D-07 (Q-07): Q&A content extraction via on-the-fly `generateHTML` + strip.** No `extracted_text` column migration. `lib/ai/qa-extract.ts` exports `policyToPromptText(policy)` which calls `@tiptap/html` `generateHTML(contentJson, [StarterKit, Link])` and strips tags via a single-pass DOM parse OR regex (plan-phase decides — JSDOM is in devDeps for vitest jsdom env but plan-phase should NOT pull it into prod path; prefer a regex strip-tags helper or a thin DOM parser-free routine). Per-Q&A-call cost ~5ms for 100-policy library. tsvector content-search remains deferred to a post-MVP phase if customers ask.
- **D-08 (Q-08): `AiGenerations` repository ships the minimal SPEC method set.** `insert(s, input)`, `countByTypeInMonth(s, type)`, `findByBatchId(s, anthropicBatchId)` — the existing `listAll` skeleton stays. No `updateResultForBatch` (D-06 routes batch state through `batch_jobs`, not in-row UPDATE on ai_generations). No `listByType` (no Phase 4 success criterion needs it).
- **D-09 (Q-09): `Policies.updateSummary(s, id, summary)` is a new dedicated method.** Single-purpose, matches `Policies.incrementVersion` and `Policies.statusCounts` precedent. Does NOT extend `updateDraft` (ADR-005 says `tldrSummary` is AI-generated only). Type-system invariant from Phase 2 `tests/types.ts` is unchanged. Optional: add a `@ts-expect-error` line forbidding `Policies.create(... { tldrSummary })` — already covered by Phase 2 D-07.

### Q&A Implementation

- **D-10 (Q-10): Citation block uses the plain-text fence per SPEC's example.** Format `\n\n--- CITATIONS ---\n[{"title": "...", "id": "uuid"}, ...]\n--- END CITATIONS ---`. Parser splits on the fence and `JSON.parse`s the middle block. The Q&A system prompt in `lib/ai/prompts.ts` is amended (vs the verbatim PROMPTS.md text) to instruct Claude to emit the fence; the amendment is mirrored back into `reference/PROMPTS.md` as part of the Phase 4 ship. The ts-morph substring gate (D-26) anchors on the original PROMPTS.md text, not the amendment — the amendment is appended after the verbatim block.
- **D-11 (Q-11): Citation parser is tolerant on missing delimiters.** Returns `{ answer: <raw text>, citations: [] }` when the citation fence is absent (e.g., on the "I couldn't find information..." no-match branch). When delimiters are present but JSON is malformed: logs `console.warn('[ai/qa] citation block present but unparseable', { snippet })` and returns `{ answer: <raw text minus the broken fence section>, citations: [] }` — same end-shape as no-match. Aligns with the SPEC's no-match branch invariant.
- **D-12 (Q-12): Published-policies query is direct DB per Q&A call.** New `Policies.listPublishedForOrg(s)` runs `SELECT id, title, contentJson FROM policies WHERE org_id = scope.orgId AND status = 'published'` inside the request's `withOrgScope` (RLS fires + application-layer `where(eq(orgId))` fires). No `unstable_cache`, no LRU. ADR-006 Anthropic prompt-cache absorbs the upstream cost; DB-side cost ~5-15ms is acceptable at SMB scale.
- **D-13 (Q-13): Policy library block in Q&A prompt uses XML per policy.** Format: `<policy id="uuid" title="...">\n<content>extracted-text</content>\n</policy>\n` joined into the `{orgPolicyLibrary}` slot in the PROMPTS.md template. Anthropic's prompting docs recommend XML for retrieval/citation. Citation id attribute maps cleanly to the citation block JSON. Slightly more tokens than plain text but cache-amortized after the first call.

### Tier-Limit Module Layout

- **D-14 (Q-14): Single file `lib/stripe/products.ts`.** Exports `TIER_LIMITS` (matching `reference/TIER-LIMITS.md` verbatim) + `PlanTier` type + `checkTierLimit(orgId, feature): Promise<{ allowed, limit, current }>` + `requireTierLimit(orgId, feature)` (Phase 4) + future `requireTier(feature, org)` (Phase 6). One file holds the constants AND the predicate functions. Phase 6 grows the file with the `requireTier` 403/redirect helper for cross-cutting boolean-feature gates; ADR-024's "lib/stripe/limits.ts" mention is reconciled to "lib/stripe/products.ts" via an ADR-024 amendment shipped in Phase 4 (or as a Phase 4 SHIP note).
- **D-15 (Q-15): Tier enforcement is throw-based via `requireTierLimit`.** Endpoints call `await requireTierLimit(orgId, 'aiDraftsMonthly')` BEFORE the Anthropic call. On overage the function throws `TierLimitExceededError` (typed error from D-16). The endpoint's outer try/catch discriminates: `if (err instanceof TierLimitExceededError) return NextResponse.json(<documented body>, { status: err.statusCode })` where `err.statusCode` is 429 for usage-bound limits (`aiDraftsMonthly`) or 403 for tier-bound features (`consistencyCheck`). Mirrors the ADR-026 typed-error pattern (e.g., `IllegalTransitionError` in `lib/policies/state-machine.ts`). Resolution of operator-noted Q-15/Q-16 contradiction during refresh on 2026-05-21.
- **D-16 (Q-16): `lib/stripe/errors.ts` exports `TierLimitExceededError`.** Class shape: `class TierLimitExceededError extends Error { constructor(public readonly feature: keyof typeof TIER_LIMITS.starter, public readonly limit: number, public readonly current: number, public readonly statusCode: 429 | 403, public readonly requiredTier?: PlanTier) { super(...); this.name = 'TierLimitExceededError'; } readonly code = 'TIER_LIMIT_EXCEEDED' as const; }`. Extends ADR-026's typed-error pattern to `lib/stripe/`. `scripts/check-error-discipline.ts` widens its scan scope from `lib/auth/**.ts(x)` to `lib/auth/**.ts(x), lib/stripe/**.ts(x)` (ts-morph diff is one-line). 429-vs-403 routing lives on the class instance, not at the catch site — keeps each endpoint's catch identical.

### Error Contract + publishPolicy Auto-Trigger

- **D-17 (Q-17): Inline try/catch + `NextResponse.json` in each endpoint.** Each endpoint has its own catch with the 503 response: `return NextResponse.json({ error: 'ai_service_unavailable', retryAfter: 30 }, { status: 503, headers: { 'Retry-After': '30' } })`. The catch also discriminates `TierLimitExceededError` per D-15. ~12 lines × 4 endpoints; trade duplication for self-contained legibility. (Optional polish: extract a tiny `ai503Response()` helper inside `lib/ai/responses.ts` if plan-phase finds the duplication noisy — operator OK with either; D-17 picks inline as the default.)
- **D-18 (Q-18): Logging uses per-endpoint prefix.** `console.error('[ai/draft] anthropic failed', { error: err instanceof Error ? { name: err.name, message: err.message } : err })`, `console.error('[ai/summary] ...')`, etc. Matches the Phase 3 `[createPolicyAction]` precedent. Object literal keeps the field structure for Phase 7+ JSON-log migration. Internal `generateSummaryForPolicy` (the `publishPolicy` auto-trigger path) uses `[publish] summary failed` per SPEC.md R3 verbatim.
- **D-19 (Q-19): `publishPolicy` auto-triggers TL;DR synchronously after commit.** Pattern inside `publish()` orchestrator: outer `withOrgScope(ctx, async (s) => { ... state transition ... })` runs first and commits; then a SECOND `await generateSummaryForPolicy(policyId, ctx)` runs OUTSIDE that transaction. The helper opens its own `withOrgScope` (its own transaction) to fetch the policy + write the `ai_generations` row + update `policies.tldrSummary`. Failure path: try/catch wraps the helper call; on throw, `console.error('[publish] summary failed', { policyId, error })` and continue. Caller waits for both transition + Haiku (~1-3s typical) — acceptable latency; admin sees the populated TL;DR on the post-publish render. Implementation note: `generateSummaryForPolicy` is exported from `lib/ai/summary.ts` (not from `lib/policies/transitions.ts`), so the AI domain stays self-contained.

### Admin UI Hooks

- **D-20 (Q-20): Consistency Check page is `/dashboard/consistency`.** Honors Phase 3 D-01 admin URL convention (no `/admin/*` prefix). `middleware.ts` `ADMIN_URL_PATTERNS` already covers `/^\/dashboard(\/|$)/` — zero matcher changes. Sidebar nav adds an entry under the Dashboard group ("Consistency Check"), disabled with upgrade-tooltip on Starter orgs per SPEC R5.
- **D-21 (Q-21): Polling auto-refreshes every 30s.** `components/admin/ConsistencyCheckRunner.tsx` is a Client Component (`'use client'`) with `useEffect` + `setInterval(() => fetch('/api/ai/consistency/' + batchId), 30000)`. Visible status indicator: "Checking... (started Xm ago)" updated each tick. On `status === 'completed'`, interval clears + the findings list renders. On `status === 'failed'`, error toast + interval clears. Tab inactive: browser throttles to ~1min — acceptable.
- **D-22 (Q-22): Draft dialog has two fields.** `prompt` (shadcn `Textarea`) + `policyType` (shadcn `Select` populated from the same `POLICY_CATEGORIES` const used by `new/actions.ts`). Submit calls `POST /api/ai/draft` with `{ prompt, policyType }` per SPEC R2 API contract. On success, `editor.commands.setContent(JSON.parse(draftContent))` pre-fills the editor; on tier-limit overage, dialog shows "You've used X/Y drafts this month. Upgrade to Growth for more →" (links `/pricing`); on 503, dialog shows the generic "AI service temporarily unavailable" copy + manual retry hint.
- **D-23 (Q-23): Findings list is collapsed by default with click-to-expand.** Within each severity group (high → medium → low), each finding renders as a shadcn `Collapsible` showing the policy_a vs policy_b pair + `issue_type` badge + 1-line excerpt of the description. Click expands to show the full description. Severity grouping is locked by SPEC R5. shadcn `Collapsible` is the chosen primitive (not `Accordion`, since multiple findings can be open simultaneously). Plan-phase decides whether to install the `Collapsible` shadcn primitive or render with a stateful Client Component using a `Set<string>` of expanded IDs — either works; Collapsible is the lighter-touch choice.

### Verify Chain + Tests

- **D-24 (Q-24): `verify:phase-4` wraps `verify:phase-3`.** Script: `pnpm verify:phase-3 && pnpm check:ai-layer && pnpm check:ai-prompts`. Phase-3 gates fire first (10 gates including typecheck, RLS, policy-id-brand, etc.); phase-4 gates layer on top. ADR-029's "main green at each phase boundary" requirement is satisfied — each phase keeps its own `verify` command. `check:artifacts` extended with new Phase 4 file-existence rows in the same chain (added to verify:phase-3's existing `check:artifacts` invocation, NOT a separate gate).
- **D-25 (Q-25): Cache-hit assertion uses a vitest fixture.** Mocked `getAnthropicClient().messages.create` returns `{ ..., usage: { cache_creation_input_tokens: N, cache_read_input_tokens: 0 } }` on first call and `{ ..., usage: { cache_read_input_tokens: N, cache_creation_input_tokens: 0 } }` on second call. Test asserts the endpoint's response (or instrumented log) exposes `usage.cache_read_input_tokens > 0`. Verifies the endpoint READS the cache_read field — does NOT verify Anthropic actually caches (that's a live-integration concern out of scope for Phase 4 unit tests).
- **D-26 (Q-26): `scripts/check-ai-prompts.ts` is a ts-morph gate.** Reads `lib/ai/prompts.ts`, extracts the 4 exported string literals (`DRAFT_SYSTEM_PROMPT`, `SUMMARY_SYSTEM_PROMPT`, `QA_SYSTEM_PROMPT_TEMPLATE`, `CONSISTENCY_SYSTEM_PROMPT`), reads `reference/PROMPTS.md`, and asserts each constant CONTAINS a hardcoded 40-char anchor from PROMPTS.md. Anchors are hardcoded in the script (not regex-extracted) so a refactor of PROMPTS.md still requires conscious anchor updates. Matches `scripts/check-error-discipline.ts` + `scripts/check-policy-id-brand.ts` ts-morph precedent.
- **D-27 (Q-27): API-SPEC.md amendment is doc-only — no new ADR.** `reference/API-SPEC.md` is amended inline: the `POST /api/ai/qa` Response line changes from `{ answer: string, citations: string[] }` to `{ answer: string, citations: { title: string, id: string }[] }`. PROMPTS.md is amended in the same commit with the citation-block instruction. SPEC.md R4 (Notable cross-contract impact) carries the decision rationale; no ADR-030 needed. Commit message references "Phase 4 SHIP — citation shape contract widened per SPEC.md R4".

### Claude's Discretion

The following are left to plan-phase / executor judgment within the constraints above:

- **Exact `@anthropic-ai/sdk` version pinned at install time.** D-01 locks the strategy (exact pin); plan-phase picks the version current at install (e.g., `0.65.x`) after running `audit-before-security-changes` sweep.
- **Shadcn primitive choice for the Draft dialog** — `Dialog` already installed in Phase 3 D-13. Plan-phase chooses whether to use plain `Dialog` or wrap with `AlertDialog` (Phase 3 didn't install AlertDialog — likely just stick with `Dialog`).
- **Whether to install shadcn `Collapsible` or hand-roll the expand/collapse state for findings.** Both work; recommendation: install Collapsible via `shadcn add collapsible` for the cleaner DX. Adds one shadcn component, no new npm dependencies.
- **Exact 40-char anchors used by `scripts/check-ai-prompts.ts`.** Plan-phase picks four reasonably-stable substrings (e.g., for Q&A: `"may ONLY use the policy documents provided"`).
- **TipTap-text-extraction implementation** in `lib/ai/qa-extract.ts` — regex strip-tags vs a tiny custom JSON walker. Both acceptable. Recommendation: try regex `/<[^>]+>/g` strip first against `generateHTML` output; fall back to JSON walker only if rendering quirks (entities, nested formatting) cause Claude misreads in vitest fixtures.
- **`generateSummaryForPolicy` exact signature.** Inferred: `(policyId: PolicyId, ctx: OrgContext): Promise<void>`. Plan-phase confirms with the existing `transitions.ts` orchestrator pattern; the helper opens its own `withOrgScope`. ADR-028 brand applies to the policyId parameter.
- **Whether `check-ai-layer.ts` seeds its own org + user fixtures or reuses `check-rls.ts`'s seed pattern.** Recommendation: follow the `check-policies-list-filters.ts` pattern (Plan 3.x VALIDATION-2.7 closure) which seeds + tears down in a single script invocation with intentional ROLLBACK.
- **PolicyEditor "Generate with AI" button placement and disable-on-loading UX details.** Sticky/floating button, modal trigger via `<DialogTrigger>` wrapping a shadcn `Button`. Plan-phase picks copy + position.
- **`/dashboard/consistency` page layout.** Plan-phase composes the runner + findings list. Use the existing admin shell from Phase 3 (sidebar + topbar).

### Folded Todos

None — no STATE.md carry-forward todos matched this phase's scope. The Phase-3 audit-cascade carry-forwards (`SF-CASCADE-AUDIT`, `Nyquist G-08a/G-09a/G-03a`, `F-03/F-05/F-06`) remain out of scope per their existing deferrals.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (gsd-phase-researcher, gsd-planner) MUST read these before planning or implementing.**

### Locked requirements (READ FIRST)

- `.planning/phases/04-ai-layer/04-SPEC.md` — **MANDATORY.** 7 locked requirements + 22 falsifiable acceptance criteria + boundaries + constraints. Plan-phase's first read.
- `.planning/phases/04-ai-layer/04-QUESTIONS.json` — 27 captured implementation decisions (source-of-truth for D-01..D-27 in this CONTEXT.md). Resolution notes for Q-15/Q-16 in `chat_more` fields.

### Architectural decisions (locked ADRs — read in full)

- `.planning/intel/decisions.md` — full text for the following ADRs that bind Phase 4:
  - **ADR-005** (TL;DR summaries cached at publish time)
  - **ADR-006** (Prompt caching on Q&A endpoint, `cache_control: ephemeral`)
  - **ADR-007** + **ADR-029** (phase order + parallelization rules — Phase 4 ‖ Phase 5 is the Wave-1 candidate; operator chooses per-bandwidth)
  - **ADR-015** (Claude Sonnet 4.6 primary + Haiku 4.5 summaries — model selection locked)
  - **ADR-018** (Append-only acknowledgment audit trail — `ai_generations` carries the same SUCCESS-ONLY-row spirit per D-06)
  - **ADR-019** + **ADR-023** + **ADR-025** (`org_id` in every query + per-aggregate repositories + RLS via JWT injection — all 4 API routes go through `withOrgScope`)
  - **ADR-021** (Batch API for Consistency Check — synchronous Messages API forbidden)
  - **ADR-024** (Middleware procedural; tier gating is app-layer — `lib/stripe/products.ts` is the single source of truth; ADR-024's "lib/stripe/limits.ts" path is reconciled to "lib/stripe/products.ts" by Phase 4 per D-14)
  - **ADR-026** (Typed error classes — Phase 4 extends the pattern to `lib/stripe/errors.ts` per D-16)
  - **ADR-027** (Lookup-scoping in `getOrgContext` — all AI endpoints call `getOrgContext` and inherit the protection)
  - **ADR-028** (PolicyId branded type — `Policies.listPublishedForOrg`, `Policies.updateSummary`, and `generateSummaryForPolicy` all take `PolicyId` not raw `string`)
- `.planning/PROJECT.md` `<decisions>` block — short-form catalog of all 29 ADRs.

### Frozen contracts (Phase 4 amends two; respect the rest)

- `reference/API-SPEC.md` — `POST /api/ai/draft`, `POST /api/ai/summary`, `POST /api/ai/qa`, `POST /api/ai/consistency`, `GET /api/ai/consistency/[batchId]`. **AMENDED in Phase 4 ship** — the Q&A `citations` shape changes from `string[]` to `{ title, id }[]` per D-27.
- `reference/PROMPTS.md` — verbatim system prompts for all 4 surfaces. **AMENDED in Phase 4 ship** — the Q&A prompt gains a trailing citation-block instruction per D-10. The 4 string-literal exports in `lib/ai/prompts.ts` carry the amendment; the ts-morph gate (D-26) anchors on a verbatim substring from the original PROMPTS.md body, not the amendment.
- `reference/TIER-LIMITS.md` — `TIER_LIMITS` constant + gate check pattern. `lib/stripe/products.ts` exports the constant verbatim. Phase 6 syncs the Stripe webhook to `organizations.planTier`; Phase 4's `checkTierLimit` defaults to `'starter'` when `planTier IS NULL`.
- `reference/SCHEMA.md` — `ai_generations` table shape locked in Phase 2 (`id`, `orgId`, `policyId`, `type`, `prompt`, `result`, `tokensUsed`, `model`). **AMENDED in Phase 4 ship** — new `batch_jobs` table added per D-06.
- `reference/STACK.md` — stack decisions and rationale.

### Requirements (Phase 4 anchoring)

- `.planning/REQUIREMENTS.md` **REQ-ai-policy-assistant** — 4 AI surfaces (Draft, Q&A, TL;DR, Consistency).
- `.planning/REQUIREMENTS.md` **REQ-ai-usage-rules** — tier limits, citations, legal disclaimer, all calls logged.
- `.planning/ROADMAP.md` Phase 4 — goal, depends-on Phase 3 (ADR-029), anchoring decisions, 5 success criteria.

### Existing code from Phase 1-3 (read before extending)

- `lib/db/repositories/ai_generations.ts` — Phase 2 skeleton with `listAll` (real) + `record` (throw-stub). Phase 4 fills with D-08's 3 methods + renames `record` to `insert` if needed.
- `lib/db/repositories/policies.ts` — Phase 3 ships `create`, `findById`, `listAll`, `listWithFilters`, `updateDraft`, `incrementVersion`, `statusCounts`. Phase 4 adds `listPublishedForOrg` (D-12) + `updateSummary` (D-09).
- `lib/db/schema.ts` — Drizzle source-of-truth. Phase 4 adds the `batchJobs` table (D-06).
- `lib/db/scoped.ts` — `withOrgScope` wrapper. All 5 new API routes use it.
- `lib/auth/context.ts` — `getOrgContext()`. All 5 new API routes use it (`/api/ai/qa` uses it without role check; the other 4 add `requireAdmin`).
- `lib/auth/require-admin.ts` — admin gate. Used by Draft, Summary, Consistency endpoints.
- `lib/auth/errors.ts` — typed error hierarchy (ADR-026). The new `lib/stripe/errors.ts` mirrors the same pattern.
- `lib/policies/transitions.ts` — Phase 3 orchestrators. Phase 4 MODIFIES `publish` to add the post-commit `generateSummaryForPolicy` call per D-19.
- `lib/policies/types.ts` — `PolicyId` branded type (ADR-028). Phase 4 threads `PolicyId` through `Policies.updateSummary`, `Policies.listPublishedForOrg`, and `generateSummaryForPolicy`.
- `components/policy/PolicyEditor.tsx` — Phase 3 ships TipTap editor with `useEditor`. Phase 4 ADDS a "Generate with AI" button + dialog without changing the editor surface (D-22).
- `components/policy/PolicyView.tsx` — Phase 3 ships read-only view. Phase 4 ADDS a "Regenerate TL;DR" button per SPEC R3.
- `app/(admin)/policies/new/actions.ts` — Phase 3 Server Action. Phase 4 does NOT modify it (Draft button uses `/api/ai/draft` directly, not a Server Action; the editor pre-fill happens client-side after the fetch response).
- `app/(admin)/policies/[id]/actions.ts` — Phase 3 Server Actions for state transitions. Phase 4 modifies via the underlying `lib/policies/transitions.ts` orchestrator only.
- `scripts/check-artifacts.ts` — Phase 1+2+3 artifact gate. Phase 4 extends with new Phase 4 file-existence rows (5 new endpoint route.ts, batch_jobs schema entry, new lib/ai/* files, new check scripts).
- `scripts/check-error-discipline.ts` — Phase 3 ts-morph gate scoped to `lib/auth/**.ts(x)`. Phase 4 widens scope to `lib/auth/**.ts(x), lib/stripe/**.ts(x)` per D-16.
- `tests/types.ts` — Phase 2+3 D-07 invariants. Phase 4 may add an `AiGenerations.update` / `delete` forbidden line if the SUCCESS-ONLY semantic graduates to type-level enforcement (optional polish; not required by SPEC).
- `tests/setup.ts` — Phase 3 jsdom shim. Phase 4 uses same setup; Anthropic-mock fixtures live per-test file (D-25).
- `package.json` `verify:phase-3` — 10-gate chain. Phase 4 adds `verify:phase-4` that wraps `verify:phase-3` + 2 new gates per D-24.

### Operating rules (apply globally; called out for Phase 4 because they bind hard here)

- `CLAUDE.md` "Always / Ask First / Never" — Anthropic SDK is the lone new prod dependency in Phase 4; ASK FIRST rule waived because the SDK is named in the stack table (Phase 4 doesn't surprise the operator). `audit-before-security-changes` memory rule fires before install. NEVER call Claude API client-side. NEVER use `any`. ALWAYS go through `checkTierLimit` / `requireTierLimit` before any Claude call.
- `CLAUDE.md` "Multi-Tenancy Rules" — every AI endpoint scoped by `org_id` via `withOrgScope`. Q&A's `Policies.listPublishedForOrg` filters by `scope.orgId`; cross-org policy leakage in citations would be a Phase-4 failure mode the integration test catches.
- `CLAUDE.md` "Stripe Rules" — Phase 6 owns the webhook events; Phase 4 only reads `organizations.planTier` (treating null as `'starter'`).
- `CLAUDE.md` "AI API Rules" — Sonnet 4.6 for draft/qa/consistency; Haiku 4.5 for summary; Batch API for consistency; prompt caching mandatory; ai_generations row on every successful call.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`getOrgContext()` + `withOrgScope(ctx, fn)`** — every AI endpoint opens `withOrgScope` for DB access. Q&A uses `getOrgContext` for any-authenticated-user gate; Draft/Summary/Consistency add `requireAdmin` per their SPEC contracts.
- **`requireAdmin()` (lib/auth/require-admin.ts)** — server-side admin gate that calls `notFound()` on non-admin. Used by Draft + Summary + Consistency endpoints.
- **`Policies.findById`, `Policies.create`, `Policies.updateDraft`** — Phase 3 repository methods. Phase 4 adds 2 new methods (`listPublishedForOrg`, `updateSummary`) following the same OrgScope-first pattern.
- **`PolicyId` branded type (lib/policies/types.ts)** — ADR-028. Phase 4 threads through `policyIdFromString(value)` at the trust boundaries (`/api/ai/summary` reads `policyId` from JSON body; `/api/ai/draft` doesn't take a policyId).
- **`IllegalTransitionError` (lib/policies/state-machine.ts)** — typed-error precedent. `TierLimitExceededError` follows the same class shape (constructor with `public readonly` params; `this.name = ClassName`; `readonly code` for structured logging).
- **`BootstrapError` hierarchy (lib/auth/errors.ts)** — typed-error precedent for the broader pattern. ADR-026 + Phase 3 PR-#5 ship this. Phase 4's `TierLimitExceededError` extends `Error` directly (not `BootstrapError` — tier errors are billing-domain, not auth-bootstrap).
- **TipTap `generateHTML` (@tiptap/html)** — Phase 3 dep, already installed. Phase 4 uses it for Q&A content extraction (D-07).
- **`@tiptap/starter-kit` + `@tiptap/extension-link`** — Phase 3 deps. Same extension allow-list used in Q&A's `generateHTML(contentJson, [StarterKit, Link])`.
- **`Zod` (zod ^3.23.5)** — Phase 3 dep. Phase 4 endpoints validate request bodies via Zod (`/api/ai/draft` body schema, `/api/ai/summary` body schema). Mirrors `new/actions.ts:59-81` pattern.

### Established Patterns

- **`'server-only'` at top of every server module** — including all new `lib/ai/*.ts` files. Phase 4 enforces.
- **Vitest `vi.mock` with hoisted mock state** — Phase 3 pattern in `app/(admin)/policies/[id]/actions.test.ts`. Phase 4 mirrors for `vi.mock('@/lib/ai/client', ...)`.
- **Server Actions wrap orchestrators; orchestrators wrap repository calls; all DB work inside `withOrgScope`** — Phase 3 pattern. Phase 4 endpoints (API routes, not Server Actions) follow the same orchestrator pattern: route handler → tier check → withOrgScope(repository + Anthropic call) → response.
- **Endpoint error responses via `NextResponse.json({...}, { status, headers })`** — Phase 2+3 pattern (webhook handler). Phase 4 endpoints use the same shape.
- **`scripts/check-*.ts` gates added to `verify:phase-N` chain** — Phase 1+2+3 pattern. Phase 4 adds `check-ai-layer.ts` + `check-ai-prompts.ts`.
- **`scripts/check-artifacts.ts` row additions for every new file** — Phase 1+2+3 pattern; Phase 4 extends.
- **Per-aggregate repository surface; no raw `db` import** — ADR-023 + `scripts/check-db-imports.ts` enforces. Phase 4's `lib/db/repositories/batch_jobs.ts` follows the same OrgScope-first shape.
- **Migrations split into schema-generated + RLS-handwritten** — Phase 2 D-05. Phase 4 ships `drizzle/0004_initial_batch_jobs.sql` (Drizzle-generated, `pnpm db:generate`) + `drizzle/0005_rls_batch_jobs.sql` (hand-written `ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "org_isolation" ON batch_jobs ...` + `GRANT ALL ON batch_jobs TO authenticated` + the org_id NOT NULL CHECK). Plan-phase verifies + ships both.

### Integration Points

- **`publishPolicy` in `lib/policies/transitions.ts`** — Phase 4 MODIFIES the function body to add the post-commit `generateSummaryForPolicy` call per D-19. The state-transition transaction stays untouched; the AI call runs after commit in a try/catch.
- **`PolicyEditor` in `components/policy/PolicyEditor.tsx`** — Phase 4 ADDS a sibling Client Component `PolicyAiDraftDialog.tsx` (NOT inside PolicyEditor.tsx; cleaner separation). The dialog is rendered alongside the editor on `/policies/new`; on success it calls `editor.commands.setContent(...)` via a ref passed down from the parent.
- **`PolicyView` in `components/policy/PolicyView.tsx`** — Phase 4 ADDS a sibling Client Component `PolicyRegenerateTldrButton.tsx` rendered next to the existing PolicyView. Button calls `POST /api/ai/summary` with the current policyId; on success, calls `router.refresh()` to re-render with the new summary.
- **`middleware.ts`** — UNCHANGED in Phase 4. `/dashboard/consistency` is already covered by the existing `/dashboard(/|$)` ADMIN_URL_PATTERN; `/api/ai/*` routes are gated per-endpoint via `requireAdmin` or `getOrgContext` inside the route handlers, not by middleware.
- **`scripts/check-admin-routes.ts`** — Phase 3 gate validates `app/(admin)/<route>/page.tsx` files match `ADMIN_URL_PATTERNS`. Phase 4 adds the `consistency/page.tsx` under `dashboard/` — the existing matcher covers it; the gate stays green.
- **Stripe webhook (`/api/webhooks/stripe`)** — does NOT exist yet (Phase 6). Phase 4 reads `organizations.planTier` directly via Drizzle inside `checkTierLimit`; null defaults to `'starter'`. No webhook interaction in Phase 4.

</code_context>

<specifics>
## Specific Ideas

### `lib/ai/client.ts` exact body (D-02)

```typescript
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

/**
 * Lazy singleton accessor for the Anthropic SDK client. Server-only.
 * Reads ANTHROPIC_API_KEY from process.env on first call.
 * Mock via vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => mockClient })).
 */
export function getAnthropicClient(): Anthropic {
  return cached ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}
```

### `lib/ai/models.ts` exact body (D-04)

```typescript
import 'server-only';

export const MODEL_SONNET = 'claude-sonnet-4-6' as const;
export const MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const;

export type ModelId = typeof MODEL_SONNET | typeof MODEL_HAIKU;
```

### `lib/ai/cache.ts` exact body (D-03)

```typescript
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

export const EPHEMERAL_CACHE = { type: 'ephemeral' } as const;

/**
 * Build a `system` array suitable for `messages.create({ system: ... })`
 * with one cache-tagged text block. Pair multiple calls for Q&A's two-block
 * pattern (static system prompt + per-org policy library).
 */
export function buildCachedSystem(
  text: string,
): Anthropic.Messages.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: EPHEMERAL_CACHE }];
}
```

### `lib/stripe/errors.ts` exact body (D-16)

```typescript
import 'server-only';
import type { TIER_LIMITS, PlanTier } from './products';

type TierFeature = keyof typeof TIER_LIMITS.starter;

export class TierLimitExceededError extends Error {
  public readonly code = 'TIER_LIMIT_EXCEEDED' as const;
  constructor(
    public readonly feature: TierFeature,
    public readonly limit: number,
    public readonly current: number,
    public readonly statusCode: 429 | 403,
    public readonly requiredTier?: PlanTier,
  ) {
    super(
      `Tier limit exceeded: feature=${feature} limit=${limit} current=${current}` +
        (requiredTier ? ` requiredTier=${requiredTier}` : ''),
    );
    this.name = 'TierLimitExceededError';
  }
}
```

### `requireTierLimit` exact shape (D-15)

```typescript
// in lib/stripe/products.ts
export async function requireTierLimit(
  orgId: string,
  feature: TierFeature,
): Promise<void> {
  const check = await checkTierLimit(orgId, feature);
  if (check.allowed) return;
  // Usage-bound limits → 429; tier-bound features → 403
  const usageBound = ['aiDraftsMonthly', 'maxUsers'] as const;
  const statusCode = (usageBound as readonly string[]).includes(feature)
    ? 429
    : 403;
  // requiredTier surfaces the next tier that satisfies a boolean feature
  const requiredTier: PlanTier | undefined =
    statusCode === 403 ? findRequiredTier(feature) : undefined;
  throw new TierLimitExceededError(
    feature,
    check.limit,
    check.current,
    statusCode,
    requiredTier,
  );
}
```

### Endpoint try/catch pattern (D-15 + D-17)

```typescript
// app/api/ai/draft/route.ts (sketch)
export async function POST(req: Request) {
  try {
    const ctx = await getOrgContext();
    if (ctx.role !== 'admin') return new Response(null, { status: 403 });
    await requireTierLimit(ctx.orgId, 'aiDraftsMonthly');     // throws TierLimitExceededError on overage
    const body = DraftSchema.parse(await req.json());
    const result = await withOrgScope(ctx, async (s) => {
      const anthropic = getAnthropicClient();
      const response = await anthropic.messages.create({
        model: MODEL_SONNET,
        system: buildCachedSystem(DRAFT_SYSTEM_PROMPT),
        messages: [{ role: 'user', content: formatDraftPrompt(body) }],
        max_tokens: 4096,
      });
      await AiGenerations.insert(s, {
        policyId: null, type: 'draft',
        prompt: body.prompt, result: extractText(response),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: MODEL_SONNET,
      });
      return { draftContent: extractText(response), tokensUsed: response.usage.output_tokens };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TierLimitExceededError) {
      return NextResponse.json(
        { error: 'tier_limit_exceeded', tierLimit: err.limit, currentUsage: err.current, upgradeUrl: '/pricing' },
        { status: err.statusCode },
      );
    }
    console.error('[ai/draft] anthropic failed', {
      error: err instanceof Error ? { name: err.name, message: err.message } : err,
    });
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
```

### `publishPolicy` modification (D-19)

```typescript
// lib/policies/transitions.ts (publish, modified)
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    await PolicyVersions.create(s, {
      policyId, versionNumber: policy.currentVersion,
      contentJson: policy.contentJson, createdBy: s.userId,
    });
    await s.tx.update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
  // Post-commit AI auto-trigger. Graceful-degrade per SPEC R3.
  try {
    await generateSummaryForPolicy(policyId, ctx);
  } catch (error) {
    console.error('[publish] summary failed', { policyId, error });
  }
}
```

### `generateSummaryForPolicy` exact shape (D-19)

```typescript
// lib/ai/summary.ts
import 'server-only';
import { withOrgScope } from '@/lib/db/scoped';
import type { OrgContext } from '@/lib/auth/context';
import type { PolicyId } from '@/lib/policies/types';
import { Policies } from '@/lib/db/repositories/policies';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_HAIKU } from '@/lib/ai/models';
import { buildCachedSystem } from '@/lib/ai/cache';
import { SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { policyToPromptText } from '@/lib/ai/qa-extract';

export async function generateSummaryForPolicy(
  policyId: PolicyId,
  ctx: OrgContext,
): Promise<void> {
  await withOrgScope(ctx, async (s) => {
    const rows = await Policies.findById(s, policyId);
    const policy = rows[0];
    if (!policy) throw new Error('Policy not found');
    if (policy.tldrSummary) return; // idempotent — SPEC R3
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: MODEL_HAIKU,
      system: buildCachedSystem(SUMMARY_SYSTEM_PROMPT),
      messages: [{ role: 'user', content: policyToPromptText(policy) }],
      max_tokens: 512,
    });
    const summary = extractText(response);
    await AiGenerations.insert(s, {
      policyId, type: 'summary', prompt: SUMMARY_SYSTEM_PROMPT,
      result: summary, tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model: MODEL_HAIKU,
    });
    await Policies.updateSummary(s, policyId, summary);
  });
}
```

### Q&A prompt amendment (D-10)

The Q&A system prompt in `lib/ai/prompts.ts` carries the verbatim PROMPTS.md text PLUS a trailing instruction:

```
[verbatim PROMPTS.md Q&A system prompt body...]

When citing policies, append this exact trailing block on a new paragraph:

--- CITATIONS ---
[{"title": "Policy Name", "id": "policy-uuid"}, ...]
--- END CITATIONS ---

The JSON array MUST be valid JSON. Each object MUST have exactly two keys: title (string) and id (string, the policy id from the <policy id="..."> XML attribute). If no policies were used to answer, output an empty array: [].
```

The `reference/PROMPTS.md` is amended with the same trailing block in the same commit.

### Citation parser exact regex (D-10 + D-11)

```typescript
// lib/ai/qa-parser.ts
const CITATION_FENCE = /\n--- CITATIONS ---\n([\s\S]*?)\n--- END CITATIONS ---/;

export function parseQaResponse(
  raw: string,
  validIds: Set<string>,
): { answer: string; citations: { title: string; id: string }[] } {
  const match = raw.match(CITATION_FENCE);
  if (!match) return { answer: raw.trim(), citations: [] };
  const body = raw.slice(0, match.index).trim();
  let citations: { title: string; id: string }[] = [];
  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      citations = parsed
        .filter((c): c is { title: string; id: string } =>
          c && typeof c.title === 'string' && typeof c.id === 'string')
        .filter((c) => validIds.has(c.id));   // strip hallucinated IDs per SPEC
    }
  } catch (err) {
    console.warn('[ai/qa] citation block present but unparseable', { err });
  }
  return { answer: body, citations };
}
```

### `batch_jobs` schema entry (D-06)

```typescript
// lib/db/schema.ts (addition)
export const batchJobs = pgTable('batch_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  anthropicBatchId: text('anthropic_batch_id').notNull().unique(),
  type: text('type').notNull(),       // 'consistency' for Phase 4; future surfaces extend
  status: text('status').notNull().default('in_progress'),  // 'in_progress' | 'completed' | 'failed'
  createdAt: timestamp('created_at').defaultNow(),
  resultJson: jsonb('result_json'),
});
```

### `verify:phase-4` script (D-24)

```json
"verify:phase-4": "pnpm verify:phase-3 && pnpm check:ai-layer && pnpm check:ai-prompts"
```

### Sidebar nav addition (D-20)

`components/admin/AdminSidebar.tsx` adds an item under the Dashboard group:

```
Dashboard ▼
  Overview            → /dashboard
  Consistency Check   → /dashboard/consistency   (Growth+ only — disabled on Starter)
```

</specifics>

<deferred>
## Deferred Ideas

- **Q&A UI surface** — Phase 5 (employee portal). The `/api/ai/qa` endpoint ships in Phase 4 with no UI wired; Phase 5 adds the chat panel + history.
- **`extracted_text` column + tsvector content search** — deferred indefinitely per Q-07=a. Revisit if customers report Q&A token-cost or content-search needs.
- **Cron-driven batch polling** — Phase 7+ Railway worker could replace D-21's client-side auto-poll if admin desktop hours matter. Phase 4 ships client-side polling per SPEC.
- **`ai_generations` append-only invariant via `@ts-expect-error`** — optional polish. `AiGenerations` repository would shed any future `update` / `delete` methods. Not required by SPEC; the SUCCESS-ONLY semantic already prevents pending-state writes, so `delete` is the bigger surface to guard if it ever appears.
- **`requireTier` (boolean-feature 403 redirect)** — Phase 6 ships this as the second function in `lib/stripe/products.ts` (per D-14 the file holds the constants AND the predicates AND the gates). Phase 4's `requireTierLimit` covers the usage-bound + tier-bound check; Phase 6's `requireTier` adds redirect helpers for Server Component gating.
- **Server-Sent Events for Consistency Check progress** — D-21's 30s poll is good enough for SMB scale. SSE adds a connection model the codebase doesn't have yet.
- **Anthropic API live-integration smoke test** — D-25 keeps cache-hit verification in vitest fixtures. A separate manual smoke against the live Anthropic API can run pre-ship; not wired into CI.
- **Streaming responses on Draft/Q&A** — out of scope per SPEC. Anthropic SDK supports streaming but no REQUIREMENTS criterion needs it. Revisit if customers want progressive draft generation.
- **Tool-use / structured outputs** for Q&A citations — D-10 picks plain-text fence. Tool use (Q-10 option c) is a stronger schema enforcement but adds latency + token cost. Revisit if the regex parser proves flaky in production telemetry.
- **Per-org Anthropic API key (BYOK)** — SPEC R1 reads a single `ANTHROPIC_API_KEY` env var. Per-org keys are a billing / enterprise question; not in scope.
- **AI usage analytics dashboard** — Phase 8 or post-MVP. Operator views per-Anthropic-console for now.
- **AI cost monitoring per-org** — same as above; per-Anthropic-console for now.
- **Multi-turn Q&A / conversation history** — SPEC explicit out-of-scope.
- **Self-hosted open-source model migration** — SPEC explicit post-MVP. Decision criterion documented in SPEC.md §Boundaries.
- **`SF-CASCADE-AUDIT`** — Phase 6+ tenant-delete audit hook (carry-forward from STATE.md; not Phase 4 concern).
- **`Nyquist G-08a/G-09a/G-03a`** — Phase 2.1 hardening (carry-forward from STATE.md; orthogonal to Phase 4).
- **F-03/F-05/F-06** (Phase 2 audit deferrals) — Phase 7+ obligations (rate-limit, key rotation, structured logging). Phase 4 does not address.

### Reviewed Todos (not folded)

None reviewed — STATE.md carry-forwards have no overlap with Phase 4 scope.

</deferred>

---

*Phase: 4-ai-layer*
*Context gathered: 2026-05-21*
