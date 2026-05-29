# Consultant Working Context - PolicyPilot

Updated: 2026-05-29 - Phase 6 Plan 06-04 complete

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-5 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Phase 6 PLANNED 2026-05-29 on `gsd/phase-6-billing` (rebased onto main `af01f0a`): spec+discuss+plan complete, `gsd-plan-checker` PASSED (6 plans).
- Plans 06-01 through 06-04 are complete locally: Stripe SDK/catalog/client/mask foundation exists, additive `0012_billing_state` is applied to TEST DB, the Stripe webhook route now verifies raw-body signatures, handles all 5 locked events, uses canonical subscription re-fetch where required, commits idempotency + org billing updates transactionally, `checkTierLimit` now uses a real org-scoped `maxUsers` count, and the checkout/pricing intent slice now creates admin-only Stripe Checkout Sessions from server-derived org/price/metadata while the public pricing page carries non-authoritative tier/interval intent only. Plans 06-05 through 06-06 remain pending; Phase 6 is not shipped.

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
- Phase 6 Plan 06-04 checkout/pricing intent is complete locally; do not broaden into 06-05 Customer Portal/settings work unless Matthew explicitly asks.
- Billing still needs Customer Portal, admin settings page wiring, and end-to-end UAT.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
