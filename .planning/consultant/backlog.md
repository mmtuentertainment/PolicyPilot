# Consultant Backlog — PolicyPilot

Updated: 2026-06-04 (s20) - PR #42 audit-ledger fix applied + re-verified on `gsd/phase-9-reviewer` (D-09-01); rank-20 added (DB-tier append-only REVOKE, ASK-FIRST); prior: rank-16 SHIPPED + rank-17/18/19 added

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
| 16 | approvalWorkflows tier gate — wire the Growth+ `TIER_LIMITS.approvalWorkflows` flag into the policy lifecycle so the review workflow is enforced (was enforced nowhere). | 9 | 3 | 2 | 4 | 1 | 5 | 2 | 13 | Shipped (Phase 9) | **Built by the Phase 9 Reviewer MVP** on `gsd/phase-9-reviewer` (D-09-01), pending operator PR. `publish()` reads `checkTierLimit(…, 'approvalWorkflows')` and enforces a completeness gate for Growth+ (covers `approve()`, closes the publish-leak); Starter stays direct-publish. Resolves R-017 + the proposal `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` (chosen shape: a publish()-completeness gate — a variant of option A scoped at the true publish boundary rather than gating submit/approve/reject). |
| 17 | Submit-entitlement refinement (deferred from Phase 9) — gate `submitForReview` by tier/role: Starter-403 on reviewer-assignment, Growth+ must-assign-a-reviewer (§13a-ii). | 9+ | 3 | 2 | 3 | 1 | 4 | 3 | 10 | Deferred / backlog | Additive, non-security-bearing — the publish()-completeness gate already enforces the Growth+ workflow. Deferred because it would break existing submit tests + needs a reviewer-picker UI; build after rank-18. |
| 18 | Per-reviewer assignment UI + reviewer-picker (deferred from Phase 9) — the MVP ships a SHARED org review queue (`listPendingForOrg`); the per-reviewer `listPendingForReviewer` seam is retained unused. | 9+ | 2 | 3 | 2 | 2 | 4 | 3 | 10 | Deferred / backlog | The `review_decisions` ledger already records the actual approver; assignment is a UX/routing refinement, not a correctness gap. Pairs with rank-17. |
| 19 | At-most-one-pending DB invariant (hardening surfaced by the Phase 9 adversarial re-review) — add a partial unique index `UNIQUE (org_id, policy_id) WHERE status='pending'` on `workflow_stages` (or `SELECT … FOR UPDATE` on the policy row at submit) so a crafted CONCURRENT double-`submitForReview` cannot create 2 pending stages. | 9+ | 1 | 2 | 3 | 1 | 4 | 2 | 9 | Deferred / ASK-FIRST (schema) | Pre-existing class limitation, NOT introduced by FIX-B; the concurrent re-wedge is already DRAINABLE (a single resubmit supersedes both) and needs a crafted concurrent double-submit (the admin UI posts one form). A partial-unique index is a new migration → ASK-FIRST. |
| 20 | DB-tier append-only enforcement on `review_decisions` (hardening surfaced by the PR #42 fix re-review, DC-01) — forward migration to `REVOKE UPDATE, DELETE ON review_decisions FROM authenticated` (+ optionally `FORCE ROW LEVEL SECURITY`) so the immutable-ledger guarantee holds at the DB tier, not app-layer-only. | 9+ | 1 | 2 | 3 | 1 | 3 | 2 | 8 | Deferred / ASK-FIRST (destructive migration) | Pre-existing (ADR-018 by-design: the 0013 GRANT keeps UPDATE/DELETE for RLS symmetry). Does NOT reopen the s19 defect — no app-layer mutation path exists (the repo exports only `record`+`listForPolicy`; the ts-morph AST + `tests/types.ts` immutability gates would catch one). A REVOKE/FORCE-RLS migration is destructive-class → ASK-FIRST. Mirrors the deferred `acknowledgments`/`qa_citation_grants` DB-tier hardening. |

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

1. **Phase 9 Reviewer MVP is built + verified green on `gsd/phase-9-reviewer`** (R-017 closure; D-09-01) — pending operator PR/merge. Not pushed; PR not opened (operator's contract). Note the `risk_register`/`backlog`/proposal merge overlap with the still-open PR #41 — Phase 9 supersedes #41's document-only park; operator resolves the merge order.
2. Phase 6 Billing is shipped via PR #32 at `243067e`; Phase 7 has not started.
3. Operator-only next step: Matthew may authorize Phase 7 planning. SF-WHSEC-1 remains a follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation.
4. Do not expose secrets, change gates, or start Phase 7 implementation without explicit operator authorization. (Local `gsd/phase-6-billing` has been deleted.)

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
