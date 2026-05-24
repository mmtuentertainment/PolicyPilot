<!-- refreshed: 2026-05-24 -->
# Architecture

**Analysis Date:** 2026-05-24

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                      Browser / Clerk Session                          │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   middleware.ts  (single chokepoint)                  │
│  - clerkMiddleware                                                    │
│  - x-pathname injection (clobbers client header)                      │
│  - webhook + cron bypass (verify own credentials in-route)            │
│  - public route allow-list                                            │
│  - admin URL gate (D-10 "advertise nothing" → 404 not 401/403)        │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌─────────────────┐      ┌────────────────────┐
│  (admin)      │      │  (employee)     │      │  api/webhooks      │
│  layout.tsx   │      │  layout.tsx     │      │  /clerk, /stripe   │
│  requireAdmin │      │  getOrgContext  │      │  signature-verified│
│  `app/(admin)`│      │  `app/(employee)│      │  `app/api/webhooks`│
└───────┬───────┘      └────────┬────────┘      └─────────┬──────────┘
        │                       │                          │
        ▼                       ▼                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  lib/auth/context.ts → getOrgContext()                                │
│  Clerk text-id → internal UUID (organizations.id, users.id)           │
│  + role narrowing via asRole()                                        │
│  `lib/auth/context.ts`                                                │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  OrgContext { orgId, userId, role }
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  lib/db/scoped.ts → withOrgScope(ctx, async (s) => { ... })           │
│  - db.transaction(...)                                                │
│  - SET LOCAL ROLE authenticated   ← MUST come first                   │
│  - set_config('request.jwt.claims', {...}, true)   ← is_local=true    │
│  `lib/db/scoped.ts`                                                   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │  OrgScope = OrgContext & { tx }
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Per-aggregate repositories (ADR-023)                                 │
│  `lib/db/repositories/*.ts`  (9 repos — one per aggregate root)       │
│  Every query: where(eq(table.orgId, scope.orgId), ...)                │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase Postgres + RLS                                              │
│  USING (org_id = (auth.jwt()->>'org_id')::uuid)                       │
│  Last line of defense — RLS fires on every user-facing query.         │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| `middleware` | Single chokepoint: route gating, x-pathname injection, admin-gate, webhook/cron bypass | `middleware.ts` |
| `getOrgContext` | Resolve Clerk session → internal UUIDs + role | `lib/auth/context.ts` |
| `withOrgScope` | Per-request tx with RLS JWT-claims injection | `lib/db/scoped.ts` |
| Repositories | Per-aggregate queries; all filter by `orgId` | `lib/db/repositories/*.ts` |
| State machine | Pure DAG of allowed policy transitions | `lib/policies/state-machine.ts` |
| Orchestrators | 7 transition functions (submit/approve/reject/publish/archive/restore/editPublished) | `lib/policies/transitions.ts` |
| Acknowledgment | Plan 05-04 orchestrator (append-only insert) | `lib/policies/acknowledgment.ts` |
| AI Q&A | askQuestion orchestrator + parser + grants | `lib/ai/qa.ts`, `lib/ai/qa-parser.ts` |
| Drizzle schema | Source of truth for table shape | `lib/db/schema.ts` |

## Pattern Overview

**Overall:** Layered, server-only Next.js 15 App Router with defense-in-depth multi-tenancy (RLS + app-layer scope + per-aggregate repos).

**Key Characteristics:**
- All DB access is server-only (`'server-only'` directive at top of `lib/db/scoped.ts`, `lib/auth/context.ts`, `lib/policies/transitions.ts`, etc.)
- Multi-tenancy is a layered invariant — three concurrent enforcement points (app where-clause + RLS + per-aggregate repos)
- Append-only audit trails for acknowledgments and policy_versions enforced by 3-layer defense (compile-time + CI gate + DB GRANT asymmetry)
- All AI calls server-side only (CLAUDE.md NEVER #2); routed through `lib/ai/client.ts` and persisted to `ai_generations`
- Typed-error hierarchies (`BootstrapError` for auth, `PolicyDomainError` for policy domain) with stable `code` discriminants
- ts-morph CI gates enforce architectural invariants that compile-time types cannot (DB import allow-list, error-discipline, brand preservation)

## Layers

**Routing + Auth Boundary (`middleware.ts`):**
- Purpose: Single auth chokepoint per ADR-009 / D-10. Webhook + cron bypass before Clerk runs.
- Location: `middleware.ts`
- Contains: Public-route matcher, admin URL gate (404 not 401/403), `x-pathname` header injection
- Depends on: `@clerk/nextjs/server`
- Used by: Every request matching `matcher` config

**Server Components / Route Handlers (`app/`):**
- Purpose: Per-route pages and API handlers; admin and employee surfaces
- Location: `app/(admin)/`, `app/(employee)/`, `app/api/`
- Contains: `page.tsx` Server Components, `actions.ts` Server Actions, `route.ts` API handlers
- Depends on: `lib/auth/context.ts`, `lib/db/scoped.ts`, repositories, `components/`
- Used by: Browser + middleware

**Domain Orchestrators (`lib/policies/`, `lib/ai/`):**
- Purpose: Cross-repository business logic (state transitions, AI Q&A, acknowledgments)
- Location: `lib/policies/transitions.ts`, `lib/policies/acknowledgment.ts`, `lib/ai/qa.ts`, `lib/ai/summary.ts`
- Contains: Transactional orchestrators that compose multiple repository calls + AI client + state validation
- Depends on: `lib/db/scoped.ts`, `lib/db/repositories/*`, `lib/ai/client.ts`
- Used by: Server Actions, API route handlers

**Data Access (`lib/db/`):**
- Purpose: Single source of truth for `orgId`-scoped DB access
- Location: `lib/db/scoped.ts`, `lib/db/repositories/*.ts`, `lib/db/schema.ts`
- Contains: `withOrgScope` per-request transaction bridge + 9 per-aggregate repositories
- Depends on: `drizzle-orm`, `postgres`
- Used by: All orchestrators and Server Actions

**External Integrations (`lib/ai/`, webhook handlers):**
- Purpose: Anthropic Claude API client + Clerk webhook + (future) Stripe webhook
- Location: `lib/ai/client.ts`, `app/api/webhooks/clerk/route.ts`
- Contains: Signature verification, idempotency, audit logging
- Depends on: `@anthropic-ai/sdk`, `svix`

## Data Flow

### Primary Request Path (admin Server Action — e.g. publish policy)

1. Browser submits form → Next.js routes to `app/(admin)/policies/[id]/actions.ts` (`actions.ts`)
2. `middleware.ts` matches admin URL → verifies session → narrows role to "admin" via `publicMetadata.role` → injects `x-pathname` (`middleware.ts:93-154`)
3. `(admin)/layout.tsx` calls `requireAdmin()` (`lib/auth/require-admin.ts`)
4. Server Action invokes orchestrator → `lib/policies/transitions.ts:publish()` (`lib/policies/transitions.ts:156`)
5. Orchestrator calls `getOrgContext()` → Clerk text-id → internal UUIDs (`lib/auth/context.ts:93`)
6. Orchestrator opens `withOrgScope(ctx, ...)` → `db.transaction` + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` (`lib/db/scoped.ts:41`)
7. Inside tx: `Policies.findById(s, policyId)` → `canTransition(from, to)` → `PolicyVersions.create(s, ...)` snapshot → `update(policies).set({status:'published'})` (`lib/policies/transitions.ts:156-176`)
8. Post-commit: `generateSummaryForPolicy(policyId, ctx)` outside the tx; `Anthropic.APIError` swallowed per D-19 graceful-degrade; all other errors re-thrown
9. Server Action returns typed `ActionState`; UI revalidates

### Employee Acknowledge Flow (`/my-policies/[id]`)

1. Server Component loads — `getOrgContext()` resolves user
2. Inside ONE `withOrgScope` closure, 3-branch access check runs (`app/(employee)/my-policies/[id]/page.tsx:81-133`):
   - **Branch A (assigned)** → `Policies.listAssignedAndPublishedForUser(s, userId)` hit → full `PolicyView` + `AcknowledgeButton`
   - **Branch B (cited-but-not-assigned)** → `QaCitationGrants.hasGrant(s, userId, policyId)` true → TL;DR-only with amber banner (D-27 exact copy)
   - **Branch C (else)** → `notFound()` (404 per D-10)
3. User clicks Acknowledge → Server Action → `lib/policies/acknowledgment.ts:createAcknowledgment(...)` (`lib/policies/acknowledgment.ts`)
4. Orchestrator: verifies assignment + policy.status === 'published' + maps Drizzle 23505 unique-violation to silent success (idempotent ack)

### Employee Q&A Flow (`/my-policies/ask`)

1. Server Action submits question → `app/(employee)/my-policies/ask/actions.ts`
2. Orchestrator: `lib/ai/qa.ts:askQuestion(ctx, question)` (D-25 extraction from HTTP route per Plan 05-04)
3. Loads published policies via `Policies.listPublishedForOrg` → builds `validIds` Set → calls Anthropic via `lib/ai/client.ts`
4. Parses cited IDs from response — D-41 same-closure validation drops any citation not in `validIds` (defense vs prompt injection)
5. Persists `ai_generations` row + writes `qa_citation_grants` rows (D-26 server-tracked) → grants Branch B access in `/my-policies/[id]`

**State Management:**
- Browser-side: React 19 form state via Server Action `useFormState`
- Server-side: Stateless; every request resolves a fresh `OrgContext`
- DB: Source of truth for ack state, policy status, subscription tier

## Key Abstractions

**`OrgContext` / `OrgScope`:**
- Purpose: Tenant-scoped identity + per-request DB transaction handle
- Location: `lib/auth/context.ts:36-46`, `lib/db/scoped.ts:26`
- Pattern: Constructor at one trust boundary (`getOrgContext`), consumed via typed wrapper (`withOrgScope`)

**Branded `PolicyId` (ADR-028):**
- Purpose: Prevent cross-confusion between `policies.id` and other UUIDs (`users.id`, `organizations.id`)
- Examples: `lib/policies/types.ts:39`, threaded through 7 transition orchestrators + 5 repository methods + 7 Server Actions
- Pattern: `z.string().uuid().brand<'PolicyId'>()` — CI gate `scripts/check-policy-id-brand.ts` pins signature surface
- Slippery-slope policy: only `PolicyId` branded; `UserId`/`OrgId` opportunistic (well-contained in `OrgContext`)

**Repository pattern (ADR-023):**
- Purpose: One module per aggregate root; static class exports
- Location: `lib/db/repositories/*.ts` (9 files)
- Pattern: All methods take `(scope: OrgScope, ...)` as first arg; all queries filter by `scope.orgId`
- Raw `db` import is allow-listed to 2 paths only (`lib/db/index.ts`, `lib/db/scoped.ts`) — enforced by `scripts/check-db-imports.ts`

**State machine (D-03):**
- Purpose: Pure DAG of allowed policy lifecycle transitions
- Location: `lib/policies/state-machine.ts`
- Pattern: Single `ALLOWED_TRANSITIONS` table as `satisfies Record<PolicyStatus, readonly PolicyStatus[]>`; pure module, no DB import, no `'server-only'`

**Typed-error hierarchies:**
- Auth domain: `BootstrapError` abstract base with `code: BootstrapErrorCode` (ADR-026) at `lib/auth/errors.ts`
- Policy domain: `PolicyDomainError` abstract base with `code: PolicyDomainErrorCode` at `lib/policies/errors.ts`
- Pattern: Abstract base + literal `code` field + explicit `this.name = 'ClassName'` + `public readonly` diagnostic params
- CI gate `scripts/check-error-discipline.ts` (ts-morph) forbids built-in `Error`/`TypeError`/`RangeError` in `lib/auth/**`, `lib/stripe/**`, `lib/policies/**`

## Entry Points

**Middleware:**
- Location: `middleware.ts`
- Triggers: Every request matching `matcher` config (everything except static + Next internals)
- Responsibilities: Route gating, x-pathname injection, admin-gate, webhook/cron bypass

**Admin Server Components:**
- Location: `app/(admin)/dashboard/page.tsx`, `app/(admin)/policies/page.tsx`, `app/(admin)/policies/[id]/page.tsx`, `app/(admin)/policies/new/page.tsx`
- Triggers: Authenticated admin navigation
- Responsibilities: List/detail/create views; render PolicyView + transition menus

**Employee Server Components:**
- Location: `app/(employee)/my-policies/page.tsx`, `app/(employee)/my-policies/[id]/page.tsx`, `app/(employee)/my-policies/ask/page.tsx`
- Triggers: Authenticated employee navigation
- Responsibilities: My-policies list, D-27 3-branch detail page, Q&A surface

**Server Actions:**
- Location: `app/(admin)/policies/[id]/actions.ts`, `app/(employee)/my-policies/[id]/actions.ts`, `app/(employee)/my-policies/ask/actions.ts`
- Triggers: Form submission from client component
- Responsibilities: Thin wrappers over `lib/policies/transitions.ts` and `lib/ai/qa.ts` orchestrators

**Webhook Handlers:**
- Location: `app/api/webhooks/clerk/route.ts`
- Triggers: Clerk org/user lifecycle events
- Responsibilities: Mirror Clerk identities → `organizations` + `users` tables; svix signature verification

**AI Route Handlers:**
- Location: `app/api/ai/draft/route.ts`, `app/api/ai/summary/route.ts`, `app/api/ai/qa/route.ts`, `app/api/ai/consistency/route.ts`
- Triggers: Authenticated admin/employee surfaces
- Responsibilities: Tier-limit check → AI call → persist `ai_generations` row

## Architectural Constraints

- **Threading:** Single-threaded Next.js request handler; per-request `db.transaction` opens one Postgres connection from the pool. `withOrgScope` MUST set `SET LOCAL ROLE authenticated` before `set_config` (Pitfall 1) and MUST pass `is_local=true` to `set_config` (Pitfall 2 — leaks claims across pooled connections otherwise).
- **Global state:** None tolerated. `lib/db/index.ts` exports the singleton `db` client; only allow-listed paths import it raw (`lib/db/scoped.ts`, webhook + cron + test harness). All other code imports via `withOrgScope` → `scope.tx`.
- **Circular imports:** Avoided. `lib/policies/state-machine.ts` is a pure leaf (no `'server-only'`); orchestrators import it but not vice versa.
- **Server-only enforcement:** All DB-touching modules carry `import 'server-only'` at the top — a build-time error if any client component transitively imports them.
- **Admin gate hardcoded to URL patterns:** `ADMIN_URL_PATTERNS` in `middleware.ts:45` lists the literal admin URLs (`/dashboard`, `/policies`) — NOT route-group catch-alls (which never appear in URLs). Adding a new admin URL requires updating both patterns AND `app/(admin)/layout.tsx` `requireAdmin()`.

## Anti-Patterns

### Raw `db` import outside the allow-list

**What happens:** A new file imports `db` from `@/lib/db` directly and runs `db.select().from(table)` without `withOrgScope`.
**Why it's wrong:** Skips both the app-layer `where(eq(table.orgId, ctx.orgId))` AND the RLS JWT-claims injection. RLS would still fire from the connection-string `postgres` user perspective — but `postgres` user has `BYPASSRLS`, so cross-org rows leak (RESEARCH Pitfall 1).
**Do this instead:** Import a repository (`@/lib/db/repositories/policies`); call from inside `withOrgScope(ctx, async (s) => { ... })`. CI gate `scripts/check-db-imports.ts` catches the violation; the only allow-listed raw importers are `lib/db/index.ts`, `lib/db/scoped.ts`, the Clerk webhook, the cron handler, and the test harness.

### Throwing a built-in `Error` from `lib/auth/`, `lib/stripe/`, or `lib/policies/`

**What happens:** Code throws `throw new Error('policy not found')`.
**Why it's wrong:** Loses the stable `code` discriminant that downstream Server Actions narrow on; structured logging in Phase 7+ has to parse prose message strings.
**Do this instead:** Throw a typed subclass — `throw new PolicyNotFoundError(policyId)` (`lib/policies/errors.ts:78`). CI gate `scripts/check-error-discipline.ts` (ts-morph) fails the build if any `lib/{auth,stripe,policies}/**` file emits a built-in `Error`/`TypeError`/`RangeError`.

### Modifying or deleting an `acknowledgments` row (CLAUDE.md NEVER #5)

**What happens:** Code calls `db.update(acknowledgments)...` or `db.delete(acknowledgments)...`.
**Why it's wrong:** Acknowledgment is the audit trail — append-only is a regulatory requirement (REQ-acknowledgment-audit).
**Do this instead:** Use `Acknowledgments.create(s, ...)` only. Defended by ALL THREE of: (a) compile-time at `tests/types.ts` D-07 (no `update`/`delete` export from the repository), (b) ts-morph CI gate `scripts/check-acknowledgment-immutability.ts`, (c) Postgres GRANT asymmetry — `authenticated` role has INSERT but NOT UPDATE/DELETE on `acknowledgments`.

### Passing a raw `string` where a `PolicyId` is expected

**What happens:** `await publish(rawString)` (where `publish: (policyId: PolicyId) => Promise<void>`).
**Why it's wrong:** Branded types defend against cross-confusion (e.g. accidentally passing `users.id` UUID into a policies position).
**Do this instead:** Lift at the trust boundary — `const id = PolicyIdSchema.parse(rawString)` (`lib/policies/types.ts:39`) or `policyIdFromString(rawString)`. CI gate `scripts/check-policy-id-brand.ts` pins the signature surface.

### Editing a Drizzle migration after it lands in `_journal.json`

**What happens:** Operator modifies `drizzle/0007_*.sql` after it's been applied to staging/prod.
**Why it's wrong:** Migrations are immutable — only forward migrations allowed. The journal is the source of truth for "which migrations must be applied to every environment."
**Do this instead:** Write a NEW migration. Destructive migrations (DROP COLUMN, DROP TABLE, NOT NULL on existing column) require operator ASK-FIRST approval — header must document rationale + timestamp + decision ID. Example: `drizzle/0007_ai_generations_audit_extensions.sql` documents the 2026-05-21 approval per `.planning/phases/04-ai-layer/04-CONTEXT.md` D-44.

### Calling Anthropic without persisting to `ai_generations`

**What happens:** Code calls `anthropic.messages.create({...})` and returns the result directly.
**Why it's wrong:** Audit trail is incomplete (CLAUDE.md ALWAYS #5); tier-limit accounting breaks (CLAUDE.md ALWAYS #6).
**Do this instead:** Route through `lib/ai/client.ts` which (a) checks tier limit via `reference/TIER-LIMITS.md` enforcer, (b) calls Anthropic, (c) persists `ai_generations` row, (d) returns parsed response.

## Error Handling

**Strategy:** Typed error hierarchies with stable `code` discriminants; Server Actions catch domain errors and map to typed `ActionState` for UI recovery copy.

**Patterns:**
- **Auth boundary:** `getOrgContext()` throws `ClerkAuthFailedError` / `NotAuthenticatedError` / `NoActiveOrganizationError` / `InvalidRoleError` / `OrgNotProvisionedError` / `UserNotProvisionedError` (with `subCode` discriminant for the multi-org Clerk lockout case per ADR-027/028).
- **Policy domain:** `PolicyNotFoundError` (D-10 advertise-nothing union of RLS-deny + truly-missing), `PolicyArchivedError`, `PolicyNotAssignedError`. All extend `PolicyDomainError` abstract base with literal `code: PolicyDomainErrorCode`.
- **State-machine:** `IllegalTransitionError` (not in a hierarchy — pure module).
- **AI graceful-degrade:** `publish()` post-commit summary call narrows on `Anthropic.APIError` only and swallows; ALL other errors re-thrown to surface in error monitoring (`lib/policies/transitions.ts:197-218`).
- **Middleware fail-closed:** `auth()` call wrapped in try/catch (SF-M4 fold); 404 on admin gate (advertise nothing), redirect-to-/sign-in on default chokepoint.
- **D-10 "advertise nothing":** Admin gate returns 404 for unauthenticated, wrong-role, AND malformed-URL cases — never 401/403/redirect — to avoid confirming route existence.

## Cross-Cutting Concerns

**Logging:** `console.error` with structured object payloads (`{name, status, code}`) — PII-safe sanitization for Anthropic errors (D-36). No external logger yet; Phase 7+ will add structured-logging routing on `err.code` discriminants.

**Validation:** Zod at trust boundaries (`PolicyIdSchema.safeParse` at URL-param ingress; `safeParse` over `parse` so malformed input becomes a typed `notFound()` rather than a 500). Schema files at `lib/ai/schemas.ts` for AI response shapes.

**Authentication:** Clerk (`@clerk/nextjs`) handles sessions, org switching, sign-in/up flows. NEVER roll custom auth (CLAUDE.md NEVER #1). `OrgContext` is the single server-side identity primitive — every server module that touches DB resolves it.

**Database migrations:** Immutable + ordered. Pre-deploy gate: `pnpm db:migrate:<env> && pnpm db:verify:<env>` (both exit 0) BEFORE shipping code that depends on a new migration. Destructive migrations are ASK-FIRST with operator-approval timestamp in the migration header.

**Verify chain (cumulative composition):**
- `verify:phase-1` → foundation + artifacts
- `verify:phase-2` → data-layer integration test
- `verify:phase-3` → typecheck + db-imports + rls + auth-context + policies-list-filters + admin-routes + error-discipline + policy-id-brand + artifacts + vitest + svix cleanup
- `verify:phase-4` → phase-3 + ai-prompts + ai-layer integration test
- `verify:phase-5` → phase-4 + acknowledgment-immutability + acknowledgment-immutability self-test + employee-portal integration test

Each phase's verify command runs ALL prior phases' checks plus its own — adding a phase widens the gate but never narrows it.

---

*Architecture analysis: 2026-05-24*
