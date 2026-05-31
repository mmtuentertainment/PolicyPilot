# Phase 6: Billing - Research

**Researched:** 2026-05-28
**Domain:** Stripe billing integration — Checkout, Customer Portal, webhook lifecycle, tier gating, additive migration
**Confidence:** HIGH (all critical claims verified via official Stripe docs, Next.js docs, and live codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package And Module Shape**
- D-01: Official Stripe SDK is approved and server-only. Use only from server-only modules, route handlers, or Server Actions. No Stripe.js or other billing package in Phase 6.
- D-02: Stripe MCP is optional tooling, not an implementation dependency.
- D-03: Keep tier authority in `lib/stripe/products.ts`. Phase 6 price catalog helpers anchor here.
- D-04: Small server-only Stripe helper modules acceptable for client singleton, checkout/portal builders, masking utilities, subscription normalization. Helpers touching raw `db` must be in the allow-list or inside the webhook route.

**Stripe Catalog And Checkout**
- D-05: Validate all six Price IDs as a closed catalog. Fail closed on missing, duplicate, or unknown.
- D-06: Public pricing carries intent only — `tier` and `interval` are non-authoritative.
- D-07: Trusted checkout starts from `/settings` (existing Settings sidebar placeholder).
- D-08: Checkout creation uses server auth context: `getOrgContext()`, active org resolution, `requireAdminFromCtx(ctx)`, server-derived Price ID, set `client_reference_id`, session metadata, `subscription_data.metadata.policyPilotOrgId` from server `orgId`.
- D-09: Do not pre-create Stripe Customers. If `organizations.stripeCustomerId` exists pass it; otherwise let Checkout create it.
- D-09a: Prevent duplicate active subscriptions — reject or redirect to Customer Portal if org already has `active`, `trialing`, or `past_due` subscription.

**Durable Billing State And Migration**
- D-10: Ship one forward additive migration after `0011_qa_citation_grants`.
- D-11: Partial unique indexes for `organizations.stripe_customer_id` and `organizations.stripe_subscription_id` where not null.
- D-12: Schema is diagnostic, not a snapshot store. Do not store customer email, raw payloads, API keys, webhook secrets.
- D-13: Update `lib/db/schema.ts`, deployment schema verifiers, artifact checks, and schema parity scripts.

**Webhook Correctness**
- D-14: Route locked at `app/api/webhooks/stripe/route.ts`, exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, calls `request.text()` exactly once before `stripe.webhooks.constructEvent(...)`.
- D-15: Service-role DB access. The route is already in the ADR-023 allow-list (`check-db-imports.ts`). Does not use `withOrgScope` — must narrow to exactly one `organizations.id`.
- D-16: Re-fetch current Stripe Subscription via SDK for `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`.
- D-17: Org mapping must be unambiguous. Zero/multiple matches, unknown Price IDs, missing signals fail closed.
- D-17a: Metadata is reconciliation hint, not sole authority. Cross-check stored customer/subscription IDs.
- D-18: Subscription must have exactly one recognized recurring Phase 6 Price ID. Multiple items, unknown prices, one-off prices fail closed.
- D-19: Status policy: `active`/recognized `trialing` sync paid entitlement; `past_due` preserves last paid tier; `incomplete` links unambiguous IDs without upgrading; `unpaid`/`canceled`/`incomplete_expired`/`paused` downgrade to Starter.
- D-19a: Scheduled cancellation remains entitling until Stripe reports non-entitling status or verified deletion.
- D-20: `invoice.payment_failed` is non-destructive — sets `stripeSubscriptionStatus = 'past_due'`, no downgrade.
- D-21: Idempotency insert and org mutation are one DB transaction.
- D-21a: Different event IDs for the same logical object must be harmless.
- D-22: `stripeLastEventCreated` is diagnostic only, not an entitlement ordering gate.

**Admin Billing UI And Portal**
- D-23: Enable the existing disabled Settings sidebar placeholder; update `middleware.ts` `ADMIN_URL_PATTERNS`.
- D-24: Billing page display: current plan, subscription status, current period end, cancel-at-period-end, Manage billing or checkout/setup CTA. No invoice history, no customer email, no full Stripe IDs.
- D-25: Customer Portal creation requires admin org context, uses only `organizations.stripeCustomerId`, ignores client-supplied IDs, returns short-lived portal URL.
- D-26: Reuse existing shadcn Card/Button/Badge/Select/Tooltip patterns.

**Tier Gates**
- D-27: `maxUsers` becomes real count — extend `checkTierLimit` to count org users.
- D-28: No first-party invite/user-management flow in Phase 6.
- D-28a: `maxUsers` non-destructive — correct predicate only, no user deletion.
- D-29: Tier-bound gates stay app-layer.
- D-30: Starter upgrade path remains `/pricing`.

**Testing, CI, And UAT**
- D-31: Tests split: unit (catalog, normalization, status policy, typed errors) + route/webhook (signature fail, duplicate delivery, replay, out-of-order, stale invoice, unknown price, ambiguous org) + DB-backed (migration/index shape, transaction rollback where mocks insufficient).
- D-32: Mock Stripe SDK at module boundaries for automated tests.
- D-33: UAT uses Stripe sandbox/test-clock flows.
- D-34: UAT evidence masked.
- D-35: `verify:phase-6` is cumulative and hosted.

### Claude's Discretion
- Exact helper names and file split inside `lib/stripe/*` as long as tier/price source of truth remains `lib/stripe/products.ts` and raw DB imports stay explicitly allow-listed.
- Exact billing settings layout and copy within minimal display fields and no raw billing identities.
- Exact test file names and fixture builders as long as SPEC-required replay/out-of-order/status-policy coverage lands.

### Deferred Ideas (OUT OF SCOPE)
- Sales tax, coupons, trials, custom dunning emails, invoice PDFs, revenue analytics, custom billing identity.
- Full user-management/invitation flow that blocks Clerk-created users before `maxUsers` is exceeded.
- Displaying invoice history or customer billing identity inside PolicyPilot.
- Tax/regulatory billing treatment and production backfill/migration of existing Stripe customers.
- Stripe MCP-dependent workflows.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-tier-starter | Starter tier ($79/mo, 25 users): includes policy library, AI, acks, notifications. Excludes approval workflows, Slack, consistency check, custom branding, SSO, API access. | TIER_LIMITS.starter already correct in lib/stripe/products.ts; Phase 6 wires the write path (checkout → webhook → planTier) |
| REQ-tier-growth | Growth tier ($199/mo, 100 users): all Starter plus approval workflows, Slack, consistency check, advanced reporting. | TIER_LIMITS.growth already correct; consistencyCheck gate already enforces 403 at AI endpoint |
| REQ-tier-business | Business tier ($449/mo, 500 users): all Growth plus custom branding, SSO, API access, priority support. `aiDraftsMonthly = -1`. | TIER_LIMITS.business already correct; Phase 6 wires Stripe events so planTier is upgraded from 'starter' to 'business' on verified webhook |
</phase_requirements>

---

## Summary

Phase 6 turns a complete static tier-limit system (already shipping and green through Phase 5) into a live Stripe-backed entitlement loop. The read path (`checkTierLimit`/`requireTierLimit`/`TIER_LIMITS`) is already shipped and tested. Phase 6 owns the **write path**: a Stripe Checkout Session created server-side for an authenticated admin, a five-event webhook handler that durably syncs billing state onto `organizations`, and a Customer Portal surface for managing subscriptions.

The technical complexity is concentrated in three areas. First, **webhook correctness**: for `checkout.session.completed`, `invoice.paid`, and `customer.subscription.updated`, entitlement must be derived from the current Stripe Subscription retrieved via the SDK — not stale event snapshots — because Stripe can deliver events out of order and can retry events after the underlying subscription has changed state. Second, **idempotency**: the `stripe_events` dedup table already exists; Phase 6 must wrap the dedup INSERT and the org mutation in a single DB transaction so a rollback on mutation failure leaves no zombie idempotency record (contrast the Clerk webhook which uses a delete-before-retry pattern for different failure semantics). Third, **fail-closed org mapping**: unknown Price IDs, missing metadata, zero org matches, or multiple org matches must all result in no `planTier` change.

The **standard stack** is minimal: the official `stripe` npm package (v22.2.0 on npm as of 2026-05-27, from stripe/stripe-node, no postinstall script) plus one forward-only additive Drizzle migration. All other patterns (raw-body webhook, typed errors, vi.spyOn split-helper test architecture, ts-morph artifact gates, cumulative verify chain) already exist in the codebase and extend cleanly.

**Primary recommendation:** Follow the locked decision set verbatim. The biggest risk is not in the Stripe API surface (which is well-documented and the SDK handles the edge cases) but in the transaction/idempotency boundary for the webhook handler and in correctly wiring the six env-var Price IDs into a fail-closed catalog before any checkout or webhook code runs.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Price ID catalog validation | Server (lib/stripe) | — | Price IDs are secrets/env; validation must be server-only and fail before any request is served |
| Checkout Session creation | API / Backend (Server Action or route) | — | Client never supplies authoritative org/price/customer; getOrgContext() required before any Stripe call |
| Stripe webhook processing | API / Backend (route handler) | Database | service-role DB write path; must bypass RLS and resolve cross-org Stripe identifiers |
| Webhook idempotency | Database (stripe_events) | API | Transaction-scoped: INSERT + org mutation atomically; existing table, no new schema beyond organizations columns |
| Subscription entitlement state | Database (organizations) | API | planTier is the cached, app-visible entitlement field; only webhook writes it |
| Tier gate enforcement | API / Backend (route handlers, Server Actions) | — | Per ADR-024: middleware is routing only; gates stay in application layer |
| maxUsers count | API / Backend (lib/stripe/products.ts helper) | Database | DB count query via exported helper (WARNING-2 split-helper pattern already established) |
| Customer Portal session creation | API / Backend (Server Action or route) | — | Must use organizations.stripeCustomerId only; never trust client-supplied customer ID |
| Billing status display | Frontend Server (RSC) | Database | Reads organizations row via getOrgContext(); display only, no billing authority on client |
| Admin settings navigation | Frontend Server (SSR) | Middleware | Add /settings to ADMIN_URL_PATTERNS; enable disabled sidebar placeholder |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | 22.2.0 | Checkout Session, Customer Portal, webhook constructEvent, Subscription retrieve, typed Stripe objects | Official Stripe SDK; only legitimate choice per D-01; already in ADR-023 allow-list; no postinstall script [VERIFIED: npm registry 2026-05-28] |
| `drizzle-orm` | ^0.45.2 (already installed) | DB transaction wrapping `stripe_events` INSERT + org mutation | Already in stack; `.transaction()` method supports atomic multi-statement operations [VERIFIED: in package.json] |

### Supporting (already in project — no new installs)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.23.5 (already installed) | Validate intent body from pricing page (`tier`, `interval`) in checkout Server Action | Non-authoritative input validation |
| `server-only` | (Next.js built-in) | Guard all `lib/stripe/*` modules from client import | All billing modules must carry this import |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Re-fetching subscription in webhook | Trust event object directly | Event objects can be stale replays; current Subscription fetch is required for `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated` per D-16 [CITED: docs.stripe.com/billing/subscriptions/webhooks] |
| Transaction-scoped idempotency | Delete-before-retry (Clerk pattern) | Clerk uses delete-before-retry because Clerk retries on non-200 and must re-fire. Stripe retries on non-2xx too but the correct pattern for Stripe is to dedup by event.id and return 200 on duplicate — the transaction ensures atomicity without the delete dance |
| stripe.webhooks.constructEvent for signature | Custom HMAC validation | constructEvent handles timing tolerance, multi-signature key rotation, and constant-time comparison; hand-rolling gets any of these wrong [CITED: docs.stripe.com/webhooks] |

**Installation (when ready to execute — DO NOT install now):**
```bash
pnpm add stripe
```

---

## Package Legitimacy Audit

> slopcheck could not be installed in this research task (read-only constraint). All packages marked per graceful degradation protocol.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `stripe` | npm | ~13 years (2011) | ~2.5M/week [ASSUMED] | github.com/stripe/stripe-node | not run | Approved — official Stripe SDK, maintainer stripe-bindings@stripe.com, no postinstall script, listed in ADR-023 allow-list. Operator previously approved (SPEC.md). |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. The `stripe` package is tagged `[ASSUMED]` per protocol, but the package has been operator-approved in 06-SPEC.md and is the single official Stripe SDK from stripe/stripe-node with no postinstall script. The planner does not need a `checkpoint:human-verify` gate since operator approval already supersedes slopcheck status.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (pricing intent)
  │
  │ tier=growth&interval=monthly (non-authoritative)
  ▼
Admin /settings Page (RSC)
  │ reads organizations row via getOrgContext()
  │ shows: current plan, status, period end, CTA
  ▼
Checkout Server Action / Route
  │ getOrgContext() + requireAdminFromCtx()
  │ look up Price ID from closed catalog
  │ check org has no active/trialing/past_due subscription
  ├─ if already subscribed → stripe.billingPortal.sessions.create → redirect
  └─ else → stripe.checkout.sessions.create(subscription mode)
              client_reference_id = orgId
              metadata.policyPilotOrgId = orgId
              subscription_data.metadata.policyPilotOrgId = orgId
              customer = org.stripeCustomerId if present
  │
  ▼ Stripe-hosted Checkout
  │
Stripe → POST /api/webhooks/stripe
  │ request.text() once
  │ stripe.webhooks.constructEvent(rawBody, sig, secret)
  │ Fail → 400 (invalid signature)
  │ pass
  ├─ Re-fetch Subscription via SDK (for completed/paid/updated)
  ├─ Resolve org: metadata + stored customer/subscription IDs
  │   → zero matches or multiple matches → log + 200 no-op
  │   → one match → proceed
  ├─ DB TRANSACTION:
  │   1. INSERT stripe_events(id) ON CONFLICT → 200 no-op (duplicate)
  │   2. UPDATE organizations SET planTier, stripeCustomerId, etc.
  │   → commit both or rollback both
  └─ → 200 OK
  │
organizations.planTier (truth)
  │
checkTierLimit(orgId, feature)
  │ reads planTier via readPlanTier() [WARNING-2 split-helper]
  │ counts ai_generations for aiDraftsMonthly
  │ counts users for maxUsers (NEW in Phase 6)
  └─ → { allowed, limit, current }
       → TierLimitExceededError (429 usage / 403 tier-bound)

Admin /settings → Customer Portal Route
  │ requireAdminFromCtx(ctx)
  │ read organizations.stripeCustomerId
  ├─ if null → show checkout/setup CTA
  └─ stripe.billingPortal.sessions.create({ customer: storedId, return_url })
       → short-lived portal URL → redirect
```

### Recommended Project Structure

```
lib/stripe/
├── client.ts          — Stripe singleton (server-only, lazy-initialized)
├── catalog.ts         — Six Price ID → {tier, interval} map; validated at startup
├── products.ts        — TIER_LIMITS, checkTierLimit, requireTierLimit (existing; extend maxUsers)
├── errors.ts          — TierLimitExceededError (existing)
├── normalize.ts       — subscriptionToOrgBilling() pure helper; maps Stripe.Subscription → org fields
├── mask.ts            — maskCustomerId(), maskSubscriptionId() for sanitized logs
├── products.test.ts   — Existing tier tests (extend for catalog + maxUsers)
├── catalog.test.ts    — Catalog round-trip tests
└── normalize.test.ts  — subscriptionToOrgBilling() status-policy unit tests

app/api/webhooks/stripe/
└── route.ts           — POST handler (runtime=nodejs, dynamic=force-dynamic)

app/(admin)/settings/
├── page.tsx           — Admin billing page (RSC; reads org billing state from DB)
├── actions.ts         — createCheckoutSessionAction, createPortalSessionAction

app/(marketing)/pricing/
└── page.tsx           — Update: add monthly/annual segmented control + query intent CTAs

drizzle/
└── 0012_billing_state.sql — Additive migration: 5 new org columns + 2 partial unique indexes

lib/db/schema.ts       — Add 5 new organizations columns to Drizzle schema

scripts/
├── check-deploy-schema.ts  — Extend: Phase 6 org column shape + index assertions
├── check-schema.ts         — Extend: same column/index assertions for TEST DB
└── check-artifacts.ts      — Extend: billing route, catalog, migration, UAT checklist presence

package.json           — Add verify:phase-6 script
.github/workflows/     — Add required Phase 6 CI verification job
```

### Pattern 1: Stripe Singleton Client

```typescript
// lib/stripe/client.ts
import 'server-only';
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('[stripe/client] STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(key, {
      // Pin to the API version matching the SDK's types.
      // stripe@22 defaults to '2025-04-30.basil' or similar — let the SDK
      // default rather than hard-coding a stale version string.
      // VERIFIED: stripe-node README recommends not pinning unless you need
      // an older version's behavior.
    });
  }
  return _stripe;
}
```

### Pattern 2: Closed Price Catalog

```typescript
// lib/stripe/catalog.ts
import 'server-only';
import type { PlanTier } from './products';

export type PriceInterval = 'monthly' | 'annual';

export interface CatalogEntry {
  tier: PlanTier;
  interval: PriceInterval;
  priceId: string;
}

// Initialized once at module load (server-only). Throws if any env var is missing.
function buildCatalog(): readonly CatalogEntry[] {
  const slots: Array<{ env: string; tier: PlanTier; interval: PriceInterval }> = [
    { env: 'STRIPE_PRICE_STARTER_MONTHLY',  tier: 'starter',  interval: 'monthly' },
    { env: 'STRIPE_PRICE_STARTER_ANNUAL',   tier: 'starter',  interval: 'annual'  },
    { env: 'STRIPE_PRICE_GROWTH_MONTHLY',   tier: 'growth',   interval: 'monthly' },
    { env: 'STRIPE_PRICE_GROWTH_ANNUAL',    tier: 'growth',   interval: 'annual'  },
    { env: 'STRIPE_PRICE_BUSINESS_MONTHLY', tier: 'business', interval: 'monthly' },
    { env: 'STRIPE_PRICE_BUSINESS_ANNUAL',  tier: 'business', interval: 'annual'  },
  ];
  const catalog: CatalogEntry[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const id = process.env[slot.env];
    if (!id) throw new Error(`[stripe/catalog] env var ${slot.env} is not set`);
    if (seen.has(id)) throw new Error(`[stripe/catalog] duplicate priceId for ${slot.env}: ${id}`);
    seen.add(id);
    catalog.push({ priceId: id, tier: slot.tier, interval: slot.interval });
  }
  return catalog as readonly CatalogEntry[];
}

export const PRICE_CATALOG: readonly CatalogEntry[] = buildCatalog();

export function priceIdToTier(priceId: string): PlanTier | undefined {
  return PRICE_CATALOG.find(e => e.priceId === priceId)?.tier;
}

export function tierAndIntervalToPriceId(
  tier: PlanTier,
  interval: PriceInterval,
): string | undefined {
  return PRICE_CATALOG.find(e => e.tier === tier && e.interval === interval)?.priceId;
}
```

### Pattern 3: Webhook Route Shape

```typescript
// app/api/webhooks/stripe/route.ts
// Source: 06-SPEC.md Billing Correctness Rules + docs.stripe.com/webhooks
import 'server-only';
import { db } from '@/lib/db'; // ADR-023 allow-listed
import { stripeEvents, organizations } from '@/lib/db/schema';
import { getStripeClient } from '@/lib/stripe/client';
import { priceIdToTier } from '@/lib/stripe/catalog';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const stripe = getStripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Webhook secret not configured', { status: 500 });

  // MUST call request.text() ONCE before constructEvent — stream is readable once.
  const rawBody = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  if (!sig) return new Response('Missing Stripe-Signature', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] signature verification failed: ${detail}`);
    return new Response('Invalid signature', { status: 400 });
  }

  // Dispatch to typed handler, wrapping in transaction-scoped idempotency.
  // Returns null when the event type is unhandled (log + 200 no-op).
  // Returns false when org mapping fails or price is unknown (log + 200 no-op).
  // Returns true on successful mutation.
  const result = await processEvent(stripe, event);
  void result; // 200 in all cases so Stripe stops retrying
  return new Response('OK', { status: 200 });
}
```

### Pattern 4: Transaction-Scoped Idempotency

```typescript
// Wraps the stripe_events INSERT + org mutation in one transaction.
// Duplicate event.id → conflict on INSERT → return without mutation.
// Mutation failure → rollback INSERT so Stripe retry can reprocess.
// Source: 06-SPEC.md § Webhook idempotency transaction rule
async function withEventIdempotency(
  eventId: string,
  mutation: (tx: typeof db) => Promise<void>,
): Promise<'duplicate' | 'success' | 'rolled-back'> {
  try {
    await db.transaction(async (tx) => {
      // Step 1: attempt insert — throws on PK conflict.
      const inserted = await tx
        .insert(stripeEvents)
        .values({ id: eventId })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      if (inserted.length === 0) {
        // Duplicate — rollback by throwing (Drizzle rolls back on throw inside transaction).
        throw Object.assign(new Error('__stripe_duplicate__'), { isDuplicate: true });
      }
      // Step 2: apply org mutation in the same transaction.
      await mutation(tx);
    });
    return 'success';
  } catch (err) {
    if (err instanceof Error && 'isDuplicate' in err) return 'duplicate';
    // Real mutation failure — the transaction rolled back both the INSERT and the mutation.
    console.error('[stripe-webhook] transaction rolled back:', err instanceof Error ? err.message : String(err));
    return 'rolled-back';
  }
}
```

### Pattern 5: Subscription Normalization

```typescript
// lib/stripe/normalize.ts — Source: 06-SPEC.md § Subscription entitlement status policy
import 'server-only';
import type Stripe from 'stripe';
import type { PlanTier } from './products';
import { priceIdToTier } from './catalog';

export interface OrgBillingFields {
  planTier: PlanTier;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: string;
  stripePriceId: string | null;
  stripeSubscriptionItemId: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeLastEventCreated: Date | null;
}

export function normalizeSubscription(
  sub: Stripe.Subscription,
  eventCreatedAt: number,
): OrgBillingFields | null {
  const item = sub.items.data[0];
  if (!item) return null; // no items — fail closed
  const priceId = item.price.id;
  const recognizedTier = priceIdToTier(priceId);

  const base = {
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    stripeSubscriptionStatus: sub.status,
    stripePriceId: priceId,
    stripeSubscriptionItemId: item.id,
    stripeCurrentPeriodEnd: new Date((item.current_period_end ?? 0) * 1000),
    stripeCancelAtPeriodEnd: sub.cancel_at_period_end,
    stripeLastEventCreated: new Date(eventCreatedAt * 1000),
  };

  switch (sub.status) {
    case 'active':
    case 'trialing':
      if (!recognizedTier) return null; // unknown price → fail closed
      return { ...base, planTier: recognizedTier };
    case 'past_due':
      // Preserve last known paid tier — caller supplies existing planTier.
      // Return null here; caller must merge with existing planTier.
      return { ...base, planTier: 'starter' }; // placeholder; caller overrides
    case 'unpaid':
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return { ...base, planTier: 'starter' };
    case 'incomplete':
      // Link IDs but do not upgrade planTier.
      return { ...base, planTier: 'starter' };
    default:
      return null;
  }
}
```

### Pattern 6: maxUsers Real Count

```typescript
// Extension to lib/stripe/products.ts — add countOrgUsers exported helper
// (WARNING-2 split-helper pattern already established for countDraftsThisMonth)
export async function countOrgUsers(orgId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`cast(count(*) as int)` })
    .from(users)
    .where(eq(users.orgId, orgId));
  return rows[0]?.c ?? 0;
}

// In checkTierLimit — extend the numeric branch:
const current =
  feature === 'aiDraftsMonthly'
    ? await self.countDraftsThisMonth(orgId)
    : feature === 'maxUsers'
    ? await self.countOrgUsers(orgId)
    : 0;
```

### Pattern 7: Checkout Server Action

```typescript
// app/(admin)/settings/actions.ts
'use server';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { getStripeClient } from '@/lib/stripe/client';
import { tierAndIntervalToPriceId } from '@/lib/stripe/catalog';
import { db } from '@/lib/db'; // MUST be in check-db-imports allow-list — confirm or add
import { organizations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

const CheckoutIntentSchema = z.object({
  tier: z.enum(['starter', 'growth', 'business']),
  interval: z.enum(['monthly', 'annual']),
});

export async function createCheckoutSessionAction(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  // Validate non-authoritative intent (only used to pick price ID)
  const intent = CheckoutIntentSchema.parse({
    tier: formData.get('tier'),
    interval: formData.get('interval'),
  });

  const orgId = ctx.orgId; // internal UUID from server context
  const priceId = tierAndIntervalToPriceId(intent.tier, intent.interval);
  if (!priceId) throw new Error('[checkout] unknown tier/interval combination');

  // Check for existing active subscription
  const orgRow = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const org = orgRow[0];
  if (!org) throw new Error('[checkout] org not found');

  const blockingStatuses = ['active', 'trialing', 'past_due'];
  if (org.stripeCustomerId && org.stripeSubscriptionStatus &&
      blockingStatuses.includes(org.stripeSubscriptionStatus)) {
    // Redirect to portal instead of creating a new checkout
    // (portal action handles this; for now redirect to settings)
    redirect('/settings?error=already_subscribed');
  }

  const stripe = getStripeClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: orgId,
    metadata: { policyPilotOrgId: orgId },
    subscription_data: { metadata: { policyPilotOrgId: orgId } },
    ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : {}),
    success_url: `${appUrl}/settings?checkout=success`,
    cancel_url: `${appUrl}/settings?checkout=cancelled`,
  });

  if (!session.url) throw new Error('[checkout] no checkout URL returned');
  redirect(session.url);
}
```

### Pattern 8: Additive Migration SQL

```sql
-- drizzle/0012_billing_state.sql
-- Phase 6 D-10/D-11 — additive billing-state columns for organizations.
-- Operator-approved 2026-05-27 per 06-SPEC.md § Approved Phase 6 Implementation Decisions.
-- ADDITIVE ONLY — no existing columns or constraints are modified.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_price_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_current_period_end" timestamptz,
  ADD COLUMN IF NOT EXISTS "stripe_cancel_at_period_end" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_last_event_created" timestamptz;

--> statement-breakpoint

-- Partial unique indexes: enforce one org per stripe_customer_id / subscription_id
-- when not null. Drizzle cannot represent these as .unique() — hand-written per project pattern.
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripe_customer_id_unique_idx"
  ON "organizations" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;

--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripe_subscription_id_unique_idx"
  ON "organizations" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
```

### Anti-Patterns to Avoid

- **Calling `request.json()` before `request.text()`:** The body stream is readable once. JSON parse consumes it and leaves the raw body empty, breaking `constructEvent`. Always `request.text()` first. [CITED: docs.stripe.com/webhooks, app/api/webhooks/clerk/route.ts RESEARCH comment]
- **Trusting event-snapshot entitlement for `invoice.paid`:** An `invoice.paid` event may arrive for a subscription that has since been canceled. Re-fetching `stripe.subscriptions.retrieve()` proves the subscription is still in an entitlement-eligible state before updating `planTier`. [CITED: docs.stripe.com/billing/subscriptions/webhooks]
- **Not rolling back the `stripe_events` insert on mutation failure:** If the INSERT commits but the org mutation fails and is NOT in the same transaction, the event is marked processed but the DB is stale. Stripe retries will hit the dedup and silently skip — permanent data loss. Must be one transaction. [CITED: 06-SPEC.md § Webhook idempotency transaction rule]
- **Relying on `stripeLastEventCreated` for entitlement ordering:** This field is diagnostic only. Two events with different `event.id` but same underlying subscription should each re-fetch and converge to canonical current state — ordering by event timestamp is not a substitute. [CITED: D-22]
- **Pre-creating Stripe customers for MVP:** The approved pattern (D-09) is to let Checkout create the customer and link it after the verified `checkout.session.completed` webhook. Pre-creating introduces reconciliation complexity with no MVP benefit.
- **Moving billing authority into middleware:** ADR-024 locks this — tier gating stays in application routes, Server Components, and server helpers. Middleware is routing only. [CITED: .planning/PROJECT.md ADR-024]
- **Importing raw `db` in helper modules outside the allow-list:** The Stripe webhook route is already allow-listed in `scripts/check-db-imports.ts`. Any new helper that touches raw `db` must either be called from the allow-listed route or get an explicit allow-list entry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripe signature verification | Custom HMAC + timestamp tolerance | `stripe.webhooks.constructEvent()` | Handles multi-signature key rotation, constant-time comparison, configurable 5-min timestamp tolerance window [CITED: docs.stripe.com/webhooks] |
| Subscription type narrowing in webhook | Manual `switch` on `event.type` + JSON parse | `stripe.webhooks.constructEvent()` returns typed `Stripe.Event`; discriminate on `event.type` | SDK provides discriminated union types for all event types |
| Stripe API version pinning | Hard-code `'2024-06-20'` or similar | Let the SDK use its bundled default (stripe@22 defaults to a recent version) | Pinning a stale version risks missing security patches; SDK default matches the types included in the npm package [ASSUMED — verify at execution] |
| Price ID mapping | Custom env-read logic scattered in routes | `lib/stripe/catalog.ts` singleton validated at module load | Fail-closed before any checkout or webhook runs |

**Key insight:** The Stripe Node.js SDK handles the hard parts of webhook security and type-safe event parsing. The value-add work in Phase 6 is the idempotency transaction pattern, the org-mapping resolution logic, and the status-policy normalization — none of which the SDK can do for you.

---

## Common Pitfalls

### Pitfall 1: Double-Consumption of Request Body

**What goes wrong:** `request.json()` called before `request.text()` returns an empty string, causing `stripe.webhooks.constructEvent()` to throw signature verification failure even for valid Stripe events.
**Why it happens:** Next.js App Router `Request` body is a `ReadableStream` — readable once. `request.json()` consumes it entirely.
**How to avoid:** Always call `await request.text()` as the very first body operation. Never call `request.json()` in the webhook route. The pattern is locked in D-14 and established in the Clerk webhook analog.
**Warning signs:** All webhook deliveries returning 400 "Invalid signature" despite the correct secret.

### Pitfall 2: Stale Invoice Reactivating a Canceled Org

**What goes wrong:** Stripe delivers `invoice.paid` for a subscription that has since been canceled. Blindly setting `planTier = recognized tier` from the invoice event reactivates an org that should be at Starter.
**Why it happens:** Stripe's retry mechanism can deliver old events out of order, including events from before a subscription was deleted.
**How to avoid:** For `invoice.paid`, always re-fetch the current Stripe Subscription via `stripe.subscriptions.retrieve(subscriptionId)` and verify: (a) subscription is in entitlement-eligible state, (b) subscription maps to exactly one org, (c) subscription has exactly one recognized price ID. If any check fails, treat as no-op. [CITED: docs.stripe.com/billing/subscriptions/webhooks]
**Warning signs:** `organizations.planTier` upgraded after a subscription deletion event was already processed.

### Pitfall 3: Transaction Rollback Not Covering the Idempotency Row

**What goes wrong:** `stripe_events` INSERT commits in one statement, org mutation runs in a second statement, mutation throws — INSERT is permanent but org state is wrong. Next Stripe retry hits the idempotency dedup and skips.
**Why it happens:** Using `onConflictDoNothing().returning()` pattern without wrapping in `db.transaction()`.
**How to avoid:** Both the INSERT into `stripe_events` and the `UPDATE organizations` must be inside the same Drizzle `db.transaction()` call. If the transaction throws, Postgres rolls back both statements atomically.
**Warning signs:** `stripe_events` rows present for events with no corresponding `organizations` update.

### Pitfall 4: Ambiguous Org Mapping

**What goes wrong:** A Stripe event is mapped to the wrong org because multiple orgs share a `stripeCustomerId` (shouldn't happen due to partial unique index) or because metadata disagrees with stored customer IDs.
**Why it happens:** Edge cases where `policyPilotOrgId` metadata is absent from the subscription (e.g., subscription created outside Checkout), or where a customer was reused across orgs before the partial unique index was applied.
**How to avoid:** Use the partial unique index constraint as the enforcement layer. Application code queries by `stripeCustomerId` and asserts exactly one row. If zero or multiple rows, log and return 200 no-op — fail closed with no mutation. [CITED: D-17, D-17a]
**Warning signs:** Log lines showing `[stripe-webhook] ambiguous org mapping: N matches for customer_id ***xxx`.

### Pitfall 5: Price IDs Not Validated at Startup

**What goes wrong:** A missing or misspelled env var for a Price ID is not caught until an actual checkout attempt occurs, producing an obscure error mid-session.
**Why it happens:** Lazy validation (only in route handler at runtime vs. module load).
**How to avoid:** `lib/stripe/catalog.ts` builds the catalog at module load and throws on missing or duplicate env vars. The `check-artifacts.ts` gate should assert all six env var names are present in `.env.local.example`.
**Warning signs:** `[stripe/catalog] env var STRIPE_PRICE_GROWTH_MONTHLY is not set` in logs at checkout time rather than at server start.

### Pitfall 6: Checkout for Already-Subscribed Org

**What goes wrong:** Admin clicks "Upgrade" on a Growth org, creating a second Checkout Session that creates a second subscription. Org ends up with two active subscriptions, dedup logic breaks, webhook mapping is ambiguous.
**Why it happens:** Missing guard checking `stripeSubscriptionStatus` before creating a Checkout Session.
**How to avoid:** D-09a — check `stripeSubscriptionStatus` in {`active`, `trialing`, `past_due`} before creating any Checkout Session. Redirect to Customer Portal instead. [CITED: D-09a]
**Warning signs:** `organizations.stripeSubscriptionId` changes value during `customer.subscription.created` for an org that already had a subscription ID.

### Pitfall 7: `runtime = 'nodejs'` Missing

**What goes wrong:** On Vercel, without `runtime = 'nodejs'`, the route may run in the Edge runtime which does not support the `crypto` module used by `stripe.webhooks.constructEvent()`, causing `ReferenceError: crypto is not defined` or similar.
**Why it happens:** Vercel defaults API routes to Edge when not specified; the Stripe SDK requires Node.js crypto.
**How to avoid:** Export `runtime = 'nodejs'` and `dynamic = 'force-dynamic'` at the top of the webhook route (locked in D-14). [CITED: nextjs.org/docs route segment config, D-14]
**Warning signs:** Production webhook failures with crypto-related errors; local dev works fine (always uses Node.js).

### Pitfall 8: Vitest Module-Level DB Import Without Mocking

**What goes wrong:** `lib/stripe/catalog.ts` or extended `lib/stripe/products.ts` imports `@/lib/db` at module load, causing vitest to throw `DATABASE_URL not set` when the test environment doesn't have it.
**Why it happens:** The `@/lib/db` barrel runs a `postgres()` connection at import time.
**How to avoid:** Follow the WARNING-2 pattern established in `lib/stripe/products.test.ts`: `vi.mock('@/lib/db', ...)` at the top of test files (vitest hoists vi.mock before imports). `catalog.ts` should not import `@/lib/db` directly — it only reads `process.env` which is safely stub-able.
**Warning signs:** Test file importing `lib/stripe/catalog.ts` throws `DATABASE_URL not set` at test startup.

---

## Code Examples

### Stripe SDK: Checkout Session Creation (subscription mode)

```typescript
// Source: docs.stripe.com/api/checkout/sessions/create [CITED]
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  client_reference_id: orgId,           // for checkout.session.completed reconciliation
  metadata: { policyPilotOrgId: orgId }, // session-level metadata
  subscription_data: {
    metadata: { policyPilotOrgId: orgId }, // propagated to Subscription object
  },
  customer: existingCustomerId,          // omit if not yet linked
  success_url: `${appUrl}/settings?checkout=success`,
  cancel_url: `${appUrl}/settings?checkout=cancelled`,
});
// session.url is the Stripe-hosted Checkout URL; redirect there
```

### Stripe SDK: Webhook constructEvent

```typescript
// Source: docs.stripe.com/webhooks [CITED]
// rawBody = await request.text() — must be called BEFORE this
const event = stripe.webhooks.constructEvent(
  rawBody,                                      // string from request.text()
  request.headers.get('Stripe-Signature')!,     // Stripe-Signature header
  process.env.STRIPE_WEBHOOK_SECRET!,           // endpoint signing secret
);
// Throws Stripe.errors.StripeSignatureVerificationError on invalid signature
// Default timestamp tolerance: 5 minutes
```

### Stripe SDK: Subscription Retrieve

```typescript
// Source: docs.stripe.com/api/subscriptions/retrieve [CITED]
const subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(subscriptionId);
// Key fields for entitlement:
//   subscription.status               — 'active' | 'trialing' | 'past_due' | etc.
//   subscription.cancel_at_period_end — boolean
//   subscription.items.data[0].price.id      — the active Price ID
//   subscription.items.data[0].current_period_end — Unix timestamp
//   subscription.customer             — string | Stripe.Customer (always string at retrieve)
```

### Stripe SDK: Customer Portal Session

```typescript
// Source: docs.stripe.com/customer-management/integrate-customer-portal [CITED]
// stripe.billingPortal.sessions.create (NOT stripe.billingPortal.configurations)
const portalSession = await stripe.billingPortal.sessions.create({
  customer: storedStripeCustomerId,     // from organizations.stripeCustomerId only
  return_url: `${appUrl}/settings`,    // where customer returns after portal
});
// portalSession.url is the short-lived portal URL; redirect there
```

### Drizzle Transaction with stripe_events Idempotency

```typescript
// Source: 06-SPEC.md § Webhook idempotency transaction rule [CITED]
await db.transaction(async (tx) => {
  const inserted = await tx
    .insert(stripeEvents)
    .values({ id: event.id })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) {
    throw Object.assign(new Error('__duplicate__'), { isDuplicate: true });
  }
  await tx
    .update(organizations)
    .set({ planTier: newTier, stripeSubscriptionStatus: sub.status, ... })
    .where(eq(organizations.id, orgInternalId));
});
// If thrown with isDuplicate: duplicate event → 200 no-op
// If thrown with other error: transaction rolled back → Stripe will retry
```

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^1.6.0 (already installed) |
| Config file | vitest.config.ts (root, existing) |
| Quick run command | `pnpm test -- --run lib/stripe` |
| Full suite command | `pnpm verify:phase-6` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-tier-starter | TIER_LIMITS.starter matches spec | unit | `pnpm test -- --run lib/stripe/products.test.ts` | YES (existing) |
| REQ-tier-growth | TIER_LIMITS.growth.consistencyCheck === true | unit | same | YES (existing) |
| REQ-tier-business | TIER_LIMITS.business.aiDraftsMonthly === -1 | unit | same | YES (existing) |
| REQ-tier-starter/growth/business | catalog round-trip: (tier,interval)->priceId->tier | unit | `pnpm test -- --run lib/stripe/catalog.test.ts` | NO — Wave 0 |
| REQ-tier-starter/growth/business | unknown priceId returns undefined from priceIdToTier | unit | same | NO — Wave 0 |
| SPEC R1 | missing env var causes catalog module to throw at load | unit | same | NO — Wave 0 |
| SPEC R1 | duplicate priceId causes catalog module to throw | unit | same | NO — Wave 0 |
| SPEC R3 | webhook signature failure → 400 | route/integration | `pnpm test -- --run app/api/webhooks/stripe` | NO — Wave 0 |
| SPEC R3 | duplicate event.id → 200 no-op, no org mutation | route/integration | same | NO — Wave 0 |
| SPEC R3 | event replay (different event.id, same sub) → org state = canonical sub | route/integration | same | NO — Wave 0 |
| SPEC R3 | out-of-order delivery (deleted, then stale invoice.paid) → stays Starter | route/integration | same | NO — Wave 0 |
| SPEC R3 | unknown priceId → no planTier change | route/integration | same | NO — Wave 0 |
| SPEC R3 | zero org mapping → no planTier change | route/integration | same | NO — Wave 0 |
| SPEC R3 | checkout.session.completed: re-fetches sub, sets planTier | route/integration | same | NO — Wave 0 |
| SPEC R3 | invoice.paid: re-fetches sub, never reactivates canceled org | route/integration | same | NO — Wave 0 |
| SPEC R3 | invoice.payment_failed: sets past_due, no planTier downgrade | route/integration | same | NO — Wave 0 |
| SPEC R3 | customer.subscription.deleted: verifies one org, downgrades to Starter | route/integration | same | NO — Wave 0 |
| SPEC R3 | customer.subscription.updated: syncs all fields from current sub | route/integration | same | NO — Wave 0 |
| SPEC R3 | cancel_at_period_end=true stays entitling | route/integration | same | NO — Wave 0 |
| SPEC R4 | maxUsers returns real count (not 0) | unit | `pnpm test -- --run lib/stripe/products.test.ts` | partial — extend |
| SPEC R4 | Starter at 25/25 users: checkTierLimit maxUsers → allowed=false | unit | same | NO — extend |
| SPEC R5 | employee cannot create portal session | route/integration | `pnpm test -- --run app/api/webhooks/stripe` | NO — Wave 0 |
| SPEC R5 | admin with no linked customer gets setup prompt | manual | manual UAT checklist | N/A |
| SPEC R6 | `pnpm verify:phase-6` exits 0 | integration | `pnpm verify:phase-6` | NO — Wave 0 |
| SPEC R6 | migration count matches journal (db:verify) | integration | `pnpm db:verify` | YES (existing, extend) |
| SPEC R6 | Phase 6 org columns present in DB | integration | `pnpm db:verify` | NO — extend check-deploy-schema.ts |

**Manual-only tests:**
- Stripe sandbox checkout → webhook → DB sync → portal round trip (requires live Stripe test keys)
- Test-clock renewal producing `invoice.paid` (requires Stripe Dashboard test clock)

### Sampling Rate

- **Per task commit:** `pnpm test -- --run lib/stripe && pnpm typecheck`
- **Per wave merge:** `pnpm verify:phase-5` (preserves existing gates) + billing-specific tests
- **Phase gate:** `pnpm verify:phase-6` full chain exits 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/stripe/catalog.test.ts` — covers catalog round-trip, missing env, duplicate priceId (REQ-tier-*)
- [ ] `lib/stripe/normalize.test.ts` — covers status policy for all 7 statuses, cancel_at_period_end, unknown price (SPEC R3)
- [ ] `app/api/webhooks/stripe/route.test.ts` — covers signature failure, duplicate, replay, out-of-order, all 5 event types with Stripe SDK mocked at module boundary (SPEC R3)
- [ ] Extend `lib/stripe/products.test.ts` — add maxUsers real-count cases (SPEC R4)
- [ ] `scripts/check-deploy-schema.ts` and `scripts/check-schema.ts` — extend for Phase 6 org column shape + partial indexes
- [ ] `package.json` — add `verify:phase-6` script matching SPEC

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — checkout and portal are admin-only | `requireAdminFromCtx(ctx)` in Server Actions; Clerk session via `getOrgContext()` |
| V3 Session Management | yes — Checkout Session is Stripe-managed; app session is Clerk-managed | Clerk handles app session; Stripe handles checkout session (short-lived URL) |
| V4 Access Control | yes — employee must not create portal/checkout sessions | `requireAdminFromCtx()` gate; employee route group has no billing surfaces |
| V5 Input Validation | yes — intent body (tier/interval) from pricing page | Zod schema validation in Server Action; priceId derived server-side from catalog |
| V6 Cryptography | yes — webhook signature verification | `stripe.webhooks.constructEvent()` (HMAC-SHA256 with timestamp tolerance) — never hand-roll |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged checkout (client supplies org/price/customer) | Tampering | Server derives all trusted values from `getOrgContext()`; client input is non-authoritative intent only (D-08) |
| Webhook replay attack | Repudiation | stripe_events idempotency table; Stripe-Signature timestamp tolerance (5-min window) prevents replay of old events [CITED: docs.stripe.com/webhooks] |
| Cross-org billing injection (subscription metadata spoofed) | Spoofing | Metadata is reconciliation hint only (D-17a); cross-check stored `stripeCustomerId`/`stripeSubscriptionId` from DB before mutation |
| Billing state downgrade DoS (cancel forged) | DoS | `customer.subscription.deleted` requires exact one-org mapping before mutation; non-matching events silently 200 |
| Secret leak in logs (API key, webhook secret, customer email) | Information Disclosure | maskCustomerId()/maskSubscriptionId() in all log lines; never log rawBody; TierLimitExceededError message contains no secrets |
| Duplicate active subscriptions | Tampering | D-09a guard in checkout action + partial unique index on `stripe_subscription_id` |
| Portal customer ID injection (client supplies customer_id) | Tampering | Portal action reads only `organizations.stripeCustomerId` from DB via `getOrgContext()` (D-25) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `request.rawBody` (Pages Router bodyParser) | `await request.text()` (App Router) | Next.js 13 (App Router GA) | No bodyParser config needed; standard Web API |
| API version pinning as string constant | SDK default (stripe@22 bundles its target version) | stripe@8+ | SDK types match bundled version; explicit pin only needed for older behavior compatibility |
| Trust event object for entitlement | Re-fetch current Subscription for entitlement-affecting events | Stripe docs best practice (always) | Eliminates race conditions from out-of-order delivery |
| Separate `stripe.billingPortal.configurations` resource | `stripe.billingPortal.sessions.create` | Stripe Customer Portal GA | Sessions API creates short-lived authenticated portal URLs |

**Deprecated/outdated:**
- Pages Router `bodyParser: false` config for webhooks: no longer needed in App Router — `request.text()` is the standard pattern [CITED: nextjs.org/docs route handlers]
- `stripe.customers.createPortalSession` (old method name): the current SDK method is `stripe.billingPortal.sessions.create` [ASSUMED — verify at execute time against SDK types]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` npm package | Checkout, webhook, portal | NOT YET INSTALLED | 22.2.0 on registry | None — must install before implementation |
| Node.js >=22 | stripe SDK, webhook crypto | YES | per engines field in package.json (`>=22.0.0 <23.0.0`) | — |
| `pnpm` | package installation | YES | 9.15.9 | — |
| Stripe Dashboard (test mode) | Six Price IDs, webhook endpoint, test clock | MANUAL SETUP REQUIRED | — | Cannot be automated; operator must configure |
| `stripe` CLI | `stripe listen`, webhook forwarding for local UAT | NOT VERIFIED | — | Use Stripe Dashboard webhook endpoint; manual test clock |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 6x Price ID vars | All billing features | NOT SET in .env.local (placeholder only) | — | Cannot run; operator must populate before execution |

**Missing dependencies with no fallback:**
- `stripe` package not yet installed (Wave 0 task: `pnpm add stripe`)
- Stripe env vars not populated (Wave 0 operator checkpoint: populate `.env.local` and Stripe Dashboard)

**Missing dependencies with fallback:**
- `stripe` CLI not verified — local webhook testing possible via ngrok + Stripe Dashboard webhook configuration

---

## Open Questions

1. **Stripe API version pinning**
   - What we know: stripe@22.2.0 bundles a recent API version (likely `2025-04-30.basil` or similar)
   - What's unclear: Whether to pin `apiVersion` in the Stripe constructor or rely on the SDK default
   - Recommendation: Do not pin — use SDK default. The SDK default matches the included types. Explicit pin only if a future SDK upgrade would break the pinned version. Verify the bundled default version at execution time from the SDK source.

2. **`countOrgUsers` query scope**
   - What we know: `users` table has `orgId` FK; Phase 6 D-27 requires real count
   - What's unclear: Whether the count should include all roles or only `employee` + `admin` (i.e., does `maxUsers` count reviewer-role users?)
   - Recommendation: Count ALL users in the org (`WHERE orgId = $1`) matching the business definition of "org seat". Confirm with operator if reviewers are counted toward `maxUsers`.

3. **Checkout session Server Action vs. dedicated API route**
   - What we know: Existing admin actions use Server Actions (`app/(admin)/policies/*/actions.ts` pattern); `redirect()` works from Server Actions
   - What's unclear: Whether `redirect()` to a Stripe Checkout URL works correctly from a Server Action in Next.js 15 (or whether it needs to return the URL to the client for navigation)
   - Recommendation: Use Server Action with `redirect(session.url)` — this is the established pattern in the codebase (transitions.ts orchestrators use redirect-outside-try/catch). If redirect fails from Server Action context, fall back to a dedicated route handler that returns the URL for client-side navigation. Test this in Wave 1.

4. **DB allow-list for checkout Server Action**
   - What we know: `scripts/check-db-imports.ts` already allow-lists `app/api/webhooks/stripe/route.ts`
   - What's unclear: Whether `app/(admin)/settings/actions.ts` will need a raw `db` import for the pre-checkout subscription status check, which would require a new allow-list entry
   - Recommendation: Use `withOrgScope` / `getOrgContext()` to read the org row (scoped pattern, not raw `db`) and avoid the allow-list update. If needed, add `app/(admin)/settings/actions.ts` to the allow-list with explicit justification.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `stripe` CLI is available for local webhook testing | Environment Availability | Low — Stripe Dashboard + ngrok is a viable fallback for UAT |
| A2 | `stripe.billingPortal.sessions.create` is the current SDK method name (not `createPortalSession` or `billing_portal.sessions.create`) | Code Examples | Low — verify at execute time from SDK types; a wrong method name is a compile error caught by tsc |
| A3 | stripe@22 SDK default API version is recent enough that `subscription.items.data[0].current_period_end` exists on the item (some API versions moved this field) | Code Examples | Medium — if the field moved, the normalize function returns wrong period end; verify from SDK types at execute time |
| A4 | The checkout `redirect()` from a Next.js 15 Server Action to a Stripe-hosted URL works correctly in all client environments | Code Examples | Medium — if redirect fails, implement as a route handler returning JSON with `{ url }` and handle navigation client-side |
| A5 | `maxUsers` counts all org members regardless of role (starter, admin, reviewer, employee) | Pattern 6 | Low — if business rule says reviewer-role users don't count, update the query filter |
| A6 | `stripe` package download volume ~2.5M/week | Package Legitimacy Audit | Very low — package is official Stripe SDK, operator-approved; download volume claim is not load-bearing |
| A7 | The `stripe.subscriptions.retrieve()` return type includes `items.data[0].current_period_end` at the item level (not just at the subscription level) | Code Examples | Low — the Stripe API v2 docs showed this at item level; verify against SDK types at execute time |

---

## Sources

### Primary (HIGH confidence)
- `docs.stripe.com/webhooks` — raw body requirement, `constructEvent()` signature, timestamp tolerance, 5-min window [CITED]
- `docs.stripe.com/billing/subscriptions/webhooks` — subscription lifecycle events, when to re-fetch subscription [CITED]
- `docs.stripe.com/api/checkout/sessions/create` — Checkout Session creation params, subscription mode, `client_reference_id`, metadata [CITED]
- `docs.stripe.com/customer-management/integrate-customer-portal` — `billingPortal.sessions.create` params, security requirements [CITED]
- `docs.stripe.com/billing/testing` — test clocks, Stripe CLI `listen`/`trigger`, test card numbers [CITED]
- `docs.stripe.com/api/subscriptions/retrieve` — Subscription object fields: status, cancel_at_period_end, items.data[0].price.id [CITED]
- `nextjs.org/docs/app/api-reference/file-conventions/route` (v16.2.6, 2026-05-28) — `request.text()`, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'` segment config [CITED]
- `lib/stripe/products.ts` — existing WARNING-2 split-helper architecture, TIER_LIMITS, checkTierLimit [VERIFIED: codebase]
- `app/api/webhooks/clerk/route.ts` — raw-body-first pattern, idempotency table pattern [VERIFIED: codebase]
- `scripts/check-db-imports.ts` — ADR-023 allow-list, `app/api/webhooks/stripe/route.ts` already allow-listed [VERIFIED: codebase]
- `drizzle/0011_qa_citation_grants.sql` — hand-written SQL migration pattern with partial indexes [VERIFIED: codebase]
- `drizzle/meta/_journal.json` — last migration index is 11; next must be 0012 [VERIFIED: codebase]
- `lib/db/schema.ts` — current organizations table shape: `planTier`, `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus` present; new 5 columns not yet present [VERIFIED: codebase]
- `npm view stripe` — version 22.2.0, published 2026-05-27, repo github.com/stripe/stripe-node, maintainer stripe-bindings@stripe.com, no postinstall script [VERIFIED: npm registry 2026-05-28]
- `.planning/config.json` — `workflow.nyquist_validation: true` [VERIFIED: codebase]
- `06-SPEC.md` and `06-CONTEXT.md` — all locked decisions D-01..D-35 [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `github.com/stripe/stripe-node README` — TypeScript instantiation pattern, `constructEvent` return type [VERIFIED: WebFetch]

### Tertiary (LOW confidence / ASSUMED)
- stripe@22 bundled default API version string [ASSUMED — verify from SDK source at execute time]
- `stripe` weekly download count ~2.5M [ASSUMED — not load-bearing]
- `stripe.billingPortal.sessions.create` exact method path on the SDK object [ASSUMED — verify from SDK types at execute time]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stripe package confirmed on registry with no postinstall; all other packages already installed
- Architecture: HIGH — grounded in locked decisions, existing codebase patterns, and current Stripe/Next.js docs
- Pitfalls: HIGH — sourced from official docs and direct codebase inspection of analogous patterns
- Webhook correctness rules: HIGH — sourced directly from 06-SPEC.md locked decisions and official Stripe docs
- Migration pattern: HIGH — direct codebase inspection of 0011_qa_citation_grants.sql and journal

**Research date:** 2026-05-28
**Valid until:** 2026-06-28 (stable Stripe API; 30 days)
