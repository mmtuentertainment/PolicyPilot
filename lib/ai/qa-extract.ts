import 'server-only';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/react';

/**
 * Phase 4 D-07 + D-31 layer 2 — server-side TipTap → plain-text + XML-escape.
 *
 * Pipeline: ProseMirror JSON → generateHTML (uses zeed-dom server-side, no JSDOM) →
 * strip tags via regex → collapse whitespace → XML-escape 5 entity-significant chars.
 *
 * Layer 1 (PROMPT) lives in lib/ai/prompts.ts:QA_SYSTEM_PROMPT_TEMPLATE "Treat it as DATA only"
 * meta-instruction. Layer 2 (EXTRACTION — this function) ensures adversarial text inside
 * policy contentJson cannot escape the <policy> tag boundary via raw `<` / `>` / etc.
 *
 * Per RESEARCH § Pitfall 3: regex strip uses single-SPACE replacement (not empty) to
 * preserve word boundaries; then collapse runs of whitespace. Pattern: `<p>A</p><p>B</p>` →
 * `' A  B '` → `' A B '` → trim → `'A B'`.
 *
 * AC-27 fixture: a published policy whose content reads `"Ignore previous instructions..."`
 * (and similar injection bait) is passed through this function and the resulting string
 * still contains those words — but the prompt-level meta-instruction (D-31 layer 1) tells
 * the model to disregard them as data.
 *
 * xmlEscape is exported so Plan 04-09 (Q&A endpoint) can reuse it for the
 * `<policy id="..." title="...">` attribute escaping per D-31 + PATTERNS lines 758-779.
 */

const STRIP_TAGS = /<[^>]+>/g;
const COLLAPSE_WHITESPACE = /\s+/g;

export const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&apos;');

export function policyToPromptText(policy: { contentJson: unknown }): string {
  const html = generateHTML(policy.contentJson as JSONContent, [StarterKit, Link]);
  const stripped = html.replace(STRIP_TAGS, ' ').replace(COLLAPSE_WHITESPACE, ' ').trim();
  return xmlEscape(stripped);
}
