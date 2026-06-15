---
phase: 08-validation
plan: "08"
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/reports/csv.ts
  - lib/reports/csv.test.ts
  - lib/reports/enrich.ts
  - lib/reports/enrich.test.ts
  - lib/db/repositories/reports.ts
  - app/api/reports/acknowledgments/route.ts
  - app/api/reports/acknowledgments/route.test.ts
  - scripts/check-reports.ts
  - scripts/check-artifacts.ts
  - package.json
  - .github/workflows/verify-phase-8.yml
autonomous: true
requirements: [REQ-compliance-dashboard, REQ-acceptance-criteria]
user_setup:
  - "Resume BOTH Supabase projects before any verify run: TEST qwtbbbjbxffioeeazxrw + dev kdoahaxhmaftxaiwbtdw (auto-pause independently; ENOTFOUND/28P01 names which)."

must_haves:
  truths:
    # R8-1 admin-only auth, R8-6 content negotiation
    - "GET /api/reports/acknowledgments runs getOrgContext() then requireAdminFromCtx(ctx) OUTSIDE the inner try (D-37): unauth -> 401, non-admin -> 403 {error:'forbidden'}, admin -> 200"
    - "zod safeParse over searchParams { format: enum(json|csv).default(json), policyId: uuid().optional, departmentId: uuid().optional }; parse failure -> 400 {error:'invalid_request'} (format=xml and malformed uuid both 400)"
    # R8-2 org-scoped read-only query
    - "Reports.listAckComplianceForOrg(s, filters) runs entirely inside withOrgScope; every predicate carries org_id = s.orgId; route never imports raw db (no check-db-imports allow-list change); acknowledgments is READ-only (ADR-018)"
    - "one row per (employee, assigned PUBLISHED policy); ackState in {none,current,stale} via current_ack/prior_ack aliases (05 D-01); department assignments fan out to member users (07 D-09); draft/archived policies excluded; deduped to one row per (user,policy)"
    # R8-3 cross-org isolation
    - "RLS is the isolation backstop; a two-org TEST-DB integration test proves Org A export returns zero Org B rows AND Org B policyId filter under Org A returns zero rows"
    # R8-4 Clerk enrichment
    - "name+email resolved from Clerk via await clerkClient(); users.getUserList({ userId: chunk<=100, limit:100 }); chunked at 100; { data } destructured; primaryEmailAddress?.emailAddress; missing id -> {name:'',email:''} fallback, row never dropped; userId list = result-set clerkUserIds ONLY (D-06)"
    # R8-5 CSV safety
    - "hand-rolled RFC-4180 serializer (no new package): quote fields with , \" CR LF; double internal quotes; CRLF terminators; UTF-8; formula-injection guard prefixes ' on leading = + - @ TAB CR"
    # R8-7 verify gate
    - "verify:phase-8 runs verify:phase-7 IN FULL then adds check:reports + reports tests + check:artifacts; never weaker; tsc --noEmit clean, no any; verify-phase-8.yml mirrors verify-phase-7.yml (concurrency, 45-min, push:main + PR + workflow_dispatch)"
  artifacts:
    - path: "lib/reports/csv.ts"
      provides: "RFC-4180 toCsv + formula-injection-safe csvField"
      contains: "toCsv"
    - path: "lib/reports/enrich.ts"
      provides: "Clerk batch name/email enrichment with fallback"
      contains: "getUserList"
    - path: "lib/db/repositories/reports.ts"
      provides: "Reports.listAckComplianceForOrg org-scoped read-only query"
      contains: "listAckComplianceForOrg"
    - path: "app/api/reports/acknowledgments/route.ts"
      provides: "admin-only GET with json|csv content negotiation"
      contains: "requireAdminFromCtx"
    - path: "scripts/check-reports.ts"
      provides: "TEST-DB integration gate (cross-org + ack-state)"
      contains: "report"
    - path: ".github/workflows/verify-phase-8.yml"
      provides: "CI mirror of verify-phase-7.yml"
      contains: "verify:phase-8"
  key_links:
    - from: "app/api/reports/acknowledgments/route.ts"
      to: "lib/db/repositories/reports.ts"
      via: "withOrgScope(ctx, s => Reports.listAckComplianceForOrg(s, filters))"
      pattern: "withOrgScope"
    - from: "app/api/reports/acknowledgments/route.ts"
      to: "lib/reports/enrich.ts"
      via: "enrichWithClerkIdentity(rows)"
      pattern: "enrichWithClerkIdentity"
    - from: "app/api/reports/acknowledgments/route.ts"
      to: "lib/reports/csv.ts"
      via: "toCsv(headers, rows) for format=csv"
      pattern: "toCsv"
    - from: "package.json"
      to: "scripts/check-reports.ts"
      via: "check:reports script in verify:phase-8 chain"
      pattern: "check:reports"
---

> ⚠ **STATUS: RED-TEAMED — FIXES PENDING FOLD. DO NOT HAND TO CODEX YET.**
> The adversarial red-team Workflow `wf_1f196a0e-e8e` (2026-06-15) confirmed the query design / org-scoping / scope / guardrails are SOUND, but found must-fixes in (1) the auth 401/403 mechanism (Route Handlers throw → 500, not the assumed "error boundary"), (2) the integration-gate fidelity (Task 5 must drive the REAL query through REAL RLS via the vitest `check-employee-portal.test.ts` pattern, not BYPASSRLS/raw-SQL), (3) CSV guard+quote combination test (CSV-1), and (4) the test-glob/wiring details (VG-1/2/3, CSV-2/3/4, dedup, departments-join org_id). **Full fix list:** `ops/deltas/2026-06-15-phase8-plan.md` § Addendum. **Full red-team detail:** the `w1v0ffwwq.output` file referenced there. Fold these in (verifying ground-truth on the real route + test patterns first), then delete this banner.

<objective>
Build the **acceptance-criterion-#5 CSV slice**: an admin-only, org-scoped `GET /api/reports/acknowledgments?format=json|csv` that derives each `(employee, assigned published policy)` pair's ack status from the live schema (no migration), enriches employee identity (name+email) from Clerk, and returns JSON (with summary counts) or a downloadable RFC-4180 CSV — gated by a new cumulative `verify:phase-8` + `verify-phase-8.yml`.

Purpose: REQ-compliance-dashboard / acceptance criterion #5 ("Admin exports acknowledgment report to CSV"). DEFERRED (NOT in this plan): the Recharts donut, aggregate widgets, populated-org seed harness, Stripe test-clock run (AC#6), and the beat-manual benchmark (SC#5) — see `08-SPEC.md` Boundaries.

Output: `lib/reports/{csv,enrich}.ts` + tests, `lib/db/repositories/reports.ts`, `app/api/reports/acknowledgments/route.ts` + test, `scripts/check-reports.ts`, `check-artifacts.ts` + `package.json` + `verify-phase-8.yml` wiring. **No schema/migration change (index stays 0014). No new runtime package.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
Routing: per `AGENTS.md` — Codex executes this plan (TDD, atomic commits). Claude planned it.
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/08-validation/08-SPEC.md
@.planning/phases/08-validation/08-CONTEXT.md
@.planning/phases/08-validation/08-RESEARCH.md
@.planning/phases/08-validation/08-UAT-INTENT.md
@lib/db/repositories/reminders.ts
@lib/db/repositories/policies.ts
@lib/db/scoped.ts
@lib/auth/require-admin.ts
@lib/auth/context.ts
@app/api/ai/consistency/route.ts
@scripts/check-rls.ts
@scripts/check-employee-portal.ts
@.github/workflows/verify-phase-7.yml
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Hand-rolled RFC-4180 CSV serializer (lib/reports/csv.ts) — TDD</name>
  <read_first>
    - 08-RESEARCH.md §4 (CSV/formula-injection guard) + 08-CONTEXT.md D-09
    - CONVENTIONS.md:122-126 (import order)
  </read_first>
  <behavior>
    - toCsv(headers: string[], rows: string[][]): string produces an RFC-4180 document: header row first, CRLF (\r\n) record terminators, UTF-8.
    - csvField(value: string): a field containing , " CR or LF is wrapped in double quotes with every internal " doubled.
    - Formula-injection guard: if the field's first char is = + - @ TAB(\t) or CR(\r), prefix a single quote (') BEFORE quoting. Applied to ALL string cells.
  </behavior>
  <action>
    Write `lib/reports/csv.test.ts` FIRST (RED): assert (a) a field `He said "hi", bye` round-trips to `"He said ""hi"", bye"`; (b) a field with an embedded `\n` stays inside one quoted field; (c) `=cmd` -> `'=cmd`, and `+`,`-`,`@`,leading-TAB likewise prefixed; (d) the header row is emitted verbatim and joined by CRLF; (e) a plain field with no special chars is emitted unquoted.
    Then write `lib/reports/csv.ts`: pure functions, no deps, no `any`. `toCsv` maps each cell through `csvField` and joins with `,` per row and `\r\n` between rows (including after the header). Export `toCsv` (and `csvField` for testing).
  </action>
  <verify><automated>pnpm vitest run lib/reports/csv.test.ts</automated></verify>
  <acceptance_criteria>
    - SOURCE: `lib/reports/csv.ts` exports `toCsv`; the escaper handles `,"`, CR, LF and the formula-injection guard.
    - TEST: `pnpm vitest run lib/reports/csv.test.ts` GREEN (all cases incl. formula-injection).
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The dependency-free RFC-4180 serializer with formula-injection neutralization exists and is GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Clerk identity enrichment (lib/reports/enrich.ts) — TDD</name>
  <read_first>
    - 08-RESEARCH.md §1 (getUserList: userId[] cap 100, { data }, await clerkClient(), primaryEmailAddress?.emailAddress)
    - app/api/webhooks/clerk/route.ts:72-74 (await clerkClient() form) + route.test.ts:60-63 (mock shape)
    - 08-CONTEXT.md D-05, D-06
  </read_first>
  <behavior>
    - enrichWithClerkIdentity(rows: ReportRow[]): Promise<EnrichedRow[]> collects the DISTINCT clerkUserIds present in `rows` ONLY (D-06 — no external input), chunks at <=100, `const client = await clerkClient()`, `client.users.getUserList({ userId: chunk, limit: 100 })`, destructures `{ data }`, builds Map<clerkUserId,{name,email}> where name = [firstName,lastName].filter(Boolean).join(' ') || username || '' and email = primaryEmailAddress?.emailAddress ?? '', maps onto rows.
    - A clerkUserId Clerk doesn't return -> { name:'', email:'' } fallback; the row is KEPT (never dropped, never throws on a missing user). If rows is empty, return [] without calling Clerk.
  </behavior>
  <action>
    Write `lib/reports/enrich.test.ts` FIRST (RED), mocking `@clerk/nextjs/server` per the repo pattern (`vi.doMock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn(async () => ({ users: { getUserList: vi.fn(async () => ({ data: [...], totalCount }))} })) }))`): assert (a) 2 distinct ids -> getUserList called once with exactly those ids -> rows enriched with name+email; (b) 150 distinct ids -> getUserList called TWICE (chunk 100 + 50); (c) an id absent from Clerk's `data` -> that row has name:''/email:'' but is present; (d) empty rows -> getUserList NOT called; (e) the userId array passed to getUserList equals the result-set ids — never any other value (D-06 guard).
    Then write `lib/reports/enrich.ts`: `import 'server-only'`; `import { clerkClient } from '@clerk/nextjs/server'`; export `ReportRow`/`EnrichedRow` types + `enrichWithClerkIdentity`. No `any`.
  </action>
  <verify><automated>pnpm vitest run lib/reports/enrich.test.ts</automated></verify>
  <acceptance_criteria>
    - SOURCE: `lib/reports/enrich.ts` uses `await clerkClient()` + `users.getUserList({ userId })`, chunks at 100, fallback-safe, fed only result-set ids.
    - TEST: `pnpm vitest run lib/reports/enrich.test.ts` GREEN (chunking, fallback, empty-skip, D-06 id-set guard).
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>Clerk batch enrichment with chunking + fallback exists, fed only RLS-filtered ids, and is GREEN.</done>
</task>

<task type="auto">
  <name>Task 3: Ack-compliance report query (lib/db/repositories/reports.ts)</name>
  <read_first>
    - lib/db/repositories/reminders.ts:79-163 (org-wide user-direct-OR-department JOIN — mirror; drop reminder window predicates)
    - lib/db/repositories/policies.ts:135-209 (current_ack/prior_ack aliases + 3-state ackState CASE)
    - lib/db/scoped.ts:26,41-67 (OrgScope = OrgContext & { tx }); lib/db/schema.ts (acknowledgments/policy_assignments/policies/policy_versions/users/departments columns)
    - 08-CONTEXT.md D-01..D-04
  </read_first>
  <behavior>
    - Reports.listAckComplianceForOrg(s: OrgScope, filters?: { policyId?: string; departmentId?: string }): Promise<ReportRow[]>.
    - JOIN: users INNER policy_assignments[(assigneeType='user' AND assigneeId=users.id) OR (assigneeType='department' AND assigneeId=users.departmentId)] INNER policies(orgId=s.orgId, id=pa.policyId, status='published') INNER policy_versions(orgId=s.orgId, policyId=policies.id, versionNumber=policies.currentVersion) LEFT current_ack(orgId,userId,policyId,policyVersionId=current) LEFT prior_ack(orgId,userId,policyId,policyVersionId<>current) LEFT departments(users.departmentId). Every predicate includes org_id = s.orgId.
    - ackState = CASE current_ack.id NOT NULL -> 'current'; prior_ack.id NOT NULL -> 'stale'; ELSE 'none'. acknowledgedAt/ipAddress from current_ack (null for none/stale).
    - DEDUPE to one row per (userId, policyId): a user assigned both directly AND via department yields ONE row. Use selectDistinct on a column set that does NOT include a per-assignment-varying field, OR aggregate assignedAt as MIN(assignedAt) (earliest obligation) grouped by the (user,policy,version,ack) tuple. (Planner discretion; the integration test asserts exactly one row for a dual-assigned user.)
    - Optional filters AND-combined: policyId -> eq(policies.id,…); departmentId -> eq(users.departmentId,…). ORDER BY users.id, policies.id.
    - Returns ReportRow: { clerkUserId, departmentName: string|null, policyId, policyTitle, policyVersion: number, ackState, acknowledgedAt: Date|null, ipAddress: string|null, assignedAt: Date }. (Identity name/email added later by enrich.ts — NOT here.)
  </behavior>
  <action>
    Create `lib/db/repositories/reports.ts`: `import 'server-only'`; import drizzle helpers (`and, eq, or, sql`, `alias`), `OrgScope`, and the schema tables. Implement `export const Reports = { listAckComplianceForOrg }` mirroring `reminders.ts` JOIN + `policies.ts` ackState. Reads via `s.tx` only — NEVER import `@/lib/db` raw. Export the `ReportRow` type (re-used by enrich.ts/route). No `any`. DB-truth correctness is proven by the Task 4 integration gate; this task's vitest coverage is the type/shape contract exercised through the route test mock.
  </action>
  <verify><automated>pnpm tsc --noEmit</automated></verify>
  <acceptance_criteria>
    - SOURCE: `reports.ts` exports `Reports.listAckComplianceForOrg`; no `@/lib/db` raw import (passes `check:db-imports`); every query predicate has `org_id`.
    - SOURCE: dedupes to one row per (user,policy); ackState CASE present; filters optional + AND-combined.
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`. (Behavioral proof: Task 4 `check:reports`.)
  </acceptance_criteria>
  <done>The read-only org-scoped ack-compliance query exists, dedup-correct, no schema change.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Route handler + route unit test (app/api/reports/acknowledgments/route.ts) — TDD</name>
  <read_first>
    - app/api/ai/consistency/route.ts:59-145 (auth-outside-try, withOrgScope-inside, NextResponse.json, masked error discrimination) + its route.test.ts (mock getOrgContext shape)
    - 08-RESEARCH.md §2 (plain Response CSV + export const dynamic='force-dynamic') + 08-CONTEXT.md D-07..D-11
  </read_first>
  <behavior>
    - `export const dynamic = 'force-dynamic'`. `export async function GET(req: Request): Promise<Response>`.
    - OUTSIDE try: `const ctx = await getOrgContext();` (unauth -> 401 via Next error boundary) `requireAdminFromCtx(ctx);` (non-admin -> 403 {error:'forbidden'}).
    - Param parse: zod safeParse over `new URL(req.url).searchParams` -> on failure `NextResponse.json({error:'invalid_request'},{status:400})`.
    - INSIDE try: `const rows = await withOrgScope(ctx, (s) => Reports.listAckComplianceForOrg(s, filters)); const enriched = await enrichWithClerkIdentity(rows);` then branch on format.
    - format=json (default): `NextResponse.json({ rows: enriched, summary: { total, acknowledged, pending } }, { status: 200 })` where acknowledged = count(ackState==='current'), pending = count(ackState∈{none,stale}), total = rows.length.
    - format=csv: build header row + map enriched rows to string cells (ackState -> human label per D-04) -> `toCsv(...)` -> `new Response(csv, { status:200, headers:{ 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="acknowledgments-${ctx.orgId}-${new Date().toISOString().slice(0,10)}.csv"` }})`.
    - catch: 503 `NextResponse.json({error:'service_unavailable'},{status:503})` + masked structured `console.error({ orgId: ctx.orgId, error:{name,message:msg.slice(0,120)} })` (D-36). No `any`.
  </behavior>
  <action>
    Write `app/api/reports/acknowledgments/route.test.ts` FIRST (RED): mock `@/lib/auth/context` (getOrgContext), `@/lib/auth/require-admin`, `@/lib/db/scoped` (withOrgScope -> fixture rows), `@/lib/reports/enrich` (enrichWithClerkIdentity -> identity-mapped fixture). Cases: unauth -> 401; employee ctx -> 403 {error:'forbidden'}; admin + no format -> 200 JSON with rows+summary (assert count math, incl. a `stale` row counted as pending); admin + format=csv -> 200, Content-Type text/csv; charset=utf-8, Content-Disposition attachment filename matches `acknowledgments-<orgId>-<date>.csv`, body starts with the header row; format=xml -> 400 {error:'invalid_request'}; policyId=not-a-uuid -> 400; downstream throw -> 503 {error:'service_unavailable'}.
    Then create the route. Import order per CONVENTIONS.md. No `any`.
  </action>
  <verify><automated>pnpm vitest run app/api/reports/acknowledgments/route.test.ts</automated></verify>
  <acceptance_criteria>
    - SOURCE: route gates auth OUTSIDE try; zod param validation -> 400; withOrgScope+enrich+serialize INSIDE try; `export const dynamic='force-dynamic'`.
    - TEST: `pnpm vitest run app/api/reports/acknowledgments/route.test.ts` GREEN (401/403/400/200-json/200-csv/503).
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The admin-only content-negotiating route exists and all status/branch cases are GREEN.</done>
</task>

<task type="auto">
  <name>Task 5: TEST-DB integration gate (scripts/check-reports.ts)</name>
  <read_first>
    - scripts/check-rls.ts:72-226 (BYPASSRLS seed + SET LOCAL ROLE authenticated + set_config jwt claims + positive control + negative isolation + ROLLBACK + TRUNCATE)
    - scripts/check-employee-portal.ts (ack-state seeding pattern); package.json check:rls / check:crons-email script wiring
  </read_first>
  <behavior>
    - Seeds (BYPASSRLS) Org A + Org B with OVERLAPPING policy titles; for Org A: a user-direct assignment, a department assignment (user via departmentId), a published policy with a current ack (=> 'current'), one with a prior-version ack (=> 'stale'), one unacked (=> 'none'), and a DRAFT policy (must be EXCLUDED). Then opens an authenticated tx with Org A's jwt claims and runs the Reports query.
    - Asserts: (positive) Org A query returns the expected (user,policy,ackState) rows incl. the dept-fanned user and exactly ONE row for a dual-assigned user; the draft policy is absent. (negative/isolation) zero Org B rows appear; running with a `policyId` = an Org B policy id under Org A's claims returns zero rows. ROLLBACK; final TRUNCATE cleanup. Exit 0 on pass, 1 on any assertion fail (Clerk enrichment is NOT exercised here — DB truth only).
  </behavior>
  <action>
    Create `scripts/check-reports.ts` mirroring `check-rls.ts`/`check-employee-portal.ts` structure (raw postgres-js via the allow-listed test path, `DATABASE_URL_TEST`). Reuse the seed helpers' style. Import `Reports.listAckComplianceForOrg` and drive it inside the authenticated tx. No `any`.
  </action>
  <verify><automated>pnpm check:reports</automated></verify>
  <acceptance_criteria>
    - TEST: `pnpm check:reports` exits 0 against the live TEST DB (resume it first); proves ack-state derivation + dept fan-out + draft-exclusion + dedup + two-org isolation + cross-org-filter-zero.
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The TEST-DB integration gate proves R8-2 + R8-3 against the real database.</done>
</task>

<task type="auto">
  <name>Task 6: verify:phase-8 + check:reports + check-artifacts + verify-phase-8.yml</name>
  <read_first>
    - package.json:55 (verify:phase-7) + :51-54 (verify ladder); scripts/check-artifacts.ts (artifact-existence assertions pattern); .github/workflows/verify-phase-7.yml (full) + verify-phase-6.yml:3-10 (TRUNCATE-deadlock concurrency guard)
  </read_first>
  <behavior>
    - package.json: add `"check:reports": "tsx scripts/check-reports.ts"` (match the existing check:* runner, e.g. tsx/ts-node as used by check:crons-email) and `"verify:phase-8": "pnpm tsc --noEmit && pnpm verify:phase-7 && pnpm check:reports && pnpm run test -- --run app/api/reports && pnpm run test -- --run lib/reports && pnpm db:verify && pnpm check:artifacts"`. NEVER weaker than verify:phase-7 (runs it in full first).
    - check-artifacts.ts: extend with greppable assertions that `app/api/reports/acknowledgments/route.ts`, `lib/db/repositories/reports.ts`, `lib/reports/csv.ts`, `lib/reports/enrich.ts`, and the three test files exist + contain their anchor strings (toCsv / getUserList / listAckComplianceForOrg / requireAdminFromCtx).
    - verify-phase-8.yml: mirror verify-phase-7.yml exactly (name "Verify Phase 8"; on pull_request + push branches main + workflow_dispatch; concurrency group; 45-min timeout; same env/secret placeholders; run `pnpm verify:phase-8`).
  </behavior>
  <action>
    Edit `package.json` (add the two scripts). Extend `scripts/check-artifacts.ts`. Create `.github/workflows/verify-phase-8.yml` by mirroring `verify-phase-7.yml`. Confirm the exact `check:*` runner used by the repo (match check:crons-email).
  </action>
  <verify><automated>pnpm verify:phase-8</automated></verify>
  <acceptance_criteria>
    - CLI: `pnpm verify:phase-8` runs `verify:phase-7` in full + the new checks and exits 0 (BOTH Supabase projects resumed).
    - SOURCE: `verify-phase-8.yml` mirrors `verify-phase-7.yml` (concurrency, 45-min, push:main + PR + workflow_dispatch).
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The cumulative gate + CI workflow exist; `verify:phase-8` is green locally.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client (admin browser) → report API | Authenticated Clerk request; org + role come from the verified Clerk session via `getOrgContext()`, never from the request body/params. |
| application → Postgres (RLS) | All report reads run inside `withOrgScope` (SET LOCAL ROLE authenticated + jwt claims); RLS `org_isolation` is the last line. |
| application → Clerk Backend API | Server-only identity enrichment; the only user IDs sent are those the RLS-scoped query already returned. |
| report data → CSV file opened in a spreadsheet | Admin-authored policy titles + Clerk-sourced name/email/department are untrusted text that flows into a CSV a spreadsheet may interpret. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-8-01 | Information Disclosure | report query (cross-org leak) | mitigate | `withOrgScope` + RLS; every predicate `org_id = s.orgId`; route never imports raw `db` (passes `check:db-imports`). `check:reports` asserts Org A export = 0 Org B rows AND Org B `policyId` filter under Org A = 0 rows. **(Primary.)** |
| T-8-02 | Elevation of Privilege | endpoint authorization | mitigate | `requireAdminFromCtx(ctx)` OUTSIDE the try → 403 `{error:'forbidden'}`; `getOrgContext()` → 401 unauth. Route unit test covers employee→403, unauth→401. |
| T-8-03 | Information Disclosure | Clerk enrichment scope | mitigate | D-06: the `userId` array passed to `getUserList` is derived SOLELY from RLS-filtered result rows — no param/header reaches Clerk. Enrich unit test asserts the exact id-set; never an external value. |
| T-8-04 | Tampering | CSV / formula injection | mitigate | Hand-rolled serializer prefixes `'` on leading `= + - @` TAB CR + RFC-4180 quoting; applied to all string cells. Serializer unit test covers `=cmd`→`'=cmd`. |
| T-8-05 | Information Disclosure | error/503 logging | mitigate | Masked structured `console.error({orgId, error:{name,message:slice(0,120)}})` (D-36); no email, secret, or full PII in logs. |
| T-8-06 | Tampering | SQL injection via filters | mitigate | `policyId`/`departmentId` zod `uuid()`-validated → 400; Drizzle parameterizes — never string-interpolated into SQL. |
| T-8-07 | Spoofing | middleware bypass | verify | `/api/reports/*` is NOT in the middleware Clerk-bypass list (only `/api/cron/*` + `/api/webhooks/*` bypass). Confirm the matcher; regardless, the route self-enforces via `getOrgContext`+`requireAdminFromCtx`. |
| T-8-08 | Denial of Service | unbounded report / Clerk fan-out | accept | Single-org report scale; Clerk batched ≤100/call; string CSV body fine at MVP. Pagination/streaming deferred (08-CONTEXT.md Deferred). Re-flag if a single org's report grows unbounded. |
| T-8-SC | Tampering (supply chain) | dependencies | mitigate | NO new runtime package — CSV hand-rolled; `@clerk/nextjs` already vetted/in-stack. Honors the no-new-deps guardrail + the ≥14-day rule (n/a — no install). |
</threat_model>

<risk_register_note>
## R-007 (beat-manual benchmark) — accepted-risk note (per Risk Register Escalation Rule, score 15)

R-007 ("product must be demonstrably faster + more reliable than a Google Drive folder") is **Open, score 15 ≥ the escalation threshold**, so this plan must carry an active-mitigation or accepted-risk note. **Disposition for this slice: partial-enabler + accepted-risk-deferred.** The CSV ack-export materially advances the *audit-trail reliability* half of R-007 (one-click, per-user, timestamped, IP-stamped, append-only-sourced compliance export — something a Google Drive folder cannot produce), and the Clerk-enriched identity columns make it human-auditable. The *full* beat-manual side-by-side benchmark (ROADMAP SC#5: same admin / 3 policies / 10 employees, head-to-head timing + reliability note) is **explicitly DEFERRED** out of the CSV-first slice (operator-authorized 2026-06-15) to the validation evidence-capture leg. No code in this plan closes R-007; it is carried forward, not silently dropped. (Consultant risk_register to reflect: R-007 remains Open; this slice is a partial mitigation; benchmark deferred.)
</risk_register_note>

<verification>
- `pnpm verify:phase-8` exits 0 (runs `verify:phase-7` in full + `check:reports` + reports tests + `db:verify` + `check:artifacts`); BOTH Supabase projects resumed first.
- `pnpm tsc --noEmit` exits 0; no `any` anywhere; `check:db-imports` passes (route uses `withOrgScope`, not raw `db`).
- `pnpm check:reports` proves two-org isolation + ack-state derivation + dept fan-out + draft-exclusion + dedup + cross-org-filter-zero against the live TEST DB.
- No schema/migration change (drizzle journal index stays 0014); no new runtime package added.
- CI: `verify-phase-8.yml` present + mirrors `verify-phase-7.yml`. On the PR, a RED standalone `Verify Phase 6` = the documented TRUNCATE-deadlock flake → re-run (merge signal = umbrella `Verify` + nested `Verify Phase 7` + new `Verify Phase 8`).
</verification>

<success_criteria>
- `GET /api/reports/acknowledgments?format=json|csv` is admin-only, org-scoped, returns JSON (rows+summary) or a downloadable RFC-4180 CSV (acceptance criterion #5).
- Per-employee ack status (none/current/stale) derived from the live schema with department fan-out; Clerk-enriched name+email; no schema change, no new package.
- `verify:phase-8` (cumulative, never weaker) + `verify-phase-8.yml` green; cross-org isolation proven by `check:reports`.
- DEFERRED items (donut, aggregates, seed harness, Stripe test-clock, beat-manual) remain out of scope; R-007 carried as an accepted-risk note.
</success_criteria>

<output>
Create `.planning/phases/08-validation/08-SUMMARY.md` when done (per-task commits, files touched, verify:phase-8 result, any deviations).
</output>
