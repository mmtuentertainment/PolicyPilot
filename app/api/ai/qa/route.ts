import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgContext } from '@/lib/auth/context';
import { QaSchema } from '@/lib/ai/schemas';
import { askQuestion } from '@/lib/ai/qa';
// POST /api/ai/qa — Phase 4 SPEC R4 Q&A endpoint, refactored Plan 05-04
// Task 3 (D-25 / T-3=A) to thin HTTP wrapper. Business logic lives in
// lib/ai/qa.ts::askQuestion. Public HTTP contract UNCHANGED — citations
// carry an additive `accessibility` field per D-27a (Phase 4 consumers
// ignore unknown fields per JSON contract convention; see API-SPEC.md).
// Auth + Zod + askQuestion + error-mapping only; see lib/ai/qa.ts for
// D-41 / D-33c / WARNING-4 / D-40 / D-26 invariants.
export async function POST(req: Request): Promise<Response> {
  // D-37 — auth OUTSIDE try (preserved). Q&A allows any-authenticated;
  // no admin-only gate, no tier-limit gate (D-46 unlimited MVP).
  const ctx = await getOrgContext();
  try {
    // D-42 — Zod .strict() body parse (preserved verbatim from Phase 4).
    const body = QaSchema.parse(await req.json());
    // D-25 — delegate to extracted orchestrator (all Phase 4 invariants live there).
    const result = await askQuestion(ctx, body.question);
    return NextResponse.json(result);
  } catch (err) {
    // D-42 — ZodError → 400 (preserved verbatim).
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_body', details: err.flatten() },
        { status: 400 },
      );
    }
    // D-36 — PII-safe sanitized log (preserved verbatim).
    console.error('[ai/qa] anthropic failed', {
      orgId: ctx.orgId,
      error:
        err instanceof Anthropic.APIError
          ? // WR-01 (Phase 5 code-review): use APIError's typed `.type` field
            // directly instead of `.error?.type`. APIError declares
            // `type: ErrorType | null` (see @anthropic-ai/sdk/core/error.d.ts),
            // while `.error` is the generic TError default (Object | undefined)
            // and `.error?.type` propagates `any`. Same fix as transitions.ts:207.
            { name: err.name, status: err.status, code: err.type }
          : err instanceof Error
            ? { name: err.name, message: err.message.slice(0, 120) }
            : err,
    });
    // SPEC R7 — 503 envelope + Retry-After:30 (preserved verbatim).
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
