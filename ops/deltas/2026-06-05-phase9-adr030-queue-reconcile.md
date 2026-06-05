# Delta — 2026-06-05 — Phase 9 ship-gate: ADR-030 (`(reviewer)` route group) + reviewer-queue REQ/SPEC reconciliation

**Decision ID:** D-09-01 (continued) · **Branch:** `gsd/phase-9-reviewer` · **Session:** s22 · **Trigger:** operator decisions at the PR #42 ship gate, on two CodeRabbit review threads, after an independent 8-agent verification pass (`wf_abccf908-39f`).

## Context

PR #42 (Phase 9 Reviewer / approval-workflow MVP) was open with the quick-win commit `9e14c25` already applied (and independently re-verified green this session). Two CodeRabbit threads remained as *decisions*, not code defects:

- **#2** — CR suggested relocating the new `app/(reviewer)` route group under `(admin)`.
- **#5** — `REQUIREMENTS.md:94` (and `09-SPEC.md §8/§10/§16`) mandate a per-reviewer queue (`reviewer_id = self`), but the MVP shipped a shared org-scoped queue (`listPendingForOrg`).

Independent verification (5 finders + 3 adversarial skeptics) confirmed: the patch is correct + scope-safe; the shared queue has **no cross-tenant leak** (org-scoped on both tables + RLS; `orgId` server-derived from Clerk, never client-supplied; write path triple-guarded); relocating `(reviewer)` is **harmful** (would dark non-admin reviewers or widen the shared admin auth boundary, reviving the removed CR-PR3-#16 header-bypass hole); and `reviewer_id` is never populated in the MVP (no assignment UI) so a self-filter would dark the queue.

## Operator decisions

- **#2 → Ratify a new ADR-030** amending LOCKED ADR-008 to add `(reviewer)` as a sanctioned 5th route group. Code stays in place. (Relocation rejected.)
- **#5 → Reconcile the docs to the as-shipped shared queue.** Amend `REQUIREMENTS.md` reviewer-surface acceptance + `09-SPEC.md §8/§10/§16` to document the shared org queue; defer per-reviewer `reviewer_id = self` to backlog **rank-18** (assignment UI). Code stays.
- **Landing:** docs authored on the PR #42 branch **before push**, so they answer the two CR threads in-PR.

## What changed (docs only — zero code/schema/package change)

- `.planning/intel/decisions.md` — new **ADR-030** (full entry, amends ADR-008); `amended-by: ADR-030` pointer added under ADR-008; stale forward-ref at the ADR-028 carry-forward nudged `ADR-030+` → `ADR-031+`.
- `.planning/PROJECT.md` — ADR-008 short-form route-group list gains `(reviewer)`; new ADR-030 short-form mirror; locked count 29 → 30.
- `.planning/REQUIREMENTS.md` — reviewer-surface visibility line + acceptance bullet reconciled to the shared org queue; per-reviewer filtering deferred to rank-18 with the dead `listPendingForReviewer` seam named as the hook.
- `.planning/phases/09-reviewer/09-SPEC.md` — §8 queue-read cell → `listPendingForOrg`; an **AS-SHIPPED RECONCILIATION** callout under §8; §10 page.tsx note; §16 multi-tenancy line corrected to `org_id`-scoped (not `reviewer_id`-scoped).
- `.planning/consultant/backlog.md` — rank-18 note records the REQ/SPEC reconciliation + the implementation hook.
- `.planning/consultant/working_context.md` — `Updated:` lead refreshed to s22; new s22 bullet.

## Consultant keep-current review

| File | Status | Note |
|---|---|---|
| `working_context.md` | **updated** | s22 lead + bullet. |
| `backlog.md` | **updated** | rank-18 reconciliation note. |
| `system_map.md` | **no-change** | Already states the shared queue (line 140) + `(reviewer)` route group (lines 3/29/81/159) — already accurate. |
| `risk_register.md` | **no-change** | R-017 already Mitigated and already notes "the MVP ships a shared queue"; no new risk introduced. |
| `feature_inventory.md` | **no-change** | No divergent queue/route-group claim. |

## Verification

- 8-agent verification workflow `wf_abccf908-39f` — patch PASS; gate green (tsc 0 · immutability 0/self-test non-vacuous · brand 24/24 · transitions 35/35); ADR conf 95; queue conf 96; 3 skeptics could not refute (tenant-leak ×2, relocate-harmful).
- Docs-only change — no code path touched; the typecheck/immutability/brand/test gates are unaffected (re-confirmed `tsc` 0 after the edits).

## Follow-ups (carried / non-blocking)

- **Operator:** push `gsd/phase-9-reviewer`; **close PR #41 as superseded**, merge **only** PR #42. Post-merge: reword the `lib/stripe/products.ts` TIER_LIMITS comment (the #41 "never enforced" text is false once #42 enforces in `publish()`); flip "approval workflows" marketing copy coming-soon → shipped.
- **rank-18** per-reviewer assignment UI (hook = dead `listPendingForReviewer`); **rank-20** DB-tier `REVOKE` on `review_decisions` (ASK-FIRST).
- New non-blocking notes: immutability regex misses a quoted-identifier table inside `execute(sql\`…\`)` for any verb (pre-existing, not worsened); `review_decisions` FKs reference bare PK not composite `(org_id, id)` (skeptic-ruled non-exploitable — app guards + RLS block cross-org before insert). Optional future hardening.
- `(onboarding)` remains an undocumented ADR-008 deviation — optional housekeeping amendment.
