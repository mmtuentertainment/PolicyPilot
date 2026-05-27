---
phase: 05-employee-portal
plan: 04
type: execute
wave: 2
depends_on:
  - 05-01
  - 05-02
files_modified:
  - lib/policies/acknowledgment.ts
  - lib/ai/qa.ts
  - app/api/ai/qa/route.ts
  - reference/API-SPEC.md
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "lib/policies/acknowledgment.ts exports recordAcknowledgment(ctx, policyId, ipAddress) — atomic withOrgScope: assignment check + policyVersionId resolution + ack insert"
    - "PolicyArchivedError thrown when policy.status !== 'published' (D-07)"
    - "PolicyNotAssignedError thrown when no user-or-dept assignment matches (D-08)"
    - "Single transaction wraps read+lookup+INSERT per D-10a — editPublished mid-flight rolls back or commits as one unit"
    - "lib/ai/qa.ts exports askQuestion(ctx, question) extracted from app/api/ai/qa/route.ts:51-115 per D-25 + T-3=A"
    - "Phase 4 D-41 same-closure validIds defense preserved verbatim inside askQuestion's withOrgScope (cross-org citation leak SP-1 closed)"
    - "Phase 4 D-33c LONG_CACHE-first / EPHEMERAL-second ordering preserved (Anthropic 400 on inverse)"
    - "Phase 4 WARNING-4 raw-text ai_generations.result preserved (audit replay invariant)"
    - "D-26 grant UPSERT iterates over parseQaResponse-validated citations (RESEARCH gap-3 — NOT raw fence JSON)"
    - "D-27a accessibility annotation: each citation tagged 'full' if assigned, else 'tldr-only'"
    - "app/api/ai/qa/route.ts refactored to thin ~30-line wrapper around askQuestion (HTTP contract UNCHANGED per D-25 invariant)"
    - "reference/API-SPEC.md POST /api/ai/qa response shape updated to document additive accessibility field — closes EAPI advisor H-4 contract-drift finding"
  artifacts:
    - path: "lib/policies/acknowledgment.ts"
      provides: "recordAcknowledgment orchestrator"
      contains: "recordAcknowledgment"
      min_lines: 60
    - path: "lib/ai/qa.ts"
      provides: "askQuestion(ctx, question) extracted helper"
      contains: "askQuestion"
      min_lines: 80
    - path: "app/api/ai/qa/route.ts"
      provides: "thin HTTP wrapper after D-25 extraction"
      contains: "askQuestion"
  key_links:
    - from: "lib/policies/acknowledgment.ts"
      to: "lib/policies/errors.ts"
      via: "throw new PolicyArchivedError / PolicyNotAssignedError"
      pattern: "throw new (PolicyArchived|PolicyNotAssigned)Error"
    - from: "lib/policies/acknowledgment.ts"
      to: "lib/db/repositories/acknowledgments.ts + policy_versions.ts + policies.ts + policy_assignments.ts"
      via: "single withOrgScope wraps all 4 repo calls per D-10a"
      pattern: "withOrgScope"
    - from: "lib/ai/qa.ts"
      to: "lib/db/repositories/qa_citation_grants.ts"
      via: "QaCitationGrants.upsert per cited policy after parseQaResponse"
      pattern: "QaCitationGrants\\.upsert"
    - from: "app/api/ai/qa/route.ts"
      to: "lib/ai/qa.ts"
      via: "thin wrapper: const result = await askQuestion(ctx, body.question)"
      pattern: "askQuestion\\(ctx"
---

<objective>
Wave 2 parallel with Plan 05-03. Create both new orchestrators + refactor the Phase 4 Q&A HTTP handler to consume the extracted helper:

1. `lib/policies/acknowledgment.ts` (NEW) — `recordAcknowledgment(ctx, policyId, ipAddress)`: single `withOrgScope` transaction wrapping `Policies.findById` + assignment check + `PolicyVersions.findByVersionNumber` resolution + `Acknowledgments.record` per D-10a. Throws `PolicyArchivedError` per D-07 + `PolicyNotAssignedError` per D-08.

2. `lib/ai/qa.ts` (NEW) — `askQuestion(ctx, question)`: extracts the inline body of `app/api/ai/qa/route.ts` lines 41-115 verbatim per D-25 + T-3=A. Preserves Phase 4 D-41 same-closure validIds defense, D-33c LONG_CACHE ordering, D-36 PII-safe logging, WARNING-4 raw-text audit. Adds D-26 grant-UPSERT loop iterating over `parseQaResponse`-validated citations (RESEARCH gap-3) + D-27a accessibility annotation.

3. `app/api/ai/qa/route.ts` (REFACTOR) — slim to ~30 lines: auth, Zod parse, call `askQuestion`, return NextResponse.json. HTTP contract UNCHANGED per D-25 invariant.

Purpose: Wave 3 Server Actions (Plan 05-05) call `recordAcknowledgment` from `app/(employee)/my-policies/[id]/actions.ts` and `askQuestion` from `app/(employee)/my-policies/ask/actions.ts`. The page handler at `/my-policies/[id]` (Plan 05-05) calls `QaCitationGrants.hasGrant` (already shipped in Plan 05-03). All Phase 4 invariants must survive the extraction or R-6 cross-org citation leak SP-1 reopens.

Output: Two new orchestrator files + one refactored HTTP route, all tsc clean, all Phase 4 invariants preserved.
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
@lib/db/scoped.ts
@lib/auth/context.ts
@lib/policies/transitions.ts
@lib/policies/errors.ts
@lib/policies/types.ts
@lib/ai/qa-parser.ts
@lib/ai/qa-extract.ts
@lib/ai/cache.ts
@lib/ai/prompts.ts
@lib/ai/client.ts
@lib/ai/models.ts
@lib/ai/extract.ts
@app/api/ai/qa/route.ts
@lib/db/repositories/policies.ts
@lib/db/repositories/policy_versions.ts
@lib/db/repositories/policy_assignments.ts
@lib/db/repositories/acknowledgments.ts
@lib/db/repositories/qa_citation_grants.ts
@lib/db/repositories/ai_generations.ts

<interfaces>
<!-- Wave 1 shipped: PolicyDomainError hierarchy + schema additions -->
<!-- Wave 2 sibling Plan 05-03 ships: 4 repository surfaces -->
<!-- This plan calls: -->

From lib/policies/errors.ts (Plan 05-02):
```typescript
export class PolicyArchivedError extends PolicyDomainError { code = 'POLICY_ARCHIVED'; constructor(public readonly policyId: string); }
export class PolicyNotAssignedError extends PolicyDomainError { code = 'POLICY_NOT_ASSIGNED'; constructor(public readonly policyId: string); }
```

From lib/db/repositories/qa_citation_grants.ts (Plan 05-03):
```typescript
export const QaCitationGrants = {
  upsert: async (s: OrgScope, input: { userId: string; policyId: string }): Promise<{ ...row }[]>,
  hasGrant: async (s: OrgScope, userId: string, policyId: PolicyId): Promise<boolean>,
  listForUser: async (s: OrgScope, userId: string): Promise<...>,
};
```

From lib/policies/transitions.ts:153-216 (orchestrator pattern to mirror):
```typescript
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    await PolicyVersions.create(s, { policyId, versionNumber: policy.currentVersion, contentJson: policy.contentJson, createdBy: s.userId });
    await s.tx.update(policies).set({ status: 'published', updatedAt: sql`now()` }).where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
  try { await generateSummaryForPolicy(policyId, ctx); } catch (error) { ... }
}
```

From app/api/ai/qa/route.ts (Phase 4 source to extract per D-25):
- Lines 41-117 verbatim — preserve same-closure validIds, LONG_CACHE-first ordering, raw-text ai_generations.insert
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create lib/policies/acknowledgment.ts orchestrator per D-10a + D-07 + D-08</name>
  <files>lib/policies/acknowledgment.ts</files>
  <read_first>
    - lib/policies/transitions.ts (whole file — orchestrator pattern source; publish() at lines 153-216 is the closest analog; loadAndAssertTransition helper at lines 70-88 is the assert-status pattern; file-header at lines 1-48 documents the OrgScope-first + withOrgScope-wraps + no-raw-db invariants this new file must mirror)
    - lib/policies/errors.ts (Plan 05-02 — PolicyArchivedError + PolicyNotAssignedError signatures)
    - lib/db/repositories/policies.ts (Policies.findById signature)
    - lib/db/repositories/policy_versions.ts (PolicyVersions.findByVersionNumber at lines 86-101)
    - lib/db/repositories/policy_assignments.ts (PolicyAssignments.listForPolicy signature)
    - lib/db/repositories/acknowledgments.ts (post-Plan 05-03 — Acknowledgments.record() filled body)
    - lib/db/scoped.ts (withOrgScope signature; OrgScope.tx, .orgId, .userId, .role fields)
    - lib/auth/context.ts (getOrgContext signature — returns Promise<OrgContext>; OrgContext does NOT carry departmentId per D-03; we resolve it inside the orchestrator via a sub-query)
    - lib/policies/types.ts (PolicyId brand)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Acknowledgment Server Action (D-05..D-10c — orchestrator-side concerns are D-10a single-tx + D-10b Zod brand at trust-boundary)
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 8 (D-10 silent-success empty RETURNING handling)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/policies/acknowledgment.ts` (orchestrator, tx-wrapped DB-out)"
  </read_first>
  <action>
Create new file `lib/policies/acknowledgment.ts`.

File-header comment (mirror lib/policies/transitions.ts lines 1-48 shape):
- Purpose: "lib/policies/acknowledgment.ts — Plan 05-04 Task 1 (D-10a + D-07 + D-08). Server-only orchestrator for the single ack-recording flow."
- Authoritative-gate rationale: "This is the AUTHORITATIVE atomic write path for an acknowledgment. Plan 05-05's `acknowledgePolicyAction` is a thin Server Action wrapper; the transactional business logic lives here. The function:"
  - "1. Resolves OrgContext via getOrgContext (Clerk session)"
  - "2. Opens withOrgScope — one Drizzle transaction wrapping FOUR sub-operations atomically per D-10a:"
    - "  a. Policies.findById — read current policy (status + currentVersion)"
    - "  b. PolicyAssignments.listForPolicy — resolve assignment match (user OR dept)"
    - "  c. PolicyVersions.findByVersionNumber — resolve target policyVersionId from policies.current_version"
    - "  d. Acknowledgments.record — INSERT ON CONFLICT DO NOTHING per D-06"
  - "Any throw inside the closure rolls back all 4 operations as one unit — editPublished landing mid-flight commits cleanly or rolls back atomically."
- Pitfall reminder: "RESEARCH Pitfall 6 — MUST NOT import raw `db` from '@/lib/db' — use withOrgScope's s.tx via the repository methods."
- Pitfall 8 reminder: "D-10 silent-success — Acknowledgments.record returns [] on UNIQUE conflict. Orchestrator treats as success (re-ack of same version is a no-op semantically) and returns the existing-or-just-inserted row's metadata."

Imports:
- `'server-only'`
- `and, eq` from `drizzle-orm`
- `withOrgScope, type OrgScope` from `@/lib/db/scoped`
- `getOrgContext, type OrgContext` from `@/lib/auth/context`
- `Policies` from `@/lib/db/repositories/policies`
- `PolicyVersions` from `@/lib/db/repositories/policy_versions`
- `PolicyAssignments` from `@/lib/db/repositories/policy_assignments`
- `Acknowledgments` from `@/lib/db/repositories/acknowledgments`
- `PolicyArchivedError, PolicyNotAssignedError, PolicyNotFoundError` from `@/lib/policies/errors`
- `type PolicyId` from `@/lib/policies/types`
- `users` schema export from `@/lib/db/schema` (for the dept-id sub-select)
- `sql` from `drizzle-orm` (for the sub-select)

Exported function signature:
```typescript
export async function recordAcknowledgment(
  ctx: OrgContext,
  policyId: PolicyId,
  ipAddress: string | null,
): Promise<{ ackedAt: string }>
```

The signature takes `ctx` (NOT calling `getOrgContext()` internally — Server Action will resolve and pass to allow the action's outer try/catch to differentiate auth errors from domain errors per Phase 3 D-09 pattern). The `policyId` is brand-typed per ADR-028 (Plan 05-08 widens `check-policy-id-brand.ts` ORCH_TARGETS to add this orchestrator).

Body:
```typescript
return await withOrgScope(ctx, async (s) => {
  // Step 1 — Load policy + assert status='published' (D-07)
  const rows = await Policies.findById(s, policyId);
  const policy = rows[0];
  if (!policy) throw new PolicyNotFoundError(policyId);
  if (policy.status !== 'published') throw new PolicyArchivedError(policyId);

  // Step 2 — Assignment check (D-08).
  // Match if EITHER:
  //   - (assignee_type='user' AND assignee_id = s.userId)
  //   - (assignee_type='department' AND assignee_id = the user's department_id)
  // The dept-id lives in users.department_id; resolve via cheap sub-query
  // (matches D-03 dashboard-query pattern — no OrgContext extension).
  const userDeptResult = await s.tx.select({ deptId: users.departmentId })
    .from(users)
    .where(and(eq(users.id, s.userId), eq(users.orgId, s.orgId)))
    .limit(1);
  const userDeptId = userDeptResult[0]?.deptId ?? null;

  const assignments = await PolicyAssignments.listForPolicy(s, policyId);
  const matched = assignments.some(a =>
    (a.assigneeType === 'user' && a.assigneeId === s.userId) ||
    (a.assigneeType === 'department' && userDeptId !== null && a.assigneeId === userDeptId)
  );
  if (!matched) throw new PolicyNotAssignedError(policyId);

  // Step 3 — Resolve target policyVersionId from policies.current_version (D-10a)
  const pvRows = await PolicyVersions.findByVersionNumber(s, policyId, policy.currentVersion);
  const pv = pvRows[0];
  if (!pv) throw new PolicyNotFoundError(policyId);  // race: pv missing → treat as 404 not 500

  // Step 4 — INSERT ON CONFLICT DO NOTHING (D-06 + D-10)
  const inserted = await Acknowledgments.record(s, {
    userId: s.userId,
    policyId,
    policyVersionId: pv.id,
    ipAddress,
  });

  // D-10 silent-success: empty RETURNING on conflict (already acked at this version).
  // Return the existing row's acknowledgedAt OR the just-inserted timestamp.
  if (inserted.length === 0) {
    // The ops log was already written by Acknowledgments.record per D-10.
    // Look up the existing row for the timestamp we return to the UI.
    const existing = await s.tx.select({ acknowledgedAt: acknowledgments.acknowledgedAt })
      .from(acknowledgments)
      .where(and(
        eq(acknowledgments.orgId, s.orgId),
        eq(acknowledgments.userId, s.userId),
        eq(acknowledgments.policyId, policyId),
        eq(acknowledgments.policyVersionId, pv.id),
      ))
      .limit(1);
    const ackedAt = existing[0]?.acknowledgedAt ?? new Date();
    return { ackedAt: ackedAt.toISOString() };
  }

  const fresh = inserted[0]!;
  return { ackedAt: (fresh.acknowledgedAt ?? new Date()).toISOString() };
});
```

(import `acknowledgments` from `@/lib/db/schema` if you use the existing-row lookup branch above.)

NO post-commit hook (per CONTEXT — different from `publish()`; no Anthropic call to fire). NO outer try/catch (Server Action handles error mapping). NO redirect/revalidatePath in this file (Next.js 15 requirement — Server Actions own those calls per Phase 3 D-09).

DO NOT call `getOrgContext()` internally — the Server Action passes `ctx` so the action's outer try/catch can distinguish auth-bootstrap errors (BootstrapError types) from domain errors (PolicyDomainError types).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -nE "PolicyArchivedError|PolicyNotAssignedError|PolicyNotFoundError" lib/policies/acknowledgment.ts | wc -l && grep -c "withOrgScope" lib/policies/acknowledgment.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - File `lib/policies/acknowledgment.ts` exists with `export async function recordAcknowledgment` declaration
    - `grep -c "withOrgScope" lib/policies/acknowledgment.ts` returns at least 1 (single tx per D-10a)
    - `grep -cE "PolicyArchivedError|PolicyNotAssignedError|PolicyNotFoundError" lib/policies/acknowledgment.ts` returns at least 3 (all three error classes referenced)
    - `grep -c "'server-only'" lib/policies/acknowledgment.ts` returns 1
    - `grep -c "throw new PolicyArchivedError" lib/policies/acknowledgment.ts` returns 1
    - `grep -c "throw new PolicyNotAssignedError" lib/policies/acknowledgment.ts` returns 1
    - File does NOT contain `from '@/lib/db'` standalone (only `@/lib/db/scoped` + `@/lib/db/schema` allowed) — `grep -cE "from '@/lib/db'$" lib/policies/acknowledgment.ts` returns 0
    - File does NOT call `revalidatePath` or `redirect` (`grep -cE "revalidatePath|redirect\\(" lib/policies/acknowledgment.ts` returns 0)
    - File does NOT call `getOrgContext()` (`grep -c "getOrgContext()" lib/policies/acknowledgment.ts` returns 0 — Server Action passes ctx in)
  </acceptance_criteria>
  <done>
    `lib/policies/acknowledgment.ts` exists with the recordAcknowledgment orchestrator wrapping all 4 sub-ops in one withOrgScope tx per D-10a; throws typed errors per D-07/D-08; tsc clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create lib/ai/qa.ts (askQuestion extraction) + add D-26 grant UPSERT + D-27a accessibility annotation</name>
  <files>lib/ai/qa.ts</files>
  <read_first>
    - app/api/ai/qa/route.ts (whole file — VERBATIM source for lines 41-115 extraction per D-25; preserve every comment block on lines 17-39 + 51-58 + 66-90 + 94-99 + 113-116 inside the new function)
    - lib/ai/qa-parser.ts (line 54 — `.filter((c) => validIds.has(c.id))` — D-41 strip-by-validIds invariant)
    - lib/ai/qa-extract.ts (xmlEscape + policyToPromptText helpers)
    - lib/ai/cache.ts (buildCachedSystem + buildLongCachedSystem)
    - lib/ai/prompts.ts (QA_SYSTEM_PROMPT_TEMPLATE)
    - lib/ai/client.ts (getAnthropicClient)
    - lib/ai/models.ts (MODEL_SONNET)
    - lib/ai/extract.ts (extractText)
    - lib/db/repositories/policies.ts (Policies.listPublishedForOrg + the new listAssignedAndPublishedForUser from Plan 05-03 — both available for D-27a annotation)
    - lib/db/repositories/qa_citation_grants.ts (Plan 05-03 — QaCitationGrants.upsert + hasGrant signatures)
    - lib/db/repositories/ai_generations.ts (AiGenerations.insert signature for WARNING-4 audit row)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § R-6 Q&A Surface (D-24..D-27a)
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pattern 4 D-41 same-closure validIds defense + § Pitfall 3 (grant UPSERT iterates over post-validIds citations — NOT raw fence JSON) + § Code Examples askQuestion reference at lines 575-645
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/ai/qa.ts` (orchestrator, tx-wrapped AI + DB-in/DB-out)"
  </read_first>
  <action>
Create new file `lib/ai/qa.ts`.

File-header comment block:
- Purpose: "lib/ai/qa.ts — Plan 05-04 Task 2 (D-25 / T-3=A). Extracts inline Q&A logic from app/api/ai/qa/route.ts:41-115 into a pure orchestrator. Server Action (Plan 05-05 askQuestionAction) and the legacy HTTP route handler both wrap this."
- Phase 4 invariants preserved (verbatim from the route file):
  - "D-41 — validIds Set MUST be constructed inside the SAME withOrgScope closure that built libraryXml (cross-org-citation-leak SP-1 defense)"
  - "D-33c — system-array ordering: LONG_CACHE block FIRST, EPHEMERAL block SECOND (Anthropic returns 400 on inverse order)"
  - "D-36 — PII-safe sanitized log on Anthropic failure (truncate err.message to 120 chars)"
  - "D-40 — cache cold-miss observability when both cache_creation + cache_read are 0"
  - "WARNING-4 — ai_generations.result stores RAW Claude output (citation fence + hallucinated-ID record), NOT parsed answer; Phase 8 telemetry depends on the raw form"
- Phase 5 additions:
  - "D-26 — grant-UPSERT loop iterates over PARSED.CITATIONS (post-validIds-filter per RESEARCH gap-3), NOT raw fence JSON. The validIds Set already excluded hallucinated IDs at lib/ai/qa-parser.ts:54."
  - "D-27a — citation accessibility flag for UI hint only (security boundary is server-side at /my-policies/[id] page handler in Plan 05-05). Built via a cheap query of the user's currently-assigned-and-published policy IDs."

Imports (verbatim from the route + 2 new Phase 5 imports):
- `'server-only'`
- `type { OrgContext }` from `@/lib/auth/context`
- `withOrgScope` from `@/lib/db/scoped`
- `getAnthropicClient` from `@/lib/ai/client`
- `MODEL_SONNET` from `@/lib/ai/models`
- `buildCachedSystem, buildLongCachedSystem` from `@/lib/ai/cache`
- `QA_SYSTEM_PROMPT_TEMPLATE` from `@/lib/ai/prompts`
- `policyToPromptText, xmlEscape` from `@/lib/ai/qa-extract`
- `extractText` from `@/lib/ai/extract`
- `parseQaResponse` from `@/lib/ai/qa-parser`
- `Policies` from `@/lib/db/repositories/policies`
- `AiGenerations` from `@/lib/db/repositories/ai_generations`
- `QaCitationGrants` from `@/lib/db/repositories/qa_citation_grants` (NEW Phase 5 import)

Exported function signature (D-27a citation shape):
```typescript
export async function askQuestion(
  ctx: OrgContext,
  question: string,
): Promise<{
  answer: string;
  citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[];
}>
```

Body — extract verbatim from `app/api/ai/qa/route.ts:51-115` into a `withOrgScope(ctx, async (s) => { ... })` block. Preserve EVERY comment block from the source file — the explanatory rationale lines are tests against future drift. After the existing `parseQaResponse(rawText, validIds)` call, insert two new sections:

**D-26 grant UPSERT loop (per RESEARCH gap-3 — iterate over parsed.citations, NOT raw fence):**
```typescript
const parsed = parseQaResponse(rawText, validIds);

// D-26 (T-2(4c)) — for each cited policy, ensure a qa_citation_grants row exists.
// CRITICAL per RESEARCH gap-3: iterate parsed.citations (validIds-filtered),
// NOT the raw Anthropic fence. A hallucinated foreign-org policy UUID was
// already stripped at qa-parser.ts:54 (.filter(c => validIds.has(c.id))).
// upsert() is idempotent via UNIQUE(org_id, user_id, policy_id) — duplicate
// citations across questions don't create duplicate rows.
for (const cit of parsed.citations) {
  await QaCitationGrants.upsert(s, { userId: s.userId, policyId: cit.id });
}
```

**D-27a accessibility annotation (NEW — cheap query of user's assigned-and-published set):**
```typescript
// D-27a — annotate accessibility flag for UI hint. Security boundary is at the
// /my-policies/[id] page handler (Plan 05-05), NOT this annotation.
// Use a cheap query of assigned-and-published policy IDs to avoid a per-citation
// `hasAssignment` round-trip; for MVP scale (< 100 assignments) this is one
// query for the whole answer.
const assignedRows = await Policies.listAssignedAndPublishedForUser(s, s.userId);
const assignedIds = new Set(assignedRows.map(r => r.id));
const annotated = parsed.citations.map(cit => ({
  title: cit.title,
  id: cit.id,
  accessibility: (assignedIds.has(cit.id) ? 'full' : 'tldr-only') as const,
}));

return { answer: parsed.answer, citations: annotated };
```

Both Phase 5 additions stay INSIDE the same withOrgScope closure (atomicity per D-26 + D-27a — RLS ensures the assigned-policies query is org-scoped, RLS ensures the grant UPSERT is org-scoped). The function returns `{ answer, citations }` (the annotated shape).

NO outer try/catch around the Anthropic call (caller handles — both the HTTP route and the Server Action map errors to their respective response shapes). NO redirect/revalidatePath. NO new ZodError handling (caller validates the question string before calling).

The function is a PURE orchestrator: same input → same output (modulo Anthropic's stochasticity); side effect = one row in ai_generations + zero-or-more rows in qa_citation_grants. Cross-org isolation locked at three points: validIds same-closure (D-41), grant UPSERT iterates filtered list (RESEARCH gap-3), assignedIds query is RLS-scoped (ADR-019/025).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "validIds" lib/ai/qa.ts && grep -cE "QaCitationGrants\\.upsert" lib/ai/qa.ts && grep -c "buildLongCachedSystem" lib/ai/qa.ts && grep -cE "accessibility:" lib/ai/qa.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - File `lib/ai/qa.ts` exists with `export async function askQuestion` declaration
    - `grep -c "withOrgScope" lib/ai/qa.ts` returns at least 1
    - `grep -c "validIds = new Set" lib/ai/qa.ts` returns at least 1 (D-41 invariant — Set constructed in the same closure)
    - `grep -cE "QaCitationGrants\\.upsert" lib/ai/qa.ts` returns 1 (D-26 grant loop)
    - `grep -c "parsed.citations" lib/ai/qa.ts` returns at least 1 (RESEARCH gap-3 — iterate post-parseQaResponse, NOT raw fence)
    - `grep -c "buildLongCachedSystem" lib/ai/qa.ts` returns at least 1 (D-33c LONG_CACHE preserved)
    - `grep -nE "buildLongCachedSystem.*\\.\\.\\..*buildCachedSystem|buildLongCachedSystem[\\s\\S]*?buildCachedSystem" lib/ai/qa.ts | head -1` matches (LONG_CACHE before EPHEMERAL — D-33c ordering)
    - `grep -c "AiGenerations.insert" lib/ai/qa.ts` returns 1 (WARNING-4 audit row preserved)
    - `grep -c "result: rawText" lib/ai/qa.ts` returns 1 (WARNING-4 RAW text, not parsed)
    - `grep -c "accessibility:" lib/ai/qa.ts` returns at least 1 (D-27a citation shape annotation)
    - `grep -c "'server-only'" lib/ai/qa.ts` returns 1
  </acceptance_criteria>
  <done>
    `lib/ai/qa.ts` exists with the extracted askQuestion orchestrator; all Phase 4 invariants (D-41, D-33c, WARNING-4, D-36, D-40) preserved verbatim; D-26 + D-27a Phase 5 additions correctly placed inside the withOrgScope closure.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Refactor app/api/ai/qa/route.ts to thin wrapper around askQuestion (HTTP contract UNCHANGED per D-25)</name>
  <files>app/api/ai/qa/route.ts</files>
  <read_first>
    - app/api/ai/qa/route.ts (whole file — current 147-line implementation; preserve the file-level comment block at lines 17-39 in trimmed form OR move to lib/ai/qa.ts header (already done in Task 2); preserve the ZodError 400 branch + Anthropic.APIError 503 branch + Retry-After header verbatim)
    - lib/ai/qa.ts (Task 2 — the new askQuestion signature)
    - lib/ai/schemas.ts (QaSchema — preserve the Zod validation step verbatim)
    - reference/API-SPEC.md POST /api/ai/qa contract — confirm HTTP shape unchanged
    - .planning/phases/05-employee-portal/05-CONTEXT.md § D-25 (T-3=A "Refactor app/api/ai/qa/route.ts to a thin ~30-line HTTP wrapper")
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/ai/qa.ts`" Phase 5 deviations bullet — "Refactor app/api/ai/qa/route.ts to a thin ~30-line wrapper"
  </read_first>
  <action>
Refactor `app/api/ai/qa/route.ts` to a thin wrapper around `askQuestion(ctx, body.question)`.

The new file structure (~35-40 lines including imports + comments):

1. Top imports (slim — remove imports now living in lib/ai/qa.ts; keep what the wrapper needs):
   - `'server-only'`
   - `NextResponse` from `next/server`
   - `z` from `zod` (for ZodError check)
   - `Anthropic` from `@anthropic-ai/sdk` (for APIError check)
   - `getOrgContext` from `@/lib/auth/context`
   - `QaSchema` from `@/lib/ai/schemas`
   - `askQuestion` from `@/lib/ai/qa` (the new helper)

2. File-header comment block (trimmed — most of the rationale moved to lib/ai/qa.ts in Task 2):
   - "POST /api/ai/qa — Phase 4 SPEC R4 Q&A endpoint, refactored Plan 05-04 Task 3 (D-25 / T-3=A) to thin HTTP wrapper. Business logic lives in lib/ai/qa.ts::askQuestion."
   - "Public HTTP contract UNCHANGED — `{ answer: string, citations: {title, id}[] }` (citations now carry an `accessibility` field per D-27a, which is additive — Phase 4 consumers ignore unknown fields per JSON contract conventions)."
   - "Auth + Zod + askQuestion + error-mapping ONLY. See lib/ai/qa.ts for the model call, prompt caching, validIds defense, audit-row insert, and grant-UPSERT."

3. `export async function POST(req: Request): Promise<Response>` body:

```typescript
// D-37 — auth OUTSIDE try (preserved from Phase 4). Q&A allows any-authenticated.
const ctx = await getOrgContext();

try {
  // D-42 — Zod .strict() body parse (preserved from Phase 4).
  const body = QaSchema.parse(await req.json());

  // D-25 — delegate to extracted orchestrator. All Phase 4 invariants
  // (D-41 same-closure validIds, D-33c LONG_CACHE ordering, WARNING-4 raw
  // audit, D-40 cold-miss log) live in askQuestion now.
  const result = await askQuestion(ctx, body.question);

  return NextResponse.json(result);
} catch (err) {
  // D-42 — ZodError → 400 (preserved verbatim).
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'invalid_body', details: err.flatten() },
      { status: 400 },
    );
  }

  // D-36 — PII-safe sanitized log (preserved verbatim).
  console.error('[ai/qa] anthropic failed', {
    orgId: ctx.orgId,
    error:
      err instanceof Anthropic.APIError
        ? { name: err.name, status: err.status, code: err.error?.type }
        : err instanceof Error
          ? { name: err.name, message: err.message.slice(0, 120) }
          : err,
  });

  // SPEC R7 — 503 envelope + Retry-After:30 (preserved verbatim).
  return NextResponse.json(
    { error: 'ai_service_unavailable', retryAfter: 30 },
    { status: 503, headers: { 'Retry-After': '30' } },
  );
}
```

DO NOT change the HTTP response shape — same `{ answer, citations }` envelope on success (now `citations[]` carries the new `accessibility` field, which is additive and harmless to Phase 4 consumers; reference/API-SPEC.md may need a minor amendment but that's documentation-only). DO NOT add a tier-limit check (Phase 4 D-46 explicitly waives Q&A from tier limits). DO NOT change the auth-outside-try pattern. DO NOT remove the ZodError or Retry-After branches.

The line count goal is ~35-40 lines for the file (down from 147). If you exceed 50 lines, you're probably duplicating logic that now lives in lib/ai/qa.ts.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && wc -l app/api/ai/qa/route.ts && grep -c "askQuestion(ctx" app/api/ai/qa/route.ts && grep -c "Anthropic.APIError" app/api/ai/qa/route.ts && grep -c "Retry-After" app/api/ai/qa/route.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - File `app/api/ai/qa/route.ts` exists and is ≤ 50 lines after refactor (was 147 pre-refactor)
    - `grep -c "askQuestion(ctx" app/api/ai/qa/route.ts` returns 1 (delegates to the new helper)
    - `grep -c "Anthropic.APIError" app/api/ai/qa/route.ts` returns 1 (Phase 4 error-mapping preserved)
    - `grep -c "Retry-After" app/api/ai/qa/route.ts` returns 1 (SPEC R7 envelope preserved)
    - `grep -c "z.ZodError" app/api/ai/qa/route.ts` returns 1 (D-42 ZodError 400 branch preserved)
    - `grep -c "ai_service_unavailable" app/api/ai/qa/route.ts` returns 1 (503 error code preserved)
    - File does NOT contain `withOrgScope` (`grep -c "withOrgScope" app/api/ai/qa/route.ts` returns 0 — that lives in lib/ai/qa.ts now)
    - File does NOT contain `parseQaResponse` (`grep -c "parseQaResponse" app/api/ai/qa/route.ts` returns 0)
    - File does NOT contain `AiGenerations.insert` (`grep -c "AiGenerations.insert" app/api/ai/qa/route.ts` returns 0)
    - File does NOT import from `@/lib/ai/cache|client|models|prompts|qa-extract|qa-parser|extract` (`grep -cE "from '@/lib/ai/(cache|client|models|prompts|qa-extract|qa-parser|extract)'" app/api/ai/qa/route.ts` returns 0 — those imports all moved to lib/ai/qa.ts)
    - File does NOT import from `@/lib/db/scoped|@/lib/db/repositories/*` (`grep -cE "from '@/lib/db/(scoped|repositories)" app/api/ai/qa/route.ts` returns 0)
    - **EAPI advisor H-4 closure** — `reference/API-SPEC.md` POST /api/ai/qa response shape documents the additive `accessibility: 'full' \| 'tldr-only'` field in the citations array: `grep -c "accessibility" reference/API-SPEC.md` returns ≥ 2 (response type signature + explanatory comment block)
    - `reference/API-SPEC.md` documents that `accessibility` is additive (existing consumers ignore unknown fields per JSON contract convention): `grep -c "additive" reference/API-SPEC.md` returns ≥ 1
    - `reference/API-SPEC.md` cross-references D-27a + D-27 3-branch page handler as the actual security boundary (field is UI hint only): `grep -c "D-27a" reference/API-SPEC.md` returns ≥ 1
  </acceptance_criteria>
  <done>
    `app/api/ai/qa/route.ts` slimmed to ~35-40 lines; HTTP contract unchanged; Phase 4 error mapping (ZodError 400, Anthropic.APIError 503 + Retry-After) preserved verbatim; tsc clean; `reference/API-SPEC.md` updated to document the additive `accessibility` field (EAPI advisor H-4 contract-drift finding closed).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Server Action → orchestrator | Caller passes branded `PolicyId` (recordAcknowledgment) or validated question string (askQuestion); orchestrator doesn't re-validate input shape |
| orchestrator → DB (withOrgScope) | All four sub-operations in recordAcknowledgment + every askQuestion call MUST stay inside ONE withOrgScope closure for atomicity (D-10a) and same-closure validIds defense (D-41) |
| askQuestion → external Anthropic call | Network call to api.anthropic.com; failure handled by HTTP route + Server Action; not the orchestrator's concern |
| qa.ts grant UPSERT → cross-org leak | RESEARCH gap-3 — UPSERT MUST iterate over parsed.citations (validIds-filtered), NOT raw fence; closes the cross-org-grant-via-UUID-collision vector at the source |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-04-01 | Tampering | Acknowledge-while-archived race (policy archived between page-load and click) | mitigate | D-07 — orchestrator throws `PolicyArchivedError` inside the withOrgScope tx; tx rolls back. Server Action catches and shows "This policy was archived. Refresh to update your list." Integration test (Plan 05-09) asserts no ack row inserted post-archive. |
| T-05-04-02 | Tampering | Acknowledge-while-unassigned race (admin removed assignment between page-load and click) | mitigate | D-08 — orchestrator throws `PolicyNotAssignedError`; same tx-rollback pattern. Server Action shows "You are no longer assigned this policy." |
| T-05-04-03 | Tampering | policyVersionId resolution race (admin editPublished mid-flight) | mitigate | D-10a — single withOrgScope wraps Policies.findById + assignment check + PolicyVersions.findByVersionNumber + Acknowledgments.record. Atomic; an editPublished landing inside the tx window either rolls back or commits as one unit. The schema UNIQUE on policy_versions(policy_id, version_number) from 03-G3 T2 makes the lookup deterministic. |
| T-05-04-04 | Information Disclosure | Cross-org citation leak via askQuestion | mitigate | Phase 4 D-41 same-closure validIds preserved verbatim in extracted askQuestion (Task 2). The validIds Set is built inside the SAME withOrgScope closure that built libraryXml — any deviation is an OWASP API1 BOLA bug (SP-1). |
| T-05-04-05 | Information Disclosure | Cross-org grant manufacture via hallucinated citation UUID-collision | mitigate | RESEARCH gap-3 — grant UPSERT iterates over `parsed.citations` (post-validIds-filter at lib/ai/qa-parser.ts:54), NOT raw Anthropic fence. Hallucinated foreign-org policy UUIDs were already stripped by `.filter(c => validIds.has(c.id))` before reaching the grant write. Worst case: orphaned grant row with current org_id pointing at a policy the page handler then 404s on. |
| T-05-04-06 | Information Disclosure | D-27a accessibility flag exposing assignment topology | accept | D-27a explicitly notes "accessibility flag is for UI hint only — security boundary is enforced server-side at the page handler in Plan 05-05." A malicious user could only learn which of their OWN org's policies they're NOT assigned to (which they already know — every employee in an org may submit Q&A and see citations to colleagues' assigned policies). No cross-org info. |
| T-05-04-07 | Tampering | Phase 4 D-33c LONG_CACHE ordering broken during extraction | mitigate | Task 2 preserves system-array ordering verbatim (`[...buildLongCachedSystem(libraryXml), ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE)]`); Anthropic returns HTTP 400 on inverse order so any regression would surface immediately in dev. Plan 05-09 integration test mocks Anthropic but the ordering pattern is regression-protected by the live route's first call post-deploy. |
| T-05-04-08 | Repudiation | WARNING-4 ai_generations.result audit row stored as parsed answer instead of raw text | mitigate | Task 2 preserves `result: rawText` verbatim — Phase 4 lock per WARNING-4. Phase 8 telemetry queries depend on the raw form (citation fence + hallucinated-ID record). The acceptance criterion `grep -c "result: rawText"` returns 1 enforces. |
| T-05-04-SC | Tampering | npm installs | accept | No new packages. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0 across all three files
- `pnpm verify:phase-4` still exits 0 (no regression to Phase 4 Q&A test in scripts/check-ai-layer.test.ts — that test mocks Anthropic + asserts response shape; the response shape is unchanged modulo the additive `accessibility` field)
- If a Phase 4 vitest in `scripts/check-ai-layer.test.ts` strictly types citations as `{title, id}` only and rejects extras, Plan 05-04 may need to extend that type — flag in SUMMARY
</verification>

<success_criteria>
- `lib/policies/acknowledgment.ts` exists with recordAcknowledgment orchestrator
- `lib/ai/qa.ts` exists with askQuestion orchestrator preserving all Phase 4 invariants + adding D-26 + D-27a
- `app/api/ai/qa/route.ts` slimmed to ~35-40 lines wrapping askQuestion
- tsc clean
- No regression — `pnpm verify:phase-4` exits 0 (or Phase 4 test slightly relaxed for the additive `accessibility` field — flag in SUMMARY if so)
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-04-SUMMARY.md` when done — document the line-count delta for app/api/ai/qa/route.ts (was 147; new ~?), the exact placement of D-26 grant loop + D-27a annotation inside lib/ai/qa.ts (before or after `return parsed.citations`), and any Phase 4 test adjustments required for the additive `accessibility` field.
</output>
