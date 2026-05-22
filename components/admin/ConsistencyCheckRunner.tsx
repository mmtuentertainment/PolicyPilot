'use client';

// ConsistencyCheckRunner — Phase 4 D-21 + D-30 + Plan 04-13 Task 3.
//
// Client Component that polls GET /api/ai/consistency/[batchId] every 30
// seconds while the batch is in_progress. Rendered by the Server Component
// shell at app/(admin)/dashboard/consistency/page.tsx (D-30) when
// BatchJobs.findLatestForOrg returns a row with status='in_progress'.
//
// Resume semantics (D-30): on mount, this component receives the persisted
// anthropicBatchId from the Server Component — NO POST to /api/ai/consistency
// happens here. The Anthropic batch was created by an earlier POST; this
// runner just polls the existing batch. This is the AC-25 mount-time resume
// contract: refreshing the page (or returning later) resumes polling without
// resubmitting work.
//
// 30s polling interval (D-21): the polling endpoint's D-34 25s DB-cache
// stale-window collapses concurrent / rapid polls into 1 Anthropic SDK call
// per 25s per batch — well within Anthropic Tier-1 Batches API's 50RPM
// shared cap at MVP scale. Tab-inactive browser throttling (~1min) further
// reduces. NEVER lower the interval below ~25s — see CONTEXT D-34.
//
// On terminal status (completed | failed): clearInterval + render the
// matching terminal sub-tree inline (ConsistencyFindingsList or
// ConsistencyFailureState). NO router.refresh() needed — the Server
// Component shell only chooses the initial branch, and once we're inside
// the Runner we own the terminal-state UI ourselves.
//
// T-04-13-DV mitigation: 30s interval + 25s server-side stale-window =
// at most 1 Anthropic retrieve every 25-30s per batch even if the user
// has multiple tabs open. See threat model in 04-13-PLAN.md.

import { useEffect, useState } from 'react';
import { ConsistencyFindingsList } from '@/components/admin/ConsistencyFindingsList';
import { ConsistencyFailureState } from '@/components/admin/ConsistencyFailureState';

type Status = 'in_progress' | 'completed' | 'failed';

const POLL_INTERVAL_MS = 30_000;

/**
 * Minutes-ago helper for the "Resuming check started Xm ago" copy (D-30) /
 * "Checking... (started Xm ago)" copy (D-21). Floors negative deltas to 0 to
 * defend against clock-skew between client and server.
 */
function minutesAgo(since: Date): number {
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 60_000));
}

/**
 * Consistency Check polling Client Component (D-21 + D-30).
 *
 * Props:
 *   - batchId: Anthropic batch ID, persisted on batch_jobs at submit time
 *     (Plan 04-10). MUST be the value from the Server Component shell's
 *     BatchJobs.findLatestForOrg call — passing a fresh / different ID
 *     would skip the AC-25 resume contract and re-poll a different batch.
 *   - startedAt: batch_jobs.createdAt from the Server Component shell. Drives
 *     the "started Xm ago" status indicator. Server passes a Date; this
 *     component coerces to a Date if it arrives serialized.
 */
export function ConsistencyCheckRunner({
  batchId,
  startedAt,
}: {
  batchId: string;
  startedAt: Date;
}): React.JSX.Element {
  const [status, setStatus] = useState<Status>('in_progress');
  const [findings, setFindings] = useState<unknown>(undefined);
  const [errored, setErrored] = useState(false);

  // The Server Component may serialize `startedAt` as a string when crossing
  // the Server→Client boundary. Coerce defensively so minutesAgo always sees
  // a real Date instance regardless of how the prop arrived.
  const startedAtDate =
    startedAt instanceof Date ? startedAt : new Date(startedAt);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/ai/consistency/${batchId}`);
        if (cancelled) return;
        if (res.status === 503) {
          // Polling endpoint surfaced an Anthropic 5xx — show retry copy
          // but keep the interval alive (next tick may succeed). Don't flip
          // to terminal state on a transient backend failure.
          setErrored(true);
          return;
        }
        const body = (await res.json()) as { status: Status; result?: unknown };
        if (cancelled) return;
        // Clear any prior poll-error banner if this response succeeded.
        if (errored) setErrored(false);
        setStatus(body.status);
        if (body.status === 'completed') {
          setFindings(body.result);
        }
      } catch {
        if (!cancelled) setErrored(true);
      }
    }

    // Fire once on mount, then every POLL_INTERVAL_MS.
    poll();
    const interval = setInterval(() => {
      // Terminal-state guard: once status flipped, the next render will
      // unmount this branch (we render the terminal sub-tree instead) and
      // the cleanup below will clearInterval. The check here is a belt-and-
      // braces defense against React batching delays between setStatus and
      // re-render.
      if (status === 'completed' || status === 'failed') {
        clearInterval(interval);
        return;
      }
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // status in deps: when status transitions to a terminal value, the effect
    // re-runs and the new interval immediately clears via the guard above.
    // batchId in deps: prop change (shouldn't happen mid-mount but safe).
    // errored intentionally NOT in deps: we read it inside poll() to decide
    // whether to clear the banner; including it would re-arm the interval on
    // every banner toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId, status]);

  if (status === 'completed') {
    return <ConsistencyFindingsList result={findings} />;
  }
  if (status === 'failed') {
    return <ConsistencyFailureState />;
  }

  // in_progress — D-21 status indicator copy.
  const mins = minutesAgo(startedAtDate);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Consistency check in progress</h2>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {mins === 0
          ? 'Checking your policies... (just started)'
          : `Checking your policies... (started ${mins}m ago)`}
      </p>
      {errored && (
        <p className="text-sm text-destructive">
          Polling error. Retrying in 30 seconds...
        </p>
      )}
    </div>
  );
}
