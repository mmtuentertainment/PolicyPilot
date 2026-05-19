---
status: gaps_found
phase: 02
date: 2026-05-18
invariants_total: 12
invariants_runtime_validated: 5
invariants_compile_validated: 3
invariants_gap: 4
plan_chain: 02-01 .. 02-06
verify_chain: pnpm verify:phase-2
verify_chain_state: 7/7 OK (operator-confirmed 2026-05-18)
---

# Phase 2 — Validation Audit

**Audit-only pass. Tests, fixtures, and code are NOT modified.** This report
catalogs what `pnpm verify:phase-2` actually proves vs. what the Phase 2
locked invariants require. Gaps are candidates for a Phase 2.1 closure plan
or a Phase 3 fold — not work to do in this audit.

---

## Methodology

**Nyquist principle.** For every invariant the code claims, can we name the
test that **fails** if the invariant breaks?

For each Phase 2 locked decision (ADR-005/018/019/023/025 and D-02..D-09 +
REQ-user-roles + REQ-multi-tenancy), the audit answers three questions:

1. **What observable artifact** would change if this invariant broke?
   (a DB row appears that should not, a TS file compiles that should not,
   an import resolves that should not, a GRANT row exists that should not.)
2. **What automated check observes that artifact?**
   (a `scripts/check-*.ts` line, a `tests/types.ts` directive, a substring
   in `scripts/check-artifacts.ts`.)
3. **Does that check actually run on `pnpm verify:phase-2`?**
   (or is it only run manually / never?)

If an invariant has no answer for #2, it is a **gap**.
If it has an answer for #2 but the answer is "compile-time only" (i.e. a
runtime metaprogramming break wouldn't be caught), it is graded HIGH.
If the answer exists but is "future events / clock skew / un-exercised
code path," it is graded MEDIUM (accepted gap).
Speculative or future-defensive concerns are LOW.

The audit does **not** treat "the code looks right" as a substitute for
"a check would fail if it didn't."

---

## What `pnpm verify:phase-2` Actually Runs

| # | Check | What It Asserts | Runs Where |
|---|-------|----------------|------------|
| 1 | `tsc --noEmit` | Zero TS errors — includes `tests/types.ts` D-07 invariants (ADR-018/005) | host repo |
| 2 | `drizzle-kit migrate` against TEST DB | Both migrations parse + apply; idempotent re-apply | TEST Supabase project |
| 3 | `scripts/check-db-imports.ts` (L-05) | ts-morph AST: only 8 allow-listed paths may `import { db } from '@/lib/db'`; positive control requires ≥ 2 legitimate hits | host repo, AST walk |
| 4 | `scripts/check-rls.ts` (L-06) | Seed 2 orgs; `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', orgA, true)`; positive control: orgA sees its own policy; negative: orgA sees 0 orgB rows across 10 tenant tables | TEST Supabase project |
| 5 | `scripts/check-schema.ts` (D-08 step 5) | For 10 tenant tables: table exists, `relrowsecurity=true`, `org_isolation` policy present, `authenticated` has SELECT/INSERT/UPDATE/DELETE; for clerk_events/stripe_events: NO RLS | TEST Supabase project |
| 6 | `scripts/check-artifacts.ts` | ~214 file-shape assertions: server-only headers, OrgScope imports, no raw db in repositories, 4 webhook events, ≥2 try-blocks in middleware, ≥3 @ts-expect-error directives, migration shape | host repo, string grep + AST scope-strip |
| 7 | D-03a stale-null users audit | `SELECT id FROM users WHERE org_id IS NULL AND created_at < now() - interval '5 minutes'` → 0 rows | dev DB |

Plus the compile-time D-07 invariants in `tests/types.ts`:
- `@ts-expect-error` on `Acknowledgments.update` (ADR-018)
- `@ts-expect-error` on `Acknowledgments.delete` (ADR-018)
- `@ts-expect-error` on `Policies.create({}, { tldrSummary: 'x' })` (ADR-005)

---

## Invariant-by-Invariant Coverage Matrix

Twelve focus areas, each cross-referenced to the check (or absence) that would observe a break.

### 1. RLS leak prevention (REQ-multi-tenancy)

| Field | Value |
|-------|-------|
| Invariant | `auth.jwt()->>'org_id'` filters every SELECT from `authenticated` role. RLS USING-clause is the last line. |
| Locked by | ADR-019, ADR-025, L-06, 10 RLS policies in `drizzle/0001_rls_policies.sql` |
| Observed by | `scripts/check-rls.ts` (L-06) + `scripts/check-schema.ts` (presence of `org_isolation` policy + `relrowsecurity=true`) |
| Coverage | **Runtime — strong.** Both positive control (orgA can read orgA.policy) and negative (orgA reads 0 orgB rows across 10 tables) execute against a live TEST Postgres. Pitfall 1 mitigated: `SET LOCAL ROLE authenticated` precedes the SELECT. Pitfall 2 mitigated: `set_config(..., true)` is_local=true. |
| Failure mode if invariant breaks | L-06 fails with `LEAK: orgA can see N orgB rows in <table>` and exits 1. |
| Verdict | **COVERED.** Strongest invariant coverage in Phase 2. |
| Gap (LOW) | L-06 only probes single-table SELECTs. JOIN-fanout RLS edge cases (e.g. `SELECT pv.* FROM policy_versions pv JOIN policies p ON pv.policy_id = p.id` while only the parent JOIN-target has org_id) are not exercised. The D-02 denormalization makes this practically moot (every row carries its own org_id), but the JOIN-RLS execution-plan corner-case is theoretical-untested. |
| Gap (LOW) | NULL `org_id` rows during the D-03a window. `users` accepts NULL `org_id` briefly. The RLS predicate is `org_id::text = auth.jwt()->>'org_id'` — for a NULL row, this is NULL (= false), so the row is invisible to any `authenticated` JWT. L-06 does not insert a NULL-org_id user row + assert it cannot leak. Speculative — invariant likely holds. |

### 2. Raw `db` import discipline (ADR-023, L-05)

| Field | Value |
|-------|-------|
| Invariant | Only 8 allow-listed paths may import `{ db }` from `@/lib/db`. Repositories must use `OrgScope`, never raw `db`. |
| Locked by | ADR-023 allow-list + L-05 |
| Observed by | `scripts/check-db-imports.ts` (ts-morph `getImportDeclarations` AST walk) + positive control `allowListedHits >= 2` |
| Coverage | **Static AST — strong.** AST walker catches `import { db }`, `import { db as d }`, and `export { db } from '@/lib/db'` (re-exports — `getImportDeclarations` enumerates re-exports as `ImportDeclaration` nodes). Walker positive control catches a misconfigured walker. |
| Failure mode if invariant breaks | L-05 prints `ADR-023 / L-05 raw-db allow-list violations` for each unauthorized file and exits 1. |
| Verdict | **COVERED for static imports.** |
| Gap (MEDIUM) | **Dynamic imports are not covered.** `await import('@/lib/db')` returns the module at runtime; `getImportDeclarations()` only enumerates static `ImportDeclaration` nodes. A future commit that writes `const { db } = await import('@/lib/db')` inside `lib/db/repositories/policies.ts` would slip past L-05. Realism: low — but plausible in a refactor that's worried about top-level circular imports. |
| Gap (LOW) | **CommonJS `require('@/lib/db')` is not covered.** Project is ESM-only (Next.js 15 + TypeScript `module: ESNext`), so this vector is not realistic on Phase 2 surface area. Speculative. |

### 3. GRANT correctness (L-04, D-08)

| Field | Value |
|-------|-------|
| Invariant | `authenticated` role has exactly SELECT/INSERT/UPDATE/DELETE on each tenant table. Without GRANTs, the RLS-eligible queries fail with permission-denied. |
| Locked by | L-04, `drizzle/0001_rls_policies.sql` |
| Observed by | `scripts/check-schema.ts` step 4 (`information_schema.table_privileges` WHERE grantee = 'authenticated') |
| Coverage | **Runtime metadata — strong on the positive side.** D-08 confirms `authenticated` has all 4 privileges on all 10 tenant tables. L-06's positive control would also fail if a GRANT were missing (the orgA SELECT would return 0 instead of 1). |
| Failure mode if invariant breaks | D-08 emits `<table>: GRANT to authenticated — missing: <PRIVS>` and exits 1. L-06 positive control prints `POSITIVE CONTROL FAILED: orgA cannot see its own policy row. Likely cause: GRANT missing.` |
| Verdict | **COVERED for the positive case.** |
| Gap (HIGH) | **No negative check for over-grant.** The audit verifies that `authenticated` has the right privs; it does **not** verify that `PUBLIC`, `anon`, or `service_role` were never granted the same privs on tenant tables. A stray `GRANT SELECT ON policies TO PUBLIC` would not be flagged — the L-06 property test would still pass (it runs as `authenticated`), and D-08 only inspects `WHERE grantee = 'authenticated'`. Supabase ships an `anon` role; future Phase-X work that touches grants could over-share. The mitigation is to extend D-08 with a "no grants to PUBLIC/anon" assertion. |
| Gap (MEDIUM) | **No check that grant ownership is sane.** `pg_class.relowner` of tenant tables is currently the migration-running user. If migrations are ever run as a non-`postgres` role, ALTER POLICY could fail silently. Speculative for the MVP path; flag for the Phase 8 hardening pass. |

### 4. ADR-018 append-only (Acknowledgments has no update/delete)

| Field | Value |
|-------|-------|
| Invariant | `Acknowledgments` repository must not expose `update` or `delete` methods. |
| Locked by | ADR-018, D-07 |
| Observed by | `tests/types.ts` (2 `@ts-expect-error` directives) + `scripts/check-artifacts.ts` (grep `^\s*(update\|delete)\s*:` against `acknowledgments.ts`) + `tsc --noEmit` |
| Coverage | **Compile-time — strong.** A future commit that adds `update` to the Acknowledgments object literal makes `void Acknowledgments.update;` resolve, the `@ts-expect-error` becomes an unused directive (TS2578), and tsc fails. Symmetric for `delete`. The string-grep in check-artifacts is a backstop. |
| Failure mode if invariant breaks | `pnpm tsc --noEmit` prints `TS2578: Unused '@ts-expect-error' directive` on the relevant line in `tests/types.ts`. |
| Verdict | **COVERED at compile time.** |
| Gap (HIGH) | **No runtime defense.** ADR-018 is enforced *only* at the type system. The DB-layer GRANTs include UPDATE and DELETE on `acknowledgments` (intentional, per the inline comment in `0001_rls_policies.sql` line 70) — the policy is "the type system blocks it; nothing reaches the DB." If a future commit imports raw `db` somewhere and does `db.update(acknowledgments).set(...)`, the L-05 gate catches the import — but if a commit reaches the row via an allow-listed file (clerk_events handler, test harness) and runs `UPDATE acknowledgments`, the DB accepts it. Realism: low (no such call site exists), but the layered defense from CLAUDE.md says "RLS is the last line." For ADR-018 there is no last-line defense — only the type system. Acceptable per ADR-018 (the ADR explicitly chose compile-time enforcement over a DB trigger), but worth recording. |

### 5. ADR-005 Policies.create input shape (omits tldrSummary)

| Field | Value |
|-------|-------|
| Invariant | `Policies.create` input parameter type must omit `tldrSummary`. Generated at publish time by the AI layer (Phase 4), never accepted from admin input. |
| Locked by | ADR-005, D-07 |
| Observed by | `tests/types.ts` line 29 + `scripts/check-artifacts.ts` grep `'tldrSummary'` inside the `Omit<...>` clause of `policies.ts` + `tsc --noEmit` |
| Coverage | **Compile-time — strong.** A future commit that drops `'tldrSummary'` from the Omit type makes `void Policies.create({} as any, { tldrSummary: 'x' });` resolve, `@ts-expect-error` becomes unused, tsc fails. |
| Failure mode if invariant breaks | `tsc --noEmit` prints TS2578 on `tests/types.ts:29`. |
| Verdict | **COVERED at compile time.** |
| Gap (HIGH) | **No runtime defense.** Same observation as #4 — the type system is the only enforcement. ADR-005 explicitly chose this. A direct raw-`db` INSERT into `policies` with a non-NULL `tldrSummary` would succeed at the DB layer. Realism is bounded by the L-05 import gate. |

### 6. D-02 org_id denormalization parent/child consistency

| Field | Value |
|-------|-------|
| Invariant | A child-table row's `org_id` must equal its parent row's `org_id`. E.g. `policy_versions.org_id = policies.org_id` for any row where `policy_versions.policy_id = policies.id`. |
| Locked by | D-02, ADR-019 |
| Observed by | **Nothing.** |
| Coverage | **Not directly observed.** Repositories defensively `INSERT ... VALUES { orgId: scope.orgId, ... }` (the source-of-truth is `scope.orgId`, not the parent), and RLS rejects a cross-org INSERT by row predicate. But a row already in the DB whose `policy_versions.org_id != policies.org_id` would not be flagged by any check. |
| Failure mode if invariant breaks | None. The L-06 property test would still pass: orgA's JWT can see only orgA-tagged rows; it would not notice a "policy_version tagged orgA whose parent policy is tagged orgB." |
| Verdict | **GAP — MEDIUM.** D-02 CONTEXT explicitly considered and rejected a `CHECK (org_id = parent.org_id)` constraint, citing "RLS + scope.orgId copy is already two layers." That's defensible at the write path — but the audit has no check that *reads* the DB for inconsistencies. |
| Gap (MEDIUM) | **No data-integrity audit query.** A simple, cheap check would be: `SELECT count(*) FROM policy_versions pv JOIN policies p ON pv.policy_id = p.id WHERE pv.org_id != p.org_id` and assert 0. Symmetric for the other 4 child tables (`policy_assignments`, `acknowledgments`, `notifications`, `workflow_stages`). Phase 2 ships 0 production rows so the audit would trivially pass today. Adding it as a Phase 8 / pre-launch gate would catch a future repo bug that copies `scope.orgId` incorrectly. |

### 7. D-03a 5-minute CHECK + future-timestamp guard

| Field | Value |
|-------|-------|
| Invariant | `users.org_id` may be NULL only while `created_at > now() - interval '5 minutes'`. After 5 minutes, a NULL row is a Clerk webhook ordering bug. |
| Locked by | D-03a, `drizzle/0001_rls_policies.sql:39` CHECK constraint, `scripts/check-data-layer.ts:115-150` stale-null audit |
| Observed by | **Two-sided:** (a) the SQL CHECK constraint blocks INSERTs that violate the 5-min window at write time; (b) the orchestrator step 7 SELECT finds stale rows that "leaked through" (e.g. inserted within the window but then never backfilled). |
| Coverage | **Runtime — adequate.** The write-time CHECK fires on INSERT and UPDATE. The audit reads back any rows that drifted past the window. |
| Failure mode if invariant breaks | Step 7 emits `D-03a stale-null users audit: N user row(s) NULL org_id past the 5-min window` and exits 1. |
| Verdict | **COVERED for the typical case.** |
| Gap (MEDIUM) | **Clock-skew / future-`created_at` not guarded.** The CHECK is `org_id IS NOT NULL OR created_at > now() - interval '5 minutes'`. If a row is inserted with `created_at` in the future (e.g. application clock skew, or a hand-written INSERT with a literal future timestamp), the inequality holds forever and the row is permanently valid-by-CHECK. The audit's `created_at < now() - interval '5 minutes'` predicate would also miss it. Realism: low (Drizzle defaults `created_at` to `now()`, and the Clerk webhook handler doesn't set the field explicitly), but the invariant is asymmetric — a `now() + interval '...'` row is invisible to both gates. |
| Gap (LOW) | **No test of the CHECK constraint itself.** No `scripts/check-rls.ts`-style probe attempts an INSERT that should be rejected (e.g. `INSERT INTO users (clerk_user_id, org_id, created_at) VALUES (..., NULL, now() - interval '10 minutes')` and assert `error: check_violation`). The check exists in the migration SQL and `0001_rls_policies.sql` is applied to the TEST DB in step 2; D-08 doesn't audit CHECK constraints. Realism: low — the CHECK was hand-written and the migration is reviewed; but a future ALTER TABLE could quietly drop it without any gate noticing. |

### 8. D-03 Clerk webhook events (4-event dispatch)

| Field | Value |
|-------|-------|
| Invariant | `/api/webhooks/clerk` correctly dispatches `organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated`, writes the expected rows, and short-circuits replay via `clerk_events`. |
| Locked by | D-03, D-03b, ROADMAP Phase 2 success criterion 3 |
| Observed by | `scripts/check-artifacts.ts` (grep for the 4 event-name strings + `onConflictDoNothing` + `new Webhook(secret).verify` + `req.text()` ordering relative to `JSON.parse`) + `tsc --noEmit` (typed `WebhookEvent`) |
| Coverage | **Structural only.** No automated test sends a sample Clerk payload to the handler and asserts the DB rows that result. The end-to-end live-smoke (Plan 02-06 Task 6) was **explicitly deferred to Phase 3** by the operator (2026-05-18). |
| Failure mode if invariant breaks | If a future commit removes the `case 'user.created':` branch, the structural grep in `check-artifacts.ts` fails. If a commit subtly mishandles the payload shape (e.g. reads `data.public_user_data?.user_id` from the wrong path), no automated check catches it. |
| Verdict | **GAP — HIGH (runtime).** The handler's runtime behavior is the operator's first-principle deliverable for the phase (ROADMAP criterion 3) and there is no contract test. Compile-time + structural checks confirm the file looks right; they do not confirm it behaves right. |
| Gap (HIGH) | **No webhook contract test.** A pure Node-side test could: (1) build a sample `WebhookEvent` JSON, (2) sign it with a known secret, (3) POST it to the route handler function exported from `route.ts`, (4) assert the expected DB rows appear. No external service needed (svix verification is in-process; the DB is the existing TEST project). This is the single highest-value Phase 2.1 / Phase 3-fold gap. |
| Gap (HIGH) | **Operator confirmed deferral.** The 02-06 SUMMARY post-commit update (2026-05-18) records: "defer Step 2 (end-to-end Clerk webhook smoke) to Phase 3." This is a known accepted gap; the audit records it as HIGH because the Phase 2 success criterion 3 is not actually validated end-to-end. |

### 9. D-03b clerk_events idempotency

| Field | Value |
|-------|-------|
| Invariant | A redelivery of the same `svix-msg-id` produces zero additional side effects. `INSERT ... ON CONFLICT DO NOTHING RETURNING id` returning 0 rows short-circuits the handler. |
| Locked by | D-03b, `clerk_events` PK on `id text` |
| Observed by | `scripts/check-artifacts.ts` (grep `.onConflictDoNothing()`) + `tsc --noEmit` |
| Coverage | **Structural only.** No automated test redelivers the same event and asserts row counts unchanged. |
| Failure mode if invariant breaks | A commit that drops `.onConflictDoNothing()` fails the grep. A subtler break (e.g. moving the insert AFTER dispatch — actually the *correct* SF-W5 fix per the inline TODO — would change semantics and might be a regression) has no test signal. |
| Verdict | **GAP — HIGH (runtime).** Same root cause as #8: no contract test. |
| Gap (HIGH) | **No runtime idempotency assertion.** A second POST with identical `svix-id` and a duplicate payload should produce 0 new `organizations` rows. Currently this is operator-checked manually (Plan 02-06 Task 6 "Redeliver" step), and the operator deferred even that to Phase 3. |
| Gap (MEDIUM, accepted) | **SF-W5 — `clerk_events` row written before dispatch.** If dispatch throws, the event ID is marked processed and Clerk's retry short-circuits. Documented inline in `route.ts:108-114` + 222-235 as a known Phase 7+ follow-up. Acceptable per the plan. |

### 10. D-04 publicMetadata.role narrowing (asRole + asAppRole)

| Field | Value |
|-------|-------|
| Invariant | Session-claim `publicMetadata.role` must be one of `'admin' \| 'reviewer' \| 'employee'`; any other value throws (in `getOrgContext`) or returns null (in the webhook's `asAppRole`). Clerk's `org:` prefix is stripped by `asAppRole` before narrowing. |
| Locked by | D-04, D-09 |
| Observed by | `scripts/check-artifacts.ts` (substring grep for the Role union literal in `lib/auth/context.ts`) + `tsc --noEmit` |
| Coverage | **Compile-time only.** The Role union is type-checked. The runtime guards (`asRole` throwing on unknown values; `asAppRole` returning null on unknown values; `asAppRole` stripping `org:`) are **not unit-tested**. |
| Failure mode if invariant breaks | A commit that loosens `asRole` to accept arbitrary strings would not be caught by any check — `tsc --noEmit` still passes (the return type would still be `Role`). A commit that drops the `org:` strip in `asAppRole` would silently fail to map Clerk's default `org:admin` payload; no test would fire. |
| Verdict | **GAP — MEDIUM.** Both guards are small pure functions, ideal targets for direct unit tests. There is no test framework configured for Phase 2 (per `02-VALIDATION.md` "Test Infrastructure" — framework is "Custom verify scripts via tsx"), so adding 6-line unit tests would be cheap. |
| Gap (MEDIUM) | **No unit test for asRole.** Cases to assert: `asRole('admin')` returns `'admin'`; `asRole('reviewer')` returns `'reviewer'`; `asRole('employee')` returns `'employee'`; `asRole('org:admin')` throws (the context-side guard does NOT strip `org:`, unlike the webhook-side `asAppRole`); `asRole(undefined)` throws; `asRole({})` throws. |
| Gap (MEDIUM) | **No unit test for asAppRole.** Cases to assert: `asAppRole('admin')` returns `'admin'`; `asAppRole('org:admin')` returns `'admin'` (prefix stripped); `asAppRole('org:reviewer')` returns `'reviewer'`; `asAppRole('member')` returns `null` (Clerk's default `org:member` is not one of our enum values); `asAppRole(42)` returns `null`. The asymmetry between the two guards (one throws, one returns null) is itself a documented decision (02-05-SUMMARY rationale) and worth pinning. |

### 11. REQ-user-roles enum — reviewer-role coverage

| Field | Value |
|-------|-------|
| Invariant | All three roles (`admin`, `reviewer`, `employee`) are accepted by `asRole` and `asAppRole`; the DB column accepts the literal string `'reviewer'`. |
| Locked by | REQ-user-roles, D-09 |
| Observed by | `scripts/check-artifacts.ts` (substring grep for the Role union literal — checks the type-level enum) + indirectly D-07 type tests |
| Coverage | **Compile-time enum confirmed.** The DB-side enforcement is implicit (the `users.role` column is `text` not a Postgres `enum` — see `lib/db/schema.ts:140`), so any string survives. |
| Failure mode if invariant breaks | A commit that removes `'reviewer'` from the union literal breaks `tsc --noEmit` (asRole's `value === 'reviewer'` branch would no longer narrow). |
| Verdict | **PARTIAL.** Type-level enum is locked; runtime path for `reviewer` is not exercised. |
| Gap (LOW) | **L-06 fixtures only seed `admin` users.** The cross-org property test inserts `role = 'admin'` for both orgA and orgB users. The behavior on `role = 'reviewer'` against RLS is identical (RLS predicate doesn't read `role`), so this is a coverage gap that is not actually a defect risk — but it means the only place `reviewer` shows up in CI is the type-level union literal. |
| Gap (LOW) | **No test that `Users.create` accepts `role: 'reviewer'`.** `Users.create` is a stub throwing "not yet implemented — Phase 3." Phase 3 will exercise this. |

### 12. REQ-multi-tenancy (composite)

| Field | Value |
|-------|-------|
| Invariant | Org A cannot access Org B data under any code path; `org_id` present in every application-layer query; RLS enabled on every tenant-scoped table; one user = one org. |
| Locked by | REQ-multi-tenancy, ADR-019, ADR-023, ADR-025 |
| Observed by | L-05 (bounds the set of cross-org call sites to 8 allow-listed paths) + L-06 (proves RLS fires on every other path) + D-08 (proves RLS+GRANTs are physically present) + repository skeletons grep (proves repos use `where(eq(table.orgId, s.orgId))`) |
| Coverage | **Runtime + static — strongest invariant coverage in the phase.** Two independent CI gates (L-05 + L-06) plus a metadata audit (D-08). |
| Failure mode if invariant breaks | Any of: L-05 prints allow-list violations; L-06 prints cross-org leaks; D-08 prints missing RLS/policy/GRANT; check-artifacts grep prints "repository X does not filter by orgId." |
| Verdict | **COVERED.** This is the model invariant. Other invariants should aspire to this layered coverage. |
| Gap (LOW) | The "one user = one org" sub-clause from REQ-user-roles is not directly tested — `users.org_id` is a nullable single FK (D-03a window) but no test inserts a user, then re-routes the same `clerk_user_id` to a second org. Realistic only via Clerk's `organizationMembership.deleted` flow, which is Phase 7+ work. |

---

## Validated by Existing Checks (Credit Where Due)

The Phase 2 verify chain is unusually thorough for an early-phase MVP layer. The following invariants are well-covered and **do not need additional work**:

- **REQ-multi-tenancy core invariant** (`org_id` in every WHERE, RLS on every tenant table, cross-org leak impossible) — triple-covered by L-05 (static AST bound on cross-org callers) + L-06 (runtime property test) + D-08 (metadata audit). Both positive and negative controls in L-06.
- **ADR-018 + ADR-005 type invariants** — D-07 `@ts-expect-error` directives fail tsc if the invariants regress.
- **Migration + RLS DDL applied** — `pnpm db:migrate:test` (step 2) is the bootstrap; failure to apply means failure to verify.
- **server-only boundary on db modules** — check-artifacts grep + AST comment-strip protects against doc-comment false positives.
- **Webhook handler structural shape** — 12+ substring assertions in check-artifacts cover svix import, req.text-before-JSON.parse ordering, ON CONFLICT DO NOTHING, 4 event names, ADR-023 + Pitfall-4 citations.
- **Middleware SF-M4 fold** — at-least-2 try/catch blocks + SF-M4 marker + structured `[middleware] auth() failed` log line.
- **D-03a stale-null users** — runtime SELECT every verify run; both write-time CHECK and read-side audit.
- **Phase 1 schema** — superseded but not regressed (the schema.ts placeholder assertion was correctly retired in Plan 02-06 Rule-3 deviation #4).

---

## Gaps Summary (severity-ordered)

| ID | Severity | Invariant | Gap | Closure plan |
|----|----------|-----------|-----|--------------|
| G-08a | HIGH | D-03 Clerk webhook 4-event dispatch | No runtime contract test — handler's actual behavior is not exercised end-to-end in CI; live-smoke deferred to Phase 3 by operator | Add a Node-side contract test: build sample WebhookEvent, sign with known secret, POST to route handler, assert DB rows. Phase 2.1 or fold into Phase 3 Wave 0. |
| G-09a | HIGH | D-03b clerk_events idempotency | No runtime redelivery test — replay of same svix-msg-id is not asserted to be a no-op | Same harness as G-08a — second POST with identical svix-id, assert row counts unchanged + 200 response. |
| G-03a | HIGH | GRANT correctness (D-08) | No over-grant audit — D-08 only verifies `authenticated` has the right privs; never checks PUBLIC / anon / service_role were NOT granted | Extend `scripts/check-schema.ts`: per tenant table, `WHERE grantee IN ('PUBLIC', 'anon')` should return 0 rows. ~10 lines of SQL. |
| G-04a | HIGH | ADR-018 append-only (runtime) | Type-system-only enforcement; DB-layer GRANT includes UPDATE/DELETE on acknowledgments | Accept (ADR-018 explicitly chose compile-time). If hardening desired: add a Postgres trigger `BEFORE UPDATE OR DELETE ON acknowledgments RAISE EXCEPTION`. Out of scope for Phase 2 per ADR. |
| G-05a | HIGH | ADR-005 Policies.create input (runtime) | Type-system-only enforcement; DB allows direct INSERT of tldrSummary | Accept (ADR-005 mirror of G-04a). Phase 4 (AI Layer) is the natural owner of any DB-level enforcement when it lands. |
| G-06 | MEDIUM | D-02 parent/child org_id consistency | No data-integrity query that asserts child.org_id = parent.org_id across the 5 denorm tables | Add 5 SELECT-count assertions to `scripts/check-data-layer.ts` (zero-row expected). Phase 8 / pre-launch gate. |
| G-07a | MEDIUM | D-03a 5-min CHECK — clock skew | A row with `created_at` in the future is permanently valid-by-CHECK and invisible to the stale-null audit | Add `created_at <= now()` to the CHECK and add a stale-future audit symmetric to step 7. Low realism; documentation may suffice. |
| G-07b | LOW | D-03a CHECK self-test | No probe attempts an INSERT that should be rejected by the CHECK | Add to `scripts/check-rls.ts`: attempt `INSERT INTO users (..., created_at) VALUES (..., NULL, now() - interval '10 minutes')` and assert `error.code === '23514'`. |
| G-10a | MEDIUM | D-04 asRole runtime guard | `asRole` not unit-tested — accepts/rejects unknown values, throws-vs-returns asymmetry with asAppRole not pinned | Add `tests/auth-context.test.ts` with 6 cases. Requires a test runner (none installed; closest precedent is `tests/types.ts` which is tsc-only). |
| G-10b | MEDIUM | D-04 asAppRole `org:` prefix strip | Webhook role-mapping not unit-tested — silent regression if `.replace(/^org:/, '')` is dropped | Same harness as G-10a — 5 cases including `'org:admin' → 'admin'` and `'member' → null`. |
| G-02a | MEDIUM | L-05 dynamic import escape | `await import('@/lib/db')` would not be flagged by the AST walker | Extend `scripts/check-db-imports.ts` to also scan `CallExpression` nodes for `import('@/lib/db')`. ~15 lines of ts-morph. |
| G-11a | LOW | REQ-user-roles reviewer coverage | L-06 fixtures + future repository tests don't exercise `role = 'reviewer'` | Add reviewer to L-06 seed (replace orgB user role 'admin' with 'reviewer'). Cosmetic — RLS doesn't read role. |
| G-01a | LOW | RLS JOIN-fanout edge cases | L-06 only probes single-table SELECTs | Speculative; D-02 makes this practically moot. Defer indefinitely. |
| G-03b | MEDIUM | Migration grant-ownership sanity | Future migration run as non-`postgres` user could leave grants stale | Phase 8 hardening pass; not Phase 2's job. |
| G-12a | LOW | REQ-user-roles one-user-one-org | No test that re-routing same clerk_user_id to a second org is rejected | Phase 7+ concern (membership.deleted flow). |

**Counts:**
- HIGH: 5 (G-03a over-grant, G-04a/G-05a runtime ADR enforcement, G-08a/G-09a webhook runtime)
- MEDIUM: 7
- LOW: 3

---

## Recommended Gap-Closure Plan Items

If the operator opts to ship a Phase 2.1 (or fold into Phase 3 Wave 0), this is the minimum viable batch. Listed in priority order with rough sizing:

### Phase 2.1 (must-fix before Phase 3 ships any UI)

1. **G-08a + G-09a — Clerk webhook contract test.** ~120 lines. Build a sample `organization.created` payload, sign with a test-only secret, call the exported `POST(req: Request)` directly with a `Request` object, assert `organizations` row exists. Re-send same `svix-id`, assert no duplicate row + 200 response. Same harness covers G-09a (idempotency).
   - **Why must-fix:** ROADMAP Phase 2 success criterion 3 is *not* validated end-to-end without it. The deferral to Phase 3 is operator-accepted but leaves the criterion in a structural-only state.
   - **Owner:** New `tests/webhook-clerk.test.ts` or `scripts/check-webhook-clerk.ts` (no test runner needed — Phase 2 pattern is a tsx script).
   - **Add to verify:phase-2 as step 8.**

2. **G-03a — Over-grant audit.** ~10 lines of SQL in `scripts/check-schema.ts`. Asserts no GRANTs to `PUBLIC` or `anon` on tenant tables.
   - **Why must-fix:** Multi-tenancy is the headline phase invariant; an unintended PUBLIC GRANT is the highest-impact, easiest-to-introduce regression.

### Phase 2.1 (recommended)

3. **G-10a + G-10b — Unit tests for asRole + asAppRole.** ~30 lines. Pure-function tests, no DB needed. Pins the throw-vs-null asymmetry between the two role guards (documented as a deliberate decision in 02-05 SUMMARY; deserves a test).

4. **G-02a — Dynamic-import L-05 extension.** ~15 lines of ts-morph. Closes the metaprogramming escape vector.

### Phase 8 / pre-launch (defer)

5. **G-06 — Parent/child org_id consistency audit.** 5 SELECT-count queries. Cheap, currently always passes (no production data), useful at launch.

6. **G-07a — Clock-skew guard.** Migration amendment + symmetric audit. Low realism.

### Accept (document only)

7. **G-04a / G-05a — Runtime ADR enforcement.** ADR-018 and ADR-005 explicitly chose compile-time-only. Not a defect; record the deliberate choice in this audit and move on.

8. **G-01a / G-11a / G-12a / G-03b / G-07b** — Speculative or future-phase concerns; record and defer.

---

## Coverage Score

| Slice | Score | Notes |
|-------|-------|-------|
| Static / AST | **9.5 / 10** | L-05 + check-artifacts cover the import surface + structural shape exhaustively. -0.5 for the dynamic-import escape (G-02a). |
| Runtime DB / RLS | **9 / 10** | L-06 + D-08 are the gold standard. -1 for over-grant (G-03a) and parent/child consistency (G-06) gaps. |
| Compile-time invariants | **10 / 10** | D-07 + check-artifacts catch every regression in ADR-018/005/019 enforcement. |
| Runtime application logic | **4 / 10** | Webhook handler (G-08a/G-09a) and role guards (G-10a/G-10b) lack runtime tests. This is the Phase 2 soft spot. |
| Documentation/audit trail | **10 / 10** | Plans, SUMMARYs, threat registers, deviation logs are all exemplary. The 02-06 SUMMARY's auto-fix log is a model for downstream phases. |

**Overall: 8.5 / 10 — "GAPS_FOUND, but localized."**

Phase 2 ships a near-best-in-class multi-tenancy verification surface. The remaining gaps cluster on **runtime application logic** (the webhook handler and the small auth guards), not on the security invariants those invariants protect. Every gap rated HIGH has a known, low-cost closure path — none requires architectural rework or new dependencies.

---

## Recommendation

1. **Do not block Phase 3 on this audit's gaps.** The five HIGH gaps are real but the L-05 + L-06 + D-08 chain genuinely bounds the cross-tenant risk surface. The webhook runtime gap (G-08a/G-09a) is mitigated in the short term by the operator's commitment to fold a live-smoke into the first Phase 3 wave.

2. **Schedule a Phase 2.1 "validation hardening" sub-plan** before Phase 3 ships user-visible features. The four "must-fix + recommended" items above total ~175 lines of new test code; budget half a day.

3. **Carry G-08a/G-09a + G-10a/G-10b explicitly into Phase 3 Wave 0** if a separate Phase 2.1 isn't planned. The Phase 3 admin-UI plan exercises `Users.create`, `Policies.create`, `Departments.create` — all of which depend on the role + webhook plumbing this audit flagged as runtime-untested.

4. **Document G-04a / G-05a as accepted ADR-aligned gaps** in the next STATE.md update. They're not defects; they're consequences of two architectural choices that should be preserved (compile-time ADR enforcement keeps the type system as the source of truth, per ADR-023's "type system enforces invariants, not discipline" thesis).

5. **Add G-03a (over-grant audit) to `scripts/check-schema.ts` as a no-cost extension.** ~10 lines, ~50 ms of runtime, closes the only HIGH gap on the security side. If anything in this audit ships into Phase 2.1, this should be first.

---

*Audit completed 2026-05-18 — all 12 focus areas examined; 12 invariants traced to checks (or absence thereof); 5 HIGH / 7 MEDIUM / 3 LOW gaps catalogued; coverage score 8.5/10. No tests written, no code modified — this is the audit report only.*
