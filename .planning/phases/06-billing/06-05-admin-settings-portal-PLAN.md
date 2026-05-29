---
phase: 06-billing
plan: 05
type: execute
wave: 3
depends_on: ["06-01", "06-04"]
files_modified:
  - app/(admin)/settings/page.tsx
  - app/(admin)/settings/actions.ts
  - app/(admin)/settings/actions.test.ts
  - components/admin/AdminSidebar.tsx
  - middleware.ts
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: true

must_haves:
  truths:
    - "An authenticated admin can open /settings and see current plan, subscription status, current period end, and cancel-at-period-end state read from the DB (D-24, SPEC R5, SC#5)."
    - "createPortalSessionAction requires admin org context, uses ONLY organizations.stripeCustomerId, and ignores/rejects client-supplied customer IDs (D-25, SPEC R5)."
    - "Admin with a linked customer gets a Stripe-hosted portal URL; admin without a linked customer gets a setup/checkout CTA (D-25, SPEC R5)."
    - "Employees and unauthenticated users cannot create a portal session (SPEC R5)."
    - "The billing UI distinguishes 'no subscription' (stripeSubscriptionId IS NULL) from 'trialing' — a never-subscribed org never shows 'trialing' despite the default status column (L1)."
    - "/settings is gated by middleware ADMIN_URL_PATTERNS + ADMIN_ROLE_REQUIRED_PATTERNS with the same advertise-nothing 404 behavior as /dashboard; middleware stays auth/role-only (D-23, ADR-024)."
    - "No invoice history, customer email, or full Stripe customer/subscription IDs are displayed (D-24)."
  artifacts:
    - path: "app/(admin)/settings/page.tsx"
      provides: "Admin billing RSC: plan/status/period-end/cancel-state + Manage billing or setup CTA"
      contains: "stripeSubscriptionStatus"
    - path: "app/(admin)/settings/actions.ts"
      provides: "createPortalSessionAction (DB customerId only)"
      contains: "createPortalSessionAction"
    - path: "middleware.ts"
      provides: "/settings added to ADMIN_URL_PATTERNS + ADMIN_ROLE_REQUIRED_PATTERNS"
      contains: "settings"
  key_links:
    - from: "components/admin/AdminSidebar.tsx"
      to: "/settings"
      via: "enabled Settings nav link (replaces disabled Phase 6 placeholder)"
      pattern: "/settings"
    - from: "app/(admin)/settings/actions.ts createPortalSessionAction"
      to: "stripe.billingPortal.sessions.create"
      via: "customer = organizations.stripeCustomerId (DB only)"
      pattern: "billingPortal\\.sessions\\.create"
    - from: "middleware.ts ADMIN_URL_PATTERNS"
      to: "/settings route gate"
      via: "regex /^\\/settings(\\/|$)/"
      pattern: "settings"
---

<objective>
Ship the admin billing surface: enable the reserved Settings nav, gate `/settings` in middleware, render a minimal billing status page from the DB, and add a Customer Portal Server Action that creates a Stripe-hosted portal session using only the org's stored customer ID.

Purpose: SPEC R5 / SC#5 — admins need a billing home that shows current plan/status and opens the Stripe Customer Portal, with no client billing authority and no leaked identifiers. Closes carry-forward L1 (no false 'trialing' for never-subscribed orgs).
Output: enabled sidebar Settings link + middleware gate + `/settings` RSC page + `createPortalSessionAction`.
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
<!-- From Plan 06-01: lib/stripe/client.ts getStripeClient. From Plan 06-04: app/(admin)/settings/actions.ts already
     has createCheckoutSessionAction — THIS plan ADDS createPortalSessionAction to the same file. -->
<!-- Auth: getOrgContext(): OrgContext (orgId internal UUID, role); requireAdminFromCtx(ctx) throws ForbiddenError;
     requireAdmin() page-level notFound() (404) on non-admin. -->
<!-- organizations columns after 0012: planTier, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus,
     stripePriceId, stripeCurrentPeriodEnd, stripeCancelAtPeriodEnd, stripeLastEventCreated. -->

<!-- AdminSidebar.tsx: the Settings item is currently a DISABLED placeholder
     (tooltip "Available in Phase 6"). Enable it as render={<Link href="/settings" />} mirroring Dashboard/Policies. -->
<!-- middleware.ts: ADMIN_URL_PATTERNS = [/^\/dashboard(\/|$)/, /^\/policies(\/|$)/];
     ADMIN_ROLE_REQUIRED_PATTERNS identical. Add /^\/settings(\/|$)/ to BOTH. Middleware stays auth/role-only (ADR-024). -->
<!-- 06-RESEARCH Assumption A2: confirm SDK method is stripe.billingPortal.sessions.create (not createPortalSession) at execute time. -->
<!-- UI primitives: components/ui Card/Button/Badge/Select/Tooltip (D-26). -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: createPortalSessionAction + middleware/sidebar wiring</name>
  <files>app/(admin)/settings/actions.ts, app/(admin)/settings/actions.test.ts, middleware.ts, components/admin/AdminSidebar.tsx</files>
  <behavior>
    - Admin with org.stripeCustomerId set -> billingPortal.sessions.create({ customer: storedId, return_url: '.../settings' }) -> redirect to portal URL (D-25, SPEC R5).
    - Admin with org.stripeCustomerId null -> NO portal session; redirect/return a setup/checkout CTA signal (D-25).
    - Employee caller -> requireAdminFromCtx throws (403); no portal session.
    - Unauthenticated -> getOrgContext throws (401); no portal session.
    - Forged customer ID in form input -> IGNORED; the action reads customer ONLY from organizations.stripeCustomerId via server context (D-25).
    - middleware: a request to /settings without admin role -> 404 (advertise-nothing, same as /dashboard); authenticated admin -> allowed (D-23).
  </behavior>
  <read_first>
    - app/(admin)/settings/actions.ts (from Plan 06-04 — ADD to this file, preserve createCheckoutSessionAction)
    - 06-RESEARCH.md Code Examples (Customer Portal Session) + Assumption A2 (method name) + D-25
    - middleware.ts (ADMIN_URL_PATTERNS / ADMIN_ROLE_REQUIRED_PATTERNS + the advertise-nothing 404 admin gate)
    - components/admin/AdminSidebar.tsx (disabled Settings placeholder to enable; render={<Link/>} pattern)
    - lib/auth/require-admin.ts, lib/auth/context.ts
  </read_first>
  <action>
    Extend `app/(admin)/settings/actions.test.ts` (RED) with the portal behaviors above; mock getStripeClient (assert billingPortal.sessions.create args), getOrgContext/requireAdminFromCtx, and the org-row read. Add `createPortalSessionAction(formData?: FormData): Promise<void>` to `app/(admin)/settings/actions.ts` ('use server'): `const ctx = await getOrgContext(); requireAdminFromCtx(ctx);` outside try; read the org row by ctx.orgId via the SAME scoped read used in Plan 06-04 (avoid a check-db-imports change, OQ#4); if `stripeCustomerId` is null, redirect to `/settings?billing=setup` (setup/checkout CTA, D-25); else `stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: \`${appUrl}/settings\` })` (verify the method path per Assumption A2) and `redirect(portalSession.url)` outside try/catch. NEVER read a client-supplied customer id (D-25). Then enable the Settings nav in `components/admin/AdminSidebar.tsx`: replace the disabled placeholder SidebarMenuButton with an active `render={<Link href="/settings" />}` mirroring the Dashboard/Policies entries (isActive("/settings")). In `middleware.ts`, add `/^\/settings(\/|$)/` to BOTH `ADMIN_URL_PATTERNS` and `ADMIN_ROLE_REQUIRED_PATTERNS` (middleware stays auth/role-only — NO planTier read, ADR-024 / D-23). (D-23, D-25, SPEC R5)
  </action>
  <verify>
    <automated>pnpm test -- --run app/(admin)/settings/actions.test.ts && pnpm check:admin-routes</automated>
  </verify>
  <acceptance_criteria>
    - Portal behaviors pass; forged-customer-id test proves customer comes only from organizations.stripeCustomerId.
    - grep confirms `requireAdminFromCtx` precedes any `billingPortal.sessions.create` call.
    - middleware.ts ADMIN_URL_PATTERNS and ADMIN_ROLE_REQUIRED_PATTERNS each include a `/settings` regex; middleware contains NO planTier/tier read (grep: no `planTier` in middleware.ts).
    - AdminSidebar.tsx Settings item is an active Link to /settings (grep: `href="/settings"`), not a disabled placeholder.
    - `pnpm check:admin-routes` passes with /settings recognized as an admin route.
    - `pnpm check:db-imports` passes.
  </acceptance_criteria>
  <done>Portal action (DB customerId only), enabled Settings nav, and middleware /settings gate are in place; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Admin billing settings page (RSC)</name>
  <files>app/(admin)/settings/page.tsx</files>
  <read_first>
    - app/(admin)/layout.tsx pattern + lib/auth/require-admin.ts (requireAdmin() page-level 404 gate)
    - 06-CONTEXT.md D-24 (minimal display fields) + D-26 (Card/Button/Badge) + L1 (distinguish no-subscription from trialing)
    - components/ui Card/Button/Badge/Tooltip
    - app/(admin)/settings/actions.ts (createCheckoutSessionAction + createPortalSessionAction to wire as form actions)
  </read_first>
  <action>
    Create `app/(admin)/settings/page.tsx` as an RSC. Call `requireAdmin()` (page-level 404 on non-admin). Read the org's billing row via a scoped read by ctx.orgId: planTier, stripeSubscriptionStatus, stripeCurrentPeriodEnd, stripeCancelAtPeriodEnd, stripeCustomerId, stripeSubscriptionId. Render with shadcn Card/Badge (D-26): current plan, subscription status, current period end, and a cancel-at-period-end indicator when true. L1: derive the displayed status from BOTH columns — if `stripeSubscriptionId IS NULL`, show "No active subscription" (NOT "trialing", even though stripeSubscriptionStatus defaults to 'trialing'); otherwise show the real status. When `stripeCustomerId` is present render a "Manage billing" button posting to `createPortalSessionAction`; when absent render a checkout/setup CTA (the plan-selection form posting to `createCheckoutSessionAction` with tier/interval, reading optional `?tier`/`?interval` query intent from Plan 06-04). Read the `?billing=success|canceled|setup` query param to show a small confirmation/notice banner (M1). Do NOT display invoice history, customer email, or full Stripe customer/subscription IDs (D-24). (D-23, D-24, L1, M1, SPEC R5)
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm build</automated>
  </verify>
  <acceptance_criteria>
    - settings/page.tsx calls `requireAdmin()` (grep) before reading billing state.
    - grep confirms the page renders stripeSubscriptionStatus, stripeCurrentPeriodEnd, and a cancel-at-period-end indicator.
    - grep confirms the L1 branch: a `stripeSubscriptionId == null` path renders a no-subscription label distinct from 'trialing'.
    - grep confirms NO display of customer email / full `cus_` / full `sub_` id / invoice history (D-24).
    - The page wires `createPortalSessionAction` (linked-customer) and `createCheckoutSessionAction` (no-customer) as form actions.
    - `pnpm typecheck` and `pnpm build` exit 0.
  </acceptance_criteria>
  <done>Minimal admin billing page renders DB-sourced status, distinguishes no-subscription from trialing, and wires portal/checkout actions.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> createPortalSessionAction | Untrusted; customer id never read from input |
| /settings route -> middleware | Admin-role gate; advertise-nothing 404 |
| settings page -> DB billing row | Display-only read; no client billing authority |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-22 | Tampering | portal customer-id injection | mitigate | createPortalSessionAction reads customer only from organizations.stripeCustomerId via server ctx; client input ignored (D-25) |
| T-6-23 | Elevation of Privilege | employee/unauthenticated opens portal | mitigate | requireAdminFromCtx before billingPortal.sessions.create; /settings in ADMIN_ROLE_REQUIRED_PATTERNS (SPEC R5, D-23) |
| T-6-24 | Information Disclosure | leaking customer email / full Stripe ids / invoices | mitigate | D-24 minimal display set; page renders none of these |
| T-6-25 | Information Disclosure | route discovery of /settings | mitigate | Middleware 404 (advertise-nothing) for non-admin, same as /dashboard (D-23) |
| T-6-26 | Tampering | misleading 'trialing' for never-subscribed org | mitigate | L1 — display derived from stripeSubscriptionId NULL check, not the default status column |
</threat_model>

<verification>
- `pnpm test -- --run app/(admin)/settings/actions.test.ts` passes (portal auth, forged-id rejection, setup CTA).
- `pnpm check:admin-routes` recognizes /settings as admin-gated.
- `pnpm typecheck` and `pnpm build` exit 0.
- `pnpm check:db-imports` passes.
</verification>

<success_criteria>
- Settings nav enabled; /settings middleware-gated (auth/role only).
- Admin billing page shows DB-sourced plan/status/period-end/cancel state; distinguishes no-subscription from trialing (L1); no leaked identifiers.
- Customer Portal action uses DB customerId only; setup CTA when unlinked; admin-only.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-05-SUMMARY.md` when done.
</output>
