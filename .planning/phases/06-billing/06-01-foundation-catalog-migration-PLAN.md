---
phase: 06-billing
plan: 01
type: execute
wave: 0
depends_on: []
files_modified:
  - lib/stripe/client.ts
  - lib/stripe/catalog.ts
  - lib/stripe/catalog.test.ts
  - lib/stripe/mask.ts
  - lib/db/schema.ts
  - drizzle/0012_billing_state.sql
  - drizzle/meta/_journal.json
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: false
user_setup:
  - service: stripe
    why: "Subscription billing — Checkout, Customer Portal, webhook, subscription retrieval"
    env_vars:
      - name: STRIPE_SECRET_KEY
        source: "Stripe Dashboard -> Developers -> API keys (test mode secret key)"
      - name: STRIPE_WEBHOOK_SECRET
        source: "Stripe Dashboard -> Developers -> Webhooks -> endpoint signing secret"
      - name: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        source: "Stripe Dashboard -> Developers -> API keys (test mode publishable key)"
      - name: STRIPE_PRICE_STARTER_MONTHLY
        source: "Stripe Dashboard -> Product catalog -> Starter monthly price ID"
      - name: STRIPE_PRICE_STARTER_ANNUAL
        source: "Stripe Dashboard -> Product catalog -> Starter annual price ID"
      - name: STRIPE_PRICE_GROWTH_MONTHLY
        source: "Stripe Dashboard -> Product catalog -> Growth monthly price ID"
      - name: STRIPE_PRICE_GROWTH_ANNUAL
        source: "Stripe Dashboard -> Product catalog -> Growth annual price ID"
      - name: STRIPE_PRICE_BUSINESS_MONTHLY
        source: "Stripe Dashboard -> Product catalog -> Business monthly price ID"
      - name: STRIPE_PRICE_BUSINESS_ANNUAL
        source: "Stripe Dashboard -> Product catalog -> Business annual price ID"
    dashboard_config:
      - task: "Create 6 products/prices: Starter/Growth/Business x monthly/annual ($79/$199/$449 monthly; 20% annual discount per reference/TIER-LIMITS.md)"
        location: "Stripe Dashboard (test mode) -> Product catalog"

must_haves:
  truths:
    - "The official `stripe` package is installed and importable server-side; implementation relies on the SDK + checked docs + tests, never on Stripe MCP tooling (D-01, D-02)."
    - "All 9 Stripe env vars are populated in .env.local as test-mode sentinels, never printed (D-05)."
    - "A closed 6-entry price catalog maps (tier, interval) -> priceId -> tier and round-trips for Starter/Growth/Business x monthly/annual (D-05)."
    - "Missing, duplicate, or unknown price IDs fail closed before any checkout or webhook code runs (D-05)."
    - "organizations has 5 new additive billing columns and 2 partial unique indexes after migration 0012, applied to the TEST DB (D-10, D-11, D-12)."
    - "A server-only Stripe client singleton and masking helpers exist for sanitized logging (D-04)."
  artifacts:
    - path: "lib/stripe/catalog.ts"
      provides: "Closed price catalog: priceIdToTier(), tierAndIntervalToPriceId(), PRICE_CATALOG built+validated at module load"
      contains: "buildCatalog"
    - path: "lib/stripe/client.ts"
      provides: "Server-only lazy Stripe singleton getStripeClient()"
      contains: "getStripeClient"
    - path: "lib/stripe/mask.ts"
      provides: "maskCustomerId() / maskSubscriptionId() for sanitized logs"
      contains: "maskCustomerId"
    - path: "drizzle/0012_billing_state.sql"
      provides: "Additive migration: 5 org columns + 2 partial unique indexes"
      contains: "stripe_price_id"
    - path: "lib/db/schema.ts"
      provides: "5 new organizations Drizzle columns"
      contains: "stripeCurrentPeriodEnd"
  key_links:
    - from: "lib/stripe/catalog.ts"
      to: "process.env STRIPE_PRICE_* (6 slots)"
      via: "buildCatalog reads all 6 env vars at module load"
      pattern: "STRIPE_PRICE_STARTER_MONTHLY"
    - from: "drizzle/meta/_journal.json"
      to: "drizzle/0012_billing_state.sql"
      via: "journal entry idx=12 tag=0012_billing_state"
      pattern: "0012_billing_state"
---

<objective>
Establish the Phase 6 billing foundation: install the official Stripe SDK, populate the 9 Stripe env vars and create the 6 Stripe products (operator steps), author the closed price catalog + Stripe client singleton + masking helpers, and ship the additive `0012` billing-state migration applied to the TEST DB.

Purpose: Every downstream plan (webhook, checkout, portal, tier gates) depends on a fail-closed price catalog, durable billing columns, and a Stripe client. Nothing else can be built until these exist and the migration is live on the TEST DB.
Output: `stripe` installed; env populated; catalog/client/mask modules + tests; `0012` migration authored and applied to TEST DB.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/06-billing/06-SPEC.md
@.planning/phases/06-billing/06-CONTEXT.md
@.planning/phases/06-billing/06-RESEARCH.md
@reference/TIER-LIMITS.md
@CLAUDE.md

<interfaces>
<!-- Existing tier source of truth the catalog must align with. From lib/stripe/products.ts: -->
export const TIER_LIMITS = { starter: {...}, growth: {...}, business: {...} } as const;
export type PlanTier = keyof typeof TIER_LIMITS;   // 'starter' | 'growth' | 'business'

<!-- Current organizations columns (lib/db/schema.ts) — DO NOT modify existing; ADD ONLY: -->
organizations: id(uuid pk), clerkOrgId(text unique), name, slug, planTier(text notNull default 'starter'),
  stripeCustomerId(text), stripeSubscriptionId(text), stripeSubscriptionStatus(text default 'trialing'), createdAt
<!-- stripe_events already exists: id(text pk), processedAt(timestamp) -->

<!-- Env var names already declared in .env.local.example (lines 37-47): -->
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
STRIPE_PRICE_STARTER_MONTHLY, STRIPE_PRICE_STARTER_ANNUAL, STRIPE_PRICE_GROWTH_MONTHLY,
STRIPE_PRICE_GROWTH_ANNUAL, STRIPE_PRICE_BUSINESS_MONTHLY, STRIPE_PRICE_BUSINESS_ANNUAL
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking-human">
  <name>Task 0a: Operator — install Stripe SDK + populate env + create Stripe products</name>
  <what-built>Nothing yet — this is the gated operator setup that must complete before any Wave 1 code can run.</what-built>
  <read_first>
    - reference/TIER-LIMITS.md (six price tiers + 20% annual discount)
    - .env.local.example (lines 37-47 — the 9 Stripe env var names)
    - 06-RESEARCH.md § Package Legitimacy Audit (stripe@22.x official, no postinstall)
  </read_first>
  <how-to-verify>
    1. Run `pnpm add stripe` (operator-approved per 06-SPEC.md; pins stripe@22.x). Confirm `stripe` appears in package.json dependencies and `pnpm ls stripe` resolves. (D-01)
    2. In Stripe Dashboard (TEST MODE), create 6 products/prices: Starter/Growth/Business x monthly/annual ($79/$199/$449 monthly; annual ~20% discount per reference/TIER-LIMITS.md).
    3. Populate the 9 env vars in `.env.local` (NEVER print/echo values — set them, then verify presence only). Verify with a presence-only check that exits 0, e.g. confirm each var name is non-empty WITHOUT echoing the value.
    4. Confirm `.env.local` is gitignored (it already is). Note: Stripe MCP tooling is NOT required and is NOT a dependency — the SDK + Stripe CLI/sandbox cover all flows (D-02).
  </how-to-verify>
  <acceptance_criteria>
    - `pnpm ls stripe` exits 0 and reports a 22.x version.
    - A presence-only assertion proves all 9 env vars are set (non-empty) in `.env.local` without printing any value.
    - No secret value appears in any commit, log line, test output, or chat message (CLAUDE.md secret rule + D-34).
  </acceptance_criteria>
  <resume-signal>Type "stripe-setup-complete" once the SDK is installed, the 6 products exist, and all 9 env vars are populated (presence verified, values never printed).</resume-signal>
</task>

<task type="auto">
  <name>Task 1: Stripe client singleton + masking helpers</name>
  <files>lib/stripe/client.ts, lib/stripe/mask.ts</files>
  <read_first>
    - app/api/webhooks/clerk/route.ts (maskClerkId/maskClerkOrgId pattern — last-4 + prefix)
    - lib/stripe/errors.ts (server-only header + typed-error discipline; no raw `throw new Error` is scanned in lib/stripe/** by check-error-discipline)
    - 06-RESEARCH.md Pattern 1 (Stripe singleton) + § Open Questions #1 (do NOT pin apiVersion)
  </read_first>
  <action>
    Create `lib/stripe/client.ts` with `import 'server-only'` and a lazy-initialized `getStripeClient(): Stripe` that reads `process.env.STRIPE_SECRET_KEY`, caches a module-level singleton, and instantiates `new Stripe(key)` WITHOUT pinning `apiVersion` (use the SDK bundled default per 06-RESEARCH Open Question #1; verify the bundled version exists at execute time). On missing key, throw the lib/stripe typed-error style (do not use a bare `new Error` if check-error-discipline forbids it in this dir — mirror lib/stripe/errors.ts; if a generic startup error is acceptable here, confirm against the gate). This client is the only Stripe access path — no Stripe MCP dependency (D-02). Create `lib/stripe/mask.ts` with `import 'server-only'` and `maskCustomerId(id: string)` / `maskSubscriptionId(id: string)` returning a last-4 masked form (e.g. `cus_***1234`, `sub_***abcd`), mirroring the Clerk webhook mask helpers. These masks are used in every webhook/portal log line per D-12/D-34. (D-04)
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `lib/stripe/client.ts` exports `getStripeClient` and starts with `import 'server-only';`.
    - `lib/stripe/mask.ts` exports `maskCustomerId` and `maskSubscriptionId`; neither returns the full input string for inputs longer than 4 chars.
    - `pnpm check:error-discipline` (run as part of verify chain later) finds no raw built-in `throw new Error` violation introduced in lib/stripe/**.
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>Server-only Stripe singleton and masking helpers exist and typecheck.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Closed price catalog + round-trip tests</name>
  <files>lib/stripe/catalog.ts, lib/stripe/catalog.test.ts</files>
  <behavior>
    - Test: with all 6 STRIPE_PRICE_* env sentinels set, `tierAndIntervalToPriceId('growth','monthly')` returns the growth-monthly sentinel and `priceIdToTier(thatId)` returns 'growth' — round-trip for all 6 (tier,interval) pairs.
    - Test: `priceIdToTier('price_unknown_xxx')` returns `undefined`.
    - Test: a missing env var (one of the 6 unset) causes `buildCatalog()` (or module load) to throw with a message naming the missing env var — and the message contains NO secret value.
    - Test: a duplicate priceId across two slots causes `buildCatalog()` to throw a duplicate error naming the conflicting env var.
  </behavior>
  <read_first>
    - 06-RESEARCH.md Pattern 2 (Closed Price Catalog) + Pitfall 5 (validate at load) + Pitfall 8 (catalog must NOT import @/lib/db — only process.env)
    - lib/stripe/products.ts (PlanTier type — import from there, keep single source of truth per D-03)
    - lib/stripe/products.test.ts (vi.mock / vitest style)
  </read_first>
  <action>
    Write `lib/stripe/catalog.test.ts` FIRST (RED) covering the four behaviors above; stub env via `vi.stubEnv` / process.env manipulation per the vitest pattern (catalog must NOT import `@/lib/db`, so no DB mock is needed — Pitfall 8). Then create `lib/stripe/catalog.ts` with `import 'server-only'`, importing `PlanTier` from `./products` (D-03 — no second competing tier source). Define `PriceInterval = 'monthly' | 'annual'`, `CatalogEntry { tier, interval, priceId }`, and `buildCatalog()` that iterates the 6 fixed env slots (STRIPE_PRICE_STARTER_MONTHLY/ANNUAL, GROWTH_MONTHLY/ANNUAL, BUSINESS_MONTHLY/ANNUAL), throwing on a missing or duplicate priceId (fail closed, D-05). Export `PRICE_CATALOG`, `priceIdToTier(priceId): PlanTier | undefined`, and `tierAndIntervalToPriceId(tier, interval): string | undefined`. Error messages name the env var but NEVER the value (D-34). For testability, structure so tests can rebuild the catalog after stubbing env (export `buildCatalog` or guard the module-load singleton so tests can re-invoke). (D-05, REQ-tier-starter/growth/business)
  </action>
  <verify>
    <automated>pnpm test -- --run lib/stripe/catalog.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test -- --run lib/stripe/catalog.test.ts` passes all four behaviors.
    - `lib/stripe/catalog.ts` imports `PlanTier` from `./products` (grep confirms no duplicate tier literal map).
    - catalog.ts does NOT import `@/lib/db` (grep: no `@/lib/db` import in catalog.ts).
    - No env value string appears in any thrown message (assert messages match `/env var STRIPE_PRICE_/` and not the sentinel).
  </acceptance_criteria>
  <done>Catalog round-trips all 6 pairs, fails closed on missing/duplicate/unknown, and tests are green.</done>
</task>

<task type="auto">
  <name>Task 3: Additive 0012 billing-state migration + Drizzle schema columns</name>
  <files>lib/db/schema.ts, drizzle/0012_billing_state.sql, drizzle/meta/_journal.json</files>
  <read_first>
    - lib/db/schema.ts (organizations table, lines ~159-169 — ADD ONLY, do not edit existing columns)
    - drizzle/0011_qa_citation_grants.sql (hand-written SQL + partial-index pattern + `--> statement-breakpoint`)
    - drizzle/meta/_journal.json (entries end at idx 11 / tag 0011 — next is idx 12 / tag 0012)
    - 06-RESEARCH.md Pattern 8 (Additive Migration SQL) + D-10/D-11/D-12
    - CLAUDE.md § Database Migration Discipline (additive only; immutable forward migrations)
  </read_first>
  <action>
    Add 5 new columns to the `organizations` pgTable in lib/db/schema.ts (ADDITIVE — do not touch existing columns): `stripePriceId: text('stripe_price_id')`, `stripeSubscriptionItemId: text('stripe_subscription_item_id')`, `stripeCurrentPeriodEnd: timestamp('stripe_current_period_end', { withTimezone: true })`, `stripeCancelAtPeriodEnd: boolean('stripe_cancel_at_period_end').notNull().default(false)`, `stripeLastEventCreated: timestamp('stripe_last_event_created', { withTimezone: true })`. Author hand-written `drizzle/0012_billing_state.sql` using `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS ...` for the 5 columns, plus two `CREATE UNIQUE INDEX IF NOT EXISTS` partial indexes — `organizations_stripe_customer_id_unique_idx ON organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL` and `organizations_stripe_subscription_id_unique_idx ON organizations(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL` — separated by `--> statement-breakpoint`. Include a header documenting operator-approval (2026-05-27 per 06-SPEC § Approved Phase 6 Implementation Decisions) and ADDITIVE-ONLY. Append a new entry to drizzle/meta/_journal.json: idx 12, tag `0012_billing_state`, version "7", breakpoints true (mirror the existing entry shape; this is the forward-only append, NOT an edit to entries 0000-0011). (D-10, D-11, D-12, D-13)
  </action>
  <verify>
    <automated>pnpm typecheck</automated>
  </verify>
  <acceptance_criteria>
    - lib/db/schema.ts organizations table contains all 5 new column identifiers (grep: `stripe_price_id`, `stripe_subscription_item_id`, `stripe_current_period_end`, `stripe_cancel_at_period_end`, `stripe_last_event_created`).
    - drizzle/0012_billing_state.sql contains 5 `ADD COLUMN IF NOT EXISTS` and 2 `CREATE UNIQUE INDEX IF NOT EXISTS ... WHERE ... IS NOT NULL` statements; no DROP/ALTER-of-existing-column statements (grep: no `DROP COLUMN`, no `DROP TABLE`).
    - drizzle/meta/_journal.json has exactly one new entry with `"tag": "0012_billing_state"` and `"idx": 12`; entries 0000-0011 are byte-unchanged.
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>Schema and migration carry the 5 additive columns + 2 partial indexes; journal appended at 0012.</done>
</task>

<task type="checkpoint:human-action" gate="blocking-human">
  <name>Task 4: [BLOCKING] Apply 0012 migration to the TEST DB</name>
  <what-built>The 0012 additive migration was authored in Task 3 but is NOT yet applied to any database. The Phase 6 verify chain (db:verify against the TEST DB) and all webhook/tier tests will produce false-positive passes if the live TEST schema lacks the new columns/indexes.</what-built>
  <read_first>
    - package.json scripts (`db:migrate:test` = `tsx --env-file=.env.local.test drizzle-kit migrate`)
    - docs/runbooks/deploy-migrations.md (migration procedure + audit-log template)
    - CLAUDE.md § Database Migration Discipline (pre-deploy gate; the established Phase 4/5 db:migrate:test pattern — NOT drizzle-kit push)
  </read_first>
  <how-to-verify>
    1. Run `pnpm db:migrate:test` to apply 0012 to the TEST DB via forward migration (this is the established Phase 4/5 pattern — do NOT use `drizzle-kit push`). Requires `.env.local.test` DB creds (operator-held).
    2. Confirm the migration applied: `drizzle.__drizzle_migrations` count on the TEST DB matches the journal length (13 entries: 0000..0012).
    3. Confirm the 5 columns + 2 partial indexes exist on `organizations` in the TEST DB.
  </how-to-verify>
  <acceptance_criteria>
    - `pnpm db:migrate:test` exits 0 and reports `0012_billing_state` applied.
    - The TEST DB `organizations` table has all 5 new columns and both partial unique indexes (verifiable via a psql/Drizzle introspection or the extended `scripts/check-schema.ts` once Plan 06 lands).
    - No secret/connection-string value is printed to chat.
  </acceptance_criteria>
  <resume-signal>Type "migration-0012-applied" once `pnpm db:migrate:test` has applied 0012 to the TEST DB and the columns/indexes are confirmed present.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator -> .env.local | Secret material (Stripe keys, price IDs) crosses here; must never enter git/logs/chat |
| process.env -> catalog module | Untrusted-until-validated config; missing/duplicate must fail closed at load |
| migration file -> TEST DB | Schema mutation; must be additive-only and forward-only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-01 | Information Disclosure | .env.local secrets, catalog error messages | mitigate | Presence-only env verification (never echo values); catalog throws name the env var, never the value (D-34); .gitignore covers .env.local |
| T-6-02 | Tampering | drizzle/0012 + _journal.json | mitigate | ADDITIVE-ONLY SQL (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS); journal append-only; entries 0000-0011 byte-unchanged (CLAUDE.md immutable-migration rule) |
| T-6-03 | Denial of Service | catalog fail-closed at load | accept | A misconfigured price env aborts catalog load (intended fail-closed per D-05); operator fixes env — acceptable for a config error |
| T-6-04 | Spoofing | duplicate stripe_customer_id / stripe_subscription_id across orgs | mitigate | Partial unique indexes enforce one org per non-null customer/subscription id (D-11) — backstop for the webhook org-mapping logic in Plan 02 |
| T-6-SC | Tampering | `pnpm add stripe` install | mitigate | stripe@22.x is the official SDK (no postinstall), operator-approved in 06-SPEC; install gated behind the operator checkpoint (Task 0a). No [SUS]/[SLOP] packages. |
</threat_model>

<verification>
- `pnpm typecheck` exits 0.
- `pnpm test -- --run lib/stripe/catalog.test.ts` passes (round-trip + fail-closed cases).
- `pnpm db:migrate:test` applied 0012 to TEST DB (operator-confirmed, Task 4).
- `pnpm ls stripe` resolves a 22.x version (operator-confirmed, Task 0a).
</verification>

<success_criteria>
- Stripe SDK installed; 9 env vars populated (presence-verified, values never printed); 6 Stripe products created.
- Closed price catalog round-trips all 6 pairs and fails closed on missing/duplicate/unknown.
- Server-only Stripe client singleton + masking helpers exist.
- 0012 additive migration (5 columns + 2 partial indexes) authored and applied to the TEST DB; journal appended at 0012.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-01-SUMMARY.md` when done.
</output>
