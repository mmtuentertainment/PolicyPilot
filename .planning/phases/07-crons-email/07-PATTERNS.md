# Phase 7: Crons + Email - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 20 (12 new + 8 modified)
**Analogs found:** 17 / 20 (3 have no repo analog — see No Analog Found section)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/cron/reminders/route.ts` | route/controller | request-response + batch | `app/api/webhooks/stripe/route.ts` | role-match (auth gate + tx idempotency) |
| `lib/email/client.ts` | utility/singleton | request-response | `lib/stripe/client.ts` | exact |
| `lib/email/errors.ts` | utility/errors | — | `lib/stripe/errors.ts` | exact |
| `lib/email/send.ts` | service | event-driven | `lib/stripe/client.ts` (pattern) + RESEARCH | role-match |
| `lib/email/templates/base-layout.tsx` | component | — | no repo analog | none |
| `lib/email/templates/policy-assigned.tsx` | component | — | no repo analog | none |
| `lib/email/templates/policy-updated.tsx` | component | — | no repo analog | none |
| `lib/email/templates/review-due.tsx` | component | — | no repo analog | none |
| `lib/email/templates/ack-reminder.tsx` | component | — | no repo analog | none |
| `worker/trigger-reminders.mjs` | utility | request-response | no repo analog | none |
| `railway.json` | config | — | no repo analog | none |
| `drizzle/0014_reminder_sends.sql` | migration | — | `drizzle/0011_qa_citation_grants.sql` + `drizzle/0013_review_decisions.sql` | exact |
| `lib/db/schema.ts` (`reminderSends` export) | model | CRUD | `lib/db/schema.ts` `notifications` / `qaCitationGrants` blocks | exact |
| new `listAckReminderCandidatesForOrg` method (new repo file or added to policies.ts) | service/repository | CRUD + batch | `lib/db/repositories/policies.ts` lines 135–209 | exact |
| `scripts/check-crons-email.ts` + `.vitest.config.ts` | test | batch | `scripts/check-employee-portal.test.ts` + `check-employee-portal.vitest.config.ts` | exact |
| `lib/db/repositories/notifications.ts` (fill stubs) | repository | CRUD | same file — `listUnreadForUser` / `listAll` (live read pattern) | exact |
| `lib/policies/transitions.ts` `publish()` (extend) | service | CRUD | same file lines 260–330 (`publish` body) | exact |
| assign action (extend) | service | event-driven | `lib/db/repositories/policy_assignments.ts` `create()` (RETURNING gate) | exact |
| `app/api/webhooks/clerk/route.ts` (T8 vitest) | test | request-response | `app/api/webhooks/stripe/route.test.ts` | exact |
| `package.json` / `check-schema.ts` / `check-deploy-schema.ts` / `check-artifacts.ts` | config/test | — | same files (existing entries for Phase 5/6) | exact |

---

## Pattern Assignments

### `app/api/cron/reminders/route.ts` (route, request-response + batch)

**Primary analog:** `app/api/webhooks/stripe/route.ts`
**Secondary analog:** `middleware.ts` lines 28–30, 118–120

**Imports pattern** (`app/api/webhooks/stripe/route.ts` lines 1–8 + RESEARCH):
```typescript
import 'server-only';
import { db } from '@/lib/db';
import { organizations, notifications, reminderSends } from '@/lib/db/schema';
import { withOrgScope } from '@/lib/db/scoped';
import type { OrgContext } from '@/lib/auth/context';
import { Notifications } from '@/lib/db/repositories/notifications';
import { sendNotificationEmail } from '@/lib/email/send';
```

**Runtime + dynamic exports** (`app/api/webhooks/stripe/route.ts` lines 14–15):
```typescript
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

**Auth gate pattern** (RESEARCH §Cron Route Pattern R7-1; `middleware.ts` lines 118–120 confirm Clerk is bypassed for `/api/cron/(.*)` so route MUST self-gate):
```typescript
export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... continue to org enumeration
}
```

**Org enumeration (raw db — allow-listed)** (`scripts/check-db-imports.ts` line 42 pre-allow-lists `/^app\/api\/cron\/.+\/route\.ts$/`):
```typescript
// Raw db is ONLY used here for the org enumeration SELECT (ADR-023 allow-list).
// All subsequent reads/writes go through withOrgScope.
const orgIds = await db.select({ id: organizations.id }).from(organizations);
let reviewReminders = 0;
let ackReminders = 0;

for (const { id: orgId } of orgIds) {
  try {
    const counts = await withOrgScope(
      { orgId, userId: '', clerkOrgId: '', clerkUserId: '', role: 'admin' } satisfies OrgContext,
      async (s) => { /* ... per-org processing ... */ },
    );
    reviewReminders += counts.reviewReminders;
    ackReminders += counts.ackReminders;
  } catch (err) {
    // D-02: structured masked logging; one org failure must not block the rest
    console.error({ event: 'cron_org_error', orgId: orgId.slice(-4), error: String(err) });
  }
}
return Response.json({ reviewReminders, ackReminders });
```

**Idempotency-in-tx pattern** (`app/api/webhooks/stripe/route.ts` lines 224–254 — `commitProcessedEvent`):
```typescript
// Inside withOrgScope callback. D-03: claim the slot first, insert notifications
// for winners, COMMIT — then send Resend AFTER the tx closes.
const inserted = await s.tx
  .insert(reminderSends)
  .values({ orgId: s.orgId, userId, policyId, type, windowDate, sentAt: new Date() })
  .onConflictDoNothing()
  .returning({ id: reminderSends.id });

if (inserted.length === 0) continue; // already sent this window — skip

await Notifications.create(s, { userId, type, payloadJson: { policyId, policyTitle }, read: false });
// tx auto-commits when withOrgScope callback returns
```

**Post-commit email dispatch** (D-03 — email I/O is NEVER inside the DB tx):
```typescript
// After withOrgScope resolves (tx committed), send per-winner with per-user try/catch.
for (const winner of winners) {
  try {
    await sendNotificationEmail(winner.type, winner.email, { policyTitle: winner.policyTitle, ... });
  } catch (err) {
    // Logged, not counted. Self-heals next day (window_date advances).
    console.error({ event: 'cron_email_error', type: winner.type, error: String(err) });
  }
}
```

**CRITICAL NOTE — synthesized OrgContext `userId = ''`:** The cron synthesizes `{ orgId, userId: '', clerkOrgId: '', clerkUserId: '', role: 'admin' }`. The `userId = ''` is safe for RLS (only `org_id` is checked) but is NOT a valid UUID FK. Audit every `withOrgScope` callback called from the cron — no method may write `s.userId` into a `createdBy`/`assignedBy` UUID FK column. `Notifications.create()` input type (`NotificationCreateInput` = `Omit<..., 'orgId' | 'id' | 'createdAt'>`) has no `createdBy` field — confirmed safe. The `reminderSends` insert uses explicit `userId` from the candidate, not `s.userId`.

**`window_date` UTC derivation** (RESEARCH §Open Questions, §Pitfall 3):
```typescript
// Always derive from UTC. `date('window_date', { mode: 'string' })` in schema.
const windowDate: string = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
```

---

### `lib/email/client.ts` (utility/singleton, request-response)

**Analog:** `lib/stripe/client.ts` lines 1–17 — **exact mirror**

**Full pattern** (`lib/stripe/client.ts` lines 1–17):
```typescript
import 'server-only';
import Stripe from 'stripe';
import { StripeConfigError } from './errors';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeConfigError('STRIPE_SECRET_KEY');
  }
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}
```

**Apply to `lib/email/client.ts`** — substitute `Resend` / `RESEND_API_KEY` / `ResendConfigError`:
```typescript
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

---

### `lib/email/errors.ts` (utility/errors)

**Analog:** `lib/stripe/errors.ts` lines 42–58 — **exact mirror of the `StripeConfigError` + `StripeCatalogConfigError` pattern**

**Pattern** (`lib/stripe/errors.ts` lines 42–58):
```typescript
export class StripeConfigError extends Error {
  public readonly code = 'STRIPE_CONFIG_ERROR' as const;
  constructor(public readonly envVar: string) {
    super(`Stripe configuration error: required env var ${envVar} is not configured`);
    this.name = 'StripeConfigError';
  }
}
```

**Apply to `lib/email/errors.ts`** (ADR-026 typed-error; two classes needed):
```typescript
import 'server-only';

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

### `lib/email/send.ts` (service, event-driven dispatch)

**Analog:** RESEARCH.md §Typed Dispatch Map (D-10) + `lib/stripe/client.ts` (server-only import discipline)

**No exact repo analog** for a typed dispatch map — the pattern is defined in RESEARCH.md and grounded in ADR-016 / D-10.

**Imports + server-only guard:**
```typescript
import 'server-only';
import type { NotificationType } from '@/lib/db/schema';
import { getResendClient } from './client';
import { ResendSendError } from './errors';
import { PolicyAssignedEmail } from './templates/policy-assigned';
import { PolicyUpdatedEmail } from './templates/policy-updated';
import { ReviewDueEmail } from './templates/review-due';
import { AckReminderEmail } from './templates/ack-reminder';
```

**Core dispatch pattern** (RESEARCH.md §Typed Dispatch Map):
```typescript
// NotificationType = 'policy_assigned' | 'policy_updated' | 'review_due' | 'ack_reminder'
type EmailDispatch = {
  subject: (ctx: EmailContext) => string;
  component: (ctx: EmailContext) => React.ReactElement;
};

const DISPATCH_MAP: Record<NotificationType, EmailDispatch> = {
  policy_assigned: {
    subject: (ctx) => `New Policy: ${ctx.policyTitle}`,
    component: (ctx) => PolicyAssignedEmail(ctx),
  },
  // ... remaining 3 types
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
    react: dispatch.component(ctx),   // Resend calls @react-email/render internally — no manual render()
  });
  if (error) throw new ResendSendError(type, maskEmail(to), error);
}
```

**Key constraint — no manual `render()` call:** When using `react:`, Resend calls `@react-email/render` internally. Only call `render()` explicitly if you need the HTML string for test logging.

---

### `lib/email/templates/` (React Email components — base-layout + 4 per-type)

**No repo analog.** Use RESEARCH.md §React Email patterns exclusively.

**Imports (react-email 6.x — everything from `'react-email'`):**
```typescript
import { Html, Head, Preview, Body, Container, Heading, Text, Button, Hr } from 'react-email';
```

**Base layout pattern** (RESEARCH.md §Template Structure):
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
```

**Per-type template pattern** (RESEARCH.md §Template Structure):
```typescript
// lib/email/templates/ack-reminder.tsx
export function AckReminderEmail({ policyTitle, orgName, acknowledgeUrl }: AckReminderEmailProps) {
  return (
    <BaseLayout preview={`Reminder: Please acknowledge "${policyTitle}"`}>
      <Heading>Policy Acknowledgment Reminder</Heading>
      <Text>Please acknowledge: <strong>{policyTitle}</strong></Text>
      <Button href={acknowledgeUrl}>Acknowledge Now</Button>
    </BaseLayout>
  );
}
```

**CRITICAL — import path:** With `react-email@6.1.5`, import ALL components from `'react-email'`, NOT from `@react-email/components` (old pre-6.x split pattern — will cause module not found error).

---

### `worker/trigger-reminders.mjs` + `railway.json` (config, no-dependency worker)

**No repo analog.** Use RESEARCH.md §Pattern 5 + §Pattern 4 exclusively.

**Worker pattern** (RESEARCH.md §Pattern 5 — D-11, zero npm dependencies):
```javascript
// worker/trigger-reminders.mjs — Node ESM, zero dependencies
const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL;
if (!CRON_SECRET || !BASE_URL) {
  console.error('[trigger-reminders] CRON_SECRET or BASE_URL not set');
  process.exit(1);
}
const url = `https://${BASE_URL}/api/cron/reminders`;
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  const body = await res.json();
  console.log('[trigger-reminders] status:', res.status, 'body:', JSON.stringify(body));
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error('[trigger-reminders] fetch failed:', err);
  process.exit(1);
}
```

**CRITICAL — `process.exit()` is mandatory:** Railway skips subsequent cron executions if the prior run has not terminated. The worker must call `process.exit(0)` or `process.exit(1)` in every code path.

**`railway.json` schema** (RESEARCH.md §Pattern 4 — VERIFIED from backboard.railway.app/railway.schema.json):
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "deploy": {
    "startCommand": "node worker/trigger-reminders.mjs",
    "cronSchedule": "0 8 * * *"
  }
}
```

---

### `drizzle/0014_reminder_sends.sql` (migration)

**Primary analog:** `drizzle/0011_qa_citation_grants.sql` lines 1–56 (header format, RLS+GRANT+index shape)
**Secondary analog:** `drizzle/0013_review_decisions.sql` lines 1–14 (operator-approval header format with ASK-FIRST clearance)

**Header format** (`drizzle/0013_review_decisions.sql` lines 1–14):
```sql
-- drizzle/0014_reminder_sends.sql
-- Phase 7 (R7-2 / D-05) — at-most-once send-ledger for cron reminder dedup.
-- Operator pre-approved authoring (s27 banked); operator-signed header required before commit.
--   CLAUDE.md ASK-FIRST (schema change after Phase 2) cleared by D-05 + STATE.md pre-paying status.
--   ADDITIVE ONLY — new table; no existing schema objects mutated.
```

**RLS + GRANT + index shape** (`drizzle/0011_qa_citation_grants.sql` lines 29–56):
```sql
-- The pattern to mirror (from 0011):
CREATE TABLE "qa_citation_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  ...
);
--> statement-breakpoint
ALTER TABLE "qa_citation_grants" ADD CONSTRAINT "qa_citation_grants_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "qa_citation_grants_org_id_idx" ON "qa_citation_grants" USING btree ("org_id");
--> statement-breakpoint
ALTER TABLE "qa_citation_grants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation" ON "qa_citation_grants"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "qa_citation_grants" TO authenticated;
```

**CRITICAL — wrapped RLS form:** Use `(SELECT auth.jwt()->>'org_id')` NOT the bare `auth.jwt()->>'org_id'`. The wrapped form is required by the post-0008 convention (prevents per-row JWT eval at scale).

**`reminder_sends` specific additions** (D-05 — natural-key UNIQUE + `date` type + `window_date`):
```sql
CREATE TABLE "reminder_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "type" text NOT NULL,           -- 'review_due' | 'ack_reminder'
  "window_date" date NOT NULL,    -- UTC calendar day (daily dedup key)
  "sent_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Natural-key UNIQUE: at-most-once per (org, user, policy, type, calendar-day)
ALTER TABLE "reminder_sends"
  ADD CONSTRAINT "reminder_sends_dedup_key"
  UNIQUE("org_id","user_id","policy_id","type","window_date");
```

---

### `lib/db/schema.ts` — `reminderSends` export (model)

**Analog:** `lib/db/schema.ts` lines 152–162 (`notifications` table definition) and the `qaCitationGrants` export (same file)

**Pattern** (`lib/db/schema.ts` lines 152–162 for `notifications`):
```typescript
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(),
  payloadJson: jsonb('payload_json'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('notifications_org_id_idx').on(table.orgId),
]);
```

**`reminderSends` Drizzle definition to add:**
```typescript
export const reminderSends = pgTable('reminder_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  type: text('type').notNull(),
  windowDate: date('window_date', { mode: 'string' }).notNull(), // UTC "YYYY-MM-DD"
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('reminder_sends_org_id_idx').on(table.orgId),
  unique('reminder_sends_dedup_key').on(table.orgId, table.userId, table.policyId, table.type, table.windowDate),
]);
```

**CRITICAL — `date` column mode:** Use `date('window_date', { mode: 'string' })` so application code inserts a plain `"YYYY-MM-DD"` string via `new Date().toISOString().slice(0, 10)`. The `mode: 'string'` avoids JS `Date` timezone serialization drift (RESEARCH Open Questions §2 + Assumption A1).

---

### New `listAckReminderCandidatesForOrg` method (repository, CRUD + batch)

**Analog:** `lib/db/repositories/policies.ts` lines 135–209 (`listAssignedAndPublishedForUser`)

**Key patterns to reuse** (`lib/db/repositories/policies.ts` lines 135–209):

Department sub-select (line 139):
```typescript
const userDeptSubquery = sql`(SELECT ${users.departmentId} FROM ${users}
  WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId})`;
```

3-state `ackState` SQL CASE (lines 150–155):
```typescript
ackState: sql<'none' | 'current' | 'stale'>`
  CASE
    WHEN ${currentAck.id} IS NOT NULL THEN 'current'
    WHEN ${priorAck.id}   IS NOT NULL THEN 'stale'
    ELSE 'none'
  END`.as('ack_state'),
```

JOIN chain (lines 158–208 — innerJoin policyAssignments + policyVersions, leftJoin aliases on acknowledgments):
```typescript
.innerJoin(policyAssignments, and(
  eq(policyAssignments.policyId, policies.id),
  eq(policyAssignments.orgId, s.orgId),
  or(
    and(eq(policyAssignments.assigneeType, 'user'), eq(policyAssignments.assigneeId, userId)),
    and(eq(policyAssignments.assigneeType, 'department'),
        sql`${policyAssignments.assigneeId} = ${userDeptSubquery}`),
  ),
))
```

**Adaptation for `listAckReminderCandidatesForOrg` (D-09):**
- Remove the `userId` parameter entirely — this is an org-wide query, no per-user filter
- Replace the single-user `userDeptSubquery` with an org-wide dept-membership JOIN: expand `department` assignments to ALL users where `users.departmentId = policyAssignments.assigneeId`
- Filter `ackState IN ('none', 'stale')` — exclude `'current'`
- Add `assignedAt` / `publishedAt` date filter: >7d ago for `none` (since assignment), >7d since `policyVersions.createdAt` for `stale`
- Return `(userId, userEmail, policyId, policyTitle, ackState)` tuples
- Wrap in `withOrgScope` — receives `s.tx`, never raw `db`

**Placement:** New file `lib/db/repositories/reminders.ts` (keeps cron-specific queries separate from the policy aggregate repo) OR add to `policies.ts` — planner discretion per CONTEXT.md `Claude's Discretion`.

---

### `scripts/check-crons-email.ts` + `check-crons-email.vitest.config.ts` (test, batch)

**Primary analog:** `scripts/check-employee-portal.test.ts` (full file) + `scripts/check-employee-portal.vitest.config.ts` (full file)

**TEST-DB integration harness header** (`scripts/check-employee-portal.test.ts` lines 1–29):
```typescript
/**
 * scripts/check-crons-email.ts — [analogous to check-employee-portal.test.ts]
 *
 * Integration test against live TEST DB. Pattern source: scripts/check-employee-portal.test.ts
 * + scripts/check-rls.ts (SET LOCAL ROLE + ROLLBACK cross-org block).
 *
 * Run via: pnpm vitest run scripts/check-crons-email.ts --config scripts/check-crons-email.vitest.config.ts
 * Wrapped by: pnpm check:crons-email
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
```

**Module mock setup** (`scripts/check-employee-portal.test.ts` lines 50–55):
```typescript
vi.mock('server-only', () => ({}));
vi.mock('@/lib/email/client', () => ({
  getResendClient: vi.fn(() => ({
    emails: { send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }) },
  })),
}));
```

**TENANT_TABLES extension** (`scripts/check-rls.ts` lines 36–50 — add `reminder_sends`):
```typescript
// Phase 7 D-05 — reminder_sends send-ledger. RLS, policy, and 4 GRANTs
// auto-asserted by per-table loop. Wrapped-form predicate + UNIQUE + index
// asserted by Phase 7 assertion block.
'reminder_sends',
```

**vitest config pattern** (`scripts/check-employee-portal.vitest.config.ts` full file):
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
      'server-only': resolve(__dirname, '..', 'tests/stubs/server-only.ts'),
    },
  },
  css: { postcss: { plugins: [] } },
  test: {
    include: ['scripts/check-crons-email.ts'],
    environment: 'node',
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? '',
      DIRECT_URL_TEST: process.env.DIRECT_URL_TEST ?? '',
    },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
});
```

---

### `lib/db/repositories/notifications.ts` — fill `create()` + `markRead()` (MODIFIED)

**Analog:** same file lines 15–32 — `listAll` and `listUnreadForUser` are the live read patterns to match

**`listUnreadForUser` pattern** (lines 22–32 — the read shape to mirror for `create()`):
```typescript
listUnreadForUser: (s: OrgScope, userId: string) =>
  s.tx
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.orgId, s.orgId),
      eq(notifications.userId, userId),
      eq(notifications.read, false),
    )),
```

**`create()` implementation** (fill the throw-stub at line 34 — mirrors `PolicyAssignments.create()` pattern from `lib/db/repositories/policy_assignments.ts` lines 46–58):
```typescript
create: async (s: OrgScope, input: NotificationCreateInput) =>
  s.tx
    .insert(notifications)
    .values({ ...input, orgId: s.orgId })
    .returning(),
```

**`markRead()` implementation** (fill the throw-stub at line 40 — UPDATE; `notifications` is explicitly NOT in `IMMUTABLE_TABLES`, see D-12):
```typescript
markRead: async (s: OrgScope, id: string) =>
  s.tx
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.orgId, s.orgId), eq(notifications.id, id)))
    .returning({ id: notifications.id }),
```

**CRITICAL — `NotificationCreateInput` type omits `orgId`:** The existing type at line 10 is `Omit<typeof notifications.$inferInsert, 'orgId' | 'id' | 'createdAt'>`. The `create()` implementation must inject `orgId: s.orgId` from scope (same pattern as `PolicyAssignments.create()` line 49). There is NO `createdBy` field in `NotificationCreateInput` — this is confirmed safe for the cron's synthesized `userId = ''` context.

---

### `lib/policies/transitions.ts` — extend `publish()` for `next_review_date` writer + `policy_updated` emission (MODIFIED)

**Analog:** same file lines 260–330 (`publish` function body)

**Where to insert the `next_review_date` writer** (after `PolicyVersions.create()` on line 294, inside the `withOrgScope` callback, D-08):
```typescript
// D-08 — forward-only next_review_date writer.
// reviewIntervalMonths defaults to 12 (schema.ts:193).
const publishedAt = new Date();
const months = policy.reviewIntervalMonths ?? 12;
const nextReviewDate = new Date(publishedAt);
nextReviewDate.setMonth(nextReviewDate.getMonth() + months);

await s.tx
  .update(policies)
  .set({
    status: 'published',
    nextReviewDate,   // <-- new Phase 7 write
    updatedAt: sql`now()`,
  })
  .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
```

**Where to insert `policy_updated` emission** (after the `withOrgScope` closes — post-commit, mirrors the AI auto-trigger at line 306 which also runs outside the tx):
```typescript
// Phase 7 R7-9 — post-commit policy_updated emission (same pattern as AI auto-trigger below).
// Only fires on republish (new policy_version inserted above confirms this).
// Fire-and-forget with per-error catch — email failure must not surface to admin.
try {
  const assignees = /* listForPolicy to get user emails */;
  for (const assignee of assignees) {
    await withOrgScope(ctx, async (s) => {
      await Notifications.create(s, { userId: assignee.id, type: 'policy_updated', ... });
    });
    await sendNotificationEmail('policy_updated', assignee.email, { policyTitle: policy.title, ... });
  }
} catch (err) {
  console.error({ event: 'policy_updated_emission_error', error: String(err) });
}
```

**Note on idempotency for `policy_updated`:** D-04 says event types are NOT gated by `reminder_sends`. A duplicate publish attempt is blocked by the `policy_versions_policy_id_version_number_unique` constraint — so notification emission is naturally gated on successful version insert. Add a comment to this effect in the implementation.

---

### Assign action (extend for `policy_assigned` emission) (MODIFIED)

**Analog:** `lib/db/repositories/policy_assignments.ts` lines 46–58 (`create()` with RETURNING gate)

**RETURNING-gate pattern** (`policy_assignments.ts` lines 46–58):
```typescript
create: async (s: OrgScope, input: PolicyAssignmentCreateInput) => {
  const inserted = await s.tx
    .insert(policyAssignments)
    .values({ ...input, orgId: s.orgId })
    .onConflictDoNothing()
    .returning();   // length === 0 means already assigned — do NOT emit
  return inserted;
},
```

**Emission gating (D-04):** Only emit `policy_assigned` when `inserted.length > 0` (a genuinely new assignment row). If `onConflictDoNothing` swallowed the insert (duplicate), no notification should fire.

**Where the emission goes** — in the Server Action or orchestrator that calls `PolicyAssignments.create()`, after `withOrgScope` closes (post-commit):
```typescript
const inserted = await /* ... withOrgScope({ ... }, async (s) => PolicyAssignments.create(s, ...) */;
if (inserted.length > 0) {
  // Post-commit: emit policy_assigned for each new assignment's target user(s)
  try {
    await sendNotificationEmail('policy_assigned', userEmail, { policyTitle, ... });
  } catch (err) {
    console.error({ event: 'policy_assigned_emission_error', error: String(err) });
  }
}
```

---

### `app/api/webhooks/clerk/route.ts` — T8 vitest scaffold (MODIFIED — test only)

**Analog:** `app/api/webhooks/stripe/route.test.ts` lines 1–60 (module mock + FakeTx pattern)

**Mock setup pattern** (`stripe/route.test.ts` lines 1–4):
```typescript
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
```

**Test branches to cover** (T8 — `app/api/webhooks/clerk/route.ts` lines 274–314, 383–406):
- 409 path: org not found when processing membership event (line 282)
- 409 path: user not found when processing membership event (line 313)
- catch path: error thrown inside handler (line 383–406 area)

**Stub Resend for unit tests** (RESEARCH.md §Pattern 7):
```typescript
vi.mock('@/lib/email/client', () => ({
  getResendClient: vi.fn(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
    },
  })),
}));
```

---

### `package.json` — `verify:phase-7` + `check:crons-email` (MODIFIED)

**Analog:** `package.json` line 53 (`verify:phase-6` definition):
```json
"verify:phase-6": "pnpm tsc --noEmit && pnpm verify:phase-5 && pnpm run test -- --run lib/stripe && pnpm run test -- --run app/api/webhooks/stripe && pnpm db:verify && pnpm check:artifacts"
```

**New entries to add** (D-13 cumulative chain):
```json
"check:crons-email": "pnpm vitest run scripts/check-crons-email.ts --config scripts/check-crons-email.vitest.config.ts",
"verify:phase-7": "pnpm tsc --noEmit && pnpm verify:phase-6 && pnpm check:crons-email && pnpm run test -- --run lib/email && pnpm run test -- --run app/api/cron && pnpm run test -- --run app/api/webhooks/clerk && pnpm db:verify && pnpm check:artifacts"
```

---

### `scripts/check-schema.ts` + `scripts/check-deploy-schema.ts` (MODIFIED)

**Analog:** `scripts/check-schema.ts` lines 31–56 and `scripts/check-deploy-schema.ts` lines 36–50 (TENANT_TABLES arrays)

**Existing TENANT_TABLES pattern** (`scripts/check-rls.ts` lines 36–50):
```typescript
const TENANT_TABLES = [
  // ... 13 existing tables ...
  'review_decisions', // Phase 9 D-09-01
] as const;
```

**Extension for Phase 7** — add to TENANT_TABLES in all three files (`check-rls.ts`, `check-schema.ts`, `check-deploy-schema.ts`):
```typescript
  'reminder_sends', // Phase 7 D-05 — at-most-once send-ledger for cron reminder dedup.
```

---

### `scripts/check-artifacts.ts` (MODIFIED)

**Analog:** `scripts/check-artifacts.ts` lines 20–51 (pattern for static file existence + content checks)

**Pattern** (`scripts/check-artifacts.ts` lines 36–51):
```typescript
function exists(rel: string): boolean {
  return existsSync(join(REPO_ROOT, rel));
}

function assert(out: Check[], cond: boolean, label: string, detail: string): void {
  out.push(cond ? ok(label) : fail(label, detail));
}
```

**New assertions to add for Phase 7:**
```typescript
// Phase 7 artifacts
assert(out, exists('app/api/cron/reminders/route.ts'),   'cron route exists', '...');
assert(out, exists('lib/email/client.ts'),                'email client exists', '...');
assert(out, exists('lib/email/send.ts'),                  'email send dispatch exists', '...');
assert(out, exists('lib/email/errors.ts'),                'email errors exists', '...');
assert(out, exists('lib/email/templates/base-layout.tsx'),'email base-layout exists', '...');
assert(out, exists('worker/trigger-reminders.mjs'),       'worker artifact exists', '...');
assert(out, exists('railway.json'),                       'railway.json exists', '...');

// Check railway.json has required fields
const railwayJson = JSON.parse(read('railway.json'));
assert(out, railwayJson?.deploy?.cronSchedule === '0 8 * * *', 'railway.json cronSchedule correct', '...');
assert(out, typeof railwayJson?.deploy?.startCommand === 'string', 'railway.json startCommand set', '...');
```

---

## Shared Patterns

### Authentication / Cron Self-Gate
**Source:** `middleware.ts` lines 28–30, 118–120 + RESEARCH.md §Cron Route Pattern
**Apply to:** `app/api/cron/reminders/route.ts`

The middleware bypasses Clerk for `/api/cron/(.*)` (line 28–30), forwarding the request without a session. The route MUST therefore self-gate using `Authorization: Bearer {CRON_SECRET}`. Pattern:
```typescript
const authHeader = req.headers.get('authorization');
const cronSecret = process.env.CRON_SECRET?.trim();
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Idempotency-in-Transaction
**Source:** `app/api/webhooks/stripe/route.ts` lines 229–253 (`commitProcessedEvent`)
**Apply to:** `app/api/cron/reminders/route.ts` (`reminder_sends` claim)

Pattern: `insert().values(...).onConflictDoNothing().returning()` inside the tx; `inserted.length === 0` → already done → skip. This is the canonical at-most-once pattern for all three tables in the project (`stripe_events`, `clerk_events`, `reminder_sends`).

### Server-Only Lazy Singleton
**Source:** `lib/stripe/client.ts` lines 1–17
**Apply to:** `lib/email/client.ts` (`getResendClient`)

Pattern: `import 'server-only'` at top; null-initialized module-level var; check-and-return on each call; throw typed config error if env var absent.

### OrgScope Repository Pattern
**Source:** `lib/db/repositories/notifications.ts` lines 15–32, `lib/db/repositories/policies.ts` lines 135–209
**Apply to:** All new cron repository methods + `Notifications.create()` / `markRead()`

Every repository method takes `s: OrgScope` as first arg, uses `s.tx` (never raw `db`), always includes `eq(table.orgId, s.orgId)` in WHERE. `orgId` is always injected from `s.orgId`, never from user input.

### Typed Errors (ADR-026)
**Source:** `lib/stripe/errors.ts` lines 42–58
**Apply to:** `lib/email/errors.ts`

Pattern: `extends Error` directly (not `BootstrapError`); `public readonly code = 'DOMAIN_ERROR_NAME' as const`; `this.name = 'ClassName'` in constructor.

### Structured Masked Logging
**Source:** `lib/stripe/` + CONVENTIONS.md
**Apply to:** `app/api/cron/reminders/route.ts` (per-org error catch + per-user email error catch)

Pattern: `console.error({ event: 'event_name_snake_case', orgId: orgId.slice(-4), error: String(err) })`. Never log full IDs, email addresses, or secret values.

### Cumulative Verify Chain
**Source:** `package.json` line 53 (`verify:phase-6` wraps `verify:phase-5`)
**Apply to:** `package.json` `verify:phase-7` definition

Each `verify:phase-N` runs the prior chain then adds its own focused gates. Never remove or skip prior gates.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `lib/email/templates/base-layout.tsx` | component | — | No React Email components in repo; use RESEARCH.md §React Email + official react.email/docs |
| `lib/email/templates/policy-assigned.tsx` + 3 siblings | component | — | Same — no email template precedent in repo |
| `worker/trigger-reminders.mjs` | utility | request-response | No Railway worker or background-job entrypoint exists in repo; use RESEARCH.md §Pattern 5 |
| `railway.json` | config | — | No Railway config in repo; use RESEARCH.md §Pattern 4 (schema verified from backboard.railway.app/railway.schema.json) |

---

## Correctness Flags for Planner

These are RESEARCH open questions and pitfalls that must be reflected as explicit tasks or notes in plans:

1. **Synthesized OrgContext `userId = ''`** (RESEARCH Open Question 1): Every `withOrgScope` callback in the cron must be audited for `s.userId` writes. Confirmed safe: `Notifications.create()` `NotificationCreateInput` has no `createdBy`. Flag as a Wave 0 audit task.

2. **`window_date` Drizzle column mode** (RESEARCH Open Question 2, Assumption A1): Use `date('window_date', { mode: 'string' })` in `lib/db/schema.ts` and `new Date().toISOString().slice(0, 10)` for insert values. Do NOT use `date()` without `mode: 'string'` (causes JS Date timezone drift).

3. **`policy_updated` double-publish idempotency** (RESEARCH Open Question 3): Emission is naturally gated on successful `PolicyVersions.create()` (which has a `policy_versions_policy_id_version_number_unique` constraint). Add a comment in the publish action implementation documenting this.

4. **`svix` deduplication** (RESEARCH Pitfall 7): After installing `resend@6.12.3`, run `pnpm ls svix` — expect one version. If two appear, add a pnpm override. This is a Wave 1 installation verification task.

5. **React Email import path** (RESEARCH Pitfall 4): With `react-email@6.1.5`, ALL imports come from `'react-email'` not `@react-email/components`. The planner must flag this in the template implementation tasks.

6. **Worker must call `process.exit()`** (RESEARCH Pitfall 6): Required in every code path. Railway skips next scheduled execution if prior run stays alive.

7. **RLS wrapped form** (drizzle/0011 line 53): Always `(SELECT auth.jwt()->>'org_id')` not the bare `auth.jwt()->>'org_id'`. The migration CI gate in `check-rls.ts` enforces this.

---

## Metadata

**Analog search scope:** `app/api/`, `lib/`, `drizzle/`, `scripts/`, `middleware.ts`, `package.json`
**Files read:** 22 source files
**Pattern extraction date:** 2026-06-05
