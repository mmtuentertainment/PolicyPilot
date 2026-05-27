---
phase: 05-employee-portal
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 30
files_reviewed_list:
  - drizzle/0010_phase5_uniques.sql
  - drizzle/0011_qa_citation_grants.sql
  - drizzle/meta/_journal.json
  - lib/db/schema.ts
  - lib/db/repositories/acknowledgments.ts
  - lib/db/repositories/policy_assignments.ts
  - lib/db/repositories/policies.ts
  - lib/db/repositories/qa_citation_grants.ts
  - lib/db/repositories/departments.ts
  - lib/policies/errors.ts
  - lib/policies/acknowledgment.ts
  - lib/policies/transitions.ts
  - lib/ai/qa.ts
  - lib/ai/qa-parser.ts
  - app/(employee)/layout.tsx
  - app/(employee)/my-policies/page.tsx
  - app/(employee)/my-policies/[id]/page.tsx
  - app/(employee)/my-policies/[id]/actions.ts
  - app/(employee)/my-policies/ask/page.tsx
  - app/(employee)/my-policies/ask/actions.ts
  - app/(admin)/policies/[id]/actions.ts
  - app/(admin)/policies/[id]/page.tsx
  - app/api/ai/qa/route.ts
  - components/policy/AckStatusBadge.tsx
  - components/admin/PolicyAssignmentsPanel.tsx
  - components/admin/PolicyAssignmentsPanelForm.tsx
  - components/employee/AcknowledgeButton.tsx
  - components/employee/AskQuestionForm.tsx
  - scripts/check-acknowledgment-immutability.ts
  - tests/fixtures/ack-mutation-attempt.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 30
**Status:** issues_found

## Summary

Phase 5 ships the Employee Portal with a strong defensive posture: the append-only acknowledgment invariant has three-layer enforcement (compile-time type tests, ts-morph CI gate with both Drizzle-API and raw-SQL detection paths, and explicit `record`-only repository surface), the D-27 three-branch access-aware page handler keeps the security boundary server-side, and the R-6 grant UPSERT correctly iterates over the validIds-filtered citations array (closing RESEARCH gap-3). The two additive migrations (0010 UNIQUE constraints + 0011 qa_citation_grants table) are properly documented with operator approval and use the post-0008 wrapped JWT form for RLS.

**No Critical findings.** No security vulnerabilities, no broken append-only invariants, no cross-org leaks reachable from production paths, no `any` types in the new code surface (only one `eslint-disable-next-line @typescript-eslint/no-explicit-any` in test file at `qa_citation_grants.test.ts:53` — properly scoped).

**7 Warnings** identify quality and correctness concerns the team should address: a stale `Anthropic.APIError.error?.type` access in the HTTP route (`route.ts:38`) that survived the related fix in `transitions.ts`; an incorrect prop type for `ackedAt` in `AckStatusBadge` (declared `Date | null` but the dashboard query returns `string | null` after revalidation through `withOrgScope` serialization); the dashboard query's `assigneeType='department'` predicate matches a NULL `userDeptSubquery` against `assignee_id` which is `.notNull()` — works by accident in SQL, but a potential confusion source; the orchestrator's user-dept sub-query runs `s.tx.select` directly on the `users` table from `lib/policies/acknowledgment.ts` instead of via a repository method (defense-in-depth gap; bypasses `check-db-imports` style discipline); the `qa.ts` orchestrator calls `Policies.listAssignedAndPublishedForUser` (a 5-join SELECT DISTINCT) on EVERY Q&A request just to derive an accessibility flag for citations — significant overhead with no caching; the AcknowledgeButton's `state?.ok` early-return permanently locks the form into the "success" state even after subsequent failed retries; and the Branch A path in the access-aware page omits a `status === 'published'` re-check on the freshly-fetched policy (the dashboard query already filtered to published, but the second `findById` call doesn't, opening a brief consistency window if the policy is archived mid-flight).

**6 Info items** flag minor improvements: hardcoded `'en-US'` locale, an unused `_prev` parameter convention, an inconsistency where `Policies.findById` does not check status but the access page assumes the assignedRow filter is sufficient, and small documentation/code-comment opportunities.

## Warnings

### WR-01: Stale Anthropic.APIError.error?.type access in HTTP route (regression of the type-design fix already applied in transitions.ts)

**File:** `app/api/ai/qa/route.ts:38`
**Issue:** The HTTP route's `console.error` D-36 PII-safe log branch reads `err.error?.type` on `Anthropic.APIError`:
```ts
err instanceof Anthropic.APIError
  ? { name: err.name, status: err.status, code: err.error?.type }
```
The fast-follow Phase 3/4 work (per the inline comment at `lib/policies/transitions.ts:201-204`) explicitly switched from `error.error?.type` to `error.type` because `TError` defaults to `Object | undefined` and `.type` isn't typed on that generic — `error.error?.type` propagates `any`. The same code path here was not updated when transitions.ts was. This is a `noImplicitAny` / `strict` violation if the SDK's `error` field generic gets tightened in a future bump, AND it's an inconsistency that will confuse future readers.
**Fix:**
```ts
err instanceof Anthropic.APIError
  ? { name: err.name, status: err.status, code: err.type }
```
Mirror the transitions.ts:207 form. Verify against `@anthropic-ai/sdk/core/error.d.ts:13` (`type: ErrorType | null`).

### WR-02: AckStatusBadge prop type mismatch — declared `Date | null` but server-rendered from a serialized response

**File:** `components/policy/AckStatusBadge.tsx:33-34`, `app/(employee)/my-policies/page.tsx:91-92`
**Issue:** The component types `ackedAt: Date | null` and unconditionally wraps with `new Date(ackedAt)`. The dashboard query (`Policies.listAssignedAndPublishedForUser`) returns `ackedAt: Date | null` from Drizzle, which works on first render. BUT after `revalidatePath('/my-policies')` fires from the acknowledgement Server Action, the rerendered Server Component re-fetches the row and React's serialization may pass the value as an ISO string (Server Components serialize Dates to ISO strings when crossing the Server→Client boundary; for `AckStatusBadge` which is a Server Component, this is fine, but it makes the `new Date(ackedAt)` wrapping defensive of a contract that is currently violated only at the type level). The bigger issue: `'current'` branch silently renders `✓ Acknowledged on ` (with NO date) when `ackedAt` is null, because of `ackedAt && new Date(...)` — see the inline comment at line 49-51 which dismisses this as defensive, but the LEFT JOIN match guarantees `ackedAt` is non-null only when `currentAck.id IS NOT NULL`, which is the `ackState === 'current'` branch — so the guard is functionally dead. If the LEFT JOIN ever changed (e.g., `acknowledgedAt` defaulted-null on a future column change), the badge would silently display "Acknowledged on " with a trailing space and no date.
**Fix:** Either (a) make the `Date | null` type into `Date` for the `'current'` branch by tightening the discriminated union — `ackState: 'current'` should imply `ackedAt: Date`, encoded via the return-type of `listAssignedAndPublishedForUser`; or (b) add an explicit fallback string ("Acknowledged on (date unavailable)") instead of silently rendering an empty trailing space:
```tsx
case 'current':
  return (
    <span className="inline-flex items-center gap-1 text-sm text-green-700">
      ✓ Acknowledged{ackedAt ? ` on ${new Date(ackedAt).toLocaleDateString('en-US')}` : ''}
    </span>
  );
```

### WR-03: Department sub-query semantics rely on PostgreSQL's NULL behavior in `IN`-expressions — subtle and fragile

**File:** `lib/db/repositories/policies.ts:138`
**Issue:** The dashboard query's department-id sub-select inline:
```ts
const userDeptSubquery = sql`(SELECT ${users.departmentId} FROM ${users} WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId})`;
// ... later used as:
sql`${policyAssignments.assigneeId} = ${userDeptSubquery}`
```
This works correctly for the D-02 dept-less-user case ONLY because `users.department_id IS NULL` makes the sub-query return a single NULL row, and `assignee_id = NULL` evaluates to UNKNOWN, which the WHERE clause treats as FALSE. RESEARCH Pitfall 6 acknowledges this and the integration test at `check-employee-portal.test.ts:513-551` proves it works. However:

1. If a future refactor adds `OR ${policyAssignments.assigneeId} IS NULL` to the predicate (e.g., as defensive guard), the dept-less user would suddenly see ALL dept-level assignments with NULL `assignee_id` — except `assignee_id` is `.notNull()` schema-wise. The combination of "rely on NULL semantics + the assignee_id NOT NULL schema constraint" creates a fragile invariant where two independent schema decisions must both hold.
2. The `userDeptSubquery` builder uses raw `sql\`\`` interpolation which bypasses Drizzle's parameter binding for the subquery body — the table reference is interpolated as `${users}` (an object reference Drizzle resolves to a table name) and the value bindings (`${userId}`, `${s.orgId}`) ARE parameterized, so this is safe from injection, but it's harder to audit than a Drizzle expression.

This is a defense-in-depth concern, not a vulnerability — the schema `.notNull()` constraint plus the implicit NULL semantics happen to compose correctly today.

**Fix:** Either (a) extract the dept-less-user case explicitly:
```ts
// Resolve userDeptId once outside the query
const userRows = await s.tx.select({ deptId: users.departmentId })
  .from(users).where(and(eq(users.id, userId), eq(users.orgId, s.orgId))).limit(1);
const userDeptId = userRows[0]?.deptId ?? null;
// ...then in JOIN:
or(
  and(eq(policyAssignments.assigneeType, 'user'), eq(policyAssignments.assigneeId, userId)),
  userDeptId !== null
    ? and(eq(policyAssignments.assigneeType, 'department'), eq(policyAssignments.assigneeId, userDeptId))
    : sql`FALSE`,  // explicit no-match for dept-less users
)
```
(b) Or leave as-is but add a stronger comment block documenting the load-bearing assumption that `assignee_id` is `.notNull()`.

### WR-04: Acknowledgment orchestrator runs raw `s.tx.select` on `users` table — bypasses the per-aggregate repository discipline

**File:** `lib/policies/acknowledgment.ts:114-119`, `:161-172`
**Issue:** The orchestrator imports `users` and `acknowledgments` from `@/lib/db/schema` and runs `s.tx.select({...}).from(users)...` and `s.tx.select({...}).from(acknowledgments)...` directly, bypassing the per-aggregate repository methods (e.g., `Users.findById`, `Acknowledgments.listForUser`). ADR-023 + ADR-025 architecture is that all DB traffic goes through repositories that pre-apply `eq(table.orgId, scope.orgId)`. Both queries here DO include `eq(users.orgId, s.orgId)` and `eq(acknowledgments.orgId, s.orgId)`, so the security invariant holds — but the pattern violates the layering documented in `lib/db/repositories/policies.ts:1-19` header ("repositories take OrgScope first; orchestrators call them via scope.tx").

Concrete risks:
1. A future contributor copying this orchestrator pattern might forget the `eq(orgId)` predicate.
2. `scripts/check-db-imports.ts` only catches raw `@/lib/db` barrel imports, not `s.tx.select(...)` patterns that operate on schema tables directly.
3. This is the only place in `lib/policies/` that does this — `transitions.ts` similarly does `s.tx.update(policies)` direct calls (lines 113, 138, 174, 233, 261, 306), establishing a precedent for "transitions/orchestrators can do direct s.tx operations". But the existing precedent in transitions.ts targets the SAME table the orchestrator is modifying (policies). The acknowledgment.ts orchestrator targets a DIFFERENT table (users for the dept-id lookup, acknowledgments for the existing-row lookup) — extending the orchestrator's reach beyond its primary aggregate.

**Fix:** Either (a) add `Users.findDeptId(s, userId)` method to `lib/db/repositories/users.ts` and `Acknowledgments.findExisting(s, userId, policyId, policyVersionId)` to acknowledgments.ts; or (b) document this exception explicitly with a comment block referencing ADR-023's allow-list rationale.

### WR-05: `qa.ts` orchestrator calls expensive `listAssignedAndPublishedForUser` (5-table JOIN) on every Q&A request just to derive an accessibility flag

**File:** `lib/ai/qa.ts:182-186`
**Issue:** After parsing citations, the orchestrator runs:
```ts
const assignedRows = await Policies.listAssignedAndPublishedForUser(s, s.userId);
const assignedIds = new Set(assignedRows.map((r) => r.id));
```
`listAssignedAndPublishedForUser` is the dashboard query — a 5-table SELECT DISTINCT with two LEFT JOINs on acknowledgments, an inline sub-select for departmentId, and JOIN on policy_versions. This runs on EVERY Q&A request, even when:
1. The user has zero citations (the loop above already returned no rows to annotate).
2. The user's assignment set hasn't changed since their last Q&A.
3. Only ONE citation needs annotation — the full dashboard query is run instead of a targeted "is this user assigned to policyId X" check.

Q&A latency is dominated by the Anthropic call (~2-5s), so the extra DB round-trip is small in absolute terms, but: the query also pulls TipTap `tldrSummary` text, `ackState` enum, `ackedAt`, etc. — data the qa orchestrator throws away. For an org with 100+ published policies × 50 employees × 10 Q&A/day, that's ~50k unnecessary aggregated rows fetched per day. The note at line 178-181 acknowledges this trade-off but accepts it for "MVP scale (< 100 assignments)".

**Fix:** Add a narrower repository method like `Policies.listAssignedIdsForUser(s, userId)` that returns just `string[]` of policy IDs. Pattern:
```ts
listAssignedIdsForUser: (s: OrgScope, userId: string) =>
  s.tx.selectDistinct({ id: policies.id }).from(policies)
    .innerJoin(policyAssignments, /* same join as dashboard, no ack joins */)
    .where(and(eq(policies.orgId, s.orgId), eq(policies.status, 'published')));
```
At a minimum, short-circuit when `parsed.citations.length === 0` to skip the query entirely.

### WR-06: AcknowledgeButton permanently locks form into "success" state — subsequent failures invisible

**File:** `components/employee/AcknowledgeButton.tsx:53-60`
**Issue:** The component returns the success-rendered branch early when `state?.ok === true`:
```tsx
if (state?.ok) {
  return (
    <p className="text-sm text-green-700">
      ✓ Acknowledged on {new Date(state.ackedAt).toLocaleDateString("en-US")}
    </p>
  );
}
```
After a successful acknowledgment, the form is replaced wholesale by the success message — the button is gone. This is correct UX for the typical flow (acknowledge once + page revalidates). However:

1. There is no path back to a retry if the user wants to re-acknowledge from this component (e.g., they want to refresh their ack timestamp).
2. The action's `revalidatePath('/my-policies/[id]', ...)` would re-render the parent page, but the parent gates rendering this component on `assignedRow.ackState !== 'current'` (per `[id]/page.tsx:155`). So after a fresh ack, the next render would set `ackState='current'`, hide the button, and render the badge directly — the success branch in AcknowledgeButton is unreachable in practice EXCEPT in the brief window between `state?.ok` being set and the revalidation completing.
3. If RESEARCH Pitfall 5 (Next.js #82289) actually bites — `isPending` stays stuck — the user sees the success message before revalidation completes, then the page re-renders with the same success state (now `current`) — so the component never re-mounts with stale state.

The Pitfall 5 narrative is about `isPending` NOT resetting. The current code uses `state.ackedAt` to drive the success branch, which is the documented workaround. But that workaround creates a different problem: if a user clicks Acknowledge, then refreshes the page WITHOUT navigating away (e.g., browser refresh), the freshly-mounted component has `state === undefined` again — the success branch is gone — but the parent's `ackState='current'` gate hides the button, so the AckStatusBadge takes over. Correct behavior, but reliant on the parent's gate.

**Fix:** Add an explicit comment that this success branch is a transient render between action-return and revalidation-completion. Better yet, restructure: don't return a different shape on success — instead, render a disabled button labeled "Acknowledged" and let the parent's revalidation replace the entire block with the AckStatusBadge:
```tsx
if (state?.ok) {
  return (
    <p className="text-sm text-green-700" aria-live="polite">
      ✓ Acknowledged on {new Date(state.ackedAt).toLocaleDateString("en-US")} — refreshing…
    </p>
  );
}
```
The `aria-live="polite"` would also improve accessibility for screen-reader users.

### WR-07: Branch A access page omits status='published' re-check on freshly-fetched policy — brief consistency window if archived mid-flight

**File:** `app/(employee)/my-policies/[id]/page.tsx:88-107`
**Issue:** Branch A logic:
```ts
const assignedRow = assignedRows.find((r) => r.id === idParsed.data);
if (assignedRow) {
  const fullRows = await Policies.findById(s, idParsed.data);
  const fullPolicy = fullRows[0];
  if (!fullPolicy) return { branch: "notfound" as const };
  return { branch: "full", policy: { ...fullPolicy }, ... };
}
```
The `assignedRows` query already filters by `status='published'`. The `findById` call does NOT — it returns the row regardless of status. Both queries are inside the SAME `withOrgScope` closure (one transaction), so they see a consistent snapshot at the transaction's snapshot point. But Postgres transaction-level READ COMMITTED isolation (the default) means: if an admin archives the policy via a CONCURRENT transaction that commits BETWEEN the two reads, the snapshot the second `findById` sees depends on driver behavior — postgres-js / drizzle uses READ COMMITTED by default which would let the second read see the new `status='archived'` value. Given `assignedRow` showed `status='published'` (via the published filter), `fullPolicy.status` could disagree.

The page handler then returns Branch A — full PolicyView — even though the policy is now archived. The Acknowledge button renders, but the `acknowledgePolicyAction` would throw `PolicyArchivedError` per `recordAcknowledgment` orchestrator. So the user sees the wrong UI for a moment, but no security boundary is breached.

This is a low-severity race that the D-07 `PolicyArchivedError` correctly catches at the Server Action level. The defensive comment at `[id]/page.tsx:90-91` mentions "Defense-in-depth — assignment join was satisfied, but RLS could deny on race" — covering RLS denial, but not status drift.

**Fix:** Add a status check on the second-read result:
```ts
const fullPolicy = fullRows[0];
if (!fullPolicy || fullPolicy.status !== 'published') {
  return { branch: "notfound" as const };
}
```
This matches the Branch B path's check (`grantPolicy && grantPolicy.status === "published"`) for consistency.

## Info

### IN-01: Hardcoded `'en-US'` locale in date formatting

**File:** `components/policy/AckStatusBadge.tsx:54`, `components/employee/AcknowledgeButton.tsx:57`
**Issue:** Both components call `.toLocaleDateString('en-US')` with a hardcoded locale. This will render "5/24/2026" for all users regardless of their browser locale, including EU/Asian users who expect "24/05/2026" or "2026/05/24". Phase 5 is targeted at SMBs in the US per `.planning/PROJECT.md`, but the operator's roadmap doesn't explicitly preclude international customers.
**Fix:** Use locale-aware formatting:
```tsx
new Date(ackedAt).toLocaleDateString()  // browser default locale
```
Or pass undefined to use browser default: `new Date(ackedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })`. For SSR-stable rendering across hydration, use a fixed format helper (e.g., date-fns `format(date, 'PP')`).

### IN-02: `_prev` parameter convention is inconsistent — some files prefix with underscore, others use `prev`

**File:** Multiple — `app/(employee)/my-policies/[id]/actions.ts:62`, `app/(employee)/my-policies/ask/actions.ts:52`, `app/(admin)/policies/[id]/actions.ts:135` (and 7 sibling actions)
**Issue:** All Server Actions in Phase 5 (and Phase 3) take `_prev: ActionState | undefined` as the first parameter. The underscore prefix is the React 19 `useActionState` convention for "unused" parameter — but React 19's docs name it `prevState` (no underscore). Mixing conventions (some files have `_prev`, some have `_prevState`) doesn't exist here, but the prefix-with-underscore signals "linter-suppress" rather than "documented unused". This is a style nit.
**Fix:** Either keep `_prev` everywhere (current state) and add a project lint rule documenting it, or align to React 19's `prevState` and use `_` underscore only as the parameter name (`_`).

### IN-03: `lib/policies/errors.ts` defines 3 classes including `PolicyNotFoundError` but the orchestrator only throws it in 2 of 3 documented branches

**File:** `lib/policies/acknowledgment.ts:99`, `:143`
**Issue:** The orchestrator throws `PolicyNotFoundError` in two places:
- Line 99: when `Policies.findById` returns empty
- Line 143: when `PolicyVersions.findByVersionNumber` returns empty (defensive race guard)

The Server Action (`actions.ts:92-98`) maps `PolicyNotFoundError` to `{ ok: false, error: 'Policy not found.', code: 'POLICY_NOT_FOUND' }`. But the UI for this case is identical to the `PolicyArchivedError` flow per D-10 "advertise nothing" — both should mean "404 from the user's perspective". The Server Action returning a typed code lets the UI distinguish, but the UI (`AcknowledgeButton.tsx:72-74`) just displays `state.error` as red text — no special handling per code. So the `code: 'POLICY_NOT_FOUND'` discriminator is currently unused by the only consumer.
**Fix:** Either remove the `code` discriminator from PolicyNotFoundError's ActionState (treat as `{ ok: false, error: 'Policy not found.' }` only) OR add a per-code UI handler that, e.g., shows a "Return to /my-policies" button on the NOT_FOUND case. Current state is dead-code-discriminator.

### IN-04: `PolicyAssignmentsPanel.tsx` server-rendered list of assignees can include `assigneeType === 'user'` rows whose `assigneeId` is rendered as a UUID

**File:** `components/admin/PolicyAssignmentsPanel.tsx:74-82`
**Issue:** The assignment list renders `User: ${a.assigneeId}` for user-type assignments — exposing the raw users.id UUID in the admin UI. This isn't a security issue (admins are authorized to see internal UUIDs), but it's a UX downgrade: an admin who sees `User: 00000000-0000-4000-8000-000000000001` learns nothing about which user is assigned. D-17 explicitly defers individual-user assignment UI to Phase 6+, so user-type rows would only exist via seed/out-of-band SQL. But if they do exist, the UI is hostile.
**Fix:** Either (a) filter user-type rows out of the read-only list entirely until Phase 6+ ships the user-lookup join, OR (b) add a users-table JOIN in the parent Server Component to resolve UUIDs to names/emails. The comment at lines 58-60 acknowledges the FUTURE extension; leaving the user-display path returning raw UUIDs is acceptable for Phase 5 (operator-seeded rows only).

### IN-05: `tests/fixtures/ack-mutation-attempt.ts` is `import 'server-only'` despite being a static-analysis-only fixture

**File:** `tests/fixtures/ack-mutation-attempt.ts:27`
**Issue:** The fixture file declares `import 'server-only';` at line 27, but it's a STATIC fixture for ts-morph AST scanning per the file's own header comment at line 14: "DO NOT EXECUTE — this is a STATIC fixture for AST scanning; the function bodies are unreachable at runtime." The `server-only` guard exists to fail-fast if a file is bundled into the Client. Including it on a file that's never imported or executed adds no value AND could confuse a future contributor into thinking the file is "production-grade enough to need server-only".
**Fix:** Remove the `import 'server-only'` line. The file is documented as non-production code; the guard is misleading.

### IN-06: `lib/db/repositories/policies.ts:138` inline sub-select uses `${users}` Drizzle interpolation but `${userId}` / `${s.orgId}` are direct string interpolation (safe but inconsistent)

**File:** `lib/db/repositories/policies.ts:138`
**Issue:** The dept sub-select reads:
```ts
const userDeptSubquery = sql`(SELECT ${users.departmentId} FROM ${users} WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId})`;
```
Drizzle's `sql\`\`` template literal handles all these interpolations safely: `${users}` resolves to the table identifier, `${users.departmentId}` to the column reference, and `${userId}` / `${s.orgId}` to PARAMETERIZED placeholders (NOT string concatenation — verified per Drizzle docs). So there's no SQL injection. But mixing column-reference interpolation (`${users.departmentId}`) with value interpolation (`${userId}`) in one template is harder to audit at a glance — the reader has to remember which is which. The pattern is correct and documented in RESEARCH gap-6, but a comment block would help.
**Fix:** Add a one-line comment confirming the safe-interpolation status:
```ts
// Drizzle sql`` parameterizes ${userId} + ${s.orgId} as bound parameters;
// ${users.*} resolve to identifier strings. No SQL injection risk.
const userDeptSubquery = sql`...`;
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
