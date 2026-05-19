---
phase: 02
date: 2026-05-18
depth: deep
status: issues_found
files_reviewed: 23
files_reviewed_list:
  - lib/db/schema.ts
  - lib/db/scoped.ts
  - lib/db/index.ts
  - lib/auth/context.ts
  - lib/db/repositories/policies.ts
  - lib/db/repositories/policy_versions.ts
  - lib/db/repositories/policy_assignments.ts
  - lib/db/repositories/acknowledgments.ts
  - lib/db/repositories/users.ts
  - lib/db/repositories/departments.ts
  - lib/db/repositories/ai_generations.ts
  - lib/db/repositories/notifications.ts
  - lib/db/repositories/workflow_stages.ts
  - drizzle/0000_initial.sql
  - drizzle/0001_rls_policies.sql
  - drizzle.config.ts
  - app/api/webhooks/clerk/route.ts
  - middleware.ts
  - scripts/check-db-imports.ts
  - scripts/check-rls.ts
  - scripts/check-schema.ts
  - scripts/check-data-layer.ts
  - scripts/check-artifacts.ts
  - tests/types.ts
  - package.json
findings_critical: 2
findings_high: 4
findings_medium: 6
findings_low: 4
findings:
  critical: 2
  warning: 10
  info: 4
  total: 16
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-18
**Depth:** deep (cross-file analysis of multi-tenancy chokepoints)
**Status:** issues_found

## Methodology and Scope

Files in scope: 16 Phase-2 source files (the 6 locked deliverables L-01..L-06 + the 9 repositories + the 2 migrations + tests/types.ts + drizzle.config.ts modifications + middleware.ts SF-M4 fold). Cross-referenced against `02-CONTEXT.md` decisions (D-01..D-09 + L-01..L-06), `CLAUDE.md` operating rules, `reference/SCHEMA.md` frozen contract, and ADR-018/023/025.

**Commits reviewed:** `c1dcf6f` (Plan 02-03 first commit) through `9888cf5` (Plan 02-06 verify wiring). All commits with `feat(02-` / `fix(02-` / `chore(02-` prefixes:
- 02-01: `75b397e` (schema) · `e7c6b43` (scoped + context) · `2fff189` (type tests)
- 02-03: `c1dcf6f` (drizzle config) · `0bbf321` (generate) · `f443cd0` (RLS hand-edit)
- 02-04: `2973555` + `e71000a` (9 repositories)
- 02-05: `a9301b2` (svix dep) · `6ae44f5` (clerk webhook) · `c39ea98` (SF-M4 fold)
- 02-06: `e160728` (ts-morph dep) · `c31d1c8` · `a156dc5` · `ff82746` · `9888cf5` (verify scripts)

**Adversarial stance:** I assumed every file contained at least one defect and went looking. Findings below were reproduced by reading the cited line and tracing dependencies.

---

## Critical Issues

### CR-01: Webhook does not write Clerk publicMetadata.role — every authenticated request after sign-up will crash

**File:** `app/api/webhooks/clerk/route.ts:184-201` (organizationMembership.created) and `:215-218` (organizationMembership.updated)

**Code excerpt:**
```typescript
// organizationMembership.created
const updateResult = await db
  .update(users)
  .set({
    orgId: orgInternalId,
    ...(roleStr ? { role: roleStr } : {}),
  })
  .where(eq(users.clerkUserId, clerkUserId))
  .returning({ id: users.id });
```

**Problem:** D-04 (`02-CONTEXT.md` line 110) explicitly mandates: *"The webhook handler at `/api/webhooks/clerk` writes our enum into `users.role` AND into the Clerk user's `publicMetadata.role` so that the session claim and the DB row stay in sync."* The handler writes only the local `users` row. It does NOT call Clerk's backend API (e.g., `clerkClient.users.updateUserMetadata(clerkUserId, { publicMetadata: { role: roleStr } })`) to mirror the role onto Clerk's user object.

**Downstream blast radius:**
1. `lib/auth/context.ts:42-43` — `asRole(pubMeta.role)` reads `sessionClaims.publicMetadata.role`. With nothing writing it, `pubMeta.role` is always `undefined` → `asRole(undefined)` throws `Invalid role on session claims: undefined`.
2. Every Server Component / Server Action that calls `getOrgContext()` will throw on the very first authenticated request.
3. `middleware.ts:66-67` reads the same path — every legitimate admin gets 404 on every admin page.

**Why this is CRITICAL, not HIGH:** Phase 2 is described as `verify:phase-2 ships green` (commit `454ff00`). The verify chain does not exercise an authenticated user round-trip — it only runs tsc + the RLS property test which seeds JWT claims directly. The first time a real user signs up after Phase 3 ships, the system is broken. This will be discovered in Phase 3 dev-loop and look like a Phase 3 bug; it is a Phase 2 wiring gap.

**Fix:**
```typescript
import { clerkClient } from '@clerk/nextjs/server';

case 'organizationMembership.created': {
  // ... existing lookup logic ...
  const updateResult = await db.update(users)
    .set({ orgId: orgInternalId, ...(roleStr ? { role: roleStr } : {}) })
    .where(eq(users.clerkUserId, clerkUserId))
    .returning({ id: users.id });

  // D-04: mirror role onto Clerk publicMetadata so sessionClaims.publicMetadata.role
  // is populated for getOrgContext() and the middleware admin gate.
  if (roleStr) {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { role: roleStr },
    });
  }
  // ...
}
```
Apply the same fix to `organizationMembership.updated`.

---

### CR-02: `isAdminRoute` matcher cannot match any real URL — admin gate is dead code

**File:** `middleware.ts:32-34` and `:50-73`

**Code excerpt:**
```typescript
const isAdminRoute = createRouteMatcher([
  "/(admin)/(.*)",
]);
// ...
if (isAdminRoute(req)) {
  // ... 24 lines of admin-gate logic ...
}
```

**Problem:** Next.js *route groups* (parenthesized segments like `(admin)`) are URL-invisible — they organize the filesystem but DO NOT appear in the matched URL. A page at `app/(admin)/dashboard/page.tsx` is reachable at `/dashboard`, NOT `/(admin)/dashboard`. The matcher `"/(admin)/(.*)"` therefore matches the literal URL path `/(admin)/...` which no browser will ever produce.

Effect: `isAdminRoute(req)` always returns `false`. The entire admin gate (lines 50-73) is unreachable. Once Phase 3 adds admin pages, they will fall through to the generic `auth()` branch at lines 75-106 and be protected only against unauthenticated requests — `employee` and `reviewer` roles will reach every admin page.

The D-10 contract states: *"404, not 401 — don't advertise the route exists."* The code intent is correct; the matcher syntax does not realize it.

**Why this is CRITICAL:** Phase 2 success criterion `Multi-tenancy: Org A cannot access Org B data under any code path` is partly defended by RLS, but `Tier gating: Starter blocked from Growth features with 403 + upgrade prompt` and admin-only routes rely on this gate. Shipping Phase 2 with a no-op admin matcher means Phase 3 ships admin pages reachable by any signed-in user. The bug compiles, has tests passing (because `scripts/check-artifacts.ts:481` only asserts the literal string `"/(admin)/(.*)"` is present — it does not test the matcher behavior), and is invisible until a `reviewer` user navigates to a future admin page.

**Fix:** The admin route patterns must be the actual URL paths that map to pages under `app/(admin)/`. Until Phase 3 specifies those, the safest holding pattern is:
```typescript
const isAdminRoute = createRouteMatcher([
  "/admin",
  "/admin/(.*)",
  // Add the concrete admin URLs once Phase 3 finalizes them, e.g.:
  // "/dashboard/(.*)", "/policies/(.*)", "/users/(.*)"
]);
```
Track in STATE.md as a Phase 3 blocker: "Update `isAdminRoute` matcher with concrete URLs introduced by `app/(admin)/<route>/page.tsx` files."

**Verify after fix:** Add an artifact-gate test in `scripts/check-artifacts.ts` that exercises the matcher against a representative admin URL string (e.g., `/dashboard`) and asserts it matches. The current string-literal check only proves the source code mentions `(admin)` — not that the matcher works.

---

## High Issues

### HI-01: `middleware.ts` role-narrowing widens to `string`, contradicting CONTEXT.md and risking type drift

**File:** `middleware.ts:66`

**Code excerpt:**
```typescript
const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
if (role !== "admin") {
  return new NextResponse(null, { status: 404 });
}
```

**Problem:** `02-CONTEXT.md` `<focus_areas>` #3 explicitly calls for a "stricter `{ role?: unknown }` cast" — and `lib/auth/context.ts:42` correctly uses `{ role?: unknown }`. The middleware lags behind, using `{ role?: string }`. A future Clerk version that emits role as a non-string value (numeric tier code, structured object) would type-erase to `undefined` here but blow up `asRole()` in `getOrgContext`. The two auth-read sites disagree on contract.

**Fix:**
```typescript
const pubMeta = sessionClaims?.publicMetadata as { role?: unknown } | undefined;
const role = typeof pubMeta?.role === "string" ? pubMeta.role : undefined;
if (role !== "admin") {
  return new NextResponse(null, { status: 404 });
}
```

---

### HI-02: Idempotency-row write precedes dispatch — 409-retry path is permanently dead

**File:** `app/api/webhooks/clerk/route.ts:95-99` and `:163-181`, `:192-197`

**Code excerpt:**
```typescript
// Line 95 — clerk_events row written BEFORE dispatch
const inserted = await db.insert(clerkEvents).values({ id: svixId })
  .onConflictDoNothing().returning({ id: clerkEvents.id });

// Line 163 — organization.created hasn't arrived → return 409
if (orgRow.length === 0) {
  console.error(`[clerk-webhook] org ${clerkOrgId} not found...`);
  return new Response('Org not yet created', { status: 409 });
}
```

**Problem:** The handler comments acknowledge this as "SF-W5 known gap" but the failure mode is operationally ACTIVE, not theoretical. Sequence:
1. Clerk delivers `organizationMembership.created` before `organization.created` (Clerk does not guarantee event ordering).
2. Handler inserts `svix-id` into `clerk_events` (idempotency record now exists).
3. Org lookup fails → returns 409.
4. Clerk retries (the 409 invites it to retry).
5. Retry hits the idempotency check at line 101 → `inserted.length === 0` → return 200.
6. The membership is **permanently lost**. The user has a `users` row with `org_id = NULL` and no future event will re-fire this handler.

The `users_org_id_required_after_5min` CHECK constraint in `drizzle/0001_rls_policies.sql:38-39` will fire on subsequent UPDATE attempts (Postgres re-checks CHECK on row modification), but until then the row persists in an invalid state. The `scripts/check-data-layer.ts:115-150` stale-null audit will catch it, but only when verify is run manually.

**Fix:** Invert the order — INSERT into `clerk_events` only AFTER successful dispatch. Move the idempotency-row INSERT to the very end of the success path (or wrap the entire handler in a Drizzle transaction with the clerk_events INSERT first AND ROLLBACK on any 4xx/5xx return). The simplest correct pattern:
```typescript
const result = await db.transaction(async (tx) => {
  const inserted = await tx.insert(clerkEvents)
    .values({ id: svixId }).onConflictDoNothing()
    .returning({ id: clerkEvents.id });
  if (inserted.length === 0) return { status: 200, body: 'Already processed' };

  // ... dispatch all writes via tx, not db ...

  return { status: 200, body: 'OK' };
});
// 409 / failures throw inside tx → automatic ROLLBACK including clerk_events row
```

---

### HI-03: Dispatch exception swallowed as 200 OK — silent data loss

**File:** `app/api/webhooks/clerk/route.ts:245-261`

**Code excerpt:**
```typescript
} catch (err) {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[clerk-webhook] dispatch failed for event ${svixId} (${evt.type}): ${detail}`);
  // Return 200 anyway — see the gap note above.
  return new Response('Dispatch error logged', { status: 200 });
}
```

**Problem:** The clerk_events row was already written at line 95-99. Any exception during dispatch (FK violation, transient DB failure, Clerk type-narrowing failure not handled by the explicit `if` guards) returns 200 to Clerk. Clerk stops retrying. The event is lost. Same root cause as HI-02 — the clerk_events row should not be the boundary of "we tried" but the boundary of "we succeeded."

**Why returning 500 is also wrong (without the HI-02 fix):** A 500 would make Clerk retry, but the next retry would short-circuit on the idempotency row.

**Fix:** Apply the HI-02 transaction-based fix, then change the catch behavior:
```typescript
} catch (err) {
  // With the HI-02 fix in place, throwing here ROLLS BACK the clerk_events
  // INSERT, so a subsequent retry will re-attempt. Return 500 so Clerk retries.
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[clerk-webhook] dispatch failed for ${svixId} (${evt.type}): ${detail}`);
  throw err;  // propagate so tx rolls back; outer Next.js handler surfaces 500
}
```

---

### HI-04: `policy_assignments.assigneeId` has no FK constraint — broken referential integrity for polymorphic refs

**File:** `lib/db/schema.ts:107`

**Code excerpt:**
```typescript
assigneeType: text('assignee_type').notNull(), // 'user' | 'department'
assigneeId: uuid('assignee_id').notNull(),
```

**Problem:** `assigneeId` discriminates between `users.id` and `departments.id` via `assigneeType`. There is no DB-level constraint preventing an `assigneeId` value that points to neither — or worse, points to a user in OrgB while `org_id` is OrgA's. RLS catches reads/cross-org leaks at the policy_assignment row level, but it cannot enforce that the *referenced* row belongs to the same org.

**Fix:** Either (a) add a CHECK constraint that validates referential consistency via subquery (expensive, can be deferred), or (b) split into two nullable columns:
```typescript
assigneeUserId: uuid('assignee_user_id').references(() => users.id),
assigneeDepartmentId: uuid('assignee_department_id').references(() => departments.id),
// + CHECK ((assignee_user_id IS NULL) <> (assignee_department_id IS NULL))
```
This is a schema change — fold into Phase 3 or open as a Phase 7 cleanup. Document the gap in STATE.md for now.

---

## Medium Issues

### ME-01: `users.departmentId` has no FK to `departments`

**File:** `lib/db/schema.ts:141`

**Code excerpt:**
```typescript
departmentId: uuid('department_id'),
```

**Problem:** Department deletion can leave orphan `users.department_id` values pointing into nothing. RLS protects against cross-org reads but not against dangling references. Same pattern as HI-04 but lower severity — `users.departmentId` is nullable and not load-bearing for security.

**Fix:**
```typescript
departmentId: uuid('department_id').references(() => departments.id),
```
Requires a `drizzle/0002_*` migration.

---

### ME-02: `scripts/check-rls.ts` final TRUNCATE list misses `clerk_events` and `stripe_events`

**File:** `scripts/check-rls.ts:153-157`

**Code excerpt:**
```typescript
await sql.begin(async (tx) => {
  for (const t of ['acknowledgments', 'workflow_stages', 'policy_assignments', 'notifications', 'ai_generations', 'policy_versions', 'policies', 'departments', 'users', 'organizations']) {
    await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
  }
});
```

**Problem:** The opening TRUNCATE at lines 64-77 covers 12 tables (including clerk_events + stripe_events). The closing TRUNCATE covers only 10. Across N runs, clerk_events and stripe_events accumulate rows in the test DB. Eventually a webhook integration test will collide on a fixture svix-id.

**Fix:** Mirror the opening TRUNCATE list verbatim — extract into a single `const ALL_TABLES = [...]` constant used by both.

---

### ME-03: `scripts/check-rls.ts` positive control runs inside the same `sql.begin` as the negative tests — a rollback in the negative path could mask the positive

**File:** `scripts/check-rls.ts:101-144`

**Problem:** The positive control sets `positiveControlPassed = true` AFTER asserting orgA can see its own policy row. The negative loop runs afterward in the SAME transaction. The intentional rollback throws at line 144 to clean up. If the negative loop itself throws (table doesn't exist, GRANT misconfigured), the catch at line 145-148 only filters `__intentional_rollback__` — any other error propagates, but `positiveControlPassed` has already been assigned in the outer scope and survives the rollback.

This means the script's structural ordering claim ("positive control runs BEFORE negative") is true for *execution order* but the `positiveControlPassed` flag is mutated in the same closure used by the negative tests. Not a bug as written, but the test's failure-mode coverage is brittle: if the negative loop throws on table 3 of 10, the script reports "positive passed, 0 leaks" — the missing 7 tables are silently skipped.

**Fix:** Track per-table success explicitly:
```typescript
const tested: string[] = [];
for (const table of TENANT_TABLES) {
  // ... run negative test ...
  tested.push(table);
}
// after the catch:
if (tested.length !== TENANT_TABLES.length) {
  console.error(`L-06 INCOMPLETE: tested ${tested.length}/${TENANT_TABLES.length} tables — error before completion`);
  process.exit(1);
}
```

---

### ME-04: `organizationMembership.updated` does not also backfill `orgId`

**File:** `app/api/webhooks/clerk/route.ts:204-223`

**Code excerpt:**
```typescript
case 'organizationMembership.updated': {
  const data = evt.data;
  const clerkUserId = data.public_user_data?.user_id;
  const roleStr = asAppRole(data.role);
  if (!clerkUserId || !roleStr) { ... break; }
  await db.update(users).set({ role: roleStr })
    .where(eq(users.clerkUserId, clerkUserId));
}
```

**Problem:** If `organizationMembership.created` was lost (HI-02 path), and the operator manually triggers a role change in Clerk → `organizationMembership.updated` fires. The handler updates `role` but never sets `orgId`, leaving the user permanently NULL-org despite an active membership. D-03's idempotency design assumes both events behave identically on row-shape.

**Fix:**
```typescript
const orgRow = await db.select({ id: organizations.id })
  .from(organizations)
  .where(eq(organizations.clerkOrgId, data.organization?.id ?? ''))
  .limit(1);
// ...
await db.update(users)
  .set({ role: roleStr, ...(orgRow[0] ? { orgId: orgRow[0].id } : {}) })
  .where(eq(users.clerkUserId, clerkUserId));
```

---

### ME-05: `check-rls.ts` uses `tx.unsafe()` with template-interpolated table name — safe today, but a footgun pattern

**File:** `scripts/check-rls.ts:79`, `:132`, `:155`

**Code excerpt:**
```typescript
await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
// ...
const rows = await tx.unsafe(
  `SELECT 1 FROM "${table}" WHERE ${col} = $1::uuid LIMIT 5`,
  [orgBId],
);
```

**Problem:** `t`, `table`, and `col` are all from compile-time `as const` arrays — currently safe. However: `tx.unsafe()` is being used because postgres-js can't parameterize identifiers. A future contributor extending `TENANT_TABLES` from a config file, a CSV, or env var inherits an unguarded SQL injection vector. The convention is established here and copied below in `check-data-layer.ts`.

**Fix:** Add a runtime sanity guard once at module scope:
```typescript
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;
function ensureIdent(name: string): string {
  if (!SAFE_IDENT.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return name;
}
// then: `TRUNCATE TABLE "${ensureIdent(t)}" CASCADE`
```

---

### ME-06: `scripts/check-data-layer.ts` step 2 (migrate against TEST DB) returns ok=true on `exit 0` but does NOT distinguish drizzle-kit no-op from a real apply

**File:** `scripts/check-data-layer.ts:66-85`

**Problem:** If `DATABASE_URL_TEST` is mistakenly pointed at the dev DB (or the test DB schema drifted), drizzle-kit `migrate` will silently apply (or no-op) against the wrong target and exit 0. The orchestrator reports success. Subsequent steps (check-rls, check-schema) connect via `postgres()` and read pg_catalog — they DO catch missing RLS — but the orchestrator's step-2 success is too weak to back the D-08 invariant "applied to the TEST DB."

**Fix:** After migrate, write a sentinel marker into the test DB and verify the connection URL string contains the configured test-DB host:
```typescript
// Cheap host-string sanity:
if (!dbTest.includes('_test') && !dbTest.match(/[-_]test([:/.]|$)/)) {
  return { ok: false, label, detail: 'DATABASE_URL_TEST does not look like a test DB' };
}
```
Or query `current_database()` after migrate to confirm the target.

---

## Low Issues

### LO-01: Magic 5-minute window for `users.org_id` CHECK constraint is hardcoded twice with no shared constant

**Files:**
- `drizzle/0001_rls_policies.sql:39` — `interval '5 minutes'` in the CHECK
- `scripts/check-data-layer.ts:129` — `now() - interval '5 minutes'` in the audit query
- `lib/db/repositories/users.ts:7` — comment "5-minute window"

**Problem:** A drift between these three is silent — the CHECK accepts NULL for 5 min, but if the audit window is tightened to 3 minutes (or loosened to 10), the audit reports rows the CHECK considers valid (or misses rows the CHECK already rejects).

**Fix:** Document in `02-CONTEXT.md` that the 5-minute value is a contract and any change requires updating all three sites. Consider extracting to a Drizzle SQL helper or a `lib/constants.ts` module imported by both schema and audit.

---

### LO-02: Webhook handler's "default" case silently swallows new Clerk event types

**File:** `app/api/webhooks/clerk/route.ts:235-243`

**Code excerpt:**
```typescript
default: {
  const evtType: string = evt.type;
  console.log(`[clerk-webhook] unhandled event type: ${evtType} (id=${svixId}) — log-only`);
  break;
}
```

**Problem:** If the operator subscribes a NEW event in the Clerk Dashboard (e.g., `session.created` for audit logging) and forgets to update the handler, the event is silently logged and short-circuited. There is no alarm path. The clerk_events row is already written, so retries don't help (HI-02).

**Fix:** Add a structured `console.error` for unrecognized events that the operator's log-monitoring (Phase 7+) can flag:
```typescript
default: {
  console.error(`[clerk-webhook] UNRECOGNIZED event type: ${evt.type} (id=${svixId}) — subscribed in Dashboard but not handled in code. Update route handler or unsubscribe.`);
  break;
}
```

---

### LO-03: `scripts/check-db-imports.ts` allow-list includes `^scripts/check-db\.ts$` but not the equivalent `tsx` test-harness scripts in `scripts/check-coderabbit-config.ts`

**File:** `scripts/check-db-imports.ts:37-46`

**Problem:** The allow-list explicitly enumerates `scripts/check-rls.ts`, `scripts/check-schema.ts`, `scripts/check-db.ts`. Other scripts that may legitimately need raw `db` (e.g., a future `scripts/check-coderabbit-config.ts` doing DB introspection) would fail the L-05 gate. The allow-list mechanism is correct; the documentation is incomplete.

**Fix:** Update the allow-list inline comment to explain: "If you need a new raw-db script, add it here AND link the ADR-023 rationale in a STATE.md follow-up."

---

### LO-04: `tests/types.ts` line 29 uses `{} as any` — second documented `any` exception passes through correctly but the eslint-disable comment is missing

**File:** `tests/types.ts:18-29`

**Code excerpt:**
```typescript
/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-explicit-any */
// ...
void Policies.create({} as any, { tldrSummary: 'x' });
```

**Problem:** The eslint-disable is at file-scope (block comment at top). This is fine and matches CONTEXT.md's documented exception. However, future maintainers may add a NEW `any` usage to this file (since the file-scope disable is permissive). Tighter would be a single-line disable adjacent to line 29 only, or to add a CI gate against `as any` outside the two documented exceptions.

**Fix:** Replace the file-scope `eslint-disable` with line-targeted disables on line 29 only. Or document the file-scope policy in a comment header more loudly: "This file is the ONLY place outside lib/db/scoped.ts permitted to use `any`. Adding new `any` here requires CONTEXT.md update."

---

## Positive Observations

The implementation does several things notably well — useful patterns to carry into Phase 3:

1. **Defensive narrowing in webhook handler** (`route.ts:174-181`) — the empty-array guard on `orgRow[0]` is correct for `noUncheckedIndexedAccess: true`. Many codebases under this flag have latent index-undefined bugs; this one doesn't.

2. **`scripts/check-rls.ts` positive control disambiguates RLS-working from GRANT-missing** (lines 112-125). This is the right shape — without it, an "all queries return 0 rows" result is ambiguous between "RLS isolated correctly" and "authenticated role has no SELECT". Carry the positive-control pattern into all future security tests.

3. **`SET LOCAL ROLE authenticated` + `set_config(..., true)` ordering in `withOrgScope`** (lines 48-51) — both correct per RESEARCH Pitfall 1 + 2. The inline citations to the postgres docs are unusually careful.

4. **`drizzle.config.ts` D-05 fallback with console.warn** (lines 12-22) — preserves local-dev ergonomics while making production failure loud. Good ergonomic pattern.

5. **`tests/types.ts` block-JSDoc note** (line 8-10) explicitly calls out that TypeScript does NOT scan `//`-comments for `@ts-expect-error` directives while it DOES scan `/* */` blocks. This level of meta-awareness is rare and prevents a real foot-gun.

6. **`scripts/check-db-imports.ts` AST walk over regex** — the comments (line 8-13) explain why regex would miss `import { db as d }` and re-exports. The walker is roughly 50 lines and self-evidently correct.

7. **Layered defenses on multi-tenancy** — every read in every repository carries `where(eq(table.orgId, scope.orgId))` AND the JWT-injected RLS fires AND the FK constraints lock cross-org references at the row level. Three independent layers, exactly as ADR-019 specified.

8. **All 12 server modules begin with `import 'server-only'`** — no client-side leak vectors. Verified across `lib/db/index.ts`, `lib/db/scoped.ts`, `lib/auth/context.ts`, all 9 repositories.

---

## Overall Verdict

**Status:** issues_found — **DO NOT MERGE TO PRODUCTION** without remediating the 2 CRITICAL findings.

The Phase 2 chassis is solid. The schema is correct, the RLS migration is uniform and audited, the repositories are well-typed, the verify chain is comprehensive, and the operational invariants (D-02 denormalization, ADR-018 append-only via type system, ADR-023 allow-list via AST gate) are enforced by tests rather than discipline.

However, two issues block any real authenticated user flow:

- **CR-01** breaks the role-claim propagation chain at the very first authenticated request. The Phase 2 verify chain doesn't catch it because the test harness injects JWT claims directly via `set_config`.
- **CR-02** silently disables the admin authorization gate. Phase 3 admin pages will be reachable by employee/reviewer roles.

The HIGH findings (especially HI-02 / HI-03) describe a real-world data-loss path that Phase 2 ships with as a known-but-active gap. The clerk_events idempotency-before-dispatch ordering needs the order inverted before Phase 3 starts depending on `users.orgId` being populated end-to-end.

## Remediation Plan

**Before Phase 3 starts (blocking):**
1. CR-01: Add `clerkClient.users.updateUserMetadata(...)` call in `organizationMembership.created` and `.updated` handlers.
2. CR-02: Replace the `isAdminRoute` matcher with concrete URL patterns. Add an artifact-gate test that exercises the matcher behavior, not just the source-code presence.

**Before any real user signs up (recommended pre-Phase-7):**
3. HI-02 + HI-03: Wrap the entire webhook dispatch in a Drizzle transaction so clerk_events INSERT rolls back on any 4xx/5xx return. Change the catch from `200 + log` to `throw` so Clerk retries.
4. HI-01: Tighten middleware's role narrowing to `{ role?: unknown }` + `typeof === 'string'` to match `getOrgContext`.
5. HI-04: Decide on polymorphic FK approach for `policy_assignments` (split columns vs. CHECK constraint). Fold into Phase 3 or open Phase 7+ cleanup ticket.

**Backlog (next sprint):**
6. ME-01 through ME-06: schema FK on `users.departmentId`, complete TRUNCATE list in check-rls, per-table success tracking, role+orgId backfill in `.updated`, identifier-safety guard around `tx.unsafe()`, sentinel check on test-DB target.

**Documentation / hygiene:**
7. LO-01 through LO-04: extract the 5-minute constant; loudly log unrecognized webhook events; document the allow-list extension protocol; tighten `tests/types.ts` eslint-disable scope.

---

_Reviewed: 2026-05-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer, opus-4-7)_
_Depth: deep_
