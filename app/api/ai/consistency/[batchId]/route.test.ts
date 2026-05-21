// app/api/ai/consistency/[batchId]/route.test.ts — Plan 04-10 GREEN.
// CRITICAL: translateProcessingStatus(SDK enum → SPEC enum) + AC-30 DB-cache stale-window
// + WARNING-5 token aggregation across batch results stream.
// 4 translator fixtures + 2 stale-window cases + 1 completed-path case + 1 WARNING-5 token-sum.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mockBatch } from '@/tests/ai-mocks';

// ============================================================================
// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
// ============================================================================
const mockBatchRetrieve = vi.fn();
const mockBatchResults = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(),
      batches: {
        create: vi.fn(),
        retrieve: mockBatchRetrieve,
        results: mockBatchResults,
      },
    },
  }),
}));

// ============================================================================
// Mock auth context: getOrgContext returns admin by default.
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Mock the BatchJobs + AiGenerations repositories.
// ============================================================================
const mockFindByAnthropicBatchId = vi.fn();
const mockBatchJobsUpdateStatus = vi.fn();
vi.mock('@/lib/db/repositories/batch_jobs', () => ({
  BatchJobs: {
    findByAnthropicBatchId: (...args: unknown[]) => mockFindByAnthropicBatchId(...args),
    updateStatus: (...args: unknown[]) => mockBatchJobsUpdateStatus(...args),
  },
}));

const mockAiGenerationsInsert = vi.fn();
vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: {
    insert: (...args: unknown[]) => mockAiGenerationsInsert(...args),
  },
}));

// ============================================================================
// withOrgScope passes a stub scope to the callback (no real transaction).
// ============================================================================
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (_ctx: unknown, fn: (s: unknown) => Promise<unknown>) =>
    fn({ orgId: 'org_1', userId: 'user_1', tx: {} }),
}));

const ADMIN_CTX = {
  orgId: 'org_1',
  userId: 'user_1',
  role: 'admin' as const,
  clerkOrgId: 'org_clerk_1',
  clerkUserId: 'user_clerk_1',
};

const BATCH_ID = 'msgbatch_test';

function makeReq(): Request {
  return new Request(`http://localhost/api/ai/consistency/${BATCH_ID}`, {
    method: 'GET',
  });
}

function makeParams() {
  return { params: Promise.resolve({ batchId: BATCH_ID }) };
}

/**
 * Build an async iterable of MessageBatchIndividualResponse-like objects for
 * messages.batches.results() — the SDK returns an AsyncIterable; we shape it
 * compatibly here.
 */
function makeBatchResultsStream(
  responses: Array<{
    type: 'succeeded' | 'errored' | 'expired' | 'canceled';
    text?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  }>,
) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const r of responses) {
        if (r.type === 'succeeded') {
          yield {
            result: {
              type: 'succeeded',
              message: {
                content: [{ type: 'text', text: r.text ?? '[]' }],
                usage: {
                  input_tokens: r.usage?.input_tokens ?? 0,
                  output_tokens: r.usage?.output_tokens ?? 0,
                  cache_read_input_tokens: r.usage?.cache_read_input_tokens ?? 0,
                  cache_creation_input_tokens: r.usage?.cache_creation_input_tokens ?? 0,
                },
              },
            },
          };
        } else {
          yield { result: { type: r.type } };
        }
      }
    },
  };
}

describe('GET /api/ai/consistency/[batchId] — polling + SDK→SPEC translator (RESEARCH § Batch API Mechanics)', () => {
  beforeEach(() => {
    mockBatchRetrieve.mockReset();
    mockBatchResults.mockReset();
    mockGetOrgContext.mockReset();
    mockFindByAnthropicBatchId.mockReset();
    mockBatchJobsUpdateStatus.mockReset();
    mockAiGenerationsInsert.mockReset();
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
    mockBatchJobsUpdateStatus.mockResolvedValue([{}]);
    mockAiGenerationsInsert.mockResolvedValue([{ id: 'aigen_1' }]);
  });

  // ==========================================================================
  // 4 translator fixtures per RESEARCH § Batch API Mechanics lines 199-215.
  // Translator is exported so we can test it directly.
  // ==========================================================================
  it('translator: processing_status:"in_progress" ⇒ status:"in_progress"', async () => {
    const { translateProcessingStatus } = await import(
      '@/app/api/ai/consistency/[batchId]/route'
    );
    expect(
      translateProcessingStatus(
        mockBatch('in_progress', { processing: 1 }) as never,
      ),
    ).toBe('in_progress');
  });

  it('translator: processing_status:"canceling" ⇒ status:"in_progress"', async () => {
    const { translateProcessingStatus } = await import(
      '@/app/api/ai/consistency/[batchId]/route'
    );
    expect(
      translateProcessingStatus(
        mockBatch('canceling', { processing: 1 }) as never,
      ),
    ).toBe('in_progress');
  });

  it('translator: processing_status:"ended" + request_counts.succeeded>0 + others=0 ⇒ status:"completed"', async () => {
    const { translateProcessingStatus } = await import(
      '@/app/api/ai/consistency/[batchId]/route'
    );
    expect(
      translateProcessingStatus(mockBatch('ended', { succeeded: 1 }) as never),
    ).toBe('completed');
  });

  it('translator: processing_status:"ended" + request_counts.errored>0 ⇒ status:"failed"', async () => {
    const { translateProcessingStatus } = await import(
      '@/app/api/ai/consistency/[batchId]/route'
    );
    expect(
      translateProcessingStatus(
        mockBatch('ended', { succeeded: 0, errored: 1 }) as never,
      ),
    ).toBe('failed');
  });

  // ==========================================================================
  // D-34 stale-window (AC-30): 10 polls within 5s ⇒ exactly 1 SDK retrieve call.
  // ==========================================================================
  it('DB-cache stale window (AC-30, D-34): 10 polls within 5s ⇒ 1 SDK retrieve call', async () => {
    vi.useFakeTimers();
    try {
      const start = new Date('2026-05-21T12:00:00.000Z');
      vi.setSystemTime(start);

      // First call: stale row (30s ago) → SDK retrieve fires. After updateStatus,
      // subsequent calls see a fresh row (updatedAt=now) → SDK NOT called again.
      const staleRow = {
        anthropicBatchId: BATCH_ID,
        status: 'in_progress',
        updatedAt: new Date(start.getTime() - 30_000),
        resultJson: null,
      };
      const freshRow = {
        anthropicBatchId: BATCH_ID,
        status: 'in_progress',
        updatedAt: start, // fresh — within stale window
        resultJson: null,
      };

      // 1st call returns stale row; calls 2-10 return fresh row (post-poll DB state).
      mockFindByAnthropicBatchId.mockResolvedValueOnce(staleRow);
      for (let i = 0; i < 9; i++) {
        mockFindByAnthropicBatchId.mockResolvedValueOnce(freshRow);
      }
      mockBatchRetrieve.mockResolvedValue(
        mockBatch('in_progress', { processing: 1 }),
      );

      const { GET } = await import('@/app/api/ai/consistency/[batchId]/route');

      // 1st poll — should hit Anthropic
      await GET(makeReq(), makeParams());
      expect(mockBatchRetrieve).toHaveBeenCalledTimes(1);

      // Advance clock a tiny bit per poll, all within 5s total.
      for (let i = 0; i < 9; i++) {
        vi.setSystemTime(new Date(start.getTime() + 500 * (i + 1)));
        await GET(makeReq(), makeParams());
      }
      // Polls 2-10 all hit fresh rows → exactly 1 SDK retrieve total.
      expect(mockBatchRetrieve).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('after 25s elapse: next poll DOES hit Anthropic (stale window expired)', async () => {
    vi.useFakeTimers();
    try {
      const start = new Date('2026-05-21T12:00:00.000Z');
      vi.setSystemTime(start);

      // Return a fresh row first; then a stale row after the clock advances.
      const freshRow = {
        anthropicBatchId: BATCH_ID,
        status: 'in_progress',
        updatedAt: start,
        resultJson: null,
      };
      mockFindByAnthropicBatchId.mockResolvedValueOnce(freshRow);
      // 26s later: the row's updatedAt is 26s old → STALE → SDK fires.
      mockFindByAnthropicBatchId.mockResolvedValueOnce({
        ...freshRow,
        updatedAt: start, // same updatedAt; clock has moved forward 26s
      });
      mockBatchRetrieve.mockResolvedValue(
        mockBatch('in_progress', { processing: 1 }),
      );

      const { GET } = await import('@/app/api/ai/consistency/[batchId]/route');

      // 1st poll — fresh → NO SDK call.
      await GET(makeReq(), makeParams());
      expect(mockBatchRetrieve).toHaveBeenCalledTimes(0);

      // Advance clock 26s (past STALE_WINDOW_MS=25_000).
      vi.setSystemTime(new Date(start.getTime() + 26_000));
      await GET(makeReq(), makeParams());
      // Now the row's updatedAt (start) is 26s stale → SDK fires.
      expect(mockBatchRetrieve).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // ==========================================================================
  // On translated status:"completed": full results fetch + ai_generations insert
  // + batch_jobs update (D-06 SUCCESS-ONLY).
  // ==========================================================================
  it('on translated status:"completed": calls messages.batches.results, parses JSON, persists 1 ai_generations row (SUCCESS-ONLY per D-06)', async () => {
    // Stale row → force SDK call.
    mockFindByAnthropicBatchId.mockResolvedValueOnce({
      anthropicBatchId: BATCH_ID,
      status: 'in_progress',
      updatedAt: new Date(Date.now() - 30_000),
      resultJson: null,
    });
    // SDK retrieve → ended + succeeded=1 → translator → 'completed'.
    mockBatchRetrieve.mockResolvedValueOnce(mockBatch('ended', { succeeded: 1 }));
    // SDK results stream → 1 succeeded response with JSON findings + usage tokens.
    const findings = [
      {
        policy_a: 'PTO Policy',
        policy_b: 'Vacation Policy',
        issue_type: 'contradiction',
        description: 'PTO accrual rate differs between policies',
        severity: 'medium',
      },
    ];
    mockBatchResults.mockReturnValueOnce(
      makeBatchResultsStream([
        {
          type: 'succeeded',
          text: JSON.stringify(findings),
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        },
      ]),
    );

    const { GET } = await import('@/app/api/ai/consistency/[batchId]/route');
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.result).toEqual(findings);

    // SUCCESS-ONLY: exactly 1 ai_generations row written on completion.
    expect(mockAiGenerationsInsert).toHaveBeenCalledOnce();
    const insertArgs = mockAiGenerationsInsert.mock.calls[0]![1] as {
      type: string;
      policyId: null;
      model: string;
    };
    expect(insertArgs.type).toBe('consistency');
    expect(insertArgs.policyId).toBeNull();
    expect(insertArgs.model).toBe('claude-sonnet-4-6');

    // batch_jobs updated with status='completed' + resultJson.
    expect(mockBatchJobsUpdateStatus).toHaveBeenCalledOnce();
    const updateArgs = mockBatchJobsUpdateStatus.mock.calls[0]!;
    expect(updateArgs[1]).toBe(BATCH_ID);
    const patch = updateArgs[2] as { status: string; resultJson: unknown };
    expect(patch.status).toBe('completed');
    expect(patch.resultJson).toEqual(findings);
  });

  // ==========================================================================
  // WARNING-5 — NEW 8th test: token aggregation across multiple succeeded results.
  // ==========================================================================
  it('WARNING-5 — on completed batch, ai_generations row carries SUMMED token counts (not null)', async () => {
    // Stale row → force SDK call.
    mockFindByAnthropicBatchId.mockResolvedValueOnce({
      anthropicBatchId: BATCH_ID,
      status: 'in_progress',
      updatedAt: new Date(Date.now() - 30_000),
      resultJson: null,
    });
    // SDK retrieve → ended + succeeded=2 → translator → 'completed'.
    mockBatchRetrieve.mockResolvedValueOnce(mockBatch('ended', { succeeded: 2 }));
    // SDK results stream → 2 succeeded responses, each with its own usage tokens.
    // Per WARNING-5, the executor SUMs the 4 usage fields across all succeeded
    // results and inserts the totals into ai_generations.
    mockBatchResults.mockReturnValueOnce(
      makeBatchResultsStream([
        {
          type: 'succeeded',
          text: JSON.stringify([
            {
              policy_a: 'A',
              policy_b: 'B',
              issue_type: 'contradiction',
              description: 'd',
              severity: 'low',
            },
          ]),
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 100,
          },
        },
        {
          type: 'succeeded',
          text: 'irrelevant — only first succeeded drives findings',
          usage: {
            input_tokens: 800,
            output_tokens: 400,
            cache_read_input_tokens: 150,
            cache_creation_input_tokens: 50,
          },
        },
      ]),
    );

    const { GET } = await import('@/app/api/ai/consistency/[batchId]/route');
    const res = await GET(makeReq(), makeParams());
    expect(res.status).toBe(200);

    // The insert call must carry the SUMMED token counts.
    expect(mockAiGenerationsInsert).toHaveBeenCalledOnce();
    const insertArgs = mockAiGenerationsInsert.mock.calls[0]![1] as {
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    };
    expect(insertArgs.inputTokens).toBe(1800); // 1000 + 800
    expect(insertArgs.outputTokens).toBe(900); // 500 + 400
    expect(insertArgs.cacheReadInputTokens).toBe(350); // 200 + 150
    expect(insertArgs.cacheCreationInputTokens).toBe(150); // 100 + 50

    // Cost-undercounting invariant: input_tokens > 0 (not null).
    expect(insertArgs.inputTokens).toBeGreaterThan(0);
  });
});
