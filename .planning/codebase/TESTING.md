# Testing Patterns

**Analysis Date:** 2026-05-24

PolicyPilot tests split into two tracks: **co-located unit/component tests**
(default `pnpm test` glob) and **integration harnesses** under `scripts/`
(excluded from the default glob, fired by dedicated `pnpm check:*` scripts).
Phase 5 (Employee Portal) shipped 56 new tests; total = **228 tests across
28 files**.

---

## Test Framework

| Tool | Version | Notes |
|------|---------|-------|
| Vitest | `^1.6.0` (installed 1.6.1) | CJS Node API — deprecation warning on every run; harmless |
| Environment | `jsdom` | Default per `vitest.config.ts:30`; supports component tests |
| Assertion | Vitest built-in `expect` + `@testing-library/jest-dom/vitest` | Custom matchers from `tests/setup.ts:1` |
| React testing | `@testing-library/react` `^16` + `@vitejs/plugin-react` `^4` | Component DOM tests |
| Config | `vitest.config.ts` | `globals: true`, `include: ['**/*.{test,spec}.{ts,tsx}']` |

**Run commands:**

```bash
pnpm test               # default unit/component glob (excludes integration harnesses)
pnpm test:watch         # vitest in watch mode
pnpm check:ai-layer     # Phase 4 integration harness (dedicated config)
pnpm check:employee-portal  # Phase 5 integration harness (dedicated config, live TEST DB)
pnpm verify:phase-5     # full chain: phase-4 chain + ack-immutability + check:employee-portal
```

---

## Test File Organization

**Co-located unit / component tests** sit next to source:

```
lib/policies/state-machine.ts
lib/policies/state-machine.test.ts          ← co-located
app/(employee)/my-policies/[id]/actions.ts
app/(employee)/my-policies/[id]/actions.test.ts  ← co-located
components/policy/PolicyEditor.tsx
components/policy/PolicyEditor.test.tsx     ← co-located
```

**Integration harnesses** live under `scripts/`:

```
scripts/check-ai-layer.test.ts              ← Phase 4, vitest+Anthropic mock
scripts/check-ai-layer.vitest.config.ts     ← dedicated config (node env, DB passthrough)
scripts/check-employee-portal.test.ts       ← Phase 5, 846 lines, raw postgres-js + RLS
scripts/check-employee-portal.vitest.config.ts  ← dedicated config (BYPASSRLS seed)
```

`vitest.config.ts:43` excludes both integration tests from the default glob so
`pnpm test` stays fast and DB-independent:

```ts
exclude: [
  'node_modules', '.next', 'tests/types.ts',
  'scripts/check-ai-layer.test.ts',
  'scripts/check-employee-portal.test.ts',
],
```

---

## Test Inventory (28 files, 228 tests)

### Unit tests — `lib/`

| File | Tests | Focus |
|------|------:|-------|
| `lib/policies/state-machine.test.ts` | 24 | Pure state transitions (no I/O) |
| `lib/policies/transitions.test.ts` | 20 | Orchestrator with mocked repos |
| `lib/policies/acknowledgment.test.ts` | — | Phase 5 ack orchestrator |
| `lib/auth/bootstrap-errors.test.ts` | 21 | ADR-026 typed-error contracts |
| `lib/auth/require-admin.test.ts` | — | RBAC guard |
| `lib/ai/qa-parser.test.ts` | 6 | Includes QA-PARSER-FENCE regression |
| `lib/ai/qa-extract.test.ts` | — | Citation extraction |
| `lib/ai/schemas.test.ts` | — | Zod schemas for AI payloads |
| `lib/ai/summary.test.ts` | — | TL;DR summary path |
| `lib/ai/client.test.ts` | — | Anthropic client wrapper |
| `lib/db/repositories/acknowledgments.test.ts` | — | Phase 5 repository |
| `lib/db/repositories/policies.test.ts` | — | |
| `lib/db/repositories/policy_assignments.test.ts` | — | Phase 5 |
| `lib/db/repositories/qa_citation_grants.test.ts` | — | Phase 5 |
| `lib/stripe/products.test.ts` | — | |

### Unit tests — Server Actions (`app/`)

| File | Tests | Focus |
|------|------:|-------|
| `app/(admin)/policies/[id]/actions.test.ts` | 25 | Includes 6 new for `bulkAssignToDepartmentAction` |
| `app/(employee)/my-policies/[id]/actions.test.ts` | 12 | `acknowledgePolicyAction` |
| `app/(employee)/my-policies/ask/actions.test.ts` | 8 | Q&A action |
| `app/(admin)/dashboard/consistency/page.test.tsx` | — | Page-level test |
| `app/api/ai/qa/route.test.ts` | — | Phase 4 R4 + Phase 5 accessibility extension |
| `app/api/ai/draft/route.test.ts` | — | |
| `app/api/ai/summary/route.test.ts` | — | |
| `app/api/ai/consistency/route.test.ts` | — | |
| `app/api/ai/consistency/route.nyquist.test.ts` | — | Nyquist Per-Task Verification entry |
| `app/api/ai/consistency/[batchId]/route.test.ts` | — | |

### Component tests

| File | Tests |
|------|------:|
| `components/policy/PolicyEditor.test.tsx` | 3 |
| `components/policy/PolicyAiDraftDialog.test.tsx` | 4 |

### Integration harnesses

| File | Pattern |
|------|---------|
| `scripts/check-data-layer.ts` | Phase 2 7-check orchestrator (plain tsx) |
| `scripts/check-ai-layer.test.ts` | Phase 4 vitest + Anthropic mock + DB |
| `scripts/check-employee-portal.test.ts` | Phase 5 vitest + raw postgres-js + BYPASSRLS seed + SET LOCAL ROLE authenticated (9 tests, 846 lines) |
| `tests/smoke.test.ts` | Sanity smoke (always green) |

### Compile-time invariants (not runtime tests)

| File | Role |
|------|------|
| `tests/types.ts` | D-07 `@ts-expect-error` invariants (ADR-018 append-only, ADR-028 PolicyId brand, D-43 QA citation shape). Excluded from vitest glob; lives only as a tsc target. |

---

## Mocking Patterns

**Hoisted `vi.fn()` state + module-level `vi.mock` + `beforeEach` reset.**
Canonical shape from `app/(employee)/my-policies/[id]/actions.test.ts:18-58`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock state.
const recordAcknowledgmentMock = vi.fn();
vi.mock('@/lib/policies/acknowledgment', () => ({
  recordAcknowledgment: (...args: unknown[]) => recordAcknowledgmentMock(...args),
}));

const revalidateMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidateMock(p),
}));

const headersGetMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: headersGetMock })),
}));

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => ({
    orgId: 'org_1',
    userId: 'user_1',
    clerkOrgId: 'clerk_test_org',
    clerkUserId: 'clerk_test_user',
    role: 'employee' as const,
  })),
}));

import { acknowledgePolicyAction } from './actions'; // import AFTER vi.mock calls

beforeEach(() => {
  recordAcknowledgmentMock.mockReset();
  revalidateMock.mockClear();
  headersGetMock.mockReset();
  headersGetMock.mockReturnValue(null); // default: no x-forwarded-for
});
```

**Why this shape:**
- `vi.mock` is hoisted to the top of the file by vitest; the `vi.fn()` refs are
  separately hoisted (Vitest understands the pattern) and stay mutable across
  tests.
- Source import (`import { acknowledgePolicyAction } from './actions'`) MUST
  come after the `vi.mock` calls for the mock to apply at module-load time.
- `beforeEach` resets call history but keeps the mock identity stable.

### Commonly mocked modules

| Module | Why |
|--------|-----|
| `next/cache` | `revalidatePath` — verify cache invalidation count + targets |
| `next/headers` | `headers()` — drive `x-forwarded-for` cases |
| `@/lib/auth/context` | `getOrgContext` — inject role/org/user without Clerk |
| `@/lib/db/scoped` | `withOrgScope` — pass through a fake `OrgScope` |
| `@/lib/db/repositories/*` | Per-aggregate — stub `record`, `findById`, etc. |
| `@/lib/ai/client` | `getAnthropicClient` — return fixture messages.create result |
| `@clerk/nextjs/server` | `auth`, `currentUser` — for actions touching Clerk |

### Anthropic mock pattern

Used in `app/api/ai/*/route.test.ts` and `scripts/check-employee-portal.test.ts`.
Shape mirrors the live SDK response:

```ts
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [
          {
            type: 'text',
            text: `Mock Q&A answer body.\n\n--- CITATIONS ---\n${citationJson}\n--- END CITATIONS ---`,
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      })),
    },
  })),
}));
```

`H-5` (pure-hallucination) and `H-6` (cross-org-leak) negative tests use this
mock to inject hallucinated / foreign-org UUIDs, then assert
`parseQaResponse` strips them AND no grant row was written. The mock proves
Phase 4 D-41 same-closure `validIds` defense holds at runtime in the extracted
`lib/ai/qa.ts`.

---

## Fixtures

- **UUID fixtures** are inline constants (`const VALID_POLICY_ID = '00000000-0000-4000-8000-000000000001';`).
- **FormData helper** is a per-file `fd()` function (see
  `app/(employee)/my-policies/[id]/actions.test.ts:60-64`):
  ```ts
  function fd(entries: Record<string, string>): FormData {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.append(k, v);
    return f;
  }
  ```
- **No shared `tests/fixtures/` directory** — fixtures stay co-located with
  their test for context-locality.

---

## Integration Harness — Phase 5 Pattern

`scripts/check-employee-portal.test.ts` (846 lines, 9 tests) is the reference
implementation for live-DB integration tests:

**Connection:**
- Raw `postgres-js` client (no Drizzle session pooling) — direct control over
  transaction lifecycle.
- Env vars from `.env.local` via a dedicated config
  (`scripts/check-employee-portal.vitest.config.ts`).
- TEST DB only — `DATABASE_URL_TEST` + `DIRECT_URL_TEST` (NEVER prod).

**RLS strategy:**
- Seed with `BYPASSRLS` role (admin grant) to populate fixture data.
- Switch to `authenticated` role via `SET LOCAL ROLE authenticated` inside a
  transaction, then run the system-under-test query.
- `ROLLBACK` at end of each test — never persists changes.

**Cross-org isolation tests** confirm RLS blocks foreign-org reads even when
the authenticated user supplies the foreign `org_id` in a WHERE clause.

**Module mocks:** `vi.mock('@/lib/auth/context', …)` + `vi.mock('@/lib/ai/client', …)`
let the integration harness reuse the same orchestrator code path as production
while controlling Anthropic responses and OrgContext.

---

## TEST DB Pattern (Phase 2 baseline)

`scripts/check-data-layer.ts:95-111` shows the migration-spawn pattern:

```ts
const { spawnSync } = require('node:child_process');
spawnSync('pnpm', ['db:migrate:test'], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_TEST,
    DIRECT_URL: process.env.DIRECT_URL_TEST,
  },
  stdio: 'inherit',
});
```

Key invariant: **never mutate `process.env` in-process** — pass overrides via
`spawnSync`'s `env` field so the parent's env stays clean and concurrent
checks don't race.

---

## CI Gate Map

Phase verify chains compose via prefix inheritance:

```text
verify:phase-1 → check-foundation.ts + check:artifacts
verify:phase-2 → check-data-layer.ts (7 sub-checks)
verify:phase-3 → typecheck + check:db-imports + check:rls + check:auth-context
               + check:policies-list-filters + check:admin-routes
               + check:error-discipline + check:policy-id-brand
               + check:artifacts + pnpm test
verify:phase-4 → verify:phase-3 + check:ai-prompts + check:ai-layer
verify:phase-5 → verify:phase-4 + check:acknowledgment-immutability
               + check:acknowledgment-immutability:self-test + check:employee-portal
```

**Total: 11 active static check gates + 3 integration harnesses.** Every gate
exits 0 on green; CI / `verify:phase-N` halts on the first non-zero exit.

---

## Coverage

- **No automatic coverage measurement.** No `nyc`, `c8`, or `v8` coverage
  collector wired into `pnpm test`.
- **Manual per-phase tracking** via the Nyquist Per-Task Verification Map
  (style documented in each phase's `05-VALIDATION.md`). Each task references
  the specific test file(s) that exercise it.

---

## Snapshot Testing

**Not used.** Deliberate decision — snapshots are fragile to whitespace and
formatting churn, and they hide assertion intent. Component tests use explicit
`expect(...).toBeInTheDocument()` / `expect(...).toHaveTextContent('…')` from
`@testing-library/jest-dom`.

---

## Test Setup Globals

`tests/setup.ts` (loaded via `setupFiles` in `vitest.config.ts:32`):

```ts
import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia; shim for shadcn primitives
// (Sidebar, Dialog, DropdownMenu — Phase 3 Admin UI surface).
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
```

`server-only` is stubbed via `vitest.config.ts:9-16` alias to
`tests/stubs/server-only.ts` so jsdom unit tests can import server-only
modules without the real package's hard throw firing.

---

## Test Conventions Summary

| Rule | Why |
|------|-----|
| Co-locate unit/component tests with source (`foo.ts` + `foo.test.ts`) | Locality + grep-discoverability |
| Centralize integration harnesses under `scripts/check-*.test.ts` | Excluded from default glob; dedicated config for DB env |
| File header docstring cites Plan + decision IDs | Same convention as source files |
| `vi.mock` calls before source import | `vi.mock` hoists; source must import the mocked version |
| `beforeEach` resets mock state (`mockReset` or `mockClear`) | Tests must be order-independent |
| Inline UUID/FormData fixtures over shared dirs | Context-locality |
| Discriminated-union result assertions | Mirrors Server Action return shape |
| Compile-time invariants live in `tests/types.ts` | Excluded from vitest glob; tsc-only target |
| Never use snapshot tests | Brittle; obscures intent |

---

*Testing analysis: 2026-05-24*
