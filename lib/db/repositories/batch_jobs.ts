// lib/db/repositories/batch_jobs.ts
// Phase 4 (AI Layer) D-06 + D-30 + D-34: per-aggregate BatchJobs repository.
//
// Tracks Anthropic batch state for Consistency Check (Plan 04-10 submit + poll
// + Plan 04-14 dashboard/consistency page surfaces). Persisted `status` is the
// SPEC enum ('in_progress' | 'completed' | 'failed'), NOT the raw SDK enum —
// translateProcessingStatus inside /api/ai/consistency/[batchId]/route.ts
// (Plan 04-10) does SDK→SPEC enum conversion BEFORE any insert/update lands.
//
// Two-table split rationale (D-06):
//   - batch_jobs tracks in-progress + final batch state per Anthropic batch ID
//   - ai_generations stays SUCCESS-ONLY (one row written ON COMPLETION per the
//     CLAUDE.md ALWAYS rule #5 + SPEC R5). Failed/in-progress batches write
//     nothing to ai_generations.
//
// L-05 / ADR-018 spirit: this repository is append + update-by-id only.
// updateStatus is the sole mutation path. No delete method — Phase 7+ admin
// debugging would query batch_jobs by org for the audit trail.
//
// RESEARCH Pitfall 6: NO raw `db` import. OrgScope-first per ADR-023.
// See policies.ts header for the full rationale.
//
// RLS shipped via drizzle/0006_rls_batch_jobs.sql (Plan 04-02 migration; D-29
// 4-statement block: ENABLE RLS + org_isolation policy + GRANT ALL to
// authenticated + NOT NULL org_id from .notNull() in schema). The per-tx JWT
// injection in withOrgScope causes RLS to evaluate against the actual ctx.orgId
// — so application-layer eq(orgId, s.orgId) AND database-layer RLS both fire.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { batchJobs } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';

/**
 * BatchJobs.insert input shape. orgId / id / createdAt / updatedAt are
 * repository-managed (orgId from OrgScope; the other three are DB-generated
 * defaults via .defaultRandom() / .defaultNow()).
 *
 * The schema declares `anthropicBatchId: text(...).notNull().unique()` — the
 * uniqueness is cross-org because Anthropic batch IDs come from a global
 * Anthropic namespace (one batch ID never collides between orgs).
 */
type BatchJobCreateInput = Omit<
  typeof batchJobs.$inferInsert,
  'orgId' | 'id' | 'createdAt' | 'updatedAt'
>;

/**
 * Persisted status enum — SPEC R5 contract for the /dashboard/consistency
 * Server Component shell (D-30) to choose which sub-tree to render. The
 * polling endpoint (Plan 04-10) translates the Anthropic SDK
 * `processing_status` enum ('in_progress' | 'canceling' | 'ended') +
 * `request_counts.succeeded > 0` into one of these three values BEFORE
 * calling updateStatus.
 */
type BatchJobStatus = 'in_progress' | 'completed' | 'failed';

export const BatchJobs = {
  /**
   * Phase 4 D-06 — listAll for admin debugging / Phase 8 analytics.
   * Matches the listAll pattern from policy_versions.ts.
   */
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(batchJobs)
      .where(eq(batchJobs.orgId, s.orgId)),

  /**
   * Phase 4 D-06 — insert at Consistency-submit time (Plan 04-10 submit endpoint).
   *
   * orgId comes from OrgScope (NEVER from input — defense against cross-org writes).
   * id + createdAt + updatedAt are DB-generated defaults.
   *
   * `status` defaults to 'in_progress' at the schema level; caller MAY override
   * if it ever needs to insert a row in a terminal state (not a Phase 4 use case).
   * `type` defaults to 'consistency' at the schema level — Phase 4 only ships
   * that batch type; future batch surfaces extend the union and pass explicitly.
   *
   * `anthropicBatchId` MUST be the response of `client.messages.batches.create(...)`
   * — globally unique per Anthropic's namespace (the schema's .unique() constraint
   * is enforced cross-org since the namespace doesn't collide between orgs).
   */
  insert: (s: OrgScope, input: BatchJobCreateInput) =>
    s.tx
      .insert(batchJobs)
      .values({
        ...input,
        orgId: s.orgId,
      })
      .returning(),

  /**
   * Phase 4 D-06 + D-34 — lookup by Anthropic batch ID (polling endpoint
   * stale-window check).
   *
   * Returns at most one row (or undefined when missing). Polling endpoint
   * pseudocode (Plan 04-10):
   *
   *   const job = await BatchJobs.findByAnthropicBatchId(s, batchId);
   *   if (!job) return new Response(null, { status: 404 });
   *   const isStale = (Date.now() - job.updatedAt.getTime()) > 25_000;
   *   if (job.status === 'completed' || !isStale) {
   *     return NextResponse.json({ status: job.status, result: job.resultJson });
   *   }
   *   // stale + in_progress: hit Anthropic, translate SDK→SPEC enum, updateStatus
   *
   * The 25-second stale-window (D-34) collapses worst-case 200 retrieves/min
   * to 1 retrieve per 25s per batch — comfortably under Anthropic Tier-1 Batches
   * API's 50RPM shared cap at MVP scale.
   */
  findByAnthropicBatchId: async (s: OrgScope, anthropicBatchId: string) => {
    const rows = await s.tx
      .select()
      .from(batchJobs)
      .where(
        and(
          eq(batchJobs.orgId, s.orgId),
          eq(batchJobs.anthropicBatchId, anthropicBatchId),
        ),
      )
      .limit(1);
    return rows[0];
  },

  /**
   * Phase 4 D-30 — most-recent batch for the org (dashboard/consistency page
   * mount-time resume per Plan 04-14).
   *
   * Returns the latest batch_jobs row for the org by created_at DESC. Used by
   * app/(admin)/dashboard/consistency/page.tsx Server Component shell to
   * choose which sub-tree to render:
   *   - No row → <ConsistencyEmptyState />
   *   - status='completed' → <ConsistencyFindingsList result={resultJson} />
   *   - status='failed' → <ConsistencyFailureState />
   *   - status='in_progress' → <ConsistencyCheckRunner batchId=... /> (resume)
   *
   * Filters by type='consistency' since Phase 4 only ships that batch type
   * (future surfaces extending into other types would scope by type explicitly
   * here; the filter is explicit rather than relying on the schema default to
   * keep this query future-proof against multi-type batches).
   *
   * Visible status copy on resume: "Resuming check started Xm ago" (D-30 +
   * D-21 indicator format preserved).
   */
  findLatestForOrg: async (s: OrgScope) => {
    const rows = await s.tx
      .select()
      .from(batchJobs)
      .where(
        and(
          eq(batchJobs.orgId, s.orgId),
          eq(batchJobs.type, 'consistency'),
        ),
      )
      .orderBy(desc(batchJobs.createdAt))
      .limit(1);
    return rows[0];
  },

  /**
   * Phase 4 D-34 — update status + updatedAt + optional resultJson (polling
   * endpoint post-Anthropic-retrieve write).
   *
   * Called when the SDK→SPEC translator (Plan 04-10) maps a
   * `processing_status === 'ended'` Anthropic batch into either
   *   - SPEC 'completed' (request_counts.succeeded > 0, no error counts)
   *   - SPEC 'failed' (any error counts; or 'canceled' / 'expired' tail states)
   *
   * The updatedAt timestamp bump (via `now()` SQL) is load-bearing for the
   * D-34 25-second stale-window check on subsequent polls — avoids hammering
   * Anthropic's 50RPM Tier-1 cap by ensuring `findByAnthropicBatchId` sees a
   * fresh timestamp after each translator call.
   *
   * WHERE includes BOTH orgId AND anthropicBatchId — even though
   * anthropicBatchId is globally unique, scoping by orgId is defense-in-depth
   * (matches the pattern of every other repository update).
   *
   * resultJson is conditionally spread so callers that only need to bump
   * status (e.g., terminal 'failed' state without an Anthropic result payload)
   * don't have to pass undefined explicitly.
   */
  updateStatus: (
    s: OrgScope,
    anthropicBatchId: string,
    patch: { status: BatchJobStatus; resultJson?: unknown },
  ) =>
    s.tx
      .update(batchJobs)
      .set({
        status: patch.status,
        updatedAt: sql`now()`,
        ...(patch.resultJson !== undefined ? { resultJson: patch.resultJson } : {}),
      })
      .where(
        and(
          eq(batchJobs.orgId, s.orgId),
          eq(batchJobs.anthropicBatchId, anthropicBatchId),
        ),
      )
      .returning(),
};
