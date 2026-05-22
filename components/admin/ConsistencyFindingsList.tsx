'use client';

// ConsistencyFindingsList — Phase 4 D-23 + SPEC R5 + Plan 04-13 Task 1.
//
// Severity-grouped collapsible findings list for /dashboard/consistency when
// BatchJobs.findLatestForOrg returns a row with status='completed' (D-30).
// Each finding renders as a stateful row with click-to-expand description;
// multiple findings can be open simultaneously (per D-23 — Collapsible
// semantics, NOT Accordion which would force single-open).
//
// Severity ordering (locked by SPEC R5): high → medium → low. Findings of
// each severity are grouped together with a header showing the count.
//
// D-23 implementation choice: hand-rolled stateful expand/collapse instead
// of installing the shadcn Collapsible primitive. Per Plan 04-13 task body
// note (lines 219-225 in 04-13-PLAN.md), this is the recommended path —
// avoids a shadcn install in a tightly-scoped plan and keeps the per-row
// open state in a single component without Radix Open/onOpenChange juggling.
//
// 'use client' is required: per-finding expand state lives in useState; a
// Server Component can't host the interactive expand UI. The Server Component
// shell at app/(admin)/dashboard/consistency/page.tsx (D-30) passes the
// already-translated batch_jobs.resultJson to this component as props — no
// Anthropic call, no DB call inside this Client Component.
//
// T-04-13-DT mitigation (XSS in finding.description): React escapes text
// content by default. NO dangerouslySetInnerHTML on this branch. The
// description string flows from Anthropic → batch_jobs.resultJson (jsonb in
// the DB) → props.result → text node — never bypasses the React escape.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

/**
 * Consistency finding shape — matches the JSON contract documented in
 * reference/PROMPTS.md for the Consistency Check system prompt. The
 * polling endpoint (Plan 04-10) translates the Anthropic batch response
 * into this shape before writing to batch_jobs.resultJson, so the data
 * flowing into this component is already in the canonical SPEC shape.
 *
 * issue_type: 'contradiction' (two policies say opposite things),
 *             'conflicting_value' (e.g., different numeric thresholds),
 *             'undefined_term' (term used but not defined anywhere).
 * severity:   high → medium → low (locked by SPEC R5 ordering).
 */
type ConsistencyFinding = {
  policy_a: string;
  policy_b: string;
  issue_type: 'contradiction' | 'conflicting_value' | 'undefined_term';
  description: string;
  severity: 'high' | 'medium' | 'low';
};

const SEVERITY_ORDER: ConsistencyFinding['severity'][] = [
  'high',
  'medium',
  'low',
];

function groupBySeverity(
  findings: ConsistencyFinding[],
): Record<ConsistencyFinding['severity'], ConsistencyFinding[]> {
  const out: Record<ConsistencyFinding['severity'], ConsistencyFinding[]> = {
    high: [],
    medium: [],
    low: [],
  };
  for (const f of findings) {
    // Defensive: skip findings with unknown severity (shouldn't happen given
    // the polling endpoint's translation step, but be safe against malformed
    // Anthropic responses that slipped through).
    if (f.severity in out) {
      out[f.severity].push(f);
    }
  }
  return out;
}

/**
 * Renders the consistency-check findings list, grouped by severity with
 * click-to-expand descriptions per D-23.
 *
 * Props:
 *   - result: typed as `unknown` because the batch_jobs.resultJson column
 *     is jsonb in the DB and Drizzle infers it as unknown. The runtime
 *     Array.isArray guard narrows to ConsistencyFinding[] — invalid shapes
 *     fall through to the empty-list branch (no contradictions detected).
 *
 * Empty / no-findings render: "No contradictions or conflicts detected." —
 * not the same as the EmptyState (which fires when no batch has run); this
 * branch fires when a batch ran but Claude returned an empty findings array
 * (the success case where the policy library is internally consistent).
 */
export function ConsistencyFindingsList({
  result,
}: {
  result: unknown;
}): React.JSX.Element {
  const findings = Array.isArray(result) ? (result as ConsistencyFinding[]) : [];
  const grouped = groupBySeverity(findings);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (findings.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-2">
          Consistency check complete
        </h2>
        <p className="text-sm text-muted-foreground">
          No contradictions or conflicts detected.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="Consistency findings">
      <h2 className="text-xl font-semibold mb-4">
        Consistency findings ({findings.length})
      </h2>
      {SEVERITY_ORDER.map((sev) => {
        const items = grouped[sev];
        if (items.length === 0) return null;
        return (
          <div key={sev} className="mb-6">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">
              {sev} ({items.length})
            </h3>
            <ul className="space-y-2">
              {items.map((f, idx) => {
                const id = `${sev}-${idx}`;
                const isOpen = expanded.has(id);
                return (
                  <li key={id} className="border rounded p-3">
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      aria-expanded={isOpen}
                      className="w-full text-left flex items-center justify-between gap-3"
                    >
                      <span className="flex-1">
                        <span className="font-medium">{f.policy_a}</span>
                        <span className="mx-2 text-muted-foreground">vs</span>
                        <span className="font-medium">{f.policy_b}</span>
                      </span>
                      <Badge
                        variant={sev === 'high' ? 'destructive' : 'outline'}
                      >
                        {f.issue_type.replace('_', ' ')}
                      </Badge>
                    </button>
                    {isOpen && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {f.description}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
