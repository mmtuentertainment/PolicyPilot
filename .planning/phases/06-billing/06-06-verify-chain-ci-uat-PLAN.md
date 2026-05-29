---
phase: 06-billing
plan: 06
type: execute
wave: 4
depends_on: ["06-01", "06-02", "06-03", "06-04", "06-05"]
files_modified:
  - package.json
  - scripts/check-deploy-schema.ts
  - scripts/check-schema.ts
  - scripts/check-artifacts.ts
  - .github/workflows/verify-phase-6.yml
  - .planning/phases/06-billing/06-UAT.md
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: false

must_haves:
  truths:
    - "pnpm verify:phase-6 runs exactly: tsc --noEmit, verify:phase-5, test lib/stripe, test app/api/webhooks/stripe, db:verify, check:artifacts (D-35, SPEC R6)."
    - "verify:phase-6 wraps verify:phase-5 so all prior-phase gates still pass (cumulative chain, D-35)."
    - "Schema verifiers (check-deploy-schema.ts + check-schema.ts) assert the 5 new organizations billing columns and the 2 partial unique indexes (D-13, SPEC R6)."
    - "check-artifacts.ts asserts the billing route shape, catalog/client/normalize/mask modules, the 0012 migration, and the UAT checklist presence (D-13, D-31)."
    - "A hosted CI workflow runs the full Phase 6 verification on PRs and pushes (D-35, SPEC R6)."
    - "A secret-safe Stripe test-mode UAT checklist proves checkout -> webhook -> DB sync -> tier-gate -> portal -> simulated renewal/payment-failure/cancel, with masked-only evidence (D-33, D-34, SPEC R6, M3, L3)."
  artifacts:
    - path: "package.json"
      provides: "verify:phase-6 script wrapping verify:phase-5 + billing gates"
      contains: "verify:phase-6"
    - path: "scripts/check-deploy-schema.ts"
      provides: "Phase 6 org-column + partial-index assertions"
      contains: "stripe_price_id"
    - path: ".github/workflows/verify-phase-6.yml"
      provides: "Hosted required Phase 6 verification job on PR + push"
      contains: "verify:phase-6"
    - path: ".planning/phases/06-billing/06-UAT.md"
      provides: "Secret-safe Stripe test-clock UAT checklist with masked evidence"
      contains: "invoice.paid"
  key_links:
    - from: "package.json verify:phase-6"
      to: "verify:phase-5 + lib/stripe tests + webhook tests + db:verify + check:artifacts"
      via: "cumulative npm script chain (D-35 verbatim)"
      pattern: "verify:phase-5"
    - from: ".github/workflows/verify-phase-6.yml"
      to: "pnpm verify:phase-6"
      via: "required CI job on pull_request + push"
      pattern: "verify:phase-6"
---

<objective>
Close Phase 6 with the verification spine: the cumulative `verify:phase-6` chain, extended schema/artifact gates that prove the live billing columns/indexes and billing artifacts exist, a hosted CI job, and a secret-safe Stripe test-mode UAT checklist the operator runs to prove the end-to-end loop.

Purpose: SPEC R6 / SC#3 — Phase 6 cannot close without a real billing verification chain (that catches a missing live migration as a false-positive guard) and a manual-safe UAT proving the full checkout -> webhook -> sync -> gate -> portal -> renewal cycle without leaking secrets.
Output: verify:phase-6 script + extended check-deploy-schema/check-schema/check-artifacts + CI workflow + 06-UAT.md.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-billing/06-SPEC.md
@.planning/phases/06-billing/06-CONTEXT.md
@.planning/phases/06-billing/06-RESEARCH.md
@.planning/phases/06-billing/06-VALIDATION.md
@CLAUDE.md

<interfaces>
<!-- package.json existing chain: verify:phase-5 = verify:phase-4 && check:acknowledgment-immutability(+self-test) && check:employee-portal.
     Existing scripts: typecheck, db:verify (= check-deploy-schema.ts), check:artifacts, test (vitest run), db:migrate:test. -->
<!-- D-35 verbatim verify:phase-6 chain (06-SPEC § Phase 6 verification and UAT):
     pnpm tsc --noEmit; pnpm verify:phase-5; pnpm test -- --run lib/stripe; pnpm test -- --run app/api/webhooks/stripe;
     pnpm db:verify; pnpm check:artifacts -->
<!-- scripts/check-deploy-schema.ts: TABLE_NAMES includes 'organizations'; SERVICE_ROLE_TABLES=['clerk_events','stripe_events'];
     loadJournal() compares applied migration count to journal length (now 13 entries 0000..0012). -->
<!-- scripts/check-artifacts.ts: greppable artifact assertions (ok/fail helpers); already asserts middleware webhook routes
     ("/api/webhooks/stripe"), pricing page, schema file. Extend with Phase 6 artifacts. -->
<!-- 06-UAT.md masking rule (D-34): evidence may include PASS/FAIL, masked org/customer/subscription IDs, Stripe event id,
     event type, observed DB tier/status. MUST NOT include keys, secrets, raw payloads, customer email, full customer IDs. -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: verify:phase-6 script + schema/artifact verifier extensions</name>
  <files>package.json, scripts/check-deploy-schema.ts, scripts/check-schema.ts, scripts/check-artifacts.ts</files>
  <read_first>
    - package.json (verify:phase-1..5 chain; db:verify; check:artifacts; test)
    - 06-SPEC.md § Phase 6 verification and UAT (the EXACT 6-line chain — copy verbatim) + D-35
    - scripts/check-deploy-schema.ts (organizations column assertions + journal-length compare; SERVICE_ROLE_TABLES)
    - scripts/check-schema.ts (TEST-DB sibling verifier)
    - scripts/check-artifacts.ts (ok/fail greppable assertion pattern; existing webhook-route + pricing assertions)
    - drizzle/0012_billing_state.sql + lib/db/schema.ts (the 5 columns + 2 partial index names to assert)
  </read_first>
  <action>
    Add `"verify:phase-6"` to package.json scripts EXACTLY as 06-SPEC § Phase 6 verification specifies: `pnpm tsc --noEmit && pnpm verify:phase-5 && pnpm test -- --run lib/stripe && pnpm test -- --run app/api/webhooks/stripe && pnpm db:verify && pnpm check:artifacts` (D-35 — cumulative, wraps verify:phase-5). Extend `scripts/check-deploy-schema.ts` to assert the 5 new `organizations` columns (stripe_price_id, stripe_subscription_item_id, stripe_current_period_end, stripe_cancel_at_period_end, stripe_last_event_created) with correct types/nullability (stripe_cancel_at_period_end NOT NULL DEFAULT false) AND the 2 partial unique indexes (organizations_stripe_customer_id_unique_idx, organizations_stripe_subscription_id_unique_idx); the journal-length comparison now expects 13 entries (0000..0012). Mirror the column/index assertions in `scripts/check-schema.ts` (TEST-DB sibling). Extend `scripts/check-artifacts.ts` with greppable ok/fail assertions for: app/api/webhooks/stripe/route.ts exists + exports runtime/dynamic + calls constructEvent + uses request.text() + does NOT call request.json(); lib/stripe/catalog.ts (priceIdToTier + tierAndIntervalToPriceId), lib/stripe/client.ts (getStripeClient), lib/stripe/normalize.ts (normalizeSubscription), lib/stripe/mask.ts; lib/stripe/products.ts countOrgUsers + self.countOrgUsers wiring; app/(admin)/settings/page.tsx + actions.ts (createCheckoutSessionAction + createPortalSessionAction); drizzle/0012_billing_state.sql + journal 0012 entry; middleware /settings admin pattern; and .planning/phases/06-billing/06-UAT.md presence. Use the grep-hygiene rule (strip comments before counting; no bare `== 0` on unfiltered files) where assertions count tokens. (D-13, D-31, D-35, SPEC R6)
  </action>
  <verify>
    <automated>pnpm typecheck && pnpm check:artifacts && pnpm db:verify</automated>
  </verify>
  <acceptance_criteria>
    - package.json `verify:phase-6` matches the 06-SPEC chain verbatim (grep: contains `verify:phase-5`, `test -- --run lib/stripe`, `test -- --run app/api/webhooks/stripe`, `db:verify`, `check:artifacts`, `tsc --noEmit`).
    - `pnpm db:verify` asserts all 5 new columns + both partial indexes and exits 0 against the TEST DB (migration applied in Plan 01 Task 4).
    - `pnpm check:artifacts` exits 0 and includes the Phase 6 billing artifact assertions (route shape, catalog/client/normalize/mask, products countOrgUsers, settings page/actions, 0012 migration, /settings middleware, 06-UAT.md).
    - check-deploy-schema journal compare expects 13 entries (0000..0012).
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>Cumulative verify:phase-6 exists; schema + artifact gates prove the live billing columns/indexes and billing artifacts.</done>
</task>

<task type="auto">
  <name>Task 2: Hosted CI workflow + secret-safe UAT checklist</name>
  <files>.github/workflows/verify-phase-6.yml, .planning/phases/06-billing/06-UAT.md</files>
  <read_first>
    - .github/workflows/ (existing migrate.yml + any verify workflow for prior phases — mirror runner/pnpm/node setup + secret handling)
    - 06-SPEC.md § Phase 6 verification and UAT (hosted gate requirement + UAT must-prove list + evidence masking rules)
    - 06-VALIDATION.md § Manual-Only Verifications + § Validation Dimensions (the 11 dimensions to anchor UAT steps) + D-33, D-34
    - CLAUDE.md secret rule + MEMORY secrets-never-in-chat
  </read_first>
  <action>
    Create `.github/workflows/verify-phase-6.yml`: a required job triggered on `pull_request` and `push`, mirroring the existing workflow's runner / Node (>=22) / pnpm setup, that runs `pnpm install` then `pnpm verify:phase-6`. Inject DB + Stripe env from GitHub Actions secrets (referenced by name only — NEVER inline values); if the live-DB-dependent gate (db:verify) cannot run in CI, scope the CI job to the type/test/artifact gates and document that db:verify runs against the operator TEST DB locally (match how prior phases gate hosted vs local). Create `.planning/phases/06-billing/06-UAT.md`: a secret-safe Stripe test-mode/test-clock checklist with one PASS/FAIL row per item proving (D-33, SPEC R6): (1) admin checkout creates a subscription for the authenticated org; (2) webhook syncs DB billing state (planTier / status / period-end); (3) planTier gates change ONLY after verified webhook processing; (4) Customer Portal opens for a linked admin/customer; (5) simulated renewal produces an `invoice.paid` and planTier stays correct (SC#3 / REQUIREMENTS §10 #6); (6) `invoice.payment_failed` produces `past_due` WITHOUT downgrade (M3); (7) canceled/unpaid downgrades to Starter and PRESERVES acks/ai_generations rows (L3 — no org-delete path). Evidence template captures PASS/FAIL, masked org/customer/subscription IDs, Stripe event id, event type, observed DB tier/status — and EXPLICITLY forbids API keys, webhook secrets, raw payloads, customer email, and full customer IDs (D-34). Add a note that SF-CASCADE-AUDIT remains DEFERRED (L3) and do NOT reference the uncommitted session report (L4). (D-33, D-34, D-35, M3, L3, L4, SPEC R6)
  </action>
  <verify>
    <automated>pnpm check:artifacts</automated>
  </verify>
  <acceptance_criteria>
    - `.github/workflows/verify-phase-6.yml` triggers on pull_request and push and invokes `pnpm verify:phase-6` (grep: `verify:phase-6`, `pull_request`, `push`).
    - No secret value is inlined in the workflow — all secrets referenced via `${{ secrets.* }}` only (grep: no literal `sk_`, `whsec_`, `price_` values).
    - `.planning/phases/06-billing/06-UAT.md` contains rows for `invoice.paid`, `invoice.payment_failed`/`past_due`, portal, and cancel->starter, plus the masked-evidence template and the forbidden-fields list (grep: `invoice.paid`, `past_due`, `masked`, `MUST NOT`).
    - 06-UAT.md notes SF-CASCADE-AUDIT DEFERRED (L3) and does NOT reference `2026-05-27-session-report.md` (L4).
    - `pnpm check:artifacts` (extended in Task 1) confirms 06-UAT.md presence and exits 0.
  </acceptance_criteria>
  <done>Hosted CI job runs verify:phase-6; secret-safe UAT checklist proves the end-to-end billing loop with masked-only evidence.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Operator UAT — Stripe test-mode end-to-end + masked sign-off</name>
  <what-built>verify:phase-6 chain, hosted CI, and the 06-UAT.md checklist are in place. This checkpoint is the operator running the manual Stripe test-mode/test-clock flow that automated tests cannot cover (live checkout, real signed webhooks, test-clock renewal).</what-built>
  <how-to-verify>
    1. Run `pnpm verify:phase-6` locally — confirm it exits 0 (tsc, verify:phase-5, lib/stripe tests, webhook tests, db:verify against the TEST DB, check:artifacts).
    2. Use `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (or a Dashboard test endpoint) and complete a test-mode checkout from /settings as an admin. Confirm the webhook syncs organizations.planTier/status and that planTier did NOT change before the webhook fired.
    3. Open the Customer Portal from /settings for the linked admin — confirm the portal URL resolves.
    4. Advance a Stripe test clock to trigger `invoice.paid` (renewal) — confirm planTier stays correct (SC#3 / §10 #6).
    5. Trigger `invoice.payment_failed` — confirm status='past_due' WITHOUT downgrade (M3). Trigger a cancellation — confirm downgrade to Starter and that acks/ai_generations rows are preserved (L3).
    6. Record each result in 06-UAT.md using the masked-evidence template — PASS/FAIL + masked IDs + event id/type + observed DB tier/status. NEVER paste keys, secrets, raw payloads, customer email, or full customer IDs (D-34).
  </how-to-verify>
  <acceptance_criteria>
    - `pnpm verify:phase-6` exits 0 (SPEC R6, the phase-close gate).
    - 06-UAT.md has a PASS row for each of the 7 must-prove items with masked-only evidence.
    - No secret/PII appears anywhere in the UAT evidence or chat (D-34, CLAUDE.md secret rule).
  </acceptance_criteria>
  <resume-signal>Type "uat-pass" once verify:phase-6 exits 0 and all 7 UAT items are recorded PASS with masked-only evidence, or describe any FAIL.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI runner -> secrets | Stripe/DB secrets injected by name; never inlined or logged |
| operator -> 06-UAT.md evidence | Masked-only; raw identifiers/secrets must never be written |
| verify chain -> TEST DB | db:verify proves the live billing schema (false-positive guard) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-27 | Information Disclosure | secrets in CI workflow / UAT evidence | mitigate | Workflow references secrets by name only; 06-UAT.md masks IDs + forbids keys/secrets/raw payloads/email/full ids (D-34) |
| T-6-28 | Tampering | false-positive green from missing live migration | mitigate | db:verify asserts the 5 columns + 2 indexes against the TEST DB; verify:phase-6 includes db:verify (D-13, D-35) |
| T-6-29 | Repudiation | unverifiable billing behavior at ship | mitigate | 06-UAT.md records PASS/FAIL + event id/type + observed DB tier/status per item (auditable, masked) |
| T-6-30 | Tampering | dunning grace misread as a bug | accept | M3 — past_due retains paid entitlement until Stripe escalates to unpaid/canceled; documented as MVP-accepted product risk in 06-UAT.md |
| T-6-31 | Information Disclosure | tenant cascade audit gap | accept | L3 — SF-CASCADE-AUDIT stays DEFERRED; Phase 6 adds NO org-delete path; cancel downgrades + preserves rows. Documented, deferred to the org-lifecycle phase. |
</threat_model>

<verification>
- `pnpm verify:phase-6` exits 0 (full cumulative chain; the phase-close gate).
- `pnpm check:artifacts` confirms all Phase 6 billing artifacts + 06-UAT.md presence.
- `pnpm db:verify` asserts the 5 columns + 2 partial indexes on the TEST DB.
- `.github/workflows/verify-phase-6.yml` runs verify:phase-6 on PR + push with secrets by name only.
- 06-UAT.md operator sign-off: 7/7 PASS with masked-only evidence (Task 3).
</verification>

<success_criteria>
- Cumulative verify:phase-6 matches the SPEC chain verbatim and exits 0.
- Schema + artifact gates prove the live billing columns/indexes and billing artifacts (false-positive guard).
- Hosted CI job gates PRs/pushes with no inlined secrets.
- Secret-safe UAT proves checkout -> webhook -> sync -> gate -> portal -> renewal/payment-failure/cancel; M3 + L3 documented.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-06-SUMMARY.md` when done.
</output>
