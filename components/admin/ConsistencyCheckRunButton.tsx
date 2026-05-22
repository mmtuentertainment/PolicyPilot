'use client';

// ConsistencyCheckRunButton — Phase 4 SPEC R5 + D-30 + Plan 04-13 Task 2.
//
// SHARED Client Component used by ConsistencyEmptyState ("Run consistency
// check") and ConsistencyFailureState ("Run again"). Posts to /api/ai/consistency
// (Plan 04-10) and on success calls router.refresh() so the
// /dashboard/consistency Server Component shell (Plan 04-13 Task 4 / D-30)
// re-renders with the fresh batch_jobs row (which by then will have
// status='in_progress' + an Anthropic batch ID) — flipping the page tree to
// the in_progress Runner branch without a follow-up form submit.
//
// UX branches (per /api/ai/consistency endpoint contract — Plan 04-10):
//   - 200 ⇒ router.refresh() (server re-renders → Runner mounts with persisted batchId)
//   - 403 ⇒ "Your plan does not include Consistency Check. Upgrade to Growth →"
//     (per SPEC R5 tier-bound gating via Plan 04-10's requireTierLimit; the
//     'consistencyCheck' feature is Growth+ — Starter admins get 403 here).
//   - 503 ⇒ "AI service temporarily unavailable. Please try again." (no
//     auto-retry — CONTEXT D-33 pins SDK maxRetries:0).
//   - Any other non-200 (400 Zod, network throw) ⇒ same 503-equivalent copy.
//
// No tier check in this Client Component: the 403 path is enforced server-side
// by /api/ai/consistency (the endpoint's requireTierLimit('consistencyCheck')
// throws TierLimitExceededError with statusCode=403). The client just renders
// the error copy returned by the server — defense-in-depth pattern from
// Phase 3 + Plan 04-12.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

type ButtonState = 'idle' | 'loading' | 'error_403' | 'error_503';

/**
 * "Run consistency check" / "Run again" admin button. Renders inside
 * ConsistencyEmptyState and ConsistencyFailureState on /dashboard/consistency.
 *
 * Props:
 *   - label (optional): button text. Defaults to "Run consistency check"
 *     for EmptyState; FailureState passes "Run again" per the failure-recovery
 *     copy in PATTERNS § Pattern H.
 */
export function ConsistencyCheckRunButton({
  label = 'Run consistency check',
}: {
  label?: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>('idle');

  async function run() {
    setState('loading');
    try {
      const res = await fetch('/api/ai/consistency', { method: 'POST' });
      if (res.status === 200) {
        setState('idle');
        // router.refresh() re-fetches the Server Component shell; the new
        // batch_jobs row now has status='in_progress', so the shell renders
        // the ConsistencyCheckRunner branch (D-30 mount-time resume flow).
        router.refresh();
        return;
      }
      if (res.status === 403) {
        setState('error_403');
        return;
      }
      // 503 (Anthropic 5xx per SPEC R7), 400 (Zod), network errors — all map
      // to the same generic "AI service temporarily unavailable" UX.
      setState('error_503');
    } catch {
      setState('error_503');
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={state === 'loading'}
        onClick={run}
      >
        {state === 'loading' ? 'Submitting...' : label}
      </Button>
      {state === 'error_403' && (
        <p className="text-sm text-destructive">
          Your plan does not include Consistency Check.{' '}
          <a href="/pricing" className="underline">
            Upgrade to Growth →
          </a>
        </p>
      )}
      {state === 'error_503' && (
        <p className="text-sm text-destructive">
          AI service temporarily unavailable. Please try again.
        </p>
      )}
    </div>
  );
}
