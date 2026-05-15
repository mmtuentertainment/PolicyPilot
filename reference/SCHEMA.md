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

export const aiGenerations = pgTable('ai_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  policyId: uuid('policy_id').references(() => policies.id),
  type: text('type').notNull(), // 'draft' | 'summary' | 'qa' | 'consistency'
  prompt: text('prompt').notNull(),
  result: text('result').notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
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
