---
phase: 7
slug: crons-email
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-05
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed rationale + DB-truth-vs-mockable classification lives in `07-RESEARCH.md` § Validation Architecture (line 818).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `^1.6.0` (already installed — no Wave 0 framework install) |
| **Config file** | `scripts/check-crons-email.vitest.config.ts` (new — mirror `check-employee-portal.vitest.config.ts`) |
| **Quick run command** | `pnpm vitest run <affected file>` |
| **Full suite command** | `pnpm verify:phase-7` |
| **Estimated runtime** | ~60–120 seconds (cumulative chain wraps `verify:phase-6`) |

`verify:phase-7` (cumulative per 05 D-23 / 06 D-35, exact wiring is Claude's discretion per CONTEXT D-13):

```
pnpm tsc --noEmit && pnpm verify:phase-6 && pnpm check:crons-email \
  && pnpm test --run lib/email && pnpm test --run app/api/cron \
  && pnpm test --run app/api/webhooks/clerk && pnpm db:verify && pnpm check:artifacts
```

---

## Sampling Rate

- **After every task commit:** `pnpm tsc --noEmit && pnpm vitest run <affected file>`
- **After every plan wave:** `pnpm verify:phase-6 && pnpm check:crons-email && pnpm test`
- **Before `/gsd-verify-work`:** `pnpm verify:phase-7` exits 0
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

> Task IDs (`07-NN-MM`) are bound by the planner; rows below are requirement-anchored and reconcile to task IDs at plan time / `/gsd-validate-phase`.

| Req | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-----------------|-----------|-------------------|-------------|
| R7-1 | No/wrong Bearer → 401; correct → 200 + `{reviewReminders,ackReminders}` | T-Spoof-cron | In-route `CRON_SECRET` gate (middleware bypasses Clerk) | unit (route + stub db) | `pnpm vitest run app/api/cron/reminders/route.test.ts` | ❌ W0 |
| R7-2 | Double-run same window → exactly 1 `reminder_sends` + 1 `notifications` row | T-DoS-dup | UNIQUE + `onConflictDoNothing` in tx | TEST-DB integration | `pnpm check:crons-email` | ❌ W0 |
| R7-3 | Two-org fixture: Org A run never reads/writes Org B | T-Info-xorg | `withOrgScope` + RLS, per-org loop | TEST-DB integration | `pnpm check:crons-email` | ❌ W0 |
| R7-4 | Each of 4 types: 1 Resend send + 1 `notifications` row; correct subject/template | — | Auto-escaped JSX text nodes | unit (stub Resend) | `pnpm vitest run lib/email` | ❌ W0 |
| R7-5 | 13d incl / 15d excl; 8d incl / 5d excl; none+stale incl; dept fan-out | T-Validation | `window_date` from server UTC, not client | TEST-DB integration | `pnpm check:crons-email` | ❌ W0 |
| R7-6 | `markRead()` UPDATE flips `read=true`; `listUnreadForUser` count decrements | — | `notifications` mutable, NOT in IMMUTABLE_TABLES | TEST-DB integration | `pnpm check:crons-email` | ❌ W0 |
| R7-7 | Railway worker file exists; `railway.json` has `cronSchedule` + `startCommand` | — | `CRON_SECRET` never committed | static artifact gate | `pnpm check:artifacts` | ❌ W0 |
| R7-8 | Publish with `review_interval_months=12` sets `next_review_date` ≈ 12mo out | — | Org-scoped write | TEST-DB integration | `pnpm check:crons-email` | ❌ W0 |
| R7-9 | Assign → `policy_assigned` (1 send + 1 notify); republish → `policy_updated` | — | RETURNING-gated emission (no dup) | unit (stub Resend + db) | `pnpm vitest run "app/(admin)/policies"` | ❌ W0 |
| R7-10 | Clerk webhook 409/catch scaffold passes | — | Branch coverage of dup + error paths | unit (`vi.mock`) | `pnpm vitest run app/api/webhooks/clerk` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**DB-truth (TEST DB required — mocks cannot exercise):** R7-2 (UNIQUE), R7-3 (RLS via `SET LOCAL ROLE`), R7-5 (date arithmetic), R7-6 (UPDATE), R7-8 (persisted column).
**Module-mockable:** R7-1 (route logic), R7-4 (send-call shape), R7-9 send-count (R7-9 notifications row is DB-truth), R7-10 (handler branches).

---

## Wave 0 Requirements

- [ ] `scripts/check-crons-email.ts` — TEST-DB integration (raw postgres-js + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',…,true)` + ROLLBACK/TRUNCATE) covering R7-2, R7-3, R7-5, R7-6, R7-8 (mirror `check-employee-portal.ts`)
- [ ] `scripts/check-crons-email.vitest.config.ts` — vitest config (mirror `check-employee-portal.vitest.config.ts`)
- [ ] `app/api/cron/reminders/route.test.ts` — R7-1 auth gate (401/200) unit test
- [ ] `lib/email/send.test.ts` — R7-4 dispatch + template-selection with stub Resend transport
- [ ] Framework install: **none** — vitest already installed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Railway worker hits `GET /api/cron/reminders` daily 08:00 UTC, returns 200 + counts | R7-7 | Needs operator Railway infra + real `CRON_SECRET`/deployed Vercel URL; per ADR-014 the live run is operator-executed secret-safe evidence, NOT a CI gate | Operator deploys the Railway Cron service; capture one run in Railway logs showing the endpoint hit at 08:00 UTC returning 200 with `{reviewReminders,ackReminders}` (mask secrets). |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (4 test files above)
- [ ] No watch-mode flags (all `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner binds task IDs)

**Approval:** pending
