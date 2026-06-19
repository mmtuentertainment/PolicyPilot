# Delta — 2026-06-16 — residual docs/CI follow-up

**Author:** Codex · **Branch:** `codex/docs-ci-followup-0616` · **Type:** docs + CI hardening only.

## Scope

This follow-up clears the residual doc-debt from the post-PR #49 launch-gate handoff. It does not change application code, schema migrations, dependencies, secrets, deploy settings, staging/prod data, Stripe, Resend, Railway, Vercel, or Supabase project configuration.

## Changes

- `.github/workflows/verify.yml` now pins the full-gate Postgres service image to the same verified `postgres:16` digest already used by the three per-phase verifier workflows.
- `docs/runbooks/deploy-migrations.md` updates the deploy-schema verifier prose/sample from 12 to 14 tenant-scoped tables, matching the current green staging verifier output.
- `reference/SCHEMA.md` keeps `notifications.org_id` documented and reconciles the reference snippet to the live `onDelete: 'cascade'` shape in `lib/db/schema.ts`.
- `.planning/STATE.md` records the staging pooler-auth propagation audit line from 2026-06-16T09:07:19.677Z.
- `.planning/consultant/backlog.md` marks SF-2 as shipped/monitor now that the residual `verify.yml:28` floating tag is pinned.

## Consultant Set

No broader consultant refresh was needed: this batch only closes already-identified docs/CI debt and records one operator-run staging-auth audit event. The backlog row above is the only consultant artifact that carried an actionable open SF-2 status.

## Verification

Use narrow docs/CI checks only: `git diff --check`, targeted `rg` checks for the stale counts/floating image, and YAML parse of `.github/workflows/verify.yml`.
