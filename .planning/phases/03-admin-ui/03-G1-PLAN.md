---
phase: 03-admin-ui
plan: G1
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/auth/context.ts
  - lib/policies/transitions.test.ts
  - lib/auth/require-admin.test.ts
  - app/(admin)/policies/[id]/actions.test.ts
  - scripts/check-db-imports.ts
  - scripts/check-auth-context.ts
  - scripts/check-data-layer.ts
  - scripts/check-artifacts.ts
  - package.json
  - scripts/debug-clerk-state.ts
  - scripts/debug-all-sessions.ts
  - scripts/debug-clerk-org.ts
  - scripts/debug-b2iy.ts
  - scripts/sf-w5-manual-recovery.ts
  - scripts/force-clerk-session-refresh.ts
  - scripts/link-jium-to-org.ts
  - scripts/backfill-b2iy.ts
  - app/(auth)/__activate-org/page.tsx
autonomous: true
requirements:
  - REQ-access-control
gap_closure: true
gap_source: .planning/phases/03-admin-ui/03-SMOKE.md
closes_gaps:
  - GAP-1 (BLOCKER) — Clerk text org_id vs DB UUID type mismatch in getOrgContext

must_haves:
  truths:
    - "getOrgContext() returns OrgContext.orgId as an internal UUID matching organizations.id, NOT the Clerk text id (org_***)"
    - "getOrgContext() returns OrgContext.userId as an internal UUID matching users.id, NOT the Clerk text id (user_***)"
    - "OrgContext exposes the original Clerk text ids via OrgContext.clerkOrgId and OrgContext.clerkUserId for webhook + mirror-to-Clerk callers"
    - "withOrgScope's set_config('request.jwt.claims', ...) injects internal UUIDs into request.jwt.claims, so Postgres RLS USING (auth.jwt()->>'org_id' = org_id::text) evaluates UUID-against-UUID and fires correctly"
    - "Policies.statusCounts called via withOrgScope with a Clerk-shaped session no longer fails with Postgres 22P02 invalid input syntax for type uuid"
    - "All transition Server Actions in app/(admin)/policies/[id]/actions.ts continue to work — ctx.userId passed as createdBy lands as a UUID FK to users.id"
    - "app/api/webhooks/clerk/route.ts continues to operate on raw Clerk text ids (it does NOT call getOrgContext()) — webhook namespace is unaffected"
    - "pnpm verify:phase-3 still exits 0 and now includes a new auth-context integration check that exercises the Clerk text → internal UUID translation against the live TEST DB"
    - "All one-off smoke recovery scripts identified in 03-SMOKE.md §Recovery scripts have been deleted; the test-friendly check-org-state.ts is retained"
  artifacts:
    - path: "lib/auth/context.ts"
      provides: "Updated getOrgContext + OrgContext type with internal-UUID orgId/userId + Clerk-text clerkOrgId/clerkUserId"
      contains: "clerkOrgId"
    - path: "lib/auth/context.ts"
      provides: "DB lookup against organizations.clerk_org_id and users.clerk_user_id"
      contains: "clerk_org_id"
    - path: "scripts/check-auth-context.ts"
      provides: "New Phase 3 integration test for getOrgContext → withOrgScope → Policies.statusCounts against the TEST DB"
      contains: "Policies.statusCounts"
    - path: "scripts/check-data-layer.ts"
      provides: "Phase 2 orchestrator extended with the new auth-context check"
      contains: "checkAuthContext"
  key_links:
    - from: "lib/auth/context.ts getOrgContext()"
      to: "organizations.clerk_org_id + users.clerk_user_id"
      via: "select organizations.id by eq(organizations.clerkOrgId, session.orgId) + select users.id by eq(users.clerkUserId, session.userId)"
      pattern: "eq\\(organizations\\.clerkOrgId"
    - from: "lib/db/scoped.ts withOrgScope"
      to: "Postgres RLS auth.jwt()->>'org_id'"
      via: "set_config('request.jwt.claims', {sub: <users.id UUID>, org_id: <organizations.id UUID>, role}, true)"
      pattern: "set_config\\('request\\.jwt\\.claims'"
    - from: "scripts/check-auth-context.ts"
      to: "Policies.statusCounts via withOrgScope"
      via: "seed org+user with known clerk_*_id, mock getOrgContext caller path, assert no 22P02"
      pattern: "statusCounts"
---

<objective>
Fix GAP-1 (BLOCKER from 03-SMOKE.md): `getOrgContext()` currently returns
Clerk's text identifiers (`org_3Dy5O...`, `user_3DpHee...`) directly. Every
Phase 3 admin page query filters by `eq(table.orgId, scope.orgId)` where the
column is UUID, so Postgres rejects with SQLSTATE 22P02
`invalid input syntax for type uuid`. Translate Clerk text → internal UUID
inside `getOrgContext` via a per-request DB lookup. Update the `OrgContext`
type to expose both forms (UUID for tenant-scoped queries; Clerk text for the
webhook + Clerk-mirror namespace). Add an integration test that fails
without the fix and passes with it. Then delete the smoke-test recovery
scripts.

Purpose: Without this fix, no Phase 3 admin page can render. With it,
ROADMAP SC 1-5 for Phase 3 become observable end-to-end via the existing
03-11 smoke walkthrough.

Output:
- `lib/auth/context.ts` rewritten with translation + extended type
- `scripts/check-auth-context.ts` — new TEST-DB integration check
- `scripts/check-data-layer.ts` — wires the new check into `pnpm verify:phase-3`
- `scripts/check-artifacts.ts` — extended to assert the new file shape
- 9 one-off smoke scripts + 1 helper page deleted
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/03-admin-ui/03-SMOKE.md
@.planning/phases/03-admin-ui/03-CONTEXT.md
@.planning/phases/03-admin-ui/03-PATTERNS.md
@CLAUDE.md

<interfaces>
<!-- Current contracts the executor MUST keep working. Extracted from the codebase. -->

From `lib/auth/context.ts` (current — to be replaced):
```typescript
export type Role = 'admin' | 'reviewer' | 'employee';
export type OrgContext = { orgId: string; userId: string; role: Role };
export async function getOrgContext(): Promise<OrgContext>;
```

From `lib/db/scoped.ts` (consumer — DO NOT MODIFY in this plan, only verify it still compiles):
```typescript
export type OrgScope = OrgContext & { tx: PgTransaction<any, any, any> };
export async function withOrgScope<T>(ctx: OrgContext, fn: (scope: OrgScope) => Promise<T>): Promise<T>;
// Internals:
//   const claims = JSON.stringify({ sub: ctx.userId, org_id: ctx.orgId, role: ctx.role });
//   await tx.execute(sql`SET LOCAL ROLE authenticated`);
//   await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
```

From `lib/db/schema.ts`:
```typescript
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),         // INTERNAL UUID
  clerkOrgId: text('clerk_org_id').notNull().unique(), // Clerk text
  // ...
});
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),         // INTERNAL UUID
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }), // NULLABLE per D-03a
  clerkUserId: text('clerk_user_id').notNull().unique(), // Clerk text
  // ...
});
```

From `drizzle/0001_rls_policies.sql` (RLS predicate — DO NOT MODIFY):
```sql
CREATE POLICY "org_isolation" ON policies FOR ALL
  USING (org_id::text = auth.jwt()->>'org_id');
-- (same shape on all 10 tenant tables)
```

From `lib/auth/require-admin.ts:20` — `const ctx = await getOrgContext();` then reads `ctx.role`.

From `lib/policies/transitions.ts` (6 sites at lines 96, 123, 146, 171, 186, 218):
```typescript
const ctx = await getOrgContext();
return withOrgScope(ctx, async (s) => { /* uses s.orgId, s.userId */ });
```

From `app/(admin)/policies/new/actions.ts:119`:
```typescript
const ctx = await getOrgContext();
policyId = await withOrgScope(ctx, async (s) => {
  const rows = await Policies.create(s, { title, category, contentJson });
  // Policies.create() internally writes scope.userId into policies.created_by (UUID FK to users.id)
});
```

From `app/api/webhooks/clerk/route.ts` — does NOT call getOrgContext. Operates in Clerk's text-id namespace by design. NO translation needed here.
</interfaces>

<recovery_scripts_to_delete>
Per `03-SMOKE.md` §Recovery scripts committed under scripts/ — these
9 paths are to be `git rm`'d in Task 3. The file `scripts/check-org-state.ts`
is RETAINED (useful debug, per gap-closure instructions).

- `scripts/debug-clerk-state.ts`
- `scripts/debug-all-sessions.ts`
- `scripts/debug-clerk-org.ts`
- `scripts/debug-b2iy.ts`
- `scripts/sf-w5-manual-recovery.ts`
- `scripts/force-clerk-session-refresh.ts`
- `scripts/link-jium-to-org.ts`
- `scripts/backfill-b2iy.ts`
- `app/(auth)/__activate-org/page.tsx`
</recovery_scripts_to_delete>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Translate Clerk text ids to internal UUIDs inside getOrgContext</name>
  <files>lib/auth/context.ts</files>
  <read_first>
    - lib/auth/context.ts (current implementation — replace entirely)
    - lib/db/schema.ts (organizations + users column shape; org_id FK; D-03a NULLABLE users.org_id)
    - lib/db/scoped.ts (downstream consumer — verify type compatibility; do NOT modify)
    - lib/auth/require-admin.ts (caller of getOrgContext; uses ctx.role)
    - lib/policies/transitions.ts (6 callers of getOrgContext)
    - app/(admin)/policies/new/actions.ts (caller — uses ctx.userId as createdBy UUID)
    - app/(admin)/policies/[id]/actions.ts (caller — updateDraftAction wraps withOrgScope)
    - app/(admin)/dashboard/page.tsx (first failure site per 03-SMOKE.md line 47)
    - app/api/webhooks/clerk/route.ts (confirms webhook does NOT call getOrgContext)
    - .planning/phases/03-admin-ui/03-SMOKE.md (gap source-of-truth)
  </read_first>
  <behavior>
    - Given a Clerk session with userId="user_*ABCD" and orgId="org_*WXYZ", and DB rows `organizations { id: <UUID-org>, clerk_org_id: "org_*WXYZ" }` and `users { id: <UUID-user>, clerk_user_id: "user_*ABCD" }`: getOrgContext() returns `{ orgId: <UUID-org>, userId: <UUID-user>, clerkOrgId: "org_*WXYZ", clerkUserId: "user_*ABCD", role: <narrowed Role> }`.
    - Given a Clerk session whose `clerk_org_id` matches no row in `organizations`: getOrgContext() throws `Error` with message containing `org not provisioned` and the masked Clerk org id (use the same `org_***WXYZ` last-4 form already in webhooks).
    - Given a Clerk session whose `clerk_user_id` matches no row in `users`: throws `Error` with message containing `user not provisioned` and `user_***ABCD`.
    - Given a Clerk session with `userId` but no `orgId` (D-03a window before membership): throws the existing `No active organization` message UNCHANGED (preserves the dashboard's onboarding-redirect path documented in app/(admin)/dashboard/page.tsx).
    - Given Clerk's `auth()` throws: re-throws with `Clerk auth() failed: ...` UNCHANGED (preserves SF-M4 fold from Phase 1).
    - Role narrowing via `asRole()` UNCHANGED (still throws on values outside `'admin'|'reviewer'|'employee'`).
    - Lookup is per-call (no caching this plan — request-scoped caching is a future Phase 7+ perf concern; getOrgContext is already called once per Server Action / Server Component frame).
  </behavior>
  <action>
    Replace `lib/auth/context.ts` entirely. The new file MUST:

    1. Keep `import 'server-only';` and the `Role` + `asRole` exports unchanged.

    2. Widen the `OrgContext` type:
       ```typescript
       export type OrgContext = {
         /** Internal organizations.id (UUID). Use this for all tenant-scoped queries. */
         orgId: string;
         /** Internal users.id (UUID). Use this for createdBy / FK references. */
         userId: string;
         /** Clerk's external organization id (e.g. "org_3Dy5O..."). Use ONLY for mirror-to-Clerk paths. */
         clerkOrgId: string;
         /** Clerk's external user id (e.g. "user_3DpHee..."). Use ONLY for mirror-to-Clerk paths. */
         clerkUserId: string;
         role: Role;
       };
       ```

    3. Replace `getOrgContext()` so that AFTER narrowing `userId`, `orgId`, `sessionClaims` from `await auth()` (existing logic preserved, including the SF-M4 try/catch and the `No active organization` / `Not authenticated` throws), it:
       - Stores the Clerk text ids as `const clerkOrgId = orgId; const clerkUserId = userId;`
       - Imports `db` from `@/lib/db` AND `organizations`, `users` from `@/lib/db/schema` AND `eq` from `drizzle-orm`.
       - Runs TWO parallel `Promise.all([...])` queries:
         - `db.select({ id: organizations.id }).from(organizations).where(eq(organizations.clerkOrgId, clerkOrgId)).limit(1)`
         - `db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1)`
       - If the org row is missing: `throw new Error(\`Org not provisioned in DB for ${maskClerkOrgId(clerkOrgId)} — Clerk organization.created webhook may not have fired or DB-Clerk drift\`);`
       - If the user row is missing: `throw new Error(\`User not provisioned in DB for ${maskClerkId(clerkUserId)} — Clerk user.created webhook may not have fired or DB-Clerk drift\`);`
       - Return `{ orgId: orgRow.id, userId: userRow.id, clerkOrgId, clerkUserId, role: asRole(pubMeta.role) }`.

    4. Add `maskClerkId` + `maskClerkOrgId` helpers MATCHING the shape in `app/api/webhooks/clerk/route.ts` (last-4 chars preserved, `***` middle). Keep them file-local; do NOT extract to a shared module in this plan.

    5. **ADR-023 allow-list:** This file becomes a NEW entry. `lib/auth/context.ts` already imports `auth` from `@clerk/nextjs/server` but did NOT import `db` before. Adding `db` here MUST be reflected in `scripts/check-db-imports.ts`'s `ALLOWLIST`. Modify `scripts/check-db-imports.ts` ALLOWLIST to add the POSIX path `lib/auth/context.ts` with an inline comment `// ADR-023 allow-list entry: getOrgContext translates Clerk text ids to internal UUIDs per gap-closure 03-G1.` Also bump the positive-control assertion: if the positive control currently is `allowListedHits >= 2`, change to `allowListedHits >= 3`.

    6. Update header comment block: replace the existing first comment paragraph with a paragraph documenting the new contract:
       ```
       // lib/auth/context.ts — L-02 (getOrgContext) + D-04 (publicMetadata.role
       // narrowing) + SF-M4 fold (try/catch around await auth()) + 03-G1
       // (Clerk text id → internal UUID translation; closes GAP-1 from
       // .planning/phases/03-admin-ui/03-SMOKE.md).
       //
       // OrgContext.orgId / OrgContext.userId are INTERNAL UUIDs (organizations.id,
       // users.id). OrgContext.clerkOrgId / OrgContext.clerkUserId carry the
       // original Clerk text refs for the webhook + Clerk-mirror namespace.
       // The translation is a per-request DB lookup against organizations.clerk_org_id
       // and users.clerk_user_id (unique). RLS predicates compare auth.jwt()->>'org_id'
       // against the UUID-typed org_id column, so withOrgScope MUST inject the
       // UUID form — NOT the Clerk text id (the production bug GAP-1 closed).
       ```

    7. `pnpm tsc --noEmit` MUST exit 0 against the modified `lib/auth/context.ts` AND every existing caller (require-admin.ts, transitions.ts, new/actions.ts, [id]/actions.ts, dashboard/page.tsx). No caller needs to change — the OrgContext only WIDENED with new fields; the existing `orgId`/`userId`/`role` fields remain (but now carry UUID values instead of Clerk text). Existing transition tests in `lib/policies/transitions.test.ts` mock the OrgContext at line 55 — they MUST be updated to add the two new fields. Update that mock:
       ```typescript
       // lib/policies/transitions.test.ts line ~55
       getOrgContext: async () => ({
         orgId: <existing test UUID>,
         userId: <existing test UUID>,
         clerkOrgId: 'clerk_test_org',
         clerkUserId: 'clerk_test_user',
         role: 'admin',
       }),
       ```
       Same shape for `lib/auth/require-admin.test.ts` ctx fixtures (lines 38, 43, 52) — add `clerkOrgId: 'clerk_test_org'` and `clerkUserId: 'clerk_test_user'` to each `getOrgContextMock.mockResolvedValueOnce({...})` payload.

       THIRD FIXTURE SITE — `app/(admin)/policies/[id]/actions.test.ts` mocks `getOrgContext` at lines 40-42 AND `withOrgScope` at lines 58-59. Update BOTH mocks to add the new fields:
       ```typescript
       // app/(admin)/policies/[id]/actions.test.ts ~line 40
       vi.mock('@/lib/auth/context', () => ({
         getOrgContext: vi.fn(async () => ({
           orgId: 'org_1',
           userId: 'user_1',
           clerkOrgId: 'clerk_test_org',
           clerkUserId: 'clerk_test_user',
           role: 'admin' as const,
         })),
       }));

       // app/(admin)/policies/[id]/actions.test.ts ~line 47 (withOrgScope mock)
       vi.mock('@/lib/db/scoped', () => ({
         withOrgScope: async (
           _ctx: unknown,
           fn: (s: {
             orgId: string;
             userId: string;
             clerkOrgId: string;
             clerkUserId: string;
             role: 'admin' | 'reviewer' | 'employee';
             tx: Record<string, unknown>;
           }) => Promise<unknown>,
         ) =>
           fn({
             orgId: 'org_1',
             userId: 'user_1',
             clerkOrgId: 'clerk_test_org',
             clerkUserId: 'clerk_test_user',
             role: 'admin',
             tx: {},
           }),
       }));
       ```
       Without this fix, the widened OrgContext type causes tsc to fail in the [id]/actions.test.ts fixtures (the inner `s:` type in withOrgScope's fn signature already references the OrgContext shape, so it must include the two new fields).

    Per CLAUDE.md ALWAYS #1: `pnpm tsc --noEmit` MUST be clean before commit.
    Per CLAUDE.md NEVER #4: no `any` introduced. No `as any` casts.
  </action>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0.
    - `grep -nE 'clerkOrgId: string' lib/auth/context.ts` matches at least once (type field declared).
    - `grep -nE 'clerkUserId: string' lib/auth/context.ts` matches at least once.
    - `grep -nE 'eq\(organizations\.clerkOrgId' lib/auth/context.ts` matches at least once (lookup wired).
    - `grep -nE 'eq\(users\.clerkUserId' lib/auth/context.ts` matches at least once.
    - `grep -nE "from '@/lib/db'" lib/auth/context.ts` matches (raw db import added).
    - `grep -nE 'Org not provisioned in DB for' lib/auth/context.ts` matches (missing-org error path).
    - `grep -nE 'User not provisioned in DB for' lib/auth/context.ts` matches.
    - `grep -nE 'maskClerkOrgId|maskClerkId' lib/auth/context.ts` matches at least twice (helpers defined + used in errors).
    - `grep -nE 'ALLOWLIST' scripts/check-db-imports.ts` matches and the file contains the literal string `lib/auth/context.ts` somewhere in the ALLOWLIST block.
    - `grep -cE 'allowListedHits >= 3' scripts/check-db-imports.ts` is 1 (positive control bumped from 2 to 3); the previous `allowListedHits >= 2` literal MUST be absent: `grep -cE 'allowListedHits >= 2' scripts/check-db-imports.ts` is 0.
    - `pnpm vitest run lib/policies/transitions.test.ts lib/auth/require-admin.test.ts 'app/(admin)/policies/[id]/actions.test.ts'` exits 0 — the mock OrgContext fixtures in ALL THREE files updated to include `clerkOrgId` + `clerkUserId`.
    - `grep -cE 'clerkOrgId' 'app/(admin)/policies/[id]/actions.test.ts'` is at least 2 (getOrgContext mock + withOrgScope mock both updated).
    - `grep -cE 'clerkUserId' 'app/(admin)/policies/[id]/actions.test.ts'` is at least 2.
    - `grep -cE 'No active organization' lib/auth/context.ts` is 1 (preserved unchanged for D-03a onboarding redirect path).
    - `grep -cE 'Clerk auth\(\) failed' lib/auth/context.ts` is 1 (SF-M4 fold preserved).
  </acceptance_criteria>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm vitest run lib/policies/transitions.test.ts lib/auth/require-admin.test.ts 'app/(admin)/policies/[id]/actions.test.ts'</automated>
  </verify>
  <done>
    `lib/auth/context.ts` translates Clerk text → internal UUID inside getOrgContext, exposes both forms on OrgContext, and tsc + the 2 affected vitest files are green. `scripts/check-db-imports.ts` allow-list updated.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add scripts/check-auth-context.ts integration test + wire into verify:phase-3</name>
  <files>scripts/check-auth-context.ts, scripts/check-data-layer.ts, scripts/check-artifacts.ts, package.json</files>
  <read_first>
    - scripts/check-rls.ts (pattern for postgres-js + SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ...) seed-and-rollback)
    - scripts/check-data-layer.ts (verify orchestrator — pattern for runChild + Result reporting; bump check count from 7 to 8)
    - scripts/check-artifacts.ts (artifact regression gate — add Phase 3 G1 assertions)
    - lib/auth/context.ts (the file under test, post-Task-1)
    - lib/db/scoped.ts (withOrgScope; the new check exercises this)
    - lib/db/repositories/policies.ts (Policies.statusCounts — first query that 500'd in smoke)
    - lib/db/schema.ts (organizations + users + policies column shapes)
    - drizzle/0001_rls_policies.sql (RLS predicate format)
    - package.json (verify:phase-3 script wiring)
  </read_first>
  <behavior>
    - Given a fresh TEST DB with TRUNCATE-everything-CASCADE preconditions, the test seeds one organization row with a known internal UUID + known clerk_org_id text, plus one user row with known users.id UUID + known clerk_user_id text linked to that org.
    - Test then calls withOrgScope directly with an OrgContext shaped EXACTLY as the new getOrgContext returns: `{ orgId: <seeded organizations.id UUID>, userId: <seeded users.id UUID>, clerkOrgId: <seeded clerk_org_id>, clerkUserId: <seeded clerk_user_id>, role: 'admin' }`.
    - Inside the scope, calls `Policies.statusCounts(scope)` (the first query that 500'd in the smoke per 03-SMOKE.md).
    - Asserts: `statusCounts` returns Record<PolicyStatus, number> with all four keys (`draft`, `under_review`, `published`, `archived`) zero-filled per lib/db/repositories/policies.ts:140-159 — AND no Postgres 22P02 error thrown.
    - As a SECOND assertion, seeds a policy row for the org and re-runs statusCounts; asserts `counts.draft === 1` and the other three keys remain 0 (direct Record access — NOT array.find).
    - As a NEGATIVE control, the test verifies that calling withOrgScope with a Clerk-text-shaped orgId (the OLD bug shape: `'org_test_text_id'` as orgId instead of the UUID) makes statusCounts throw a Postgres error mentioning `22P02` or `invalid input syntax for type uuid`. If it does NOT throw, the bug is back — the test fails. This is the regression guard.
    - Test cleans up via final TRUNCATE so it leaves the TEST DB tidy (same pattern as check-rls.ts).
    - Exits 0 on all assertions pass, 1 on any failure.
  </behavior>
  <action>
    1. **Create `scripts/check-auth-context.ts`** (new file, ~120-160 lines).
       Modeled on `scripts/check-rls.ts` for postgres-js + seed + rollback hygiene, but exercises the full L-01 / L-02 / scope.ts chain rather than a bare SQL probe.

       Imports:
       ```typescript
       import postgres from 'postgres';
       import { drizzle } from 'drizzle-orm/postgres-js';
       import { randomUUID } from 'node:crypto';
       import { organizations, users, policies } from '@/lib/db/schema';
       import type { OrgContext } from '@/lib/auth/context';
       ```
       Note: this file does NOT call `getOrgContext()` directly (that would
       require a real Clerk session). Instead it constructs an `OrgContext`
       shaped EXACTLY as the new getOrgContext would produce after the fix.

       However, it DOES import `withOrgScope` from `@/lib/db/scoped` and
       `Policies` from `@/lib/db/repositories/policies` — to do that it
       MUST monkey-patch `@/lib/db` for the duration of the test, OR the
       test should drive its own `drizzle()` client connected to
       `DATABASE_URL_TEST` and patch the module via dynamic import override.

       Use this approach (simpler, no module-patching needed): set
       `process.env.DATABASE_URL = process.env.DATABASE_URL_TEST` (and
       `DIRECT_URL = DIRECT_URL_TEST`) BEFORE the dynamic import of
       `withOrgScope` and `Policies`. Wrap the dynamic imports in a function
       so they happen AFTER the env override:
       ```typescript
       async function loadScopedAndRepos() {
         process.env.DATABASE_URL = process.env.DATABASE_URL_TEST!;
         process.env.DIRECT_URL = process.env.DIRECT_URL_TEST!;
         const { withOrgScope } = await import('@/lib/db/scoped');
         const { Policies } = await import('@/lib/db/repositories/policies');
         return { withOrgScope, Policies };
       }
       ```

       Top-of-file guard (mirrors check-rls.ts):
       ```typescript
       const TEST_URL: string = (() => {
         const v = process.env.DATABASE_URL_TEST;
         if (!v) {
           console.error('DATABASE_URL_TEST not set. See .env.local Plan 02-02 D-05.');
           process.exit(1);
         }
         return v;
       })();
       ```

       Body:
       1. Open seed connection with `postgres(TEST_URL, { prepare: false })`.
       2. In a `sql.begin` block: TRUNCATE policies, users, organizations CASCADE; INSERT organization with `{ id: orgUuid, clerkOrgId: 'clerk_org_check_authctx', name: 'CheckAuthCtx Org', slug: 'check-authctx-' + orgUuid.slice(0,8) }`; INSERT user with `{ id: userUuid, orgId: orgUuid, clerkUserId: 'clerk_user_check_authctx', role: 'admin' }`.
       3. Call `loadScopedAndRepos()`.
       4. Build the OrgContext fixture:
          ```typescript
          const ctxFixture: OrgContext = {
            orgId: orgUuid,
            userId: userUuid,
            clerkOrgId: 'clerk_org_check_authctx',
            clerkUserId: 'clerk_user_check_authctx',
            role: 'admin',
          };
          ```
       5. **Positive assertion #1 — empty:**
          ```typescript
          const emptyCounts = await withOrgScope(ctxFixture, async (s) => Policies.statusCounts(s));
          // Policies.statusCounts returns Record<PolicyStatus, number> with all four keys
          // zero-filled (see lib/db/repositories/policies.ts:140-159). For empty policies,
          // every key should be 0.
          if (
            emptyCounts.draft !== 0 ||
            emptyCounts.under_review !== 0 ||
            emptyCounts.published !== 0 ||
            emptyCounts.archived !== 0
          ) {
            throw new Error(`expected all-zero counts for empty policies, got ${JSON.stringify(emptyCounts)}`);
          }
          ```
       6. **Positive assertion #2 — with seeded policy:**
          Seed one policy row in a separate `sql.begin` block:
          ```sql
          INSERT INTO policies (id, org_id, title, content_json, category, status)
          VALUES (gen_random_uuid(), <orgUuid>, 'Draft Policy', '{}'::jsonb, 'HR', 'draft');
          ```
          Then:
          ```typescript
          const oneCounts = await withOrgScope(ctxFixture, async (s) => Policies.statusCounts(s));
          // Direct Record access — Policies.statusCounts returns Record<PolicyStatus, number>
          if (oneCounts.draft !== 1) {
            throw new Error(`expected exactly 1 draft, got ${JSON.stringify(oneCounts)}`);
          }
          // Other statuses MUST stay zero — guards against accidental cross-status counting
          if (oneCounts.under_review !== 0 || oneCounts.published !== 0 || oneCounts.archived !== 0) {
            throw new Error(`expected only draft=1, other statuses zero; got ${JSON.stringify(oneCounts)}`);
          }
          ```
       7. **Negative-control assertion — the bug must not be back:**
          Construct a malformed context that mirrors the old GAP-1 bug shape
          (Clerk text id in the `orgId` slot):

          IMPORTANT (per W-1): The 22P02 error this assertion catches is thrown
          by the Postgres UUID cast inside Drizzle's `where(eq(policies.orgId, s.orgId))`
          (`policies.org_id` is column-typed `uuid`, so a text value like
          `org_3Dy5O_buggy_clerk_text_form` fails the parse before any row scan).
          This negative control guards against regression in the APPLICATION-LAYER
          query — specifically the contract that getOrgContext now hands withOrgScope
          a UUID rather than Clerk text. RLS coverage (the JWT-claims layer) stays
          in `scripts/check-rls.ts`, which probes `auth.jwt()->>'org_id'` directly.
          Add this clarification as a code comment inside check-auth-context.ts above
          the buggyCtx construction so future readers don't confuse the two layers.

          ```typescript
          // NEGATIVE CONTROL — guards the application-layer cast, not RLS.
          // The 22P02 fires from `where(eq(policies.orgId, s.orgId))` casting
          // the text 'org_*' into the uuid column type. RLS predicate coverage
          // lives in scripts/check-rls.ts (auth.jwt()->>'org_id' evaluation).
          const buggyCtx: OrgContext = {
            ...ctxFixture,
            orgId: 'org_3Dy5O_buggy_clerk_text_form', // bug shape: text instead of UUID
          };
          let bugTriggered = false;
          try {
            await withOrgScope(buggyCtx, async (s) => Policies.statusCounts(s));
          } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            if (detail.includes('22P02') || /invalid input syntax for type uuid/i.test(detail)) {
              bugTriggered = true;
            }
          }
          if (!bugTriggered) {
            throw new Error('Negative control failed: Clerk-text orgId did NOT trigger Postgres 22P02 — RLS or column type may have drifted from UUID');
          }
          ```
       8. Final TRUNCATE cleanup (same shape as check-rls.ts:172-176).
       9. `await sql.end({ timeout: 5 })` in `finally`.
       10. Exits 0 on success with summary log `OK — G1 auth-context translation: Policies.statusCounts works against Clerk-shaped UUID context; bug-shape Clerk text id still rejected by Postgres.`

    2. **Modify `scripts/check-data-layer.ts`** (orchestrator):
       - Add a new function `checkAuthContext(): Result` modeled on `checkRls()` at line ~138:
         ```typescript
         function checkAuthContext(): Result {
           return runChild(
             [TSX_ENTRY, 'scripts/check-auth-context.ts'],
             '03-G1 — auth-context Clerk-text → UUID translation (TEST DB)',
           );
         }
         ```
       - In `main()`, insert this new check AFTER the existing `checkRls` (current step 4) and BEFORE `checkSchema` (step 5). Bump the total step count from 7 to 8 everywhere (`logResult(N, 8, ...)`).
       - Add the call:
         ```typescript
         const c5 = checkAuthContext();
         results.push(c5);
         logResult(5, 8, c5);
         ```
         Renumber the subsequent existing checks (schema → 6/8, artifacts → 7/8, stale-null → 8/8).

    3. **Modify `scripts/check-artifacts.ts`** to add Phase 3 G1 assertions:
       - Add a new function `checkPhase3G1Artifacts(): void` (modeled on existing Phase 2 functions). Assertions:
         - File `lib/auth/context.ts` contains `clerkOrgId: string` (substring).
         - File `lib/auth/context.ts` contains `eq(organizations.clerkOrgId` (substring).
         - File `lib/auth/context.ts` contains `eq(users.clerkUserId` (substring).
         - File `lib/auth/context.ts` contains `from '@/lib/db'` (substring — db import added).
         - File `lib/auth/context.ts` contains `Org not provisioned in DB for` (substring).
         - File `lib/auth/context.ts` contains `User not provisioned in DB for` (substring).
         - File `scripts/check-auth-context.ts` exists and contains `Policies.statusCounts` (substring).
         - File `scripts/check-auth-context.ts` contains `bugTriggered` (negative-control sentinel substring).
         - File `scripts/check-auth-context.ts` contains `clerk_org_check_authctx` (seed sentinel substring — unique to this test, prevents accidental delete).
         - File `scripts/check-data-layer.ts` contains `checkAuthContext` (function name substring).
         - File `scripts/check-data-layer.ts` contains `'03-G1 — auth-context Clerk-text → UUID translation` (label substring).
         - File `scripts/check-data-layer.ts` contains `logResult(N, 8,` pattern — verify the step count was bumped from 7 to 8: grep that `logResult(1, 8,` appears exactly once (mechanical line edit confirmed).
         - File `scripts/check-db-imports.ts` ALLOWLIST contains the substring `lib/auth/context.ts`.
         - Negative assertion: `scripts/check-db-imports.ts` does NOT contain `allowListedHits >= 2` (bumped to >= 3).
       - Wire into the main check function alongside the other Phase 3 artifact checks.

    4. **Modify `package.json`** — REQUIRED edits (per B-1 fix). The current `verify:phase-3` script (line 29) chains `check:db-imports`, `check:rls`, `check:admin-routes`, `check:artifacts` and `test` directly — it does NOT invoke `check-data-layer.ts`. The Step 2 wiring (above) into `check-data-layer.ts` only surfaces under `verify:phase-2`. Therefore `verify:phase-3` will NOT exercise the new check without an explicit edit here.

       Make TWO surgical edits to `package.json`'s `scripts` block:

       a) Add a new script line directly after the existing `"check:rls"` line (currently line 25):
          ```json
          "check:auth-context": "tsx --env-file=.env.local scripts/check-auth-context.ts",
          ```
          (The script name is hyphenated to match the existing `check:db-imports` / `check:rls` style; the same env-file flag is used so the runtime picks up `DATABASE_URL_TEST` from `.env.local` per the Plan 02-02 D-05 dual-DB convention.)

       b) Modify the `verify:phase-3` line (currently line 29) to insert `pnpm check:auth-context` between `pnpm check:rls` and `pnpm check:admin-routes`. The full new chain becomes:
          ```json
          "verify:phase-3": "pnpm typecheck && pnpm check:db-imports && pnpm check:rls && pnpm check:auth-context && pnpm check:admin-routes && pnpm check:artifacts && pnpm test && node -e \"require('fs').rmSync('.tmp/svix-url.json', { force: true })\""
          ```

       KEEP the Step 2 wiring into `scripts/check-data-layer.ts` as well — defense-in-depth. This ensures `verify:phase-2` also exercises the new check (Phase 4+ may inherit it). The same `scripts/check-auth-context.ts` file is invoked from both code paths.

       Verify with `grep -n 'check:auth-context' package.json` (should match twice — once as the script definition, once as the verify:phase-3 chain consumer).

    Per CLAUDE.md ALWAYS #2 (org_id in every DB query): the new file uses
    raw `postgres(TEST_URL)` for seeding (BYPASSRLS user — same as check-rls.ts).
    The assertion path goes through withOrgScope which forces SET LOCAL ROLE
    authenticated + set_config — RLS fires as designed.
  </action>
  <acceptance_criteria>
    - File `scripts/check-auth-context.ts` exists.
    - `grep -cE 'DATABASE_URL_TEST' scripts/check-auth-context.ts` is at least 1.
    - `grep -cE 'Policies\.statusCounts' scripts/check-auth-context.ts` is at least 2 (positive #1 + positive #2).
    - `grep -cE 'bugTriggered' scripts/check-auth-context.ts` is at least 2 (declared + checked).
    - `grep -cE '22P02|invalid input syntax for type uuid' scripts/check-auth-context.ts` is at least 1 (negative control predicate).
    - `grep -cE 'clerk_org_check_authctx' scripts/check-auth-context.ts` is at least 1 (unique sentinel).
    - `grep -cE 'TRUNCATE TABLE' scripts/check-auth-context.ts` is at least 1 (cleanup).
    - `grep -cE 'withOrgScope' scripts/check-auth-context.ts` is at least 3 (positive #1, positive #2, negative).
    - `grep -nE 'checkAuthContext' scripts/check-data-layer.ts` matches in TWO sites (function def + main() call site).
    - `grep -cE 'logResult\([0-9]+, 8,' scripts/check-data-layer.ts` is at least 8 (8 logResult calls, one per check, total bumped from 7→8).
    - `grep -cE 'logResult\([0-9]+, 7,' scripts/check-data-layer.ts` is 0 (no leftover 7-of-7 callsites).
    - `grep -c '"check:auth-context"' package.json` is exactly 1 (script definition added).
    - `grep -c 'pnpm check:auth-context' package.json` is exactly 1 (verify:phase-3 chain consumer; ensures the new check actually runs under verify:phase-3, not just verify:phase-2).
    - `pnpm verify:phase-3` exits 0 with one additional OK line referencing `03-G1 — auth-context Clerk-text → UUID translation`.
    - `pnpm tsc --noEmit` exits 0.
    - The negative-control branch fires: run `scripts/check-auth-context.ts` directly via `pnpm tsx --env-file=.env.local scripts/check-auth-context.ts` and confirm stdout ends with the success log including the literal `OK — G1 auth-context translation`.
  </acceptance_criteria>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm tsx --env-file=.env.local scripts/check-auth-context.ts && pnpm verify:phase-3</automated>
  </verify>
  <done>
    `pnpm verify:phase-3` now runs 7+ checks including the new 03-G1 auth-context integration check; the check passes against the live TEST DB; the negative control (Clerk-text orgId injected into withOrgScope) reliably triggers Postgres 22P02, providing the regression guard.
  </done>
</task>

<task type="auto">
  <name>Task 3: Delete one-off smoke recovery scripts</name>
  <files>scripts/debug-clerk-state.ts, scripts/debug-all-sessions.ts, scripts/debug-clerk-org.ts, scripts/debug-b2iy.ts, scripts/sf-w5-manual-recovery.ts, scripts/force-clerk-session-refresh.ts, scripts/link-jium-to-org.ts, scripts/backfill-b2iy.ts, app/(auth)/__activate-org/page.tsx, scripts/check-artifacts.ts</files>
  <read_first>
    - .planning/phases/03-admin-ui/03-SMOKE.md (§Recovery scripts committed under scripts/ — authoritative deletion list)
    - scripts/check-artifacts.ts (verify none of the deletions are referenced as required artifacts; if so, remove the assertion)
    - scripts/check-org-state.ts (RETAINED — confirm it is NOT in the delete list)
    - scripts/check-foundation.ts + scripts/check-data-layer.ts (verify nothing wires these scripts into a pnpm verify chain)
  </read_first>
  <action>
    1. Delete via `git rm` (so the deletion is staged for the same commit as the fix). Use one `git rm` per file to keep the diff readable:
       ```
       git rm scripts/debug-clerk-state.ts
       git rm scripts/debug-all-sessions.ts
       git rm scripts/debug-clerk-org.ts
       git rm scripts/debug-b2iy.ts
       git rm scripts/sf-w5-manual-recovery.ts
       git rm scripts/force-clerk-session-refresh.ts
       git rm scripts/link-jium-to-org.ts
       git rm scripts/backfill-b2iy.ts
       git rm "app/(auth)/__activate-org/page.tsx"
       ```
       9 deletions total. `scripts/check-org-state.ts` is RETAINED.

    2. Audit `scripts/check-artifacts.ts` — `grep -nE 'debug-clerk-state|debug-all-sessions|debug-clerk-org|debug-b2iy|sf-w5-manual-recovery|force-clerk-session-refresh|link-jium-to-org|backfill-b2iy|__activate-org' scripts/check-artifacts.ts`. If any of the 9 paths is referenced as a required artifact assertion, DELETE that assertion line (the recovery scripts were one-offs; they should never have been gated). If grep returns zero matches, no action needed.

    3. Verify the `(auth)` route group still has a viable shape after the `__activate-org/page.tsx` deletion:
       - `ls "app/(auth)/"` should still show `sign-in/`, `sign-up/`, `post-sign-in/` (or whatever Plan 03-02 shipped). Confirm at least `sign-in/[[...sign-in]]/page.tsx` and `sign-up/[[...sign-up]]/page.tsx` still exist.
       - DO NOT delete the `(auth)` directory itself.

    4. Run `pnpm tsc --noEmit` to confirm no dead imports referenced the deleted scripts. The `(auth)/__activate-org/page.tsx` was a leaf route page — TS won't complain on deletion unless something imported from it. **Per W-2: scope the sanity-check grep to execution-relevant paths ONLY** — run `grep -rn '__activate-org' app lib scripts drizzle package.json .env.local.example 2>&1` and confirm it returns zero matches. DO NOT include `.planning/` or `.wiki/` — those are historical documentation references and are expected to retain the script names for audit-trail purposes.

    5. Run `pnpm verify:phase-3` end-to-end — must still exit 0 after the deletions + check-artifacts.ts edits.
  </action>
  <acceptance_criteria>
    - `ls scripts/debug-clerk-state.ts scripts/debug-all-sessions.ts scripts/debug-clerk-org.ts scripts/debug-b2iy.ts scripts/sf-w5-manual-recovery.ts scripts/force-clerk-session-refresh.ts scripts/link-jium-to-org.ts scripts/backfill-b2iy.ts 2>&1 | grep -cE 'No such file|cannot find'` is at least 8 (all 8 scripts deleted).
    - `ls "app/(auth)/__activate-org/page.tsx" 2>&1 | grep -cE 'No such file|cannot find'` is at least 1.
    - `ls scripts/check-org-state.ts` exits 0 (RETAINED — not deleted).
    - `git status --porcelain` shows 9 'D' entries for the 9 deletions, plus the modified `scripts/check-artifacts.ts` if assertions were stripped.
    - `pnpm tsc --noEmit` exits 0.
    - `pnpm verify:phase-3` exits 0.
    - **Scoped grep — execution paths only (per W-2):** the grep target list (__activate-org plus the 8 deleted scripts) MUST return zero matches when restricted to executable code only. Run the same grep but scoped to `app lib scripts drizzle package.json .env.local.example` (NOT `.planning/` or `.wiki/` — those are historical doc paths and may retain script names for audit-trail purposes). Use the OR pattern with backslash-escaped pipes in single quotes (POSIX BRE) as in the original audit step. Audit fails ONLY if a deleted script is referenced from executable code, build config, or runtime env files.
  </acceptance_criteria>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm verify:phase-3</automated>
  </verify>
  <done>
    All 9 one-off smoke recovery scripts + the `__activate-org` helper page are removed from the working tree. `scripts/check-org-state.ts` retained per gap-closure instructions. `pnpm verify:phase-3` still exits 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Clerk session → Server Action / Server Component | `await auth()` reads externally-issued session token; getOrgContext now performs a DB lookup before returning identity |
| Server Action → DB | withOrgScope sets JWT claims via set_config; RLS evaluates against the injected `org_id` claim |
| Webhook → DB | app/api/webhooks/clerk/route.ts operates as service-role (BYPASSRLS); raw Clerk text ids written into clerk_org_id / clerk_user_id columns |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-G1-01 | Spoofing | getOrgContext caller forging session.orgId pointing at another org | mitigate | Clerk session token signing (existing); the DB lookup against organizations.clerk_org_id UNIQUE constraint maps to exactly one tenant — no broadening of the attack surface vs. Clerk's existing session integrity. |
| T-03-G1-02 | Tampering | sessionClaims.publicMetadata.role narrowing | accept | Preserved unchanged from Phase 2 (asRole throws on non-Role values). |
| T-03-G1-03 | Information Disclosure | Error messages leaking which Clerk org ids are known to the DB | mitigate | `maskClerkOrgId` / `maskClerkId` applied to ALL error paths in getOrgContext — last-4 chars only, mirroring the webhook handler's existing convention. |
| T-03-G1-04 | Denial of Service | Every authenticated request now does 2 extra DB roundtrips (org + user lookup) | accept | Parallelized via Promise.all; each query hits a UNIQUE index (clerk_org_id, clerk_user_id) so latency is <5ms typical. Request-scoped caching is a Phase 7+ perf concern. |
| T-03-G1-05 | Elevation of Privilege | A user existing in Clerk but missing from `users` DB could fall through to a generic error and bypass auth | mitigate | getOrgContext throws on missing user row — callers (require-admin, transitions, Server Actions) already handle thrown errors via Next.js error boundaries and notFound() returns. The dashboard's existing onboarding-redirect path (app/(admin)/dashboard/page.tsx) catches `No active organization` AND `User not provisioned in DB` errors as the same "not-yet-onboarded" state. |
| T-03-G1-06 | Tampering | Cross-org policyId in createPolicyAction → createdBy UUID FK | mitigate | scope.userId is now a TRUE users.id UUID (was Clerk text — FK violation would have been caught by Postgres anyway). Phase 3 transition tests in lib/policies/transitions.test.ts continue to enforce this contract. |
| T-03-G1-SC | Tampering | npm/pip/cargo installs | accept | No new packages introduced by this plan. All imports (drizzle-orm, @clerk/nextjs/server, postgres) are existing deps from Phase 2. |

</threat_model>

<verification>
## Phase-level gates (re-run end-to-end after all 3 tasks ship)

1. `pnpm tsc --noEmit` — zero errors.
2. `pnpm vitest run` — all existing tests pass (transitions + require-admin mocks updated with new ctx fields).
3. `pnpm verify:phase-3` — exits 0 with the new `03-G1 — auth-context Clerk-text → UUID translation` step showing OK.
4. Manual sanity probe (operator):
   - Sign in to the local app as the b2iy/JIum operator (real Clerk session).
   - Visit `/dashboard` — page renders without 500.
   - Visit `/policies` — page renders without 500.
   - Click "Create policy" → fill form → submit → redirect to `/policies/{uuid}` succeeds.
5. `git status` shows the expected 9 deletions plus modifications to `lib/auth/context.ts`, `scripts/check-auth-context.ts` (new), `scripts/check-data-layer.ts`, `scripts/check-artifacts.ts`, `scripts/check-db-imports.ts`, `lib/policies/transitions.test.ts`, `lib/auth/require-admin.test.ts`, optionally `package.json`.
</verification>

<success_criteria>
- `pnpm verify:phase-3` exits 0 with 7/7 OK before this plan AND continues to exit 0 with 8/8 OK after this plan (new auth-context check added).
- The smoke walkthrough (ROADMAP SC #1–#5 for Phase 3) can be re-run end-to-end without any of the now-deleted recovery scripts — operator's existing Clerk session + DB state are sufficient.
- A Postgres 22P02 error on `policies.org_id` is impossible to reproduce with the production code path (negative control in the new integration test enforces this regression guard).
- `lib/auth/context.ts` line count grows by roughly 50-80 lines (helpers + lookup + extended type) but stays under 200 lines.
</success_criteria>

<output>
Create `.planning/phases/03-admin-ui/03-G1-SUMMARY.md` when done with:
- Commit hashes for each task
- `pnpm verify:phase-3` runtime + OK count delta (7→8)
- List of files deleted (9 + the optional check-artifacts.ts assertion strip)
- Confirmation that the smoke walkthrough now renders /dashboard and /policies without 500
- Any deviations from this plan with rationale
</output>
