// lib/ai/qa-extract.test.ts — Plan 04-05 Wave-1 GREEN.
// D-07 + D-31: generateHTML + tag strip + xmlEscape pipeline (prompt-injection defense layer 2).
import { describe, expect, it } from 'vitest';
import { policyToPromptText, xmlEscape } from '@/lib/ai/qa-extract';

describe('lib/ai/qa-extract — policyToPromptText (D-07 + D-31)', () => {
  it('renders ProseMirror JSON to HTML, strips tags, XML-escapes (D-07 + D-31)', () => {
    const policy = {
      contentJson: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Vacation policy: 10 days/year' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Apply via HR portal' }] },
        ],
      },
    };
    const out = policyToPromptText(policy);
    // No HTML tags survive.
    expect(out).not.toMatch(/<[^>]+>/);
    // Content preserved (whitespace-collapsed but words intact).
    expect(out).toContain('Vacation policy: 10 days/year');
    expect(out).toContain('Apply via HR portal');
  });

  it('XML-escapes adversarial content (D-31 — defense layer 2; prompt meta-instruction is layer 1)', () => {
    const policy = {
      contentJson: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Compare a & b, with "quoted" and \'apostrophe\' text.' },
            ],
          },
        ],
      },
    };
    const out = policyToPromptText(policy);
    // Defense-in-depth note: @tiptap/html generateHTML already HTML-escapes the source text
    // (`&` → `&amp;`, `"` → `&quot;`, `'` → `&apos;`) at render time. Our explicit xmlEscape
    // pass then DOUBLE-encodes those entities (`&amp;` → `&amp;amp;`, `&quot;` → `&amp;quot;`).
    // That's correct — the invariant we care about is "no raw special chars survive into the
    // prompt", and double-encoding satisfies it. If a future TipTap upgrade ever drops auto-
    // escaping, our xmlEscape becomes the sole defense layer; the invariant still holds.
    expect(out).toContain('&amp;amp;');   // & double-encoded (HTML pass + xmlEscape pass)
    expect(out).toContain('&amp;quot;');  // " double-encoded
    expect(out).toContain('&amp;apos;');  // ' double-encoded
    // Negative: NO raw `"`, `'` in the output (they would have escaped the <policy> tag boundary).
    expect(out).not.toMatch(/"/);
    expect(out).not.toMatch(/'/);
    // Negative: every `&` is followed by a known entity name (no raw ampersand).
    // Matches `&` NOT followed by amp;|lt;|gt;|quot;|apos; — should find zero matches.
    expect(out).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  it('collapses whitespace between stripped tags (RESEARCH Pitfall 3 — word-boundary preservation)', () => {
    const policy = {
      contentJson: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Purpose' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Scope' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Procedures' }] },
        ],
      },
    };
    const out = policyToPromptText(policy);
    // Words are separated, not run-together — the single-space strip + collapse preserves
    // boundaries. The bad case (Pitfall 3) would be `PurposeScopeProcedures`.
    expect(out).toMatch(/Purpose\s+Scope\s+Procedures/);
    // No multi-space runs.
    expect(out).not.toMatch(/  +/);
  });

  it('exports xmlEscape for Plan 04-09 title-attribute escaping', () => {
    // Sanity: the export is accessible and applies all 5 entity escapes.
    expect(xmlEscape('< & "')).toBe('&lt; &amp; &quot;');
    expect(xmlEscape("a'b")).toBe('a&apos;b');
    expect(xmlEscape('<>')).toBe('&lt;&gt;');
  });
});
