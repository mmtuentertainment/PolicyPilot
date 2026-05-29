---
phase: 06-billing
plan: 02
type: execute
wave: 1
depends_on: ["06-01"]
files_modified:
  - lib/stripe/normalize.ts
  - lib/stripe/normalize.test.ts
  - app/api/webhooks/stripe/route.ts
  - app/api/webhooks/stripe/route.test.ts
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: true

must_haves:
  truths:
    - "POST /api/webhooks/stripe verifies the Stripe-Signature against the raw body and rejects invalid signatures with 400 before any JSON parse (D-14, M2)."
    - "The route is the ONLY billing-state write source; planTier is mutated only by a verified webhook (SPEC R3)."
    - "All 5 events are handled: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted, customer.subscription.updated (SC#2)."
    - "Entitlement for checkout.session.completed / invoice.paid / customer.subscription.updated is derived from the CURRENT Stripe Subscription re-fetched via SDK, not stale event snapshots (D-16)."
    - "Duplicate event.id returns 200 with no org mutation; the stripe_events insert and org mutation commit/rollback together in one transaction (D-21, D-21a)."
    - "Unknown price ID, zero/multiple org matches, missing customer/subscription, non-recurring/multi-item price all fail closed with a sanitized log + 200 + no planTier change (D-17, D-17a, D-18, M2)."
    - "invoice.payment_failed sets stripeSubscriptionStatus='past_due' and never downgrades planTier (D-20, M3)."
    - "Status policy honored: active/trialing entitle; past_due preserves last paid tier; unpaid/canceled/incomplete_expired/paused -> starter; cancel_at_period_end stays entitling (D-19, D-19a)."
    - "Logs never contain raw payloads, keys, secrets, customer email, or full customer IDs (D-12, D-34)."
  artifacts:
    - path: "app/api/webhooks/stripe/route.ts"
      provides: "POST handler with runtime=nodejs, dynamic=force-dynamic, raw-body signature verify, 5-event dispatch, transaction-scoped idempotency"
      contains: "constructEvent"
      exports: ["POST", "runtime", "dynamic"]
    - path: "lib/stripe/normalize.ts"
      provides: "Pure subscription->org-fields normalizer with status policy"
      contains: "normalizeSubscription"
    - path: "app/api/webhooks/stripe/route.test.ts"
      provides: "Signature fail, duplicate, replay, out-of-order, all-5-events, fail-closed tests (SDK mocked)"
      contains: "constructEvent"
  key_links:
    - from: "app/api/webhooks/stripe/route.ts"
      to: "stripe.webhooks.constructEvent"
      via: "raw request.text() + Stripe-Signature header + STRIPE_WEBHOOK_SECRET"
      pattern: "constructEvent"
    - from: "app/api/webhooks/stripe/route.ts"
      to: "stripe_events + organizations (one transaction)"
      via: "db.transaction(insert stripeEvents -> update organizations)"
      pattern: "\\.transaction\\("
    - from: "app/api/webhooks/stripe/route.ts"
      to: "lib/stripe/catalog priceIdToTier"
      via: "entitlement derived from recognized recurring Price ID"
      pattern: "priceIdToTier"
---

<objective>
Build the Stripe webhook — the single billing-state write source. Verify raw-body signatures, dispatch all 5 locked events, re-fetch the canonical Subscription for entitlement-affecting events, resolve the org unambiguously, and apply the org mutation inside a transaction-scoped idempotency boundary that is replay-safe and out-of-order-safe.

Purpose: This is the heart of Phase 6 correctness. Stripe delivers events out of order and retries them; only canonical-subscription re-fetch + transaction-scoped idempotency + fail-closed org mapping keep planTier correct.
Output: `lib/stripe/normalize.ts` (pure status-policy normalizer) + `app/api/webhooks/stripe/route.ts` + comprehensive mocked tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-billing/06-SPEC.md
@.planning/phases/06-billing/06-CONTEXT.md
@.planning/phases/06-billing/06-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- From Plan 06-01 (depends_on): -->
// lib/stripe/catalog.ts
export function priceIdToTier(priceId: string): PlanTier | undefined;
// lib/stripe/client.ts
export function getStripeClient(): Stripe;
// lib/stripe/mask.ts
export function maskCustomerId(id: string): string;
export function maskSubscriptionId(id: string): string;

<!-- organizations columns after 0012 (lib/db/schema.ts): -->
planTier, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus,
stripePriceId, stripeSubscriptionItemId, stripeCurrentPeriodEnd, stripeCancelAtPeriodEnd, stripeLastEventCreated
<!-- stripe_events: id(text pk), processedAt -->

<!-- Webhook route is ALREADY allow-listed for raw @/lib/db in scripts/check-db-imports.ts
     (ALLOWLIST entry /^app\/api\/webhooks\/stripe\/route\.ts$/) — no allow-list edit needed. -->

<!-- Clerk webhook analog (app/api/webhooks/clerk/route.ts) for raw-body-first, idempotency,
     sanitized logging. NOTE: Clerk uses delete-before-retry; Stripe MUST use single-DB-transaction
     idempotency (insert stripe_events.id + org mutation atomically). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure subscription normalizer + status-policy tests</name>
  <files>lib/stripe/normalize.ts, lib/stripe/normalize.test.ts</files>
  <behavior>
    - active + recognized price -> { planTier: <tier>, status:'active', priceId, subscriptionItemId, currentPeriodEnd, cancelAtPeriodEnd, lastEventCreated } (D-19).
    - trialing + recognized price -> same as active with status 'trialing' (D-19).
    - active + cancel_at_period_end=true -> still entitling (planTier = recognized tier), cancelAtPeriodEnd=true (D-19a).
    - past_due -> returns a marker that the CALLER must preserve the existing paid planTier (do NOT downgrade); status='past_due', diagnostic fields synced (D-19, D-20). Encode this so the route does not overwrite planTier on past_due.
    - unpaid / canceled / incomplete_expired / paused -> planTier='starter', status synced (D-19).
    - incomplete -> link IDs, do NOT upgrade planTier (D-19).
    - any status + unknown price (priceIdToTier returns undefined) -> null (fail closed, D-18).
    - subscription with zero items or >1 item or a non-recurring price -> null (fail closed, D-18).
  </behavior>
  <read_first>
    - 06-RESEARCH.md Pattern 5 (Subscription Normalization) — NOTE the research stub conflates past_due with a placeholder; this task must make past_due explicitly preserve the caller's existing planTier rather than emit 'starter'.
    - 06-SPEC.md § Subscription entitlement status policy (authoritative status table)
    - lib/stripe/catalog.ts (priceIdToTier), lib/stripe/products.ts (PlanTier)
  </read_first>
  <action>
    Write `lib/stripe/normalize.test.ts` FIRST (RED) covering every behavior above using hand-built `Stripe.Subscription`-shaped fixtures (typed, partial casts acceptable in tests; no live SDK). Then create `lib/stripe/normalize.ts` with `import 'server-only'` exporting `normalizeSubscription(sub, eventCreatedAtUnix)` returning a discriminated result that distinguishes: (a) entitled sync with explicit planTier, (b) past_due "preserve existing planTier" (carry a flag like `preservePlanTier: true` so the route keeps the org's current tier), (c) downgrade-to-starter, (d) incomplete link-only, (e) null fail-closed. Read the active recurring price from `sub.items.data[0].price.id`, assert exactly one item with a recurring price (else null, D-18), map via `priceIdToTier`. Persist diagnostic fields: stripePriceId, stripeSubscriptionItemId, stripeCurrentPeriodEnd (from item.current_period_end * 1000; verify field location against SDK types per 06-RESEARCH Assumption A3/A7 at execute time), stripeCancelAtPeriodEnd, stripeLastEventCreated (eventCreatedAt * 1000 — diagnostic only, NOT an ordering gate per D-22). This module is PURE — no DB, no SDK calls. (D-16, D-18, D-19, D-19a, D-20, D-22)
  </action>
  <verify>
    <automated>pnpm test -- --run lib/stripe/normalize.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - All status-policy behaviors above pass.
    - past_due result carries an explicit preserve-existing-planTier signal (NOT a hardcoded 'starter') — assert the route would keep the org's prior tier.
    - unknown-price and malformed-item subscriptions return null.
    - normalize.ts imports neither `@/lib/db` nor calls the Stripe SDK (grep confirms pure module).
  </acceptance_criteria>
  <done>Pure normalizer encodes the full SPEC status policy with fail-closed null cases; tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Stripe webhook route — signature, dispatch, canonical re-fetch, transaction idempotency, fail-closed org mapping</name>
  <files>app/api/webhooks/stripe/route.ts, app/api/webhooks/stripe/route.test.ts</files>
  <behavior>
    - Missing STRIPE_WEBHOOK_SECRET -> 500 (misconfig, distinct from 400).
    - Missing Stripe-Signature header -> 400.
    - Invalid signature (constructEvent throws) -> 400, sanitized log, no DB write (M2).
    - Duplicate event.id -> 200, no org mutation (D-21).
    - Two distinct event.ids for the same subscription/type -> org state == canonical current Subscription (D-21a).
    - Out-of-order: customer.subscription.deleted processed, then a stale invoice.paid arrives -> re-fetch shows canceled -> org stays starter (Pitfall 2, M2).
    - checkout.session.completed -> re-fetch subscription, map org via metadata.policyPilotOrgId / client_reference_id cross-checked against stored ids, set planTier (D-16, D-17).
    - invoice.paid -> re-fetch subscription, never reactivate a canceled/unknown sub (D-16, Pitfall 2).
    - invoice.payment_failed -> set stripeSubscriptionStatus='past_due', planTier UNCHANGED (D-20, M3).
    - customer.subscription.deleted -> verify exactly one org, set status='canceled', planTier='starter' (D-19); preserves all acks/ai_generations rows (L3 — no row deletion).
    - customer.subscription.updated -> sync all fields from current sub (D-19, D-19a).
    - unknown price / zero org match / multiple org match / missing customer / non-recurring -> 200, sanitized log, no planTier change (D-17, D-18, M2).
    - Transient DB/Stripe failure during mutation -> transaction rolls back stripe_events insert -> non-2xx (5xx) so Stripe retries (D-21, M2).
  </behavior>
  <read_first>
    - app/api/webhooks/clerk/route.ts (raw-body-first, idempotency insert, sanitized logging — but Stripe MUST use ONE transaction, NOT delete-before-retry)
    - 06-RESEARCH.md Pattern 3 (route shape), Pattern 4 (transaction idempotency), Code Examples (constructEvent, subscriptions.retrieve, transaction), Pitfalls 1/2/3/4/7
    - 06-SPEC.md § Webhook idempotency transaction rule + § Webhook canonical state + § Stripe webhook route shape (locked)
    - lib/stripe/normalize.ts (Task 1), lib/stripe/catalog.ts, lib/stripe/client.ts, lib/stripe/mask.ts
    - lib/db/schema.ts (organizations, stripeEvents)
  </read_first>
  <action>
    Write `app/api/webhooks/stripe/route.test.ts` FIRST (RED). Mock the Stripe SDK at the module boundary (D-32): mock `getStripeClient` so `webhooks.constructEvent` returns crafted events and `subscriptions.retrieve` returns crafted subscriptions; mock `@/lib/db` (vi.mock) to assert transaction behavior and capture mutations — do NOT call live Stripe or a live DB in this unit/integration suite. Then create `app/api/webhooks/stripe/route.ts` with `import 'server-only'`, `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`, importing raw `db` from `@/lib/db` (already allow-listed). In `POST(request)`: read `process.env.STRIPE_WEBHOOK_SECRET` (500 if missing); `const rawBody = await request.text()` EXACTLY ONCE before any parse (Pitfall 1); read `Stripe-Signature` (400 if missing); `stripe.webhooks.constructEvent(rawBody, sig, secret)` in try/catch -> 400 on throw with masked log (M2). Dispatch on `event.type` for the 5 events. For checkout.session.completed / invoice.paid / customer.subscription.updated: extract the subscription id, `stripe.subscriptions.retrieve(subId)`, run `normalizeSubscription` (D-16). Resolve org: prefer trusted server-created metadata.policyPilotOrgId + client_reference_id, CROSS-CHECK against stored stripeCustomerId/stripeSubscriptionId; query organizations and assert EXACTLY ONE match (zero/multiple -> masked log + 200 no-op, D-17/D-17a). Apply the mutation inside `db.transaction(async (tx) => { insert stripeEvents(id=event.id).onConflictDoNothing().returning(); if empty -> duplicate (throw sentinel -> 200 no-op); else update organizations narrowed to the one organizations.id })` (D-21). On a duplicate sentinel return 200; on real mutation error let the transaction roll back BOTH and return 5xx so Stripe retries (M2). For invoice.payment_failed: set status='past_due' only, NO planTier change, still inside the idempotency transaction (D-20). For customer.subscription.deleted: may use the signed event object but MUST verify exactly one org mapping, then set status='canceled' + planTier='starter' (D-19) — do NOT delete any rows (L3, SF-CASCADE-AUDIT stays deferred; Phase 6 adds no org-delete path). For past_due normalizer result, preserve the org's existing planTier (D-20). Every log line uses maskCustomerId/maskSubscriptionId and never logs rawBody/keys/email (D-12, D-34). Return 200 for handled-but-no-op and success; 400 for signature/header failure; 500 for missing secret; 5xx for transient mutation failure (M2 status matrix). (D-14, D-15, D-16, D-17, D-17a, D-18, D-19, D-19a, D-20, D-21, D-21a, D-22)
  </action>
  <verify>
    <automated>pnpm test -- --run app/api/webhooks/stripe</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test -- --run app/api/webhooks/stripe` passes all behaviors above.
    - route.ts exports `runtime` (='nodejs'), `dynamic` (='force-dynamic'), and `POST`.
    - grep confirms `request.text()` appears and `request.json()` does NOT appear in route.ts (Pitfall 1).
    - grep confirms `.transaction(` wraps the stripeEvents insert + organizations update (D-21); the insert uses `onConflictDoNothing`.
    - grep confirms entitlement-affecting handlers call `subscriptions.retrieve` (D-16) — event-snapshot-only entitlement is absent.
    - grep confirms no log statement passes rawBody, `STRIPE_`, customer email, or an unmasked `cus_`/`sub_` id to console (logs route through maskCustomerId/maskSubscriptionId).
    - Test asserts the M2 status matrix: 400 signature, 200 fail-closed/duplicate, 5xx transient mutation failure.
    - `pnpm check:db-imports` still passes (route already allow-listed; no new raw-db importer outside it).
  </acceptance_criteria>
  <done>Webhook handles all 5 events with canonical re-fetch, transaction-scoped idempotency, fail-closed org mapping, and the M2 status matrix; tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Stripe -> POST /api/webhooks/stripe | Untrusted HTTP until signature-verified; raw body crosses here |
| event/metadata -> org resolution | Stripe-supplied identifiers; trusted only after cross-check with stored DB ids |
| webhook -> organizations (service-role db) | RLS-bypassing write path; must narrow to exactly one org per mutation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-05 | Spoofing | forged webhook delivery | mitigate | stripe.webhooks.constructEvent verifies HMAC-SHA256 against raw body; invalid -> 400 before any parse (D-14, M2) |
| T-6-06 | Repudiation / replay | duplicate / replayed event delivery | mitigate | stripe_events.id dedupe inside the transaction + Stripe 5-min timestamp tolerance; duplicate -> 200 no-op (D-21) |
| T-6-07 | Tampering | stale/out-of-order event reactivates canceled org | mitigate | canonical subscriptions.retrieve for completed/paid/updated; entitlement derived from current sub, never event snapshot (D-16, Pitfall 2) |
| T-6-08 | Spoofing | cross-org billing injection via forged metadata | mitigate | metadata is a hint only; cross-check stored stripeCustomerId/stripeSubscriptionId; exactly-one-org match or 200 no-op (D-17, D-17a) |
| T-6-09 | Information Disclosure | secret/PII leak in logs | mitigate | maskCustomerId/maskSubscriptionId on every log line; never log rawBody, keys, secrets, or email (D-12, D-34) |
| T-6-10 | Denial of Service | downgrade DoS via forged subscription.deleted | mitigate | deleted handler requires exactly-one-org mapping before mutating; non-matching -> 200 no-op |
| T-6-11 | Tampering | zombie idempotency row on mutation failure | mitigate | single db.transaction wraps insert + mutation; mutation failure rolls back the stripe_events insert -> 5xx -> Stripe retries (D-21, M2) |
| T-6-12 | Tampering | non-recurring / multi-item / unknown-price entitlement | mitigate | normalizer requires exactly one recognized recurring Phase 6 price; else null -> no upgrade (D-18) |
</threat_model>

<verification>
- `pnpm test -- --run lib/stripe/normalize.test.ts` passes (status policy).
- `pnpm test -- --run app/api/webhooks/stripe` passes (signature, idempotency, replay, out-of-order, all 5 events, fail-closed, M2 matrix).
- `pnpm typecheck` exits 0.
- `pnpm check:db-imports` passes (no new disallowed raw-db importer).
</verification>

<success_criteria>
- Raw-body signature verification rejects bad signatures with 400 before parse.
- All 5 events handled; entitlement-affecting events use canonical subscription re-fetch.
- Idempotency + org mutation are one transaction; duplicate -> 200 no-op; transient failure -> rollback + 5xx.
- Fail-closed org mapping; past_due non-destructive; cancel_at_period_end stays entitling; no row deletion (L3).
- No secret/PII in logs.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-02-SUMMARY.md` when done.
</output>
