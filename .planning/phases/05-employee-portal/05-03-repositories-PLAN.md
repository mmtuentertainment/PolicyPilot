---
phase: 05-employee-portal
plan: 03
type: execute
wave: 2
depends_on:
  - 05-01
files_modified:
  - lib/db/repositories/acknowledgments.ts
  - lib/db/repositories/policy_assignments.ts
  - lib/db/repositories/policies.ts
  - lib/db/repositories/qa_citation_grants.ts
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "Acknowledgments.record fills its throw-stub with insert+ON CONFLICT DO NOTHING+RETURNING per D-06+D-10"
    - "PolicyAssignments.create fills its throw-stub with insert+ON CONFLICT DO NOTHING+RETURNING per D-15"
    - "Policies.listAssignedAndPublishedForUser exists returning {...policy, ackState, ackedAt} per D-01..D-04"
    - "QaCitationGrants exports listForUser, upsert, hasGrant per D-29"
    - "All four repository surfaces preserve ADR-018 append-only: NO update/delete keys on Acknowledgments"
    - "tests/types.ts D-07 @ts-expect-error invariants still pass — Acknowledgments still has no update/delete"
  artifacts:
    - path: "lib/db/repositories/acknowledgments.ts"
      provides: "Acknowledgments.record() functional body"
      contains: ".onConflictDoNothing()"
    - path: "lib/db/repositories/policy_assignments.ts"
      provides: "PolicyAssignments.create() functional body"
      contains: ".onConflictDoNothing()"
    - path: "lib/db/repositories/policies.ts"
      provides: "listAssignedAndPublishedForUser method"
      contains: "listAssignedAndPublishedForUser"
    - path: "lib/db/repositories/qa_citation_grants.ts"
      provides: "QaCitationGrants object with 3 methods"
      contains: "upsert"
  key_links:
    - from: "lib/db/repositories/acknowledgments.ts"
      to: "qaCitationGrants UNIQUE constraint"
      via: "ON CONFLICT DO NOTHING returns [] on duplicate; orchestrator treats as silent success per D-10"
      pattern: "onConflictDoNothing"
    - from: "lib/db/repositories/policies.ts listAssignedAndPublishedForUser"
      to: "policy_assignments JOIN + 2x acknowledgments LEFT JOIN"
      via: "drizzle alias() + sql.CASE for ackState enum"
      pattern: "selectDistinct|leftJoin|alias"
---

<objective>
Wave 2 parallel-eligible. Fill three throw-stub repository methods and create one brand-new repository:
1. `Acknowledgments.record(s, input)` — per D-06 + D-10 + D-10a (insert + ON CONFLICT DO NOTHING + empty-RETURNING handled as silent success + ops log)
2. `PolicyAssignments.create(s, input)` — per D-15 (insert + ON CONFLICT DO NOTHING + empty-RETURNING silent success)
3. `Policies.listAssignedAndPublishedForUser(s, userId)` — per D-01..D-04 (single LEFT JOIN query with two aliased acknowledgments joins + SELECT DISTINCT + inline dept-id sub-select per D-03)
4. `lib/db/repositories/qa_citation_grants.ts` (NEW) — exports `QaCitationGrants` with `listForUser` + `upsert` + `hasGrant` per D-29

Purpose: All four are consumed by Wave 2's parallel orchestrator plan (05-04) and Wave 3's page handlers + Server Actions. Repository changes are the contract source — orchestrators import; pages import; actions import. ADR-023 OrgScope-first signature MUST be preserved on every method; ADR-019 `eq(orgId)` MUST appear in every WHERE clause; ADR-018 append-only invariant on `Acknowledgments` MUST NOT be violated (no `update` or `delete` key — type-test in `tests/types.ts` would fail tsc).

Output: Three fills + one new file; tsc clean; ADR-018 + ADR-019 + ADR-023 + ADR-025 + ADR-028 all preserved.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@reference/SCHEMA.md
@lib/db/schema.ts
@lib/db/scoped.ts
@lib/db/repositories/acknowledgments.ts
@lib/db/repositories/policy_assignments.ts
@lib/db/repositories/policies.ts
@lib/db/repositories/policy_versions.ts
@lib/db/repositories/ai_generations.ts
@lib/policies/types.ts
@tests/types.ts

<interfaces>
<!-- Wave 1 (Plan 05-01) shipped these table exports — this plan consumes them. -->

From lib/db/schema.ts (post-Plan 05-01):
```typescript
export const acknowledgments = pgTable('acknowledgments', { id, orgId, policyId, policyVersionId, userId, acknowledgedAt, ipAddress }, [
  index('acknowledgments_org_id_idx'),
  unique('acknowledgments_user_id_policy_id_policy_version_id_unique').on(userId, policyId, policyVersionId),  // Plan 05-01 added
]);
export const policyAssignments = pgTable('policy_assignments', { id, orgId, policyId, assigneeType, assigneeId, assignedBy, assignedAt }, [
  index('policy_assignments_org_id_idx'),
  unique('policy_assignments_policy_id_assignee_type_assignee_id_unique').on(policyId, assigneeType, assigneeId),  // Plan 05-01 added
]);
export const qaCitationGrants = pgTable('qa_citation_grants', { id, orgId, userId, policyId, grantedAt }, [
  unique('qa_citation_grants_org_user_policy_unique').on(orgId, userId, policyId),
  index('qa_citation_grants_org_id_idx'),
  index('qa_citation_grants_user_policy_idx'),
]);
```

From lib/db/scoped.ts:
```typescript
export type OrgScope = { tx: PgTransaction<any,any,any>, orgId: string, userId: string, clerkOrgId: string, clerkUserId: string, role: 'admin'|'reviewer'|'employee' };
export function withOrgScope<T>(ctx: OrgContext, fn: (s: OrgScope) => Promise<T>): Promise<T>;
```

From lib/db/repositories/policies.ts (existing precedent for listPublishedForOrg + listWithFilters):
```typescript
listPublishedForOrg: (s: OrgScope) => s.tx.select({id,title,contentJson}).from(policies).where(and(eq(policies.orgId, s.orgId), eq(policies.status, 'published')))
```

From lib/db/repositories/policy_versions.ts:
```typescript
findByVersionNumber: (s: OrgScope, policyId: PolicyId, versionNumber: number) =>
  s.tx.select().from(policyVersions).where(and(eq(policyVersions.orgId, s.orgId), eq(policyVersions.policyId, policyId), eq(policyVersions.versionNumber, versionNumber))).limit(1)
```

From lib/policies/types.ts:
```typescript
export type PolicyId = z.infer<typeof PolicyIdSchema>;  // branded UUID per ADR-028
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Fill Acknowledgments.record + PolicyAssignments.create bodies + extend Policies with listAssignedAndPublishedForUser</name>
  <files>lib/db/repositories/acknowledgments.ts, lib/db/repositories/policy_assignments.ts, lib/db/repositories/policies.ts</files>
  <read_first>
    - lib/db/repositories/acknowledgments.ts (whole file — 51 lines; replace lines 43-46 throw-stub body; PRESERVE the "NO update/delete" comments at lines 48-50 + the JSDoc header about ADR-018; PRESERVE the `AcknowledgmentRecordInput` Omit type at lines 26-29)
    - lib/db/repositories/policy_assignments.ts (whole file — 37 lines; replace lines 34-36 throw-stub body; PRESERVE the `PolicyAssignmentCreateInput` Omit type at lines 11-14)
    - lib/db/repositories/policies.ts (whole file — `listPublishedForOrg` precedent for the new method's shape; `listWithFilters` precedent for SQL composition with joins)
    - lib/db/repositories/policy_versions.ts (for `findByVersionNumber` shape — pattern to mirror; PolicyId brand usage)
    - lib/db/repositories/ai_generations.ts (for INSERT + RETURNING shape per Phase 4 precedent)
    - lib/db/schema.ts (post-Plan 05-01 — acknowledgments + policyAssignments table options now carry the UNIQUEs; alias() import target for the new method)
    - tests/types.ts (D-07 @ts-expect-error lines — confirm what NOT to add to Acknowledgments)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Dashboard Query (D-01..D-04a) + Acknowledgment Server Action (D-05..D-10c) + Admin Bulk-Assignment UI (D-13..D-17)
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 6 (dept-less-user IN-subquery semantics) + § Pitfall 7 (LEFT JOIN composite index) + § Code Examples (D-01 + D-04 reference query at lines 511-572)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/db/repositories/acknowledgments.ts` (modify - fill record() body)" + "policy_assignments.ts (modify - fill create() body)" + "policies.ts (modify - add listAssignedAndPublishedForUser)"
  </read_first>
  <action>
**Sub-task 1a: Fill `Acknowledgments.record` body per D-06 + D-10.**

Replace the throw at lines 43-46 with a real implementation:
- Method signature unchanged: `record: async (s: OrgScope, input: AcknowledgmentRecordInput) => { ... }`
- Body: `s.tx.insert(acknowledgments).values({ ...input, orgId: s.orgId }).onConflictDoNothing().returning()`
- Capture the inserted array, then implement D-10 silent-success:
  - `if (inserted.length === 0) console.log('[ack] no-op (already acked)', { userId: s.userId, policyId: input.policyId })` (per D-10 verbatim)
  - Return the inserted array (length 0 on conflict, length 1 on fresh) — orchestrator (Plan 05-04) handles the `length === 0` branch as silent success per D-10
- Inline comment near the `.onConflictDoNothing()` line: "D-06 — UNIQUE(user_id, policy_id, policy_version_id) from migration 0010 fires the conflict. D-10 silent-success: empty RETURNING array on duplicate is treated as success (orchestrator + Server Action both return ok=true). UNIQUE intentionally omits org_id — the 3 UUIDs already imply org via composite FK."
- PRESERVE the existing JSDoc header (lines 1-14), the type def (lines 20-29), the `listForUser` method (lines 32-41), and the "NO update method / NO delete method" comments at lines 48-50 verbatim
- DO NOT add `update`, `delete`, or any other write method — the type test in `tests/types.ts` D-07 would fail tsc

**Sub-task 1b: Fill `PolicyAssignments.create` body per D-15.**

Replace the throw at lines 34-36 with:
- Method signature unchanged: `create: async (s: OrgScope, input: PolicyAssignmentCreateInput) => { ... }`
- Body: `s.tx.insert(policyAssignments).values({ ...input, orgId: s.orgId }).onConflictDoNothing().returning()`
- Return the inserted array (length 0 on conflict, length 1 on fresh) — Server Action treats `length === 0` as "already assigned" silent success per D-15
- Inline comment: "D-15 — UNIQUE(policy_id, assignee_type, assignee_id) from migration 0010 fires. UNIQUE permits BOTH (user, X) and (department, X) rows for same policy (different assignee_type); D-01 SELECT DISTINCT dedupes at query time."

**Sub-task 1c: Add `listAssignedAndPublishedForUser` to `Policies` repository per D-01..D-04.**

Add a new method to the `Policies` object export in `lib/db/repositories/policies.ts`. Imports to add at the top:
- `alias` from `drizzle-orm/pg-core` (if not already imported)
- `acknowledgments, policyAssignments, policyVersions, users` schema exports from `@/lib/db/schema` (only add what's missing — `policies` is already imported)
- `or` from `drizzle-orm` (likely already present per the existing `listWithFilters` method)

Method signature: `listAssignedAndPublishedForUser: async (s: OrgScope, userId: string) => { ... }`

Behavior (per D-01..D-04 + RESEARCH § Code Examples reference query):
1. Inline sub-select for the requesting user's `departmentId` per D-03 (no OrgContext extension):
   ```
   const userDeptSubquery = sql`(SELECT ${users.departmentId} FROM ${users} WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId})`
   ```
2. Two acknowledgments aliases per D-04 (currentAck + priorAck):
   ```
   const currentAck = alias(acknowledgments, 'current_ack');
   const priorAck = alias(acknowledgments, 'prior_ack');
   ```
3. Query body using `s.tx.selectDistinct({...}).from(policies).innerJoin(policyAssignments, ...).innerJoin(policyVersions, ...).leftJoin(currentAck, ...).leftJoin(priorAck, ...).where(...)`:
   - SELECT projection includes: `id, title, category, currentVersion, tldrSummary` from policies + `ackState` (CASE per D-04) + `ackedAt: currentAck.acknowledgedAt`
   - INNER JOIN `policyAssignments` on `policyId = policies.id AND policyAssignments.orgId = s.orgId AND (assigneeType='user' AND assigneeId=userId) OR (assigneeType='department' AND assigneeId IN <userDeptSubquery>)` — use `or(and(...), and(...))`
   - INNER JOIN `policyVersions` on `policyId = policies.id AND versionNumber = policies.currentVersion AND orgId = s.orgId`
   - LEFT JOIN `currentAck` on `userId = $userId AND policyId = policies.id AND policyVersionId = policyVersions.id`
   - LEFT JOIN `priorAck` on `userId = $userId AND policyId = policies.id AND policyVersionId <> policyVersions.id` (any prior ack distinct from current)
   - WHERE `policies.orgId = s.orgId AND policies.status = 'published'` (ADR-019 + REQ-access-control)
   - CASE column: `sql<'none' | 'current' | 'stale'>\`CASE WHEN \${currentAck.id} IS NOT NULL THEN 'current' WHEN \${priorAck.id} IS NOT NULL THEN 'stale' ELSE 'none' END\`.as('ack_state')`

JSDoc on the new method (mirror existing `listPublishedForOrg` JSDoc style):
- One paragraph: "D-01..D-04 — Returns published policies assigned to the requesting user (directly OR via their department). Each row carries ackState ('none' | 'current' | 'stale') + ackedAt for the current_version. SELECT DISTINCT dedupes when user is targeted both individually + via dept. Dept-id resolved via inline sub-select per D-03 (no OrgContext extension)."
- Two parameter doc-lines + return-shape comment

DO NOT denormalize `requiresReacknowledgment` as a boolean (D-04 chose the 3-state enum form instead — the UI computes `requires = ackState === 'stale'`). DO NOT add `departmentId` to OrgContext (D-03 explicitly rejects). DO NOT use raw `db` import (RESEARCH Pitfall 6; comment header already documents). DO NOT add `LIMIT` clause (employee lists are bounded by org's assignment count; pagination is deferred to Phase 8 reporting).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -nE "\\.onConflictDoNothing\\(\\)" lib/db/repositories/acknowledgments.ts lib/db/repositories/policy_assignments.ts | wc -l && grep -nE "listAssignedAndPublishedForUser|selectDistinct|alias\\(acknowledgments" lib/db/repositories/policies.ts | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0 — proves the new types resolve including the brand-bearing PolicyId in PolicyAssignmentCreateInput's policyId field
    - `grep -c "throw new Error('Not yet implemented" lib/db/repositories/acknowledgments.ts lib/db/repositories/policy_assignments.ts` returns 0 (both throw-stubs replaced)
    - `grep -cE "\\.onConflictDoNothing\\(\\)" lib/db/repositories/acknowledgments.ts` returns 1
    - `grep -cE "\\.onConflictDoNothing\\(\\)" lib/db/repositories/policy_assignments.ts` returns 1
    - `grep -cE "\\[ack\\] no-op \\(already acked\\)" lib/db/repositories/acknowledgments.ts` returns 1 (D-10 ops log present)
    - `grep -c "listAssignedAndPublishedForUser" lib/db/repositories/policies.ts` returns at least 1
    - `grep -c "selectDistinct" lib/db/repositories/policies.ts` returns at least 1 (D-01 dedup mechanism)
    - `grep -c "alias(acknowledgments" lib/db/repositories/policies.ts` returns at least 2 (currentAck + priorAck per D-04)
    - `grep -c "// NO update method\\|// NO delete method" lib/db/repositories/acknowledgments.ts` returns at least 2 (ADR-018 preservation)
    - Acknowledgments still does NOT export `update` or `delete` (`grep -cE "^\\s*update:\\s*\\(|^\\s*delete:\\s*\\(" lib/db/repositories/acknowledgments.ts` returns 0) — tests/types.ts D-07 invariant still holds
    - `pnpm test --run lib/db/repositories/policies` if existing test file present exits 0 (no regression on `listPublishedForOrg` etc.)
  </acceptance_criteria>
  <done>
    Both throw-stubs replaced with functional ON CONFLICT DO NOTHING bodies; `Policies.listAssignedAndPublishedForUser` exists with the LEFT JOIN dashboard query per D-01..D-04; tsc clean; ADR-018 invariant preserved at type level.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create lib/db/repositories/qa_citation_grants.ts per D-29</name>
  <files>lib/db/repositories/qa_citation_grants.ts</files>
  <read_first>
    - lib/db/repositories/policy_assignments.ts (whole file — closest analog: per-aggregate repo with OrgScope-first listFor* + INSERT-like method)
    - lib/db/repositories/ai_generations.ts (whole file — for the insert + RETURNING shape per Phase 4 D-32 precedent)
    - lib/db/schema.ts (post-Plan 05-01 — `qaCitationGrants` export shape)
    - lib/policies/types.ts (PolicyId brand)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § R-6 Q&A Surface (D-29 verbatim)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/db/repositories/qa_citation_grants.ts` (repository, DB-in/DB-out)"
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 3 (grant UPSERT iterates over post-validIds citations — relevant to upsert() callers, but the upsert method itself is content-agnostic)
  </read_first>
  <action>
Create new file `lib/db/repositories/qa_citation_grants.ts`.

File-header comment (mirror Phase 2 policy_assignments.ts header at lines 1-4):
- Plain-English: "lib/db/repositories/qa_citation_grants.ts — Phase 5 T-2(4c) per-aggregate QaCitationGrants repository (D-29 / Plan 05-01 migration 0011)."
- Rationale: "ADR-023 OrgScope-first; D-02 INSERT copies scope.orgId into the row; D-26 grant-issue step in lib/ai/qa.ts::askQuestion calls upsert() per cited policy (post-validIds-filter per RESEARCH gap-3). hasGrant() is the page-handler predicate for D-27 access decision."
- Pitfall reminder: "RESEARCH Pitfall 6 — NO raw `db` import. See policies.ts header for full rationale."

Imports (mirror existing repository import block):
- `'server-only'`
- `OrgScope` type from `@/lib/db/scoped`
- `qaCitationGrants` from `@/lib/db/schema`
- `and, eq, sql` from `drizzle-orm`
- `PolicyId` from `@/lib/policies/types`

Type for `upsert` input (Drizzle Omit pattern):
```typescript
type QaCitationGrantUpsertInput = Omit<
  typeof qaCitationGrants.$inferInsert,
  'orgId' | 'id' | 'grantedAt'
>;
```
This yields `{ userId: string; policyId: string }` — note `policyId` is typed as `string` here (not branded) because Drizzle's `$inferInsert` reads from the `uuid('policy_id')` column type per ADR-028's "schema-inferred insert inputs are intentionally out of brand scope" rationale at lib/policies/types.ts:23-31. The brand is preserved at the orchestrator boundary in Plan 05-04 (`askQuestion` receives `cit.id` already validated by `parseQaResponse(rawText, validIds)`).

Export the `QaCitationGrants` object with three methods (all OrgScope-first per ADR-023):

1. `listForUser: (s: OrgScope, userId: string)` — selects all grants for `(s.orgId, userId)` and returns the array. Mirror `PolicyAssignments.listForPolicy` shape at lines 23-32.

2. `upsert: async (s: OrgScope, input: QaCitationGrantUpsertInput)` — per D-29 "upsert-or-no-op":
   - Body: `s.tx.insert(qaCitationGrants).values({ ...input, orgId: s.orgId }).onConflictDoNothing().returning()`
   - Return the inserted array (length 0 on existing grant, length 1 on fresh)
   - Inline comment: "D-29 — UNIQUE(org_id, user_id, policy_id) from migration 0011 fires; empty RETURNING on duplicate is treated as 'grant already exists' no-op (idempotent per D-26)."

3. `hasGrant: async (s: OrgScope, userId: string, policyId: PolicyId): Promise<boolean>` — fast predicate for D-27 page-handler access decision:
   - Body: `s.tx.select({ c: sql<number>\`COUNT(*)\`.as('c') }).from(qaCitationGrants).where(and(eq(qaCitationGrants.orgId, s.orgId), eq(qaCitationGrants.userId, userId), eq(qaCitationGrants.policyId, policyId))).limit(1)`
   - Cast the returned `c` to number (Drizzle returns count as string in some drivers); return `Number(rows[0]?.c ?? 0) > 0`
   - Use the composite `qa_citation_grants_user_policy_idx` index from migration 0011 (Postgres planner picks it for the `(userId, policyId)` predicate)
   - PolicyId-branded param per ADR-028 (this method WILL be added to `check-policy-id-brand.ts` REPO_TARGETS in Plan 05-08)

Do NOT export an `update` or `delete` method on this object — grants are write-once (per D-26 "non-expiring grants for MVP"). Do NOT add a TTL/expiry column lookup (D-26 explicitly defers cleanup cron to Phase 7+).

PRESERVE `'server-only'` directive at the top (RESEARCH Pitfall 6 + existing Phase 2 repo convention).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && tsx -e "import { QaCitationGrants } from '@/lib/db/repositories/qa_citation_grants'; if (typeof QaCitationGrants.listForUser !== 'function') throw new Error('FAIL listForUser'); if (typeof QaCitationGrants.upsert !== 'function') throw new Error('FAIL upsert'); if (typeof QaCitationGrants.hasGrant !== 'function') throw new Error('FAIL hasGrant'); console.log('OK QaCitationGrants surface');"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - File `lib/db/repositories/qa_citation_grants.ts` exists
    - `grep -c "export const QaCitationGrants" lib/db/repositories/qa_citation_grants.ts` returns 1
    - `grep -nE "^\\s*(listForUser|upsert|hasGrant):" lib/db/repositories/qa_citation_grants.ts | wc -l` returns 3
    - `grep -c "'server-only'" lib/db/repositories/qa_citation_grants.ts` returns 1
    - `grep -c ".onConflictDoNothing()" lib/db/repositories/qa_citation_grants.ts` returns 1 (upsert idempotency)
    - `grep -cE "^\\s*(update|delete):" lib/db/repositories/qa_citation_grants.ts` returns 0 (no mutation methods)
    - The inline tsx probe (in `<automated>`) exits 0 — all three methods exported as functions
    - File does NOT import `db` from `@/lib/db` (`grep -c "from '@/lib/db'$" lib/db/repositories/qa_citation_grants.ts` returns 0 — only `@/lib/db/scoped` and `@/lib/db/schema` and `@/lib/policies/types` allowed)
  </acceptance_criteria>
  <done>
    New repository file exists, exports 3 methods, follows OrgScope-first ADR-023 pattern, uses ON CONFLICT DO NOTHING for idempotent upsert, no raw `db` import.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repository → DB | All four methods MUST include `eq(orgId)` in WHERE (ADR-019); RLS is the last line of defense, not the primary gate |
| `Policies.listAssignedAndPublishedForUser` → cross-user assignment leak | The dept-id sub-select MUST scope to `(s.orgId, userId)` so a malicious userId param can't smuggle a different user's dept-assignments |
| `QaCitationGrants.upsert` → grant manufacture | Caller (orchestrator) MUST pass already-validated citations (post-parseQaResponse + post-validIds); repository is content-agnostic — its only defense is the UNIQUE constraint (which prevents duplicate-grant pollution but does NOT validate the cit.id was real-Anthropic-output) |
| ack append-only invariant | Acknowledgments object exports `record` + `listForUser` only — NO `update`/`delete` keys; type-test in `tests/types.ts` D-07 + Plan 05-08 ts-morph gate both lock this |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-03-01 | Tampering | Acknowledgments append-only smuggled past type test | mitigate | Plan 05-08 adds `scripts/check-acknowledgment-immutability.ts` ts-morph gate (D-18) scanning lib/**/*.ts for `.update(acknowledgments)` / `.delete(acknowledgments)` calls. This plan satisfies the existing type-test by NOT adding update/delete keys; the new CI gate widens detection to ANY caller in lib/**. |
| T-05-03-02 | Information Disclosure | Cross-user dept-assignment leak via userId param | mitigate | `listAssignedAndPublishedForUser` dept-id sub-select includes `users.orgId = s.orgId` predicate — RLS would also catch but ADR-019 requires app-layer scoping as primary defense. Cross-org composite FK on users(org_id, department_id) → departments(org_id, id) blocks at FK level; passing a userId from another org returns 0 rows (the sub-select returns NULL → IN NULL → UNKNOWN → row excluded per RESEARCH Pitfall 6). |
| T-05-03-03 | Information Disclosure | Cross-org grant manufacture via UUID collision | mitigate | RESEARCH § Pitfall 3 + § Security Domain — `qa_citation_grants.upsert` receives a `policyId` value already filtered by `parseQaResponse(rawText, validIds)` in Plan 05-04 orchestrator. If a hallucinated foreign-org policy UUID collided, the grant row insert would carry the requesting user's `s.orgId`, BUT the page handler at `/my-policies/[id]` (Plan 05-05) re-evaluates assignment + status='published' under RLS — the foreign policy's RLS would deny the SELECT and the page returns 404. The grant row would be orphaned garbage; Phase 7+ cleanup cron deferred per CONTEXT `<deferred>`. |
| T-05-03-04 | Tampering | LEFT JOIN dashboard query falling back to seq scan at scale | accept | RESEARCH § Pitfall 7 — `acknowledgments_user_id_policy_id_policy_version_id_unique` from migration 0010 auto-creates a btree usable by BOTH `current_ack` and `prior_ack` join predicates (prior is a prefix of the unique index). No new index needed in Phase 5. Phase 8 dashboard query may revisit. |
| T-05-03-05 | Repudiation | console.log silent-success (D-10) hides genuine bugs | accept | D-10 explicitly chooses observability via the `[ack] no-op (already acked)` log line for ops monitoring of unusual rates. A future spike in this log = potential UI bug (double-submit not debounced); not a security issue. |
| T-05-03-SC | Tampering | npm installs | accept | No new packages. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0 (proves type-test in tests/types.ts D-07 still passes — Acknowledgments has no update/delete; PolicyId brand still threaded in PolicyAssignmentCreateInput)
- All four repository surfaces functional; ADR-018 + ADR-019 + ADR-023 + ADR-028 preserved
- `pnpm verify:phase-4` still exits 0 (no regression to Phase 1-4 gates; the schema audit in `pnpm check-schema` from Plan 05-01 Task 4 now covers Phase 5 changes too)
</verification>

<success_criteria>
- `Acknowledgments.record` body functional with ON CONFLICT DO NOTHING + D-10 ops log
- `PolicyAssignments.create` body functional with ON CONFLICT DO NOTHING
- `Policies.listAssignedAndPublishedForUser` returns the correct shape with ackState enum + ackedAt timestamp
- `QaCitationGrants` exports listForUser + upsert + hasGrant
- ADR-018 append-only invariant preserved (no update/delete on Acknowledgments)
- tsc clean across all four files
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-03-SUMMARY.md` when done — document the 4 file deltas with line ranges, the SQL composition strategy for the new dashboard method (which JOIN order chosen, why), and confirm ADR-018 type-test still passes.
</output>
