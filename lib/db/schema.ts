// Drizzle schema — 12 tables: 10 tenant-scoped + 2 service-role aux (stripe_events, clerk_events).
//
// Phase 2 schema amendments on top of reference/SCHEMA.md frozen contract:
//   - D-02: org_id denormalized onto policy_versions, policy_assignments,
//           acknowledgments, notifications, workflow_stages (all .notNull()).
//   - D-03a: users.org_id is NULLABLE (no .notNull()) — covers the brief window
//            between user.created and organizationMembership.created webhooks.
//            CHECK constraint enforces 5-minute window (0001_rls_policies.sql).
//   - D-03b: New clerk_events table — service-role only, NO org_id (mirrors
//            stripe_events shape).
//   - 0003 FK hardening (CodeRabbit PR #2): every org_id FK is ON DELETE
//     CASCADE so tenant-offboarding cleanly removes the org's child rows in
//     one transaction (ADR-018's append-only contract is an APP-LEVEL rule;
//     tenant-deletion is a separate lifecycle event with explicit data-export
//     prerequisites — no app code path currently deletes orgs). users
//     references departments via a COMPOSITE FK on (org_id, department_id)
//     so cross-org assignment is rejected by Postgres, not just RLS — the
//     composite target is the unique (org_id, id) constraint added to
//     departments below.
//
// Table order: alphabetical (acknowledgments → ... → workflowStages). Drizzle's
// references(() => organizations.id) defers evaluation, so forward references
// in the file work in any order.
//
// stripe_events + clerk_events do NOT carry org_id — they are service-role
// idempotency tables for webhook handlers (see RESEARCH § "Anti-Patterns to
// Avoid": Don't denormalize org_id onto stripe_events or clerk_events).
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  foreignKey,
  unique,
} from 'drizzle-orm/pg-core';

export const acknowledgments = pgTable('acknowledgments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersions.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at').defaultNow(),
  ipAddress: text('ip_address'),
  // NEVER DELETE OR UPDATE ROWS — append-only audit trail (ADR-018).
  // org_id cascade applies only to tenant-deletion lifecycle (which has no
  // app code path today); it does not weaken the app-level append-only rule.
  // Type-system enforcement lives in lib/db/repositories/acknowledgments.ts
  // (no update / delete keys exported) and tests/types.ts (@ts-expect-error
  // invariants per D-07).
});

export const aiGenerations = pgTable('ai_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').references(() => policies.id),
  type: text('type').notNull(), // 'draft' | 'summary' | 'qa' | 'consistency'
  prompt: text('prompt').notNull(),
  result: text('result').notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const clerkEvents = pgTable('clerk_events', {
  // D-03b: idempotency table for Clerk webhook deliveries. NO org_id —
  // service-role only, mirrors stripe_events. svix-msg-id is the natural key
  // (Clerk re-uses the same svix-msg-id across retries of the same event).
  id: text('id').primaryKey(),
  processedAt: timestamp('processed_at').defaultNow(),
});

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [
    // Required composite-uniqueness target for users(org_id, department_id)
    // composite FK (see users table below). PostgreSQL composite FK target
    // must be either the primary key or a UNIQUE constraint — id alone is
    // PK; adding (org_id, id) UNIQUE here lets the cross-org check land at
    // the DB layer.
    unique('departments_org_id_id_unique').on(table.orgId, table.id),
  ],
);

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'policy_assigned'|'policy_updated'|'review_due'|'ack_reminder'
  payloadJson: jsonb('payload_json'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

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
});

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  contentJson: jsonb('content_json').notNull(),
  // tldrSummary is AI-generated at publish time (ADR-005). Repository
  // create() inputs MUST omit this field — enforced via Omit<..., 'tldrSummary'>
  // in lib/db/repositories/policies.ts and via tests/types.ts @ts-expect-error.
  tldrSummary: text('tldr_summary'),
  category: text('category').notNull(),
  status: text('status').notNull().default('draft'),
  currentVersion: integer('current_version').notNull().default(1),
  reviewIntervalMonths: integer('review_interval_months').default(12),
  nextReviewDate: timestamp('next_review_date'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const policyAssignments = pgTable('policy_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  assigneeType: text('assignee_type').notNull(), // 'user' | 'department'
  assigneeId: uuid('assignee_id').notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at').defaultNow(),
});

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  versionNumber: integer('version_number').notNull(),
  contentJson: jsonb('content_json').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const stripeEvents = pgTable('stripe_events', {
  // Service-role only idempotency table for Stripe webhook deliveries.
  // NO org_id — same rationale as clerk_events.
  id: text('id').primaryKey(),
  processedAt: timestamp('processed_at').defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // D-03a: org_id is NULLABLE (no .notNull()) — covers the brief window
    // between Clerk's user.created webhook and the subsequent
    // organizationMembership.created webhook. The 0001_rls_policies.sql
    // migration adds a CHECK constraint enforcing a 5-minute upper bound on
    // this nullable state. After 5 minutes without an org membership, the
    // row is invalid and scripts/check-data-layer.ts (Plan 02-06) flags it.
    // org_id cascade so tenant-offboarding sweeps users with the org row.
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    role: text('role').notNull().default('employee'),
    // department_id is part of a COMPOSITE FK on (org_id, department_id)
    // declared in the table builder's third arg below; the composite target
    // is departments(org_id, id) (UNIQUE — see departments table). Single-
    // column references() is NOT used here because that would allow a user
    // in Org A to point at a department in Org B and only get caught by
    // RLS at query time. Stays nullable — users without a department
    // assignment are valid.
    departmentId: uuid('department_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.orgId, table.departmentId],
      foreignColumns: [departments.orgId, departments.id],
      name: 'users_org_id_department_id_departments_fk',
    }),
  ],
);

export const workflowStages = pgTable('workflow_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  stageOrder: integer('stage_order').notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  status: text('status').notNull().default('pending'),
  reviewedAt: timestamp('reviewed_at'),
  comment: text('comment'),
});
