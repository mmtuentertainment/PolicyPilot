// lib/ai/summary.test.ts — Plan 04-08 GREEN.
// D-19 + SPEC R3: idempotent (skip when tldrSummary set) + MODEL_HAIKU + cache-token tier columns.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

// Mock the per-aggregate repositories so we can assert call shapes without DB.
const mockFindById = vi.fn();
const mockUpdateSummary = vi.fn();
const mockInsertAiGen = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    findById: (...args: unknown[]) => mockFindById(...args),
    updateSummary: (...args: unknown[]) => mockUpdateSummary(...args),
  },
}));
vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: { insert: (...args: unknown[]) => mockInsertAiGen(...args) },
}));

// withOrgScope: invoke the callback synchronously with a stub scope. We are NOT testing
// transaction semantics here — just the helper's orchestration of repo + Anthropic calls.
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (_ctx: unknown, fn: (s: unknown) => Promise<unknown>) =>
    fn({ orgId: 'org_1', userId: 'user_1', tx: {} }),
}));

describe('lib/ai/summary — generateSummaryForPolicy (D-19, SPEC R3)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindById.mockReset();
    mockUpdateSummary.mockReset();
    mockInsertAiGen.mockReset();
  });

  it('idempotent — returns early when policies.tldrSummary already set (no Anthropic call)', async () => {
    mockFindById.mockResolvedValueOnce([
      { id: 'p1', tldrSummary: 'existing TL;DR', contentJson: { type: 'doc', content: [] } },
    ]);
    const { generateSummaryForPolicy } = await import('@/lib/ai/summary');
    const ctx = {
      orgId: 'org_1',
      userId: 'user_1',
      role: 'admin' as const,
      clerkOrgId: 'org_clerk_1',
      clerkUserId: 'user_clerk_1',
    };
    await generateSummaryForPolicy(
      'p1' as unknown as Parameters<typeof generateSummaryForPolicy>[0],
      ctx as Parameters<typeof generateSummaryForPolicy>[1],
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockInsertAiGen).not.toHaveBeenCalled();
    expect(mockUpdateSummary).not.toHaveBeenCalled();
  });

  it('on first call: invokes Haiku 4.5, inserts ai_generations row with cache-token columns, updates policies.tldrSummary', async () => {
    mockFindById.mockResolvedValueOnce([
      {
        id: 'p2',
        tldrSummary: null,
        contentJson: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Policy body text.' }] },
          ],
        },
      },
    ]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse('TL;DR text.', {
        input_tokens: 100,
        output_tokens: 30,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 1024,
      }),
    );
    const { generateSummaryForPolicy } = await import('@/lib/ai/summary');
    const ctx = {
      orgId: 'org_1',
      userId: 'user_1',
      role: 'admin' as const,
      clerkOrgId: 'org_clerk_1',
      clerkUserId: 'user_clerk_1',
    };
    await generateSummaryForPolicy(
      'p2' as unknown as Parameters<typeof generateSummaryForPolicy>[0],
      ctx as Parameters<typeof generateSummaryForPolicy>[1],
    );

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockInsertAiGen).toHaveBeenCalledOnce();
    const insertArgs = mockInsertAiGen.mock.calls[0][1]; // (s, input) — input is 2nd arg
    expect(insertArgs.type).toBe('summary');
    expect(insertArgs.result).toBe('TL;DR text.');
    expect(insertArgs.inputTokens).toBe(100);
    expect(insertArgs.outputTokens).toBe(30);
    expect(insertArgs.cacheReadInputTokens).toBe(0);
    expect(insertArgs.cacheCreationInputTokens).toBe(1024);
    expect(insertArgs.idempotencyKey).toBeNull();
    expect(insertArgs.model).toBe('claude-haiku-4-5-20251001');
    expect(mockUpdateSummary).toHaveBeenCalledOnce();
    expect(mockUpdateSummary.mock.calls[0][2]).toBe('TL;DR text.');
  });

  it('uses MODEL_HAIKU not MODEL_SONNET (D-04)', async () => {
    mockFindById.mockResolvedValueOnce([
      { id: 'p3', tldrSummary: null, contentJson: { type: 'doc', content: [] } },
    ]);
    mockCreate.mockResolvedValueOnce(mockTextResponse('TL;DR'));
    const { generateSummaryForPolicy } = await import('@/lib/ai/summary');
    const ctx = {
      orgId: 'org_1',
      userId: 'user_1',
      role: 'admin' as const,
      clerkOrgId: 'org_clerk_1',
      clerkUserId: 'user_clerk_1',
    };
    await generateSummaryForPolicy(
      'p3' as unknown as Parameters<typeof generateSummaryForPolicy>[0],
      ctx as Parameters<typeof generateSummaryForPolicy>[1],
    );
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-4-5-20251001');
  });

  it('throws on policy not found (caller decides graceful-degrade)', async () => {
    mockFindById.mockResolvedValueOnce([]);
    const { generateSummaryForPolicy } = await import('@/lib/ai/summary');
    const ctx = {
      orgId: 'org_1',
      userId: 'user_1',
      role: 'admin' as const,
      clerkOrgId: 'org_clerk_1',
      clerkUserId: 'user_clerk_1',
    };
    await expect(
      generateSummaryForPolicy(
        'missing' as unknown as Parameters<typeof generateSummaryForPolicy>[0],
        ctx as Parameters<typeof generateSummaryForPolicy>[1],
      ),
    ).rejects.toThrow('Policy not found');
  });
});
