# ASK-FIRST Proposal — `approvalWorkflows` tier gate (DRAFT — no code applied)

Date: 2026-06-04
Status: **RESOLVED (2026-06-04)** — the operator GO'd "gate it now"; the **Phase 9 Reviewer MVP** (`gsd/phase-9-reviewer`, decision **D-09-01**) implements the gate. See §0 below. The DRAFT analysis is retained for history.
Tracked by: backlog rank 16 · risk register **R-017** · surfaced by the PR #39 codebase-map refresh (`.planning/codebase/ARCHITECTURE.md` "approvalWorkflows … is NOT currently enforced").

> This is a **consultant proposal**, not an implementation. Per CLAUDE.md ASK-FIRST
> (#4 "Any security-relevant decision") and the project's "trust DB for subscription
> state / tier gating is app-layer" rules, **the code fix below is NOT applied here**
> and must route through the normal ASK-FIRST → security path, never a doc PR.

---

## 0. Resolution (2026-06-04 — supersedes the DRAFT below)

The operator chose **"gate it now,"** and the gate was BUILT as the **Phase 9 Reviewer MVP** (`gsd/phase-9-reviewer`, decision **D-09-01**) — pending operator PR. The chosen shape is a **variant of Option A** scoped at the true publish boundary rather than gating `submitForReview`/`approve`/`reject`:

- `publish()` (`lib/policies/transitions.ts`) reads `checkTierLimit(ctx.orgId, 'approvalWorkflows')`. For Growth+ (`allowed:true`) it enforces an approval-**completeness** gate: the policy must be `under_review` with ≥1 approved and 0 pending workflow stages before it can publish. This also covers `approve()` (the literal alias of `publish()`), closing the publish-leak — which is stronger than gating `approve`/`submit` alone (those left a direct `publish()` bypass).
- **Starter stays direct-publish** (the flag is non-binding for Starter) — chosen over a hard 403 so the Starter publish path is never broken; the smallest reversible enforcement that closes the gap.
- A new shared `/reviewer` surface (`workflow_stages` projection) + an immutable `review_decisions` audit ledger (migration `0013`) back the workflow.

**Deferred (→ backlog rank-17/18):** the submit-entitlement refinement (Starter-403 on reviewer-assignment / Growth+ must-assign, §13a-ii — the literal Option-A-on-`submitForReview`) and the per-reviewer assignment UI — both additive and non-security-bearing.

R-017 is now **Mitigated**; backlog rank-16 is **Shipped (Phase 9)**. The DRAFT analysis below is retained for history.

---

## 1. The gap (verified against `main` @ `6f17412`)

`approvalWorkflows` is declared as a **Growth+** boolean feature in the single
source of truth `TIER_LIMITS` (`lib/stripe/products.ts`):

- `:40` `approvalWorkflows: false` (Starter)
- `:50` `approvalWorkflows: true`  (Growth)
- `:60` `approvalWorkflows: true`  (Business)

But that flag is **enforced nowhere**. `requireTierLimit()` is invoked at exactly
two call sites, both in the AI layer:

- `app/api/ai/draft/route.ts:61` → `requireTierLimit(ctx.orgId, 'aiDraftsMonthly')`
- `app/api/ai/consistency/route.ts:72` → `requireTierLimit(ctx.orgId, 'consistencyCheck')`

A repo-wide search confirms **zero** `requireTierLimit` / `checkTierLimit` /
`TIER_LIMITS` references anywhere under `lib/policies/`. The 7 policy-transition
orchestrators in `lib/policies/transitions.ts` — `submitForReview`, `approve`
(delegates to `publish`), `reject`, `publish`, `archive`, `restore`,
`editPublished` — gate on **admin role + RLS org-scope only**, never on tier.

**Effect:** a Starter org is **not** blocked by tier from the review/approval
workflow. This touches the project Validation Gate item *"Tier gating: Starter
blocked from Growth features with 403 + upgrade prompt."*

## 2. Why this needs a product decision FIRST

This is **not obviously a bug** — it may be a pre-declared flag awaiting a feature.
Evidence both ways:

- **For "gate it now":** `transitions.ts:127-128` records the *original Phase-3
  design intent* verbatim — *"Phase 6 will gate this separately from publish() —
  approve will require reviewer-tier; publish will be Starter-direct."* That gate
  was never wired when Phase 6 shipped. The flag exists, is documented Growth+ in
  `reference/TIER-LIMITS.md` and `REQUIREMENTS.md:189`, and the validation gate
  expects Starter→403 on Growth features.
- **For "it's a future feature":** there is currently **no distinct review/approval
  product surface** beyond the shared admin transition menu. `approve()` is today a
  thin alias of `publish()`. If a dedicated reviewer workflow is a later milestone,
  the flag was simply pre-declared and gating it now would block a path Starter
  admins legitimately use (publish).

**Decision needed (operator):** Is `approvalWorkflows` meant to gate the *existing*
review workflow (`submitForReview` / `approve` / `reject`) **now**, or is it a
pre-declared flag for a **future** dedicated reviewer feature?

## 3. Options (apply only after the §2 decision — via ASK-FIRST/security path)

### Option A — gate the review orchestrators (server-side, throw-based)
Add `await requireTierLimit(ctx.orgId, 'approvalWorkflows')` inside the
review-workflow orchestrators in `transitions.ts` (`submitForReview`, `approve`,
`reject`) — **not** `publish`/`archive`/`restore`/`editPublished`, which Starter
must keep. Throws `TierLimitExceededError` → 403 for Starter, consistent with the
existing AI-route pattern and the 429-vs-403 discrimination.
- **Pros:** authoritative (server-side, matches the established `requireTierLimit`
  pattern and D-15/D-16 status-code contract); one defense layer at the true
  mutation boundary.
- **Cons:** must precisely scope WHICH transitions are reviewer-gated vs
  Starter-direct (publish must stay Starter-direct); needs new unit tests
  mirroring `lib/stripe/products.test.ts` 403 coverage; `approve()` currently
  delegates to `publish()` so the gate placement needs care to avoid also gating
  direct publish.

### Option B — Server-Component tier gate on the review UI
Gate the review surface with a `requireTier`-style check in the Server Component /
route handler that renders the reviewer UI, hiding/403-ing the entry point for
Starter.
- **Pros:** cleaner UX (upgrade prompt at the surface, no half-available action).
- **Cons:** UI-layer gating is **not** authoritative on its own (violates the
  "trust DB, enforce server-side" rule if used alone); should be paired with
  Option A as defense-in-depth, not a substitute. Also presumes a distinct review
  UI exists to gate.

**Consultant lean (advisory only):** if the operator confirms "gate now," do
**Option A** as the authoritative control (optionally + Option B for UX),
scoped to the review-specific transitions, behind new 403 tests. If "future
feature," leave the flag as pre-declared and add a one-line note at the
`TIER_LIMITS` definition so the gap is intentional and documented.

## 4. Out of scope for this proposal
- No code, no tests, no migration in this PR. This file + the R-017 risk row + the
  backlog rank-16 row are the only artifacts.
- Any implementation is a separate, operator-authorized change through the
  ASK-FIRST / `gsd-secure-phase` path.
