# Delta — 2026-06-16 — CI: per-phase verifiers use ephemeral Postgres (kill shared-DB flake)

**Author:** Claude Code · **Branch:** `gsd/phase-8-validation` (PR #48) · **Type:** CI infra (non-functional)

## What changed
Rewrote `.github/workflows/verify-phase-6.yml`, `verify-phase-7.yml`, and `verify-phase-8.yml`
so each per-phase verifier provisions its **own ephemeral `postgres:16` service container**
(plus a created `policypilot_ci_test`, Supabase stubs `auth.jwt()` + role `authenticated`,
`db:migrate` + `db:migrate:test`) and runs `verify:phase-N` against it — the `postgres:16` +
stub + migrate pattern already proven green by `verify.yml`'s full-gate job.

**Hybrid (deliberate):** only the **database** is localized to the container (the four
`DATABASE_URL*`/`DIRECT_URL*` values are local literals). All **app secrets**
(Clerk/Stripe/Anthropic/Resend/…) are still referenced **by name** via `${{ secrets.* }}` and
written from `$VAR` references, never hardcoded — so the `check:artifacts` security guardrail
("verify-phase-6.yml references secrets by name; no literal `sk_`/`pk_`/`whsec_`/`price_`
values") stays intact and passes (567/567).

Previously these three workflows all pointed `DATABASE_URL` at the **one shared remote Supabase
TEST DB** via `secrets.*`. Firing together on every PR, their `TRUNCATE … CASCADE` resets
collided → `deadlock detected (40P01)` / RLS positive-control `0 rows`. This was a pure
CI-orchestration flake (verified against primary logs: failures swap jobs run-to-run; all three
runs start at the identical instant; failures occur in `check:rls`, upstream of `pnpm test`).

## Why
- Eliminates the cross-workflow shared-DB contention flake **permanently** (each run is isolated).
- Also removes the secondary flake of the free-tier remote TEST project auto-pausing mid-run.
- **Gate NOT weakened:** the `pnpm verify:phase-N` command is byte-identical; only *where* the DB
  lives changed. Adversarially verified (`wf_d4d7ed15-6e8`, 3 lenses) — all GO; RLS is genuinely
  enforced locally because the checks `SET LOCAL ROLE authenticated` (non-superuser) and assert a
  predicate-free negative probe that can only pass if RLS fires.

## Tradeoff (recorded, accepted)
Per-phase `db:verify` now verifies the **local** migrated container against the migration journal
(self-consistent), not against the deployed remote Supabase schema. Drift-vs-real-DB coverage is
preserved by `verify.yml`'s gated `live-verification` job (workflow_dispatch/schedule, real secrets).

## Consultant set review (keep-current)
- `working_context.md` — **no-change** (no scope/decision shift; CI hygiene only).
- `system_map.md` — **no-change** (no app/runtime architecture change; CI-only).
- `feature_inventory.md` — **no-change** (no product feature touched).
- `risk_register.md` — **update suggested (follow-up):** the shared-TEST-DB verifier-contention
  flake (cf. `gate-needs-two-supabase-projects`) is now **mitigated** for the per-phase verifiers
  by per-run DB isolation; downgrade/close that risk line when next touched.
- `backlog.md` — **add (follow-up):** (a) DRY the duplicated CI Postgres setup into a composite
  action / reusable workflow (now in 4 files); (b) optional `paths:` filter so per-phase verifiers
  skip unaffected PR commits.

## Verification
`tsc --noEmit` clean (no TS changed). YAML validated (`yaml.safe_load` ×3). Files differ only in
the `6/7/8` token. Real proof = first post-push CI run with all three per-phase verifiers green
**concurrently** (no rerun needed).
