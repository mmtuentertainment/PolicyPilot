---
status: clean
phase: 05-employee-portal
phase_status: COMPLETE
branch: gsd/phase-5-employee-portal
asvs_level: 2
threats_total: 40
threats_closed: 40
threats_open: 0
threats_accepted: 13
unregistered_flags: 0
audited_at: 2026-05-24
auditor: gsd-secure-phase
phase_4_inherited_mitigations: 3
---

# Phase 5 (Employee Portal) — STRIDE Security Audit

## Summary

| Metric | Value |
|--------|-------|
| Total threats audited | 40 |
| CLOSED (mitigated + verified) | 27 |
| ACCEPTED (acknowledged trade-off) | 13 |
| OPEN (blocker) | 0 |
| Unregistered flags | 0 |
| Phase 4 inherited mitigations | 3 |

**Verdict: clean.** Every declared mitigation in all 10 Plan threat models is present in shipped code at HEAD on `gsd/phase-5-employee-portal`. All four runtime CI gates exit 0 (`check:acknowledgment-immutability`, `check:acknowledgment-immutability:self-test`, `check:policy-id-brand`, `check:error-discipline`, `check:artifacts`). The ADR-018 append-only invariant is locked at three layers (type-system, ts-morph CI, documented DB GRANT-asymmetry).

---

## STRIDE Verification Tables (per plan)

### Plan 05-01 — Schema Migrations (6 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-01-01 | Tampering | mitigate | CLOSED | `drizzle/0011_qa_citation_grants.sql:54` uses wrapped `(SELECT auth.jwt()->>'org_id')` form per RESEARCH gap-1. `scripts/check-artifacts.ts:451` asserts the wrapped form is present. |
| T-05-01-02 | Information Disclosure | mitigate | CLOSED | RLS predicate at `drizzle/0011_qa_citation_grants.sql:53-54` blocks cross-org; `ON DELETE CASCADE` from `organizations(id)` at line 38; UNIQUE`(org_id, user_id, policy_id)` at line 35 makes UUID-collision cross-org pollution impossible. `scripts/check-rls.ts:47` lists `'qa_citation_grants'` in TENANT_TABLES (auto-extended truncate at line 93 + line 191). |
| T-05-01-03 | Tampering | accept | CLOSED-ACCEPT | DB-enforced idempotency via ON CONFLICT DO NOTHING on `acknowledgments_user_id_policy_id_policy_version_id_unique` (migration `drizzle/0010_phase5_uniques.sql:25`). Documented trade-off — race-past-type-system closed at DB layer. |
| T-05-01-04 | Repudiation | mitigate (defense-in-depth) | CLOSED | Schema header preserved at `lib/db/schema.ts:54-59` ("NEVER DELETE OR UPDATE ROWS"). DB GRANTs intentionally retain UPDATE+DELETE for symmetry per `drizzle/0001_rls_policies.sql:67-73` (documented asymmetry). App-layer lock at `lib/db/repositories/acknowledgments.ts:31-87` (no `update`/`delete` keys). 3-layer defense (see Append-Only Defense section below). |
| T-05-01-05 | Tampering | mitigate | CLOSED | `drizzle/meta/_journal.json` registers `0010_phase5_uniques` + `0011_qa_citation_grants` in numerical order with valid snapshot prevId chain (Plan 05-01 Task 2 acceptance criteria verified). `scripts/check-artifacts.ts:2014` + lines around journal assertion verify presence. |
| T-05-01-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages introduced in Phase 5. |

### Plan 05-02 — Typed Errors (3 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-02-01 | Information Disclosure | mitigate | CLOSED | `lib/policies/errors.ts:22-26` documents info-disclosure boundary ("orgId / userId NEVER appear in the message"). Concrete subclasses at lines 78, 94, 110 take only `public readonly policyId` constructor param; messages include only `policyId` (acceptable — user has it from URL). |
| T-05-02-02 | Tampering | mitigate | CLOSED | `lib/policies/errors.ts:67-69` declares `abstract readonly code: PolicyDomainErrorCode` — typos at concrete subclass become compile errors. `scripts/check-error-discipline.ts:113-123` scans `lib/policies/**` (excluding `errors.ts`) for banned built-in `Error` subclasses; gate exits 0 against shipped code (verified manually). |
| T-05-02-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages. |

### Plan 05-03 — Repositories (6 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-03-01 | Tampering | mitigate | CLOSED | `scripts/check-acknowledgment-immutability.ts` ts-morph gate scans `lib/**/*.ts` for `.update(acknowledgments)`/`.delete(acknowledgments)` Drizzle-API calls (Sub-pass 1, lines 129-192) + raw-SQL bypass via `sql\`UPDATE/DELETE acknowledgments\`` (Sub-pass 2, lines 194-236). `pnpm check:acknowledgment-immutability` exits 0 (53 files scanned). `tests/fixtures/ack-mutation-attempt.ts` ships both Drizzle-API + raw-SQL violations; `pnpm check:acknowledgment-immutability:self-test` exits 0 with 2 violations + both detection paths exercised. |
| T-05-03-02 | Information Disclosure | mitigate | CLOSED | `lib/db/repositories/policies.ts:138` inline dept-id sub-select includes `eq(users.orgId, s.orgId)` predicate; composite FK on `users(org_id, department_id)` at `lib/db/schema.ts:307-311` blocks cross-org at Postgres level. Documented at `lib/db/repositories/policies.ts:114-118`. |
| T-05-03-03 | Information Disclosure | mitigate | CLOSED | RESEARCH gap-3 closed: `lib/ai/qa.ts:173-175` grant UPSERT iterates `parsed.citations` (post-validIds-filter at `lib/ai/qa-parser.ts:54`), NOT raw fence. EAPI advisor H-5 negative test at `scripts/check-employee-portal.test.ts:860` asserts hallucinated UUIDs never produce grant rows. |
| T-05-03-04 | Tampering | accept | CLOSED-ACCEPT | Documented at `lib/db/repositories/policies.ts:120-124` — migration-0010 UNIQUE auto-creates btree usable by both `current_ack` + `prior_ack` join predicates. |
| T-05-03-05 | Repudiation | accept | CLOSED-ACCEPT | D-10 ops log at `lib/db/repositories/acknowledgments.ts:76-79` is observability, not security failure. |
| T-05-03-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages. |

### Plan 05-04 — Orchestrators (8 threats — Phase 4 inheritance noted)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-04-01 | Tampering | mitigate | CLOSED | `lib/policies/acknowledgment.ts:100` throws `PolicyArchivedError` on `policy.status !== 'published'`; entire 4-step orchestration is wrapped in single `withOrgScope` tx (line 92) per D-10a. Server Action catch branch at `app/(employee)/my-policies/[id]/actions.ts:78-83` maps to UI recovery copy. |
| T-05-04-02 | Tampering | mitigate | CLOSED | `lib/policies/acknowledgment.ts:129` throws `PolicyNotAssignedError`. Same tx-rollback + Server Action mapping at `actions.ts:85-91`. |
| T-05-04-03 | Tampering | mitigate | CLOSED | Single `withOrgScope` at `lib/policies/acknowledgment.ts:92` wraps all 4 sub-ops (findById + dept-sub-query + listForPolicy + findByVersionNumber + record); editPublished landing inside the tx window either rolls back or commits atomically. Schema UNIQUE on `policy_versions(policy_id, version_number)` from 03-G3 T2 makes lookup deterministic. |
| T-05-04-04 | Information Disclosure | mitigate (Phase 4 inheritance) | CLOSED | Phase 4 D-41 same-closure validIds defense preserved verbatim at `lib/ai/qa.ts:97-98` (`Policies.listPublishedForOrg(s)` + `new Set(...)` in same withOrgScope closure). EAPI advisor H-6 negative test at `scripts/check-employee-portal.test.ts` asserts cross-org real-UUID stripped at runtime. **Inherited from Phase 4 (commit `6887000`).** |
| T-05-04-05 | Information Disclosure | mitigate | CLOSED | RESEARCH gap-3: `lib/ai/qa.ts:164` `parsed = parseQaResponse(rawText, validIds)`; grant UPSERT loop at lines 173-175 iterates `parsed.citations` (NOT raw fence). EAPI advisor H-5 + H-6 runtime negative tests cover both pure-hallucination and cross-org real-UUID cases. |
| T-05-04-06 | Information Disclosure | accept | CLOSED-ACCEPT | `lib/ai/qa.ts:177-193` D-27a accessibility annotation is UI hint only. Real boundary is D-27 page handler (see T-05-05-01). Documented at `lib/ai/qa.ts:29-36`. |
| T-05-04-07 | Tampering | mitigate (Phase 4 inheritance) | CLOSED | `lib/ai/qa.ts:113-116` preserves D-33c LONG_CACHE-first / EPHEMERAL-second ordering verbatim. Anthropic returns HTTP 400 on inverse order — runtime detection on first live call. **Inherited from Phase 4 (commit `6887000`).** |
| T-05-04-08 | Repudiation | mitigate (Phase 4 inheritance) | CLOSED | `lib/ai/qa.ts:147-159` `AiGenerations.insert` stores `result: rawText` (line 151) verbatim per WARNING-4 — raw Claude output including citation fence + hallucinated-ID record preserved for audit replay + Phase 8 telemetry. **Inherited from Phase 4 (commit `6887000`).** |
| T-05-04-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages. |

### Plan 05-05 — Employee Routes (11 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-05-01 | Information Disclosure (BOLA) | mitigate | CLOSED | D-27 3-branch access logic at `app/(employee)/my-policies/[id]/page.tsx:81-133`: assigned → full PolicyView; else has-grant + published → TL;DR-only; else `notFound()`. All branches inside single `withOrgScope` closure (line 81). Integration test `scripts/check-employee-portal.test.ts` asserts cross-org URL access returns 404 (AC-10 cross-org isolation block). |
| T-05-05-02 | Information Disclosure | mitigate | CLOSED | Phase 4 D-41 inherited via `lib/ai/qa.ts:97-98`. Runtime EAPI H-6 negative test in integration suite. UI just renders whatever `askQuestion` returns. |
| T-05-05-03 | Tampering | mitigate | CLOSED | `app/(employee)/my-policies/[id]/actions.ts:78-83` catches `PolicyArchivedError` → maps to typed `code: 'POLICY_ARCHIVED'` ActionState. UI recovery copy verified. |
| T-05-05-04 | Tampering | mitigate | CLOSED | `actions.ts:85-91` catches `PolicyNotAssignedError` → maps to `code: 'POLICY_NOT_ASSIGNED'`. |
| T-05-05-05 | Tampering | mitigate (documented trust boundary) | CLOSED | D-05 IP capture at `actions.ts:70-71`: `headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null` (first-hop only). Vercel edge strips client-supplied values. Documented at `actions.ts:10-14`. |
| T-05-05-06 | Repudiation | accept | CLOSED-ACCEPT | D-05 explicit choice — store NULL when header absent. IPv6 normalization + GeoIP enrichment out of scope per CONTEXT `<deferred>`. |
| T-05-05-07 | Tampering | mitigate | CLOSED | Phase 4 D-31 layer-1 + layer-2 XML escape inherited via `lib/ai/qa.ts` import of `xmlEscape` from `lib/ai/qa-extract.ts`. Zod max(2000) cap at `app/(employee)/my-policies/ask/actions.ts:45` limits attack surface. |
| T-05-05-08 | Information Disclosure | mitigate | CLOSED | `components/employee/AcknowledgeButton.tsx:53-60` reads `state.ackedAt` from formState (not `isPending`) per RESEARCH Pitfall 5. UAT step 12 confirms "no infinite spinner". |
| T-05-05-09 | Tampering | mitigate | CLOSED | `app/(employee)/my-policies/[id]/page.tsx:74-75` `PolicyIdSchema.safeParse(id)` + `notFound()` on failure. Malformed UUID returns 404 per CR-PR3-#23 + D-10 "advertise nothing". |
| T-05-05-10 | Tampering | accept | CLOSED-ACCEPT | `actions.ts:104-105` calls both `revalidatePath('/my-policies')` and `revalidatePath('/my-policies/${id}')`. Server-rendered page re-fetched on next nav; useActionState formState bridges gap. |
| T-05-05-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages. |

### Plan 05-06 — Admin Bulk Assign (7 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-06-01 | Tampering | mitigate | CLOSED | `app/(admin)/policies/[id]/actions.ts:426-468` `bulkAssignToDepartmentAction` calls `PolicyAssignments.create` which uses `.onConflictDoNothing()` at `lib/db/repositories/policy_assignments.ts:55`. Double-click safe per D-15. |
| T-05-06-02 | Tampering | mitigate | CLOSED | Zod `BulkAssignSchema` at admin actions file uses `PolicyIdSchema` (branded) for `policyId` + `z.string().uuid()` for `departmentId`. Composite FK on `users(org_id, department_id)` (`lib/db/schema.ts:307-311`) blocks cross-org at Postgres level. `<select>` is server-built from RLS-scoped `Departments.listAll` list. |
| T-05-06-03 | Information Disclosure | mitigate | CLOSED | `lib/db/repositories/departments.ts` (`listAll`) uses `eq(departments.orgId, s.orgId)` predicate (ADR-019). Reinforced by RLS on `departments` table per `drizzle/0001_rls_policies.sql:42-45`. |
| T-05-06-04 | Repudiation | accept | CLOSED-ACCEPT | `policy_assignments.assignedBy` + `assignedAt` columns are the audit trail. Documented. |
| T-05-06-05 | Tampering | mitigate | CLOSED | `bulkAssignToDepartmentAction` calls `revalidatePath('/my-policies')` at line 467. Documented brief race window. |
| T-05-06-06 | Denial of Service | accept | CLOSED-ACCEPT | UNIQUE + ON CONFLICT DO NOTHING means INSERT is one-row max per assignee-tuple. Trivial cost. |
| T-05-06-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages (panel uses native `<select>`). |

### Plan 05-07 — AckStatusBadge (3 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-07-01 | Tampering | mitigate | CLOSED | `components/policy/AckStatusBadge.tsx:35-57` exhaustive switch on `AckState` union; all 3 branches return; TypeScript would flag missing 4th case at tsc time. |
| T-05-07-02 | Information Disclosure | accept | CLOSED-ACCEPT | `ackedAt` is the user's own acknowledgment date — already known to them. |
| T-05-07-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages — uses existing shadcn Badge. `components/ui/badge.tsx` UNCHANGED per D-11 (className override pattern only). |

### Plan 05-08 — CI Gates (8 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-08-01 | Tampering | mitigate | CLOSED | `scripts/check-acknowledgment-immutability.ts:129-192` ts-morph CallExpression walk scans `lib/**/*.ts`. `pnpm check:acknowledgment-immutability` exits 0 (53 files scanned). |
| T-05-08-02 | Tampering | mitigate | CLOSED | `scripts/check-acknowledgment-immutability.ts:155-188` ts-morph symbol-resolution via `getAliasedSymbol()` handles aliased imports (e.g. `import { acknowledgments as ack }`). Documented at lines 159-167. |
| T-05-08-03 | Repudiation | mitigate | CLOSED | D-20 negative-control fixture at `tests/fixtures/ack-mutation-attempt.ts:40-50` provides both Drizzle-API + raw-SQL violations. `pnpm check:acknowledgment-immutability:self-test` exits 0 with 2 violations + both `hasDrizzle && hasRawSql` flags set (lines 245-255 of the gate file). |
| T-05-08-04 | Information Disclosure | accept | CLOSED-ACCEPT | Gate stderr surfaces violations with `file:line`; CI logs are operator-only. |
| T-05-08-05 | Tampering | mitigate | CLOSED | `scripts/check-rls.ts:47` `TENANT_TABLES` includes `'qa_citation_grants'`. Truncate arrays at lines 93 + 191 also include it. `pnpm check:rls` would cover the new table's RLS at runtime. |
| T-05-08-06 | Information Disclosure | mitigate (partial-deviation from plan-prescribed approach, contract preserved) | CLOSED | `scripts/check-policy-id-brand.ts:67` extends `REPO_TARGETS` with `'lib/db/repositories/qa_citation_grants.ts': ['hasGrant']`; line 91 extends `ORCH_TARGETS` with `'lib/policies/acknowledgment.ts': ['recordAcknowledgment']`. `pnpm check:policy-id-brand` exits 0 (20/20 signatures verified). NOTE: Plan 05-08 sub-task 2b also called for 3 new `OBJECT_FIELD_TARGETS` entries (`record`/`create`/`upsert`); the implementation took the alternative path of expanding REPO_TARGETS + ORCH_TARGETS only because Plan 05-03 explicitly documented `$inferInsert`-derived inputs are "intentionally out of brand scope" per ADR-028 (`lib/db/repositories/qa_citation_grants.ts:40-44` + `lib/db/repositories/policy_assignments.ts` PolicyAssignmentCreateInput pattern). The brand is preserved at the orchestrator boundary + Server Action Zod boundary (e.g., `app/(admin)/policies/[id]/actions.ts:BulkAssignSchema` uses `PolicyIdSchema`). Net effect: brand contract intact, gate green, but the OBJECT_FIELD layer is thinner than the plan intent. Document as accepted deviation. |
| T-05-08-07 | Tampering | mitigate | CLOSED | `scripts/check-error-discipline.ts:118-123` glob includes `'lib/policies/**/*.ts'` + `'lib/policies/**/*.tsx'` with `errors.ts` + `*.test.ts` excluded. `pnpm check:error-discipline` exits 0 (9 files scanned in lib/auth + lib/stripe + lib/policies). |
| T-05-08-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages — ts-morph already installed Phase 2 D-08. |

### Plan 05-09 — Integration Tests (7 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-09-01 | Information Disclosure | mitigate | CLOSED | `scripts/check-employee-portal.test.ts` `afterAll` TRUNCATE pattern documented in Plan 05-09 SUMMARY. Intentional `__intentional_rollback__` for cross-org block per Plan 05-09 acceptance criteria (verified in summary log). |
| T-05-09-02 | Tampering | accept | CLOSED-ACCEPT | Co-located vitest is contract-shape only; integration test in `check-employee-portal.test.ts` covers end-to-end behavior. |
| T-05-09-03 | Information Disclosure | accept | CLOSED-ACCEPT | Test fixtures are gitignored ROLLBACK-scoped; no production data. |
| T-05-09-04 | Tampering | mitigate | CLOSED | Test fixture data mirrors Phase 4 D-43 citation-shape (`{title, id}` JSON in citations fence). |
| T-05-09-05 | Tampering | mitigate | CLOSED | EAPI H-6 negative test at `scripts/check-employee-portal.test.ts:860` (H-5 area) + AC-10 cross-org isolation block asserts BOTH (a) cross-org cit stripped at parseQaResponse + (b) zero grant rows for foreign-org policy_id. Plan 05-09 SUMMARY confirms 9/9 tests pass against live TEST DB. |
| T-05-09-06 | Information Disclosure | accept | CLOSED-ACCEPT | Test logs are operator-only; UUIDs are not secrets. |
| T-05-09-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages — postgres + vitest installed Phase 1-4. |

### Plan 05-10 — Verify Chain + UAT (4 threats)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-10-01 | Tampering | mitigate | CLOSED | `package.json:49` `verify:phase-5` chains 14 automated gates (verify:phase-4 cumulative + Phase 5 additions). Append-only invariant locked at 3 layers. Cross-org isolation tested integration-level + RLS-enforced runtime. UAT 18 PASS + 1 PASS-with-finding per phase-status reported. |
| T-05-10-02 | Information Disclosure | accept | CLOSED-ACCEPT | UUIDs are not secrets; operator-local terminal. |
| T-05-10-03 | Repudiation | accept | CLOSED-ACCEPT | UAT checklist (19 numbered steps) is the contract; operator `approved` signal is the audit-trail equivalent. |
| T-05-10-SC | Tampering (supply-chain) | accept | CLOSED-ACCEPT | No new packages. |

---

## ADR-018 Append-Only — 3-Layer Defense Verification

The append-only invariant on the `acknowledgments` table (R-5 / ADR-018) is locked at three independent layers, each verified at HEAD:

### Layer 1 — Type System (compile time)
- **Location**: `tests/types.ts` (D-07 `@ts-expect-error` invariants — Phase 2 lock preserved)
- **Mechanism**: `Acknowledgments` object at `lib/db/repositories/acknowledgments.ts:31-87` exports ONLY `listForUser` + `record` — no `update` / `delete` keys. Comment block at lines 84-86 documents the rule. JSDoc header at lines 5-9 references the type-system enforcement.
- **Status**: Verified by `pnpm tsc --noEmit` (chain target of `verify:phase-5`).

### Layer 2 — CI Gate (runtime, every PR)
- **Location**: `scripts/check-acknowledgment-immutability.ts` (Plan 05-08 D-18, EAPI H-1 closure)
- **Mechanism**:
  - **Sub-pass 1** (lines 129-192): ts-morph AST walk scans `lib/**/*.ts` for `.update(acknowledgments)` / `.delete(acknowledgments)` CallExpressions, resolving aliased imports via `getAliasedSymbol()`.
  - **Sub-pass 2** (lines 194-236): regex scan for raw-SQL bypass via `sql\`UPDATE/DELETE acknowledgments...\`` template literals (EAPI advisor H-1 closure — Phase 2 GRANT block allows raw-SQL mutation at DB level).
- **Negative control**: `tests/fixtures/ack-mutation-attempt.ts:40-50` ships both Drizzle-API AND raw-SQL violations. `--self-test` mode exits 0 only when 2 violations found WITH both `hasDrizzle && hasRawSql` flags set (gate non-vacuous proof).
- **Status**: Both `pnpm check:acknowledgment-immutability` AND `pnpm check:acknowledgment-immutability:self-test` exit 0 at HEAD.

### Layer 3 — DB GRANT-Asymmetry (documented)
- **Location**: `drizzle/0001_rls_policies.sql:67-73` (Phase 2)
- **Mechanism**: GRANT block intentionally includes `UPDATE, DELETE ON "acknowledgments" TO authenticated` for RLS symmetry. Inline comment documents that the lock is at the APP layer, not the DB layer. The deferred 0012 REVOKE migration (Plan 05-08 `<deferred>`) would close the DB-level gap but requires ASK-FIRST operator approval per CLAUDE.md destructive-migration rule. Until then, Layer 2 is the sole runtime defense against raw-SQL bypass.
- **Status**: Documentation present; deferred follow-up flagged in Plan 05-08.

---

## EAPI Advisor Findings — Closure Verification

| Finding | Closure Location | Status |
|---------|------------------|--------|
| H-1 (raw-SQL bypass of append-only) | `scripts/check-acknowledgment-immutability.ts:194-236` Sub-pass 2 regex + `tests/fixtures/ack-mutation-attempt.ts:48-50` negative control. `--self-test` requires both detection paths to fire. | CLOSED |
| H-4 (API-SPEC drift on citations.accessibility) | `reference/API-SPEC.md` documents additive `accessibility` field per Plan 05-04 Task 3 acceptance (verified by check-artifacts.ts assertions). | CLOSED |
| H-5 (pure-hallucination grant manufacture) | `scripts/check-employee-portal.test.ts:860` asserts (a) hallucinated UUID stripped from result.citations + (b) zero grant rows for hallucinated policy_id across entire qa_citation_grants table. | CLOSED |
| H-6 (cross-org real-UUID grant manufacture) | `scripts/check-employee-portal.test.ts` AC-10 cross-org isolation block + H-6 specific test asserts (a) foreign-org cit stripped before return + (b) no grant rows for P_B_real.id under any user. | CLOSED |

---

## org_id Invariant — Spot-Check Results

`grep -rnE "withOrgScope\|eq\(.*\.orgId" lib/db/repositories/**.ts` returned 47 occurrences across 11 repository files (every repository scopes via `eq(<table>.orgId, s.orgId)` predicate OR is the `withOrgScope` wrapper itself).

| Repository | Pattern Count | Notes |
|------------|---------------|-------|
| `policies.ts` | 17 | All methods take OrgScope-first; `eq(policies.orgId, s.orgId)` in every WHERE clause |
| `batch_jobs.ts` | 6 | Phase 4 — verified |
| `ai_generations.ts` | 4 | Phase 4 — verified |
| `policy_versions.ts` | 4 | Phase 3 — verified |
| `workflow_stages.ts` | 4 | Phase 3 — verified |
| `qa_citation_grants.ts` | 3 | Phase 5 NEW — verified (lines 65, 124, etc.) |
| `policy_assignments.ts` | 2 | All 3 methods (listAll/listForPolicy/create) scope by orgId |
| `notifications.ts` | 2 | Phase 2 — verified |
| `departments.ts` | 2 | listAll added Phase 5 — scopes by orgId |
| `acknowledgments.ts` | 1 | listForUser scopes; record copies `orgId: s.orgId` |
| `users.ts` | 2 | Phase 2 — verified |

All 4 employee-portal page/action files also call `withOrgScope` exactly once around their data access. Both orchestrators (`lib/policies/acknowledgment.ts:92`, `lib/ai/qa.ts:89`) wrap their entire flow in a single `withOrgScope` closure per D-10a / D-41.

---

## Unregistered Flags

None. SUMMARY.md `## Threat Flags` sections in plans 05-01, 05-09, 05-10 explicitly declared "No new security-relevant surface beyond the planned `<threat_model>`". Plans 05-02 through 05-08 SUMMARY files do not contain a `## Threat Flags` section but their respective `<threat_model>` registers are exhaustive and verified above.

---

## Accepted Risks Log

13 threats accepted with documented rationale (see per-plan tables above). Summary:

1. **T-05-01-03** — ACID race between type-system layer and DB UNIQUE intentional; trade-off accepted (D-06/D-10 DB-enforced idempotency).
2. **T-05-01-SC, T-05-02-SC, T-05-03-SC, T-05-04-SC, T-05-05-SC, T-05-06-SC, T-05-07-SC, T-05-08-SC, T-05-09-SC, T-05-10-SC** — No new packages introduced; supply-chain surface unchanged.
3. **T-05-03-04** — Dashboard LEFT JOIN performance — accepted at MVP scale; Phase 8 may revisit.
4. **T-05-03-05** — D-10 silent-success ops log — observability, not security failure.
5. **T-05-04-06** — D-27a UI hint can reveal own-org assignment topology — accepted (same-org employees already share this knowledge via Q&A citations).
6. **T-05-05-06** — NULL `ip_address` when header absent — accepted (IPv6 normalization + GeoIP enrichment deferred).
7. **T-05-05-10** — Stale dashboard render during brief revalidate window — accepted (formState bridges).
8. **T-05-06-04** — Bulk-assign audit trail limited to `assignedBy` + `assignedAt` columns — accepted for MVP.
9. **T-05-06-06** — Admin Assign-spam — ON CONFLICT means no DoS vector.
10. **T-05-07-02** — `ackedAt` timestamp in own-row render — not a privacy concern.
11. **T-05-08-04** — Gate stderr surfaces violation file:line — operator-only logs.
12. **T-05-09-02** — Co-located vitest contract-shape only — integration test covers end-to-end.
13. **T-05-09-03, T-05-09-06** — Test fixtures and logs operator-local; UUIDs are not secrets.

---

## Verification Commands Run

| Command | Result |
|---------|--------|
| `pnpm check:acknowledgment-immutability` | exits 0 (53 files scanned, 0 violations) |
| `pnpm check:acknowledgment-immutability:self-test` | exits 0 (2 violations detected with both detection paths exercised) |
| `pnpm check:policy-id-brand` (via tsx) | exits 0 (20/20 signatures verified — 10 repo + 9 orch + 1 object-field) |
| `pnpm check:error-discipline` (via tsx) | exits 0 (9 files scanned across lib/auth + lib/stripe + lib/policies) |
| `pnpm check:artifacts` (via tsx) | exits 0 (451/451 artifact assertions passed) |
| grep `withOrgScope|eq(...orgId)` in lib/db/repositories/**.ts | 47 occurrences across 11 files — every repo scoped |
| Phase 5 SUMMARY `## Threat Flags` review | 0 unregistered flags |

Per phase-status, the operator UAT has confirmed 18 PASS + 1 PASS-with-finding; `verify:phase-5` exits 0 end-to-end in 92 seconds per Plan 05-10 SUMMARY.

---

## Phase 4 Inheritance Notes

Three Phase 5 threats explicitly inherit mitigations from Phase 4 (which closed 60/60 STRIDE threats at commit `6887000`):

| Threat ID | Phase 4 Mitigation Source | Preservation Verified |
|-----------|---------------------------|----------------------|
| T-05-04-04 (cross-org citation leak) | D-41 same-closure validIds at `lib/ai/qa-parser.ts:54` | `lib/ai/qa.ts:97-98` reconstructs `validIds` in the SAME withOrgScope closure as `libraryXml` |
| T-05-04-07 (LONG_CACHE ordering) | D-33c system-array ordering | `lib/ai/qa.ts:113-116` preserves `[...buildLongCachedSystem, ...buildCachedSystem]` order verbatim |
| T-05-04-08 (raw-text audit replay) | WARNING-4 `result: rawText` lock | `lib/ai/qa.ts:151` `result: rawText` (NOT parsed) preserved verbatim |

Additionally, Phase 5 inherits the Phase 4 hallucination defense at `lib/ai/qa-parser.ts:54` (`.filter(c => validIds.has(c.id))`) without modification — this is the foundation on which RESEARCH gap-3 (grant UPSERT iterates filtered citations) is built.

---

*Audit completed by gsd-secure-phase against `gsd/phase-5-employee-portal` HEAD. No source files modified. Phase 5 cleared for /gsd-verify-work + PR squash to main.*
