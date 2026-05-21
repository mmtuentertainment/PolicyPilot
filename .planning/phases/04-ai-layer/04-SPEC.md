# Phase 4: AI Layer — Specification

**Created:** 2026-05-21
**Ambiguity score:** 0.109 (gate: ≤ 0.20)
**Requirements:** 7 locked
**Anchoring decisions:** ADR-005, ADR-006, ADR-015, ADR-021 (per ROADMAP.md)
**Requirement mapping:** REQ-ai-policy-assistant, REQ-ai-usage-rules

## Goal

Four Claude-powered AI surfaces (Draft, TL;DR, Q&A, Consistency Check) are live as server-side API endpoints with admin-facing UI hooks (Draft button, Regenerate TL;DR, Consistency Check runner); Q&A UI is deferred to Phase 5. Every successful Anthropic call is logged to `ai_generations` and respects tier limits (`TIER_LIMITS.aiDraftsMonthly`, Growth+ gate on Consistency Check) using `organizations.planTier` with a `'starter'` default until Phase 6 wires Stripe.

## Background

**What exists today (post-Phase-3 ship at `bd2257a`):**

- The `ai_generations` table exists in the schema (`reference/SCHEMA.md:85-97`) with columns `id`, `orgId`, `policyId`, `type`, `prompt`, `result`, `tokensUsed`, `model`. RLS is enabled with the `org_isolation` policy from the Phase 2 migration. The repository skeleton `lib/db/repositories/ai-generations.ts` exists (created by Phase 2 Plan 02-04) but has only the OrgScope shell — no read/insert methods.
- Frozen contracts capture WHAT each AI surface delivers: `reference/PROMPTS.md` holds verbatim system prompts for all 4 surfaces; `reference/API-SPEC.md` specifies the 4 AI routes (`/api/ai/draft`, `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency`) plus the polling path implied by the Consistency Check process step; `reference/TIER-LIMITS.md` codifies `TIER_LIMITS` and the `checkTierLimit` signature.
- Phase 3 already shipped admin pages at `/policies/new` and `/policies/[id]` (TipTap-based PolicyEditor + PolicyView) and the `publishPolicy` transition in `lib/policies/transitions.ts` — these are the wire-in points for the Draft button and the auto-trigger TL;DR hook.

**What does NOT exist today (Phase 4's delta):**

- `@anthropic-ai/sdk` is not in `package.json` dependencies; `lib/ai/` directory does not exist; no `app/api/ai/*` route handlers exist; `checkTierLimit` is not implemented; admin UI has no Draft / TL;DR / Consistency Check hooks; `policies.tldrSummary` is never written (column exists, always null).
- Phase 6 (Stripe → `organizations.planTier` sync) has not shipped — Phase 4's `checkTierLimit` must defend correctly against null `planTier` and against orgs whose tier column is populated but whose Stripe subscription rows do not yet exist.

## Requirements

1. **AI client foundation**: Anthropic SDK installed and `lib/ai/` provides a typed singleton client + prompt constants.
   - Current: `@anthropic-ai/sdk` not in `package.json`; `lib/ai/` directory does not exist.
   - Target: `@anthropic-ai/sdk` (latest stable) in dependencies; `lib/ai/client.ts` exports a `getAnthropicClient()` singleton (server-only, reads `ANTHROPIC_API_KEY` from env); `lib/ai/prompts.ts` contains the 4 system prompts copied verbatim from `reference/PROMPTS.md` as exported string constants (`DRAFT_SYSTEM_PROMPT`, `SUMMARY_SYSTEM_PROMPT`, `QA_SYSTEM_PROMPT_TEMPLATE`, `CONSISTENCY_SYSTEM_PROMPT`); `.env.local.example` has `ANTHROPIC_API_KEY=` placeholder.
   - Acceptance: `pnpm typecheck` exits 0; `grep -q "@anthropic-ai/sdk" package.json` succeeds; the 4 prompt constants exist in `lib/ai/prompts.ts` and each contains the exact text from `reference/PROMPTS.md` (verbatim substring match for at least one 40-char anchor per prompt).

2. **Draft generation endpoint + admin UI hook**: Admin generates a policy draft via Claude Sonnet 4.6; result is written to `ai_generations`; tier-gated; admin can invoke it from `/policies/new`.
   - Current: No `/api/ai/draft` route exists. PolicyEditor at `/policies/new` has no AI-generation affordance.
   - Target: `POST /api/ai/draft` (`app/api/ai/draft/route.ts`) — admin-only (`requireAdmin` gate), reads `{ prompt: string, policyType?: string }`, runs `checkTierLimit(orgId, 'aiDraftsMonthly')` BEFORE the Anthropic call, calls `claude-sonnet-4-6` with prompt caching on the system prompt (`cache_control: { type: 'ephemeral' }`), writes one `ai_generations` row with `type='draft'` ON SUCCESS, returns `{ draftContent: string, tokensUsed: number }` with 200; returns 429 with `{ error: 'tier_limit_exceeded', tierLimit, currentUsage, upgradeUrl: '/pricing' }` on tier overage; returns 503 on Anthropic failure (see Requirement 7). PolicyEditor at `/policies/new` shows a "Generate with AI" button (admin-only); clicking opens a prompt-input dialog; on submit calls `/api/ai/draft` and pre-fills the editor with `draftContent`.
   - Acceptance: `POST /api/ai/draft` with admin Clerk session + valid body returns `{ draftContent, tokensUsed }` (both non-empty) and `SELECT count(*) FROM ai_generations WHERE type='draft' AND org_id=$1` increases by exactly 1; same call with non-admin Clerk session returns 403; same call from a Starter org with 50 prior `ai_generations` rows of `type='draft'` in current calendar month returns 429 with the documented body shape; visiting `/policies/new` as admin shows the "Generate with AI" button.

3. **TL;DR summary endpoint + publish auto-trigger + manual regenerate**: Each published policy has a Haiku 4.5 summary on `policies.tldrSummary`; auto-triggered by `publishPolicy`; admin can regenerate manually.
   - Current: No `/api/ai/summary` route. `policies.tldrSummary` column exists but is always null. `publishPolicy` in `lib/policies/transitions.ts` does not call any AI surface.
   - Target: `POST /api/ai/summary` (`app/api/ai/summary/route.ts`) — admin-only, reads `{ policyId: string }`, fetches the policy via `Policies.findById` (org-scoped), returns `{ summary }` directly if `policies.tldrSummary` is already non-null (no Anthropic call, no `ai_generations` row), otherwise calls `claude-haiku-4-5` with the summary prompt, writes one `ai_generations` row with `type='summary'` ON SUCCESS, updates `policies.tldrSummary` via the Policies repository, returns `{ summary }`; returns 503 on Anthropic failure. `publishPolicy` in `lib/policies/transitions.ts` invokes the summary generation logic (via an internal `generateSummaryForPolicy(policyId, ...)` helper, not a self-HTTP call) AFTER the state transition commits; summary failure is logged but does NOT roll back or fail `publishPolicy` — `policies.tldrSummary` stays null and admin can regenerate later. PolicyView at `/policies/[id]` shows a "Regenerate TL;DR" button (admin-only) that calls `/api/ai/summary` and refreshes the view.
   - Acceptance: First call to `POST /api/ai/summary` for a policy returns `{ summary }` and `ai_generations` has +1 row of `type='summary'`; second call to same policy returns the SAME `summary` value AND `ai_generations` count unchanged; transitioning a policy to `published` via `publishPolicy` with Anthropic mock throwing 500 results in (a) the policy successfully reaching `published` status, (b) `policies.tldrSummary IS NULL`, (c) no error thrown to caller; visiting `/policies/[id]` as admin shows the "Regenerate TL;DR" button.

4. **Q&A endpoint with prompt caching + structured citations + legal disclaimer**: Authenticated users can ask natural-language questions; Q&A answers ONLY from the requesting org's published policies; cache hit on subsequent calls.
   - Current: No `/api/ai/qa` route. No Q&A UI in admin or employee surfaces.
   - Target: `POST /api/ai/qa` (`app/api/ai/qa/route.ts`) — any authenticated user via `getOrgContext` gate, reads `{ question: string }`, fetches all `status='published'` policies for the org via `Policies.listPublishedForOrg` (a new method on the Policies repository), builds the Q&A system prompt with policy library block AND `cache_control: { type: 'ephemeral' }` on the policy library section (per `reference/PROMPTS.md` cache annotation), calls `claude-sonnet-4-6`, writes one `ai_generations` row with `type='qa'` ON SUCCESS, parses the model response into `{ answer: string, citations: { title: string, id: string }[] }` (the system prompt is amended to instruct Claude to format citations as a structured trailing block parseable by `lib/ai/qa-parser.ts`), returns 200 with that shape; returns 503 on Anthropic failure. When the model has no matching information, `answer` contains the exact string `"I couldn't find information about that in our current policies. Please contact HR directly."` (this is enforced by the system prompt in `reference/PROMPTS.md`); `citations` may be empty `[]` in that case. When the model judges the question legal-adjacent, `answer` contains the exact substring `"For advice specific to your situation, consult your legal team."` (also enforced by the system prompt). No Q&A UI ships in Phase 4 — UI is Phase 5.
   - Acceptance: `POST /api/ai/qa` from an authenticated user in an org with ≥1 published policy returns `{ answer, citations }`; `citations` is an array of `{ title: string, id: string }` objects where every `id` matches a real `policies.id` row in the same org with `status='published'`; same call with question fixture `"Can I be fired for refusing to work overtime?"` returns `answer` containing the exact substring `"For advice specific to your situation, consult your legal team."`; same call with question `"What time does the office open?"` (non-legal) returns `answer` NOT containing that substring; same call with question that has no policy match returns `answer = "I couldn't find information about that in our current policies. Please contact HR directly."` (exact string match) and `citations = []`; the Anthropic SDK response usage metadata on the 2nd successive call (same org, same policy library) shows `cache_read_input_tokens > 0` (provable via instrumented logs or unit-test fixture).

5. **Consistency Check endpoint + polling endpoint + admin runner UI**: Admin (Growth+ tier) submits the org's policy library to Claude Batch API for contradiction analysis; admin polls for result; admin UI surfaces the runner + result.
   - Current: No `/api/ai/consistency` route. No `/api/ai/consistency/[batchId]` polling route. No admin Consistency Check page.
   - Target: `POST /api/ai/consistency` (`app/api/ai/consistency/route.ts`) — admin-only, requires `checkTierLimit(orgId, 'consistencyCheck') === { allowed: true }` (Starter returns 403 with `{ error: 'tier_limit_exceeded', requiredTier: 'growth', upgradeUrl: '/pricing' }`), reads no body (uses org's full published policy library), fetches policies, submits batch via Anthropic Messages Batches API (`anthropic.messages.batches.create`), stores the returned `batch.id` against a new row in a `batch_jobs` table (small new table with `id`, `orgId`, `anthropicBatchId`, `type='consistency'`, `status`, `createdAt`, `resultJson`) — **OR** stores it in an `ai_generations` row with `type='consistency'` and `result='PENDING:<batchId>'` placeholder until completion (choice deferred to discuss-phase as a HOW question; SPEC locks the OBSERVABLE contract). Returns `{ batchId: string }` on 200; returns 403 on Starter org; returns 503 on Anthropic submission failure. `GET /api/ai/consistency/[batchId]` (`app/api/ai/consistency/[batchId]/route.ts`) — admin-only, looks up batch status via `anthropic.messages.batches.retrieve(batchId)`, returns `{ status: 'in_progress' | 'completed' | 'failed', result?: ConsistencyFinding[] }` where `ConsistencyFinding = { policy_a: string, policy_b: string, issue_type: 'contradiction' | 'conflicting_value' | 'undefined_term', description: string, severity: 'high' | 'medium' | 'low' }` matching the `reference/PROMPTS.md` Consistency schema verbatim. On batch `completed`, the result JSON is persisted (one `ai_generations` row with `type='consistency'` written ON COMPLETION, not at submission). Admin Consistency Check page at `/admin/consistency` (or `/dashboard/consistency`) shows "Run consistency check" button (Growth+ gate visible-but-disabled with upgrade prompt on Starter) and renders the polled result as a list of findings grouped by severity.
   - Acceptance: `POST /api/ai/consistency` from admin in a Growth+ org returns 200 with `{ batchId: <string matching Anthropic batch ID pattern> }`; same call from admin in a Starter org returns 403 with the documented body; `GET /api/ai/consistency/[batchId]` returns `{ status: 'in_progress' | 'completed' | 'failed', result? }` and when `status === 'completed'`, `result` is an array of objects each matching the `ConsistencyFinding` schema; visiting `/admin/consistency` as admin in a Growth+ org renders the "Run consistency check" button; same page in a Starter org shows the button as disabled with an upgrade prompt.

6. **Tier-limit enforcement (`checkTierLimit`)**: Phase 4 ships the gate-check logic that Phase 6 will later populate `planTier` against.
   - Current: `lib/stripe/products.ts` does not exist. `checkTierLimit` is not implemented. `organizations.planTier` column exists but is never read by application code.
   - Target: `lib/stripe/products.ts` exports `TIER_LIMITS` exactly matching the constant in `reference/TIER-LIMITS.md` AND `checkTierLimit(orgId: string, feature: TierFeature): Promise<{ allowed: boolean; limit: number; current: number }>`. Behavior: reads `organizations.planTier`; if null OR not in the 3 allowed tiers, defaults to `'starter'`. For `aiDraftsMonthly`: returns `{ allowed: current < limit, limit: TIER_LIMITS[tier].aiDraftsMonthly, current: <count of ai_generations rows where org_id=$1 AND type='draft' AND created_at >= start of current calendar month UTC> }`; if `limit === -1` (Business unlimited), always `allowed: true`. For boolean features (`consistencyCheck`, `approvalWorkflows`, etc.): returns `{ allowed: TIER_LIMITS[tier][feature] === true, limit: -1, current: 0 }`. All API endpoints call `checkTierLimit` BEFORE the Anthropic call; on `allowed: false`, return 429 (for usage-bound limits like draft) or 403 (for tier-bound features like Consistency Check) with the documented error body shape.
   - Acceptance: `checkTierLimit(orgId, 'aiDraftsMonthly')` for an org with `planTier='starter'` and 0 draft `ai_generations` rows returns `{ allowed: true, limit: 50, current: 0 }`; same org with 50 draft rows in current month returns `{ allowed: false, limit: 50, current: 50 }`; `checkTierLimit(orgId, 'consistencyCheck')` for a Starter org returns `{ allowed: false, limit: -1, current: 0 }`; for a Growth org returns `{ allowed: true, limit: -1, current: 0 }`; org with `planTier IS NULL` is treated identically to `planTier='starter'`.

7. **Anthropic failure error contract**: All AI endpoints return a consistent 503 envelope on Anthropic SDK errors and no `ai_generations` row is written on failure.
   - Current: No error contract exists — there are no AI endpoints.
   - Target: All 4 endpoints (`/api/ai/draft`, `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency` submit) wrap the Anthropic call in try/catch and on ANY SDK error (network, 5xx, rate limit `RateLimitError`, content filter, timeout) return HTTP 503 with body `{ error: 'ai_service_unavailable', retryAfter: 30 }` AND header `Retry-After: 30`. The `ai_generations` insert ONLY happens after a successful Anthropic response; failure path writes nothing to `ai_generations`. The `publishPolicy` auto-trigger of summary is the one exception: if the internal summary helper throws on Anthropic failure, the throw is caught at the `publishPolicy` boundary, logged via `console.error('[publish] summary failed', { policyId, error })`, and `publishPolicy` returns successfully with `policies.tldrSummary` unchanged (typically null).
   - Acceptance: With Anthropic SDK mocked to throw on every call, `POST /api/ai/draft` returns 503 with body `{ error: 'ai_service_unavailable', retryAfter: 30 }` and `Retry-After: 30` header; same for `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency`; after these 4 failed calls, `SELECT count(*) FROM ai_generations` is unchanged; `publishPolicy(policyId)` with summary helper mocked to throw on Anthropic failure successfully transitions the policy to `'published'`, returns no error, and `policies.tldrSummary IS NULL` post-publish.

## Boundaries

**In scope:**

- `@anthropic-ai/sdk` installation + `lib/ai/` foundation (client singleton, prompt constants, cache helper, parser for Q&A citations).
- 5 server-side API route handlers: `/api/ai/draft`, `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency` (POST submit), `/api/ai/consistency/[batchId]` (GET poll).
- `lib/stripe/products.ts` exporting `TIER_LIMITS` + `checkTierLimit` — the gate logic that Phase 4 calls and that Phase 6 will populate (via Stripe webhooks updating `organizations.planTier`).
- Admin-facing UI hooks: "Generate with AI" button in PolicyEditor at `/policies/new`; "Regenerate TL;DR" button in PolicyView at `/policies/[id]`; "Run consistency check" page at `/admin/consistency` (or `/dashboard/consistency`, exact path is HOW for discuss-phase) with result rendering.
- `publishPolicy` transition modification: invoke summary generation helper after state transition commits; graceful-degrade on failure.
- `ai_generations` repository body (Phase 2 ships skeleton): `insert`, `countByTypeInMonth`, `findByBatchId` (for Consistency polling).
- A small `batch_jobs` table OR an `ai_generations.batchId` column to track Anthropic batch state (exact data shape is HOW for discuss-phase).
- API-SPEC.md amendment for the `citations` shape change (`string[]` → `{ title: string, id: string }[]`) — must ship as part of Phase 4 so the contract matches the implementation.
- `pnpm verify:phase-4` orchestrator script + `scripts/check-ai-layer.ts` integration test that exercises all 4 endpoints against mocked Anthropic + the live TEST DB.
- Vitest unit tests for: prompt-constant verbatim match, citation parser, tier-check math, 503 error contract, publishPolicy graceful-degrade path.

**Out of scope:**

- **Q&A UI surfaces** — the employee Q&A surface (chat panel, history) is Phase 5; admin Q&A is not a planned surface (admins use Q&A as employees if at all).
- **Stripe billing / `planTier` population** — `organizations.planTier` is read by `checkTierLimit` with a `'starter'` default; the actual SUBSCRIPTION column update on Stripe webhook events is Phase 6.
- **Notification emails for AI events** (e.g. "TL;DR generation failed") — Phase 7 (Crons + Email).
- **AI usage analytics dashboard** (drafts-per-month, cost-per-org, cache-hit-rate charts) — Phase 8 (Validation) or post-MVP.
- **Streaming responses** — All 4 endpoints return single JSON responses (the Anthropic SDK supports streaming, but neither REQUIREMENTS.md nor API-SPEC.md asks for it).
- **Multi-turn Q&A / conversation history** — Q&A is single-shot. No conversation state is persisted.
- **Auto-retry on Anthropic 5xx** — the 503 contract surfaces the failure cleanly; client (or operator) decides whether to retry. No app-side exponential backoff.
- **Custom model selection per request** — Sonnet 4.6 and Haiku 4.5 are LOCKED per ADR-005/ADR-006; not user-configurable.
- **AI cost monitoring / Anthropic billing dashboard** — operator monitors via Anthropic's own console; not a phase deliverable.
- **Background-worker plumbing for batch polling** — Consistency Check polls on admin's manual page load / button click (per API-SPEC.md: "Client polls /api/ai/consistency/[batchId] for result"); no cron/queue.

## Constraints

- **Model IDs locked**: `claude-sonnet-4-6` for Draft + Q&A + Consistency Check; `claude-haiku-4-5-20251001` (or current Haiku 4.5 stable ID) for TL;DR. Per ADR-005, ADR-006 (BLUEPRINT.md anchoring decisions). No alternate models permitted without a new ADR.
- **Anthropic SDK**: install latest stable `@anthropic-ai/sdk`. Node `>=22.0.0 <23.0.0` already satisfied (per `package.json` `engines`).
- **Prompt caching mandatory** on Q&A (system prompt + policy library block, `cache_control: { type: 'ephemeral' }`). Cache-hit rate target: 60–80% on the Q&A endpoint per `reference/PROMPTS.md` — observable via Anthropic SDK response `usage.cache_read_input_tokens` field.
- **Batch API mandatory** for Consistency Check (50% cost reduction per `reference/PROMPTS.md`); synchronous Messages API is forbidden for this surface.
- **Server-side only**: all Claude calls happen in API routes or server actions. Per `CLAUDE.md` "NEVER call Claude API client-side". `lib/ai/client.ts` uses `'server-only'` import to enforce.
- **All Claude calls logged**: on successful response, one row written to `ai_generations` with `type ∈ {'draft','summary','qa','consistency'}`. Per ADR-021 / `CLAUDE.md` "Store every Claude API call in `ai_generations` table". Failed calls write nothing (preserves tier-count accuracy + ADR-018 append-only spirit — no error rows that look like generated content).
- **`ai_generations.result` shape**: text content for `draft` / `summary` / `qa`; JSON-stringified `ConsistencyFinding[]` for `consistency`. The polling endpoint parses `result` as JSON when `type='consistency'`.
- **Q&A citation extraction**: Claude's natural-language response is parsed by `lib/ai/qa-parser.ts` into `{ answer: string, citations: { title: string, id: string }[] }`. The Q&A system prompt is amended (in `lib/ai/prompts.ts`, with the amendment noted in `reference/PROMPTS.md` as part of Phase 4 ship) to instruct Claude to format citations as a trailing structured block (e.g. `--- CITATIONS ---\n[{title, id}, ...]\n--- END CITATIONS ---`) the parser can extract; the `id` values are validated against the org's published policies before being returned to the client (Claude hallucinations are stripped, not surfaced).
- **TL;DR idempotence**: `policies.tldrSummary` is set ONCE per policy version. Second call to `/api/ai/summary` for an unchanged policy returns the cached value without calling Anthropic. The `editPublished` transition (Phase 3) creates a new `policy_versions` row AND resets `policies.status` to `Draft` — Phase 4 hooks accept that this resets `tldrSummary` to null on the new version (next publish will trigger fresh summary generation).
- **`publishPolicy` graceful degradation**: summary failure during the auto-trigger is logged but does NOT propagate. The transition's primary contract (state machine + policy_versions row) is non-negotiable; AI is a best-effort overlay.

## Acceptance Criteria

- [ ] `@anthropic-ai/sdk` listed in `package.json` dependencies; `pnpm typecheck` exits 0; `grep -q "@anthropic-ai/sdk" package.json` succeeds.
- [ ] `lib/ai/prompts.ts` exports 4 prompt constants; each contains the exact verbatim text from `reference/PROMPTS.md` (verifiable via a substring match on a 40-char anchor per prompt).
- [ ] `POST /api/ai/draft` with admin Clerk session + body `{ prompt, policyType }` returns 200 with `{ draftContent, tokensUsed }` (both non-empty); `SELECT count(*) FROM ai_generations WHERE type='draft'` increases by exactly 1.
- [ ] `POST /api/ai/draft` with non-admin Clerk session returns 403.
- [ ] `POST /api/ai/draft` from a Starter org with 50 prior `ai_generations` rows of `type='draft'` in current calendar month returns 429 with body `{ error: 'tier_limit_exceeded', tierLimit: 50, currentUsage: 50, upgradeUrl: '/pricing' }`.
- [ ] PolicyEditor at `/policies/new` shows a visible "Generate with AI" button to admin users; clicking it triggers `/api/ai/draft` and pre-fills the editor with the returned `draftContent`.
- [ ] First `POST /api/ai/summary` for a policy returns 200 `{ summary }` and `ai_generations` has +1 row of `type='summary'`; second call to the same policy returns the same `summary` value AND `ai_generations` count is unchanged.
- [ ] `publishPolicy` transitioning a policy from Under Review to Published, with the internal summary helper mocked to throw on Anthropic failure, successfully completes the transition (policy status is `'published'`, audit trail recorded) and `policies.tldrSummary IS NULL` for that policy; no error is thrown to the caller.
- [ ] PolicyView at `/policies/[id]` shows a "Regenerate TL;DR" button to admin users; clicking it triggers `/api/ai/summary` and refreshes the view with the new summary.
- [ ] `POST /api/ai/qa` from an authenticated user in an org with ≥1 published policy returns 200 `{ answer, citations }`; `citations` is a non-empty array of `{ title: string, id: string }` objects where each `id` resolves to a real `policies.id` row in the same org with `status='published'`.
- [ ] `POST /api/ai/qa` with the question "Can I be fired for refusing to work overtime?" returns an `answer` containing the exact substring `"For advice specific to your situation, consult your legal team."`.
- [ ] `POST /api/ai/qa` with the question "What time does the office open?" (non-legal) returns an `answer` NOT containing that legal-disclaimer substring.
- [ ] `POST /api/ai/qa` from an org with 0 published policies (or with a question matching nothing in the library) returns `answer = "I couldn't find information about that in our current policies. Please contact HR directly."` (exact match) AND `citations = []`.
- [ ] Anthropic SDK response on the 2nd successive `POST /api/ai/qa` against the same org's policy library reports `usage.cache_read_input_tokens > 0` (provable via test-instrumented log or fixture).
- [ ] `POST /api/ai/consistency` from admin in a Growth+ org returns 200 `{ batchId }` where `batchId` matches Anthropic's batch ID format.
- [ ] `POST /api/ai/consistency` from admin in a Starter org returns 403 with body `{ error: 'tier_limit_exceeded', requiredTier: 'growth', upgradeUrl: '/pricing' }`.
- [ ] `GET /api/ai/consistency/[batchId]` returns `{ status: 'in_progress' | 'completed' | 'failed', result? }`; when `status === 'completed'`, `result` is an array where every element matches the `ConsistencyFinding` schema (`policy_a`, `policy_b`, `issue_type ∈ {'contradiction','conflicting_value','undefined_term'}`, `description`, `severity ∈ {'high','medium','low'}`).
- [ ] When the Anthropic SDK throws on any of the 4 submit endpoints, the response is 503 with body `{ error: 'ai_service_unavailable', retryAfter: 30 }` and `Retry-After: 30` header.
- [ ] When the Anthropic SDK throws on any endpoint, NO new `ai_generations` row is written.
- [ ] Admin Consistency Check page at `/admin/consistency` (or equivalent path locked in discuss-phase) renders with "Run consistency check" button for Growth+ admins; renders disabled button + upgrade prompt for Starter admins.
- [ ] `checkTierLimit(orgId, 'aiDraftsMonthly')` for an org with `planTier IS NULL` returns identical output to an org with `planTier='starter'`.
- [ ] `pnpm verify:phase-4` exits 0 (new orchestrator script that runs `typecheck` + `check:db-imports` + `check:rls` + Phase-3 checks + Phase-4-specific `check:ai-layer` + `vitest run`).

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                          |
|--------------------|-------|------|--------|----------------------------------------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | 4 AI surfaces + UI scope + tier-default behavior all locked    |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Admin hooks IN; Q&A UI Phase 5; tier-sync Phase 6; clear edges |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Citation shape, error contract, no-fallback all locked         |
| Acceptance Criteria| 0.88  | 0.70 | ✓      | 22 falsifiable pass/fail criteria; substring-match disclaimer  |
| **Ambiguity**      | 0.109 | ≤0.20| ✓      | Gate passed                                                    |

## Interview Log

| Round | Perspective       | Question summary                              | Decision locked                                                                                  |
|-------|-------------------|-----------------------------------------------|--------------------------------------------------------------------------------------------------|
| 1     | Boundary Keeper   | Phase 4 = API only, or API + admin UI hooks?  | API + admin hooks (Draft, TL;DR, Consistency) ship in Phase 4. Q&A UI deferred to Phase 5.       |
| 1     | Boundary Keeper   | Tier check w/o Phase 6 — how?                 | Read `organizations.planTier`; null → 'starter' default. Real tier-check ships in Phase 4.       |
| 1     | Boundary Keeper   | TL;DR trigger — auto on publish or manual?    | Auto-trigger inside `publishPolicy` + manual regenerate button. Failure does NOT fail publish.   |
| 2     | Failure Analyst   | Q&A citation format — `string[]` or richer?   | `{ title: string, id: string }[]`. Operator chose richer shape; API-SPEC.md amendment required.  |
| 2     | Failure Analyst   | Legal disclaimer — keyword list or Claude?    | Trust Claude's judgment + verify via exact-substring match on fixture questions.                 |
| 2     | Failure Analyst   | Anthropic 5xx — what error contract?         | All endpoints: 503 + `Retry-After: 30`. No `ai_generations` row on failure. Publish degrades.    |

**Notable cross-contract impact:** Decision in Round 2 to use structured citations (`{ title, id }[]`) deviates from `reference/API-SPEC.md` line 45 (`citations: string[]`). Phase 4 ship MUST include an amendment to `reference/API-SPEC.md` documenting the new shape; without this, the frozen contract drifts from implementation. Treat as part of Requirement 4 acceptance.

---

*Phase: 04-ai-layer*
*Spec created: 2026-05-21*
*Next step: /gsd-discuss-phase 4 — implementation decisions (Anthropic SDK version pin, batch_jobs table vs ai_generations.batchId, citation parser strategy, vitest mocking pattern, `lib/ai/cache.ts` shape, verify:phase-4 orchestrator wiring)*
