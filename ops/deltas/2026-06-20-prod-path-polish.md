# Delta - 2026-06-20 - Prod path polish

**Author:** Codex
**Branch:** `docs/prod-path-polish`
**Type:** pure-docs wording/order polish

## What
Polished the already-confirmed prod-DB provisioning framing without changing the facts: host-path
ordering now follows `docs/runbooks/launch-mvp.md` §2 everywhere touched (pause non-prod for $0,
Supabase Pro without PITR, ASK-FIRST non-Supabase host); rot-prone
`scripts/with-deploy-creds.ps1` line references now point to the semantic `REPLACE_WITH_*` guard;
and the Supabase Pro cost is dated only in launch-mvp while other live docs use qualitative paid-tier
wording with pointers back to launch-mvp.

## Why
The prior reconciliation made the prod-path facts correct, but a few live docs still had less durable
wording: some led with Pro instead of the cheapest-first order, two references pinned script line
numbers, and multiple docs repeated an approximate Pro price that should live in one dated source.

## Consultant Set Review
- `risk_register.md` (R-015): updated paid-tier wording and launch-mvp cost pointer.
- `backlog.md` (rank-15): updated paid-tier wording, launch-mvp cost pointer, and host-path order.
- `working_context.md`: no-change after review.
- `system_map.md`: no-change after review.
- `feature_inventory.md`: no-change after review.

## Scope
Pure documentation/comment polish only. No code, migration, schema, package, CI, deploy, hosted
setting, secret, Stripe, or Supabase project setting changed. Existing ops deltas and phase records
were left untouched.

## Verification
- `git grep -nF "line 75-77" -- docs scripts .planning` → zero
- `git grep -nE "~?\$25/mo" -- docs scripts .planning ':!.planning/phases' ':!ops/deltas'` → exactly one launch-mvp hit
- Host-path order confirmed pause → Pro → Neon/ASK-FIRST in `.planning/codebase/CONCERNS.md` action path and `scripts/deploy-config.json` `prod.$comment`.
- `node -e "JSON.parse(require('fs').readFileSync('scripts/deploy-config.json','utf8'))"` → no error
- `git diff --name-only` → expected docs/comment/delta file set only
- `pnpm tsc --noEmit` → exits 0
