---
phase: 2
slug: data-layer
status: draft
nyquist_compliant: false
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
- **Before `/gsd-verify-work`:** Full suite must be green (6/6 checks pass)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled by planner during plan-phase. Skeleton below — every task in every PLAN.md MUST land a row here.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | REQ-multi-tenancy | T-02-01 (cross-org leak) | OrgScope type forces orgId on every repo method | type | `pnpm tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | REQ-user-roles | — | Role enum `'admin'|'reviewer'|'employee'` narrowed at boundary | type | `pnpm tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | REQ-user-roles | T-02-02 (privilege escalation) | ADR-018 acks reject update/delete at type level | type | `pnpm tsc --noEmit && pnpm tsx tests/types.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | REQ-multi-tenancy | T-02-01 (cross-org leak) | RLS enabled on all 10 tenant-scoped tables | sql | `pnpm tsx scripts/check-schema.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | REQ-multi-tenancy | T-02-01 (cross-org leak) | `authenticated` has SELECT/INSERT/UPDATE/DELETE grants | sql | `pnpm tsx scripts/check-schema.ts` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 3 | REQ-user-roles | T-02-03 (webhook replay) | svix signature verified + idempotency via clerk_events | integration | manual + `scripts/check-data-layer.ts` integration | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 4 | REQ-multi-tenancy | T-02-01 (cross-org leak) | orgA cannot SELECT orgB rows when running as `authenticated` | property | `pnpm tsx scripts/check-rls.ts` | ❌ W0 | ⬜ pending |
| 02-06-02 | 06 | 4 | REQ-multi-tenancy | T-02-04 (raw db escape) | No file outside ADR-023 allow-list imports raw `db` | static | `pnpm tsx scripts/check-db-imports.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** Planner expands this skeleton with one row per task in 02-01-PLAN.md through 02-06-PLAN.md. Status flips to ✅ as each task's automated command exits 0 in execute-phase.

---

## Wave 0 Requirements

- [ ] `lib/db/schema.ts` populated with 11 table defs + clerk_events (precondition for everything else)
- [ ] `drizzle/0000_initial.sql` generated via `drizzle-kit generate` (precondition for migrations)
- [ ] `drizzle/0001_rls_policies.sql` generated via `drizzle-kit generate --custom --name=rls_policies` then hand-edited (precondition for RLS check)
- [ ] Supabase `policypilot-test` project created + `DATABASE_URL_TEST` + `DIRECT_URL_TEST` set in `.env.local` (precondition for `scripts/check-rls.ts` + `scripts/check-schema.ts`)
- [ ] Clerk Dashboard manual config (D-04 session token customization, D-09 org roles) — operator manual step in 02-02-PLAN.md
- [ ] `tests/types.ts` created with @ts-expect-error invariants from D-07 (precondition for type-level invariant proof)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clerk Dashboard org roles defined (`admin`, `reviewer`, `employee` with `employee` default) | REQ-user-roles | Clerk Dashboard configuration is operator-side, not in repo | Open Clerk Dashboard → Organizations → Roles; confirm 3 entries; `employee` marked default |
| Clerk Dashboard session token customization (add `"publicMetadata"`) | REQ-user-roles | Dashboard configuration | Open Clerk Dashboard → Sessions → Customize session token; confirm `publicMetadata` claim present |
| Clerk Dashboard webhook endpoint created + 4 events subscribed + signing secret in `.env.local` | REQ-multi-tenancy | Dashboard configuration + .env.local edit | Open Clerk Dashboard → Webhooks; confirm endpoint URL + `organization.created`/`user.created`/`organizationMembership.created`/`organizationMembership.updated`; verify `CLERK_WEBHOOK_SECRET` set in `.env.local` |
| Supabase `policypilot-test` project exists with both pooler + direct URIs accessible | REQ-multi-tenancy | Supabase Dashboard | Confirm project visible in Supabase Dashboard; `pnpm db:migrate:test` exits 0 against it |
| `DIRECT_URL` set in `.env.local` for the dev project | — | Operator-side .env.local edit | Confirm `pnpm db:generate && pnpm db:migrate` no longer prints the D-05 fallback warning |
| End-to-end webhook smoke test (Clerk sends `organization.created` → row appears in `organizations`) | REQ-multi-tenancy | Requires live Clerk webhook delivery + dev tunnel | Create org via `<CreateOrganization>` in dev; observe `organizations` table populated; observe `clerk_events` row written |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test DB, manual Clerk config, generated migrations)
- [ ] No watch-mode flags (all scripts run-once, exit 0/1)
- [ ] Feedback latency < 30s
- [ ] Positive AND negative assertions wired for every RLS invariant (per RESEARCH.md Validation Architecture)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner fills the per-task map and plan-checker passes)

**Approval:** pending
