import 'server-only';

/**
 * Phase 4 D-04 — Anthropic model IDs.
 *
 * Single grep target for future model-deprecation migrations (e.g., Sonnet 4.7 → 5.x).
 * Locked per ADR-005 + ADR-006 + ADR-015. No alternate models permitted without a new ADR.
 */
export const MODEL_SONNET = 'claude-sonnet-4-6' as const;
export const MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const;

export type ModelId = typeof MODEL_SONNET | typeof MODEL_HAIKU;
