---
phase: 04-ai-layer
plan: 04-08
subsystem: api
tags: [anthropic, claude-sonnet, claude-haiku, ai-draft, ai-summary, tier-limits, idempotency-key, server-only, nextjs-route-handlers, prompt-cache]

# Dependency graph
requires:
  - phase: 04-ai-layer
    provides: "Wave 0 — RED test stubs (lib/ai/summary.test.ts, app/api/ai/draft/route.test.ts, app/api/ai/summary/route.test.ts) + tests/ai-mocks.ts (mockTextResponse)"
  - phase: 04-ai-layer
    provides: "Wave 1 — lib/ai/{client,models,cache,prompts,extract,schemas,qa-extract}.ts + lib/stripe/{products,errors}.ts + lib/db/repositories/{ai_generations,policies}.ts + lib/auth/{require-admin,errors}.ts (requireAdminFromCtx + ForbiddenError per D-45)"
provides:
  - "lib/ai/summary.ts — generateSummaryForPolicy(policyId, ctx): Promise<void> orchestrator. Opens its OWN withOrgScope so publish() Plan 04-11 can run AI work post-commit without rolling back state transition."
  - "POST /api/ai/draft — SPEC R2 admin-only Sonnet 4.6 draft endpoint with Pattern B (auth outside try; tier+Anthropic+DB inside try); Idempotency-Key dedup (D-32); 503 envelope + Retry-After:30 (SPEC R7)."
  - "POST /api/ai/summary — SPEC R3 idempotent Haiku 4.5 TL;DR endpoint. Cached path skips Anthropic + ai_generations row entirely; uncached path delegates to generateSummaryForPolicy."
  - "12 RED tests flipped GREEN (4 summary helper + 5 draft route + 3 summary route)."
affects:
  - "Plan 04-11 — publish() post-commit hook will import generateSummaryForPolicy from lib/ai/summary.ts and try/catch wrap per D-19 (graceful-degrade per SP-3)."
  - "Plan 04-12 — PolicyAiDraftDialog Client Component will POST /api/ai/draft; D-28 string-setContent (no JSON.parse on the response body)."
  - "Plan 04-13 — PolicyRegenerateTldrButton Client Component will POST /api/ai/summary; relies on SPEC R3 idempotence so double-clicks are cheap."

# Tech tracking
tech-stack:
  added: []  # no new deps — uses @anthropic-ai/sdk 0.97.1, zod 3.x, drizzle-orm already shipped
  patterns:
    - "Pattern B (D-37): auth gates OUTSIDE try; tier check + Anthropic + DB write INSIDE try; ZodError → 400, TierLimitExceededError → 429/403, everything else → 503 envelope."
    - "D-19 nested withOrgScope: helper opens its OWN transaction so caller's transaction (e.g. publish() state machine) commits FIRST and AI work runs in a separate short transaction post-commit."
    - "D-32 Idempotency-Key dedup pattern: pre-Anthropic lookup via AiGenerations.findByIdempotencyKey returns cached draftContent + tokensUsed; partial-unique index in schema guarantees at most one row per (org, key)."
    - "D-35 cache-token columns: all 4 columns (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens) write to ai_generations on every successful call."
    - "D-36 PII-safe sanitized log: structured-field branch for Anthropic.APIError ({ name, status, code }); truncated-message branch for generic Error (slice(0, 120)); pass-through for unknown."

key-files:
  created:
    - "lib/ai/summary.ts (86 lines) — generateSummaryForPolicy helper per D-19"
    - "app/api/ai/draft/route.ts (160 lines) — POST /api/ai/draft per SPEC R2 + Pattern B"
    - "app/api/ai/summary/route.ts (95 lines) — POST /api/ai/summary per SPEC R3 idempotent"
  modified:
    - "lib/ai/summary.test.ts (3 RED stubs → 4 GREEN tests)"
    - "app/api/ai/draft/route.test.ts (5 RED stubs → 5 GREEN tests)"
    - "app/api/ai/summary/route.test.ts (3 RED stubs → 3 GREEN tests)"

key-decisions:
  - "Auth gates remain OUTSIDE try per D-37 — getOrgContext + requireAdminFromCtx throw typed BootstrapError/ForbiddenError that propagate to Next.js error boundary (401/403), NEVER swallowed into the 503 fallback. Keeps auth/AI failure metrics distinct."
  - "ZodError gets its own 400 branch (not falling through to 503). Plan body called this 'recommended but not required by SPEC' — implemented to keep validation failures distinct from AI failures for client-side handling (form re-render vs. retry hint)."
  - "generateSummaryForPolicy signature is Promise<void> (NOT Promise<string>). Plan 04-11's publish() doesn't need the return value; keeping signature simple means the summary endpoint re-reads after delegation, costing one extra cheap indexed lookup but keeping the helper signature pristine for both callers."
  - "summary endpoint's cache-check withOrgScope is independent from generateSummaryForPolicy's withOrgScope (defense-in-depth: helper ALSO short-circuits on existing tldrSummary). Two-step pattern preferred over piping the result through because it preserves SPEC R3 'no new row on cached path' AND avoids a wasted helper-open if cached."

patterns-established:
  - "Route handler tests use vi.mock for: getAnthropicClient (D-05) + getOrgContext + withOrgScope (stub scope) + per-aggregate repositories + requireTierLimit. Real implementations: TierLimitExceededError class instantiation in test fixture, ZodError thrown by .parse on bad body, Anthropic.APIError NOT exercised in unit tests (would require live SDK error shape)."
  - "Test fixture pattern for Anthropic responses: tests/ai-mocks.ts:mockTextResponse(text, usage?) — Partial<Usage> overrides for cache_creation_input_tokens + cache_read_input_tokens to exercise D-25 cache-hit/miss branches."
  - "Idempotency-Key dedup test pattern: mock AiGenerations.findByIdempotencyKey to return a fake prior row; assert mockCreate (Anthropic) was NEVER called AND mockInsertAiGen was NEVER called — proves no double-debit on retry."

requirements-completed:
  - REQ-ai-policy-assistant
  - REQ-ai-usage-rules

# Metrics
duration: ~15min
completed: 2026-05-21
---

# Phase 4 Plan 04-08: Draft + Summary Endpoints + Summary Helper Summary

**Three new server-only files materializing SPEC R2 (admin Sonnet 4.6 draft endpoint) + SPEC R3 (idempotent Haiku 4.5 TL;DR endpoint) + the lib/ai/summary.ts orchestrator that publish() (Plan 04-11) will call post-commit.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 4 (3 code tasks + 1 verification)
- **Files modified:** 6 (3 created production files + 3 modified test files)
- **Test deltas:** 12 RED → 12 GREEN (4 summary helper + 5 draft route + 3 summary route)
- **Typecheck:** `pnpm tsc --noEmit` exits 0 on every commit boundary
- **Full suite impact:** 139 prior tests stay GREEN; 24 still-RED tests are Wave-0 stubs targeting plans 04-09 / 04-10 / 04-11 / 04-12 / 04-14 (out of Plan 04-08 scope)

## Accomplishments

- **lib/ai/summary.ts** — `generateSummaryForPolicy(policyId, ctx): Promise<void>` opens its OWN withOrgScope (NOT the caller's), short-circuits on existing tldrSummary (SPEC R3 idempotence), calls MODEL_HAIKU with max_tokens 512 (SPEC R3 "3 sentences max"), writes ai_generations row with all 4 cache-token columns (D-35), updates policies.tldrSummary. Two callers ready: POST /api/ai/summary (this plan) + publish() post-commit hook (Plan 04-11).
- **POST /api/ai/draft** — Pattern B endpoint (D-37 auth-outside-try) with full deviation routing: TierLimitExceededError → 429/403 (D-15/D-16), ZodError → 400 (D-42), everything else → 503 envelope + Retry-After:30 (SPEC R7). D-32 Idempotency-Key dedup via AiGenerations.findByIdempotencyKey; D-36 PII-safe sanitized log; D-35 all 4 cache-token columns populate on insert. AC-29 + AC-32 verified.
- **POST /api/ai/summary** — Two-flow idempotent endpoint: cached path (tldrSummary truthy) returns existing summary with NO Anthropic call AND NO new row (SPEC R3 + tier-count preservation); uncached path delegates to generateSummaryForPolicy. ADR-028 brand applied at trust boundary via policyIdFromString. Same 503 envelope on Anthropic failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/ai/summary.ts — generateSummaryForPolicy helper (D-19, SPEC R3)** — `1524e02` (feat — 4 tests GREEN)
2. **Task 2: app/api/ai/draft/route.ts (SPEC R2 + D-37 + D-36 + D-32 + D-35)** — `1034106` (feat — 5 tests GREEN)
3. **Task 3: app/api/ai/summary/route.ts (SPEC R3 idempotent)** — `f0316db` (feat — 3 tests GREEN)
4. **Task 4: Final verification — server-only + typecheck + tests GREEN** — folded into this SUMMARY commit (verification-only task with no source changes; explicitly noted in plan body)

## Files Created/Modified

### Created

- `lib/ai/summary.ts` (86 lines) — `generateSummaryForPolicy(policyId, ctx)` orchestrator. Opens nested withOrgScope so publish()'s state-transition transaction stays atomic. Idempotent on existing tldrSummary; uses MODEL_HAIKU + buildCachedSystem (EPHEMERAL 5-min TTL) + extractText; D-06 SUCCESS-ONLY semantic (no row on Anthropic throw); D-35 all 4 cache-token columns + idempotencyKey=null (summary path doesn't use Idempotency-Key).
- `app/api/ai/draft/route.ts` (160 lines) — POST handler implementing SPEC R2. Pattern B: getOrgContext + requireAdminFromCtx OUTSIDE try; requireTierLimit('aiDraftsMonthly') + DraftSchema.parse + Idempotency-Key dedup + Anthropic + AiGenerations.insert INSIDE try; catch routes TierLimitExceededError → 429/403, ZodError → 400, everything else → 503 envelope + Retry-After:30.
- `app/api/ai/summary/route.ts` (95 lines) — POST handler implementing SPEC R3. SummarySchema.parse + policyIdFromString (ADR-028 trust boundary); first cache-check withOrgScope skips Anthropic on cached tldrSummary; uncached delegates to generateSummaryForPolicy then re-reads for fresh summary.

### Modified

- `lib/ai/summary.test.ts` — 3 RED stubs → 4 GREEN tests. Added "throws on policy not found" test per plan action body. Covers idempotent short-circuit + happy path with cache-token-column assertions + MODEL_HAIKU literal + policy-not-found throw.
- `app/api/ai/draft/route.test.ts` — 5 RED stubs → 5 GREEN tests. Covers happy path (200 + insert), SP-2 (503 + Retry-After + no row), SP-4 tier-overage (429 + tier_limit_exceeded body), AC-29 Idempotency-Key dedup (cached draftContent + no Anthropic call + no new row), AC-32 cache-token columns populated on insert.
- `app/api/ai/summary/route.test.ts` — 3 RED stubs → 3 GREEN tests. Covers happy first-call (delegate to generateSummaryForPolicy + re-read), SPEC R3 idempotence (cached path skips generateSummaryForPolicy AND skips Anthropic), and 503 envelope on Anthropic throw.

## Decisions Made

1. **ZodError gets its own 400 branch** (NOT falling through to the 503 fallback). Plan body called this "recommended but not required by SPEC". Rationale: keeps validation failure distinct from AI service failure for client-side handling. ZodError → 400 `{ error: 'invalid_body', details: err.flatten() }`; AI failure → 503 envelope. The PolicyAiDraftDialog (Plan 04-12) will re-render the form on 400 and show a generic retry hint on 503 — different UX branches.
2. **`generateSummaryForPolicy` returns `Promise<void>`** (not Promise<string>). Plan 04-11's publish() doesn't need the return value, so keeping the signature pristine for both callers means the summary route does one extra cheap re-read (Policies.findById) after delegation. Acceptable cost.
3. **Two-step pattern in `/api/ai/summary`** — cache-check withOrgScope is independent from `generateSummaryForPolicy`'s withOrgScope (which ALSO short-circuits on existing tldrSummary as defense-in-depth). The two-open structure was chosen over piping the cached-summary result through the helper because: (a) preserves SPEC R3 "no new row on cached path" unambiguously; (b) avoids a wasted helper-open when the cached path can short-circuit immediately. Cost: one extra DB roundtrip on the uncached path (re-read after generate). Acceptable.
4. **Anthropic.APIError import via default-namespace access** — `import Anthropic from '@anthropic-ai/sdk'` then `err instanceof Anthropic.APIError`. Verified via Node probe that both the default-namespace access AND the named `{ APIError }` export work; plan body's recommended default-namespace form chosen for grep-ability.
5. **Test fixture context shape includes `clerkOrgId` + `clerkUserId`** — plan body's example `ctx` was missing these fields, but the real OrgContext type requires them (per `lib/auth/context.ts:36-46`). Added them in every test ctx-stub for type-correctness.

## Deviations from Plan

None — plan executed exactly as written, with three minor additions called out below that fall under Rule 2 (auto-add missing critical functionality):

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] ZodError → 400 branch in both draft + summary routes**
- **Found during:** Tasks 2 + 3 (route handler authoring)
- **Issue:** Plan body listed "recommended but not required" for the explicit `if (err instanceof z.ZodError) return 400` branch (CONTEXT.md threat_model T-04-08-DT note). Without it, malformed JSON / extra body keys would surface as a 503 — misleading to the client which can't distinguish validation failure (fixable via form re-render) from AI infra failure (which should retry).
- **Fix:** Added the explicit ZodError branch BEFORE the 503 fallback in both `/api/ai/draft` and `/api/ai/summary`. Returns `{ error: 'invalid_body', details: err.flatten() }` with `status: 400`.
- **Files modified:** app/api/ai/draft/route.ts, app/api/ai/summary/route.ts
- **Verification:** No new test added because Plan 04-08's RED stubs don't cover this branch — Plan 04-12's PolicyAiDraftDialog test will exercise the 400 path via UX assertion. Pattern is identical to lib/auth/errors.ts typed-error narrowing.
- **Committed in:** `1034106` (Task 2) + `f0316db` (Task 3)

**2. [Rule 2 — Missing Critical] Test fixture ctx includes clerkOrgId + clerkUserId**
- **Found during:** Tasks 1 + 2 + 3 (writing route + helper tests)
- **Issue:** Plan body's example ADMIN_CTX omitted `clerkOrgId` + `clerkUserId`, but the real `OrgContext` type (lib/auth/context.ts:36-46) requires both. Test ctx stubs missing them would compile-fail (type error: "Property 'clerkOrgId' is missing in type ...").
- **Fix:** Added `clerkOrgId: 'org_clerk_1'` and `clerkUserId: 'user_clerk_1'` to every test ctx stub.
- **Files modified:** lib/ai/summary.test.ts, app/api/ai/draft/route.test.ts, app/api/ai/summary/route.test.ts
- **Verification:** `pnpm tsc --noEmit` exits 0 — would have failed without these fields.
- **Committed in:** `1524e02` (Task 1) + `1034106` (Task 2) + `f0316db` (Task 3)

**3. [Rule 2 — Missing Critical] 4th test "throws on policy not found" added to lib/ai/summary.test.ts**
- **Found during:** Task 1 (lib/ai/summary.ts authoring)
- **Issue:** Wave-0 RED stub at lib/ai/summary.test.ts had 3 tests; plan body required 4 (the 3 stubs + 1 "throws on policy-not-found"). Helper throws `Error('Policy not found')` when `rows[0]` is undefined — needs explicit test coverage so publish() can confidently swallow that specific error in Plan 04-11's graceful-degrade try/catch.
- **Fix:** Added 4th test `'throws on policy not found (caller decides graceful-degrade)'` per plan body action specification.
- **Files modified:** lib/ai/summary.test.ts
- **Verification:** 4/4 GREEN.
- **Committed in:** `1524e02` (Task 1)

---

**Total deviations:** 3 auto-fixed (3 Rule-2 missing-critical, all anticipated by plan body but worth recording for audit)
**Impact on plan:** Zero scope creep — every deviation was either explicitly recommended-but-optional in the plan body (#1), required by type-correctness of imported real types (#2), or required by the plan's action spec count of 4 tests (#3). Plan executed exactly as designed.

## Issues Encountered

None. The Wave-0 RED stubs already provided the mock surface shapes (mockCreate for Anthropic client + tests/ai-mocks.ts mockTextResponse with cache-token usage overrides) so the GREEN tests built directly on the existing scaffold. No flakes, no debug loops.

## User Setup Required

None — no new environment variables, no Stripe / Clerk dashboard changes, no migrations. The endpoints will function once Anthropic SDK is reachable (ANTHROPIC_API_KEY already in `.env.local` from Wave 1).

## Pattern B Compliance Confirmation

Both `/api/ai/draft` and `/api/ai/summary` route handlers strictly follow Pattern B per D-37 + D-36 + D-17:

```text
auth gates (getOrgContext + requireAdminFromCtx)  ← OUTSIDE try
                ↓
              try {
                tier check (requireTierLimit) — draft only
                Zod parse (DraftSchema / SummarySchema)
                Idempotency-Key dedup — draft only
                withOrgScope { Anthropic + AiGenerations.insert + (Policies.updateSummary for summary) }
                NextResponse.json(result)
              } catch (err) {
                TierLimitExceededError → 429/403   ← draft only
                ZodError → 400
                Anthropic.APIError / Error / unknown → D-36 log → 503 envelope + Retry-After:30
              }
```

Auth gates throw typed BootstrapError + ForbiddenError that the Next.js error boundary maps to 401/403; they never enter the 503 fallback. Token-counting failure (Anthropic returning content without text block — guarded by extractText D-38) propagates as a generic Error → 503. No path silently swallows.

## SP-2 + SPEC R3 Verification

**SP-2 (no row on Anthropic throw):**
- `app/api/ai/draft/route.test.ts > 'on Anthropic SDK throw: returns 503 envelope + Retry-After: 30 + NO ai_generations row (SP-2, SPEC R7)'` ✓
- `app/api/ai/summary/route.test.ts > 'on Anthropic throw: 503 + Retry-After:30 + no row + tldrSummary stays NULL'` ✓

**SPEC R3 idempotence (no Anthropic call + no row on cached path):**
- `lib/ai/summary.test.ts > 'idempotent — returns early when policies.tldrSummary already set (no Anthropic call)'` ✓
- `app/api/ai/summary/route.test.ts > 'on second call same policy: returns cached summary, NO Anthropic call, NO new row (SPEC R3 idempotence)'` ✓

**AC-29 Idempotency-Key dedup:**
- `app/api/ai/draft/route.test.ts > 'with Idempotency-Key header: 2nd POST same key returns identical draftContent + no new row (AC-29 — D-32)'` ✓

**AC-32 cache-token columns:**
- `app/api/ai/draft/route.test.ts > 'inserted ai_generations row populates input_tokens, output_tokens, cache_*_input_tokens (AC-32 — D-35)'` ✓
- `lib/ai/summary.test.ts > 'on first call: invokes Haiku 4.5, inserts ai_generations row with cache-token columns, updates policies.tldrSummary'` ✓

## Next Phase Readiness

**Plan 04-09 (Q&A endpoint)** — unblocked. Q&A reuses the same Pattern B + D-36 sanitized log + 503 envelope; the cache-token column write pattern is established. The D-31 prompt-injection-guard layer-2 work in lib/ai/qa-extract.ts already shipped in Wave 1.

**Plan 04-10 (Consistency Check endpoints)** — unblocked. Reuses the same Pattern B + tier-limit 403 routing (consistencyCheck is tier-bound per D-15/D-16). The SDK→SPEC translator is the one piece that has no precedent (RESEARCH § Pitfall 1).

**Plan 04-11 (publish() post-commit hook)** — unblocked. Imports `generateSummaryForPolicy` from `@/lib/ai/summary` and wraps in try/catch per D-19 + SP-3 graceful-degrade. The Plan 04-11 RED stubs in `lib/policies/transitions.test.ts` are already in place.

**Plan 04-12 (PolicyAiDraftDialog Client Component)** — unblocked. Will fetch `POST /api/ai/draft` with `{ prompt, policyType }` and `Idempotency-Key` UUID header on retry. D-28 string-setContent invariant: handler returns `draftContent: string` (NOT JSON-stringified ProseMirror); dialog calls `editor.commands.setContent(draftContent)` directly per AC-23.

**Plan 04-13 (PolicyRegenerateTldrButton Client Component)** — unblocked. Will fetch `POST /api/ai/summary` with `{ policyId }`. SPEC R3 idempotence means double-clicks are cheap (cached path skips Anthropic + ai_generations).

## Self-Check

Verified file existence + commit hashes:

- ✓ `lib/ai/summary.ts` exists (86 lines)
- ✓ `app/api/ai/draft/route.ts` exists (160 lines)
- ✓ `app/api/ai/summary/route.ts` exists (95 lines)
- ✓ `lib/ai/summary.test.ts` modified (150 lines, 4/4 GREEN)
- ✓ `app/api/ai/draft/route.test.ts` modified (177 lines, 5/5 GREEN)
- ✓ `app/api/ai/summary/route.test.ts` modified (124 lines, 3/3 GREEN)
- ✓ Commit `1524e02` present in `git log` (Task 1)
- ✓ Commit `1034106` present in `git log` (Task 2)
- ✓ Commit `f0316db` present in `git log` (Task 3)
- ✓ `pnpm tsc --noEmit` exits 0
- ✓ Plan 04-08 target 12 tests all GREEN (4 + 5 + 3)
- ✓ No prior Wave 1 / Phase 3 test regressions (139 passing tests held)

## Self-Check: PASSED

---
*Phase: 04-ai-layer*
*Completed: 2026-05-21*
