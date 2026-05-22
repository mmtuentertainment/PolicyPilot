// tests/ai-mocks.ts — Phase 4 shared test fixtures.
// Closes RESEARCH § Common Pitfall 6 (mocked Anthropic response missing content array).
// Every lib/ai/*.test.ts and app/api/ai/**/route.test.ts imports from here.
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Build a full Anthropic.Messages.Message fixture. The content array is non-empty so
 * lib/ai/extract.ts:extractText (D-38) never throws "no text block" on legitimate fixtures.
 *
 * Usage defaults emulate a cache-miss state. Pass `usage` partials to assert cache-hit/miss
 * branches per D-25 (cache_read_input_tokens > 0 on the 2nd successive call).
 */
export function mockTextResponse(
  text: string,
  usage?: Partial<Anthropic.Messages.Usage>,
): Anthropic.Messages.Message {
  return {
    id: 'msg_fixture_01',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text, citations: null }],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      service_tier: 'standard',
      cache_creation: null,
      server_tool_use: null,
      ...usage,
    },
  } as unknown as Anthropic.Messages.Message;
}

/**
 * Build a full Anthropic.Messages.Batches.MessageBatch fixture for the polling endpoint tests
 * (translateProcessingStatus AC-30 + 4 fixtures: in_progress, canceling, ended+succeeded, ended+errored).
 */
export function mockBatch(
  processing_status: 'in_progress' | 'canceling' | 'ended',
  counts: { succeeded?: number; errored?: number; canceled?: number; expired?: number; processing?: number } = {},
): {
  id: string;
  type: 'message_batch';
  processing_status: 'in_progress' | 'canceling' | 'ended';
  request_counts: { succeeded: number; errored: number; canceled: number; expired: number; processing: number };
  archived_at: string | null;
  cancel_initiated_at: string | null;
  created_at: string;
  ended_at: string | null;
  expires_at: string;
  results_url: string | null;
} {
  return {
    id: 'msgbatch_01fixture',
    type: 'message_batch',
    processing_status,
    request_counts: {
      succeeded: counts.succeeded ?? 0,
      errored: counts.errored ?? 0,
      canceled: counts.canceled ?? 0,
      expired: counts.expired ?? 0,
      processing: counts.processing ?? 0,
    },
    archived_at: null,
    cancel_initiated_at: null,
    created_at: '2026-05-21T00:00:00.000Z',
    ended_at: processing_status === 'ended' ? '2026-05-21T00:05:00.000Z' : null,
    expires_at: '2026-05-22T00:00:00.000Z',
    results_url: processing_status === 'ended' && (counts.succeeded ?? 0) > 0
      ? 'https://api.anthropic.com/v1/messages/batches/msgbatch_01fixture/results'
      : null,
  };
}
