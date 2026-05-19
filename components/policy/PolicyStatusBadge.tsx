// PolicyStatusBadge — Server Component (D-07 + UI-SPEC §Color).
//
// Maps PolicyStatus → shadcn Badge variant per the UI-SPEC table:
//   draft        → outline      (bordered, no fill, neutral text)
//   under_review → secondary    (muted gray fill)
//   published    → default      (solid --primary near-black)
//   archived     → outline+muted (custom dimmed)
//
// The installed base-nova palette is neutral OKLCH grayscale; the visual
// hierarchy is outline → secondary fill → solid → muted. Operator may
// theme to semantic colors (green/yellow) in a later phase; Phase 3 stays
// on-disk-palette (UI-SPEC §Color rationale).
//
// Exhaustive switch + Record<PolicyStatus, string> lookup gives TS
// exhaustiveness checking — adding a new PolicyStatus would surface as a
// tsc error here, not as a UI gap at render time.

import { Badge } from '@/components/ui/badge';
import type { PolicyStatus } from '@/lib/policies/state-machine';

const LABEL_BY_STATUS: Record<PolicyStatus, string> = {
  draft: 'Draft',
  under_review: 'Under Review',
  published: 'Published',
  archived: 'Archived',
};

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  switch (status) {
    case 'draft':
      return <Badge variant="outline">{LABEL_BY_STATUS.draft}</Badge>;
    case 'under_review':
      return <Badge variant="secondary">{LABEL_BY_STATUS.under_review}</Badge>;
    case 'published':
      return <Badge variant="default">{LABEL_BY_STATUS.published}</Badge>;
    case 'archived':
      return (
        <Badge
          variant="outline"
          className="text-muted-foreground border-muted-foreground/40"
        >
          {LABEL_BY_STATUS.archived}
        </Badge>
      );
  }
}
