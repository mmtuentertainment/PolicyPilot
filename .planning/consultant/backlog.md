# Consultant Backlog — PolicyPilot

Updated: 2026-05-31 - Phase 6 PR #32 green ship-evidence refresh

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
| 4 | Implement Stripe Checkout + 5-event idempotent webhook. | 6 | 5 | 4 | 5 | 3 | 3 | 4 | 16 | Hardening - UAT complete / hosted checks green | Foundation, webhook, tier predicate, checkout/pricing intent, Customer Portal/settings, and verifier/UAT checklist are complete. Rows 1-11 PASS with masked evidence; hosted PR #32 checks are green/acceptable at `fe60709`; Phase 6 remains draft/unmerged until Matthew chooses the ship path. |
| 5 | Add tier-gating proof for AI and Growth+ features. | 6 | 5 | 3 | 4 | 3 | 4 | 3 | 16 | Hardening - UAT complete / draft PR open | Plan 06-03 added real maxUsers count + Phase-4 403/429 regression guard; row 5 PASSed and renewal/failure UAT rows 9-10 are now PASS. |
| 6 | Design idempotent reminder send model. | 7 | 3 | 4 | 5 | 4 | 4 | 2 | 18 | Pending | Define send-state key before building email worker. |
| 7 | Implement minimal Railway reminder worker. | 7 | 3 | 4 | 4 | 4 | 3 | 4 | 14 | Pending | Build one reminder type before expanding templates. |
| 8 | Ship CSV export for acknowledgment evidence. | 8 | 5 | 4 | 3 | 5 | 5 | 2 | 20 | Pending | Favor simple CSV first; dashboard charts can follow. |
| 9 | Run end-to-end beat-manual acceptance path. | 8 | 5 | 5 | 4 | 5 | 4 | 3 | 20 | Pending | Measure signup → draft → publish → assign → acknowledge → export. |
| 10 | Phase 5 shipped-state bookkeeping. | 5 | 2 | 3 | 4 | 3 | 5 | 1 | 16 | Done in this patch | Reconciled `STATE`, `ROADMAP`, and consultant packets with PR #27 merge facts. |
| 11 | Finish Stripe test-clock rows 9-10. | 6 | 5 | 4 | 5 | 3 | 4 | 2 | 19 | Done | True next-period `invoice.paid` renewal and failing-card `invoice.payment_failed`/`past_due` rows are PASS with masked-only evidence in `06-UAT.md`. |
| 12 | Reconcile Stripe CLI/login and app test credentials. | 6 | 5 | 3 | 5 | 2 | 5 | 1 | 19 | Mitigated for UAT / monitor | Local UAT used the app test-account override. Future Stripe UAT must use the same override or a relogged CLI profile; do not rely on the default mismatched CLI profile. |
| 13 | Delete throwaway billing UAT test objects. | 6 | 1 | 2 | 2 | 1 | 5 | 1 | 10 | Optional/operator cleanup | Operator may delete the "Acme Test Co" Clerk org and the canceled test subscription. |
| 14 | Make dev org provisioning expectations explicit. | 6+ | 2 | 3 | 3 | 1 | 5 | 1 | 13 | Pending/process | Dev-created orgs without a webhook tunnel may hit `OrgNotProvisionedError`; document the tunnel/provisioning path as process, not Phase 6 code defect. |

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

1. Plans 06-01 through 06-06 are complete; local `pnpm db:verify`, `pnpm verify:phase-6`, Stripe test-mode UAT rows 1-11, and hosted PR #32 checks are green/acceptable at `fe60709`; Phase 6 is still not shipped.
2. Operator-only next step: decide whether to keep PR #32 draft for more review or proceed with the Phase 6 ship path. SF-WHSEC-1 remains a follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation.
3. Next Codex slice if Matthew chooses ship: final guarded PR closeout without starting Phase 7, deleting branches, exposing secrets, or weakening gates.

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
