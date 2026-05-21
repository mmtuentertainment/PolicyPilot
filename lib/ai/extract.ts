import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Phase 4 D-38 — shared text-block extractor for Anthropic.Messages.Message.
 *
 * Single helper used by Draft (Plan 04-08), Summary (Plan 04-08), Q&A (Plan 04-09),
 * and Consistency-poll (Plan 04-10). Throws on responses with no text block — guards
 * against RESEARCH Pitfall 6 (mocked response missing content array) at runtime.
 *
 * Plan 04-03's tests/ai-mocks.ts:mockTextResponse helper ensures fixtures always include
 * a valid TextBlock.
 */
export function extractText(response: Anthropic.Messages.Message): string {
  const block = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
  );
  if (!block) throw new Error('Anthropic response contained no text block');
  return block.text;
}
