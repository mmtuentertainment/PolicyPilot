# Delta — 2026-06-20 — STATE/ROADMAP reconcile to `dec2cbd`

**Change:** Reconciled `.planning/STATE.md` + `.planning/ROADMAP.md` to current `main` tip `dec2cbd`
(was frozen at `7ba6ba2`, 2026-06-16): updated focus/Branch/Main-HEAD/Next-action tips + extended the
prior-tips chain through PRs #49–#58; flipped ROADMAP Phase 8 to `[x]` (shipped PR #48 `03c18d4`).
Cleared two FALSE "pending" obligations: PR 3.3 ADR-028 PolicyId branded type (already SHIPPED PR #13
`bd2257a`, live `lib/policies/types.ts:39`) and webhook T8 test coverage (already DONE,
`app/api/webhooks/clerk/route.test.ts:108`/`:118`). Source: resume-readiness audit `wf_1c4d490f-dd6`.

**Review follow-up (CodeRabbit run `d49c4dba` on PR #59 + adversarial audit `wf_6e14f32a-04e`):** reconciled two
internal contradictions the Phase-8 narrative flip surfaced — (1) the ROADMAP § Progress table Phase 8 row (still
read "Executed … PR open on gsd/phase-8-validation … 2026-06-15" → now "Complete — shipped via PR #48 at `03c18d4`
… 2026-06-16"; the row CodeRabbit flagged), and (2) the STATE § Phase Roster Phase 3 row (cleared the duplicate
"PR 3.3 … still queued" and corrected "PR #9/#10/#11 OPEN" → SHIPPED with verified SHAs `d185efc`/`85aebed`/`28f646e`,
all ancestors of `main`).

**Residual doc-debt SWEPT (follow-up commit, 2026-06-21):** the pre-existing items below (present at base tip
`dec2cbd`, NOT introduced by this reconcile) were resolved in a third commit on this branch:
- ROADMAP Phase 7: all 8 plan checkboxes (`07-01`…`07-08`) marked `[x]`; the "7 plans" count corrected to "8 plans"
  and the missing `07-08-PLAN.md` (notification bell UI, wave 2) added to the enumeration. Evidence: on-disk
  `.planning/phases/07-crons-email/` holds 8 `NN-PLAN.md` files (07-01…07-08), so the three "8/8" surfaces (Progress
  table, STATE line 46, STATE roster) were already correct — only the ROADMAP detail was stale. All four Phase-7
  count surfaces now agree at 8.
- ROADMAP Phase 8 detail: `**Plans**: TBD` → "1 plan — CSV-first validation slice (AC#5) shipped via PR #48"; added
  the `**Status**: Shipped …` line that the Phase 5/6 blocks carry.
- STATE frontmatter: `total_plans 64 / completed_plans 65` (completed > total — impossible) recomputed to `66 / 66`
  = sum of the Progress-table denominators for the 8 build phases (5+7+15+14+10+6+8+1 = 66; Phase 9 Reviewer is
  out-of-band with no standalone `NN-PLAN.md` and is excluded, consistent with `total_phases: 8`).
- STATE Phase 4 roster: stale "deploy-prep PR in flight" → SHIPPED via PR #18 `bae9174` + PR #20 `9f4d8eb` (both
  verified ancestors of `main`).

**Consultant set review (keep-current):** `no-change`. working_context / system_map / feature_inventory /
risk_register / backlog are unaffected — this is bookkeeping that corrects stale doc state, not a
product/architecture/risk change. (The separate un-surfaced-backlog items the audit found are tracked
out-of-band; not part of this reconcile.)
