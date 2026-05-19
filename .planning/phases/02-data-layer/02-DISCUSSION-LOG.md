# Phase 2: Data Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 2 - Data Layer
**Mode:** `--all` (auto-selected all gray areas, autonomous decisions under the operator's no-clarifying-questions directive)
**Areas discussed:**
- USER-LOCKED deliverables (6) — pre-locked by the operator in the discuss-phase invocation
- Migration tooling and RLS placement
- Schema amendment — `org_id` denormalization
- Webhook event scope and idempotency
- `getOrgContext()` source of truth
- DATABASE_URL split (pooler vs direct)
- Repository surface in Phase 2
- Type-test for ADR-018 / ADR-005 invariants
- `verify:phase-2` coverage
- Clerk Dashboard configuration (Organization Roles)

---

## USER-LOCKED Deliverables

| Item | Description | Source |
|------|-------------|--------|
| L-01 | `lib/db/scoped.ts` — `OrgScope` type + `withOrgScope(ctx, fn)` wrapper | Operator instruction (ADR-025 verbatim) |
| L-02 | `lib/auth/context.ts` — `getOrgContext()` from Clerk session, throws on missing org | Operator instruction (ADR-023/025) |
| L-03 | `lib/db/repositories/*.ts` — 9 modules taking `OrgScope` first, no own transactions | Operator instruction (ADR-023 + ADR-025 amendment) |
| L-04 | Migration applies RLS policies + `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated` | Operator instruction (ADR-025 § Phase 2 deliverables) |
| L-05 | `scripts/check-db-imports.ts` — CI gate for the 4-entry raw-db allow-list | Operator instruction (ADR-023) |
| L-06 | `scripts/check-rls.ts` — cross-org property test wired into `pnpm verify:phase-2` | Operator instruction (ADR-025) |

**Decision rationale:** ADR-023 and ADR-025 are already locked in `.planning/intel/decisions.md` (2026-05-17). The operator restated the six deliverables in the discuss-phase invocation to ensure they are captured as Phase-2 scope (not redesigned as new architecture). The discuss-phase + plan-phase MUST absorb them verbatim.

**Notes:** The operator's framing — *"Multi-tenancy: Org A cannot access Org B data under any code path is now backed by both ADR-023's import-graph check and ADR-025's RLS property test — two finite verifications instead of a discipline claim"* — is the operational invariant. Both gates run in `pnpm verify:phase-2`.

---

## Migration Tooling and RLS Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Two migrations: `0000_initial.sql` (drizzle-kit generate) + `0001_rls_policies.sql` (hand-written) | Split schema-vs-policy concerns; both applied by `drizzle-kit migrate` | ✓ |
| Inline `sql.raw(...)` in `lib/db/schema.ts` | Drizzle 0.45 has nascent `pgPolicy()` support; intermixes schema with security DDL | |
| `drizzle-kit push` for everything | Idempotent push without migration records | |

**Selected:** Two migrations (D-01). The hand-written `0001_rls_policies.sql` is plain SQL — easy to audit, no Drizzle-version coupling for nascent policy syntax. `drizzle-kit push` rejected for production (no migration record); `sql.raw()` rejected because it mixes concerns and obscures the security surface.

---

## Schema Amendment — `org_id` Denormalization

| Option | Description | Selected |
|--------|-------------|----------|
| Denormalize `org_id` onto all 5 child tables (`policy_versions`, `policy_assignments`, `acknowledgments`, `notifications`, `workflow_stages`) | Uniform `USING (org_id = auth.jwt()->>'org_id')` RLS pattern; ~16 bytes/row overhead | ✓ |
| Use EXISTS-subquery RLS for child tables | Matches current SCHEMA.md verbatim; subqueries may not inline cleanly under all plans | |

**Selected:** Denormalize (D-02). Two reasons drove the call: (1) the ADR-019 invariant *"every DB query includes `org_id` in WHERE"* loses uniform meaning if child tables don't carry the column, making the repository pattern less mechanical; (2) EXISTS subqueries hurt planner inlining on JOINs. Storage cost is negligible at SMB scale. Note that this is an amendment to `reference/SCHEMA.md` — the canonical source going forward is `lib/db/schema.ts`.

**Implementation invariant noted:** Child-table INSERTs MUST copy `scope.orgId` into the row; never re-read parent's `org_id` (redundant + transient-inconsistency risk).

---

## Webhook Event Scope and Idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 handles `organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated` | Includes role-change handling beyond ROADMAP's stated three; idempotency via new `clerk_events` table | ✓ |
| Handle only the three `*.created` events named in ROADMAP success criterion 3 | Minimum; role changes left for Phase 3 | |
| Handle all events including deletes | Requires retention design under ADR-018 | |

**Selected:** Four events + `clerk_events` table (D-03 / D-03b). Including `organizationMembership.updated` covers the real ongoing operation (admin promotes / demotes / changes reviewer role) without expanding into deletion-retention design. The `clerk_events` table mirrors the proven `stripe_events` idempotency pattern (ADR-020).

**Sub-decision (D-03a):** `users.org_id` becomes nullable to handle the brief window between `user.created` and `organizationMembership.created` (Clerk does not guarantee ordering). A CHECK constraint requires the org_id to be populated within 5 minutes of `created_at`. Alternative considered: defer the user-row INSERT until membership arrives — rejected because Clerk ordering is not contractual.

**Sub-decision (D-03c):** Delete events are explicitly NOT handled in Phase 2. Logged to `clerk_events` (so retries don't re-fire) and return 200 without mutation. The deletion + retention design is Phase 7+ work entangled with ADR-018 append-only acknowledgments.

---

## `getOrgContext()` Source of Truth

| Option | Description | Selected |
|--------|-------------|----------|
| `role` from `sessionClaims.publicMetadata.role` (matches middleware path) | One source of truth across middleware + repositories; aligns with our `{ admin, reviewer, employee }` enum | ✓ |
| `role` from Clerk's built-in `orgRole` (`org:admin` / `org:member`) | Wrong enum (no `reviewer`); requires translation; fights webhook-driven publicMetadata writes | |

**Selected:** publicMetadata.role (D-04). The webhook handler writes our enum into both `users.role` AND the Clerk user's `publicMetadata.role` so the session claim and DB stay in sync. Reading `orgRole` would require translating to our enum on every request.

**Sub-decision (operator manual step):** Clerk Dashboard → Sessions → Customize session token: add `"publicMetadata": "{{user.public_metadata}}"`. Without this, `sessionClaims?.publicMetadata` is `undefined` even when set on the user. Noted in CONTEXT.md `<specifics>` operator-manual-steps.

---

## DATABASE_URL Split — Pooler vs Direct

| Option | Description | Selected |
|--------|-------------|----------|
| Two env vars: `DATABASE_URL` (pooler, port 6543) + `DIRECT_URL` (direct, port 5432), with fallback | Migrations get the direct connection they need; runtime keeps the pooler | ✓ |
| Single `DATABASE_URL` (pooler) | Silently breaks DDL migrations the first time a `CREATE INDEX CONCURRENTLY` or some `ALTER TABLE` form hits the pool | |
| Local Docker / `supabase start` | Phase 1 D-06 already rejected Docker overhead | |

**Selected:** Two env vars (D-05). The pool-vs-direct split is the published Supabase + Drizzle pattern. The fallback keeps local dev working without operator action; production migration scripts fail loudly if `DIRECT_URL` is missing.

**Adds:** `DATABASE_URL_TEST` / `DIRECT_URL_TEST` for the second Supabase project that hosts the cross-org property test fixtures — same workflow as dev project creation in Plan 01-02.

---

## Repository Surface in Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton-with-minimum-bodies: all 9 modules exist, only methods needed by `scripts/check-rls.ts` + type-system invariants ship | Locks the mechanism (Phase 2's job); leaves feature methods to their respective phases | ✓ |
| Full repository bodies (every method implemented) | Premature; couples Phase 2 to Phase 3+ requirements without the calling UI to inform method shapes | |
| No repository skeletons (defer entirely to Phase 3) | Then Phase 3 writes 9 modules from scratch + Phase 2 has nothing to type-test against | |

**Selected:** Skeleton-with-minimum-bodies (D-06). Phase 2's job is the *mechanism* (OrgScope + repositories + RLS); the *features* belong to their respective phases. The type system enforces ADR-018 / ADR-005 invariants from day one — `Acknowledgments` has no `update`/`delete` keys at all (not even unimplemented stubs); `Policies.create` input type omits `tldrSummary`.

**Template specified in CONTEXT.md `<specifics>`** so plan-phase doesn't have to re-derive it.

---

## Type-Test for ADR-018 / ADR-005 Invariants

| Option | Description | Selected |
|--------|-------------|----------|
| `tests/types.ts` with `@ts-expect-error` lines locking the invariants | `tsc --noEmit` fails if anyone removes the omission / re-adds forbidden keys | ✓ |
| Rely on code review + ADR-023 prose | Discipline; no CI gate | |
| Runtime checks | Too late; invariants should fail at build time | |

**Selected:** `@ts-expect-error` type-test (D-07). Cheap, finite, lives in source control. Satisfies ADR-023 § *"type system enforces the invariants, not discipline."*

---

## `verify:phase-2` Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Six checks: typecheck + migrate-test + import gate + RLS property test + schema audit + artifact gate | Mirrors Phase 1 shape; closes the "migration claimed it but Postgres doesn't show it" gap with the schema audit | ✓ |
| Skip schema audit; trust migrations | Pretty rare for a migration to silently roll back grants, but possible under transactional weirdness; cost of the audit script is small | |

**Selected:** Six checks (D-08). The schema audit (step 5) is the cheap-but-load-bearing addition over the obvious five — reads `pg_catalog.pg_tables`, `pg_catalog.pg_policies`, `information_schema.table_privileges` to confirm what Postgres actually believes about the tables.

---

## Clerk Dashboard Configuration — Organization Roles

| Option | Description | Selected |
|--------|-------------|----------|
| Define three Organization Roles in Clerk Dashboard: `admin`, `reviewer`, `employee`; default `employee` | Required for `organizationMembership.created` payloads to carry our enum values | ✓ |
| Use Clerk's default roles + translate at webhook time | Adds a translation layer at every webhook call; brittle if Clerk changes default role names | |

**Selected:** Define roles in Clerk Dashboard (D-09). One-time operator manual step, parallel to Phase 1's "enable Organizations" toggle. Noted in CONTEXT.md `<specifics>` operator-manual-steps.

---

## Claude's Discretion

The following are deferred to plan-phase / executor judgment within the constraints established above:

- Exact ordering of statements inside `0001_rls_policies.sql` (group by operation type vs interleave per-table — either correct).
- Whether `scripts/check-rls.ts` probes all 10 tenant-scoped tables or a representative subset (recommendation: all 10).
- Where `clerkEvents` lives in `lib/db/schema.ts` (recommendation: alphabetical with the other auxiliary tables).
- Logger choice for the webhook handler (Phase 2 may use `console.log`; structured logging is a Phase 7+ concern).
- AST vs regex in `scripts/check-db-imports.ts` (recommendation: AST via `@typescript-eslint/parser` for accuracy on re-exports).

## Folded Todos

- **SF-M4: `middleware.ts` — no try/catch around `await auth()`** (STATE.md Phase 1 PR-review follow-ups) — folded into D-04 (`getOrgContext()` wraps `auth()` in try/catch) and into the middleware extension that lands in Phase 2 alongside the new webhook route.

## Deferred Ideas

(See CONTEXT.md `<deferred>` for the full list.)

- Soft-delete / cascade design for `*.deleted` events — Phase 7+ retention work entangled with ADR-018.
- `CHECK (org_id = parent.org_id)` constraints on child tables — defer until a real leak surfaces; RLS + scope.orgId copy is already two layers.
- Structured logging across the codebase — Phase 7+.
- `db:studio` script — Phase 3 (when policies need inspection).
- Production migration runbook — pre-deploy.
- Repository method bodies for Phase 3+ features — each phase-N planner owns its stubs.
- Connection-pool sizing review for `withOrgScope`'s extra round-trips — Phase 8 perf pass.
- Reviewer-role workflow surface — workflow_stages CRUD + approval gates are Phase 3 / Phase 4 / Phase 6.
