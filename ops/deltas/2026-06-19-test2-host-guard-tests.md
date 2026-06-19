# Delta - 2026-06-19 - TEST-2 host-guard allow-path coverage

**Author:** Codex
**Branch:** `codex/test2-host-guard-allowpath-tests`
**Type:** dev-only test coverage

## Scope

Adds direct unit coverage for the dev Clerk provisioning host guard allow paths and non-pooler refusal message. This is limited to the development repair script and tests. No product/runtime auth behavior, middleware, webhook behavior, schema, migration, package, secret, Stripe, Resend, Railway, Vercel, or Supabase project setting changed.

## What Changed

- Exported `assertSafeApplyHost` from `scripts/provision-dev-org.ts` so tests can exercise the pure synchronous guard without invoking `main()`.
- Added direct guard tests covering `--allow-host`, `NODE_ENV=development`, `NODE_ENV=test`, dry-run, localhost, `127.0.0.1`, IPv6 loopback, non-pooler non-local refusal, refused-error class, undefined `nodeEnv`, and unparseable `DATABASE_URL`.
- Kept the existing production and pooler refusal tests intact.

## Consultant Set Review

- `working_context.md`: no-change; test-only dev-tool coverage, no product state or launch sequencing change.
- `system_map.md`: no-change; no architecture, route, trust-boundary, or runtime flow change.
- `feature_inventory.md`: no-change; not a product feature.
- `risk_register.md`: no-change; no new material risk and no risk score changed.
- `backlog.md`: no-change; fast-follow test coverage, not a new backlog item.
- `README.md`: no-change.

## Verification

- Pending in this branch: `tsc --noEmit`, `pnpm exec vitest run scripts/provision-dev-org.test.ts`, and `git diff --cached --check`.
