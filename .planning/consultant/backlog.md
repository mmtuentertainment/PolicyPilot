# Consultant Backlog — PolicyPilot

Updated: 2026-05-29 - Phase 6 Plan 06-03 tier gates complete

Use this backlog for consultant-level sequencing only. It does not replace `.planning/ROADMAP.md` or phase plans. The purpose is to keep strategic pressure on the smallest high-value moves that improve launch readiness, revenue readiness, and trust.

Scoring:

`Priority = Revenue + Pain + Risk Reduction + Beat-Manual + Reversibility - Effort`

Each input is scored 1-5. Higher priority ships first unless blocked by phase discipline.

---

## Top Queue

| Rank | Item | Phase | Revenue | Pain | Risk Reduction | Beat-Manual | Reversibility | Effort | Priority | Status | Next micro-batch |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | Review and merge the operating-layer docs PR. | Cross-cutting | 2 | 2 | 3 | 2 | 5 | 1 | 13 | Done | Merged as PR #30 at `ee50880`; no further action. |
| 2 | Prepare Phase 6 Stripe webhook spec before implementation. | 6 | 5 | 3 | 5 | 3 | 4 | 2 | 18 | Done | spec+discuss+plan complete on `gsd/phase-6-billing`; gsd-plan-checker PASSED (2026-05-29). |
| 3 | Preserve append-only acknowledgment behavior through future gates. | 5+ | 5 | 5 | 5 | 5 | 3 | 3 | 20 | Shipped / monitor | Keep immutability checks active when later phases touch policy or acknowledgment surfaces. |
| 4 | Implement Stripe Checkout + 5-event idempotent webhook. | 6 | 5 | 4 | 5 | 3 | 3 | 4 | 16 | Planned - 06-01/06-03 complete | Foundation, webhook, and tier predicate slices are complete locally; Plans 06-04..06-06 remain locked + plan-checked. Next smallest slice is Plan 06-04 checkout/pricing only. |
| 5 | Add tier-gating proof for AI and Growth+ features. | 6 | 5 | 3 | 4 | 3 | 4 | 3 | 16 | Hardening - 06-03 complete | Plan 06-03 added real maxUsers count + Phase-4 403/429 regression guard; 06-06 UAT still proves Starter-to-Growth 403 + `/pricing`. |
| 6 | Design idempotent reminder send model. | 7 | 3 | 4 | 5 | 4 | 4 | 2 | 18 | Pending | Define send-state key before building email worker. |
| 7 | Implement minimal Railway reminder worker. | 7 | 3 | 4 | 4 | 4 | 3 | 4 | 14 | Pending | Build one reminder type before expanding templates. |
| 8 | Ship CSV export for acknowledgment evidence. | 8 | 5 | 4 | 3 | 5 | 5 | 2 | 20 | Pending | Favor simple CSV first; dashboard charts can follow. |
| 9 | Run end-to-end beat-manual acceptance path. | 8 | 5 | 5 | 4 | 5 | 4 | 3 | 20 | Pending | Measure signup → draft → publish → assign → acknowledge → export. |
| 10 | Phase 5 shipped-state bookkeeping. | 5 | 2 | 3 | 4 | 3 | 5 | 1 | 16 | Done in this patch | Reconciled `STATE`, `ROADMAP`, and consultant packets with PR #27 merge facts. |

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

1. Plans 06-01 through 06-03 are complete locally; Phase 6 is still not shipped.
2. Next smallest slice is Plan 06-04 checkout/pricing only.
3. Preserve tenant-isolation + append-only acknowledgment gates as Phase 6 executes (Phase 6 adds NO org-delete path; `subscription.deleted` downgrades to Starter and preserves rows - SF-CASCADE-AUDIT stays deferred).

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
