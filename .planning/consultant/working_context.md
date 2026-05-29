# Consultant Working Context - PolicyPilot

Updated: 2026-05-29 - Phase 6 Plan 06-06 verifier wiring complete; UAT/db gate pending

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-5 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Phase 6 PLANNED 2026-05-29 on `gsd/phase-6-billing` (rebased onto main `af01f0a`): spec+discuss+plan complete, `gsd-plan-checker` PASSED (6 plans).
- Plans 06-01 through 06-06 verifier wiring are complete locally: Stripe SDK/catalog/client/mask foundation exists, additive `0012_billing_state` is applied to the TEST sibling DB, the Stripe webhook route now verifies raw-body signatures, handles all 5 locked events, uses canonical subscription re-fetch where required, commits idempotency + org billing updates transactionally, `checkTierLimit` now uses a real org-scoped `maxUsers` count, the checkout/pricing intent slice creates admin-only Stripe Checkout Sessions from server-derived org/price/metadata, public pricing carries non-authoritative tier/interval intent only, the admin settings billing surface exposes DB-sourced billing status plus Stripe Customer Portal session creation from the stored customer ID only, and `verify:phase-6`/hosted workflow/UAT checklist are wired. Phase 6 is not shipped: `pnpm verify:phase-6` is blocked by `pnpm db:verify` finding the configured `.env.local` deploy-verifier DB still at 12/13 migrations without `0012_billing_state`, and Stripe sandbox/test-clock UAT remains operator-pending.

## Non-Negotiables
- `org_id` in every tenant query; RLS remains the last line of defense.
- Acknowledgments are append-only and must remain auditor-trustworthy.
- Clerk org ID maps to Supabase `org_id`.
- Stripe subscription truth is server-side only.
- Claude API calls stay server-side and are logged.

## Consultant Bias
- Smallest reversible move first.
- Revenue readiness matters, but not ahead of tenant isolation or audit integrity.
- Prefer fewer features with strong proof over broader unfinished coverage.
- Every material change must refresh or explicitly no-op the consultant files.

## Active Watchlist
- Phase 6 Plan 06-06 verifier wiring is complete locally; do not mark Phase 6 shipped until the configured `db:verify` target has `0012_billing_state` and the operator records masked Stripe sandbox/test-clock UAT evidence.
- Billing still needs a green `pnpm verify:phase-6` against the configured deploy-verifier DB plus end-to-end Stripe sandbox/test-clock UAT.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
