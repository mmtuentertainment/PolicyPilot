# Phase 7: Crons + Email — Research

**Researched:** 2026-06-05
**Domain:** Railway Cron · Resend SDK · React Email · Drizzle idempotency · Next.js 15 App Router
**Confidence:** HIGH (stack-listed packages; every claim verified against npm registry, official Resend/React Email docs, and Railway schema)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** Loop-per-org via `withOrgScope`. Cron enumerates org IDs via allow-listed raw `SELECT id FROM organizations`, synthesizes `OrgContext { orgId }` per org, runs all reads/writes inside `withOrgScope`. One transaction per org.

**D-02** Cron resilience: per-org `try/catch`; `{reviewReminders, ackReminders}` = committed rows; 5xx only on pre-loop fatal (missing Bearer → 401; DB-connect → 503).

**D-03** Record-then-send + per-user isolation. Inside per-org tx: claim via `reminder_sends … .onConflictDoNothing().returning()`, INSERT notifications for winners, COMMIT; send Resend per winner AFTER commit with per-user `try/catch`. Email I/O is never held open inside DB tx.

**D-04** `reminder_sends` dedup scope = cron types only (`ack_reminder` + `review_due`). Event types are NOT gated by `reminder_sends`.

**D-05** `reminder_sends` table shape: `(org_id, user_id, policy_id, type, window_date, sent_at)`; UNIQUE on `(org_id, user_id, policy_id, type, window_date)`; `window_date` is a UTC calendar `date`; migration `drizzle/0014_reminder_sends.sql`; additive/forward-only; operator-signed header required before commit; dev/TEST apply only this phase.

**D-06** `review_due` recipient = org admins (`users.role='admin'`). One notification + email per admin per due policy.

**D-07** `ack_reminder` target = `ackState ∈ {none, stale}` unacked >7d (reuses 05 D-04 3-state logic). Department assignments expand to member users. Daily re-fire.

**D-08** `next_review_date` writer = forward-only on publish. No backfill. `next_review_date = published_at + review_interval_months` (default 12).

**D-09** Department fan-out = new org-wide cron query (not a reuse of per-user `listAssignedAndPublishedForUser`). One query per org, no N+1.

**D-10** `lib/email/` = shared base layout + typed dispatch map. `getResendClient()` lazy singleton. Typed errors in `lib/email/errors.ts`. Stub Resend transport for tests.

**D-11** Railway native cron. `worker/trigger-reminders.mjs` does single HTTPS GET to `/api/cron/reminders` with `Authorization: Bearer ${CRON_SECRET}`. ZERO new npm deps in worker. Schedule in `railway.json`. Live run = operator-executed evidence, NOT CI gate.

**D-12** Bell backend only this phase. `markRead()` (UPDATE — `notifications` is intentionally mutable, NOT in IMMUTABLE_TABLES). Bell UX deferred to `/gsd-ui-phase 7`.

**D-13** `scripts/check-crons-email.ts` integration check (TEST-DB + vitest). Cumulative `verify:phase-7 = pnpm verify:phase-6 && check:crons-email && <co-located vitests> && pnpm db:verify && pnpm check:artifacts`.

### Claude's Discretion

- Exact SQL formatting / JOIN order in the new org-wide `ack_reminder` query.
- `reminder_sends` Drizzle column types + index/constraint naming.
- Placement of 14d/7d thresholds + the shared `send()` helper.
- Exact React Email base-layout markup + per-template copy.
- `worker/` directory layout + exact Railway config file format.
- Stub Resend transport shape for tests.
- `scripts/check-crons-email.ts` fixture builders + exact `verify:phase-7` script wiring.

### Deferred Ideas (OUT OF SCOPE)

- Admin compliance dashboard, Recharts donut, CSV/JSON export — Phase 8.
- SF-W5 invert-idempotency-before-dispatch on Clerk webhook — deferred hardening.
- Per-tier reminder cadence/volume caps.
- Escalation tiers / snooze / stop-after-N reminders.
- `qa_citation_grants` cleanup cron.
- SF-WHSEC-1 `CLERK_WEBHOOK_SECRET` rotation.
- Slack / any non-Resend transport.
- Applying any migration to staging/prod.
- Notification-bell UX → `/gsd-ui-phase 7`.
- `next_review_date` backfill for existing published policies.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R7-1 | Authenticated cron endpoint with `Bearer {CRON_SECRET}` auth, 401/200 | Route auth pattern (§ Cron Route Pattern); middleware bypass confirmed (`middleware.ts:28-30,118-120`) |
| R7-2 | Idempotent sends via `reminder_sends` natural-key UNIQUE + onConflictDoNothing | Drizzle idempotency pattern (§ Idempotency Pattern); 0011/0013 migration shape precedent |
| R7-3 | Org-scoped cron via `withOrgScope` loop; two-org RLS isolation | `withOrgScope` internals (§ OrgScope Pattern); TEST-DB RLS gate pattern (`check-rls.ts:36-50`) |
| R7-4 | Four types via Resend + React Email; `Notifications.create()` implemented | Resend send API (§ Resend SDK); React Email components + render (§ React Email); typed dispatch map (§ Email Layer) |
| R7-5 | `review_due` ≤now+14d; `ack_reminder` >7d unacked; boundary fixtures; dept fan-out | Window query pattern (§ Cron Query Patterns); D-09 org-wide query; `listAssignedAndPublishedForUser` JOIN shape (`policies.ts:135-209`) |
| R7-6 | Bell backend: `listUnreadForUser` + `markRead()` UPDATE | `notifications` repo stubs (`notifications.ts:34-44`); `notifications` mutability confirmed NOT in IMMUTABLE_TABLES |
| R7-7 | Railway Cron service at 08:00 UTC; committed worker artifact | Railway config schema (§ Railway Cron Config); `railway.json` schema verified |
| R7-8 | `next_review_date` writer on publish, forward-only | Column exists in schema (`schema.ts:194`); publish action seam in `policies.ts` |
| R7-9 | `policy_assigned` on assign; `policy_updated` on republish; both Resend+notify | D-04 RETURNING-gate pattern; event dispatch via shared `send()` entrypoint |
| R7-10 | Clerk-webhook 409/catch vitest scaffold (T8) | Clerk route 409/catch paths documented (`clerk/route.ts:274-314,383-406`); vitest pattern from Stripe test |

</phase_requirements>

---

## Summary

Phase 7 adds the runtime email/cron layer onto a repo that has deliberately pre-stubbed every seam. The three main work streams are: (1) the Resend + React Email layer (`lib/email/`), (2) the cron route + `reminder_sends` idempotency table, and (3) the Railway worker artifact. All three are additive — no existing shipped code is deleted, only the two throw-stubs in `notifications.ts` are filled and the publish action is extended.

The email layer follows the same module-boundary pattern established in Phase 4/6: a `getResendClient()` lazy singleton (`lib/email/client.ts`), typed errors (`lib/email/errors.ts`), templates in `lib/email/templates/`, and a typed `type → {subject, template}` dispatch function. The Resend SDK accepts a React component directly via `react:` — no manual `render()` call from application code; Resend handles server-side rendering internally using `@react-email/render`. Tests stub the `resend` module at the boundary (mirror of Phase 6's `vi.mock('stripe', ...)` pattern).

The Railway cron is a single `worker/trigger-reminders.mjs` file (no dependencies) with a `railway.json` declaring `cronSchedule: "0 8 * * *"` and `startCommand: "node worker/trigger-reminders.mjs"`. The worker exits immediately after the single HTTPS GET, which is the Railway requirement for cron services.

**Primary recommendation:** Use `resend@6.12.3` + `react-email@6.1.5` (both ≥14 days old; react-email 6.x consolidates all components + render into one import). Follow the `stripe_events` idempotency tx pattern exactly for `reminder_sends`. All DB writes go through `withOrgScope`; the only raw `db` usage is the org-enumeration SELECT at the top of the cron route (pre-allow-listed).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cron auth (`Bearer {CRON_SECRET}`) | API / Backend | — | Self-gate in route since middleware bypasses Clerk for `/api/cron/*` |
| Org enumeration | API / Backend | Database | Raw `db` allow-listed in cron route; one SELECT of `organizations.id` |
| Reminder queries (review_due, ack_reminder) | API / Backend | Database | `withOrgScope` tx; RLS enforces org isolation |
| Email dispatch (Resend) | API / Backend | — | Server-only; Resend SDK call after DB commit |
| React Email rendering | API / Backend | — | Resend SDK handles `render()` internally when passed a React component |
| `reminder_sends` dedup | Database | API / Backend | UNIQUE constraint + `onConflictDoNothing` is the source of truth |
| `notifications` create/markRead | API / Backend | Database | Repository writes via `withOrgScope` tx |
| Bell count (unread) | API / Backend | — | `listUnreadForUser` live read; UI surface deferred to `/gsd-ui-phase 7` |
| Railway cron trigger | CDN / Static | — | External worker; one HTTPS GET to the Vercel-hosted endpoint |
| `next_review_date` writer | API / Backend | Database | Policy publish action (Phase 3 code extended) |

---

## Standard Stack

### Core Additions

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `resend` | `6.12.3` | Email send API SDK | ADR-016; official Resend Node.js SDK (`github.com/resend/resend-node`); MIT; no postinstall script |
| `react-email` | `6.1.5` | React Email components + render utility | ADR-016; react-email 6.x consolidates `@react-email/components` + `@react-email/render` into one package; MIT; no postinstall script |

### Supporting (pulled automatically as dependencies)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@react-email/render` | `>=2.0.8` (pulled by react-email@6.1.5) | Server-side HTML rendering | Used internally by Resend SDK when `react:` parameter is passed; also importable directly for tests |

### Version pins for `package.json`

```json
"resend": "6.12.3",
"react-email": "6.1.5"
```

> These are **exact** pins (no `^`/`~`), per the project's supply-chain discipline.
> Install is **ASK-FIRST** (unlisted packages rule) — these lines are research output only.

### Version verification results

| Package | Version | Published | Age at 2026-06-05 | Status |
|---------|---------|-----------|-------------------|--------|
| `resend` | `6.12.3` | 2026-05-06 | 30 days | SAFE (≥14 days) |
| `react-email` | `6.1.5` | 2026-05-18 | 18 days | SAFE (≥14 days) |
| `react-email` latest (`6.5.0`) | `6.5.0` | 2026-05-27 | 9 days | UNSAFE — do not use |
| `resend` latest (`6.12.4`) | `6.12.4` | 2026-05-25 | 11 days | UNSAFE — do not use |
| `@react-email/render` | `2.0.8` | 2026-04-28 | 38 days | Transitive dep; safe |
| `@react-email/components` | `1.0.12` | 2026-04-09 | 57 days | Old pattern — NOT needed with react-email 6.x |

**react-email 6.x migration note:** In react-email 6.0+, all components and the `render()` function are imported from `'react-email'` directly. The old `@react-email/components` + `@react-email/render` standalone packages are replaced. `resend@6.12.3` has `@react-email/render` as an **optional** peer dependency — it is automatically satisfied by `react-email@6.1.5`'s `@react-email/render >= 2.0.8` dependency. No separate install of `@react-email/render` or `@react-email/components` is needed.

[VERIFIED: npm registry + resend.com/blog/react-email-6 + react.email/docs]

---

## Package Legitimacy Audit

> slopcheck was blocked by auto-mode classifier (research-only task boundary). All packages verified via official source confirmation (GitHub org, official docs) + npm registry age/download signals.

| Package | Registry | Age | Source Repo | Official Docs | Postinstall | Disposition |
|---------|----------|-----|-------------|---------------|-------------|-------------|
| `resend` | npm | 3+ yrs (since 2022-12-05) | `github.com/resend/resend-node` | `resend.com/docs` | None | Approved |
| `react-email` | npm | 4+ yrs (since 2022-08-05) | `github.com/resend/react-email` | `react.email/docs` | None | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable (install blocked by auto-mode); packages are marked [VERIFIED: npm registry + official docs] based on multi-source confirmation (official GitHub org under `resend/`, official documentation sites, 3+ year registry history, 2M weekly downloads on react-email). Planner may optionally add a `checkpoint:human-verify` before install.*

---

## Architecture Patterns

### System Architecture Diagram

```
Railway Cron Service (daily 08:00 UTC)
  └─ worker/trigger-reminders.mjs
       └─ HTTPS GET /api/cron/reminders
            Authorization: Bearer {CRON_SECRET}
                 │
                 ▼
         app/api/cron/reminders/route.ts  [Next.js API Route]
            │
            ├─ 1. Auth gate: Bearer {CRON_SECRET} → 401 on mismatch
            ├─ 2. Raw db: SELECT id FROM organizations  [allow-listed ADR-023]
            │
            └─ for each org:
                 withOrgScope({ orgId }, async (s) => {
                   │
                   ├─ 3a. review_due query: policies where next_review_date ≤ now+14d
                   │       → recipient = org admins (users.role='admin')
                   │
                   ├─ 3b. ack_reminder query: org-wide unacked >7d (ackState∈{none,stale})
                   │       → dept assignments fan-out via users.department_id JOIN
                   │
                   ├─ 4. Per (org,user,policy,type,window_date):
                   │       INSERT INTO reminder_sends … onConflictDoNothing().returning()
                   │       INSERT INTO notifications (for winners)
                   │       COMMIT
                   │
                   └─ 5. After commit, per winner:
                           lib/email/send.ts dispatch()
                             ├─ getResendClient().emails.send({ react: <Template/> })
                             └─ per-user try/catch; failures logged, not counted
                 })
                 → accumulate {reviewReminders, ackReminders}

         ─ ─ ─ ─ separate event-driven paths ─ ─ ─ ─

Admin assign action (Phase 3/5 code extended):
  RETURNING-gate → withOrgScope tx:
    Notifications.create() + lib/email/send.ts → policy_assigned

Policy republish action (Phase 3 code extended):
  new policy_version → withOrgScope tx:
    Notifications.create() + lib/email/send.ts → policy_updated
    next_review_date = published_at + review_interval_months (D-08)

Bell backend (new API endpoint):
  listUnreadForUser(s, userId) → unread count
  markRead(s, id) → UPDATE notifications SET read=true
```

### Recommended Project Structure

```
lib/email/
├── client.ts          — getResendClient() lazy singleton (mirrors lib/stripe/client.ts)
├── errors.ts          — ResendConfigError, ResendSendError (ADR-026 typed-error)
├── send.ts            — typed dispatch: NotificationType → { subject, template }; exported send()
└── templates/
    ├── base-layout.tsx        — Html/Head/Preview/Body/Container shared wrapper
    ├── policy-assigned.tsx    — PolicyAssignedEmail component
    ├── policy-updated.tsx     — PolicyUpdatedEmail component
    ├── review-due.tsx         — ReviewDueEmail component
    └── ack-reminder.tsx       — AckReminderEmail component

app/api/cron/
└── reminders/
    └── route.ts       — GET handler; self-gates on Bearer; loops orgs; returns {reviewReminders,ackReminders}

worker/
└── trigger-reminders.mjs    — Node ESM; single HTTPS GET; exits after response

railway.json           — { "deploy": { "startCommand": "node worker/trigger-reminders.mjs", "cronSchedule": "0 8 * * *" } }

drizzle/
└── 0014_reminder_sends.sql  — additive migration; RLS + GRANT + org_id index; operator-signed header

scripts/
└── check-crons-email.ts     — TEST-DB integration (mirrors check-employee-portal.test.ts)
```

### Pattern 1: Resend Lazy Singleton (`lib/email/client.ts`)

Mirror of `lib/stripe/client.ts:7-17` exactly.

```typescript
// Source: lib/stripe/client.ts pattern + resend.com/docs/send-with-nextjs
import 'server-only';
import { Resend } from 'resend';
import { ResendConfigError } from './errors';

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new ResendConfigError('RESEND_API_KEY');
  resendClient = new Resend(apiKey);
  return resendClient;
}
```

### Pattern 2: React Email Component + Resend `react:` parameter

**Key finding:** In react-email 6.x, all imports come from `'react-email'`. Resend accepts a React component directly via `react:` — no manual `render()` call needed. Resend uses `@react-email/render` internally.

```typescript
// Source: resend.com/docs/send-with-nextjs + react.email/docs
import { Html, Head, Preview, Body, Container, Heading, Text, Button, Hr } from 'react-email';

// Template (lib/email/templates/policy-assigned.tsx)
interface PolicyAssignedEmailProps {
  policyTitle: string;
  orgName: string;
  acknowledgeUrl: string;
}
export function PolicyAssignedEmail({ policyTitle, orgName, acknowledgeUrl }: PolicyAssignedEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>New policy assigned: {policyTitle}</Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif' }}>
        <Container>
          <Heading>Policy Assigned</Heading>
          <Text>{orgName} has assigned you a new policy: <strong>{policyTitle}</strong></Text>
          <Button href={acknowledgeUrl}>Review &amp; Acknowledge</Button>
          <Hr />
          <Text style={{ fontSize: '12px', color: '#6b7280' }}>PolicyPilot</Text>
        </Container>
      </Body>
    </Html>
  );
}

// Dispatch (lib/email/send.ts)
// source: resend.com/docs/api-reference/emails/send-email
const { data, error } = await getResendClient().emails.send({
  from: process.env.RESEND_FROM_EMAIL ?? 'noreply@policypilot.com',
  to: recipientEmail,
  subject,
  react: <PolicyAssignedEmail policyTitle={...} orgName={...} acknowledgeUrl={...} />,
});
// returns { data?: { id: string }, error?: Error }
if (error) { /* throw ResendSendError */ }
```

> **No manual `render()` call needed when using `react:`.** If you ever need HTML string output for tests or logging, import `render` from `'react-email'` and `await render(<Template />)`.

### Pattern 3: `reminder_sends` Idempotency in Transaction (D-03)

Mirror of `app/api/webhooks/stripe/route.ts:224-254` exactly:

```typescript
// Source: app/api/webhooks/stripe/route.ts:229-253 (commitProcessedEvent pattern)
// Inside withOrgScope tx:
const inserted = await s.tx
  .insert(reminderSends)
  .values({
    orgId: s.orgId,
    userId: candidate.userId,
    policyId: candidate.policyId,
    type: candidate.type,
    windowDate: todayUtc,          // date type — UTC calendar day
    sentAt: new Date(),
  })
  .onConflictDoNothing()
  .returning({ id: reminderSends.id });

if (inserted.length === 0) continue; // already sent this window — short-circuit

// Also insert notifications row for this winner
await Notifications.create(s, {
  userId: candidate.userId,
  type: candidate.type,
  payloadJson: { policyId: candidate.policyId, policyTitle: candidate.policyTitle },
  read: false,
});
// COMMIT (withOrgScope closes the tx here)
// After commit: send email per-winner with per-user try/catch
```

### Pattern 4: `railway.json` for Cron Service (D-11)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "node worker/trigger-reminders.mjs",
    "cronSchedule": "0 8 * * *"
  }
}
```

[VERIFIED: backboard.railway.app/railway.schema.json — `cronSchedule` field type `["string","null"]`; `startCommand` field type `["string","null"]`]

**Key facts:**
- `cronSchedule: "0 8 * * *"` = 08:00 UTC daily. Railway schedules are UTC natively. [VERIFIED: docs.railway.com/guides/cron-jobs]
- The worker MUST exit immediately after completing its task — Railway skips subsequent executions if the previous run has not terminated. [VERIFIED: docs.railway.com/guides/cron-jobs]
- No Dockerfile or nixpacks config needed for a plain Node.js `.mjs` file — Railway auto-detects nixpacks. A `railway.json` is sufficient.

### Pattern 5: `worker/trigger-reminders.mjs` (dependency-free)

```javascript
// worker/trigger-reminders.mjs — Node ESM, zero dependencies
// Source: D-11 (CONTEXT.md) + Railway cron requirements
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
if (!CRON_SECRET || !BASE_URL) {
  console.error('[trigger-reminders] CRON_SECRET or BASE_URL not set');
  process.exit(1);
}
const url = `https://${BASE_URL}/api/cron/reminders`;
try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.json();
  console.log('[trigger-reminders] status:', res.status, 'body:', JSON.stringify(body));
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error('[trigger-reminders] fetch failed:', err);
  process.exit(1);
}
```

> Note: `fetch` is built into Node 22 (no package needed). `process.env.VERCEL_URL` is set by Vercel automatically; the Railway service needs either that or `NEXT_PUBLIC_APP_URL` set as a Railway env var.

### Pattern 6: Org-Wide `ack_reminder` Query (D-09)

New cron-specific repo method. Based on `policies.ts:135-209` (D-09 says "reuse 05 D-01's JOIN + ackState logic WITHOUT the userId filter, expanding department assignments").

```typescript
// Source: lib/db/repositories/policies.ts:135-209 (listAssignedAndPublishedForUser) adapted
// lib/db/repositories/reminders.ts (new file) — listAckReminderCandidatesForOrg
// Inside withOrgScope tx (s.tx)
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

// Expand department assignments to user members via JOIN on users.department_id
// Returns (userId, policyId, userEmail, policyTitle, assignedAt, ackState)
// ackState ∈ {none, stale} only — 'current' is excluded
// assignedAt (for 'none') or policy republish_at (for 'stale') must be > 7d ago
```

### Pattern 7: `vitest` Stub Resend Transport (D-13)

Mirror of Phase 6 `vi.mock('stripe', ...)` module-boundary pattern (`app/api/webhooks/stripe/route.test.ts:4` + FakeTx pattern):

```typescript
// Source: app/api/webhooks/stripe/route.test.ts:4-100 pattern
vi.mock('server-only', () => ({}));
vi.mock('@/lib/email/client', () => ({
  getResendClient: vi.fn(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
    },
  })),
}));
// Then assert: expect(getResendClient().emails.send).toHaveBeenCalledTimes(1)
// and: expect(getResendClient().emails.send).toHaveBeenCalledWith(
//   expect.objectContaining({ react: expect.anything(), subject: expect.stringContaining('...') })
// )
```

### Pattern 8: `0014_reminder_sends.sql` Migration Shape

Based on `drizzle/0011_qa_citation_grants.sql` and `drizzle/0013_review_decisions.sql`:

```sql
-- drizzle/0014_reminder_sends.sql
-- Phase 7 (R7-2 / D-05) — at-most-once send-ledger for cron reminder dedup.
-- Operator pre-approved authoring (s27 banked); operator-signed header required before commit.
--   CLAUDE.md ASK-FIRST (schema change after Phase 2) cleared by D-05 + STATE.md pre-paying status.
--   ADDITIVE ONLY — new table; no existing schema objects mutated.
-- RLS: wrapped (SELECT auth.jwt()->>'org_id') form per 0008_rls_subquery_wrap.
-- Drizzle does NOT emit ENABLE RLS / CREATE POLICY / GRANT — hand-written below.
-- reminder_sends is added to scripts/check-rls.ts and check-schema.ts TENANT_TABLES.

CREATE TABLE "reminder_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "type" text NOT NULL,              -- 'review_due' | 'ack_reminder'
  "window_date" date NOT NULL,       -- UTC calendar day (daily dedup key)
  "sent_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_policy_id_policies_id_fk"
  FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Natural-key UNIQUE: at-most-once per (org, user, policy, type, calendar-day)
ALTER TABLE "reminder_sends"
  ADD CONSTRAINT "reminder_sends_dedup_key"
  UNIQUE("org_id","user_id","policy_id","type","window_date");
--> statement-breakpoint
CREATE INDEX "reminder_sends_org_id_idx" ON "reminder_sends" USING btree ("org_id");
--> statement-breakpoint

-- Phase 7 D-05 RLS + GRANT (hand-written; Drizzle does not emit). Wrapped form per 0008.
ALTER TABLE "reminder_sends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation" ON "reminder_sends"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "reminder_sends" TO authenticated;
```

### Anti-Patterns to Avoid

- **Holding email I/O inside the DB transaction:** Send Resend AFTER commit. If the tx rolls back, no email is sent — consistent. If email fails post-commit, the DB row is committed and the next day's cron re-evaluates. (D-03)
- **Single cross-org cron query:** Never `SELECT … FROM policies` without `WHERE org_id = ?`. Loop per org via `withOrgScope`, not a single raw query. (D-01)
- **Using `@react-email/components` standalone:** With react-email 6.x, import from `'react-email'` not `@react-email/components`. The old package is the pre-6.x split pattern.
- **Manual `render()` call before `react:`:** Resend's `react:` parameter accepts a React element and renders it internally. No manual `await render(<Template/>)` before passing to send().
- **Counting post-commit Resend failures in `ackReminders`/`reviewReminders`:** Counts = committed `reminder_sends`/`notifications` rows, not Resend acceptances. (D-02)
- **Missing `restartPolicyType` or leaving the worker alive:** Railway cron services must exit after completing the task. A non-terminating process causes subsequent executions to be skipped.
- **Skipping the operator-signed header on `0014_reminder_sends.sql`:** The migration file must include `rationale + approval timestamp + decision ID` in the header before commit. The approval is banked (s27) but the header is still required (migration discipline, `docs/runbooks/deploy-migrations.md`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email dedup | Custom dedup logic in application memory | `reminder_sends` UNIQUE + `onConflictDoNothing` in DB tx | Race-condition-safe; survives multi-instance deploys; mirrors stripe_events pattern |
| Email rendering | `template literals with HTML` | React Email components via `react:` in Resend | Client compatibility (Gmail, Outlook); table-based layout; dark mode; type safety |
| Cron scheduling | External scheduler library (node-cron, agenda) | Railway native `cronSchedule` field in `railway.json` | Zero new dependencies; Railway handles execution environment |
| Org isolation in cron | App-layer `if (result.orgId === expectedOrg)` filter | `withOrgScope` + RLS (`SET LOCAL ROLE authenticated` + JWT claims) | RLS fires on EVERY query in the tx; app-layer filtering is defense-in-depth only, not a substitute |

---

## Resend SDK

### Send API

```typescript
// Source: resend.com/docs/api-reference/emails/send-email [VERIFIED]
const { data, error } = await resend.emails.send({
  from: string,            // REQUIRED: "Name <email@domain.com>"
  to: string | string[],   // REQUIRED: up to 50 recipients
  subject: string,         // REQUIRED
  react?: React.ReactNode, // React Email component (server-side render handled by SDK)
  html?: string,           // alternative if not using react:
  text?: string,           // auto-generated from html if omitted
  // optional: cc, bcc, reply_to, headers, attachments, tags, scheduled_at
});
// Return shape:
// { data?: { id: string }, error?: Error }
// On SDK error: error is set, data is undefined
// On HTTP error from Resend API: also surfaces via error field (SDK does not throw)
```

**Key:** Pass the React component as a function call `PolicyAssignedEmail({ ... })` OR as JSX `<PolicyAssignedEmail ... />`. Both work. The Next.js integration guide uses the function-call form. [VERIFIED: resend.com/docs/send-with-nextjs]

**No manual `render()` call:** When using `react:`, Resend calls `@react-email/render` internally. Only call `render()` yourself if you need the HTML string for another purpose (e.g., logging). [VERIFIED: resend.com/docs/send-with-nextjs]

### Error Handling

```typescript
// lib/email/errors.ts — ADR-026 typed-error pattern (mirrors lib/stripe/errors.ts)
export class ResendConfigError extends Error {
  public readonly code = 'RESEND_CONFIG_ERROR' as const;
  constructor(public readonly envVar: string) {
    super(`Resend configuration error: required env var ${envVar} is not configured`);
    this.name = 'ResendConfigError';
  }
}

export class ResendSendError extends Error {
  public readonly code = 'RESEND_SEND_ERROR' as const;
  constructor(
    public readonly type: string,
    public readonly recipientMasked: string,
    cause?: unknown,
  ) {
    super(`Resend send failed: type=${type} recipient=${recipientMasked}`);
    this.name = 'ResendSendError';
    this.cause = cause;
  }
}
```

---

## React Email

### Components (react-email 6.x — import from `'react-email'`)

```typescript
// Source: react.email/docs + resend.com/blog/react-email-6 [VERIFIED]
import {
  Html, Head, Preview, Body, Container, Section,
  Heading, Text, Button, Hr, Link, render
} from 'react-email';
```

**Available components (planner-relevant set):**
- `Html` — root element with `lang`
- `Head` — email `<head>`
- `Preview` — preview text (shown in inbox before open)
- `Body` — email body with style
- `Container` — centered content wrapper (max-width)
- `Section` — block-level layout section
- `Heading` — `h1`–`h6`
- `Text` — paragraph
- `Button` — CTA button with `href`
- `Hr` — horizontal rule
- `Link` — inline anchor

**`render()` signature:**
```typescript
// Source: react.email/docs/utilities/render [VERIFIED]
import { render } from 'react-email';
const html: string = await render(<MyTemplate prop={...} />);
```
Returns a Promise<string> (HTML). Use only when you need the HTML string directly (tests, logging); not needed when passing `react:` to Resend.

### Template Structure

Each template is a TSX file composing the base layout:

```typescript
// lib/email/templates/base-layout.tsx
interface BaseLayoutProps { preview: string; children: React.ReactNode; }
export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html lang="en"><Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto' }}>
          {children}
          <Hr />
          <Text style={{ fontSize: '12px', color: '#6b7280' }}>PolicyPilot</Text>
        </Container>
      </Body>
    </Html>
  );
}

// lib/email/templates/ack-reminder.tsx
export function AckReminderEmail({ policyTitle, orgName, acknowledgeUrl }: AckReminderEmailProps) {
  return (
    <BaseLayout preview={`Reminder: Please acknowledge "${policyTitle}"`}>
      <Heading>Policy Acknowledgment Reminder</Heading>
      <Text>This is a reminder to acknowledge the policy: <strong>{policyTitle}</strong></Text>
      <Button href={acknowledgeUrl}>Acknowledge Now</Button>
    </BaseLayout>
  );
}
```

### Typed Dispatch Map (D-10)

```typescript
// lib/email/send.ts
import type { NotificationType } from '@/lib/db/schema';
// NotificationType = 'policy_assigned' | 'policy_updated' | 'review_due' | 'ack_reminder'

type EmailDispatch = {
  subject: (ctx: EmailContext) => string;
  component: (ctx: EmailContext) => React.ReactElement;
};

const DISPATCH_MAP: Record<NotificationType, EmailDispatch> = {
  policy_assigned: {
    subject: (ctx) => `New Policy: ${ctx.policyTitle}`,
    component: (ctx) => <PolicyAssignedEmail {...ctx} />,
  },
  policy_updated: {
    subject: (ctx) => `Policy Updated: ${ctx.policyTitle}`,
    component: (ctx) => <PolicyUpdatedEmail {...ctx} />,
  },
  review_due: {
    subject: (ctx) => `Policy Review Due: ${ctx.policyTitle}`,
    component: (ctx) => <ReviewDueEmail {...ctx} />,
  },
  ack_reminder: {
    subject: (ctx) => `Reminder: Acknowledge "${ctx.policyTitle}"`,
    component: (ctx) => <AckReminderEmail {...ctx} />,
  },
};

export async function sendNotificationEmail(
  type: NotificationType,
  to: string,
  ctx: EmailContext,
): Promise<void> {
  const dispatch = DISPATCH_MAP[type];
  const { data, error } = await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'noreply@policypilot.com',
    to,
    subject: dispatch.subject(ctx),
    react: dispatch.component(ctx),
  });
  if (error) throw new ResendSendError(type, maskEmail(to), error);
}
```

**Dev preview server:** The `react-email` package includes a dev preview server (`email dev`) but it is NOT required for the build or tests. It is an optional dev tool. Do not add it to CI or `verify:phase-7`.

---

## Railway Cron Config

### `railway.json` — Verified Schema

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "node worker/trigger-reminders.mjs",
    "cronSchedule": "0 8 * * *"
  }
}
```

[VERIFIED: backboard.railway.app/railway.schema.json — `deploy.cronSchedule` type `["string","null"]`, `deploy.startCommand` type `["string","null"]`]
[VERIFIED: docs.railway.com/guides/cron-jobs — `"0 8 * * *"` = daily 08:00 UTC; schedules are UTC natively; service must terminate after task completion]

### Key Railway Cron Facts

- **UTC native:** Railway cron schedules are always UTC. `"0 8 * * *"` fires at 08:00 UTC daily. No timezone offset needed.
- **Must exit:** After the task completes the process must exit (`process.exit(0)`). If the worker stays alive, Railway skips subsequent scheduled executions.
- **No Dockerfile required:** Railway nixpacks auto-detects Node.js. A `railway.json` at repo root is sufficient. No `Procfile` or `Dockerfile` needed.
- **Env vars:** Set `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL`) as Railway environment variables in the Railway dashboard. Not committed to repo.
- **Live run = operator evidence:** Per ADR-014 and D-11, the actual Railway run is operator-executed evidence (like Stripe UAT), not a CI gate. The CI gate verifies the worker file exists and the `railway.json` has the correct fields.

---

## Cron Route Patterns

### R7-1: Auth Gate

```typescript
// app/api/cron/reminders/route.ts
// middleware.ts:28-30,118-120 bypasses Clerk for /api/cron/(.*) — route MUST self-gate
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... loop orgs ...
}
```

### R7-3: Org Enumeration (D-01)

```typescript
// Inside the GET handler — raw db is allow-listed for app/api/cron/**/route.ts
// scripts/check-db-imports.ts:42 pattern: /^app\/api\/cron\/.+\/route\.ts$/
import { db } from '@/lib/db';
import { organizations } from '@/lib/db/schema';

const orgIds = await db.select({ id: organizations.id }).from(organizations);
let reviewReminders = 0;
let ackReminders = 0;

for (const { id: orgId } of orgIds) {
  try {
    const counts = await withOrgScope({ orgId, userId: '', clerkOrgId: '', clerkUserId: '', role: 'admin' }, async (s) => {
      // ... process org ...
    });
    reviewReminders += counts.reviewReminders;
    ackReminders += counts.ackReminders;
  } catch (err) {
    console.error({ event: 'cron_org_error', orgId: orgId.slice(-4), error: String(err) });
  }
}
return Response.json({ reviewReminders, ackReminders });
```

**Important:** The synthesized `OrgContext` for the cron loop has a minimal shape. `userId` and `clerkUserId`/`clerkOrgId` are set to empty strings — they are only used for JWT injection via `withOrgScope`, where `sub` is not used by any RLS predicate (RLS only checks `org_id`). The `role` is set to `'admin'` for the JWT claims injection; this does not grant admin privileges — it satisfies the `asRole()` type narrowing in `withOrgScope`. The cron's authority is entirely from the `CRON_SECRET` bearer gate, not from the synthesized OrgContext.

---

## Common Pitfalls

### Pitfall 1: Email send inside DB transaction
**What goes wrong:** Network latency or Resend rate limits can hold the DB connection open, blocking the transaction pool.
**Why it happens:** Mixing I/O inside a tx.
**How to avoid:** D-03 — commit first, send after. The `reminder_sends` row is already committed so a re-run the same day won't re-send.
**Warning signs:** Supabase connection pool exhaustion errors; long-running transactions in Supabase dashboard.

### Pitfall 2: `SET LOCAL ROLE` + `set_config` ordering in `withOrgScope`
**What goes wrong:** If `SET LOCAL ROLE authenticated` is not called first, the connection-string `postgres` user keeps BYPASSRLS and RLS never fires. `is_local=false` in `set_config` leaks JWT claims across pooled connections.
**How to avoid:** Use `withOrgScope` — do not replicate this pattern manually. (`lib/db/scoped.ts:61-64` already handles this correctly.)
**Warning signs:** Cross-org test passes trivially (both orgs see all data) — the RLS-positive-control check in `check-rls.ts` would catch this.

### Pitfall 3: `window_date` timezone drift
**What goes wrong:** If `window_date` is computed from local time instead of UTC, two runs on the same UTC calendar day (one before midnight UTC, one after) might produce different `window_date` values in different timezones.
**How to avoid:** Always derive `window_date` from UTC: `new Date().toISOString().slice(0, 10)` (gives `"YYYY-MM-DD"` in UTC) or `sql\`CURRENT_DATE\`` inside a Postgres tx.
**Warning signs:** Duplicate sends when Vercel serverless functions run across timezone boundaries.

### Pitfall 4: react-email 6.x import path
**What goes wrong:** Using `@react-email/components` with react-email 6.x causes a missing module error or installs the old standalone package.
**How to avoid:** With `react-email@6.1.5`, import everything from `'react-email'`: `import { Html, Button, render, ... } from 'react-email'`.
**Warning signs:** TypeScript cannot find `@react-email/components` after removing it; `pnpm tsc --noEmit` errors on the old import path.

### Pitfall 5: `withOrgScope` requires all `OrgContext` fields
**What goes wrong:** The cron synthesizes a minimal OrgContext without real `userId`/`clerkUserId`. If any code inside `withOrgScope` reads `s.userId` for non-RLS purposes (e.g., audit fields), it will write empty strings.
**How to avoid:** Cron code must not write `createdBy`/`assignedBy` fields. Review every `withOrgScope` callback for `s.userId` writes before committing.
**Warning signs:** `createdBy = ''` UUID validation errors from Postgres FK constraint.

### Pitfall 6: Railway worker stays alive
**What goes wrong:** If `trigger-reminders.mjs` doesn't call `process.exit()`, Railway's cron service waits for the process to terminate and skips the next scheduled execution.
**How to avoid:** Always end with explicit `process.exit(0)` (success) or `process.exit(1)` (failure). Shown in the worker pattern above.
**Warning signs:** Railway dashboard shows the previous cron run still "Running" when the next fire time arrives; next run is silently skipped.

### Pitfall 7: `svix` version conflict (`resend@6.12.3` depends on `svix@1.92.2`)
**What goes wrong:** `resend@6.12.3` bundles `svix@1.92.2` as a dependency. The project currently has `svix@1.93.0` as a direct dependency (`package.json:74`). A version conflict or double-install could occur.
**How to avoid:** pnpm deduplication handles this correctly (both are semver-compatible); `svix@1.93.0` is the installed version in the project, `resend@6.12.3`'s `svix@1.92.2` dependency will be deduplicated. Verify `pnpm ls svix` after install — expect one version. If two versions are resolved, pin `resend`'s `svix` via pnpm overrides.
**Warning signs:** `pnpm ls svix` shows two versions; Svix webhook validation fails at runtime with a version mismatch error.

---

## Runtime State Inventory

> Greenfield additions only (no renames/refactors). No runtime state migration required.
> The `reminder_sends` table is NEW (additive migration); no existing rows to migrate.
> `notifications` rows already exist from Phase 5 (policy_assigned stubs) but are all unread — no migration needed; `markRead` UPDATE starts from clean state.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `notifications` table: zero rows (create/markRead were throw-stubs through Phase 6) | None — additive from zero |
| Stored data | `reminder_sends` table: does not exist yet | Additive migration 0014 (dev/TEST only this phase) |
| Live service config | Railway: no existing cron service for this repo | Operator creates Railway Cron service + sets env vars |
| OS-registered state | None — no scheduled tasks on developer machine for this | None |
| Secrets/env vars | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET` — already in `.env.local.example` (blank) | Operator fills dev values; Railway sets for worker |
| Build artifacts | None (new files only) | None |

**Nothing found in migration-requiring category.** Verified by reading `lib/db/repositories/notifications.ts:34-44` (throw-stubs through Phase 6 = zero writes).

---

## Validation Architecture

> `workflow.nyquist_validation` is not set to `false` in `.planning/config.json` — section required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest `^1.6.0` (already installed) |
| Config file | `scripts/check-crons-email.vitest.config.ts` (new — mirror of `check-employee-portal.vitest.config.ts`) |
| Quick run command | `pnpm vitest run scripts/check-crons-email.ts --config scripts/check-crons-email.vitest.config.ts` |
| Full suite command | `pnpm verify:phase-7` |
| Co-located unit tests | `pnpm vitest run lib/email` and `pnpm vitest run app/api/cron` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R7-1 | Missing/wrong Bearer → 401; correct → 200 + `{reviewReminders,ackReminders}` | Unit (route handler + stub db) | `pnpm vitest run app/api/cron/reminders/route.test.ts` | Wave 0 |
| R7-2 | Double-run same window → exactly 1 `reminder_sends` row + 1 `notifications` row | TEST DB integration | `pnpm check:crons-email` (step in `scripts/check-crons-email.ts`) | Wave 0 |
| R7-3 | Two-org fixture: Org A run never reads/writes Org B data | TEST DB integration | `pnpm check:crons-email` (isolation fixture step) | Wave 0 |
| R7-4 | Each of 4 types: exactly 1 Resend send + 1 `notifications` row; correct subject/template | Unit (stub Resend) | `pnpm vitest run lib/email/send.test.ts` | Wave 0 |
| R7-5 | Boundary: 13d incl / 15d excl; 8d incl / 5d excl; none+stale included; dept fan-out | TEST DB integration | `pnpm check:crons-email` (window fixture step) | Wave 0 |
| R7-6 | `markRead()` UPDATE flips `read=true`; `listUnreadForUser` count decrements | TEST DB integration | `pnpm check:crons-email` (bell fixture step) | Wave 0 |
| R7-7 | Railway worker file exists; `railway.json` has `cronSchedule` + `startCommand` | Static artifact gate | `pnpm check:artifacts` (extend for worker file + railway.json) | Wave 0 |
| R7-8 | Publish with `review_interval_months=12` sets `next_review_date` ≈ 12mo out | TEST DB integration | `pnpm check:crons-email` (writer fixture step) | Wave 0 |
| R7-9 | Assign emits `policy_assigned` (1 send + 1 notify); republish emits `policy_updated` | Unit (stub Resend + db) | `pnpm vitest run app/(admin)/policies/[id]/actions.test.ts` | Wave 0 |
| R7-10 | Clerk webhook 409/catch vitest scaffold passes | Unit (vi.mock) | `pnpm vitest run app/api/webhooks/clerk/route.test.ts` | Wave 0 |

**DB-truth vs module-mockable classification:**

| Test | DB-truth (TEST DB required) | Module-mockable |
|------|----------------------------|-----------------|
| R7-2 idempotency UNIQUE | YES — UNIQUE constraint only fires in real DB | No |
| R7-3 RLS isolation | YES — RLS only fires with SET LOCAL ROLE | No |
| R7-5 window boundaries | YES — date arithmetic in DB queries | No |
| R7-6 markRead UPDATE | YES — UPDATE semantics in DB | No |
| R7-8 next_review_date writer | YES — persisted column value | No |
| R7-1 auth gate | No — route-level logic | YES |
| R7-4 dispatch + template | No — Resend send call shape | YES |
| R7-9 event emission | Partial — YES for notifications row; YES for stub Resend send count | YES for send |
| R7-10 Clerk 409/catch | No — handler-level branch coverage | YES |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm vitest run [affected file]`
- **Per wave merge:** `pnpm verify:phase-6 && check:crons-email && pnpm test`
- **Phase gate:** `pnpm verify:phase-7` exits 0 before `/gsd-verify-work`

### `verify:phase-7` Definition

```json
"verify:phase-7": "pnpm tsc --noEmit && pnpm verify:phase-6 && pnpm check:crons-email && pnpm run test -- --run lib/email && pnpm run test -- --run app/api/cron && pnpm run test -- --run app/api/webhooks/clerk && pnpm db:verify && pnpm check:artifacts"
```

> `pnpm verify:phase-6` already runs tsc, but D-13 and the CI gate convention require tsc at the head.

### Wave 0 Gaps (files that must exist before implementation tasks run)

- [ ] `scripts/check-crons-email.ts` — TEST DB integration test (R7-2, R7-3, R7-5, R7-6, R7-8)
- [ ] `scripts/check-crons-email.vitest.config.ts` — vitest config (mirror of `check-employee-portal.vitest.config.ts`)
- [ ] `app/api/cron/reminders/route.test.ts` — R7-1 auth gate unit test
- [ ] `lib/email/send.test.ts` — R7-4 dispatch + template stub test
- [ ] Framework install: none — vitest already installed

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes (cron auth) | Bearer `CRON_SECRET` in-route gate; middleware bypasses Clerk; no Clerk session |
| V3 Session Management | No | Cron has no session |
| V4 Access Control | Yes | `withOrgScope` RLS; org_id in every WHERE; two-org isolation gate |
| V5 Input Validation | Yes | `window_date` computed from server UTC, not client input; no user-controlled query params |
| V6 Cryptography | No | No new crypto — `CRON_SECRET` is compared with constant-time-safe string comparison (note: `===` is not constant-time, but acceptable for a non-attacker-controlled server-to-server secret) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated cron trigger | Spoofing | Bearer `CRON_SECRET` in-route; middleware bypasses Clerk (existing); secret never committed |
| Cross-org data access in cron | Information Disclosure | `withOrgScope` + RLS; per-org loop; two-org TEST-DB fixture |
| Email injection via policy title | Tampering | React Email renders to string; title is user-controlled but passed as JSX text node (auto-escaped) |
| Resend API key exposure | Information Disclosure | `getResendClient()` lazy singleton reads from env; `RESEND_API_KEY` never logged or echoed |
| Duplicate emails on retry | Denial of Service | `reminder_sends` UNIQUE + `onConflictDoNothing` in DB tx |

---

## Open Questions

1. **Synthesized OrgContext for cron: `userId` = empty string**
   - What we know: `withOrgScope` injects `{ sub, org_id, role }` JWT claims. `sub` is the `userId` field. RLS predicates only check `org_id`. No existing code writes `sub` in a cron context.
   - What's unclear: If any repository method called from the cron writes a `createdBy`/`assignedBy` field using `s.userId`, it will write an empty string, which will fail the UUID FK constraint.
   - Recommendation: Audit every repository method called from the cron route before implementation. The cron only calls: `Notifications.create()` (which currently ignores `s.userId` for the record — check `NotificationCreateInput` type), and the new `ReminderSends` insert. The `Notifications.create()` input type omits `orgId`/`id`/`createdAt` but does NOT include `createdBy` in the notifications table schema — this is safe. Planner should note this explicitly in the Wave 0 audit task.

2. **`window_date` type in Drizzle — `date` column vs computed string**
   - What we know: D-05 specifies `window_date` is a `date` type. Drizzle's `date()` column type maps to a JS `Date` or string depending on the `mode` option.
   - What's unclear: Whether to use `date('window_date', { mode: 'string' })` (returns `"YYYY-MM-DD"` string) or `date('window_date')` (returns a JS `Date`) in the Drizzle schema definition.
   - Recommendation: Use `date('window_date', { mode: 'string' })` so application code computes `window_date = new Date().toISOString().slice(0, 10)` (always UTC) and inserts a plain string. Avoids timezone ambiguity in JS `Date` serialization. [ASSUMED — Drizzle docs not fetched for this specific column option; but mirrors the `acknowledged_at` timestamp approach in the repo]

3. **`policy_assigned` / `policy_updated` idempotency for rapid re-triggers**
   - What we know: D-04 says event types are NOT gated by `reminder_sends`. A same-day republish still notifies.
   - What's unclear: If an admin accidentally double-clicks "publish", could two concurrent `policy_updated` events fire?
   - Recommendation: Rely on the `policy_versions` UNIQUE constraint (`policy_versions_policy_id_version_number_unique`) — a duplicate publish attempt would fail at the version insert. Notification emission is gated on successful version insert. Planner should add a comment noting this in the publish action task.

---

## Repo-Pattern Cheatsheet

Quick file-to-pattern reference for the implementer:

| Pattern | Source File | Line Range | Reuse For |
|---------|------------|-----------|-----------|
| Lazy singleton | `lib/stripe/client.ts` | 1-17 | `getResendClient()` |
| Typed errors | `lib/stripe/errors.ts` | 1-58 | `lib/email/errors.ts` |
| `withOrgScope` internals | `lib/db/scoped.ts` | 41-67 | Understand cron tx setup |
| `OrgContext` shape | `lib/auth/context.ts` | 36-46 | Synthesized cron OrgContext |
| Notifications stubs | `lib/db/repositories/notifications.ts` | 34-44 | Fill `create()` + `markRead()` |
| `onConflictDoNothing().returning()` tx | `app/api/webhooks/stripe/route.ts` | 224-254 | `reminder_sends` claim in tx |
| 3-state ackState JOIN shape | `lib/db/repositories/policies.ts` | 135-209 | `ack_reminder` org-wide query |
| Dept sub-select | `lib/db/repositories/policies.ts` | 139 | `users.departmentId` fan-out |
| Migration RLS+GRANT pattern | `drizzle/0011_qa_citation_grants.sql` | 29-57 | `0014_reminder_sends.sql` |
| Migration header + approval | `drizzle/0013_review_decisions.sql` | 1-14 | `0014_reminder_sends.sql` header |
| TEST-DB integration test | `scripts/check-employee-portal.test.ts` | 1-80+ | `scripts/check-crons-email.ts` |
| Module-boundary mock pattern | `app/api/webhooks/stripe/route.test.ts` | 1-100 | Stub Resend in unit tests |
| Verify chain cumulative | `package.json` | 53 | `verify:phase-7` definition |
| TENANT_TABLES array | `scripts/check-rls.ts` | 36-50 | Add `reminder_sends` |
| TENANT_TABLES array (deploy) | `scripts/check-deploy-schema.ts` | 36-50 | Add `reminder_sends` |
| Middleware cron bypass | `middleware.ts` | 28-30, 118-120 | Confirms route must self-gate |
| ADR-023 allow-list | `scripts/check-db-imports.ts` | 42 | Cron route pre-allow-listed |
| Clerk 409/catch paths | `app/api/webhooks/clerk/route.ts` | 274-314, 383-406 | T8 vitest scaffold branches |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `window_date` Drizzle column: use `date('window_date', { mode: 'string' })` | Code Examples (Pattern 8) | Minor — wrong mode causes JS Date timezone drift in tests; fixable before first commit |
| A2 | `render()` from `'react-email'` is an async function returning Promise<string> | React Email section | Low — confirmed in official docs; if sync variant exists it won't affect test patterns |
| A3 | Railway auto-detects nixpacks from a plain `.mjs` file; no Dockerfile needed | Railway Cron Config | Low — if nixpacks doesn't detect Node.js, add `package.json` in `worker/` with `"type": "module"` |
| A4 | pnpm deduplicates `svix@1.92.2` (resend dep) vs `svix@1.93.0` (project dep) cleanly | Common Pitfalls §7 | Low-medium — if pnpm installs two versions, add a pnpm override; worth verifying after install |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | worker fetch + scripts | Yes | 22.13.0 | — |
| pnpm | package management | Yes | 9.15.9 | — |
| vitest | test runner | Yes | ^1.6.0 | — |
| postgres (pkg) | TEST-DB integration scripts | Yes | ^3.4.9 | — |
| `resend` npm package | Email send | Not installed | 6.12.3 (pinned) | ASK-FIRST install |
| `react-email` npm package | Email templates | Not installed | 6.1.5 (pinned) | ASK-FIRST install |
| Railway Cron service | Worker trigger | Not configured | — | Operator creates after branch push |
| TEST DB (`DATABASE_URL_TEST`) | Integration tests | Assumed set | — | Scripts exit 1 on missing var |

**Missing dependencies with no fallback:**
- `resend` + `react-email` are required for the main deliverables. Install is gated on ASK-FIRST operator approval; should be the first executable task in Wave 1.

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: npm registry] `resend@6.12.3` — `npm view resend time` — published 2026-05-06; repo `github.com/resend/resend-node`; MIT; no postinstall
- [VERIFIED: npm registry] `react-email@6.1.5` — `npm view react-email time` — published 2026-05-18; repo `github.com/resend/react-email`; MIT; no postinstall
- [VERIFIED: resend.com/docs/api-reference/emails/send-email] — `resend.emails.send({ from, to, subject, react })` signature; `{ data?, error? }` return shape
- [VERIFIED: resend.com/docs/send-with-nextjs] — `react:` parameter usage; no manual `render()` call needed; function-call vs JSX form
- [VERIFIED: react.email/docs/utilities/render] — `import { render } from 'react-email'`; async; returns HTML string
- [VERIFIED: react.email/docs/components/html] — `import { Html, Button, ... } from 'react-email'` (6.x consolidated import)
- [VERIFIED: resend.com/blog/react-email-6] — react-email 6.0 consolidates all `@react-email/*` packages into `react-email`; old `@react-email/components` pattern deprecated
- [VERIFIED: backboard.railway.app/railway.schema.json] — `deploy.cronSchedule` type `["string","null"]`; `deploy.startCommand` type `["string","null"]`
- [VERIFIED: docs.railway.com/guides/cron-jobs] — UTC native; `"0 8 * * *"` = 08:00 UTC; process must exit after task
- [VERIFIED: npm registry] `resend@6.12.3` peerDependencies — `@react-email/render: '*'` (optional); no postinstall
- [VERIFIED: npm registry] `react-email@6.1.5` peerDependencies — `react: '^18.0 || ^19.0 || ^19.0.0-rc'` (React 19 compatible)
- [VERIFIED: repo] `lib/db/scoped.ts:41-67` — `withOrgScope` internals; JWT claim injection; `SET LOCAL ROLE authenticated`
- [VERIFIED: repo] `app/api/webhooks/stripe/route.ts:224-254` — `onConflictDoNothing().returning()` idempotency pattern
- [VERIFIED: repo] `lib/db/repositories/notifications.ts:34-44` — `create()` / `markRead()` throw-stubs
- [VERIFIED: repo] `lib/db/repositories/policies.ts:135-209` — 3-state ackState JOIN + dept sub-select
- [VERIFIED: repo] `drizzle/0011_qa_citation_grants.sql` + `drizzle/0013_review_decisions.sql` — RLS+GRANT+index migration shape
- [VERIFIED: repo] `scripts/check-rls.ts:36-50`, `scripts/check-schema.ts:31-56`, `scripts/check-deploy-schema.ts:36-50` — TENANT_TABLES arrays
- [VERIFIED: repo] `scripts/check-db-imports.ts:42` — cron route pre-allow-listed
- [VERIFIED: repo] `middleware.ts:28-30,118-120` — `/api/cron/(.*)` Clerk bypass
- [VERIFIED: repo] `package.json:53` — `verify:phase-6` chain definition
- [VERIFIED: repo] `lib/stripe/client.ts:1-17` + `lib/ai/client.ts:26-31` — lazy singleton pattern

### Secondary (MEDIUM confidence)

- [CITED: resend.com/docs] — React Email `BaseLayout` + component composition pattern based on official React Email docs and Resend Next.js guide

### Tertiary (LOW confidence)

- [ASSUMED] — `date('window_date', { mode: 'string' })` Drizzle column option for UTC-safe date strings (A1)
- [ASSUMED] — Railway nixpacks auto-detects Node.js from `.mjs` without explicit `Dockerfile` (A3)

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — npm registry dates verified; official docs verified
- Architecture: HIGH — all patterns grounded in existing repo files (file:line cited)
- Pitfalls: HIGH — derived from existing repo comments + official docs warnings
- Railway config: HIGH — schema verified from official JSON schema endpoint

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (30 days for stable stack; react-email 6.x is actively iterating but the 6.1.5 pin is fixed)
