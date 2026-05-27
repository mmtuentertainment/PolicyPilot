# Codebase Concerns

**Analysis Date:** 2026-05-24

Inventory of known carry-forwards, deferred items, deferred ASK-FIRSTs, code review findings, and architectural debt at the end of Phase 5 (Employee Portal). Phase 5 is COMPLETE (10/10 plans + UAT 18 PASS + 1 PASS-with-finding); branch `gsd/phase-5-employee-portal` shipped via PR #27. Phases 6 (Billing), 7 (Crons+Email), 8 (Validation) not started.

Severity legend: **BLOCKER** (must fix before next phase) · **HIGH** (fix in target phase) · **MEDIUM** (defense-in-depth or quality) · **LOW** (nit / cosmetic) · **ADVISORY** (informational; future obligation)

---

## Tech Debt — Carry-Forwards from STATE.md Blockers

### SF-CASCADE-AUDIT — append-only audit trail destroyed on tenant offboarding

- **Severity:** HIGH
- **Files:** `drizzle/0003_fk_hardening.sql` (ON DELETE CASCADE definitions across 10 tenant tables); future `app/api/admin/orgs/[id]/delete/route.ts` (does not exist yet)
- **Problem:** Phase 2 Plan 02-03 + 02-07 `0003_fk_hardening.sql` added `ON DELETE CASCADE` to every `org_id` FK across 10 tenant tables. When the org-delete code path lands, deleting an organization wipes acknowledgments + ai_generations in one transaction with **no app-level audit-event emission**. ADR-018 append-only audit trail is silently destroyed on offboarding.
- **Current mitigation:** No org-delete handler exists in production code — purely a future-phase obligation.
- **Fix:** When tenant-lifecycle UI/Server Action ships, the delete handler MUST (a) log row counts pre-delete, (b) emit a structured audit event BEFORE the cascade fires.
- **Target phase:** Phase 6 (Billing — `customer.subscription.deleted` webhook handler) or Phase 7+ (tenant-lifecycle admin UI)

### Tenant-lifecycle DEV-DB cleanup — orphan `MMTU Entertainment` org

- **Severity:** LOW (operator hygiene)
- **Files:** Diagnosed at `.planning/debug/org-topology-uat5.md`
- **Problem:** Orphan `MMTU Entertainment` (TitleCase) org exists in DEV DB from a days-old smoke retry. Case-only duplicate-name org pair (`mmtu entertainment` lowercase + `MMTU Entertainment` TitleCase) needs consolidation.
- **Fix:** Manual SQL cleanup against DEV DB (`DELETE FROM organizations WHERE id=...` after verifying no dependent rows or after explicit cascade decision).
- **Target phase:** Phase 6+ opportunistic cleanup; can land in any PR touching DEV-DB seed data.

### `db:migrate:test` script brittleness — env-file dependency

- **Severity:** MEDIUM
- **Files:** `package.json` (db:migrate:test script line); `.env.local.test` (populated copy of _TEST vars from Plan 05-01 diagnostic)
- **Problem:** `db:migrate:test` in `package.json` currently uses `--env-file=.env.local.test`, which is a populated copy of `_TEST` vars left over from Plan 05-01's executor diagnostic. This is fragile because (a) the file lives outside the canonical `.env.local` source-of-truth, (b) credential drift between `.env.local` `_TEST` vars and `.env.local.test` will silently desync.
- **Recommended fix (per SF-DB-1 closure pattern):** Change `db:migrate:test` to use the spawnSync env-override approach: read `.env.local`, override `DATABASE_URL`/`DIRECT_URL` from `_TEST` vars at runtime (same pattern as `scripts/check-data-layer.ts:checkMigrateTest`).
- **Target phase:** Phase 5+ opportunistic cleanup; land in any PR touching `package.json`.

### DEV + TEST DB credentials rotated 2026-05-24

- **Severity:** ADVISORY (no action required if you're the sole dev; HIGH if multiple devs are pulling this branch)
- **Problem:** Both Supabase projects (`kdoahaxhmaftxaiwbtdw` DEV + `qwtbbbjbxffioeeazxrw` TEST) had their `postgres` role passwords rotated on 2026-05-24 (T+306s and T+124s pooler-auth propagation respectively, per STATE.md session continuity entries). Pre-rotation `.env.local` values will fail with `28P01` (invalid password).
- **Files:** `.env.local` (gitignored — `DATABASE_URL` + `DIRECT_URL` for DEV; `DATABASE_URL_TEST` + `DIRECT_URL_TEST` for TEST)
- **Fix:** Other devs pulling `gsd/phase-5-employee-portal` (or post-merge `main`) must refresh `.env.local` from team secret manager / 1Password / Vault.
- **Target phase:** N/A — operator-action item.

---

## Plan 05 Code Review — Deferred WR/IN Findings

Source: `.planning/phases/05-employee-portal/05-REVIEW.md` (13 findings: 0 Critical, 7 Warning, 6 Info). WR-01 was fixed in commit `10628be` (stale `Anthropic.APIError.error?.type` access). 6 Warning + 6 Info findings remain as quality/defense-in-depth concerns.

### WR-02: AckStatusBadge prop type mismatch (`Date | null` vs serialized `string | null`)

- **Severity:** MEDIUM (correctness)
- **Files:** `components/policy/AckStatusBadge.tsx:33-34, 49-51`; `app/(employee)/my-policies/page.tsx:91-92`
- **Problem:** Component types `ackedAt: Date | null` and unconditionally wraps with `new Date(ackedAt)`. The `'current'` branch silently renders `✓ Acknowledged on ` (no date, trailing space) when `ackedAt` is null — functionally dead today because the LEFT JOIN match guarantees `ackedAt` is non-null when `currentAck.id IS NOT NULL`, but if the LEFT JOIN ever changes (e.g., `acknowledgedAt` defaulted-null on a future column change), the badge silently degrades.
- **Fix:** Tighten the discriminated union — `ackState: 'current'` should imply `ackedAt: Date` via the return type of `listAssignedAndPublishedForUser`. OR add explicit fallback string ("Acknowledged on (date unavailable)") instead of silent trailing space.
- **Target phase:** Phase 6+ opportunistic; or fold into a polish PR.

### WR-03: Dept sub-query relies on PostgreSQL NULL semantics — fragile invariant

- **Severity:** MEDIUM (defense-in-depth)
- **Files:** `lib/db/repositories/policies.ts:138`
- **Problem:** Dashboard query's `userDeptSubquery` returns single NULL row for dept-less users; `assignee_id = NULL` evaluates to UNKNOWN which WHERE treats as FALSE. Works correctly only because `assignee_id` is `.notNull()` schema-wise. Two independent schema decisions must both hold — fragile.
- **Fix:** Either (a) extract the dept-less-user case explicitly via a pre-query (resolve `userDeptId` outside the dashboard query, then conditional JOIN with `sql\`FALSE\`` for no-match); or (b) leave as-is with a stronger comment block documenting the load-bearing assumption that `assignee_id` is `.notNull()`.
- **Target phase:** Phase 6+ opportunistic (only refactor if touching the dashboard query); Phase 8 perf pass.

### WR-04: Acknowledgment orchestrator runs raw `s.tx.select` on `users` table — bypasses repository discipline

- **Severity:** MEDIUM (architectural layering)
- **Files:** `lib/policies/acknowledgment.ts:114-119, 161-172`
- **Problem:** Orchestrator imports `users` and `acknowledgments` from `@/lib/db/schema` and runs `s.tx.select(...)` directly, bypassing per-aggregate repository methods (`Users.findById`, `Acknowledgments.listForUser`). Both queries DO include `eq(table.orgId, s.orgId)` so the security invariant holds, but a future contributor copying this pattern might forget the predicate. `scripts/check-db-imports.ts` only catches `@/lib/db` barrel imports, not `s.tx.select(...)` patterns operating on schema tables.
- **Fix:** Either (a) add `Users.findDeptId(s, userId)` to `lib/db/repositories/users.ts` and `Acknowledgments.findExisting(s, userId, policyId, policyVersionId)` to acknowledgments.ts; or (b) document the exception explicitly referencing ADR-023's allow-list rationale.
- **Target phase:** Phase 6+ opportunistic cleanup or fold into next refactor of `lib/policies/acknowledgment.ts`.

### WR-05: `qa.ts` orchestrator runs expensive 5-table JOIN on every Q&A request

- **Severity:** MEDIUM (performance — accepted for MVP)
- **Files:** `lib/ai/qa.ts:182-186`
- **Problem:** After parsing citations, orchestrator runs `Policies.listAssignedAndPublishedForUser(s, s.userId)` — a 5-table SELECT DISTINCT with two LEFT JOINs on acknowledgments + inline sub-select for `departmentId` + JOIN on `policy_versions` — on EVERY Q&A request, even when zero citations need annotation. For 100 published policies × 50 employees × 10 Q&A/day, ~50k unnecessary aggregated rows fetched per day. Inline comment at line 178-181 acknowledges the trade-off and accepts it for MVP scale (<100 assignments).
- **Fix:** (a) Add narrower repository method `Policies.listAssignedIdsForUser(s, userId)` returning just `string[]` of policy IDs (no ack joins, no projections). (b) At minimum, short-circuit when `parsed.citations.length === 0` to skip the query entirely.
- **Target phase:** Phase 8 perf pass; or earlier if Q&A latency budget is exceeded.

### WR-06: AcknowledgeButton permanently locks form into "success" state — retry failures invisible

- **Severity:** LOW (UX edge case)
- **Files:** `components/employee/AcknowledgeButton.tsx:53-60`
- **Problem:** Component returns success-rendered branch early when `state?.ok === true`. After successful ack, form is replaced wholesale by success message — button gone. Correct UX for typical flow (ack once + revalidate). But: (a) no path back to retry, (b) browser refresh resets state — parent's `ackState='current'` gate hides button so AckStatusBadge takes over (correct, but reliant on parent gate). The success branch in AcknowledgeButton is structurally unreachable except in the brief window between `state?.ok` being set and revalidation completing.
- **Fix:** Add `aria-live="polite"` to the success message + explicit "refreshing…" indicator. Or restructure to render a disabled button labeled "Acknowledged" and let parent revalidation replace the entire block.
- **Target phase:** Phase 6+ opportunistic; accessibility polish PR.

### WR-07: Branch A access page omits `status='published'` re-check on freshly-fetched policy

- **Severity:** LOW (brief consistency window, no security boundary breach)
- **Files:** `app/(employee)/my-policies/[id]/page.tsx:88-107`
- **Problem:** `assignedRows` query filters by `status='published'`. Subsequent `findById` call does NOT — returns row regardless of status. Both queries inside same `withOrgScope` closure (one transaction), but Postgres READ COMMITTED isolation lets the second read see a `status='archived'` value if an admin archives the policy via concurrent transaction between the two reads. User sees wrong UI for a moment, but `acknowledgePolicyAction` throws `PolicyArchivedError` so no security boundary is breached. D-07 typed error correctly catches at Server Action level.
- **Fix:** Add status check on second-read result: `if (!fullPolicy || fullPolicy.status !== 'published') return { branch: "notfound" as const };` Matches Branch B's existing check for consistency.
- **Target phase:** Phase 6+ opportunistic; trivial fix.

### IN-01: Hardcoded `'en-US'` locale in date formatting

- **Severity:** LOW (i18n future-proofing)
- **Files:** `components/policy/AckStatusBadge.tsx:54`; `components/employee/AcknowledgeButton.tsx:57`
- **Problem:** Both components call `.toLocaleDateString('en-US')` with hardcoded locale. Renders "5/24/2026" for all users regardless of browser locale. PolicyPilot's `PROJECT.md` targets US SMBs but doesn't explicitly preclude international customers.
- **Fix:** Use locale-aware formatting via `new Date(ackedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })` or a date-fns helper for SSR-stable rendering.
- **Target phase:** Phase 7+ if international expansion considered; otherwise indefinite defer.

### IN-02: `_prev` parameter convention inconsistent with React 19 docs

- **Severity:** LOW (style nit)
- **Files:** Multiple — `app/(employee)/my-policies/[id]/actions.ts:62`; `app/(employee)/my-policies/ask/actions.ts:52`; `app/(admin)/policies/[id]/actions.ts:135` (and 7 sibling actions)
- **Problem:** All Phase 5 (and Phase 3) Server Actions take `_prev: ActionState | undefined`. React 19 docs name it `prevState` (no underscore). Underscore prefix signals "linter-suppress" rather than "documented unused".
- **Fix:** Either keep `_prev` everywhere + add project lint rule, or align to React 19's `prevState`.
- **Target phase:** Style PR; not urgent.

### IN-03: `PolicyNotFoundError` discriminator unused by UI consumer

- **Severity:** LOW (dead-code discriminator)
- **Files:** `lib/policies/acknowledgment.ts:99, 143`; `app/(employee)/my-policies/[id]/actions.ts:92-98`; `components/employee/AcknowledgeButton.tsx:72-74`
- **Problem:** Server Action maps `PolicyNotFoundError` to `{ ok: false, error: 'Policy not found.', code: 'POLICY_NOT_FOUND' }`, but UI just displays `state.error` as red text with no special handling per code. Discriminator is currently dead-code.
- **Fix:** Either remove `code` discriminator (treat as plain `error` string) OR add per-code UI handler showing a "Return to /my-policies" button on NOT_FOUND case.
- **Target phase:** Phase 6+ opportunistic; design decision required.

### IN-04: `PolicyAssignmentsPanel.tsx` renders raw UUID for `assigneeType === 'user'` rows

- **Severity:** LOW (UX downgrade; not currently triggered)
- **Files:** `components/admin/PolicyAssignmentsPanel.tsx:74-82`
- **Problem:** Assignment list renders `User: ${a.assigneeId}` for user-type assignments — exposing raw UUID. Not a security issue (admins can see internal UUIDs), but hostile UX. D-17 explicitly defers individual-user assignment UI to Phase 6+ so user-type rows would only exist via seed/out-of-band SQL today.
- **Fix:** (a) Filter user-type rows from read-only list until Phase 6+ ships user-lookup join; (b) add users-table JOIN in parent Server Component to resolve UUIDs to names/emails.
- **Target phase:** Phase 6+ (when individual-user assignment UI ships).

### IN-05: `tests/fixtures/ack-mutation-attempt.ts` imports `server-only` despite being static-analysis-only

- **Severity:** LOW (misleading code marker)
- **Files:** `tests/fixtures/ack-mutation-attempt.ts:27`
- **Problem:** Fixture file declares `import 'server-only';` at line 27, but it's a STATIC fixture for ts-morph AST scanning (header comment at line 14: "DO NOT EXECUTE — STATIC fixture for AST scanning; function bodies are unreachable at runtime"). `server-only` guard exists to fail-fast if file is bundled into Client; including it on never-imported file adds no value and could mislead future contributors.
- **Fix:** Remove the `import 'server-only'` line.
- **Target phase:** Trivial PR; any future touch to fixture file.

### IN-06: `lib/db/repositories/policies.ts:138` inline sub-select mixes column-ref + value interpolation

- **Severity:** LOW (audit friction)
- **Files:** `lib/db/repositories/policies.ts:138`
- **Problem:** Dept sub-select mixes `${users.departmentId}` (Drizzle column-ref) with `${userId}` / `${s.orgId}` (parameterized values) in one template. Pattern is correct (Drizzle parameterizes values; identifier interpolation is safe) but mixing both styles is harder to audit at-a-glance.
- **Fix:** Add one-line comment confirming safe-interpolation status: `// Drizzle sql\`\` parameterizes ${userId} + ${s.orgId} as bound parameters; ${users.*} resolve to identifier strings. No SQL injection risk.`
- **Target phase:** Trivial PR.

---

## Architectural Concerns / Tech Debt

### No observability layer — no Sentry, no OpenTelemetry, no log aggregation

- **Severity:** HIGH (production-readiness gap)
- **Problem:** Application has no error reporting service (Sentry), no distributed tracing (OpenTelemetry), no log aggregation (Datadog/Logtail/Axiom). Errors land in Vercel runtime logs only. PII-safe `console.error` logging is in place (e.g., `app/api/ai/qa/route.ts:38`), but no centralized signal for production incidents.
- **Impact:** Phase 6 (Billing) Stripe webhook failures, Phase 7 (Crons) email-send failures, and Phase 4 (AI) Anthropic API errors all degrade silently in production.
- **Fix:** Phase 8 (Validation) should add Sentry SDK (`@sentry/nextjs`) with PII scrubbing + Anthropic client wrapper for error context. Defer OpenTelemetry to v1.1 unless tracing needs surface.
- **Target phase:** Phase 8 (Validation) — may need to surface earlier if Phase 6 or 7 production incidents arise.

### No structured rate limiting — Q&A endpoint relies on TIER_LIMITS without Redis backend

- **Severity:** HIGH (DoS / cost-runaway risk)
- **Files:** `app/api/ai/qa/route.ts`; `reference/TIER-LIMITS.md`
- **Problem:** Q&A endpoint enforces tier-based throttling via `TIER_LIMITS` lookups, but there's no Redis-backed sliding-window rate limit (e.g., Vercel KV + Upstash). A misbehaving client or compromised account could trigger Anthropic API overage charges.
- **Impact:** Cost-runaway on Anthropic Sonnet 4.6 calls (~$3/1M tokens); minor DDoS surface on Q&A endpoint.
- **Fix:** Add Vercel KV (or Upstash Redis) + sliding-window middleware on all `/api/ai/**` routes. Per-org + per-user limits.
- **Target phase:** Phase 8 (Validation) or earlier if cost monitoring surfaces issues.

### No CSRF protection beyond Next.js Server Action defaults

- **Severity:** MEDIUM
- **Problem:** Flagged in EAPI advisor M-2 carry-forward (Plan 05 era). Next.js 15 Server Actions provide built-in CSRF protection via origin checks + cryptographic action IDs, but this is NOT documented in any threat model. If a future contributor changes a Server Action to a regular POST route, the CSRF protection silently disappears.
- **Fix:** Document Next.js Server Action CSRF defaults in threat models for Plans 05-05 + 05-06 + all future Server Action plans. Add CI check that `'use server'` directive is present in all Server Action files.
- **Target phase:** Phase 6+ (Billing Server Actions); fold into next Server Action plan.

### No structured E2E test framework

- **Severity:** MEDIUM (manual UAT debt)
- **Problem:** Playwright/Cypress not installed. UAT runs via operator + Claude `/chrome` driving Chrome MCP — manual, single-operator, no CI integration. Plan 05-10 UAT was 19 numbered checks across SPEC R-1..R-6; future phases will accumulate more checks.
- **Impact:** Regression risk on UI surfaces; operator-time cost per phase ship; no pre-merge automation of user-flow tests.
- **Fix:** Phase 8 (Validation) should evaluate Playwright vs Cypress and add `tests/e2e/` directory + `pnpm e2e:phase-N` script. Migrate UAT checklists incrementally.
- **Target phase:** Phase 8 (Validation) at earliest; can defer to v1.1.

### D-26 Q&A grant TTL — unbounded growth of `qa_citation_grants` table

- **Severity:** MEDIUM (long-term operational concern)
- **Files:** `drizzle/0011_qa_citation_grants.sql`; `lib/db/repositories/qa_citation_grants.ts`
- **Problem:** Server-tracked Q&A → citation grants have NO TTL. Every Q&A request that mentions a previously-unassigned policy creates a permanent grant row (UPSERT idempotent on `(org_id, user_id, policy_id)`). Over time, table will grow unbounded — every user × every cited policy = one row, forever.
- **Impact:** TEST DB will accumulate stale fixtures; production will see slow query degradation on `hasGrant` lookups (composite index helps but not unbounded).
- **Fix:** Phase 7+ should add a cron-based cleanup script: `DELETE FROM qa_citation_grants WHERE granted_at < NOW() - INTERVAL '90 days' AND user_id NOT IN (...active users)`. OR add `expires_at` column + index + filter on `hasGrant`.
- **Target phase:** Phase 7 (Crons + Email) — natural home for cleanup cron.

### Citation grants have no audit trail of revocation

- **Severity:** LOW (potential future regulatory concern)
- **Files:** `lib/db/repositories/qa_citation_grants.ts`
- **Problem:** D-26 write-once policy means once a grant is created, only `DELETE` is possible (no revocation flag, no audit row). No granular per-user/per-policy revocation API. Future regulatory requirements (e.g., GDPR right-to-be-forgotten with audit trail) may require evidence of grant revocation, not just absence.
- **Fix:** If regulatory requirement surfaces, add `revoked_at` + `revoked_by` columns + soft-delete pattern. Defer until concrete requirement.
- **Target phase:** Indefinite — track in this CONCERNS.md, no current action.

### No data export pipeline — Phase 8 ships CSV-only

- **Severity:** LOW (in-scope for v1.0; explicit Non-Goal)
- **Problem:** Phase 8 ships CSV export for acknowledgment reports per `REQUIREMENTS.md`, but no general data-export framework. GDPR-style "download my data" not in scope per `CLAUDE.md` Non-Goals.
- **Fix:** v1.1 if customer demand surfaces; otherwise indefinite defer.
- **Target phase:** v1.1 (post-MVP).

---

## Phase 4/5 EAPI Advisor Carry-Forwards

Source: STATE.md line 239 (Phase 5 EAPI Critical Path session). 4 HIGH closed in-plan (H-1/H-4/H-5/H-6). 2 HIGH + 6 MEDIUM + 2 ADVISORY carry forward.

### H-2: Same-org grant-scope formalization

- **Severity:** MEDIUM (architectural rigor)
- **Files:** `lib/ai/qa.ts:97-98` (Phase 4 D-41 closure); future CONTEXT.md `<deferred>` block; Plan 05-04 `<threat_model>` block (in-flight at execute time)
- **Problem:** D-26 grant UPSERT writes `(org_id=s.orgId, user_id=s.userId, policy_id=...)`. The `org_id` value is structurally guaranteed to be the same as the policy's `org_id` because `validIds` is sourced from `Policies.listPublishedForOrg(s)` in the same `withOrgScope` closure. But this invariant is enforced by code structure, not by a typed-error or assertion.
- **Fix:** Add explicit `assertEqual(s.orgId, fetchedPolicy.orgId)` defense before UPSERT; OR add a CONTEXT.md `<deferred>` doc block formalizing the invariant for future maintainers. Plan 05-04 threat model edit was deferred to execute-time (and was indeed not formalized).
- **Target phase:** Phase 6+ opportunistic; or fold into Phase 8 architectural review.

### H-3: UUID-global-uniqueness ADR-030 OR add `org_id` to D-06 UNIQUE

- **Severity:** MEDIUM (architectural lock)
- **Files:** `drizzle/0010_phase5_uniques.sql` (acknowledgments UNIQUE per D-06); `lib/db/schema.ts` (acknowledgments table)
- **Problem:** D-06 UNIQUE on `acknowledgments(user_id, policy_id, policy_version_id)` does NOT include `org_id`. UUIDs are globally unique by RFC4122 collision probability, but no architectural lock formalizes "UUIDs are globally unique within PolicyPilot" — making schema reasoning fragile.
- **Operator decision pending:** Either (a) ratify ADR-030 "UUIDs are globally unique within PolicyPilot" and document the implication; OR (b) extend the UNIQUE to include `org_id` for defense-in-depth.
- **Fix:** Operator decision required. ADR-030 ratification has zero migration cost; UNIQUE extension would require an additive migration.
- **Target phase:** Phase 6 entry (architectural cleanup before Billing schema changes).

### M-1: `x-forwarded-for` trust boundary ADR

- **Severity:** MEDIUM (architectural rigor)
- **Files:** `app/(employee)/my-policies/[id]/actions.ts:70-71` (current IP capture)
- **Problem:** D-05 documents `x-forwarded-for` first-hop strip ("Vercel edge strips client-supplied values"), but no ADR formalizes which proxy headers are trusted vs which are user-controlled. If PolicyPilot ever moves off Vercel (e.g., self-hosted), the trust boundary changes silently.
- **Fix:** Ratify ADR with trusted-proxy list + header-trust matrix. Add CI check that no other route reads `x-real-ip` / `cf-connecting-ip` without explicit annotation.
- **Target phase:** Phase 6+ opportunistic; or Phase 8 architectural review.

### M-2: CSRF protection documented in threat models

- **Severity:** MEDIUM
- **Problem:** Cross-references the architectural concern above. Next.js 15 Server Action CSRF defaults are not documented in any Phase 5 threat model. Without explicit documentation, future contributors lose visibility into the protection.
- **Fix:** Add to Phase 6+ Server Action threat models. (Same fix as architectural concern; tracking separately because EAPI advisor flagged distinctly.)
- **Target phase:** Phase 6 (Billing Server Actions).

### M-3: `bulkAssignToDepartmentAction` return shape

- **Severity:** MEDIUM (type safety)
- **Files:** `app/(admin)/policies/[id]/actions.ts:bulkAssignToDepartmentAction`
- **Problem:** Return shape was not formalized as a discriminated union; uses ad-hoc `{ ok: boolean, error?: string, departmentId?: string }`. Inconsistent with future Server Actions.
- **Fix:** Refactor to shared `ActionResult<T>` discriminated union (see M-4).
- **Target phase:** Phase 6+ when M-4 lands.

### M-4: Shared `lib/actions/types.ts` `ActionResult<T>` discriminated union

- **Severity:** MEDIUM (codebase consistency)
- **Files:** Future `lib/actions/types.ts` (does not exist); all Server Actions across `app/(admin)/**/actions.ts` + `app/(employee)/**/actions.ts`
- **Problem:** Every Server Action defines its own `ActionState` discriminated union. No shared `ActionResult<T> = { ok: true, data: T } | { ok: false, error: string, code?: string }` exists. Inconsistent shapes (some have `code`, some don't; some return `data`, some return ad-hoc fields).
- **Fix:** Create `lib/actions/types.ts` with shared `ActionResult<T>` + `ActionError` types. Refactor all existing Server Actions to use it.
- **Target phase:** Phase 6 entry (before Billing Server Actions accumulate more drift).

### M-5: `priorAck.policyVersionId <> pv.id` NULL-safe form verification

- **Severity:** MEDIUM (SQL correctness)
- **Files:** Plan 05-03 SQL (LEFT JOIN priorAck condition); `lib/db/repositories/policies.ts:listAssignedAndPublishedForUser`
- **Problem:** Dashboard query uses `priorAck.policyVersionId <> pv.id` for the "prior ack" detection. In SQL, `NULL <> anything = NULL = FALSE`, so a policy with no prior ack row (LEFT JOIN miss) correctly returns FALSE. This was supposed to be NULL-safely verified during execute but the explicit verification was deferred.
- **Fix:** Add a vitest assertion in `scripts/check-employee-portal.test.ts` exercising the "policy never previously acked + currently unacked" path to confirm `ackState = 'none'` (not `'stale'`).
- **Target phase:** Phase 6+ opportunistic; or fold into Phase 8 integration test expansion.

### M-6: Department-less user + assignment-revocation-mid-session fixtures in Plan 05-09

- **Severity:** MEDIUM (test coverage gap)
- **Files:** `scripts/check-employee-portal.test.ts`
- **Problem:** Two test cases were deferred from Plan 05-09: (a) department-less user (`users.department_id IS NULL`) hitting the dashboard query — verifies WR-03's fragile NULL semantics work; (b) assignment-revocation-mid-session — user has a policy in their list, admin revokes assignment, user refreshes — verifies no stale state. Plan 05-09 SUMMARY notes WR-03 case IS covered in integration test (`check-employee-portal.test.ts:513-551`), but M-6 deferred items are not.
- **Fix:** Add test cases to `scripts/check-employee-portal.test.ts`.
- **Target phase:** Phase 6+ opportunistic; or Phase 8 integration test expansion.

### A-1: `askQuestion` streaming-deferral NOTE comment

- **Severity:** ADVISORY (documentation)
- **Files:** `lib/ai/qa.ts` (no current streaming support)
- **Problem:** Anthropic SDK supports streaming responses; Phase 4 chose to defer streaming until Phase 8+. No inline NOTE comment documents this choice.
- **Fix:** Add NOTE comment at `askQuestion` function: `// NOTE: Streaming responses deferred to Phase 8+ per Phase 4 D-NN. Current path is full-response only.`
- **Target phase:** Trivial PR.

### A-2: `scripts/check-qa-contract.ts` API-SPEC schema validation

- **Severity:** ADVISORY (defense-in-depth)
- **Files:** Future `scripts/check-qa-contract.ts` (does not exist); `reference/API-SPEC.md` (Q&A response shape)
- **Problem:** API-SPEC.md documents Q&A response shape (citations.accessibility additive field per H-4 closure), but no CI gate validates that `lib/ai/qa.ts::askQuestion` actually returns the documented shape at runtime. Drift between docs and code is undetected.
- **Fix:** Add `scripts/check-qa-contract.ts` that runs a smoke `askQuestion` call (mocked Anthropic) and validates response against zod schema derived from API-SPEC.md.
- **Target phase:** Phase 8 (Validation) — fits the validation-gate theme.

---

## Phase 2 Carry-Forwards (still open)

### SF-W5: Plan 02-05 webhook handler ordering — Clerk receives 200 on silent dispatch failure

- **Severity:** HIGH (webhook reliability)
- **Files:** `app/api/webhooks/clerk/route.ts` (writes `clerk_events` BEFORE dispatch)
- **Problem:** Webhook handler writes `clerk_events` row (idempotency lock) BEFORE the actual dispatch logic. If dispatch silently fails (catch block swallows non-Anthropic error), Clerk receives HTTP 200 and does not retry. The `clerk_events` row stays in the table indicating "processed" but the side effect never fired.
- **Impact:** Silent data loss on webhook failures — users created in Clerk may never get a row in `users` table; org-role updates may never propagate.
- **Fix:** Phase 7+ should invert idempotency-before-dispatch ordering OR add explicit alerting on stuck `clerk_events` rows (cron: alert if any `clerk_events.processed_at` row exists with no corresponding `users` row newer than `created_at`).
- **Target phase:** Phase 7 (Crons + Email) — natural home for both the alerting cron and the webhook hardening.

### Phase 7+ webhook test coverage — vitest scaffold for 409/catch paths

- **Severity:** MEDIUM (test debt)
- **Files:** Future `app/api/webhooks/clerk/route.test.ts` (does not exist); production code verified live during UAT-4 + UAT-6 only
- **Problem:** Webhook handler 409 (idempotency-collision) and catch paths have no automated test coverage. Production code was verified live via 2 independent paths during Phase 3 G3 UAT, but no vitest scaffold protects against regression.
- **Fix:** Add `app/api/webhooks/clerk/route.test.ts` with mocked svix + mocked `clerkClient()` covering: (a) 409 on duplicate event, (b) catch path on dispatch failure, (c) catch path on `clerkClient` rate-limit.
- **Target phase:** Phase 7 (Crons + Email) — bundle with webhook hardening above.

### Nyquist G-08a / G-09a / G-03a — Phase 2.1 hardening orthogonal to admin UI

- **Severity:** MEDIUM (architectural hardening)
- **Files:** Per `.planning/phases/02-data-layer/02-VALIDATION.md` (G-08a/G-09a/G-03a entries)
- **Problem:** Three Nyquist auditor findings from Phase 2 validation pass that are orthogonal to admin UI (Phase 3) and thus deferred. Specifics in 02-VALIDATION.md.
- **Fix:** Per per-finding remediation in 02-VALIDATION.md.
- **Target phase:** Phase 2.1 (opportunistic hardening) or Phase 8 (Validation cleanup).

---

## Phase 1 PR-Review Follow-Ups (Deferred — Opportunistic Cleanup)

Surfaced by `/pr-review-toolkit:review-pr` against PR #1 head `e3689d3`. SF-H4, SF-M3, and phase-reference comment rot addressed in `2438f42` + `723ca58`. SF-M1 + SF-M4 closed in subsequent phases. Remaining items don't block any phase success criterion.

### Silent-failure hardening in verify scripts

- **Severity:** LOW (operator-UX, not phase-criterion gaps)
- **SF-H1 — `scripts/check-foundation.ts:62-73, 178-192`:** When `spawnSync` sets `result.error` (ENOENT, EACCES), both stdout/stderr are empty; current code reports generic literal `"tsc failed"`. Branch on `result.error` first, surface `code` + `message`.
- **SF-H2 — `scripts/check-foundation.ts:175, 191`:** `result.status === null` (signal-killed, e.g. OOM/SIGTERM) is currently masked as `"unknown"`. Surface `result.signal` explicitly.
- **SF-H3 — `scripts/check-artifacts.ts:776-784`:** Server-only walker doesn't try/catch `readdirSync`/`readFileSync` and doesn't skip symlinks. Permission flip mid-walk crashes the whole gate; symlink loop hangs. Wrap each fs call + use `entry.isSymbolicLink()`; print files-walked count.
- **SF-M5 — `scripts/check-artifacts.ts:28-30`:** `read()` has no try/catch; TOCTOU between `exists()` and `read()` could nuke all 114 assertions on one transient FS hiccup. Wrap in try/catch, push `fail()` Check, continue.
- **SF-L1 — `scripts/check-foundation.ts:127`:** `res.headers.get("location") ?? ""` ambiguates missing-header vs empty-header. Surface "Location header absent" explicitly.
- **SF-L2 — `package.json:15`:** `verify:phase-1` chain has `pnpm` shell invocation on second half (`&& pnpm check:artifacts`), inconsistent with IN-02 / `process.execPath` hardening on first half. Cosmetic.
- **Fix approach:** Bundle into a single "verify-script hardening" PR; each fix is ~5-line edit.
- **Target phase:** Any time; fold into next PR touching `scripts/check-*.ts`.

### Code-reviewer nits (low-confidence, can defer indefinitely)

- **Severity:** LOW (cosmetic)
- `middleware.ts:75` — `as { role?: string } | undefined` cast on `sessionClaims?.publicMetadata`. Mirroring the `in/typeof` guard pattern from `scripts/check-db.ts` would be cleaner but branch is dead in Phase 1. Defer to Phase 3 admin-matcher rewrite (already done via HI-01 in Plan 02-07 hotfix — now uses `{ role?: unknown }` + typeof guard).
- `app/(marketing)/layout.tsx:28` — hardcoded `© 2026` footer. Bump annually or wire `new Date().getFullYear()`. Trivial.
- `app/(marketing)/pricing/page.tsx:73` — "Annual save 20%" reads ambiguously ("Save 20% annually"). Grammar nit.
- **Target phase:** Indefinite.

---

## Operator-Acceptance Items Deferred to Follow-Up Phases

### 05-08 deferred ASK-FIRST: `drizzle/0012_acknowledgments_revoke_mutation.sql`

- **Severity:** MEDIUM (defense-in-depth; CI gate is current operative defense)
- **Files:** Future `drizzle/0012_acknowledgments_revoke_mutation.sql` (does not exist); `drizzle/0001_rls_policies.sql:69-73` (current GRANT block); `scripts/check-acknowledgment-immutability.ts:194-236` (current Sub-pass 2 raw-SQL detection)
- **Problem:** Phase 2 `drizzle/0001_rls_policies.sql:69` GRANTs `UPDATE + DELETE` on `acknowledgments` to `authenticated` role (mandatory for RLS symmetry). DB layer does NOT prevent a raw-SQL mutation from a future bug. The deferred 0012 REVOKE migration would close the DB-level gap as defense-in-depth on top of the CI gate.
- **Current mitigation:** `scripts/check-acknowledgment-immutability.ts` Sub-pass 2 regex scans every CI run; `tests/fixtures/ack-mutation-attempt.ts` provides negative-control fixture; `--self-test` mode requires both detection paths to fire (`hasDrizzle && hasRawSql`).
- **Operator approval required:** Per CLAUDE.md destructive-migration discipline. Pre-paying-customer status accepts the temporary CI-only defense.
- **Fix:** When operator approves, ship `drizzle/0012_acknowledgments_revoke_mutation.sql` with `REVOKE UPDATE, DELETE ON acknowledgments FROM authenticated;` + header documenting rationale + operator-approval timestamp.
- **Target phase:** Phase 6 entry checklist (before Billing-related schema changes); documented in Plan 05-08 `<deferred>` block.

---

## Verification BLOCKER — Test File Out-of-Sync with Production Code

### `lib/policies/transitions.test.ts:206` — editPublished test asserts pre-fast-follow-fix behavior

- **Severity:** RESOLVED (was BLOCKER at 2026-05-24T07:00Z; closed by commit `4ce0cc9` at 2026-05-24T07:05Z)
- **Files:** `lib/policies/transitions.test.ts:194-218`; `lib/policies/transitions.ts:282-315`
- **Problem (historical):** Inline fast-follow fix `afb7693` (Phase 3 G3 DUP-VN-2) updated `editPublished` to not call `PolicyVersions.create` (snapshot moved into `publish()`), but the test at `lib/policies/transitions.test.ts:206` still asserted `pvCreateMock.toHaveBeenCalledWith(...)`. `pnpm verify:phase-5` exited 1 due to this one test failure (1 failed / 228 passed).
- **Resolution:** Commit `4ce0cc9` `test(03-G3-followup): update transitions test for DUP-VN-2 fix (afb7693)` rewrote test to assert post-fix behavior (`pvCreateMock NOT called`, `txUpdateMock still called`). Re-ran: 20/20 pass; `pnpm verify:phase-5` exits 0 end-to-end in 92s.
- **Reason still listed here:** Documents the **class of risk** (production-code fast-follow without corresponding test update). Future fast-follows must include corresponding test updates in the same commit.
- **Target phase:** N/A — closed. Pattern lesson logged for future contributors.

---

## Phase-Specific Document References

- **Phase 5 STRIDE security audit:** `.planning/phases/05-employee-portal/05-SECURITY.md` (40/40 threats, 27 CLOSED-mitigated + 13 CLOSED-ACCEPTED with rationale)
- **Phase 5 code review:** `.planning/phases/05-employee-portal/05-REVIEW.md` (13 findings: 0 Critical / 7 Warning / 6 Info)
- **Phase 5 final verification:** `.planning/phases/05-employee-portal/05-VERIFICATION.md` (6/6 SPEC SCs verified + ship-gate SG verified after `4ce0cc9` test sync)
- **Phase 5 per-plan SUMMARYs:** `.planning/phases/05-employee-portal/05-{01..10}-*-SUMMARY.md`
- **STATE Blockers:** `.planning/STATE.md` `### Blockers` section (most up-to-date list)
- **STATE Phase-N follow-up sections:** `.planning/STATE.md` `### Phase 2 follow-ups (deferred)` + `### Phase 1 PR-review follow-ups (deferred)`

---

*Concerns audit: 2026-05-24 — post-Phase-5-ship*
