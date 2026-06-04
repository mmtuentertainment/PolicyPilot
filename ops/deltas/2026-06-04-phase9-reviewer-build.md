# Phase 9 Reviewer / Approval-Workflow MVP — build + 3 review-fixes + re-verify

Date: 2026-06-04
Branch: `gsd/phase-9-reviewer` (off `main` @ `968192c`)
GSD stage: execute → secure-phase → verifier (feature build, operator-GO'd; D-09-01)
Related: closes **R-017** + backlog rank-16 + the ASK-FIRST proposal `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md`. Merge overlap with the still-open **PR #41** (which parked R-017 document-only) — **Phase 9 supersedes #41**; operator resolves the merge order. **Not pushed; PR not opened** (operator opens + merges — Claude's contract ends at a committed, verified branch + this delta + the report).

## Summary

The Phase 9 Reviewer / approval-workflow MVP (built earlier this session as SPEC `a72a5ae` + impl `36d821f`, 22 files) closes **R-017**: `approvalWorkflows` — a Growth+ `TIER_LIMITS` flag (`lib/stripe/products.ts`) that was previously enforced **nowhere** — is now read by `publish()` (`lib/policies/transitions.ts`) which, for Growth+, enforces an approval-**completeness** gate before publish (status `under_review` + ≥1 approved + 0 pending). Because `approve()` is a literal alias of `publish()`, the gate lives at the true publish boundary and closes the publish-leak. Starter stays direct-publish (the flag is non-binding for Starter — the smallest reversible enforcement that doesn't break Starter's publish path).

This delta records **(a)** the additive `0013_review_decisions` migration applied to the **dev** DB (was test-only), **(b)** the 3 adversarial-review fixes (FIX-A/B/C) applied this session, **(c)** the re-verify (all gates green), and **(d)** the independent 6-skeptic adversarial re-review (verdict: all-clear, no blockers).

## What changed this session

### Env prep
- **Migration `0013_review_decisions` applied to the dev DB** (`pnpm db:migrate`, `.env.local`). It was applied to the test DB at build time but the dev DB was 1 behind (0012), so `pnpm db:verify` (which targets the dev DB) failed on migration-count independent of any fix. 0013 is **additive** (CREATE TABLE `review_decisions` + FKs + 2 indexes + wrapped RLS + GRANT; the Phase-6 billing re-adds were stripped) and **operator-approved (D-09-01**, recorded in the migration header) and already on test → applying it to dev is the routine completion of that approval, not a new ASK-FIRST. Dev `db:verify` now reports 14 migrations / 13 tenant tables.

### FIX-A — bind stage↔policy + status, assert row-count before the ledger (was: sev medium→high)
`recordDecision(s, **policyId**, stageId, decision, comment?)` WHERE now binds `orgId AND policyId AND id AND status='pending'` (`lib/db/repositories/workflow_stages.ts`). `recordReviewDecision` asserts `updated.length > 0` (throws the new **`StageNotActionableError`**, `lib/policies/errors.ts`) **before** the `ReviewDecisions.record` ledger insert and before the reject status-flip, all in one `withOrgScope` tx (`lib/policies/transitions.ts`). `handleReviewError` (`app/(reviewer)/reviewer/actions.ts`) maps it to a benign toast (not a 500). Brand gate + a 0-row unit test added. → A crafted same-org POST `(policyId=B, stageId=A's-pending)` is now a 0-row UPDATE → throw → no misattributed immutable ledger row, no sibling-policy strand/reset; already-decided stages can't be re-flipped.

### FIX-B — supersede stale pending stages at submit (was: sev high)
New `supersedePending(s, policyId)` (`status 'pending'→'superseded'`, scoped `orgId+policyId+status='pending'`). `submitForReview` calls it inside `withOrgScope` **before** `recordSubmission`. `workflow_stages.status` is plain `text` (no enum/CHECK; `drizzle/0000_initial.sql:116`) so `'superseded'` needs **no migration**. → The admin `reject()` path (which leaves a pending row) can no longer produce a 2-pending publish-gate wedge; `'superseded'` is projection-only (ignored by the publish gate filters + the `/reviewer` queue, writes no ledger row).

### FIX-C — `review_decisions` in the deploy-gate siblings (was: sev medium)
Added `'review_decisions'` to `TENANT_TABLES` in `scripts/check-deploy-schema.ts` + `scripts/check-schema.ts` (lockstep with `scripts/check-rls.ts`, which already had it) + wrapped-RLS-form + index depth checks mirroring `qa_citation_grants` (the 0013 RLS+GRANT is hand-written). Column-shape intentionally not pinned (covered by the typed insert + the append-only immutability gate). → A future drift on the append-only audit ledger's RLS/GRANT/indexes can no longer ship past `pnpm db:verify`.

## Verification (all green — real output)

| Gate | Result |
|---|---|
| `typecheck` (`tsc --noEmit`) | 0 errors |
| `check:policy-id-brand` | 24/24 signatures (was 22 — +`recordDecision` +`supersedePending`) |
| `check:acknowledgment-immutability` + `:self-test` | 0 violations / 6 non-vacuous over 3 tables |
| `check:error-discipline` | 0 |
| `check:db-imports` | 0 |
| `build` (`next build`) | OK, incl. `/reviewer` + `/reviewer/[policyId]` |
| `check:rls` | 13 tenant tables RLS-isolated; positive control passed |
| `db:verify` | 14 migrations / 13 tenant tables; review_decisions wrapped-RLS + indexes verified |
| `vitest run lib/policies/transitions.test.ts` | 33/33 (was 31 — +FIX-A 0-row test, +FIX-B supersede test) |

## Adversarial re-review (independent, ultracode)

6 skeptics (one per fix-lens + cross-tenant) + 1 blinded evaluator that re-verified every load-bearing claim by re-reading the cited file:line and re-running the suite. **Verdict: `all-clear`** — FIX-A `confirmed-closed`, FIX-B `confirmed-closed`, FIX-C `gate-sound`, cross-tenant `no-leak`, **0 blockers**. The D-09-01 publish-leak closure is intact (the only `status='published'` flip is inside `publish()` behind the gate; `approve()` is its alias).

Three upheld findings — all **defer-OK, pre-existing (NOT introduced by these fixes), not blockers**:
1. **Concurrency residual (LOW/MED):** a *crafted concurrent* double-`submitForReview` under READ COMMITTED could create 2 pending stages — but now **drainable** (one resubmit supersedes both; the admin UI posts a single form). Logged as **backlog rank-19** (partial unique index `UNIQUE(org_id, policy_id) WHERE status='pending'` → ASK-FIRST schema change).
2. **FIX-C wrapped-RLS check is a substring match** — byte-identical to the existing prod `qa_citation_grants` check (no new weakness); real isolation is dynamically proven by `check:rls`'s live negative-leak property test over all 13 tables.
3. **`review_decisions` append-only is app-layer only** (ADR-018 by-design; the GRANT keeps UPDATE/DELETE for RLS symmetry, DB REVOKE/FORCE-RLS is the deferred ASK-FIRST hardening).

## Deferrals (operator-visible; additive, none security-bearing)
- **Submit-entitlement** (Starter-403 on reviewer-assignment / Growth+ must-assign, §13a-ii) → backlog **rank-17** (would break existing submit tests + needs a reviewer-picker UI).
- **Per-reviewer assignment UI** (MVP is a shared queue; the `listPendingForReviewer` seam is retained unused) → backlog **rank-18**.
- **At-most-one-pending DB invariant** (concurrency hardening) → backlog **rank-19** (ASK-FIRST schema).

## Consultant keep-current
- `risk_register.md` — **updated**: R-017 → **Mitigated — Phase 9 (D-09-01)**; header bumped.
- `backlog.md` — **updated**: rank-16 → **Shipped (Phase 9)**; new rank-17/18 (deferrals) + rank-19 (concurrency hardening); Next-Micro-Batch + header bumped.
- `feature_inventory.md` — **updated**: new "Reviewer / approval workflow" (Phase 9, Built / pending PR); header bumped.
- `system_map.md` — **updated**: `(reviewer)` route group in the runtime diagram, Phase-9 Phase-Map line, new "Reviewer approval" workflow #6, reviewer hotspot; header bumped.
- `working_context.md` — **updated**: Phase 9 built state + watchlist item + header bumped.
- `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` — **updated**: Status → **RESOLVED**; added §0 Resolution (chosen shape = publish()-completeness gate, a variant of option A at the true publish boundary).
- `lib/stripe/products.ts` — **no-change on this branch** (the "INTENTIONALLY UNENFORCED" comment the s16 handoff referenced lives in PR #41, not on this pre-#41 branch). Post-#41-merge follow-up: update the `TIER_LIMITS` comment to "enforced as of Phase 9".
- **Marketing-gap (still OPEN):** the public "approval workflows" copy can move from "coming soon" to shipped **on merge** — post-merge marketing-copy follow-up, not changed here.

## Boundaries
- Product runtime behavior changed: **yes** (the 3 review-fixes — app-layer query/orchestrator logic only; no migration). Schema/Drizzle metadata changed: **no** (0013 was authored at build time; this session only *applied* it to dev). Packages/lockfile: **no**. Secrets/env/Vercel/`.mcp.json`: **no** (read-only on secrets). Security gate weakened: **no** (FIX-C *strengthens* the deploy gate; FIX-A/B *close* review-integrity holes). Live Stripe mode / prod / Phase 7: not touched. Nothing pushed; PR not opened; no merges.
