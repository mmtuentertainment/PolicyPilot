# Phase 5: Employee Portal - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 32 (new + modified)
**Analogs found:** 32 / 32

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/db/repositories/qa_citation_grants.ts` | repository | DB-in/DB-out | `lib/db/repositories/policy_assignments.ts` | role+flow exact |
| `lib/db/repositories/acknowledgments.ts` (modify) | repository | DB-out | self (Phase 5 fills throw-stub) + `lib/db/repositories/ai_generations.ts` (insert+RETURNING) | exact (own file) |
| `lib/db/repositories/policy_assignments.ts` (modify) | repository | DB-out | self (Phase 5 fills throw-stub) + `lib/db/repositories/ai_generations.ts` | exact (own file) |
| `lib/db/repositories/policies.ts` (modify) | repository | DB-in (LEFT JOIN) | `lib/db/repositories/policies.ts::listPublishedForOrg` + `lib/db/repositories/policies.ts::listWithFilters` | exact (extends file) |
| `lib/policies/acknowledgment.ts` | orchestrator | tx-wrapped DB-out | `lib/policies/transitions.ts::publish` (withOrgScope + loadAndAssertTransition + tx-INSERT) | role+flow exact |
| `lib/ai/qa.ts` | orchestrator | tx-wrapped AI + DB-in/DB-out | `app/api/ai/qa/route.ts` (extract lines 41-117 verbatim) + `lib/policies/transitions.ts::publish` | exact (refactor source) |
| `lib/policies/errors.ts` | errors | (no flow) | `lib/auth/errors.ts` (abstract base + readonly code + this.name) | exact mirror per D-30 |
| `app/(employee)/layout.tsx` | route layout | HTTP-in (auth gate) | `app/(admin)/layout.tsx` (minus requireAdmin + sidebar; minimal version) | role-match (different gate) |
| `app/(employee)/my-policies/page.tsx` | route page (RSC) | HTTP-in / DB-in / HTML-out | `app/(admin)/policies/page.tsx` (RSC + withOrgScope + Card empty-state + Table render) | exact |
| `app/(employee)/my-policies/[id]/page.tsx` | route page (RSC) | HTTP-in / DB-in / HTML-out | `app/(admin)/policies/[id]/page.tsx` (notFound + PolicyIdSchema.safeParse + withOrgScope + PolicyView reuse) | exact for full branch + new TL;DR branch per D-27 |
| `app/(employee)/my-policies/[id]/actions.ts` | server action | HTTP-in / DB-out | `app/(admin)/policies/[id]/actions.ts::publishAction` (Zod + try/catch + revalidatePath outside try) | exact (D-09 convention) |
| `app/(employee)/my-policies/ask/page.tsx` | route page (RSC) | HTTP-in / HTML-out | `app/(admin)/policies/page.tsx` (RSC shell + Client form) — closest existing | role-match (shell-only) |
| `app/(employee)/my-policies/ask/actions.ts` | server action | HTTP-in / AI / DB-out | `app/(admin)/policies/[id]/actions.ts::editPublishedAction` (Zod parse complex payload) + `lib/ai/qa.ts` (new orchestrator from D-25) | exact (D-09 shape) |
| `app/(admin)/policies/[id]/actions.ts` (modify - add bulkAssignToDepartmentAction) | server action | HTTP-in / DB-out | self (existing transition actions in same file) | exact (own file) |
| `app/(admin)/policies/[id]/page.tsx` (modify - add PolicyAssignmentsPanel placement) | route page | HTML-out | self (existing header + PolicyTransitionMenu) | exact (own file) |
| `components/policy/AckStatusBadge.tsx` | component | HTML-out | `components/policy/PolicyStatusBadge.tsx` (exhaustive switch + Badge className override) | exact (locked by D-11) |
| `components/admin/PolicyAssignmentsPanel.tsx` | component | HTML-out (RSC list + Client form) | `components/admin/ConsistencyCheckRunner.tsx` (Client component shape) + admin sidebar list patterns | role-match |
| `scripts/check-acknowledgment-immutability.ts` | CI gate | file-system-in / process-out | `scripts/check-policy-id-brand.ts` (ts-morph Project + getSourceFile + getVariableDeclarations) | exact (D-18 locked) |
| `scripts/check-employee-portal.ts` | CI gate (integration) | DB-in / process-out | `scripts/check-policies-list-filters.ts` (raw postgres-js + BYPASSRLS seed + withOrgScope + TRUNCATE) + `scripts/check-rls.ts` (SET LOCAL ROLE + set_config + intentional ROLLBACK) | exact (D-22 locked) |
| `scripts/check-rls.ts` (modify - add qa_citation_grants) | CI gate | DB-in | self (extend TENANT_TABLES const + TRUNCATE loops) | exact (own file) |
| `scripts/check-policy-id-brand.ts` (modify - add Phase 5 brand surfaces) | CI gate | file-system-in | self (extend REPO_TARGETS + OBJECT_FIELD_TARGETS) | exact (own file) |
| `scripts/check-schema.ts` (modify - Phase 5 column-shape assertions) | CI gate | DB-in | self (extend TENANT_TABLES + add column assertion block) | exact (own file) |
| `scripts/check-artifacts.ts` (modify - Phase 5 block) | CI gate | file-system-in | self (Phase 4 block at line 1500+; `// ─── Phase 4 (AI Layer)` divider pattern) | exact (own file) |
| `scripts/check-error-discipline.ts` (modify - widen to lib/policies/**) | CI gate | file-system-in | self (Phase 4 widened pattern) | exact (own file) |
| `lib/db/schema.ts` (modify - 2 UNIQUE + qaCitationGrants) | schema | (no flow) | self (`policyVersionsPolicyIdVersionNumberUnique` at lines 200-211) + `departments` table at 117-129 | exact (own file precedent) |
| `drizzle/0010_phase5_uniques.sql` | migration | (no flow) | `drizzle/0007_ai_generations_audit_extensions.sql` (header + statement-breakpoint pattern + operator-approval doc) | exact (D-28 bundle pattern) |
| `drizzle/0011_qa_citation_grants.sql` | migration | (no flow) | `drizzle/0001_rls_policies.sql` (CREATE TABLE + ALTER TABLE ENABLE RLS + CREATE POLICY + GRANT block) + `drizzle/0008_rls_subquery_wrap.sql` (wrapped `(SELECT auth.jwt()->>'org_id')` form) | exact (per D-29 + RESEARCH gap-1) |
| `lib/db/repositories/acknowledgments.test.ts` | test (co-located) | DB-in / DB-out (vitest) | `app/(admin)/policies/[id]/actions.test.ts` (vi.mock + beforeEach + FormData helper) — closest co-located unit pattern | role-match |
| `lib/db/repositories/policy_assignments.test.ts` | test | same | same | role-match |
| `lib/db/repositories/policies.test.ts` (extend) | test | same | same | role-match |
| `lib/db/repositories/qa_citation_grants.test.ts` | test | same | same | role-match |
| `lib/policies/acknowledgment.test.ts` | test | same | `lib/policies/transitions.test.ts` (orchestrator test pattern) | exact (mirror transitions.test.ts) |
| `app/(employee)/my-policies/[id]/actions.test.ts` | test | same | `app/(admin)/policies/[id]/actions.test.ts` (vi.mock for transitions + next/cache + auth/context + scoped) | exact |
| `app/(employee)/my-policies/ask/actions.test.ts` | test | same | `app/(admin)/policies/[id]/actions.test.ts` (vi.mock pattern with `@/lib/ai/qa` as the mocked module) | role-match |
| `tests/fixtures/ack-mutation-attempt.ts` | fixture | (no flow) | none (new negative-control pattern; D-20 specifies shape) | new-pattern (no analog in codebase) |
| `package.json` (modify - 3 new scripts + verify:phase-5 chain) | config | (no flow) | self (existing `check:policy-id-brand`, `check:rls`, `verify:phase-4` script entries) | exact (own file precedent) |

## Pattern Assignments

### `lib/db/repositories/qa_citation_grants.ts` (repository, DB-in/DB-out)

**Analog:** `lib/db/repositories/policy_assignments.ts` (full file — closest role+flow match: simple per-aggregate repo with OrgScope-first listFor* + create-like INSERT)

**Imports + Input type pattern** (lines 1-14):
```typescript
// lib/db/repositories/policy_assignments.ts
// L-03 + D-06: per-aggregate PolicyAssignments repository.
// D-02: INSERT copies scope.orgId into the row.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyAssignments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

type PolicyAssignmentCreateInput = Omit<
  typeof policyAssignments.$inferInsert,
  'orgId' | 'id' | 'assignedAt'
>;
```

**Object-literal + OrgScope-first method pattern** (lines 16-37):
```typescript
export const PolicyAssignments = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(policyAssignments)
      .where(eq(policyAssignments.orgId, s.orgId)),

  listForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .select()
      .from(policyAssignments)
      .where(
        and(
          eq(policyAssignments.orgId, s.orgId),
          eq(policyAssignments.policyId, policyId),
        ),
      ),
```

**Secondary analog for UPSERT-with-ON-CONFLICT-DO-NOTHING semantics:** `lib/db/repositories/ai_generations.ts::insert` lines 73-80 (pattern is `s.tx.insert(table).values({...input, orgId: s.orgId}).returning()`).

**Phase 5 deviations per D-29:**
- Export `listForUser(s, userId)` (mirror `listForPolicy` shape but filter on `userId`)
- Export `upsert(s, { userId, policyId })` — chain `.onConflictDoNothing()` AFTER `.values({})` BEFORE `.returning()` per Drizzle 0.45.2 API; the UNIQUE (org_id, user_id, policy_id) constraint named `qa_citation_grants_org_user_policy_unique` from migration 0011 fires the conflict
- Export `hasGrant(s, userId, policyId)` returning `Promise<boolean>` — use `s.tx.select({c: sql<number>...count}).from(qaCitationGrants).where(and(eq(orgId), eq(userId), eq(policyId))).limit(1)` returning `rows[0]?.c > 0`
- Brand-bearing: `policyId: PolicyId` per ADR-028 (this file MUST be added to REPO_TARGETS + OBJECT_FIELD_TARGETS in `scripts/check-policy-id-brand.ts` per RESEARCH gap-4)

---

### `lib/db/repositories/acknowledgments.ts` (modify - fill record() body)

**Analog:** Self (lines 31-51) is the throw-stub; planner replaces lines 43-46 with real body. Insert-with-ON-CONFLICT-DO-NOTHING pattern lives in Drizzle docs; closest Phase 4 pattern is the partial-unique idempotency setup in `lib/db/repositories/ai_generations.ts:73-80` (insert + RETURNING) combined with the new D-06 UNIQUE schema constraint.

**Current state — to replace** (lines 43-46):
```typescript
  // Phase 5 (Employee Portal) fills the body. Type signature is locked.
  record: (_s: OrgScope, _input: AcknowledgmentRecordInput) => {
    throw new Error('Not yet implemented — Phase 5 (Employee Portal)');
  },
```

**Input type already locked** (lines 26-29):
```typescript
type AcknowledgmentRecordInput = Omit<
  typeof acknowledgments.$inferInsert,
  'orgId' | 'id' | 'acknowledgedAt'
>;
```

**Append-only invariant — DO NOT add** (lines 48-50):
```typescript
  // NO update method. ADR-018 append-only.
  // NO delete method. ADR-018 append-only.
  // If you find yourself wanting to add one, STOP — read ADR-018 first.
```

**Phase 5 body shape per D-06+D-10**:
- Chain `s.tx.insert(acknowledgments).values({...input, orgId: s.orgId}).onConflictDoNothing().returning()`
- The UNIQUE (user_id, policy_id, policy_version_id) constraint from migration 0010 fires; empty RETURNING array = silent-success per D-10
- D-10 ops log: `if (inserted.length === 0) console.log('[ack] no-op (already acked)', { userId: s.userId, policyId: input.policyId });`
- D-18 ts-morph gate scans for `.update(acknowledgments)` / `.delete(acknowledgments)` in this file — keep it write-once via `.insert()` only

---

### `lib/db/repositories/policy_assignments.ts` (modify - fill create() body)

**Analog:** Self (lines 34-36) throw-stub. Insert-with-ON-CONFLICT-DO-NOTHING pattern same as acknowledgments above.

**Current state — to replace**:
```typescript
  create: (_s: OrgScope, _input: PolicyAssignmentCreateInput) => {
    throw new Error('Not yet implemented — Phase 5 (Employee Portal — bulk assign)');
  },
```

**Phase 5 body shape per D-15**:
- `s.tx.insert(policyAssignments).values({...input, orgId: s.orgId}).onConflictDoNothing().returning()`
- The UNIQUE (policy_id, assignee_type, assignee_id) constraint from migration 0010 fires; empty RETURNING = "already assigned" silent-success
- ADR-028 brand: `input.policyId: PolicyId` (existing throw-stub already declares); add this file to OBJECT_FIELD_TARGETS in check-policy-id-brand.ts per RESEARCH gap-4

---

### `lib/db/repositories/policies.ts` (modify - add listAssignedAndPublishedForUser)

**Analog:** Self — `listPublishedForOrg` (lines 70-83) is the closest existing pattern.

**Imports + scope pattern already in file** (lines 20-25):
```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policies } from '@/lib/db/schema';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { PolicyStatus } from '@/lib/policies/state-machine';
import type { PolicyId } from '@/lib/policies/types';
```

**`listPublishedForOrg` precedent** (lines 70-83):
```typescript
listPublishedForOrg: (s: OrgScope) =>
  s.tx
    .select({
      id: policies.id,
      title: policies.title,
      contentJson: policies.contentJson,
    })
    .from(policies)
    .where(
      and(
        eq(policies.orgId, s.orgId),
        eq(policies.status, 'published'),
      ),
    ),
```

**`listWithFilters` SQL composition precedent for joins** (lines 112-134):
```typescript
listWithFilters: async (
  s: OrgScope,
  { q, status }: { q?: string; status?: PolicyStatus },
) => {
  const conditions = [eq(policies.orgId, s.orgId)];
  if (status) conditions.push(eq(policies.status, status));
  const baseWhere = and(...conditions);
  // ... or/ilike composition ...
  return s.tx
    .select()
    .from(policies)
    .where(where)
    .orderBy(desc(policies.updatedAt))
    .limit(100);
},
```

**Phase 5 deviations per D-01..D-04:**
- New method `listAssignedAndPublishedForUser(s: OrgScope, userId: string)` — userId is `string` (not branded; users.id is uuid but no UserId brand exists)
- Must import `alias` from `drizzle-orm/pg-core`, plus `acknowledgments`, `policyAssignments`, `policyVersions`, `users` schema exports
- Inline sub-select for userDeptId per D-03 (NO OrgContext extension):
  ```typescript
  const userDeptSubquery = sql`(
    SELECT ${users.departmentId} FROM ${users}
    WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId}
  )`;
  ```
- Two aliased acknowledgments joins per D-04 (currentAck vs priorAck)
- `SELECT DISTINCT` per D-01 (dedup when user is targeted both individually + via department)
- Return shape per D-04: `{ ...policy, ackState: 'none' | 'current' | 'stale', ackedAt: Date | null }`
- D-04 CASE expression via `sql<'none' | 'current' | 'stale'>` literal-union type tag
- See full reference query in RESEARCH.md lines 511-572

---

### `lib/policies/acknowledgment.ts` (orchestrator, tx-wrapped DB-out)

**Analog:** `lib/policies/transitions.ts::publish` (lines 153-216) — closest match: withOrgScope-wrapped orchestrator that loads + validates + writes inside one tx.

**Imports + file-header rationale pattern** (lines 1-48):
```typescript
// lib/policies/transitions.ts
// Plan 03-06 Task 2 (GREEN) — server-only orchestrators (D-03 + D-04 + L-05).
//
// These 7 functions are the AUTHORITATIVE gate for every policy state
// change. Plan 03-07's Server Actions are thin wrappers; the real
// transactional business logic lives here. Each orchestrator:
//   1. Resolves OrgContext via getOrgContext (Clerk session)
//   2. Opens withOrgScope (one Drizzle transaction + SET LOCAL ROLE
//      authenticated + set_config('request.jwt.claims', ..., true) so
//      Supabase RLS evaluates against the actual ctx.orgId — ADR-025).
// ...
// MUST NOT import raw `db` from '@/lib/db' — use withOrgScope's s.tx
// for any direct policies-table updates.
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { withOrgScope, type OrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
```

**load-and-assert helper pattern** (lines 70-88):
```typescript
async function loadAndAssertTransition(
  s: OrgScope,
  policyId: PolicyId,
  to: PolicyStatus,
): Promise<PolicyRow> {
  const rows = await Policies.findById(s, policyId);
  const row = rows[0];
  if (!row) throw new Error('Policy not found');
  const policy: PolicyRow = {
    id: row.id,
    status: row.status as PolicyStatus,
    currentVersion: row.currentVersion,
    contentJson: row.contentJson,
  };
  // ... validate transition ...
  return policy;
}
```

**Core orchestrator pattern — withOrgScope wraps load + write atomically** (lines 153-173):
```typescript
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    await PolicyVersions.create(s, {
      policyId,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: s.userId,
    });
    await s.tx
      .update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
  // ... post-commit hooks OUTSIDE the tx ...
}
```

**PolicyVersions.findByVersionNumber pattern for D-10a resolution** (`lib/db/repositories/policy_versions.ts` lines 86-101):
```typescript
findByVersionNumber: (
  s: OrgScope,
  policyId: PolicyId,
  versionNumber: number,
) =>
  s.tx
    .select()
    .from(policyVersions)
    .where(
      and(
        eq(policyVersions.orgId, s.orgId),
        eq(policyVersions.policyId, policyId),
        eq(policyVersions.versionNumber, versionNumber),
      ),
    )
    .limit(1),
```

**Phase 5 deviations per D-10a:**
- Exported function name: `recordAcknowledgment(ctx, policyId, ipAddress)` (or planner's chosen name; must appear in ORCH_TARGETS of `scripts/check-policy-id-brand.ts` per RESEARCH gap-4)
- Single `withOrgScope` wraps THREE operations atomically per D-10a:
  1. `Policies.findById(s, policyId)` — assert `status === 'published'` else throw `PolicyArchivedError` per D-07
  2. Assignment check — query `policy_assignments` matching `(policy_id=policyId AND (assignee_user=userId OR assignee_dept=usersDept))`; throw `PolicyNotAssignedError` per D-08 on no match
  3. `PolicyVersions.findByVersionNumber(s, policyId, policy.currentVersion)` to resolve policyVersionId
  4. `Acknowledgments.record(s, { userId: s.userId, policyId, policyVersionId, ipAddress })` — uses ON CONFLICT DO NOTHING per D-06
- All four operations roll back together if any throw (D-10a single-transaction invariant)
- NO post-commit hook (different from publish() — no Anthropic call to fire)
- Errors imported from new `lib/policies/errors.ts` (per D-30)

---

### `lib/ai/qa.ts` (orchestrator, tx-wrapped AI + DB-in/DB-out)

**Analog:** `app/api/ai/qa/route.ts` lines 41-117 — the EXACT source code to extract per D-25/T-3=A.

**Source to extract — D-41 same-closure validIds defense** (lines 41-117):
```typescript
export async function POST(req: Request): Promise<Response> {
  // D-37 — auth OUTSIDE try. Q&A allows any-authenticated; getOrgContext throws if no session.
  const ctx = await getOrgContext();

  try {
    const body = QaSchema.parse(await req.json());

    // D-41 — validIds + libraryXml MUST be constructed inside the SAME withOrgScope closure.
    const result = await withOrgScope(ctx, async (s) => {
      const policies = await Policies.listPublishedForOrg(s);
      const validIds = new Set(policies.map((p) => p.id));     // ← D-41 SAME closure

      const libraryXml = policies
        .map((p) =>
          `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`,
        )
        .join('\n');

      // D-33c ordering — LONG_CACHE first (per-org library, 1h TTL), EPHEMERAL second
      const response = await getAnthropicClient().messages.create({
        model: MODEL_SONNET,
        max_tokens: 1024,
        system: [
          ...buildLongCachedSystem(libraryXml),                  // 1h TTL (per-org)
          ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),       // 5min TTL (static)
        ],
        messages: [{ role: 'user', content: body.question }],
      });

      // D-40 cold-miss observability.
      const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
      const cacheRead = response.usage.cache_read_input_tokens ?? 0;
      const inputTokens = response.usage.input_tokens ?? 0;
      if (cacheCreation === 0 && cacheRead === 0) {
        console.warn('[ai/qa] cache miss likely', {
          orgId: ctx.orgId,
          inputTokens,
          likelyCause: inputTokens < 1024 ? 'below_1024_token_minimum_sonnet' : 'unknown',
        });
      }

      const rawText = extractText(response);

      // WARNING-4 lock — DO NOT change this to parsed `answer`.
      await AiGenerations.insert(s, {
        policyId: null,
        type: 'qa',
        prompt: body.question,
        result: rawText,
        inputTokens: response.usage.input_tokens ?? null,
        outputTokens: response.usage.output_tokens ?? null,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
        idempotencyKey: null,
        model: MODEL_SONNET,
      });

      // D-41 — strip hallucinated IDs via the validIds Set built in this same closure.
      return parseQaResponse(rawText, validIds);
    });

    return NextResponse.json(result);
  } catch (err) { /* ... */ }
}
```

**Phase 5 deviations per D-25 + D-26 + D-27a + RESEARCH gap-3:**
- New file `lib/ai/qa.ts` exports `askQuestion(ctx: OrgContext, question: string): Promise<{ answer: string; citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[] }>`
- Body lifts route.ts lines 51-115 verbatim INSIDE the function (no try/catch — caller handles errors)
- After `parseQaResponse(rawText, validIds)` returns `{ answer, citations }`:
  1. For each `cit` in `result.citations` (POST-validIds-filter per RESEARCH gap-3 — NOT raw fence JSON), call `QaCitationGrants.upsert(s, { userId: s.userId, policyId: cit.id })`
  2. Annotate accessibility flag per D-27a: build `Set<assignedPolicyIds>` via cheap `listAssignedPolicyIdsForUser` query (or reuse existing query result if available), then map citations to `{title, id, accessibility: assigned.has(id) ? 'full' : 'tldr-only'}`
  3. Both operations stay INSIDE the same `withOrgScope` closure (atomicity)
- Refactor `app/api/ai/qa/route.ts` to a thin ~30-line wrapper: `const result = await askQuestion(ctx, body.question); return NextResponse.json(result);` — preserving auth-outside-try, ZodError 400 branch, Anthropic.APIError 503 branch
- HTTP contract UNCHANGED (D-25 invariant) — `app/api/ai/qa/route.ts` shape preserved for any future external consumers

---

### `lib/policies/errors.ts` (errors, no flow)

**Analog:** `lib/auth/errors.ts` (full file) per D-30 explicit mirror.

**Stable code union pattern** (lines 31-37):
```typescript
export type BootstrapErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NO_ACTIVE_ORGANIZATION'
  | 'INVALID_ROLE'
  | 'ORG_NOT_PROVISIONED'
  | 'USER_NOT_PROVISIONED'
  | 'FORBIDDEN';
```

**Abstract base class with readonly code field** (lines 51-53):
```typescript
export abstract class BootstrapError extends Error {
  abstract readonly code: BootstrapErrorCode;
}
```

**Concrete subclass shape — constructor + literal code + explicit this.name** (lines 61-67):
```typescript
export class NotAuthenticatedError extends BootstrapError {
  readonly code = 'NOT_AUTHENTICATED';
  constructor() {
    super('Not authenticated: no Clerk session');
    this.name = 'NotAuthenticatedError';
  }
}
```

**Subclass with public-readonly diagnostic field** (lines 86-92):
```typescript
export class InvalidRoleError extends BootstrapError {
  readonly code = 'INVALID_ROLE';
  constructor(public readonly value: unknown) {
    super(`Invalid role on session claims: ${String(value)}`);
    this.name = 'InvalidRoleError';
  }
}
```

**Phase 5 deviations per D-30:**
- Export `PolicyDomainErrorCode` type union: `'POLICY_NOT_FOUND' | 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED'`
- Export `abstract class PolicyDomainError extends Error { abstract readonly code: PolicyDomainErrorCode; }`
- Export 3 concrete classes: `PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError` — each with literal `code` field, explicit `this.name`, and (optionally) `public readonly policyId: string` for structured-log routing
- Widen `scripts/check-error-discipline.ts` to scan `lib/policies/**` (per D-30 + Phase 4 lib/stripe/** precedent)

---

### `app/(employee)/layout.tsx` (route layout, HTTP-in auth gate)

**Analog:** `app/(admin)/layout.tsx` (full file) — closest existing layout pattern.

**Force-dynamic + auth-gate header pattern** (lines 1-23):
```typescript
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
// ...
// Every admin route reads Clerk's session via requireAdmin() → headers(),
// AND reads the sidebar_state cookie below — both inherently dynamic. Next.js
// 15 still attempts static prerender on child pages unless the layout
// declares this explicitly; Vercel build prerender of /dashboard/consistency
// failed without it (ClerkAuthFailedError during DYNAMIC_SERVER_USAGE).
export const dynamic = "force-dynamic";

/**
 * Admin route-group layout (D-06 shell + L-01 authoritative gate).
 *
 * requireAdmin() runs unconditionally — calls notFound() (HTTP 404) on
 * non-admin role per D-10 "advertise nothing".
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  await requireAdmin();
  // ...
}
```

**Phase 5 deviations per SPEC In-Scope + D-24:**
- NO `requireAdmin()` — minimal auth gate per SPEC ("any authenticated `userId`, no role narrowing — admins can also be policy-assigned")
- Replace `await requireAdmin();` with `await getOrgContext();` (throws BootstrapError on no-session; Next.js error boundary handles)
- KEEP `export const dynamic = "force-dynamic";` (same getOrgContext + headers() dynamicism)
- NO AdminSidebar / OrganizationSwitcher (employee portal is bare; planner has discretion on UserButton + minimal shell)
- Minimal `<main>{children}</main>` body is sufficient per SPEC boundary

---

### `app/(employee)/my-policies/page.tsx` (route page RSC, HTTP-in / DB-in / HTML-out)

**Analog:** `app/(admin)/policies/page.tsx` (full file) — closest RSC list pattern with withOrgScope + Card empty-state + Table.

**RSC + withOrgScope + repository call pattern** (lines 76-88):
```typescript
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const q = sp.q?.trim() || undefined;

  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) =>
    Policies.listWithFilters(s, { q, status }),
  );
```

**Empty-state Card pattern** (lines 135-152):
```typescript
{empty && !isSearching ? (
  <Card>
    <CardHeader>
      <CardTitle>No policies yet</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground mb-4">
        Create your first policy to start building your library. Drafts
        are private until you publish.
      </p>
      <Link
        href="/policies/new"
        className={buttonVariants({ variant: "default" })}
      >
        Create your first policy
      </Link>
    </CardContent>
  </Card>
```

**Table render pattern** (lines 172-212): full Table/TableHeader/TableBody/TableRow/TableCell composition.

**Phase 5 deviations per D-01..D-04 + D-04a + R-6 affordance:**
- Call `Policies.listAssignedAndPublishedForUser(s, ctx.userId)` instead of `listWithFilters`
- Header includes "Ask the AI" Link affordance per D-24/R-6 (left sibling of any other header content; navigates to `/my-policies/ask`)
- Empty-state copy locked per D-04a: `"No policies assigned yet — contact your administrator."`
- Row render: each card/row shows `<AckStatusBadge ackState={row.ackState} ackedAt={row.ackedAt} />`
- Card link to `/my-policies/${row.id}` for detail page navigation
- NO PolicyListSearch / PolicyStatusFilter (admin list filters; employee list doesn't need them in Phase 5)
- NO "Create policy" button (admin only)

---

### `app/(employee)/my-policies/[id]/page.tsx` (route page RSC, HTTP-in / DB-in / HTML-out, D-27 access-aware)

**Analog:** `app/(admin)/policies/[id]/page.tsx` (full file) — closest RSC detail pattern with notFound + PolicyIdSchema.safeParse + PolicyView.

**RSC detail with PolicyIdSchema.safeParse boundary** (lines 40-65):
```typescript
export default async function EditPolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  // ...
  // ADR-028 + CR-PR3-#23 spirit at the page boundary. The URL `id` segment
  // is a raw string; `policies.id` is a Postgres `uuid` column. A non-UUID
  // value would previously trigger 22P02 invalid_text_representation at
  // the DB layer → unhandled exception → Next.js 500.
  // Per D-10 "advertise nothing", malformed URLs return the same 404 as a
  // missing/cross-org policy, not a 500.
  const idParsed = PolicyIdSchema.safeParse(id);
  if (!idParsed.success) notFound();

  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) => Policies.findById(s, idParsed.data));
  const policy = rows[0];
  if (!policy) notFound();
  const status = policy.status as PolicyStatus;
```

**PolicyView reuse** (admin page uses EditPolicyForm; for employee read-only, reuse PolicyView):
`components/policy/PolicyView.tsx` lines 21-29:
```typescript
export function PolicyView({ content }: { content: JSONContent }) {
  const html = generateHTML(content, [StarterKit, Link]);
  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Phase 5 deviations per D-27 (3-branch access logic):**
- After PolicyIdSchema.safeParse passes, branch per D-27:
  ```
  if assigned-and-published(userId, policyId) → render full PolicyView + AckStatusBadge + Acknowledge button
  else if has-grant(orgId, userId, policyId) AND status='published' → render TL;DR-only view + banner
  else → notFound() // 404
  ```
- "assigned-and-published" check: reuse `Policies.listAssignedAndPublishedForUser(s, userId)` result and `.find(r => r.id === policyId)`, OR add a new repository method `isAssignedAndPublished(s, userId, policyId): Promise<boolean>` (planner's discretion per CONTEXT)
- "has-grant" check: `QaCitationGrants.hasGrant(s, userId, policyId)` per D-29
- TL;DR-only view: render `policy.tldrSummary` only (no PolicyView call); add banner with EXACT copy per CONTEXT specifics:
  > "This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access."
- Acknowledge button (full branch only) is a Client Component that submits to `acknowledgePolicyAction` via React 19 `useActionState` per D-24/R-2
- Acknowledge button render branches on `row.ackState` per D-11 (none → "Acknowledge"; stale → "Re-acknowledge"; current → "Acknowledged on {date}" no button)

---

### `app/(employee)/my-policies/[id]/actions.ts` (server action, HTTP-in / DB-out)

**Analog:** `app/(admin)/policies/[id]/actions.ts::publishAction` (lines 199-212) — closest Server Action shape (Zod + try/catch + revalidatePath outside try).

**File-header + imports** (lines 1-38):
```typescript
'use server';
// app/(admin)/policies/[id]/actions.ts — Plan 03-07 (D-09) Task 2.
//
// All transition Server Actions ultimately wrap their orchestrator's
// withOrgScope() — see lib/policies/transitions.ts.
// ...
// Threat-model wiring (T-03-07-01..05):
//   - Forged status field cannot reach the policies row: ...
//   - Error disclosure: IllegalTransitionError surfaces a typed
//     `{ ok: false, error: <message> }`; unexpected errors are logged
//     server-side and bubble to Next.js' framework boundary.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
// ...
import { PolicyIdSchema, type PolicyId } from '@/lib/policies/types';

export type ActionState = { ok: true } | { ok: false; error: string };
```

**policyIdFrom helper at trust boundary** (lines 71-98):
```typescript
function policyIdFrom(formData: FormData): PolicyId | null {
  const raw = formData.get('policyId');
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  // ADR-028: `safeParse(id).data` carries the `PolicyId` brand.
  const parsed = PolicyIdSchema.safeParse(id);
  if (parsed.success) return parsed.data;
  // CR-PR3-postreview-v2 — log length-only for ops triage (privacy posture).
  console.warn(
    `[policyAction] rejected non-UUID policyId — length=${id.length}`,
  );
  return null;
}

const INVALID_PAYLOAD: ActionState = { ok: false, error: 'Invalid action payload.' };
```

**Server Action body — Zod + try/catch + revalidatePath outside try** (lines 199-212):
```typescript
export async function publishAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const policyId = policyIdFrom(formData);
  if (policyId === null) return INVALID_PAYLOAD;
  try {
    await publish(policyId);
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(policyId);  // ← OUTSIDE try/catch per D-09 + Next.js 15 requirement
  return { ok: true };
}
```

**revalidate helper** (lines 124-128):
```typescript
function revalidateAfter(policyId: string): void {
  revalidatePath('/policies');
  revalidatePath(`/policies/${policyId}`);
  revalidatePath('/dashboard');
}
```

**Phase 5 deviations per D-05+D-09+D-10b+D-10c + RESEARCH Pitfall 5:**
- Action name: `acknowledgePolicyAction(_prev, formData)`
- `ActionState` extends per D-10 silent-success + D-07/D-08 typed errors:
  ```typescript
  type ActionState =
    | { ok: true; ackedAt: string }
    | { ok: false; error: string; code?: 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED' };
  ```
- IP capture per D-05 (read from `headers()`, OUTSIDE try/catch — `(await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null`)
- Zod schema: `z.object({ policyId: PolicyIdSchema })` per D-10b
- Inside try: `await recordAcknowledgment(ctx, parsed.data.policyId, ipAddress);`
- Catch branches per D-07+D-08:
  - `PolicyArchivedError` → `{ ok: false, error: 'This policy was archived. Refresh to update your list.', code: 'POLICY_ARCHIVED' }`
  - `PolicyNotAssignedError` → `{ ok: false, error: 'You are no longer assigned this policy.', code: 'POLICY_NOT_ASSIGNED' }`
  - Other → rethrow to Next.js error boundary
- After try/catch: `revalidatePath('/my-policies'); revalidatePath(`/my-policies/${policyId}`);`
- RESEARCH Pitfall 5: for inline UI updates use returned `ackedAt` field; do NOT rely on `isPending` from `useActionState` to track post-revalidate state
- Errors imported from new `@/lib/policies/errors`

---

### `app/(employee)/my-policies/ask/page.tsx` (route page RSC, R-6 shell)

**Analog:** `app/(admin)/policies/page.tsx` (RSC shell rendering Client child) — closest RSC + Client form composition; no existing Q&A form page.

**RSC shell pattern** — adapt the same `export default async function ...Page() { ... return <ClientForm ... />; }` structure from admin/policies/page.tsx. Reference: lines 76-93 (Server Component reads auth + renders header + Client child).

**Phase 5 deviations per D-24:**
- Pure RSC shell — `await getOrgContext()` for auth gate, then render a Client Component `<AskQuestionForm />` that wraps the Server Action via React 19 `useActionState`
- Client Component file path: planner's discretion (per CONTEXT — `components/employee/AskQuestionForm.tsx` or `components/policy/AskQuestionForm.tsx`)
- Form posts to `askQuestionAction` from `./actions.ts`
- Render answer + citations as clickable Links per R-6 acceptance — each citation Link href = `/my-policies/${cit.id}`
- Citation accessibility flag per D-27a: subtle italic styling for `accessibility === 'tldr-only'` (UI hint only; security boundary at the `/my-policies/[id]` page handler)

---

### `app/(employee)/my-policies/ask/actions.ts` (server action, HTTP-in / AI / DB-out)

**Analog:** `app/(admin)/policies/[id]/actions.ts::editPublishedAction` (lines 285-302) — Zod parse complex payload + try/catch + revalidate.

**Complex Zod schema pattern** (lines 258-275):
```typescript
const EditPublishedSchema = z.object({
  policyId: PolicyIdSchema,
  content_json: z
    .string()
    .min(1)
    .transform((s, ctx) => {
      try {
        return ContentJsonSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({ /* ... */ });
        return z.NEVER;
      }
    }),
  changeSummary: z.string().max(200).optional(),
});

export async function editPublishedAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = EditPublishedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Invalid edit payload.' };
  try {
    await editPublished(
      parsed.data.policyId,
      parsed.data.content_json,
      parsed.data.changeSummary,
    );
  } catch (e) {
    return handleTransitionError(e);
  }
  revalidateAfter(parsed.data.policyId);
  return { ok: true };
}
```

**Phase 5 deviations per D-24 + D-25 + R-6:**
- Action name: `askQuestionAction(_prev, formData)`
- Zod schema: `z.object({ question: z.string().min(1).max(2000) })` (length cap per Phase 4 D-42 .strict() pattern)
- ActionState extends per R-6 contract: `{ ok: true; answer: string; citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[] } | { ok: false; error: string }`
- Inside try: `const ctx = await getOrgContext(); const result = await askQuestion(ctx, parsed.data.question);`
- Catch Anthropic.APIError → `{ ok: false, error: 'AI service temporarily unavailable. Please try again.' }` (mirrors Phase 4 503 path; UI shows the error inline via `useActionState`)
- NO `revalidatePath` (Q&A doesn't mutate the policy library; useActionState renders result inline)

---

### `app/(admin)/policies/[id]/actions.ts` (modify - add bulkAssignToDepartmentAction)

**Analog:** Self — extend pattern of existing transition actions in same file.

**bulkAssignToDepartmentAction shape per D-13+D-14+D-15:**
- Zod schema: `z.object({ policyId: PolicyIdSchema, departmentId: z.string().uuid() })`
- Body inside try: 
  ```typescript
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    await PolicyAssignments.create(s, {
      policyId: parsed.data.policyId,
      assigneeType: 'department',
      assigneeId: parsed.data.departmentId,
      assignedBy: s.userId,
    });
  });
  ```
- After try: `revalidateAfter(parsed.data.policyId);` (existing helper at line 124-128) — also `revalidatePath('/policies/' + parsed.data.policyId)` to refresh the PolicyAssignmentsPanel
- Add import: `import { PolicyAssignments } from '@/lib/db/repositories/policy_assignments';`
- Add import: `import { Departments } from '@/lib/db/repositories/departments';` if needed (PolicyAssignmentsPanel reads dept list)
- D-14 empty-departments UX: handled in component (PolicyAssignmentsPanel disables the button); Server Action is unconditional — relies on schema UNIQUE per D-15 for idempotency

---

### `app/(admin)/policies/[id]/page.tsx` (modify - add PolicyAssignmentsPanel placement per D-13)

**Analog:** Self — extend existing page; add new sibling Server Component.

**Phase 5 deviations per D-13:**
- Page order per D-13: PolicyView → PolicyTransitionMenu → new `<PolicyAssignmentsPanel policyId={policy.id} />` at bottom
- PolicyAssignmentsPanel reads assignments + dept list inside its own `withOrgScope` (RSC child component) OR receives them as props from this page (planner's discretion)
- No changes to PolicyView / EditPolicyForm sections

---

### `components/policy/AckStatusBadge.tsx` (component, HTML-out)

**Analog:** `components/policy/PolicyStatusBadge.tsx` (full file) — D-11 explicit mirror.

**Exhaustive switch + Badge className override pattern** (lines 18-46):
```typescript
import { Badge } from '@/components/ui/badge';
import type { PolicyStatus } from '@/lib/policies/state-machine';

const LABEL_BY_STATUS: Record<PolicyStatus, string> = {
  draft: 'Draft',
  under_review: 'Under Review',
  published: 'Published',
  archived: 'Archived',
};

export function PolicyStatusBadge({ status }: { status: PolicyStatus }) {
  switch (status) {
    case 'draft':
      return <Badge variant="outline">{LABEL_BY_STATUS.draft}</Badge>;
    case 'under_review':
      return <Badge variant="secondary">{LABEL_BY_STATUS.under_review}</Badge>;
    case 'published':
      return <Badge variant="default">{LABEL_BY_STATUS.published}</Badge>;
    case 'archived':
      return (
        <Badge
          variant="outline"
          className="text-muted-foreground border-muted-foreground/40"
        >
          {LABEL_BY_STATUS.archived}
        </Badge>
      );
  }
}
```

**Phase 5 deviations per D-11+D-12:**
- New type `AckState = 'none' | 'current' | 'stale'` (matches D-04 return shape)
- Three exhaustive branches:
  - `'none'` → `return null;` (plain "Acknowledge" CTA renders separately; this component renders nothing)
  - `'stale'` → `<Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">Requires re-acknowledgment</Badge>`
  - `'current'` → `<span className="inline-flex items-center gap-1 text-sm text-green-700">✓ Acknowledged on {formatDate(ackedAt)}</span>` (NOT a Badge — different visual per D-11)
- Props: `{ ackState: AckState; ackedAt: Date | null }`
- CRITICAL per D-11: do NOT add a new CVA variant to `components/ui/badge.tsx` — use className override only
- Date formatting: `new Date(ackedAt).toLocaleDateString('en-US')` (matches Phase 3 timeAgo helper style in `app/(admin)/policies/page.tsx:60-72`)

---

### `components/admin/PolicyAssignmentsPanel.tsx` (component, HTML-out + Client form)

**Analog:** `components/admin/ConsistencyCheckRunner.tsx` (closest Client component shape in same directory; useState + useEffect pattern). For RSC list-rendering portion, mirror `app/(admin)/policies/page.tsx` Table pattern.

**'use client' + props + state pattern** (lines 1-32 of ConsistencyCheckRunner.tsx):
```typescript
'use client';
// ... file header documenting purpose ...
import { useEffect, useState } from 'react';

export function ConsistencyCheckRunner({
  batchId,
  startedAt,
}: {
  batchId: string;
  startedAt: Date;
}): React.JSX.Element {
  const [status, setStatus] = useState<Status>('in_progress');
  // ...
}
```

**Phase 5 deviations per D-13+D-14:**
- Component name: `PolicyAssignmentsPanel`
- Server Component (NOT Client) for the read-only assignment list portion — reads `PolicyAssignments.listForPolicy(s, policyId)` inside `withOrgScope` server-side
- Embedded Client child component for the dept-selector dropdown + "Assign to department" button (state for selected dept + form submission)
- Dept list source: `Departments.listAll(s)` inside same `withOrgScope` OR passed as prop from parent page
- D-14: when `departments.length === 0`, disable selector + button with tooltip text `"Create a department first"` (uses existing TooltipProvider from admin layout)
- Form submits to `bulkAssignToDepartmentAction` via React 19 `useActionState`
- D-16: read-only assignment list (no Un-assign button)
- Card or Card-like shell consistent with admin component visual style

---

### `scripts/check-acknowledgment-immutability.ts` (CI gate, file-system-in / process-out)

**Analog:** `scripts/check-policy-id-brand.ts` per D-18 explicit mirror. Closest existing ts-morph pattern.

**ts-morph Project init pattern** (lines 43-49):
```typescript
import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});
```

**Object-literal repo traversal pattern** (check-policy-id-brand.ts lines 100-150):
```typescript
function checkObjectLiteralRepo(
  project: Project,
  filePath: string,
  methods: string[],
): Failure[] {
  const failures: Failure[] = [];
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    failures.push({ kind: 'repo', file: filePath, method: '<file>', detail: 'source file not found' });
    return failures;
  }
  // Walk all variable declarations; for each, find the object literal init;
  // for each, check the targeted methods.
  const varDecls = sourceFile.getVariableDeclarations();
  for (const decl of varDecls) {
    const init = decl.getInitializer();
    if (!init) continue;
    const obj = init.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) continue;
    for (const methodName of methods) {
      const prop = obj.getProperty(methodName);
      // ...
    }
  }
}
```

**Imports + glob scope pattern from check-error-discipline.ts** (lines 47-80):
```typescript
import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

const BANNED_BUILTIN_ERRORS = new Set([ /* ... */ ]);

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

// Scope: lib/auth/**/*.ts and lib/auth/**/*.tsx EXCLUDING errors.ts
```

**Phase 5 deviations per D-18 + D-19 + D-20:**
- File scope: `lib/**/*.ts` (per D-19) explicitly EXCLUDING `tests/fixtures/**` (so the negative-control fixture doesn't trigger the production gate)
- Use `project.addSourceFilesAtPaths('lib/**/*.ts')` then filter
- Walk all `CallExpression` nodes (NOT PropertyAssignment — this is a method-call scan, not a method-declaration scan)
- For each CallExpression, check if it's a chained method call:
  - Match `.update(X)` where X is an Identifier resolving to a symbol imported from `@/lib/db/schema` with the local name `acknowledgments` (handle aliased imports like `import { acknowledgments as ack }` by resolving via Identifier nodes)
  - Match `.delete(X)` with same resolution
  - Also match `Acknowledgments.update(...)` and `Acknowledgments.delete(...)` (the repository object)
- Two modes per D-20:
  - **Default mode** (no flag): scan `lib/**/*.ts` excluding `tests/fixtures/**`, exit 0 if no violations
  - **`--self-test` mode**: scan ONLY `tests/fixtures/ack-mutation-attempt.ts`, exit 0 if EXACTLY 1+ violations found (reverse-interpreted — proves the gate is non-vacuous)
- Both modes write the same `[FAIL] file.ts:LINE  .update(acknowledgments) — ADR-018 violation` line format on detect
- Wire to `package.json` as `check:acknowledgment-immutability` + `check:acknowledgment-immutability:self-test`

---

### `scripts/check-employee-portal.ts` (CI gate, DB-in / process-out)

**Analog:** `scripts/check-policies-list-filters.ts` per D-22 explicit mirror — closest existing integration-test pattern. Combined with `scripts/check-rls.ts` SET-LOCAL-ROLE pattern.

**Module imports + env-var bootstrap** (check-policies-list-filters.ts lines 26-57):
```typescript
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import type { OrgContext } from '@/lib/auth/context';

const TEST_URL: string = (() => {
  const v = process.env.DATABASE_URL_TEST;
  if (!v) {
    console.error('DATABASE_URL_TEST not set. See .env.local Plan 02-02 D-05.');
    process.exit(1);
  }
  return v;
})();

const DIRECT_TEST: string = (() => {
  const v = process.env.DIRECT_URL_TEST;
  if (!v) { /* ... */ }
  return v;
})();

async function loadScopedAndRepos(): Promise<{
  withOrgScope: typeof import('@/lib/db/scoped')['withOrgScope'];
  Policies: typeof import('@/lib/db/repositories/policies')['Policies'];
}> {
  process.env.DATABASE_URL = TEST_URL;
  process.env.DIRECT_URL = DIRECT_TEST;
  const { withOrgScope } = await import('@/lib/db/scoped');
  const { Policies } = await import('@/lib/db/repositories/policies');
  return { withOrgScope, Policies };
}
```

**TRUNCATE-then-seed pattern** (lines 72-78):
```typescript
async function truncate(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    for (const t of [...TENANT_TABLES, 'clerk_events', 'stripe_events']) {
      await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
    }
  });
}
```

**SET LOCAL ROLE authenticated + set_config pattern from check-rls.ts** (lines 136-145):
```typescript
await sql.begin(async (tx) => {
  await tx.unsafe(`SET LOCAL ROLE authenticated`);
  const claims = JSON.stringify({
    sub: userAId,
    org_id: orgAId,
    role: 'admin',
  });
  // is_local=true (third arg) — RESEARCH Pitfall 2 mitigation.
  await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
  // ... assertions ...
  throw new Error('__intentional_rollback__');
}).catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes('__intentional_rollback__')) throw e;
});
```

**Phase 5 deviations per D-22 + D-23a + RESEARCH gap-1+gap-2:**
- Add `'qa_citation_grants'` to local TENANT_TABLES const (RESEARCH gap-2)
- Anthropic mocking per D-23a: file should use vitest (`scripts/check-employee-portal.vitest.config.ts` similar to `scripts/check-ai-layer.vitest.config.ts`) OR a separate `.test.ts` companion file (planner discretion); mocking pattern: `vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => ({ messages: { create: vi.fn().mockResolvedValue(...) } }) }))`
- Coverage matrix per SPEC R-1..R-6 acceptance + cross-org isolation:
  - R-1: 4-row seed (P1 published+assigned-to-user, P2 published+assigned-to-dept, P3 draft+assigned-to-user, P4 published+unassigned), assert query returns exactly P1 + P2
  - R-3: seed → publish v1 → ack v1 → editPublished + publish v2 → assert ackState='stale' + COUNT=1 → re-ack → COUNT=2 + ackState='current'
  - R-4: seed dept D with 3 users → bulkAssign → assert COUNT(*)=1 in policy_assignments → assert all 3 users' lists include P
  - R-6: mock Anthropic → askQuestion → assert citations + qa_citation_grants UPSERT happens → click citation → assert TL;DR branch
  - Cross-org isolation per SPEC AC-10: seed Org A user with departmentId UUID that collides with Org B departments.id UUID → assert Org A user sees zero Org B rows
- Wire to package.json as `check:employee-portal`

---

### `scripts/check-rls.ts` (modify - add qa_citation_grants per RESEARCH gap-2)

**Analog:** Self — extend existing TENANT_TABLES array.

**Current state to extend** (lines 35-47):
```typescript
const TENANT_TABLES = [
  'organizations',
  'users',
  'departments',
  'policies',
  'policy_versions',
  'policy_assignments',
  'acknowledgments',
  'ai_generations',
  'notifications',
  'workflow_stages',
  'batch_jobs', // Phase 4 D-29 / AC-24 — new tenant table for Consistency Check batch state.
] as const;
```

**TRUNCATE loop to extend** (lines 91-105):
```typescript
const TRUNC = [
  'acknowledgments',
  'workflow_stages',
  'policy_assignments',
  'notifications',
  'ai_generations',
  'batch_jobs',
  'policy_versions',
  'policies',
  'departments',
  'users',
  'organizations',
  'clerk_events',
  'stripe_events',
];
```

**Phase 5 deviations:**
- Append `'qa_citation_grants',` to TENANT_TABLES with comment `// Phase 5 D-29 — new tenant table for Q&A citation-referral grants.`
- Append `'qa_citation_grants',` to BOTH TRUNCATE arrays (line 92 seed-TRUNC and line 189 cleanup-TRUNC) — preserve order (child tables before parents)
- No new positive-control needed — the existing for-loop over TENANT_TABLES auto-covers the new table once added

---

### `scripts/check-policy-id-brand.ts` (modify - Phase 5 brand surfaces per RESEARCH gap-4)

**Analog:** Self — extend existing REPO_TARGETS, ORCH_TARGETS, OBJECT_FIELD_TARGETS hardcoded dicts.

**Current REPO_TARGETS to extend** (lines 52-61):
```typescript
const REPO_TARGETS: Record<string, string[]> = {
  'lib/db/repositories/policies.ts': ['findById', 'updateDraft', 'incrementVersion', 'updateSummary'],
  'lib/db/repositories/policy_versions.ts': ['listForPolicy', 'findByVersionNumber'],
  'lib/db/repositories/policy_assignments.ts': ['listForPolicy'],
  'lib/db/repositories/workflow_stages.ts': ['recordSubmission', 'listForPolicy'],
};
```

**Current ORCH_TARGETS to extend** (lines 70-81):
```typescript
const ORCH_TARGETS: Record<string, string[]> = {
  'lib/policies/transitions.ts': [
    'submitForReview', 'approve', 'reject', 'publish',
    'archive', 'restore', 'editPublished', 'loadAndAssertTransition',
  ],
};
```

**Current OBJECT_FIELD_TARGETS** (lines 89-96):
```typescript
const OBJECT_FIELD_TARGETS = [
  {
    file: 'lib/db/repositories/policy_versions.ts',
    method: 'create',
    paramIndex: 1,
    field: 'policyId',
  },
];
```

**Phase 5 deviations per RESEARCH gap-4:**
- REPO_TARGETS additions:
  - `'lib/db/repositories/qa_citation_grants.ts': ['upsert', 'hasGrant']` (both take policyId)
  - Optionally also extend `'lib/db/repositories/policy_assignments.ts': ['listForPolicy', 'create']` if `create` parameter object's `policyId` field is brand-checked via OBJECT_FIELD_TARGETS
- ORCH_TARGETS additions:
  - `'lib/policies/acknowledgment.ts': ['recordAcknowledgment']` (whatever the exported orchestrator name is)
  - NOT `lib/ai/qa.ts::askQuestion` — does NOT take policyId (takes question string), per RESEARCH Pitfall 4 note
- OBJECT_FIELD_TARGETS additions (for object-literal inputs with brand-bearing fields):
  - `{ file: 'lib/db/repositories/acknowledgments.ts', method: 'record', paramIndex: 1, field: 'policyId' }`
  - `{ file: 'lib/db/repositories/policy_assignments.ts', method: 'create', paramIndex: 1, field: 'policyId' }`
  - `{ file: 'lib/db/repositories/qa_citation_grants.ts', method: 'upsert', paramIndex: 1, field: 'policyId' }`

---

### `scripts/check-schema.ts` (modify - Phase 5 column-shape assertions)

**Analog:** Self — extend TENANT_TABLES and add column/UNIQUE/RLS assertions in main loop.

**Current TENANT_TABLES** (lines 31-46):
```typescript
const TENANT_TABLES = [
  'organizations', 'users', 'departments', 'policies', 'policy_versions',
  'policy_assignments', 'acknowledgments', 'ai_generations', 'notifications',
  'workflow_stages', 'batch_jobs',
] as const;
```

**Per-table assertion loop** (lines 69-100): table exists, RLS enabled, org_isolation policy, GRANT for SELECT/INSERT/UPDATE/DELETE.

**Phase 5 deviations per D-08 step-5 schema audit:**
- Append `'qa_citation_grants'` to TENANT_TABLES (same as check-rls.ts gap-2)
- Add explicit UNIQUE-constraint assertions for the two new constraints from migration 0010:
  - `acknowledgments_user_id_policy_id_policy_version_id_unique` on `acknowledgments(user_id, policy_id, policy_version_id)` — query `pg_constraint` for constraint existence
  - `policy_assignments_policy_id_assignee_type_assignee_id_unique` on `policy_assignments(policy_id, assignee_type, assignee_id)`
- Add column-shape assertions for the new `qa_citation_grants` table:
  - Columns: id (uuid), org_id (uuid), user_id (uuid), policy_id (uuid), granted_at (timestamp)
  - UNIQUE constraint `qa_citation_grants_org_user_policy_unique` on `(org_id, user_id, policy_id)`
  - Indexes: `qa_citation_grants_org_id_idx`, `qa_citation_grants_user_policy_idx`

---

### `scripts/check-artifacts.ts` (modify - append Phase 5 block)

**Analog:** Self — Phase 4 block at line 1500+ (`// ─── Phase 4 (AI Layer) — Plan 04-14 Task 2 ───`) — the divider + Check[] return + file-existence assertion pattern.

**Phase 4 block pattern (excerpts from `grep` output at lines 1500-1577):**
- Line 1500: `// ─── Phase 4 (AI Layer) — Plan 04-14 Task 2 ───────────────────────────────`
- Line 1502-1509: docblock describing what the function asserts (file existence + server-only + frozen-contract scaffold)
- Line 1577: shared test fixtures (Plan 04-03)
- Line 1579: Migrations (3 new Phase 4 migrations) — asserts existence of each .sql file
- Line 1882: `assert(out, journal.includes(tag), \`drizzle/meta/_journal.json registers ${tag} (Phase 4 migration chain)\`, ...)` — asserts each new migration tag is in the journal

**Phase 5 deviations per D-23 chaining + SPEC scaffold gate:**
- New section divider: `// ─── Phase 5 (Employee Portal) — Plan 05-XX Task N ───────────────────────`
- New function `checkPhase5Artifacts(): Check[]` returning the list of assertions
- File-existence assertions for every net-new file listed in this PATTERNS.md (employee routes, components, lib files, migrations, tests, fixture)
- `server-only` directive presence in lib/ai/qa.ts + lib/policies/acknowledgment.ts + lib/policies/errors.ts + lib/db/repositories/qa_citation_grants.ts
- Migration journal assertions for `0010_phase5_uniques` and `0011_qa_citation_grants` tags in `drizzle/meta/_journal.json`
- New verify chain script presence in package.json:
  - `"check:acknowledgment-immutability"` script exists
  - `"check:acknowledgment-immutability:self-test"` script exists
  - `"check:employee-portal"` script exists
  - `"verify:phase-5"` chain composition matches D-23

---

### `scripts/check-error-discipline.ts` (modify - widen to lib/policies/**)

**Analog:** Self — Phase 4 widened pattern (CONTEXT.md mentions widening was done for `lib/stripe/`).

**Current scope comment** (lines 16-25):
```typescript
// SCOPE: lib/auth/ ONLY. A stray `throw new Error('No active organization')`
// in lib/db/scoped.ts or a repository is NOT caught by this gate
// ...
// Other layers (Stripe webhook in Phase 6, Claude API integration in Phase 4,
// repository invariants — which already use IllegalTransitionError) may
// adopt the typed-error pattern with their own ADRs when their surface
// complexity warrants it.
```

**Phase 5 deviations per D-30:**
- Update scope comment to add `lib/policies/**/*.ts` (per D-30 ADR mention)
- Find the glob/addSourceFilesAtPaths line (around line 80-100 in the file) and extend to include `lib/policies/**/*.ts`
- Exclusions: keep existing test/mock file filter; also exclude `lib/policies/errors.ts` (where the new class hierarchy lives — same exclusion logic as `lib/auth/errors.ts`)
- Existing `lib/policies/state-machine.ts` already has `IllegalTransitionError` (per scope comment line 21) — the typed-error pattern is already in use there; widening just makes the gate enforce it

---

### `lib/db/schema.ts` (modify - 2 UNIQUE constraints + qaCitationGrants table)

**Analog:** Self — `policyVersions` UNIQUE at lines 200-216 (closest existing UNIQUE-with-comment precedent) + `departments` lines 117-129 (UNIQUE on org_id + id pattern).

**`policyVersions` UNIQUE precedent** (lines 200-216):
```typescript
export const policyVersions = pgTable(
  'policy_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    policyId: uuid('policy_id').notNull().references(() => policies.id),
    versionNumber: integer('version_number').notNull(),
    // ...
  },
  (table) => [
    // 03-G3 T2 — UNIQUE(policy_id, version_number) backstop.
    unique('policy_versions_policy_id_version_number_unique').on(
      table.policyId,
      table.versionNumber,
    ),
    index('policy_versions_org_id_idx').on(table.orgId),
  ],
);
```

**`departments` composite-FK target UNIQUE** (lines 117-129):
```typescript
export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [
    // Composite-FK target for users(org_id, department_id).
    unique('departments_org_id_id_unique').on(table.orgId, table.id),
  ],
);
```

**Phase 5 deviations per D-28 + D-29:**
- For `acknowledgments` table (lines 39-57), add to the table-options array:
  ```typescript
  unique('acknowledgments_user_id_policy_id_policy_version_id_unique').on(
    table.userId,
    table.policyId,
    table.policyVersionId,
  ),
  ```
- For `policyAssignments` table (lines 176-186), add:
  ```typescript
  unique('policy_assignments_policy_id_assignee_type_assignee_id_unique').on(
    table.policyId,
    table.assigneeType,
    table.assigneeId,
  ),
  ```
- New table export `qaCitationGrants` mirroring D-29:
  ```typescript
  export const qaCitationGrants = pgTable('qa_citation_grants', {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id),
    policyId: uuid('policy_id').notNull().references(() => policies.id),
    grantedAt: timestamp('granted_at').defaultNow().notNull(),
  }, (table) => [
    unique('qa_citation_grants_org_user_policy_unique').on(table.orgId, table.userId, table.policyId),
    index('qa_citation_grants_org_id_idx').on(table.orgId),
    index('qa_citation_grants_user_policy_idx').on(table.userId, table.policyId),
  ]);
  ```
- Table alphabetical order: `qaCitationGrants` lands between `policyVersions` and `stripeEvents` (or `users` depending on planner choice — Drizzle's `references(() => ...)` defers evaluation so any order works)

---

### `drizzle/0010_phase5_uniques.sql` (migration, D-28 bundle)

**Analog:** `drizzle/0007_ai_generations_audit_extensions.sql` (full file) — per D-28 explicit "matches Phase 4 0007 bundle pattern".

**Header documenting operator approval** (lines 1-17):
```sql
-- Phase 4 D-32 + D-35 combined migration.
-- Drops legacy ai_generations.tokens_used integer; replaces with the 4-column Anthropic Usage
-- shape (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens)
-- plus the optional idempotency_key text column for /api/ai/draft Idempotency-Key dedup.
--
-- DROP COLUMN tokens_used is IRREVERSIBLE — pre-paying-customer status verified per STATE.md
-- (no production AI calls exist yet). Operator approved 2026-05-21 (CLAUDE.md ASK FIRST cleared
-- per CONTEXT.md D-44 #1 + #2).
```

**statement-breakpoint separator + hand-written index pattern** (lines 30-37):
```sql
ALTER TABLE "ai_generations" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint

-- Phase 4 D-32 hand-written: partial-unique index for Idempotency-Key dedup on /api/ai/draft.
CREATE UNIQUE INDEX "ai_generations_org_idempotency_key"
  ON "ai_generations"("org_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
```

**Phase 5 deviations per D-28:**
- Header documents `Q-22(a) + Q-23(a)` operator approval (per CONTEXT specifics) + STATE.md pre-paying-customer status (per CLAUDE.md ASK-FIRST clearance)
- Both UNIQUE adds in ONE file:
  ```sql
  ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_user_id_policy_id_policy_version_id_unique"
    UNIQUE ("user_id", "policy_id", "policy_version_id");
  --> statement-breakpoint
  ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_policy_id_assignee_type_assignee_id_unique"
    UNIQUE ("policy_id", "assignee_type", "assignee_id");
  ```
- Additive only (no DROP) — pre-customer status accepts the constraint adds without data migration

---

### `drizzle/0011_qa_citation_grants.sql` (migration, D-29 + RESEARCH gap-1)

**Analog:** `drizzle/0001_rls_policies.sql` (full file) — CREATE TABLE + ALTER TABLE ENABLE RLS + CREATE POLICY + GRANT block. COMBINED with `drizzle/0008_rls_subquery_wrap.sql` for the post-0008 wrapped `(SELECT auth.jwt()->>'org_id')` form (CRITICAL per RESEARCH gap-1).

**RLS + GRANT pattern from 0001** (lines 24-28, 41-45):
```sql
-- == organizations (special: predicate uses `id::text` not `org_id::text`) ==
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "organizations"
  FOR ALL USING (id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO authenticated;

-- == departments ==
ALTER TABLE "departments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "departments"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "departments" TO authenticated;
```

**CRITICAL post-0008 wrapped form** from `drizzle/0008_rls_subquery_wrap.sql` lines 51-77:
```sql
ALTER POLICY "org_isolation" ON "departments"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
ALTER POLICY "org_isolation" ON "policies"
  USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
```

**Header pattern from 0001** (lines 1-15):
```sql
-- drizzle/0001_rls_policies.sql
-- Phase 2 — Data Layer security DDL.
-- ...
-- For each of the 10 tenant-scoped tables:
--   1. ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--   2. CREATE POLICY "org_isolation" USING (org_id::text = auth.jwt()->>'org_id')
--   3. GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated
-- ...
-- `auth.jwt()->>'org_id'` returns text. The org_id columns are uuid.
```

**Phase 5 deviations per D-29 + RESEARCH gap-1 (CRITICAL):**
- Header documents `T-2(4c)` operator override + STATE.md pre-paying-customer approval
- CREATE TABLE block (verbatim per D-29):
  ```sql
  CREATE TABLE qa_citation_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    policy_id uuid NOT NULL REFERENCES policies(id),
    granted_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT qa_citation_grants_org_user_policy_unique UNIQUE (org_id, user_id, policy_id)
  );
  ```
- Indexes per D-29:
  ```sql
  CREATE INDEX qa_citation_grants_org_id_idx ON qa_citation_grants(org_id);
  CREATE INDEX qa_citation_grants_user_policy_idx ON qa_citation_grants(user_id, policy_id);
  ```
- RLS + Policy — **MUST use the post-0008 wrapped form** (RESEARCH gap-1 Pitfall 1):
  ```sql
  ALTER TABLE qa_citation_grants ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "org_isolation" ON qa_citation_grants
    FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
  ```
  NOT the CONTEXT.md D-29 unwrapped form (which predates 0008). Otherwise splinter `0003_auth_rls_initplan` lint fires + every SELECT re-evaluates `auth.jwt()` per row at scale.
- GRANT:
  ```sql
  GRANT SELECT, INSERT, UPDATE, DELETE ON qa_citation_grants TO authenticated;
  ```
- Use `--> statement-breakpoint` between top-level DDL statements (Drizzle migrate convention; matches 0001 + 0008)

---

### `lib/db/repositories/acknowledgments.test.ts` (test, co-located)

**Analog:** `app/(admin)/policies/[id]/actions.test.ts` (vi.mock + beforeEach + FormData helper) — closest co-located unit test pattern with mocked deps.

**Hoisted vi.mock pattern** (lines 17-75):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state — captured by reference so the vi.mock factories
// can dispatch to them and beforeEach can reset them.
const publishMock = vi.fn();
const editPublishedMock = vi.fn();

vi.mock('@/lib/policies/transitions', () => ({
  publish: (...args: unknown[]) => publishMock(...args),
  // ...
}));

const revalidateMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidateMock(p),
}));

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'admin' as const,
  })),
}));

vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (
    _ctx: unknown,
    fn: (s: { /* OrgScope shape */ tx: Record<string, unknown> }) => Promise<unknown>,
  ) => fn({ /* mock scope */ tx: {} }),
}));
```

**beforeEach + FormData helper pattern** (lines 85-98):
```typescript
beforeEach(() => {
  publishMock.mockReset();
  editPublishedMock.mockReset();
  revalidateMock.mockClear();
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}
```

**Phase 5 deviations:**
- For repository tests: mock the `withOrgScope` to capture `s.tx` calls (verify `.insert(acknowledgments).values(...).onConflictDoNothing().returning()` chain was constructed)
- Test scenarios per D-06 + D-10:
  - Fresh ack: `record()` returns array with 1 row (mocked RETURNING)
  - Conflict (already acked): mock RETURNING returns `[]` → repository treats as silent success (no throw); test asserts console.log fired with `[ack] no-op (already acked)` ops log
- Use vitest `vi.spyOn(console, 'log')` to verify D-10 ops log
- Tests live in `lib/db/repositories/acknowledgments.test.ts` (co-located per D-21)

---

### `lib/db/repositories/policy_assignments.test.ts` / `lib/db/repositories/qa_citation_grants.test.ts` / `lib/db/repositories/policies.test.ts` (test, co-located)

**Analog:** Same as `acknowledgments.test.ts` above — mirror vi.mock + beforeEach pattern from `app/(admin)/policies/[id]/actions.test.ts`.

**Phase 5 deviations:**
- Each test file covers the new method body of its repo:
  - `policy_assignments.test.ts`: `create()` body — fresh insert, conflict-no-op, brand-bearing policyId
  - `qa_citation_grants.test.ts`: `upsert()` body (idempotent ON CONFLICT DO NOTHING), `hasGrant()` predicate (true/false branches), `listForUser()` shape
  - `policies.test.ts` (EXTEND existing): add cases for `listAssignedAndPublishedForUser` per R-1 acceptance (4-row scenario: P1 published+assigned-to-user, P2 published+assigned-to-dept, P3 draft+assigned-to-user, P4 published+unassigned → expect P1+P2 only)

---

### `lib/policies/acknowledgment.test.ts` (test)

**Analog:** `lib/policies/transitions.test.ts` (referenced in transitions.ts file header at line 191 — "lib/policies/transitions.test.ts D-19 block verifies both the graceful-degrade path AND the propagation path") — closest orchestrator test pattern.

**Phase 5 deviations per D-10a:**
- Mock `getOrgContext` + `withOrgScope` (same shape as actions.test.ts above)
- Mock `Policies.findById` + `PolicyVersions.findByVersionNumber` + `Acknowledgments.record` + `PolicyAssignments.listForPolicy`
- Test scenarios:
  - Happy path: load policy (published) → assignment-match found → policyVersionId resolved → ack inserted → returns `{ ackedAt }`
  - PolicyArchivedError: load returns archived row → orchestrator throws PolicyArchivedError → tx rolls back (asserted via mock not firing the ack insert)
  - PolicyNotAssignedError: load returns published row + no assignment match → throws PolicyNotAssignedError
  - Conflict (re-ack same version): all upstream succeeds, ack insert returns empty RETURNING → orchestrator returns success (D-10 silent-success semantics)
  - IP capture: orchestrator receives `ipAddress` arg verbatim, passes through to `Acknowledgments.record` input
  - Atomicity: any throw inside withOrgScope rolls back ALL prior operations (per D-10a single-tx invariant)

---

### `app/(employee)/my-policies/[id]/actions.test.ts` (test)

**Analog:** `app/(admin)/policies/[id]/actions.test.ts` (full file) — exact pattern match for Server Action tests with vi.mock chain.

**UUID-validation cases pattern** (lines 106-120):
```typescript
describe('policyId UUID validation (CR-PR3-#23)', () => {
  const cases = [
    { label: 'missing policyId field', input: {} as Record<string, string> },
    { label: 'non-UUID string ("p1")', input: { policyId: 'p1' } },
    { label: 'empty-after-trim ("   ")', input: { policyId: '   ' } },
    { label: 'malformed UUID (invalid char)', input: { policyId: '00000000-0000-4000-8000-00000000000G' } },
  ] as const;
  for (const c of cases) {
    it(`publishAction returns INVALID_PAYLOAD on ${c.label}`, async () => {
      const result = await publishAction(undefined, fd(c.input));
      expect(result).toEqual({ ok: false, error: 'Invalid action payload.' });
      expect(publishMock).not.toHaveBeenCalled();
      expect(revalidateMock).not.toHaveBeenCalled();
    });
  }
});
```

**Phase 5 deviations:**
- Mock `@/lib/policies/acknowledgment` (the new orchestrator module) — capture calls to `recordAcknowledgment`
- Mock `next/headers` to provide `x-forwarded-for` header per scenario
- Test scenarios per R-2 + R-3 + D-07 + D-08 + D-10:
  - Happy path: valid policyId + IP → orchestrator called with `(ctx, policyId, '1.2.3.4')` → revalidatePath called twice (`/my-policies` + `/my-policies/[id]`) → returns `{ ok: true, ackedAt }`
  - No x-forwarded-for: orchestrator called with `ipAddress = null`
  - x-forwarded-for multi-hop: orchestrator receives only the first hop, whitespace-trimmed
  - PolicyArchivedError: returns `{ ok: false, error: 'This policy was archived. Refresh to update your list.', code: 'POLICY_ARCHIVED' }`
  - PolicyNotAssignedError: returns `{ ok: false, error: 'You are no longer assigned this policy.', code: 'POLICY_NOT_ASSIGNED' }`
  - UUID validation: same 4 cases as the admin pattern (missing / non-UUID / whitespace / malformed)
  - revalidatePath not called when validation fails (`mock not.toHaveBeenCalled()`)

---

### `app/(employee)/my-policies/ask/actions.test.ts` (test)

**Analog:** `app/(admin)/policies/[id]/actions.test.ts` — same vi.mock pattern but mock `@/lib/ai/qa` (the new askQuestion orchestrator).

**Phase 5 deviations per D-23a + D-24:**
- Mock `@/lib/ai/qa::askQuestion` to return `{ answer: 'mocked', citations: [{title: 'P1', id: 'uuid-1', accessibility: 'full'}] }`
- Test scenarios:
  - Happy path: valid question → askQuestion called with `(ctx, question)` → returns `{ ok: true, answer, citations }`
  - Invalid input: missing question, empty string, oversized (>2000 chars) → `{ ok: false, error: 'Invalid action payload.' }`
  - Anthropic failure: askQuestion throws `Anthropic.APIError` → returns `{ ok: false, error: 'AI service temporarily unavailable. Please try again.' }`
  - Non-Anthropic Error: askQuestion throws TypeError → bubbles up (rethrow path)
  - Citations preserved in returned state shape — Client form reads from formState

---

### `tests/fixtures/ack-mutation-attempt.ts` (fixture, negative-control)

**Analog:** None in codebase — Phase 5 D-20 defines this new pattern.

**Phase 5 shape per D-20:**
- File header documents purpose: "Negative-control fixture for `scripts/check-acknowledgment-immutability.ts --self-test`. Calls `.update(acknowledgments).set({})` so the gate proves non-vacuous."
- File MUST import `acknowledgments` from `@/lib/db/schema` (to trigger the gate's identifier resolution)
- File MUST contain at least one `.update(acknowledgments)` or `.delete(acknowledgments)` call expression — body unimportant (this is a syntactic fixture, not executable):
  ```typescript
  import 'server-only';
  import { acknowledgments } from '@/lib/db/schema';
  // ... mock OrgScope type ...
  
  // Intentional ADR-018 violation — this file exists ONLY to prove the D-18 gate
  // detects .update(acknowledgments) calls. The --self-test mode of
  // scripts/check-acknowledgment-immutability.ts scans THIS FILE and exits 0
  // ONLY when at least 1 violation is detected.
  // DO NOT IMPORT OR CALL FROM PRODUCTION CODE.
  export function _violationFixture(s: { tx: { update: (t: typeof acknowledgments) => { set: (v: Record<string, unknown>) => Promise<unknown> } } }) {
    return s.tx.update(acknowledgments).set({});
  }
  ```
- D-19: `lib/**/*.ts` glob in default-mode gate EXCLUDES `tests/fixtures/**` so this fixture doesn't trigger the production gate
- This file is the proof that D-18 gate is non-vacuous (per R-5 acceptance)

---

### `package.json` (modify - new scripts + verify chain)

**Analog:** Self — existing script entries (`check:policy-id-brand`, `check:rls`, `verify:phase-4`) and chain composition.

**Existing verify chain** (from `pnpm verify:phase-4` line):
```
"verify:phase-3": "pnpm typecheck && pnpm check:db-imports && pnpm check:rls && pnpm check:auth-context && pnpm check:policies-list-filters && pnpm check:admin-routes && pnpm check:error-discipline && pnpm check:policy-id-brand && pnpm check:artifacts && pnpm test && node -e \"require('fs').rmSync('.tmp/svix-url.json', { force: true })\"",
"verify:phase-4": "pnpm verify:phase-3 && pnpm check:ai-prompts && pnpm check:ai-layer"
```

**Existing script entry pattern**:
```
"check:policy-id-brand": "tsx scripts/check-policy-id-brand.ts",
"check:rls": "tsx --env-file=.env.local scripts/check-rls.ts",
"check:ai-layer": "tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-ai-layer.test.ts --config scripts/check-ai-layer.vitest.config.ts"
```

**Phase 5 deviations per D-23:**
- Add THREE new script entries:
  ```
  "check:acknowledgment-immutability": "tsx scripts/check-acknowledgment-immutability.ts",
  "check:acknowledgment-immutability:self-test": "tsx scripts/check-acknowledgment-immutability.ts --self-test",
  "check:employee-portal": "tsx --env-file=.env.local scripts/check-employee-portal.ts"
  ```
  (If R-6 mocking requires vitest config like check-ai-layer, then `check:employee-portal` uses `tsx --env-file=.env.local node_modules/vitest/vitest.mjs run ... --config scripts/check-employee-portal.vitest.config.ts` instead.)
- Add the `verify:phase-5` entry per D-23 EXACT composition:
  ```
  "verify:phase-5": "pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal"
  ```
  Chain forward — Phase 5 inherits the full Phase 1-4 cumulative coverage.

---

## Shared Patterns

### Authentication / OrgContext bootstrap
**Source:** `lib/auth/context.ts::getOrgContext` (called from every Phase 5 server-side surface)
**Apply to:** All employee + admin pages, all Server Actions, both new orchestrators

```typescript
const ctx = await getOrgContext();  // Throws BootstrapError on no-session; Next.js error boundary handles
```

### withOrgScope-wrapped DB access
**Source:** `lib/db/scoped.ts::withOrgScope` (lines 41-67)
**Apply to:** Every Phase 5 DB read or write — repositories must take OrgScope first (ADR-023), orchestrators must open withOrgScope (ADR-025)

```typescript
await withOrgScope(ctx, async (s) => {
  // s.tx is the Drizzle transaction with SET LOCAL ROLE authenticated + JWT claims injected
  // s.orgId, s.userId, s.clerkOrgId, s.clerkUserId, s.role
  await SomeRepo.method(s, ...);
});
```

### Server Action D-09 conventions
**Source:** `app/(admin)/policies/[id]/actions.ts` (all transition actions; especially lines 199-212)
**Apply to:** `acknowledgePolicyAction`, `askQuestionAction`, `bulkAssignToDepartmentAction`

1. `'use server';` directive at top of file
2. Zod `.safeParse` at the trust boundary; return `INVALID_PAYLOAD` on parse failure (no throws)
3. Try/catch wraps the orchestrator/repo call
4. `revalidatePath` calls OUTSIDE the try/catch block (Next.js 15 requirement)
5. Typed `ActionState` discriminated union for return

### PolicyId brand at trust boundary
**Source:** `lib/policies/types.ts::PolicyIdSchema` + usage in `app/(admin)/policies/[id]/actions.ts:71-98`
**Apply to:** Every Server Action accepting policyId from FormData, every page accepting `params: { id }`

```typescript
const parsed = PolicyIdSchema.safeParse(rawId);
if (!parsed.success) return INVALID_PAYLOAD;
const policyId = parsed.data;  // ← typed PolicyId, brand carried into orchestrator/repo
```

### IP capture (D-05 — Phase 5 only)
**Source:** New pattern from D-05; not in codebase yet.
**Apply to:** `acknowledgePolicyAction` only (only place IP is captured in Phase 5)

```typescript
const ipAddress = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
```
- Read from `headers()` (Next.js 15 — note `await` per Next.js 15)
- First comma-separated hop only
- Whitespace-trimmed
- `null` if header absent
- DO NOT validate IPv6 / strip brackets / GeoIP-enrich (out of scope per CONTEXT `<deferred>`)
- READ OUTSIDE try/catch (so error path doesn't lose IP for ops logs if needed)

### D-41 same-closure validIds defense (R-6 only)
**Source:** `app/api/ai/qa/route.ts:56-58` — the cross-org-citation-leak SP-1 defense
**Apply to:** `lib/ai/qa.ts::askQuestion` — preserve verbatim

```typescript
await withOrgScope(ctx, async (s) => {
  const policies = await Policies.listPublishedForOrg(s);
  const validIds = new Set(policies.map((p) => p.id));    // ← MUST be inside this closure
  const libraryXml = policies.map(p => /* uses p.id */).join('\n');
  // ... Anthropic call ...
  return parseQaResponse(rawText, validIds);    // ← validIds Set used to strip hallucinated IDs
});
```
**ANTI-PATTERN:** Hoisting `validIds` outside `withOrgScope` is an OWASP API1 BOLA bug (Phase 4 SP-1).
**PHASE 5 ADDITION (D-26 + RESEARCH gap-3):** The grant-UPSERT loop MUST iterate over `parsed.citations` (the post-validIds-filter result), NOT raw Anthropic fence JSON.

### Error handling — typed `PolicyDomainError` hierarchy
**Source:** New `lib/policies/errors.ts` (mirrors `lib/auth/errors.ts` per D-30)
**Apply to:** `lib/policies/acknowledgment.ts` (throws), `app/(employee)/my-policies/[id]/actions.ts` (catches), `app/(employee)/my-policies/[id]/page.tsx` (potentially catches if branch logic uses orchestrator)

```typescript
// Throw in orchestrator
if (policy.status === 'archived') throw new PolicyArchivedError(policyId);
if (!assigned) throw new PolicyNotAssignedError(policyId);

// Narrow in consumer
if (err instanceof PolicyArchivedError) { /* show "policy archived" UI */ }
if (err instanceof PolicyNotAssignedError) { /* show "no longer assigned" UI */ }
```

### Migration header — operator approval audit trail
**Source:** `drizzle/0007_ai_generations_audit_extensions.sql:1-17`
**Apply to:** Both `drizzle/0010_phase5_uniques.sql` and `drizzle/0011_qa_citation_grants.sql`

Required header content:
- Plain-English what the migration does
- Operator approval reference (e.g., `Q-22(a) + Q-23(a)` for 0010; `T-2(4c)` for 0011)
- STATE.md pre-paying-customer status reference (basis for CLAUDE.md ASK-FIRST clearance)
- Date stamp
- For additive-only migrations: brief note that no data loss is possible

### ts-morph CI gate pattern
**Source:** `scripts/check-policy-id-brand.ts` (lines 43-322; full file) — most actively used ts-morph gate
**Apply to:** New `scripts/check-acknowledgment-immutability.ts`

Common shape:
1. `import { Project, SyntaxKind } from 'ts-morph';`
2. `import { resolve } from 'node:path';`
3. `const project = new Project({ tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'), skipAddingFilesFromTsConfig: true });`
4. `project.addSourceFilesAtPaths('lib/**/*.ts')` (or whatever scope)
5. Walk syntax kinds (CallExpression, PropertyAssignment, VariableDeclaration, etc.) per gate's specific concern
6. Accumulate `failures: Failure[]` array; exit 1 on length > 0; exit 0 on length === 0

### Integration test (raw postgres-js) pattern
**Source:** `scripts/check-policies-list-filters.ts` (full file)
**Apply to:** `scripts/check-employee-portal.ts`

Shape:
1. Read `DATABASE_URL_TEST` + `DIRECT_URL_TEST` via IIFE-guard (process.exit(1) on missing)
2. `loadScopedAndRepos()` async helper that overrides env vars then dynamically imports `@/lib/db/scoped` + repository modules (so the imports pick up the overridden env)
3. `TENANT_TABLES` const used for TRUNCATE loops (truncate before AND after — symmetric for idempotency)
4. Seed orgs + users + fixture rows via raw `sql.begin(...)` with BYPASSRLS (connection-string postgres user)
5. Construct `OrgContext` literals (orgA, orgB) for the assertions
6. Call repository/orchestrator methods via `withOrgScope(ctxA, async s => ...)` for the assertion phase
7. `eq()` and `first()` helper functions for fail-fast assertions
8. Final TRUNCATE in finally block (handles both success and failure paths)

### RLS-bypass + SET LOCAL ROLE pattern (cross-org isolation tests)
**Source:** `scripts/check-rls.ts:130-180`
**Apply to:** `scripts/check-employee-portal.ts` cross-org isolation block (SPEC AC-10)

```typescript
await sql.begin(async (tx) => {
  await tx.unsafe(`SET LOCAL ROLE authenticated`);  // ← Must come BEFORE set_config
  const claims = JSON.stringify({ sub: userAId, org_id: orgAId, role: 'admin' });
  await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;  // ← is_local=true
  
  // POSITIVE CONTROL — assert orgA can see its own data (proves channel is live)
  // NEGATIVE — assert orgA cannot see orgB's data
  
  throw new Error('__intentional_rollback__');  // ← Scope SET LOCAL effects to this tx
}).catch((e) => {
  if (!(e instanceof Error) || !e.message.includes('__intentional_rollback__')) throw e;
});
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tests/fixtures/ack-mutation-attempt.ts` | fixture (negative control) | (no flow) | First negative-control fixture in the codebase. D-20 defines a new pattern (intentional-violation file + gate `--self-test` mode that reverse-interprets). Planner emits per D-20 spec verbatim. |

## Metadata

**Analog search scope:**
- `lib/db/repositories/**/*.ts` (9 files scanned)
- `lib/policies/**/*.ts` (4 files scanned)
- `lib/auth/**/*.ts` (3 files scanned)
- `lib/ai/**/*.ts` (12 files scanned)
- `lib/db/scoped.ts`, `lib/db/schema.ts`
- `app/(admin)/policies/**/*.{ts,tsx}` (5 files scanned)
- `app/(admin)/layout.tsx`
- `app/(employee)/my-policies/page.tsx` (existing stub)
- `app/api/ai/qa/route.ts` (Phase 4 source for D-25 extraction)
- `components/policy/**/*.tsx` (8 files scanned)
- `components/admin/*.tsx` (panel + client component analogs)
- `scripts/check-*.ts` (16 files scanned)
- `drizzle/0001_rls_policies.sql`, `drizzle/0007_ai_generations_audit_extensions.sql`, `drizzle/0008_rls_subquery_wrap.sql`

**Files scanned:** ~80 production source files + ~16 CI gate scripts + 10 migration files = ~106 total

**Pattern extraction date:** 2026-05-23
