# Coding Conventions

**Analysis Date:** 2026-05-24

PolicyPilot is a Next.js 15 / TypeScript SaaS on the App Router. Conventions are
prescriptive (CI-enforced where possible) — author new code by mirroring the
patterns below verbatim, not by re-deriving them.

---

## TypeScript Discipline

**Strict mode (`tsconfig.json`):**

| Flag | Value | Why |
|------|-------|-----|
| `strict` | `true` | Project rule (CLAUDE.md ALWAYS) |
| `noUncheckedIndexedAccess` | `true` | Array/record reads return `T \| undefined` |
| `noImplicitOverride` | `true` | Subclass method overrides must be explicit |
| `isolatedModules` | `true` | Drives `import type` discipline |
| `moduleResolution` | `bundler` | Required for Next 15 App Router |

**`any` is banned** (CLAUDE.md NEVER #4). Use `unknown` + narrowing:

```ts
// BAD
function handle(payload: any) { return payload.id; }

// GOOD
function handle(payload: unknown) {
  const parsed = Schema.safeParse(payload);
  if (!parsed.success) return INVALID_PAYLOAD;
  return parsed.data.id; // narrowed
}
```

**`@ts-expect-error` only with a comment** explaining the locked invariant.
The canonical example is `tests/types.ts` (D-07 compile-time invariants), where
each `@ts-expect-error` line names the ADR/decision it locks:

```ts
// @ts-expect-error — Acknowledgments must not expose `update` (ADR-018 append-only)
void Acknowledgments.update;

// @ts-expect-error — PolicyId must not accept a raw `string` via assignment (ADR-028 brand)
const _policyIdBrandTest: PolicyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
```

The inverted-polarity guard: if the invariant is ever broken, tsc *succeeds* on
the line, then fails the build with "Unused '@ts-expect-error' directive".

---

## Error Handling

**Typed error hierarchies** (ADR-026 + D-30). Two roots:

| Hierarchy | Root | Scope | Subclasses |
|-----------|------|-------|------------|
| `BootstrapError` | `lib/auth/errors.ts` | Auth / Clerk bootstrap | `NotAuthenticatedError`, `NoActiveOrganizationError`, `InvalidRoleError`, `ProvisioningRaceError` (abstract) → `OrgNotProvisionedError`, `UserNotProvisionedError`, `ClerkAuthFailedError` |
| `PolicyDomainError` | `lib/policies/errors.ts` | Policy lifecycle | `PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError`, `IllegalTransitionError`, … |

**Never `throw new Error('...')` inside the enforced scope** (`lib/auth/`,
`lib/stripe/`, `lib/policies/`). CI-enforced via `scripts/check-error-discipline.ts`
(wired into `verify:phase-3` and inherited by `verify:phase-{4,5}`).

**Narrowing pattern at consumer boundary** (`app/(employee)/my-policies/[id]/actions.ts`):

```ts
try {
  result = await recordAcknowledgment(ctx, parsed.data.policyId, ipAddress);
} catch (err) {
  if (err instanceof PolicyArchivedError) {
    return { ok: false, error: '...', code: 'POLICY_ARCHIVED' };
  }
  if (err instanceof PolicyNotAssignedError) { /* ... */ }
  if (err instanceof PolicyNotFoundError)    { /* ... */ }
  throw err; // bubble unknown errors to Next.js error boundary
}
```

`matchesErrorClass(err, ALLOW_LIST)` (in `lib/auth/bootstrap-errors.ts`) is the
helper for class-set narrowing in race-recovery paths.

---

## File Header Docstring Style

Every non-trivial file opens with a brief multi-line `//` block citing the plan,
decisions, and ADRs it implements. The block answers "why this file exists";
implementation comments answer "why this line."

Canonical shape (from `lib/db/repositories/acknowledgments.ts` and
`app/(employee)/my-policies/[id]/actions.ts`):

```ts
"use server";
// app/(employee)/my-policies/[id]/actions.ts — Plan 05-05 Task 2a.
// acknowledgePolicyAction Server Action per Phase 5 D-09 + D-10b + D-10c.
//
// Wraps lib/policies/acknowledgment.ts::recordAcknowledgment. The
// orchestrator owns the transactional business logic; this file is the
// Server Action trust boundary (Zod parse + IP capture + typed-error
// mapping + revalidatePath).
//
// D-05 — IP capture from request:
//   headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
// ...
// D-10c — revalidatePath OUTSIDE try/catch per Phase 3 D-09 +
// Next.js 15 requirement.
```

**Block-comment caveat:** TypeScript scans `//`-comments (not JSDoc blocks) for
`@ts-expect-error` directives. Use `/** … */` ONLY for prose; use `//` for any
header that may carry directives or pin invariants.

---

## Server / Client Component Split

**Default to Server Components.** Add `'use client'` only when one of these is
required:

| Feature | Why it forces Client |
|---------|----------------------|
| `useState` / `useEffect` / `useRef` | Hooks need a browser runtime |
| `useActionState` (form mutation feedback) | Hooks need a browser runtime |
| Event handlers (`onClick`, `onChange`) | Server Components can't pass closures |
| TipTap editor / browser-only libs | DOM dependency |

**Server-only modules** start with `import 'server-only';` (e.g.
`lib/db/repositories/acknowledgments.ts:15`). The package throws at any
accidental client-bundle inclusion; vitest aliases it to a stub
(`tests/stubs/server-only.ts`) so jsdom tests can import.

---

## Server Actions

Standard shape (`app/(employee)/my-policies/[id]/actions.ts`):

1. `"use server";` directive at the top.
2. File header docstring (see above).
3. Zod schema for the FormData payload — `PolicyIdSchema` etc.
4. `safeParse` at the boundary, return `INVALID_PAYLOAD` on failure.
5. Read request headers OUTSIDE try (so error paths still log IP).
6. `try { … } catch { instanceof checks → mapped error codes; throw err on unknown }`.
7. `revalidatePath(...)` calls **OUTSIDE** try/catch (D-09).
8. Return a discriminated-union state: `{ ok: true, … } | { ok: false, error, code }`.

Why revalidatePath stays outside try: Next 15 throws specially for
redirect/revalidatePath; catching them breaks the revalidation cycle.

---

## Repository Pattern

**Per-aggregate** (ADR-023). Files live in `lib/db/repositories/<aggregate>.ts`
and export a single PascalCase object (`Policies`, `Acknowledgments`,
`PolicyVersions`, `PolicyAssignments`, `QaCitationGrants`).

Method signature: **first argument is always `OrgScope`** (`s`), followed by
aggregate-specific args. Reads use `s.tx.select()`; writes return the
`.returning()` array so callers can length-check for `ON CONFLICT DO NOTHING`
silent-success.

```ts
export const Acknowledgments = {
  listForUser: (s: OrgScope, userId: string) =>
    s.tx.select().from(acknowledgments).where(
      and(eq(acknowledgments.orgId, s.orgId), eq(acknowledgments.userId, userId)),
    ),

  record: async (s: OrgScope, input: AcknowledgmentRecordInput) => {
    const inserted = await s.tx
      .insert(acknowledgments)
      .values({ ...input, orgId: s.orgId })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) { /* silent-success branch */ }
    return inserted;
  },

  // NO update method. ADR-018 append-only.
  // NO delete method. ADR-018 append-only.
};
```

**Always set `orgId` from `s.orgId`, NEVER from input** — defense against
cross-org writes (RLS is the last line; app layer is the first).

---

## Branded Types

**Status:** `PolicyId` is branded (ADR-028); `UserId` and `OrgId` are
intentionally NOT (slippery-slope policy documented in `lib/policies/types.ts:10-21`).

```ts
export const PolicyIdSchema = z.string().uuid().brand<'PolicyId'>();
export type PolicyId = z.infer<typeof PolicyIdSchema>;
```

`PolicyId` threads through 7 transition orchestrators + 5 repository methods +
7 Server Actions. `UserId`/`OrgId` mostly stay inside `OrgContext`/`OrgScope`
(constructed once at `getOrgContext`, consumed via `withOrgScope`) — already
well-contained. Branding more IDs requires a new ADR.

`scripts/check-policy-id-brand.ts` is the signature-level CI gate; `tests/types.ts`
is the compile-time inverted-polarity guard.

---

## Drizzle Query Style

**Prefer flat `.where(and(...))` over chained `.where()`** for clarity:

```ts
// GOOD — single .where with and() composition
s.tx
  .select()
  .from(acknowledgments)
  .where(
    and(
      eq(acknowledgments.orgId, s.orgId),
      eq(acknowledgments.userId, userId),
    ),
  );

// AVOID — chained .where() calls
s.tx.select().from(acknowledgments).where(eq(...)).where(eq(...));
```

**Transactions only via `s.tx`.** Never reach for the top-level `db` import
inside a repository — see header in `lib/db/repositories/acknowledgments.ts:12-14`.

`scripts/check-db-imports.ts` enforces this at CI.

---

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case `.ts(x)` | `acknowledgment.ts`, `my-policies/`, `bulk-assign.ts` |
| Repositories (exported object) | PascalCase | `Policies`, `Acknowledgments`, `PolicyVersions` |
| Repository methods | camelCase | `record`, `findById`, `listForUser` |
| Server Actions | camelCase with `Action` suffix | `acknowledgePolicyAction`, `bulkAssignToDepartmentAction` |
| Error classes | PascalCase + `Error` suffix | `PolicyArchivedError`, `BootstrapError` |
| Zod schemas | PascalCase + `Schema` suffix | `PolicyIdSchema` |
| Decision references | letter-number | `D-07`, `D-10c`, `H-1`, `L-05` |
| ADR references | `ADR-NNN` | `ADR-026`, `ADR-028` |
| Plan references | `Plan NN-NN Task N` | `Plan 05-05 Task 2a` |

Routes use Next.js App Router conventions: parenthesized route groups
(`(admin)`, `(employee)`, `(auth)`, `(marketing)`) for layout grouping without
URL segments; `[id]` for dynamic params.

---

## Comments — WHY, not WHAT

**Reference plan / decision / ADR IDs** so future readers can pull the
rationale chain. Cite EAPI advisor findings (`H-1`, `H-4`, `H-5`, `H-6`) when
the comment is closing a specific advisor concern.

```ts
// D-10 silent-success observability: console.log on the no-op branch
// gives ops a single-line signal for monitoring unusual duplicate-ack
// rates (would indicate a double-submit UI bug or replay).

// H-5 closure (Plan 05-09 acceptance) — hallucinated UUID is stripped
// by parseQaResponse validIds filter; grant write never fires.
```

Avoid restating the code. A comment that says "increment counter" above
`counter++` is noise; one that says "// per D-15 — counter drives the
ON CONFLICT branch in Acknowledgments.record" is signal.

---

## Imports

**Path alias:** `@/` resolves to project root (configured in
`tsconfig.json:23-25` and `vitest.config.ts:9`).

```ts
import { getOrgContext } from "@/lib/auth/context";
import { recordAcknowledgment } from "@/lib/policies/acknowledgment";
import { PolicyIdSchema } from "@/lib/policies/types";
```

**Order:**
1. Side-effect imports / directives (`'use server'`, `import 'server-only'`)
2. Third-party packages (`react`, `zod`, `drizzle-orm`, `next/cache`)
3. Project (`@/lib/...`, `@/components/...`)
4. Sibling relative imports (`./actions`, `./errors`)

**`import 'server-only';`** sits at the top of every server-only module
immediately after the file header docstring. The vitest alias to a stub
(`tests/stubs/server-only.ts`) is the only reason jsdom unit tests can import
these modules without the real package's hard throw firing.

---

## ESLint / Formatting

| Tool | Config |
|------|--------|
| ESLint | `eslint.config.mjs` extends `next/core-web-vitals` + `next/typescript` |
| Formatter | No Prettier config present — formatting follows ESLint + TS-language-server defaults |
| Ignores | `node_modules/**`, `.next/**`, `out/**`, `build/**`, `next-env.d.ts` |

Run: `pnpm lint`.

---

## Function / Module Design

- **Server Actions** stay thin — they validate, narrow, and delegate to an
  orchestrator in `lib/policies/` or a repository in `lib/db/repositories/`.
- **Orchestrators** own transaction boundaries (`withOrgScope`) and compose
  multiple repository calls.
- **Repositories** are stateless function bags; no class instances.
- **Exports** are named (`export const Policies = …`); avoid default exports
  outside Next.js page/layout files.
- **Barrel files** (`index.ts` re-exports) are NOT used in `lib/` — explicit
  paths preserve tree-shaking and make grep navigation trivial.

---

## CI Gate Discipline (per-phase)

Every phase ships with a `verify:phase-N` script chain. Before commit:

```bash
pnpm typecheck      # tsc --noEmit — zero errors
pnpm verify:phase-N # full gate chain for the active phase
```

`tsc --noEmit` passing is **mandatory before every commit** (CLAUDE.md ALWAYS
#1). The Git workflow squashes the per-phase feature branch into `main`; `main`
must stay green between every phase squash.

---

## Where to Add New Code

| Need | Location |
|------|----------|
| New Server Action | `app/(<group>)/<route>/actions.ts` |
| New orchestrator (transactional business logic) | `lib/policies/<feature>.ts` |
| New repository | `lib/db/repositories/<aggregate>.ts` |
| New error class | Existing hierarchy file (`lib/auth/errors.ts` or `lib/policies/errors.ts`) |
| New typed branded ID | `lib/<domain>/types.ts` + new ADR |
| New CI gate | `scripts/check-<name>.ts` + wire into `verify:phase-N` |
| New compile-time invariant | Append `@ts-expect-error` line to `tests/types.ts` |

---

*Convention analysis: 2026-05-24*
