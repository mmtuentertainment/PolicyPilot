// lib/ai/qa-extract.test.ts — Plan 04-03 Wave-0 RED stub.
// D-07 + D-31: generateHTML + tag strip + xmlEscape pipeline (prompt-injection defense layer 2).
// SUT module `lib/ai/qa-extract.ts` does NOT exist yet — Plan 04-05 creates it.
import { describe, expect, it } from 'vitest';

describe('lib/ai/qa-extract — policyToPromptText (D-07 + D-31)', () => {
  it('renders ProseMirror JSON to HTML, strips tags, XML-escapes (D-07 + D-31)', async () => {
    expect.fail('TODO: Plan 04-05 — generateHTML + strip + xmlEscape pipeline');
  });

  it('XML-escapes adversarial content (D-31 — defense layer 2; prompt meta-instruction is layer 1)', async () => {
    // Policy contentJson contains a <script>-injection-like text plus the literal "&" + "<".
    // policyToPromptText output must NOT contain raw `<` or `&` (only `&lt;` / `&amp;`).
    expect.fail('TODO: Plan 04-05 — xmlEscape converts <, >, &, single-quote, double-quote');
  });

  it('collapses whitespace between stripped tags (RESEARCH Pitfall 3 — word-boundary preservation)', async () => {
    expect.fail('TODO: Plan 04-05 — replace tag with single space, then collapse multi-whitespace');
  });
});
