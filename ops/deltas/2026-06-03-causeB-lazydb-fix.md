# Cause-B Lazy `lib/db` Fix

Date: 2026-06-03
Branch: `fix/db-lazy-init` (off `origin/main` @ `8dc0a38`)
GSD stage: execute (Tier A — operator-approved execution)

## Summary

Made `lib/db/index.ts` side-effect-free at import so Next 15's `next build`
("Collecting page data" phase) no longer crashes when `DATABASE_URL` is absent
at build time (Cause B from the prod-Vercel investigation):

- **Code:** replaced the module-top-level `DATABASE_URL` check + eager
  `postgres()` + `drizzle()` construction with a lazy `Proxy`. `export const db`
  is preserved (zero call-site changes); the Proxy forwards property access to a
  lazily-resolved drizzle instance and binds methods so `db.select()...`,
  `db.transaction(...)`, `db.insert/update/delete(...)`, and `db.execute(...)`
  keep correct `this`. The env check + helpful error + connection now fire on
  first **runtime** use, not at import.
- **Test:** added `lib/db/index.test.ts` (TDD red→green verified) asserting
  (1) import does NOT throw when `DATABASE_URL` is absent, (2) first `db` use
  throws the helpful "DATABASE_URL is not set" error, (3) with `DATABASE_URL`
  set the Proxy forwards to a real drizzle client (offline-safe).
- **Gate exception:** added one narrow ADR-023 allow-list entry
  (`^lib/db/index\.test\.ts$`) in `scripts/check-db-imports.ts` because the new
  test legitimately imports the `@/lib/db` barrel-under-test. This is the same
  "test/harness may import raw db" category the allow-list already grants to
  `tests/**` + `scripts/check-{rls,schema,db}.ts`; the test never ships to prod
  and changes no production RLS posture. **Flagged for operator review** (it
  touches a security-relevant gate).
- **Docs:** fixed `docs/runbooks/deploy-migrations.md` journal-count staleness
  (was "10 entries 0000..0009" / "11 tenant tables"; now the verified "13
  entries 0000..0012" / "12 tenant tables", with the live `db:verify` output
  string updated to match).

Tier B (a working production deploy) is intentionally **not** in this change —
see Boundaries + the Tier-B note below.

## Investigation

- Re-verified the diagnosis was still current: `lib/db/index.ts` on
  `origin/main` (identical to HEAD) still threw at module scope and eagerly
  constructed the client. Confirmed the file is byte-identical on `origin/main`
  and the fallow branch, so branching off `origin/main` keeps the PR clean.
- Traced the full blast radius of `@/lib/db` consumers: every actual `db.*`
  usage in the codebase is a **method call at runtime inside a handler/function**
  (`scoped.ts` `db.transaction`; `auth/context.ts`, `stripe/products.ts`,
  `webhooks/stripe` `db.select`; `webhooks/clerk` `db.insert/update/delete`;
  `scripts/check-db.ts` + `check-org-state.ts` `db.execute`). None access `db`
  at module scope; none spread/iterate/`Object.keys` it; `db.query` appears only
  in a `reference/*.md` doc example. The bind-on-access Proxy satisfies all of
  them — confirmed end-to-end by the green integration gates (below).
- `vitest.config.ts` aliases `server-only` → `tests/stubs/server-only.ts`
  (no-op) and `@` → repo root, so the regression test loads the real barrel
  cleanly in the default jsdom env (postgres.js imports fine; nothing connects).

## Consultant Keep-Current

- `.planning/consultant/risk_register.md`: **updated** — added R-014 (Cause-B
  build-time DB coupling, now Mitigated by this PR), R-015 (production has never
  successfully deployed; CLI pipeline frozen at `bae9174`; Tier-B/operator), and
  R-016 (Cause-A preview `deploy:preflight` stale-pooler-password, operator-owned
  / non-blocking).
- `.planning/consultant/working_context.md`: **updated** — Current State + Active
  Watchlist note the in-flight lazy-db fix and the Tier-B prod-deploy gap.
- `.planning/consultant/system_map.md`: **updated** — added `lib/db/index.ts`
  (lazy Proxy barrel) to the Hotspots list.
- `.planning/consultant/backlog.md`: **updated** — added row 15 (Tier-B prod
  Supabase + first working Vercel prod deploy; pending / operator-gated).
- `.planning/consultant/feature_inventory.md`: reviewed, **no-change** — this is
  an internal robustness fix; no product feature ships, changes scope, or moves
  phase.

## Boundaries

- Product runtime behavior changed: no (lazy timing only; runtime behavior with
  `DATABASE_URL` set is identical — first use still connects + errors the same
  way).
- Application code changed: yes — `lib/db/index.ts` (lazy Proxy) only.
- Packages or lockfile changed: no.
- Schema, migrations, or Drizzle metadata changed: no.
- Secrets, env files, Vercel env, `.vercel/`, `.mcp.json`, passwords changed:
  **no** (read-only on secrets/env per the handoff guardrails; no value printed).
- Security gate changed: yes — one narrow, documented ADR-023 allow-list entry
  for the new test (flagged for operator review; no production RLS-posture
  change).
- Phase 7 planning or code started: no. Live Stripe mode: not touched.

## Tier B (NOT in this change — operator-gated)

A working prod deploy requires (operator + Codex): provision prod Supabase
(Pro+PITR per ADR-018), set Production Vercel `DATABASE_URL`(6543) +
`DIRECT_URL`(5432) + runtime secrets (`CLERK_*`, Stripe, `ANTHROPIC_API_KEY`),
run staged migrations (migrate→verify→soak→approve→prod→verify;
`db:wait-pooler-auth` after any password reset), then decide `main→production`
auto-deploy. The lazy fix is necessary-but-not-sufficient for that; its
standalone value is robustness + unblocking the build-crash class for
preview/CI. Recommendation: ship Tier A; park production; treat the preview
red-✗ (Cause A) as expected noise until launch prep.

## Verification (real output, gates green)

- PASS — `pnpm tsc --noEmit` (exit 0).
- PASS — TDD red→green on `lib/db/index.test.ts`: 2/3 failed against the unfixed
  module (import-time throw), 3/3 passed after the lazy fix.
- PASS — `pnpm exec eslint lib/db/index.ts lib/db/index.test.ts` (exit 0).
- PASS — `pnpm exec tsx scripts/check-db-imports.ts`:
  `OK — L-05: 9 allow-listed @/lib/db import(s), 0 violations.`
- PASS — `pnpm verify:phase-6` (exit 0): full chain green, incl. 36 unit test
  files, `check:rls` (`L-06: all 12 tenant-scoped tables RLS-isolated; positive
  control passed`), `check:ai-layer` + `check:employee-portal` integration suites
  (exercise the new Proxy via `withOrgScope → db.transaction` against the live
  test DB), `db:verify` (`13 migrations applied, 12 tenant-scoped tables ...`),
  and `check:artifacts` (520/520).
- PASS — bonus `pnpm check:db`: `OK` (db.execute via the Proxy against the live
  dev DB).
