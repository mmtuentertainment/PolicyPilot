// components/policy/AckStatusBadge.tsx — Plan 05-07. D-11 + D-12 — exhaustive-switch
// component on D-04 ackState enum.
//
// Pattern locked by D-11: shadcn Badge with className override (NOT a new CVA
// variant in components/ui/badge.tsx). Mirrors PolicyStatusBadge.tsx:18-46
// structure; the 'stale' branch mirrors the 'archived' branch's outline+override
// pattern.
//
// Three branches:
// - 'none'    → null (no badge; plain 'Acknowledge' button renders separately in
//               AcknowledgeButton client component per Plan 05-05)
// - 'stale'   → amber outline badge 'Requires re-acknowledgment' + a
//               'Re-acknowledge' button (button is rendered by AcknowledgeButton —
//               the badge is JUST the visual indicator)
// - 'current' → green ✓ span with formatted date, NOT a Badge (different visual
//               per D-11)
//
// Server Component — no 'use client' directive; pure render based on props,
// no state, no effects, no interactivity. D-04's ackState enum is canonical in
// Plan 05-03's Policies.listAssignedAndPublishedForUser return type, so the
// exhaustive switch propagates compile-time safety: adding a 4th union member
// surfaces this file at tsc time (no default branch needed).

import { Badge } from '@/components/ui/badge';

type AckState = 'none' | 'current' | 'stale';

export function AckStatusBadge({
  ackState,
  ackedAt,
}: {
  ackState: AckState;
  ackedAt: Date | null;
}) {
  switch (ackState) {
    case 'none':
      // No badge. Plain "Acknowledge" CTA renders separately (AcknowledgeButton in Plan 05-05).
      return null;
    case 'stale':
      // D-11 amber outline override — NOT a new CVA variant in badge.tsx.
      // Mirror PolicyStatusBadge.tsx:35-44 'archived' className-override pattern.
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">
          Requires re-acknowledgment
        </Badge>
      );
    case 'current':
      // D-11 explicitly NOT a Badge — different visual treatment (green ✓ + timestamp).
      // The `ackedAt && ...` guard handles the defensive TypeScript-prefers-this
      // edge case where Drizzle returns null for acknowledgedAt (shouldn't happen
      // for ackState='current' since the LEFT JOIN matched on currentAck.id).
      return (
        <span className="inline-flex items-center gap-1 text-sm text-green-700">
          ✓ Acknowledged on {ackedAt && new Date(ackedAt).toLocaleDateString('en-US')}
        </span>
      );
  }
}
