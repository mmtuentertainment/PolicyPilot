# Consultant Risk Register — PolicyPilot

Updated: 2026-05-29 - Phase 6 Plan 06-04 checkout/pricing intent complete

Scoring: Probability 1-5, Impact 1-5, Score = P × I. Keep this register focused on risks that affect launch, revenue readiness, tenant trust, or the beat-manual gate.

---

| ID | Risk | Category | P | I | Score | Status | Mitigation / next control |
|---|---|---:|---:|---:|---:|---|---|
| R-001 | Phase 5 shipped state is not reflected in live planning docs, causing future sessions to reopen closed hardening work. | Ops/Knowledge | 1 | 4 | 4 | Closed by this patch | PR #27 merge facts recorded in `STATE`, `ROADMAP`, consultant packets, and the delta report. |
| R-002 | Tenant isolation regression through a future raw DB import, missing `org_id` filter, or RLS policy drift. | Security/Data | 2 | 5 | 10 | Controlled/Open | Preserve repository-first access, `check:db-imports`, `check:rls`, and migration verifier gates. Add review focus to every DB-touching PR. |
| R-003 | Acknowledgment audit integrity weakened by future update/delete paths, version mismatch, or re-acknowledgment edge cases. | Product/Compliance | 2 | 5 | 10 | Controlled/Open | Phase 5 shipped with append-only gates; keep those checks active when later phases touch policy or acknowledgment surfaces. |
| R-004 | Stripe billing implementation misses renewal/failure/cancel/update events or idempotency. | Revenue/Ops | 3 | 5 | 15 | Controlled/Active | Plans 06-01 through 06-04 are complete locally: foundation schema/helpers, 5-event webhook with canonical re-fetch + transaction-scoped idempotency, real `maxUsers` tier predicate, and admin-only checkout/pricing intent. Score stays 15 until Customer Portal and Stripe test-clock UAT prove the full billing loop (ROADMAP SC#3 / section 10 #6). |
| R-005 | AI costs or retries exceed assumptions if tier gates, prompt caching, Batch API, or logging drift. | Cost/Product | 3 | 4 | 12 | Controlled/Open | Keep Claude calls server-only, tier-gated, max-retry bounded, and logged to `ai_generations`; Plan 06-03 preserved the Phase 4 403/429 contract while adding real `maxUsers` counting. |
| R-006 | Reminder/email jobs duplicate sends or create noisy employee experience. | Ops/Product | 3 | 4 | 12 | Pending | Phase 7 worker must use idempotency keys or send-state rows, plus safe retry semantics. |
| R-007 | Product fails the beat-manual gate despite feature completion. | Market/Product | 3 | 5 | 15 | Open | Phase 8 must measure real workflow time: signup → draft → publish → assign → acknowledge → export. |
| R-008 | Migration/deploy order drift causes runtime 503s against staging/prod. | Ops/Infra | 2 | 4 | 8 | Controlled/Open | Keep migrate → verify → deploy ordering; update deploy runbook after every migration lesson. |
| R-009 | Consultant/project files become stale and start misleading future AI sessions. | Ops/Knowledge | 4 | 3 | 12 | Open | Enforce keep-current rule: update or mark no-change in every meaningful delta. |
| R-010 | Scope expands into generic compliance platform before revenue loop is proven. | Strategy/Product | 3 | 4 | 12 | Open | Reject non-MVP integrations/features unless they shorten time-to-paid or close a launch blocker. |

---

## Escalation Rule

Any risk with score >= 15 requires one of:

- active mitigation in the current micro-batch,
- an explicit accepted-risk note in the delta report,
- or a written decision to pause/split the risky work.

## Keep-Current Rule

Update this register whenever a new material risk is discovered, a risk score changes, a mitigation ships, or Matthew accepts a risk. If no risks changed, write `risk_register: no-change` in the delta report.
