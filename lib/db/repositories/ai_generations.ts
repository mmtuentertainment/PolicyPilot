// lib/db/repositories/ai_generations.ts
// L-03 + D-06: per-aggregate AiGenerations repository.
// Phase 4 (AI Layer): body filled per D-08 + D-32 + D-35.
//
// Every successful Claude API call writes ONE row here (SUCCESS-ONLY semantic
// per D-06 — failed Anthropic calls write nothing; CLAUDE.md ALWAYS rule #5;
// SPEC R5: row written ON COMPLETION). In-progress batch state is tracked
// separately in lib/db/repositories/batch_jobs.ts.
//
// RESEARCH Pitfall 6: NO raw `db` import. OrgScope-first per ADR-023.
// See policies.ts header for the full rationale.
//
// Phase 4 D-35: schema widened to 4 token-cost columns (input_tokens,
// output_tokens, cache_read_input_tokens, cache_creation_input_tokens) +
// D-32: idempotency_key column with partial-unique index on
// (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL.
// $inferInsert picks up all new columns automatically.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { aiGenerations } from '@/lib/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

/**
 * AiGenerations.insert input shape. orgId / id / createdAt are repository-
 * managed (orgId comes from OrgScope — NEVER from input — defense against
 * cross-org writes; id + createdAt are DB-generated defaults).
 *
 * Phase 4 D-35 token-cost columns + D-32 idempotency_key are all nullable
 * in the schema, so callers MAY omit them (e.g., mocked Anthropic responses
 * without usage data; non-idempotent endpoint calls). $inferInsert picks
 * them up via Omit composition.
 */
type AiGenerationCreateInput = Omit<
  typeof aiGenerations.$inferInsert,
  'orgId' | 'id' | 'createdAt'
>;

/**
 * Discriminant for aiGenerations.type. The four Phase 4 AI surfaces correspond
 * 1:1 to these values; future surfaces extend by adding to this union AND the
 * matching `text('type').notNull()` column doesn't constrain it at the DDL
 * level, so the application-layer union is the contract.
 */
type AiGenerationType = 'draft' | 'summary' | 'qa' | 'consistency';

export const AiGenerations = {
  /**
   * Phase 2 skeleton — kept for historical audits + admin debugging. Plan 04-07
   * does not modify this method.
   */
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(aiGenerations)
      .where(eq(aiGenerations.orgId, s.orgId)),

  /**
   * Phase 4 D-08 — insert one row per successful Anthropic call.
   *
   * orgId comes from OrgScope (NEVER from input — defense against cross-org writes).
   * id + createdAt are DB-generated defaults.
   *
   * The 4 nullable token-cost columns (inputTokens, outputTokens,
   * cacheReadInputTokens, cacheCreationInputTokens) per D-35 + the
   * idempotencyKey column per D-32 — endpoints populate from Anthropic
   * response.usage + optional request Idempotency-Key header.
   *
   * SUCCESS-ONLY semantic (D-06): callers MUST NOT call insert until the
   * Anthropic SDK call has resolved without throwing. For Consistency Check,
   * the row is written ON COMPLETION (polling endpoint) — batch_jobs tracks
   * in-progress state separately.
   */
  insert: (s: OrgScope, input: AiGenerationCreateInput) =>
    s.tx
      .insert(aiGenerations)
      .values({
        ...input,
        orgId: s.orgId,
      })
      .returning(),

  /**
   * Phase 4 D-08 + SPEC R6 — count rows by type in current calendar month UTC.
   *
   * Drives the `aiDraftsMonthly` limit check for Starter (50/mo) + Growth
   * (200/mo) tiers. Business is unlimited (sentinel -1 in TIER_LIMITS) so this
   * count is not consulted there.
   *
   * Month boundary: UTC start of current month (1st @ 00:00:00 UTC), inclusive
   * lower bound. The Date.UTC(year, month, 1, 0, 0, 0, 0) constructor yields a
   * Date pointing at the 1st of the current UTC month at midnight UTC,
   * regardless of the runtime's local timezone (Vercel = UTC; Windows dev =
   * America/New_York etc. — UTC normalization is load-bearing for SMB users
   * across timezones hitting the same monthly counter).
   */
  countByTypeInMonth: async (s: OrgScope, type: AiGenerationType): Promise<number> => {
    const now = new Date();
    const monthStartUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const rows = await s.tx
      .select({ c: sql<number>`cast(count(*) as int)` })
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.orgId, s.orgId),
          eq(aiGenerations.type, type),
          gte(aiGenerations.createdAt, monthStartUtc),
        ),
      );
    return rows[0]?.c ?? 0;
  },

  /**
   * Phase 4 D-08 — lookup the ai_generations row associated with an Anthropic
   * batch ID (Consistency Check polling endpoint cross-reference).
   *
   * Per D-06, the ai_generations row for a Consistency Check is written ON
   * COMPLETION of the batch — if the batch is still in-progress, this returns
   * nothing. Polling-endpoint callers read batch_jobs.findByAnthropicBatchId
   * first for current status (Plan 04-10); this method is the audit-ledger
   * cross-reference once the batch completes.
   *
   * Phase 4 schema does NOT add an explicit anthropic_batch_id column to
   * ai_generations (Plan 04-02 decided batch state lives on batch_jobs to
   * preserve ai_generations SUCCESS-ONLY semantic). Lookup is therefore via
   * a JSON/text scan of the result column — acceptable at MVP scale where
   * the Consistency Check is a per-org, low-frequency surface (one batch per
   * dashboard click). A future migration MAY add an explicit batch_id column
   * to ai_generations if Phase 8 cost-analytics needs faster lookup.
   */
  findByBatchId: (s: OrgScope, anthropicBatchId: string) =>
    s.tx
      .select()
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.orgId, s.orgId),
          eq(aiGenerations.type, 'consistency'),
          // Batch ID stored within the consistency result payload (D-06).
          // Drizzle parameterizes the LIKE pattern — no string concatenation.
          sql`${aiGenerations.result} LIKE ${'%' + anthropicBatchId + '%'}`,
        ),
      )
      .limit(1),

  /**
   * Phase 4 D-32 — Idempotency-Key dedup lookup for /api/ai/draft.
   *
   * Reads at most one row matching (orgId, idempotencyKey). The partial-unique
   * index `ai_generations_org_idempotency_key WHERE idempotency_key IS NOT
   * NULL` (Plan 04-02 migration 0007) guarantees at most one row per (org,
   * key) tuple.
   *
   * Returns undefined when no row matches (caller proceeds to Anthropic call
   * + insert with the new key). Returns the existing row when match (caller
   * returns cached draftContent without a new Anthropic call — per draft-
   * ietf-httpapi-idempotency-key-header-07 §2 replay semantics).
   *
   * Body-mismatch 422 enforcement (per draft-ietf-httpapi-idempotency-key-
   * header-07 §4) is deferred to v0.2 — MVP only dedups on key presence.
   */
  findByIdempotencyKey: async (s: OrgScope, idempotencyKey: string) => {
    const rows = await s.tx
      .select()
      .from(aiGenerations)
      .where(
        and(
          eq(aiGenerations.orgId, s.orgId),
          eq(aiGenerations.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return rows[0];
  },
};
