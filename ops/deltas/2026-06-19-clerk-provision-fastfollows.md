# Delta - 2026-06-19 - Clerk provisioning fast-follows

**Author:** Codex
**Branch:** `codex/clerk-provision-fastfollows-0619`
**Type:** dev-ops hardening + tests + docs/CI hygiene

## Scope

Fast-follow nits from the post-PR #50/#51/#52 packet. Changes stay limited to the dev Clerk provisioning repair path, shared Clerk role parsing, test coverage, and named docs/CI hygiene. No product runtime auth behavior, middleware, `getOrgContext`, schema, migrations, packages, secrets, Stripe, Resend, Railway, Vercel project settings, or Supabase project config changed.

## What Changed

- Extracted Clerk membership role normalization into `lib/auth/clerk-role.ts` and reused it from both the Clerk webhook handler and the dev provisioning script.
- Added dev provisioning tests for production refusal, non-local host refusal, transaction rollback shape, requested-user-absent errors, pagination total-count/short-page termination, max-page backstop, and DSN scrub formatting.
- Hardened `pnpm dev:provision-org -- --apply` so non-local DB hosts require `NODE_ENV=development`, `NODE_ENV=test`, or explicit `--allow-host`.
- Added top-level failure-message scrubbing for database URLs, users, passwords, hosts, and Supabase hostnames.
- Added Supabase `.env` / `.env.*` ignore coverage, refreshed the dev provisioning runbook guardrails, corrected the stale test count in the original delta, added a dated full-gate Postgres digest comment, and cleared the deployment password credential reference after SecretStore write.

## Consultant Set Review

- `working_context.md`: no-change; this does not change product state or launch sequencing.
- `system_map.md`: no-change; no architecture or trust-boundary change beyond a dev-only script guard.
- `feature_inventory.md`: no-change; not a product feature.
- `risk_register.md`: no-change; existing dev-provisioning mitigation remains process-level.
- `backlog.md`: no-change; packet items are fast-follow polish, not new backlog.
- `README.md`: no-change.

## Verification

- Pending in this branch: focused provisioning vitest, Clerk webhook vitest, typecheck, gated verifier, and `git diff --check`.
