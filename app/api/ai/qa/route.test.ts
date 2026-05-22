// app/api/ai/qa/route.test.ts — Plan 04-09 GREEN.
// SPEC R4 + D-33c + D-36 (PII-safe log) + D-40 (cold-miss observability) + D-41 (validIds strip)
// + D-46 (any-auth; no requireTierLimit) + WARNING-1 (SPEC substring fixtures)
// + WARNING-4 (rawText storage in ai_generations.result).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockTextResponse } from '@/tests/ai-mocks';

// ============================================================================
// D-05 mock shape — wrap the lib/ai/client wrapper, not the SDK.
// ============================================================================
const mockCreate = vi.fn();
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => ({
    messages: { create: mockCreate, batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() } },
  }),
}));

// ============================================================================
// Mock auth context: getOrgContext returns any-authenticated user by default
// (employee role per D-46 — Q&A allows ANY authenticated user, not admin-only).
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// Mock the Policies repository: listPublishedForOrg is the per-org library source.
// D-41 invariant: validIds in route.ts MUST be derived from THIS query's result
// inside the same withOrgScope closure.
// ============================================================================
const mockListPublishedForOrg = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    listPublishedForOrg: (...args: unknown[]) => mockListPublishedForOrg(...args),
  },
}));

// ============================================================================
// Mock the AiGenerations repository: insert (write rawText per WARNING-4 lock).
// ============================================================================
const mockInsertAiGen = vi.fn();
vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: {
    insert: (...args: unknown[]) => mockInsertAiGen(...args),
  },
}));

// ============================================================================
// withOrgScope passes a stub scope to the callback (no real transaction).
// ============================================================================
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (_ctx: unknown, fn: (s: unknown) => Promise<unknown>) =>
    fn({ orgId: 'org_1', userId: 'user_1', tx: {} }),
}));

// Default any-authenticated context. Q&A is NOT admin-only (D-46 + SPEC R4) — explicitly
// use `employee` role to verify the lack of requireAdminFromCtx call.
const ANY_AUTH_CTX = {
  orgId: 'org_1',
  userId: 'user_1',
  role: 'employee' as const,
  clerkOrgId: 'org_clerk_1',
  clerkUserId: 'user_clerk_1',
};

// Reusable minimal policy fixture (just the 3 columns listPublishedForOrg returns).
// contentJson is a minimal ProseMirror doc so policyToPromptText doesn't throw.
function policyFixture(id: string, title: string) {
  return {
    id,
    title,
    contentJson: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: `Content of ${title}` }] },
      ],
    },
  };
}

function makeReq(
  body: Record<string, unknown> = { question: 'What is the PTO policy?' },
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/ai/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/qa — Sonnet 4.6 Q&A (SPEC R4)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockGetOrgContext.mockReset();
    mockListPublishedForOrg.mockReset();
    mockInsertAiGen.mockReset();
    // Defaults: any-authenticated user, one published policy, insert resolves.
    mockGetOrgContext.mockResolvedValue(ANY_AUTH_CTX);
    mockListPublishedForOrg.mockResolvedValue([policyFixture('policy-a', 'PTO Policy')]);
    mockInsertAiGen.mockResolvedValue([{ id: 'aigen_1' }]);
  });

  // ==========================================================================
  // ORIGINAL stub 1 — cache-hit 2nd call (SPEC R4 cache-hit observable).
  // ==========================================================================
  it('on 2nd successive call: usage.cache_read_input_tokens > 0 (cache-hit observable, SPEC R4)', async () => {
    mockCreate
      .mockResolvedValueOnce(
        mockTextResponse('A1\n\n--- CITATIONS ---\n[]\n--- END CITATIONS ---', {
          cache_creation_input_tokens: 2048,
          cache_read_input_tokens: 0,
        }),
      )
      .mockResolvedValueOnce(
        mockTextResponse('A2\n\n--- CITATIONS ---\n[]\n--- END CITATIONS ---', {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 2048,
        }),
      );
    const { POST } = await import('@/app/api/ai/qa/route');

    const res1 = await POST(makeReq());
    expect(res1.status).toBe(200);
    const res2 = await POST(makeReq());
    expect(res2.status).toBe(200);

    // 2 inserts total (one per request). Inspect the 2nd insert's cache-token cols.
    expect(mockInsertAiGen).toHaveBeenCalledTimes(2);
    const secondInsertArgs = mockInsertAiGen.mock.calls[1][1];
    expect(secondInsertArgs.cacheReadInputTokens).toBeGreaterThan(0);
    expect(secondInsertArgs.cacheCreationInputTokens).toBe(0);
  });

  // ==========================================================================
  // ORIGINAL stub 2 — AC-31 PII-safe log on Anthropic throw.
  // ==========================================================================
  it('PII-safe log on Anthropic throw: error.message truncated to 120 chars OR structured-field branch used (AC-31 — D-36)', async () => {
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Long error body containing FAKE_QUESTION_FROM_USER_BODY token, well past 120 chars.
      mockCreate.mockRejectedValueOnce(new Error('FAKE_QUESTION_FROM_USER_BODY '.repeat(20)));
      const { POST } = await import('@/app/api/ai/qa/route');
      const res = await POST(makeReq());

      // 503 envelope contract preserved (SP-2 + SPEC R7).
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('30');
      // No row written on Anthropic throw (SP-2).
      expect(mockInsertAiGen).not.toHaveBeenCalled();

      // Inspect logged payload — either truncated-message branch (.error.message.length <= 120)
      // OR structured-field branch ({ name, status, code }).
      expect(consoleErrSpy).toHaveBeenCalled();
      const firstCall = consoleErrSpy.mock.calls[0]!;
      const payload = firstCall[1];
      const errField = (payload as { error: unknown }).error as
        | { message?: string; name?: string; status?: number; code?: unknown }
        | undefined;
      expect(errField).toBeDefined();
      const ok =
        (typeof errField?.message === 'string' && errField.message.length <= 120) ||
        (typeof errField?.name === 'string' &&
          (typeof errField?.status === 'number' || errField?.status === undefined));
      expect(ok).toBe(true);
    } finally {
      consoleErrSpy.mockRestore();
    }
  });

  // ==========================================================================
  // ORIGINAL stub 3 — D-40 cold-miss observability.
  // ==========================================================================
  it('cache-miss log when both cache token counters are zero (D-40 cold-miss observability)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      mockCreate.mockResolvedValueOnce(
        mockTextResponse('Answer\n\n--- CITATIONS ---\n[]\n--- END CITATIONS ---', {
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          input_tokens: 500,
        }),
      );
      const { POST } = await import('@/app/api/ai/qa/route');
      const res = await POST(makeReq());
      expect(res.status).toBe(200);

      expect(consoleWarnSpy).toHaveBeenCalled();
      const firstWarn = consoleWarnSpy.mock.calls[0]!;
      const msg = firstWarn[0];
      const payload = firstWarn[1];
      expect(msg).toContain('[ai/qa] cache miss likely');
      const p = payload as { likelyCause?: string; inputTokens?: number };
      expect(p.likelyCause).toBe('below_1024_token_minimum_sonnet');
      expect(p.inputTokens).toBe(500);
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  // ==========================================================================
  // SP-1 sanity — D-41 validIds stripping closes cross-org citation leak.
  // ==========================================================================
  it('strips hallucinated citation IDs not in validIds (SP-1 unit-level sanity — D-41)', async () => {
    mockListPublishedForOrg.mockResolvedValueOnce([policyFixture('real-id', 'Real Policy')]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse(
        'Answer body.\n\n--- CITATIONS ---\n[{"title":"Real","id":"real-id"},{"title":"Hallucinated","id":"fake-id"}]\n--- END CITATIONS ---',
      ),
    );
    const { POST } = await import('@/app/api/ai/qa/route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.citations).toEqual([{ title: 'Real', id: 'real-id' }]);
  });

  // ==========================================================================
  // WARNING-1 (a) — legal-adjacent answer passes legal-disclaimer substring through (SPEC line 117).
  // ==========================================================================
  it('WARNING-1 (a) — legal-adjacent answer passes legal-disclaimer substring through to client (SPEC line 117)', async () => {
    const legalDisclaimer = 'For advice specific to your situation, consult your legal team.';
    mockListPublishedForOrg.mockResolvedValueOnce([]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse(
        `Discrimination claims can be complex. ${legalDisclaimer}\n\n--- CITATIONS ---\n[]\n--- END CITATIONS ---`,
      ),
    );
    const { POST } = await import('@/app/api/ai/qa/route');
    const res = await POST(
      makeReq({ question: 'Can I be fired for refusing to work overtime?' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toContain(legalDisclaimer);
  });

  // ==========================================================================
  // WARNING-1 (b) — no-match question returns exact no-match string + citations === [] (SPEC line 119).
  // ==========================================================================
  it('WARNING-1 (b) — no-match question returns exact no-match string + citations === [] (SPEC line 119)', async () => {
    const noMatch =
      "I couldn't find information about that in our current policies. Please contact HR directly.";
    mockListPublishedForOrg.mockResolvedValueOnce([policyFixture('policy-a', 'Some Policy')]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse(`${noMatch}\n\n--- CITATIONS ---\n[]\n--- END CITATIONS ---`),
    );
    const { POST } = await import('@/app/api/ai/qa/route');
    const res = await POST(makeReq({ question: 'What is the meaning of life?' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Per SPEC line 119: answer === exact string AND citations === [].
    // The parser strips the citation fence from `answer`, so the answer is just the no-match line.
    expect(body.answer).toBe(noMatch);
    expect(body.citations).toEqual([]);
  });

  // ==========================================================================
  // WARNING-1 (c) — non-legal answer does NOT contain the legal-disclaimer substring (SPEC negative).
  // ==========================================================================
  it('WARNING-1 (c) — non-legal answer does NOT contain the legal-disclaimer substring (SPEC negative fixture)', async () => {
    const legalDisclaimer = 'For advice specific to your situation, consult your legal team.';
    mockListPublishedForOrg.mockResolvedValueOnce([policyFixture('policy-b', 'Office Hours')]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse(
        'The office opens at 9:00 AM Monday through Friday.\n\n--- CITATIONS ---\n[{"title":"Office Hours","id":"policy-b"}]\n--- END CITATIONS ---',
      ),
    );
    const { POST } = await import('@/app/api/ai/qa/route');
    const res = await POST(makeReq({ question: 'What time does the office open?' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).not.toContain(legalDisclaimer);
  });

  // ==========================================================================
  // WARNING-4 — rawText (with citation fence) is stored in ai_generations.result.
  // ==========================================================================
  it('WARNING-4 — AiGenerations.insert receives rawText (with citation fence) in `result` field, NOT parsed answer', async () => {
    mockListPublishedForOrg.mockResolvedValueOnce([policyFixture('policy-a', 'X')]);
    mockCreate.mockResolvedValueOnce(
      mockTextResponse(
        'Answer body.\n\n--- CITATIONS ---\n[{"title":"X","id":"policy-a"}]\n--- END CITATIONS ---',
      ),
    );
    const { POST } = await import('@/app/api/ai/qa/route');
    const res = await POST(makeReq({ question: 'q' }));
    expect(res.status).toBe(200);
    // The insert call payload should carry the rawText (fence included), not the parsed answer.
    expect(mockInsertAiGen).toHaveBeenCalledOnce();
    const insertArgs = mockInsertAiGen.mock.calls[0][1];
    expect(insertArgs.type).toBe('qa');
    expect(insertArgs.result).toContain('--- CITATIONS ---');
    expect(insertArgs.result).toContain('--- END CITATIONS ---');
    expect(insertArgs.policyId).toBeNull();
    expect(insertArgs.model).toBe('claude-sonnet-4-6');
  });
});
