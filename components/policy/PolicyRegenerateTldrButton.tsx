'use client';

// PolicyRegenerateTldrButton — Phase 4 SPEC R3 admin action (Plan 04-12 Task 2).
//
// Sibling Client Component of PolicyView (Server Component). Rendered next to
// PolicyView on /policies/[id]; POSTs to /api/ai/summary with the current
// policyId, then calls router.refresh() to re-render the Server Component
// PolicyView with the freshly-set policies.tldrSummary value.
//
// Idempotence (SPEC R3): if /api/ai/summary detects an existing tldrSummary,
// it returns the cached value WITHOUT an Anthropic call and WITHOUT a new
// ai_generations row. The user sees the same TL;DR; router.refresh() re-renders
// with no change (same UX-state-equivalent outcome).
//
// Error UX: on /api/ai/summary 503 (Anthropic failure per SPEC R7), show a
// short inline "AI service temporarily unavailable" copy + retry hint (the
// user can re-click). No auto-retry per CONTEXT D-33 (maxRetries:0).

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type ButtonState = 'idle' | 'loading' | 'error_503';

/**
 * "Regenerate TL;DR" admin button. Renders alongside PolicyView (Server
 * Component) on /policies/[id]. The (admin) route group + middleware already
 * gate the page on admin role; this component does not add additional gating.
 */
export function PolicyRegenerateTldrButton({
  policyId,
}: {
  policyId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>('idle');

  async function regenerate() {
    setState('loading');
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policyId }),
      });
      if (res.status === 200) {
        setState('idle');
        // router.refresh() re-fetches the Server Component PolicyView with
        // the freshly-set policies.tldrSummary. The Server Component reads
        // through withOrgScope (ADR-025), so RLS + application-layer
        // where(eq(orgId)) both fire on the refetch.
        router.refresh();
        return;
      }
      // 503 (or any other non-200) → generic AI-unavailable UX.
      setState('error_503');
    } catch {
      setState('error_503');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={state === 'loading'}
        onClick={regenerate}
      >
        {state === 'loading' ? 'Regenerating...' : 'Regenerate TL;DR'}
      </Button>
      {state === 'error_503' ? (
        <span className="text-sm text-destructive">
          AI service temporarily unavailable. Try again.
        </span>
      ) : null}
    </div>
  );
}
