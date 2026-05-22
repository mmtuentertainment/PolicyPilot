import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { buildCachedSystem, buildLongCachedSystem } from '@/lib/ai/cache';
import { QA_SYSTEM_PROMPT_TEMPLATE } from '@/lib/ai/prompts';
import { extractText } from '@/lib/ai/extract';
import { QaSchema } from '@/lib/ai/schemas';
import { policyToPromptText, xmlEscape } from '@/lib/ai/qa-extract';
import { parseQaResponse } from '@/lib/ai/qa-parser';
import { Policies } from '@/lib/db/repositories/policies';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';

/**
 * Phase 4 SPEC R4 — Q&A endpoint (any authenticated user, Sonnet 4.6, prompt-cached).
 *
 * Notable contrasts vs Draft/Summary/Consistency:
 *   - No admin-only gate — any authenticated user (D-46 + SPEC R4 background).
 *   - No tier-limit gate — D-46 unlimited-cost MVP decision (Phase 8 watch trigger:
 *     $50/org/mo avg over 30-day window for Sonnet cost via /api/ai/qa).
 *   - D-41 — validIds Set constructed INSIDE the withOrgScope closure that built libraryXml.
 *     This is the cross-org-citation-leak defense (SP-1). Any ID Claude hallucinates
 *     outside the org's published-policy set is silently stripped by parseQaResponse.
 *   - D-33c — system-array ordering: LONG_CACHE block FIRST (per-org policy library, 1h TTL),
 *     EPHEMERAL block SECOND (static QA_SYSTEM_PROMPT_TEMPLATE, 5min TTL). Anthropic returns
 *     HTTP 400 on the inverse order.
 *   - D-40 — cache cold-miss observability. When both cache_creation_input_tokens === 0
 *     AND cache_read_input_tokens === 0, the library is below Sonnet's 1024-token cache
 *     minimum and silently bypasses cache. Log surfaces it for operator monitoring.
 *   - WARNING-4 lock — ai_generations.result stores raw Claude output (including citation
 *     fence) for audit replay. Parsed { answer, citations } is returned to client.
 *     Intentional asymmetry with Draft/Summary which store extracted text — Q&A's audit
 *     need is stronger than shape symmetry (the fence + hallucinated-ID stream is the
 *     forensic evidence Phase 8 telemetry needs).
 */

export async function POST(req: Request): Promise<Response> {
  // D-37 — auth OUTSIDE try. Q&A allows any-authenticated; getOrgContext throws if no session.
  // No admin-only gate (D-46 + SPEC R4 background: any authenticated user).
  // No tier-limit gate (D-46: unlimited cost MVP accepted; Phase 8 watch trigger).
  const ctx = await getOrgContext();

  try {
    // D-42 — Zod .strict() body parse. Unknown keys → ZodError → 400 catch branch.
    const body = QaSchema.parse(await req.json());

    // D-41 — validIds + libraryXml MUST be constructed inside the SAME withOrgScope closure.
    // Any deviation here (e.g., hoisting validIds outside, caching per-org) is an OWASP API1
    // BOLA bug waiting to happen. parseQaResponse uses validIds to strip any citation ID
    // Claude hallucinates outside the org's published-policy set — closing SP-1 cross-org
    // citation leak at the only barrier between model output and the client.
    const result = await withOrgScope(ctx, async (s) => {
      const policies = await Policies.listPublishedForOrg(s);
      const validIds = new Set(policies.map((p) => p.id));     // ← D-41 SAME closure

      const libraryXml = policies
        .map((p) =>
          `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`,
        )
        .join('\n');

      // D-33c ordering — LONG_CACHE first (per-org library, 1h TTL), EPHEMERAL second
      // (static QA_SYSTEM_PROMPT_TEMPLATE, 5min TTL). Anthropic returns HTTP 400 on inverse.
      const response = await getAnthropicClient().messages.create({
        model: MODEL_SONNET,
        max_tokens: 1024,
        system: [
          ...buildLongCachedSystem(libraryXml),                  // 1h TTL (per-org)
          ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),       // 5min TTL (static)
        ],
        messages: [{ role: 'user', content: body.question }],
      });

      // D-40 cold-miss observability. Library below 1024 Sonnet tokens silently bypasses cache.
      // Operator can monitor warn frequency in production logs; Phase 8 cost analytics builds
      // on the cache-token columns (D-35).
      const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
      const cacheRead = response.usage.cache_read_input_tokens ?? 0;
      const inputTokens = response.usage.input_tokens ?? 0;
      if (cacheCreation === 0 && cacheRead === 0) {
        console.warn('[ai/qa] cache miss likely', {
          orgId: ctx.orgId,
          inputTokens,
          likelyCause: inputTokens < 1024 ? 'below_1024_token_minimum_sonnet' : 'unknown',
        });
      }

      const rawText = extractText(response);

      // ai_generations.result stores raw Claude output (including citation fence) for audit replay.
      // Parsed { answer, citations } is returned to client. Intentional asymmetry with Draft/Summary
      // which store extracted text — Q&A's audit need is stronger than shape symmetry.
      // WARNING-4 lock — DO NOT change this to parsed `answer` without an explicit decision update
      // in CONTEXT.md + a new ADR (audit-replay invariant would break + Phase 8 telemetry queries
      // would lose the citation fence and hallucinated-ID record).
      await AiGenerations.insert(s, {
        policyId: null,
        type: 'qa',
        prompt: body.question,
        result: rawText,                                            // ← WARNING-4 — raw, NOT parsed
        inputTokens: response.usage.input_tokens ?? null,
        outputTokens: response.usage.output_tokens ?? null,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
        idempotencyKey: null,
        model: MODEL_SONNET,
      });

      // D-41 — strip hallucinated IDs via the validIds Set built in this same closure.
      // (Returned to client; NOT persisted — see WARNING-4 lock above.)
      return parseQaResponse(rawText, validIds);
    });

    return NextResponse.json(result);
  } catch (err) {
    // D-42 — ZodError → 400 (validation failure distinct from AI service failure).
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_body', details: err.flatten() },
        { status: 400 },
      );
    }

    // D-36 — PII-safe sanitized log.
    // CRITICAL: err.message may contain employee question content via Anthropic.APIError
    // validation errors. Truncate to 120 chars OR use structured-field branch.
    console.error('[ai/qa] anthropic failed', {
      orgId: ctx.orgId,
      error:
        err instanceof Anthropic.APIError
          ? { name: err.name, status: err.status, code: err.error?.type }
          : err instanceof Error
            ? { name: err.name, message: err.message.slice(0, 120) }
            : err,
    });

    // SPEC R7 — 503 envelope + Retry-After:30 header.
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
