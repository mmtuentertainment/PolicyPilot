# Phase 8: Validation (CSV-first slice) — Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Mode:** discuss `--power` (HOW decisions). Most WHAT/ambiguity resolved in `08-SPEC.md` + the 2 operator decisions (2026-06-15); this locks the implementation HOW.

<domain>
## Phase Boundary

An org admin exports a per-employee acknowledgment-compliance report via `GET /api/reports/acknowledgments?format=json|csv`: a read-only, org-scoped (RLS), admin-only endpoint that JOINs `policy_assignments` (user-direct OR department-member) against published `policies` and the append-only `acknowledgments` to derive each `(employee, policy)` pair's `ackState ∈ {none, current, stale}`, enriches employee identity (name + email) from Clerk, and returns either JSON (with summary counts) or a downloadable RFC-4180 CSV. A new cumulative `verify:phase-8` + `verify-phase-8.yml` gate it. This is **acceptance criterion #5** only — the compliance dashboard donut, aggregate widgets, seed harness, Stripe test-clock run, and beat-manual benchmark are DEFERRED. No schema change (index stays `0014`); no new package (CSV hand-rolled; `clerkClient` already in stack). Runs on dev/TEST only.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `08-SPEC.md` for full requirements R8-1..R8-7, boundaries, and acceptance criteria. Downstream agents MUST read `08-SPEC.md` before planning or implementing.

**In scope (from SPEC.md):** the `GET /api/reports/acknowledgments?format=json|csv` route (admin-only, content negotiation, optional `policyId`/`departmentId` filters); `lib/db/repositories/reports.ts` read-only ack-compliance query; Clerk batch identity enrichment (name+email) with `clerkUserId` fallback; hand-rolled RFC-4180 CSV serializer with formula-injection guard; JSON + summary counts; co-located vitest + a TEST-DB integration test (cross-org + ack-state); `verify:phase-8` + `check:reports` + `verify-phase-8.yml`; R-009 keep-current folds + R-007 note.

**Out of scope / DEFERRED (from SPEC.md):** dashboard donut/Recharts (recharts ASK-FIRST + ≥14-day when picked up); aggregate widgets; populated-org seed harness; Stripe test-clock run (AC#6); beat-manual benchmark (SC#5); evidence-capture pass for the 6 already-shipped criteria; any prod deploy / prod-Supabase / R-018 live-email gates; any schema/migration change; any new runtime package.

</spec_lock>

<decisions>
## Implementation Decisions

All decisions below are HOW decisions only — `08-SPEC.md` owns WHAT/WHY. Two are operator-locked (2026-06-15: Clerk-enriched identity; SCHEMA.md fold-in); the rest are Claude/Opus discuss-`--power` decisions grounded in recon of the live repo. Exact external-API specifics (Clerk `getUserList` userId cap; Next CSV-response idiom) are confirmed in `08-RESEARCH.md`.

### Report Query & Data (R8-2, R8-3)
- **D-01 — Report query in a NEW `lib/db/repositories/reports.ts`.** `export const Reports = { listAckComplianceForOrg(s: OrgScope, filters?: { policyId?: string; departmentId?: string }) }`. Read-only; takes the scoped tx `s.tx`; never imports raw `db` (so no `check-db-imports` allow-list change). Chosen over bloating an existing single-aggregate repo because the query is a 5-table reporting JOIN with no write side — a dedicated reporting module matches the route it backs and keeps `acknowledgments`/`policies` repos append-only-clean.
- **D-02 — JOIN shape (reuse 07 D-09 + 05 D-01).** `users ⋈ policy_assignments[ (assigneeType='user' AND assigneeId=users.id) OR (assigneeType='department' AND assigneeId=users.departmentId) ] ⋈ policies(orgId=s.orgId, id=policyAssignments.policyId, status='published') ⋈ policy_versions(orgId=s.orgId, policyId=policies.id, versionNumber=policies.currentVersion) ⟕ current_ack(alias; orgId,userId,policyId, policyVersionId = current version id) ⟕ prior_ack(alias; orgId,userId,policyId, policyVersionId <> current) ⟕ departments(users.departmentId)`. `selectDistinct` (a user assigned both directly AND via department must not double-count). `ackState = CASE WHEN current_ack.id IS NOT NULL THEN 'current' WHEN prior_ack.id IS NOT NULL THEN 'stale' ELSE 'none' END`. `ORDER BY users.id, policies.id` for a stable CSV. Mirrors `reminders.ts:79-163` (org-wide, no userId filter) + `policies.ts:135-209` (3-state). Every predicate carries `orgId = s.orgId`; RLS is the backstop.
- **D-03 — Optional filters AND-combined, inside the org-scoped query.** `policyId` → `eq(policies.id, …)`; `departmentId` → `eq(users.departmentId, …)`. Both optional, both UUID-validated at the route (D-08), applied as additional `WHERE` predicates. A filter value that names another org's row simply returns zero rows under RLS — never a leak (this is an explicit red-team invariant).
- **D-04 — Compliance semantics (document so JSON+CSV agree).** `current` = "Acknowledged (current version)" → compliant. `stale` = "Acknowledged — prior version, re-ack due" → NOT compliant on the current version (matches 07 D-07 "re-publish forces re-ack"). `none` = "Pending" → not compliant. Summary: `acknowledged = count(ackState='current')`; `pending = count(ackState IN ('none','stale'))`; `total = rows`. `acknowledgedAt`/`ipAddress` are taken from `current_ack` (the compliant ack); for a `stale` row they are null (the current-version ack does not exist) — the prior ack's timestamp is intentionally NOT surfaced as "acknowledged".

### Clerk Identity Enrichment (R8-4)
- **D-05 — Enrich AFTER the org-scoped query, batched, in `lib/reports/enrich.ts`.** Collect the DISTINCT `clerkUserId`s from the result rows; batch-fetch via `clerkClient().users.getUserList({ userId: chunk, limit })` (App Router import `@clerk/nextjs/server`), chunked to the SDK's per-call `userId` cap (confirmed in RESEARCH; chunk conservatively at ≤100). Build `Map<clerkUserId, { name, email }>` where `name = [firstName, lastName].filter(Boolean).join(' ') || username || ''` and `email = primaryEmailAddress?.emailAddress ?? ''`. Map onto rows. A `clerkUserId` absent from Clerk's response → `{ name: '', email: '' }` fallback (or the bare `clerkUserId` in a `clerkUserId` column) — **the row is never dropped, never throws.** Helper lives in `lib/reports/enrich.ts` for unit testability; mocked at the module boundary in route tests (06 D-32 pattern). No live Clerk in CI.
- **D-06 — Enrichment input = result set only (security invariant).** The `clerkUserId` list passed to Clerk is derived *solely* from the rows the RLS-scoped query returned. No request param, header, or external value ever reaches `getUserList`. This guarantees the enrichment cannot be coerced into resolving identities outside the caller's org. (Primary red-team target.)

### Endpoint, Content Negotiation & CSV (R8-1, R8-5, R8-6)
- **D-07 — Route `app/api/reports/acknowledgments/route.ts`, `GET(req): Promise<Response>`.** Auth gates OUTSIDE the inner `try` (D-37): `const ctx = await getOrgContext();` (→401 unauth via Next error boundary) `requireAdminFromCtx(ctx);` (→403 `{error:'forbidden'}`). Then param parse (D-08). Then inner `try`: `const rows = await withOrgScope(ctx, (s) => Reports.listAckComplianceForOrg(s, filters));` → `enrichWithClerkIdentity(rows)` → serialize per `format`.
- **D-08 — Param validation via zod over `searchParams`.** `const sp = new URL(req.url).searchParams;` parse `{ format: z.enum(['json','csv']).default('json'), policyId: z.string().uuid().optional(), departmentId: z.string().uuid().optional() }` with `safeParse`. On failure → `NextResponse.json({ error: 'invalid_request' }, { status: 400 })` (an unknown `format` like `xml` fails the enum → 400; a malformed UUID fails → 400). Param parsing/validation sits between the auth gates and the inner business `try`.
- **D-09 — Hand-rolled CSV serializer in NEW `lib/reports/csv.ts` (dependency-free).** Generic `toCsv(headers: string[], rows: string[][]): string` + a `csvField(value)` escaper. RFC-4180: a field containing `,`, `"`, CR, or LF is wrapped in double quotes with internal `"` doubled; records terminated with CRLF (`\r\n`); UTF-8. **Formula/CSV-injection guard:** if a field's first character ∈ {`=`, `+`, `-`, `@`, TAB(`\t`), CR(`\r`)} prefix a single-quote (`'`) BEFORE quoting — applied to ALL string cells (cheap and uniformly safe; user-controlled fields = policy title, employee name, email, department name are the live vectors). Column contract (fixed order) finalized in PLAN; baseline: `Employee Name, Email, Department, Policy Title, Status, Acknowledged At, IP Address, Assigned At, Policy Version`. `ackState` rendered as a human label per D-04.
- **D-10 — Response construction.** JSON (default): `NextResponse.json({ rows, summary: { total, acknowledged, pending } }, { status: 200 })`. CSV: `new NextResponse(csvString, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="acknowledgments-${ctx.orgId}-${date}.csv"` } })` where `date = new Date().toISOString().slice(0, 10)`. Body is a built string (report is one org's data — small; streaming is unnecessary; RESEARCH confirms string-body is the Next idiom). Filename uses internal `orgId` (UUID) — no Clerk org slug needed, no extra lookup.
- **D-11 — Error shapes + logging.** 401 unauth (getOrgContext, outside try → Next error boundary); 403 `{error:'forbidden'}` (requireAdminFromCtx, outside try); 400 `{error:'invalid_request'}` (zod safeParse); 503 `{error:'service_unavailable'}` (DB/Clerk failure in the inner try/catch) with a PII-safe structured `console.error` (D-36 masked-logging pattern: `{ orgId: ctx.orgId, error: {name, message: msg.slice(0,120)} }`). No `any` anywhere.

### Testing & Verification (R8-2, R8-3, R8-7)
- **D-12 — Three-layer test strategy.** (a) **Route unit** `app/api/reports/acknowledgments/route.test.ts` — mock `getOrgContext` (admin / employee / unauth), mock `Reports.listAckComplianceForOrg` → fixture rows, mock `enrichWithClerkIdentity` (Clerk module boundary); assert 401 / 403 `{error:'forbidden'}` / 400 `{error:'invalid_request'}` / 200; JSON shape + summary math; CSV `Content-Type` + `Content-Disposition` + dated filename. (b) **Serializer unit** `lib/reports/csv.test.ts` — RFC-4180 cases (`",` round-trip; embedded newline stays in one quoted field; quote-doubling) + formula-injection (`=cmd` → `'=cmd`, `+`, `-`, `@`, leading TAB) + header-row exactness. (c) **TEST-DB integration** `scripts/check-reports.ts` — raw `postgres-js` + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)` + intentional ROLLBACK + final TRUNCATE (mirrors `check-rls.ts:72-226` / `check-employee-portal.ts`): proves R8-2 ack-state derivation (none/current/stale) + department fan-out + draft-exclusion, and R8-3 two-org isolation (overlapping titles; Org B `policyId` filter under Org A → 0 rows). Clerk enrichment is stubbed in the integration (DB-truth only; no live Clerk in CI).
- **D-13 — Cumulative `verify:phase-8` + CI mirror.** `package.json`: `verify:phase-8 = pnpm tsc --noEmit && pnpm verify:phase-7 && pnpm check:reports && pnpm run test -- --run app/api/reports && pnpm run test -- --run lib/reports && pnpm db:verify && pnpm check:artifacts`. `check:reports` = run `scripts/check-reports.ts` (mirrors `check:crons-email`, needs `DATABASE_URL_TEST`). Extend `scripts/check-artifacts.ts` to assert the route + `lib/db/repositories/reports.ts` + `lib/reports/csv.ts` + `lib/reports/enrich.ts` + the three test files exist. New `.github/workflows/verify-phase-8.yml` mirrors `verify-phase-7.yml` (concurrency group, 45-min timeout, `push` on `main` only + `pull_request` + `workflow_dispatch`; same env/secrets placeholders). **Never weaker than `verify:phase-7`** — it runs it in full first.

### Claude's Discretion (planner flexibility within the above)
- Exact Drizzle SQL formatting / JOIN ordering (reuse the 07 D-09 / 05 D-01 shape).
- Final CSV column header labels + the `ackState`→label mapping strings.
- Clerk batch chunk size (≤ the SDK cap confirmed in RESEARCH) and whether enrichment short-circuits when the result set is empty.
- Whether the zod param schema lives inline in the route or a small `lib/reports/params.ts`.
- `summary` field names (must stay JSON-stable once chosen).
- `scripts/check-reports.ts` fixture builders + exact `verify:phase-8` / `check-artifacts` wiring.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (planner, Codex) MUST read these before planning or implementing.**

### Phase 8 lock
- `.planning/phases/08-validation/08-SPEC.md` — Locked R8-1..R8-7, boundaries, acceptance criteria. **MUST read before planning.**
- `.planning/phases/08-validation/08-DISCUSSION-LOG.md` — operator decisions + alternatives.
- `.planning/phases/08-validation/08-UAT-INTENT.md` — what the operator will verify.
- `.planning/phases/08-validation/08-RESEARCH.md` — Clerk `getUserList` batch limits + Next App-Router CSV-response idiom (confirmed before PLAN).

### Project lock
- `.planning/PROJECT.md` / `CLAUDE.md` — ADR-018 (append-only audit; acks read-only), ADR-019 (`org_id` in every WHERE), ADR-023 (per-aggregate repos + raw-`db` allow-list; reports route uses `withOrgScope`, NOT allow-listed raw db), ADR-025 (`withOrgScope` + RLS), ADR-026 (typed errors per domain), ADR-029 (phase gating; Phase 8 depends on 6 AND 7).
- `.planning/REQUIREMENTS.md` §10 — acceptance criteria; REQ-compliance-dashboard / REQ-acceptance-criteria. `reference/VALIDATION-GATE.md:13` — criterion #5 (CSV export).
- `.planning/ROADMAP.md` § Phase 8 — Goal, Depends-on (6 AND 7), Success Criteria (SC#1 CSV half is this slice; donut half deferred).

### Frozen contracts
- `reference/API-SPEC.md:123-128` — `GET /api/reports/acknowledgments?format=csv` contract (the endpoint shape this slice fulfills).
- `reference/SCHEMA.md` — `notifications` block omits the live `org_id` (doc-debt) → **corrected this phase** (operator-approved ASK-FIRST fold-in, 2026-06-15).

### Live schema + scoping (build against these, not the frozen doc)
- `lib/db/schema.ts` — `acknowledgments` (52-79; append-only; `acknowledgedAt`,`ipAddress`,`policyVersionId`), `policy_assignments` (225-244; `assigneeType`,`assigneeId`), `policies` (204-223; `status`,`currentVersion`), `policy_versions` (246-274; `versionNumber`), `users` (344-374; `clerkUserId`,`role`,`departmentId`; **no name/email**), `departments` (139-151; `name`).
- `lib/db/scoped.ts:41-67` — `withOrgScope(ctx, fn)` → `OrgScope = OrgContext & { tx }`; RLS via `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …, true)`.
- `lib/auth/context.ts:93-174` — `getOrgContext()` (Clerk text-id → internal UUID; throws → 401).
- `lib/auth/require-admin.ts:56-60` — `requireAdminFromCtx(ctx)` (API-route variant → `ForbiddenError` → 403 `{error:'forbidden'}`). (NOT the page-level `requireAdmin()` at :26-30 which `notFound()`s.)

### Reuse targets
- `lib/db/repositories/reminders.ts:79-163` (`listAckReminderCandidatesForOrg`, 07 D-09) — org-wide JOIN + dept fan-out (user-direct OR dept-member) shape to mirror.
- `lib/db/repositories/policies.ts:135-209` (`listAssignedAndPublishedForUser`, 05 D-01) — 3-state `ackState` (current_ack/prior_ack aliases + CASE).
- `lib/db/repositories/acknowledgments.ts` — append-only (read paths only; no UPDATE/DELETE; ADR-018) — confirm the report only READS.

### Auth / Clerk backend
- `@clerk/nextjs/server` `clerkClient().users.getUserList({ userId })` — batch identity fetch (limits/pagination + return shape confirmed in RESEARCH via Context7 / the `clerk-backend-api` skill). Already in stack — no new package.
- Reference route shape: `app/api/ai/consistency/route.ts:59-145` (auth-outside-try, `withOrgScope`-inside, `NextResponse.json`, error discrimination, masked logging).

### Verify chain + CI
- `package.json:55` — `verify:phase-7` (the chain `verify:phase-8` wraps). `:51-54` — the `verify:phase-{3..6}` ladder + sub-checks (`check:db-imports`, `check:rls`, `check:artifacts`, `db:verify`, etc.).
- `scripts/check-db-imports.ts:42-54` — ADR-023 allow-list (reports route NOT added; uses `withOrgScope`).
- `scripts/check-rls.ts:72-226` / `scripts/check-employee-portal.ts` — TEST-DB integration pattern `scripts/check-reports.ts` mirrors.
- `.github/workflows/verify-phase-7.yml` (+ `verify-phase-6.yml:3-10` TRUNCATE-deadlock flake note) — the workflow `verify-phase-8.yml` mirrors.
- `vitest.config.ts:29-79` — node/jsdom env split; 30s `testTimeout`/`hookTimeout` (shared config — do not lower).

### Keep-current (R-009) targets (folded this phase)
- `.planning/consultant/{working_context,system_map,feature_inventory,risk_register,backlog}.md` — all dated 2026-06-14, still say "Phase 7 draft PR #44 / not merged", `main` `c90dd44`. Reality: Phase 7 shipped `8b7019d`; `main` `3df5223` (#46/#47 shipped). Flip R-006/rank-6/rank-7 → Shipped; drop R-018 "draft PR #44" qualifier; mark R-007 carried into Phase 8 plan.
- `reference/SCHEMA.md` — add `org_id` to the notifications block + RLS note (operator-approved).
- `docs/runbooks/deploy-migrations.md` — prose "13 entries 0000..0012" → 15 / `0014` (CODE `check-deploy-schema.ts` already dynamic; prose-only fix).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`withOrgScope` + `OrgContext`** (`lib/db/scoped.ts`, `lib/auth/context.ts`) — the report route's only DB channel; RLS-enforced tx. No raw `db`.
- **`requireAdminFromCtx`** (`lib/auth/require-admin.ts:56-60`) — API-route admin gate → 403; gated outside try (D-37).
- **07 D-09 org-wide ack JOIN** (`reminders.ts:79-163`) — the JOIN + department fan-out to mirror (drop the reminder-specific window predicates; keep the assignment/policy/version/ack join + 3-state).
- **05 D-01 3-state `ackState`** (`policies.ts:135-209`) — current_ack/prior_ack aliases + CASE.
- **Module-boundary mocking** (06 D-32) — Clerk enrichment + repo mocked in route unit tests; live DB only in `check-reports.ts`.
- **Cumulative verify** (05 D-23 / 06 D-35 / 07 D-13) — `verify:phase-8` wraps `verify:phase-7` then adds.
- **TEST-DB integration scripts** (05 D-22 / `check-rls.ts`) — raw postgres-js + BYPASSRLS seed + SET LOCAL ROLE + set_config + ROLLBACK/TRUNCATE.

### Established Patterns
- **Org-scope-first repos** (ADR-023/025): every new DB method takes `OrgScope`, uses `s.tx`. `Reports.listAckComplianceForOrg` follows.
- **Auth-outside-try / business-inside-try** (D-37): the reference `app/api/ai/consistency/route.ts`.
- **Typed/structured masked logging** (D-36): 503 path logs `{orgId, error:{name,message:slice}}` — never PII/secrets.
- **Append-only** (ADR-018): report READS `acknowledgments`; never writes.

### Integration Points (NEW unless noted)
- `app/api/reports/acknowledgments/route.ts` — the GET handler.
- `lib/db/repositories/reports.ts` — `Reports.listAckComplianceForOrg`.
- `lib/reports/csv.ts` — RFC-4180 serializer (+ formula-injection guard).
- `lib/reports/enrich.ts` — Clerk batch name/email enrichment (+ fallback).
- `scripts/check-reports.ts` — TEST-DB integration gate.
- `scripts/check-artifacts.ts` (extend) — assert the new files exist.
- `package.json` (extend) — `verify:phase-8` + `check:reports`.
- `.github/workflows/verify-phase-8.yml` — CI mirror.
- `reference/SCHEMA.md`, `docs/runbooks/deploy-migrations.md`, `.planning/consultant/*` (extend) — keep-current folds.

</code_context>

<specifics>
## Specific Ideas

- **Clerk enrichment is the one boundary-crossing call** — keep it OUT of the DB tx (enrich AFTER `withOrgScope` returns), batched, fallback-safe, and fed only RLS-filtered `clerkUserId`s (D-06). If the result set is empty, skip Clerk entirely.
- **`stale` is "not compliant on the current version"** — surfaced as its own status label, counted as pending. This makes the CSV honest for an auditor (someone who acked an old version is not covered for the new one) and matches 07 D-07.
- **Filename uses the internal org UUID** (`acknowledgments-<orgId>-<date>.csv`) — no Clerk org slug lookup; deterministic and PII-free.
- **Formula-injection guard on ALL string cells** — cheaper to reason about than tracking "which columns are user-controlled," and uniformly safe; the live vectors are policy title + Clerk-sourced name/email/department.
- **No live Clerk / no live email in CI** — the integration gate stubs Clerk; identity enrichment correctness is covered by the route unit test's mock + the serializer unit test.

</specifics>

<deferred>
## Deferred Ideas

- **Compliance dashboard donut (Recharts)** → later slice/phase; `recharts` is ASK-FIRST + ≥14-day supply-chain rule (backlog rank-8). The query layer here is reusable when the chart lands.
- **Dashboard aggregate widgets** (ack-rate / overdue / due-for-review tiles) → later.
- **Populated-org seed/evidence harness** (≥10 employees + 5 policies) → evidence-capture leg.
- **Stripe test-clock renewal run** (AC#6) → operator-evidence leg (code complete; reuses Phase 6 `STRIPE_API_KEY` override).
- **Beat-manual benchmark note** (SC#5) → deferred; R-007 accepted-risk note carried in `08-PLAN.md`.
- **Evidence capture for the 6 shipped/CI-gated criteria** (#1-#4, #7, #8) → validation evidence leg.
- **Pagination / very large org CSV streaming** → not needed at current scale; revisit if a single org's report grows unbounded (string-body is fine for MVP).

</deferred>

---

*Phase: 08-validation*
*Context gathered: 2026-06-15*
