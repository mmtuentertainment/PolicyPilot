# STATE — PolicyPilot

GSD session state. Updated each time a phase or plan transitions. Source of truth for "where are we right now".

---

## Project Reference

- **Project**: PolicyPilot — AI-powered policy & procedure management SaaS
- **Operator**: Matthew (MMTU Entertainment LLC) — `mmtuentertainment@gmail.com`
- **Core value**: Replaces Google Drive / SharePoint for SMB policy management with AI drafting, append-only acknowledgment tracking, and audit-ready compliance trails — at a price an SMB can afford.
- **Beat-manual gate**: Product must be demonstrably faster and more reliable than a Google Drive folder.
- **Current focus**: Begin ASSEMBLY Phase 1 — Foundation.
- **Granularity**: standard (8 phases)

---

## Current Position

- **Phase**: 1 — Foundation
- **Plan**: none (no plans drafted yet — run `/gsd:plan-phase 1`)
- **Status**: Not started
- **Progress**: 0 / 8 phases complete

```
[░░░░░░░░] 0/8 phases  —  Foundation pending
```

**Next action**: Run `/gsd:plan-phase 1` to break Phase 1 (Foundation) into executable plans.

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 0 / 8 |
| Requirements mapped | 17 / 17 |
| Locked decisions | 21 |
| Constraints (SPEC) extracted | 28 |
| Acceptance criteria pending | 8 + 1 meta |

---

## Accumulated Context

### Locked decisions (do not re-litigate)

All 21 decisions in `PROJECT.md` `<decisions>` block are LOCKED via ADR-001 through ADR-021. Sourced from `BLUEPRINT.md` (precedence 0) and `reference/STACK.md` (precedence 1). Re-opening any requires a new ADR and operator approval.

### Todos

- [ ] Run `/gsd:plan-phase 1` to decompose Phase 1 into plans
- [ ] Verify `.env.local.example` is complete before Phase 1 plan execution (Clerk + Supabase keys required)
- [ ] Confirm pnpm vs npm package manager preference before Phase 1 init

### Blockers

None.

### Parking lot (operator-tracked, do not address in MVP)

- DocTract pricing — verify before launch (closest real competitor)
- SAM.gov registration — post milestone 2 ($10K MRR)
- Slack integration — v1.1, not MVP

---

## Session Continuity

- **Ingest**: complete — FOUNDRY 9-document set ingested with 0 BLOCKERs / 0 WARNINGs (see `.planning/intel/SYNTHESIS.md`)
- **Roadmap**: created `2026-05-15` — derived directly from ADR-007's 8-phase locked build sequence
- **Last session**: roadmap creation (this session)
- **Next session entry point**: open `ROADMAP.md` → run `/gsd:plan-phase 1`

---

## Phase Roster

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Foundation | REQ-product-vision | Not started — **NEXT** |
| 2 | Data Layer | REQ-user-roles, REQ-multi-tenancy | Not started |
| 3 | Admin UI | REQ-policy-library, REQ-policy-lifecycle, REQ-access-control | Not started |
| 4 | AI Layer | REQ-ai-policy-assistant, REQ-ai-usage-rules | Not started |
| 5 | Employee Portal | REQ-acknowledgment-tracking, REQ-acknowledgment-rules | Not started |
| 6 | Billing | REQ-tier-starter, REQ-tier-growth, REQ-tier-business | Not started |
| 7 | Crons + Email | REQ-notification-system | Not started |
| 8 | Validation | REQ-compliance-dashboard, REQ-integrations, REQ-acceptance-criteria | Not started |
