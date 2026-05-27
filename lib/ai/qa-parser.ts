import 'server-only';

/**
 * Phase 4 D-10 + D-11 + D-41 — Q&A response parser.
 *
 * Parses Claude's natural-language response into the API-SPEC.md contract shape:
 *   { answer: string, citations: { title: string, id: string }[] }
 *
 * Defense against citation hallucinations (D-41 + SP-1):
 *   validIds MUST be sourced from the SAME withOrgScope-scoped query that built the
 *   libraryXml block (Plan 04-09 endpoint). Never pass a global, cached, or cross-org Set
 *   — citation-strip is the only barrier between model hallucinations and cross-tenant
 *   policyId disclosure.
 *
 * Tolerant fail-soft paths (D-11):
 *   - Citation fence absent (Claude's "I couldn't find information..." branch):
 *     return { answer: raw.trim(), citations: [] }.
 *   - Citation fence present but JSON malformed:
 *     console.warn + return { answer: <body-before-fence>, citations: [] }.
 *   - Citation fence present + valid JSON + IDs not in validIds:
 *     silently strip the unknown IDs (no warn; this is the hallucination path).
 *
 * Compile-time contract: tests/types.ts carries the D-43 assertion forbidding regression
 * of `citations` to the legacy `string[]` shape. Any refactor that drops `title` from each
 * citation object will fail `pnpm typecheck`.
 */

// Whitespace-tolerant: matches both the documented `--- CITATIONS ---` (with spaces)
// AND the variant `---CITATIONS---` (no spaces) that Sonnet 4.6 actually emits in
// practice. Surfaced during Phase 5 UAT 2026-05-24 — without `\s*` the parser fell
// through to the no-match branch on every real Q&A response, leaving the fence text
// visible in the rendered answer and dropping all citations.
const CITATION_FENCE = /\n---\s*CITATIONS\s*---\n([\s\S]*?)\n---\s*END CITATIONS\s*---/;

export function parseQaResponse(
  raw: string,
  validIds: Set<string>,
): { answer: string; citations: { title: string; id: string }[] } {
  const match = raw.match(CITATION_FENCE);
  // RegExpMatchArray's match[1] is `string | undefined` under noUncheckedIndexedAccess;
  // narrow defensively. When CITATION_FENCE matches, capture group 1 IS present, but the
  // type system can't prove it — explicit guard satisfies both TS strict mode and a future
  // refactor where the fence regex grows additional optional groups.
  if (!match || match[1] === undefined) return { answer: raw.trim(), citations: [] };

  const body = raw.slice(0, match.index).trim();
  let citations: { title: string; id: string }[] = [];

  try {
    const parsed = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      citations = parsed
        .filter((c): c is { title: string; id: string } =>
          c !== null &&
          typeof c === 'object' &&
          typeof (c as { title?: unknown }).title === 'string' &&
          typeof (c as { id?: unknown }).id === 'string',
        )
        .filter((c) => validIds.has(c.id));   // strip hallucinated IDs per SPEC + D-41
    }
  } catch (err) {
    console.warn('[ai/qa] citation block present but unparseable', {
      err: err instanceof Error ? { name: err.name, message: err.message.slice(0, 120) } : err,
    });
  }

  return { answer: body, citations };
}
