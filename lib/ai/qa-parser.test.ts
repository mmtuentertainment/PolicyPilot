// lib/ai/qa-parser.test.ts — Plan 04-05 Wave-1 GREEN.
// D-10/D-11/D-41: citation fence parser + tolerant no-match + strip hallucinated IDs.
import { describe, expect, it, vi } from 'vitest';
import { parseQaResponse } from '@/lib/ai/qa-parser';

describe('lib/ai/qa-parser — parseQaResponse (D-10 + D-11)', () => {
  const validIds = new Set([
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ]);

  it('parses fenced citation block + filters by validIds (D-41 — strips hallucinated IDs)', () => {
    const raw =
      'Vacation policy says 10 days/year per the Vacation Policy.\n' +
      '\n' +
      '--- CITATIONS ---\n' +
      '[{"title":"Vacation Policy","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"},' +
      '{"title":"Hallucinated Policy","id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}]\n' +
      '--- END CITATIONS ---';
    const out = parseQaResponse(raw, validIds);
    expect(out.answer).toBe('Vacation policy says 10 days/year per the Vacation Policy.');
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]).toEqual({
      title: 'Vacation Policy',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('returns { answer: raw, citations: [] } when fence absent (D-11 tolerant no-match branch)', () => {
    const raw = "I couldn't find information about that in our current policies. Please contact HR directly.";
    const out = parseQaResponse(raw, validIds);
    expect(out.answer).toBe(raw);
    expect(out.citations).toEqual([]);
  });

  it('returns { answer: <body>, citations: [] } when JSON inside fence is malformed (D-11)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw =
      'Answer body.\n' +
      '\n' +
      '--- CITATIONS ---\n' +
      '[{this is not valid json}\n' +
      '--- END CITATIONS ---';
    const out = parseQaResponse(raw, validIds);
    expect(out.answer).toBe('Answer body.');
    expect(out.citations).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ai/qa] citation block present but unparseable',
      expect.objectContaining({ err: expect.any(Object) }),
    );
    warnSpy.mockRestore();
  });

  it('citations array is empty when valid JSON but no IDs match validIds (full hallucination path)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw =
      'Answer.\n' +
      '\n' +
      '--- CITATIONS ---\n' +
      '[{"title":"Made-Up Policy","id":"00000000-0000-4000-8000-000000000000"}]\n' +
      '--- END CITATIONS ---';
    const out = parseQaResponse(raw, validIds);
    expect(out.answer).toBe('Answer.');
    expect(out.citations).toEqual([]);  // Hallucinated ID stripped — no warn (this is by design).
    // Crucially: the hallucination path does NOT emit a console.warn — only malformed JSON does.
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('citations is empty when JSON is valid but NOT an array (defensive — D-11)', () => {
    const raw =
      'Answer.\n' +
      '\n' +
      '--- CITATIONS ---\n' +
      '{"title":"Single object not array","id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}\n' +
      '--- END CITATIONS ---';
    const out = parseQaResponse(raw, validIds);
    expect(out.answer).toBe('Answer.');
    expect(out.citations).toEqual([]);
  });
});
