# Consultant Backlog — PolicyPilot

Updated: 2026-05-28

Use this backlog for consultant-level sequencing only. It does not replace `.planning/ROADMAP.md` or phase plans. The purpose is to keep strategic pressure on the smallest high-value moves that improve launch readiness, revenue readiness, and trust.

Scoring:

`Priority = Revenue + Pain + Risk Reduction + Beat-Manual + Reversibility - Effort`

Each input is scored 1-5. Higher priority ships first unless blocked by phase discipline.

---

## Top Queue

| Rank | Item | Phase | Revenue | Pain | Risk Reduction | Beat-Manual | Reversibility | Effort | Priority | Status | Next micro-batch |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | Close Phase 5 hardening and reconcile audit artifacts. | 5 | 5 | 5 | 5 | 5 | 3 | 3 | 20 | Active | Run the smallest remediation batch needed to make Phase 5 ship-clean. |
| 2 | Prove append-only acknowledgment behavior through executable gates. | 5 | 5 | 5 | 5 | 5 | 3 | 3 | 20 | Active | Keep immutability checks in `verify:phase-5`; add only targeted tests if audit exposes a gap. |
| 3 | Prepare Phase 6 Stripe webhook spec before implementation. | 6 | 5 | 3 | 5 | 3 | 4 | 2 | 18 | Pending | Draft endpoint contract for all 5 events, idempotency, and 403 upgrade behavior. |
| 4 | Implement Stripe Checkout + 5-event idempotent webhook. | 6 | 5 | 4 | 5 | 3 | 3 | 4 | 16 | Pending | Start only after Phase 5 is closed or paused by decision. |
| 5 | Add tier-gating proof for AI and Growth+ features. | 6 | 5 | 3 | 4 | 3 | 4 | 3 | 16 | Pending | Ensure insufficient plan returns 403 + upgrade prompt where applicable. |
| 6 | Design idempotent reminder send model. | 7 | 3 | 4 | 5 | 4 | 4 | 2 | 18 | Pending | Define send-state key before building email worker. |
| 7 | Implement minimal Railway reminder worker. | 7 | 3 | 4 | 4 | 4 | 3 | 4 | 14 | Pending | Build one reminder type before expanding templates. |
| 8 | Ship CSV export for acknowledgment evidence. | 8 | 5 | 4 | 3 | 5 | 5 | 2 | 20 | Pending | Favor simple CSV first; dashboard charts can follow. |
| 9 | Run end-to-end beat-manual acceptance path. | 8 | 5 | 5 | 4 | 5 | 4 | 3 | 20 | Pending | Measure signup → draft → publish → assign → acknowledge → export. |
| 10 | Convert consultant PR from draft to merge-ready after review. | Cross-cutting | 2 | 2 | 3 | 2 | 5 | 1 | 13 | Active | Add remaining files, update PR body, then mark ready when accepted. |

---

## Scope Brake

Do not prioritize these until the core revenue loop is proven:

- Slack or broad HRIS integrations.
- Custom compliance frameworks beyond the existing policy/audit trail MVP.
- Additional AI modes beyond draft, summary, Q&A, and consistency check.
- Heavy analytics before CSV/export proof exists.
- Multi-team project-management ceremony beyond the current solo-with-AI workflow.

---

## Next Recommended Micro-Batch

1. Finish the consultant operating file PR.
2. Return to Phase 5 hardening.
3. Close or explicitly pause Phase 5 before Phase 6 billing starts.

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
