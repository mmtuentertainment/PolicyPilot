# Consultant Risk Register — PolicyPilot

Updated: 2026-05-28

Scoring: Probability 1-5, Impact 1-5, Score = P × I. Keep this register focused on risks that affect launch, revenue readiness, tenant trust, or the beat-manual gate.

---

| ID | Risk | Category | P | I | Score | Status | Mitigation / next control |
|---|---|---:|---:|---:|---:|---|---|
| R-001 | Phase 5 hardening remains open, blocking the usable employee acknowledgment loop. | Product/Delivery | 4 | 5 | 20 | Open | Close audit remediation before starting Phase 6 or explicitly pause with a written ship/no-ship decision. |
| R-002 | Tenant isolation regression through a future raw DB import, missing `org_id` filter, or RLS policy drift. | Security/Data | 2 | 5 | 10 | Controlled/Open | Preserve repository-first access, `check:db-imports`, `check:rls`, and migration verifier gates. Add review focus to every DB-touching PR. |
| R-003 | Acknowledgment audit integrity weakened by update/delete paths, version mismatch, or re-acknowledgment edge cases. | Product/Compliance | 3 | 5 | 15 | Open | Keep append-only invariant executable; require Phase 5 hardening proof before billing work. |
| R-004 | Stripe billing implementation misses renewal/failure/cancel/update events or idempotency. | Revenue/Ops | 3 | 5 | 15 | Pending | Phase 6 must implement all 5 locked webhook events and persist processed Stripe event IDs. |
| R-005 | AI costs or retries exceed assumptions if tier gates, prompt caching, Batch API, or logging drift. | Cost/Product | 3 | 4 | 12 | Controlled/Open | Keep Claude calls server-only, tier-gated, max-retry bounded, and logged to `ai_generations`. |
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
