# Delta - 2026-06-16 - dev Clerk org provisioning repair

**Author:** Codex
**Branch:** `codex/clerk-dev-provisioning-0616`
**Type:** dev-ops repair + docs

## Scope

Clears local-dev `OrgNotProvisionedError` caused by creating Clerk orgs while localhost cannot receive Clerk webhooks. No production auth behavior, middleware, `getOrgContext`, webhook verification, schema, migrations, packages, secrets, deploys, Stripe, Resend, Railway, Vercel, or Supabase project config changed.

## What Changed

- Added `pnpm dev:provision-org` as an explicit dry-run/apply repair command.
- Added pure helper/tests for Clerk role normalization and membership target derivation.
- Added operator runbook `docs/runbooks/dev-clerk-org-provisioning.md`.
- Updated launch runbook and runbook index.
- Marked backlog rank 14 / R-012 / active watchlist as mitigated by the repair path.

## Safety

- Defaults to dry-run; `--apply` is required for DB/Clerk writes.
- Reads secrets only from `.env.local`; prints only DB host and masked Clerk IDs.
- Refuses `NODE_ENV=production`.
- Does not fake `clerk_events` or replay Svix payloads.
- Runtime auth remains unchanged; `getOrgContext` still fails closed if DB state is missing.

## Consultant Set Review

- `working_context.md`: edited; active watchlist points to the repair path.
- `risk_register.md`: edited; R-012 mitigated/process.
- `backlog.md`: edited; rank 14 shipped/monitor.
- `system_map.md`: no-change, because there is no runtime architecture change.
- `feature_inventory.md`: no-change, because this is not a product feature.
- `README.md` in `.planning/consultant`: no-change.

## Verification

- `pnpm exec vitest run scripts/provision-dev-org-lib.test.ts` - passed, 5 tests.
- `pnpm dev:provision-org -- --help` - passed, script loads without touching Clerk or DB.
- `pnpm typecheck` - passed.
- `git diff --check` - passed.
