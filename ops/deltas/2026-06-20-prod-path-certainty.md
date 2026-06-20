# Delta - 2026-06-20 - Prod path certainty reconciliation

**Author:** Codex
**Branch:** `docs/prod-path-certainty`
**Type:** pure-docs certainty reconciliation

## What
Bumped `docs/runbooks/launch-mvp.md` §2 (items 1–3), `docs/runbooks/deploy-migrations.md`
§"When to use", `scripts/deploy-config.json` (`prod.$comment`), and
`.planning/codebase/CONCERNS.md` (Cause-B bullet + action-path item 1) from
"feasibility-check / subject to Dashboard acceptance" to the confirmed state: the literal
3rd-active-Free-in-separate-org is **blocked** by the account-global 2-active-Free cap; default
paths = Supabase Pro without PITR (~$25/mo), paused-non-prod $0, or ASK-FIRST Neon-Free $0.
Aligns these stragglers to the canonical R-015 / rank-15.

## Why
R-009: stale optimistic framing misleads future AI sessions. The consultant set was corrected
in PR #56, but launch-mvp.md §2, deploy-migrations.md, deploy-config.json's placeholder comment,
and CONCERNS.md lagged at the older "if the Dashboard accepts it" certainty. PITR remains
operator-waived and is not an ADR-018 requirement.

## Consultant Set Review
- `risk_register.md` (R-015): no-change — already canonical (source of this reconciliation).
- `backlog.md` (rank-15): no-change — already canonical.
- `working_context.md`: no-change.
- `system_map.md`: no-change.
- `feature_inventory.md`: no-change.

## Scope
Pure documentation only. No code, migration, schema, package, CI, deploy, hosted setting,
secret, Stripe, or Supabase project setting changed.

## Caveat
`.planning/codebase/CONCERNS.md` is auto-generated codebase intel (gsd-map-codebase). This is
an interim hand-correction; a future intel regeneration must carry the same blocked framing.

## Verification
- `git grep -nF "subject to Dashboard acceptance" .planning docs` → zero
- `git grep -nF "the Dashboard creation step is the feasibility check" docs` → zero
- `git grep -nF "if the Dashboard accepts it" .planning` → zero
- `git grep -nF "Free third Supabase project in a separate Free org" -- docs scripts` → zero
- `git grep -nF "subject to the Supabase Dashboard accepting" -- docs` → zero
- `git grep -nF "once the Free third project exists in a separate Free org" -- scripts` → zero
- `git grep -niE "third (active )?free .*separate .*org" -- docs reference .planning scripts` → only blocked-framed/canonical hits
- `git diff --name-only` → exactly launch-mvp.md, deploy-migrations.md, CONCERNS.md, deploy-config.json, the delta
- `pnpm tsc --noEmit` → exits 0 (docs-only; invariant)
