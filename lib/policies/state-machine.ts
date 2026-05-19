// lib/policies/state-machine.ts
// Pure state-machine module (D-03). No DB access, no Drizzle import,
// no `'server-only'` directive (genuinely pure — testable in node-only
// environment without setup; consumed only by lib/policies/transitions.ts
// and components/policy/PolicyTransitionMenu.tsx).

export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';

/**
 * Locked transition DAG (REQ-policy-lifecycle):
 *   draft        → under_review | published       (admin can publish direct; Phase 6 gates Growth+)
 *   under_review → published | draft              (approve or reject)
 *   published    → archived | draft               ('draft' only via editPublished orchestrator)
 *   archived     → draft                          (restore creates a new draft)
 *
 * This table is the SINGLE source of truth. Phase 3 orchestrators
 * (lib/policies/transitions.ts) validate against it; the client transition
 * menu (components/policy/PolicyTransitionMenu.tsx) renders from it.
 * Phase 6 (Billing / tier gating) layers Growth+ approval-required
 * checks ON TOP of this module — it does not modify the table.
 */
export const ALLOWED_TRANSITIONS = {
  draft:        ['under_review', 'published'] as const,
  under_review: ['published', 'draft'] as const,
  published:    ['archived', 'draft'] as const,
  archived:     ['draft'] as const,
} satisfies Record<PolicyStatus, readonly PolicyStatus[]>;

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly PolicyStatus[]).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: PolicyStatus, public readonly to: PolicyStatus) {
    super(
      `Illegal policy transition: ${from} → ${to}. Allowed: ${ALLOWED_TRANSITIONS[from].join(', ')}`,
    );
    this.name = 'IllegalTransitionError';
  }
}
