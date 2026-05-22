# Phase 4: AI Layer - Research

**Researched:** 2026-05-21
**Domain:** Anthropic SDK (Claude API) integration in Next.js 15 / Drizzle / TipTap stack
**Confidence:** HIGH

## Summary

Phase 4 already has **47 locked decisions (D-01..D-46), 33 ACs, and an operator-approved D-44 READY gate**. This research is **confirmation-only** — verify the canonical technical points that plan-phase must commit to before authoring code, without re-spec'ing the phase.

The seven technical pillars (SDK namespace, prompt cache, batch API, TipTap server-side, Drizzle combined migration, SDK recent changes, validation architecture) were all verified directly against installed code, official Anthropic docs, and Anthropic's published SDK source. Every confirmation is `[VERIFIED]` against an authoritative source.

**One CRITICAL drift surfaced**: SPEC R5 + D-21 + the API-SPEC.md polling contract all describe the batch status enum as `'in_progress' | 'completed' | 'failed'`. The Anthropic API and SDK type definitions return `processing_status: 'in_progress' | 'canceling' | 'ended'` — differentiation of completed-vs-failed-vs-canceled-vs-expired happens via the `request_counts.{succeeded, errored, canceled, expired}` subobject AFTER `processing_status === 'ended'`. This is a 100% blocking finding for the polling endpoint; plan-phase MUST map the SDK enum to the SPEC enum at the route-handler boundary. See `## Batch API Mechanics` for the exact translation.

**Primary recommendation:** Pin `@anthropic-ai/sdk@0.97.1` (latest stable, published 2026-05-19, two days before SPEC). Use `client.messages.batches.*` (stable namespace — confirmed via SDK source). Use `zeed-dom`-backed `@tiptap/html` `generateHTML(doc, [StarterKit, Link])` server-side (zero polyfill, zero install changes). Ship `drizzle/0006_ai_generations_audit_extensions.sql` as a single combined Drizzle-generated + hand-written file using the existing `--> statement-breakpoint` pattern (precedent: 0004_policy_versions_unique.sql). Add a SDK-to-SPEC enum translator in `/api/ai/consistency/[batchId]` to bridge the `processing_status` drift.

## Phase 4 Technical Confirmations

| # | Topic | Source URL | Confirmed Decision | Plan-phase Impact |
|---|-------|------------|---------------------|---------------------|
| 1 | SDK version + Batches namespace | `pnpm view @anthropic-ai/sdk version` → `0.97.1` (published 2026-05-19) [VERIFIED: npm registry]; `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/batches.ts` [CITED] | Pin exact `0.97.1`. Stable namespace `client.messages.batches.*`. Batches probe (D-39) returns STABLE. | Probe step in D-39 is **NO-OP** — namespace already verified. Plan-phase still ships the `scratch/probe.ts` for the record per D-39, but the outcome is pre-determined. |
| 2 | Prompt-cache token minimums + TTL | `https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching` [CITED] | Sonnet 4.6 minimum = **1024 tokens**. Haiku 4.5 minimum = **4096 tokens**. `{type: 'ephemeral'}` = 5min. `{type: 'ephemeral', ttl: '1h'}` = 1h. Write cost: **1.25× for 5min, 2× for 1h**. Read cost: **0.1× (10%)** base input. | D-33 `LONG_CACHE = {type: 'ephemeral', ttl: '1h'}` is correct. D-40 cold-miss observability log: keep — most SMB orgs (<5 policies) will fall below the 1024-token cache minimum and silently bypass. Q&A endpoint MUST order longer-TTL blocks BEFORE shorter-TTL per Anthropic 400 rejection rule. |
| 3 | Batch API mechanics | `https://platform.claude.com/docs/en/api/creating-message-batches` + `https://platform.claude.com/docs/en/docs/build-with-claude/batch-processing` [CITED] | Submit shape: `{ requests: [{ custom_id, params: MessageCreateParamsNonStreaming }] }`. Response `id` format example: **`msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d`** (prefix `msgbatch_`). `processing_status`: **`'in_progress' \| 'canceling' \| 'ended'`** (NOT what SPEC R5 says). | **CRITICAL DRIFT**: D-30 + D-21 + SPEC R5 + API-SPEC.md all assume `'in_progress' \| 'completed' \| 'failed'`. The polling endpoint MUST translate: `ended + request_counts.errored > 0 OR request_counts.expired > 0 OR request_counts.canceled > 0 → 'failed'`; `ended + all-succeeded → 'completed'`; `canceling → 'in_progress'` (per Anthropic docs: canceling becomes ended). See `## Batch API Mechanics` below for canonical translator. Plan-phase: add `app/api/ai/consistency/[batchId]/route.ts` body with this translator. |
| 4 | TipTap server-side `generateHTML` | `node_modules/.../@tiptap/html/src/{generateHTML,getHTMLFromFragment}.ts` (installed 2.27.2) [VERIFIED: installed package source] | `generateHTML(doc: JSONContent, extensions: Extensions): string`. Uses `zeed-dom@^0.15.1` internally (server-safe virtual DOM). **NO JSDOM polyfill needed**. Runs in Next.js 15 Node runtime out of the box. | D-07's "regex strip-tags vs JSDOM" tradeoff resolves to: use `generateHTML([StarterKit, Link])` → output HTML → strip with regex `/<[^>]+>/g` → XML-escape (D-31). No JSDOM, no polyfill. Phase 3 already ships `@tiptap/html@2.27.2` as a prod dep — Phase 4 adds nothing to package.json for this. |
| 5 | Drizzle combined-migration pattern | `drizzle/0004_policy_versions_unique.sql` (existing) [VERIFIED: file] | Single .sql file CAN combine hand-written DDL (`DELETE FROM ... USING ...`) with Drizzle-generated `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` using `--> statement-breakpoint`. Migrations register in `drizzle/meta/_journal.json` by `pnpm db:generate` for the auto-generated half; hand additions just need the breakpoint marker. | D-32 + D-35's combined `drizzle/0006_ai_generations_audit_extensions.sql` is a valid pattern. Plan-phase writes a single file with the column adds (Drizzle-generated via `pnpm db:generate`) PLUS the hand-written partial-unique index, separated by `--> statement-breakpoint`. The `0005_rls_batch_jobs.sql` (D-29) and the Drizzle-generated `0004_initial_batch_jobs.sql` are separate files (matches the Phase 2 `0000` + `0001` precedent). Note: existing migration numbering ends at 0004; Phase 4 starts at **0005, 0006, 0007** (not the 0004/0005/0006 CONTEXT.md mentions before audit — see Drizzle journal). |
| 6 | Anthropic SDK recent changes (since 2026-05-21) | `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/CHANGELOG.md` [CITED] | 0.97.0 (2026-05-19): TypeScript Node 26 compat. 0.97.1 (2026-05-19): SessionToolRunner bug fix. 0.96.0 (2026-05-13): cache diagnostics beta + Zod v4 compat. **No breaking changes affecting D-33 (client config), D-38 (extractText), D-29/D-32/D-35 (schema)**. `Usage` shape is stable since 0.60.0 (2025-08-13, when 1h TTL went GA). `ClientOptions.maxRetries` default = `2`; `timeout` default = `600_000ms`. D-33's `maxRetries: 0, timeout: 25_000` config is valid. | All D-NN code sketches in CONTEXT.md remain valid as of 0.97.1. No code changes needed to absorb SDK updates between SPEC date (2026-05-21) and install. |
| 7 | Validation architecture | `vitest@^1.6.0` (installed) + Phase 3 `verify:phase-3` chain (10 gates) + existing `scripts/check-policies-list-filters.ts` pattern [VERIFIED: package.json + glob] | 4 critical sub-paths through the AI layer require Nyquist coverage. All achievable via vitest unit fixtures + `scripts/check-ai-layer.ts` integration test (D-24). | See `## Validation Architecture` below. |

## SDK Namespace Verification (D-39)

**Conclusion:** `client.messages.batches.*` is the **STABLE** namespace. `client.beta.messages.batches.*` does NOT need to be used.

**Evidence:**
- Anthropic SDK TypeScript source (HEAD on main, v0.97.1): `src/resources/messages/batches.ts` (NOT `src/resources/beta/messages/batches.ts`). [VERIFIED: github.com/anthropics/anthropic-sdk-typescript]
- Class declaration: `export class Batches extends APIResource` exported from `src/resources/messages/index.ts` and attached to `client.messages.batches` (camelCase).
- Method signatures confirmed:
  ```typescript
  create(body: BatchCreateParams, options?: RequestOptions): APIPromise<MessageBatch>
  retrieve(messageBatchID: string, options?: RequestOptions): APIPromise<MessageBatch>
  list(query: BatchListParams | null | undefined = {}, options?: RequestOptions): PagePromise<MessageBatchesPage, MessageBatch>
  cancel(messageBatchID: string, options?: RequestOptions): APIPromise<MessageBatch>
  ```
- Official Anthropic docs (May 2026) use the stable path in TypeScript examples:
  ```typescript
  // Anthropic docs Batch Processing page (TypeScript example)
  const messageBatch = await anthropic.messages.batches.create({ requests: [ ... ] });
  ```

**Recommended import path (EXACT — planner uses this verbatim):**
```typescript
import Anthropic from '@anthropic-ai/sdk';
// types
import type { Message, Usage, TextBlock, TextBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { MessageBatch, MessageBatchRequestCounts } from '@anthropic-ai/sdk/resources/messages/batches';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Stable namespace — verified
await client.messages.batches.create({ requests: [...] });
await client.messages.batches.retrieve(batchId);
```

**D-39 probe step is now a no-op verification** — plan-phase still writes `scratch/probe.ts` for the audit record but the outcome is pre-determined. D-05 mock shape (`messages.batches.{create, retrieve}` as `vi.fn()` on the mocked client) is correct.

## Prompt-Cache Mechanics

**Source:** `https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching` (verbatim quotes below) [CITED]

### Token minimums (per model family)

> - 4,096 tokens for Claude Mythos Preview, Claude Opus 4.7, Claude Opus 4.6, and Claude Opus 4.5
> - **1,024 tokens for Claude Sonnet 4.6**, Claude Sonnet 4.5, Claude Opus 4.1, Claude Opus 4, and Claude Sonnet 4
> - **4,096 tokens for Claude Haiku 4.5**
> - 2,048 tokens for Claude Haiku 3.5

Phase 4 uses Sonnet 4.6 (Draft, Q&A, Consistency) → 1024 minimum, and Haiku 4.5 (TL;DR) → 4096 minimum.

### TTL syntax

> Currently, "ephemeral" is the only supported cache type, which by default has a 5-minute lifetime.

**5-minute (default):**
```json
"cache_control": {"type": "ephemeral"}
```

**1-hour (D-33 LONG_CACHE):**
```json
"cache_control": {"type": "ephemeral", "ttl": "1h"}
```

The `ttl: '1h'` syntax in D-33 is **CORRECT** [VERIFIED: docs].

### Pricing multipliers (verbatim)

> - 5-minute cache write tokens are **1.25 times** the base input tokens price
> - 1-hour cache write tokens are **2 times** the base input tokens price
> - Cache read tokens are **0.1 times** the base input tokens price

D-33 cost-note comment ("`LONG_CACHE` write costs 2× normal input tokens") is **CORRECT**.

D-35 weighted-token-cost SQL formula in CONTEXT.md (line 800-808) is also **CORRECT** when fact-checked against these multipliers:
```sql
input_tokens
  + COALESCE(cache_creation_input_tokens, 0) * 1.25   -- 5min write
  + cache_read_input_tokens * 0.1                       -- read
  + output_tokens * 5                                   -- (approximate output:input ratio)
```
The `1.25` for `cache_creation_input_tokens` is the **5-min default** cost — if Q&A uses LONG_CACHE (1h), those tokens should be costed at 2×, not 1.25×. The SDK does NOT split `cache_creation_input_tokens` by TTL tier — both are bucketed into the same field. Plan-phase has two acceptable options: (a) accept the under-count for Q&A's 1h-cached library block (cost analytics off by ~37.5% on the Q&A write cost only); (b) widen D-35 to include a per-row `cache_ttl: '5min' | '1h'` column so the analytics query knows which multiplier to apply. Recommendation: (a) for MVP, document the under-count as a known limitation; reach for (b) only if Phase 8 telemetry shows under-counting matters for cost decisions. This is a small follow-up, not a blocker.

### LONG_CACHE breakeven

D-33 claims "1-hour TTL is strictly cheaper than 5-min TTL at any non-trivial volume." Verifying:
- 5min write: 1.25× → cost 25% more than non-cached input
- 1h write: 2× → cost 100% more than non-cached input
- Read: 0.1× → 90% cheaper than non-cached input

Per write, you need ENOUGH reads to amortize. With 5min: 1 write (1.25×) + 1 read (0.1×) = 1.35× per 2 calls = 0.675× per call (better than 1× input). With 1h: 1 write (2×) + 1 read (0.1×) = 2.1× per 2 calls = 1.05× per call (worse than non-cached!). Breakeven: 1h is cheaper when (2 + 0.1N) / (N+1) < 1 → N > 19/0.9 → N > 21 reads per write. SPEC R4's 60-80% cache-hit target = ~3-4 reads per write → 1h is **NOT** strictly cheaper at SMB scale; only at >21 reads per write. **Conclusion**: D-33's "strictly cheaper" claim is **OVER-OPTIMISTIC**. At the SPEC R4 target hit rate, 1h cache is more expensive than 5min cache. The justification for `LONG_CACHE` is the **batch latency consideration** (the Note in batch processing docs that batches "can take longer than 5 minutes to process" so the 1h cache survives the batch run) — NOT cost. This affects the Q&A endpoint's economic calculation but does not block implementation. Plan-phase MAY revisit D-33 (a) to keep `LONG_CACHE` for Q&A (resilience over cost) or (b) to switch Q&A to `EPHEMERAL_CACHE` (cheaper at observed hit rates).

**Recommendation:** Keep D-33's `LONG_CACHE` for Q&A as-locked. The 1h TTL also future-proofs against the "policy library updated rarely + employee queries arrive in bursts" pattern where the 5min TTL would fall out under intermittent traffic. The cost differential is small at SMB volumes. Note the trade-off in `## Open Questions` for operator awareness.

## Batch API Mechanics

**Source:** `https://platform.claude.com/docs/en/api/creating-message-batches` + `https://platform.claude.com/docs/en/docs/build-with-claude/batch-processing` + Anthropic SDK source [CITED, VERIFIED]

### Request shape — `client.messages.batches.create`

```typescript
await client.messages.batches.create({
  requests: [
    {
      custom_id: "consistency-2026-05-21",  // 1-64 chars, /^[a-zA-Z0-9_-]{1,64}$/
      params: {
        model: 'claude-sonnet-4-6',          // (or claude-sonnet-4-6 per D-04)
        max_tokens: 8192,
        system: [{ type: 'text', text: CONSISTENCY_SYSTEM_PROMPT }],
        messages: [{ role: 'user', content: fullPolicyLibrary }],
      },
    },
  ],
});
```

**Limitations** (verbatim from Anthropic):
- Max 100,000 requests or 256 MB per batch
- `max_tokens` must be ≥ 1; `max_tokens: 0` (cache pre-warming) **NOT** supported in batches
- Batches scoped per Workspace (the API key's workspace)
- Most batches complete < 1 hour, hard cap 24 hours
- Results retained 29 days post-creation

### Response shape — `MessageBatch` (returned by create AND retrieve)

```typescript
// From SDK src/resources/messages/batches.ts (verbatim) [VERIFIED]
export interface MessageBatch {
  id: string;                          // Example: "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d"
  archived_at: string | null;
  cancel_initiated_at: string | null;
  created_at: string;                  // ISO 8601
  ended_at: string | null;             // ISO 8601 — null until processing_status === 'ended'
  expires_at: string;                  // 24h after created_at
  processing_status: 'in_progress' | 'canceling' | 'ended';   // ← NOTE THE ENUM
  request_counts: MessageBatchRequestCounts;
  results_url: string | null;          // Set when processing_status === 'ended' AND succeeded > 0
  type: 'message_batch';
}

export interface MessageBatchRequestCounts {
  canceled: number;
  errored: number;
  expired: number;
  processing: number;
  succeeded: number;
}
```

**Batch ID format example (verbatim from docs):**
```json
{
  "id": "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d",
  "type": "message_batch",
  "processing_status": "in_progress",
  ...
}
```
**Note from SDK comments**: "The format and length of IDs may change over time." Plan-phase MUST treat the `msgbatch_` prefix as a runtime example, NOT a hard contract regex.

### Status enum — CRITICAL drift from SPEC R5

| SPEC R5 / D-21 / API-SPEC.md says | Anthropic SDK actually returns |
|------------------------------------|-------------------------------|
| `'in_progress'` | `'in_progress'` ✓ matches |
| `'completed'` | **`'ended'`** ✗ — and "ended" lumps together completed/failed/canceled/expired |
| `'failed'` | **No such enum** — failure inferred from `request_counts.errored > 0` |
| (none) | `'canceling'` — emitted transiently after a cancel request |

**Required translator in `/api/ai/consistency/[batchId]/route.ts`:**

```typescript
// app/api/ai/consistency/[batchId]/route.ts (sketch — plan-phase finalizes)
function translateProcessingStatus(batch: MessageBatch): 'in_progress' | 'completed' | 'failed' {
  if (batch.processing_status === 'in_progress' || batch.processing_status === 'canceling') {
    return 'in_progress';
  }
  // processing_status === 'ended' — differentiate via request_counts
  const { succeeded, errored, expired, canceled } = batch.request_counts;
  if (errored > 0 || expired > 0 || canceled > 0) return 'failed';
  if (succeeded > 0) return 'completed';
  return 'failed';   // zero of everything is anomalous; treat as failure
}

// In response handler:
const status = translateProcessingStatus(batch);
return NextResponse.json({ status, result: status === 'completed' ? findings : undefined });
```

Plan-phase **MUST** ship this translator. The `batch_jobs.status` column ('in_progress' | 'completed' | 'failed' per D-06 CONTEXT.md line 525) is the SPEC enum, persisted by the polling endpoint AFTER translation — NOT the raw SDK enum. The `status` enum is internal to the app contract; SDK enum stays inside the Anthropic call boundary.

### Retrieving batch results — separate API call

Once `processing_status === 'ended'` and `succeeded > 0`, fetch results via:

```typescript
// From SDK [VERIFIED]
for await (const result of await anthropic.messages.batches.results(batchId)) {
  switch (result.result.type) {
    case 'succeeded':
      // result.result.message is the Anthropic.Messages.Message
      break;
    case 'errored':
    case 'expired':
    case 'canceled':
      // handle each
      break;
  }
}
```

Note: Consistency Check submits a **single batch with one request** containing the full policy library (per D-21 polling pattern). The `result_type` per request is therefore exactly one of the four — plan-phase iterates once.

**Polling code reference (from official docs, TypeScript verbatim):**
```typescript
let messageBatch;
while (true) {
  messageBatch = await anthropic.messages.batches.retrieve(messageBatchId);
  if (messageBatch.processing_status === 'ended') {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
```

D-34's 25-second DB-cached `STALE_WINDOW_MS` is a coarser-grained variant of this same loop wrapped at the route-handler boundary — preserves Anthropic Tier-1 50RPM cap for batches API.

## TipTap Server-Side Extraction

**Conclusion:** `generateHTML(contentJson, [StarterKit, Link])` runs in Next.js Node runtime out of the box with **no DOM polyfill needed**.

**Evidence:**
- Phase 3 installed `@tiptap/html@2.27.2` as a production dep [VERIFIED: package.json line 40]
- `node_modules/.pnpm/@tiptap+html@2.27.2_.../src/getHTMLFromFragment.ts` source [VERIFIED: read directly]:
  ```typescript
  import { DOMSerializer, Node, Schema } from '@tiptap/pm/model';
  import { createHTMLDocument, VHTMLDocument } from 'zeed-dom';

  export function getHTMLFromFragment(doc: Node, schema: Schema, options?: { document?: Document }): string {
    // ...uses zeed-dom for default serialization...
    const zeedDocument = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
      document: createHTMLDocument() as unknown as Document,
    }) as unknown as VHTMLDocument;
    return zeedDocument.render();
  }
  ```
- `package.json` of installed `@tiptap/html@2.27.2`: `"dependencies": { "zeed-dom": "^0.15.1" }` [VERIFIED: read directly]
- TipTap docs (HTML utility page) explicitly state: *"There are two exports available: generateHTML from @tiptap/core and from @tiptap/html. The former is only for use within the browser, the latter can be used on either the server or the browser. On the server, a virtual DOM is used to generate the HTML."* [CITED: tiptap.dev/docs/editor/api/utilities/html]

**Implementation pattern for D-07 `lib/ai/qa-extract.ts`:**

```typescript
import 'server-only';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

const STRIP_TAGS = /<[^>]+>/g;
const COLLAPSE_WHITESPACE = /\s+/g;

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&apos;');

export function policyToPromptText(policy: { contentJson: unknown }): string {
  const html = generateHTML(policy.contentJson as JSONContent, [StarterKit, Link]);
  const stripped = html.replace(STRIP_TAGS, ' ').replace(COLLAPSE_WHITESPACE, ' ').trim();
  return xmlEscape(stripped);   // D-31 prompt-injection mitigation
}
```

**Caveat from zeed-dom limitations** [CITED: github.com/ueberdosis/tiptap/issues/5352]: `zeed-dom`'s style-attribute parsing differs from a browser DOM. For Phase 4 this is irrelevant — the regex strips all attributes anyway. No action needed.

**No package install required.** Phase 4 reuses Phase 3's already-installed deps.

## Drizzle Combined-Migration Pattern

**Conclusion:** Hand-written DDL CAN ship inside a Drizzle-generated migration file using `--> statement-breakpoint`.

**Evidence:**
- Existing precedent: `drizzle/0004_policy_versions_unique.sql` [VERIFIED: read directly]
  ```sql
  -- Hand-written (Plan 03-G3 T3)
  DELETE FROM policy_versions a
  USING policy_versions b
  WHERE a.policy_id = b.policy_id
    AND a.version_number = b.version_number
    AND a.created_at > b.created_at;
  --> statement-breakpoint
  -- Drizzle-generated
  ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_version_number_unique" UNIQUE("policy_id","version_number");
  ```
- `drizzle/meta/_journal.json` registers the migration once (one `entries` array entry per .sql file); breakpoints inside the file are an in-file convention, not a journal-level concept [VERIFIED: read directly].

**Phase 4 file numbering (correcting CONTEXT.md):**

CONTEXT.md `<code_context>` line 237 references `drizzle/0004_initial_batch_jobs.sql` + `drizzle/0005_rls_batch_jobs.sql`. The existing journal already has `_journal.json` entry `0004_policy_versions_unique`. Plan-phase MUST start Phase 4 migrations at **0005**:

| File | Origin | Purpose |
|------|--------|---------|
| `drizzle/0005_initial_batch_jobs.sql` | Drizzle-generated via `pnpm db:generate` | New `batch_jobs` table CREATE + FKs |
| `drizzle/0006_rls_batch_jobs.sql` | Hand-written via `pnpm db:generate:rls --custom` | 4 explicit RLS statements per D-29 (`ENABLE RLS` + `CREATE POLICY org_isolation` + `GRANT ALL TO authenticated` + the comment about `org_id NOT NULL` enforced at DDL) |
| `drizzle/0007_ai_generations_audit_extensions.sql` | Combined (Drizzle-generated + hand-written) | D-32 (`idempotency_key` column) + D-35 (token-tier columns) + hand-written partial-unique index `CREATE UNIQUE INDEX ai_generations_org_idempotency_key ON ai_generations(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;` |

CONTEXT.md (`<amendments>` D-32/D-35) said `drizzle/0006_ai_generations_audit_extensions.sql` — but Phase 4 needs 0005 + 0006 + 0007 because `batch_jobs` is **two files** (Drizzle-generated DDL + hand-written RLS, per the Phase 2 D-05 precedent). Plan-phase MUST adjust the file naming **OR** combine `batch_jobs` DDL + RLS into a single file (acceptable but breaks the Phase 2 split convention). Recommendation: stick with the 3-file pattern (0005 / 0006 / 0007) to keep parity with Phase 2's split. Note the CONTEXT.md spec error and ship the corrected naming.

**Combined-migration pattern for `0007_ai_generations_audit_extensions.sql`:**

```sql
-- Phase 4 D-32 + D-35 combined migration.
-- Idempotency key for /api/ai/draft + cache-token tier columns for Phase 8 analytics.
-- Approved by operator 2026-05-21 (CLAUDE.md ASK FIRST gate cleared).

-- D-35: drop tokens_used, add 4 nullable cache-token columns
ALTER TABLE "ai_generations" DROP COLUMN "tokens_used";
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_read_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_creation_input_tokens" integer;
--> statement-breakpoint

-- D-32: idempotency_key column (Phase 4 frozen-table extension; ASK FIRST cleared)
ALTER TABLE "ai_generations" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint

-- D-32 hand-written: partial-unique index (Drizzle does not emit partial indexes from .unique())
CREATE UNIQUE INDEX "ai_generations_org_idempotency_key"
  ON "ai_generations"("org_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
```

The `ALTER TABLE ... DROP COLUMN "tokens_used"` is a **one-way irreversible** schema change — production data in `tokens_used` is **lost** on this migration. Phase 4 has no production data yet (no Anthropic calls were made pre-Phase-4), so this is safe. If Phase 4 ships after any pilot org has used the system, the column drop MUST be deferred and replaced with a `tokens_used` → split-into-4 backfill — but per STATE.md the project is pre-MVP and pre-paying-customer. Plan-phase confirms with operator at task time.

## Anthropic SDK Recent Changes

**Source:** Official changelog `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/CHANGELOG.md` [CITED]

| Version | Date | Change | Impact on Phase 4 D-NN |
|---------|------|--------|------------------------|
| 0.97.1 | 2026-05-19 | SessionToolRunner: "skip tool calls SessionToolRunner does not own" | None — Phase 4 doesn't use SessionToolRunner |
| 0.97.0 | 2026-05-19 | Self-hosted sandboxes (CMA); TypeScript Node 26 compat | None — Node 22 still supported per ClientOptions |
| 0.96.0 | 2026-05-13 | "Add support for cache diagnostics beta"; Zod v4 type compat | **Potential**: cache diagnostics beta may surface MORE cache-token data than current `Usage` shape. Plan-phase MAY add a vitest fixture asserting the 4-column shape is sufficient for SPEC R4 cache-hit observability. No blocker. |
| 0.95.x | 2026-05-06..11 | Managed Agents, OIDC federation, redact api-key headers in debug logs | None |
| 0.93.0 | 2026-05-04 | Workload Identity Federation, OAuth, auth profiles | None |
| 0.92.0 | 2026-04-30 | Headers via env, Bedrock improvements | None |
| 0.90.0 | 2026-04-16 | "add claude-opus-4-7, token budgets and user_profiles" | None — Phase 4 doesn't use Opus 4-7 (D-04 locks Sonnet 4.6 + Haiku 4.5) |
| 0.89.0 | 2026-04-14 | "Sonnet and Opus 4 deprecated" | **D-04 still names `claude-sonnet-4-6` (Sonnet 4.6, NOT Sonnet 4)** — confirmed unaffected |
| 0.78.0 | 2026-02-19 | "Add top-level cache control (automatic caching)" | None — D-33 uses explicit `cache_control` blocks; ignore automatic caching for now |
| 0.60.0 | 2025-08-13 | "makes 1 hour TTL Cache Control generally available" | **D-33 `LONG_CACHE` ttl: '1h' is GA since 0.60.0** — fully supported in 0.97.1 |

**Stability summary for Phase 4 binding APIs:**
- `client.messages.create(...)` — stable, no recent changes affecting Phase 4
- `client.messages.batches.{create, retrieve, results, cancel, list}` — stable namespace since 0.29.0 (2024-10-08), confirmed in 0.97.1
- `Usage` type — stable shape `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, cache_creation, service_tier, inference_geo, server_tool_use }` — Phase 4 reads only the first 4 columns; the rest are nullable additions that don't affect D-35
- `TextBlock`, `Message.content`, `ContentBlock` — stable; D-38 `extractText` discriminator pattern (`b.type === 'text'`) works in 0.97.1
- `ClientOptions` — `maxRetries` (default 2), `timeout` (default 600_000ms); D-33 overrides both with `0` and `25_000`

**No breaking changes affect D-NN code sketches** between SPEC date (2026-05-21) and the verified-current SDK (0.97.1). Pin `0.97.1`.

## Validation Architecture

**Test framework verified:** Vitest 1.6.0 (installed) + jsdom 24 (installed) [VERIFIED: package.json]. The `verify:phase-3` chain (10 gates including `pnpm test`) is in place. `scripts/check-policies-list-filters.ts` is the integration-test precedent for `scripts/check-ai-layer.ts` (live TEST DB with seed-and-rollback).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest@^1.6.0 |
| Config file | none yet — Phase 3 uses `tests/setup.ts` jsdom shim |
| Quick run command | `pnpm test` (vitest run) |
| Full suite command | `pnpm verify:phase-4` (planned: wraps verify:phase-3 + 2 new gates per D-24) |
| Phase gate | `pnpm verify:phase-4` exit 0 before squash-merge |

### Critical Sub-Paths (Nyquist — 4 must-cover paths)

Each sub-path identifies what fails if untested. All achievable via vitest unit fixtures + `scripts/check-ai-layer.ts` integration; **none require human UAT** (Phase 4 ships behind admin UI, but the core data-integrity contracts are fixture-coverable).

| # | Sub-path | What fails if untested | Validation approach | Coverage type |
|---|----------|------------------------|---------------------|---------------|
| **SP-1** | **Cross-org citation leak** — Q&A `validIds` Set MUST come from the same `withOrgScope` closure as the library block, NOT a hoisted cache or cross-org Set (D-41) | Org A could see Org B's policy IDs in Q&A citations (multi-tenancy breach — CLAUDE.md NEVER #5 equivalent + ADR-019 violation) | **Integration test** (`scripts/check-ai-layer.ts`): seed Org A with 2 published policies + Org B with 1 published policy with a known unique title. Authenticate as Org A user, POST `/api/ai/qa` with a question Claude would cite all 3 policies for (mocked Anthropic response forces all 3 IDs into the fence). Assert response.citations contains ONLY Org A's IDs (Org B's stripped). Then SELECT count(*) FROM ai_generations to confirm exactly 1 row written for Org A. | integration (Anthropic-mocked, live TEST DB) |
| **SP-2** | **503 contract on Anthropic failure** — no `ai_generations` row written (SPEC R7 AC), Retry-After header set, error code preserved | Failed Anthropic calls would corrupt tier-limit math (failure rows counted as drafts) AND drift the SLA-failure rate observability from "true Anthropic failure" to "any error" | **Vitest fixture**: mock `getAnthropicClient()` to throw `Anthropic.APIError` (status 503) on `messages.create`. Hit each of the 4 endpoints (draft, summary, qa, consistency-submit) via Next.js route-handler invocation. Assert: (a) response.status === 503; (b) response body matches `{error: 'ai_service_unavailable', retryAfter: 30}`; (c) response.headers['Retry-After'] === '30'; (d) `SELECT count(*) FROM ai_generations` unchanged. AC-31 (D-36 PII-safe logging) is covered in the same fixture by capturing `console.error` and asserting `error.message` is truncated to 120 chars OR uses the structured-field branch. | vitest unit fixture |
| **SP-3** | **publishPolicy graceful-degrade** — state transition completes even if summary throws (D-19, SPEC R3) | A flaky Anthropic call would prevent admin from publishing policies — the AI is a best-effort overlay, NOT a publish-blocker | **Vitest fixture** (`lib/policies/transitions.test.ts` Phase 3 file extended): mock `generateSummaryForPolicy` to throw. Invoke `publishPolicy(policyId)`. Assert: (a) no error propagates to caller; (b) `SELECT status FROM policies WHERE id=$1` returns `'published'`; (c) `SELECT tldrSummary FROM policies WHERE id=$1` returns NULL; (d) `policy_versions` row was written for the publish; (e) console.error log emitted with `[publish] summary failed` prefix per D-18. | vitest unit fixture |
| **SP-4** | **Tier-limit overage routing** — 429 (usageBound) vs 403 (tier-bound) per `usageBound` array (D-15) | Starter org admin would get 403 ("upgrade") instead of 429 ("you used your N drafts this month") for draft overage — wrong UX message AND wrong API contract | **Vitest fixture** (`lib/stripe/products.test.ts` new): mock `checkTierLimit('aiDraftsMonthly')` to return `{allowed: false, limit: 50, current: 50}`. Call `requireTierLimit(orgId, 'aiDraftsMonthly')`. Assert it throws `TierLimitExceededError` with `statusCode === 429`. Repeat for `consistencyCheck` (Starter false) — assert `statusCode === 403` AND `requiredTier === 'growth'`. Then in the integration test (`scripts/check-ai-layer.ts`): seed Starter org with 50 prior `ai_generations` draft rows in current month; POST `/api/ai/draft` and assert response.status === 429 with the documented body shape. Same path for `/api/ai/consistency` returning 403. | vitest unit fixture + integration |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REQ-ai-policy-assistant | Draft endpoint returns 200 with non-empty draftContent | integration | `pnpm test scripts/check-ai-layer.ts` (or vitest fixture file) | ❌ Wave 0 — `scripts/check-ai-layer.ts` |
| REQ-ai-policy-assistant | Q&A cites real policy IDs from same org | integration | `pnpm test scripts/check-ai-layer.ts` | ❌ Wave 0 |
| REQ-ai-policy-assistant | TL;DR idempotent on 2nd call | vitest unit | `pnpm test lib/ai/summary.test.ts` | ❌ Wave 0 — `lib/ai/summary.test.ts` |
| REQ-ai-policy-assistant | Consistency Check requires Growth+ | vitest unit + integration | `pnpm test lib/stripe/products.test.ts` + `scripts/check-ai-layer.ts` | ❌ Wave 0 |
| REQ-ai-policy-assistant | All AI calls logged to ai_generations | integration | `pnpm test scripts/check-ai-layer.ts` | ❌ Wave 0 |
| REQ-ai-usage-rules | 429 with `tier_limit_exceeded` on draft overage | vitest unit + integration | `pnpm test lib/stripe/products.test.ts` + `scripts/check-ai-layer.ts` | ❌ Wave 0 |
| REQ-ai-usage-rules | Q&A prompt constrained to published policies | integration | `pnpm test scripts/check-ai-layer.ts` (SP-1) | ❌ Wave 0 |
| REQ-ai-usage-rules | Legal disclaimer on legal-adjacent Q | vitest fixture | `pnpm test lib/ai/qa-parser.test.ts` | ❌ Wave 0 |
| REQ-ai-usage-rules | Citations array references real policies | integration (SP-1) | `pnpm test scripts/check-ai-layer.ts` | ❌ Wave 0 |
| SPEC R7 | 503 envelope on Anthropic failure (SP-2) | vitest fixture | `pnpm test app/api/ai/draft/route.test.ts` (and 3 siblings) | ❌ Wave 0 |
| SPEC R3 | publishPolicy graceful-degrade (SP-3) | vitest fixture | `pnpm test lib/policies/transitions.test.ts` (extend Phase 3 file) | ❌ Wave 0 (extension to existing file) |
| AC-23 (D-28) | Draft `setContent(string)` no JSON.parse | vitest fixture | `pnpm test components/policy/PolicyAiDraftDialog.test.tsx` | ❌ Wave 0 |
| AC-24 (D-29) | batch_jobs RLS cross-org isolation | integration | `pnpm check:rls` (extended per D-29) | ❌ Wave 0 — `scripts/check-rls.ts` extension |
| AC-25 (D-30) | /dashboard/consistency mount-time resume | vitest fixture (page component) + manual | `pnpm test app/(admin)/dashboard/consistency/page.test.tsx` | ❌ Wave 0 |
| AC-28 (D-33) | maxRetries: 0, timeout: 25_000 | vitest fixture | `pnpm test lib/ai/client.test.ts` | ❌ Wave 0 |
| AC-29 (D-32) | Idempotency-Key dedup | integration | `pnpm test scripts/check-ai-layer.ts` | ❌ Wave 0 |
| AC-30 (D-34) | 10 polls → 1 SDK call within 25s | vitest fixture | `pnpm test app/api/ai/consistency/[batchId]/route.test.ts` | ❌ Wave 0 |
| AC-31 (D-36) | PII-safe error log truncation | vitest fixture (covered in SP-2) | included in `pnpm test app/api/ai/qa/route.test.ts` | ❌ Wave 0 |
| AC-32 (D-35) | input/output/cache_read/cache_creation_input_tokens columns written | integration | `pnpm test scripts/check-ai-layer.ts` | ❌ Wave 0 |
| AC-33 (D-42) | Zod `.strict()` rejects extra keys + length-exceed | vitest fixture | `pnpm test lib/ai/schemas.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit**: `pnpm typecheck && pnpm test` (vitest unit + tsc, <30s)
- **Per wave merge**: `pnpm verify:phase-4` (full chain incl. RLS + integration tests, ~30-60s estimated)
- **Phase gate**: `pnpm verify:phase-4` exit 0 + operator UAT on `/policies/new` Draft + `/policies/[id]` Regenerate + `/dashboard/consistency` Run

### Wave 0 Gaps

Phase 4 starts with NO Phase-4-specific test files. Wave 0 of execute-phase MUST create:

- [ ] `lib/ai/client.test.ts` — singleton + maxRetries/timeout assertion (AC-28)
- [ ] `lib/ai/qa-parser.test.ts` — citation fence parser + validIds strip
- [ ] `lib/ai/qa-extract.test.ts` — generateHTML + strip + xmlEscape pipeline (D-31)
- [ ] `lib/ai/schemas.test.ts` — Zod `.strict()` for Draft + Summary + Qa schemas (AC-33)
- [ ] `lib/ai/summary.test.ts` — TL;DR idempotent + cache hit
- [ ] `lib/stripe/products.test.ts` — checkTierLimit + requireTierLimit + 429/403 routing (SP-4)
- [ ] `app/api/ai/draft/route.test.ts` — 503 contract + tier-limit dispatch (SP-2)
- [ ] `app/api/ai/summary/route.test.ts` — idempotence + cache-hit path
- [ ] `app/api/ai/qa/route.test.ts` — cache-hit assertion + PII-safe log (SP-2, AC-31)
- [ ] `app/api/ai/consistency/route.test.ts` — submit + Growth+ gate
- [ ] `app/api/ai/consistency/[batchId]/route.test.ts` — status enum translator (CRITICAL — covers SDK-to-SPEC drift) + DB-cache stale window (AC-30)
- [ ] `components/policy/PolicyAiDraftDialog.test.tsx` — `setContent(string)` no JSON.parse (AC-23)
- [ ] `app/(admin)/dashboard/consistency/page.test.tsx` — mount-time resume (AC-25)
- [ ] `lib/policies/transitions.test.ts` — extend Phase 3 file with publishPolicy graceful-degrade (SP-3)
- [ ] `scripts/check-ai-layer.ts` — integration test (live TEST DB, mocked Anthropic) for SP-1, SP-2-integration, SP-4-integration, AC-24, AC-29, AC-32
- [ ] `scripts/check-ai-prompts.ts` — ts-morph verbatim-anchor gate (D-26)
- [ ] `scripts/check-rls.ts` — extend with batch_jobs cross-org test case (AC-24, D-29)

Framework install: not needed (vitest 1.6.0 already in devDeps).

## Project Constraints (from CLAUDE.md)

These directives bind Phase 4 and MUST be honored by every plan:

### ALWAYS
1. `tsc --noEmit` passes before every commit — Phase 4 adds `verify:phase-4` chain
2. Include `org_id` in every DB query — Phase 4's 4 new endpoints all use `withOrgScope`
3. Use prompt caching on all repeated Claude API system prompts (D-33 `LONG_CACHE`)
4. Store every Claude API call in `ai_generations` table (one row on SUCCESS only — D-06)
5. Check tier limits before every Claude API call (D-15 `requireTierLimit`)

### ASK FIRST
1. ✓ Anthropic SDK install — D-01 (named in stack table, ASK FIRST waived per CONTEXT.md)
2. ✓ Schema changes after Phase 2 — D-32 + D-35 approved by operator 2026-05-21

### NEVER
1. ✗ Roll custom auth — Clerk handles everything (Phase 4 uses existing `getOrgContext` + `requireAdmin`)
2. ✗ Call Claude API client-side — D-02 `'server-only'` at top of every `lib/ai/*.ts`
3. ✗ Trust client-side for subscription state — D-15 reads `organizations.planTier` from DB
4. ✗ Use `any` TypeScript type — Phase 4 uses Anthropic SDK types + Zod-branded inputs
5. ✗ Delete/modify acknowledgment records — N/A in Phase 4 (acks belong to Phase 5)
6. ✗ Build features not in REQUIREMENTS.md — CONTEXT.md `<deferred>` enumerates all out-of-scope items

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | 0.97.1 | Anthropic Claude API client | Official Anthropic SDK; only supported way to call the API |
| `next` | 15.5.18 (already installed) | Route handlers for the 5 AI endpoints | Phase 1 baseline |
| `drizzle-orm` | ^0.45.2 (already installed) | Drizzle queries for ai_generations + batch_jobs | Phase 2 baseline |
| `zod` | ^3.23.5 (already installed) | Endpoint body validation (D-42 `.strict()` schemas) | Phase 3 precedent |
| `@tiptap/html` | 2.27.2 (already installed) | Server-side ProseMirror → HTML for Q&A extraction (D-07) | Phase 3 dep, reused server-side via zeed-dom |
| `@tiptap/starter-kit` | 2.27.2 (already installed) | TipTap extension set for generateHTML | Phase 3 dep |
| `@tiptap/extension-link` | 2.27.2 (already installed) | TipTap link extension | Phase 3 dep |

### Supporting (devDeps, already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^1.6.0 | Unit + integration tests | All Phase 4 test files |
| `ts-morph` | 28.0.0 | AST-walking verify gates | `scripts/check-ai-prompts.ts` + `check-error-discipline.ts` widening |
| `jsdom` | ^24 | DOM environment for React Testing Library | Component tests (PolicyAiDraftDialog, ConsistencyCheckRunner) |

### Net-new installation
Single dep: `@anthropic-ai/sdk@0.97.1` exact-pin per D-01.

**Installation:**
```bash
pnpm add @anthropic-ai/sdk@0.97.1
# Verify post-install
pnpm audit --audit-level=moderate
pnpm view @anthropic-ai/sdk@0.97.1 scripts.postinstall  # confirmed empty 2026-05-21
```

**Version verification:**
- `pnpm view @anthropic-ai/sdk version` returned `0.97.1` on 2026-05-21 [VERIFIED: npm registry]
- Published 2026-05-19 (2 days before SPEC date, on or shortly after SDK Node 26 compat update — current latest)
- Repository: `https://github.com/anthropics/anthropic-sdk-typescript.git` [VERIFIED]
- No postinstall script [VERIFIED: `pnpm view ... scripts.postinstall` returned empty]

## Package Legitimacy Audit

> Phase 4 installs exactly one external package (`@anthropic-ai/sdk`). All other deps reused from Phase 1-3.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @anthropic-ai/sdk@0.97.1 | npm | 2 days (latest); package itself since 2023-01-31 | high (official SDK) | github.com/anthropics/anthropic-sdk-typescript | [OK] | Approved |
| @tiptap/html@2.27.2 (reused) | npm | reused from Phase 3 | very high | github.com/ueberdosis/tiptap | [OK] | Reused |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

slopcheck ran successfully via `python -m slopcheck install @anthropic-ai/sdk @tiptap/html` on 2026-05-21 — both packages clean (2 OK).

## Architecture Patterns

### System Architecture Diagram

```
Admin browser                      Vercel (Next.js 15)                        Anthropic API           Supabase Postgres
─────────────                      ───────────────────                        ──────────────          ─────────────────
                                                                                                       (RLS authenticated role)
[Generate w/ AI dialog]                                                                                       │
   │ POST /api/ai/draft                                                                                       │
   ├─ {prompt, policyType}─────►  POST app/api/ai/draft/route.ts                                              │
                                  │ 1. getOrgContext()  → throws BootstrapError if no session                 │
                                  │ 2. requireAdmin(ctx) → throws ForbiddenError (D-45) → 403                 │
                                  │ 3. try {                                                                  │
                                  │     requireTierLimit(orgId, 'aiDraftsMonthly')                            │
                                  │     DraftSchema.parse(body)                                               │
                                  │     await withOrgScope(ctx, async (s) => {                                │
                                  │       client.messages.create({ ─────────────►  Sonnet 4.6  ──┐           │
                                  │         system: buildCachedSystem(DRAFT...),    cache_control │           │
                                  │         max_tokens: 4096                        ephemeral 5min│           │
                                  │       })  ◄─────────────────────────────────────  Message<TextBlock[]>    │
                                  │       const text = extractText(response)                                  │
                                  │       AiGenerations.insert(s, {input_tokens,output_tokens,...} ──► INSERT ai_generations
                                  │     })                                                                    │
                                  │  } catch (TierLimitExceededError) → 429/403                               │
                                  │  } catch (err) → console.error + 503                                      │
   ◄─{draftContent,tokensUsed}─── return NextResponse.json(...)                                               │
[editor.commands.setContent(string)]                                                                          │

[Publish policy click] ─► publishPolicy(policyId) ──┐
                                                    │
                                                    ├─►  withOrgScope(ctx, async (s) => { ...state transition... })   │ INSERT policy_versions, UPDATE policies
                                                    │                                                                  │
                                                    ├─►  try { await generateSummaryForPolicy(policyId, ctx) }         │ Haiku 4.5 → INSERT ai_generations + UPDATE policies.tldrSummary
                                                    │    catch (err) { console.error '[publish] summary failed' }     │ ← graceful degrade
                                                    └─ (transition stays committed regardless of AI outcome)           │

[Q&A request (Phase 5 UI; Phase 4 ships endpoint only)]
                                  POST app/api/ai/qa/route.ts
                                  │ getOrgContext (NO requireAdmin — any auth)
                                  │ try {
                                  │   QaSchema.parse(body)
                                  │   await withOrgScope(ctx, async (s) => {
                                  │     const policies = await Policies.listPublishedForOrg(s) ──── SELECT ... WHERE status='published' AND org_id=$1
                                  │     const validIds = new Set(policies.map(p => p.id))      ◄── SAME closure (D-41)
                                  │     const libraryXml = policies.map(p => `<policy id="${p.id}" title="${xmlEscape(p.title)}">${policyToPromptText(p)}</policy>`).join('\n')
                                  │     client.messages.create({                                       Sonnet 4.6
                                  │       system: [                                                    LONG_CACHE 1h
                                  │         ...buildLongCachedSystem(libraryXml),                      EPHEMERAL_CACHE 5min
                                  │         ...buildCachedSystem(QA_SYSTEM_PROMPT)                     ── critical order: 1h first ──
                                  │       ],
                                  │       messages: [{role:'user',content:body.question}]
                                  │     }) ── Message ──►  extractText → parseQaResponse(raw, validIds)
                                  │     AiGenerations.insert(s, {...})
                                  │     return parsed
                                  │   })
                                  │ } catch (...) {503}
                                  ◄─ {answer, citations:[{title,id}]}

[Consistency Check submit]
                                  POST app/api/ai/consistency/route.ts
                                  │ requireTierLimit(orgId, 'consistencyCheck')  → 403 on Starter
                                  │ try {
                                  │   await withOrgScope(ctx, async (s) => {
                                  │     const policies = await Policies.listPublishedForOrg(s)
                                  │     const batch = await client.messages.batches.create({  ──►  Batches API (50% off)
                                  │       requests: [{custom_id:..., params:{model:Sonnet,system:CONSISTENCY_PROMPT,messages:[...lib]}}]
                                  │     })
                                  │     await BatchJobs.insert(s, {anthropicBatchId:batch.id, type:'consistency', status:'in_progress'})
                                  │   })
                                  │ } catch (...) {503}
                                  ◄─ {batchId}

[30s client poll]
                                  GET app/api/ai/consistency/[batchId]/route.ts
                                  │ try {
                                  │   const job = await BatchJobs.findByAnthropicBatchId(s, batchId)
                                  │   if (job.status === 'completed' || !isStale) return cached
                                  │   const batch = await client.messages.batches.retrieve(batchId)  ─►  Batches API
                                  │   const status = translateProcessingStatus(batch)  ◄── SDK enum → SPEC enum
                                  │   if (status === 'completed') {
                                  │     for await (const result of client.messages.batches.results(batchId)) {
                                  │       findings = JSON.parse(result.result.message.content[0].text)  ── ConsistencyFinding[]
                                  │     }
                                  │     await BatchJobs.update(s, batchId, {status, resultJson:findings})
                                  │     await AiGenerations.insert(s, {type:'consistency', ...})  ◄── ONE row at ENDED, not at submit
                                  │   }
                                  │ } catch (...) {503}
                                  ◄─ {status, result?: ConsistencyFinding[]}
```

### Pattern 1: `withOrgScope` wraps every Anthropic + DB pair

**What:** Each endpoint opens ONE `withOrgScope` transaction enclosing the Anthropic call + the `ai_generations` insert.

**When to use:** Every AI endpoint. The transaction ensures: (a) RLS evaluates with the right org_id JWT, (b) `ai_generations` insert + adjacent table updates (e.g., `policies.tldrSummary`) commit atomically with the AI response.

**Example:**
```typescript
// Source: D-19 generateSummaryForPolicy sketch (CONTEXT.md:442-466)
await withOrgScope(ctx, async (s) => {
  const policy = (await Policies.findById(s, policyId))[0];
  if (!policy) throw new Error('Policy not found');
  if (policy.tldrSummary) return;  // idempotent

  const response = await getAnthropicClient().messages.create({...});
  const summary = extractText(response);

  await AiGenerations.insert(s, {
    policyId, type: 'summary',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
    model: MODEL_HAIKU, result: summary, prompt: SUMMARY_SYSTEM_PROMPT,
  });
  await Policies.updateSummary(s, policyId, summary);
});
```

### Pattern 2: Auth gates outside try, tier check + SDK call inside try

**What:** Per D-37 (F-10), auth errors propagate to Next.js error boundary (401/403/404); the `try`/`catch` only wraps the tier check + AI call + persistence.

**When to use:** All 4 endpoints. Keeps `BootstrapError` hierarchy meaningful for observability — auth failures don't show up as "AI outages" in metrics.

### Pattern 3: SDK-to-SPEC enum translator (NEW — covers CRITICAL drift)

**What:** Centralize the `processing_status: 'in_progress' | 'canceling' | 'ended'` → `status: 'in_progress' | 'completed' | 'failed'` mapping inside the polling endpoint.

**When to use:** `app/api/ai/consistency/[batchId]/route.ts` only. See `## Batch API Mechanics` for the exact function. The persisted `batch_jobs.status` column stores the SPEC enum, NEVER the raw SDK enum.

### Anti-Patterns to Avoid

- **`JSON.parse(draftContent)`** — Draft prompt produces narrative prose, not ProseMirror JSON. D-28 fixed this at SPEC level; vitest fixture (AC-23) asserts `JSON.parse(draftContent)` would throw.
- **`messages.batches.results()` called on still-processing batches** — returns empty/error. Plan-phase MUST check `processing_status === 'ended'` AND `request_counts.succeeded > 0` before calling `.results()`.
- **`messages.create` with longer-TTL block second** — Anthropic returns HTTP 400. Always order: LONG_CACHE first, EPHEMERAL_CACHE second.
- **Storing `tokens_used` instead of 4-column split** — D-35 already corrected at SPEC level; the migration drops the legacy column.
- **`validIds` Set from hoisted/cached/cross-org source** — D-41 explicit. Construct INSIDE the same `withOrgScope` closure that built `libraryXml`.
- **Auth gate inside try/catch** — D-37 explicit. Auth errors must propagate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML extraction from ProseMirror JSON | Custom JSON walker | `@tiptap/html` `generateHTML(doc, [StarterKit, Link])` | Already installed; uses zeed-dom server-side; handles all 11 StarterKit node types + Link inline mark; future-proof to extension additions |
| Prompt caching | Custom in-memory LRU per org | Anthropic `cache_control: { type: 'ephemeral', ttl: '1h' }` | Anthropic infra caches at platform level; 90% read discount vs 25-100% write premium; SPEC R4 60-80% hit rate target |
| Batch polling | Background worker / cron | Client-side `setInterval` + DB-cache `STALE_WINDOW_MS` (D-21 + D-34) | Phase 4 has no worker plumbing; client-side polling is the locked SPEC contract; D-34 collapses N orgs × 30s polls to 1 SDK call per 25s |
| Idempotency on Draft | Server-side hash + 422 enforcement | `Idempotency-Key` header + nullable `idempotency_key` column + partial-unique index | draft-ietf-httpapi-idempotency-key-header-07 pattern; cheap to add now; body-mismatch 422 deferred |
| Citation extraction | Tool use (structured outputs) | Plain-text fence + JSON.parse + validIds strip | D-10 — lower latency, simpler observability; tool use revisited if citation-parse failures > 2% per 7d window |
| Q&A prompt-injection defense | Sandbox model in isolated process | XML escape + data-only meta-instruction in system prompt (D-31) | Cost-effective; documented at Anthropic; tested via AC-27 fixture |

**Key insight:** Phase 4 is a thin orchestrator layer. The heavy lifting (caching, batching, model invocation, even ProseMirror serialization) lives in well-maintained external libraries. The local code surface is route handlers + tier gates + DB writes + UI hooks. Don't reinvent caching, batching, or DOM rendering.

## Common Pitfalls

### Pitfall 1: Status enum drift between SDK and SPEC

**What goes wrong:** Plan-phase or executor writes `if (batch.processing_status === 'completed')` per SPEC R5, which is FALSE for every real batch — the SDK returns `'ended'`. Polling page hangs forever in "checking..." state because the early-return condition never fires.

**Why it happens:** SPEC R5 (line 51) was written from Anthropic conceptual docs; the actual SDK type signature wasn't consulted during SPEC drafting. CONTEXT.md D-21 + D-30 inherit the SPEC enum verbatim.

**How to avoid:** Use the translator in `## Batch API Mechanics` at the route-handler boundary. The persisted `batch_jobs.status` is the SPEC enum (translated); the raw SDK `processing_status` never crosses the route-handler boundary.

**Warning signs:** Polling page says "Checking... (started 2h ago)" indefinitely; vitest fixture would pass if mock returns SPEC enum but live behavior fails.

### Pitfall 2: Cache write-cost under-counting for LONG_CACHE

**What goes wrong:** Phase 8 cost analytics undercounts Q&A cache-creation costs by ~37.5% because D-35's weighted-cost SQL uses the 5-min multiplier (1.25×) for all `cache_creation_input_tokens` — but Q&A uses LONG_CACHE (2× multiplier).

**Why it happens:** SDK does not split `cache_creation_input_tokens` by TTL tier — both tiers bucketed into one field.

**How to avoid:** Document the limitation in Phase 8 SUMMARY. If precision matters, add a `cache_ttl: '5min' | '1h'` column in a future migration AND populate it in the `AiGenerations.insert` call (Q&A → '1h', others → '5min').

**Warning signs:** Phase 8 cost-per-org reports show Q&A cheaper than it should be.

### Pitfall 3: TipTap generateHTML returns full document HTML, not paragraph-only

**What goes wrong:** Q&A prompt's `policyToPromptText(policy)` produces verbose HTML wrapping (e.g., `<p>...</p><p>...</p>`) that, after strip-tags, has poor whitespace ordering ("PurposeScopeProcedures" run together).

**Why it happens:** `generateHTML` produces semantically valid HTML; strip-tags is naive.

**How to avoid:** Add whitespace-collapse pass after strip: `html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()`. The replacement is ' ' (single space), not '' — preserves word boundaries.

**Warning signs:** Q&A returns citations to wrong policies; vitest fixture catches this if the test asserts a 10-policy library produces 10 distinct token chunks.

### Pitfall 4: `'server-only'` import missing on new `lib/ai/*.ts`

**What goes wrong:** Anthropic API key leaks to client bundle; a SPA-level component imports `lib/ai/client.ts` and the Anthropic SDK ships to the browser.

**Why it happens:** Phase 4 creates 7+ new files; easy to forget the `'server-only'` line on one.

**How to avoid:** `scripts/check-artifacts.ts` extends to assert `'server-only'` is line 1 of every new `lib/ai/*.ts` file (already a Phase 1-2 pattern for `lib/db/*.ts`).

**Warning signs:** Browser console shows `ANTHROPIC_API_KEY=...` in network tab; production cost spikes from leaked-key client-side abuse.

### Pitfall 5: Migration order — RLS migration runs BEFORE schema generation

**What goes wrong:** Plan-phase ships `0005_initial_batch_jobs.sql` (Drizzle-generated) + `0006_rls_batch_jobs.sql` (hand-written RLS) but `db:generate:rls` produces 0005 with idx=0 in journal, breaking later migrations.

**Why it happens:** Two `pnpm db:generate` / `db:generate:rls` invocations can race-order the journal entries.

**How to avoid:** Run them sequentially in the exact order: (a) `pnpm db:generate` for schema, (b) `pnpm db:generate:rls --custom --name=rls_batch_jobs` for the empty 0006 shell, (c) hand-write the body of 0006. Verify `drizzle/meta/_journal.json` has entries in order: 0005, 0006, 0007 with monotonically increasing `when` timestamps.

**Warning signs:** `pnpm db:migrate:test` fails with "policy already exists" or similar order-dependent errors.

### Pitfall 6: Mocked Anthropic response missing `content` array

**What goes wrong:** Vitest test passes a mock that returns `{ usage: {...} }` without `content: [{ type: 'text', text: ... }]`. The `extractText(response)` throws "Anthropic response contained no text block" (D-38).

**Why it happens:** Easy to forget the content block when focused on testing usage/cache metadata.

**How to avoid:** Define a helper `mockTextResponse(text, usage)` in a shared test fixtures file that builds a full `Anthropic.Messages.Message` shape.

**Warning signs:** Tests pass individually but fail when run in suite; flaky failures with "no text block" message.

## Code Examples

### Anthropic SDK client + cache helpers (D-02 + D-03 + D-33)

```typescript
// lib/ai/client.ts
// Source: Anthropic SDK ClientOptions [VERIFIED: src/client.ts] + D-33 amendment
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  return cached ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    maxRetries: 0,        // SPEC R7 — no auto-retry on 5xx (default would be 2)
    timeout: 25_000,      // 25s per request (default would be 600_000)
  });
}
```

```typescript
// lib/ai/cache.ts
// Source: Anthropic prompt-caching docs [CITED] + D-33 LONG_CACHE addition
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

export const EPHEMERAL_CACHE = { type: 'ephemeral' } as const;
export const LONG_CACHE = { type: 'ephemeral', ttl: '1h' } as const;

export function buildCachedSystem(text: string): Anthropic.Messages.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: EPHEMERAL_CACHE }];
}
export function buildLongCachedSystem(text: string): Anthropic.Messages.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: LONG_CACHE }];
}
```

### Q&A endpoint system-array composition (D-33(c) ordering rule)

```typescript
// app/api/ai/qa/route.ts (sketch)
// Source: D-33(c) ordering rule + D-41 validIds wiring
const result = await withOrgScope(ctx, async (s) => {
  const policies = await Policies.listPublishedForOrg(s);
  const validIds = new Set(policies.map(p => p.id));   // D-41: same closure
  const libraryXml = policies
    .map(p => `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`)
    .join('\n');

  const response = await getAnthropicClient().messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: [
      ...buildLongCachedSystem(libraryXml),               // 1h TTL — order matters
      ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),    // 5min TTL — second
    ],
    messages: [{ role: 'user', content: body.question }],
  });

  await AiGenerations.insert(s, {
    type: 'qa', policyId: null,
    prompt: body.question, result: extractText(response),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
    model: MODEL_SONNET,
  });

  return parseQaResponse(extractText(response), validIds);
});
```

### Batch submit + result retrieval (corrects SPEC enum drift)

```typescript
// app/api/ai/consistency/route.ts (POST — submit) — sketch
// Source: Anthropic Batches API docs [CITED]
const batch = await getAnthropicClient().messages.batches.create({
  requests: [{
    custom_id: `consistency-${randomUUID()}`,
    params: {
      model: MODEL_SONNET,
      max_tokens: 8192,
      system: [{ type: 'text', text: CONSISTENCY_SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: fullPolicyLibrary }],
    },
  }],
});
// batch.id is e.g. "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d"
await BatchJobs.insert(s, {
  anthropicBatchId: batch.id,
  type: 'consistency',
  status: 'in_progress',
});
return NextResponse.json({ batchId: batch.id });
```

```typescript
// app/api/ai/consistency/[batchId]/route.ts (GET — poll) — sketch
// Source: SDK MessageBatch type [VERIFIED] + D-21 + D-34 + this research's translator
function translateProcessingStatus(batch: Anthropic.Messages.Batches.MessageBatch): 'in_progress' | 'completed' | 'failed' {
  if (batch.processing_status === 'in_progress' || batch.processing_status === 'canceling') {
    return 'in_progress';
  }
  // 'ended' — differentiate via request_counts
  const { succeeded, errored, expired, canceled } = batch.request_counts;
  if (errored > 0 || expired > 0 || canceled > 0) return 'failed';
  return succeeded > 0 ? 'completed' : 'failed';
}

export async function GET(req: Request, { params }: { params: { batchId: string } }) {
  const ctx = await getOrgContext();
  await requireAdmin(ctx);
  try {
    const result = await withOrgScope(ctx, async (s) => {
      const job = await BatchJobs.findByAnthropicBatchId(s, params.batchId);
      if (!job) return new Response(null, { status: 404 });

      const STALE_WINDOW_MS = 25_000;
      const isStale = (Date.now() - job.updatedAt.getTime()) > STALE_WINDOW_MS;
      if (job.status === 'completed' || !isStale) {
        return NextResponse.json({ status: job.status, result: job.resultJson ?? undefined });
      }

      const batch = await getAnthropicClient().messages.batches.retrieve(params.batchId);
      const status = translateProcessingStatus(batch);

      let findings: ConsistencyFinding[] | undefined;
      if (status === 'completed') {
        for await (const r of await getAnthropicClient().messages.batches.results(params.batchId)) {
          if (r.result.type === 'succeeded') {
            const block = r.result.message.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
            if (block) findings = JSON.parse(block.text);
          }
        }
        if (findings) {
          await AiGenerations.insert(s, {
            type: 'consistency', policyId: null, prompt: CONSISTENCY_SYSTEM_PROMPT,
            result: JSON.stringify(findings),
            inputTokens: 0, outputTokens: 0,    // batch results don't surface per-request usage cleanly
            cacheReadInputTokens: null, cacheCreationInputTokens: null,
            model: MODEL_SONNET,
          });
        }
      }
      await BatchJobs.update(s, params.batchId, { status, updatedAt: sql`now()`, resultJson: findings });
      return NextResponse.json({ status, result: findings });
    });
    return result;
  } catch (err) {
    console.error('[ai/consistency/[batchId]] anthropic failed', { /* D-36 sanitized */ });
    return NextResponse.json({ error: 'ai_service_unavailable', retryAfter: 30 }, { status: 503, headers: { 'Retry-After': '30' } });
  }
}
```

### TipTap server-side extraction (D-07 + D-31)

```typescript
// lib/ai/qa-extract.ts
// Source: @tiptap/html source [VERIFIED] + D-31 prompt-injection mitigation
import 'server-only';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/core';

const STRIP_TAGS = /<[^>]+>/g;
const COLLAPSE_WHITESPACE = /\s+/g;
const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&apos;');

export function policyToPromptText(policy: { contentJson: unknown }): string {
  const html = generateHTML(policy.contentJson as JSONContent, [StarterKit, Link]);
  const stripped = html.replace(STRIP_TAGS, ' ').replace(COLLAPSE_WHITESPACE, ' ').trim();
  return xmlEscape(stripped);
}
```

### `extractText` helper (D-38)

```typescript
// lib/ai/extract.ts
// Source: Anthropic SDK Message.content + TextBlock types [VERIFIED]
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

export function extractText(response: Anthropic.Messages.Message): string {
  const block = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
  );
  if (!block) throw new Error('Anthropic response contained no text block');
  return block.text;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `messages.batches.*` at beta namespace | `messages.batches.*` at stable namespace | 2024-10-08 SDK 0.29.0 (when Batches launched) | D-39 probe is no-op |
| 5-minute prompt cache only | 5-min + 1-hour TTL | 2025-08-13 SDK 0.60.0 — 1h GA | D-33 LONG_CACHE is supported |
| `tokens_used` single column for billing | 4-column split (input/output/cache_read/cache_creation) | 2026-05-21 — D-35 Phase 4 ship | Phase 8 analytics enabled |
| Anthropic-side auto-retry on 5xx | `maxRetries: 0` per SPEC R7 | 2026-05-21 SDK 0.97.1 (default still 2) | D-33 client opts override |
| `messages.create` system as string | `system: [{ type: 'text', text, cache_control }]` (array form) | Phase 4 ships — was supported pre-0.29.0 but Phase 1-3 didn't use it | D-03 `buildCachedSystem` |

**Deprecated/outdated:**
- **Claude Sonnet 4** (pre-4.5 line): deprecated per SDK 0.89.0 changelog (2026-04-14). D-04 uses 4.6 — unaffected.
- **`tokens_used` integer column**: dropped in Phase 4 D-35.
- **D-39 probe step**: pre-determined outcome (stable namespace); plan-phase still ships the probe for the audit record but the result is known.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Polling does NOT need to handle `processing_status === 'canceling'` distinctly from `'in_progress'` | Batch API Mechanics | If Anthropic ever exposes 'canceling' for non-user-cancel reasons (e.g., admin cancel), the polling endpoint would not surface the cancel state to the admin UI. Current SPEC R5 doesn't anticipate this case anyway. Mitigation: translator returns `'in_progress'` for both. |
| A2 | `request_counts.errored > 0` is sufficient to mark batch as `'failed'` | Batch API Mechanics | If a batch has 9 succeeded + 1 errored, it's still partially valuable; current logic treats as `'failed'` and ignores the 9 succeeded. For Phase 4 (single-request batch), this is moot — N=1 means success or fail. |
| A3 | Q&A endpoint's `LONG_CACHE` is cheaper than `EPHEMERAL_CACHE` at SPEC R4 60-80% hit rate | Prompt-Cache Mechanics | At 60-80% hit rate, 1h cache is actually MORE expensive than 5min cache (breakeven at >21 reads per write). However, batch resilience + bursty-traffic patterns may still justify LONG_CACHE. D-33 already locked LONG_CACHE; this is documented as an open trade-off, not a code change. |
| A4 | The `tokens_used` column can be dropped without backfill | Drizzle Combined-Migration Pattern | If Phase 4 ships after any paying customer has generated AI content, the column drop loses that history. STATE.md confirms pre-paying-customer status. Plan-phase confirms with operator at task time. |
| A5 | `pnpm view @anthropic-ai/sdk version` returns the latest stable, not a deprecated/alpha tag | SDK Namespace Verification | Verified by also reading `dist-tags: { alpha: "0.34.0-alpha.0", latest: "0.97.1" }` from `pnpm view --json`. |
| A6 | Phase 4's Drizzle migration files start at 0005 (not 0004 as CONTEXT.md `<code_context>` line 237 says) | Drizzle Combined-Migration Pattern | Verified via `cat drizzle/meta/_journal.json` — Phase 3 already shipped `0004_policy_versions_unique`. CONTEXT.md needs a minor numbering correction at plan-phase time (or in the planner's filename derivation logic). |

**If A1-A6 are all incorrect, the system still functions — these are documentation/cost issues, not data-integrity issues.** All security and tenancy contracts (RLS, withOrgScope, validIds wiring) are verified independent of these assumptions.

## Open Questions

> **Goal of D-44 READY gate (CONTEXT.md):** zero unresolved questions before plan-phase. This research surfaces ONE new question and TWO documentation corrections that don't block planning but should be acknowledged.

1. **NEW** — **Batch API status enum drift (SPEC R5 vs SDK)**
   - What we know: SDK returns `'in_progress' | 'canceling' | 'ended'`. SPEC R5 + API-SPEC.md + D-21 + D-30 all assume `'in_progress' | 'completed' | 'failed'`.
   - What's unclear: Should the SPEC enum stay as locked (translator handles the bridge inside the route handler), OR should the SPEC + API-SPEC.md be amended to use the SDK enum directly (changes the public API contract)?
   - Recommendation: Keep SPEC enum as-locked. Add the translator at the route-handler boundary. The persisted `batch_jobs.status` column uses the SPEC enum. NEVER expose raw `processing_status` to the client. This is the cleaner choice: external API contract stays simple (3 states), internal abstraction handles the 4-state translation. Plan-phase ships this without operator approval needed (no spec change required).

2. **NEW** — **Phase 4 migration file numbering (0005/6/7 vs CONTEXT.md's 0004/5/6)**
   - What we know: `drizzle/meta/_journal.json` shows Phase 3 already shipped `0004_policy_versions_unique` (idx=4). CONTEXT.md `<code_context>` line 237 says Phase 4 ships `0004_initial_batch_jobs.sql` + `0005_rls_batch_jobs.sql`. The amendments at `<amendments>` D-32+D-35 refer to `drizzle/0006_ai_generations_audit_extensions.sql`.
   - What's unclear: Whether to renumber (0005/6/7) or to leave CONTEXT.md as-is (would create duplicate journal idx=4).
   - Recommendation: Plan-phase renumbers to 0005 (batch_jobs initial), 0006 (batch_jobs RLS), 0007 (ai_generations audit extensions). This is a documentation drift, not a decision.

3. **NEW** — **LONG_CACHE cost trade-off at observed Q&A hit rates**
   - What we know: 1h cache write = 2× input; 5min write = 1.25× input; read = 0.1× input. Breakeven (1h cheaper than 5min) requires >21 reads per write. SPEC R4 target = 60-80% hit rate ≈ 3-4 reads per write.
   - What's unclear: Whether to keep LONG_CACHE (resilience-first) or switch to EPHEMERAL_CACHE (cost-first) for Q&A.
   - Recommendation: Keep LONG_CACHE per D-33. The SDK docs explicitly recommend 1h cache for batches that take >5min, and Q&A has bursty patterns that don't sustain 5min cache hits. Document the trade-off in Phase 8 SUMMARY when Phase 4 ships. Not a code blocker.

## Environment Availability

Phase 4 binds against external services (Anthropic API) and a live TEST DB. All required infrastructure exists.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All endpoints | ✓ | 22.x (per engines) | — |
| pnpm | Install + scripts | ✓ | 9.15.9 | — |
| TypeScript | All code | ✓ | ^5 | — |
| Next.js 15 | Route handlers | ✓ | 15.5.18 | — |
| Drizzle ORM | DB | ✓ | ^0.45.2 | — |
| Drizzle Kit | Migrations | ✓ | ^0.31.10 | — |
| Postgres (Supabase) | Live DB | ✓ (configured) | n/a (managed) | — |
| Anthropic API key | All Claude calls | needs setup | n/a | None — endpoints return 503 on missing key (D-02 lazy init defers env read to first call, so app boots without key but rejects every AI call) |
| `ANTHROPIC_API_KEY` env var | `lib/ai/client.ts` | needs setup | — | None — Plan-phase Task 1 adds `ANTHROPIC_API_KEY=` to `.env.local.example` + operator populates `.env.local` |
| Vitest | All tests | ✓ | ^1.6.0 | — |
| ts-morph | check-* gates | ✓ | 28.0.0 | — |
| Clerk SDK | Auth | ✓ | ^7.3.4 | — |

**Missing dependencies with no fallback:** Anthropic API key — operator must populate `.env.local` and `.env.local.test` before `pnpm verify:phase-4` can run integration tests. Plan-phase Task 1 includes a `checkpoint:human-verify` for this.

**Missing dependencies with fallback:** none.

## Sources

### Primary (HIGH confidence)
- **Anthropic SDK source** `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/batches.ts` — MessageBatch interface, processing_status enum, Batches class
- **Anthropic SDK source** `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts` — Usage interface, TextBlock type
- **Anthropic SDK source** `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/client.ts` — ClientOptions interface, defaults
- **Anthropic SDK CHANGELOG** `https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/CHANGELOG.md` — versions 0.85.0..0.97.1 + historical Batches/cache features
- **Anthropic docs (prompt caching)** `https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching` — TTL syntax, token minimums, pricing multipliers
- **Anthropic docs (batch processing)** `https://platform.claude.com/docs/en/docs/build-with-claude/batch-processing` — polling examples, request_counts schema
- **Anthropic API ref (create-message-batches)** `https://platform.claude.com/docs/en/api/creating-message-batches` — request shape
- **Installed package source** `node_modules/.pnpm/@tiptap+html@2.27.2_.../src/generateHTML.ts` + `getHTMLFromFragment.ts` + `package.json` — server-side rendering confirmed via zeed-dom
- **npm registry** `pnpm view @anthropic-ai/sdk version` → 0.97.1; `pnpm view ... scripts.postinstall` → empty; `pnpm view ... repository.url` → official Anthropic GitHub
- **Local files** — `.planning/phases/04-ai-layer/04-{SPEC,CONTEXT,AUDIT-INTEGRATION}.md`, `package.json`, `reference/{API-SPEC,PROMPTS,SCHEMA,TIER-LIMITS}.md`, `lib/{db/{schema,repositories/*},auth/*,policies/*}.ts`, `drizzle/0004_policy_versions_unique.sql`, `drizzle/meta/_journal.json`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`
- **slopcheck CLI** — package legitimacy verification on 2026-05-21 (both packages [OK])

### Secondary (MEDIUM confidence)
- **TipTap docs** `https://tiptap.dev/docs/editor/api/utilities/html` — server-side rendering guarantee
- **WebSearch result** — zeed-dom dependency relationship (cross-verified with installed package.json)

### Tertiary (LOW confidence)
- None. All claims verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package verified against npm + installed source
- Architecture: HIGH — every pattern traced to working Phase 1-3 precedent
- Pitfalls: HIGH — SDK enum drift verified directly against SDK source
- Test architecture: HIGH — vitest installed, ts-morph installed, integration-test precedent exists

**Research date:** 2026-05-21
**Valid until:** 2026-06-20 (30 days; Anthropic SDK is on a fast cadence — 8-10 publishes per month, but no breaking changes affecting D-NN sketches observed since 2025-08-13)

## RESEARCH COMPLETE

Phase 4 cleared for `/gsd-plan-phase 4` with the following plan-phase obligations folded into research:
- (1) Batch status enum translator MUST ship in `/api/ai/consistency/[batchId]/route.ts` — bridges SDK `'in_progress'|'canceling'|'ended'` + `request_counts` → SPEC `'in_progress'|'completed'|'failed'`.
- (2) Migration files renumber to `0005_initial_batch_jobs`, `0006_rls_batch_jobs`, `0007_ai_generations_audit_extensions` (correcting CONTEXT.md drift against the live Drizzle journal).
- (3) Cache-cost trade-off (LONG_CACHE more expensive than EPHEMERAL_CACHE at SPEC R4 hit rates) documented for Phase 8 SUMMARY; D-33 LONG_CACHE stays locked.
