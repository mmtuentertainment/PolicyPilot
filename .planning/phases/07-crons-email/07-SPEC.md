# Phase 7: Crons + Email — Specification

**Created:** 2026-06-05
**Ambiguity score:** 0.125 (gate: ≤ 0.20)
**Requirements:** 10 locked

## Goal

Reminders and notifications go out automatically: a Railway worker triggers `GET /api/cron/reminders` daily at 08:00 UTC; all 4 notification types (`policy_assigned`, `policy_updated`, `review_due`, `ack_reminder`) send via Resend using React Email templates and write a `notifications` row; re-running the same daily window sends no duplicates; and the in-app bell surfaces the unread count.

## Background

Phase 7 is fully specified as frozen contracts but has **zero runtime code**. Grounded current state (live repo, `c90dd44`):

- **`notifications` table is built + RLS-protected** with `org_id NOT NULL` (D-02 denormalization), `user_id`, `type`, `payload_json`, `read` (default false), `created_at`, plus `notifications_org_id_idx` (`lib/db/schema.ts:152-162`; RLS+GRANT `drizzle/0001_rls_policies.sql:81-85`, subquery-wrapped `0008:70`, indexed `0009:51`). **Note:** the frozen `reference/SCHEMA.md` notifications block is **stale** (omits `org_id`) — build against the live schema; reconciling the doc is a consultant keep-current follow-up.
- **Repository seams are pre-stubbed:** `Notifications.listAll` + `listUnreadForUser` are live org-scoped reads, but `create()` and `markRead()` both `throw new Error('Not yet implemented — Phase 7 (Crons + Email)')` (`lib/db/repositories/notifications.ts:34-44`).
- **Cron route is a contract only:** `GET /api/cron/reminders` — `Bearer {CRON_SECRET}` auth, daily 08:00 UTC, find policies `next_review_date <= now+14d`, find `policy_assignments` unacked `>7d`, send via Resend, INSERT notifications, return `{reviewReminders, ackReminders}` (`reference/API-SPEC.md:110-119`). No handler exists; the path 404s.
- **Wiring already in place:** middleware bypasses Clerk for `/api/cron/(.*)` expecting an in-route `CRON_SECRET` gate (`middleware.ts:28-30,118-120`); `check-db-imports.ts:42` allow-lists `app/api/cron/**/route.ts` for raw `db` (ADR-023); env placeholders `RESEND_API_KEY`/`RESEND_FROM_EMAIL`/`CRON_SECRET` exist blank (`.env.local.example:55-60`) and CI passes them as placeholders.
- **Data sources exist:** `policies.next_review_date` / `review_interval_months` (default 12) (`schema.ts:193-194`); append-only `acknowledgments` + `policy_assignments`; `Policies.listAssignedAndPublishedForUser` (`policies.ts:135-209`) is the closest "who still needs to ack" query (3-state ackState). **But `policies.next_review_date` is never written by any current code path** — so `review_due` is dead until a writer exists.
- **Idempotency precedent established:** `stripe_events` / `clerk_events` are natural-key tables with `INSERT … onConflictDoNothing` in the **same transaction** as the side-effect (`app/api/.../stripe/route.ts:224-254`).

**Does NOT exist:** `app/api/cron/` route; `lib/email/` (no Resend client, no React Email templates); any Railway worker artifact (no Procfile/`railway.json`/nixpacks/Dockerfile); `resend` + `react-email` packages; notification-bell UI; any reminder/dedup logic; a send-state mechanism; `verify:phase-7`.

**Locked anchoring decisions:** ADR-014 (Vercel hosts Next.js + serverless API; Railway hosts the persistent worker for cron + bulk email); ADR-016 (Resend + React Email, templates in `lib/email/templates/`).

## Requirements

1. **R7-1 Authenticated cron endpoint**: `GET /api/cron/reminders` authenticates ONLY via `Authorization: Bearer {CRON_SECRET}` (in-route, since middleware bypasses Clerk for `/api/cron/*`) and returns `{reviewReminders:number, ackReminders:number}`.
   - Current: No `app/api/cron/` route; contract at `API-SPEC.md:110-119` is unbuilt; the path 404s.
   - Target: Route handler present; missing/incorrect Bearer → 401; valid token → 200 with the typed counts object.
   - Acceptance: Request with no/incorrect `Authorization` → HTTP 401; request with correct `Bearer {CRON_SECRET}` → HTTP 200 + JSON body matching `{reviewReminders:number, ackReminders:number}`; `tsc --noEmit` clean, no `any`.

2. **R7-2 Idempotent sends via a send-ledger table**: A new additive `reminder_sends` table is the at-most-once gate — no duplicate email or notification for the same `(org_id, user_id, policy_id, type, window_date)` within a daily window.
   - Current: `notifications` has no `policy_id` and no uniqueness; a naive re-run re-INSERTs + re-sends (backlog rank-6 / R-006).
   - Target: `reminder_sends (org_id, user_id, policy_id, type, window_date, sent_at)` with a natural-key UNIQUE on `(org_id, user_id, policy_id, type, window_date)`; `INSERT … onConflictDoNothing` in the **same tx** as the Resend send + notifications insert, mirroring `stripe_events`/`clerk_events`. Additive forward migration, **ASK-FIRST**, authored with an operator-signed header; applied to dev/TEST only this phase (staging/prod operator-gated).
   - Acceptance: Invoking the cron twice for the same daily window produces exactly one `notifications` row + one Resend send per `(user,policy,type)`; the second run skips already-sent tuples (counts unchanged). Verified by a vitest mirroring the Stripe duplicate-event test.

3. **R7-3 Org-scoped cron execution**: Every DB read/write the cron performs is `org_id`-scoped under RLS even though the caller has no Clerk org JWT.
   - Current: `withOrgScope` (`scoped.ts:41-67`) needs an org_id JWT; the cron is a single machine call. (Execution *mechanism* — loop-per-org via `withOrgScope` vs raw allow-listed `db` with app-layer filtering — is a discuss-phase HOW decision; this requirement locks only the invariant.)
   - Target: Cron resolves the org set and performs all policy/assignment/ack/notification work through an org-scoped path, never querying across orgs.
   - Acceptance: Every query in the cron path includes `org_id` (passes `scripts/check-db-imports` allow-list rules); a two-org fixture confirms Org A's run never reads or writes Org B's policies/assignments/notifications.

4. **R7-4 Four notification types via Resend + React Email**: All 4 types send through Resend using React Email templates and insert a corresponding `notifications` row via the now-implemented `Notifications.create()`.
   - Current: `create()` throws; no `lib/email/`, no Resend client, no templates; `resend`/`react-email` not installed.
   - Target: `lib/email/` with a Resend client + one React Email template per type (templates in `lib/email/templates/` per ADR-016); `Notifications.create()` implemented and org-scoped. `ack_reminder` + `review_due` fire from the cron; `policy_assigned` + `policy_updated` fire from their event paths (see R7-9).
   - Acceptance: For each of the 4 types, exercising its trigger sends exactly one Resend email (asserted against a stub transport) AND inserts exactly one `notifications` row with the matching `type` enum value. `resend` + `react-email` pinned to a release ≥14 days old, operator-approved.

5. **R7-5 Reminder windows + daily cadence**: `review_due` fires for policies with `next_review_date <= now + 14d`; `ack_reminder` fires for `policy_assignments` unacked `> 7d`, re-firing **daily** while still unacked (deduped to one per `(user,policy,type)` per day via R7-2); department-typed assignments expand to member users. Uniform across all tiers.
   - Current: Window thresholds (14d / 7d) live only in `API-SPEC.md:114-115`; resend cadence + department fan-out unspecified; `TIER_LIMITS` has no notification key.
   - Target: Thresholds implemented; department assignments expanded to users; daily re-fire bounded by the per-day dedup window; no per-tier gating.
   - Acceptance: Fixture with a policy due in 13d (included) vs 15d (excluded) and an assignment unacked 8d (included) vs 5d (excluded) yields correct `reviewReminders`/`ackReminders` counts; a department assignment produces one reminder per member user; a same-day re-run does not re-send (R7-2), a next-day run does.

6. **R7-6 In-app notification bell**: An in-app bell shows the correct unread count from `notifications.read = false` and marking-as-read updates immediately via `Notifications.markRead()`.
   - Current: `listUnreadForUser` exists with zero UI consumers; `markRead()` throws; no bell component.
   - Target: Bell component consuming `listUnreadForUser`; `markRead()` implemented (UPDATE — `notifications` is intentionally mutable, NOT in `IMMUTABLE_TABLES`, exempt from the ADR-018 append-only rule); count reflects `read = false`.
   - Acceptance: With N unread rows the bell shows N; invoking mark-as-read flips `read = true` and the displayed count decrements to N-1 without a full reload; `tsc` clean.

7. **R7-7 Railway daily trigger**: A Railway worker service triggers the Vercel-hosted cron endpoint daily at 08:00 UTC over HTTP with the `CRON_SECRET`, with one successful run observable in Railway logs.
   - Current: No Railway worker artifact and no scheduler config; `.coderabbit.yaml:333` notes "no Dockerfile yet (Railway worker phase 7+)".
   - Target: A committed worker entrypoint + schedule definition (per ADR-014 topology: separate Railway service calling `GET /api/cron/reminders` with the `CRON_SECRET`) on a daily 08:00 UTC schedule.
   - Acceptance: Repo contains the Railway worker/schedule definition; a documented run shows the endpoint hit once at 08:00 UTC returning 200 with counts, observable in Railway logs (operator-executed, secret-safe evidence — the live deploy needs operator infra/secrets).

8. **R7-8 `next_review_date` writer on publish**: Policy publish sets `next_review_date` from `review_interval_months` so `review_due` has data to fire on.
   - Current: `policies.next_review_date` (existing column) is never written by any code path, so `review_due` is dead.
   - Target: The publish action computes `next_review_date = published_at + review_interval_months` (default 12) and persists it (no schema change — column exists; org-scoped write).
   - Acceptance: Publishing a policy with `review_interval_months = 12` sets `next_review_date` ≈ 12 months out; a policy published with a near-term interval is then picked up by the R7-5 `review_due` window.

9. **R7-9 Event-driven emission of `policy_assigned` + `policy_updated`**: The admin-assign path emits `policy_assigned`; the republish path emits `policy_updated` — each sending via Resend + inserting a `notifications` row.
   - Current: No emission points exist on the Phase 3/5 assign or publish action paths.
   - Target: `policy_assigned` emitted when an admin assigns a published policy to users/departments; `policy_updated` emitted when a policy is republished to already-assigned users; both org-scoped and idempotent where a re-trigger could duplicate.
   - Acceptance: Assigning a policy emits one `policy_assigned` email + notification per target user; republishing emits one `policy_updated` per already-assigned user; types match the enum.

10. **R7-10 Clerk-webhook test scaffold (T8 carry-forward)**: Add the deferred Clerk-webhook 409/catch-path vitest scaffold.
    - Current: `T8 SF-W5 vitest` is explicitly "deferred to Phase 7+ test-coverage plan" (`ROADMAP:91`); the Clerk webhook 409/catch paths have no test coverage.
    - Target: A vitest covering the Clerk webhook handler's 409 (duplicate) and catch (error) paths, wired into `verify:phase-7`. (SF-W5 invert-idempotency-before-dispatch behavior change stays **deferred** — see Out of scope.)
    - Acceptance: The new vitest exercises the 409 + catch branches and passes; `verify:phase-7` includes it and exits 0.

## Boundaries

**In scope:**
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

**Out of scope:**
- Admin compliance dashboard, Recharts donut, `GET /api/reports/acknowledgments` CSV/JSON export — **Phase 8 owns these** (ROADMAP:188-194), though they consume the same ack data.
- SF-W5 invert-idempotency-before-dispatch on the Clerk webhook — **deferred hardening** (a behavior change to a shipped path; T8 test is in, the fix is not).
- Per-tier reminder cadence/volume caps — **uniform cadence chosen**; adding a notification key is a TIER-LIMITS.md contract change, separate item.
- Escalation tiers / snooze / stop-after-N reminders — no schema support; separate backlog item.
- `qa_citation_grants` cleanup cron (`schema.ts:258` "deferred to Phase 7+ if data volume warrants") — stays deferred.
- SF-WHSEC-1 `CLERK_WEBHOOK_SECRET` rotation — **operator-only follow-up** (R-013), not a code deliverable.
- Slack / any non-Resend transport — stack-locked to Resend + React Email (ADR-016); Slack is a REQ non-goal.
- Any destructive migration (DROP/REVOKE/NOT NULL on existing) — ASK-FIRST; none needed (`reminder_sends` is additive).
- Applying any migration to staging/prod — operator-gated per migration discipline.

## Constraints

- Crons run on a **Railway worker, NOT Vercel cron** (ADR-014 / STACK.md — serverless time limits unsuitable for cron/bulk email).
- Email transport is **Resend + React Email only** (ADR-016); templates in `lib/email/templates/`.
- **Every DB query includes `org_id`** in WHERE; RLS `org_isolation` is the last line; never query across orgs. `notifications`/`policies`/`acknowledgments`/`reminder_sends` are org_id-denormalized + RLS.
- Cron auth is `Authorization: Bearer {CRON_SECRET}`; unauthorized = 401; middleware bypasses Clerk for `/api/cron/*` so the route MUST self-gate.
- Reminders MUST be idempotent — no duplicate send per `(org_id,user,policy,type,window_date)`; follow the `stripe_events`/`clerk_events` natural-key `onConflictDoNothing`-in-tx pattern.
- The new `reminder_sends` table is a DB schema change after Phase 2 → **ASK-FIRST**, additive only, immutable/forward-only, operator-signed header; dev/TEST apply this phase.
- `acknowledgments` are append-only (ADR-018, NEVER #5) — the cron reads them, never UPDATE/DELETE. `notifications` is intentionally mutable (`markRead` UPDATE) and must NOT be added to `IMMUTABLE_TABLES`.
- Only stack-listed packages; `resend` + `react-email` are sanctioned but install is ASK-FIRST and the version must be ≥14 days old.
- Response contract is fixed: `{reviewReminders:number, ackReminders:number}`.
- Raw `db` only inside the ADR-023 allow-list (cron route pre-allow-listed); `lib/email` and any new repo take `s.tx` via `withOrgScope`, not raw `db`.
- `tsc --noEmit` clean (no `any`) before every commit; `verify:phase-7` + `tsc` both exit 0 before squash; `main` stays green between phase squashes.
- Secrets (`CRON_SECRET`, `RESEND_API_KEY`) read from local files only, verified by exit codes/sentinels — never echoed/printed/committed; no dummy secrets in code; never live Stripe.
- Phase 7 depends on Phase 5 (shipped); Phase 8 depends on Phase 6 AND 7. Build routing is operator's call (read-mostly Claude → ASK-FIRST → Codex unless Matthew directs otherwise).

## Acceptance Criteria

- [ ] `GET /api/cron/reminders` returns 401 without the correct `Bearer {CRON_SECRET}` and 200 + `{reviewReminders, ackReminders}` with it.
- [ ] All 4 notification types send via Resend (React Email templates) AND insert a matching `notifications` row: `ack_reminder` + `review_due` from the cron; `policy_assigned` on admin-assign; `policy_updated` on republish.
- [ ] A same-window cron re-run sends no duplicate email / inserts no duplicate notification for the same `(user, policy, type, day)`, enforced by the `reminder_sends` natural-key UNIQUE; verified by a vitest mirroring the Stripe duplicate-event test.
- [ ] `review_due` fires for `next_review_date ≤ now+14d` (date written on publish from `review_interval_months`); `ack_reminder` fires for assignments unacked >7d with daily re-fire; department assignments fan out per member; boundary fixture (13d incl/15d excl; 8d incl/5d excl) yields correct counts.
- [ ] In-app bell shows the correct unread count from `notifications.read = false`; mark-as-read flips `read = true` and decrements without a full reload.
- [ ] Every cron DB query is `org_id`-scoped (passes `check-db-imports` allow-list); a two-org fixture confirms no cross-org read/write.
- [ ] Railway worker artifact + 08:00 UTC schedule committed; one successful run observable in Railway logs (operator-executed, secret-safe evidence).
- [ ] Clerk-webhook 409/catch vitest scaffold (T8) added and passing; `verify:phase-7` + `tsc --noEmit` both exit 0, no `any`.
- [ ] `resend` + `react-email` installed pinned to a release ≥14 days old, operator-approved; `reminder_sends` additive migration authored with an operator-signed header, applied to dev/TEST only.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | 5 locked SCs + REQ-notification-system + frozen cron contract |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Full-4-type in; T8 in; SF-W5/dashboard/tier-cap out          |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Send-ledger dedup + daily window + Railway/Resend locked     |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | Cadence + dedup key make every SC falsifiable                |
| **Ambiguity**      | 0.125 | ≤0.20| ✓      | Goal/acceptance started strong; interview closed boundary/constraint |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective    | Question summary                                  | Decision locked                                                                 |
|-------|----------------|--------------------------------------------------|---------------------------------------------------------------------------------|
| 0     | Scout (5 agents) | Current state of crons/email/reminders?        | Zero runtime code; seams pre-stubbed; `notifications` org-scoped (live schema); `stripe_events` idempotency precedent; `next_review_date` has no writer |
| 1     | Constraint     | Idempotency store for `(user,policy,type)` dedup? | **Send-ledger `reminder_sends` table** (additive, ASK-FIRST, mirrors `stripe_events`) |
| 1     | Boundary       | How much of SC#3's all-4-types now?              | **Full 4-type** — add `next_review_date`-on-publish writer + `policy_assigned`/`policy_updated` event emission |
| 1     | Boundary       | Webhook carry-forwards (T8, SF-W5) in or out?    | **T8 vitest in; SF-W5 idempotency-reorder deferred**                            |
| 1     | Acceptance     | Reminder cadence + tier gating?                  | **Daily nag, uniform all tiers**, deduped per `(user,policy,type)` per day      |
| —     | Spec defaults  | Per-org mechanism / Railway topology / notifications mutability | Mechanism → discuss-phase HOW; topology → ADR-014 (separate Railway svc, HTTP+CRON_SECRET), live run = operator evidence; `notifications` mutable (not IMMUTABLE) |

---

*Phase: 07-crons-email*
*Spec created: 2026-06-05*
*Next step: /gsd-discuss-phase 7 — implementation decisions (per-org cron mechanism, template structure, worker entrypoint, dedup tx wiring)*
