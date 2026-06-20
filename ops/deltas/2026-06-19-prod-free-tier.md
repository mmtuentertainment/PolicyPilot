# Delta - 2026-06-19 - Production Supabase free-tier launch path

**Author:** Codex
**Branch:** `codex/prod-free-supabase-docs`
**Type:** docs/comment reconciliation

## Scope

Documents the operator-approved production Supabase target path as a third Free project in a separate Free org at $0/month, with PITR waived by operator decision and a reversible later upgrade path to paid compute without PITR. Because current Supabase docs still describe a two-active-Free-project entitlement across organizations where a user is Owner/Admin, the Dashboard project-creation step remains the operator feasibility check. This branch is secret-safe documentation/comment work only.

No deploy, migration, secret, package, schema, runtime auth, webhook, middleware, Railway config, Vercel setting, Supabase dashboard setting, or production data change was made. The operator-owned `scripts/deploy-config.json` production `user` placeholder remains unchanged.

## Current Docs Check

- Context7 was used for Supabase docs, resolving `/supabase/supabase`.
- Official Supabase pricing and billing docs were checked on 2026-06-20.
- Current public docs state each user is entitled to two active Free projects, paused projects do not count, and the limit applies across organizations where the user is Owner/Admin.
- The requested $0 path is still documented as the operator target, but OP-1 must confirm the Supabase Dashboard accepts the separate-Free-org project under the actual account/team setup.

## What Changed

- `docs/runbooks/launch-mvp.md`: replaced the Pro+PITR production requirement with the Free separate-org target path, added the current Supabase Free-project entitlement caveat, added idle-pause notes, clarified deploy-config placeholder ownership, marked `db:verify:prod` as schema/catalog only, and added the hard-blocking post-deploy cross-org RLS smoke.
- `docs/runbooks/deploy-migrations.md`: aligned production migration prerequisites with the Free separate-org target path, clarified verifier limits, and corrected deploy-hook wording.
- `scripts/deploy-config.json`: updated the production `$comment` only; host and user values remain operator-owned placeholders.
- `.planning/codebase/CONCERNS.md`: reconciled the production Supabase risk/action notes to the Free separate-org path.
- `.env.local.example`: replaced stale `secrets/*.env` wording with the current SecretStore and deploy-config flow.
- `.planning/codebase/INTEGRATIONS.md`: clarified that Supabase public/service-role env vars are runtime-inert today because the app uses Drizzle/`postgres` for database access.

## Consultant Set Review

- `working_context.md`: no-change on this branch; the canonical update is this delta because the branch is docs/comment reconciliation and broader consultant files already have known stale HEAD-pin drift from earlier merged work.
- `system_map.md`: no-change; no runtime architecture or trust-boundary change.
- `feature_inventory.md`: no-change; not a product feature change.
- `risk_register.md`: no-change; the material launch risk is captured in `CONCERNS.md` and this delta.
- `backlog.md`: no-change; optional runtime keep-alive, health, and automated production RLS checks remain operator-choice follow-ups.
- `README.md`: no-change.

## Verification

- `git diff --check`: passed.
- `pnpm check:artifacts`: passed (567/567 assertions).
- `pnpm exec tsc --noEmit`: passed.
- `git diff --cached --check`: passed.

## Operator-Only Remaining

- Create the separate Free Supabase organization and production project.
- Fill production pooler host/user details in `scripts/deploy-config.json` only after the project exists.
- Store the production database password in the approved local secret store.
- Apply and verify production migrations.
- Configure hosted Vercel and Railway production environment variables.
- Deploy production services.
- Run the real-session cross-org RLS smoke before adding real tenants.
