# Delta - 2026-06-20 - Prod path consultant reframe

**Author:** Codex
**Branch:** `docs/prod-path-reframe`
**Type:** pure-docs consultant reframe

## What

Reframed R-015 in `.planning/consultant/risk_register.md` and rank-15 in `.planning/consultant/backlog.md` to decouple PITR from ADR-018 and reflect the account-global Free-project cap plus the deferred production path. The wording is aligned to `docs/runbooks/launch-mvp.md` §2 and PR #55.

## Why

R-009 risk: stale consultant files mislead future AI sessions. The edited lines asserted a superseded "Pro+PITR per ADR-018" path. ADR-018 is the append-only acknowledgment audit-trail invariant; PITR had been mistakenly coupled to that invariant and is operator-waived for the pre-revenue stand-up.

## Consultant Set Review

- `risk_register.md`: updated R-015.
- `backlog.md`: updated rank-15 title and notes.
- `working_context.md`: no-change; verified no `Pro+PITR` assertion.
- `system_map.md`: no-change; verified no `Pro+PITR` assertion.
- `feature_inventory.md`: no-change; verified no `Pro+PITR` assertion.

## Scope

Pure documentation only. No code, migration, schema, package, CI, deploy, hosted setting, secret, Stripe, Supabase project setting, or runtime behavior changed.

## Verification

- `git grep -n "Pro+PITR" -- .planning docs`: passed with zero tracked live-doc hits.
- `git diff --name-only`: passed with only `.planning/consultant/risk_register.md`, `.planning/consultant/backlog.md`, and `ops/deltas/2026-06-20-prod-path-reframe.md`.
- `pnpm tsc --noEmit`: passed.

Note: raw filesystem grep also sees ignored historical files under `.planning/reports/`; those are outside the tracked live-doc set and were not edited.
