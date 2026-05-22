// ConsistencyFailureState — Phase 4 D-30 + Plan 04-13 Task 1.
//
// Server Component failure-state for /dashboard/consistency when
// BatchJobs.findLatestForOrg returns a row with status='failed'. Rendered by
// the Server Component shell (D-30 branching at
// app/(admin)/dashboard/consistency/page.tsx) when the most-recent batch
// terminated unsuccessfully.
//
// The "Run again" CTA submits a fresh /api/ai/consistency POST via
// ConsistencyCheckRunButton (Plan 04-13 Task 2). The new batch_jobs row
// replaces the failed one as the new latest, flipping the Server Component
// branch back to the in_progress Runner on next render.
//
// Card-based composition mirrors PATTERNS § Pattern H — analog is the empty-
// state card in app/(admin)/policies/page.tsx:135-152, adapted for the
// failure-recovery copy in PATTERNS § Pattern H (lines 1716-1718).
//
// No 'use client' directive: pure Server Component. The Run again button
// itself is the only Client Component on this branch.

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConsistencyCheckRunButton } from '@/components/admin/ConsistencyCheckRunButton';

/**
 * Failure-state Card rendered by ConsistencyPage (D-30) when
 * BatchJobs.findLatestForOrg returns a row with status='failed'. The
 * "Run again" button posts a fresh consistency check; the resulting new
 * batch_jobs row supersedes the failed one as the latest for the org.
 *
 * Note: the failed batch_jobs row remains in the DB (append-only audit
 * trail spirit, ADR-018) — the Server Component just selects the most
 * recent row, which is the one this CTA creates.
 */
export function ConsistencyFailureState(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consistency check failed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The most recent consistency check did not complete successfully.
          You can run it again.
        </p>
        <ConsistencyCheckRunButton label="Run again" />
      </CardContent>
    </Card>
  );
}
