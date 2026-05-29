---
phase: 06-billing
plan: 04
type: execute
wave: 2
depends_on: ["06-01"]
files_modified:
  - app/(admin)/settings/actions.ts
  - app/(admin)/settings/actions.test.ts
  - app/(marketing)/pricing/page.tsx
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: true

must_haves:
  truths:
    - "Trusted checkout starts from the authenticated admin surface (/settings) — not the public pricing page; the action derives orgId from getOrgContext() and requires admin via requireAdminFromCtx(ctx); employees/unauthenticated cannot create a session (D-07, D-08, SPEC R2)."
    - "The server ignores/rejects any client-supplied org/customer/subscription/price/client_reference/metadata; only non-authoritative {tier, interval} intent is read (D-06, D-08, SPEC R2, L2)."
    - "The Price ID is chosen server-side from the locked catalog; an unknown tier/interval fails closed (D-05, D-08)."
    - "Checkout Session sets mode='subscription', client_reference_id=orgId, metadata.policyPilotOrgId=orgId, subscription_data.metadata.policyPilotOrgId=orgId, customer=stripeCustomerId when present (D-08, D-09)."
    - "Checkout rejects/redirects to portal when the org already has an active/trialing/past_due subscription (D-09a)."
    - "success_url=/settings?billing=success and cancel_url=/settings?billing=canceled are set (M1)."
    - "organizations.planTier is NOT mutated by checkout — only the verified webhook writes it (SPEC R2)."
    - "A multi-org admin's checkout bills the ACTIVE session org; the webhook maps via metadata.policyPilotOrgId (L2, ADR-027)."
    - "Public pricing exposes monthly/annual + tier intent as query params only — never a trusted subscription for an anonymous browser (D-06, SPEC R2)."
  artifacts:
    - path: "app/(admin)/settings/actions.ts"
      provides: "createCheckoutSessionAction Server Action (server-derived org, catalog price, dup-subscription guard)"
      contains: "createCheckoutSessionAction"
    - path: "app/(marketing)/pricing/page.tsx"
      provides: "Monthly/annual segmented control + tier/interval CTA query params"
      contains: "interval"
  key_links:
    - from: "app/(admin)/settings/actions.ts"
      to: "getOrgContext + requireAdminFromCtx"
      via: "auth gate before any Stripe call"
      pattern: "requireAdminFromCtx"
    - from: "app/(admin)/settings/actions.ts"
      to: "stripe.checkout.sessions.create"
      via: "server-derived priceId + client_reference_id + metadata"
      pattern: "checkout\\.sessions\\.create"
    - from: "app/(admin)/settings/actions.ts"
      to: "tierAndIntervalToPriceId catalog"
      via: "server-side price selection from locked catalog"
      pattern: "tierAndIntervalToPriceId"
---

<objective>
Build the trusted checkout entry point: a Server Action (invoked from the authenticated admin /settings surface per D-07) that derives the org from server auth context, selects a Price ID from the locked catalog, guards against duplicate subscriptions, and creates a Stripe Checkout Session with server-derived reconciliation metadata. Update the public pricing page to carry non-authoritative monthly/annual + tier intent only.

Purpose: SPEC R2 / SC#3 — plan selection must create a checkout for the authenticated org, never an anonymous browser, and the server must reject any forged client billing input. planTier stays untouched until the webhook (Plan 02) processes the verified event.
Output: `createCheckoutSessionAction` in admin settings actions + tests, and pricing-page intent controls.
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
<!-- From Plan 06-01: lib/stripe/catalog.ts tierAndIntervalToPriceId, priceIdToTier; lib/stripe/client.ts getStripeClient -->
<!-- Auth (lib/auth/context.ts, lib/auth/require-admin.ts): -->
export async function getOrgContext(): Promise<OrgContext>;   // OrgContext.orgId = internal UUID (active session org)
export function requireAdminFromCtx(ctx: OrgContext): void;     // throws ForbiddenError -> 403 on non-admin
export async function requireAdmin(): Promise<OrgContext>;       // page-level: notFound() (404) on non-admin

<!-- Admin Server Action conventions (app/(admin)/policies/new/actions.ts,
     app/(admin)/policies/[id]/actions.ts): 'use server'; Zod validate; getOrgContext;
     requireAdminFromCtx; redirect/revalidate OUTSIDE try/catch. -->
<!-- D-07: trusted checkout starts from /settings (the Settings sidebar surface enabled in Plan 06-05).
     The action is defined here in Plan 06-04; Plan 06-05 adds the /settings page that invokes it. -->
<!-- Reading org row: prefer getOrgContext()/withOrgScope (scoped) so NO check-db-imports
     allow-list change is needed (06-RESEARCH Open Question #4). If raw db is unavoidable for
     the dup-subscription read, add app/(admin)/settings/actions.ts to scripts/check-db-imports.ts
     ALLOWLIST with explicit justification — but prefer the scoped read. -->
<!-- 06-RESEARCH Open Question #3: verify redirect(session.url) works from a Next.js 15 Server
     Action to an EXTERNAL Stripe URL at execute time; fallback = return { url } and redirect client-side. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: createCheckoutSessionAction Server Action + tests</name>
  <files>app/(admin)/settings/actions.ts, app/(admin)/settings/actions.test.ts</files>
  <behavior>
    - Non-admin (employee) caller -> requireAdminFromCtx throws ForbiddenError (403 path); no Stripe call (SPEC R2, R5).
    - Unauthenticated -> getOrgContext throws (401 path); no Stripe call.
    - Valid admin + {tier:'growth', interval:'monthly'} -> tierAndIntervalToPriceId returns the growth-monthly price; checkout.sessions.create called with mode='subscription', client_reference_id=ctx.orgId, metadata.policyPilotOrgId=ctx.orgId, subscription_data.metadata.policyPilotOrgId=ctx.orgId, success_url '/settings?billing=success', cancel_url '/settings?billing=canceled' (D-08, M1).
    - Org already has stripeSubscriptionStatus in {active,trialing,past_due} -> NO new checkout; redirect to portal/settings (D-09a).
    - Client-supplied org/customer/subscription/price/metadata in the form input -> IGNORED; the action only reads tier+interval and derives everything else server-side (D-06, D-08). Assert a forged orgId field does not change client_reference_id.
    - Unknown tier/interval combination -> fail closed (throw), no Stripe call (D-05).
    - When org.stripeCustomerId is set -> session includes customer=that id; when null -> customer omitted (D-09).
    - Multi-org admin: client_reference_id/metadata equal the ACTIVE session org from getOrgContext, not any submitted value (L2).
    - The action never mutates organizations.planTier (SPEC R2).
  </behavior>
  <read_first>
    - app/(admin)/policies/new/actions.ts + app/(admin)/policies/[id]/actions.ts (Server Action conventions: 'use server', Zod, getOrgContext, requireAdminFromCtx, redirect outside try/catch)
    - 06-RESEARCH.md Pattern 7 (Checkout Server Action) + Code Examples (checkout.sessions.create) + Open Questions #3 (redirect) & #4 (db allow-list)
    - 06-SPEC.md § Stripe-to-org linkage (locked checkout fields) + D-07 (trusted checkout starts from /settings) + D-09a (dup-subscription guard)
    - lib/stripe/catalog.ts, lib/stripe/client.ts, lib/auth/require-admin.ts
  </read_first>
  <action>
    Write `app/(admin)/settings/actions.test.ts` FIRST (RED) covering the behaviors above; mock `getStripeClient` (assert checkout.sessions.create args), `getOrgContext`/`requireAdminFromCtx`, and the org-row read. Then create `app/(admin)/settings/actions.ts` with `'use server'` — this is the trusted checkout home invoked from the admin /settings surface (D-07; the page lands in Plan 06-05). Implement `createCheckoutSessionAction(formData: FormData): Promise<void>` (or return `{ url }` if the redirect fallback is needed — verify per OQ#3): (1) `const ctx = await getOrgContext(); requireAdminFromCtx(ctx);` OUTSIDE try (auth errors propagate per D-37 convention); (2) Zod-parse ONLY `{ tier: enum, interval: enum }` from formData — ignore every other field (D-06, D-08); (3) `const priceId = tierAndIntervalToPriceId(intent.tier, intent.interval)`; throw fail-closed if undefined (D-05); (4) read the org row by ctx.orgId via a SCOPED read (getOrgContext-derived / withOrgScope) to avoid a check-db-imports allow-list change (OQ#4) — read stripeCustomerId + stripeSubscriptionStatus; (5) if stripeSubscriptionStatus in {active,trialing,past_due} redirect to the portal/settings instead of creating a session (D-09a); (6) `stripe.checkout.sessions.create({ mode:'subscription', line_items:[{price:priceId, quantity:1}], client_reference_id: ctx.orgId, metadata:{ policyPilotOrgId: ctx.orgId }, subscription_data:{ metadata:{ policyPilotOrgId: ctx.orgId } }, ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : {}), success_url: \`${appUrl}/settings?billing=success\`, cancel_url: \`${appUrl}/settings?billing=canceled\` })` (D-08, D-09, M1); (7) `redirect(session.url)` OUTSIDE the try/catch (verify Server-Action external redirect per OQ#3; fallback: return `{ url }`). NEVER write organizations.planTier here (SPEC R2). (D-05, D-06, D-07, D-08, D-09, D-09a, L2, M1)
  </action>
  <verify>
    <automated>pnpm test -- --run app/(admin)/settings/actions.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - All behaviors pass; the test asserting a forged orgId field does NOT change client_reference_id passes (L2/SPEC R2).
    - grep confirms `requireAdminFromCtx` is called before any `getStripeClient`/`checkout.sessions.create` call.
    - grep confirms the Zod schema parses ONLY tier + interval (no client orgId/customer/price/metadata read).
    - grep confirms success_url contains `billing=success` and cancel_url contains `billing=canceled` (M1).
    - grep confirms no `organizations` UPDATE/planTier write in actions.ts (SPEC R2).
    - `pnpm check:db-imports` passes (scoped read; OR actions.ts added to allow-list with justification if raw db was required).
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>Server-derived, admin-only checkout (from /settings, D-07) with locked metadata, dup-subscription guard, and M1 redirect URLs; planTier untouched; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Pricing page monthly/annual + tier intent (non-authoritative)</name>
  <files>app/(marketing)/pricing/page.tsx</files>
  <read_first>
    - app/(marketing)/pricing/page.tsx (FULL — existing tiers array + Card layout + buttonVariants+Link CTA pattern; base-nova has no asChild)
    - 06-CONTEXT.md D-06 (intent only) + D-26 (reuse Card/Button/Badge/Select/Tooltip)
    - reference/TIER-LIMITS.md (20% annual discount for annual labels)
  </read_first>
  <action>
    Update `app/(marketing)/pricing/page.tsx` to add a monthly/annual segmented control (reuse shadcn primitives per D-26) and make each tier CTA carry NON-AUTHORITATIVE intent via query params (e.g. `/sign-up?tier=growth&interval=monthly` for anonymous visitors, since trusted checkout lives behind admin auth at /settings per D-07). The interval toggle updates displayed prices (monthly vs ~20% annual per reference/TIER-LIMITS.md) and the CTA query string. The page must NOT call any Stripe API, must NOT create a session, and must NOT read or write any org/customer/subscription state — it carries display + intent only (D-06, SPEC R2). Keep the existing three-tier Card structure; do not regress existing copy/links beyond adding the interval control + intent params. If a client-interactive toggle is needed, mark the toggle a client component while keeping the page server-rendered.
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - pricing/page.tsx contains a monthly/annual control and tier+interval CTA query params (grep: `interval` and `tier=` present).
    - grep confirms NO Stripe import / no `sessions.create` / no `@/lib/db` import in pricing/page.tsx (intent only, D-06).
    - `pnpm typecheck` exits 0.
    - `pnpm build` (run in the verify chain later) does not regress the marketing route.
  </acceptance_criteria>
  <done>Pricing page exposes monthly/annual + tier intent as query params with no billing authority.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser form -> createCheckoutSessionAction | Untrusted; only {tier,interval} read, everything else ignored |
| pricing page (public) -> sign-up | Anonymous intent only; never a trusted subscription |
| Server Action -> Stripe Checkout | Server-derived orgId/price/metadata; admin-gated |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-17 | Tampering | forged checkout (client supplies org/customer/price/metadata) | mitigate | Zod reads only tier+interval; orgId/price/metadata derived server-side from getOrgContext + catalog; forged fields ignored (D-06, D-08, L2) |
| T-6-18 | Elevation of Privilege | employee/unauthenticated creates checkout | mitigate | getOrgContext + requireAdminFromCtx before any Stripe call; trusted checkout only from authenticated /settings (D-07, SPEC R2, R5) |
| T-6-19 | Tampering | duplicate active subscription | mitigate | dup-subscription guard rejects/redirects when status in {active,trialing,past_due} (D-09a) + partial unique index backstop (Plan 01) |
| T-6-20 | Spoofing | cross-org billing for multi-org admin | mitigate | client_reference_id/metadata bound to ctx.orgId (active session org), never a submitted value (L2, ADR-027) |
| T-6-21 | Information Disclosure | pricing page leaks billing state | accept | Public page is display/intent only — no org/customer/subscription read (D-06) |
</threat_model>

<verification>
- `pnpm test -- --run app/(admin)/settings/actions.test.ts` passes (auth gate, forged-input rejection, dup guard, metadata, M1 URLs).
- `pnpm typecheck` exits 0.
- `pnpm check:db-imports` passes.
</verification>

<success_criteria>
- Admin-only, server-derived checkout (from /settings, D-07) with locked client_reference_id/metadata and M1 success/cancel URLs.
- Forged client billing input ignored; dup-subscription guard active; planTier untouched.
- Pricing page carries monthly/annual + tier intent only, no billing authority.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-04-SUMMARY.md` when done.
</output>
