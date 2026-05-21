// components/policy/PolicyAiDraftDialog.test.tsx — Plan 04-03 Wave-0 RED stub.
// AC-23 (D-28): editor.commands.setContent(draftContent) MUST use setContent(string),
// NOT JSON.parse(draftContent) — Draft response is prose (PROMPTS.md:8-21), not ProseMirror JSON.
// SUT component `components/policy/PolicyAiDraftDialog.tsx` does NOT exist yet — Plan 04-12 creates it.
import { describe, expect, it } from 'vitest';
// Note: @testing-library/react IS in devDependencies (per package.json:62).
// For this RED stub, runtime expect.fail handles the "not yet implemented" state.

describe('PolicyAiDraftDialog — AC-23: setContent(string), no JSON.parse (D-28)', () => {
  it('JSON.parse(draftContent) WOULD throw on the standard Draft response (negative fixture sanity)', () => {
    const draftContent = '## Purpose\nThis policy describes...';
    expect(() => JSON.parse(draftContent)).toThrow(SyntaxError);
  });

  it('on /api/ai/draft success: calls editor.commands.setContent(draftContent) — NOT JSON.parse(draftContent)', async () => {
    expect.fail('TODO: Plan 04-12 — render dialog, mock fetch, assert editor.commands.setContent called with raw string');
  });

  it('on 429 response: shows tier-limit copy with /pricing link', async () => {
    expect.fail('TODO: Plan 04-12 — tier-overage UX branch');
  });

  it('on 503 response: shows generic AI-unavailable copy + retry hint', async () => {
    expect.fail('TODO: Plan 04-12 — AI-failure UX branch');
  });
});
