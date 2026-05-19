# Phase 2: Data Layer - Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 21 (16 new + 5 modified)
**Analogs found:** 18 / 21
**Phase 1 plan structure analogs:** 5 (01-01 through 01-05 PLAN.md)

## File Classification

### New Files

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `lib/db/schema.ts` (populate) | model (Drizzle schema) | static-DDL | `reference/SCHEMA.md` (contract); current empty `lib/db/schema.ts` | spec-only (no real code analog) |
| `lib/db/scoped.ts` | service (transaction wrapper) | request-response | `lib/db/index.ts` (`'server-only'` + drizzle client pattern) | role-match |
| `lib/auth/context.ts` | service (auth context) | request-response | `lib/db/index.ts` (`'server-only'` + env-validation pattern); `middleware.ts:51-54` (sessionClaims narrowing) | role-match |
| `lib/db/repositories/policies.ts` | repository (CRUD-aggregate) | request-response | `lib/db/index.ts` (`'server-only'` + schema import) | role-match (skeleton) |
| `lib/db/repositories/policy_versions.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/policy_assignments.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/acknowledgments.ts` | repository (append-only) | request-response | same (with ADR-018 typing constraints) | role-match |
| `lib/db/repositories/users.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/departments.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/ai_generations.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/notifications.ts` | repository | request-response | same | role-match |
| `lib/db/repositories/workflow_stages.ts` | repository | request-response | same | role-match |
| `app/api/webhooks/clerk/route.ts` | route handler (webhook) | event-driven (svix) | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` (Clerk import shape); no existing API route analog | partial (Clerk usage only) |
| `drizzle/0000_initial.sql` | migration (generated DDL) | static-DDL | (none — drizzle-kit generates) | tool-generated |
| `drizzle/0001_rls_policies.sql` | migration (hand-written DDL) | static-DDL | `reference/SCHEMA.md` lines 126-142 (RLS pattern) | spec-only |
| `scripts/check-db-imports.ts` | utility (CI gate, AST walker) | batch | `scripts/check-artifacts.ts` (server-only-boundary walker at lines 646-717) | exact (extension of same pattern) |
| `scripts/check-rls.ts` | utility (cross-org property test) | request-response | `scripts/check-db.ts` (postgres-js round-trip with error reporting) | role-match |
| `scripts/check-schema.ts` | utility (DB audit) | request-response | `scripts/check-db.ts` (same connection pattern + pg_catalog queries) | role-match |
| `scripts/check-data-layer.ts` | orchestrator | batch | `scripts/check-foundation.ts` (Result[] accumulator + spawnSync) | **exact** |
| `tests/types.ts` | type-test | static-DDL | (none — `@ts-expect-error` pattern is new) | new pattern |

### Modified Files

| Modified File | Role | Data Flow | Existing Pattern Source |
|---------------|------|-----------|-------------------------|
| `drizzle.config.ts` | config | static-DDL | self (D-05 fallback adds DIRECT_URL + console.warn) |
| `middleware.ts` | middleware | request-response | self (lines 36-77; add try/catch around `await auth()` per SF-M4) |
| `scripts/check-artifacts.ts` | utility | batch | self (add Phase 2 artifact assertions to existing structure) |
| `package.json` | config | static-config | self (add `db:generate`, `db:migrate`, `db:migrate:test`, `verify:phase-2`) |
| `.env.local.example` | config | static-config | self (add `DIRECT_URL=`, `DATABASE_URL_TEST=`, `DIRECT_URL_TEST=`) |

---

## Pattern Assignments

### `lib/db/scoped.ts` (service, request-response)

**Analog:** `lib/db/index.ts`

**Imports pattern** (from `lib/db/index.ts:1-6`):
```typescript
// Server-only. Do NOT import from a Client Component — this module reads
// server-only env vars (DATABASE_URL) and instantiates a Postgres connection.
import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
```

**Pattern to mirror for `lib/db/scoped.ts`** (exact body from CONTEXT.md `<specifics>` block — transcribed from ADR-025):
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

**Notes for planner:**
- The `PgTransaction<any, any, any>` generic uses `any` — suppress with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment pointing to this CONTEXT entry. CLAUDE.md NEVER #4 (no `any`) is intentionally bent here for Drizzle's transaction type. Alternative: use `Parameters<typeof db.transaction>[0]` inferred type.
- `'server-only'` guard is mandatory — mirrors `lib/db/index.ts:3`.
- Imports `db` from `@/lib/db` — this is allow-listed because `lib/db/scoped.ts` is itself part of the secured channel.

---

### `lib/auth/context.ts` (service, request-response)

**Analog:** `lib/db/index.ts` (server-only + throw-on-missing pattern) + `middleware.ts:51-54` (sessionClaims narrowing)

**Imports pattern** (mirror `lib/db/index.ts:3`):
```typescript
import "server-only";
```

**Auth claim narrowing pattern** (from `middleware.ts:51-53`):
```typescript
const { sessionClaims } = await auth();
const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
```

**Exact body for `lib/auth/context.ts`** (from CONTEXT.md `<specifics>` block, includes SF-M4 try/catch fold):
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

**Notes for planner:**
- The `try/catch` around `await auth()` is the SF-M4 fold. The error-message shape `${err.name}: ${err.message}` mirrors `scripts/check-db.ts:22-24`.
- The `as { role?: unknown } | undefined` cast matches the `middleware.ts:52` narrowing style. CLAUDE.md "code-reviewer nits" notes this same pattern is in middleware:75 — Phase 2 carries forward both call sites with `unknown` (slightly stricter than middleware's current `string` cast).

---

### `lib/db/schema.ts` (model, static-DDL)

**Analog:** `reference/SCHEMA.md` (contract) — currently `export {}` in `lib/db/schema.ts`

**Pattern to mirror — table definition** (from `reference/SCHEMA.md:11-37`):
```typescript
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

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

**Schema amendment for D-02 (`org_id` denormalization)** — apply to `policy_versions`, `policy_assignments`, `acknowledgments`, `notifications`, `workflow_stages`:
```typescript
export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id), // <-- ADDED per D-02
  policyId: uuid('policy_id').notNull().references(() => policies.id),
  // ... rest unchanged
})
```

**Schema deviation for D-03a (`users.org_id` nullable)**:
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id), // <-- nullable per D-03a (was NOT NULL)
  // ... rest unchanged
})
// + CHECK constraint in 0001_rls_policies.sql:
// CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes')
```

**New `clerk_events` table (D-03b)** — alphabetical placement near `stripe_events`:
```typescript
export const clerkEvents = pgTable('clerk_events', {
  id: text('id').primaryKey(),           // svix-msg-id from Clerk
  processedAt: timestamp('processed_at').defaultNow(),
})
```

---

### `lib/db/repositories/policies.ts` (repository, request-response — SKELETON)

**Analog:** `lib/db/index.ts` (server-only + schema import)

**Imports pattern** (server-only + Drizzle helpers):
```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policies } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
```

**Core repository pattern** (from CONTEXT.md `<decisions>` D-06):
```typescript
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

**ADR-018 / ADR-005 invariant enforcement notes:**
- `Acknowledgments` repo MUST NOT export `update` or `delete` keys (even as stubs) — type system enforces append-only.
- `Policies.create` input type uses `Omit<..., 'tldrSummary'>` — TS rejects calls passing `tldrSummary`.

---

### `lib/db/repositories/acknowledgments.ts` (repository, append-only)

**Analog:** Same pattern as `policies.ts` BUT with ADR-018 constraints

**Pattern (from CONTEXT.md D-06):**
```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { acknowledgments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export const Acknowledgments = {
  listForUser: (s: OrgScope, userId: string) =>
    s.tx.select().from(acknowledgments)
      .where(and(eq(acknowledgments.orgId, s.orgId), eq(acknowledgments.userId, userId))),
  record: (s: OrgScope, input: { /* ... */ }) => {
    throw new Error('Not yet implemented — Phase 5 (Employee Portal)');
  },
  // NO update, NO delete — type system enforces ADR-018 append-only.
};
```

---

### `app/api/webhooks/clerk/route.ts` (route handler, event-driven)

**Analog:** No existing API route in the codebase. The closest Clerk-using file is `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, but the import surface (server-side webhook) differs.

**Pattern to follow (synthesized from D-03, ADR-023 allow-list entry #1):**

**Imports pattern** (Next.js 15 App Router route handler):
```typescript
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { db } from '@/lib/db';  // raw db — ALLOWED per ADR-023 (allow-list entry #1)
import { organizations, users, clerkEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
```

**svix signature verification + idempotency pattern (D-03b):**
```typescript
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('CLERK_WEBHOOK_SECRET not set', { status: 500 });
  }

  const hdrs = await headers();
  const svixId = hdrs.get('svix-id');
  const svixTimestamp = hdrs.get('svix-timestamp');
  const svixSignature = hdrs.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const body = await req.text();
  let event;
  try {
    event = new Webhook(secret).verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  // Idempotency — D-03b
  const inserted = await db
    .insert(clerkEvents)
    .values({ id: svixId })
    .onConflictDoNothing()
    .returning({ id: clerkEvents.id });
  if (inserted.length === 0) {
    return new Response('Already processed', { status: 200 });
  }

  // Dispatch on event.type — D-03 handles four events
  switch (/* event.type */ 'organization.created') {
    case 'organization.created': /* INSERT organizations */ break;
    case 'user.created': /* INSERT users (org_id may be null per D-03a) */ break;
    case 'organizationMembership.created': /* UPSERT users with org_id + role */ break;
    case 'organizationMembership.updated': /* UPDATE users.role */ break;
    // Delete events: log to clerk_events, no mutation per D-03c
  }

  return new Response('OK', { status: 200 });
}
```

**Notes:**
- This file is **explicitly allow-listed** to import raw `db` per ADR-023.
- `scripts/check-db-imports.ts` must include this file path in its `ALLOWLIST`.
- Phase 2 emits `console.log` for now (D-08 Discretion); structured logging is Phase 7+.
- Middleware already exempts `/api/webhooks/clerk` (verified at `middleware.ts:23-26`).

---

### `scripts/check-data-layer.ts` (orchestrator, batch) — **EXACT match analog available**

**Analog:** `scripts/check-foundation.ts` (the entire file structure carries forward)

**Result accumulator pattern** (from `scripts/check-foundation.ts:15-21`):
```typescript
type Result = { ok: boolean; label: string; detail?: string };

function logResult(idx: number, total: number, r: Result): void {
  const status = r.ok ? "OK  " : "FAIL";
  const detail = r.detail ? ` — ${r.detail}` : "";
  console.log(`[${idx}/${total}] ${status} — ${r.label}${detail}`);
}
```

**spawnSync hardened pattern (CVE-2024-27980 mitigation) — copy verbatim** (`scripts/check-foundation.ts:8-13`):
```typescript
// CVE-2024-27980: spawning .cmd/.bat with `shell:false` errors on Node
// 20.12.2+. Route through `process.execPath` + the tool's JS entry so
// argv stays static and `shell:false` holds.
const NODE_BIN = process.execPath;
const TSC_ENTRY = resolvePath(process.cwd(), "node_modules/typescript/bin/tsc");
const TSX_ENTRY = resolvePath(process.cwd(), "node_modules/tsx/dist/cli.mjs");
```

**Child-process invocation pattern** (`scripts/check-foundation.ts:123-152`):
```typescript
function checkSelectOne(): Result {
  // Delegate to `scripts/check-db.ts` so the `server-only` guard on
  // `lib/db/index.ts` stays intact — `--conditions=react-server` is
  // applied in the child only.
  const result = spawnSync(
    NODE_BIN,
    [
      TSX_ENTRY,
      "--conditions=react-server",
      "--env-file=.env.local",
      "scripts/check-db.ts",
    ],
    {
      encoding: "utf8",
      shell: false,
    },
  );
  if (result.status === 0) {
    return { ok: true, label: "Drizzle select 1 round-trip" };
  }
  const detail = firstNonEmptyLine(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
  return {
    ok: false,
    label: "Drizzle select 1 round-trip",
    detail: detail || `check:db exited ${result.status ?? "unknown"}`,
  };
}
```

**firstNonEmptyLine for terse error reporting** (`scripts/check-foundation.ts:26-28`):
```typescript
// Callers concat stderr first, then stdout (`${stderr}\n${stdout}`) so the
// "first non-empty line" deterministically favours stderr when both produce
// output — keeps failure summaries terse and ordered by likely-cause.
function firstNonEmptyLine(s: string): string {
  return s.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}
```

**Main entry pattern** (`scripts/check-foundation.ts:154-225`):
```typescript
async function main(): Promise<void> {
  console.log("─── Data Layer — verification ───");
  console.log("");

  const results: Result[] = [];
  // ... push each check result, log with logResult(idx, total, c)

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} of ${results.length} checks FAILED.`);
    for (const f of failed) {
      console.error(`  - ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
    }
    process.exit(1);
  }
  console.log(`✓ All ${results.length} checks passed.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
```

---

### `scripts/check-rls.ts` (utility, request-response)

**Analog:** `scripts/check-db.ts` (postgres-js round-trip + error reporting pattern)

**Error handling pattern** (from `scripts/check-db.ts:5-28`):
```typescript
async function main(): Promise<void> {
  try {
    // ... do work
    console.log("OK");
    process.exit(0);
  } catch (err) {
    console.error(
      `Drizzle smoke check failed: ${
        err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      }`,
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
```

**Pattern to extend for cross-org property test** (synthesized from CONTEXT.md `<specifics>`):
```typescript
import postgres from "postgres";
import { sql as drizzleSql } from "drizzle-orm";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.error("DATABASE_URL_TEST not set");
    process.exit(1);
  }
  // Connect at connection-level postgres (BYPASSRLS) to seed
  const client = postgres(url, { prepare: false });
  try {
    // 1. Truncate + seed two orgs (orgA, orgB)
    // 2. BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', orgA-json, true)
    // 3. For each of 10 tenant-scoped tables: SELECT * WHERE org_id = orgB.id; assert empty
    // 4. ROLLBACK
    const TENANT_TABLES = [
      'organizations', 'users', 'departments', 'policies', 'policy_versions',
      'policy_assignments', 'acknowledgments', 'ai_generations',
      'notifications', 'workflow_stages',
    ];
    // ... iterate, accumulate leaks
    console.log("OK");
    process.exit(0);
  } catch (err) {
    console.error(
      `RLS property test failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
```

---

### `scripts/check-schema.ts` (utility, request-response)

**Analog:** `scripts/check-db.ts` (same connection pattern, different SQL)

**Pattern** (same imports as check-rls.ts, but reads pg_catalog + information_schema):
```typescript
const TENANT_SCOPED_TABLES = [/* 10 tables */];

for (const table of TENANT_SCOPED_TABLES) {
  // SELECT 1 FROM pg_tables WHERE tablename = $1
  // SELECT relrowsecurity FROM pg_class WHERE relname = $1
  // SELECT policyname FROM pg_policies WHERE tablename = $1 AND policyname = 'org_isolation'
  // SELECT privilege_type FROM information_schema.table_privileges
  //   WHERE table_name = $1 AND grantee = 'authenticated'
  //   AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
}
```

---

### `scripts/check-db-imports.ts` (utility, batch — AST walker)

**Analog:** `scripts/check-artifacts.ts:646-717` (the `checkServerOnlyBoundary` function — already does the regex-grep version of this exact check for `from "@/lib/db"`)

**Existing regex-grep pattern (extend with AST per D-08 Discretion):**
```typescript
// scripts/check-artifacts.ts:646-717 — current pattern
function checkServerOnlyBoundary(): Check[] {
  const out: Check[] = [];
  const result = spawnSync(
    "node",
    [
      "-e",
      `const fs = require('node:fs'); const path = require('node:path');
       const SKIP = new Set(['node_modules','.next','.git','.planning','.wiki','docs','reference','drizzle']);
       const hits = [];
       function walk(dir) {
         for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
           if (SKIP.has(entry.name)) continue;
           const full = path.join(dir, entry.name);
           if (entry.isDirectory()) { walk(full); continue; }
           if (!/\\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) continue;
           const content = fs.readFileSync(full, 'utf8');
           if (content.includes('from "@/lib/db"') || content.includes("from '@/lib/db'")) {
             hits.push(full.replace(/\\\\/g, '/'));
           }
         }
       }
       walk('.');
       console.log(hits.join('\\n'));`,
    ],
    { encoding: "utf8", cwd: REPO_ROOT, shell: false },
  );
  // ... allowlist check
}
```

**Phase 2 should:** Either replace this regex with `@typescript-eslint/parser` AST walk OR keep the regex form and grow the `allowed` Set to the four ADR-023 allow-listed paths:
```typescript
const ALLOWLIST = [
  'app/api/webhooks/clerk/route.ts',
  'app/api/webhooks/stripe/route.ts',     // Phase 6 — absence OK
  'app/api/cron/*/route.ts',              // Phase 7 — pattern match
  'tests/**/*.ts',                        // Phase 8 test harness
  'scripts/check-rls.ts',                 // Phase 2 — verify gate
  'scripts/check-schema.ts',              // Phase 2 — verify gate
  'scripts/check-artifacts.ts',           // existing
  'scripts/check-db.ts',                  // existing
  'lib/db/scoped.ts',                     // Phase 2 — wraps db in withOrgScope
];
```

D-08 recommends AST via `ts-morph` (chosen over `@typescript-eslint/parser` for cleaner import-graph API per RESEARCH recommendations; Plan 02-06 ships `ts-morph@28.0.0`).

---

### `drizzle/0001_rls_policies.sql` (migration, static-DDL)

**Analog:** `reference/SCHEMA.md:126-142` (RLS pattern spec)

**Pattern to follow** (from SCHEMA.md):
```sql
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON organizations
  FOR ALL USING (id = auth.jwt()->>'org_id');

ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON policies
  FOR ALL USING (org_id = auth.jwt()->>'org_id');
-- ... repeat for: users, departments, policy_versions, policy_assignments,
-- acknowledgments, ai_generations, notifications, workflow_stages

-- L-04: GRANTs required for RLS-as-authenticated to work
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON policies TO authenticated;
-- ... repeat for all 10 tenant-scoped tables

-- D-03a: users.org_id CHECK (nullable for unmapped membership window)
ALTER TABLE users
  ADD CONSTRAINT users_org_id_required_after_5min
  CHECK (org_id IS NOT NULL OR created_at > now() - interval '5 minutes');

-- stripe_events: NO RLS (service role only)
-- clerk_events: NO RLS (service role only — same as stripe_events)
```

---

### `tests/types.ts` (type-test) — **NEW PATTERN**

No existing analog in codebase. CONTEXT.md D-07 provides the exact body:
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

`tsc --noEmit` fails if any `@ts-expect-error` is no longer an error (i.e., invariant broken).

---

### `drizzle.config.ts` (MODIFIED — D-05 fallback)

**Self-analog:** Current `drizzle.config.ts:1-17` already uses `DATABASE_URL` + `satisfies Config`.

**Existing pattern (`drizzle.config.ts:1-17`):**
```typescript
import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. Set it in .env.local per D-11.",
  );
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
} satisfies Config;
```

**Phase 2 amendment (D-05 fallback):**
```typescript
const directUrl = process.env.DIRECT_URL;
const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = directUrl ?? databaseUrl;

if (!directUrl && databaseUrl) {
  console.warn(
    'DIRECT_URL not set; falling back to DATABASE_URL for migrations. ' +
      'Migrations over a pgbouncer pool may fail on some DDL.',
  );
}
if (!migrationUrl) {
  throw new Error(
    "DIRECT_URL or DATABASE_URL must be set for drizzle-kit. See D-05.",
  );
}
// ... rest same, dbCredentials: { url: migrationUrl }
```

---

### `middleware.ts` (MODIFIED — SF-M4 fold)

**Self-analog:** Current `middleware.ts:36-77`.

**Existing pattern (`middleware.ts:50-58`)** — needs try/catch wrap:
```typescript
if (isAdminRoute(req)) {
  const { sessionClaims } = await auth();  // <-- needs try/catch (SF-M4)
  const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
  // ...
}

const { userId } = await auth();  // <-- also needs try/catch (SF-M4)
```

**Phase 2 amendment (mirror `getOrgContext()` try/catch from `lib/auth/context.ts`):**
```typescript
let session;
try {
  session = await auth();
} catch (err) {
  // Auth failed — fail-closed: redirect to sign-in
  const signInUrl = new URL("/sign-in", req.url);
  return NextResponse.redirect(signInUrl);
}
```

---

## Shared Patterns

### Server-only Guard

**Source:** `lib/db/index.ts:3`
**Apply to:** `lib/db/scoped.ts`, `lib/auth/context.ts`, all 9 `lib/db/repositories/*.ts`, all 4 `scripts/check-*.ts` (Phase 2)
```typescript
import "server-only";
```

**Why:** Triggers build-time error if Client Component imports — first line of defense for DATABASE_URL + DB connection isolation.

---

### Throw-on-Missing-Env

**Source:** `lib/db/index.ts:8-14`, `drizzle.config.ts:3-8`
**Apply to:** `scripts/check-rls.ts`, `scripts/check-schema.ts` (validate `DATABASE_URL_TEST` / `DIRECT_URL_TEST`)
```typescript
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.local.example to .env.local and " +
      "paste the Supabase Transaction pooler URI (port 6543) per D-06.",
  );
}
```

---

### Error Reporting (terse + actionable)

**Source:** `scripts/check-db.ts:21-25`
**Apply to:** `scripts/check-rls.ts`, `scripts/check-schema.ts`, `app/api/webhooks/clerk/route.ts`
```typescript
catch (err) {
  console.error(
    `<context-prefix> failed: ${
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    }`,
  );
  process.exit(1);
}
```

**Why:** Surfaces `${err.name}: ${err.message}` (e.g., `PostgresError: <msg>`) — strictly more informative than `err.constructor.name` (closed by C-1 in commit 764df7a).

---

### Postgres Connection (Transaction Pooler)

**Source:** `lib/db/index.ts:19`
**Apply to:** `lib/db/scoped.ts` (re-uses `db` from index.ts), `scripts/check-rls.ts` (when connecting to TEST URL)
```typescript
const client = postgres(connectionString, { prepare: false });
```

**Why:** Supabase Transaction pooler (port 6543) does not support prepared statements. `prepare: false` is non-negotiable per D-06 / D-05.

---

### Result[] Accumulator (orchestrator scripts)

**Source:** `scripts/check-foundation.ts:15-21, 159-217`
**Apply to:** `scripts/check-data-layer.ts` (or extend `scripts/check-foundation.ts`)
```typescript
type Result = { ok: boolean; label: string; detail?: string };

const results: Result[] = [];
// ... push results

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`✗ ${failed.length} of ${results.length} checks FAILED.`);
  for (const f of failed) {
    console.error(`  - ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
  }
  process.exit(1);
}
console.log(`✓ All ${results.length} checks passed.`);
process.exit(0);
```

---

### spawnSync via process.execPath (CVE-2024-27980 mitigation)

**Source:** `scripts/check-foundation.ts:8-13, 30-44, 123-152`
**Apply to:** `scripts/check-data-layer.ts` when spawning child verifiers
```typescript
const NODE_BIN = process.execPath;
const TSX_ENTRY = resolvePath(process.cwd(), "node_modules/tsx/dist/cli.mjs");

const result = spawnSync(
  NODE_BIN,
  [TSX_ENTRY, "--conditions=react-server", "--env-file=.env.local", "scripts/check-rls.ts"],
  { encoding: "utf8", shell: false },
);
```

**Why:** `shell: false` + static argv dodges CVE-2024-27980 (Node 20.12.2+ rejects `shell: false` for `.cmd`/`.bat`). The `--conditions=react-server` flag is mandatory when spawning a `server-only`-guarded script.

---

### tsx --env-file=.env.local Pattern

**Source:** `package.json:15-17`
**Apply to:** new scripts in `package.json`:
```json
"db:generate": "tsx --env-file=.env.local node_modules/drizzle-kit/bin.cjs generate",
"db:migrate": "tsx --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate",
"db:migrate:test": "tsx --env-file=.env.local.test node_modules/drizzle-kit/bin.cjs migrate",
"check:db-imports": "tsx scripts/check-db-imports.ts",
"check:rls": "tsx --conditions=react-server --env-file=.env.local scripts/check-rls.ts",
"check:schema": "tsx --conditions=react-server --env-file=.env.local scripts/check-schema.ts",
"verify:phase-2": "tsx --env-file=.env.local scripts/check-data-layer.ts && pnpm check:artifacts"
```

(Path/script names are illustrative — planner should validate against drizzle-kit's current CLI entry. Some drizzle-kit installs expose `drizzle-kit` as a bin; check `node_modules/.bin/drizzle-kit` resolves correctly via tsx invocation OR use the `drizzle-kit` command directly.)

---

### Plan Structure (5-plan Phase 1 model)

**Source:** `.planning/phases/01-foundation/01-01-PLAN.md` through `01-05-PLAN.md`
**Apply to:** Phase 2 plan-phase

Phase 1 used 5 plans across 4 waves:
- **Wave 1 (`01-01`):** Scaffold + deps + tsconfig (autonomous)
- **Wave 2 (`01-02`):** Operator manual steps + .env.local (checkpoint:human-action)
- **Wave 3 (`01-03`, `01-04`):** Parallel — app shell ‖ middleware + Drizzle skeleton (both autonomous)
- **Wave 4 (`01-05`):** Verify script + operator human-verify (checkpoint:human-verify)

Phase 2 candidate plan shape (planner discretion):
- **Wave 1:** Schema + drizzle.config + migrations (`lib/db/schema.ts` + `drizzle/0000_initial.sql` + `drizzle/0001_rls_policies.sql` + drizzle.config.ts) — autonomous
- **Wave 2:** Operator manual steps — Clerk Dashboard (Roles + session token), Supabase test project, `.env.local` amendments — `checkpoint:human-action`
- **Wave 3 (parallel):** `lib/auth/context.ts` + `lib/db/scoped.ts` + 9 `lib/db/repositories/*.ts` ‖ `app/api/webhooks/clerk/route.ts` ‖ `scripts/check-db-imports.ts` + `scripts/check-rls.ts` + `scripts/check-schema.ts` — autonomous (3 parallel plans)
- **Wave 4:** `scripts/check-data-layer.ts` orchestrator + `tests/types.ts` + `package.json` script wiring + extend `scripts/check-artifacts.ts` — autonomous
- **Wave 5:** Operator runs `pnpm verify:phase-2`, completes Clerk webhook setup, signs off — `checkpoint:human-verify`

Phase 1's `<must_haves>` YAML front matter + `<tasks>` + `<verify><automated>` + `<acceptance_criteria>` + `<threat_model>` structure should be carried verbatim.

---

### Artifact Gate Extension Pattern

**Source:** `scripts/check-artifacts.ts:721-762` (`main()` function — sequential `Check[]` accumulation)

**Apply to:** Add Phase 2 artifact assertion functions to `scripts/check-artifacts.ts`:
```typescript
// Add new functions following the existing shape:
function checkScopedDb(): Check[] { /* assert lib/db/scoped.ts exists + has 'server-only' + has 'set_config' */ }
function checkAuthContext(): Check[] { /* assert lib/auth/context.ts exists + has try/catch + Role narrowing */ }
function checkRepositories(): Check[] { /* assert all 9 repository files exist + import OrgScope */ }
function checkClerkWebhook(): Check[] { /* assert route exists + uses svix Webhook.verify */ }
function checkMigrations(): Check[] { /* assert 0000_initial.sql + 0001_rls_policies.sql exist + RLS substrings */ }
function checkClerkEventsTable(): Check[] { /* assert schema.ts has clerkEvents + id text primaryKey */ }

// Extend main()'s spread:
const all: Check[] = [
  ...checkPackageJsonShape(),
  // ... existing
  ...checkScopedDb(),
  ...checkAuthContext(),
  ...checkRepositories(),
  ...checkClerkWebhook(),
  ...checkMigrations(),
  ...checkClerkEventsTable(),
];
```

---

### `hasAnyType` regex (no-any enforcement)

**Source:** `scripts/check-artifacts.ts:56-65`
```typescript
function hasAnyType(source: string): boolean {
  const stripped = source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    /\bany\b\s*[:,)]/.test(stripped) ||
    /\bas\s+any\b/.test(stripped) ||
    /<any>/.test(stripped)
  );
}
```

**Apply to:** Phase 2 new files (`lib/db/scoped.ts`, `lib/auth/context.ts`, repositories) — EXCEPT `lib/db/scoped.ts` (the `PgTransaction<any, any, any>` is intentional per CONTEXT.md `<specifics>`; whitelist it in check-artifacts.ts).

---

## No Analog Found

Files with no close match in the codebase (planner should use CONTEXT.md `<specifics>` or RESEARCH.md):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `drizzle/0000_initial.sql` | migration (generated) | static-DDL | drizzle-kit generates from `lib/db/schema.ts` — no human-authored analog; verify via `pnpm db:generate` output |
| `tests/types.ts` | type-test | static-DDL | `@ts-expect-error` pattern is new to the codebase; CONTEXT.md D-07 provides exact body |
| `app/api/webhooks/clerk/route.ts` (svix-specific) | route handler | event-driven | No existing API routes — synthesize from svix docs + ADR-023 allow-list pattern. Closest reference is the Clerk imports in `app/(auth)/sign-in/[[...sign-in]]/page.tsx` (just for `@clerk/nextjs` import paths). |

---

## Critical Pattern Carry-Forwards (Phase 1 → Phase 2)

Per CONTEXT.md `<code_context>` "Established Patterns (carried forward verbatim)":

1. **`'server-only'` at top of every server module** — `lib/db/index.ts:3` → applies to all new `lib/`, `lib/db/`, `lib/auth/` files.
2. **`spawnSync(process.execPath, [JS_ENTRY, ...args], { shell: false })`** — `scripts/check-foundation.ts:31, 127` → applies to `scripts/check-data-layer.ts`.
3. **`firstNonEmptyLine(stderr + stdout)`** — `scripts/check-foundation.ts:26-28` → applies to orchestrator script.
4. **`tsx --conditions=react-server --env-file=.env.local`** — `package.json:16` → applies to `check:rls`, `check:schema`, `verify:phase-2`.
5. **Migration env split awareness** — `lib/db/index.ts:16-18` already documents the pooler-vs-direct distinction. D-05 builds on this.
6. **Plan file structure** — Phase 1 plans (`01-01-PLAN.md` through `01-05-PLAN.md`) provide the YAML front matter + `<objective>` + `<context>` + `<tasks>` + `<threat_model>` + `<verification>` + `<success_criteria>` + `<output>` template. Phase 2 plans should mirror this verbatim, including:
   - `<must_haves>` (truths + artifacts + key_links)
   - `<task type="auto" tdd="false">` (autonomous) and `<task type="checkpoint:human-action" gate="blocking">` (operator)
   - `<acceptance_criteria>` with concrete literal substring assertions (PowerShell `if (... -notmatch ...)` patterns)
   - STRIDE threat register table

---

## Metadata

**Analog search scope:**
- `lib/` (Drizzle client, server-only patterns)
- `scripts/` (orchestrator + verify + artifact-gate patterns)
- `app/` (Clerk usage in auth pages)
- `middleware.ts` (sessionClaims narrowing pattern)
- `.planning/phases/01-foundation/01-*-PLAN.md` (plan structure analog)
- `.planning/intel/decisions.md` ADR-023 + ADR-025 (architectural source)
- `reference/SCHEMA.md` (table contracts)

**Files scanned:** 18 (lib: 3, scripts: 4, app: 6, middleware: 1, drizzle.config: 1, package.json: 1, Phase 1 plans: 5, reference: 2, ADR intel: 1)
**Pattern extraction date:** 2026-05-17
**Phase 1 analog coverage:** Strong — 18 of 21 Phase 2 files have direct or role-matched analogs.
**Phase 2 net-new patterns:** 3 (svix webhook verification, `@ts-expect-error` type tests, AST-walker import checker — the third has a regex-grep analog at `scripts/check-artifacts.ts:646-717`).
