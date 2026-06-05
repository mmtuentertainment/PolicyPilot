# Phase 7: Crons + Email - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 7-crons-email
**Areas discussed:** Per-org cron mechanism, Idempotency & send atomicity, Railway worker artifact, Email template structure, reminder_sends dedup scope, Notification bell (R7-6) routing, review_due recipient, ack_reminder target, next_review_date backfill, Cron resilience & response, Test strategy, verify:phase-7 composition, Department fan-out

> SPEC.md (10 requirements) was loaded — discussion was scoped to implementation (HOW) decisions only.

---

## Area Selection (multiSelect)

Operator selected ALL FOUR SPEC-named HOW areas to discuss: Per-org cron mechanism, Idempotency & send atomicity, Railway worker artifact, Email template structure. (Notification-bell UX was offered as "Other"; not selected here — handled later under its own area.)

---

## Per-org cron mechanism (R7-3)

| Option | Description | Selected |
|--------|-------------|----------|
| Loop-per-org via withOrgScope | Enumerate org IDs via allow-listed raw SELECT; synth OrgContext per org; RLS enforces isolation; one tx/org; two-org test free | ✓ |
| Single raw-db pass + app org_id filter | Webhook-style; 1 cross-org query set; no RLS for the cron path; isolation rests on app-layer correctness | |
| Let Claude decide | | |

**User's choice:** Loop-per-org via withOrgScope
**Notes:** Security boundary (ASK-FIRST). Preserves "RLS is the last line of defense" for the cron path.

---

## Idempotency & send atomicity (R7-2)

| Option | Description | Selected |
|--------|-------------|----------|
| Record-then-send + per-user isolation | Claim reminder_sends + insert notification in-tx, COMMIT, then send Resend after commit, per-user try/catch. At-most-once; self-heals next day. Strictly satisfies the no-duplicate AC | ✓ |
| Send-then-record | Email first, then record in tx; at-least-once (rare duplicate) — risks the "twice in a window → one send" AC | |
| Let Claude decide | | |

**User's choice:** Record-then-send + per-user isolation
**Notes:** Email is non-transactional, so exactly-once is impossible; chose at-most-once because the daily re-fire covers the rare missed send.

---

## Railway worker artifact (R7-7)

| Option | Description | Selected |
|--------|-------------|----------|
| Railway native cron + fetch script | Cron service runs a one-shot node fetch to /api/cron/reminders with Bearer CRON_SECRET; zero new deps; schedule in railway.json/toml | ✓ |
| Persistent node-cron worker | Long-running service with in-process scheduler; adds a new dep (ASK-FIRST + ≥14-day rule) | |
| Let Claude decide | | |

**User's choice:** Railway native cron + fetch script
**Notes:** ADR-014 already locks the topology; this picks the dependency-free artifact shape. Live 08:00 run = operator-executed evidence.

---

## Email template structure (R7-4)

| Option | Description | Selected |
|--------|-------------|----------|
| Shared base layout + dispatch map | One base layout + 4 per-type templates + typed type→{subject,template} map + one send() entrypoint; getResendClient() lazy; stub transport for tests | ✓ |
| 4 standalone templates | Each type self-contained; duplicates header/footer/brand + send wiring | |
| Let Claude decide | | |

**User's choice:** Shared base layout + dispatch map
**Notes:** Resend + React Email docs to be pulled via Context7 in planning; install ASK-FIRST + ≥14-day-old.

---

## reminder_sends dedup scope (R7-2 follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Cron-only ledger; events gate on action | reminder_sends (daily window_date) dedups ack_reminder + review_due only; policy_assigned gates on new assignment row, policy_updated on new version | ✓ |
| All 4 through the daily ledger | Every type writes reminder_sends window_date=today; a 2nd same-day republish/assign is suppressed | |
| Let Claude decide | | |

**User's choice:** Cron-only ledger; events gate on action
**Notes:** A daily window must not suppress a legitimate same-day repeat event (republish/assign).

---

## Notification bell (R7-6) routing

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to /gsd-ui-phase 7 | Capture R7-6 UX as a UI-phase concern; backend markRead()/listUnreadForUser covered in this phase | ✓ |
| Discuss the bell now | Ask placement / count refresh / mark-read interaction | |
| Lock sensible defaults now | Bell in both shells; server-rendered count + revalidate; per-item mark-read | |

**User's choice:** Defer to /gsd-ui-phase 7
**Notes:** Backend is in Phase 7; UI surface decided in the UI-phase after planning.

---

## review_due recipient (R7-5)

| Option | Description | Selected |
|--------|-------------|----------|
| Org admins | review_due → org admin users (role='admin'); one per admin per due policy | ✓ |
| Policy author/last-publisher only | Notify just the creator/last-publisher (needs a created_by source) | |
| Let Claude decide | | |

**User's choice:** Org admins
**Notes:** SPEC locked the trigger but not the recipient — review_due is a governance alert for admins; employees only acknowledge.

---

## ack_reminder target (R7-5)

| Option | Description | Selected |
|--------|-------------|----------|
| none + stale, >7d | Current-version-unacked (ackState none OR stale per 05 D-04), unacked >7d; catches never-acked AND acked-old-version-then-republished | ✓ |
| none only, >7d | Only never-acked-at-all; a stale (acked v1, not re-published v2) user gets no reminder — compliance gap | |
| Let Claude decide | | |

**User's choice:** none + stale, >7d
**Notes:** Matches "re-publish forces re-ack"; department-typed assignments expand to member users.

---

## next_review_date backfill (R7-8)

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-only | Only new publishes set next_review_date; existing published stay NULL; no data migration; safe pre-customer | ✓ |
| Backfill existing published | One-time data migration sets next_review_date for currently-published policies (operator-gated) | |
| Let Claude decide | | |

**User's choice:** Forward-only
**Notes:** Pre-customer status (no real production-published policies) makes forward-only safe; review_due goes live as policies publish/re-publish.

---

## Cron resilience & response (R7-1/R7-3)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-org isolation; 200+counts, 5xx only on fatal | try/catch per org; 200 + counts on normal run + masked per-org logs; 5xx only on pre-loop fatal (bad CRON_SECRET→401, DB-connect→503) | ✓ |
| Fail-fast: abort run on first org error (500) | Any org error aborts the whole run; one bad org blocks all reminders that day | |
| Let Claude decide | | |

**User's choice:** Per-org isolation; 200+counts, 5xx only on fatal
**Notes:** Counts reflect committed notification rows; post-commit Resend failures are logged, not counted, self-heal next day.

---

## Test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| TEST-DB integration + unit w/ stub transport | scripts/check-crons-email.ts on real TEST DB for DB-truth invariants (idempotency, two-org RLS, windows, writer) + co-located vitest w/ stub Resend transport | ✓ |
| Module-boundary mocks only | All vitest w/ mocked tx + mocked Resend; onConflictDoNothing UNIQUE + RLS isolation not really exercised | |
| Let Claude decide | | |

**User's choice:** TEST-DB integration + unit w/ stub transport
**Notes:** Mirrors 05 D-21/D-22 (check-employee-portal/check-rls) + 06 D-31/D-32. The two things most worth proving are DB-level truths.

---

## verify:phase-7 composition (R7-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Cumulative chain; live run = manual evidence | verify:phase-7 = verify:phase-6 && check:crons-email && vitests && db:verify && check:artifacts; live Railway run = operator evidence, not CI | ✓ |
| Include a live cron hit in CI | Real scheduled/HTTP cron invocation in CI; needs live Railway + secrets, non-deterministic | |
| Let Claude decide | | |

**User's choice:** Cumulative chain; live run = manual evidence
**Notes:** Mirrors the rejected "live Stripe in CI" pattern; extend check-schema/check-deploy-schema for reminder_sends + check-artifacts for the new surfaces.

---

## Department fan-out (R7-5)

| Option | Description | Selected |
|--------|-------------|----------|
| New org-wide query, dept via users.department_id | New cron-specific repo method returning (userId, policyId) pairs org-wide, reusing 05 D-01 JOIN/ackState w/o the userId filter, dept via users.department_id sub-select; one query/org | ✓ |
| Loop the per-user query over all org users | Call listAssignedAndPublishedForUser per user; N+1 | |
| Let Claude decide | | |

**User's choice:** New org-wide query, dept via users.department_id
**Notes:** The cron needs the inverse of 05's per-user query; reuse the JOIN/ackState shape, drop the userId filter.

---

## Claude's Discretion

No area was delegated to Claude during the discussion — every question was answered explicitly with the recommended option. Planner discretion items (SQL formatting, column types, threshold/helper placement, template markup, worker layout, stub-transport shape, fixture builders, verify wiring) are listed in CONTEXT.md § Claude's Discretion.

## Deferred Ideas

- Notification-bell UX (R7-6) → /gsd-ui-phase 7
- Email unsubscribe / notification preferences → not needed for transactional reminders (note only)
- Escalation / snooze / stop-after-N reminders → backlog
- Per-tier reminder cadence/volume caps → separate TIER-LIMITS change
- qa_citation_grants cleanup cron → stays deferred
- SF-W5 idempotency-reorder (Clerk webhook) → deferred hardening (T8 test in, fix out)
- next_review_date backfill for existing published policies → not done (forward-only)
