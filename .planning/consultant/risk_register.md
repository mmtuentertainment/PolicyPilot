# Consultant Risk Register — PolicyPilot

Updated: 2026-05-31 - Phase 6 UAT complete; draft PR #32 ship-prep; secret sequencing tracked

Scoring: Probability 1-5, Impact 1-5, Score = P × I. Keep this register focused on risks that affect launch, revenue readiness, tenant trust, or the beat-manual gate.

---

| ID | Risk | Category | P | I | Score | Status | Mitigation / next control |
|---|---|---:|---:|---:|---:|---|---|
| R-001 | Phase 5 shipped state is not reflected in live planning docs, causing future sessions to reopen closed hardening work. | Ops/Knowledge | 1 | 4 | 4 | Closed by this patch | PR #27 merge facts recorded in `STATE`, `ROADMAP`, consultant packets, and the delta report. |
| R-002 | Tenant isolation regression through a future raw DB import, missing `org_id` filter, or RLS policy drift. | Security/Data | 2 | 5 | 10 | Controlled/Open | Preserve repository-first access, `check:db-imports`, `check:rls`, and migration verifier gates. Add review focus to every DB-touching PR. |
| R-003 | Acknowledgment audit integrity weakened by future update/delete paths, version mismatch, or re-acknowledgment edge cases. | Product/Compliance | 2 | 5 | 10 | Controlled/Open | Phase 5 shipped with append-only gates; keep those checks active when later phases touch policy or acknowledgment surfaces. |
| R-004 | Stripe billing implementation misses renewal/failure/cancel/update events or idempotency. | Revenue/Ops | 2 | 5 | 10 | Controlled/Ship-prep | Plans 06-01 through 06-06 are complete and verifier-green; live Stripe test-mode UAT rows 1-11 PASS, including true test-clock renewal and first-failure `past_due` proof. Remaining control is ship-review plus hosted `Verify Phase 6` after operator repository-secret setup. |
| R-005 | AI costs or retries exceed assumptions if tier gates, prompt caching, Batch API, or logging drift. | Cost/Product | 3 | 4 | 12 | Controlled/Open | Keep Claude calls server-only, tier-gated, max-retry bounded, and logged to `ai_generations`; Plan 06-03 preserved the Phase 4 403/429 contract while adding real `maxUsers` counting. |
| R-006 | Reminder/email jobs duplicate sends or create noisy employee experience. | Ops/Product | 3 | 4 | 12 | Pending | Phase 7 worker must use idempotency keys or send-state rows, plus safe retry semantics. |
| R-007 | Product fails the beat-manual gate despite feature completion. | Market/Product | 3 | 5 | 15 | Open | Phase 8 must measure real workflow time: signup → draft → publish → assign → acknowledge → export. |
| R-008 | Migration/deploy order drift causes runtime 503s against staging/prod. | Ops/Infra | 2 | 4 | 8 | Controlled/Open | The immediate TEST/dev blocker is cleared: `0012_billing_state` is applied to the approved TEST/dev target and `pnpm db:verify` passes. Staging/prod remain operator-gated by migration discipline before any deploy that depends on Phase 6 schema. |
| R-009 | Consultant/project files become stale and start misleading future AI sessions. | Ops/Knowledge | 4 | 3 | 12 | Open | Enforce keep-current rule: update or mark no-change in every meaningful delta. |
| R-010 | Scope expands into generic compliance platform before revenue loop is proven. | Strategy/Product | 3 | 4 | 12 | Open | Reject non-MVP integrations/features unless they shorten time-to-paid or close a launch blocker. |
| R-011 | Stripe CLI/login/webhook-secret account differs from the app `STRIPE_SECRET_KEY` test account, causing webhook evidence to target the wrong account. | Ops/Billing | 2 | 4 | 8 | Mitigated for UAT / monitor | Local UAT used an app test-account `STRIPE_API_KEY` override and did not print or commit secrets. The default CLI profile still differs; future Stripe UAT must use the same override or a relogged CLI profile for the intended test account. |
| R-012 | Dev-created Clerk orgs without an active webhook tunnel can hit `OrgNotProvisionedError`. | Dev/Ops | 3 | 2 | 6 | Accepted/Process | Treat as a dev ops/process gap, not a Phase 6 code defect. Keep webhook tunnel/provisioning expectations explicit for local UAT. |
| R-013 | Hosted Phase 6 verification or future public-tunnel smoke uses stale Clerk webhook signing-secret posture before SF-WHSEC-1 rotation. | Security/Ops | 3 | 5 | 15 | Operator-only / open | Matthew/operator must rotate SF-WHSEC-1 first, then configure/reconfigure required GitHub repository secrets if the hosted verifier uses `CLERK_WEBHOOK_SECRET`, then rerun hosted checks. Codex must not inspect, print, configure, or rotate secrets. |

---

## Escalation Rule

Any risk with score >= 15 requires one of:

- active mitigation in the current micro-batch,
- an explicit accepted-risk note in the delta report,
- or a written decision to pause/split the risky work.

## Keep-Current Rule

Update this register whenever a new material risk is discovered, a risk score changes, a mitigation ships, or Matthew accepts a risk. If no risks changed, write `risk_register: no-change` in the delta report.
