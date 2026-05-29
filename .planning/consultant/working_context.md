# Consultant Working Context — PolicyPilot

Updated: 2026-05-29 - Phase 6 planned (plan-check PASSED)

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-5 shipped: Foundation, Data Layer, Admin UI, AI Layer, Employee Portal.
- Phase 5 Employee Portal shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Phase 6 PLANNED 2026-05-29 on `gsd/phase-6-billing` (rebased onto main `af01f0a`): spec+discuss+plan complete, `gsd-plan-checker` PASSED (6 plans), ready to execute. Implementation NOT started until the operator runs `/gsd:execute-phase 6`.

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
- Phase 6 execution Wave 0 is operator-gated (`pnpm add stripe`, 9 env vars, 6 Stripe products, additive `0012` migration) — these must not be auto-run.
- Billing needs full 5-event Stripe webhook idempotency.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
