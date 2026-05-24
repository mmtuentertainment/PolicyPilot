# External Integrations

**Analysis Date:** 2026-05-24

## APIs & External Services

### Clerk (Auth + Organizations) — ACTIVE

**SDK:** `@clerk/nextjs@^7.3.4`.

**Surface:**
- Embedded sign-in/sign-up components at `app/(auth)/sign-in/[[...sign-in]]/page.tsx` + `app/(auth)/sign-up/[[...sign-up]]/page.tsx`. Both honor `NEXT_PUBLIC_CLERK_SIGN_{IN,UP}_FALLBACK_REDIRECT_URL=/post-sign-in` env vars (asserted in `scripts/check-foundation.ts`).
- Server-side session resolution: `lib/auth/context.ts:getOrgContext()` — wraps `auth()` in try/catch (SF-M4 fold), narrows `sessionClaims.publicMetadata.role` to `Role` union (`'admin' | 'reviewer' | 'employee'`), and translates Clerk text IDs → internal UUIDs sequentially per ADR-027 (state-consistency over latency).
- Middleware admin gate: `middleware.ts` (Clerk session claim path).
- `<OrganizationSwitcher />` redirect path for users without active org membership.

**Role model:** Org Roles (`org:admin`, `org:reviewer`, `org:employee`) → mirrored to `publicMetadata.role` (string union) by webhook handler. `clerkClient().users.updateUserMetadata()` keeps Clerk + DB enum in sync per CR-01 (Plan 02-07) / D-04.

**Multi-org behavior:** PolicyPilot data model is one-user-one-org. ADR-027/028 surface multi-org Clerk membership as `UserNotProvisionedError` with subCode discrimination (`CLERK_USER_NOT_IN_DB` vs `USER_ORG_MISMATCH`) — intentional lockout, not bug.

#### Clerk webhooks

**Handler:** `app/api/webhooks/clerk/route.ts` (single Allow-List Entry #1 for raw `db` import per ADR-023).

**Verification:** `svix@1.93.0` `Webhook.verify()` — handles 5-minute timestamp tolerance, constant-time HMAC compare, multi-signature key rotation. Hand-rolled HMAC explicitly forbidden.

**Body-stream discipline:** `await req.text()` MUST come BEFORE any JSON parse (RESEARCH Pitfall 4 — stream is single-read).

**Idempotency:** `clerk_events` table (service-role, NO `org_id`). `INSERT ... ON CONFLICT DO NOTHING` on `svix-id`; empty `returning()` → return 200 short-circuit (Clerk stops retrying).

**Active events (4 — D-03):**

| Event | DB effect | Side effect |
|---|---|---|
| `organization.created` | `INSERT organizations` with `planTier='starter'`, `stripeSubscriptionStatus='trialing'`. | — |
| `user.created` | `INSERT users` with `role='employee'`, `org_id=NULL`. | Mirror `employee` → `publicMetadata.role`. |
| `organizationMembership.created` | Lookup org by `clerkOrgId`, then `UPDATE users SET org_id, role` for matching `clerkUserId`. | Mirror role → `publicMetadata.role`. |
| `organizationMembership.updated` | `UPDATE users SET role`. | Mirror role → `publicMetadata.role`. |

**Log-only events (3 — D-03c):** `user.deleted`, `organization.deleted`, `organizationMembership.deleted`. Retention design + ADR-018 cascade reconciliation deferred to Phase 7+.

**Race-recovery (SF-W5 fix, 03-G3 T7):** `deleteIdempotencyRow()` is called before EVERY non-2xx return AND from the dispatch-error catch path — so Clerk's exponential retry re-fires this exact event when prerequisites haven't yet arrived. Without this, the `clerk_events` row would block the retry from re-running on the same `svix-id` and silently lose the event.

**Logging:** All Clerk IDs masked via `maskClerkId()` / `maskClerkOrgId()` (last 4 chars + `***`) — never log raw `svix` payload (PII risk, T-05-04).

---

### Anthropic Claude API — ACTIVE

**SDK:** `@anthropic-ai/sdk@0.97.1` (pinned EXACT). Direct API (NOT via Vercel AI Gateway).

**Client:** `lib/ai/client.ts:getAnthropicClient()` — lazy singleton with `maxRetries: 0` (SPEC R7 — no auto-retry; 503 envelope surfaces failure cleanly) and `timeout: 25_000ms` (well under Vercel's 300s function ceiling).

**Models:** `lib/ai/models.ts` is the single grep target for model migration:
- `MODEL_SONNET = 'claude-sonnet-4-6'` — draft generation, employee Q&A, consistency check (locked per ADR-005 / ADR-006 / ADR-015).
- `MODEL_HAIKU = 'claude-haiku-4-5-20251001'` — TL;DR summaries only.

**Prompt caching (D-03 + D-33):** `lib/ai/cache.ts` exposes two TTL tiers via `cache_control: { type: 'ephemeral', ... }`:
- `EPHEMERAL_CACHE` — 5-min default. Used for static system prompts (Draft + Summary + Consistency).
- `LONG_CACHE` — 1h TTL (GA since SDK 0.60.0). Used for Q&A per-org policy library block.

**D-33c ordering invariant:** Q&A `system: [...]` array MUST place `LONG_CACHE` block FIRST (per-org library) and `EPHEMERAL_CACHE` block SECOND (static `QA_SYSTEM_PROMPT_TEMPLATE`). Anthropic returns HTTP 400 on inverse order. Enforced inline at `lib/ai/qa.ts:113-116`.

**D-40 cold-miss observability:** `lib/ai/qa.ts:127` emits `console.warn('[ai/qa] cache miss likely', {...})` when both `cache_creation_input_tokens` and `cache_read_input_tokens` are 0 (library < 1024 Sonnet tokens silently bypasses cache).

**Usage telemetry (D-35):** All four Anthropic `Usage` fields persisted to `ai_generations` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`). Phase 8 weighted-cost formula documented inline in `lib/db/schema.ts:84-86`.

**Batch API (D-29 / D-34):** Consistency check is async, 50% cost reduction. SDK `processing_status` enum (`'in_progress'|'canceling'|'ended'` + `request_counts`) translated to app `status` enum at `app/api/ai/consistency/[batchId]/route.ts` before persisting to `batch_jobs`. Row written ON COMPLETION ONLY, not at submission (preserves SUCCESS-ONLY `ai_generations` semantic per D-06).

**Cross-org isolation (D-41 / SP-1 defense — Q&A):** `validIds` Set MUST be constructed inside the SAME `withOrgScope` closure that builds `libraryXml`. Citation-strip in `lib/ai/qa-parser.ts:54` (`.filter(c => validIds.has(c.id))`) is the only barrier between model hallucinations and cross-tenant `policyId` disclosure. Grant UPSERTs iterate the post-filter list (RESEARCH gap-3), NOT the raw fence.

**Audit trail:** `ai_generations.result` stores RAW Claude output including citation fence (WARNING-4 — DO NOT change to parsed `answer` without new ADR; Phase 8 telemetry depends on raw form). Type marker = one of `'draft' | 'summary' | 'qa' | 'consistency'`.

**Idempotency (D-32):** Optional client-supplied `Idempotency-Key` header on `/api/ai/draft` only (Phase 4). Partial-unique index on `(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL` ships in `drizzle/0007_ai_generations_audit_extensions.sql` (Drizzle does NOT emit partial indexes from `.unique()`, so hand-written SQL).

**Route surface:**
- `app/api/ai/draft/route.ts` — Sonnet, draft generation.
- `app/api/ai/summary/route.ts` — Haiku, TL;DR.
- `app/api/ai/qa/route.ts` + `lib/ai/qa.ts` orchestrator — Sonnet + per-org cache. Phase 5 Server Action wrapper at `app/(employee)/my-policies/ask/page.tsx`.
- `app/api/ai/consistency/route.ts` + `app/api/ai/consistency/[batchId]/route.ts` — Batch submission + poll.

---

## Data Storage

### Supabase (PostgreSQL 17.6) — ACTIVE

**Topology (pooler):** `aws-1-us-east-1.pooler.supabase.com`
- Port `6543` — transaction-mode pooler. `DATABASE_URL` (runtime; Drizzle queries).
- Port `5432` — session-mode pooler. `DIRECT_URL` (migrations; DDL-safe; pooler `6543` chokes on some DDL per D-05).

**Projects (2):**
- DEV: `kdoahaxhmaftxaiwbtdw` — `.env.local`.
- TEST/STAGING: `qwtbbbjbxffioeeazxrw` — `.env.local.test` (RLS cross-org property test per L-06; also reused for staging by `secrets/staging.env`).
- Production: separate Supabase project, credentials in `secrets/prod.env` (gitignored).

**Driver:** `postgres@^3.4.9` (postgres-js) under `drizzle-orm@^0.45.2`.

**Schema:** 13 tables defined in `lib/db/schema.ts`:
- **11 tenant-scoped (every row carries `org_id` with `ON DELETE CASCADE` to `organizations`):** `acknowledgments`, `ai_generations`, `batch_jobs`, `departments`, `notifications`, `organizations`, `policies`, `policy_assignments`, `policy_versions`, `qa_citation_grants`, `users` (special: `org_id` NULLABLE for the 5-min `user.created` → `organizationMembership.created` window per D-03a + CHECK constraint).
- **2 service-role only (NO `org_id`):** `clerk_events`, `stripe_events` — webhook idempotency.

**Total:** 13 tables (DOC NOTE: header in `lib/db/schema.ts` says "13 tables: 11 tenant-scoped + 2 service-role"; some legacy docs say 12 — `qa_citation_grants` was added by migration `0011`. Tenant tables = 11 once you count `users` as tenant-scoped with NULLABLE bootstrap window.).

**Multi-tenancy invariants (CLAUDE.md):**
1. Every DB query must include `org_id` in `WHERE` (RLS is defense-in-depth, NOT the only line).
2. Clerk Organization ID = `organizations.clerk_org_id` (unique).
3. Never query across orgs.
4. RLS pattern on every tenant table: `CREATE POLICY "org_isolation" ... USING (org_id = auth.jwt()->>'org_id')` — rewrapped post-migration 0008 to `(SELECT auth.jwt()->>'org_id')` for query-plan optimization (gap-1 fix); `qa_citation_grants` (migration 0011) uses the wrapped form natively.
5. Application boundary: `lib/auth/context.ts:getOrgContext()` → `lib/db/scoped.ts:withOrgScope()` injects internal UUID `org_id` into the per-tx GUC; repository methods take an `OrgScope` (NOT raw `db`). Only `app/api/webhooks/clerk/route.ts` is allowed to import raw `db` (enforced by `scripts/check-db-imports.ts`).

**Migrations (12 applied — `drizzle/meta/_journal.json`):**

| Tag | Purpose |
|---|---|
| `0000_initial` | Initial 11-table baseline. |
| `0001_rls_policies` | RLS + `users.org_id` nullable CHECK constraint (5-min window). |
| `0002_users_department_fk` | Composite FK `users(org_id, department_id) → departments(org_id, id)` — cross-org dept assignment rejected by Postgres, not just RLS. |
| `0003_fk_hardening` | FK ON DELETE CASCADE across tenant tables. |
| `0004_policy_versions_unique` | UNIQUE`(policy_id, version_number)` backstop (03-G3 T2). |
| `0005_initial_batch_jobs` | Phase 4 — `batch_jobs` table. |
| `0006_rls_batch_jobs` | RLS for `batch_jobs` (4-statement hand-written block per D-29). |
| `0007_ai_generations_audit_extensions` | D-35 Anthropic Usage columns (4 token columns); drops legacy `tokens_used`; partial-unique on `(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. **Destructive** — header documents 2026-05-21 operator approval per Phase 4 D-44. |
| `0008_rls_subquery_wrap` | Rewrites all RLS predicates to `(SELECT auth.jwt()->>'org_id')` form for query-plan optimization. |
| `0009_org_id_indexes` | btree indexes on every tenant `org_id` column (RLS predicate + repo `listForOrg` paths). |
| `0010_phase5_uniques` | Phase 5 D-28 — UNIQUE`(user_id, policy_id, policy_version_id)` on `acknowledgments` (drives ON CONFLICT DO NOTHING silent-success per D-10); UNIQUE`(policy_id, assignee_type, assignee_id)` on `policy_assignments` (D-15). |
| `0011_qa_citation_grants` | Phase 5 D-29 — new `qa_citation_grants` table + UNIQUE`(org_id, user_id, policy_id)` + RLS in post-0008 wrapped form. |

**Migration discipline (CLAUDE.md):** Immutable + ordered. Pre-deploy gate = `pnpm db:migrate:<env>` then `pnpm db:verify:<env>` (exits 0 ⇔ all migrations + RLS + GRANTs + Phase 4 column shape OK); code deploy only after `verify` exits 0. Destructive migrations require ASK-FIRST + header rationale + approval timestamp. Procedure: `docs/runbooks/deploy-migrations.md`.

**File Storage:** None — no Supabase Storage / S3 in use.

**Caching:** None — no Redis / Upstash. Prompt caching is server-side at the Anthropic API layer.

---

## Authentication & Identity

**Provider:** Clerk (see Clerk section above). NEVER roll custom auth (CLAUDE.md NEVER #1).

**Org mirror:** `organizations.clerk_org_id` (unique text) ↔ Clerk Organization ID. `users.clerk_user_id` (unique text) ↔ Clerk User ID. Translation table = `lib/auth/context.ts:getOrgContext()`.

**Server-only boundary:** `lib/ai/*.ts` files all import `'server-only'` (build-time fail if reached from a Client Component). Anthropic key + Drizzle handle NEVER exposed to browser.

---

## Monitoring & Observability

**Error Tracking:** None wired. `SENTRY_DSN` env var declared in `.env.local.example` but no SDK installed.

**Analytics:** None wired. `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` env vars declared but no client.

**Logs:** `console.log` / `console.warn` / `console.error` with structured prefixes (`[clerk-webhook]`, `[ai/qa]`). PII redacted via `maskClerkId()` / `maskClerkOrgId()`. Phase 7+ planned: replace with structured logging (pino + redaction filter).

**Verifier output:** `pnpm verify:phase-N` scripts emit pass/fail per-check; exit-code-driven CI signal.

---

## CI/CD & Deployment

**Hosting:**
- Frontend + API routes: Vercel (Next.js 15 — same team).
- Database: Supabase managed.
- Background workers (Phase 7+): Railway (persistent containers; not deployed yet).

**CI Pipeline:** GitHub Actions
- `.github/workflows/migrate.yml` — migration apply workflow.
- Per-phase verifier scripts run locally + in CI before squash-merge to `main`.

**Vercel build-time gate:** `vercel.json` → `pnpm deploy:preflight` → `scripts/deploy-preflight.ts` runs `scripts/check-deploy-schema.ts` against the target environment before allowing build to proceed. Code-deploy → schema-state ordering enforced at build time.

**Branch model (CLAUDE.md Git Workflow):**
- One feature branch per phase (`gsd/phase-N-<slug>`); one PR per phase squash-merged to `main` with `--delete-branch`.
- Phase boundaries must remain green on `main` (per-phase `verify:phase-N` + `tsc --noEmit` both exit 0).
- In-flight phases may run on parallel branches off a common `main` ancestor (ADR-029 amendment 2026-05-21).

**Active branch:** `gsd/phase-5-employee-portal` (PR #27 merged 2026-05-23).

---

## Stripe (Phase 6 — NOT YET IMPLEMENTED)

**Status:** Placeholder.

**Schema reservations (Phase 2 / migration `0000`):**
- `organizations.stripe_customer_id` (text, nullable).
- `organizations.stripe_subscription_id` (text, nullable).
- `organizations.stripe_subscription_status` (text, default `'trialing'`).
- `stripe_events` table (service-role idempotency).

**Env vars reserved (`.env.local.example` lines 36-47):**
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- 6 price IDs (`STRIPE_PRICE_{STARTER,GROWTH,BUSINESS}_{MONTHLY,ANNUAL}`).

**Planned webhook surface (CLAUDE.md Stripe Rules):** `app/api/webhooks/stripe/route.ts` will handle 5 events idempotently using `stripe_events`:
- `checkout.session.completed` — initial subscription.
- `invoice.paid` — renewal (missing this = users lose access after cycle 1).
- `invoice.payment_failed` — flag for dunning.
- `customer.subscription.deleted` — cancel org.
- `customer.subscription.updated` — plan change.

**Discipline:** Verify webhook signatures with raw body (`request.text()` before any parse — same pattern as Clerk handler). All handlers idempotent via stored event IDs.

**SDK:** `stripe` NPM package NOT yet in `package.json`.

---

## Resend + React Email (Phase 7 — NOT YET IMPLEMENTED)

**Status:** Placeholder.

**Env vars reserved (`.env.local.example` lines 54-56):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (default `noreply@policypilot.com`).

**Planned use:** Reminder emails (`notifications` table → outbound email), acknowledgment nudges, review-due alerts.

**SDK:** `resend` NPM package NOT yet in `package.json`.

---

## Railway Cron Worker (Phase 7 — NOT YET IMPLEMENTED)

**Status:** Placeholder.

**Env vars reserved:** `CRON_SECRET` (HMAC for Railway → Next.js callback authentication).

**Planned use:** Persistent container running cron schedules for review-reminder emails + bulk-notification fan-out. Hits Vercel-hosted Next.js endpoints with `CRON_SECRET`-signed requests.

**Not yet built:** No Railway service code in this repo. Will likely live in a sibling directory or separate repo.

---

## Webhooks Summary

**Incoming:**
- `POST /api/webhooks/clerk` — Svix-verified, idempotent via `clerk_events`. ACTIVE.
- `POST /api/webhooks/stripe` — placeholder, Phase 6. Will be Stripe-signature-verified, idempotent via `stripe_events`.

**Outgoing:**
- `clerkClient().users.updateUserMetadata()` — role mirror to `publicMetadata.role` from webhook handler. ACTIVE.
- Anthropic API (`messages.create`, Batch API). ACTIVE.
- (Phase 6+) Stripe Checkout session creation, Customer Portal session creation.
- (Phase 7+) Resend `emails.send`, Railway → Next.js cron callbacks.

---

## Environment Configuration Summary

**Secrets locations:**
- Local dev: `.env.local` (gitignored).
- Test DB: `.env.local.test` (gitignored).
- Staging/prod migration credentials: `secrets/staging.env` / `secrets/prod.env` (gitignored; loaded by `scripts/with-deploy-creds.ps1`).
- Vercel: Environment Variables panel (production runtime).
- GitHub Actions: Repository secrets (CI migration apply).

**Audit log:** After every successful prod migration, append a one-line entry to `.planning/STATE.md` Session Continuity per `docs/runbooks/deploy-migrations.md` § Audit log.

---

*Integration audit: 2026-05-24 — Phase 5 (Employee Portal) shipped via PR #27 on `gsd/phase-5-employee-portal`. Phases 1-5 complete; Phases 6 (Billing), 7 (Crons+Email), 8 (Validation) not yet started.*
