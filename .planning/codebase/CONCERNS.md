---
last_mapped_commit: 6f17412a2df1218e9a618d7b58df00fe1e595a7a
last_mapped_date: 2026-06-04
scan_mode: fast (concerns)
---

# Codebase Concerns

**Analysis Date:** 2026-06-04
**Scope:** Full repo — main branch at `6f17412` (PR #38 lazy-catalog + PR #37 lazy-db fixes shipped)

## Severity Legend

| Label | Meaning |
|-------|---------|
| BLOCKER | Ships-nothing until resolved |
| HIGH | Must be fixed before Phase 6 PR merges or before user-facing staging deploy |
| MEDIUM | Should be resolved in the named phase; carries real risk if deferred |
| LOW | Opportunistic cleanup; no acute risk |
| ADVISORY | Cosmetic / long-lived design context; does not block anything |

---

## Build & Deployment Concerns

### BUILD-CRASH CLASS — RESOLVED

**Status: CLOSED as of PR #37 (3b4bdb5) and PR #38 (6f17412).** Verified at HEAD: `lib/db/index.ts:23-31` uses a lazy Proxy (`resolveDb`) and `lib/stripe/catalog.ts:56-80` uses a lazy memoized singleton (`getPriceCatalog`), so importing these modules is side-effect-free and `next build` no longer crashes when `DATABASE_URL`/`STRIPE_PRICE_*` are absent. Runtime checks still fire on misconfigured deployments. No further action.

---

## Security Carry-Forwards

**SF-WHSEC-1 — Rotate Clerk webhook signing secret before any live public-tunnel smoke** (MEDIUM)
- Status: **OPEN** — not yet confirmed closed in STATE.md or any commit.
- Risk: The Clerk webhook signing secret (`CLERK_WEBHOOK_SECRET` — whsec_ prefix) was pasted into chat transcript during Plan 02-02 checkpoint resolution (`.planning/STATE.md` line 147). If that transcript was ever stored outside a local context window, the secret could be replayed to impersonate Clerk on the `/api/webhooks/clerk` endpoint.
- Files: `app/api/webhooks/clerk/route.ts`, `.env.local.example:16`
- Action: One-click rotation in Svix Dashboard. No code change. Mark closed in `ops/deltas/` once done.

**ANTHROPIC_API_KEY non-null assertion — silent startup crash suppressed** (MEDIUM)
- Risk: `lib/ai/client.ts:28` uses `process.env.ANTHROPIC_API_KEY!` (non-null assertion). If the env var is missing, Anthropic SDK will receive `undefined` and throw at the first call site, not at startup. Unlike `DATABASE_URL` (`lib/db/index.ts:23-31`), there is no explicit throw-on-missing guard here. On Vercel, a misconfigured deploy would surface as a runtime 503 on the first AI request rather than a build-time or startup error.
- Files: `lib/ai/client.ts:26-31`
- Current pattern for contrast: `lib/db/index.ts:23-31` checks and throws with helpful context; `lib/stripe/client.ts:7-17` checks and throws `StripeConfigError`.
- Fix: Add an explicit missing-key check in `getAnthropicClient()` matching the `StripeConfigError` pattern in `lib/stripe/client.ts`.

**No HTTP security headers configured** (MEDIUM)
- Risk: `next.config.ts` is an empty stub (7 lines; the `NextConfig` body has no options and no `headers()` config). There is no `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, or `X-Content-Type-Options` response header. Pre-production requirement before any staging/prod deploy.
- Files: `next.config.ts`
- Fix: Add `async headers()` block in `next.config.ts` per Next.js docs. CSP needs careful construction to allow Clerk's embedded iframes and Stripe Checkout redirect. Phase 8 or a standalone hardening PR.

**`POLICYPILOT_E2E_AUTH_BYPASS` route-smoke path in production binary** (MEDIUM)
- Clarification: This is NOT a full auth bypass. `middleware.ts:95-98` selects `routeSmokeMiddleware` (defined at `middleware.ts:75-93`) only when `POLICYPILOT_E2E_AUTH_BYPASS === "1"` AND `CI === "true"` AND `GITHUB_ACTIONS === "true"`. `routeSmokeMiddleware` is a *degraded* auth mode for CI route-smoke testing, not an open door: it returns 404 for admin routes and redirects protected routes to `/sign-in`, only letting webhooks, crons, and public routes through.
- Risk: The triple-AND makes accidental production activation very unlikely, but the route-smoke path ships in the production bundle. If a future CI misconfiguration or environment leak set all three vars in a non-CI context, requests would run under the degraded route-smoke policy instead of full Clerk auth — admin surfaces would 404 and protected routes would redirect, but the production binary should not contain a CI-only code path.
- Files: `middleware.ts:75-98`
- Current mitigation: The three-env-var requirement provides meaningful defense-in-depth; the degraded mode itself denies admin/protected access rather than granting it.
- Recommendation: Confirm the route-smoke path is stripped in production Vercel builds via env isolation, or gate on a fourth secret that only CI holds.

---

## Tech Debt

**Clerk idempotency-before-dispatch ordering (Phase 7+ open item)** (MEDIUM)
- Status: Interim fix L-06a SHIPPED in commit `edebab7` (Phase 3): `deleteIdempotencyRow()` is called at `app/api/webhooks/clerk/route.ts:406` before returning 200 on a dispatch error, so Clerk's retry re-fires the event. The original HIGH issue (permanent silent loss on dispatch error) is mitigated; only a secondary edge case remains (the delete itself failing, logged at line 113 but unrecovered). Full architectural fix (invert ordering) remains deferred to Phase 7+.
- Issue: `app/api/webhooks/clerk/route.ts:384-406` writes the `clerk_events` idempotency row BEFORE dispatching the event to the application. If dispatch throws, the current mitigation deletes the row so Clerk's exponential retry can re-fire. However: the deletion happens inside the dispatch-error `catch` block. If the delete itself fails (network partition, pooler hiccup), the event is permanently lost with a 200 response back to Clerk. The TODO comment at lines 384 and 404 explicitly names the correct fix: invert ordering so the row is written only AFTER successful dispatch.
- Files: `app/api/webhooks/clerk/route.ts:384-410`
- Impact: Rare silent webhook drop. Production issue severity scales with volume.
- Fix approach (Phase 7+): Restructure to write `clerk_events` ONLY after all event handlers return without throwing; handle idempotency at the top via a `SELECT` that does not INSERT. See TODO inline.

**Clerk webhook 409/catch test coverage deferred (Phase 7+)** (MEDIUM)
- Status: **OPEN** — deferred from Phase 3 Gate G3 Task 8.
- Issue: The `deleteIdempotencyRow()` path and the dispatch-error catch path in `app/api/webhooks/clerk/route.ts` have no vitest coverage. These paths are verified live during UAT but have no automated regression tests. A future refactor could silently break the idempotency cleanup semantics.
- Files: `app/api/webhooks/clerk/route.ts:88-109`, `app/api/webhooks/clerk/route.ts:383-410`
- Impact: Regression risk on a security-relevant webhook handler path.
- Fix approach (Phase 7+): Vitest scaffold for the 409 prerequisite-missing race and the dispatch-error catch → `deleteIdempotencyRow` call.

**Deletion events are log-only (Phase 7+ obligation)** (MEDIUM)
- Issue: `user.deleted`, `organization.deleted`, and `organizationMembership.deleted` Clerk events are received, logged, and discarded: `app/api/webhooks/clerk/route.ts:365-371`. When a Clerk organization is deleted, the DB cascade via `ON DELETE CASCADE` (added in `0003_fk_hardening.sql`) silently wipes acknowledgments and `ai_generations` with no app-level audit-event emission.
- Related: SF-CASCADE-AUDIT carry-forward (see below).
- Files: `app/api/webhooks/clerk/route.ts:363-371`, `lib/db/schema.ts:53-65`, `lib/db/schema.ts:80-107`

**SF-CASCADE-AUDIT — org-delete cascade with no audit event** (HIGH)
- Status: **OPEN OBLIGATION** — no app-level org-delete code path exists today; becomes a blocker when tenant-lifecycle UI ships.
- Issue: `drizzle/0003_fk_hardening.sql` adds `ON DELETE CASCADE` to the `org_id` FK on 9 tenant tables (acknowledgments, ai_generations, departments, notifications, policies, policy_assignments, policy_versions, users, workflow_stages). Later migrations extend the cascade set: `batch_jobs` (`0005`) and `qa_citation_grants` (`0011`). Cumulatively, a Postgres-level org-row delete silently wipes acknowledgments, `ai_generations`, `policy_assignments`, `policy_versions`, `qa_citation_grants`, `notifications`, `workflow_stages`, and `batch_jobs` in one transaction with no application-layer signal. ADR-018's append-only contract is app-layer; the cascade bypasses it entirely.
- When it matters: Phase 6+ adds subscription cancellation. If a "cancel + delete org" code path ever lands without the audit guard, acknowledgment audit trails are destroyed with no record.
- Files: `lib/db/schema.ts:11`, `app/api/webhooks/clerk/route.ts:363-371`
- Fix approach: When org-delete route lands, the handler MUST: (1) count rows per table, (2) emit a structured audit event with row counts, (3) THEN allow the cascade to fire. See STATE.md § Carry-forward queue.

**Stripe CLI two-account mismatch (operational debt)** (MEDIUM)
- Status: **OPEN** — reconciled for local UAT via `STRIPE_API_KEY` override; default CLI profile still mismatched.
- Issue: The local Stripe CLI default profile (`~/.config/stripe/config.toml`) is logged into a different Stripe account than the app's `STRIPE_SECRET_KEY` test account (`acct_***ujJo`). Running `stripe listen` without the override routes webhooks to the wrong webhook secret, causing 400s on signature verification. Future UAT sessions must use the CLI override pattern or re-login the default profile.
- Files: `app/api/webhooks/stripe/route.ts:446-467` (signature verification), `.env.local.example:39`
- Documented: `.planning/phases/06-billing/06-UAT.md` § Deferred Or Accepted Limits; `MEMORY.md` (stripe-clerk-dev-uat.md)
- Fix approach: Either re-login `stripe` CLI with `stripe login --api-key $STRIPE_SECRET_KEY` to bind the default profile to the test account, or always pass `STRIPE_API_KEY` override. Document the chosen convention before Phase 6 ships.

**PR 3.3 / ADR-028 PolicyId branded type — carry-forward is SHIPPED; scope note** (ADVISORY)
- Status: ADR-028 `PolicyId` branded type shipped in PR #13 (`bd2257a`). `lib/policies/types.ts` defines `PolicyIdSchema`, `PolicyId`, and `policyIdFromString`. `scripts/check-policy-id-brand.ts` is wired into `verify:phase-3`.
- Open slippery-slope scope: ADR-028 intentionally defers `UserId` and `OrgId` branding per `lib/policies/types.ts:10-19`. When `Users` or `Org` heavy code surfaces are touched in future phases, evaluate whether branding those IDs has become warranted.
- Files: `lib/policies/types.ts`, `scripts/check-policy-id-brand.ts`

---

## Stub Implementations (Phase 7+ obligations)

**`Notifications.create` and `Notifications.markRead` throw unconditionally** (LOW)
- Status: Stubs — not yet implemented. No callers in the codebase today; Phase 7 (implementation target) not started per ROADMAP.md, so the runtime-crash risk is latent rather than active.
- Issue: `lib/db/repositories/notifications.ts:34-44` throws `Error('Not yet implemented — Phase 7 (Crons + Email)')` for both `create` and `markRead`. If a future Phase 7 code path calls these methods before they are implemented, it will crash at runtime. The `listAll` and `listUnreadForUser` methods are implemented but the notifications table is currently write-only via the webhook handler alone.
- Files: `lib/db/repositories/notifications.ts:34-44`
- Impact: Any Phase 7 email/cron work that touches `Notifications.create` must implement this before calling it.

**`Departments.create` throws unconditionally** (ADVISORY)
- Status: Stub — Phase 3+ scope per inline comment. Zero call sites in the codebase (git grep confirms), so the throw is unreachable today; this is a forward seam, not an active risk.
- Issue: `lib/db/repositories/departments.ts:36-40` throws `Error('Not yet implemented — Phase 3+ (admin department management)')`. Admin department management UI was not in Phase 3-6 scope; the stub is correct but must be implemented before that surface is built.
- Files: `lib/db/repositories/departments.ts:36-40`

**`Users.create` throws unconditionally** (LOW)
- Status: Stub — Phase 3+ scope.
- Issue: `lib/db/repositories/users.ts:40-44` throws `Error('Not yet implemented — Phase 3+ (admin user management)')`. User creation from app code (admin invites) is unimplemented; current user creation flows through the Clerk webhook handler's raw `db` path (ADR-023 allow-listed).
- Files: `lib/db/repositories/users.ts:40-44`

---

## Fragile Areas

**`getOrgContext()` makes two sequential DB round-trips per request** (MEDIUM)
- Issue: `lib/auth/context.ts:132-145` does two sequential Drizzle selects per page load: (1) `organizations` lookup by `clerkOrgId` (lines 132-136), (2) `users` lookup by `clerkUserId` scoped to the resolved `orgRow.id` (lines 141-145). The ADR-027 sequentialization was intentional — a deliberate trade from the prior parallel `Promise.all` pattern (at `bf65712`) to enforce state-consistency. ADR-027 itself acknowledges it "Trades 1 RTT (parallel → sequential)" and estimates the latency impact at "single-digit milliseconds" per request (the earlier "50-100ms" figure here was an overestimate; corrected per ADR-027).
- Files: `lib/auth/context.ts:132-145`
- Impact: Minor performance cost at scale; not a current blocker for MVP load profile.
- Fix approach (Phase 8+): Consider caching org ID mapping in a short-TTL Clerk session claim (injected at webhook time) to eliminate the org lookup RTT.

**`PolicyListSearch` `eslint-disable` on `react-hooks/exhaustive-deps`** (LOW)
- Issue: `components/policy/PolicyListSearch.tsx:36` has an `eslint-disable-next-line react-hooks/exhaustive-deps` with no inline explanation. The `useEffect` reads `params` and `router` but its dependency array is only `[q]`, so a stale `params` closure is intentionally accepted. The code works correctly in normal Next.js server/client flows, but the undocumented disable makes the omission fragile for future maintenance — the "why this is safe" rationale is not recorded.
- Files: `components/policy/PolicyListSearch.tsx:36`
- Fix approach: Replace the bare disable with an inline comment documenting why `params`/`router` can be safely omitted from the dep array (e.g., the stale-`params` closure is intentional because the effect only reacts to `q`).

**`scoped.ts` approved `any` usage — bounded but fragile** (ADVISORY)
- Issue: `lib/db/scoped.ts:26` uses `PgTransaction<any, any, any>` with an operator-approved `eslint-disable` comment. Tightening this via Drizzle's internal generic types was deemed impractical (see comment). If a future Drizzle major version changes the transaction handle shape, this type will silently accept the wrong shape.
- Files: `lib/db/scoped.ts:25-26`
- Current mitigation: Bounded `any` is limited to this single definition; all consumer call sites use the typed `OrgScope` alias.

**`lib/ai/summary.ts:53` raw `Error` throw inside `withOrgScope`** (LOW)
- Issue: `lib/ai/summary.ts:53` throws `throw new Error('Policy not found')`. This is inside a `withOrgScope` callback where the project convention (enforced by `scripts/check-error-discipline.ts`) expects typed domain errors. The policy-not-found path here should throw `PolicyNotFoundError` from `lib/policies/errors.ts`. The `check-error-discipline.ts` gate covers `lib/auth/` + `lib/stripe/` + `lib/policies/` (scope at lines 89-129) but NOT `lib/ai/`, so this slips through.
- Files: `lib/ai/summary.ts:53`, `lib/policies/errors.ts:73-85`
- Impact: Structured-log triage in Phase 7+ cannot discriminate this error type without the named class.

---

## Test Coverage Gaps

**Stripe webhook — `customer.subscription.updated` canonical re-fetch path** (MEDIUM)
- What's not tested: The `handleSubscriptionUpdated` function at `app/api/webhooks/stripe/route.ts:410-425` always calls `retrieveSubscription(stripe, eventSubscription.id)` — it ignores the event object's inline subscription and re-fetches the canonical version. This canonical-retrieve pattern has no test for the path where `retrieveSubscription` returns `null` (Stripe API failure → retry 500).
- Files: `app/api/webhooks/stripe/route.ts:410-425`

**No end-to-end test for billing tier gate → AI endpoint integration** (MEDIUM)
- What's not tested: The full path from an org's `planTier` changing via a Stripe webhook → `requireTierLimit` returning a different result on the next AI draft call. The unit tests in `lib/stripe/products.test.ts` mock `readPlanTier` via `vi.spyOn`; no integration test seeds a real org tier change in the TEST DB and fires the draft endpoint.
- Files: `lib/stripe/products.ts`, `app/api/ai/draft/route.ts`
- Risk: A DB schema drift on the `plan_tier` column type or default could cause `isPlanTier()` to return `false` (defaulting all orgs to Starter) in production without a failing test.

**Verify scripts have silent-failure gaps (SF-H1, SF-H2, SF-H3, SF-M5)** (LOW)
- What's not tested / what's fragile:
  - `scripts/check-foundation.ts:33-46` — `checkTypecheck()`'s `spawnSync` result handling masks ENOENT/EACCES as the generic `detail || "tsc failed"` fallback (:45) instead of surfacing `result.error.code` + `result.error.message` (SF-H1).
  - `scripts/check-foundation.ts:151` — a signal-killed `result.status === null` collapses to the literal `"unknown"` in the `check:db exited …` detail string rather than surfacing `result.signal` (SF-H2).
  - `scripts/check-artifacts.ts:776-784` — server-only walker has no `try/catch` around `readdirSync`/`readFileSync` and no symlink skip; a mid-walk permission error crashes all 114+ assertions (SF-H3).
  - `scripts/check-artifacts.ts:28-30` — `read()` has no `try/catch`; TOCTOU between `exists()` and `read()` can silently nuke assertions (SF-M5).
- Files: `scripts/check-foundation.ts`, `scripts/check-artifacts.ts`

---

## Security Considerations

**Tenant isolation — no known gaps; defense-in-depth intact** (ADVISORY)
- Current posture: Every user-facing DB query goes through `withOrgScope` (`lib/db/scoped.ts`) which (1) injects `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` so Postgres RLS evaluates against the actual session org, AND (2) the repository layer adds an explicit `eq(table.orgId, scope.orgId)` predicate. Two independent layers. `scripts/check-rls.ts` (Phase 2 Plan 02-06) runs a cross-org property test against the TEST DB in CI. `scripts/check-db-imports.ts` enforces that only allow-listed files can import raw `db` (ADR-023).
- Unbranded `UserId`/`OrgId` per ADR-028 slippery-slope policy: UUID-typed IDs for `userId` and `orgId` carry no brand, so a future refactor could accidentally swap them at a call site. The FK + RLS layers would catch cross-org writes at DB time, but not same-org wrong-user attribute writes. Accept as stated in ADR-028 unless friction warrants branding.
- Files: `lib/db/scoped.ts`, `lib/auth/context.ts`, `scripts/check-rls.ts`, `scripts/check-db-imports.ts`

**Stripe webhook org-resolution uses `OR` across multiple hints** (ADVISORY)
- Issue: `app/api/webhooks/stripe/route.ts:136-203` `resolveOrg()` builds a `WHERE org_id = ? OR stripe_customer_id = ? OR stripe_subscription_id = ?` filter. If multiple orgs somehow share a Stripe customer or subscription ID (data corruption or a replay attack that partially updates rows), `rows.length !== 1` causes a no-op and logs `org_match_count_not_one`. This is the correct fail-closed behavior, but an operator may not notice if legitimate webhooks are silently no-op'd due to data anomalies.
- Files: `app/api/webhooks/stripe/route.ts:136-170`
- Mitigation: `commitNoop` stamps the `stripe_events` idempotency row even on no-ops, preventing replay. Log monitoring is the operator's debugging path.

**Cron routes bypass Clerk but lack a handler** (LOW)
- Issue: `middleware.ts:28-30` declares `/api/cron/(.*)` as a bypass route (verified-in-route via `CRON_SECRET` header per BLUEPRINT.md). No handler exists at `app/api/cron/` yet (Phase 7 scope). The bypass is active in production code without the corresponding `CRON_SECRET` validation; any request to `/api/cron/*` currently receives Next.js 404 but without Clerk protection.
- Impact: Low — Next.js will 404 on missing routes. No data exposure.
- Fix: Confirm `isCronRoute` pattern is appropriately narrow before Phase 7 ships the handler.

**`x-pathname` header injection** (ADVISORY)
- Issue: `middleware.ts:70-71` sets `x-pathname` from `req.nextUrl.pathname`, overwriting any client-supplied value, before Server Components read it (consumer confirmed at `AdminSidebar.tsx:27-29`). Threat model T-03-02-04 explicitly closes this vector via the overwrite behavior, so the pattern is safe as currently implemented. This entry is purely advisory — worth re-verifying only if Next.js changes its header forwarding behavior in a future version.
- Files: `middleware.ts:70-71`, `components/admin/AdminSidebar.tsx:27-29`

---

## Operational Concerns

**Production has NEVER deployed (pre-Phase 7 blocker)** (HIGH)
- Issue: PolicyPilot production (`https://policypilot.mmtu.tv`) has never successfully deployed. Vercel shows `404 DEPLOYMENT_NOT_FOUND` for all prod commits, including Phase 6 ship commit `243067e`.
- Root cause history: 
  - **Cause-A (Build-Time Coupling)**: Stripe catalog + DB client crashed at `next build` when env vars were missing. **FIXED and shipped in main at PR #37 (3b4bdb5) and PR #38 (6f17412).**
  - **Cause-B (Prod Supabase project not yet provisioned, THEN pooler auth)**: The blocker is broader than a stale password. (1) The production Supabase project does **not yet exist** — `scripts/deploy-config.json:12` still holds the `REPLACE_WITH_PROD_PROJECT_REF` placeholder, and provisioning it requires Pro tier + PITR per `docs/runbooks/deploy-migrations.md:15`. (2) Only *after* the prod project is provisioned can the operator configure/rotate the Transaction-pooler (port 6543) password and set `DATABASE_URL`; until both are done, `deploy:preflight` fails authentication against the pooler and the build exits 1.
- Impact: No production traffic can run on the latest code. Live users (if any) are stuck at the last successful deployment (if any exist).
- Action path: 
  1. Operator provisions the production Supabase project (Pro tier + PITR) and replaces `REPLACE_WITH_PROD_PROJECT_REF` in `scripts/deploy-config.json`.
  2. Operator sets/rotates the prod pooler password and configures `DATABASE_URL` in Vercel production environment secrets.
  3. Trigger a re-deployment in Vercel or push a new commit to `main`.
  4. Verify `pnpm db:verify:prod` passes after deploy.
- Files: `scripts/deploy-config.json:12`, `scripts/deploy-preflight.ts`, `docs/runbooks/deploy-migrations.md:15`
- Verify-phase-6 status: The build-crash class is CLOSED. The remaining blockers are prod-project provisioning followed by pooler-auth configuration.

**Vercel preview `deploy:preflight` fails on stale Supabase `postgres` password** (MEDIUM — non-blocking)
- Issue: The Vercel preview environment's `DATABASE_URL` uses a stale pooler password. The `deploy:preflight` script fails when it tries to connect to verify the schema. This causes the pre-merge Vercel check to show a red X.
- Impact: Non-blocking — GitHub Actions is the real merge signal per CLAUDE.md. Vercel preview failures do not block Phase 7 planning. However, they are noisy and make it harder to spot real issues.
- Documented: `MEMORY.md` (vercel-preview-preflight-fail.md) + `.planning/phases/06-billing/06-UAT.md`
- Workaround: Operator can temporarily set `DATABASE_URL` in Vercel preview to a working dev target, or accept the red X and rely on GitHub Actions checks.
- Fix: Sync the preview environment's `DATABASE_URL` with a valid pooler password + target after a staging deploy succeeds.

**Staging and production migrations not applied** (HIGH — pre-deploy gate)
- Issue: `0012_billing_state` (Stripe billing-state columns + partial unique indexes on `organizations`) is applied only to the approved TEST/dev Supabase target. Staging and production remain at the pre-Phase-6 schema. Per CLAUDE.md Database Migration Discipline, code may not deploy ahead of migrations.
- Files: `drizzle/0012_billing_state.sql` (referenced in STATE.md), `docs/runbooks/deploy-migrations.md`, `scripts/deploy-preflight.ts`
- Action: Run `pnpm db:migrate:staging` → `pnpm db:verify:staging` → deploy. Then same for prod. This is the pre-deploy gate, not a code bug.

**`db:migrate:test` still uses `--env-file=.env.local.test` pattern** (LOW)
- Issue: `package.json`'s `db:migrate:test` script reads from `.env.local.test` (a workaround from SF-DB-1 closure). The permanent fix (env-override via spawnSync with `_TEST` vars from `.env.local`) was documented as a Phase 5+ opportunistic cleanup but not yet implemented.
- Files: `package.json` (db:migrate:test script)

**No error monitoring / alerting wired** (ADVISORY)
- Issue: `SENTRY_DSN` is present in `.env.local.example:65` but no Sentry SDK is installed or configured. `NEXT_PUBLIC_POSTHOG_KEY` is similarly present but unimplemented. All production errors currently surface only through Vercel log tailing and structured `console.error` output.
- Files: `.env.local.example:63-65`, `next.config.ts`
- Impact: Phase 7+ monitoring gap. Not a launch blocker for MVP but increases mean-time-to-detect for production billing failures.

**Tenant-lifecycle orphan org cleanup pending** (LOW)
- Issue: The smoke/UAT test run left an orphan `MMTU Entertainment` (Title Case) org and a case-only duplicate org pair in the Clerk dev environment. These don't affect production but pollute the dev tenant list and can cause `OrgNotProvisionedError` confusions during local development.
- Files: Diagnosed at `.planning/debug/org-topology-uat5.md`
- Fix approach: Delete the orphan org via Clerk Dashboard + clean up associated `organizations` row in the dev Supabase project.

---

## Performance Risks

**No database connection pooling limit visible at application layer** (ADVISORY)
- Issue: `lib/db/index.ts:35` creates a `postgres-js` client with default pool settings (`prepare: false` is set for pooler compatibility but no `max` connection count). Supabase Transaction pooler handles connection multiplexing, but under burst load the app could saturate the pooler's connection slots. Phase 8 load testing should verify connection behavior.
- Files: `lib/db/index.ts:35`

**`ai_generations` table grows unboundedly** (ADVISORY)
- Issue: Every AI call (draft, summary, Q&A, consistency check) inserts a row in `ai_generations`. There is no TTL, archival, or pruning job. Over time this table grows without bound. The `countDraftsThisMonth` query (`lib/stripe/products.ts:145-161`) scans with a `created_at >= monthStart` filter on an index only covering `org_id` — as the table grows, this query's cost scales with rows per org per month.
- Files: `lib/stripe/products.ts:145-161`, `lib/db/schema.ts:80-107`
- Fix approach (Phase 8+ or future): Add a partial index on `(org_id, created_at) WHERE type = 'draft'`; add a housekeeping cron (Phase 7+) to archive or summarize rows older than N months.

**`qa_citation_grants` non-expiring rows** (LOW)
- Issue: `lib/db/schema.ts:257-259` explicitly notes that Q&A citation grants are non-expiring for MVP, with a "cleanup cron deferred to Phase 7+ if data volume warrants." The grants accumulate for every Q&A answer. Cross-org citation confusion risk is low (org scoped by org_id + FK), but the table will grow proportionally to Q&A volume.
- Files: `lib/db/schema.ts:257-259`, `lib/db/repositories/qa_citation_grants.ts`

---

## Future Obligations (Phase 7+)

**Phase 7 cron endpoint has no handler yet but middleware bypass is live** (LOW)
- Issue: `middleware.ts:28-30` declares `isCronRoute("/api/cron/(.*)")` and `:118-120` bypasses Clerk for it, with a comment asserting in-route `CRON_SECRET` validation (`:113-114`). The endpoint handler (`app/api/cron/`) does not yet exist and `CRON_SECRET` in `.env.local.example:60` is blank, so the bypass is a harmless forward seam today: any request to `/api/cron/*` gets a Next.js 404, with no handler to reach and no data exposure. The cleanup audit (`claude_repo_cleanup_audit.md:571-585`, L-FINDING-027) classified this as "harmless today (no cron route)" intentional preparatory code for Phase 7. When Phase 7 ships the handler, it must validate `Authorization: Bearer {CRON_SECRET}` as the first action.
- Files: `middleware.ts:28-30`, `middleware.ts:113-120`, `.env.local.example:60`, `reference/API-SPEC.md:110-111`

**Phase 7 reminder email / Resend not implemented** (ADVISORY)
- Issue: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars are declared in `.env.local.example:55-56`. No `lib/email/` directory exists. The `Notifications.create` stub throws at runtime. Phase 7 must build the entire email layer from scratch.
- Files: `.env.local.example:55-56`, `lib/db/repositories/notifications.ts:34-40`

**Hardcoded copyright year** (LOW)
- Issue: `app/(marketing)/layout.tsx:28` hardcodes `© 2026 MMTU Entertainment LLC` with no dynamic `new Date().getFullYear()` wiring (verified at HEAD). The year must be bumped manually each January, or wired to `new Date().getFullYear()`.
- Files: `app/(marketing)/layout.tsx:28`

**`pnpm db:migrate:test` env-file coupling** (LOW)
- Issue: The `--env-file=.env.local.test` approach means any developer who doesn't have that file (or has stale credentials) silently gets a connection error instead of reading `_TEST` vars from `.env.local`. Documented in STATE.md § Blockers (TEST DB pooler auth gate closure) as a Phase 5+ opportunistic cleanup item.
- Files: `package.json` (db:migrate:test)

**Structured logging is all `console.log`/`console.error`** (ADVISORY)
- Issue: All application and webhook logging uses bare `console.log`/`console.error` with bracketed prefixes (e.g., `[clerk-webhook]`, `[stripe-webhook]`). Phase 7+ should replace with a structured logger (pino per STATE.md Phase 7 references) with log-level configuration, redaction filters for Clerk/Stripe IDs, and machine-parseable JSON output for Vercel log drains.
- Files: `app/api/webhooks/clerk/route.ts:37-52`, `app/api/webhooks/stripe/route.ts:110-122`, throughout `lib/`

---

## Carried forward from Phase 5 — still open, not re-listed above

This section prevents the Phase 6 codebase-map refresh from being misread as
concern closure. The refreshed map emphasized Phase 6 billing surfaces, so some
Phase 5 carry-forwards were not re-listed in the issue sections above. The
items below were either verified still open in this follow-on pass or should be
treated as still open unless a future task proves closure. They are not Phase 6
regressions unless explicitly marked.

### Restored HIGH carry-forwards

- No `/api/ai/**` rate limiting.
  - Status: still open.
  - Verification note: no Upstash/KV/sliding-window limiter found in the
    current app/package scan.
  - Risk: tenant-abuse/cost-control risk on AI routes.
  - Do not mark closed until a real rate-limit gate exists and is tested.

- No production observability / Sentry-style monitoring.
  - Status: still open.
  - Verification note: no `@sentry`, OpenTelemetry, PostHog-style dependency,
    or equivalent app instrumentation found in the current scan.
  - Risk: production incident detection and triage gap.
  - Preserve HIGH severity unless project policy explicitly downgrades it.

### Restored MEDIUM carry-forwards

- Acknowledgments REVOKE migration never shipped.
  - Status: still open / unshipped.
  - Note: the earlier `0012_acknowledgments_revoke_mutation.sql` slot was not
    shipped; Phase 6 reused the `0012` slot for `0012_billing_state.sql`.
  - Preserve as a carry-forward hardening item, not as part of the Phase 6
    billing migration.

- M-4 shared `ActionResult<T>`.
  - Status: still open.
  - Note: `lib/actions/types.ts` does not exist; Phase 6 billing actions
    proceeded without the shared type.
  - Do not imply Phase 6 closed it.

- H-3 / ADR-030 UUID uniqueness.
  - Status: unratified.
  - Note: proposed in Phase 4 docs/STATE but not a ratified ADR.
  - Treat as planning/ADR backlog until formally resolved.

- M-2 CSRF documentation for Server Actions.
  - Status: still undocumented for Phase 6.
  - Note: no Phase 6 CSRF doc coverage found in the verification.
  - Preserve as documentation/security-hardening debt.

### Restored code-review carry-forwards

Carry forward Plan-05 code-review findings as still open unless future
verification proves closure:

- WR-02 through WR-07.
- IN-01 through IN-06.

Sampled still-open examples:

- `qa.ts:97` still shows the WR-05 sampled finding.
- `AckStatusBadge.tsx:54` still shows the `'en-US'` sampled finding.
- `ack-mutation-attempt.ts:28` still shows the server-only sampled finding.

The verification sampled three and found all three still present; therefore the
full Plan-05 code-review set remains carried forward until individually closed.
This pass did not line-by-line reverify all 12 findings.

### Other carry-forwards not to read as closed

- EAPI H-2, M-1, M-3, M-5, M-6, A-1, and A-2 remain carried forward unless a
  future verification task closes them explicitly.
- Nyquist G-08a, G-09a, and G-03a remain Phase 2.1 / Phase 8 hardening
  backlog unless a future task proves closure.
- Citation-grant revocation audit remains open as future regulatory/audit
  hardening debt.
- General E2E-framework gap remains open. Phase 6 narrowed and added billing
  UAT coverage, but it did not close the general Playwright/Cypress-style
  framework gap.

### True closures from the comparison

- ADR-028 PolicyId branded type: CLOSED.
- `transitions.test.ts:206` blocker: already resolved at Phase 5.
- DEV + TEST DB creds rotated 2026-05-24 advisory: time-stale / dropped.
- Build-crash class (Causes A and B): CLOSED as of PR #37 + PR #38.

Do not re-open ADR-028 or the build-crash class.

### Phase 6 additions remain separate

The Phase 6 billing concerns above remain intact and separate from this Phase 5
carry-forward section:

- Stripe CLI account mismatch residual.
- `b92a15f` checkout edge case fixed plus UI badge residual.
- Portal, `customer.subscription.updated`, tier-gate, E2E, and billing-meter
  concerns.

---

*Concerns audit: 2026-06-04*
