# Codebase Concerns

**Analysis Date:** 2026-05-30
**Scope:** Full repo — `gsd/phase-6-billing` (local-only; 6 plans committed; `pnpm verify:phase-6` green; UAT 11/11 PASS; not shipped / no PR)

## Severity Legend

| Label | Meaning |
|-------|---------|
| BLOCKER | Ships-nothing until resolved |
| HIGH | Must be fixed before Phase 6 PR merges or before user-facing staging deploy |
| MEDIUM | Should be resolved in the named phase; carries real risk if deferred |
| LOW | Opportunistic cleanup; no acute risk |
| ADVISORY | Cosmetic / long-lived design context; does not block anything |

---

## Security Carry-Forwards

**SF-WHSEC-1 — Rotate Clerk webhook signing secret before any live public-tunnel smoke** (MEDIUM)
- Status: **OPEN** — not yet confirmed closed in STATE.md or any commit.
- Risk: The Clerk webhook signing secret (`CLERK_WEBHOOK_SECRET` — whsec_ prefix) was pasted into chat transcript during Plan 02-02 checkpoint resolution (`.planning/STATE.md` line 147). If that transcript was ever stored outside a local context window, the secret could be replayed to impersonate Clerk on the `/api/webhooks/clerk` endpoint.
- Files: `app/api/webhooks/clerk/route.ts`, `.env.local.example:16`
- Action: One-click rotation in Svix Dashboard. No code change. Mark closed in `ops/deltas/` once done.

**ANTHROPIC_API_KEY non-null assertion — silent startup crash suppressed** (MEDIUM)
- Risk: `lib/ai/client.ts:28` uses `process.env.ANTHROPIC_API_KEY!` (non-null assertion). If the env var is missing, Anthropic SDK will receive `undefined` and throw at the first call site, not at startup. Unlike `DATABASE_URL` (`lib/db/index.ts:9-14`), there is no explicit throw-on-missing guard here. On Vercel, a misconfigured deploy would surface as a runtime 503 on the first AI request rather than a build-time or startup error.
- Files: `lib/ai/client.ts:28`
- Current pattern for contrast: `lib/db/index.ts:8-14` explicitly checks and throws `Error("DATABASE_URL is not set...")`; `lib/stripe/client.ts:11-13` checks and throws `StripeConfigError`.
- Fix: Add an explicit missing-key check in `getAnthropicClient()` matching the `StripeConfigError` pattern in `lib/stripe/client.ts`.

**No HTTP security headers configured** (MEDIUM)
- Risk: `next.config.ts` is an empty stub (4 lines, no `headers()` config). There is no `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, or `X-Content-Type-Options` response header. Pre-production requirement before any staging/prod deploy.
- Files: `next.config.ts:1-7`
- Fix: Add `async headers()` block in `next.config.ts` per Next.js docs. CSP needs careful construction to allow Clerk's embedded iframes and Stripe Checkout redirect. Phase 8 or a standalone hardening PR.

**`POLICYPILOT_E2E_AUTH_BYPASS` bypass path in production binary** (MEDIUM)
- Risk: `middleware.ts:95-98` hard-codes a route-smoke bypass that short-circuits ALL Clerk authentication when `POLICYPILOT_E2E_AUTH_BYPASS === "1"` AND `CI === "true"` AND `GITHUB_ACTIONS === "true"`. The triple-AND makes accidental production bypass very unlikely, but the bypass path ships in the production bundle. If a future CI misconfiguration or environment leak sets all three vars in a non-CI context, every request would bypass Clerk.
- Files: `middleware.ts:95-98`
- Current mitigation: The three-env-var requirement provides meaningful defense-in-depth.
- Recommendation: Confirm the bypass is stripped in production Vercel builds via env isolation, or gate on a fourth secret that only CI holds.

---

## Tech Debt

**Clerk idempotency-before-dispatch ordering (Phase 7+ open item)** (HIGH)
- Status: Application-layer mitigation shipped (03-G3 T7: `deleteIdempotencyRow()` called before every non-2xx return). Full architectural fix remains deferred.
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
- Issue: `drizzle/0003_fk_hardening.sql` (referenced in `lib/db/schema.ts:11`) adds `ON DELETE CASCADE` to every `org_id` FK across 10 tenant tables. A Postgres-level org-row delete silently wipes acknowledgments, `ai_generations`, `policy_assignments`, `policy_versions`, `qa_citation_grants`, `notifications`, `workflow_stages`, and `batch_jobs` in one transaction with no application-layer signal. ADR-018's append-only contract is app-layer; the cascade bypasses it entirely.
- When it matters: Phase 6+ adds subscription cancellation. If a "cancel + delete org" code path ever lands without the audit guard, acknowledgment audit trails are destroyed with no record.
- Files: `lib/db/schema.ts:11`, `app/api/webhooks/clerk/route.ts:363-371`
- Fix approach: When org-delete route lands, the handler MUST: (1) count rows per table, (2) emit a structured audit event with row counts, (3) THEN allow the cascade to fire. See STATE.md § Carry-forward queue.

**Stripe CLI two-account mismatch (operational debt)** (MEDIUM)
- Status: **OPEN** — reconciled for local UAT via `STRIPE_API_KEY` override; default CLI profile still mismatched.
- Issue: The local Stripe CLI default profile (`~/.config/stripe/config.toml`) is logged into a different Stripe account than the app's `STRIPE_SECRET_KEY` test account (`acct_***ujJo`). Running `stripe listen` without the override routes webhooks to the wrong webhook secret, causing 400s on signature verification. Future UAT sessions must use the CLI override pattern or re-login the default profile.
- Files: `app/api/webhooks/stripe/route.ts:446-467` (signature verification), `.env.local.example:39`
- Documented: `.planning/phases/06-billing/06-UAT.md` § Deferred Or Accepted Limits; `MEMORY.md` (stripe-clerk-dev-uat.md)
- Fix approach: Either re-login `stripe` CLI with `stripe login --api-key $STRIPE_SECRET_KEY` to bind the default profile to the test account, or always pass `STRIPE_API_KEY` override. Document the chosen convention before Phase 6 ships.

**`b92a15f` checkout edge case — trialing seed status** (MEDIUM)
- Status: Fixed in `b92a15f`. Robustness assessment follows.
- Issue: Clerk `organization.created` webhook seeds new orgs with `stripeSubscriptionStatus = 'trialing'` and no `stripeCustomerId`. Before `b92a15f`, the `DUPLICATE_SUBSCRIPTION_STATUSES` guard in `createCheckoutSessionAction` would redirect an already-trialing org to `/settings?billing=manage`, blocking the first checkout.
- Fix applied: `app/(admin)/settings/actions.ts:99-105` now gates the duplicate-subscription check behind `org.stripeCustomerId &&` — an org with `trialing` status but no customer can still start checkout.
- Residual risk: The `DUPLICATE_SUBSCRIPTION_STATUSES` set (`active`, `trialing`, `past_due`) is used in two places: (1) the Server Action (`actions.ts:23,99-105`) and (2) the Settings page renders the "Manage Subscription" vs "Start Checkout" button path (`page.tsx:86-90`). The page's `statusVariant()` helper does NOT guard on `stripeCustomerId` for the `trialing` display case — it shows "active" badge styling for `trialing` status even when no customer exists. This is cosmetic but slightly misleading on the UI.
- Files: `app/(admin)/settings/actions.ts:23,99-105`, `app/(admin)/settings/page.tsx:81-91`

**PR 3.3 / ADR-028 PolicyId branded type — carry-forward is SHIPPED; scope note** (ADVISORY)
- Status: ADR-028 `PolicyId` branded type shipped in PR #13 (`bd2257a`). `lib/policies/types.ts` defines `PolicyIdSchema`, `PolicyId`, and `policyIdFromString`. `scripts/check-policy-id-brand.ts` is wired into `verify:phase-3`.
- Open slippery-slope scope: ADR-028 intentionally defers `UserId` and `OrgId` branding per `lib/policies/types.ts:10-19`. When `Users` or `Org` heavy code surfaces are touched in future phases, evaluate whether branding those IDs has become warranted.
- Files: `lib/policies/types.ts`, `scripts/check-policy-id-brand.ts`

---

## Stub Implementations (Phase 7+ obligations)

**`Notifications.create` and `Notifications.markRead` throw unconditionally** (MEDIUM)
- Status: Stubs — not yet implemented.
- Issue: `lib/db/repositories/notifications.ts:34-44` throws `Error('Not yet implemented — Phase 7 (Crons + Email)')` for both `create` and `markRead`. If any Phase 6 or 7 code path calls these methods before Phase 7 ships, it will crash at runtime. The `listAll` and `listUnreadForUser` methods are implemented but the notifications table is currently write-only via the webhook handler alone.
- Files: `lib/db/repositories/notifications.ts:34-44`
- Impact: Any Phase 7 email/cron work that touches `Notifications.create` must implement this before calling it.

**`Departments.create` throws unconditionally** (LOW)
- Status: Stub — Phase 3+ scope per inline comment.
- Issue: `lib/db/repositories/departments.ts:36-40` throws `Error('Not yet implemented — Phase 3+ (admin department management)')`. Admin department management UI was not in Phase 3-6 scope; the stub is correct but must be implemented before that surface is built.
- Files: `lib/db/repositories/departments.ts:36-40`

**`Users.create` throws unconditionally** (LOW)
- Status: Stub — Phase 3+ scope.
- Issue: `lib/db/repositories/users.ts:40-44` throws `Error('Not yet implemented — Phase 3+ (admin user management)')`. User creation from app code (admin invites) is unimplemented; current user creation flows through the Clerk webhook handler's raw `db` path (ADR-023 allow-listed).
- Files: `lib/db/repositories/users.ts:40-44`

---

## Fragile Areas

**Stripe catalog loaded at module init — crashes entire app on missing env vars** (HIGH)
- Issue: `lib/stripe/catalog.ts:56` calls `buildCatalog()` at module load time as a top-level `const`. `buildCatalog()` throws `StripeCatalogConfigError` if any of the 6 `STRIPE_PRICE_*` env vars are missing or duplicated. On Vercel, any cold start without all 6 price IDs configured crashes the app before serving a single request — including the Clerk webhook endpoint, meaning org provisioning would fail silently.
- Files: `lib/stripe/catalog.ts:28-56`
- Impact: A misconfigured staging or production deploy with missing price IDs takes the entire app down, not just billing surfaces.
- Mitigation in place: `lib/stripe/errors.ts` typed `StripeCatalogConfigError` is thrown (not a raw Error), so the crash is at least identifiable in logs.
- Fix approach: Lazy-initialize catalog on first call OR add a deploy-preflight check in `scripts/deploy-preflight.ts` that validates all 6 price IDs before allowing Vercel to serve traffic.

**`getOrgContext()` makes two sequential DB round-trips per request** (MEDIUM)
- Issue: `lib/auth/context.ts:132-165` does two sequential Drizzle selects per page load: (1) `organizations` lookup by `clerkOrgId`, (2) `users` lookup by `clerkUserId` scoped to the resolved org. The ADR-027 sequentialization was intentional (see the org→user lookup comment at line 119), but adds ~2 RTTs to every authenticated server-side render. On a high-latency Supabase pooler, this can accumulate to 50-100ms per request.
- Files: `lib/auth/context.ts:132-165`
- Impact: Performance degradation at scale; not a current blocker for MVP load profile.
- Fix approach (Phase 8+): Consider caching org ID mapping in a short-TTL Clerk session claim (injected at webhook time) to eliminate the org lookup RTT.

**`PolicyListSearch` `eslint-disable` on `react-hooks/exhaustive-deps`** (LOW)
- Issue: `components/policy/PolicyListSearch.tsx:36` disables the exhaustive-deps rule. This suppresses a warning that the `useEffect` dependency array may be incorrect. If the effect captures a stale closure, searches could silently return wrong results.
- Files: `components/policy/PolicyListSearch.tsx:36`
- Fix approach: Audit the effect's closure; if safe, replace the disable with an inline comment explaining why the dep is intentionally omitted (e.g., `// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run only on mount`).

**`scoped.ts` approved `any` usage — bounded but fragile** (ADVISORY)
- Issue: `lib/db/scoped.ts:26` uses `PgTransaction<any, any, any>` with an operator-approved `eslint-disable` comment. Tightening this via Drizzle's internal generic types was deemed impractical (see comment). If a future Drizzle major version changes the transaction handle shape, this type will silently accept the wrong shape.
- Files: `lib/db/scoped.ts:25-26`
- Current mitigation: Bounded `any` is limited to this single definition; all consumer call sites use the typed `OrgScope` alias.

**`lib/ai/summary.ts:53` raw `Error` throw inside `withOrgScope`** (LOW)
- Issue: `lib/ai/summary.ts:53` throws `throw new Error('Policy not found')`. This is inside a `withOrgScope` callback where the project convention (enforced by `scripts/check-error-discipline.ts` for `lib/auth/**`) expects typed domain errors. The policy-not-found path here should throw `PolicyNotFoundError` from `lib/policies/errors.ts`. The `check-error-discipline.ts` gate only covers `lib/auth/` not `lib/ai/`, so this slips through.
- Files: `lib/ai/summary.ts:53`, `lib/policies/errors.ts:73-85`
- Impact: Structured-log triage in Phase 7+ cannot discriminate this error type without the named class.

---

## Test Coverage Gaps

**Stripe webhook handler — Customer Portal session tests absent** (MEDIUM)
- What's not tested: `createPortalSessionAction` in `app/(admin)/settings/actions.ts:47-68`. The `createCheckoutSessionAction` has test coverage in `app/(admin)/settings/actions.test.ts`, but the portal session action (which calls `stripe.billingPortal.sessions.create`) has no automated test verifying the "no stripeCustomerId → redirect to setup" branch or the Stripe API error branch.
- Files: `app/(admin)/settings/actions.ts:47-68`, `app/(admin)/settings/actions.test.ts`
- Risk: Regression on portal session creation could silently break the Manage Subscription UX.

**Stripe webhook — `customer.subscription.updated` canonical re-fetch path** (MEDIUM)
- What's not tested: The `handleSubscriptionUpdated` function at `app/api/webhooks/stripe/route.ts:410-425` always calls `retrieveSubscription(stripe, eventSubscription.id)` — it ignores the event object's inline subscription and re-fetches the canonical version. This canonical-retrieve pattern has no test for the path where `retrieveSubscription` returns `null` (Stripe API failure → retry 500).
- Files: `app/api/webhooks/stripe/route.ts:410-425`

**No end-to-end test for billing tier gate → AI endpoint integration** (MEDIUM)
- What's not tested: The full path from an org's `planTier` changing via a Stripe webhook → `requireTierLimit` returning a different result on the next AI draft call. The unit tests in `lib/stripe/products.test.ts` mock `readPlanTier` via `vi.spyOn`; no integration test seeds a real org tier change in the TEST DB and fires the draft endpoint.
- Files: `lib/stripe/products.ts`, `app/api/ai/draft/route.ts`
- Risk: A DB schema drift on the `plan_tier` column type or default could cause `isPlanTier()` to return `false` (defaulting all orgs to Starter) in production without a failing test.

**Verify scripts have silent-failure gaps (SF-H1, SF-H2, SF-H3, SF-M5)** (LOW)
- What's not tested / what's fragile:
  - `scripts/check-foundation.ts:62-73, 178-192` — `spawnSync` ENOENT/EACCES errors mask as generic `"tsc failed"` instead of surfacing `result.error.code` + `result.error.message` (SF-H1).
  - `scripts/check-foundation.ts:175, 191` — signal-killed `result.status === null` reported as `"unknown"` rather than `result.signal` (SF-H2).
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
- Issue: `middleware.ts:70-72` sets `x-pathname` from `req.nextUrl.pathname` and overwrites any client-supplied value (the overwrite is explicitly noted in the comment at line 109 citing T-03-02-04 mitigation). This pattern is safe as implemented, but worth re-verifying if Next.js changes its header forwarding behavior in a future version.
- Files: `middleware.ts:68-72`

---

## Operational Concerns

**Tenant-lifecycle orphan org cleanup pending** (LOW)
- Issue: The smoke/UAT test run left an orphan `MMTU Entertainment` (Title Case) org and a case-only duplicate org pair in the Clerk dev environment. These don't affect production but pollute the dev tenant list and can cause `OrgNotProvisionedError` confusions during local development.
- Files: Diagnosed at `.planning/debug/org-topology-uat5.md`
- Fix approach: Delete the orphan org via Clerk Dashboard + clean up associated `organizations` row in the dev Supabase project.

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

---

## Performance Risks

**No database connection pooling limit visible at application layer** (ADVISORY)
- Issue: `lib/db/index.ts:19` creates a `postgres-js` client with default pool settings (`prepare: false` is set for pooler compatibility but no `max` connection count). Supabase Transaction pooler handles connection multiplexing, but under burst load the app could saturate the pooler's connection slots. Phase 8 load testing should verify connection behavior.
- Files: `lib/db/index.ts:19`

**`ai_generations` table grows unboundedly** (ADVISORY)
- Issue: Every AI call (draft, summary, Q&A, consistency check) inserts a row in `ai_generations`. There is no TTL, archival, or pruning job. Over time this table grows without bound. The `countDraftsThisMonth` query (`lib/stripe/products.ts:145-161`) scans with a `created_at >= monthStart` filter on an index only covering `org_id` — as the table grows, this query's cost scales with rows per org per month.
- Files: `lib/stripe/products.ts:145-161`, `lib/db/schema.ts:80-107`
- Fix approach (Phase 8+ or future): Add a partial index on `(org_id, created_at) WHERE type = 'draft'`; add a housekeeping cron (Phase 7+) to archive or summarize rows older than N months.

**`qa_citation_grants` non-expiring rows** (LOW)
- Issue: `lib/db/schema.ts:257-259` explicitly notes that Q&A citation grants are non-expiring for MVP, with a "cleanup cron deferred to Phase 7+ if data volume warrants." The grants accumulate for every Q&A answer. Cross-org citation confusion risk is low (org scoped by org_id + FK), but the table will grow proportionally to Q&A volume.
- Files: `lib/db/schema.ts:257-259`, `lib/db/repositories/qa_citation_grants.ts`

---

## Future Obligations (Phase 7+)

**Phase 7 cron endpoint has no handler yet but middleware bypass is live** (MEDIUM)
- Issue: `middleware.ts:28-30` bypasses Clerk for `/api/cron/(.*)`. The endpoint handler (`app/api/cron/reminders/`) does not yet exist. The `CRON_SECRET` env var is in `.env.local.example:60` but is not validated anywhere at runtime. When Phase 7 ships the handler, it must validate `Authorization: Bearer {CRON_SECRET}` as the first action.
- Files: `middleware.ts:28-30`, `.env.local.example:60`, `reference/API-SPEC.md:110-111`

**Phase 7 reminder email / Resend not implemented** (ADVISORY)
- Issue: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` env vars are declared in `.env.local.example:55-56`. No `lib/email/` directory exists. The `Notifications.create` stub throws at runtime. Phase 7 must build the entire email layer from scratch.
- Files: `.env.local.example:55-56`, `lib/db/repositories/notifications.ts:34-40`

**Hardcoded copyright year** (LOW)
- Issue: `app/(marketing)/layout.tsx:28` hardcodes `© 2026 MMTU Entertainment LLC · PolicyPilot`. Must be updated annually or wired to `new Date().getFullYear()`.
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

Do not re-open ADR-028.

### Phase 6 additions remain separate

The Phase 6 billing concerns above remain intact and separate from this Phase 5
carry-forward section:

- Stripe catalog module-init env crash risk.
- `0012_billing_state` staging/prod deployment gate.
- Stripe CLI account mismatch residual.
- `b92a15f` checkout edge case fixed plus UI badge residual.
- Portal, `customer.subscription.updated`, tier-gate, E2E, and billing-meter
  concerns.

---

*Concerns audit: 2026-05-30*
