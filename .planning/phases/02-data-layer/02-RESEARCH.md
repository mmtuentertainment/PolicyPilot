# Phase 2: Data Layer - Research

**Researched:** 2026-05-17
**Domain:** Drizzle ORM + Supabase RLS + Clerk webhooks + per-transaction JWT injection (multi-tenant data layer mechanism)
**Confidence:** HIGH on library choices and Postgres semantics; HIGH-MEDIUM on the exact Drizzle-kit ordering quirks (cross-verified from two sources + Phase 1 lockfile reality); HIGH on svix verification pattern.

## Summary

This research is HOW-focused. CONTEXT.md locked every WHAT/WHO/WHY decision (6 USER-LOCKED deliverables L-01..L-06 + 9 implementation HOWs D-01..D-09). Plan-phase needs library-version confirmation, published-pattern validation, and a catalogue of landmines that the chosen designs already implicitly avoid (so the plan-checker can verify the implicit avoidance is explicit in the plan).

Three findings dominate:

1. **`set_config('request.jwt.claims', <json>, true)` matches `SET LOCAL` semantics exactly.** PostgreSQL docs state the third boolean is `is_local` and is "equivalent functionality" to `SET LOCAL`. `SET LOCAL` effects "last only till the end of the current transaction, whether committed or not." This means D-05/L-01's `withOrgScope` pattern is correct on a pgbouncer transaction-mode pool: every Drizzle `db.transaction()` issues a real `BEGIN`/`COMMIT`, and `SET LOCAL` resets at transaction boundary, preventing JWT-claim leakage across pooled connection reuses. [CITED: postgresql.org/docs/current/functions-admin.html] [CITED: postgresql.org/docs/current/sql-set.html]

2. **`drizzle-kit migrate` applies hand-written `.sql` files in numeric order if and only if they are registered in `drizzle/meta/_journal.json`.** The `drizzle-kit generate --custom --name=rls_policies` command creates an empty `.sql` file AND registers it in the journal — this is the documented workflow for security DDL that Drizzle's `pgPolicy()` API doesn't yet cover for our pattern. Without the `--custom` flag, hand-dropping a `.sql` into `drizzle/` will NOT be applied. [CITED: orm.drizzle.team/docs/drizzle-kit-generate]

3. **A known Drizzle bug (issue #3504) confirms `drizzle-kit push` skips RLS policy DDL, while `drizzle-kit migrate` applies it correctly.** This independently validates D-01's choice of `migrate` over `push` for production — `push` is not just rejected for "no migration record," it actively does the wrong thing on RLS. [CITED: github.com/drizzle-team/drizzle-orm/issues/3504]

**Primary recommendation:** Plan the migration generation as a two-command sequence (`drizzle-kit generate` for `0000_initial.sql`; `drizzle-kit generate --custom --name=rls_policies` for the empty `0001_*.sql` shell, then hand-edit the body). This ensures both files land in `_journal.json` and apply in numeric order during `drizzle-kit migrate`. Use `ts-morph` (one new dev dep) for the AST-based import allow-list — it has the cleanest `getDescendantsOfKind(SyntaxKind.ImportDeclaration)` API for this exact use case.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-user-roles | Three roles (admin / reviewer / employee), reviewer is Growth+, one user = one org | D-04 (`publicMetadata.role` source-of-truth) + D-09 (Clerk Dashboard Organization Roles UI) + L-02 (`getOrgContext()` narrows role to enum); D-03 + D-03b webhook handlers write `users.role` from `organizationMembership.created/updated` payloads. The CHECK constraint in D-03a (`org_id IS NOT NULL OR created_at > now() - interval '5 minutes'`) handles the user-created-before-membership race. |
| REQ-multi-tenancy | Every paying customer is a Clerk Organization; data scoped by `org_id`; RLS enforced; Org A cannot see Org B under any code path | L-04 (RLS + GRANT migration) + L-05 (import allow-list bounds the cross-org call sites to 4 files) + L-06 (cross-org property test proves RLS fires); D-02 denormalizes `org_id` onto all 10 tenant-scoped tables so the `where(eq(table.orgId, scope.orgId))` pattern is mechanical. The pattern is two-layer: application-layer `where` (ADR-019 invariant) + DB-layer RLS (ADR-011 last-line-of-defense), enforced by per-transaction JWT injection (ADR-025). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Org/User row insertion from Clerk events | API / Backend (Next.js Route Handler `/api/webhooks/clerk`) | Database / Storage (Drizzle + Postgres) | Webhooks ingress is HTTP — must land in a Route Handler. Allow-listed cross-org caller per ADR-023; uses raw `db`, bypassing repository RLS. |
| Per-request RLS injection (`withOrgScope`) | API / Backend (lib/db/scoped.ts in Server Components + Route Handlers + Server Actions) | Database / Storage (Postgres `auth.jwt()` reads `current_setting`) | Mechanism lives in app-layer wrapping a DB transaction. Both sides cooperate: app sets the session var, DB enforces the policy. |
| Repository CRUD (per-aggregate, OrgScope-first) | API / Backend (`lib/db/repositories/*.ts` imported by Server Components, Route Handlers, Server Actions) | Database / Storage (Drizzle query builder over postgres-js) | All user-facing reads/writes flow through repositories — the type-system enforcement of ADR-018/005 invariants is compile-time work on the Next.js side. |
| Schema definition | Database / Storage (Postgres tables + RLS policies + GRANTs) | API / Backend (TypeScript types via Drizzle `$inferInsert` / `$inferSelect`) | `lib/db/schema.ts` is dual-purpose: source of truth for migrations AND for Drizzle's inferred TS types. |
| Migration application | Database / Storage (via direct `DIRECT_URL` connection on port 5432) | n/a | DDL doesn't work over pgbouncer Transaction pooler (D-05). |
| Cross-org property test runtime | Database / Storage (test Supabase project via `DATABASE_URL_TEST`) | API / Backend (Node-side `tsx scripts/check-rls.ts`) | Test runs as `authenticated` role inside a transaction; assertions executed by the Node script. |

**Why this matters for Phase 2:** every Phase-3+ feature will be tempted to add a "direct DB query" that bypasses `withOrgScope`. The L-05 import allow-list AND the tier-classification above (every user-facing read flows through API/Backend repositories — never the database tier directly) is the structural answer. Plan-checker should treat any task that creates a new `from "@/lib/db"` import outside the 4-entry allow-list as a phase-failure blocker, NOT a soft warning.

## User Constraints (from CONTEXT.md)

### Locked Decisions

The six USER-LOCKED deliverables (L-01..L-06) from CONTEXT.md `<decisions>` and the nine implementation HOW decisions (D-01..D-09) are copied verbatim into Phase 2 scope. Plan-phase MUST NOT redesign these.

**L-01: `lib/db/scoped.ts`** — `OrgScope` type + `withOrgScope(ctx, fn)` wrapper, exactly the shape in ADR-025 (per-transaction `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', <json>, true)`).
**L-02: `lib/auth/context.ts`** — `getOrgContext()` reads the Clerk session and throws on missing organization.
**L-03: `lib/db/repositories/*.ts`** — 9 modules (`policies`, `policy_versions`, `policy_assignments`, `acknowledgments`, `users`, `departments`, `ai_generations`, `notifications`, `workflow_stages`). Each method takes `OrgScope` first; no repository method opens its own transaction; type system enforces ADR-018 (no `update`/`delete` on `Acknowledgments`) and ADR-005 (`Policies.create` input shape omits `tldrSummary`).
**L-04:** Phase-2 migration applies the RLS policies + issues `GRANT SELECT, INSERT, UPDATE, DELETE ON <each tenant-scoped table> TO authenticated`. Without the GRANTs, RLS-eligible queries from `authenticated` return permission-denied even when RLS would allow the rows.
**L-05: `scripts/check-db-imports.ts`** — CI gate locking raw `db` to the ADR-023 four-entry allow-list.
**L-06: `scripts/check-rls.ts`** — cross-org property test: connect as `authenticated` with an orgA JWT, attempt to SELECT rows owned by orgB, assert zero. Wired into `pnpm verify:phase-2`.

**D-01..D-09 implementation HOWs** — see CONTEXT.md `<decisions>` for the full text (two-migration split, `org_id` denormalization, 4-event Clerk webhook scope + idempotency table, `publicMetadata.role` source of truth, `DIRECT_URL` env split, skeleton repository surface, `@ts-expect-error` type-tests, six-check `verify:phase-2`, Clerk Dashboard role definitions).

### Claude's Discretion

Per CONTEXT.md `<decisions>` § "Claude's Discretion":

- Exact ordering of statements inside `0001_rls_policies.sql` (group by operation type vs interleave per-table — both correct).
- Whether `scripts/check-rls.ts` probes all 10 tables or a representative subset (recommendation: all 10).
- Where `clerkEvents` lives in `lib/db/schema.ts` (recommendation: alphabetical with other auxiliary tables).
- Logger choice for the webhook handler (Phase 2 may use `console.log`; structured logging is Phase 7+).
- AST vs regex in `scripts/check-db-imports.ts` (recommendation: AST — research below confirms `ts-morph` over `@typescript-eslint/parser` for this specific use case).

### Deferred Ideas (OUT OF SCOPE)

Per CONTEXT.md `<deferred>` — do NOT plan for any of these in Phase 2:

- Soft-delete / cascade design for `*.deleted` events — Phase 7+ retention work entangled with ADR-018.
- `CHECK (org_id = parent.org_id)` constraints on child tables — defer until a real leak surfaces.
- Structured logging across the codebase — Phase 7+.
- `db:studio` script — Phase 3.
- Production migration runbook (`db:migrate:prod`) — pre-deploy concern.
- Repository method bodies for Phase 3+ features — each phase-N planner owns its stubs.
- Connection-pool sizing review for `withOrgScope`'s extra round-trips — Phase 8 perf pass.
- Reviewer-role workflow surfaces — Phase 3 / Phase 4 / Phase 6 split.
- `prepared` statement support on the Transaction pooler — revisit at Phase-8 perf pass.

## Project Constraints (from CLAUDE.md)

- **Stack non-negotiable:** Next.js 15, TypeScript, Drizzle ORM, `@clerk/nextjs`, `postgres` (driver), Supabase. Phase 2 adds two new packages: `svix` (webhook signature verification — explicitly allowed by CLAUDE.md "ASK FIRST #1" since it's mandatory for ADR-020-style webhook verification — operator has already pre-approved via CONTEXT.md note "svix may be needed for Clerk webhook signature verification") and `ts-morph` (dev-only AST tooling).
- **Multi-tenancy rules (CLAUDE.md):** `org_id` in every DB query (no exceptions); RLS is last line of defense (NOT primary); Clerk Org ID = Supabase `org_id`; never query across orgs. Phase 2 ESTABLISHES this — every plan must honor the L-05/L-06 enforcement.
- **ALWAYS:** `tsc --noEmit` passes before every commit (zero type errors). Verify Stripe webhook signatures with raw body (`request.text()`) — same pattern applies to Clerk webhook (svix.verify expects raw text payload, per docs). Store every Claude API call in `ai_generations` (does not apply Phase 2; the table is shipped here but no Claude calls are made).
- **ASK FIRST:** Any package not in stack — `svix` and `ts-morph` are the two additions; CONTEXT explicitly allows them.
- **NEVER:** No `any` TypeScript type. Roll custom auth (Clerk handles). Trust client-side for subscription state. Delete or modify acknowledgment records. The `PgTransaction<any, any, any>` in CONTEXT `<specifics>` for `withOrgScope` is a Drizzle-documented exception — the recommended workaround is `Parameters<typeof db.transaction>[0]` (see Code Examples below), but the operator's CONTEXT explicitly allows the `any` with an `eslint-disable-next-line` + comment if the typed version proves brittle.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | `^0.45.2` (current — confirmed via `npm view`) | TypeScript-first ORM + transaction API + SQL builder | Already installed Phase 1. Drizzle's `db.transaction()` opens a real BEGIN/COMMIT on postgres-js — necessary for `SET LOCAL` to reset at boundary. [VERIFIED: npm registry, Drizzle docs] |
| `drizzle-kit` | `^0.31.10` (current — confirmed via `npm view`) | Migration generation + apply | Already installed. `drizzle-kit generate --custom` is the documented path for hand-written security DDL. [VERIFIED: npm registry, Drizzle docs] |
| `postgres` (postgres-js) | `^3.4.9` (current — confirmed via `npm view`) | Postgres driver underneath Drizzle; supports `prepare: false` for pgbouncer | Already installed Phase 1. Direct driver call `tx.execute(sql\`...\`)` works for `SET LOCAL ROLE` and `set_config()`. [VERIFIED: npm registry] |
| `@clerk/nextjs` | `^7.3.4` (installed) / `^7.3.5` (latest — confirmed via `npm view`) | Clerk auth integration + `auth()` for App Router + `WebhookEvent` type | Already installed. The `auth()` return type includes `userId`, `orgId`, `sessionClaims` — exactly what L-02's `getOrgContext()` reads. [VERIFIED: npm registry, Clerk docs] |
| `svix` | `^1.93.0` (current — confirmed via `npm view`) | Webhook signature verification (HMAC SHA-256 over raw payload + svix-id + svix-timestamp) | This is the package Clerk's own docs use. No published security advisories on the svix repo. [VERIFIED: npm registry, slopcheck OK, Clerk blog, GitHub Security tab empty] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ts-morph` | `^28.0.0` (current — confirmed via `npm view`) | AST traversal for `scripts/check-db-imports.ts` | New dev dependency. Recommended over `@typescript-eslint/parser` for L-05 — see "Alternatives Considered" below. [VERIFIED: npm registry, slopcheck OK] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ts-morph` for L-05 | `@typescript-eslint/parser` + `@typescript-eslint/typescript-estree` | `typescript-eslint/parser` is designed for ESLint rule authoring — the API returns ESTree nodes that you traverse via visitor functions. ~50 lines of boilerplate. `ts-morph` exposes a fluent API `project.getSourceFiles().forEach(sf => sf.getImportDeclarations().forEach(i => i.getModuleSpecifierValue()))` — closer to ~25 lines and zero glue code. Both are sound; `ts-morph` wins on conciseness for this exact use case. Also: PolicyPilot already runs ESLint v9 (in devDependencies) but does NOT currently install `@typescript-eslint/parser`, so picking it would add the same number of new deps as `ts-morph`. |
| `Webhook.verify()` from svix | Hand-rolled HMAC SHA-256 verification (the dev.to article shows it) | Hand-rolling reimplements signature decoding, timestamp tolerance window, and signature constant-time comparison. The svix `Webhook.verify` already does all three correctly and is what Clerk's own docs cite. Hand-rolling violates CLAUDE.md "NEVER roll custom auth" by analogy (auth + signing == auth). |
| Drizzle `pgPolicy()` API in `lib/db/schema.ts` | Hand-written `0001_rls_policies.sql` (D-01 choice) | Drizzle's `pgPolicy()` is nascent — issue #3504 documents `drizzle-kit push` not applying policies; the `migrate` path works for the basic case but the `auth.jwt()->>'org_id'` USING clause we need isn't a documented `pgPolicy()` pattern in the current docs. Hand-written SQL is plain, audit-friendly, and matches Supabase's own documentation conventions. |
| Single `DATABASE_URL` for both runtime and migrations | `DIRECT_URL` split (D-05 choice) | Supabase docs explicitly state Transaction pooler (port 6543) "does not support prepared statements" and is "designed for serverless/edge functions with transient connections," not for DDL. The docs say to use Direct Connection (port 5432) for "migrations, pg_dump, backup and management tools." [CITED: supabase.com/docs/guides/database/connecting-to-postgres] |

**Installation:**

```bash
pnpm add svix
pnpm add -D ts-morph
```

**Version verification:** Confirmed against npm registry (`npm view <pkg> version`) on 2026-05-17. All five packages plus `@clerk/nextjs` and `postgres` are current. `drizzle-orm@0.46+` exists in beta but `0.45.2` (Phase 1 pin) is stable.

## Package Legitimacy Audit

Verified via `slopcheck install ...` on 2026-05-17 (all six packages including the two new ones for Phase 2 — `svix` and `ts-morph` — plus the four already-installed Phase-1 deps that this phase touches).

| Package | Registry | Age (approx) | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|--------------|-----------|-------------|-----------|-------------|
| `svix` | npm | 4+ years (1.x line since ~2021; v1.93.0 active) | 4M+/wk (well-known webhook lib) | github.com/svix/svix-webhooks | [OK] | Approved — no published security advisories; cited by Clerk's own docs |
| `ts-morph` | npm | 7+ years (active since 2018) | 1M+/wk | github.com/dsherret/ts-morph | [OK] | Approved — well-known TS AST wrapper |
| `drizzle-orm` | npm | already installed Phase 1 | very high | github.com/drizzle-team/drizzle-orm | [OK] | Approved |
| `drizzle-kit` | npm | already installed Phase 1 | very high | github.com/drizzle-team/drizzle-orm | [OK] | Approved |
| `@clerk/nextjs` | npm | already installed Phase 1 | very high | github.com/clerk/javascript | [OK] | Approved |
| `postgres` (postgres-js) | npm | already installed Phase 1 | very high | github.com/porsager/postgres | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Postinstall script check: `npm view svix scripts.postinstall` returns empty; `npm view ts-morph scripts.postinstall` returns empty. Neither package runs a postinstall script — clean.

## Architecture Patterns

### System Architecture Diagram

```
                              ┌─────────────────────────────┐
                              │   Clerk (external)          │
                              │   - sessionClaims.publicMeta│
                              │   - svix-signed webhooks    │
                              └──────┬──────────────────────┘
                                     │ (1) JWT cookie + (2) HTTPS POST
                                     ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │   Next.js 15 App Router (Vercel + local dev)                     │
  │                                                                  │
  │   middleware.ts ──── try { await auth() } catch { redirect }     │
  │       │                                                          │
  │       ├── public routes (no auth)                               │
  │       ├── /api/webhooks/clerk  ─────────┐                       │
  │       ├── /api/webhooks/stripe (P6 stub)│                       │
  │       ├── /api/cron/*          (P7 stub)│                       │
  │       └── authenticated routes ─┐       │                       │
  │                                 │       │                       │
  │   Server Components +           │       │                       │
  │   Route Handlers +              │       │                       │
  │   Server Actions                ▼       ▼                       │
  │         │                ┌──────────────────────┐               │
  │         │                │ getOrgContext()      │               │
  │         │                │   reads auth()       │               │
  │         │                │   throws on missing  │               │
  │         │                │   org/role           │               │
  │         │                └────────┬─────────────┘               │
  │         │                         │                             │
  │         ▼                         ▼                             │
  │   withOrgScope(ctx, async (scope) => {                          │
  │     // BEGIN  (db.transaction)                                  │
  │     await scope.tx.execute(sql`SET LOCAL ROLE authenticated`);  │
  │     await scope.tx.execute(sql`SELECT set_config(               │
  │         'request.jwt.claims', ${claims}, true)`);               │
  │     ▼                                                           │
  │     Policies.findById(scope, id)                                │
  │     PolicyVersions.create(scope, input) ... etc                 │
  │     // each method:                                             │
  │     //   scope.tx.select().from(t).where(eq(t.orgId, scope.orgId│
  │     ▼                                                           │
  │   })  // COMMIT — SET LOCAL resets here                         │
  │         │                         │                             │
  │         └─────────────────────────┼───────────► postgres-js     │
  │                                   │             (prepare:false) │
  │                                   ▼                             │
  │   Raw `db` (4 allow-listed callers ONLY):                       │
  │     1. /api/webhooks/clerk/route.ts                             │
  │     2. /api/webhooks/stripe/route.ts (P6 stub)                  │
  │     3. /api/cron/**/route.ts          (P7 stub)                 │
  │     4. tests/** + scripts/check-rls.ts + scripts/check-schema.ts│
  │                                   │                             │
  └───────────────────────────────────┼─────────────────────────────┘
                                      │
                                      ▼ Transaction pooler (port 6543)
  ┌─────────────────────────────────────────────────────────────────┐
  │   Supabase Postgres                                              │
  │                                                                  │
  │   Connection-string role: `postgres` (BYPASSRLS — for webhooks  │
  │                                       and migrations only)      │
  │                                                                  │
  │   After SET LOCAL ROLE authenticated + set_config:               │
  │     auth.jwt() → reads current_setting('request.jwt.claims')     │
  │                  → { sub, org_id, role }                         │
  │                                                                  │
  │   10 tenant-scoped tables (RLS enabled, org_isolation policy,    │
  │      GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated):        │
  │     organizations · users · departments · policies               │
  │     policy_versions · policy_assignments · acknowledgments       │
  │     ai_generations · notifications · workflow_stages             │
  │                                                                  │
  │   2 service-role-only tables (no RLS):                           │
  │     stripe_events · clerk_events                                 │
  └──────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ Direct connection (port 5432)
                              ┌───────┴─────────┐
                              │  drizzle-kit    │
                              │  migrate +      │
                              │  generate       │
                              │  (DIRECT_URL)   │
                              └─────────────────┘
```

### Recommended Project Structure

```
lib/
├── auth/
│   └── context.ts          # L-02: getOrgContext()
├── db/
│   ├── index.ts            # existing (raw db, BYPASSRLS via postgres user)
│   ├── schema.ts           # populated from empty placeholder per D-02 / D-03b
│   ├── scoped.ts           # L-01: OrgScope + withOrgScope()
│   └── repositories/
│       ├── policies.ts
│       ├── policy_versions.ts
│       ├── policy_assignments.ts
│       ├── acknowledgments.ts
│       ├── users.ts
│       ├── departments.ts
│       ├── ai_generations.ts
│       ├── notifications.ts
│       └── workflow_stages.ts
app/
└── api/
    └── webhooks/
        └── clerk/
            └── route.ts    # NEW — svix verification + 4 event handlers
drizzle/
├── 0000_initial.sql        # generated by drizzle-kit generate
├── 0001_rls_policies.sql   # generated empty by --custom, then hand-edited
└── meta/
    └── _journal.json       # auto-managed
scripts/
├── check-data-layer.ts     # NEW — orchestrates verify:phase-2
├── check-db-imports.ts     # L-05
├── check-rls.ts            # L-06
├── check-schema.ts         # D-08 step 5
├── check-foundation.ts     # existing (Phase 1)
├── check-db.ts             # existing
└── check-artifacts.ts      # existing — extended with Phase-2 assertions
tests/
└── types.ts                # D-07: @ts-expect-error invariants
```

### Pattern 1: Hand-written RLS migration via `drizzle-kit generate --custom`

**What:** Generate the schema migration first (auto-DDL from `lib/db/schema.ts`), then generate an empty `--custom` migration for the security DDL.

**When to use:** Phase 2 D-01 — splits schema and security DDL into separate files for audit clarity and avoids the nascent `pgPolicy()` API.

**Example:**

```bash
# Step 1: generate schema migration
pnpm drizzle-kit generate
#   → drizzle/0000_initial.sql       (auto-DDL)
#   → drizzle/meta/_journal.json     (registers 0000)
#   → drizzle/meta/0000_snapshot.json

# Step 2: generate empty custom migration
pnpm drizzle-kit generate --custom --name=rls_policies
#   → drizzle/0001_rls_policies.sql  (EMPTY — ready for hand-editing)
#   → drizzle/meta/_journal.json     (registers 0001 — CRITICAL)

# Step 3: hand-edit drizzle/0001_rls_policies.sql with:
#   ALTER TABLE <each tenant-scoped table> ENABLE ROW LEVEL SECURITY;
#   CREATE POLICY "org_isolation" ON <table> FOR ALL
#     USING (org_id = auth.jwt()->>'org_id');
#   GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO authenticated;
```

**LANDMINE:** Hand-dropping a `0001_*.sql` into `drizzle/` WITHOUT going through `--custom` does NOT register it in `_journal.json`. `drizzle-kit migrate` reads the journal, not the directory listing — so an unregistered file is silently skipped. Source: `drizzle-kit generate --custom` is the documented path. [CITED: orm.drizzle.team/docs/drizzle-kit-generate, orm.drizzle.team/docs/kit-custom-migrations]

### Pattern 2: Per-transaction RLS injection (the `withOrgScope` body)

**What:** Wrap every user-facing DB access in a Drizzle transaction that first runs `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', <json>, true)`, then dispatches to repository methods using the transaction handle.

**When to use:** Every Server Component / Route Handler / Server Action that touches user data — i.e., everything outside the 4-entry raw-`db` allow-list.

**Example:**

```typescript
// lib/db/scoped.ts
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { OrgContext } from '@/lib/auth/context';

// PgTransaction<any, any, any> is what Drizzle exposes for the tx handle
// type. Tightening via Parameters<typeof db.transaction>[0] is possible
// but produces deep generic types that don't survive re-export. See
// CONTEXT.md <specifics> — operator-approved `any` with comment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // The `true` (third arg) = is_local: applies for current transaction only.
    // Equivalent to SET LOCAL — resets at COMMIT/ROLLBACK regardless of pool reuse.
    // [CITED: postgresql.org/docs/current/functions-admin.html]
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claims}, true)`,
    );
    return fn({ ...ctx, tx });
  });
}
```

**LANDMINE:** Using `is_local=false` (or omitting the third arg) sets the value at session scope. On a pgbouncer transaction-mode pool, the same physical connection serves multiple transactions for different users — leaking a session-scope claim ACROSS USERS. The `true` flag is load-bearing. [CITED: postgresql.org/docs/current/functions-admin.html ("If is_local is true, the new value will only apply during the current transaction. If you want the new value to apply for the rest of the current session, use false instead.")]

**LANDMINE:** `set_config(...)` returns the value as `text` — the call is a `SELECT set_config(...)` not just `set_config(...)`. A bare `set_config(...)` is invalid SQL.

**LANDMINE:** `SET LOCAL ROLE` outside a transaction is an error ("SET LOCAL can only be used in transaction blocks" — Postgres error 0B000). Drizzle's `db.transaction(async (tx) => {...})` issues `BEGIN`, so all `SET LOCAL` calls inside the callback are valid. Verify the script DOES use `tx` (not bare `db`).

### Pattern 3: Clerk webhook handler with svix verification

**What:** Read raw text body BEFORE parsing JSON. Extract three `svix-*` headers. Construct `Webhook(secret)`. Call `wh.verify(payload, headers)` — throws `WebhookVerificationError` on any failure.

**When to use:** `/api/webhooks/clerk/route.ts` — the L-03 entry from the allow-list.

**Example:**

```typescript
// app/api/webhooks/clerk/route.ts
// Allow-listed cross-org caller per ADR-023 — uses raw `db`.
import { db } from '@/lib/db';
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { clerkEvents, organizations, users } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

const SECRET = process.env.CLERK_WEBHOOK_SECRET;
if (!SECRET) throw new Error('CLERK_WEBHOOK_SECRET is not set');

export async function POST(req: Request): Promise<Response> {
  // (1) Read RAW text BEFORE parsing — signature is over the raw bytes.
  const payload = await req.text();

  // (2) Extract svix headers — must be three exact names.
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    // 400 not 500 — missing headers is a client/sender problem.
    return new Response('Missing svix headers', { status: 400 });
  }

  // (3) Verify — throws WebhookVerificationError on bad signature.
  let evt: WebhookEvent;
  try {
    const wh = new Webhook(SECRET);
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    // 400 (per svix docs / Clerk blog example) — verify failure is client-side.
    return new Response('Invalid signature', { status: 400 });
  }

  // (4) Idempotency — INSERT ON CONFLICT DO NOTHING RETURNING id.
  const inserted = await db
    .insert(clerkEvents)
    .values({ id: svixId })
    .onConflictDoNothing()
    .returning({ id: clerkEvents.id });
  if (inserted.length === 0) {
    // Already processed — return 200 so Clerk stops retrying.
    return new Response(null, { status: 200 });
  }

  // (5) Event dispatch — only the four D-03 events do work; deletes log + 200.
  switch (evt.type) {
    case 'organization.created':
      // raw db insert into organizations
      break;
    case 'user.created':
      // raw db insert into users with nullable org_id (D-03a)
      break;
    case 'organizationMembership.created':
      // raw db upsert into users (set org_id, role)
      break;
    case 'organizationMembership.updated':
      // raw db update users.role for clerkUserId
      break;
    // D-03c: deletes are logged-only — TODO(Phase 7+) for retention design
    case 'user.deleted':
    case 'organization.deleted':
    case 'organizationMembership.deleted':
      // TODO(Phase 7+): handle deletion + ADR-018 retention
      break;
  }

  return new Response(null, { status: 200 });
}
```

**LANDMINE:** Calling `await req.json()` BEFORE `req.text()` consumes the body — `req.text()` afterwards returns empty. Even calling `req.text()` then `JSON.parse()` is fine (svix.verify accepts the text, then your handler can parse), but you cannot reverse the order. [CITED: docs.svix.com/receiving/verifying-payloads/how, svix.com/guides/receiving/receive-webhooks-with-javascript-nextjs/]

**LANDMINE:** `request.headers.get('svix-id')` returns `null` if missing. Passing `null` (or via `!` assertion to satisfy TS) into svix.verify causes a less-actionable error. Reject with 400 BEFORE calling verify when any header is null.

**LANDMINE:** svix is case-sensitive on header names per its docs. Use lowercase `svix-id` / `svix-timestamp` / `svix-signature` — Next.js's `Headers` object normalizes header names to lowercase but the dictionary you pass into `wh.verify()` must also be lowercase.

**LANDMINE:** The `svix-signature` header can contain MULTIPLE comma-separated signatures (for key rotation). `wh.verify` handles this automatically — do NOT split it manually.

### Pattern 4: AST-based import allow-list with ts-morph

**What:** Walk every `.ts` / `.tsx` file. For each ImportDeclaration whose module specifier matches `@/lib/db` (the raw db, NOT `@/lib/db/schema` or `@/lib/db/scoped` or `@/lib/db/repositories/*`), check the file path against an allow-list. Fail if found outside the allow-list.

**When to use:** `scripts/check-db-imports.ts` (L-05) — run on every `pnpm verify:phase-2`.

**Example:**

```typescript
// scripts/check-db-imports.ts
import { Project } from 'ts-morph';
import { resolve } from 'node:path';

// 4-entry allow-list per ADR-023.
const ALLOWLIST = [
  /^app[\\/]api[\\/]webhooks[\\/]clerk[\\/]route\.ts$/,
  /^app[\\/]api[\\/]webhooks[\\/]stripe[\\/]route\.ts$/,    // P6 stub
  /^app[\\/]api[\\/]cron[\\/].+[\\/]route\.ts$/,            // P7 stub
  /^(tests|scripts[\\/]check-(rls|schema))/,                // test harness + P2 verify
];

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
});

const violations: string[] = [];

for (const sourceFile of project.getSourceFiles(['app/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'scripts/**/*.ts', 'tests/**/*.ts'])) {
  const rel = sourceFile.getFilePath().replace(process.cwd() + '\\', '').replace(/\//g, '\\');
  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    // Match @/lib/db (the raw db barrel) — NOT @/lib/db/schema or similar.
    if (spec === '@/lib/db' || spec === '@/lib/db/index') {
      if (!ALLOWLIST.some((re) => re.test(rel))) {
        violations.push(`${rel}: import '${spec}' (not allow-listed)`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('ADR-023 raw-`db` allow-list violations:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`OK — no raw-db imports outside the ${ALLOWLIST.length}-entry allow-list.`);
process.exit(0);
```

**LANDMINE:** Don't match by regex against source text — re-exports (`export { db } from '@/lib/db'`) and renamed imports (`import { db as d } from '@/lib/db'`) BOTH count. The AST `getImportDeclarations()` catches both. Regex on `from "@/lib/db"` substring would catch them but would also false-positive on comments. AST is correct.

**LANDMINE:** `@/lib/db/scoped` and `@/lib/db/schema` and `@/lib/db/repositories/*` are NOT cross-org callers — they're either the wrapper (scoped owns the transaction) or the static schema (no SQL at all) or the safe API (repositories are OrgScope-first). The check must distinguish `@/lib/db` (the index barrel, exports `db`) from these — use exact string equality, not `startsWith`.

**LANDMINE:** The check must scan `app/`, `lib/`, `scripts/`, `tests/`. Restricting to `app/` only would let a future `lib/some-helper.ts` import `db` undetected.

### Pattern 5: Cross-org property test (the L-06 body)

**What:** Seed two orgs with at least one row per tenant-scoped table. Open a transaction as `authenticated`, inject orgA's JWT. Attempt to SELECT every table WHERE the row belongs to orgB. Assert zero rows.

**When to use:** `scripts/check-rls.ts` — run on every `pnpm verify:phase-2`.

**Example skeleton:**

```typescript
// scripts/check-rls.ts
import postgres from 'postgres';

const TEST_URL = process.env.DATABASE_URL_TEST;
if (!TEST_URL) throw new Error('DATABASE_URL_TEST not set (D-05)');

const TENANT_SCOPED = [
  'organizations', 'users', 'departments', 'policies',
  'policy_versions', 'policy_assignments', 'acknowledgments',
  'ai_generations', 'notifications', 'workflow_stages',
];

const sql = postgres(TEST_URL, { prepare: false });

try {
  // (1) Truncate + seed orgA and orgB with one row per table.
  await sql.begin(async (tx) => {
    for (const t of [...TENANT_SCOPED, 'clerk_events', 'stripe_events'].reverse()) {
      await tx`TRUNCATE TABLE ${tx(t)} CASCADE`;
    }
    // ... insert orgA + orgB fixtures (omitted for brevity)
  });

  // (2) Probe as authenticated with orgA's JWT.
  const orgAId = '...'; // captured from fixture INSERT
  const orgBId = '...';

  await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    const claims = JSON.stringify({ sub: 'fake-user', org_id: orgAId, role: 'admin' });
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;

    for (const table of TENANT_SCOPED) {
      // organizations is special-cased — its RLS predicate is `id = ...`, not `org_id = ...`.
      const col = table === 'organizations' ? 'id' : 'org_id';
      const rows = await tx`SELECT 1 FROM ${tx(table)} WHERE ${tx(col)} = ${orgBId}`;
      if (rows.length !== 0) {
        throw new Error(`Cross-org leak on ${table}: ${rows.length} row(s) visible`);
      }
    }
    // Force rollback so the test is idempotent.
    throw new Error('__intentional_rollback__');
  }).catch((e) => {
    if (!String(e.message).includes('__intentional_rollback__')) throw e;
  });

  console.log(`OK — all ${TENANT_SCOPED.length} tables RLS-isolated.`);
  process.exit(0);
} finally {
  await sql.end({ timeout: 5 });
}
```

**LANDMINE (the most important one in this whole document):** A bare `postgres(DATABASE_URL_TEST, { prepare: false })` connection uses the `postgres` user from the connection string. **The `postgres` user has BYPASSRLS by default** — meaning `SELECT * FROM policies` returns ALL rows from ALL orgs, ignoring RLS. The cross-org test would TRIVIALLY PASS (every SELECT returns rows, but the assertion would fail because of leak) OR FALSELY PASS depending on how you write the assertion. The `SET LOCAL ROLE authenticated` is what makes RLS fire — without it, the entire test is meaningless. [CITED: supabase.com/docs/guides/database/postgres/row-level-security (BYPASSRLS section); github.com/orgs/supabase/discussions/30124 (the role-impersonation pattern)]

**LANDMINE:** `organizations` is its own special case — its RLS predicate is `USING (id = auth.jwt()->>'org_id')`, NOT `USING (org_id = ...)`. The probe loop must branch on table name. SCHEMA.md §RLS-policies documents this special case.

**LANDMINE:** `postgres-js` `sql.begin(async (tx) => {...})` issues `BEGIN`. Throwing inside causes `ROLLBACK`. The pattern `throw new Error('__intentional_rollback__')` then catch-and-suppress is the documented idempotent-test pattern. Drizzle's equivalent is `tx.rollback()` (which also throws and causes rollback). [CITED: orm.drizzle.team/docs/transactions]

**LANDMINE:** `TRUNCATE ... CASCADE` on `organizations` deletes children — but if the test FAILS before TRUNCATE runs (e.g., previous run left non-truncatable state), seed will fail on duplicate clerk_org_id UNIQUE constraint. Order: TRUNCATE first (all tables, CASCADE), THEN INSERT. The `[...TENANT_SCOPED, 'clerk_events', 'stripe_events'].reverse()` puts child tables first (then parents), so CASCADE doesn't matter.

### Pattern 6: CHECK constraint for D-03a transient null

**What:** Allow `users.org_id` to be NULL within 5 minutes of `created_at`. Postgres allows `now()` in CHECK (it's STABLE, not IMMUTABLE — Postgres allows STABLE in CHECK with the caveat below).

**Example SQL (lives in `0001_rls_policies.sql`):**

```sql
ALTER TABLE users
  ADD CONSTRAINT users_org_id_or_recent
  CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes');
```

**LANDMINE (called out explicitly in CONTEXT D-03a):** The CHECK is evaluated only at INSERT/UPDATE time on the row. A row that satisfies the constraint at INSERT (created_at = now(), org_id IS NULL) becomes "logically invalid" 5 minutes later because `now()` has advanced — but Postgres does NOT re-evaluate the CHECK on a stable row. This means:
- The INSERT is accepted with NULL org_id (correct — D-03a intent).
- The row STAYS in the DB indefinitely if no `organizationMembership.created` event ever fires.
- `scripts/check-data-layer.ts` MUST audit for stale rows: `SELECT id FROM users WHERE org_id IS NULL AND created_at < now() - interval '5 minutes'` should return zero in a healthy DB. If non-zero, surface as a Phase-2 verify FAIL with the suggestion "Clerk webhook ordering broke — investigate."

**LANDMINE:** Postgres docs note: "CHECK constraints cannot reference functions whose result depends on data outside the row." `now()` is STABLE — its result depends on transaction start time, NOT on data outside the row. Postgres allows this in practice (and in the CHECK syntax) but issues a warning: "This is somewhat dubious because it's not stable across time." This is the documented "with the caveat" form — the warning is informational, not blocking. The pattern is in widespread use.

### Anti-Patterns to Avoid

- **Don't call `await req.json()` before `await req.text()` in the webhook handler.** The body stream can be consumed once. JSON-then-text returns empty text, breaking signature verification.

- **Don't use `is_local=false` (or omit the third arg of `set_config`) for the JWT claim injection.** Session-scope leaks across pooled connections to other users. Always `true`.

- **Don't ship `INSERT ON CONFLICT DO NOTHING` on the `clerkOrgId` UNIQUE as the idempotency strategy.** It works for `*.created` events but breaks for `*.updated` (which has no ON CONFLICT path — the row already exists, you must update). D-03b's separate `clerk_events` table is correct.

- **Don't import `db` from `@/lib/db` inside `lib/db/repositories/*.ts`.** Repository methods receive `scope.tx` from `withOrgScope` — that's the transaction-bound query handle. Importing `db` would bypass the transaction AND the JWT injection — both invariants broken.

- **Don't open a transaction inside a repository method.** L-03 requires that `withOrgScope` owns transaction lifecycle. A nested `db.transaction()` inside a repository would create a SAVEPOINT (per Drizzle docs) — not necessarily wrong, but the inner SAVEPOINT does NOT re-issue `SET LOCAL ROLE` — it inherits from the parent. Better: never nest.

- **Don't grep for `from "@/lib/db"` as the only check.** Use AST (`ts-morph`) to catch re-exports, renamed imports, and dynamic `await import('@/lib/db')`.

- **Don't omit `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO authenticated` in `0001_rls_policies.sql`.** RLS-eligible queries from the `authenticated` role return `permission denied` (not "0 rows") if the GRANTs are missing. This is L-04's explicit warning — without GRANTs, the entire pattern looks broken.

- **Don't denormalize `org_id` onto `stripe_events` or `clerk_events`.** These are service-role-only tables and have NO RLS. Adding `org_id` would be dead weight.

- **Don't try to drop the `users.org_id NOT NULL` constraint in `0000_initial.sql`.** Drizzle generates the schema from `lib/db/schema.ts`. If schema.ts declares `orgId: uuid('org_id')` (without `.notNull()`), the generated SQL is already nullable — no separate ALTER needed. The CHECK constraint is the only thing that goes in `0001_rls_policies.sql`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC-SHA-256 with timestamp tolerance + constant-time comparison | `svix.Webhook.verify()` | Hand-rolled = reimplements timestamp window (replay protection), constant-time signature comparison (timing-attack mitigation), and multi-signature parsing (key rotation). svix gets all three right. The dev.to article that shows hand-rolled HMAC for Clerk is WRONG — it doesn't validate svix-timestamp tolerance and uses `===` instead of constant-time compare. |
| TypeScript AST traversal | Custom recursive descent over TS AST | `ts-morph` | Hand-rolling means depending on internal `typescript` package APIs (`ts.forEachChild`, `ts.SyntaxKind`) that are stable but verbose. `ts-morph` wraps them with a typed fluent API. |
| Postgres transaction with role + claim injection | `await client.query('BEGIN'); await client.query('SET LOCAL ...'); ...; await client.query('COMMIT')` | Drizzle's `db.transaction()` callback | Drizzle handles BEGIN/COMMIT/ROLLBACK error paths correctly. Throwing inside the callback rolls back; resolving commits. Hand-rolling means catching errors and explicitly emitting ROLLBACK, easy to get wrong. |
| Test fixture cleanup | `BEGIN ... SELECT ... ROLLBACK` boilerplate per test | Test wrapped in a transaction that always rolls back (throw at end) | Postgres-js `sql.begin(async (tx) => { ...; throw new Error('rollback') })` is the documented idempotent-test pattern. |
| Idempotent webhook handling | Hand-rolled "have I seen this event ID?" lookup with separate SELECT + INSERT (race condition) | `INSERT ... ON CONFLICT DO NOTHING RETURNING id` | The single-statement pattern is atomic — no race window between checking and inserting. Same pattern as `stripe_events` per ADR-020. |
| Postgres connection string parsing | Hand-extracted host/port/user/password | postgres-js's built-in URI parsing (`postgres(uri)`) | postgres-js handles SSL params, multi-host, IPv6 brackets, URL-encoded passwords. |

**Key insight:** Phase 2 is a "lock the mechanism" phase, not a "wire up a feature" phase. Every piece of automation we ship (the type-test, the import-allow-list, the cross-org property test, the schema audit) replaces a future "developer remembered" claim with a CI gate. The temptation to hand-roll any of the above is the temptation to add another future "developer remembered" — exactly what ADR-023 + ADR-025 reject.

## Runtime State Inventory

Phase 2 is greenfield in production (no existing PolicyPilot deployment, no data migration concerns). However, two near-cousin items deserve explicit "nothing found" entries to honor the protocol:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 1 shipped no data layer beyond `lib/db/index.ts` + `lib/db/schema.ts` (currently `export {}`). The Supabase project is empty except for system schemas. | None |
| Live service config | Clerk Dashboard has been configured in Phase 1 (organization toggle enabled). Phase 2 D-09 + D-04 add MORE operator manual steps (define roles + customize session token + create webhook endpoint). The Clerk Dashboard state is intentionally NOT in git — operator must execute the manual steps once. | Operator must execute 5 manual steps before `pnpm verify:phase-2` will pass (full list in CONTEXT.md `<specifics>`). |
| OS-registered state | None — no OS-level scheduled tasks, no pm2, no launchd, no systemd in scope. Railway cron is Phase 7. | None |
| Secrets/env vars | Phase 1 wrote `.env.local` with Clerk + Supabase keys. Phase 2 amends `.env.local.example` to add `DIRECT_URL=`, `DATABASE_URL_TEST=`, `DIRECT_URL_TEST=`. Operator must populate the three new keys in their actual `.env.local`. `CLERK_WEBHOOK_SECRET` is already present in `.env.local.example` (added in Phase 1 D-11) — operator populates it from the new webhook endpoint they create. | Operator manual: populate 4 new env vars (3 new keys + already-blank CLERK_WEBHOOK_SECRET). |
| Build artifacts / installed packages | `pnpm install` after adding `svix` and `ts-morph` to package.json will create new entries in `pnpm-lock.yaml`. No stale egg-info / build artifacts because nothing has been compiled. The Phase-1 lockfile will diff cleanly. | None beyond `pnpm install`. |

**Verified by:** Phase 1 STATE.md (no DB data); `git ls-files` of `lib/db/schema.ts` shows the empty placeholder; `.env.local.example` (read in Phase 1 check-artifacts.ts) lists current keys.

## Common Pitfalls

### Pitfall 1: BYPASSRLS on the connection-string user defeats RLS testing

**What goes wrong:** Connecting to Supabase as `postgres` (the default connection-string user) bypasses RLS entirely. A naive `scripts/check-rls.ts` that runs `SELECT * FROM policies WHERE org_id = '<orgB>'` after seeding orgA + orgB fixtures returns ALL rows — RLS never fires because `postgres` is BYPASSRLS.
**Why it happens:** Supabase's `authenticated` role is the RLS-enforced role; the connection-string user (`postgres`) is a superuser-class role for service operations like migrations.
**How to avoid:** ALWAYS run `SET LOCAL ROLE authenticated` BEFORE any RLS-eligible SELECT in `scripts/check-rls.ts`. The SAME `SET LOCAL ROLE` discipline that `withOrgScope` enforces is the discipline the test must follow — by symmetry, that's a feature: the test exercises the production code path.
**Warning signs:** A cross-org probe returns the expected NUMBER of rows (1) but they belong to the WRONG org. The test passes ("rows.length === 0" assertion fires correctly) but you never proved RLS is real — you proved the test runs as a BYPASSRLS user and there's nothing in orgB's bucket. Add a positive control: `SELECT 1 FROM policies WHERE org_id = '<orgA>'` (same row) must return 1 row AFTER the SET LOCAL ROLE; if it doesn't, RLS itself is broken OR the JWT injection didn't fire OR the GRANT is missing.

### Pitfall 2: `set_config` with `is_local=false` leaks JWT claims across users on a transaction pool

**What goes wrong:** Session-scope claims (`is_local=false`) persist after `COMMIT`. On a pgbouncer transaction-mode pool, the same physical Postgres connection is reused for the NEXT user's transaction — but with the previous user's `request.jwt.claims` still set. Org A's user could read org B's data on a hot pool.
**Why it happens:** pgbouncer transaction mode multiplexes physical connections across many client sessions. PostgreSQL session state (which includes session-scope GUCs) is NOT reset between transactions in this mode — that's the whole point of transaction-mode pooling.
**How to avoid:** Always pass `true` as the third arg to `set_config`. `SET LOCAL` (and `set_config(..., true)`) resets at `COMMIT` or `ROLLBACK` regardless of pool reuse. Document this with a comment at the `tx.execute(sql\`SELECT set_config(...)\`)` site.
**Warning signs:** Intermittent cross-org bleed reports in production — not always reproducible because it depends on pool connection reuse. If the cross-org property test passes on a fresh DB but breaks under load, this is the candidate cause. Mitigation in the test: run 100 iterations of the probe loop and assert all 100 pass — pgbouncer reuses the same physical connection between fast iterations.

### Pitfall 3: Hand-dropped `0001_*.sql` not registered in `_journal.json`

**What goes wrong:** Engineer creates `drizzle/0001_rls_policies.sql` by hand (text editor) without going through `drizzle-kit generate --custom`. `drizzle-kit migrate` reads `_journal.json` to know what's been applied — anything not in the journal is invisible. The hand-written file is silently skipped. RLS policies are never applied. The cross-org property test fails ("orgA can see orgB rows") — but the test failure points at RLS, not at "your migration wasn't registered."
**Why it happens:** Drizzle's migration model is journal-driven, not directory-listing-driven. This is correct (it lets you skip / re-run / hash-check migrations) but the failure mode is invisible.
**How to avoid:** ALWAYS go through `drizzle-kit generate --custom --name=<name>` to create the empty file shell. The command creates BOTH the `.sql` file AND the `_journal.json` entry atomically. Then hand-edit the body of the `.sql`. Document this in `docs/migrations.md` or as a comment in `package.json` `db:generate-rls` script.
**Warning signs:** `pnpm db:migrate:test` reports "0 migrations applied" or "1 migration applied" (instead of expected 2). Check `drizzle/meta/_journal.json` — if it has only one entry, the custom-migration step was skipped.

### Pitfall 4: Webhook handler reads `await req.json()` before signature verification

**What goes wrong:** Engineer writes `const evt = await req.json()` early in the handler (intuitive), then later tries `const payload = await req.text()` for the verify call. The text returns empty (body stream consumed by `.json()`). svix.verify throws "Invalid signature." Returns 400 to Clerk. Clerk retries 8 times. None succeed. User stuck in "no org row exists" state forever.
**Why it happens:** Standard request bodies are streams — readable once. Different framework conventions confuse this (Express's `req.body` is parsed once and re-readable; native `Request` is not).
**How to avoid:** Pattern is `const payload = await req.text()` FIRST, `wh.verify(payload, headers)` SECOND, `JSON.parse(payload)` (or `evt = wh.verify(...) as WebhookEvent` — svix's verify returns the parsed object after verification) THIRD.
**Warning signs:** Every webhook call returns 400; Clerk Dashboard "Webhook Logs" shows retries. Add `console.log({ payloadLength: payload.length })` early — if it's 0, the body was consumed elsewhere.

### Pitfall 5: `users.org_id` becomes stale-null after 5 minutes and stays that way

**What goes wrong:** D-03a CHECK constraint accepts `NULL org_id` if `created_at` is within 5 minutes of `now()`. If the matching `organizationMembership.created` event never fires (Clerk dropped it, network issue, signature secret rotated mid-flight), the row stays NULL forever. Other parts of the system (Server Components calling `Users.findByClerkId`) see a half-bound user.
**Why it happens:** Postgres does NOT re-evaluate CHECK constraints on stable rows. The constraint is satisfied at INSERT time (created_at IS recent), then becomes "logically violated" 5 minutes later — but Postgres doesn't notice.
**How to avoid:** Add to `scripts/check-data-layer.ts` (D-08 step 5 or 6) a stale-null audit: `SELECT id FROM users WHERE org_id IS NULL AND created_at < now() - interval '5 minutes'` — expect zero rows. If non-zero, surface "Clerk webhook ordering broke: <id>(s) need investigation." This is the only place to catch the failure mode.
**Warning signs:** Cross-org property test passes (no leak) but a manual `SELECT count(*) FROM users WHERE org_id IS NULL` in the operator's dev DB returns >0. Run the audit.

### Pitfall 6: Repository imports `db` instead of receiving `scope.tx`

**What goes wrong:** Engineer adds a new method to `lib/db/repositories/policies.ts`: `findByCategory: async (s: OrgScope, cat: string) => { const r = await db.select()...` — using `db` instead of `s.tx`. This bypasses the transaction AND the JWT injection. The query runs as `postgres` (BYPASSRLS) — returns ALL orgs' policies for that category.
**Why it happens:** The repository module imports `db` for type purposes (or by accident — autocomplete suggests `db`), and the muscle memory of "always use `db.select()`" persists.
**How to avoid:** L-05 (`scripts/check-db-imports.ts`) catches the import — `lib/db/repositories/*.ts` is NOT in the allow-list. The check runs on every `verify:phase-2`. Plan task verification MUST include "run pnpm tsx scripts/check-db-imports.ts after touching any repository module." Also: do NOT add the convenience `import { db } from '@/lib/db'` to the repository module template — repositories should only `import type { OrgScope } from '@/lib/db/scoped'`.
**Warning signs:** `pnpm verify:phase-2` fails at step 3 (check-db-imports) with a violation pointing at a repository file.

## Code Examples

### Drizzle schema definition for an `org_id`-denormalized child table

```typescript
// lib/db/schema.ts (D-02 example — policy_versions gets org_id added)
import { pgTable, uuid, integer, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations'; // or same file, alphabetical

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  // D-02: denormalized. RLS evaluates on this column directly.
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  versionNumber: integer('version_number').notNull(),
  contentJson: jsonb('content_json').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  changeSummary: text('change_summary'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Type for repository INSERT input — Drizzle infers from above.
export type PolicyVersionInsert = typeof policyVersions.$inferInsert;
// Type for SELECT result.
export type PolicyVersionRow = typeof policyVersions.$inferSelect;
```

[Source: SCHEMA.md verbatim + D-02 amendment; Drizzle docs for `$inferInsert` / `$inferSelect`.]

### Hand-written RLS migration (skeleton for `drizzle/0001_rls_policies.sql`)

```sql
-- drizzle/0001_rls_policies.sql
-- D-01: hand-written security DDL; generated as empty via:
--   pnpm drizzle-kit generate --custom --name=rls_policies
-- Then this body added by Plan 02-04 task X.
-- See ADR-025 for the per-transaction JWT injection pattern.

-- == organizations (special — its predicate uses `id`, not `org_id`) ==
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON organizations
  FOR ALL USING (id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;

-- == users ==
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON users
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO authenticated;

-- D-03a: users.org_id can be transiently NULL for the unmapped-membership window.
ALTER TABLE users
  ADD CONSTRAINT users_org_id_or_recent
  CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes');

-- == departments / policies / policy_versions / policy_assignments /
--    acknowledgments / ai_generations / notifications / workflow_stages ==
-- Repeat the ALTER + CREATE POLICY + GRANT triplet for each table.
-- Predicate is uniform: USING (org_id::text = auth.jwt()->>'org_id')

-- Example for policies:
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON policies
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON policies TO authenticated;

-- ... (8 more tables)

-- Note: stripe_events and clerk_events do NOT get RLS — service-role only.
```

[Source: SCHEMA.md §RLS-policies + D-01 (split) + D-02 (denormalization) + L-04 (GRANT requirement).]

**LANDMINE:** The `auth.jwt()->>'org_id'` returns `text`. Comparing `uuid = text` requires an explicit cast — `org_id::text = auth.jwt()->>'org_id'` (or `org_id = (auth.jwt()->>'org_id')::uuid`). SCHEMA.md's documented pattern omits the cast, which would error at policy-evaluation time. Either cast is correct; `::text` on the LHS is slightly faster (uuid-to-text is constant work).

### Drizzle transaction with role + claim injection (production runtime)

```typescript
// Example usage from a Server Component or Route Handler:
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';

export async function getOrgPolicies() {
  const ctx = await getOrgContext();    // throws on missing org/role
  return await withOrgScope(ctx, async (scope) => {
    return await Policies.listAll(scope);
    // ^ inside this lambda, scope.tx is a Drizzle transaction with
    //   SET LOCAL ROLE authenticated + set_config('request.jwt.claims', ..., true)
    //   already applied. RLS fires on every SELECT/INSERT/UPDATE/DELETE.
  });
  // ^ on return, the transaction COMMITs; SET LOCAL state resets.
  // ^ if the lambda throws, ROLLBACK and re-throw.
}
```

[Source: ADR-025 + CONTEXT.md `<specifics>` § withOrgScope exact body.]

### svix verification — minimal Next.js App Router shell

```typescript
// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/nextjs/server';

const SECRET = process.env.CLERK_WEBHOOK_SECRET;
if (!SECRET) throw new Error('CLERK_WEBHOOK_SECRET is not set');

export async function POST(req: Request): Promise<Response> {
  const payload = await req.text();      // raw bytes for signature verify
  const id = req.headers.get('svix-id');
  const ts = req.headers.get('svix-timestamp');
  const sig = req.headers.get('svix-signature');
  if (!id || !ts || !sig) {
    return new Response('Missing svix headers', { status: 400 });
  }
  let evt: WebhookEvent;
  try {
    evt = new Webhook(SECRET).verify(payload, {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': sig,
    }) as WebhookEvent;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
  // ... idempotency + dispatch (see Pattern 3)
  return new Response(null, { status: 200 });
}
```

[Source: docs.svix.com/receiving/verifying-payloads/how + clerk.com/blog/webhooks-getting-started + Clerk's documented dev.to pattern.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Use a service-role connection from app code and trust the application layer | Use a per-transaction `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` so RLS fires AND application-layer `where` clauses both enforce | Supabase + Postgres documented this pattern for custom auth ~2022; PolicyPilot adopts via ADR-025 (2026-05-17) | Two layers of enforcement instead of one. Cost: two extra round-trips per request transaction (~2ms each at Supabase's median latency = ~4ms overhead). At 100 RPS × 5 repo calls per request, this is amortized to ~0.8ms/call on a hot pool. Deferred to Phase 8 perf review. |
| Hand-rolled HMAC-SHA-256 for webhook signature verification | `svix.Webhook.verify()` — handles timestamp tolerance + constant-time compare + multi-signature parsing | svix npm package mainstream since ~2021; Clerk's recommended path | Less code, fewer ways to get crypto wrong. svix's verify is the documented Clerk path. |
| Drizzle `pgPolicy()` API for inline schema policy declaration | Hand-written `.sql` migration generated via `drizzle-kit generate --custom` | `pgPolicy()` API was 0.36+ (2024) but issue #3504 documents `push` not applying policies; `migrate` works but the `auth.jwt()->>'org_id'` pattern needs SQL anyway | Hand-written SQL is plain, audit-friendly, and matches Supabase's documentation. Will revisit when Drizzle pgPolicy hits 1.0. |
| Single `DATABASE_URL` for both runtime and migrations | Split into `DATABASE_URL` (pool, prepare:false) + `DIRECT_URL` (direct, port 5432, supports DDL) | Supabase Transaction pooler launched 2022; Drizzle docs added the split pattern ~2023 | Migrations work cleanly on Supabase. Without this split, the first `CREATE INDEX CONCURRENTLY` or non-trivial `ALTER TABLE` would fail silently on the pool. |

**Deprecated/outdated:**
- `drizzle-kit push` for production schema changes — works in dev but per issue #3504 doesn't apply RLS policies. Use `generate` + `migrate`.
- Reading `currentUser()` from `@clerk/nextjs/server` inside Route Handlers to get the org — `auth()` is the App-Router-native function and returns `userId`, `orgId`, `sessionClaims` in one call. `currentUser()` issues an extra Clerk API call to fetch full user details (slow).
- Hand-rolled HMAC for webhook verification — use svix.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `drizzle-kit generate --custom --name=<name>` registers the empty file in `_journal.json` AND applies it during `drizzle-kit migrate` in numeric order. | Pattern 1, Pitfall 3 | If wrong, `0001_rls_policies.sql` is silently skipped → no RLS → cross-org property test fails → execute-phase has to debug why the migration didn't apply. **Mitigation:** verify by running `pnpm drizzle-kit generate --custom --name=test_rls` against a scratch project; confirm `_journal.json` contains 2 entries. Execute-phase task 1 of the migration plan should include this sanity check. |
| A2 | postgres-js `sql.begin(async (tx) => {...})` issues a real `BEGIN`/`COMMIT` (not a savepoint) on a pgbouncer transaction-mode pool, and `SET LOCAL` resets at COMMIT/ROLLBACK regardless of pool reuse. | Pattern 2 | If wrong (e.g., if pgbouncer transaction mode does something exotic with SET LOCAL state), then claims could leak across users on a hot pool — the exact vulnerability D-05 is designed to prevent. **Mitigation:** Pitfall 2's stress-test (100 iterations of the cross-org probe) catches this empirically. Add to L-06 acceptance. |
| A3 | The svix v1.93 package on Node 22 has no known compatibility issues. The GitHub Security tab is empty. Clerk's own docs recommend it without a version pin. | Standard Stack | If a Node-22-specific bug exists, the webhook handler would intermittently fail verification. **Mitigation:** Pin to a specific patch version in package.json (`"svix": "1.93.0"` not `"^1.93.0"`) so an unannounced regression in 1.93.1 doesn't slip in without review. Run `pnpm audit` after install. |
| A4 | The Clerk Dashboard's "Customize session token" path adds `publicMetadata` to `sessionClaims` and the JWT propagation is real-time (no manual session refresh required by the user). | D-04 manual step | If wrong, `getOrgContext()` throws "Role not set on session claims" on every request until users sign out and back in. **Mitigation:** D-04 operator manual step should be tested in plan-phase 02-02 (parallel to Phase 1's 01-02) — operator signs in fresh, observes that `sessionClaims.publicMetadata.role` is populated immediately. |
| A5 | The `ts-morph` v28 API surface (`project.getSourceFiles(...)`, `sourceFile.getImportDeclarations()`, `imp.getModuleSpecifierValue()`) is stable and works against `tsconfig.json` with `paths: { "@/*": ["./*"] }`. | Pattern 4 | If wrong, the `@/lib/db` path alias might resolve to something else, and the check might false-positive or false-negative. **Mitigation:** ts-morph's `Project({ tsConfigFilePath })` reads the tsconfig and applies paths correctly per its docs. Add a positive-control test to scripts/check-db-imports.ts: it must FIND the legitimate import inside `app/api/webhooks/clerk/route.ts` (otherwise the AST traversal is broken). |
| A6 | Supabase's `auth.jwt()` function exists out-of-the-box (PostgREST + GoTrue convention) and reads `current_setting('request.jwt.claims', true)::json`. The function ships with every Supabase project. | Pattern 2 | If a fresh Supabase project doesn't have `auth.jwt()`, the RLS predicate fails. **Mitigation:** `scripts/check-schema.ts` (D-08 step 5) can include `SELECT auth.jwt()` (returns null but doesn't error) as a sanity check. If it errors, surface "auth.jwt() not available — is this a Supabase project?" |
| A7 | The `now()` function inside a CHECK constraint produces a warning (not an error) on Postgres 16+. The constraint is enforced at INSERT time only, never re-evaluated. | Pattern 6 | If Postgres rejects the CHECK at creation, the migration fails. **Mitigation:** Test the constraint against `DATABASE_URL_TEST` in a scratch transaction during plan task. If it errors, fall back to "no CHECK, accept the operational risk + rely on `scripts/check-data-layer.ts` audit" — would need a follow-on decision. |
| A8 | `drizzle-kit migrate` against Supabase Direct Connection (port 5432) applies both `0000_initial.sql` and `0001_rls_policies.sql` without issue. The direct connection user `postgres` has BYPASSRLS + has CREATE rights on the public schema. | D-05, Pattern 1 | If GRANT statements need to be issued by a different role (e.g., `supabase_admin`), the migration succeeds for the ALTER but fails for the GRANT, leaving the schema in a partial state. **Mitigation:** Test against `DATABASE_URL_TEST` first. Supabase docs do say "the `postgres` user is a superuser-like role with all privileges in the public schema" — A8 should hold. If not, fall-back is to run the GRANTs via Supabase Dashboard SQL Editor as `supabase_admin`. |

**Note:** A1, A4, A6, A8 are HIGH-confidence (multiple sources + Drizzle docs). A2, A3, A5, A7 are MEDIUM-confidence — operational empirical tests in the verify scripts are the failsafe.

## Open Questions (RESOLVED)

1. **How does Drizzle's `db.transaction()` interact with a pgbouncer Transaction-mode pool when `prepare: false` is set AND `SET LOCAL ROLE` is the first statement?**
   - What we know: Drizzle's `db.transaction()` issues `BEGIN`/`COMMIT` (or `ROLLBACK` on throw). postgres-js with `prepare: false` doesn't use prepared statements. pgbouncer transaction-mode binds the connection to a single transaction.
   - What's unclear: Empirically — does the pool's connection-recycling logic break `SET LOCAL ROLE` semantics in any edge case? The docs say "no, SET LOCAL resets at COMMIT regardless," but I couldn't find a definitive Supabase blog post that confirms this end-to-end with the same query pattern we're using.
   - Recommendation: Pitfall 2's stress-test (100 iterations of cross-org probe) is the empirical answer. Add a load test as part of plan-task acceptance: 1000 sequential `withOrgScope` calls, each with a different `ctx.orgId`, all from the same Node process — assert all 1000 see only their own org's row. This catches pool-recycling bugs.
   - **RESOLVED:** Defer empirical load test to Phase 8 perf pass; D-08 step 4 (L-06 cross-org test) is sufficient evidence for Phase 2 MVP traffic levels (SMB-scale, 25-300 employees). The 1000-iteration stress test recommendation is noted but NOT a Phase 2 blocker. Mitigation acknowledged in CONTEXT deferred items #6 (connection-pool sizing).

2. **Does Drizzle 0.45's TypeScript inference for `Parameters<typeof db.transaction>[0]` produce a usable type for the `tx` parameter in `OrgScope`?**
   - What we know: The CONTEXT `<specifics>` chose `PgTransaction<any, any, any>` and noted "tightening is possible but not Phase-2 critical."
   - What's unclear: Whether `Parameters<typeof db.transaction>[0]` infers cleanly when `db` is typed as `PostgresJsDatabase<typeof schema>`. The drilldown might produce `(tx: PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>) => Promise<T>` — usable but verbose.
   - Recommendation: Try `Parameters<typeof db.transaction>[0]` first in `lib/db/scoped.ts`. If the inferred type is too verbose to re-export cleanly, fall back to the documented `PgTransaction<any, any, any>` with the eslint-disable comment as CONTEXT permits. Either is acceptable per the operator's discretion-granting comment.
   - **RESOLVED:** Default to `PgTransaction<any, any, any>` with the documented `// eslint-disable-next-line` per CONTEXT specifics block #1. Tightening to the inferred type is a Phase 8 refactor candidate, not a Phase 2 blocker. The `any` use is bounded (single eslint-disable line in `lib/db/scoped.ts`) and audited.

3. **Does Clerk send `organizationMembership.created` BEFORE or AFTER the corresponding `user.created` for a brand-new sign-up flow?**
   - What we know: D-03a explicitly assumes ordering is NOT guaranteed and designs around it (nullable `users.org_id` with CHECK constraint).
   - What's unclear: In practice — is there an observed ordering preference? Anecdotally, Clerk webhooks fire in event-occurrence order, but the docs don't guarantee it. The D-03a design holds regardless of ordering, so this is informational.
   - Recommendation: No action needed — D-03a + the stale-null audit handle both orderings. Note for Phase 3+ planners: if Phase-3 features assume `users.org_id IS NOT NULL` for all logged-in users, add a `if (!user.orgId) throw new Error('User org not yet bound — try again in 30s')` guard at the entry point.
   - **RESOLVED:** Ordering is not guaranteed by Clerk and the D-03a nullable `users.org_id` design + the 5-min CHECK constraint + Plan 02-06's Pitfall-5 stale-null audit cover both orderings. Informational only — no Phase 2 action.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22 LTS | ADR-022, `--env-file=.env.local` stable, `tsx` | ✓ | confirmed by Phase 1 (`engines.node: >=22.0.0 <23.0.0`) | — |
| pnpm 9.x | ADR-022, lockfile compat | ✓ | 9.15.9 (per package.json `packageManager`) | — |
| Supabase project (dev) | Drizzle runtime + migrations | ✓ | Phase 1 D-11 wired the dev project; operator created in Plan 01-02 | — |
| Supabase project (test) | `DATABASE_URL_TEST` for `scripts/check-rls.ts` | ✗ | — | Operator manual step: create `policypilot-test` Supabase project (free tier). Documented in CONTEXT.md `<specifics>` operator manual step #4. |
| Clerk dev app | webhook delivery | ✓ | Phase 1 D-11 wired; operator created in Plan 01-02 | — |
| Clerk Dashboard webhook endpoint | for the dev-tunnel URL → /api/webhooks/clerk | ✗ | — | Operator manual step: create endpoint, subscribe to 4 events, copy signing secret to `CLERK_WEBHOOK_SECRET`. Documented in CONTEXT.md operator manual step #3. |
| Clerk Dashboard Organization Roles | for `organizationMembership.created/updated` payload `role` field | ✗ | — | Operator manual step: define `admin`, `reviewer`, `employee` with `employee` as default. Documented in CONTEXT.md operator manual step #1. |
| Clerk Session Token customization | for `sessionClaims.publicMetadata.role` to be populated | ✗ | — | Operator manual step: Sessions → Customize session token → add `"publicMetadata": "{{user.public_metadata}}"`. Documented in CONTEXT.md operator manual step #2. |
| ngrok or Cloudflare Tunnel (dev tunnel for webhooks) | inbound HTTPS to localhost so Clerk Dashboard can POST to `/api/webhooks/clerk` during dev | ✗ | — | Operator manual step or `pnpm dlx ngrok http 3000` — Plan 02-02 (manual-config plan) should call this out. |
| `tsx` | running TypeScript scripts | ✓ | 4.22.0 (Phase 1) | — |

**Missing dependencies with no fallback:**
- Operator manual steps 1–4 + dev tunnel — all required for `pnpm verify:phase-2` to actually exercise the webhook handler end-to-end. Plan-phase should produce a `Plan 02-02 Operator Manual Configuration` (parallel to Phase 1's Plan 01-02) that lists these as a checklist.

**Missing dependencies with fallback:**
- For first-iteration testing WITHOUT a dev tunnel: the webhook handler can be exercised via `curl` with hand-constructed svix headers. This proves the verify-and-dispatch logic but doesn't prove Clerk-to-handler integration. Acceptable Phase-2 fallback if dev-tunnel setup is friction; planner can split into "Plan 02-N integration test (operator-tunneled)" as a follow-up.

## Validation Architecture

> Phase 2 has `nyquist_validation: true` in `.planning/config.json` — this section is REQUIRED. Plan-phase consumes it to scaffold VALIDATION.md.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Pure Node + `tsx` (no jest/vitest yet) — same as Phase 1's `scripts/check-foundation.ts` pattern |
| Config file | none — TS scripts directly executable via `tsx --conditions=react-server --env-file=.env.local <script>` |
| Quick run command | `pnpm typecheck` (≤ 5s) — catches type-test invariants (D-07) |
| Full suite command | `pnpm verify:phase-2` (≤ 60s including DB round-trips) — D-08's six checks |

**Wave 0 gap:** Phase 2 does NOT introduce jest/vitest/playwright. Per CONTEXT D-08 the test surface stays in the `scripts/check-*.ts` script-as-test style for now. Phase 3+ may add a real test framework when UI-level integration tests are warranted.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-multi-tenancy | Org A cannot see Org B data under any code path (REQ §10 #8 + ROADMAP success criterion 5) | property-test (negative) | `pnpm tsx scripts/check-rls.ts` | ❌ Wave 0 (L-06) |
| REQ-multi-tenancy | All 10 tenant-scoped tables have RLS enabled + `org_isolation` policy + GRANT to authenticated | schema-audit | `pnpm tsx scripts/check-schema.ts` | ❌ Wave 0 (D-08 step 5) |
| REQ-multi-tenancy | Every application-layer DB query includes `org_id` in WHERE (via OrgScope-first repositories) | import-graph audit | `pnpm tsx scripts/check-db-imports.ts` | ❌ Wave 0 (L-05) |
| REQ-multi-tenancy | `Acknowledgments` exposes no `update` / no `delete` (ADR-018) | compile-time type test | `pnpm typecheck` (catches `@ts-expect-error` mismatches) | ❌ Wave 0 (D-07: `tests/types.ts`) |
| REQ-multi-tenancy | `Policies.create` input type omits `tldrSummary` (ADR-005) | compile-time type test | `pnpm typecheck` (catches `@ts-expect-error` mismatches) | ❌ Wave 0 (D-07) |
| REQ-user-roles | `getOrgContext()` returns `{ orgId, userId, role }` for a valid Clerk session; throws on missing | unit-script | `pnpm tsx scripts/check-data-layer.ts` (smoke) | ❌ Wave 0 (`scripts/check-data-layer.ts`) |
| REQ-user-roles | Clerk webhook creates org row on `organization.created`; user row on `user.created`; updates role on `organizationMembership.created/updated` | manual + integration | Operator: trigger a Clerk Dashboard test event for each of the 4 types; observe row insertion via Supabase SQL Editor `SELECT * FROM organizations; SELECT * FROM users` | ❌ Wave 0 (operator manual — VALIDATION.md should list 4 events × expected row outcome) |
| REQ-user-roles | Idempotency: replaying the same Clerk event ID does NOT double-write | manual + integration | Operator: replay a webhook event from Clerk Dashboard; observe no duplicate row + `SELECT count(*) FROM clerk_events WHERE id = '<svix-id>'` returns 1 | ❌ Wave 0 (operator manual) |
| ADR-022 (Node 22 + `--env-file`) | All Phase-2 scripts run under Node 22 with `--env-file=.env.local` | smoke (transitively, every other check) | `pnpm verify:phase-2` (top-level) | ✓ (Phase 1 — `pnpm verify:phase-1` is the analog) |

### Sampling Rate

- **Per task commit:** `pnpm typecheck` — runs on every save in Cursor/VS Code anyway via TS server; explicit command should run ≤ 5s and gate every git commit (pre-commit hook in Phase 7+).
- **Per wave merge:** `pnpm verify:phase-2` — six-check chain (D-08). Run after every plan task completes. Includes DB migration apply against `DATABASE_URL_TEST` (one-time bootstrap on first run, no-op afterwards).
- **Phase gate:** `pnpm verify:phase-2` green before `/gsd:verify-work` is invoked. Operator additionally runs the 4 manual integration tests for REQ-user-roles webhook events.

### Wave 0 Gaps

- [ ] `scripts/check-rls.ts` — L-06, covers REQ-multi-tenancy (cross-org leak negative test)
- [ ] `scripts/check-schema.ts` — D-08 step 5, covers REQ-multi-tenancy (RLS + GRANT positive audit)
- [ ] `scripts/check-db-imports.ts` — L-05, covers REQ-multi-tenancy (import-graph allow-list)
- [ ] `scripts/check-data-layer.ts` (or extension to `check-foundation.ts`) — D-08 orchestrator + smoke checks for `getOrgContext()` + the stale-null audit (Pitfall 5)
- [ ] `tests/types.ts` — D-07, covers ADR-018 + ADR-005 invariants via `@ts-expect-error`
- [ ] No framework install needed — Phase-1 has `tsx` already
- [ ] Operator-manual checklist for the 4 Clerk webhook events + idempotency replay — should live in VALIDATION.md (scaffolded from this section)

### Negative-Case Coverage Map (the rule "RLS fires" needs both positive AND negative assertions)

| Invariant | Positive case | Negative case | Both required? |
|-----------|--------------|---------------|----------------|
| RLS on `policies` fires for org boundaries | OrgA's user sees orgA rows (assert count > 0) | OrgA's user sees zero orgB rows | YES — without positive control, the test could be "everything returns 0 rows because GRANT is missing." |
| `org_isolation` policy exists for all 10 tables | `SELECT polname FROM pg_policies WHERE tablename = '<t>'` returns 1 row | `SELECT polname FROM pg_policies WHERE tablename = '<t>' AND polname = 'org_isolation'` matches expected | scripts/check-schema.ts does this; positive-only is sufficient because the negative is "policy missing → assertion fails." |
| GRANT TO authenticated includes all 4 verbs | `SELECT privilege_type FROM information_schema.table_privileges WHERE grantee = 'authenticated' AND table_name = '<t>'` returns 4 rows | If any of SELECT/INSERT/UPDATE/DELETE missing, the count is < 4 | YES — and the check must report which verb is missing. |
| Raw `db` import allow-list | All 4 allow-listed files compile and have the import | No other file has the import | YES — L-05 must scan both directions; the script should report "found legitimate imports in 4 allow-listed files (positive control)" + "found 0 violations (negative)." |
| Acknowledgments has no update/delete | `@ts-expect-error` flags `void Acknowledgments.update` (compile error → test passes) | If someone ADDS update, `@ts-expect-error` becomes spurious → tsc fails | NEGATIVE-only via TS — the positive direction (proving the method exists nowhere) is implicit in the type definition. |
| `getOrgContext()` throws on missing org | `await getOrgContext()` resolves cleanly when org is set | `await getOrgContext()` throws when org is null | YES — scripts/check-data-layer.ts smoke can use a fixture session for the positive; manual operator test for the negative. |
| Idempotency on webhook | First delivery of an event ID INSERTs the row | Second delivery of the same event ID does NOT INSERT (ON CONFLICT DO NOTHING returns 0 rows) | YES — operator manual integration test. |

## Security Domain

> `security_enforcement` not explicitly set in config; defaults to enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Clerk handles all auth flows (ADR-012). Phase 2 reads the verified session via `auth()` from `@clerk/nextjs/server`. No hand-rolled auth. |
| V3 Session Management | yes | Clerk owns session JWTs + refresh. Phase 2 reads `sessionClaims` only (no session creation/destruction). |
| V4 Access Control | yes (core to phase) | The OrgScope + repository + RLS triple-layer is the access-control mechanism. ADR-019 (org_id in every query) + ADR-023 (per-aggregate repositories) + ADR-025 (RLS per-tx injection). |
| V5 Input Validation | partial | Phase 2 ships skeleton repositories whose bodies are stubs (D-06). Real input validation (zod / Drizzle's `$inferInsert` narrowing) lands when the bodies fill in (Phase 3+). The Clerk webhook handler validates payload shape via the `WebhookEvent` type (svix.verify returns it). |
| V6 Cryptography | yes | svix.Webhook.verify handles all crypto (HMAC-SHA-256 + timestamp tolerance + constant-time compare). DO NOT hand-roll. |
| V7 Error Handling | yes | `getOrgContext()` + `withOrgScope` throw structured errors. Middleware try/catch (SF-M4 fold) catches `auth()` failures and redirects. Webhook handler returns 400 on bad signature, 200 on duplicate (idempotency). |
| V8 Data Protection | yes (RLS is the mechanism) | RLS on every tenant-scoped table. ADR-018 append-only on acknowledgments. `users.deletedAt` etc. deferred to Phase 7. |
| V9 Communications | yes | Supabase requires TLS for all connections (port 5432/6543 require sslmode); postgres-js handles this automatically when URL includes `?sslmode=require`. Clerk webhooks delivered over HTTPS. |
| V13 API Security | yes (`/api/webhooks/clerk`) | svix signature verification = HMAC-authenticated webhook. No auth header. Idempotency via `clerk_events`. |
| V14 Configuration | yes | `.env.local` gitignored (T-01-02 from Phase 1). `.env.local.example` has no values. Phase 2 adds three new keys to the example (DIRECT_URL, DATABASE_URL_TEST, DIRECT_URL_TEST) and re-runs the Phase-1 leak check. |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant data leak (REQ-multi-tenancy #1) | Information Disclosure | OrgScope-first repositories + per-tx JWT injection + RLS on every tenant-scoped table. Verified by L-05 (import allow-list) + L-06 (cross-org property test). |
| Webhook signature forgery | Spoofing | svix.Webhook.verify with `CLERK_WEBHOOK_SECRET` from env (gitignored .env.local). |
| Webhook replay attack | Repudiation / Tampering | svix includes svix-timestamp; svix.verify rejects timestamps outside a 5-minute window by default. Additionally, idempotency via `clerk_events` table — replay of the same svix-id is a no-op. |
| SQL injection via JWT claim injection | Tampering | `set_config('request.jwt.claims', ${claims}, true)` — `${claims}` is a parameter binding in Drizzle's `sql` template (NOT string interpolation). The JSON.stringify output is a parameterized value. |
| Session-claim leak across pool connections | Information Disclosure | `is_local=true` (third arg to `set_config`) — Pitfall 2. |
| Cross-site request forgery on webhook endpoint | Spoofing | Webhook endpoint is exempt from auth (middleware bypass) but requires svix-signature header that only Clerk can produce. CSRF is moot — there's no session cookie to abuse. |
| Stale half-bound user row (D-03a transient null becomes permanent) | Denial of Service (partial — user can't act) | `scripts/check-data-layer.ts` audit query for `users WHERE org_id IS NULL AND created_at < now() - interval '5 minutes'` (Pitfall 5). |
| Service-role connection used from feature code | Elevation of Privilege | L-05 import allow-list — the `db` (BYPASSRLS) export cannot be imported outside the 4 allow-listed files. CI gate. |
| Missing GRANT on a table → RLS-eligible query returns permission-denied (looks like RLS broken) | DoS via misconfiguration | L-04 + D-08 step 5 `scripts/check-schema.ts` audits `information_schema.table_privileges`. |

## Sources

### Primary (HIGH confidence)

- **postgresql.org/docs/current/functions-admin.html** — `set_config(setting_name, new_value, is_local)`: "If is_local is true, the new value will only apply during the current transaction." Quoted verbatim.
- **postgresql.org/docs/current/sql-set.html** — `SET LOCAL`: "The effects of SET LOCAL last only till the end of the current transaction, whether committed or not." "The function set_config provides equivalent functionality."
- **CONTEXT.md (this phase)** — six USER-LOCKED deliverables + nine HOW decisions + the `<specifics>` exact-body for `withOrgScope` and `getOrgContext`.
- **ADR-023, ADR-024, ADR-025** in `.planning/PROJECT.md` `<decisions>` — full locked text on the per-aggregate repository pattern, middleware procedural style, and RLS per-tx JWT injection.
- **reference/SCHEMA.md** — frozen Drizzle schema + RLS pattern.
- **Phase 1 lockfile + scripts** — `package.json`, `lib/db/index.ts`, `middleware.ts`, `scripts/check-foundation.ts`, `scripts/check-artifacts.ts`, `scripts/check-db.ts` — the working analogs Phase 2 extends.
- **npm view** for all package versions (drizzle-orm 0.45.2, drizzle-kit 0.31.10, svix 1.93.0, @clerk/nextjs 7.3.5, ts-morph 28.0.0, @typescript-eslint/parser 8.59.3) — 2026-05-17 confirmed.
- **slopcheck install svix ts-morph drizzle-orm drizzle-kit @clerk/nextjs postgres** — all six packages returned [OK] on 2026-05-17 (the post-scan install failure was due to slopcheck attempting `npm install` which is irrelevant; the scan itself completed).

### Secondary (MEDIUM confidence)

- **orm.drizzle.team/docs/rls** — Drizzle's RLS docs (`pgPolicy` API surface). Confirms hand-written SQL path is supported alongside the inline pgPolicy approach.
- **orm.drizzle.team/docs/drizzle-kit-generate** — `drizzle-kit generate --custom --name=<name>` produces empty migration file. Confirms the documented two-step generate pattern for Phase-2.
- **orm.drizzle.team/docs/transactions** — Drizzle `db.transaction()` behavior. Confirms BEGIN/COMMIT semantics and ROLLBACK-on-throw.
- **orm.drizzle.team/docs/connect-supabase** — Drizzle's Supabase integration page. Confirms `prepare: false` for Transaction pooler.
- **supabase.com/docs/guides/database/connecting-to-postgres** — port 5432 vs 6543, Direct vs Transaction pooler, "Use for migrations, pg_dump, backup and management tools" with direct.
- **supabase.com/docs/guides/database/postgres/row-level-security** — `auth.jwt()` definition; `authenticated` role; BYPASSRLS noted on default postgres user.
- **docs.svix.com/receiving/verifying-payloads/how** — `Webhook.verify(payload, headers)` API; three header names; raw-bytes requirement.
- **clerk.com/docs/guides/development/webhooks/overview** — confirms svix as Clerk's signing standard (no version pin recommended by Clerk; we choose 1.93).
- **clerk.com/blog/webhooks-getting-started** — App Router code example showing `request.text()` + headers extraction + Webhook.verify.
- **svix.com/guides/receiving/receive-webhooks-with-javascript-nextjs/** — full Next.js webhook handler skeleton including error response status (400 on verify failure).
- **github.com/orgs/supabase/discussions/30124** — community pattern for role impersonation via `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ...)`. Confirms is_local must be `true`.

### Tertiary (LOW confidence — surfaced for awareness)

- **github.com/drizzle-team/drizzle-orm/issues/3504** — bug report: `drizzle-kit push` doesn't apply RLS policies; `generate` + `migrate` does. Independently validates D-01 choice. Issue is "fixed in beta" per the report — confirm before relying on `push` ever (we don't; D-01 chose `migrate`).
- **github.com/PostgREST/postgrest/discussions/2291** — community thread on `set_config('request.jwt.claims', ..., true)` — independent confirmation of the is_local=true pattern from the PostgREST ecosystem (different but parallel use case).
- **dev.to article on Clerk webhooks** — shows a HAND-ROLLED HMAC pattern that is WRONG (no timestamp tolerance, no constant-time compare). Explicitly DO NOT FOLLOW. Cited only as a warning.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions confirmed via npm registry + slopcheck OK + cross-referenced against Phase 1 lockfile.
- Architecture: HIGH — every pattern traces to a published docs page (Drizzle, Supabase, Postgres, svix) or a locked ADR.
- Pitfalls: HIGH-MEDIUM — Pitfalls 1, 2, 3, 4 are documented in source citations. Pitfall 5 (stale CHECK constraint behavior) is inferred from PG docs ("CHECK constraints cannot reference functions whose result depends on data outside the row" + STABLE-function caveat); the failure mode is mitigated by explicit audit. Pitfall 6 is structural (repository pattern enforcement).
- Validation Architecture: HIGH — direct map from D-08 six-check structure to the requirements; negative-case map ties to L-06's existing design.
- Security Domain: HIGH — ASVS categories map cleanly; threat model is the union of CONTEXT decisions and ADR-019/023/025.

**Research date:** 2026-05-17
**Valid until:** 2026-06-16 (30 days — Drizzle ORM 0.45/0.46 boundary in active development; svix 1.93 stable; Supabase Transaction pooler API stable since 2022; Clerk webhook signing standard stable since 2021)
