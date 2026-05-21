import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { SummarySchema } from '@/lib/ai/schemas';
import { Policies } from '@/lib/db/repositories/policies';
import { generateSummaryForPolicy } from '@/lib/ai/summary';
import { policyIdFromString } from '@/lib/policies/types';

/**
 * Phase 4 SPEC R3 — TL;DR summary endpoint (admin-only, Haiku 4.5).
 *
 * Idempotent (SPEC R3): if policies.tldrSummary is already set, returns cached value
 * WITHOUT an Anthropic call AND WITHOUT a new ai_generations row. The second click of
 * "Regenerate TL;DR" therefore returns the same summary and does NOT increment tier-count.
 *
 * Two flows:
 *   1. tldrSummary truthy → return { summary: existing } (200) directly.
 *   2. tldrSummary null → delegate to generateSummaryForPolicy(policyId, ctx) [Plan 04-08
 *      Task 1 helper], then re-fetch the policy to read the new tldrSummary, return { summary }.
 *
 * Pattern B (D-37): auth gates OUTSIDE try; Zod parse + repo reads + delegate INSIDE try;
 * 503 envelope (SPEC R7) on Anthropic failure with no ai_generations row written (D-06).
 *
 * Trust boundary (ADR-028): SummarySchema validates policyId as UUID; policyIdFromString
 * brands the string into PolicyId before passing into Policies.findById /
 * generateSummaryForPolicy. SummarySchema.parse alone produces a `string` typed value —
 * the branded type only arrives via policyIdFromString.
 */

export async function POST(req: Request): Promise<Response> {
  // D-37 — auth gates OUTSIDE try.
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  try {
    const body = SummarySchema.parse(await req.json());
    const policyId = policyIdFromString(body.policyId); // ADR-028 trust-boundary brand.

    // First: read cached summary if present. Skip Anthropic + ai_generations write entirely
    // when tldrSummary is non-null (SPEC R3 idempotence + tier-count preservation).
    const existingSummary = await withOrgScope(ctx, async (s) => {
      const rows = await Policies.findById(s, policyId);
      return rows[0]?.tldrSummary ?? null;
    });

    if (existingSummary) {
      return NextResponse.json({ summary: existingSummary }, { status: 200 });
    }

    // Otherwise: generate. generateSummaryForPolicy opens its OWN withOrgScope and writes
    // ai_generations + updates policies.tldrSummary inside that nested transaction (D-19).
    // It ALSO short-circuits on existing tldrSummary (defense-in-depth) but the cache check
    // above avoids the wasted withOrgScope-open on the happy-cached path.
    await generateSummaryForPolicy(policyId, ctx);

    // Re-read policy for the freshly-generated summary. Could pipe the value through
    // generateSummaryForPolicy's return, but keeping helper signature as Promise<void> means
    // publish() (Plan 04-11) doesn't have to handle a return value it doesn't need.
    const freshSummary = await withOrgScope(ctx, async (s) => {
      const rows = await Policies.findById(s, policyId);
      return rows[0]?.tldrSummary ?? null;
    });

    return NextResponse.json({ summary: freshSummary ?? '' }, { status: 200 });
  } catch (err) {
    // D-42 — ZodError → 400 (validation failure distinct from AI service failure).
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_body', details: err.flatten() },
        { status: 400 },
      );
    }

    // D-36 — PII-safe sanitized log.
    console.error('[ai/summary] anthropic failed', {
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
