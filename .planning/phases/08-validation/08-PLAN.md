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
  - scripts/check-reports.test.ts
  - scripts/check-reports.vitest.config.ts
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
    - "GET /api/reports/acknowledgments runs getOrgContext() then requireAdminFromCtx(ctx) INSIDE an in-route try whose catch maps typed errors to status codes (Route Handlers have no error boundary — an uncaught throw is HTTP 500): ForbiddenError -> 403 {error:'forbidden'} (checked first, it extends BootstrapError), unauth BootstrapError (NotAuthenticatedError/NoActiveOrganizationError) -> 401, else -> 503; admin -> 200"
    - "zod safeParse over searchParams { format: enum(json|csv).default(json), policyId: uuid().optional, departmentId: uuid().optional }; parse failure -> 400 {error:'invalid_request'} (format=xml and malformed uuid both 400)"
    # R8-2 org-scoped read-only query
    - "Reports.listAckComplianceForOrg(s, filters) runs entirely inside withOrgScope; every predicate carries org_id = s.orgId; route never imports raw db (no check-db-imports allow-list change); acknowledgments is READ-only (ADR-018)"
    - "one row per (employee, assigned PUBLISHED policy); ackState in {none,current,stale} via current_ack/prior_ack aliases (05 D-01); department assignments fan out to member users (07 D-09); draft/archived policies excluded; deduped to one row per (user,policy)"
    # R8-3 cross-org isolation
    - "RLS is the isolation backstop; a two-org TEST-DB integration test proves Org A export returns zero Org B rows AND Org B policyId filter under Org A returns zero rows"
    # R8-4 Clerk enrichment
    - "name+email resolved from Clerk via await clerkClient(); users.getUserList({ userId: chunk<=100, limit:100 }); chunked at 100; { data } destructured; primaryEmailAddress?.emailAddress; missing id -> {name:'',email:''} fallback, row never dropped; userId list = result-set clerkUserIds ONLY (D-06)"
    # R8-5 CSV safety
    - "hand-rolled RFC-4180 serializer (no new package): toCsv prepends a UTF-8 BOM (U+FEFF) once; quote fields with , \" CR LF; double internal quotes; CRLF terminators; UTF-8; csvField coerces null/undefined->'' and number->String() first; formula-injection guard prefixes ' when the first NON-WHITESPACE char is = + - @ TAB CR (leading space/tab does not bypass)"
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
    - path: "scripts/check-reports.test.ts"
      provides: "TEST-DB integration gate (cross-org RLS + ack-state) — vitest, mirrors scripts/check-employee-portal.test.ts"
      contains: "listAckComplianceForOrg"
    - path: "scripts/check-reports.vitest.config.ts"
      provides: "dedicated vitest config (include ['scripts/check-reports.test.ts'], node env, env-forward, forks/singleFork) — mirrors scripts/check-employee-portal.vitest.config.ts"
      contains: "check-reports.test.ts"
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
      to: "scripts/check-reports.test.ts"
      via: "check:reports = tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-reports.test.ts --config scripts/check-reports.vitest.config.ts (in verify:phase-8 chain)"
      pattern: "check:reports"
---

<objective>
Build the **acceptance-criterion-#5 CSV slice**: an admin-only, org-scoped `GET /api/reports/acknowledgments?format=json|csv` that derives each `(employee, assigned published policy)` pair's ack status from the live schema (no migration), enriches employee identity (name+email) from Clerk, and returns JSON (with summary counts) or a downloadable RFC-4180 CSV — gated by a new cumulative `verify:phase-8` + `verify-phase-8.yml`.

Purpose: REQ-compliance-dashboard / acceptance criterion #5 ("Admin exports acknowledgment report to CSV"). DEFERRED (NOT in this plan): the Recharts donut, aggregate widgets, populated-org seed harness, Stripe test-clock run (AC#6), and the beat-manual benchmark (SC#5) — see `08-SPEC.md` Boundaries.

Output: `lib/reports/{csv,enrich}.ts` + tests, `lib/db/repositories/reports.ts`, `app/api/reports/acknowledgments/route.ts` + test, `scripts/check-reports.test.ts` + `scripts/check-reports.vitest.config.ts`, `check-artifacts.ts` + `package.json` + `verify-phase-8.yml` wiring. **No schema/migration change (index stays 0014). No new runtime package.**
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
@scripts/check-employee-portal.test.ts
@scripts/check-employee-portal.vitest.config.ts
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
    - toCsv(headers: string[], rows: (string | number | null)[][]): string produces an RFC-4180 document PREFIXED with a UTF-8 BOM (U+FEFF) so Excel-on-Windows renders non-ASCII policy titles / employee names / emails correctly; then the header row first, CRLF (\r\n) record terminators, UTF-8. The BOM is prepended ONCE by toCsv (NOT by the route).
    - csvField(value: string | number | null | undefined): string. COERCE FIRST: null/undefined -> '', number -> String(value) (so the serializer never throws on .charCodeAt/index and never emits the literal 'null'/'undefined'); then operate on the resulting string. A field containing , " CR or LF is wrapped in double quotes with every internal " doubled.
    - Formula-injection guard: fires when the FIRST NON-WHITESPACE character is = + - @ TAB(\t) or CR(\r) (a leading space/tab before the trigger does NOT bypass it — a spreadsheet trims leading whitespace before formula evaluation). When triggered, prefix a single quote (') at the START of the field (before any leading whitespace) BEFORE quoting. Applied to ALL cells (after coercion).
  </behavior>
  <action>
    Write `lib/reports/csv.test.ts` FIRST (RED): assert (a) a field `He said "hi", bye` round-trips to `"He said ""hi"", bye"`; (b) a field with an embedded `\n` stays inside one quoted field; (c) `=cmd` -> `'=cmd`, and `+`,`-`,`@`,leading-TAB likewise prefixed; (d) the header row is emitted verbatim and joined by CRLF; (e) a plain field with no special chars is emitted unquoted; (f) GUARD-THEN-QUOTE COMBINATION (T-8-04 primary vector): `csvField('=a,b')` === `"'=a,b"` (guard prepends `'` FIRST -> `'=a,b`, then the comma forces RFC-4180 quoting -> wrapped in double quotes; assert this EXACT string), and `csvField('=a"b')` === `"'=a""b"` (guard prepends `'`, the `"` forces quoting AND is doubled); (g) LEADING-WHITESPACE BYPASS (CSV-2): `csvField(' =cmd')` -> `' =cmd` (single `'` prepended because the first NON-whitespace char is a trigger) and `csvField('\t=cmd')` -> `'\t=cmd`; (h) NON-STRING COERCION (CSV-3): `csvField(null)` === `''`, `csvField(3)` === `'3'` (number stringified, never the literal `'null'`); (i) BOM (CSV-4): `toCsv(['A'],[['x']])` starts with the UTF-8 BOM and `toCsv(...).charCodeAt(0) === 0xFEFF`.
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
    - JOIN: users INNER policy_assignments[(assigneeType='user' AND assigneeId=users.id) OR (assigneeType='department' AND assigneeId=users.departmentId)] INNER policies(orgId=s.orgId, id=pa.policyId, status='published') INNER policy_versions(orgId=s.orgId, policyId=policies.id, versionNumber=policies.currentVersion) LEFT current_ack(orgId,userId,policyId,policyVersionId=current) LEFT prior_ack(orgId,userId,policyId,policyVersionId<>current) LEFT departments ON and(eq(departments.orgId, s.orgId), eq(departments.id, users.departmentId)). Every predicate includes org_id = s.orgId — including the departments join (do NOT join on users.departmentId alone).
    - ackState = CASE current_ack.id NOT NULL -> 'current'; prior_ack.id NOT NULL -> 'stale'; ELSE 'none'. acknowledgedAt/ipAddress from current_ack (null for none/stale).
    - DEDUPE to one row per (userId, policyId): a user assigned both directly AND via department yields ONE row. assignedAt is per-assignment-varying (the two policy_assignments rows — assigneeType='user' and ='department' — carry independent defaultNow() timestamps), so it MUST NOT sit in a naive selectDistinct projection or the dual-assigned user splits into 2 rows. CONCRETE APPROACH (grounded in reminders.ts:87-99 / policies.ts:144-157, which keep assignedAt OUT of the distinct set and reference it only in WHERE): GROUP BY the stable tuple (users.id, policies.id, policies.currentVersion, current_ack.id, prior_ack.id, users.departmentId, clerkUserId, policyTitle) and project assignedAt as MIN(policyAssignments.assignedAt) (earliest obligation). The integration test (Task 5) asserts exactly one row for a dual-assigned user.
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
    - app/api/ai/consistency/route.ts:59-145 (reference for withOrgScope-inside + NextResponse.json + masked error discrimination ONLY — do NOT copy its auth-outside-try shape: that uncaught throw would 500, Route Handlers have no error boundary. Phase 8 puts getOrgContext()+requireAdminFromCtx() INSIDE the try and maps errors in the catch) + its route.test.ts (mock getOrgContext shape)
    - 08-RESEARCH.md §2 (plain Response CSV + export const dynamic='force-dynamic') + 08-CONTEXT.md D-07..D-11
  </read_first>
  <behavior>
    - `export const dynamic = 'force-dynamic'`. `export async function GET(req: Request): Promise<Response>`.
    - INSIDE try (Route Handlers have NO error boundary — an uncaught throw = HTTP 500): `const ctx = await getOrgContext(); requireAdminFromCtx(ctx);` then the `catch` discriminates `if (err instanceof ForbiddenError) -> 403 {error:'forbidden'}` (FIRST — ForbiddenError extends BootstrapError), `else if (err instanceof BootstrapError) -> 401` (unauth: NotAuthenticatedError/NoActiveOrganizationError), `else if (err instanceof ZodError) -> 400 {error:'invalid_request'}`, else -> 503. Import `ForbiddenError` + `BootstrapError` from `@/lib/auth/errors`.
    - Param parse: zod safeParse over `new URL(req.url).searchParams` -> on failure `NextResponse.json({error:'invalid_request'},{status:400})`.
    - INSIDE try: `const rows = await withOrgScope(ctx, (s) => Reports.listAckComplianceForOrg(s, filters)); const enriched = await enrichWithClerkIdentity(rows);` then branch on format.
    - format=json (default): `NextResponse.json({ rows: enriched, summary: { total, acknowledged, pending } }, { status: 200 })` where acknowledged = count(ackState==='current'), pending = count(ackState∈{none,stale}), total = rows.length.
    - format=csv: build the header row + map enriched rows to cells (ackState -> human label per D-04; `acknowledgedAt: Date|null` -> `acknowledgedAt?.toISOString() ?? ''`; `ipAddress: string|null` -> `ipAddress ?? ''`; `policyVersion: number` passed through — `csvField` coerces number->String() and any residual null/undefined->'' so no cell is ever the literal 'null') -> `toCsv(...)` (which prepends the UTF-8 BOM) -> `new Response(csv, { status:200, headers:{ 'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="acknowledgments-${ctx.orgId}-${new Date().toISOString().slice(0,10)}.csv"` }})`.
    - catch (err): FIRST `if (err instanceof ForbiddenError)` -> 403 `NextResponse.json({error:'forbidden'},{status:403})`; `else if (err instanceof BootstrapError)` -> 401 `NextResponse.json({error:'unauthorized'},{status:401})` (unauth: NotAuthenticatedError/NoActiveOrganizationError); `else if (err instanceof ZodError)` -> 400 `NextResponse.json({error:'invalid_request'},{status:400})`; else -> 503 `NextResponse.json({error:'service_unavailable'},{status:503})` + masked structured `console.error({ orgId: ctx?.orgId, error:{name,message:msg.slice(0,120)} })` (D-36). `ForbiddenError`/`BootstrapError` imported from `@/lib/auth/errors`; `ctx` declared with `let` before the try so the 503 log can reference `ctx?.orgId`. No `any`.
  </behavior>
  <action>
    Write `app/api/reports/acknowledgments/route.test.ts` FIRST (RED): mock `@/lib/auth/context` (getOrgContext), `@/lib/auth/require-admin` (use the REAL requireAdminFromCtx so it actually throws ForbiddenError, OR mock it to throw — do NOT stub it to a no-op), `@/lib/db/scoped` (withOrgScope -> fixture rows), `@/lib/reports/enrich` (enrichWithClerkIdentity -> identity-mapped fixture). Every case calls `const res = await GET(req)` and asserts `res.status` + `await res.json()` — NEVER `rejects.toThrow` (the route catches internally and returns a Response; it must not throw). Cases: (unauth) getOrgContext mock REJECTS with `new NotAuthenticatedError()` -> assert `res.status===401`; (non-admin) getOrgContext resolves an employee ctx so the real requireAdminFromCtx throws ForbiddenError -> assert `res.status===403` AND `(await res.json()).error==='forbidden'`; (admin + no format) -> 200 JSON with rows+summary (assert count math, incl. a `stale` row counted as pending); (admin + format=csv) -> 200, Content-Type `text/csv; charset=utf-8`, Content-Disposition attachment filename matches `acknowledgments-<orgId>-<date>.csv`, body's first character is the UTF-8 BOM (charCodeAt(0)===0xFEFF) and the header row follows immediately after the BOM, and a fixture row whose policyTitle is `=SUM(A1)` and whose acknowledgedAt is null serializes to a guarded+quoted cell `"'=SUM(A1)"` and an empty cell (never the text `null`); (format=xml) -> 400 {error:'invalid_request'}; (policyId=not-a-uuid) -> 400; (downstream throw, e.g. withOrgScope rejects with a generic Error) -> 503 {error:'service_unavailable'}. Import `NotAuthenticatedError` from `@/lib/auth/errors` in the test for the unauth case.
    Then create the route. Import order per CONVENTIONS.md. No `any`.
  </action>
  <verify><automated>pnpm vitest run app/api/reports/acknowledgments/route.test.ts</automated></verify>
  <acceptance_criteria>
    - SOURCE: route runs getOrgContext()+requireAdminFromCtx() and zod param validation INSIDE a single in-route try whose catch maps typed errors to status (ForbiddenError->403 first, unauth BootstrapError->401, ZodError->400, else->503; Route Handlers have no error boundary); withOrgScope+enrich+serialize also INSIDE the try; `export const dynamic='force-dynamic'`.
    - TEST: `pnpm vitest run app/api/reports/acknowledgments/route.test.ts` GREEN (401/403/400/200-json/200-csv/503).
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The admin-only content-negotiating route exists and all status/branch cases are GREEN.</done>
</task>

<task type="auto">
  <name>Task 5: TEST-DB integration gate (scripts/check-reports.test.ts + scripts/check-reports.vitest.config.ts)</name>
  <read_first>
    - scripts/check-employee-portal.test.ts (the REAL vitest gate to mirror): BYPASSRLS postgres-js seed (sql = postgres(TEST_URL,...)) inside sql.begin + truncateTenantTables; mocked withOrgScope binds the outer tx; drives REAL repository fns (e.g. Policies.listAssignedAndPublishedForUser via withOrgScope); the AC-10 cross-org block asserts under REAL RLS via SET LOCAL ROLE authenticated + set_config('request.jwt.claims',...,true) with a POSITIVE control + an RLS-firing zero-rows NEGATIVE; intentional __INTENTIONAL_ROLLBACK__ cleanup; hard-fails (NOT skips) on missing TEST_DATABASE_URL/DATABASE_URL_TEST
    - scripts/check-employee-portal.vitest.config.ts (the config to mirror): include ['scripts/check-employee-portal.test.ts'], environment 'node', env-forward block, pool 'forks'/singleFork, server-only alias, testTimeout 30000
    - scripts/check-rls.ts:4-14,158-214 (WHY ONLY: a bare postgres connection is BYPASSRLS; RLS only fires after SET LOCAL ROLE authenticated inside the assertion tx — reference for the seed-vs-assert split rationale, NOT as the runner pattern; it asserts via raw tx.unsafe SQL, never drives a repository function)
    - package.json:43-45 (check:ai-layer / check:employee-portal / check:crons-email = the vitest+config+--env-file runner form to copy); package.json:34 (check:rls = the OLD bare-tsx form — do NOT copy)
  </read_first>
  <behavior>
    - Seeds (BYPASSRLS postgres-js, inside sql.begin) Org A + Org B with OVERLAPPING policy titles; for Org A: a user-direct assignment, a department assignment (user via departmentId), a published policy with a current ack (=> 'current'), one with a prior-version ack (=> 'stale'), one unacked (=> 'none'), and a DRAFT policy (must be EXCLUDED). Then, inside the SAME outer rollback tx, switches to real RLS — `await tx`SET LOCAL ROLE authenticated`` + `await tx`SELECT set_config('request.jwt.claims', <Org-A claims JSON: {sub:userA, org_id:orgA, role}>, true)`` (mirrors check-employee-portal.test.ts) — and drives the REAL Reports.listAckComplianceForOrg through withOrgScope (vi.mocked to bind this outer tx). The query MUST run under the authenticated role (NOT the BYPASSRLS seed connection) so RLS actually fires.
    - Asserts under the authenticated Org-A session: (POSITIVE CONTROL — required) Org A query returns the expected (user,policy,ackState) rows incl. the dept-fanned user and EXACTLY ONE row for a dual-assigned user, and the draft policy is absent — a non-empty positive result disambiguates 'RLS working' from 'GRANT missing'. (NEGATIVE / RLS-FIRING) zero Org B rows appear, and running with a `policyId` = an Org B policy id under Org A's claims returns zero rows (RLS strips them). Cleanup via the intentional __INTENTIONAL_ROLLBACK__ throw; the seed connection is BYPASSRLS so it is wiped by rollback/TRUNCATE. Vitest `expect`/`it` provide pass/fail (no manual process.exit); Clerk enrichment is NOT exercised here — DB truth only.
  </behavior>
  <action>
    Create `scripts/check-reports.test.ts` (vitest) + `scripts/check-reports.vitest.config.ts`, mirroring `scripts/check-employee-portal.test.ts` + `scripts/check-employee-portal.vitest.config.ts`. Use a BYPASSRLS postgres-js connection (`postgres(TEST_URL,...)`) to TRUNCATE+seed inside `sql.begin`; `vi.mock('@/lib/db/scoped', ...)` so `withOrgScope` binds the outer rollback `tx`; import the REAL `Reports.listAckComplianceForOrg` and drive it AFTER `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims',...,true)` so RLS fires. The config: `include: ['scripts/check-reports.test.ts']`, `environment: 'node'`, env-forward block (TEST_DATABASE_URL/DATABASE_URL_TEST/DIRECT_URL_TEST), `pool: 'forks'`/`singleFork`, `server-only` alias, `testTimeout: 30_000`. Hard-fail on missing TEST_DATABASE_URL/DATABASE_URL_TEST (do NOT skip). No `any`.
  </action>
  <verify><automated>pnpm check:reports  # = tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-reports.test.ts --config scripts/check-reports.vitest.config.ts</automated></verify>
  <acceptance_criteria>
    - TEST: `pnpm check:reports` exits 0 against the live TEST DB (resume it first); proves ack-state derivation + dept fan-out + draft-exclusion + dedup + two-org isolation + cross-org-filter-zero.
    - CLI: `pnpm tsc --noEmit` exits 0; no `any`.
  </acceptance_criteria>
  <done>The TEST-DB integration gate proves R8-2 + R8-3 against the real database.</done>
</task>

<task type="auto">
  <name>Task 6: verify:phase-8 + check:reports + check-artifacts + verify-phase-8.yml</name>
  <read_first>
    - package.json:43-45 (check:ai-layer/check:employee-portal/check:crons-email = the `tsx --env-file=.env.local node_modules/vitest/vitest.mjs run <file> --config <file>.vitest.config.ts` runner form check:reports MUST copy) + :55 (verify:phase-7) + :51-54 (verify ladder); scripts/check-artifacts.ts (artifact-existence assertions — main() builds a hand-coded `const all: Check[]` array literal at :2831-2869 with NO auto-discovery; the new Phase-8 checks MUST be hand-spread into it per VG-2) + .github/workflows/verify-phase-7.yml (full) + verify-phase-6.yml:3-10 (TRUNCATE-deadlock concurrency guard)
  </read_first>
  <behavior>
    - package.json: add `"check:reports": "tsx --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/check-reports.test.ts --config scripts/check-reports.vitest.config.ts"` (EXACT vitest-runner form used by check:employee-portal / check:crons-email at package.json:44-45 — NOT bare `tsx`; MUST pass `--env-file=.env.local` so DATABASE_URL_TEST is set; the gate hard-fails on missing env, never skips) and `"verify:phase-8": "pnpm tsc --noEmit && pnpm verify:phase-7 && pnpm check:reports && pnpm run test -- --run app/api/reports && pnpm run test -- --run lib/reports && pnpm db:verify && pnpm check:artifacts"` (the verify:phase-8 CHAIN is UNCHANGED — the VG-3 fix lives entirely in the check:reports definition; the chain stays structurally consistent with verify:phase-6/7 and never-weaker, running verify:phase-7 in full first).
    - check-artifacts.ts: add a NEW `checkPhase8ReportsVerifier(): Check[]` function (mirroring `checkPhase7CronsEmailVerifier`, reusing the in-file `exists()`/`read()`/`assert()` helpers) with greppable assertions that `app/api/reports/acknowledgments/route.ts`, `lib/db/repositories/reports.ts`, `lib/reports/csv.ts`, `lib/reports/enrich.ts`, and the three test files exist + contain their anchor strings (toCsv / getUserList / listAckComplianceForOrg / requireAdminFromCtx). CRITICAL — there is NO auto-discovery in check-artifacts.ts: main() builds a single hard-coded array literal `const all: Check[] = [...]` (scripts/check-artifacts.ts:2831-2869) into which every phase's checks are manually spread. The new function SILENTLY NEVER RUNS unless its spread `...checkPhase8ReportsVerifier(),` is appended INTO that `all` array literal immediately after `...checkPhase7CronsEmailVerifier(),` (:2868), before the closing `];` (:2869), with a `// Phase 8 (Validation/Reports) additions:` comment. Verify after wiring: run `pnpm check:artifacts` and confirm the total assertion count rose and the new labels print.
    - verify-phase-8.yml: copy `.github/workflows/verify-phase-7.yml` verbatim and change ONLY four tokens: (1) `name: Verify Phase 8`; (2) `concurrency.group: verify-phase-8-${{ github.ref }}` (keep `cancel-in-progress: true`); (3) the job id `phase-8-verification` + `name: Phase 8 verifier`; (4) the final step `name: Run Phase 8 verifier` / `run: pnpm verify:phase-8`. Preserve EXACTLY: `on:` = `pull_request:` + `push: branches: [main]` + `workflow_dispatch:` (push must stay main-only — the documented TRUNCATE-deadlock guard from verify-phase-6.yml:6-9); `timeout-minutes: 45`; `permissions: contents: read`; the full ~24-key `env:` secrets block; the four setup steps with their PINNED action SHAs (checkout, pnpm/action-setup version 9.15.9, setup-node node 22 cache pnpm); `pnpm install --frozen-lockfile`; and the entire "Write verification environment" bash step that validates `required=(...)` secrets, fails with `::error::` on any missing, and writes BOTH `.env.local` and `.env.local.test` INCLUDING `DATABASE_URL_TEST`/`DIRECT_URL_TEST` — this is what supplies DATABASE_URL_TEST to check:reports in CI.
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
| T-8-02 | Elevation of Privilege | endpoint authorization | mitigate | `requireAdminFromCtx(ctx)` runs INSIDE the in-route try; the catch maps `ForbiddenError` → 403 `{error:'forbidden'}` (checked FIRST) and the unauth `BootstrapError` set (from `getOrgContext()`) → 401 (Route Handlers have no error boundary, so the route maps these itself). Route unit test asserts `res.status` employee→403, unauth→401 (never `rejects.toThrow`). |
| T-8-03 | Information Disclosure | Clerk enrichment scope | mitigate | D-06: the `userId` array passed to `getUserList` is derived SOLELY from RLS-filtered result rows — no param/header reaches Clerk. Enrich unit test asserts the exact id-set; never an external value. |
| T-8-04 | Tampering | CSV / formula injection | mitigate | Hand-rolled serializer prefixes `'` when the FIRST NON-WHITESPACE char is `= + - @` TAB CR (leading space/tab does not bypass) + RFC-4180 quoting; applied to ALL cells after `null`→`''`/`number`→`String()` coercion; `toCsv` prepends a UTF-8 BOM once. Serializer unit test covers `=cmd`→`'=cmd`, the guard-then-quote combination `=a,b`→`"'=a,b"`, leading-whitespace ` =cmd`→`' =cmd`, coercion, and the BOM. |
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
