'use client';

// PolicyAiDraftDialog — Phase 4 D-22 + D-28 + BLOCKER-2 (Plan 04-12 Task 1).
//
// SIBLING Client Component of PolicyEditor (NOT inside PolicyEditor.tsx — per
// CONTEXT.md <code_context>:241-243 and PATTERNS § Pattern I "Sibling Client
// Component"). The parent (a Client Component wrapper around BOTH this dialog
// AND PolicyEditor) owns the TipTap editor instance and supplies the
// `onDraftReady(rawContent)` callback. This separation keeps PolicyEditor's
// Phase 3 surface untouched.
//
// CRITICAL (D-28 + AC-23): on /api/ai/draft 200, this component calls
//   onDraftReady(body.draftContent)
// — passing the RAW STRING. The parent then calls
//   editor.commands.setContent(rawContent)
// on the TipTap editor. NEVER JSON.parse(draftContent). The Draft system
// prompt produces narrative prose (reference/PROMPTS.md:8-21) — JSON.parse
// would throw SyntaxError on every response. TipTap's setContent accepts
// HTML/markdown/string and routes through the paste-parser into ProseMirror.
//
// BLOCKER-2 resolution: POLICY_CATEGORIES + PolicyCategory are imported from
// `@/lib/policies/categories` (the shared module shipped by Plan 04-04 Task 5).
// Previous plan revisions sketched an inline `const POLICY_CATEGORIES = [...]`
// here — that approach allowed silent drift between this dialog's list, the
// Server Action's CreatePolicySchema enum, and the DraftSchema (lib/ai/
// schemas.ts) z.enum constraint. Defense-in-depth: even if a future PR
// re-declared the const inline, the API-side z.enum on DraftSchema rejects any
// string not in the shared list.
//
// UX branches (per /api/ai/draft endpoint contract — Plan 04-08):
//   - 200 OK ⇒ onDraftReady(draftContent), close + reset dialog.
//   - 429 (tier_limit_exceeded) ⇒ inline error copy with "Upgrade to Growth →"
//     link to /pricing (uses tierLimit + currentUsage from response body).
//   - 503 (ai_service_unavailable) ⇒ "AI service temporarily unavailable.
//     Please try again." + retry hint (the user can resubmit; no auto-retry
//     per CONTEXT D-33's maxRetries:0 SDK contract).
//   - Any other non-200 (400 Zod, network throw) ⇒ same 503-equivalent copy.

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { POLICY_CATEGORIES, type PolicyCategory } from '@/lib/policies/categories';

type DialogState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'error_429'; tierLimit: number; currentUsage: number }
  | { kind: 'error_503' };

/**
 * PolicyAiDraftDialog — renders a "Generate with AI" button that opens a modal
 * Dialog with a prompt Textarea + category Select. Submitting posts to
 * /api/ai/draft and hands the resulting raw string to the parent via the
 * `onDraftReady` callback.
 *
 * Props:
 *   - onDraftReady(rawContent): called with the response.draftContent string
 *     when /api/ai/draft returns 200. The parent component (owning the TipTap
 *     editor ref) is responsible for calling editor.commands.setContent(rawContent)
 *     — this dialog never touches the editor directly.
 */
export function PolicyAiDraftDialog({
  onDraftReady,
}: {
  onDraftReady: (rawContent: string) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [policyType, setPolicyType] = useState<PolicyCategory>(POLICY_CATEGORIES[0]);
  const [state, setState] = useState<DialogState>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPrompt('');
    setPolicyType(POLICY_CATEGORIES[0]);
    setState({ kind: 'idle' });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setState({ kind: 'submitting' });

    startTransition(async () => {
      try {
        const res = await fetch('/api/ai/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, policyType }),
        });

        if (res.status === 200) {
          const body = (await res.json()) as { draftContent: string; tokensUsed: number };
          // D-28 + AC-23 — pass RAW STRING to parent. NEVER JSON.parse(draftContent).
          // The parent (which owns the TipTap editor ref) calls
          //   editor.commands.setContent(body.draftContent)
          // TipTap's setContent accepts HTML/markdown/string; JSON.parse on the
          // narrative-prose Draft response would throw SyntaxError.
          onDraftReady(body.draftContent);
          setOpen(false);
          reset();
          return;
        }

        if (res.status === 429) {
          const body = (await res.json()) as {
            error: string;
            tierLimit: number;
            currentUsage: number;
          };
          setState({
            kind: 'error_429',
            tierLimit: body.tierLimit,
            currentUsage: body.currentUsage,
          });
          return;
        }

        // 503 (or any other non-200 — 400/500) → generic AI-unavailable UX.
        // The /api/ai/draft endpoint returns 503 with Retry-After:30 on
        // Anthropic failure (Plan 04-08 + SPEC R7); we surface a static copy
        // and a manual retry hint (no auto-retry per CONTEXT D-33).
        setState({ kind: 'error_503' });
      } catch {
        // Network error / fetch throw — treat as 503-equivalent. No PII leakage.
        setState({ kind: 'error_503' });
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" type="button">
            Generate with AI
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate policy draft with AI</DialogTitle>
          <DialogDescription>
            Describe the policy you want; Claude will draft a starting point you
            can edit.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="ai-draft-prompt">What policy do you need?</Label>
            <Textarea
              id="ai-draft-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              minLength={1}
              maxLength={10_000}
              placeholder="e.g., A 2-page remote-work policy covering eligibility, equipment, and hours."
            />
          </div>
          <div>
            <Label htmlFor="ai-draft-policytype">Category</Label>
            <Select
              value={policyType}
              onValueChange={(v: string | null) => {
                if (v) setPolicyType(v as PolicyCategory);
              }}
            >
              <SelectTrigger id="ai-draft-policytype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {state.kind === 'error_429' ? (
            <p className="text-sm text-destructive">
              You&apos;ve used {state.currentUsage}/{state.tierLimit} drafts this month.{' '}
              <a href="/pricing" className="underline">
                Upgrade to Growth for more →
              </a>
            </p>
          ) : null}

          {state.kind === 'error_503' ? (
            <p className="text-sm text-destructive">
              AI service temporarily unavailable. Please try again in a moment.
            </p>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !prompt.trim()}>
              {isPending ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
