# Coding Conventions

**Analysis Date:** 2026-05-30
**Phase coverage:** Through Phase 6 Billing (inclusive)

---

## TypeScript Discipline

**Compiler flags (all enforced — `tsconfig.json`):**
- `"strict": true` — full strict mode
- `"noUncheckedIndexedAccess": true` — array element access returns `T | undefined`; forces null-check on `arr[0]`
- `"noImplicitOverride": true` — class method overrides must use `override` keyword
- `"noEmit": true` — compiler is type-check-only; Next.js builds separately

**`any` is banned:**
- `check:artifacts` (`scripts/check-artifacts.ts`) scans `middleware.ts` and all DB-layer files for `\bany\b` in type positions after stripping comments
- The one allowed exception: test file scope-cast lines carry `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a one-line justification comment (see `lib/db/repositories/policies.test.ts:99`)
- Pattern: `tx: txMock as any` — only when mocking Drizzle's chain builder, never in production code

**Path alias:** `@/*` maps to repo root (configured in both `tsconfig.json` and `vitest.config.ts`).

---

## Naming Patterns

**Files:**
- Route handlers: `route.ts` (Next.js convention), tests alongside: `route.test.ts`
- Server Actions files: `actions.ts` inside the route group directory, tests: `actions.test.ts`
- Repository files: `snake_case.ts` matching the DB table name (`policies.ts`, `policy_assignments.ts`)
- Library modules: `kebab-case.ts` within their `lib/<domain>/` directory
- Error class files: `errors.ts` per domain directory (`lib/auth/errors.ts`, `lib/stripe/errors.ts`)

**Functions / variables:**
- `camelCase` throughout — exported functions, local variables, object method names
- Repository methods: verb + noun (`findById`, `listAll`, `listForPolicy`, `create`, `record`)
- Orchestrator functions: business-verb form (`submitForReview`, `publish`, `recordAcknowledgment`)
- Boolean predicates: `isPlanTier`, `isHandledEventType`, `isUsageBound`
- Type guards: `function is<Type>(value: unknown): value is <Type>` pattern

**Types and interfaces:**
- `PascalCase` for all types, interfaces, classes, enums
- Exported class error names: `<Domain>Error` suffix (`BootstrapError`, `TierLimitExceededError`, `StripeConfigError`, `IllegalTransitionError`)
- Zod schemas: `<Entity>Schema` suffix (`PolicyIdSchema`, `DraftSchema`)
- Branded types: `type <Entity>Id = z.infer<typeof <Entity>IdSchema>` (`PolicyId`)
- Drizzle inferred types: `typeof <table>.$inferInsert` / `typeof <table>.$inferSelect`

---

## Typed Error Hierarchy (ADR-026, extended through Phase 6)

Every domain maintains its own typed error classes; raw `throw new Error(...)` is **banned** in these scopes (enforced by `scripts/check-error-discipline.ts` via `ts-morph` AST scan):

**`lib/auth/errors.ts` — `BootstrapError` hierarchy:**
```typescript
abstract class BootstrapError extends Error {
  abstract readonly code: BootstrapErrorCode;
}
// Concrete subclasses (each sets this.name = 'ClassName' explicitly):
class NotAuthenticatedError extends BootstrapError   // code: 'NOT_AUTHENTICATED'
class NoActiveOrganizationError extends BootstrapError // code: 'NO_ACTIVE_ORGANIZATION'
class InvalidRoleError extends BootstrapError          // code: 'INVALID_ROLE'
abstract class ProvisioningRaceError extends BootstrapError
class OrgNotProvisionedError extends ProvisioningRaceError  // code: 'ORG_NOT_PROVISIONED'
class UserNotProvisionedError extends ProvisioningRaceError // code: 'USER_NOT_PROVISIONED' + subCode
class ForbiddenError extends BootstrapError            // code: 'FORBIDDEN'
// NOT a BootstrapError (intentional — infra outage, must rethrow):
class ClerkAuthFailedError extends Error               // code: 'CLERK_AUTH_FAILED'
```

**`lib/stripe/errors.ts` — billing domain (Phase 6):**
```typescript
class TierLimitExceededError extends Error  // code: 'TIER_LIMIT_EXCEEDED'
class StripeConfigError extends Error       // code: 'STRIPE_CONFIG_ERROR'
class StripeCatalogConfigError extends Error // code: 'STRIPE_CATALOG_CONFIG_ERROR'
```

**`lib/policies/errors.ts` — policy domain (Phase 5):**
- `PolicyDomainError` hierarchy with `PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError`, `AcknowledgmentNotRecordedError`

**Enforcement scope of `check:error-discipline`:** `lib/auth/**`, `lib/stripe/**`, `lib/policies/**` — all `.ts`/`.tsx` except `errors.ts` definition files and test files.

**Constructor pattern (consistent across all error classes):**
```typescript
class MyError extends SomeBase {
  readonly code = 'MY_CODE' as const;
  constructor(public readonly someField: string) {
    super(`Human message: ${someField}`);
    this.name = 'MyError'; // must be explicit (for log grep continuity)
  }
}
```

---

## Zod Validation and Branded Types

**Zod usage:** Validation at trust boundaries only — route handler bodies, Server Action FormData, URL params.

**Branded type pattern (`lib/policies/types.ts`):**
```typescript
export const PolicyIdSchema = z.string().uuid().brand<'PolicyId'>();
export type PolicyId = z.infer<typeof PolicyIdSchema>;
export function policyIdFromString(value: string): PolicyId {
  return PolicyIdSchema.parse(value); // throws ZodError on invalid input
}
```

**Route handler body validation (`app/api/ai/draft/route.ts`):**
```typescript
const body = DraftSchema.parse(await req.json()); // .strict() — unknown keys → ZodError → 400
```

**Zod parse vs safeParse:** use `.parse()` inside a try block that catches `ZodError`; use `.safeParse()` when the caller needs to branch on failure without throwing.

**Brand enforcement gate:** `scripts/check-policy-id-brand.ts` (ts-morph AST) pins `PolicyId` in parameter signatures for all repository methods and orchestrator functions listed in `REPO_TARGETS` and `ORCH_TARGETS`.

---

## Import Organization

**Order (no formatter enforced, but consistent pattern):**
1. `'server-only'` (top-of-file guard — first import in all server-only modules)
2. Third-party framework (`'next/server'`, `'next/navigation'`, `'@clerk/nextjs/server'`)
3. Third-party libraries (`'stripe'`, `'@anthropic-ai/sdk'`, `'drizzle-orm'`, `'zod'`)
4. Internal `@/lib/` imports (domain order: auth → db → stripe → ai → policies)
5. Relative imports within the same directory

**`server-only` guard:** every file in `lib/db/`, `lib/auth/`, `lib/stripe/`, `lib/ai/`, and all route handlers starts with `import 'server-only'`. The vitest config stubs this at `tests/stubs/server-only.ts` to prevent throws in jsdom test environment.

---

## Repository / Query Patterns (Org-ID Scoping)

**All repository methods operate through `OrgScope` (never raw `db`):**
```typescript
// lib/db/scoped.ts — wraps db in a transaction with RLS SET LOCAL calls
export async function withOrgScope<T>(
  ctx: OrgContext,
  fn: (scope: OrgScope) => Promise<T>,
): Promise<T>
```

**Repository shape:** exported object literal with named methods:
```typescript
export const Policies = {
  findById: (s: OrgScope, id: PolicyId) => s.tx.select(...).from(...).where(...),
  listAll: (s: OrgScope) => ...,
  // etc.
};
```

**`org_id` scoping rule:** every query inside a repository uses `s.tx` (the scoped transaction), never the raw `db` barrel. RLS policies enforce at the DB level; app layer enforces via `withOrgScope`.

**Approved raw `@/lib/db` importers** (allow-listed in both `check:db-imports` and `check:artifacts`):
- `lib/db/scoped.ts` — the scope wrapper itself
- `lib/auth/context.ts` — bootstrap phase, before scope opens
- `lib/stripe/products.ts` — tier-limit check before scope opens (WARNING-2 exception)
- `app/api/webhooks/clerk/route.ts` — service-role webhook, no user org scope
- `app/api/webhooks/stripe/route.ts` — billing webhook, transaction-scoped idempotency

---

## Server Actions vs Route Handlers

**Server Actions (`actions.ts` files):**
- Used for admin-only form submissions: policy create/publish/archive, Stripe checkout, billing portal
- Pattern: `'use server'` directive, accept `(prevState: unknown, formData: FormData)` for `useActionState` compatibility
- Auth: call `getOrgContext()` + `requireAdminFromCtx(ctx)` at the top before any business logic
- Employee acknowledgment: `recordAcknowledgment` called from a Server Action in `app/(employee)/my-policies/[id]/actions.ts`
- Stripe actions (`app/(admin)/settings/actions.ts`): tier/interval intent read from FormData, but price lookup always from server catalog (`tierAndIntervalToPriceId`) — client-supplied price fields ignored

**Route Handlers (`route.ts` files):**
- Used for AI endpoints (`/api/ai/draft`, `/api/ai/summary`, `/api/ai/qa`, `/api/ai/consistency`)
- Used for webhooks (`/api/webhooks/clerk`, `/api/webhooks/stripe`)
- AI routes: `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'`
- Auth pattern (D-37): `getOrgContext()` + `requireAdminFromCtx(ctx)` called **outside** the try block so auth errors propagate as 401/403, not folded into the 503 fallback

**Error routing in route handlers:**
```typescript
export async function POST(req: Request): Promise<Response> {
  // Auth OUTSIDE try — typed BootstrapError/ForbiddenError → Next.js error boundary
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  try {
    await requireTierLimit(ctx.orgId, 'aiDraftsMonthly'); // → 429/403 if exceeded
    const body = Schema.parse(await req.json());          // → 400 on ZodError
    // ... business logic
  } catch (err) {
    if (err instanceof TierLimitExceededError) return NextResponse.json({...}, { status: err.statusCode });
    if (err instanceof z.ZodError) return NextResponse.json({...}, { status: 400 });
    return NextResponse.json({ error: 'ai_service_unavailable', retryAfter: 30 }, {
      status: 503, headers: { 'Retry-After': '30' },
    });
  }
}
```

---

## Claude API (Anthropic) Conventions

**Client singleton (`lib/ai/client.ts`):**
```typescript
export const CLIENT_OPTIONS = { maxRetries: 0, timeout: 25_000 } as const;
export function getAnthropicClient(): Anthropic { ... } // lazy singleton
```

**Prompt caching (`lib/ai/cache.ts`):**
- `EPHEMERAL_CACHE = { type: 'ephemeral' }` — 5-min TTL for Draft, Summary, Consistency system prompts
- `LONG_CACHE = { type: 'ephemeral', ttl: '1h' }` — 1h TTL for Q&A per-org policy library block
- All system prompts use `buildCachedSystem(text)` → `[{ type: 'text', text, cache_control: EPHEMERAL_CACHE }]`
- Q&A composes two blocks: LONG_CACHE first, EPHEMERAL_CACHE second (Anthropic rejects inverse order)

**`ai_generations` audit row:** every successful Claude API call writes one row. Row is never written on failure (SUCCESS-ONLY semantic). Columns: `type` (`'draft'|'summary'|'qa'|'consistency'`), `model`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `result`, `idempotencyKey`, `policyId`, `orgId`.

**Models:** `MODEL_SONNET` (`'claude-sonnet-4-6'`) for draft/Q&A/consistency; `MODEL_HAIKU` (`'claude-haiku-4-5'`) for TL;DR summaries only.

**Tier check before API call:** `await requireTierLimit(ctx.orgId, 'aiDraftsMonthly')` must be called before any `messages.create`. On overage, throws `TierLimitExceededError` — Anthropic is never called.

---

## Phase 6 Stripe Conventions

### Webhook Handler (`app/api/webhooks/stripe/route.ts`)

**Raw-body signature verification:**
```typescript
const rawBody = await request.text(); // raw string, NOT parsed JSON
const signature = request.headers.get('stripe-signature');
// Missing signature → 400 before calling constructEvent
event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
```
The raw string is passed to `constructEvent` unchanged. Parsing it as JSON before verification would allow payload tampering.

**Fail-closed on missing webhook secret:**
```typescript
const webhookSecret = process.env[WEBHOOK_SECRET_ENV]?.trim();
if (!webhookSecret) { return response({ status: 500, ... }); }
```

**Canonical subscription retrieval:** for all events that affect subscription state (checkout completed, invoice paid, subscription updated/deleted), the handler **always** retrieves the current subscription from Stripe API rather than trusting event payload fields. This prevents stale/out-of-order events from writing incorrect state.

**Idempotency via `stripeEvents` table:**
```typescript
// Inside a single transaction:
const inserted = await tx.insert(stripeEvents).values({ id: eventId })
  .onConflictDoNothing().returning({ id: stripeEvents.id });
if (inserted.length === 0) return { status: 'duplicate' }; // short-circuit
// Then update organizations table within the same tx
```
Transaction commit atomically marks the event processed and updates billing state. If the DB write fails, the event is NOT marked processed → Stripe retries.

**DB as source of truth:** subscription state lives on `organizations.planTier`, `organizations.stripeSubscriptionStatus`, etc. Client-side subscription checks are forbidden; always read from DB via `withOrgScope`.

**Subscription normalization (`lib/stripe/normalize.ts`):** `normalizeSubscription(subscription, eventCreatedAtUnix)` returns a discriminated union:
- `{ kind: 'entitled', planTier }` — active/trialing
- `{ kind: 'preserve-tier' }` — past_due (keep current tier, mark status)
- `{ kind: 'downgrade', planTier: 'starter' }` — canceled/expired/unpaid/paused
- `{ kind: 'link-only' }` — incomplete (store IDs without granting tier)
- `null` — malformed subscription (noop)

**Masked logging:** customer and subscription IDs are never logged in full. Always use `maskCustomerId(id)` and `maskSubscriptionId(id)` from `lib/stripe/mask.ts` before any `console.warn`/`console.error` call in the webhook handler.

**Handled event types (exhaustive switch, fail-silent on unhandled):**
```typescript
const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
] as const;
```
All other event types return `200 { status: 'unhandled' }` — no DB write, no error.

**`invoice.payment_failed` special handling:** marks `stripeSubscriptionStatus: 'past_due'` without changing `planTier` (grace period — org retains access until Stripe cancels the subscription).

### Stripe Client (`lib/stripe/client.ts`)

**Lazy singleton, typed config error:**
```typescript
export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new StripeConfigError('STRIPE_SECRET_KEY');
  stripeClient = new Stripe(secretKey); // no apiVersion pinned — use SDK default
  return stripeClient;
}
```

**No `apiVersion` pinned** — the SDK ships a default that matches the installed version. Tests assert `stripeInstances[0]?.options?.apiVersion` is `undefined`.

### Stripe Catalog (`lib/stripe/catalog.ts`)

Six price IDs read from env vars (`STRIPE_PRICE_<TIER>_<INTERVAL>`). `buildCatalog()` throws `StripeCatalogConfigError` on missing or duplicate price IDs, but is invoked **lazily** via `getPriceCatalog()` (`cachedCatalog ??= buildCatalog()`) on first access — not at module load — so importing the module is side-effect-free (Cause-B build-coupling fix, PR #38). The built catalog array is frozen (`Object.freeze`); the old eager `PRICE_CATALOG` export was removed.

```typescript
export function priceIdToTier(priceId: string): PlanTier | undefined
export function tierAndIntervalToPriceId(tier: PlanTier, interval: PriceInterval): string | undefined
```

### Tier-Limit Checks (`lib/stripe/products.ts`)

**Pattern:** call `await requireTierLimit(orgId, feature)` at the start of any gated action. Feature strings come from `TierFeature = keyof typeof TIER_LIMITS.starter`.

**WARNING-2 spy contract:** `checkTierLimit` and `requireTierLimit` call helpers (`readPlanTier`, `countDraftsThisMonth`, `countOrgUsers`) via `self.*` namespace import (not direct closure call) to make them interceptable by `vi.spyOn` in tests.

**Status codes:** `TierLimitExceededError.statusCode` carries `429` (usage-bound: `aiDraftsMonthly`, `maxUsers`) or `403` (tier-bound: boolean features). Endpoints discriminate at the catch site via `err.statusCode`, not by feature name.

### Checkout / Portal Actions (`app/(admin)/settings/actions.ts`)

**DB-as-source-of-truth enforcement:**
- Checkout intent (tier + interval) comes from FormData, but the price ID is **always** resolved server-side via `tierAndIntervalToPriceId`
- `client_reference_id` and `metadata.policyPilotOrgId` are always set from the server-resolved `ctx.orgId` — never from client-supplied form fields
- Existing `stripeCustomerId` from the DB row is passed to Stripe as `customer` to link subscriptions to known customers

**Active subscription guard (first checkout only):** if `stripeCustomerId` is set AND `stripeSubscriptionStatus` is `'active' | 'trialing' | 'past_due'`, redirect to billing portal instead of creating a new checkout.

**Exception:** new orgs seeded with `stripeSubscriptionStatus: 'trialing'` but no `stripeCustomerId` are allowed to proceed to checkout (the seed status is a placeholder, not a real Stripe subscription).

---

## Verification Gates (ts-morph / artifact scripts)

All gates are wired into `pnpm verify:phase-N` chains:

| Script | What it checks | Tool |
|--------|----------------|------|
| `check:artifacts` | ~150 artifact assertions across all phases (existence, content sentinels, env, security) | Node fs + regex |
| `check:error-discipline` | No raw `throw new Error(...)` in `lib/auth/`, `lib/stripe/`, `lib/policies/` | ts-morph AST |
| `check:policy-id-brand` | `PolicyId` type annotation on repository + orchestrator signatures | ts-morph AST |
| `check:db-imports` | No unauthorized `@/lib/db` imports outside allow-list | ts-morph AST |
| `check:rls` | RLS policies exist on correct tables | DB query |
| `check:auth-context` | `getOrgContext` shape, `Role` union | react-server import check |
| `check:admin-routes` | Admin route handlers import `requireAdmin`/`requireAdminFromCtx` | ts-morph or regex |
| `check:ai-prompts` | Prompt template sentinels in `lib/ai/prompts.ts` vs `reference/PROMPTS.md` | Node fs |
| `check:acknowledgment-immutability` | `Acknowledgments` repository has no `update`/`delete` keys | ts-morph or regex |
| `db:verify` | All migrations applied, RLS + GRANTs + column shape | `scripts/check-deploy-schema.ts` |

**ts-morph version:** `28.0.0` (pinned in devDependencies).

---

## Logging

**Pattern:** `console.warn` for non-fatal no-ops, `console.error` for failures. No structured logging library yet (Phase 7+ may add).

**Stripe webhook:** log via named helpers:
```typescript
function logNoop(reason: string, candidates: OrgResolutionCandidates): void {
  console.warn('[stripe-webhook] no-op', {
    reason,
    eventType: candidates.eventType,
    customerId: maskCustomerId(candidates.customerId),  // always masked
    subscriptionId: maskSubscriptionId(candidates.subscriptionId), // always masked
    orgHintCount: candidates.orgIds.length,
  });
}
```

**Structured object literal style:** log calls pass an object `{ reason, ... }` not a concatenated string.

---

## Comment Conventions

**ADR references:** files that implement a decision cite the ADR inline — `// ADR-026`, `// D-37`, `// SPEC R2`.

**Plan citations:** implementation files carry the plan that created them — `// Plan 03-02 Task 1`.

**WARNING blocks:** documented deviations from the default pattern use `// WARNING-N` comments with full rationale (example: `// WARNING-2 mandated split-helpers...` in `lib/stripe/products.ts`).

**Enforcement limits:** gates that have known gaps document them explicitly in comments (example: `check-error-discipline.ts` lists aliased/data-flow/wrapped patterns it cannot catch).

---

*Convention analysis: 2026-05-30*
