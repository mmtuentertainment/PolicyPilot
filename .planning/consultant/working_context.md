# Consultant Working Context - PolicyPilot

Updated: 2026-06-04 - Cause-B build-fix class shipped to `main` (PR #37 lazy `lib/db` `3b4bdb5` + PR #38 lazy Stripe catalog `6f17412`); `gsd/phase-6-billing` deleted; approvalWorkflows tier-gate RESOLVED → parked (R-017 Accepted/Parked; pre-declared future flag pending the unbuilt Reviewer feature); production deploy is Tier-B / operator-gated

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-6 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal, Billing.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 7-8 remain: Crons + Email, Validation.
- Phase 6 Billing shipped to `main` via PR #32 at squash commit `243067e9f259561a595230e5e7d3e97634040157` on 2026-05-31T22:34:30Z. The prior PR head was `1abca44dff89ccc7151d59b07fe1a93ce3d7be81`. `b92a15f` fixed the launch-blocking first-checkout bug for new orgs seeded as `trialing` without a real `stripeCustomerId`; the historical forensic realignment brief and codebase-map carry-forward docs shipped with the PR.
- Plans 06-01 through 06-06 are complete locally: Stripe SDK/catalog/client/mask foundation exists, additive `0012_billing_state` is applied to the approved TEST/dev Supabase target, the Stripe webhook route verifies raw-body signatures, handles all 5 locked events, uses canonical subscription re-fetch where required, commits idempotency + org billing updates transactionally, `checkTierLimit` uses a real org-scoped `maxUsers` count, checkout creates admin-only Stripe Checkout Sessions from server-derived org/price/metadata, public pricing carries non-authoritative tier/interval intent only, `/settings` exposes DB-sourced billing status plus Stripe Customer Portal sessions from the stored customer ID only, and `verify:phase-6`/hosted workflow/UAT checklist are wired.
- Phase 6 is shipped: local `pnpm db:verify` and pre-merge `pnpm verify:phase-6` passed, live Stripe test-mode UAT rows 1-11 PASS with masked-only evidence, hosted pre-merge PR #32 checks were green/acceptable at `1abca44` (`Phase 6 verifier`, `Verify full gate`, `Browser e2e smoke`, CodeRabbit PASS/skipped; `Live full verification` intentionally SKIPPED; `mergeStateStatus` CLEAN), and post-merge local `pnpm tsc --noEmit` plus targeted Stripe/webhook tests passed.
- Operator-approved exceptions now documented: Claude Code configured repository Actions secrets from `.env.local` via stdin without printing or committing values, and Claude Code restricted verify workflow push triggers to `main` while preserving `pull_request` and main coverage to avoid duplicate branch+PR CI against the shared dev/test verifier DB. These are one-off/operator-authorized exceptions, not the default pattern.
- Branch topology is reconciled after ship: the remote PR branch was deleted by merge, product/security scoped diffs between `gsd/phase-6-stripe-uat-complete` and `gsd/phase-6-billing` were empty before merge, and local `gsd/phase-6-billing` has since been deleted (no longer divergent).
- Cause-B build-time DB coupling fix has shipped to `main` (PR #37 `3b4bdb5`; the companion lazy Stripe price-catalog fix landed in PR #38 `6f17412`): `lib/db/index.ts` is now lazy (side-effect-free import via a Proxy that defers the `DATABASE_URL` check + Postgres client to first runtime access), so `next build`'s "Collecting page data" phase no longer crashes when `DATABASE_URL` is absent. Adds `lib/db/index.test.ts` regression guard + a narrow ADR-023 allow-list entry for that test; full `verify:phase-6` is green (incl. live integration + `db:verify`). Tier B (a working prod deploy: prod Supabase + Vercel runtime env/secrets + staged migrations) remains operator-gated and unstarted — production has never successfully deployed (prod 404; CLI deploys frozen at `bae9174`). No secrets/env touched.

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
- Phase 6 is shipped. Phase 7 has not started; Matthew may authorize Phase 7 planning next.
- `approvalWorkflows` is a PARKED pre-declared Growth+ flag (R-017 Accepted/Parked, operator product-intent 2026-06-04): NOT gate-now — gating the admin transition menu is cosmetic (`approve()` aliases `publish()`, `transitions.ts:133-135`, so a direct publish bypasses it). Enforcement ships WITH the future Reviewer-role / review-queue feature (backlog rank 17, Phase 9 candidate; new tables/RLS/role-gating = ASK-FIRST/security → default Codex, needs operator GO + routing). OPEN: the pricing page still markets "Approval workflows" on the Growth tile while unbuilt — marketing-copy decision deferred.
- Production has NEVER successfully deployed to Vercel (prod 404 `DEPLOYMENT_NOT_FOUND`; CLI deploys frozen at `bae9174`). The lazy-`lib/db` change (PR #37 `3b4bdb5`, merged to `main`) unblocks the build-crash class but is necessary-but-not-sufficient; a real prod deploy is Tier-B / operator-gated (risk R-015).
- Preview/CI red Vercel ✗ at `deploy:preflight` is Cause A (stale Supabase pooler `postgres` password), operator-owned and non-blocking to the GitHub Actions merge gate (risk R-016). Read-only on secrets/env this session.
- SF-WHSEC-1 remains an operator follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation. Codex must not inspect, print, configure, or rotate secrets without explicit operator approval.
- Hosted Phase 6 verifier CI mutates only the approved dev/test Supabase target through TRUNCATE/seed; staging/prod remain operator-gated.
- The default Stripe CLI profile still differs from the app test account; future Stripe UAT must use the app test-account override or a relogged CLI profile.
- Dev-created Clerk orgs without an active webhook tunnel may hit `OrgNotProvisionedError`; treat this as a dev ops/process gap, not a Phase 6 code blocker.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
