# Phase 4 Audit Integration Trail

**Captured:** 2026-05-21
**Tool:** `enterprise-api-architect` REVIEW skill — 8-specialist parallel fan-out (api-design, security-owasp, identity-auth, traffic-governance, data-performance, observability, lifecycle, ai-native-mcp).
**Inputs:** `04-SPEC.md` (7 reqs, 22 ACs, ambiguity 0.109), `04-CONTEXT.md` (D-01..D-27).
**Outputs:** `04-CONTEXT.md <amendments>` (D-28..D-44) and `04-SPEC.md` (AC-23..AC-33 + Ambiguity Report v2 + Interview Log Round 3).

This file is the audit trail — **do not use as input to planner/executor agents.** Decisions live in `04-CONTEXT.md`. ACs live in `04-SPEC.md`.

---

## Finding → Decision → Severity Map

Severity scale: CRITICAL (auth/tenancy breach ≤7d) · HIGH (SLA/contract breach ≤30d) · MEDIUM (tech debt ≤1q) · LOW (style/UX) · ADVISORY (out-of-phase polish) · INFO (confirmed not-a-risk).

### CRITICAL (fixed in amendments)

| # | Lens | Severity | Finding | Decision | AC |
|---|------|----------|---------|----------|-----|
| F-1  | api-design        | CRITICAL | Draft `JSON.parse(draftContent)` will throw — system prompt produces prose, not ProseMirror JSON | **D-28** | AC-23 |
| F-2  | security-owasp    | CRITICAL | `batch_jobs` RLS migration 0005 must enumerate all 4 SQL statements + extend `check-rls.ts` | **D-29** | AC-24 |
| F-3  | ai-native-mcp     | CRITICAL | Batch-poll resumability — admin closes tab, batch completes, no UI to retrieve results | **D-30** | AC-25 |

### HIGH (fixed in amendments)

| # | Lens | Severity | Finding | Decision | AC |
|---|------|----------|---------|----------|-----|
| F-4  | security-owasp    | HIGH | Admin-authored published policies → adversarial instructions embedded in Q&A system prompt | **D-31** | AC-27 |
| F-5  | api-design        | HIGH | No `Idempotency-Key` on `/api/ai/draft` → network retry double-debits `aiDraftsMonthly` | **D-32** ✓ APPROVED 2026-05-21 | AC-29 |
| F-6  | traffic-governance| HIGH | SDK default `maxRetries: 2` contradicts SPEC R7 no-auto-retry contract | **D-33** | AC-28 |
| F-7  | traffic-governance| HIGH | 100 orgs × 30s poll exceeds Anthropic Tier 1 Batches API 50 RPM cap by 4× | **D-34** | AC-30 |
| F-8  | data-performance + observability | HIGH | `ai_generations.tokensUsed` single column loses cache-token tier split → Phase 8 analytics foreclosed | **D-35** ✓ APPROVED 2026-05-21 | AC-32 |
| F-9  | observability     | HIGH | Q&A `err.message` may contain employee question content in 503 logs (PII leak) | **D-36** | AC-31 |
| F-10 | api-design        | HIGH | Auth errors swallowed by 503 fallback in D-17 catch — auth failures = AI outage in metrics | **D-37** | (covered by D-37 sketch + AC-26) |
| F-11 | api-design        | HIGH | `extractText(response)` referenced 3× in sketches; no D-NN defines it | **D-38** | (implicit in D-25 fixture) |
| F-12 | ai-native-mcp     | HIGH | `anthropic.messages.batches.*` may live at `client.beta.messages.batches.*` — typecheck failure risk | **D-39** | (plan-phase READY gate item) |
| F-13 | data-performance + ai-native-mcp | HIGH | Default cache TTL = 5min (per 2026-03-06 Anthropic change) → R4 60-80% target unreachable | **D-33** (LONG_CACHE) | (validated by AC-28 + D-33 ordering rule) |
| F-14 | data-performance  | HIGH | Sonnet 1024-token cache minimum (Haiku 4096) — small orgs silently bypass cache | **D-40** | (telemetry, no AC needed) |
| F-15 | security-owasp    | HIGH | Citation `validIds` Set MUST be wired from same `withOrgScope`; not a global/cached source | **D-41** | (covered by D-41 comment + existing SPEC:116 AC) |
| F-16 | api-design        | HIGH | `/api/ai/qa` Zod schema missing + no question max-length | **D-42** | AC-33 |

### MEDIUM (fixed or folded)

| # | Lens | Severity | Finding | Decision | AC |
|---|------|----------|---------|----------|-----|
| F-17 | identity-auth     | MEDIUM | Q&A no tier check / no rate limit / unlimited Sonnet calls per employee | **D-46** ✓ ACCEPTED 2026-05-21 (Phase 8 watch trigger: $50/org/mo avg over 30d) | — |
| F-18 | api-design        | MEDIUM | Error envelope ≠ RFC 9457 Problem Details | Deferred (operator MAY adopt pre-Phase 6) | — |
| F-19 | traffic-governance| MEDIUM | `RateLimit-Policy` + `RateLimit` headers missing on 429 | Deferred (operator MAY add per IETF draft-10) | — |
| F-20 | lifecycle         | MEDIUM | No type-level contract gate for citations shape | **D-43** | (typecheck gate) |
| F-21 | lifecycle         | MEDIUM | `batch_jobs.type` missing `.default('consistency')` in Drizzle snippet | **D-29** (folded) | (folded in AC-24) |
| F-22 | lifecycle         | MEDIUM | `/api/v1/ai/*` versioning policy — decide or document | Deferred to ADR if staying unversioned | — |
| F-23 | security-owasp    | MEDIUM | No cross-org BOLA negative AC on `/api/ai/summary` | (folded — `check-ai-layer.ts` per D-29 pattern) | (existing SPEC:113-115 + check-ai-layer) |
| F-24 | security-owasp    | MEDIUM | No draft-leakage negative fixture for `listPublishedForOrg` | (folded — `check-ai-layer.ts`) | — |
| F-25 | security-owasp    | MEDIUM | Draft Zod schema needs `.strict()` posture | **D-42** (folded) | AC-33 |
| F-26 | traffic-governance| MEDIUM | Per-request SDK timeout + circuit-breaker note | **D-33** (folded) | AC-28 |
| F-27 | identity-auth     | MEDIUM | `requireAdmin()` returns 404 (notFound) but SPEC AC asserts 403 | **D-45** ✓ RESOLVED 2026-05-21 → 403 path | AC-26 |

### LOW + ADVISORY + INFO (deferred or no action)

| # | Lens | Severity | Disposition |
|---|------|----------|-------------|
| F-28 | lifecycle | LOW | D-26 anchor-migration process — add comment block in `check-ai-prompts.ts` (folded into plan-phase work) |
| F-29 | lifecycle | LOW | ADR-024 reconciliation — amend ADR text in Phase 4 ship (1-line addition to `decisions.md`) |
| F-30 | identity-auth | LOW | `generateSummaryForPolicy` attribution semantics — acceptable for MVP; revisit if audit requires distinction |
| F-31 | security-owasp | LOW | ANTHROPIC_API_KEY runtime fail-fast — add startup guard (folded into plan-phase work) |
| F-32 | security-owasp | LOW | `ai_generations` UPDATE/DELETE forbid via `tests/types.ts` (folded into plan-phase work) |
| F-33 | security-owasp | LOW | `TierLimitExceededError` body future-proof comment (folded into D-16 implementation) |
| F-34 | observability | LOW | D-25 fixture null-guard for `cache_read_input_tokens: number \| null` (single-line test fix) |
| F-35 | ai-native-mcp | LOW | D-22 dialog disabled-submit + spinner copy during Draft fetch — UX polish (pairs with D-32 idempotency) |
| F-36 | observability | LOW | "Last polled X ago" indicator + visibilitychange immediate-fire (D-21 polish) |
| F-37 | ai-native-mcp | LOW | D-01 stale "0.65.x" parenthetical — clean up in plan-phase commit |
| F-38 | data-performance | LOW | D-07 TipTap extraction benchmark fixture (~p99 < 20ms target) |
| F-39 | observability | LOW | `orgId` in error log — **folded into D-36** |
| F-40 | ai-native-mcp | LOW | Tool-use migration threshold: >2% citation-parse failures over 7d → migrate |
| F-41 | observability | ADVISORY | OTel GenAI semconv — all Development-status; do NOT instrument in Phase 4 |
| F-42 | observability | ADVISORY | Burn-rate alert at 90% tier consumption — Phase 7 Crons + Email |
| F-43 | data-performance | ADVISORY | ETag/304 on tldrSummary — Phase 8+ polish |
| F-44 | security-owasp | ADVISORY | SBOM regen + cosign attestation for Anthropic SDK — Phase 7+ supply-chain hardening |
| F-45 | traffic-governance | INFO | HTTP/2 Rapid Reset / CONTINUATION Flood — managed by Vercel edge; not in PolicyPilot's surface |
| F-46 | ai-native-mcp | INFO | Multi-modal / MCP-server-exposure — out-of-phase; pre-conditions documented if ever surfaced |

---

## Cross-Validation Channels

Per the user's prompt: "Cross-validate every CRITICAL/HIGH finding via 2 different retrieval channels." Channels:

- **File evidence**: `04-SPEC.md`, `04-CONTEXT.md`, `reference/{API-SPEC,PROMPTS,SCHEMA,TIER-LIMITS}.md`, `.planning/intel/decisions.md`.
- **External fetch**: Anthropic docs (prompt-cache TTL, Batches API rate limits, SDK type defs, Usage shape), RFC 9457, RFC 6585, IETF draft-ietf-httpapi-{idempotency-key-header,ratelimit-headers}-10, OWASP API/LLM Top 10 v2025, Vercel function timeout docs, OTel GenAI semconv page, CVE-2023-44487 references.

| Finding | Channel 1 (file:line) | Channel 2 (external) |
|---------|------------------------|----------------------|
| F-1     | `04-SPEC.md:35` + `04-CONTEXT.md:113` | PROMPTS.md:8-21 narrative output + TipTap `setContent` docs |
| F-2     | `04-CONTEXT.md:237` + `SCHEMA.md:128-141` | ADR-025 in `decisions.md:443-533` |
| F-3     | `04-CONTEXT.md:112` + `04-SPEC.md:50-51` | Anthropic Batches docs (24h SLA) |
| F-4     | `04-CONTEXT.md:86,95` + `PROMPTS.md:42-56` | OWASP LLM01 v2025 |
| F-5     | `04-SPEC.md:35-36` + `04-CONTEXT.md:374-379` | draft-ietf-httpapi-idempotency-key-header-07 §2 |
| F-6     | `04-CONTEXT.md:265-269` + `04-SPEC.md:86` | Anthropic SDK retries docs |
| F-7     | `04-CONTEXT.md:112` | Anthropic rate-limits docs (Batches §) |
| F-8     | `SCHEMA.md:92` + `04-CONTEXT.md:376,459` | Anthropic prompt-cache pricing (10% read / 125% write) |
| F-9     | `04-CONTEXT.md:106` | Anthropic SDK error-types docs |
| F-10    | `04-CONTEXT.md:383-397` + `04-SPEC.md:60` | `lib/auth/errors.ts` `BootstrapError` hierarchy |
| F-11    | `04-CONTEXT.md:378,380,458` | Anthropic SDK `ContentBlock` discriminated union |
| F-12    | `04-CONTEXT.md:521` | `anthropic-sdk-typescript` source: `src/resources/beta/messages/batches.ts` |
| F-13    | `04-CONTEXT.md:79,288-299` | Anthropic prompt-caching docs (5-min default since 2026-03-06) |
| F-14    | `04-CONTEXT.md:79` | Anthropic prompt-cache minimum-token requirement |
| F-15    | `04-CONTEXT.md:93,496-513` + `04-SPEC.md:116` | OWASP API1 BOLA |
| F-16    | `04-SPEC.md:45` + `04-CONTEXT.md:226` | OWASP API3 BOPLA / mass assignment |

---

## Specialists Disagree

**Severity arbitration on F-8 (`ai_generations.tokensUsed`):**

- `eapi-observability` ranked it CRITICAL ("Phase 8 cost analytics permanently foreclosed").
- `eapi-data-performance` ranked it HIGH (frozen-table schema change requires CLAUDE.md ASK FIRST; backfill impossible).
- `eapi-ai-native-mcp` ranked it LOW (implementation polish).

**Orchestrator arbitration: HIGH.** Not a security/auth/tenancy breach (so not CRITICAL by the user's defined severity scale), but a one-way irreversible schema decision that triggers ASK FIRST and blocks Phase 8 cost analytics — above the MEDIUM "tech debt ≤1 quarter" bar.

---

*Phase: 04-ai-layer*
*Audit integration: 2026-05-21*
