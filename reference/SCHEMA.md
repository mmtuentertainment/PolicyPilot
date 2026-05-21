# reference/SCHEMA.md
# Complete Drizzle schema — all tables with types and RLS patterns

---

## Setup (lib/db/schema.ts)

```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  planTier: text('plan_tier').notNull().default('starter'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeSubscriptionStatus: text('stripe_subscription_status').default('trialing'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  role: text('role').notNull().default('employee'),
  departmentId: uuid('department_id'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
})
```

```typescript
export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title').notNull(),
  contentJson: jsonb('content_json').notNull(),
  tldrSummary: text('tldr_summary'),
  category: text('category').notNull(),
  status: text('status').notNull().default('draft'),
  currentVersion: integer('current_version').notNull().default(1),
  reviewIntervalMonths: integer('review_interval_months').default(12),
  nextReviewDate: timestamp('next_review_date'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  versionNumber: integer('version_number').notNull(),
  contentJson: jsonb('content_json').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const policyAssignments = pgTable('policy_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  assigneeType: text('assignee_type').notNull(), // 'user' | 'department'
  assigneeId: uuid('assignee_id').notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at').defaultNow(),
})

export const acknowledgments = pgTable('acknowledgments', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersions.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at').defaultNow(),
  ipAddress: text('ip_address'),
  // NEVER DELETE ROWS — append-only audit trail
})

// ai_generations — AMENDED in Phase 4 ship (D-32 + D-35):
//   tokens_used dropped; split into input_tokens + output_tokens + cache_read_input_tokens
//   + cache_creation_input_tokens. idempotency_key added (D-32 Idempotency-Key header dedup).
//   See reference/SCHEMA.md ai_generations block below for the canonical column list +
//   partial-unique index. Drizzle export shape lives in lib/db/schema.ts (Plan 04-07).
```

```
ai_generations
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid()
  org_id                        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
  policy_id                     uuid REFERENCES policies(id)
  type                          text NOT NULL  -- 'draft' | 'summary' | 'qa' | 'consistency'
  prompt                        text NOT NULL
  result                        text NOT NULL
  input_tokens                  integer        -- NEW (D-35) — Anthropic Usage.input_tokens
  output_tokens                 integer        -- NEW (D-35) — Anthropic Usage.output_tokens
  cache_read_input_tokens       integer        -- NEW (D-35) — billed at 0.1× base input
  cache_creation_input_tokens   integer        -- NEW (D-35) — billed at 1.25× (5min) or 2× (1h) base input
  idempotency_key               text           -- NEW (D-32) — optional dedup key per Idempotency-Key header
  model                         text NOT NULL
  created_at                    timestamp DEFAULT now()

-- D-32 hand-written partial-unique index (Drizzle does NOT emit partial indexes from .unique()):
CREATE UNIQUE INDEX ai_generations_org_idempotency_key
  ON ai_generations(org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- DROPPED in Phase 4 ship: tokens_used (integer). Split into the 4 columns above per D-35.
-- Operator approved 2026-05-21 (CLAUDE.md ASK FIRST cleared; safe — pre-paying-customer per STATE.md).
```

```typescript
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'policy_assigned'|'policy_updated'|'review_due'|'ack_reminder'
  payloadJson: jsonb('payload_json'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

export const workflowStages = pgTable('workflow_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  stageOrder: integer('stage_order').notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  status: text('status').notNull().default('pending'),
  reviewedAt: timestamp('reviewed_at'),
  comment: text('comment'),
})

export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(), // Stripe event ID (evt_xxx)
  processedAt: timestamp('processed_at').defaultNow(),
})
```

```
batch_jobs
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
  anthropic_batch_id  text NOT NULL UNIQUE
  type                text NOT NULL DEFAULT 'consistency'   -- Phase 4 ships consistency only; future surfaces extend
  status              text NOT NULL DEFAULT 'in_progress'   -- 'in_progress' | 'completed' | 'failed' (SPEC enum; translated from Anthropic SDK enum)
  created_at          timestamp DEFAULT now()
  updated_at          timestamp DEFAULT now() NOT NULL      -- D-34 — staleness gate at /api/ai/consistency/[batchId] (25s window)
  result_json         jsonb

RLS: ENABLE; CREATE POLICY "org_isolation" ON batch_jobs FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON batch_jobs TO authenticated;

Phase 4 D-29 + D-30 + D-34 — tracks Anthropic batch submissions for the Consistency Check
feature. SDK returns `processing_status: 'in_progress' | 'canceling' | 'ended'` + request_counts;
`/api/ai/consistency/[batchId]/route.ts` translates SDK enum → app `status` enum before
persisting (RESEARCH.md § Batch API Mechanics). `ai_generations` row is written ON COMPLETION
of the batch, NOT at submission — preserves the "SUCCESS-ONLY ai_generations" semantic (D-06).
```

---

## RLS Policies (run in Supabase SQL editor after migration)

```sql
-- Apply to: organizations, users, departments, policies, policy_versions,
-- policy_assignments, acknowledgments, ai_generations, notifications, workflow_stages

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON organizations
  FOR ALL USING (id = auth.jwt()->>'org_id');

-- Repeat pattern for all tables (replace table name, use org_id column):
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON policies
  FOR ALL USING (org_id = auth.jwt()->>'org_id');

-- stripeEvents: no RLS needed (service role only, no user access)
```

---

## Status Enums

Policy status: `draft` | `under_review` | `published` | `archived`
User role: `admin` | `reviewer` | `employee`
Subscription status: `trialing` | `active` | `past_due` | `canceled`
Workflow status: `pending` | `approved` | `rejected`
Notification type: `policy_assigned` | `policy_updated` | `review_due` | `ack_reminder`
AI generation type: `draft` | `summary` | `qa` | `consistency`
