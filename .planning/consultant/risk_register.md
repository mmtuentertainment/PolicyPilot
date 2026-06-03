# Consultant Risk Register — PolicyPilot

Updated: 2026-06-03 - Cause-B lazy-db fix (build-time DB coupling mitigated for the absent-var class); prod-deploy gap recorded

Scoring: Probability 1-5, Impact 1-5, Score = P × I. Keep this register focused on risks that affect launch, revenue readiness, tenant trust, or the beat-manual gate.

---

| ID | Risk | Category | P | I | Score | Status | Mitigation / next control |
|---|---|---:|---:|---:|---:|---|---|
| R-001 | Phase 5 shipped state is not reflected in live planning docs, causing future sessions to reopen closed hardening work. | Ops/Knowledge | 1 | 4 | 4 | Closed by this patch | PR #27 merge facts recorded in `STATE`, `ROADMAP`, consultant packets, and the delta report. |
| R-002 | Tenant isolation regression through a future raw DB import, missing `org_id` filter, or RLS policy drift. | Security/Data | 2 | 5 | 10 | Controlled/Open | Preserve repository-first access, `check:db-imports`, `check:rls`, and migration verifier gates. Add review focus to every DB-touching PR. |
| R-003 | Acknowledgment audit integrity weakened by future update/delete paths, version mismatch, or re-acknowledgment edge cases. | Product/Compliance | 2 | 5 | 10 | Controlled/Open | Phase 5 shipped with append-only gates; keep those checks active when later phases touch policy or acknowledgment surfaces. |
| R-004 | Stripe billing implementation misses renewal/failure/cancel/update events or idempotency. | Revenue/Ops | 1 | 5 | 5 | Shipped / monitor | Plans 06-01 through 06-06 shipped via PR #32 at `243067e`; live Stripe test-mode UAT rows 1-11 PASS, including true test-clock renewal and first-failure `past_due` proof. Hosted pre-merge PR #32 checks were green/acceptable at `1abca44`; remaining control is operational monitoring plus SF-WHSEC-1 before future live webhook smoke. |
| R-005 | AI costs or retries exceed assumptions if tier gates, prompt caching, Batch API, or logging drift. | Cost/Product | 3 | 4 | 12 | Controlled/Open | Keep Claude calls server-only, tier-gated, max-retry bounded, and logged to `ai_generations`; Plan 06-03 preserved the Phase 4 403/429 contract while adding real `maxUsers` counting. |
| R-006 | Reminder/email jobs duplicate sends or create noisy employee experience. | Ops/Product | 3 | 4 | 12 | Pending | Phase 7 worker must use idempotency keys or send-state rows, plus safe retry semantics. |
| R-007 | Product fails the beat-manual gate despite feature completion. | Market/Product | 3 | 5 | 15 | Open | Phase 8 must measure real workflow time: signup → draft → publish → assign → acknowledge → export. |
| R-008 | Migration/deploy order drift causes runtime 503s against staging/prod. | Ops/Infra | 2 | 4 | 8 | Controlled/Open | Phase 6 schema is now on `main`; the immediate TEST/dev blocker is cleared because `0012_billing_state` is applied to the approved TEST/dev target and `pnpm db:verify` passes. Staging/prod remain operator-gated by migration discipline before any deploy that depends on Phase 6 schema. |
| R-009 | Consultant/project files become stale and start misleading future AI sessions. | Ops/Knowledge | 4 | 3 | 12 | Open | Enforce keep-current rule: update or mark no-change in every meaningful delta. |
| R-010 | Scope expands into generic compliance platform before revenue loop is proven. | Strategy/Product | 3 | 4 | 12 | Open | Reject non-MVP integrations/features unless they shorten time-to-paid or close a launch blocker. |
| R-011 | Stripe CLI/login/webhook-secret account differs from the app `STRIPE_SECRET_KEY` test account, causing webhook evidence to target the wrong account. | Ops/Billing | 2 | 4 | 8 | Mitigated for UAT / monitor | Local UAT used an app test-account `STRIPE_API_KEY` override and did not print or commit secrets. The default CLI profile still differs; future Stripe UAT must use the same override or a relogged CLI profile for the intended test account. |
| R-012 | Dev-created Clerk orgs without an active webhook tunnel can hit `OrgNotProvisionedError`. | Dev/Ops | 3 | 2 | 6 | Accepted/Process | Treat as a dev ops/process gap, not a Phase 6 code defect. Keep webhook tunnel/provisioning expectations explicit for local UAT. |
| R-013 | Future public-tunnel or live webhook smoke uses stale Clerk webhook signing-secret posture before SF-WHSEC-1 rotation. | Security/Ops | 3 | 5 | 15 | Operator-only / open | Actions secrets were configured by operator-authorized Claude Code action from `.env.local` via stdin without values printed or committed; this was a one-off CI-verification exception. If the current `CLERK_WEBHOOK_SECRET` was set before rotation, Matthew/operator must rotate SF-WHSEC-1 and re-set the secret before future live webhook smoke. Codex must not inspect, print, configure, or rotate secrets without explicit operator approval. |
| R-014 | Build-time DB coupling: `lib/db/index.ts` read `DATABASE_URL` + constructed the Postgres client at module top-level, so Next 15's `next build` "Collecting page data" phase crashed ("Failed to collect page data for /api/ai/consistency/[batchId]") whenever `DATABASE_URL` was absent at build — a latent launch-blocker for every Vercel/CI build (Cause B). | Ops/Infra | 1 | 4 | 4 | Mitigated by `fix/db-lazy-init` | `lib/db/index.ts` is now lazy (a Proxy defers the env check + client construction to first runtime access), so importing the module is side-effect-free; `lib/db/index.test.ts` regression-guards "import must not throw / first use throws helpful error / forwards to a real client"; full `verify:phase-6` green incl. live integration + `db:verify`. Runtime DB env for prod is still required (Tier B). |
| R-015 | Production has never successfully deployed to Vercel: prod domain serves 404 `DEPLOYMENT_NOT_FOUND`; deploys are CLI-driven (`gitDirty:1`) and frozen at `bae9174` (none at `main`/Phase-6 `243067e`). Pre-launch / no customers, so impact is deferred — but the prod path is unproven. | Ops/Infra | 3 | 4 | 12 | Operator / Tier-B open | Tier B (operator + Codex): provision prod Supabase (Pro+PITR per ADR-018), set Production Vercel `DATABASE_URL`(6543)+`DIRECT_URL`(5432)+runtime secrets, run staged migrations (migrate→verify→soak→approve→prod→verify), then decide `main→production` auto-deploy. The R-014 lazy fix is necessary-but-not-sufficient for this. |
| R-016 | Preview/redeploy builds fail at `deploy:preflight` because the Vercel `DATABASE_URL` carries a stale Supabase pooler `postgres` password → `check-deploy-schema: password authentication failed` (Cause A); surfaces as a recurring red Vercel ✗ on PRs. | Ops/Infra | 3 | 2 | 6 | Operator-owned / non-blocking | Operator secret rotation per the post-rotation auth-propagation gate (`db:wait-pooler-auth`). Non-blocking to merge: the GitHub Actions phase gates are the real merge signal; Vercel preview is advisory until launch prep. Read-only on secrets this session. |

---

## Escalation Rule

Any risk with score >= 15 requires one of:

- active mitigation in the current micro-batch,
- an explicit accepted-risk note in the delta report,
- or a written decision to pause/split the risky work.

## Keep-Current Rule

Update this register whenever a new material risk is discovered, a risk score changes, a mitigation ships, or Matthew accepts a risk. If no risks changed, write `risk_register: no-change` in the delta report.
