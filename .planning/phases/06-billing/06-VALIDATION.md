---
phase: 6
slug: billing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-29
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Dimension catalogue sourced from `06-RESEARCH.md` § Validation Architecture.
> Per-task rows are filled by `gsd-planner` from the `*-PLAN.md` task set.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (matches Phase 4/5; SDK mocked at module boundaries via `vi.spyOn` / `vi.mock`) |
| **Config file** | `vitest.config.ts` (+ a dedicated single-fork node-env config for any live-TEST-DB webhook integration test, mirroring `scripts/check-employee-portal.vitest.config.ts`) |
| **Quick run command** | `pnpm test -- --run lib/stripe` |
| **Webhook suite command** | `pnpm test -- --run app/api/webhooks/stripe` |
| **Full suite command** | `pnpm verify:phase-6` (tsc → verify:phase-5 → lib/stripe tests → webhook tests → db:verify → check:artifacts) |
| **Estimated runtime** | TBD at Wave 0 (verify:phase-5 already ~real; billing unit tests are mocked/fast) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run lib/stripe` (and `app/api/webhooks/stripe` once the route exists).
- **After every plan wave:** Run `pnpm verify:phase-6`.
- **Before `/gsd:verify-work`:** Full suite + manual Stripe test-clock UAT must be green.
- **Max feedback latency:** ~120 s (mocked unit/integration); manual UAT is out-of-band.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _filled by planner_ | — | — | REQ-tier-* | T-6-* | — | unit/integration | — | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Planner MUST replace this row with one row per task, no 3 consecutive tasks lacking an automated verify.*

---

## Validation Dimensions (from 06-RESEARCH.md § Validation Architecture)

1. **Catalog mapping** — `(tier,interval)→priceId→tier` round-trips for all 6; missing/duplicate/unknown price fails closed. *(unit, mocked env sentinels)*
2. **Webhook signature** — invalid `Stripe-Signature` → 400 before any parse. *(unit)*
3. **Webhook idempotency / replay** — duplicate `event.id` → 200 no-op; mutation failure rolls back the `stripe_events` insert. *(integration, TEST DB)*
4. **Distinct-event-same-object** — two event IDs for the same subscription/type leave org state == canonical Subscription. *(integration)*
5. **Out-of-order / stale-after-cancel** — stale `invoice.paid` after deletion does not re-enable (canonical re-fetch). *(integration, mocked SDK retrieve)*
6. **Status-policy transitions** — active/trialing→entitle; past_due→preserve non-destructive; unpaid/canceled/incomplete_expired/paused→Starter; cancel_at_period_end stays entitling. *(unit, pure normalizer)*
7. **Org-mapping fail-closed** — zero/multiple org matches, unknown price, missing customer/subscription, disagreeing trusted signals → no `planTier` mutation. *(integration)*
8. **Checkout forged-input rejection** — client-supplied org/customer/subscription/price/metadata ignored; bills server-derived active org only. *(integration)*
9. **maxUsers real count** — `checkTierLimit(org,'maxUsers')` returns real org-scoped active member count (no longer `0`). *(unit + TEST-DB count)*
10. **Portal auth** — admin-only; uses DB `stripeCustomerId`; forged customer ID rejected; setup CTA when unlinked. *(integration)*
11. **Tier-gate contract preserved** — Starter `consistencyCheck` → 403 `{error:'tier_limit_exceeded', upgradeUrl:'/pricing'}`; Growth allowed. *(regression — existing Phase 4 behavior must not break)*

---

## Wave 0 Requirements

- [ ] Operator checkpoint: `pnpm add stripe` (approved; NOT done in planning) — gated before any Wave 1 task.
- [ ] Operator checkpoint: populate the 9 Stripe env vars in `.env.local` (sentinel-only, never printed).
- [ ] `0012` additive migration authored + applied to TEST DB via `pnpm db:migrate:test` (BLOCKING) before verification.
- [ ] `lib/stripe/catalog.*` price-ID validation + test stubs (catalog mapping dimension).
- [ ] Webhook + checkout + portal test stubs (RED) seeded for the dimensions above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First test-mode renewal survives without manual DB edit (`invoice.paid`) | REQ-tier-* / ROADMAP SC#3 / §10 #6 | Requires live Stripe test mode + test clock | Stripe sandbox/test-clock: advance clock → observe `invoice.paid` → confirm `planTier` unchanged-correct; record masked IDs + event id, no secrets |
| checkout → webhook → DB sync → tier-gate end-to-end | REQ-tier-* / SC#3 | Needs real Checkout + `stripe listen` | `stripe listen --forward-to` local webhook; complete test checkout; observe DB sync; masked evidence |
| Customer Portal opens for linked admin | SC#5 | Stripe-hosted UI | Admin Settings → Manage billing → portal URL resolves |

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (stripe install, env, migration, catalog)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s (automated tiers)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
