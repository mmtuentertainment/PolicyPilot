// lib/ai/schemas.test.ts — Plan 04-03 Wave-0 RED stub.
// AC-33 (D-42): Zod .strict() rejects extra keys + length-exceed.
// SUT module `lib/ai/schemas.ts` does NOT exist yet — Plan 04-04 creates it.
import { describe, expect, it } from 'vitest';

describe('lib/ai/schemas — Zod .strict() bodies (D-42)', () => {
  it('DraftSchema rejects extra keys (.strict() per AC-33)', async () => {
    // Plan 04-04 creates lib/ai/schemas.ts.
    expect.fail('TODO: Plan 04-04 — DraftSchema.parse({prompt:"x",extra:"evil"}) throws ZodError');
  });

  it('DraftSchema rejects prompt > 10_000 chars', async () => {
    expect.fail('TODO: Plan 04-04 — prompt.max(10_000)');
  });

  it('SummarySchema rejects non-uuid policyId', async () => {
    expect.fail('TODO: Plan 04-04 — z.string().uuid()');
  });

  it('QaSchema rejects question > 2_000 chars (AC-33 fixture)', async () => {
    expect.fail('TODO: Plan 04-04 — question.max(2_000); body { question: "x".repeat(2001) } ⇒ 400');
  });

  it('QaSchema rejects extra keys (.strict())', async () => {
    expect.fail('TODO: Plan 04-04 — { question: "valid", extraKey: "evil" } ⇒ ZodError');
  });
});
