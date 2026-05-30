# Consultant Working Context - PolicyPilot

Updated: 2026-05-30 - Phase 6 verifier green; UAT partial; checkout fix recorded

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-5 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Phase 6 is in verifying/UAT/ship-prep on local-only `gsd/phase-6-billing`; no upstream and no PR are open. `b92a15f` fixed the launch-blocking first-checkout bug for new orgs seeded as `trialing` without a real `stripeCustomerId`; `b818805` added the historical forensic realignment brief on top.
- Plans 06-01 through 06-06 are complete locally: Stripe SDK/catalog/client/mask foundation exists, additive `0012_billing_state` is applied to the approved TEST/dev Supabase target, the Stripe webhook route verifies raw-body signatures, handles all 5 locked events, uses canonical subscription re-fetch where required, commits idempotency + org billing updates transactionally, `checkTierLimit` uses a real org-scoped `maxUsers` count, checkout creates admin-only Stripe Checkout Sessions from server-derived org/price/metadata, public pricing carries non-authoritative tier/interval intent only, `/settings` exposes DB-sourced billing status plus Stripe Customer Portal sessions from the stored customer ID only, and `verify:phase-6`/hosted workflow/UAT checklist are wired.
- Phase 6 is not shipped: `pnpm db:verify` and `pnpm verify:phase-6` pass, but live Stripe test-mode UAT is partial. Rows 1-8 and 11 PASS; row 9 is PARTIAL because `invoice.paid` resend kept Growth/active but true next-period renewal still needs a Stripe test clock; row 10 is NOT RUN live and needs test clock plus failing card, though handler logic is unit-tested.

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
- Phase 6 verifier is green; do not mark Phase 6 shipped until Stripe test-clock UAT rows 9-10 are complete and a PR ship path exists.
- Reconcile the Stripe CLI/login/webhook-secret account with the app `STRIPE_SECRET_KEY` test account before more live webhook testing.
- Dev-created Clerk orgs without an active webhook tunnel may hit `OrgNotProvisionedError`; treat this as a dev ops/process gap, not a Phase 6 code blocker.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
