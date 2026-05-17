# Phase 2: Data Layer - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** `--all` (auto-selected all gray areas; decisions made autonomously per the operator's no-clarifying-questions directive, mirroring Phase 1)

<domain>
## Phase Boundary

The complete Drizzle schema exists in code, RLS is enforced in Postgres, Clerk webhooks populate `organizations` and `users`, and the ADR-023 + ADR-025 enforcement mechanism (`OrgContext`, `withOrgScope`, per-aggregate repositories, raw-`db` allow-list, cross-org property test) is in place — so that every subsequent phase that touches the database does so through a typed, RLS-backed channel that cannot leak across tenants.

**In scope (from ROADMAP.md Phase 2 + ADR-023/025 deliverables):**
- Drizzle table definitions in `lib/db/schema.ts` for all 10 tenant-scoped tables from `reference/SCHEMA.md` + the non-RLS `stripe_events` + a new `clerk_events` idempotency table (see D-03).
- A schema amendment denormalizing `org_id` onto five child tables that currently lack it (see D-02).
- Drizzle migration `drizzle/0000_initial.sql` (generated) + a hand-written `drizzle/0001_rls_policies.sql` that `ENABLE ROW LEVEL SECURITY` on all 10 tenant-scoped tables, creates the `org_isolation` policies, and `GRANT SELECT, INSERT, UPDATE, DELETE` on each to the `authenticated` role (see D-01).
- `lib/auth/context.ts` — `getOrgContext()` reads the Clerk session, returns `{ orgId, userId, role }`, throws on missing org or missing role (see D-04).
- `lib/db/scoped.ts` — `OrgScope = OrgContext & { tx }` + `withOrgScope(ctx, fn)` wrapper that opens a Drizzle transaction, runs `SET LOCAL ROLE authenticated` + `SELECT set_config('request.jwt.claims', <json>, true)`, then dispatches to `fn`. Exactly the shape in ADR-025.
- `lib/db/repositories/*.ts` — 9 modules (`policies`, `policy_versions`, `policy_assignments`, `acknowledgments`, `users`, `departments`, `ai_generations`, `notifications`, `workflow_stages`). Each module exports a `const X = { ... }` object whose methods take `OrgScope` first and apply `where(eq(table.orgId, scope.orgId))`. Phase 2 ships only the methods needed by `scripts/check-rls.ts` + the type-system enforcement of ADR-018 / ADR-005 invariants; downstream phases fill in the rest (see D-06).
- `/api/webhooks/clerk/route.ts` — verifies the svix signature, handles `organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated`. Idempotency through a new `clerk_events(id text primary key)` table (see D-03). Uses raw `db` per ADR-023 allow-list entry #1.
- `scripts/check-db-imports.ts` — CI gate: greps the repo for any import of `db` from `@/lib/db` (or `lib/db/index`) and fails the build if found outside the four ADR-023 allow-listed files.
- `scripts/check-rls.ts` — connects to Postgres as `authenticated`, manually injects an orgA JWT claim into the session, attempts `SELECT * FROM <each tenant-scoped table>` for rows that belong to orgB, asserts zero rows for every table.
- `scripts/check-schema.ts` — verifies, for each of the 10 tenant-scoped tables: (a) the table exists, (b) RLS is enabled, (c) the `org_isolation` policy exists, (d) `authenticated` has SELECT+INSERT+UPDATE+DELETE grants. Small + finite.
- `scripts/check-foundation.ts` is renamed / extended (or a new `scripts/check-data-layer.ts` is added) and wired into a new `pnpm verify:phase-2` script that chains all the Phase-2 checks (see D-07).
- `.env.local.example` amended to add `DIRECT_URL=` and `DATABASE_URL_TEST=` + `DIRECT_URL_TEST=` (see D-05).
- `drizzle.config.ts` amended to read `DIRECT_URL` (with a fallback to `DATABASE_URL` + console.warn for back-compat).

**Out of scope (deferred to later phases):**
- Admin UI / TipTap editor / policy CRUD surface (Phase 3).
- Stripe webhook (Phase 6 — the table shape stays in scope here so `stripe_events` exists for idempotency from day one of Billing, but no handler ships in Phase 2).
- AI surfaces / Q&A / draft / TL;DR (Phase 4).
- Employee Portal / acknowledgment write path (Phase 5).
- Resend templates / Railway cron / notification emission (Phase 7).
- Compliance dashboard / CSV export (Phase 8).
- Deletion-handling webhook events (`user.deleted`, `organization.deleted`, `organizationMembership.deleted`) — explicit Phase 7+ concern (retention + audit-trail design under ADR-018).
- Full repository method surface — only the minimum needed for `scripts/check-rls.ts` + type-system invariants ships here (see D-06).

</domain>

<decisions>
## Implementation Decisions

### USER-LOCKED Deliverables (absorb as scope, do NOT redesign)

The operator pre-locked the following Phase 2 deliverables in the `/gsd-discuss-phase 2` invocation. ADR-023 and ADR-025 are the architectural basis. Plan-phase and execute-phase MUST ship all six items verbatim:

- **L-01: `lib/db/scoped.ts`** — `OrgScope` type + `withOrgScope(ctx, fn)` wrapper, exactly the shape in ADR-025 (per-transaction `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', <json>, true)`).
- **L-02: `lib/auth/context.ts`** — `getOrgContext()` reads the Clerk session and throws on missing organization.
- **L-03: `lib/db/repositories/*.ts`** — 9 modules (`policies`, `policy_versions`, `policy_assignments`, `acknowledgments`, `users`, `departments`, `ai_generations`, `notifications`, `workflow_stages`). Each method takes `OrgScope` first; **no repository method opens its own transaction** — the surrounding `withOrgScope` owns transaction lifecycle. Type system enforces ADR-018 (no `update` / `delete` on `Acknowledgments`) and ADR-005 (`Policies.create` input shape omits `tldrSummary`).
- **L-04: Phase-2 migration applies the RLS policies from `reference/SCHEMA.md` AND issues** `GRANT SELECT, INSERT, UPDATE, DELETE ON <each tenant-scoped table> TO authenticated`. Without the GRANTs, RLS-eligible queries from the `authenticated` role return permission-denied even when RLS would allow the rows.
- **L-05: `scripts/check-db-imports.ts`** — CI gate locking raw `db` (from `@/lib/db` / `lib/db/index`) to the ADR-023 four-entry allow-list: Clerk webhook, Stripe webhook (Phase 6 stub), Railway cron (Phase 7 stub), Phase-8 test harness.
- **L-06: `scripts/check-rls.ts`** — cross-org property test: connect as `authenticated` with an orgA JWT claim, attempt to SELECT rows owned by orgB, assert zero rows. Wired into `pnpm verify:phase-2`.

**Operational invariant established by these six:** the Validation-Gate criterion *"Multi-tenancy: Org A cannot access Org B data under any code path"* (REQUIREMENTS.md §10 #8) is now backed by **two finite, reproducible verifications** — the import-graph check (L-05) bounds the set of cross-org call sites to four files; the RLS property test (L-06) proves the per-transaction JWT injection makes RLS fire on everything else. Together they replace the "every developer remembers CLAUDE.md" discipline claim with two CI gates. Plan-phase MUST keep both gates green at every commit.

---

### Implementation HOW Decisions (autonomous; operator can redirect)

The six locked deliverables leave a handful of HOW questions open. Decisions below resolve them so plan-phase and gsd-phase-researcher can proceed without re-asking. Each carries a short Why and a rejected alternative.

### Migration Tooling and RLS Placement

- **D-01: Two migrations, hand-edited.** `drizzle-kit generate` produces `drizzle/0000_initial.sql` (table DDL from `lib/db/schema.ts`). A separate hand-written `drizzle/0001_rls_policies.sql` carries `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, the 10 `CREATE POLICY org_isolation` statements, and the 10 `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated` statements. `drizzle-kit migrate` applies both in numeric order.
  - **Why split:** Drizzle 0.45's `pgPolicy()` syntax is nascent and undocumented for our pattern (Supabase + `set_config('request.jwt.claims')`); hand-written SQL is the published, working approach and is plain to review. Splitting schema-vs-policy migrations keeps each file single-purpose and grep-able. The same pattern scales when Phase 6 / Phase 7 add their own RLS amendments — they become `0002_*`, `0003_*`, etc.
  - **Rejected:** Inline `sql.raw(...)` in `lib/db/schema.ts` (intermixes schema DDL with security DDL — hard to audit), drizzle-kit `push` for production (no migration record, unfit beyond local prototyping).

### Schema Amendment — `org_id` Denormalization

- **D-02: Denormalize `org_id` onto every tenant-scoped child table.** `reference/SCHEMA.md` currently shows `org_id` only on `organizations`, `users`, `departments`, `policies`, `ai_generations`. The other five tenant-scoped tables (`policy_versions`, `policy_assignments`, `acknowledgments`, `notifications`, `workflow_stages`) reach their org only via FK to a parent. Phase 2 adds `orgId: uuid('org_id').notNull().references(() => organizations.id)` to all five. Every tenant-scoped table now has a direct `org_id` column. RLS uses the uniform `USING (org_id = auth.jwt()->>'org_id')` pattern from ADR-019 on all 10 tables (the special-case for `organizations` stays `USING (id = auth.jwt()->>'org_id')` per SCHEMA.md).
  - **Why:**
    1. The ADR-019 invariant *"every DB query includes `org_id` in WHERE"* loses uniform meaning when half the tables don't carry the column. With this amendment, every repository method's `where(eq(table.orgId, scope.orgId))` is consistent and copy-paste-safe.
    2. EXISTS-subquery RLS works but the planner can't always inline it; cross-table reads (`policy_versions JOIN policies`) hit the parent's RLS twice in some plans. Denormalization makes RLS evaluate on the row itself in one comparison.
    3. ~16 bytes/row × ~5 tables × low-write-volume SMB workloads = negligible cost. PolicyPilot is OLTP, not analytics; storage is not a binding constraint at 25–300-employee customers.
    4. Future cross-tenant denorm leaks become impossible at the row level — a `policy_version` whose `policy.org_id` got rewritten can't quietly belong to two orgs because its own `org_id` is a hard NOT NULL FK.
  - **Operational invariant:** Repository INSERT methods on child tables MUST copy `scope.orgId` into the row. They do NOT re-read the parent's `org_id` (that would be a redundant query AND an opening for a transient inconsistency). E.g.:
    ```typescript
    PolicyVersions.create: (s: OrgScope, input: {...}) =>
      s.tx.insert(policyVersions).values({ orgId: s.orgId, ...input });
    ```
    If `s.orgId` and the parent policy's `org_id` ever disagree, the FK + a CHECK constraint (added in `0001_rls_policies.sql`) catches it: `CHECK (org_id = (SELECT org_id FROM policies WHERE policies.id = policy_versions.policy_id))` is one option, but more cheaply we rely on RLS itself to reject — the cross-org INSERT would violate RLS on the row.
  - **Schema doc update:** `reference/SCHEMA.md` is a frozen FOUNDRY-stage contract. This Phase 2 schema amendment is recorded here (precedence-3 follow-on) and re-emitted in `lib/db/schema.ts`. The reference doc is left untouched per CLAUDE.md "frozen contract" convention; downstream consumers read `lib/db/schema.ts` directly.
  - **Rejected:** EXISTS-subquery RLS — accepted theoretical complexity for no offsetting benefit at SMB scale.

### Webhook Event Scope and Idempotency

- **D-03: Phase 2 handles four Clerk events with explicit idempotency.** The `/api/webhooks/clerk` route handles exactly:
  1. `organization.created` → `INSERT INTO organizations (clerk_org_id, name, slug, plan_tier='starter', stripe_subscription_status='trialing')`.
  2. `user.created` → `INSERT INTO users (clerk_user_id, org_id, role='employee')` — `org_id` resolved from the user's first organization membership in the payload; if the user has no org membership at creation, the row is created without `org_id` and `organizationMembership.created` later backfills it. **Implementation note:** the `users.org_id NOT NULL` constraint requires a second decision here — see D-03a.
  3. `organizationMembership.created` → upsert into `users` (set `org_id`, `role`), where `role` is mapped from Clerk's `organizationMembership.role` (which we configure as `'admin' | 'reviewer' | 'employee'` in the Clerk Dashboard's Organization Roles UI; see D-08).
  4. `organizationMembership.updated` → update `users.role` for the affected `clerk_user_id`. Covers admin promotions / demotions / reviewer-tier changes.
- **D-03a: `users.org_id` is nullable for the time between `user.created` (no org yet) and the subsequent `organizationMembership.created`.** This is the only Phase 2 deviation from `reference/SCHEMA.md`. The SCHEMA.md frozen contract shows `org_id` as NOT NULL on `users`; Phase 2 narrows that to "NOT NULL except in the brief unmapped-membership window," enforced by a CHECK constraint: `CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes')`. After 5 minutes without a membership, the row is invalid and `scripts/check-data-layer.ts` flags it. Alternative considered and rejected: keep `org_id NOT NULL`, defer the user-row INSERT until `organizationMembership.created` — this works but couples `user.created` and `organizationMembership.created` ordering, which Clerk does not guarantee.
- **D-03b: Idempotency via a new `clerk_events` table.** Parallel to `stripe_events`:
  ```typescript
  export const clerkEvents = pgTable('clerk_events', {
    id: text('id').primaryKey(),           // svix-msg-id from Clerk
    processedAt: timestamp('processed_at').defaultNow(),
  });
  ```
  Each event handler runs `INSERT INTO clerk_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`. If no row is returned, the event was already processed — return 200 immediately without re-applying. `clerk_events` is NOT under RLS (service-role only, matches `stripe_events`).
- **D-03c: Delete events (`user.deleted`, `organization.deleted`, `organizationMembership.deleted`) are explicitly NOT handled in Phase 2.** Deletion under ADR-018 (append-only acknowledgments) requires a retention design (cascade vs soft-delete vs tombstone) that is a Phase 7+ concern with audit-trail implications. Phase 2 logs receipt to `clerk_events` (so retries don't re-fire) and returns 200 without any DB mutation. Add a `// TODO(Phase 7): handle deletion + retention` comment at the case branch.
  - **Why:** ROADMAP.md success criterion 3 names the three `*.created` events. Adding `organizationMembership.updated` makes role changes a first-class operation without expanding scope. Idempotency via a dedicated table mirrors the proven `stripe_events` pattern (ADR-020) and avoids ambiguity when `organizationMembership.updated` fires on the same membership multiple times.
  - **Rejected:** Trust `INSERT ... ON CONFLICT DO NOTHING` on `clerkOrgId` / `clerkUserId` unique constraints for idempotency (works for `*.created` but breaks for `*.updated` and doesn't generalize). Handle deletes in Phase 2 (out of scope and entangles with ADR-018 retention design).

### getOrgContext Source of Truth

- **D-04: `getOrgContext()` returns `{ orgId, userId, role }` sourced explicitly from `auth()`.**
  - `userId` ← `(await auth()).userId` — throws `Error('Not authenticated: no Clerk session')` if null.
  - `orgId` ← `(await auth()).orgId` — throws `Error('No active organization')` if null (signed-in user has no active org selected; this is the typical state immediately after sign-in until the user picks an org via Clerk's `<OrganizationSwitcher />` in Phase 3).
  - `role` ← `(sessionClaims?.publicMetadata as { role?: string } | undefined)?.role` narrowed to `'admin' | 'reviewer' | 'employee'`. Throws `Error('Role not set on session claims')` if the narrowing fails. This is the **same path the middleware reads** (per D-10 / `middleware.ts:75`) — one source of truth across the codebase.
  - **Why publicMetadata.role over Clerk's orgRole:** Clerk's `orgRole` is `'org:admin'` / `'org:member'` by default — doesn't align with our `{ admin, reviewer, employee }` enum (reviewer especially is a PolicyPilot concept not a Clerk concept). The webhook handler at `/api/webhooks/clerk` writes our enum into `users.role` AND into the Clerk user's `publicMetadata.role` so that the session claim and the DB row stay in sync. publicMetadata is propagated into `sessionClaims` automatically by Clerk's session-claim template.
  - **Operator manual step (note for plan-phase):** In the Clerk Dashboard, configure the **Session Token customization** to include `publicMetadata` in the JWT claims (Dashboard → Sessions → Customize session token → add `"publicMetadata": "{{user.public_metadata}}"`). Without this, `sessionClaims?.publicMetadata` is `undefined` even when set on the user. This is a one-time manual step parallel to the Phase 1 "enable Organizations" toggle.
  - **Rejected:** Read role from Clerk's built-in `orgRole` — wrong enum, requires translation per call site, fights the webhook-driven role-write path.

### DATABASE_URL Split — Pooler vs Direct

- **D-05: Two connection-string env vars, with a back-compat fallback.**
  - `DATABASE_URL` — Supabase Transaction pooler URI (port 6543), `prepare: false`, used by `lib/db/index.ts` at runtime. **Unchanged from Phase 1.**
  - `DIRECT_URL` — Supabase direct DB URI (port 5432), used by `drizzle.config.ts` for migrations. **New in Phase 2.** drizzle-kit's `migrate` runs DDL; DDL doesn't work cleanly over pgbouncer transaction-mode pools (CREATE INDEX CONCURRENTLY, some ALTER TABLE forms fail). The Supabase docs and Drizzle docs converge on this split.
  - `DATABASE_URL_TEST` / `DIRECT_URL_TEST` — second Supabase project's runtime + direct URIs, used by `scripts/check-rls.ts` and `pnpm db:migrate:test`. Avoids the property test trampling dev data; keeps the operator off Docker.
  - **Back-compat:** if `DIRECT_URL` is absent, `drizzle.config.ts` falls back to `DATABASE_URL` with a `console.warn('DIRECT_URL not set; falling back to DATABASE_URL for migrations. Migrations over a pgbouncer pool may fail on some DDL.')`. Local dev keeps working without operator action; production verify gates fail loudly until the operator sets `DIRECT_URL` in Vercel/Railway env.
  - **`.env.local.example` amendment:** add the three new keys with the same `# See D-05` pointer Phase 1 used.
  - **Operator manual step (note for plan-phase):** create a second Supabase project `policypilot-test`, copy its pooler + direct URIs to `DATABASE_URL_TEST` + `DIRECT_URL_TEST`. Same workflow as the dev project creation (Plan 01-02). The test project's schema is bootstrapped by `pnpm db:migrate:test` on first run.
  - **Rejected:** Single env var (silently breaks migrations the first time DDL needs direct connection), Docker / `supabase start` locally (Phase 1 D-06 already rejected Docker overhead).

### Repository Surface in Phase 2

- **D-06: Skeleton-with-minimum-bodies.** All 9 repository modules under `lib/db/repositories/` exist as files with type-safe exports. Phase 2 fills only the methods needed by:
  1. **`scripts/check-rls.ts`** — needs a way to attempt cross-org reads on every tenant-scoped table while running as `authenticated`. Methods needed: a `listAll(s: OrgScope)` or equivalent on each of the 9 aggregates (10 if you count `Organizations`; `Organizations` is its own slim repo). For tables we want to actively cross-org-probe, the property test bypasses repositories anyway — it uses raw SQL via the scoped transaction handle — so repository methods are only needed for the "happy-path same-org SELECT" half of each assertion.
  2. **The type-system invariants from ADR-018 / ADR-005** — `Acknowledgments` exposes NO `update` or `delete` keys at all (even as unimplemented stubs). `Policies.create` exists as a stub whose **input parameter type omits `tldrSummary`** even if the body is `throw new Error('Not yet implemented — Phase 3')`. The type test (a `// @ts-expect-error` line in a `tests/types.ts`) verifies these stay invariant — see D-07.
  3. **Allow-listed cross-org callers (webhooks)** do NOT use repositories. They go through raw `db` directly. So Phase 2 repositories do NOT ship an `Organizations.create(clerkOrgId, name, slug)` — that call lives in `app/api/webhooks/clerk/route.ts` using raw `db`.
- **Repository module template:**
  ```typescript
  // lib/db/repositories/policies.ts
  import type { OrgScope } from '@/lib/db/scoped';
  import { policies } from '@/lib/db/schema';
  import { and, eq } from 'drizzle-orm';

  export const Policies = {
    listAll: (s: OrgScope) =>
      s.tx.select().from(policies).where(eq(policies.orgId, s.orgId)),
    findById: (s: OrgScope, id: string) =>
      s.tx.select().from(policies)
        .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
        .limit(1),
    // create: typed to OMIT tldrSummary per ADR-005. Body throws — Phase 3.
    create: (
      s: OrgScope,
      input: Omit<typeof policies.$inferInsert, 'orgId' | 'id' | 'tldrSummary' | 'createdAt' | 'updatedAt'>,
    ) => {
      throw new Error('Not yet implemented — Phase 3 (Admin UI)');
    },
    // publish, update, archive: stubs throwing 'Phase 3' — same pattern.
  };
  ```
- **Acknowledgments specifics:**
  ```typescript
  export const Acknowledgments = {
    listForUser: (s: OrgScope, userId: string) => /* ... */,
    record: (s: OrgScope, input: { ... }) => /* stub — Phase 5 */,
    // NO update, NO delete — type system enforces ADR-018 append-only.
  };
  ```
  - **Why skeleton:** Phase 2's job is to lock the *mechanism* (OrgScope + repositories + RLS). The *features* that fill these methods belong to their respective phases. Premature stubbing would (a) couple Phase 2 to Phase-3+ requirements, (b) clutter execute-phase with bodies that need rework anyway. The type system surfaces invariant violations from Phase 3 onwards via TS errors.
- **Rejected:** Ship full repository bodies in Phase 2 (scope creep into Phase 3+; bodies would be uninformed without the calling UI/UX). Skip repository skeletons entirely (then Phase 3 has to write 9 modules from scratch + Phase 2 has no way to type-test invariants).

### Type-Test for ADR-018 / ADR-005 Invariants

- **D-07: A small `tests/types.ts` file uses `@ts-expect-error` to lock the invariants at compile time.**
  ```typescript
  import { Acknowledgments } from '@/lib/db/repositories/acknowledgments';
  import { Policies } from '@/lib/db/repositories/policies';

  // @ts-expect-error — Acknowledgments must not expose update (ADR-018)
  void Acknowledgments.update;
  // @ts-expect-error — Acknowledgments must not expose delete (ADR-018)
  void Acknowledgments.delete;
  // @ts-expect-error — Policies.create input must omit tldrSummary (ADR-005)
  void Policies.create({} as any, { tldrSummary: 'x' });
  ```
  `tsc --noEmit` fails if any line above stops being an error — i.e., if a future commit accidentally adds back `update`/`delete` to `Acknowledgments` or accepts `tldrSummary` on create. Cheap, finite, lives in source control.
- **Why:** ADR-023 § "type system enforces the invariants, not discipline" needs an actual test. `@ts-expect-error` is the minimum-viable form.

### verify:phase-2 Coverage

- **D-08: `pnpm verify:phase-2` chains six checks, accumulates failures, exits non-zero on any.** Modeled directly on Phase 1's `verify:phase-1` shape.
  1. `tsc --noEmit` — zero errors (includes the type tests from D-07).
  2. `pnpm db:migrate:test` — applies all migrations (the generated `0000_initial.sql` + hand-written `0001_rls_policies.sql`) against `DATABASE_URL_TEST`. Catches drift between schema and migrations + verifies the SQL parses.
  3. `pnpm tsx scripts/check-db-imports.ts` — raw `db` import allow-list (L-05).
  4. `pnpm tsx scripts/check-rls.ts` — cross-org property test (L-06).
  5. `pnpm tsx scripts/check-schema.ts` — verifies for each of the 10 tenant-scoped tables: table exists, RLS enabled, `org_isolation` policy present, `authenticated` has SELECT/INSERT/UPDATE/DELETE grants. Reads `pg_catalog.pg_tables`, `pg_catalog.pg_policies`, and `information_schema.table_privileges`.
  6. `pnpm check:artifacts` — same artifact gate as Phase 1, extended to assert the new files exist (the 6 locked deliverables + the new migrations + the new schema entries).
- **Pre-condition for the script-running checks:** the test database has been migrated. `pnpm db:migrate:test` is step 2 and is also the bootstrap; if the test DB is fresh, step 2 creates everything; subsequent runs are no-ops because migrations are recorded in the `drizzle_migrations` table.
- **Why:** Mirrors Phase 1's pattern (one orchestrator script per phase that the operator runs after `pnpm dev` to confirm all success criteria green). Adding step 5 (schema audit) closes the gap where a migration file might claim to add a GRANT but a transient transactional rollback leaves it absent.

### Clerk Dashboard Configuration — Organization Roles

- **D-09: Define the three Organization Roles (`admin`, `reviewer`, `employee`) in the Clerk Dashboard.** Default role for new memberships: `employee`. `admin` is required for organization creators (assigned automatically by Clerk on `organization.created`). `reviewer` is assignable by admins. This is a one-time operator manual step like the Phase 1 "enable Organizations" toggle.
- **Why:** Clerk's UI for assigning roles in Phase 3 (Admin UI) reads from this list. Without it, `organizationMembership.created` payloads have a `role` field that's the Clerk default (`org:admin` / `org:member`) instead of our enum.
- **Operator manual step (note for plan-phase):** Clerk Dashboard → Organizations → Roles. Add `admin`, `reviewer`, `employee`. Set `employee` as default.

### Claude's Discretion

The following are left to plan-phase / executor judgment within the constraints above:

- **Exact ordering of statements inside `0001_rls_policies.sql`** — Plan-phase chooses whether to group `ENABLE ROW LEVEL SECURITY` first, then `CREATE POLICY`, then `GRANT`, or to interleave per-table. Either is correct.
- **Whether `scripts/check-rls.ts` probes all 10 tables or just a representative subset** — recommendation: all 10 (cost is microseconds per table, completeness > brevity).
- **Whether `clerk_events` lives in `lib/db/schema.ts` near `stripe_events` or in its own file** — recommendation: same file, alphabetical order with the other auxiliary tables.
- **Logger / structured logging for the webhook handler** — Phase 2 may emit plain `console.log` for now; structured logging (e.g., `pino`) is a Phase 7+ concern. SF-M4 (PR-1 follow-up: "no try/catch around await auth()" in `middleware.ts`) is folded into Phase 2 — wrap the auth() call.
- **The exact regex / AST approach in `scripts/check-db-imports.ts`** — recommendation: AST via `@typescript-eslint/parser` over regex; regex would miss `import db from` vs `import { db } from` vs re-exports. AST is ~50 lines of TS + reliable.

### Folded Todos

- **`SF-M4: middleware.ts — no try/catch around await auth()`** (STATE.md Phase 1 PR-review follow-ups) — folded into Phase 2 as part of D-09's operator-manual-step plus the webhook handler work. The fix is: wrap `await auth()` in `middleware.ts` + the new `getOrgContext()` in `try { ... } catch (err) { /* log + redirect to /sign-in */ }`. Phase 2 establishes the auth-error error path.
- **`Verify drizzle-kit migrate works on Supabase Transaction pooler`** (implicit — not in STATE.md but raised by D-05) — resolved by D-05's `DIRECT_URL` split; no separate todo to track.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (gsd-phase-researcher, gsd-planner) MUST read these before planning or implementing.**

### Architectural decisions (locked ADRs — read in full)

- `.planning/intel/decisions.md` — full text for **ADR-003** (Drizzle ORM), **ADR-004** (Clerk Org ID = Supabase org_id), **ADR-011** (Supabase + RLS), **ADR-018** (append-only acknowledgments), **ADR-019** (org_id-in-every-query + RLS-as-last-line), **ADR-022** (Node 22 Active LTS), **ADR-023** (OrgContext + repositories + import allow-list — *operationalizes ADR-019*), **ADR-024** (middleware stays procedural; tier gating is app-layer — *informational for Phase 2*), **ADR-025** (RLS via per-transaction JWT injection + `SET LOCAL ROLE` — *amends ADR-023 repository signature to take `OrgScope`*).
- `.planning/PROJECT.md` `<decisions>` block — short-form catalog of all 25 ADRs.

### Schema and constraints (frozen FOUNDRY contracts)

- `reference/SCHEMA.md` — complete Drizzle schema for all 10 tenant-scoped tables + `stripe_events`; RLS pattern. **Note:** Phase 2 (D-02) denormalizes `org_id` onto five child tables not yet shown there; the live source of truth is `lib/db/schema.ts`.
- `.planning/intel/constraints.md` — `SPEC-schema-organizations` through `SPEC-schema-stripe-events` (verbatim table contracts), `SPEC-schema-rls` (RLS pattern), `SPEC-schema-enums` (status / role / type enums).

### Requirements (Phase 2 anchoring)

- `.planning/REQUIREMENTS.md` **REQ-user-roles** — three roles (admin / reviewer / employee), reviewer is Growth+, one user = one org.
- `.planning/REQUIREMENTS.md` **REQ-multi-tenancy** — Clerk Organization = `org_id`, RLS on every tenant-scoped table, `org_id` in every application-layer query.
- `.planning/ROADMAP.md` Phase 2 — goal, depends-on, anchoring decisions (ADR-003, ADR-004, ADR-011, ADR-019, ADR-018), five success criteria.

### Webhooks + API contracts (informational for Phase 2; Phase 2 implements only Clerk)

- `.planning/intel/constraints.md` **SPEC-api-clerk-webhook** — events handled, response semantics.
- `.planning/intel/constraints.md` **SPEC-api-stripe-webhook** — informational (Phase 6 owns the handler; Phase 2 ships only the `stripe_events` table).
- `reference/API-SPEC.md` — every API route contract.

### Existing code from Phase 1 (read before extending)

- `lib/db/index.ts` — current Drizzle client (postgres-js + Transaction pooler + `prepare: false`). Phase 2 keeps this exact shape — adds `withOrgScope` as a sibling in `lib/db/scoped.ts` that uses this `db` internally.
- `lib/db/schema.ts` — currently `export {}` (empty). Phase 2 fills it.
- `drizzle.config.ts` — currently reads `DATABASE_URL`. Phase 2 swaps to `DIRECT_URL` (with D-05 fallback).
- `middleware.ts` — Clerk auth chokepoint. Phase 2 wraps the `await auth()` call in try/catch (SF-M4 fold) but does NOT change matchers.
- `scripts/check-foundation.ts` — model for `scripts/check-data-layer.ts` (same orchestrator + result-accumulator shape).
- `scripts/check-db.ts` — model for the test-DB connection / select pattern used in `scripts/check-rls.ts`.
- `scripts/check-artifacts.ts` — extend with Phase 2 artifact assertions (file-exists checks for the 6 locked deliverables, `clerk_events`, the two migrations).
- `package.json` — add `db:generate`, `db:migrate`, `db:migrate:test`, `verify:phase-2` scripts; bump `drizzle-orm` and `drizzle-kit` only if a Phase-2-blocker bug is hit.
- `.env.local.example` — amend with `DIRECT_URL`, `DATABASE_URL_TEST`, `DIRECT_URL_TEST`, `CLERK_WEBHOOK_SECRET` (already present).

### Operating rules (apply globally; called out for Phase 2 because they bind hard here)

- `CLAUDE.md` "Multi-Tenancy Rules" — `org_id` in every query, RLS as last line, Clerk Org ID = Supabase org_id, never query across organizations.
- `CLAUDE.md` "Always / Ask First / Never" — no `any`, ask before adding packages (Phase 2 adds zero new packages — `drizzle-orm`, `drizzle-kit`, `@clerk/nextjs`, `postgres` are already installed; `svix` may be needed for Clerk webhook signature verification — see plan-phase note).
- Phase 1's `01-CONTEXT.md` D-01..D-15 — package manager (pnpm), Node 22, TypeScript strict flags, Drizzle postgres-js + Transaction pooler with `prepare: false`. All of these carry forward into Phase 2 unchanged.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1)

- **`lib/db/index.ts`** — the Drizzle client. Phase 2 builds `withOrgScope` on top by calling `db.transaction(async (tx) => { ... })`. The `server-only` guard stays; everything in `lib/db/repositories/` and `lib/db/scoped.ts` also imports `'server-only'`.
- **`middleware.ts`** — Clerk auth + admin route gate. Phase 2 does NOT modify matchers or routing — only adds try/catch around `await auth()` (SF-M4 fold). The webhook matcher (`/api/webhooks/clerk`) is already exempted (D-10).
- **`scripts/check-foundation.ts`** — orchestrator pattern: `Result[]` accumulator, `firstNonEmptyLine` for terse error reporting, `spawnSync` with `process.execPath` + JS entry to dodge CVE-2024-27980. Phase 2's `scripts/check-data-layer.ts` (or extension to `check-foundation.ts`) copies this shape.
- **`scripts/check-db.ts`** — postgres-js round-trip pattern with structured error name+message reporting. Phase 2's `scripts/check-rls.ts` extends this to take an injected JWT claim before the SELECT attempts.
- **`scripts/check-artifacts.ts`** — file-existence + content-assertion gate. Phase 2 adds assertion rows for each locked deliverable (L-01..L-06).

### Established Patterns (carried forward verbatim)

- **`'server-only'` at the top of every server module** — including `lib/db/index.ts` and (Phase 2) `lib/db/scoped.ts`, all of `lib/db/repositories/*.ts`, `lib/auth/context.ts`.
- **`spawnSync(process.execPath, [JS_ENTRY, ...args], { shell: false })`** for invoking dev tools (tsc, tsx). Carry into `pnpm verify:phase-2` orchestrator.
- **`firstNonEmptyLine(stderr + stdout)`** for surfacing the most actionable error line from failed child processes.
- **`tsx --conditions=react-server --env-file=.env.local`** for running server-only-guarded scripts. Same incantation in `check:db:test`, `check:rls`, `check:schema`.
- **Migration env split awareness** — `lib/db/index.ts` already documents the Transaction-pooler-vs-direct distinction (D-06 comment). D-05 builds on this.

### Integration Points

- **Clerk webhook ingress** — `/api/webhooks/clerk` is a new route. Existing middleware already passes it through unauthenticated (D-10 webhook-route matcher). svix signature verification happens IN-route.
- **Supabase RLS surface** — Supabase provides the `authenticated` role and the `auth.jwt()` function out of the box (PostgREST + GoTrue convention). The `auth.jwt()` function reads `current_setting('request.jwt.claims', true)::json` — which is exactly what `withOrgScope` sets via `SET LOCAL ... set_config(...)`. No custom auth-schema work needed; just confirm `auth.jwt()` exists post-migration (it does — Supabase ships it).
- **Drizzle migrations** — `drizzle/` directory is currently absent. `pnpm db:generate` creates it on first run. `drizzle/meta/_journal.json` tracks applied migrations.

</code_context>

<specifics>
## Specific Ideas

- **`withOrgScope` exact body (from ADR-025, transcribed for plan-phase reference):**
  ```typescript
  // lib/db/scoped.ts
  import 'server-only';
  import { sql } from 'drizzle-orm';
  import { db } from '@/lib/db';
  import type { PgTransaction } from 'drizzle-orm/pg-core';
  import type { OrgContext } from '@/lib/auth/context';

  export type OrgScope = OrgContext & { tx: PgTransaction<any, any, any> };

  export async function withOrgScope<T>(
    ctx: OrgContext,
    fn: (scope: OrgScope) => Promise<T>,
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      const claims = JSON.stringify({
        sub: ctx.userId,
        org_id: ctx.orgId,
        role: ctx.role,
      });
      await tx.execute(sql`SET LOCAL ROLE authenticated`);
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      return fn({ ...ctx, tx });
    });
  }
  ```
  Plan-phase note: the `PgTransaction<any, any, any>` type is what Drizzle exposes; tightening the generics is possible but not Phase-2 critical. Suppress `any`-lint with `// eslint-disable-next-line` + a comment pointing to this CONTEXT entry, or use Drizzle's inferred transaction type via `Parameters<typeof db.transaction>[0]`.

- **`getOrgContext()` exact body (note `try`/`catch` per SF-M4 fold):**
  ```typescript
  // lib/auth/context.ts
  import 'server-only';
  import { auth } from '@clerk/nextjs/server';

  export type Role = 'admin' | 'reviewer' | 'employee';
  export type OrgContext = { orgId: string; userId: string; role: Role };

  function asRole(value: unknown): Role {
    if (value === 'admin' || value === 'reviewer' || value === 'employee') return value;
    throw new Error(`Invalid role on session claims: ${String(value)}`);
  }

  export async function getOrgContext(): Promise<OrgContext> {
    let session;
    try {
      session = await auth();
    } catch (err) {
      throw new Error(
        `Clerk auth() failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
      );
    }
    const { userId, orgId, sessionClaims } = session;
    if (!userId) throw new Error('Not authenticated: no Clerk session');
    if (!orgId) throw new Error('No active organization');
    const pubMeta = (sessionClaims?.publicMetadata as { role?: unknown } | undefined) ?? {};
    return { userId, orgId, role: asRole(pubMeta.role) };
  }
  ```

- **`scripts/check-db-imports.ts` exact intent:** AST-walk every `.ts` / `.tsx` file under `app/`, `lib/`, `scripts/`. Flag any import whose source resolves to `@/lib/db` (the index, not the schema/scoped/repositories) UNLESS the file path matches one of the four allow-listed patterns:
  1. `app/api/webhooks/clerk/route.ts`
  2. `app/api/webhooks/stripe/route.ts` (Phase 6 placeholder — file may not exist in Phase 2; absence is fine)
  3. `app/**/api/cron/**/route.ts` (Phase 7)
  4. `tests/**` or `scripts/check-rls.ts` and `scripts/check-schema.ts` (Phase 8 test harness path + Phase 2 verify scripts)
  The allow-list lives at the top of the script as a `const ALLOWLIST = [...]` array with a comment block pointing at ADR-023.

- **`scripts/check-rls.ts` exact intent:**
  1. Connect via `postgres(DATABASE_URL_TEST, { prepare: false })` as the connection-level `postgres` user (BYPASSRLS).
  2. Truncate-then-seed the 10 tenant-scoped tables with two orgs' worth of fixtures (orgA and orgB; each gets 1 policy + 1 user + 1 ack + 1 ai_generation etc. — enough to make a "should not see B" assertion meaningful).
  3. Open a transaction; `SET LOCAL ROLE authenticated`; `SELECT set_config('request.jwt.claims', '{"org_id":"<orgA.id>",...}', true)`.
  4. For each of the 10 tables: `SELECT * FROM <table> WHERE org_id = '<orgB.id>'` (or `id = '<orgB.id>'` for `organizations`). Assert `rows.length === 0`. If any row leaks, exit 1 with `Cross-org leak on <table>: <N> rows visible`.
  5. ROLLBACK the transaction (fixtures cleaned for next run).
  6. Exit 0 if all 10 tables passed.

- **`scripts/check-schema.ts` exact intent:**
  1. Connect via `DIRECT_URL_TEST` (need pg_catalog visibility; the pooler is fine too but direct is unambiguous).
  2. For each table in `TENANT_SCOPED_TABLES = [...]`:
     - `SELECT 1 FROM pg_tables WHERE tablename = $1` — assert 1 row.
     - `SELECT relrowsecurity FROM pg_class WHERE relname = $1` — assert `true`.
     - `SELECT polname FROM pg_policies WHERE tablename = $1 AND polname = 'org_isolation'` — assert 1 row.
     - `SELECT privilege_type FROM information_schema.table_privileges WHERE table_name = $1 AND grantee = 'authenticated' AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')` — assert 4 rows.
  3. Exit 0 on all-pass.

- **Operator manual steps to call out in plan-phase 02-02 (parallel to Phase 1's 01-02):**
  1. Clerk Dashboard → Organizations → Roles: add `admin`, `reviewer`, `employee`. Set `employee` as default. (D-09)
  2. Clerk Dashboard → Sessions → Customize session token: add `"publicMetadata": "{{user.public_metadata}}"`. (D-04)
  3. Clerk Dashboard → Webhooks: create endpoint pointing at `https://<dev-tunnel-url>/api/webhooks/clerk`, subscribe to `organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated`. Copy signing secret → `.env.local` `CLERK_WEBHOOK_SECRET`.
  4. Supabase Dashboard → create project `policypilot-test` (free tier). Copy pooler URI → `.env.local` `DATABASE_URL_TEST`; direct URI → `DIRECT_URL_TEST`. Mirror of 01-02. (D-05)
  5. `.env.local` add `DIRECT_URL=` (direct URI of the existing dev project, port 5432). (D-05)

</specifics>

<deferred>
## Deferred Ideas

- **Soft-delete / cascade design for `user.deleted` / `organization.deleted` / `organizationMembership.deleted`** — Phase 7+ retention concern. Must reconcile with ADR-018 (acknowledgments are append-only and must survive user deletion). Likely shape: a `tombstones` table + `users.deletedAt`/`organizations.deletedAt` columns + a Railway cron that hard-deletes after retention window.
- **`CHECK (org_id = parent.org_id)` constraints on child tables** — D-02 mentions this as a belt-and-suspenders option. Defer until a real cross-tenant leak surfaces in practice; RLS + `scope.orgId` copy is already two layers.
- **Structured logging in the Clerk webhook handler** — Phase 7 will introduce `pino` (or equivalent) across the codebase. Phase 2 emits `console.log` with `{ event, eventId, orgId, userId }` shape so the Phase 7 swap is a sed-replace.
- **Drizzle Studio / `db:studio` script** — useful for operator inspection, no Phase-2 success criterion needs it. Add in Phase 3 when the operator starts seeding test policies.
- **`db:migrate:prod` workflow** — production migration runbook (Vercel build hook + direct URL + `drizzle-kit migrate`). Phase 8 / pre-deploy concern.
- **Repository method bodies for Phase 3+ features** — every `throw new Error('Not yet implemented — Phase N')` stub is itself a deferred item. The phase-N planner picks it up.
- **`prepared` statement support on the Transaction pooler** — currently disabled (`prepare: false`). The Supavisor-on-PgBouncer roadmap may unblock this; revisit at the Phase-8 perf pass.
- **Connection-pool sizing for `withOrgScope`'s extra round-trips** — ADR-025 notes "two extra round-trips per request transaction." At 100 RPS and 5 repository calls per request, this is a 20% increase in pool churn. Add to the Phase 8 perf pass as an observability target; default pool config is fine for MVP.
- **Reviewer-role workflow surface** — REQ-user-roles says reviewer is Growth+ only. Phase 2 ships the role enum + the `users.role = 'reviewer'` value; the workflow surfaces (workflow_stages CRUD, approval gates) belong to Phase 3 / Phase 4 / Phase 6 collectively.

### Reviewed Todos (not folded)

- None — the only Phase-1 follow-up that landed in scope was SF-M4 (folded into D-09's getOrgContext + middleware try/catch).

</deferred>

---

*Phase: 2-Data Layer*
*Context gathered: 2026-05-17*
