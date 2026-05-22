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
//   - Tenant-deletion cascade: every org_id FK is ON DELETE CASCADE.
//     ADR-018's append-only contract is APP-LEVEL; tenant-deletion is a
//     separate lifecycle with explicit data-export prerequisites and no
//     app code path today.
//   - users → departments uses a COMPOSITE FK on (org_id, department_id)
//     so cross-org assignment is rejected by Postgres, not just RLS.
//     The target is the (org_id, id) UNIQUE on departments below.
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
  // Cascade above applies only to org-row deletion; the app-level rule
  // still forbids row-level deletes/updates.
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
  // D-35: Anthropic Usage shape (4 columns; nullable for backward compat in case of mocked
  // responses that omit usage). Replaces the old `tokensUsed` integer column.
  // Phase 8 cost analytics: weighted_token_cost =
  //   input_tokens + cache_creation_input_tokens * 1.25 + cache_read_input_tokens * 0.1 + output_tokens * 5
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cacheReadInputTokens: integer('cache_read_input_tokens'),
  cacheCreationInputTokens: integer('cache_creation_input_tokens'),
  // D-32: optional client-supplied dedup key via Idempotency-Key header (draft endpoint only in Phase 4).
  // Partial-unique index on (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL ships in
  // drizzle/0007_ai_generations_audit_extensions.sql — Drizzle does NOT emit partial indexes from
  // .unique(), so the index is hand-written in the same combined migration.
  idempotencyKey: text('idempotency_key'),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// D-06 + D-29 + D-34: Phase 4 — Anthropic batch state tracking for Consistency Check.
// SDK returns processing_status: 'in_progress' | 'canceling' | 'ended' + request_counts;
// /api/ai/consistency/[batchId]/route.ts translates SDK enum → app `status` enum before
// persisting (RESEARCH § Batch API Mechanics). ai_generations row written ON COMPLETION,
// NOT at submission (preserves SUCCESS-ONLY ai_generations semantic per D-06).
// RLS shipped via drizzle/0006_rls_batch_jobs.sql (hand-written 4-statement block per D-29).
export const batchJobs = pgTable('batch_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  anthropicBatchId: text('anthropic_batch_id').notNull().unique(),
  type: text('type').notNull().default('consistency'),
  status: text('status').notNull().default('in_progress'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  resultJson: jsonb('result_json'),
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
    // Composite-FK target for users(org_id, department_id). PostgreSQL
    // requires a composite FK's referenced columns to back a UNIQUE or PK.
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

export const policyVersions = pgTable(
  'policy_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }), // D-02 denormalization
    policyId: uuid('policy_id').notNull().references(() => policies.id),
    versionNumber: integer('version_number').notNull(),
    contentJson: jsonb('content_json').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    changeSummary: text('change_summary'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    // 03-G3 T2 — UNIQUE(policy_id, version_number) backstop. T1 fixes the
    // primary path (restore() bumps currentVersion so duplicate vN rows
    // can't form). This constraint is belt-and-suspenders: if a future
    // orchestrator change re-introduces the bump skip OR direct SQL
    // bypasses the orchestrators, the schema rejects the duplicate insert
    // loudly instead of letting an ambiguous audit ledger accumulate.
    // Diagnose: .planning/debug/duplicate-policy-version.md
    unique('policy_versions_policy_id_version_number_unique').on(
      table.policyId,
      table.versionNumber,
    ),
  ],
);

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
    // row is invalid and scripts/check-data-layer.ts flags it.
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    role: text('role').notNull().default('employee'),
    // Composite FK on (org_id, department_id) declared below — do NOT
    // add a single-column .references(departments.id) here; that would
    // permit a user in Org A to point at a department in Org B (caught
    // only by RLS at query time, not by Postgres). Nullable is intended.
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
