# Phase 7: Crons + Email - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Reminders and notifications go out automatically. A Railway worker triggers `GET /api/cron/reminders` daily at 08:00 UTC; all 4 notification types (`policy_assigned`, `policy_updated`, `review_due`, `ack_reminder`) send via Resend using React Email templates and write a `notifications` row; re-running the same daily window sends no duplicates (a new additive `reminder_sends` send-ledger is the at-most-once gate for the cron types); and the in-app bell surfaces the unread count. Phase 7 also lands the supporting writers the contract depends on: a `next_review_date`-on-publish writer (so `review_due` has data) and event emission of `policy_assigned`/`policy_updated` on the existing assign/republish paths (so Phase 7 touches Phase 3/5 code). Crons run on Railway, not Vercel (ADR-014); email is Resend + React Email only (ADR-016).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**10 requirements are locked.** See `07-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `07-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `GET /api/cron/reminders` route with in-route `Bearer {CRON_SECRET}` auth + `{reviewReminders, ackReminders}` response.
- `lib/email/` — Resend client + React Email templates for all 4 notification types.
- Implementing `Notifications.create()` and `Notifications.markRead()` (currently throw-stubs).
- The additive `reminder_sends` send-ledger table + its idempotency model (ASK-FIRST migration, operator-signed header, dev/TEST apply only).
- `review_due` (next_review_date ≤ now+14d) and `ack_reminder` (unacked >7d, daily re-fire) cron queries, org-scoped, with department fan-out.
- `next_review_date`-on-publish writer (R7-8) so `review_due` has data.
- Event emission of `policy_assigned` (on assign) + `policy_updated` (on republish) (R7-9).
- Railway worker / scheduler artifact triggering the cron daily 08:00 UTC.
- In-app notification bell UI (unread count + mark-as-read).
- Clerk-webhook 409/catch vitest scaffold (T8).
- `verify:phase-7` script + extending `check-schema.ts` / `check-deploy-schema.ts` for the new `reminder_sends` table.
- Pinned, ≥14-day-old, operator-approved `resend` + `react-email` package adds.

**Out of scope (from SPEC.md):**
- Admin compliance dashboard, Recharts donut, CSV/JSON acknowledgment export — Phase 8.
- SF-W5 invert-idempotency-before-dispatch on the Clerk webhook — deferred hardening (T8 test is in, the fix is not).
- Per-tier reminder cadence/volume caps — uniform cadence chosen.
- Escalation tiers / snooze / stop-after-N reminders — no schema support; separate backlog item.
- `qa_citation_grants` cleanup cron — stays deferred.
- SF-WHSEC-1 `CLERK_WEBHOOK_SECRET` rotation — operator-only follow-up (R-013).
- Slack / any non-Resend transport — stack-locked (ADR-016); Slack is a REQ non-goal.
- Any destructive migration — ASK-FIRST; none needed (`reminder_sends` is additive).
- Applying any migration to staging/prod — operator-gated per migration discipline.

</spec_lock>

<decisions>
## Implementation Decisions

All 13 decisions below are LOCKED from `/gsd-discuss-phase 7` (operator selections, 2026-06-05). They are HOW decisions only — SPEC.md owns WHAT/WHY. Grouped by topic for planner consumption.

### Cron Execution & Org Scoping (R7-1, R7-3)
- **D-01 — Loop-per-org via `withOrgScope`.** The cron enumerates org IDs via the allow-listed raw `SELECT id FROM organizations` (the cron route is already in the ADR-023 `check-db-imports` allow-list), then for each org synthesizes a minimal `OrgContext { orgId }` and runs ALL reads/writes inside `withOrgScope` so RLS enforces tenant isolation — even though the machine caller has no Clerk org JWT. One transaction per org. Chosen over a single cross-org raw-`db` pass so "RLS is the last line of defense" (CLAUDE.md) holds for the cron path and the two-org isolation test is enforced by RLS rather than app-layer assertion. (Security boundary — operator-approved via ASK-FIRST.)
- **D-02 — Cron resilience & HTTP response.** Each org's processing is wrapped in `try/catch` so one org's failure does not block the rest. `GET /api/cron/reminders` returns **200** with `{reviewReminders, ackReminders}` (= committed winners this run) on a normal run, plus structured, masked, per-org error logs (`console.error` object-literal style per CONVENTIONS Logging). It returns **5xx only on a pre-loop fatal**: missing/incorrect `Bearer {CRON_SECRET}` → 401; DB-connect failure → 503 — so Railway surfaces a hard failure. Counts reflect committed `notifications`/`reminder_sends` rows; post-commit Resend failures are logged (not counted) and self-heal next day.

### Idempotency & Send Atomicity (R7-2)
- **D-03 — Record-then-send + per-user isolation (at-most-once).** Inside the per-org `withOrgScope` tx: claim each `(org_id, user_id, policy_id, type, window_date)` via `reminder_sends … .onConflictDoNothing().returning()`, insert the `notifications` row for the winners, **COMMIT**; then send Resend per winner **AFTER commit**, with per-user `try/catch`. Email I/O is never held open inside the DB tx. This strictly satisfies the SPEC AC ("invoke twice for the same window → exactly one notifications row + one send"); a transient email failure self-heals the next day because `window_date` advances and the daily re-fire re-evaluates still-unacked work. Mirrors the `stripe_events`/`clerk_events` `onConflictDoNothing`-in-tx short-circuit (06 D-21, CONVENTIONS).
- **D-04 — `reminder_sends` dedup scope = cron types only.** The daily `window_date` ledger gates `ack_reminder` + `review_due` (the recurring cron types). The event types are NOT gated by `reminder_sends`: `policy_assigned` fires only when a NEW `policy_assignments` row is actually inserted (RETURNING-gated, leveraging 05 D-15's `ON CONFLICT DO NOTHING`); `policy_updated` fires once per genuine republish (new `policy_version`). A second same-day republish/assign still notifies — it is a real event, and a daily window must not suppress it.
- **D-05 — `reminder_sends` table shape + migration `0013`.** Columns `(org_id, user_id, policy_id, type, window_date, sent_at)`; natural-key UNIQUE on `(org_id, user_id, policy_id, type, window_date)`; `window_date` is a `date` (UTC calendar day) so the daily key is clean; `sent_at` `timestamptz`. Org-scoped → RLS `org_isolation` + `GRANT` + `org_id` index, mirroring `qa_citation_grants` (05 D-29). New migration `drizzle/0013_reminder_sends.sql` (next after `0012_billing_state`), additive / forward-only, with an operator-signed header (rationale + approval timestamp + decision ID), applied to dev/TEST only this phase (staging/prod operator-gated per migration discipline). **The operator pre-approved Claude AUTHORING this migration (s27 banked approval); the header sign-off is still required before commit.**

### Reminder Semantics (R7-5, R7-8)
- **D-06 — `review_due` recipient = org admins.** `review_due` is a governance/ownership alert, routed to org admin users (`users.role='admin'`): one notification + email per admin per due policy (`next_review_date ≤ now+14d`). Employees only acknowledge; they do not receive `review_due`. (The SPEC locks the trigger but not the recipient — this resolves it.)
- **D-07 — `ack_reminder` target = current-version-unacked (none + stale), >7d.** Fire for assignments where the user has not acked the CURRENT version — `ackState ∈ {none, stale}` reusing 05 D-04's 3-state logic — unacked >7d (none: 7d since assignment/publish; stale: 7d since the new version's publish). A "stale" user (acked a prior version, not the re-published current) IS reminded — matches "re-publish forces re-ack". Department-typed assignments expand to member users. Uniform across all tiers (no TIER-LIMITS change).
- **D-08 — `next_review_date` writer = forward-only.** The publish action computes `next_review_date = published_at + review_interval_months` (default 12) and persists it (org-scoped write; no schema change — column exists). Existing published policies stay NULL until re-published — NO backfill (pre-customer status per STATE.md makes this safe; avoids a data migration). `review_due` goes live as policies publish/re-publish.
- **D-09 — Department fan-out = new org-wide cron query.** A new cron-specific repo method returns `(userId, policyId)` pairs org-wide for `ack_reminder`, reusing 05 D-01's JOIN + `ackState` logic WITHOUT the `userId` filter, expanding department assignments via a `users.department_id` sub-select (mirrors 05 D-03). One query per org, no N+1. (Not a reuse of the per-user `listAssignedAndPublishedForUser`.)

### Email Layer (R7-4)
- **D-10 — `lib/email/` = shared base layout + typed dispatch map.** One React Email base layout (header/footer/brand) + 4 per-type templates composing it (`lib/email/templates/` per ADR-016) + a typed `type → {subject, template}` map so the cron path and the event paths (`policy_assigned`/`policy_updated`) share ONE `send()` entrypoint. `getResendClient()` lazy singleton (mirrors `getStripeClient`/`getAnthropicClient`). Typed errors in `lib/email/errors.ts` (ADR-026). A stub Resend transport is used for tests (06 D-32 module-boundary mocking). Resend + React Email docs are pulled via Context7 during planning. `resend` + `react-email` install is ASK-FIRST and the version must be ≥14 days old (supply-chain rule).

### Worker (R7-7)
- **D-11 — Railway native cron + dependency-free fetch script.** A Railway Cron service whose one-shot command runs `node worker/trigger-reminders.mjs`, which does a single HTTPS GET to `/api/cron/reminders` with `Authorization: Bearer {CRON_SECRET}`. ZERO new dependencies (no scheduler package — avoids the no-unlisted-package + ≥14-day rules). Schedule defined in `railway.json`/`railway.toml` (research confirms the exact format + any nixpacks/Dockerfile need). The live 08:00 UTC run is operator-executed, secret-safe evidence (like the Stripe UAT), NOT a CI gate (ADR-014 topology: separate Railway service → HTTPS + `CRON_SECRET`).

### Notification Bell (R7-6)
- **D-12 — Bell UX deferred to `/gsd-ui-phase 7`.** This phase implements the BACKEND: `Notifications.markRead()` (UPDATE — `notifications` is intentionally mutable, NOT in `IMMUTABLE_TABLES`, exempt from the ADR-018 append-only rule) and the already-live `listUnreadForUser` read. The UI surface — placement (employee/admin/both), unread-count refresh (server-component-on-nav vs poll vs revalidate-after-markRead), mark-read interaction — is a `/gsd-ui-phase 7` decision, run after `/gsd-plan-phase 7`.

### Testing & Verification (R7-2, R7-3, R7-10)
- **D-13 — TEST-DB integration + unit-with-stub-transport; cumulative `verify:phase-7`.** A `scripts/check-crons-email.ts` integration check runs against the real TEST DB (raw `postgres-js` + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)` + intentional ROLLBACK + final TRUNCATE, mirroring 05 `check-employee-portal.ts` / `check-rls.ts`) for the DB-truth invariants module mocks cannot exercise: R7-2 idempotency (double-run → exactly one row via the UNIQUE + `onConflictDoNothing`), R7-3 two-org RLS isolation, R7-5 windows (13d incl / 15d excl; 8d incl / 5d excl; none+stale), R7-8 writer. PLUS co-located vitest with the stub Resend transport for send-dispatch + template-selection logic. R7-10: add the T8 Clerk-webhook 409/catch vitest (SF-W5 behavior fix stays deferred). `verify:phase-7 = pnpm verify:phase-6 && check:crons-email && <co-located vitests via test> && pnpm db:verify && pnpm check:artifacts`; extend `check-schema.ts`/`check-deploy-schema.ts` for `reminder_sends` (shape + RLS + GRANT) and `check-artifacts.ts` for the cron route + `lib/email` + worker artifact + templates + T8. The live Railway run is manual operator evidence, not CI.

### Claude's Discretion
The planner has flexibility within the constraints above on:
- Exact SQL formatting / JOIN order in the new org-wide `ack_reminder` query (reuse 05 D-01's shape).
- `reminder_sends` Drizzle column types + index/constraint naming (mirror `qa_citation_grants`).
- Placement of the 14d/7d thresholds + the shared `send()` helper (e.g., `lib/reminders/` vs `lib/email/`).
- Exact React Email base-layout markup + per-template copy.
- `worker/` directory layout + the exact Railway config file format (research confirms).
- Stub Resend transport shape for tests (mirror the Stripe module-boundary mock).
- `scripts/check-crons-email.ts` fixture builders + the exact `verify:phase-7` script wiring.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 lock
- `.planning/phases/07-crons-email/07-SPEC.md` — Locked requirements R7-1..R7-10, boundaries, acceptance criteria. **Locked requirements — MUST read before planning.**
- `.planning/phases/07-crons-email/07-DISCUSSION-LOG.md` — Per-question audit of operator selections + alternatives considered.

### Project lock
- `.planning/PROJECT.md` — Locked ADRs: ADR-014 (Vercel hosts Next.js/serverless; Railway hosts the persistent worker for cron + bulk email), ADR-016 (Resend + React Email; templates in `lib/email/templates/`), ADR-018 (append-only audit), ADR-019 (org_id in every WHERE), ADR-023 (per-aggregate repos + raw-`db` allow-list), ADR-025 (`withOrgScope` + RLS), ADR-026 (typed errors per domain), ADR-028 (PolicyId brand), ADR-029 (phase gating).
- `.planning/REQUIREMENTS.md` — REQ-notification-system (Phase 7 primary); REQ-acknowledgment-tracking / -rules (ack_reminder source); REQ-access-control (org isolation invariant).
- `.planning/STATE.md` — pre-paying-customer status (basis for forward-only D-08 + additive-migration ASK-FIRST approval).
- `.planning/ROADMAP.md` § Phase 7 Phase Details — Goal, Depends-on (Phase 5), Success Criteria, Canonical refs.

### Frozen contracts (FOUNDRY-stage)
- `reference/API-SPEC.md` §110-119 — `GET /api/cron/reminders` contract: `Bearer {CRON_SECRET}`, daily 08:00 UTC, `next_review_date ≤ now+14d`, assignments unacked >7d, send Resend, INSERT notifications, return `{reviewReminders, ackReminders}`.
- `reference/SCHEMA.md` — notifications block is **STALE** (omits the live `org_id`). Build against `lib/db/schema.ts`; reconcile the doc at Phase 7 ship (consultant keep-current follow-up).
- `reference/TIER-LIMITS.md` — no Phase 7 change (uniform cadence, no notification key).

### Live schema + scoping (build against these, NOT the frozen contract)
- `lib/db/schema.ts` — `notifications` (built; `org_id NOT NULL`; types `policy_assigned|policy_updated|review_due|ack_reminder`; `read` default false), `policies` (`next_review_date`, `review_interval_months` default 12), `policy_assignments` (`assigneeType` user|department; UNIQUE `(policyId, assigneeType, assigneeId)`), append-only `acknowledgments`, `users` (`department_id`), `departments`. Add the `reminderSends` export.
- `lib/db/scoped.ts` + `lib/auth/context.ts` — `withOrgScope` + `OrgContext`. The cron synthesizes a minimal `{ orgId }` OrgContext per org (D-01).
- `lib/db/repositories/notifications.ts` §34-44 — `create()` + `markRead()` throw-stubs to implement (D-12).
- `lib/db/repositories/policies.ts` §135-209 — `listAssignedAndPublishedForUser` (05 D-01): JOIN + 3-state `ackState` pattern to reuse for the new org-wide `ack_reminder` query (D-09); the publish action to extend for the D-08 writer.
- `lib/db/repositories/policy_assignments.ts` — assignment source; the RETURNING-gate for `policy_assigned` emission (D-04).

### Idempotency + webhook precedent
- `app/api/webhooks/stripe/route.ts` §224-254 — `stripe_events … onConflictDoNothing().returning()`-in-tx short-circuit; the canonical pattern D-03 mirrors.
- `app/api/webhooks/clerk/route.ts` — `clerk_events` idempotency + raw-body discipline; T8 (R7-10) covers its 409/catch paths.
- `.planning/codebase/CONVENTIONS.md` § "Idempotency via stripeEvents" + § Logging — in-tx `onConflictDoNothing` short-circuit + structured masked logging.

### Cron wiring + allow-list
- `middleware.ts` §28-30,118-120 — `/api/cron/(.*)` bypasses Clerk; the route MUST self-gate on `Bearer {CRON_SECRET}`.
- `scripts/check-db-imports.ts` §42 — cron route pre-allow-listed for raw `db` (ADR-023).

### Migration discipline
- `drizzle/meta/_journal.json` — migration immutability; next index after `0012_billing_state` → `0013`.
- `docs/runbooks/deploy-migrations.md` — additive migration procedure, operator-signed header pattern, post-prod audit-log entry.
- `.planning/phases/05-employee-portal/05-CONTEXT.md` D-29 — `qa_citation_grants` migration (RLS `org_isolation` + GRANT + `org_id` index) — shape precedent for `reminder_sends` (D-05).

### Prior phase context
- `.planning/phases/05-employee-portal/05-CONTEXT.md` — D-01..D-04 (ackState 3-state + dept sub-select), D-15 (`policy_assignments` ON CONFLICT), D-21/D-22 (TEST-DB integration test pattern), D-29 (migration RLS/GRANT).
- `.planning/phases/06-billing/06-CONTEXT.md` — D-21 (idempotency-in-tx), D-31/D-32 (test split + module-boundary mocking), D-35 (cumulative verify chain), D-04 (lazy server-only helper modules).
- `.planning/codebase/INTEGRATIONS.md` — Resend/Railway planned-status + env vars (`RESEND_API_KEY`, `RESEND_FROM_EMAIL` default `noreply@policypilot.com`, `CRON_SECRET`); all 14 tables; lazy-client init pattern.
- `.planning/codebase/CONVENTIONS.md` — repo/org-scope, typed-error, server-only guard, verify-chain conventions.

### Library docs (pull during planning — not yet installed)
- Resend (`resend` npm) + React Email — via Context7 (`resolve-library-id` → `query-docs`) for the send API + template components + a stub transport. Pin to a release ≥14 days old; install is ASK-FIRST.
- Railway — official docs for the native Cron service + schedule config (`railway.json`/`railway.toml`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`withOrgScope` + `OrgContext`** (`lib/db/scoped.ts`, `lib/auth/context.ts`) — every cron DB path. The cron loops orgs and opens `withOrgScope({ orgId }, …)` per org (D-01).
- **`stripe_events`/`clerk_events` idempotency** (`app/api/webhooks/stripe/route.ts`, `clerk/route.ts`) — the `insert(...).onConflictDoNothing().returning()` short-circuit D-03 mirrors for `reminder_sends`.
- **`Policies.listAssignedAndPublishedForUser`** (05 D-01) — JOIN + 3-state `ackState` source for the new org-wide `ack_reminder` query (D-09); the publish action is the seam for the D-08 `next_review_date` writer.
- **`qa_citation_grants` migration** (`drizzle/0011_…`, 05 D-29) — RLS + GRANT + index shape precedent for the additive `reminder_sends` migration `0013` (D-05).
- **Lazy server-only singletons** (`getStripeClient`, `getAnthropicClient`, `getPriceCatalog`) — `getResendClient()` follows the same lazy pattern (D-10).
- **`notifications` repo throw-stubs** (`lib/db/repositories/notifications.ts`) — `create()` / `markRead()` to fill (D-03, D-12).

### Established Patterns
- **Org-scope-first repositories** (ADR-023/ADR-025): every new DB method takes `OrgScope` and uses `s.tx`, never raw `db` — except the cron's `SELECT id FROM organizations` org enumeration, which rides the existing cron-route raw-`db` allow-list.
- **Idempotency-in-tx** (06 D-21): `onConflictDoNothing().returning()`; `inserted.length === 0` ⇒ already done.
- **Typed errors per domain** (ADR-026): new `lib/email/errors.ts`.
- **Cumulative `verify:phase-N`** (05 D-23 / 06 D-35): each wraps the prior + adds focused gates.
- **TEST-DB integration scripts** (05 D-22): raw postgres-js + BYPASSRLS seed + `SET LOCAL ROLE` + `set_config` + ROLLBACK/TRUNCATE for RLS/DB-truth invariants; module-boundary mocks for SDK transports (06 D-32).
- **Append-only** (ADR-018): the cron READS `acknowledgments`, never writes; `notifications` is intentionally mutable (`markRead`), NOT in `IMMUTABLE_TABLES`.

### Integration Points
- **`app/api/cron/reminders/route.ts`** (NEW) — self-gates on `Bearer {CRON_SECRET}`; loops orgs; returns `{reviewReminders, ackReminders}`.
- **`lib/email/`** (NEW) — `client.ts` (`getResendClient`), `templates/` (base layout + 4 types), `send.ts` (typed dispatch), `errors.ts`.
- **`worker/trigger-reminders.mjs`** (NEW) + `railway.json`/`railway.toml` — the dependency-free HTTPS-GET trigger (D-11).
- **Policy publish action** (Phase 3 `app/(admin)/policies/[id]/actions.ts`) — extended for the D-08 `next_review_date` writer + `policy_updated` emission (D-04).
- **Assign action** (Phase 5 admin "Assign to department") — extended for `policy_assigned` emission, RETURNING-gated (D-04).
- **`drizzle/0013_reminder_sends.sql`** (NEW) + `lib/db/schema.ts` `reminderSends` export.
- **`package.json`** — `verify:phase-7` + `check:crons-email`; **CI** — a required Phase 7 verification job (mirror `verify-phase-6.yml`).
- **Schema gates** — `check-schema.ts` / `check-deploy-schema.ts` extended for `reminder_sends`; `check-artifacts.ts` for the new route/email/worker/templates/T8.

</code_context>

<specifics>
## Specific Ideas

- **`reminder_sends` migration authoring is operator-pre-approved** (s27 banked): Claude may AUTHOR `drizzle/0013_reminder_sends.sql` (additive, forward-only), but the operator-signed header (rationale + approval timestamp + decision ID) is required before commit, and the migration is applied to dev/TEST only this phase — staging/prod are operator-gated per migration discipline.
- **`reference/SCHEMA.md` notifications block is stale** (omits `org_id`) — build against `lib/db/schema.ts`; reconcile the frozen doc at Phase 7 ship (consultant keep-current).
- **From address:** `RESEND_FROM_EMAIL` defaults to `noreply@policypilot.com` (already in `.env.local.example`). These reminders are transactional, not marketing — no unsubscribe/preference surface needed for MVP.
- **`window_date` is a UTC calendar `date`** (the daily dedup window) — the natural key's daily granularity is what makes "daily re-fire, one send per day" work and lets a transient email failure self-heal next day.
- **Counts are committed-row counts** — `{reviewReminders, ackReminders}` report `reminder_sends`/`notifications` rows committed this run, not Resend acceptances (post-commit send failures are logged, not counted).

</specifics>

<deferred>
## Deferred Ideas

- **Notification-bell UX (R7-6)** → `/gsd-ui-phase 7` (placement / unread-count refresh / mark-read interaction). Backend `markRead()` + `listUnreadForUser` are in THIS phase.
- **Email unsubscribe / notification preferences** → not needed for transactional reminders; note only (no schema support, separate item if ever required).
- **Escalation tiers / snooze / stop-after-N reminders** → backlog (no schema support; SPEC out-of-scope).
- **Per-tier reminder cadence/volume caps** → separate TIER-LIMITS.md contract change (uniform cadence chosen).
- **`qa_citation_grants` cleanup cron** → stays deferred (05 deferred; revisit if data volume warrants).
- **SF-W5 invert-idempotency-before-dispatch (Clerk webhook)** → deferred hardening; T8 test is in this phase, the behavior fix is not.
- **`next_review_date` backfill for existing published policies** → not done (D-08 forward-only); revisit only if a real published-policy corpus predates the writer.

</deferred>

---

*Phase: 07-crons-email*
*Context gathered: 2026-06-05*
