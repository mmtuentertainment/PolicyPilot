# Delta — 2026-06-16 — Scaffold Supabase GitHub Integration (Drizzle-authoritative) + PS5.1 deploy-script fix

**Author:** Claude Code · **Branch:** `claude/supabase-gh-integration-0616` (PR pending) · **Type:** Ops/infra scaffolding + script compat fix (non-functional)

## What changed
Packaged previously-uncommitted ("homeless on `main`") launch-prep work into a reviewable branch:

1. **`supabase/` (new):** top-level `config.toml` + `README.md` + standard `supabase init` `.gitignore`,
   so the Supabase Dashboard **GitHub Integration** can use `.` as its **Working directory**. The
   folder is deliberately Drizzle-safe:
   - `config.toml` carries a PolicyPilot header note + `[db.migrations].enabled = false`.
   - `README.md` documents the Dashboard setup (Working dir `.`, automatic branching allowed,
     **Deploy-to-production OFF**, no files under `supabase/migrations/`).
   - `.gitignore` is the stock init output (ignores `.branches`, `.temp`, and all `.env*`) → no
     local runtime state or secrets can be committed through it.
2. **`docs/runbooks/deploy-migrations.md`:** added a "Supabase GitHub Integration" section codifying
   the Drizzle-authoritative guardrails above, **and** corrected the stale `migrate.yml` secrets
   description — it now reads "GitHub **Environment** secrets named `DATABASE_URL` / `DIRECT_URL` in
   each target environment (`staging`/`prod`)", matching the actual workflow
   (`.github/workflows/migrate.yml:38,64-65,83-84`). The old text wrongly claimed repository secrets
   `STAGING_*`/`PROD_*`.
3. **`scripts/store-deploy-password.ps1`:** use the `SHA256` **instance** API
   (`.Create()` + `.ComputeHash()` in a `try/finally Dispose()`) instead of the static
   `SHA256.HashData`, which does not exist on Windows PowerShell 5.1 / .NET Framework. The SHA prefix
   is a one-way verification display only; behavior is unchanged on .NET 6+.

## Why
- Establishes the standard `supabase/` project path the Dashboard GitHub Integration expects, **without**
  ceding any migration authority — Drizzle stays the single source of truth (`drizzle/meta/_journal.json`).
- The runbook correction removes real doc drift (operator following the old text would create the wrong
  GitHub secrets).
- The PS5.1 fix is load-bearing: `store-deploy-password.ps1` runs on the operator's Windows PowerShell 5.1
  shell during the staging/prod SecretStore steps; the static API would throw there.

## Guardrails honored
- **Drizzle owns migrations** — `db.migrations.enabled = false`, no `supabase/migrations/`, deploy-to-prod OFF.
- **No secrets in repo** — every sensitive `config.toml` value uses `env(...)`; `.gitignore` excludes `.env*`.
- No schema change, no dependency added, no app/runtime code touched, Stripe untouched (test-mode posture intact).

## Consultant set review (keep-current)
- `working_context.md` — **no-change** (no scope/decision shift; ops scaffolding only).
- `system_map.md` — **no-change** (no app/runtime architecture change; migration authority unchanged).
- `feature_inventory.md` — **no-change** (no product feature touched).
- `risk_register.md` — **no-change**; *watch note:* the GitHub Integration introduces a latent path to
  bypass Drizzle (if "Deploy to production" is ever enabled or files land under `supabase/migrations/`).
  Mitigation is documented in three places (config header, `supabase/README.md`, runbook section). Register
  a risk line only if the integration's prod-deploy is ever turned on.
- `backlog.md` — **no-change** (minor follow-up note below; not promoted).

## Follow-up notes (non-blocking)
- `supabase/config.toml` `[db].major_version = 17` is the **local** `supabase start`/`db diff` value. It is
  inert today (local stack not used; `db.migrations.enabled = false`). If the local Supabase stack is ever
  used for `db diff`, set it to match the remote PolicyPilot DB major version.

## Verification
No TS touched (`tsc` unaffected). Doc edit fact-checked against the live `migrate.yml`. `config.toml`
audited for secrets (none — all `env(...)`). `supabase/` would stage exactly 3 files (`.gitignore`,
`config.toml`, `README.md`); no `.temp`/`.branches` junk. Real proof = PR CI gate green.

## Cross-PR note
PR #50 (`codex/docs-ci-followup-0616`) also edits `docs/runbooks/deploy-migrations.md` (the `12→14`
tenant-table count near line ~248). This branch edits a different region (~line 306+, CI/CD path +
new section), so no conflict is expected; whichever merges second may need a trivial rebase.
