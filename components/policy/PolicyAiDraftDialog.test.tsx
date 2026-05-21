// components/policy/PolicyAiDraftDialog.test.tsx — Plan 04-12 Task 1 (GREEN flip).
//
// AC-23 (D-28): editor.commands.setContent(draftContent) MUST use setContent(string),
// NOT JSON.parse(draftContent) — Draft response is prose (PROMPTS.md:8-21), not
// ProseMirror JSON. This component's contract is `onDraftReady(rawContent)`; the
// parent (a Client Component wrapper) owns the editor ref and calls setContent.
// The 4 tests below assert:
//   1. JSON.parse(draftContent) WOULD throw on the Draft response shape (negative
//      fixture sanity — locks the prose-not-JSON contract).
//   2. On 200, onDraftReady is called with the raw response.draftContent string.
//   3. On 429, the tier-limit copy + /pricing link render; onDraftReady is NOT called.
//   4. On 503, the AI-unavailable copy renders; onDraftReady is NOT called.
//
// Wave-0 stub (Plan 04-03) had 3 `expect.fail` placeholders; this commit lights them
// up against the real component (Plan 04-12 Task 1).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PolicyAiDraftDialog } from './PolicyAiDraftDialog';

describe('PolicyAiDraftDialog — AC-23: setContent(string), no JSON.parse (D-28) + BLOCKER-2 shared categories', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('JSON.parse(draftContent) WOULD throw on the standard Draft response (negative fixture sanity)', () => {
    // The Draft system prompt (reference/PROMPTS.md:8-21) produces narrative prose
    // with named sections (Purpose, Scope, etc.). It is NOT ProseMirror JSON. Any
    // future refactor that calls JSON.parse(draftContent) would throw SyntaxError
    // on every Draft response. This test pins the negative invariant.
    const draftContent = '## Purpose\nThis policy describes...';
    expect(() => JSON.parse(draftContent)).toThrow(SyntaxError);
  });

  it('on /api/ai/draft 200 success: calls onDraftReady(draftContent) with raw string — NOT JSON.parse', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ draftContent: '## Purpose\nDraft body', tokensUsed: 150 }),
        { status: 200 },
      ),
    );
    const onDraftReady = vi.fn();
    render(<PolicyAiDraftDialog onDraftReady={onDraftReady} />);

    // Open the dialog by clicking the trigger button (DialogTrigger render
    // prop wraps the "Generate with AI" Button).
    const trigger = screen.getByRole('button', { name: /Generate with AI/i });
    fireEvent.click(trigger);

    // The Textarea + Generate submit button are now in the portal-rendered
    // DialogContent. findByLabelText spans the whole DOM (including portals).
    const textarea = await screen.findByLabelText(/What policy do you need\?/i);
    fireEvent.change(textarea, { target: { value: 'Vacation policy please.' } });

    // Two buttons are named "Generate" (the trigger reads "Generate with AI" so
    // the regex /^Generate$/i picks the submit button exclusively).
    const submitBtn = screen.getByRole('button', { name: /^Generate$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(onDraftReady).toHaveBeenCalledOnce());
    // AC-23 invariant: the parent receives the RAW STRING. The parent (parent
    // wrapper that owns the editor ref) then calls
    //   editor.commands.setContent(rawContent)
    // — no JSON.parse anywhere in the chain.
    expect(onDraftReady).toHaveBeenCalledWith('## Purpose\nDraft body');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ai/draft',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchMock.mockRestore();
  });

  it('on 429 response: shows tier-limit copy with /pricing link', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'tier_limit_exceeded',
          tierLimit: 50,
          currentUsage: 50,
          upgradeUrl: '/pricing',
        }),
        { status: 429 },
      ),
    );
    const onDraftReady = vi.fn();
    render(<PolicyAiDraftDialog onDraftReady={onDraftReady} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate with AI/i }));
    const textarea = await screen.findByLabelText(/What policy/i);
    fireEvent.change(textarea, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));

    // Tier-limit copy embeds usage in "X/Y drafts this month" format.
    await waitFor(() =>
      expect(screen.getByText(/50\/50 drafts this month/i)).toBeTruthy(),
    );
    // "Upgrade to Growth → " link to /pricing per UI-SPEC.
    expect(screen.getByRole('link', { name: /Upgrade to Growth/i })).toBeTruthy();
    // Parent callback NOT invoked on the tier-overage branch.
    expect(onDraftReady).not.toHaveBeenCalled();
  });

  it('on 503 response: shows generic AI-unavailable copy + retry hint', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: 'ai_service_unavailable', retryAfter: 30 }),
        { status: 503 },
      ),
    );
    const onDraftReady = vi.fn();
    render(<PolicyAiDraftDialog onDraftReady={onDraftReady} />);

    fireEvent.click(screen.getByRole('button', { name: /Generate with AI/i }));
    const textarea = await screen.findByLabelText(/What policy/i);
    fireEvent.change(textarea, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/i }));

    // Generic AI-unavailable copy (no PII; no Anthropic detail leaked).
    await waitFor(() =>
      expect(screen.getByText(/AI service temporarily unavailable/i)).toBeTruthy(),
    );
    // Parent callback NOT invoked on the AI-failure branch.
    expect(onDraftReady).not.toHaveBeenCalled();
  });
});
