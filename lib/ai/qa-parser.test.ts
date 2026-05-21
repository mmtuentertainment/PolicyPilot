// lib/ai/qa-parser.test.ts — Plan 04-03 Wave-0 RED stub.
// D-10/D-11/D-41: citation fence parser + tolerant no-match + strip hallucinated IDs.
// SUT module `lib/ai/qa-parser.ts` does NOT exist yet — Plan 04-05 creates it.
import { describe, expect, it } from 'vitest';

describe('lib/ai/qa-parser — parseQaResponse (D-10 + D-11)', () => {
  it('parses fenced citation block + filters by validIds (D-41 — strips hallucinated IDs)', async () => {
    // Plan 04-05 creates lib/ai/qa-parser.ts with parseQaResponse(raw, validIds).
    expect.fail('TODO: Plan 04-05 — parses --- CITATIONS --- block, strips IDs not in validIds');
  });

  it('returns { answer: raw, citations: [] } when fence absent (D-11 tolerant no-match branch)', async () => {
    expect.fail('TODO: Plan 04-05 — no fence ⇒ empty citations, raw answer');
  });

  it('returns { answer: <body>, citations: [] } when JSON inside fence is malformed (D-11)', async () => {
    expect.fail('TODO: Plan 04-05 — malformed JSON ⇒ console.warn + empty citations + body-without-fence answer');
  });
});
