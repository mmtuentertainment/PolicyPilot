# Constraints (SPEC Intel)

Extracted from classified SPEC sources. Each constraint preserves its source so downstream consumers can trace provenance. SPECs are precedence 2 — overridden by ADR conflicts (none detected for this ingest).

---

## SPEC-schema-organizations

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
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
```

Unique invariant: `clerkOrgId` and `slug` are both unique. Default `planTier` is `'starter'`; default `stripeSubscriptionStatus` is `'trialing'`.

---

## SPEC-schema-users

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  role: text('role').notNull().default('employee'),
  departmentId: uuid('department_id'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

`clerkUserId` is unique. Default role is `'employee'`. `orgId` is mandatory and FK-bound.

---

## SPEC-schema-departments

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
})
```

---

## SPEC-schema-policies

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

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
```

`status` defaults to `'draft'`. `currentVersion` starts at 1. `reviewIntervalMonths` defaults to 12. `tldrSummary` is nullable (filled at publish time).

---

## SPEC-schema-policy-versions

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  versionNumber: integer('version_number').notNull(),
  contentJson: jsonb('content_json').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

Every edit to a published policy creates a new row.

---

## SPEC-schema-policy-assignments

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const policyAssignments = pgTable('policy_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  assigneeType: text('assignee_type').notNull(), // 'user' | 'department'
  assigneeId: uuid('assignee_id').notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at').defaultNow(),
})
```

`assigneeType` is one of `'user' | 'department'`. `assigneeId` references either `users.id` or `departments.id` depending on type (resolved in application code).

---

## SPEC-schema-acknowledgments (append-only)

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const acknowledgments = pgTable('acknowledgments', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  policyVersionId: uuid('policy_version_id').notNull().references(() => policyVersions.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  acknowledgedAt: timestamp('acknowledged_at').defaultNow(),
  ipAddress: text('ip_address'),
  // NEVER DELETE ROWS — append-only audit trail
})
```

Hard invariant from SPEC comment: never delete rows. See ADR-018.

---

## SPEC-schema-ai-generations

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
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

`type` is one of `'draft' | 'summary' | 'qa' | 'consistency'`. Every Claude API call writes exactly one row here.

---

## SPEC-schema-notifications

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'policy_assigned'|'policy_updated'|'review_due'|'ack_reminder'
  payloadJson: jsonb('payload_json'),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})
```

`type` enum: `policy_assigned | policy_updated | review_due | ack_reminder`. `read` defaults to false.

---

## SPEC-schema-workflow-stages

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const workflowStages = pgTable('workflow_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  stageOrder: integer('stage_order').notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id),
  status: text('status').notNull().default('pending'),
  reviewedAt: timestamp('reviewed_at'),
  comment: text('comment'),
})
```

Used by Growth+ approval workflows. Status enum: `pending | approved | rejected`.

---

## SPEC-schema-stripe-events (idempotency)

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

```typescript
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(), // Stripe event ID (evt_xxx)
  processedAt: timestamp('processed_at').defaultNow(),
})
```

`id` is the Stripe event ID. Used to enforce webhook idempotency (see ADR-020). No RLS — service-role-only access.

---

## SPEC-schema-rls

- source: `reference/SCHEMA.md`
- type: schema / nfr (tenant isolation)

### Constraint

RLS is enabled on: `organizations`, `users`, `departments`, `policies`, `policy_versions`, `policy_assignments`, `acknowledgments`, `ai_generations`, `notifications`, `workflow_stages`.

Pattern:

```sql
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON [table]
  FOR ALL USING (org_id = auth.jwt()->>'org_id');
```

For the `organizations` table, the predicate is `id = auth.jwt()->>'org_id'` (the table's own id is the org id). `stripe_events` is NOT under RLS — service role only.

---

## SPEC-schema-enums

- source: `reference/SCHEMA.md`
- type: schema

### Constraint

Enum values (string-typed in DB; enforced at application layer):

- Policy status: `draft | under_review | published | archived`
- User role: `admin | reviewer | employee`
- Subscription status: `trialing | active | past_due | canceled`
- Workflow status: `pending | approved | rejected`
- Notification type: `policy_assigned | policy_updated | review_due | ack_reminder`
- AI generation type: `draft | summary | qa | consistency`

---

## SPEC-api-ai-draft

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`POST /api/ai/draft`
- Auth: Clerk session, admin role required
- Body: `{ prompt: string, policyType?: string }`
- Process: verify admin role → check `ai_generations` count vs `TIER_LIMITS.aiDraftsMonthly` → build draft system prompt → call `claude-sonnet-4-6` with prompt caching → store in `ai_generations` → return draft.
- Response: `{ draftContent: string, tokensUsed: number }`
- Errors:
  - 403 — not admin
  - 429 — `{ tierLimit: number, currentUsage: number, upgradeUrl: string }`

---

## SPEC-api-ai-summary

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`POST /api/ai/summary`
- Auth: Clerk session, admin role
- Body: `{ policyId: string }`
- Process: fetch policy + verify `org_id` match → return cached `tldrSummary` if present → otherwise call `claude-haiku-4-5` with summary prompt → update `policy.tldrSummary` → return summary.
- Response: `{ summary: string }`

---

## SPEC-api-ai-qa

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`POST /api/ai/qa`
- Auth: Clerk session, any authenticated user
- Body: `{ question: string }`
- Process: fetch all published policies for org (scoped by `org_id`) → build Q&A prompt with policy library using prompt caching → call `claude-sonnet-4-6` → log to `ai_generations` (type `'qa'`) → return answer + citations.
- Response: `{ answer: string, citations: string[] }`

---

## SPEC-api-ai-consistency

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`POST /api/ai/consistency`
- Auth: Clerk session, admin role, Growth+ tier required
- Body: `{}` (uses org's full published policy library)
- Process: verify Growth+ tier → fetch all published policies for org → submit to Claude Batch API (async) → return batch job ID → client polls `/api/ai/consistency/[batchId]` for result.
- Response: `{ batchId: string }`

---

## SPEC-api-stripe-webhook

- source: `reference/API-SPEC.md`
- type: api-contract / protocol

### Constraint

`POST /api/webhooks/stripe`
- Auth: `Stripe-Signature` header, raw body required.
- Events handled:
  - `checkout.session.completed` → upsert subscription record, set `planTier`
  - `invoice.paid` → extend subscription, clear payment_failed flag
  - `invoice.payment_failed` → set `stripeSubscriptionStatus = 'past_due'`
  - `customer.subscription.deleted` → status `'canceled'`, downgrade tier
  - `customer.subscription.updated` → sync `planTier` from price ID
- All events: check `stripe_events` table first (idempotency).
- Response: 200 on success, 400 on signature failure.

---

## SPEC-api-clerk-webhook

- source: `reference/API-SPEC.md`
- type: api-contract / protocol

### Constraint

`POST /api/webhooks/clerk`
- Auth: svix webhook verification headers
- Events handled:
  - `user.created` → INSERT into `users`
  - `organization.created` → INSERT into `organizations`
  - `organizationMembership.created` → sync role to user record
- Response: 200 always (Clerk retries on non-200).

---

## SPEC-api-cron-reminders

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`GET /api/cron/reminders`
- Auth: `Authorization: Bearer {CRON_SECRET}` header
- Schedule: Railway cron, daily at 08:00 UTC
- Process: find policies where `next_review_date <= now + 14 days` → find `policy_assignments` with no acknowledgment older than 7 days → send emails via Resend → insert notification records → return counts.
- Response: `{ reviewReminders: number, ackReminders: number }`

---

## SPEC-api-reports-acknowledgments

- source: `reference/API-SPEC.md`
- type: api-contract

### Constraint

`GET /api/reports/acknowledgments`
- Auth: Clerk session, admin role
- Query: `policyId?`, `departmentId?`, `format=json|csv`
- Process: JOIN `acknowledgments` + `users` + `policies` scoped by `org_id`.
- Response: JSON array or CSV download attachment.

---

## SPEC-prompts-draft

- source: `reference/PROMPTS.md`
- type: protocol (LLM prompt contract)

### Constraint

Sonnet 4.6 draft generation prompt:

```
SYSTEM:
You are a professional HR and compliance writer helping create company policies.
Generate clear, professional, well-structured policy documents.
Always include these sections: Purpose, Scope, Policy Statement, Procedures,
Responsibilities, and Effective Date.
Write for a general business audience — no jargon.
Do not provide legal advice. For compliance-specific policies, add a note
recommending legal review before publishing.

USER:
Write a {policyType} policy for a {companySize} {industry} company.
{additionalContext}
```

Cache the draft system prompt separately (changes rarely).

---

## SPEC-prompts-summary

- source: `reference/PROMPTS.md`
- type: protocol (LLM prompt contract)

### Constraint

Haiku 4.5 TL;DR prompt:

```
SYSTEM:
Summarize the following company policy in plain English.
Maximum 3 sentences. Focus on what employees need to know and do. No jargon.

USER:
{policyContent}
```

Maximum 3 sentences. Plain English.

---

## SPEC-prompts-qa (cache directive)

- source: `reference/PROMPTS.md`
- type: protocol (LLM prompt contract)

### Constraint

Sonnet 4.6 Employee Q&A prompt — system prompt block is cached.

```
SYSTEM:
You are a helpful assistant answering employee questions about company policies.
You may ONLY use the policy documents provided below to answer questions.
If the answer is not in the provided policies, say exactly:
"I couldn't find information about that in our current policies.
Please contact HR directly."
Always cite the specific policy name your answer comes from.
Do not provide legal advice. For any legal question, add:
"For advice specific to your situation, consult your legal team."

--- COMPANY POLICIES ---
{orgPolicyLibrary}   ← CACHE THIS BLOCK (cache_control: ephemeral)
--- END POLICIES ---

USER:
{employeeQuestion}
```

Cache directive: `cache_control: { type: "ephemeral" }` on the policy library block. Target hit rate: 60–80%.

---

## SPEC-prompts-consistency

- source: `reference/PROMPTS.md`
- type: protocol (LLM prompt contract)

### Constraint

Sonnet 4.6 Consistency Check prompt (Batch API). Output is strict JSON only — no prose, no markdown fences.

```
SYSTEM:
You are reviewing a company policy library for contradictions and inconsistencies.
Identify: (1) direct contradictions between policies, (2) conflicting numeric
values such as different PTO accrual rates, (3) undefined terms used across
multiple policies.
Return ONLY a JSON array. No prose. No markdown fences.
Schema: [{ "policy_a": string, "policy_b": string, "issue_type":
"contradiction"|"conflicting_value"|"undefined_term", "description": string,
"severity": "high"|"medium"|"low" }]

USER:
{fullPolicyLibrary}
```

Output schema must validate as a JSON array of objects with the named fields and value enums.

---

## SPEC-tier-limits-constant

- source: `reference/TIER-LIMITS.md`
- type: nfr / feature-gate

### Constraint

`TIER_LIMITS` is the single source of truth in `lib/stripe/products.ts`:

```typescript
export const TIER_LIMITS = {
  starter: {
    maxUsers: 25,
    aiDraftsMonthly: 50,
    approvalWorkflows: false,
    slackIntegration: false,
    consistencyCheck: false,
    customBranding: false,
    sso: false,
    apiAccess: false,
  },
  growth: {
    maxUsers: 100,
    aiDraftsMonthly: 200,
    approvalWorkflows: true,
    slackIntegration: true,
    consistencyCheck: true,
    customBranding: false,
    sso: false,
    apiAccess: false,
  },
  business: {
    maxUsers: 500,
    aiDraftsMonthly: -1,       // unlimited
    approvalWorkflows: true,
    slackIntegration: true,
    consistencyCheck: true,
    customBranding: true,
    sso: true,
    apiAccess: true,
  },
} as const

export type PlanTier = keyof typeof TIER_LIMITS
```

---

## SPEC-tier-limits-prices

- source: `reference/TIER-LIMITS.md`
- type: nfr / billing

### Constraint

Stripe Price IDs and env vars:

- Starter Monthly $79 — `STRIPE_PRICE_STARTER_MONTHLY`
- Starter Annual $759 — `STRIPE_PRICE_STARTER_ANNUAL`
- Growth Monthly $199 — `STRIPE_PRICE_GROWTH_MONTHLY`
- Growth Annual $1,910 — `STRIPE_PRICE_GROWTH_ANNUAL`
- Business Monthly $449 — `STRIPE_PRICE_BUSINESS_MONTHLY`
- Business Annual $4,310 — `STRIPE_PRICE_BUSINESS_ANNUAL`

Annual = 20% discount. All 6 products created in Stripe Dashboard before Phase 6.

---

## SPEC-tier-limits-gate-check

- source: `reference/TIER-LIMITS.md`
- type: api-contract / feature-gate

### Constraint

Gate check function signature:

```typescript
export async function checkTierLimit(
  orgId: string,
  feature: keyof typeof TIER_LIMITS.starter
): Promise<{ allowed: boolean; limit: number; current: number }>
```

On failure: return 403 `{ error: 'tier_limit_exceeded', tierLimit, currentUsage, upgradeUrl: '/pricing' }`.
