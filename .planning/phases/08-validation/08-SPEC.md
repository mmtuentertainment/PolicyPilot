# Phase 8: Validation (CSV-first slice) — Specification

**Created:** 2026-06-15
**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 7 locked
**Scope:** CSV-first slice only — operator-authorized 2026-06-15. Compliance dashboard / Recharts donut / aggregate widgets / populated-org seed harness / Stripe test-clock renewal / beat-manual benchmark are all **DEFERRED** (see Boundaries).

## Goal

An org admin can export a per-employee **acknowledgment-compliance report** for their own org via `GET /api/reports/acknowledgments?format=json|csv` — JSON for programmatic use, a downloadable RFC-4180 CSV for audit. The report covers every `(employee, assigned published policy)` pair with ack status, acknowledged-at timestamp, recorded IP, and human-readable employee identity (name + email resolved from Clerk), strictly org-scoped under RLS and admin-only. A new cumulative `verify:phase-8` gate (chaining `verify:phase-7` + Phase 8 checks) + a mirrored `verify-phase-8.yml` CI job lock it. This satisfies **acceptance criterion #5** ("Admin exports acknowledgment report to CSV" — `reference/VALIDATION-GATE.md:13`, REQUIREMENTS §10).

## Background

Grounded current state (live repo, branch `gsd/phase-8-validation` off `main` `3df5223`):

- **No reports surface exists.** `app/api/reports/` has zero files; `GET /api/reports/acknowledgments?format=csv` is a frozen contract (`reference/API-SPEC.md:123-128`) with no handler — the path 404s. There is no ack-aggregate / compliance report query anywhere in `lib/`.
- **All data already exists — no schema change needed (migration index stays at `0014`):**
  - `acknowledgments` (`lib/db/schema.ts:52-79`): `id, orgId(NOT NULL), policyId, policyVersionId, userId, acknowledgedAt, ipAddress`; `UNIQUE(user_id, policy_id, policy_version_id)`; **append-only (ADR-018)** — repo exposes no UPDATE/DELETE.
  - `policy_assignments` (`schema.ts:225-244`): `id, orgId, policyId, assigneeType('user'|'department'), assigneeId, assignedBy, assignedAt`; `UNIQUE(policy_id, assignee_type, assignee_id)`.
  - `policies` (`schema.ts:204-223`): `id, orgId, title, status('draft'|'published'|'archived'), currentVersion, reviewIntervalMonths, nextReviewDate, ...`.
  - `policy_versions` (`schema.ts:246-274`): `versionNumber`, `UNIQUE(policy_id, version_number)` — backs current-vs-stale ack derivation.
  - `users` (`schema.ts:344-374`): `id, orgId, clerkUserId, role, departmentId`. **`name`/`email` are NOT stored here — they live in Clerk** (resolved at query time). `departments` (`schema.ts:139-151`): `id, orgId, name`.
- **The ack-state + department fan-out logic already exists to reuse:**
  - 3-state `ackState ∈ {none, current, stale}` via dual `current_ack`/`prior_ack` LEFT JOIN aliases — `lib/db/repositories/policies.ts:135-209` (`listAssignedAndPublishedForUser`, 05 D-01).
  - Department→member fan-out via query-time OR expansion (`assigneeType='user' AND assigneeId=users.id` OR `assigneeType='department' AND assigneeId=users.departmentId`) — `lib/db/repositories/reminders.ts:79-163` (07 D-09, org-wide, no `userId` filter). This is the closest existing org-wide "who owes an ack" query and the report query mirrors its JOIN shape.
- **Auth + org-scope seams are established:** `getOrgContext()` (`lib/auth/context.ts:93-174`, Clerk text-id → internal UUID, throws → 401 unauthenticated); `requireAdminFromCtx(ctx)` (`lib/auth/require-admin.ts:56-60`, throws `ForbiddenError` → **403 `{ error: 'forbidden' }`** for API routes — distinct from the page-level `requireAdmin()` which `notFound()`s); `withOrgScope(ctx, fn)` (`lib/db/scoped.ts:41-67`) opens an RLS-enforced tx (`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)`) and yields `OrgScope = OrgContext & { tx }`. Canonical route shape: auth gates **outside** `try` (D-37), org-scoped read **inside**, `NextResponse.json(...)`. Reference route: `app/api/ai/consistency/route.ts:59-145`.
- **Allow-list:** the new `app/api/reports/**/route.ts` does **NOT** need raw-`db` allow-listing (ADR-023, `scripts/check-db-imports.ts:42-54`) — it uses `withOrgScope` (already allow-listed at `lib/db/scoped.ts`). No allow-list change.
- **Verify chain to extend:** `verify:phase-7` (`package.json:55`) = `pnpm tsc --noEmit && pnpm verify:phase-6 && pnpm check:crons-email && pnpm run test -- --run lib/email && pnpm run test -- --run app/api/cron && pnpm run test -- --run app/api/webhooks/clerk && pnpm db:verify && pnpm check:artifacts`. CI workflows `verify-phase-{6,7}.yml` carry a documented concurrency-group + 45-min + push-on-main-only guard for the **TRUNCATE-deadlock flake** (`verify-phase-6.yml:3-10`).
- **Operator scope decision (2026-06-15):** Phase 8 is scoped to this CSV vertical only. CSV identity columns = **Clerk-enriched (name + email)** — `clerkClient` is already in the stack, so no new package. The frozen `reference/SCHEMA.md` `notifications` doc-debt fix is **folded into this phase** (operator-approved the ASK-FIRST frozen-contract edit, 2026-06-15).

**Does NOT exist:** `app/api/reports/` route; `lib/db/repositories/reports.ts` (or any report/aggregate query); a CSV serializer; the Clerk batch-enrichment helper for reporting; `verify:phase-8` script; `verify-phase-8.yml`; any reports test.

## Requirements

1. **R8-1 Admin-only authenticated report endpoint**: `GET /api/reports/acknowledgments` authenticates via Clerk (`getOrgContext()`) and authorizes admin-only via `requireAdminFromCtx(ctx)`.
   - Current: no `app/api/reports/` route; the path 404s.
   - Target: route handler present; unauthenticated → **401**; authenticated non-admin (employee/reviewer) → **403 `{ error: 'forbidden' }`**; admin → 200. Auth gates run **outside** the inner `try` (D-37). No `any`.
   - Acceptance: unauthenticated request → 401; employee-role request → 403 `{ error: 'forbidden' }`; admin request → 200; `tsc --noEmit` clean.

2. **R8-2 Org-scoped read-only ack-compliance query**: a new `Reports.listAckComplianceForOrg(s, filters)` repo method runs entirely inside `withOrgScope`, every query `org_id`-scoped under RLS, returning one row per `(employee, assigned published policy)` pair with derived `ackState`.
   - Current: no aggregate/report query exists; `acknowledgments` is append-only.
   - Target: new `lib/db/repositories/reports.ts` mirroring the 07 D-09 org-wide JOIN — `users ⋈ policy_assignments (user-direct OR department-member) ⋈ policies(status='published') ⋈ policy_versions(currentVersion) ⟕ current_ack ⟕ prior_ack`, deriving `ackState ∈ {none, current, stale}` (reusing 05 D-01). Reads only — never UPDATE/DELETE acknowledgments (ADR-018). No schema change (index stays `0014`). Department assignments fan out to member users at query time.
   - Acceptance: for a fixture org with mixed user-direct + department assignments and partial acks, the query returns exactly the expected `(user, policy, ackState)` rows; a policy in `draft` status is excluded; a stale (prior-version) ack yields `ackState='stale'`. Every emitted SQL statement includes `org_id` (passes `check-db-imports` — route uses `withOrgScope`, not raw `db`).

3. **R8-3 Cross-org isolation (RLS-enforced)**: the report never returns another org's rows under any param.
   - Current: n/a (no endpoint).
   - Target: isolation enforced by RLS inside `withOrgScope` (the route never queries raw `db`); a two-org TEST-DB integration test (mirroring `check-rls.ts:72-226` / `check-employee-portal.ts`) proves Org A's export contains zero Org B rows even when both orgs share policy titles and a `policyId`/`departmentId` filter is supplied.
   - Acceptance: a two-org fixture (overlapping titles) confirms Org A's report (JSON and CSV) returns only Org A rows; supplying Org B's `policyId` as a filter under Org A's context returns **zero** rows (RLS), not Org B data.

4. **R8-4 Clerk identity enrichment (name + email), org-scoped to the result set**: employee `name` + `email` are resolved from Clerk for **only** the `clerkUserId`s present in the RLS-filtered query result, batched.
   - Current: `users` has no name/email; nothing resolves them for reporting.
   - Target: a reporting enrichment helper batch-fetches name+email via the Clerk backend SDK (`clerkClient().users.getUserList({ userId: [...] })`) keyed on the **already-org-filtered** `clerkUserId` set only; graceful fallback to the bare `clerkUserId` when Clerk returns no record (e.g. deleted user) — the row is never dropped. Enrichment is read-only and introduces no new package (`@clerk/nextjs` already in stack).
   - Acceptance: for N distinct employees in the result set the helper issues a bounded number of Clerk calls (batched, not N+1) and every output row carries `name`+`email` or a documented `clerkUserId` fallback; a userId absent from Clerk still appears in the report (fallback), no throw. No userId outside the org result set is ever sent to Clerk.

5. **R8-5 Hand-rolled RFC-4180 CSV serializer with formula-injection neutralization**: `format=csv` returns a correctly-escaped CSV; no CSV/spreadsheet package added.
   - Current: no serializer.
   - Target: a dependency-free serializer with a stable header row + fixed column order; fields containing `,` `"` CR or LF are wrapped in double-quotes with internal `"` doubled; CRLF (`\r\n`) record terminators; UTF-8. **CSV/formula-injection guard:** any field whose first character is `= + - @`, TAB, or CR is prefixed with a `'` (apostrophe) guard before quoting, applied to user-controlled fields (policy title, employee name, email, department name).
   - Acceptance: a unit suite asserts: a title containing `",` round-trips correctly; a title beginning with `=cmd` is neutralized to `'=cmd`; embedded newlines stay inside one quoted field; the header row matches the documented column contract exactly.

6. **R8-6 Content negotiation, download semantics, and optional filters**: `format` selects representation; optional `policyId`/`departmentId` filters narrow the report; bad params are rejected.
   - Current: n/a.
   - Target: `format=json` (default when omitted) → `200 application/json` with `{ rows: [...], summary: { total, acknowledged, pending } }`; `format=csv` → `200 text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="acknowledgments-<orgId>-<YYYY-MM-DD>.csv"`. Optional `policyId` and/or `departmentId` query params are UUID-validated (zod) and AND-combined into the org-scoped query. Unknown `format` value or malformed UUID → **400 `{ error: 'invalid_request' }`** (validated outside business logic). DB/infra failure → 503.
   - Acceptance: omitting `format` → JSON; `format=csv` → CSV with the attachment header + dated filename; `format=xml` → 400 `{ error: 'invalid_request' }`; `policyId=not-a-uuid` → 400; a valid `policyId` filter narrows JSON+CSV rows to that policy (still org-scoped).

7. **R8-7 Cumulative `verify:phase-8` gate + CI workflow**: a new `verify:phase-8` script chains `verify:phase-7` and adds Phase 8 checks; a `verify-phase-8.yml` mirrors `verify-phase-7.yml`.
   - Current: no `verify:phase-8`; no `verify-phase-8.yml`.
   - Target: `verify:phase-8 = pnpm tsc --noEmit && pnpm verify:phase-7 && pnpm run test -- --run app/api/reports && pnpm run test -- --run lib/db/repositories/reports && pnpm check:reports && pnpm db:verify && pnpm check:artifacts` (exact sub-checks finalized in PLAN; **never weaker than `verify:phase-7`**). A `check:reports` artifact gate asserts the route + repo + serializer + tests exist. `verify-phase-8.yml` mirrors `verify-phase-7.yml`'s concurrency-group + 45-min timeout + push-on-`main`-only + `workflow_dispatch` (TRUNCATE-deadlock flake guard).
   - Acceptance: `verify:phase-8` runs `verify:phase-7` in full plus the new checks and exits 0 locally; `verify-phase-8.yml` is present and structurally mirrors `verify-phase-7.yml`; `tsc --noEmit` exits 0, no `any`.

## Boundaries

**In scope:**
- `GET /api/reports/acknowledgments?format=json|csv` route with admin-only auth (`getOrgContext` + `requireAdminFromCtx`) + content negotiation + optional `policyId`/`departmentId` filters.
- `lib/db/repositories/reports.ts` — `Reports.listAckComplianceForOrg(s, filters)` org-scoped read-only ack-compliance query (no schema change).
- Clerk batch identity enrichment (name + email) over the RLS-filtered `clerkUserId` set, with bare-`clerkUserId` fallback.
- Hand-rolled RFC-4180 CSV serializer (dependency-free) with formula-injection neutralization.
- JSON representation with summary counts.
- Tests: co-located vitest (route + serializer unit, Clerk enrichment mocked, auth/403/400 paths) **and** a TEST-DB integration test proving cross-org isolation + ack-state derivation (mirrors `check-rls.ts` / `check-employee-portal.ts`).
- `verify:phase-8` script + `check:reports` artifact gate + `verify-phase-8.yml` CI workflow.
- **Keep-current folds (R-009):** reconcile the 5 stale `.planning/consultant/*` files (Phase 7 shipped `8b7019d`, `main` now `3df5223`); correct `reference/SCHEMA.md` `notifications` `org_id` doc-debt (operator-approved ASK-FIRST); fix `docs/runbooks/deploy-migrations.md` prose ("13 entries" → 15 / `0014`); add an R-007 accepted-risk/mitigation note in `08-PLAN.md`.

**Out of scope — DEFERRED (not abandoned):**
- **Compliance dashboard donut / Recharts** (ROADMAP SC#1 chart half) — deferred; **`recharts` install is ASK-FIRST + ≥14-day supply-chain rule** when picked up (backlog rank-8). The CSV/JSON export is the slice; the visual dashboard is a later phase/slice.
- **Dashboard aggregate widgets** (ack-rate / overdue / due-for-review tiles) — deferred.
- **Populated-org seed/evidence harness** (ROADMAP SC#2: ≥10 employees + 5 policies) — deferred to the evidence-capture leg.
- **Stripe test-clock renewal run** (AC#6 / ROADMAP SC#4) — code-complete from Phase 6; the *run* is a deferred operator-evidence leg (reuses the Phase 6 `STRIPE_API_KEY`-override workaround).
- **Beat-manual benchmark note** (ROADMAP SC#5, non-code) — deferred; R-007 carried as an accepted-risk note in the plan.
- **Evidence-capture pass for the 6 already-shipped/CI-gated criteria** (#1 draft<5min, #2 assign+track, #3 append-only ack+IP, #4 cited Q&A, #7 tier-403, #8 cross-org) — deferred to the validation evidence leg; this slice builds #5 only.
- **Any prod deploy / prod-Supabase provisioning / R-018 live-email gates** — launch gates, NOT Phase 8. This slice runs on **dev/TEST only**.
- **Any schema/migration change** — none needed; index stays `0014`. **Any new runtime package** — none; CSV is hand-rolled, `clerkClient` already in stack.

## Constraints

- **Multi-tenancy:** every DB query includes `org_id`; RLS `org_isolation` is the last line; the route uses `withOrgScope` (never raw `db`) so no `check-db-imports` allow-list change. Never query across orgs.
- **Admin-only:** `requireAdminFromCtx(ctx)` (API-route variant → 403 `{ error: 'forbidden' }`), gated **outside** the inner `try` (D-37).
- **Read-only audit trail:** the report READS `acknowledgments`; never UPDATE/DELETE (ADR-018, NEVER #5). `acknowledgments` stays in `IMMUTABLE_TABLES`.
- **No schema change** (post-Phase-2 ASK-FIRST; none required — index stays `0014`). **No new package** (hand-rolled RFC-4180 CSV; `@clerk/nextjs` `clerkClient` already in stack).
- **Clerk enrichment** only over `clerkUserId`s already returned by the org-scoped query — never an arbitrary/external user set; batched (no N+1); graceful fallback, no throw, row never dropped.
- **CSV safety:** RFC-4180 escaping + formula/CSV-injection neutralization on user-controlled fields.
- **Verify gate:** `verify:phase-8` is cumulative — it MUST run `verify:phase-7` in full and only ADD checks; **never weaken** any gate. `tsc --noEmit` clean, no `any`, before every commit; `verify:phase-8` + `tsc` both exit 0 before any squash; `main` stays green between phase squashes.
- **CI flake:** the standalone `Verify Phase 6` job may go RED on the PR via the documented TRUNCATE-deadlock concurrency race (`verify-phase-6.yml:3-10`) — **re-run, not a real failure**; merge signal = umbrella `Verify` + nested `Verify Phase 7` (+ new `Verify Phase 8`).
- **Secrets:** read from local files only, verified by exit codes/sentinels — never echoed/printed/committed; no dummy secrets; never live Stripe.
- **Environment:** validation runs on dev (`kdoahaxhmaftxaiwbtdw`) + TEST (`qwtbbbjbxffioeeazxrw`) Supabase only; **resume BOTH projects before any verify run** (they auto-pause independently). No staging/prod, no live email.
- **Phase gating (ADR-029):** Phase 8 depends on Phase 6 (`243067e`) AND Phase 7 (`8b7019d`) — both shipped/green. Phase-8 work lives on `gsd/phase-8-validation`; `.planning/phases/**` never committed to `main`.
- **Routing:** Claude plans; Codex executes (per `AGENTS.md`). No push/PR/merge without operator. No scope expansion beyond this CSV slice without re-authorization.

## Acceptance Criteria

- [ ] `GET /api/reports/acknowledgments` → 401 unauthenticated, 403 `{ error: 'forbidden' }` for a non-admin, 200 for an admin.
- [ ] `Reports.listAckComplianceForOrg` returns one row per `(employee, assigned published policy)` with `ackState ∈ {none,current,stale}`; draft policies excluded; department assignments fanned out to members; every query `org_id`-scoped (passes `check-db-imports`; route uses `withOrgScope`).
- [ ] Two-org TEST-DB integration test (overlapping titles): Org A's JSON+CSV export returns zero Org B rows; Org B's `policyId` filter under Org A returns zero rows (RLS).
- [ ] Clerk enrichment resolves name+email for the result set's `clerkUserId`s in a bounded/batched number of calls (no N+1); a Clerk-absent userId falls back to `clerkUserId` and is still present; no userId outside the org result is queried.
- [ ] `format=csv` → `200 text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="acknowledgments-<orgId>-<date>.csv"`; RFC-4180 escaping verified; a `=cmd` field is neutralized to `'=cmd`; header row matches the column contract.
- [ ] `format` omitted → JSON with `{ rows, summary:{ total, acknowledged, pending } }`; `format=xml` → 400 `{ error: 'invalid_request' }`; `policyId=not-a-uuid` → 400; a valid `policyId`/`departmentId` filter narrows rows (still org-scoped).
- [ ] `verify:phase-8` runs `verify:phase-7` in full + the new Phase 8 checks and exits 0; `verify-phase-8.yml` mirrors `verify-phase-7.yml`; `tsc --noEmit` exits 0, no `any`.
- [ ] No schema/migration change (index stays `0014`); no new runtime package added; `reference/SCHEMA.md` notifications `org_id` doc-debt corrected; consultant file set reconciled or `no-change` recorded in `ops/deltas/`.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                              |
|--------------------|-------|------|--------|--------------------------------------------------------------------|
| Goal Clarity       | 0.93  | 0.75 | ✓      | Single endpoint + single acceptance criterion (#5); contract frozen at API-SPEC.md:123-128 |
| Boundary Clarity   | 0.92  | 0.70 | ✓      | CSV vertical IN; dashboard/donut/seed/test-clock/benchmark explicitly DEFERRED |
| Constraint Clarity | 0.90  | 0.65 | ✓      | org_id+RLS, admin-only, no-schema, no-dep, cumulative verify all locked |
| Acceptance Criteria| 0.90  | 0.70 | ✓      | Every SC falsifiable (status codes, CSV escaping, cross-org zero-rows) |
| **Ambiguity**      | 0.10  | ≤0.20| ✓      | Two open forks (CSV identity columns; SCHEMA.md fold) resolved by operator 2026-06-15 |

Status: ✓ = met minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Recon (2 agents) | Current state of reports/ack-aggregate/auth/verify? | No reports surface; ack-state (05 D-01) + dept fan-out (07 D-09) reusable; `withOrgScope`+`requireAdminFromCtx` seams ready; verify chain cumulative; **employee name/email are Clerk-only, not in `users`** |
| 1 | Acceptance/Scope | What identity columns does the CSV carry? | **Clerk-enriched (name + email)** — batch via `clerkClient.users.getUserList` over RLS-filtered userIds; fallback to `clerkUserId`. `clerkClient` already in stack (no new package). |
| 1 | Keep-current | Fold the ASK-FIRST `reference/SCHEMA.md` notifications `org_id` doc-fix into this phase? | **Yes** — additive doc correction, no contract-behavior change (operator-approved 2026-06-15) |
| — | Scope lock | Dashboard donut / aggregates / seed / Stripe test-clock / beat-manual? | **DEFERRED** — CSV-first slice only (operator-authorized 2026-06-15); recharts ASK-FIRST + ≥14-day when picked up |

---

*Phase: 08-validation*
*Spec created: 2026-06-15*
*Next step: 08-CONTEXT.md (HOW decisions) — query JOIN shape, Clerk batch enrichment, CSV escaping/filename, content negotiation, filter semantics, error shapes, test strategy, verify:phase-8 wiring.*
