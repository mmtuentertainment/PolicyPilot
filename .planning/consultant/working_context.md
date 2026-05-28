# Consultant Working Context — PolicyPilot

Updated: 2026-05-28

## Mission
- Build an AI-powered policy and procedure management SaaS for SMBs with 25-300 employees.
- Win by beating Google Drive / SharePoint on speed, reliability, acknowledgment tracking, and audit readiness.
- MVP promise: AI drafting + summaries + employee Q&A are present, not future roadmap.

## Current State
- Phases 1-4 shipped: Foundation, Data Layer, Admin UI, AI Layer.
- Phase 5 Employee Portal is code/UAT complete but in release-hardening after the 2026-05-27 audit.
- Phases 6-8 remain: Billing, Crons + Email, Validation.
- Do not start Phase 6 until Phase 5 hardening is closed or explicitly paused.

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
- Phase 5 hardening branch artifacts must be reconciled before ship.
- Billing needs full 5-event Stripe webhook idempotency.
- Phase 7 reminders must be idempotent and auditable.
- Phase 8 must prove the beat-manual gate with observable user workflows.
