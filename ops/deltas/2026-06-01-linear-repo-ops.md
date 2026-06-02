# Linear Repo Ops Tracking Surface

Date: 2026-06-01
Branch: `docs/linear-repo-ops-delta`
GSD stage: ship review / repo bookkeeping closeout
Scope: docs-only repo-ops bookkeeping

## Summary

Recorded the external Linear Repo Ops tracking surface for
`mmtuentertainment/PolicyPilot`.

- Linear tracking is live and additive only.
- The original Linear setup did not touch this repository.
- No product implementation, Phase 7 planning, secrets, third-party dashboards,
  app code, workflows, packages, schema, migrations, tests, or remote branches
  changed in this bookkeeping patch.

## Verification Before Editing

- Preferred worktree verified:
  `C:\Users\matth\Desktop\PolicyPilot-phase6-pr`.
- Worktree topology verified: `main` is owned by
  `C:\Users\matth\Desktop\PolicyPilot-phase6-pr`; sibling
  `C:\Users\matth\Desktop\PolicyPilot` is detached at `e2a7283`.
- `git status --short --branch` was clean on `main`.
- `origin/main` was fetched with prune.
- PR #32 verified `MERGED`:
  https://github.com/mmtuentertainment/PolicyPilot/pull/32
- PR #33 verified `MERGED`:
  https://github.com/mmtuentertainment/PolicyPilot/pull/33
- `243067e` verified as an ancestor of `origin/main`.
- `e2a72835e0809414717e09956365f4fffd05a122` verified as an ancestor of
  `origin/main`.
- This delta file did not already exist before editing.

## Current Repo-State Facts

- Phase 6 is shipped via PR #32 at squash commit
  `243067e9f259561a595230e5e7d3e97634040157` (`Phase 6: Billing`).
- PR #33 cleanup is shipped at squash commit
  `e2a72835e0809414717e09956365f4fffd05a122`.
- Phase 7 has not started.
- SF-WHSEC-1 remains open.
- Older memory or older deltas that described Phase 6 as planning-only,
  paused, pending, or not implemented are superseded by the verified
  `origin/main` and PR state above.

## Linear Project

- Project: `PolicyPilot - Repo Ops`
- URL:
  https://linear.app/mattjutt-linear/project/policypilot-repo-ops-39e5def694ee
- Team: `MAT` / `Mattjutt linear`
- Project status at creation: Backlog

## Labels

Created labels are namespaced to avoid collisions in the shared MAT team:

- `pp:ship-hygiene`
- `pp:security`
- `pp:billing`
- `pp:operator-only`
- `pp:blocked`

## Issues

- MAT-20 - Resolve stale local `gsd/phase-6-billing` diverged from shipped
  `origin/main` - Medium - `ship-hygiene`, `operator-only`
  - URL: https://linear.app/mattjutt-linear/issue/MAT-20
- MAT-21 - Prune stale local branch `chore/phase-4-post-ship-audits` - Low -
  `ship-hygiene`
  - URL: https://linear.app/mattjutt-linear/issue/MAT-21
- MAT-22 - SF-WHSEC-1 - rotate Clerk webhook secret before any live webhook
  smoke - High - `security`, `operator-only`, `blocked`
  - URL: https://linear.app/mattjutt-linear/issue/MAT-22
- MAT-23 - Reconcile Stripe CLI / webhook-secret account with app test account
  (R-011) - Medium - `billing`, `operator-only`
  - URL: https://linear.app/mattjutt-linear/issue/MAT-23
- MAT-24 - Tenant-lifecycle cleanup - MMTU Entertainment org + Acme Test Co
  sub - Low - `billing`, `operator-only`
  - URL: https://linear.app/mattjutt-linear/issue/MAT-24

## Operational Gate

MAT-22 / SF-WHSEC-1 is the live-work gate. Do not run, request, or authorize
live webhook smoke until Matthew rotates the Clerk webhook secret.

## Intentionally Excluded From Linear Repo Ops

These items were excluded because they edge into product work or Phase 7
planning rather than repo-ops bookkeeping:

- SF-CASCADE-AUDIT
- Webhook hardening and webhook test-coverage carry-forwards
- Nyquist gaps

## Stray Linear Draft Note

During Linear setup, an unfocused browser shortcut may have created a stray
unsent draft by pressing `c`. Matthew reported exactly five issues verified in
the project, and no issue was submitted from that draft.

## GSD Command Handling

- `gsd-tools --help`, `gsd-sdk --help`, and `gsd-sdk query --help` exposed the
  installed `gsd-sdk` surface: `run`, `auto`, `init`, and `query`.
- No repo `QUERY-HANDLERS.md` or applicable repo-specific ship/review/docs
  handler was present.
- GSD fallback: docs-only ship bookkeeping verification
- No GSD command output was fabricated.

## Consultant Keep-Current

- `.planning/consultant/working_context.md`: reviewed, no-change. Existing file
  already records Phase 6 shipped, Phase 7 not started, SF-WHSEC-1 operator
  follow-up, Stripe CLI/account mismatch, and local branch-retirement caution.
- `.planning/consultant/system_map.md`: reviewed, no-change. The Linear Repo
  Ops surface is external bookkeeping and does not alter architecture, trust
  boundaries, workflows, routes, data stores, or integrations.
- `.planning/consultant/feature_inventory.md`: reviewed, no-change. No product
  feature shipped, changed scope, moved phase, or became deferred.
- `.planning/consultant/risk_register.md`: reviewed, no-change. SF-WHSEC-1,
  Stripe CLI/account mismatch, and branch/process cautions are already tracked;
  this patch only records their external Linear references.
- `.planning/consultant/backlog.md`: reviewed, no-change. Existing next
  micro-batch remains Matthew authorization for Phase 7 planning or
  operator-only SF-WHSEC-1 follow-up; Linear issue creation does not change
  phase sequencing.

## Boundary Check

- Application code changed: no.
- Tests changed: no.
- GitHub workflows changed: no.
- Planning state, roadmap, or project docs changed: no.
- Consultant files changed: no.
- Packages or lockfile changed: no.
- Schema, migrations, Drizzle metadata changed: no.
- Clerk, Stripe, Supabase, Anthropic, Resend, Vercel, or Railway code changed:
  no.
- Secrets inspected, printed, configured, rotated, or committed: no.
- Linear mutated by this patch: no.
- Remote branches pushed or changed: no.
- Phase 7 planning or implementation started: no.

## Next

Smallest next task: Matthew may use the Linear Repo Ops project for
operator-only cleanup tracking, especially MAT-22 / SF-WHSEC-1 before any
future live webhook smoke.
