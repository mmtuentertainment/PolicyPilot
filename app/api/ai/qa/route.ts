import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgContext } from '@/lib/auth/context';
import { QaSchema } from '@/lib/ai/schemas';
import { askQuestion } from '@/lib/ai/qa';

// Thin HTTP wrapper; Q&A business invariants live in lib/ai/qa.ts.
export async function POST(req: Request): Promise<Response> {
  const ctx = await getOrgContext();
  try {
    const body = QaSchema.parse(await req.json());
    const result = await askQuestion(ctx, body.question);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'invalid_body', details: err.flatten() },
        { status: 400 },
      );
    }
    console.error('[ai/qa] anthropic failed', {
      orgId: ctx.orgId,
      error:
        err instanceof Anthropic.APIError
          ? { name: err.name, status: err.status, code: err.type }
          : err instanceof Error
            ? { name: err.name, message: err.message.slice(0, 120) }
            : err,
    });
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
