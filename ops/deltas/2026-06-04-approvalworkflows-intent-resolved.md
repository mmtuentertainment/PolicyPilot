# approvalWorkflows tier-gate — product-intent RESOLVED → Document-only + park

Date: 2026-06-04
Branch: `docs/approvalworkflows-intent-park-2026-06-04` (off `main` @ `968192c`)
GSD stage: consultant keep-current (Tier A — doc/comment accuracy + decision record only; no product/schema/arch/gate change)
Supersedes intent left open by: PR #40 `968192c` (Action-D), which *surfaced* the gap as R-017 "Open / confirm intent" + a DRAFT proposal. This delta *finalizes* the operator's decision.

## Summary

The operator made the product-intent call that PR #40 left open: **`approvalWorkflows` is a
PRE-DECLARED future flag, intentionally unenforced and PARKED pending the unbuilt Reviewer-role /
review-queue feature. Gate-now is DECLINED.** This is the "document-only + park" outcome — no
tier-gating code is applied, and none should be applied under the now-RESOLVED proposal.

The decision is reinforced by the **session-11 read-only validation** (`wf_c7f9d7cd-de9`, and the
session-10 reframe `wf_95bf9248-fa6`): gating `approve()` / the admin transition menu would be the
**wrong target and provably cosmetic** because of the **publish-leak**.

## Why gating now is the wrong move (publish-leak — verified against live code this session)

- `approve()` is a **literal alias of `publish()`** — `lib/policies/transitions.ts:133-135`
  (`export async function approve(policyId) { await publish(policyId); }`).
- The state machine allows **`draft → published` directly** — `lib/policies/state-machine.ts:23`
  (`draft: ['under_review', 'published']`), and `under_review → draft` (`:24`).
- `publish()` performs **zero tier / workflow check** — `transitions.ts:166-186` gates on admin
  role + RLS org-scope only.

→ A Starter admin can reach `published` via `submit → under_review → reject → draft → publish`
(or simply publish direct), so a 403 on `approve()` or the menu is bypassable. The authoritative
control must be a **workflow-completeness check inside `publish()`** (the single mutation
chokepoint) for Growth+ orgs running a workflow — which is **feature work** (new state + guard +
tests), not a tier-flag toggle. That is why enforcement folds into the future Reviewer feature,
not this gap.

## What changed (all doc/comment only — verified against `main` @ `968192c`)

- `lib/stripe/products.ts` — added an intentional-gap rationale comment at the `approvalWorkflows`
  flag in `TIER_LIMITS` (the §3 "future feature" branch of the proposal): parked, not gate-now,
  with the publish-leak note + pointers to R-017 and the proposal. **Comment-only; zero behavior.**
- `.planning/consultant/risk_register.md` — **R-017** status `Open / confirm intent` →
  **`Accepted / Parked (2026-06-04)`**, mitigation cell rewritten with the decision, the
  publish-leak rationale, and the pointer to the Reviewer feature (backlog rank 17). Header bumped.
- `.planning/consultant/backlog.md` — **rank 16** → `Parked — see R-017`; added **rank 17**
  "Build Reviewer-role + review-queue feature" (Phase 9 candidate, depends 2/3/6); logged the
  OPEN marketing-copy decision in Next-Recommended-Micro-Batch. Header bumped.
- `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` — Status `DRAFT` → **`RESOLVED`**;
  added the §3 Option A **publish-leak caveat**; added **§5 Resolution**. Still no code.

## Consultant keep-current

- `risk_register.md` — **updated** (R-017 Open → Accepted/Parked + decision rationale).
- `backlog.md` — **updated** (rank 16 → Parked; new rank 17 Reviewer feature; marketing-gap logged).
- `working_context.md` — **updated** (header + Active-Watchlist bullet: approvalWorkflows parked,
  enforcement deferred to the Reviewer feature, marketing decision open).
- `system_map.md` — **no-change** (no route / data store / external service / trust boundary /
  cron / billing / AI surface changed; the Reviewer feature is unbuilt, so the map's architecture
  is unaffected; R-017 still exists in the register, now Parked).
- `feature_inventory.md` — **no-change** (no feature shipped, changed scope, or moved phase; the
  Reviewer-role/review-queue feature is a future Phase 9 backlog item, not yet a product surface —
  promote it to the inventory when it enters a planned phase).

## Reframe carried forward (from session-11 validation `wf_c7f9d7cd-de9`)

The Reviewer feature is far more pre-built than a greenfield design assumes: `Role='reviewer'`
already exists (`lib/auth/context.ts:35`), the `workflow_stages` table is live
(`lib/db/schema.ts:328-339`), and dead reviewer-queue repo seams exist
(`listPendingForReviewer` / `recordDecision`, `lib/db/repositories/workflow_stages.ts`). Five
blockers must be resolved before any build (org_id on every new table; close the publish-leak;
no `approved` state / `markApproved()`; no DB-level append-only; "drop `workflow_stages`" is
destructive + self-defeating). Build is ASK-FIRST/security → defaults to Codex; needs operator
GO + a Codex-vs-Claude routing pick. Full file:line evidence: run `wf_c7f9d7cd-de9`.

## Boundaries

- Product runtime behavior changed: **no** (one source comment + doc edits only; no logic touched).
- Tier-gating / enforcement code applied: **no** (this is the explicit "no code" park).
- Packages / lockfile changed: **no**.
- Schema / migrations / Drizzle metadata changed: **no**.
- Secrets / env / Vercel / `.mcp.json` / passwords: **no** (read-only on secrets; no value printed).
- Security gate changed: **no**. Pricing / marketing copy changed: **no** (decision deferred).
- PRs merged in this change: **no** (#39 + #40 were merged separately earlier this session as the
  operator-approved doc-backlog clear). Phase 7 started: **no**. Reviewer build started: **no**.

## Verification

- `pnpm tsc --noEmit` — exit 0 (only a comment changed in TS).
- `fallow audit` on the changed set (PreToolUse `git commit` gate) — TS-comment + Markdown only.
- Adversarial doc-consistency review (independent lenses) before commit — citation-accuracy,
  narrative-consistency across the 5 artifacts, scope-discipline, secret-clean.
