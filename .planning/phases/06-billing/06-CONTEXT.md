# Phase 6: Billing - Context

**Gathered:** 2026-05-27T23:51:45-04:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 turns PolicyPilot billing from static tier metadata into a working Stripe-backed entitlement loop: an authenticated org admin can choose a plan, complete Stripe Checkout, have verified Stripe webhooks sync durable billing state onto `organizations`, and have server-side tier gates enforce the resulting plan. This phase owns billing state and gates only; it does not build new Growth/Business feature bodies.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `06-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `06-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Stripe product/price env mapping for Starter, Growth, Business x monthly, annual.
- Checkout session creation for the authenticated admin's active org.
- Public pricing page plan/interval intent, as non-authoritative input only.
- Admin billing settings page or equivalent admin billing surface.
- Customer Portal session creation for the org's stored Stripe customer.
- `POST /api/webhooks/stripe` with raw-body signature verification and all five locked events.
- Idempotency through `stripe_events` with tests proving replay safety.
- Official `stripe` npm package usage for Checkout Session creation, Customer Portal Session creation, webhook signature verification, Stripe Subscription retrieval, and typed Stripe object parsing.
- Additive organization billing-state migration for `stripePriceId`, `stripeSubscriptionItemId`, `stripeCurrentPeriodEnd`, `stripeCancelAtPeriodEnd`, and `stripeLastEventCreated`, plus unique partial indexes for `stripe_customer_id` and `stripe_subscription_id` if missing.
- `organizations.planTier`, `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripePriceId`, `stripeSubscriptionItemId`, `stripeCurrentPeriodEnd`, `stripeCancelAtPeriodEnd`, and `stripeLastEventCreated` synchronization.
- `checkTierLimit` / `requireTierLimit` correctness for `aiDraftsMonthly`, `maxUsers`, and tier-bound boolean features.
- `verify:phase-6`, billing tests, and manual Stripe test-mode UAT checklist.

**Out of scope (from SPEC.md):**
- Sales tax, coupons, trials, seat proration UX, invoice PDF generation, revenue analytics, custom dunning emails, or custom billing identity.
- Implementing the actual Growth/Business feature bodies that are not already present; Phase 6 gates them but does not build Slack, SSO, custom branding, or outbound API webhooks.
- Client-side subscription authority; client-visible plan state is display only.
- Persisting invoice history, raw Stripe payloads, webhook secrets, API keys, full invoice payloads, customer email, or full raw customer identifiers for display.
- Production migration/backfill of existing Stripe customers; Phase 6 may define an operator checklist but does not silently mutate production data.
- Replacing Clerk org membership with a custom billing identity model.

</spec_lock>

<decisions>
## Implementation Decisions

### Package And Module Shape
- **D-01: Official Stripe SDK is approved and server-only.** Add the official `stripe` npm package and use it only from server-only modules, route handlers, or Server Actions. Do not add Stripe.js or any other billing package in Phase 6 unless Matthew separately approves it.
- **D-02: Stripe MCP is optional tooling, not an implementation dependency.** The active chat may still lack Stripe MCP tools; implementation must rely on the official SDK, checked docs, tests, and Stripe CLI/sandbox flows rather than requiring MCP availability.
- **D-03: Keep tier authority in `lib/stripe/products.ts`.** Phase 4 D-14 remains binding: `TIER_LIMITS`, `PlanTier`, `checkTierLimit`, `requireTierLimit`, and the Phase 6 price catalog helpers should stay anchored in `lib/stripe/products.ts`. Side-effecting SDK helpers may live in sibling `lib/stripe/*` modules, but the tier/price mapping source of truth should not drift into a second competing catalog.
- **D-04: Add small server-only Stripe helper modules where they reduce route size.** Acceptable helpers include a Stripe client singleton, checkout/portal builders, masking utilities, and pure subscription-normalization helpers. Helpers that touch raw `db` must either stay inside the already allow-listed route or require an explicit allow-list update in `scripts/check-db-imports.ts`.

### Stripe Catalog And Checkout
- **D-05: Validate all six Price IDs as a closed catalog.** Missing, duplicate, or unknown Price IDs fail closed. Catalog tests must prove `(tier, interval) -> priceId -> tier` round trips for Starter/Growth/Business and monthly/annual.
- **D-06: Public pricing carries intent only.** `/pricing` may add a monthly/annual segmented control and CTA query params such as `tier` and `interval`, but those values are display/intent only. The browser never supplies authoritative org, customer, subscription, price, client reference, or metadata.
- **D-07: Trusted checkout starts from the admin billing/settings surface.** Use an authenticated admin surface under the existing admin shell, preferably `/settings`, because the sidebar already reserves Settings for Phase 6. The page can read non-authoritative `tier`/`interval` query intent and submit it to a server action.
- **D-08: Checkout creation uses server auth context.** The checkout Server Action or route must run `getOrgContext()`, active org resolution, and `requireAdminFromCtx(ctx)` before creating any Stripe object. It must derive the Price ID from the locked catalog and set `client_reference_id`, session metadata, and `subscription_data.metadata.policyPilotOrgId` from the server-derived `orgId`.
- **D-09: Do not pre-create Stripe Customers for MVP unless required by a concrete SDK flow.** If `organizations.stripeCustomerId` exists, pass it as `customer`. Otherwise let Checkout create the customer and link it only after a verified webhook maps the session/subscription back to exactly one org.
- **D-09a: Prevent duplicate active subscriptions.** Checkout creation must reject or redirect to Customer Portal when the org already has a linked subscription in `active`, `trialing`, or `past_due` status. Phase 6 does not implement custom upgrade/downgrade flows outside Stripe Portal.

### Durable Billing State And Migration
- **D-10: Ship one forward additive migration for billing state.** Add the approved fields to `organizations` in a new migration after `0011_qa_citation_grants`; do not edit any registered migration in `drizzle/meta/_journal.json`.
- **D-11: Partial unique indexes are part of the approved schema delta.** Add nullable unique partial indexes for `organizations.stripe_customer_id` and `organizations.stripe_subscription_id` where not null, unless the planner verifies an equivalent index already exists.
- **D-12: The schema is diagnostic, not a Stripe event snapshot store.** Persist the active Price ID, subscription item ID, current period end, cancel-at-period-end, last event created, subscription status, customer ID, subscription ID, and cached `planTier`. Do not store customer email, raw webhook payloads, invoice payloads, API keys, webhook secrets, or custom billing identities.
- **D-13: Update all schema verifiers that know organization shape.** Phase 6 must update `lib/db/schema.ts`, deployment schema verification, artifact checks, and any schema parity scripts so the new columns and indexes are gated before closeout.

### Webhook Correctness
- **D-14: Stripe webhook route shape is locked.** The route lives at `app/api/webhooks/stripe/route.ts`, exports `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`, and calls `request.text()` exactly once before `stripe.webhooks.constructEvent(...)`. Never call `request.json()` before signature verification.
- **D-15: Webhook DB access is service-role and explicit.** The Stripe webhook is one of ADR-023's raw-`db` allow-list entries. It does not use `withOrgScope` because it must resolve cross-org Stripe identifiers, but every mutation must narrow to exactly one internal `organizations.id` in the transaction.
- **D-16: Canonical entitlement comes from current Subscription retrieval.** For `checkout.session.completed`, `invoice.paid`, and `customer.subscription.updated`, re-fetch the current Stripe Subscription through the SDK and derive entitlement from that current object, not from stale event snapshots.
- **D-17: Org mapping must be unambiguous.** Trusted server-created metadata, `client_reference_id`, stored `stripeSubscriptionId`, and stored `stripeCustomerId` can be used to resolve the org, but the mutation proceeds only when all available trusted signals map to exactly one PolicyPilot org. Zero matches, multiple matches, unknown Price IDs, missing customer/subscription, or untrusted client-supplied values fail closed with no upgrade.
- **D-17a: Metadata is a reconciliation hint, not sole authority.** Server-created Checkout metadata and Subscription metadata should help map Stripe objects to orgs, but implementation must still cross-check stored customer/subscription IDs when present and fail closed if trusted signals disagree.
- **D-18: Subscription item shape is strict.** A subscription must have exactly one recognized recurring Phase 6 Price ID for entitlement sync. Multiple items, unknown prices, missing recurring price data, or a one-off price fail closed until a future phase explicitly supports them.
- **D-19: Status policy follows the amended SPEC.** `active` and recognized `trialing` sync paid entitlement; `past_due` preserves the last paid plan while recording status; `incomplete` may link only unambiguous IDs without upgrading; `unpaid`, `canceled`, `incomplete_expired`, and `paused` downgrade to Starter.
- **D-19a: Scheduled cancellation remains entitling.** `active` or `trialing` with `stripeCancelAtPeriodEnd = true` remains paid. Show scheduled-cancel state in UI, but do not downgrade until Stripe reports a non-entitling status or `customer.subscription.deleted` maps exactly to the org.
- **D-20: `invoice.payment_failed` is non-destructive in MVP.** It sets `stripeSubscriptionStatus = 'past_due'` and does not clear IDs, price fields, or downgrade `planTier`. Later verified subscription events decide any downgrade.
- **D-21: Idempotency insert and org mutation are one DB transaction.** After signature verification and required Stripe API re-fetches, insert `stripe_events.id = event.id`; duplicate insert returns 200 with no mutation; successful insert and billing mutation commit together; failure rolls back both so Stripe retry can reprocess.
- **D-21a: Different event IDs for the same logical object must be harmless.** `stripe_events.id` handles replay of the same event, but tests must prove two distinct Stripe Event IDs for the same underlying subscription/customer and event type leave org state equal to canonical current Subscription state.
- **D-22: `stripeLastEventCreated` is not an entitlement ordering gate.** Store it for diagnostics and defensive debugging only. Do not let a timestamp comparison override the current Stripe Subscription state.

### Admin Billing UI And Portal
- **D-23: Enable the existing Settings nav as the billing home.** Replace the disabled Phase 6 Settings sidebar placeholder with a real admin route, and update middleware admin URL patterns so `/settings` gets the same advertise-nothing admin gate as `/dashboard` and `/policies`.
- **D-24: Billing page display stays minimal.** Show current plan, subscription status, current period end, cancel-at-period-end state, and either a Manage billing action or checkout/setup CTA. Do not show invoice history, customer email, full Stripe customer/subscription IDs, or raw billing identities.
- **D-25: Customer Portal creation is on-demand and customer-ID authoritative from DB only.** Portal creation must require admin org context, use only `organizations.stripeCustomerId`, ignore/reject client-supplied customer IDs, create a fresh short-lived portal session, and show setup/checkout when no linked customer exists.
- **D-26: Use familiar existing UI patterns.** Reuse shadcn Card/Button/Badge/Select/Tooltip patterns already present in admin and pricing pages. Any status badge copy should be concise and operational, not a marketing page.

### Tier Gates
- **D-27: `maxUsers` becomes a real count.** Extend `checkTierLimit` so `maxUsers` counts current org users instead of returning `0`. Use explicit org filtering and preserve the existing `{ allowed, limit, current }` shape.
- **D-28: Do not build a first-party invite/user-management flow in Phase 6.** If there is no in-scope user creation surface to block, Phase 6 still satisfies `maxUsers` by returning the correct predicate. Clerk webhook rejection or custom invitation gating belongs to a later user-management phase.
- **D-28a: `maxUsers` is non-destructive in Phase 6.** Do not delete users, mutate Clerk remotely, or build invitation enforcement. The Phase 6 obligation is the correct predicate and gates where first-party surfaces already exist.
- **D-29: Tier-bound feature gates stay app-layer.** Do not move billing authority into middleware. Existing API routes and future Server Components/Actions call the `lib/stripe/products.ts` helpers and return/redirect with the established 403/429 semantics.
- **D-30: Starter upgrade path remains `/pricing`.** Existing AI routes already return `upgradeUrl: '/pricing'`; Phase 6 should keep that response contract unless a later UI decision introduces a dedicated upgrade route.

### Testing, CI, And UAT
- **D-31: Tests split by risk.** Unit tests cover catalog parsing, helper normalization, status policy, and typed errors. Route/webhook tests cover signature failure, duplicate delivery, replay, out-of-order events, stale invoice after deletion, unknown Price IDs, missing metadata, and ambiguous org mapping. DB-backed tests cover migration/index shape and transaction rollback behavior where mocks are insufficient.
- **D-32: Mock Stripe SDK at module boundaries for deterministic automated tests.** Do not call live Stripe from normal unit/integration tests. Live Stripe belongs to the manual sandbox/test-clock UAT checklist.
- **D-33: UAT uses Stripe sandbox/test-clock flows where practical.** Manual evidence must prove checkout, webhook sync, tier-gate change only after webhook, portal access, renewal `invoice.paid`, failed payment past_due without immediate downgrade, and canceled/unpaid downgrade to Starter.
- **D-34: Evidence is masked.** UAT evidence may include PASS/FAIL, masked org/customer/subscription IDs, Stripe event ID, event type, and observed DB tier/status. It must not include API keys, webhook secrets, raw payloads, customer email, or full customer IDs.
- **D-35: `verify:phase-6` is cumulative and hosted.** Wire `pnpm verify:phase-6` exactly as the amended SPEC states, including `pnpm verify:phase-5`, billing-specific tests, `pnpm db:verify`, and `pnpm check:artifacts`. Add or update the PR/push hosted verification workflow so Phase 6 has a required full verification job.

### Claude's Discretion
- Exact helper names and file split inside `lib/stripe/*`, as long as the tier/price source of truth remains `lib/stripe/products.ts` and raw DB imports stay explicitly allow-listed.
- Exact billing settings layout and copy, as long as it stays within the minimal display fields and avoids raw billing identities.
- Exact test file names and fixture builders, as long as the SPEC-required replay/out-of-order/status-policy coverage lands.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Contracts
- `.planning/phases/06-billing/06-SPEC.md` - Locked Phase 6 requirements, approved Stripe SDK decision, approved additive schema delta, webhook correctness rules, verification/UAT rules.
- `.planning/phases/06-billing/06-CHATGPT-PRO-REVIEW-BRIEF.md` - External review package, repo evidence map, current-doc anchors, and stress-test questions.
- `.planning/ROADMAP.md` - Phase 6 goal, success criteria, dependency on Phase 4 under ADR-029, and Phase 8 renewal dependency.
- `.planning/PROJECT.md` - Locked ADRs, especially ADR-013, ADR-017, ADR-020, ADR-023, ADR-024, ADR-025, ADR-026, and ADR-029.
- `.planning/REQUIREMENTS.md` - Tier requirements and final acceptance criteria.

### Billing And Schema Contracts
- `reference/TIER-LIMITS.md` - Tier constants, six Stripe Price env vars, 20% annual discount, and tier-limit response shape.
- `reference/API-SPEC.md` - Existing Stripe webhook contract; Phase 6 SPEC tightens `invoice.paid` and canonical subscription handling beyond this older baseline.
- `reference/SCHEMA.md` - Frozen schema reference for baseline organization Stripe fields and `stripe_events`.
- `.env.local.example` - Stripe secret/webhook/publishable env vars and six Price ID slots.
- `drizzle/meta/_journal.json` - Migration immutability and next migration index after `0011_qa_citation_grants`.
- `docs/runbooks/deploy-migrations.md` - Migration procedure for staging/prod once implementation depends on the new additive migration.

### Existing Code To Reuse Or Extend
- `lib/stripe/products.ts` - Existing `TIER_LIMITS`, `PlanTier`, `checkTierLimit`, `requireTierLimit`; Phase 6 extends price mapping and `maxUsers` counting here.
- `lib/stripe/errors.ts` - Billing typed-error precedent; no raw built-in errors in `lib/stripe/**`.
- `lib/stripe/products.test.ts` - Existing tier-limit unit test style and mocking pattern.
- `lib/db/schema.ts` - Drizzle source of truth for `organizations` and `stripeEvents`.
- `app/api/webhooks/clerk/route.ts` - Existing webhook analog for raw-body-first discipline, idempotency, sanitization, and retry cleanup patterns.
- `scripts/check-db-imports.ts` - ADR-023 raw DB import allow-list; already includes future Stripe webhook route.
- `scripts/check-artifacts.ts`, `scripts/check-deploy-schema.ts`, `scripts/check-schema.ts` - Artifact and schema gates that Phase 6 must extend.
- `app/(marketing)/pricing/page.tsx` - Current static pricing page to update with non-authoritative plan/interval intent.
- `components/admin/AdminSidebar.tsx` and `middleware.ts` - Settings navigation and admin route-gate pattern to update for Phase 6.
- `app/api/ai/draft/route.ts` and `app/api/ai/consistency/route.ts` - Existing 429/403 tier-gate response shape and `requireTierLimit` usage.
- `app/(admin)/policies/new/actions.ts` and `app/(admin)/policies/[id]/actions.ts` - Existing admin Server Action conventions.

### Prior Phase Context
- `.planning/phases/04-ai-layer/04-CONTEXT.md` - D-14/D-15/D-16/D-24 tier helper, typed error, and verify-chain decisions that Phase 6 extends.
- `.planning/phases/05-employee-portal/05-CONTEXT.md` - Server Action, useActionState, migration, live TEST DB verification, and verify-chain patterns.
- `.planning/phases/02-data-layer/02-CONTEXT.md` - Raw DB allow-list, RLS, migration discipline, and `stripe_events` table origin.

### Current Official Stripe Docs
- `ctx7:/websites/stripe` - Refreshed during this discussion for Checkout subscription sessions, metadata, raw-body webhook verification, subscription lifecycle events, Customer Portal, and test-mode/test-clock concerns.
- `https://docs.stripe.com/api/checkout/sessions/create` - Checkout Session creation fields including subscription mode, metadata, customer, and reconciliation fields.
- `https://docs.stripe.com/webhooks` - Raw body and signature verification.
- `https://docs.stripe.com/billing/subscriptions/webhooks` - Subscription lifecycle event handling.
- `https://docs.stripe.com/customer-management/integrate-customer-portal` - Authenticated customer portal session creation and short-lived portal URLs.
- `https://docs.stripe.com/billing/testing` - Billing sandbox/test clock scenarios.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/stripe/products.ts`: The binding tier source of truth; extend it for Price ID catalog lookup and `maxUsers` counting without breaking Phase 4 tests.
- `lib/stripe/errors.ts`: Typed billing errors already exist and are scanned by the error-discipline gate.
- `app/api/webhooks/clerk/route.ts`: Practical pattern for signature verification, raw body first, idempotency table insert, sanitized logging, and retry cleanup.
- `components/admin/AdminSidebar.tsx`: Settings is already present as a disabled Phase 6 placeholder; Phase 6 can enable it.
- `components/ui/*`: Card, Button, Select, Badge, Tooltip, Skeleton, and Table primitives are already available for the admin billing page.
- `app/(marketing)/pricing/page.tsx`: Existing tier cards and pricing copy can be updated rather than rebuilt.

### Established Patterns
- Admin pages live under `app/(admin)` and are gated by both `middleware.ts` URL patterns and `app/(admin)/layout.tsx` `requireAdmin()`.
- Server Actions use Zod validation, `getOrgContext()`, `requireAdminFromCtx(ctx)`, and keep redirect/revalidation outside try/catch when applicable.
- Route handlers return `NextResponse.json(...)` for API responses; webhooks can return plain `Response` like the Clerk webhook.
- Verify chains are cumulative: each `verify:phase-N` wraps the prior phase and adds focused gates.
- Migrations are forward-only; partial indexes are hand-written SQL when Drizzle cannot represent them cleanly.

### Integration Points
- `middleware.ts` must include the new admin settings route in `ADMIN_URL_PATTERNS` and `ADMIN_ROLE_REQUIRED_PATTERNS`.
- `package.json` must add `verify:phase-6` and likely billing-specific check scripts.
- `.github/workflows/*` must include a required Phase 6 full verification job on PRs and pushes.
- `scripts/check-artifacts.ts` should assert the new billing route, catalog helpers, migration, webhook route shape, and UAT artifact presence.
- `scripts/check-deploy-schema.ts` / `scripts/check-schema.ts` should understand the new organization billing columns and partial indexes.

</code_context>

<specifics>
## Specific Ideas

- Keep the MVP billing surface quiet and operational: pricing intent, admin billing status, checkout/setup, and portal management. No invoice history or raw identifiers.
- Treat Checkout metadata as server-generated reconciliation hints, not user-controllable authority.
- Prefer fail-closed billing behavior over clever recovery: no Price ID match, no org match, ambiguous org match, or malformed subscription shape means no upgrade.
- UAT must be secret-safe and mask identifiers; evidence should be useful for future audit without becoming a secret leak.

</specifics>

<deferred>
## Deferred Ideas

- Sales tax, coupons, trials, custom dunning emails, invoice PDFs, revenue analytics, and custom billing identity.
- Full user-management/invitation flow that blocks Clerk-created users before `maxUsers` is exceeded.
- Displaying invoice history or customer billing identity inside PolicyPilot; Customer Portal remains the hosted Stripe surface.
- Tax/regulatory billing treatment and production backfill/migration of existing Stripe customers.
- Stripe MCP-dependent workflows; MCP can assist later, but implementation should not depend on it.

</deferred>

---

*Phase: 06-Billing*
*Context gathered: 2026-05-27T23:51:45-04:00*
