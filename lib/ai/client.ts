import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Phase 4 D-02 + D-33 — Anthropic SDK client.
 *
 * Lazy singleton: cached after first call. Defers env-var read until first invocation
 * (unit-test friendly — vi.mock('@/lib/ai/client', ...) per D-05 doesn't require ANTHROPIC_API_KEY
 * to be set during test setup).
 *
 * Client options (D-33):
 *   - maxRetries: 0 — SPEC R7 explicit: no auto-retry on 5xx/429. 503 envelope surfaces failure
 *     cleanly to the caller; client (or operator) decides whether to retry.
 *   - timeout: 25_000ms — 25s per-request bound, well under Vercel's 300s default function timeout.
 *     Keeps a single request from monopolizing Vercel CPU.
 *
 * D-05 mock surface: vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => mockClient })).
 */
export const CLIENT_OPTIONS = {
  maxRetries: 0,
  timeout: 25_000,
} as const;

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  return cached ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    ...CLIENT_OPTIONS,
  });
}
