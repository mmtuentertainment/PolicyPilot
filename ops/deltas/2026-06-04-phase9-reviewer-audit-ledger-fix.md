# Phase 9 Reviewer — PR #42 audit-ledger-integrity fix + re-verify + adversarial re-review

Date: 2026-06-04 (session s20)
Branch: `gsd/phase-9-reviewer` (HEAD before this commit: `26ef7a9`, off `main` @ `968192c`)
GSD stage: ship-review follow-up (PR #42 review fix; operator-GO'd build routed to Claude; D-09-01)
PR: **#42** (open, MERGEABLE; GH Actions gates green, Vercel ✗ = non-blocking Cause A per R-016). Merge overlap with the still-open **PR #41** (R-017 document-only park) — **#42 supersedes #41**; operator resolves the merge order. **Not merged; operator merges #41 + #42.**

## Summary

The s19 review of PR #42 (CodeRabbit was rate-limited → operator-fallback toolkit + 26-agent adversarial review) found **ONE real defect**: an **audit-ledger-integrity** hole (NOT publish-leak, NOT cross-tenant). This session applied the fix, re-verified the full local gate suite green, and ran an independent 6-lens adversarial re-review of the **fix** (verdict: `ship-with-nits`, defect fully closed, no regressions, **0 must-fix blockers**).

### The defect (confirmed real by s19; closed here)
Admin `reject()` ("send back to draft", `under_review→draft`) flipped `policies.status` to `draft` but **left the `workflow_stages` row `pending`** (orphaned) — FIX-B's `supersedePending` ran only in `submitForReview`, not in `reject()`. The new shared queue `WorkflowStages.listPendingForOrg` surfaced that orphaned pending stage (it filtered only `workflow_stages.status='pending'`, never `policies.status`); the reviewer detail page rendered the Approve form for any pending stage; and `recordReviewDecision`'s **approve** branch had **no policy-status guard** (only reject guarded, via the now-removed `under_review→draft` transition assert). Exploit (single org, deterministic): submit Growth+ policy → admin "send back to draft" → reviewer opens still-queued item → Approve → a **permanent, contradictory `"approved"` row is appended to the immutable `review_decisions` ledger of a DRAFT policy**. Harm = the append-only audit ledger (the whole point of R-017 / the ②b model) records a decision that contradicts the lifecycle. Publish() was already gated (`status!=='under_review'` blocks), so this was NOT a publish leak.

## What changed this session (6 files, +118/−10 core; +5 nit edits)

### Fix (3 layers, defense-in-depth)
1. **Queue hygiene at the source** — admin `reject()` (`lib/policies/transitions.ts`) now calls `WorkflowStages.supersedePending(s, policyId)` inside `withOrgScope` (mirrors `submitForReview`). The orphaned pending stage becomes `'superseded'` (projection-only, no ledger row) and leaves the shared queue.
2. **Decision-time guard** — `recordReviewDecision` (`lib/policies/transitions.ts`) loads the policy ONCE at the top of the tx and throws `StageNotActionableError` unless `policy.status==='under_review'`, **before** `recordDecision` and **before** the `ReviewDecisions.record` ledger insert. Covers **both** approve and reject uniformly; the reject branch's old `loadAndAssertTransition(...,'draft')` was removed as redundant (`under_review→draft` is always legal and the guard already proved `under_review`). → an Approve/Reject against a non-`under_review` policy rolls the whole tx back with **ZERO** ledger rows.
3. **Belt-and-suspenders queue filter** — `listPendingForOrg` (`lib/db/repositories/workflow_stages.ts`) `innerJoin` now also requires `policies.status='under_review'`, so the shared queue can never present a non-actionable item.

### Should-fixes (rode this commit)
- `app/(reviewer)/reviewer/actions.ts` — both actions now also `revalidatePath('/policies/[id]')` so an admin viewing the policy-detail surface sees the post-decision status without a manual refresh; the stale `IllegalTransitionError` comment in `handleReviewError` was corrected (the branch is now a defensive fallback — the decision-time guard throws `StageNotActionableError` on that path).
- `drizzle/0013_review_decisions.sql` — comment corrected (`listPendingForReviewer` → `listPendingForOrg`, the shared queue).
- `scripts/check-rls.ts` — seeds one orgB `workflow_stages` (pending) + one `review_decisions` row so the cross-org negative loop **non-vacuously** exercises RLS on the two newest tenant tables (previously neither was ever seeded → those checks passed trivially). Negative-loop comment `12` → `13`.
- `lib/policies/transitions.test.ts` — **TDD (RED → GREEN)**: added the defect-reproduction test (approve on a draft-status policy with a pending stage → `StageNotActionableError`, NO ledger row, no flip — *failed* against pre-fix code) + a `reject()`-supersedes test; updated the approve/ reviewer-role/ decision-on-non-`under_review`/ FIX-A tests to the new contract; **tests-4** pins the literal `'approvalWorkflows'` entitlement key in the Growth+ allow test (a typo would silently reopen the leak). 33 → **35 tests**. Both new defect tests assert guard ordering (`recordDecision` NOT called on the draft path, called on the FIX-A 0-row path).

### Nits from the fix re-review applied
REG-1 (reviewer detail Approve form also gated on `policy.status==='under_review'`), DC-02 (stale comment corrected), MT-1 (`check-rls` 12→13 comment), TI-1/TI-2 (guard-ordering assertions). **Deferred:** DC-01 — DB-tier `REVOKE UPDATE, DELETE ON review_decisions FROM authenticated` (+ optional `FORCE ROW LEVEL SECURITY`) to enforce append-only at the DB tier, not app-layer-only. Pre-existing, **ASK-FIRST** (destructive-class migration), does NOT reopen the s19 defect (no app-layer mutation path exists; the AST + type gates would catch one). → new backlog **rank-20**.

## Verification (all green — real output)

| Gate | Result |
|---|---|
| `typecheck` (`tsc --noEmit`) | 0 errors |
| `vitest run lib/policies/transitions.test.ts` | **35/35** (was 33; +2 defect tests) |
| `check:policy-id-brand` | 24/24 |
| `check:acknowledgment-immutability` + `:self-test` | 0 violations / non-vacuous (6 over 3 tables) |
| `check:rls` | 13 tenant tables RLS-isolated; **now non-vacuous** for `workflow_stages` + `review_decisions`; positive control passed |
| `db:verify` | 14 migrations / 13 tenant tables; `review_decisions` wrapped-RLS + indexes present |
| `build` (`next build`) | OK, incl. `/reviewer` + `/reviewer/[policyId]` |

## Adversarial re-review of the FIX (independent, ultracode — `wf_b78dd333-5e3`)

6 lenses (defect-closure, regression, multi-tenancy/RLS, test-integrity, append-only-ledger/migration, concurrency/TOCTOU) → each medium+ finding refuted by a blinded skeptic → an independent ship-readiness evaluator that re-read every changed file + re-ran the suite. **Verdict: `ship-with-nits`** — `defectClosed: true`, `noRegressions: true`, **`mustFix: []`**, 0 surviving medium+ findings, 11 low/nits (4 applied above; DC-01 deferred; remainder cosmetic/positive-confirmation). The decision-time guard is the authoritative closure; the reject() supersede + queue filter are reinforcing layers. org_id scoping + RLS backstop intact on the new `findById` guard; `review_decisions` repo still exports only `record`+`listForPolicy` (append-only).

## Consultant keep-current
- `risk_register.md` — **updated**: R-017 mitigation note records the audit-ledger orphan-pending hole now also closed (guard + reject-supersede + queue filter); header bumped.
- `backlog.md` — **updated**: new **rank-20** (DB-tier append-only REVOKE hardening — DC-01, ASK-FIRST/deferred); header bumped.
- `working_context.md` — **updated**: Current State + Active Watchlist reflect PR #42 open + the s19→s20 audit-ledger fix applied + re-verified + ship-with-nits.
- `feature_inventory.md` — **no-change** (the Reviewer / approval-workflow feature is unchanged; this is an internal correctness hardening, not a new capability).
- `system_map.md` — **no-change** (no new routes/components/tables; internal orchestrator-guard logic + one `revalidatePath` only).
- `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` — **no-change** (already RESOLVED in the s17 delta).
- `lib/stripe/products.ts` — **no-change** (the "enforced as of Phase 9" `TIER_LIMITS` comment is a post-#41-merge follow-up living in PR #41, not this branch).

## Boundaries
Product runtime behavior changed: **yes** (reject-supersede + decision-time guard + queue filter + reviewer-form gate + admin revalidate — app-layer orchestrator/query/UI logic only; **no migration**). Schema/Drizzle metadata: **no**. Packages/lockfile: **no**. Secrets/env/Vercel/`.mcp.json`: **no** (read-only on secrets). Security gate weakened: **no** — this *closes* an audit-ledger-integrity hole and *strengthens* `check:rls` (non-vacuous on 2 tables). Live Stripe / prod / Phase 7: not touched. Committed + pushed; **PR not merged** (operator merges #41 + #42). Decision ID: **D-09-01**.
