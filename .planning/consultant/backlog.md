# Consultant Backlog — PolicyPilot

Updated: 2026-06-04 - approvalWorkflows tier-gate gap surfaced (rank 16 / risk R-017); stale dead-branch guard retired (`gsd/phase-6-billing` deleted)

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
| 4 | Implement Stripe Checkout + 5-event idempotent webhook. | 6 | 5 | 4 | 5 | 3 | 3 | 4 | 16 | Shipped / monitor | Foundation, webhook, tier predicate, checkout/pricing intent, Customer Portal/settings, and verifier/UAT checklist shipped via PR #32 at `243067e`. Rows 1-11 PASS with masked evidence; hosted pre-merge PR #32 checks were green/acceptable at `1abca44`. |
| 5 | Add tier-gating proof for AI and Growth+ features. | 6 | 5 | 3 | 4 | 3 | 4 | 3 | 16 | Shipped / monitor | Plan 06-03 shipped via PR #32 with real maxUsers count + Phase-4 403/429 regression guard; row 5 PASSed and renewal/failure UAT rows 9-10 are PASS. |
| 6 | Design idempotent reminder send model. | 7 | 3 | 4 | 5 | 4 | 4 | 2 | 18 | Pending | Define send-state key before building email worker. |
| 7 | Implement minimal Railway reminder worker. | 7 | 3 | 4 | 4 | 4 | 3 | 4 | 14 | Pending | Build one reminder type before expanding templates. |
| 8 | Ship CSV export for acknowledgment evidence. | 8 | 5 | 4 | 3 | 5 | 5 | 2 | 20 | Pending | Favor simple CSV first; dashboard charts can follow. |
| 9 | Run end-to-end beat-manual acceptance path. | 8 | 5 | 5 | 4 | 5 | 4 | 3 | 20 | Pending | Measure signup → draft → publish → assign → acknowledge → export. |
| 10 | Phase 5 shipped-state bookkeeping. | 5 | 2 | 3 | 4 | 3 | 5 | 1 | 16 | Done in this patch | Reconciled `STATE`, `ROADMAP`, and consultant packets with PR #27 merge facts. |
| 11 | Finish Stripe test-clock rows 9-10. | 6 | 5 | 4 | 5 | 3 | 4 | 2 | 19 | Done | True next-period `invoice.paid` renewal and failing-card `invoice.payment_failed`/`past_due` rows are PASS with masked-only evidence in `06-UAT.md`. |
| 12 | Reconcile Stripe CLI/login and app test credentials. | 6 | 5 | 3 | 5 | 2 | 5 | 1 | 19 | Mitigated for UAT / monitor | Local UAT used the app test-account override. Future Stripe UAT must use the same override or a relogged CLI profile; do not rely on the default mismatched CLI profile. |
| 13 | Delete throwaway billing UAT test objects. | 6 | 1 | 2 | 2 | 1 | 5 | 1 | 10 | Optional/operator cleanup | Operator may delete the "Acme Test Co" Clerk org and the canceled test subscription. |
| 14 | Make dev org provisioning expectations explicit. | 6+ | 2 | 3 | 3 | 1 | 5 | 1 | 13 | Pending/process | Dev-created orgs without a webhook tunnel may hit `OrgNotProvisionedError`; document the tunnel/provisioning path as process, not Phase 6 code defect. |
| 15 | Tier B: provision prod Supabase (Pro+PITR) + first working Vercel production deploy (runtime env/secrets + staged migrations). | Cross-cutting/Infra | 4 | 3 | 4 | 2 | 3 | 4 | 12 | Pending / operator-gated | Surfaced by `fix/db-lazy-init`: prod has never deployed (404 `DEPLOYMENT_NOT_FOUND`; CLI deploys frozen at `bae9174`). The lazy-db fix unblocks the build-crash class but is necessary-but-not-sufficient. Operator + Codex own provisioning + secrets; read-only on secrets this session (risks R-015/R-016). |
| 16 | approvalWorkflows tier gate unimplemented — the Growth+ `TIER_LIMITS.approvalWorkflows` flag is enforced nowhere; `requireTierLimit` is called only in `app/api/ai/draft/route.ts:61` + `app/api/ai/consistency/route.ts:72`, never in `lib/policies/`, so the 7 transition orchestrators are not tier-gated. Confirm product intent before wiring. | 6+ | 3 | 2 | 4 | 1 | 5 | 2 | 13 | Pending / ASK-FIRST | See risk R-017 + proposal `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md`. Touches the "Starter blocked from Growth features with 403" validation gate; `transitions.ts:127-128` records the original Phase-3 intent that approve would later require reviewer-tier. |

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

1. Phase 6 Billing is shipped via PR #32 at `243067e`; Phase 7 has not started.
2. Operator-only next step: Matthew may authorize Phase 7 planning. SF-WHSEC-1 remains a follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation.
3. Do not expose secrets, change gates, or start Phase 7 implementation without explicit operator authorization. (Local `gsd/phase-6-billing` has been deleted.)

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
