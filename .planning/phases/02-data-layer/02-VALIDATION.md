---
phase: 2
slug: data-layer
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-17
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Custom verify scripts (`scripts/check-*.ts` via tsx) — pattern from Phase 1 |
| **Config file** | None — orchestrator script (`scripts/check-data-layer.ts`) chains all gates |
| **Quick run command** | `pnpm tsc --noEmit` |
| **Full suite command** | `pnpm verify:phase-2` |
| **Estimated runtime** | ~30 seconds (after migrations applied to test DB) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit` (catches type-test regressions from D-07; ADR-018/005 invariants)
- **After every plan wave:** Run `pnpm verify:phase-2`
- **Before `/gsd-verify-work`:** Full suite must be green (7/7 checks pass)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled by planner during plan-phase. One row per task across all 6 plans.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 02-01-01 | 01 | 1 | REQ-multi-tenancy | T-02-01 (cross-org leak), T-02-04 (server-only leak) | Drizzle schema with D-02 org_id denorm + D-03a nullable users + D-03b clerk_events | structural+type | `pnpm tsc --noEmit` + PowerShell substring-grep per table | pending |
| 02-01-02 | 01 | 1 | REQ-user-roles, REQ-multi-tenancy | T-02-01 (Pitfall 2 is_local leak), T-02-04, T-02-05 (asRole defaults), T-02-06 (no-org through-pass) | OrgScope + withOrgScope (SET LOCAL ROLE + is_local=true) + getOrgContext (SF-M4 fold + asRole narrowing) | structural+type | `pnpm tsc --noEmit` + substring-grep for `set_config(..., true)` + SF-M4 try/catch | pending |
| 02-01-03 | 01 | 1 | REQ-multi-tenancy | T-02-02 (ADR-018 break), T-02-03 (ADR-005 break) | `tests/types.ts` carries 3 @ts-expect-error invariants | type | `pnpm tsc --noEmit` (deferred; closes after Plan 02-04) + structural assertion in this task | pending |
| 02-02-01 | 02 | 1 | REQ-user-roles | T-02-07 (default Clerk roles leak) | 3 Clerk org roles defined + session token customized | manual (Dashboard) | operator resume-signal `roles + session token configured` | pending |
| 02-02-02 | 02 | 1 | REQ-multi-tenancy | T-02-03 (webhook spoofing — secret captured), T-02-08 (no value echo) | Clerk webhook endpoint + signing secret captured | manual (Dashboard) | operator resume-signal includes `whsec_...` or `secret in .env.local` | pending |
| 02-02-03 | 02 | 1 | REQ-multi-tenancy | T-02-05 (test fixtures trash dev) | Second Supabase project + 3 connection URIs captured | manual (Dashboard) | operator resume-signal — `policypilot-test` Active | pending |
| 02-02-04 | 02 | 1 | REQ-multi-tenancy, REQ-user-roles | T-02-01, T-02-02, T-02-04 (secret leak via VCS) | .env.local with 4 new keys, sentinel-verified, gitignored | static (sentinel substrings) | node one-liner with sentinels: `whsec_`, `:6543`, `:5432`, 3x `postgresql://` | pending |
| 02-03-01 | 03 | 2 | REQ-multi-tenancy | T-03-08 (.env.local.test leak), T-03-06 (test/dev URL mixup) | drizzle.config DIRECT_URL split + 4 db scripts + .env.local.test helper (gitignored) | static+integration | substring-grep + `git check-ignore -v .env.local.test` exits 0 + `pnpm tsc --noEmit` | pending |
| 02-03-02 | 03 | 2 | REQ-multi-tenancy | T-03-01 (RESEARCH Pitfall 3 silent skip), T-03-04 (D-03a CHECK in wrong file) | 0000_initial.sql + empty 0001_rls_policies.sql shell + _journal.json registers both | structural | `drizzle/meta/_journal.json` contains `0001_rls_policies` + 12-table substring grep on 0000 + `drizzle/` NOT gitignored | pending |
| 02-03-03 | 03 | 2 | REQ-multi-tenancy | T-03-02 (missing GRANT — L-04), T-03-03 (missing ::text cast) | Hand-edited 0001 with 10xRLS + 10xPOLICY + 10xGRANT + D-03a CHECK + org_id::text cast | structural+SQL count | PowerShell regex Match counts strict-equal 10, 10, 10, 1 (comments stripped) + organizations `id::text` form | pending |
| 02-03-04 | 03 | 2 | REQ-multi-tenancy | T-03-05 (schema audit query semantics), T-03-07 (claimed-but-not-applied) | [BLOCKING] schema push to dev + test Supabase projects | live DB probe | tsx `postgres` query of `pg_catalog.pg_tables` (12 expected) + `pg_class.relrowsecurity` (10 expected, 0 for clerk_events/stripe_events) | pending |
| 02-04-01 | 04 | 3 | REQ-multi-tenancy | T-04-01 (Pitfall 6 raw db), T-04-02 (ADR-018), T-04-03 (ADR-005), T-04-04 (cross-tenant read), T-04-06 | 4 critical repos: Policies (Omit tldrSummary) + Acknowledgments (no update/delete) + Users (D-03a aware) + PolicyVersions (D-02 invariant) | structural | substring-grep per file: server-only + OrgScope import + Pitfall 6 citation + no raw db import + (Policies) Omit tldrSummary + (Acks) no update/delete keys | pending |
| 02-04-02 | 04 | 3 | REQ-multi-tenancy | T-04-01, T-04-04 | Remaining 5 repos (PolicyAssignments, Departments, AiGenerations, Notifications, WorkflowStages); D-07 tsc gap closed | structural+type | 9 files exist + each has listAll + `pnpm tsc --noEmit` exits 0 (tests/types.ts now resolves) | pending |
| 02-05-01 | 05 | 3 | REQ-multi-tenancy | T-05-SC (svix install) | svix@1.93.0 installed + audited + .env.local.example has CLERK_WEBHOOK_SECRET= | static (pnpm audit + postinstall check) | `pnpm audit --audit-level=moderate` exits 0 + `svix scripts.postinstall === undefined` | pending |
| 02-05-02 | 05 | 3 | REQ-user-roles, REQ-multi-tenancy | T-05-01 (spoofing), T-05-02 (replay), T-05-03 (Pitfall 4 body-stream), T-05-05 (misconfig), T-05-06 (allow-list need), T-05-04 (PII log) | Webhook handler: svix verify + req.text() FIRST + idempotency + 4-event dispatch + 3 delete log-only | structural | substring-grep: svix import + req.text() before JSON.parse (ordering) + onConflictDoNothing + 4 active event names + Phase 7 TODO for deletes + ADR-023 + Pitfall 4 citations | pending |
| 02-05-03 | 05 | 3 | REQ-user-roles | T-05-07 (middleware regression) | middleware.ts SF-M4 fold — try/catch around both await auth() calls | structural | 2x try blocks; each within 200 chars before an `await auth()` call + SF-M4 marker + structured `[middleware] auth() failed` log line | pending |
| 02-06-01 | 06 | 4 | REQ-multi-tenancy | T-06-SC (ts-morph install) | ts-morph@28.0.0 installed + audited + .env.local.example has 4 Phase 2 keys as empty placeholders | static (pnpm audit + sentinel grep) | `pnpm audit` exits 0 + ts-morph no postinstall + sentinel substrings present in .env.local.example | pending |
| 02-06-02 | 06 | 4 | REQ-multi-tenancy | T-06-04 (Pitfall 6 escape) | L-05 check-db-imports.ts (ts-morph AST + 5-entry allow-list + positive control `allowListedHits >= 2`) | static (AST) | `pnpm exec tsx scripts/check-db-imports.ts` exits 0 (live run finds the 2 legitimate imports, 0 violations) | pending |
| 02-06-03 | 06 | 4 | REQ-multi-tenancy | T-02-01 (cross-org leak), T-06-01 (test always-exit-0) | L-06 check-rls.ts: 10-table negative + positive control + load-bearing SET LOCAL ROLE authenticated (Pitfall 1) | property test (live DB) | `pnpm exec tsx --env-file=.env.local scripts/check-rls.ts` exits 0 (positive control passes + 0 leaks across 10 tables) | pending |
| 02-06-04 | 06 | 4 | REQ-multi-tenancy | T-03-02 (GRANT missing) | D-08 schema audit: pg_catalog + information_schema per table — table+RLS+policy+4 GRANTs; clerk_events/stripe_events NO RLS | live DB metadata query | `pnpm exec tsx --env-file=.env.local scripts/check-schema.ts` exits 0 (10 tenant-scoped verified + 2 service-role verified) | pending |
| 02-06-05 | 06 | 4 | REQ-multi-tenancy, REQ-user-roles | All Phase 2 threats (T-02 through T-06) | check-data-layer.ts orchestrator (7 checks: tsc + migrate-test + L-05 + L-06 + schema + artifacts + Pitfall 5 stale-null audit) + check-artifacts.ts Phase 2 extensions + verify:phase-2 wiring | orchestrator | `pnpm verify:phase-2` exits 0 with all 7 OK + check-artifacts has 8 Phase 2 functions in main() spread | pending |
| 02-06-06 | 06 | 4 | REQ-user-roles, REQ-multi-tenancy | T-06-06 (repudiation — skipped gate) | End-to-end Clerk webhook smoke: <CreateOrganization> -> tunnel -> handler -> DB row + idempotency redeliver does not duplicate | manual+live | operator resume-signal `approved` after running pnpm verify:phase-2 (7/7 OK) AND the live webhook flow puts rows in organizations + users + clerk_events tables (sentinel queries) | pending |

*Status: pending / green / red / flaky — Status flips to green as each task's automated command exits 0 in execute-phase. The operator manual checkpoint tasks (02-02-01/02/03 and 02-06-06) flip to green when the resume signal arrives.*

---

## Wave 0 Requirements

- [ ] `lib/db/schema.ts` populated with 11 table defs + clerk_events (precondition for everything else) — closed by Plan 02-01 Task 1
- [ ] `drizzle/0000_initial.sql` generated via `drizzle-kit generate` (precondition for migrations) — closed by Plan 02-03 Task 2
- [ ] `drizzle/0001_rls_policies.sql` generated via `drizzle-kit generate --custom --name=rls_policies` then hand-edited (precondition for RLS check) — closed by Plan 02-03 Tasks 2 + 3
- [ ] Supabase `policypilot-test` project created + `DATABASE_URL_TEST` + `DIRECT_URL_TEST` set in `.env.local` (precondition for `scripts/check-rls.ts` + `scripts/check-schema.ts`) — closed by Plan 02-02 Tasks 3 + 4
- [ ] Clerk Dashboard manual config (D-04 session token customization, D-09 org roles) — closed by Plan 02-02 Task 1
- [ ] `tests/types.ts` created with @ts-expect-error invariants from D-07 (precondition for type-level invariant proof) — closed by Plan 02-01 Task 3 (tsc gap closes after Plan 02-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clerk Dashboard org roles defined (`admin`, `reviewer`, `employee` with `employee` default) | REQ-user-roles | Clerk Dashboard configuration is operator-side, not in repo | Open Clerk Dashboard -> Organizations -> Roles; confirm 3 entries; `employee` marked default |
| Clerk Dashboard session token customization (add `"publicMetadata"`) | REQ-user-roles | Dashboard configuration | Open Clerk Dashboard -> Sessions -> Customize session token; confirm `publicMetadata` claim present |
| Clerk Dashboard webhook endpoint created + 4 events subscribed + signing secret in `.env.local` | REQ-multi-tenancy | Dashboard configuration + .env.local edit | Open Clerk Dashboard -> Webhooks; confirm endpoint URL + `organization.created`/`user.created`/`organizationMembership.created`/`organizationMembership.updated`; verify `CLERK_WEBHOOK_SECRET` set in `.env.local` |
| Supabase `policypilot-test` project exists with both pooler + direct URIs accessible | REQ-multi-tenancy | Supabase Dashboard | Confirm project visible in Supabase Dashboard; `pnpm db:migrate:test` exits 0 against it |
| `DIRECT_URL` set in `.env.local` for the dev project | — | Operator-side .env.local edit | Confirm `pnpm db:generate && pnpm db:migrate` no longer prints the D-05 fallback warning |
| End-to-end webhook smoke test (Clerk sends `organization.created` -> row appears in `organizations`) | REQ-multi-tenancy | Requires live Clerk webhook delivery + dev tunnel | Create org via `<CreateOrganization>` in dev; observe `organizations` table populated; observe `clerk_events` row written (closed by Plan 02-06 Task 6) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every task in 02-01 through 02-06 has either an automated verify command or is a checkpoint:human-action / human-verify with explicit resume signal semantics
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — Plan 02-02's 3 checkpoint tasks are followed by Task 4 which is automated
- [x] Wave 0 covers all MISSING references (test DB, manual Clerk config, generated migrations) — Plan 02-02 + 02-03 close all 6 Wave-0 items
- [x] No watch-mode flags (all scripts run-once, exit 0/1)
- [x] Feedback latency < 30s for `pnpm tsc --noEmit`; full suite < 60s after first migration apply
- [x] Positive AND negative assertions wired for every RLS invariant (per RESEARCH.md Validation Architecture) — Plan 02-06 Task 3 (check-rls.ts) carries positive control + 10-table negative
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** plan-checker
