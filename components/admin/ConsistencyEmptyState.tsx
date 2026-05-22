// ConsistencyEmptyState — Phase 4 D-30 + Plan 04-13 Task 1.
//
// Server Component empty-state for /dashboard/consistency when batch_jobs has
// no row for the current org (the first-visit case per the Server Component
// shell at app/(admin)/dashboard/consistency/page.tsx). Hosts the
// ConsistencyCheckRunButton (Plan 04-13 Task 2) that POSTs /api/ai/consistency
// and flips the page tree to the Runner branch on success.
//
// Card-based composition mirrors PATTERNS § Pattern H — exact analog is
// app/(admin)/policies/page.tsx:135-152 "No policies yet" empty state.
//
// No 'use client' directive: pure Server Component (the Run button itself is
// the only Client Component on this branch).

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ConsistencyCheckRunButton } from '@/components/admin/ConsistencyCheckRunButton';

/**
 * Empty-state Card rendered by ConsistencyPage (D-30) when
 * BatchJobs.findLatestForOrg returns undefined for the current org.
 *
 * Copy adapted from PATTERNS § Pattern H + CONTEXT specifics for the
 * consistency-check surface (SPEC R5 — Growth+ admin can run a Sonnet 4.6
 * Batches API scan of the published policy library).
 */
export function ConsistencyEmptyState(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No consistency checks yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Run an AI-powered review of your full published policy library.
          Claude will identify contradictions, conflicting values, and
          undefined terms across policies.
        </p>
        <ConsistencyCheckRunButton />
      </CardContent>
    </Card>
  );
}
