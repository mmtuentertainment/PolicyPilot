# Consultant Working Context - PolicyPilot

Updated: 2026-05-31 - Phase 6 UAT complete; draft PR #32 ship-prep; branch topology reconciled

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-5 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Phase 6 is in verifying/UAT-complete/ship-prep on draft PR #32 from `gsd/phase-6-stripe-uat-complete` against `main`; it is not shipped and not merged. `b92a15f` fixed the launch-blocking first-checkout bug for new orgs seeded as `trialing` without a real `stripeCustomerId`; the historical forensic realignment brief and codebase-map carry-forward docs are now carried into the PR branch.
- Plans 06-01 through 06-06 are complete locally: Stripe SDK/catalog/client/mask foundation exists, additive `0012_billing_state` is applied to the approved TEST/dev Supabase target, the Stripe webhook route verifies raw-body signatures, handles all 5 locked events, uses canonical subscription re-fetch where required, commits idempotency + org billing updates transactionally, `checkTierLimit` uses a real org-scoped `maxUsers` count, checkout creates admin-only Stripe Checkout Sessions from server-derived org/price/metadata, public pricing carries non-authoritative tier/interval intent only, `/settings` exposes DB-sourced billing status plus Stripe Customer Portal sessions from the stored customer ID only, and `verify:phase-6`/hosted workflow/UAT checklist are wired.
- Phase 6 is not shipped: local `pnpm db:verify` and `pnpm verify:phase-6` pass, and live Stripe test-mode UAT rows 1-11 PASS with masked-only evidence. Hosted `Verify Phase 6` still fails closed until Matthew/operator configures the required GitHub repository secrets for the intended test/dev verification environment.
- Branch topology is now reconciled for ship-prep: product/security scoped diffs between `gsd/phase-6-stripe-uat-complete` and `gsd/phase-6-billing` were empty, safe codebase-map docs were carried into the PR branch, and `gsd/phase-6-billing` should be retired only after Matthew approves branch deletion.

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
- Phase 6 local verifier and UAT are green, but do not mark Phase 6 shipped until hosted PR checks are green enough for ship review and Matthew chooses the ship path.
- Security sequencing is operator-only: rotate SF-WHSEC-1 first, then configure/reconfigure the required GitHub repository secrets if hosted verification uses `CLERK_WEBHOOK_SECRET`, then rerun hosted checks. Codex must not inspect, print, configure, or rotate secrets.
- The default Stripe CLI profile still differs from the app test account; future Stripe UAT must use the app test-account override or a relogged CLI profile.
- Dev-created Clerk orgs without an active webhook tunnel may hit `OrgNotProvisionedError`; treat this as a dev ops/process gap, not a Phase 6 code blocker.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
