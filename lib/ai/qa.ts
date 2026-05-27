// lib/ai/qa.ts — Plan 05-04 Task 2 (D-25 / T-3=A).
// Extracts inline Q&A logic from app/api/ai/qa/route.ts into a pure
// orchestrator. Server Action (Plan 05-05 askQuestionAction) and the
// legacy HTTP route handler both wrap this.
//
// Phase 4 invariants preserved verbatim from the route file:
//   - D-41 — validIds Set MUST be constructed inside the SAME withOrgScope
//     closure that built libraryXml (cross-org-citation-leak SP-1 defense).
//     Any deviation here (hoisting validIds outside, caching per-org) is an
//     OWASP API1 BOLA bug waiting to happen.
//   - D-33c — system-array ordering: LONG_CACHE block FIRST (per-org policy
//     library, 1h TTL), EPHEMERAL block SECOND (static QA_SYSTEM_PROMPT_TEMPLATE,
//     5min TTL). Anthropic returns HTTP 400 on the inverse order.
//   - D-36 — PII-safe log-shape stays in the HTTP route (lives in the
//     route's catch branch; this orchestrator does not catch).
//   - D-40 — cache cold-miss observability when both cache_creation +
//     cache_read are 0.
//   - WARNING-4 — ai_generations.result stores RAW Claude output (citation
//     fence + hallucinated-ID record), NOT parsed answer; Phase 8 telemetry
//     depends on the raw form.
//
// Phase 5 additions (orthogonal to Phase 4 invariants):
//   - D-26 — grant-UPSERT loop iterates over PARSED.CITATIONS (post-validIds-
//     filter per RESEARCH gap-3), NOT raw fence JSON. The validIds Set
//     already excluded hallucinated IDs at lib/ai/qa-parser.ts
//     (`.filter(c => validIds.has(c.id))`). Iterating raw fence would
//     pollute qa_citation_grants with hallucinated-UUID rows that would
//     RLS-404 at the page handler but accumulate as garbage.
//   - D-27a — citation accessibility flag for UI hint only. The real
//     security boundary is enforced server-side at /my-policies/[id]
//     (Plan 05-05). The flag tells the UI which citations link to a full
//     PolicyView (assigned) vs a TL;DR-only fallback view (granted-only).
//     Built via a single org-scoped query of the user's assigned-and-
//     published policy IDs to avoid a per-citation hasAssignment round-trip;
//     at MVP scale (< 100 assignments per user) this is one query for the
//     whole answer.
//
// Cross-org isolation locked at THREE points (all inside the same
// withOrgScope closure for atomicity):
//   1. validIds same-closure (D-41) — strips hallucinated foreign-org IDs
//      before parseQaResponse returns the citations list.
//   2. Grant UPSERT iterates the post-validIds-filter list (RESEARCH gap-3).
//   3. assignedIds query is RLS-scoped (ADR-019/025) — even if a foreign-org
//      UUID slipped through somehow, the assignedIds check would not return
//      'full' accessibility for it.
//
// SCOPE (intentional non-features per Plan 05-04):
//   - NO outer try/catch around the Anthropic call — both the HTTP route
//     and the Server Action map errors to their respective response shapes.
//   - NO Next.js navigation/cache side-effects.
//   - NO Zod request-body validation — caller validates `question` shape
//     before calling.
import 'server-only';
import type { OrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { buildCachedSystem, buildLongCachedSystem } from '@/lib/ai/cache';
import { QA_SYSTEM_PROMPT_TEMPLATE } from '@/lib/ai/prompts';
import { policyToPromptText, xmlEscape } from '@/lib/ai/qa-extract';
import { extractText } from '@/lib/ai/extract';
import { parseQaResponse } from '@/lib/ai/qa-parser';
import { Policies } from '@/lib/db/repositories/policies';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { QaCitationGrants } from '@/lib/db/repositories/qa_citation_grants';

/**
 * Plan 05-04 Task 2 — extracted askQuestion orchestrator (D-25 / T-3=A).
 *
 * Pure orchestrator: same input → same output (modulo Anthropic's
 * stochasticity). Side effect = one row in ai_generations + zero-or-more
 * rows in qa_citation_grants.
 *
 * @param ctx - org-scoped Clerk auth context (Server Action / HTTP route
 *   resolves via getOrgContext at the trust boundary)
 * @param question - already-validated question string (caller enforces
 *   shape via QaSchema at the trust boundary per Phase 4 D-42)
 * @returns `{ answer, citations }` — citations carry the D-27a `accessibility`
 *   flag (`'full'` if the requesting user is policy-assigned, `'tldr-only'`
 *   otherwise — UI hint only; security boundary is at /my-policies/[id]).
 */
export async function askQuestion(
  ctx: OrgContext,
  question: string,
): Promise<{
  answer: string;
  citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[];
}> {
  return await withOrgScope(ctx, async (s) => {
    // D-41 — validIds + libraryXml MUST be constructed inside the SAME
    // withOrgScope closure. Any deviation here (e.g., hoisting validIds
    // outside, caching per-org) is an OWASP API1 BOLA bug waiting to
    // happen. parseQaResponse uses validIds to strip any citation ID
    // Claude hallucinates outside the org's published-policy set — closing
    // SP-1 cross-org citation leak at the only barrier between model
    // output and the client.
    const orgPolicies = await Policies.listPublishedForOrg(s);
    const validIds = new Set(orgPolicies.map((p) => p.id)); // ← D-41 SAME closure

    const libraryXml = orgPolicies
      .map(
        (p) =>
          `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`,
      )
      .join('\n');

    // D-33c ordering — LONG_CACHE first (per-org library, 1h TTL),
    // EPHEMERAL second (static QA_SYSTEM_PROMPT_TEMPLATE, 5min TTL).
    // Anthropic returns HTTP 400 on the inverse order.
    const response = await getAnthropicClient().messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: [
        ...buildLongCachedSystem(libraryXml), // 1h TTL (per-org)
        ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE), // 5min TTL (static)
      ],
      messages: [{ role: 'user', content: question }],
    });

    // D-40 cold-miss observability. Library below 1024 Sonnet tokens
    // silently bypasses cache. Operator can monitor warn frequency in
    // production logs; Phase 8 cost analytics builds on the cache-token
    // columns (D-35).
    const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = response.usage.cache_read_input_tokens ?? 0;
    const inputTokens = response.usage.input_tokens ?? 0;
    if (cacheCreation === 0 && cacheRead === 0) {
      console.warn('[ai/qa] cache miss likely', {
        orgId: ctx.orgId,
        inputTokens,
        likelyCause:
          inputTokens < 1024 ? 'below_1024_token_minimum_sonnet' : 'unknown',
      });
    }

    const rawText = extractText(response);

    // ai_generations.result stores raw Claude output (including citation
    // fence) for audit replay. Parsed { answer, citations } is returned to
    // the client. Intentional asymmetry with Draft/Summary which store
    // extracted text — Q&A's audit need is stronger than shape symmetry.
    //
    // WARNING-4 lock — DO NOT change this to parsed `answer` without an
    // explicit decision update in CONTEXT.md + a new ADR (audit-replay
    // invariant would break + Phase 8 telemetry queries would lose the
    // citation fence and hallucinated-ID record).
    await AiGenerations.insert(s, {
      policyId: null,
      type: 'qa',
      prompt: question,
      result: rawText, // ← WARNING-4 — raw, NOT parsed
      inputTokens: response.usage.input_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? null,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
      cacheCreationInputTokens:
        response.usage.cache_creation_input_tokens ?? null,
      idempotencyKey: null,
      model: MODEL_SONNET,
    });

    // D-41 — strip hallucinated IDs via the validIds Set built in this
    // same closure. parsed.citations is the post-filter array; iteration
    // below MUST use this (NOT the raw fence) per RESEARCH gap-3.
    const parsed = parseQaResponse(rawText, validIds);

    // D-26 (T-2(4c)) — for each cited policy, ensure a qa_citation_grants
    // row exists. CRITICAL per RESEARCH gap-3: iterate parsed.citations
    // (validIds-filtered), NOT the raw Anthropic fence. A hallucinated
    // foreign-org policy UUID was already stripped by qa-parser.ts
    // (`.filter(c => validIds.has(c.id))`). QaCitationGrants.upsert is
    // idempotent via UNIQUE(org_id, user_id, policy_id) on migration 0011 —
    // duplicate citations across questions don't create duplicate rows.
    for (const cit of parsed.citations) {
      await QaCitationGrants.upsert(s, { userId: s.userId, policyId: cit.id });
    }

    // D-27a — annotate accessibility flag for UI hint. Security boundary
    // is at the /my-policies/[id] page handler (Plan 05-05), NOT this
    // annotation. Use a single cheap query of assigned-and-published
    // policy IDs to avoid a per-citation hasAssignment round-trip; for
    // MVP scale (< 100 assignments) this is one query for the whole answer.
    const assignedRows = await Policies.listAssignedAndPublishedForUser(
      s,
      s.userId,
    );
    const assignedIds = new Set(assignedRows.map((r) => r.id));
    const annotated = parsed.citations.map((cit) => ({
      title: cit.title,
      id: cit.id,
      accessibility: (assignedIds.has(cit.id) ? 'full' : 'tldr-only') as
        | 'full'
        | 'tldr-only',
    }));

    return { answer: parsed.answer, citations: annotated };
  });
}
