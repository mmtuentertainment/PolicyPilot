# PolicyPilot — Forensic Realignment Brief for ChatGPT Pro

> Historical note (2026-05-30): this brief is preserved as a point-in-time forensic snapshot from before the Phase 6 verifier and checkout-fix commits (`1be117a`, `b92a15f`). Use later Phase 6 state, UAT, and summary artifacts for current branch status.

**Date:** 2026-05-29
**Prepared by:** Claude Code (long-horizon repo-diagnosis agent) via `/gsd-progress --forensic`
**Audience:** ChatGPT Pro (consultant / research / risk-review / GSD-guide layer — Max 20× subscription)
**Purpose:** Realign the consultant's mental model with verified ground truth. The planning
documents you have been reasoning from (STATE.md, HANDOFF.json, the CLAUDE.md `## Project`
context block) are **stale**. This brief is the corrected snapshot. Read it fully before your
next piece of Phase 6 advice.

> Hand this file to ChatGPT verbatim. It is self-contained — no repo access required.

---

## TL;DR — the one thing to update

**You believe:** *"Phase 6 Billing is planned and ready to execute; implementation has NOT started."*

**Ground truth (git + working tree, verified 2026-05-29):** *Phase 6 Billing is ~92% implemented.*
Five of six plans (06-01…06-05) are committed on `gsd/phase-6-billing`; the sixth (06-06, the
verification spine) is **in progress and uncommitted** in the working tree. Nothing is merged to
`main` yet and no PR is open. The remaining work is **finish-and-ship**, not **start**.

Your guidance should pivot from *"should we begin / is the plan sound"* to *"finish the verify
chain, run the gates, operator-UAT the Stripe loop, refresh state, ship the PR."*

---

## 1. Verified project position (authoritative)

| Source of truth | Says | Freshness |
|---|---|---|
| **Git history + working tree** | Phase 6 = 5/6 plans committed + 6th uncommitted WIP | **CURRENT (truth)** |
| `.planning/STATE.md` (`status: phase_6_planned`, `percent: 63`) | "Phase 6 PLANNED, ready to execute, implementation NOT started" | **STALE** — frozen at the plan-check checkpoint ~16h before execution |
| `.planning/HANDOFF.json` + `06-billing/.continue-here.md` | "ready_for_planning"; remaining task = *Plan Phase 6 (not_started)*; next action = run `/gsd-plan-phase 6` | **MOST STALE** — dated 2026-05-27, predates planning entirely |
| `CLAUDE.md` `## Project` block | "Phase 6 is pending/planning-only… do not treat a Phase 6 branch as permission to start" | **STALE** — guard was correct when written; reality has since advanced under operator direction |

**Milestone:** v1.0 — 8 phases. **5/8 phases shipped to `main` (63%).**

| Phase | Name | Status | Evidence |
|---|---|---|---|
| 1 | Foundation | ✅ Shipped | PR #1 |
| 2 | Data Layer | ✅ Shipped | PR #2 → `130b8ab` (7/7 plans incl. 02-07 hotfix) |
| 3 | Admin UI | ✅ Shipped | PR #3 → `edebab7` (15/15; fast-follows #5/#7/#13; audit cascade #8/#10/#11) |
| 4 | AI Layer | ✅ Shipped | PR #15 → `f8207f4` (14/14; 60/60 STRIDE closed; UAT 5/5) |
| 5 | Employee Portal | ✅ Shipped | PR #27 → `3344847` (10/10) |
| 6 | **Billing** | 🔄 **In progress (~92%)** | branch `gsd/phase-6-billing`, **not merged**, 15 commits ahead of `origin/main af01f0a` |
| 7 | Crons + Email | ⬜ Not started | no directory |
| 8 | Validation | ⬜ Not started | no directory |

`main` HEAD = `af01f0a` (PR #31, state refresh) and local == origin (FF-safe).

---

## 2. Phase 6 Billing — exact state of the six plans

Goal (from ROADMAP): *A new sign-up can pick a plan, complete Stripe Checkout, see their org's
`planTier` synced from the webhook, hit tier limits with a clear 403 + upgrade prompt, and have
their subscription survive the first billing-cycle renewal automatically.*

| Plan | Scope | State |
|---|---|---|
| 06-01 | Billing foundation: Stripe catalog + client + `0012` additive migration (org billing-state columns) | ✅ committed `5c9f8c5` |
| 06-02 | Stripe webhook + event-ID idempotency, entitlement derived from canonical Subscription | ✅ committed `ebd5708` |
| 06-03 | Tier gates + non-destructive `maxUsers` predicate | ✅ committed `5abe38c` |
| 06-04 | Checkout + public pricing intent (non-authoritative) | ✅ committed `f300572` |
| 06-05 | Admin Settings billing surface + Stripe Customer Portal Server Action | ✅ committed `0baee19` |
| 06-06 | **Verification spine** (cumulative `verify:phase-6`, schema/artifact gates, CI job, secret-safe Stripe test-clock UAT) | 🔄 **IN PROGRESS, UNCOMMITTED** |

**06-06 breakdown (the only open work in Phase 6):**

- ✅ Done but **uncommitted** in the working tree:
  - `package.json` → new `verify:phase-6` = `tsc --noEmit && verify:phase-5 && test lib/stripe && test app/api/webhooks/stripe && db:verify && check:artifacts`
  - `scripts/check-deploy-schema.ts` (+92), `scripts/check-schema.ts` (+94) → assert the 5 new `organizations` billing columns + 2 partial unique indexes from migration `0012`
  - `scripts/check-artifacts.ts` (+257) → assert billing route/module/migration/UAT artifacts
- ⬜ **Not yet created:**
  - `.github/workflows/verify-phase-6.yml` — hosted CI required-check on PR + push
  - `.planning/phases/06-billing/06-UAT.md` — secret-safe Stripe test-clock UAT checklist
  - `06-06-SUMMARY.md`

**Stripe SDK:** `stripe@22.2.0` is committed as a production dependency (operator-approved). Webhook
secret lives in `.env.local` as a sentinel only — never echoed.

---

## 3. Forensic Integrity Audit (6 checks) — verdict: **3 ISSUES FOUND**

| # | Check | Result | Detail |
|---|---|---|---|
| 1 | STATE vs artifacts | ⚠ **FAIL** | STATE.md says `phase_6_planned` / "implementation NOT started"; artifacts show 5/6 plans committed + 6th WIP. STATE frozen at 2026-05-29T03:41Z, before execution. |
| 2 | Orphaned handoff files | ⚠ **FAIL** | `.planning/HANDOFF.json` **and** `.planning/phases/06-billing/.continue-here.md` both present, both dated 2026-05-27 (pre-planning). Should be deleted — work moved far past them. |
| 3 | Deferred-scope drift | ✓ PASS | All `Phase 6+/Phase 7+` references in `06-CONTEXT.md` map to real ROADMAP phases (7, 8). Nothing dangling. |
| 4 | Memory-flagged pending work | ✓ PASS | No `.planning/MEMORY.md` / `.planning/memory/`. |
| 5 | Blocking operational todos | ✓ PASS | `.planning/todos/pending/` empty. |
| 6 | Uncommitted code | ⚠ **FAIL** | 4 tracked source files modified (the 06-06 verify-chain WIP listed above). Expected mid-plan, but it means Phase 6 is **not** in a shippable/committed state. |

**Interpretation:** all three failures are the *same underlying event* — execution of Phase 6 ran
ahead of the bookkeeping. There is no corruption or lost work; the planning layer simply was not
refreshed after the operator green-lit execution.

### Tooling caveat (do not be misled)

`gsd-sdk query roadmap.analyze` reports **`progress_percent: 100`**. **This is false.** It is an
arithmetic coincidence: Phase 2 has 7 summaries for 6 plans (+1) and Phase 6 has 5 summaries for 6
plans (−1), netting 56/56. The honest figure is **5/8 phases = 63%** (matches STATE frontmatter and
`init.progress` `completed_count: 5`). Trust the phase count, not the SDK percentage.

---

## 4. Open risk / debt ChatGPT should keep on its radar

1. **SF-WHSEC-1 (security, OPEN):** the Clerk webhook signing secret (`whsec_…`) was pasted into a
   chat transcript during Plan 02-02. One-click Svix rotation, no code change. **Must rotate before
   any live public-tunnel smoke.** Tracked in `02-VERIFICATION.md` as `human_needed`. Not yet done.
2. **Clerk webhook live-smoke (deferred, low urgency):** end-to-end dashboard test event still
   `human_needed`; in practice exercised by the Phase 3 `<CreateOrganization/>` path.
3. **Unresolved debug sessions (2):** `duplicate-policy-version.md`, `org-topology-uat5.md` —
   tenant-lifecycle cleanup (orphan Title-Case `MMTU Entertainment` org + case-only duplicate pair),
   deferred to the Phase 6+ tenant-lifecycle code path.
4. **SF-CASCADE-AUDIT (Phase 6+):** `0003_fk_hardening` cascade wipes acknowledgments + ai_generations
   on tenant offboarding with no app-level audit-event emission. When org-delete UI lands, the handler
   must log row counts + emit a structured audit event **before** the cascade (ADR-018 append-only).
5. **PR 3.3 — ADR-028 PolicyId branded type:** pending fast-follow (brand `PolicyId`, thread through
   repository signatures, add ts-morph gate). Not blocking Phase 6.
6. **Phase 7+ webhook hardening + test coverage:** invert idempotency-before-dispatch ordering or add
   alerting on stuck `clerk_events`; add vitest for 409/catch paths.

---

## 5. Non-negotiable guardrails (so consultant advice stays in-bounds)

- **Stripe:** verify webhook signatures with the **raw body** (`request.text()`); handle **all five**
  lifecycle events idempotently — `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`. Store
  processed event IDs. Derive entitlement from the **canonical current Subscription**, never from a
  possibly-stale event snapshot. Never trust client-side subscription state — read from DB.
- **Multi-tenancy:** every DB query carries `org_id`; RLS is the last line, app layer scopes too.
- **Migration discipline:** `0012` is additive. Apply to TEST → staging → prod and get
  `db:verify` exit 0 **before** deploying code that depends on it (else first request 503s).
- **MVP non-goals for Phase 6 (do NOT expand scope):** no tax, coupons, trials, custom dunning,
  invoice PDFs, revenue analytics, or custom billing identity.
- **Always:** `tsc --noEmit` clean before every commit; prompt-cache repeated Claude system prompts;
  log every Claude call to `ai_generations`; check tier limits before every Claude call. No `any`.
  Acknowledgment records are append-only — never modify/delete.

---

## 6. Recommended realignment actions (operator + consultant)

**Finish Phase 6 (the actual remaining work):**

1. Create `.github/workflows/verify-phase-6.yml` (required CI on PR + push) and
   `.planning/phases/06-billing/06-UAT.md` (secret-safe Stripe test-clock checklist).
2. Commit the four staged 06-06 scripts + the two new files; write `06-06-SUMMARY.md`.
3. Run `pnpm tsc --noEmit` and `pnpm verify:phase-6` → both exit 0.
4. Operator runs the secret-safe Stripe **test-mode** UAT: checkout → webhook → DB sync → tier-gate
   403 → portal → simulated renewal / payment-failure / cancel, masked evidence only.

**Reconcile the bookkeeping (closes Forensic Checks 1, 2, 6):**

5. Refresh `STATE.md` → `status: phase_6_executing` (or `phase_6_verifying`); bump
   `completed_plans`/`percent`; update Current Position narrative to reflect 5/6 committed + 06-06.
6. **Delete** the stale `.planning/HANDOFF.json` and `.planning/phases/06-billing/.continue-here.md`.
7. Update the consultant file set (`working_context.md`, `system_map.md`, `feature_inventory.md`,
   `risk_register.md`, `backlog.md`) per the keep-current rule and write the `ops/deltas/` entry.
8. Update the `CLAUDE.md` `## Project` context block — the "Phase 6 is pending/planning-only" line is
   now factually wrong.

**Ship + deploy:**

9. Apply migration `0012` to TEST/staging/prod with the `db:verify` exit-0 gate, then open the Phase 6
   PR and squash-merge to `main` (one ship commit per phase).
10. Then track SF-WHSEC-1 rotation and proceed to Wave 2 sibling Phase 7 (Crons + Email).

**GSD next-action routing:** because `summaries(5) < plans(6)`, the literal GSD route is
`/gsd-execute-phase 6` to finish 06-06 — but note 06-06 is already partially built in the working tree,
so in practice it's *finish + commit + verify*, not a fresh execute.

---

## 7. Questions worth the consultant's judgment

1. **Ship 06-06 as-is vs. split the CI workflow?** Is a required GitHub Actions job (`verify-phase-6.yml`)
   the right gate now, or should hosted CI be deferred to a dedicated infra PR to keep the Phase 6 ship lean?
2. **Renewal proof:** SC requires the subscription to "survive the first billing cycle." Are you satisfied
   that a Stripe **test-clock** simulation in 06-UAT.md is sufficient evidence, or do you want a real
   short-interval price in test mode?
3. **State-hygiene cadence:** this drift (execution outrunning STATE/HANDOFF) has now happened across a
   phase boundary. Worth a lightweight rule — refresh STATE + delete handoff at *first commit of
   execution*, not only at pause?

---

*Generated from: `git log`/working-tree diff, `gsd-sdk query {init.progress, roadmap.analyze,
state-snapshot, audit-uat}`, `STATE.md`, `HANDOFF.json`, `06-billing/*`. No secret values are
reproduced in this document.*
