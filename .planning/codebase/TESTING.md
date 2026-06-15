# Testing Patterns

**Analysis Date:** 2026-05-30
**Phase coverage:** Through Phase 6 Billing (inclusive)

---

## Test Framework

**Runner:** Vitest `^1.6.0`
**Config:** `vitest.config.ts` (project root)
**Assertion Library:** Vitest built-in (`expect`) + `@testing-library/jest-dom` matchers (via `tests/setup.ts`)
**React testing:** `@testing-library/react` `^16` with jsdom environment

**Run Commands:**
```bash
pnpm test                  # Run all default vitest tests (unit + component)
pnpm test:watch            # Watch mode
pnpm check:ai-layer        # Integration harness against live TEST DB (Phase 4)
pnpm check:employee-portal # Integration harness against live TEST DB (Phase 5)
pnpm verify:phase-6        # Full Phase 6 gate (tsc + verify:phase-5 + stripe tests + db:verify + artifacts)
pnpm test:e2e              # Playwright end-to-end tests
pnpm test:e2e:ui           # Playwright UI mode
```

---

## Two Test Tracks

### Track 1 — Default Vitest Glob (fast, DB-independent)

**Include glob:** `**/*.{test,spec}.{ts,tsx}` (everything in the repo)

**Excluded from default run:**
```typescript
exclude: [
  'node_modules', '.next', 'tests/types.ts',
  'tests/e2e/**',
  'scripts/check-ai-layer.test.ts',       // Phase 4 integration harness
  'scripts/check-employee-portal.test.ts', // Phase 5 integration harness
]
```

**Environment:** `jsdom` (global default); individual files override with `// @vitest-environment node` docblock (used by `lib/ai/client.test.ts` — Anthropic SDK refuses to instantiate in browser-like env).

**Setup file:** `tests/setup.ts`
- Imports `@testing-library/jest-dom/vitest` for DOM matchers
- Runs `cleanup()` after each test via `afterEach`
- Shims `window.matchMedia` for shadcn primitives that probe it

**`server-only` stub:** `tests/stubs/server-only.ts` (empty export) aliased via `vitest.config.ts` so tests can import server-only modules without the package's hard throw. Next.js build still enforces the real guard.

**PostCSS override:** `vitest.config.ts` sets `css: { postcss: { plugins: [] } }` to skip Tailwind v4's PostCSS plugin (rejected by plain Vite; not needed in unit tests).

### Track 2 — Integration Harnesses (DB-connected, node env)

Both harnesses have dedicated vitest configs that use the `node` environment, single-fork pool (`pool: 'forks'`, `singleFork: true`), `testTimeout: 30_000`, and require `TEST_DATABASE_URL` / `DATABASE_URL_TEST` env vars.

**`scripts/check-ai-layer.test.ts`** — Phase 4 AI layer integration:
- Config: `scripts/check-ai-layer.vitest.config.ts`
- Run via: `pnpm check:ai-layer` → wired into `verify:phase-4`
- Tests actual route handler behavior with live DB (TRUNCATE + ROLLBACK isolation)

**`scripts/check-employee-portal.test.ts`** — Phase 5 employee portal integration:
- Config: `scripts/check-employee-portal.vitest.config.ts`
- Run via: `pnpm check:employee-portal` → wired into `verify:phase-5`

---

## Test File Organization

**Pattern:** co-located alongside implementation files (not a separate `__tests__/` directory)

**Naming:** `<module>.test.ts` or `<route>.test.ts` alongside the source file

**Directory layout:**
```
app/
  (admin)/
    dashboard/consistency/  page.test.tsx
    policies/[id]/          actions.test.ts
    settings/               actions.test.ts
  (employee)/
    my-policies/ask/        actions.test.ts
    my-policies/[id]/       actions.test.ts
  api/
    ai/consistency/         route.test.ts, route.nyquist.test.ts
    ai/consistency/[batchId]/ route.test.ts
    ai/draft/               route.test.ts
    ai/qa/                  route.test.ts
    ai/summary/             route.test.ts
    webhooks/stripe/        route.test.ts        ← Phase 6
lib/
  ai/                       client.test.ts, qa-extract.test.ts, qa-parser.test.ts
                            schemas.test.ts, summary.test.ts
  auth/                     bootstrap-errors.test.ts, require-admin.test.ts
  db/repositories/          acknowledgments.test.ts, policies.test.ts
                            policy_assignments.test.ts, qa_citation_grants.test.ts
  policies/                 acknowledgment.test.ts, state-machine.test.ts, transitions.test.ts
  stripe/                   catalog.test.ts, client.test.ts, mask.test.ts  ← Phase 6
                            normalize.test.ts, products.test.ts            ← Phase 6
components/
  admin/                    PolicyAssignmentsPanelForm.test.tsx
  policy/                   PolicyAiDraftDialog.test.tsx, PolicyEditor.test.tsx
scripts/
  check-ai-layer.test.ts    (Track 2 — excluded from default glob)
  check-employee-portal.test.ts (Track 2 — excluded from default glob)
tests/
  smoke.test.ts
  ai-mocks.ts               (shared fixture helpers — NOT a test file)
  stubs/server-only.ts      (stub for vitest import resolution)
  types.ts                  (compile-time type tests — excluded from default glob)
```

---

## Test Counts (2026-05-30 — Phase 6 current)

| Location | File count | Approx test cases |
|----------|-----------|------------------|
| `app/**/*.test.{ts,tsx}` | 12 files | ~115 |
| `lib/**/*.test.{ts,tsx}` | 19 files | ~140 |
| `components/**/*.test.tsx` | 3 files | ~15 |
| `tests/smoke.test.ts` | 1 file | 1 |
| **Default `pnpm test` total** | **35 files** | **~269 test cases** |
| `scripts/check-ai-layer.test.ts` | 1 file (Track 2) | varies |
| `scripts/check-employee-portal.test.ts` | 1 file (Track 2) | varies |

**Note on counting methodology:** `grep -rn "^\s*\(it\|test\)\s*(" app/ lib/ components/ tests/` returned **269** matching lines. This excludes the two Track 2 integration harnesses and `tests/types.ts` (compile-time tests).

---

## Test Structure

**Typical suite organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('<module>.<function> (<ADR or plan reference>)', () => {
  beforeEach(() => {
    // reset mocks
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('describes the expected behavior on success', async () => {
    // arrange → act → assert
  });

  it('describes the error behavior', async () => {
    await expect(action()).rejects.toBeInstanceOf(SomeError);
  });
});
```

**`it.each` for parametric tests:**
```typescript
it.each(['unpaid', 'canceled', 'incomplete_expired', 'paused'] as const)(
  'downgrades terminal status %s to starter',
  async (status) => { ... },
);
```

**`it.each` for table-driven multiple parameters (settings actions):**
```typescript
it.each([
  ['starter', 'monthly', 'starterMonthlyPriceSentinel'],
  ['growth', 'annual', 'growthAnnualPriceSentinel'],
])('accepts %s %s intent...', async (tier, interval, priceId) => { ... });
```

---

## Mocking

**Framework:** Vitest `vi` API (`vi.mock`, `vi.fn`, `vi.spyOn`, `vi.stubEnv`)

### Module Mocking Patterns

**Static hoisted `vi.mock` (most common pattern):**
```typescript
// Declared before imports — Vitest hoists vi.mock() above import statements
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => getOrgContextMock(),
}));
const getOrgContextMock = vi.fn();
```

**Dynamic import after `vi.resetModules()` (for env-var-dependent modules):**
```typescript
async function importRoute() {
  vi.resetModules();
  vi.stubEnv('STRIPE_SECRET_KEY', 'test_key');
  vi.doMock('@/lib/db', () => ({ db: createFakeDb(dbState) }));
  return import('@/app/api/webhooks/stripe/route');
}
```
Used by `app/api/webhooks/stripe/route.test.ts` and `lib/stripe/client.test.ts` because these modules read env vars at load time (module-level initialization).

**`vi.spyOn` for split-helper mocking (WARNING-2 pattern):**
```typescript
import * as productsMod from '@/lib/stripe/products';
vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('growth');
vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(0);
```
Required because `checkTierLimit` calls helpers via `self.*` namespace (not direct closure), making them interceptable by spies. This is the reason `lib/stripe/products.ts` exports `readPlanTier` and `countDraftsThisMonth`.

**`server-only` mock (for files that start with `import 'server-only'`):**
```typescript
vi.mock('server-only', () => ({}));
```
Or relied upon via `vitest.config.ts` alias to `tests/stubs/server-only.ts`.

**Drizzle chain builder mock (repository tests):**
```typescript
// Chainable mock where each method returns an object with the next method
const whereMock = vi.fn(() => Promise.resolve([{ id: 'p1', ... }]));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));
const txMock = { select: selectMock };
// Used as: s.tx in repository calls
```

**`next/navigation` mock (for redirect/notFound):**
```typescript
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
```
Redirect/notFound throws are asserted via `rejects.toThrow('NEXT_REDIRECT:/target')`.

### Env Var Stubbing

```typescript
vi.stubEnv('STRIPE_SECRET_KEY', 'test_value');
// Clean up in afterEach:
vi.unstubAllEnvs();
```

### What to Mock

- External network calls (Stripe SDK, Anthropic SDK) — always
- DB layer (`@/lib/db`, `@/lib/db/scoped`, repositories) — always in unit tests
- Auth context (`@/lib/auth/context`) — always; expose via `mockGetOrgContext`
- `next/navigation` (redirect, notFound) — always in Server Action tests
- `server-only` — always when testing modules that import it

### What NOT to Mock

- Pure business logic (state machine, normalization, error classes) — test directly
- Zod schemas — test directly with real inputs
- `lib/stripe/normalize.ts`, `lib/stripe/catalog.ts` — test via `importNormalizer()` / `importCatalog()` (dynamic import after `vi.resetModules()` + env stubs) to get module re-evaluation per test
- `lib/policies/state-machine.ts` — pure function, no mocking needed

---

## Fixtures and Factories

### Shared AI Fixtures (`tests/ai-mocks.ts`)

```typescript
// Build a full Anthropic.Messages.Message fixture
export function mockTextResponse(
  text: string,
  usage?: Partial<Anthropic.Messages.Usage>,
): Anthropic.Messages.Message

// Build a MessageBatch fixture for batch polling endpoint tests
export function mockBatch(
  processing_status: 'in_progress' | 'canceling' | 'ended',
  counts?: { succeeded?: number; errored?: number; ... }
)
```

Used by all `app/api/ai/**/route.test.ts` and `lib/ai/*.test.ts` files.

### Per-Test Fixture Factories (inline)

**Stripe route test (`app/api/webhooks/stripe/route.test.ts`):**
```typescript
function eventFixture(type = 'checkout.session.completed', object, suffix): Stripe.Event
function checkoutSessionFixture(): Stripe.Checkout.Session
function invoiceFixture(type: 'paid' | 'failed'): Stripe.Invoice
function subscriptionFixture(overrides?: { status?, priceId?, customer?, orgId? }): Stripe.Subscription
```

**Fake DB state for webhook tests:**
```typescript
interface FakeDbState {
  orgRows: OrgRow[];
  processedEventIds: Set<string>;
  mutations: MutationRecord[];
  updateShouldFail: boolean;
}
// FakeTx implements insert (with conflict detection) + update + commit
class FakeTx { ... }
function createFakeDb(state: FakeDbState) { ... }
```
This pattern avoids mocking Drizzle's full chained-builder API; instead a minimal fake that records mutations and supports idempotency semantics.

**OrgContext fixture (shared across many test files):**
```typescript
const ADMIN_CTX = {
  orgId: 'org_1', userId: 'user_1', role: 'admin' as const,
  clerkOrgId: 'org_clerk_1', clerkUserId: 'user_clerk_1',
};
```

**Sentinel values for Stripe IDs:**
```typescript
// IDs are constructed as join(['prefix', 'descriptor']) to avoid embedding
// real-looking Stripe IDs and to make grep easier:
function customerId() { return ['cus', 'route_customer_sentinel'].join('_'); }
function subscriptionId() { return ['sub', 'route_subscription_sentinel'].join('_'); }
```

---

## Verification Chains (verify:phase-N)

### `verify:phase-3` chain

```
pnpm typecheck
  && pnpm check:db-imports
  && pnpm check:rls
  && pnpm check:auth-context
  && pnpm check:policies-list-filters
  && pnpm check:admin-routes
  && pnpm check:error-discipline
  && pnpm check:policy-id-brand
  && pnpm check:artifacts
  && pnpm test
  && node -e "require('fs').rmSync('.tmp/svix-url.json', { force: true })"
```

### `verify:phase-4` chain

```
pnpm verify:phase-3
  && pnpm check:ai-prompts
  && pnpm check:ai-layer   (integration harness, node env, live TEST DB)
```

### `verify:phase-5` chain

```
pnpm verify:phase-4
  && pnpm check:acknowledgment-immutability
  && pnpm check:acknowledgment-immutability:self-test
  && pnpm check:employee-portal   (integration harness, node env, live TEST DB)
```

### `verify:phase-6` chain (Phase 6 Billing — current)

```
pnpm tsc --noEmit
  && pnpm verify:phase-5
  && pnpm run test -- --run lib/stripe        (Stripe unit tests)
  && pnpm run test -- --run app/api/webhooks/stripe  (webhook handler tests)
  && pnpm db:verify
  && pnpm check:artifacts
```

Phase 6 explicitly re-runs the Stripe test subtrees as named subsets (in addition to the full `pnpm test` run inside `verify:phase-5`) to make billing regressions visible at the top-level gate.

### `verify:full`

```
pnpm lint && pnpm build && pnpm verify:phase-5 && pnpm db:verify && pnpm test:e2e
```

Note: `verify:full` points at `verify:phase-5` not `verify:phase-6` (Phase 6 not yet shipped to `main`).

---

## Coverage

**Requirements:** None enforced (no coverage threshold configured).

**View coverage:**
```bash
pnpm vitest run --coverage   # (if @vitest/coverage-v8 were added)
```
Coverage tooling is not installed — `pnpm test` runs without coverage collection. Phase 8 may add it.

---

## Test Types

### Unit Tests (Track 1 — `pnpm test`)

**Scope:** Pure functions, repository contract shapes, error class hierarchies, route handler behavior (with all external dependencies mocked).

**Co-located** with source files (e.g., `lib/stripe/normalize.test.ts` next to `lib/stripe/normalize.ts`).

**Key examples:**
- `lib/policies/state-machine.test.ts` — pure 4×4 transition matrix (no mocks)
- `lib/auth/bootstrap-errors.test.ts` — error class hierarchy invariants + unique code enforcement
- `app/api/webhooks/stripe/route.test.ts` — full webhook handler with FakeDb + FakeStripeClient (no real network)
- `lib/stripe/normalize.test.ts` — subscription normalization across all status values + edge cases
- `app/(admin)/settings/actions.test.ts` — checkout and portal Server Actions with mocked Stripe client

### Integration Harnesses (Track 2 — `pnpm check:*`)

**Scope:** Route handler + DB repository composition tested against a real PostgreSQL test database.

**Isolation:** each test seeds data then rolls back or truncates; `singleFork` ensures no parallelism race.

**When to add a Track 2 test:** when correctness requires verifying the actual SQL query (JOIN correctness, index usage, RLS enforcement) rather than just the composition shape.

### E2E Tests (Playwright — `pnpm test:e2e`)

**Framework:** `@playwright/test` `^1.60.0`

**Location:** `tests/e2e/`

**Config:** `playwright.config.ts` (root)

**Auth bypass:** `POLICYPILOT_E2E_AUTH_BYPASS=1` env var enables a test-only auth shortcut for CI (no real Clerk session needed).

---

## CI Wiring (GitHub Actions)

### Workflow: `verify.yml` — runs on PR + push to `main` + nightly schedule

**`full-verification` job:**
- Spins up a local Postgres 16 service container
- Runs `pnpm verify:full` (includes `pnpm test:e2e` against a built Next.js app)
- Uses CI placeholder env vars (no real API keys — AI layer test harness excluded)

**`browser-smoke` job:**
- Runs `pnpm test:e2e` only (Playwright smoke)

**`live-verification` job:**
- Runs only on `workflow_dispatch` or nightly schedule
- Uses real secrets — exercises live Supabase + Clerk + Anthropic integration

### Workflow: `verify-phase-6.yml` — runs on PR + push to `main`

- Uses real Stripe secrets from repository secrets
- Runs `pnpm verify:phase-6`
- Separate workflow so Phase 6 Stripe-env gate doesn't block PRs that lack billing secrets

### Workflow: `migrate.yml` — migration CI gate

- Runs Drizzle migrations against staging/prod on deploy triggers

**Common CI pattern:** all jobs pin action versions with full SHA digests (e.g., `actions/checkout@de0fac2e...`) for supply-chain security.

---

## Common Async Testing Patterns

**Async happy path:**
```typescript
it('returns 200 on success', async () => {
  const res = await POST(makeReq());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.someField).toBe('expected');
});
```

**Async error path:**
```typescript
it('throws typed error', async () => {
  await expect(someAction()).rejects.toBeInstanceOf(PolicyNotFoundError);
});
```

**Redirect assertion (Server Actions):**
```typescript
// next/navigation redirect throws — caught by rejects.toThrow
await expect(runAction()).rejects.toThrow('NEXT_REDIRECT:/target-path');
```

**Error Testing:**
```typescript
try {
  runAction();
  throw new Error('expected ForbiddenError throw, got fall-through');
} catch (err) {
  expect(err).toBeInstanceOf(ForbiddenError);
  expect((err as ForbiddenError).reason).toBe('admin role required');
}
```

**Time-sensitive tests (UTC boundary):**
```typescript
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-04-30T23:59:59.000Z'));
// ... test month-boundary logic
vi.useRealTimers();
```

**Module re-evaluation for env-var-sensitive modules:**
```typescript
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('fails closed when env var is missing', async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', '');
  const { getStripeClient } = await importClient(); // dynamic import
  expect(() => getStripeClient()).toThrow(StripeConfigError);
});
```

---

*Testing analysis: 2026-05-30*
