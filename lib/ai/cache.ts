import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Phase 4 D-03 + D-33 — prompt-cache helpers for Anthropic messages.create.
 *
 * Two TTL tiers per RESEARCH § Prompt-Cache Mechanics:
 *   - EPHEMERAL_CACHE (5min default): Draft + Summary + Consistency system prompts.
 *     Write cost = 1.25× base input; read cost = 0.1× base input.
 *   - LONG_CACHE (1h, GA since SDK 0.60.0): Q&A per-org policy library block.
 *     Write cost = 2× base input; read cost = 0.1× base input.
 *
 * Q&A endpoint composes BOTH blocks (D-33c ordering: LONG_CACHE FIRST, EPHEMERAL_CACHE SECOND
 * — Anthropic rejects inverse order with HTTP 400).
 *
 * Cost note (RESEARCH § Prompt-Cache Mechanics): at the SPEC R4 60-80% cache-hit rate target
 * (~3-4 reads per write), LONG_CACHE is actually MORE expensive than EPHEMERAL_CACHE
 * (breakeven at >21 reads per write). D-33 keeps LONG_CACHE for Q&A on the rationale that
 * 1h TTL future-proofs bursty traffic patterns. See RESEARCH § Open Questions for the
 * recorded trade-off. Phase 8 may revisit.
 */
export const EPHEMERAL_CACHE = { type: 'ephemeral' } as const;
export const LONG_CACHE = { type: 'ephemeral', ttl: '1h' } as const;

/**
 * Build a `system` array suitable for `messages.create({ system: ... })` with one
 * cache-tagged text block at the 5-min default TTL.
 */
export function buildCachedSystem(
  text: string,
): Anthropic.Messages.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: EPHEMERAL_CACHE }];
}

/**
 * Build a `system` array with one cache-tagged text block at the 1-hour TTL.
 * Use for the Q&A per-org policy library block (D-33c).
 */
export function buildLongCachedSystem(
  text: string,
): Anthropic.Messages.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: LONG_CACHE }];
}
