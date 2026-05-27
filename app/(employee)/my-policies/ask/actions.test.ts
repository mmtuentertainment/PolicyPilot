// app/(employee)/my-policies/ask/actions.test.ts — Plan 05-09 Task 2 (D-21 co-located).
//
// Behavioral contract for askQuestionAction (Plan 05-05 Task 3a). Mirrors the
// admin actions test shape — module-level vi.mock hoisting + beforeEach reset.
//
// Coverage per Plan 05-09 Task 2 spec:
//   - Happy path: valid question → askQuestion called → returns { ok: true, answer, citations }
//   - Invalid input: missing / empty / oversized (>2000 chars) → { ok: false, error: 'Invalid action payload.' }
//   - Anthropic.APIError → 503 semantic envelope ('AI service temporarily unavailable.')
//   - Non-Anthropic Error: 503-equivalent fallback (test asserts generic envelope)
//   - Citations preserved with accessibility flag (D-27a shape lock)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

const askQuestionMock = vi.fn();
vi.mock('@/lib/ai/qa', () => ({
  askQuestion: (...args: unknown[]) => askQuestionMock(...args),
}));

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'employee' as const,
  })),
}));

import { askQuestionAction } from './actions';

beforeEach(() => {
  askQuestionMock.mockReset();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe('askQuestionAction happy path', () => {
  it('returns { ok: true, answer, citations } on valid question', async () => {
    const mockResponse = {
      answer: 'The expense policy says $1000 limit.',
      citations: [
        {
          title: 'Expense Policy',
          id: '00000000-0000-4000-8000-000000000001',
          accessibility: 'full' as const,
        },
      ],
    };
    askQuestionMock.mockResolvedValueOnce(mockResponse);

    const result = await askQuestionAction(undefined, fd({ question: 'what is the limit?' }));

    expect(result).toEqual({
      ok: true,
      answer: mockResponse.answer,
      citations: mockResponse.citations,
    });
    expect(askQuestionMock).toHaveBeenCalledTimes(1);
    expect(askQuestionMock).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1', userId: 'user_1' }),
      'what is the limit?',
    );
  });

  it('preserves accessibility flag verbatim in returned citations (D-27a shape lock)', async () => {
    // Mix full + tldr-only citations — both must round-trip with shape intact.
    const mockResponse = {
      answer: 'Policy answer.',
      citations: [
        { title: 'Assigned Policy', id: '00000000-0000-4000-8000-000000000001', accessibility: 'full' as const },
        { title: 'Granted Policy', id: '00000000-0000-4000-8000-000000000002', accessibility: 'tldr-only' as const },
      ],
    };
    askQuestionMock.mockResolvedValueOnce(mockResponse);

    const result = await askQuestionAction(undefined, fd({ question: 'tell me about policies' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]?.accessibility).toBe('full');
      expect(result.citations[1]?.accessibility).toBe('tldr-only');
    }
  });
});

describe('askQuestionAction input validation (Zod min(1).max(2000))', () => {
  it('returns INVALID_PAYLOAD on missing question field', async () => {
    const result = await askQuestionAction(undefined, fd({}));
    expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
    expect(askQuestionMock).not.toHaveBeenCalled();
  });

  it('returns INVALID_PAYLOAD on empty-string question', async () => {
    const result = await askQuestionAction(undefined, fd({ question: '' }));
    expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
    expect(askQuestionMock).not.toHaveBeenCalled();
  });

  it('returns INVALID_PAYLOAD on oversized question (>2000 chars)', async () => {
    const oversized = 'x'.repeat(2001);
    const result = await askQuestionAction(undefined, fd({ question: oversized }));
    expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
    expect(askQuestionMock).not.toHaveBeenCalled();
  });

  it('accepts exactly 2000 chars (boundary check)', async () => {
    const exactly = 'x'.repeat(2000);
    askQuestionMock.mockResolvedValueOnce({
      answer: 'ok',
      citations: [],
    });
    const result = await askQuestionAction(undefined, fd({ question: exactly }));
    expect(result.ok).toBe(true);
    expect(askQuestionMock).toHaveBeenCalledTimes(1);
  });
});

describe('askQuestionAction error mapping', () => {
  it('returns 503-equivalent envelope on Anthropic.APIError (Plan 05-05 + SPEC R7)', async () => {
    // Anthropic.APIError construction — match the SDK shape.
    const apiError = new Anthropic.APIError(
      503,
      { type: 'error', error: { type: 'overloaded_error', message: 'overloaded' } },
      'Anthropic overloaded',
      undefined,
    );
    askQuestionMock.mockRejectedValueOnce(apiError);

    const result = await askQuestionAction(undefined, fd({ question: 'test' }));

    expect(result).toEqual({
      ok: false,
      error: 'AI service temporarily unavailable. Please try again.',
    });
  });

  it('returns 503-equivalent envelope on non-Anthropic Error', async () => {
    askQuestionMock.mockRejectedValueOnce(new Error('DB connection lost'));
    const result = await askQuestionAction(undefined, fd({ question: 'test' }));
    expect(result).toEqual({
      ok: false,
      error: 'AI service temporarily unavailable. Please try again.',
    });
  });
});
