# Consultant Backlog — PolicyPilot

Updated: 2026-06-14 - Phase 7 (Crons + Email) published as draft PR #44 from `gsd/phase-7-crons-email` (tip `9a3ebe2`); `verify:phase-7` green (tsc 0 / 39 vitest files·332 tests / check:rls / db:verify); ship-review `wf_0fa4b84e-ad3` = ship / 0 must-fix + 4 follow-ups (FU-2 folded `6fd033a`, FU-4 folded `aa6d8ab`, FU-1 false-positive, FU-3 hosted CI red = environmental); NOT merged, no deploy, no staging/prod migration, no live email send. Rank-6 and rank-7 flip Pending -> Shipped (PR #44) / pending-merge. Prior: 2026-06-05 - Phase 9 Reviewer / approval-workflow MVP shipped to `main` via PR #42 at `1122da5`; PR #41 closed as superseded; rank-16 shipped/monitor on main; rank-18 and rank-20 remain deferred.

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
| 6 | Design idempotent reminder send model. | 7 | 3 | 4 | 5 | 4 | 4 | 2 | 18 | Shipped (PR #44) / pending-merge | **Built** as the additive `reminder_sends` ledger (`drizzle/0014_reminder_sends.sql`; org-scoped candidate queries in `lib/db/repositories/reminders.ts`): natural-key UNIQUE `(org_id,user_id,policy_id,type,window_date)`, claimed in `app/api/cron/reminders/route.ts` (record-then-send, `onConflictDoNothing`) before any email. Migration `0014` applied to dev/TEST only; staging/prod operator-gated. Mitigates R-006. First verify-green at `5d304b4`; re-verified green after folding FU-2/FU-4 at branch tip `9a3ebe2`. Published as draft PR #44 (not merged). |
| 7 | Implement minimal Railway reminder worker. | 7 | 3 | 4 | 4 | 4 | 3 | 4 | 14 | Shipped (PR #44) / pending-merge | **Built** end-to-end: `app/api/cron/reminders/route.ts` (CRON_SECRET-gated, per-org `withOrgScope`, claim-before-send), `worker/trigger-reminders.mjs` + `railway.json` daily cron, `lib/email/*` lazy Resend client + 4 React Email templates (ack-reminder/policy-assigned/policy-updated/review-due), event emission in `lib/policies/transitions.ts` + assign action, `next_review_date`-on-publish writer, notification bell (`components/notifications/*` + `markAllReadForUser`), and `verify:phase-7`/CI. First verify-green at `5d304b4`; ship-review `wf_0fa4b84e-ad3` = ship / 0 must-fix + 4 follow-ups — FU-2 folded `6fd033a`, FU-4 folded `aa6d8ab`, FU-1 confirmed false-positive (no commit), FU-3 = watch hosted CI (currently RED = environmental: CI `check:rls` POSITIVE-CONTROL fails on Phase 2 `0001_rls_policies.sql` behind the CI `DATABASE_URL` secret, NOT a Phase 7 defect). Re-verified `verify:phase-7` green after FU-2/FU-4 at branch tip `9a3ebe2`; published as draft PR #44. Carried doc-debt: `reference/SCHEMA.md` notifications block STALE (omits live `org_id`) — reconcile at Phase 7 ship. No deploy / no staging-prod migration / no live email send yet. |
| 8 | Ship CSV export for acknowledgment evidence. | 8 | 5 | 4 | 3 | 5 | 5 | 2 | 20 | Pending | Favor simple CSV first; dashboard charts can follow. |
| 9 | Run end-to-end beat-manual acceptance path. | 8 | 5 | 5 | 4 | 5 | 4 | 3 | 20 | Pending | Measure signup → draft → publish → assign → acknowledge → export. |
| 10 | Phase 5 shipped-state bookkeeping. | 5 | 2 | 3 | 4 | 3 | 5 | 1 | 16 | Done in this patch | Reconciled `STATE`, `ROADMAP`, and consultant packets with PR #27 merge facts. |
| 11 | Finish Stripe test-clock rows 9-10. | 6 | 5 | 4 | 5 | 3 | 4 | 2 | 19 | Done | True next-period `invoice.paid` renewal and failing-card `invoice.payment_failed`/`past_due` rows are PASS with masked-only evidence in `06-UAT.md`. |
| 12 | Reconcile Stripe CLI/login and app test credentials. | 6 | 5 | 3 | 5 | 2 | 5 | 1 | 19 | Mitigated for UAT / monitor | Local UAT used the app test-account override. Future Stripe UAT must use the same override or a relogged CLI profile; do not rely on the default mismatched CLI profile. |
| 13 | Delete throwaway billing UAT test objects. | 6 | 1 | 2 | 2 | 1 | 5 | 1 | 10 | Optional/operator cleanup | Operator may delete the "Acme Test Co" Clerk org and the canceled test subscription. |
| 14 | Make dev org provisioning expectations explicit. | 6+ | 2 | 3 | 3 | 1 | 5 | 1 | 13 | Pending/process | Dev-created orgs without a webhook tunnel may hit `OrgNotProvisionedError`; document the tunnel/provisioning path as process, not Phase 6 code defect. |
| 15 | Tier B: provision prod Supabase (Pro+PITR) + first working Vercel production deploy (runtime env/secrets + staged migrations). | Cross-cutting/Infra | 4 | 3 | 4 | 2 | 3 | 4 | 12 | Pending / operator-gated | Surfaced by `fix/db-lazy-init`: prod has never deployed (404 `DEPLOYMENT_NOT_FOUND`; CLI deploys frozen at `bae9174`). The lazy-db fix unblocks the build-crash class but is necessary-but-not-sufficient. Operator + Codex own provisioning + secrets; read-only on secrets this session (risks R-015/R-016). |
| 16 | approvalWorkflows tier gate — wire the Growth+ `TIER_LIMITS.approvalWorkflows` flag into the policy lifecycle so the review workflow is enforced (was enforced nowhere). | 9 | 3 | 2 | 4 | 1 | 5 | 2 | 13 | Shipped / monitor | **Shipped by the Phase 9 Reviewer MVP** via PR #42 at `1122da5` on `main` (D-09-01). `publish()` reads `checkTierLimit(…, 'approvalWorkflows')` and enforces a completeness gate for Growth+ (covers `approve()`, closes the publish-leak); Starter stays direct-publish. Resolves R-017 + the proposal `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` (chosen shape: a publish()-completeness gate — a variant of option A scoped at the true publish boundary rather than gating submit/approve/reject). |
| 17 | Submit-entitlement refinement (deferred from Phase 9) — gate `submitForReview` by tier/role: Starter-403 on reviewer-assignment, Growth+ must-assign-a-reviewer (§13a-ii). | 9+ | 3 | 2 | 3 | 1 | 4 | 3 | 10 | Deferred / backlog | Additive, non-security-bearing — the publish()-completeness gate already enforces the Growth+ workflow. Deferred because it would break existing submit tests + needs a reviewer-picker UI; build after rank-18. |
| 18 | Per-reviewer assignment UI + reviewer-picker (deferred from Phase 9) — the MVP ships a SHARED org review queue (`listPendingForOrg`); the per-reviewer `listPendingForReviewer` seam is retained unused. | 9+ | 2 | 3 | 2 | 2 | 4 | 3 | 10 | Deferred / backlog | The `review_decisions` ledger already records the actual approver; assignment is a UX/routing refinement, not a correctness gap. Pairs with rank-17. **REQUIREMENTS.md reviewer-surface acceptance + `09-SPEC.md` §8/§10/§16 reconciled to the shared-queue MVP and point `reviewer_id = self` filtering here (D-09-01, 2026-06-05); implementation hook = the retained dead `listPendingForReviewer` seam (`workflow_stages.ts:33-43`).** |
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

1. **Phase 7 Crons + Email is EXECUTED, verify-green, and published as draft PR #44** on `gsd/phase-7-crons-email` (tip `9a3ebe2`; `verify:phase-7` exits 0 — tsc 0 / 39 vitest files·332 tests / check:rls / db:verify; ship-review `wf_0fa4b84e-ad3` = ship / 0 must-fix + 4 follow-ups). Follow-up disposition: FU-2 folded `6fd033a`, FU-4 folded `aa6d8ab`, FU-1 false-positive (no commit), FU-3 = watch hosted CI. Next move: reconcile the CI Supabase `DATABASE_URL` secret/project (hosted `verify-phase-6`/`verify-phase-7` RED is environmental — `check:rls` POSITIVE-CONTROL fails on Phase 2 `0001_rls_policies.sql`, which Phase 7 never touches), re-run CI green, then un-draft + squash-merge; post-merge `git checkout main && git pull --ff-only`. Operator owns the final un-draft/merge.
2. **Phase 9 Reviewer MVP is shipped on `main` via PR #42 at `1122da5`** (R-017 closure; D-09-01). PR #41 is closed as superseded. Phase 6 Billing is shipped via PR #32 at `243067e`.
3. After Phase 7 merges, the next phase is **Phase 8 Validation** (rank-8 CSV export + rank-9 beat-manual acceptance path) — Phase 8 `Depends on: 6 + 7`. Reconcile `reference/SCHEMA.md` notifications `org_id` at Phase 7 ship.
4. SF-WHSEC-1 remains a follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation.
5. Do not expose secrets, change gates, deploy, run staging/prod migrations, or send live email from the Phase 7 branch without explicit operator authorization.

---

## Keep-Current Rule

Update this backlog whenever roadmap order, phase status, revenue packaging, or a major risk changes. If no backlog changes are needed, write `backlog: no-change` in the delta report.
