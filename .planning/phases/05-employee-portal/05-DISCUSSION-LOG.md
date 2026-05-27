# Phase 5: Employee Portal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `05-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 05-employee-portal
**Workflow:** `/gsd-spec-phase 5 --auto` → `/gsd-discuss-phase 5 --full --power` → ultrathink tightening pass
**Areas discussed:** Dashboard Query Design, Acknowledgment Server Action, Re-Acknowledgment UI, Admin Bulk-Assignment UI, Append-Only CI Gate, Test Strategy & verify:phase-5, Phase 4 Q&A Reconciliation, Schema Safety, Tightening (T-1..T-7), Mid-flight corrections

---

## Section 1: Dashboard Query Design (Policies.listAssignedAndPublishedForUser)

### Q-01 — Re-acknowledgment flag derivation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Single SQL query with LEFT JOIN — derive `requiresReacknowledgment` as a SELECT expression. One round-trip; tightest perf. Mirrors `Policies.listWithFilters` complexity. | ✓ |
| (b) | Two queries — list assigned+published, then list this user's acks; join in app layer. Two RTTs. | |
| (c) | Three queries — assignments, then policies, then acks; join in app layer. Three RTTs; most decomposable. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** None. Aligns with `Policies.listWithFilters` precedent (Phase 3 D-05). See T-1 below for return-shape refinement that came up during ultrathink pass.

### Q-02 — Department-less users (users.departmentId IS NULL) handling

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | User-only assignments visible — `assignee_id = NULL` is never true, so dept-less users see only user-level. | ✓ |
| (b) | Empty-state with helpful message — render `/my-policies` empty + "Your administrator hasn't assigned you to a department yet". | |
| (c) | Hard error / block page render — throw at Server Component level if departmentId is null. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** None.

### Q-03 — Where the user's departmentId comes from at request time

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Sub-select inline in the query — `assignee_id IN (SELECT department_id FROM users WHERE id = $userId AND org_id = $orgId)`. Zero extra round-trips. | ✓ |
| (b) | Extend OrgContext to include departmentId — adds 1 RTT to every getOrgContext. | |
| (c) | Fetch fresh inside the Server Component — call Users.findByClerkUserId before listAssignedAndPublishedForUser. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** None.

---

## Section 2: Acknowledgment Server Action (acknowledgePolicyAction)

### Q-04 — IP address header source

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Strict x-forwarded-for first hop. Matches SPEC R2 verbatim. | ✓ |
| (b) | Fallback chain — `cf-connecting-ip` → `x-real-ip` → `x-forwarded-for`. Defensive. | |
| (c) | x-real-ip only — single non-list header. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** None.

### Q-05 — Double-click / replay idempotency (COUPLED with Q-23)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Schema UNIQUE on (user_id, policy_id, policy_version_id) + ON CONFLICT DO NOTHING. DB-enforced. | ✓ |
| (b) | Accept duplicates — every click writes a row. | |
| (c) | App-layer SELECT-then-INSERT inside the same transaction. Race-prone. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default. Consistent with Q-23(a).
**Notes:** Triggers CLAUDE.md ASK-FIRST for schema change; additive UNIQUE, operator-approved by selecting (a).

### Q-06 — Acknowledged-while-archived handling

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Reject with 400 + typed error "This policy was archived. Refresh to update your list." | ✓ |
| (b) | Allow — record the ack against the last-published version. | |
| (c) | Silent no-op — return success without inserting. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Implementation surfaces as `PolicyArchivedError` per T-4.

### Q-07 — Acknowledged-while-unassigned handling

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Reject with 403 + UI message "You are no longer assigned this policy". | ✓ |
| (b) | Allow — the user did see and engage; record ack even if assignment was removed. | |
| (c) | Silent no-op — same UX as (a) but doesn't expose the assignment change. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Implementation surfaces as `PolicyNotAssignedError` per T-4.

### Q-08 — Server Action file location

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | `app/(employee)/my-policies/[id]/actions.ts` — co-located with detail page. Matches Phase 3 precedent. | ✓ |
| (b) | `app/(employee)/actions.ts` — shared at route-group level. | |
| (c) | `lib/policies/acknowledgment.ts` — pure module + thin Server Action wrapper. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** None.

---

## Section 3: Re-Acknowledgment UI

### Q-09 — Re-ack indicator visual treatment

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Shadcn Badge with new 'warning' variant — orange-amber background + "Requires re-acknowledgment" text. | ✓ |
| (b) | Inline AlertCircle icon + small amber text — lower visual weight. | |
| (c) | Card left-border accent (amber 4px) + small badge — highest prominence. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Refined during mechanical lockdown — use Badge className override (PolicyStatusBadge precedent), NOT a new CVA variant. See CONTEXT D-11.

### Q-10 — First-time ack vs re-ack differentiation

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Badge ONLY on re-ack — first-time = clean card; re-ack = warning badge + "Re-acknowledge" button. | ✓ |
| (b) | Same UI for both. | |
| (c) | Both badged, different colors. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Third "acked-current" state not in original Q-10 options; resolved via T-1 below — single `ackState` enum exhausts all three.

---

## Section 4: Admin Bulk-Assignment UI

### Q-11 — Assignment surface location

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Inline panel at bottom of `/policies/[id]` — single-page workflow. | ✓ |
| (b) | Modal dialog triggered by 'Assign' button — shadcn Dialog. | |
| (c) | Dedicated `/policies/[id]/assignments` page — full route. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Component order — PolicyView → PolicyTransitionMenu → new `PolicyAssignmentsPanel`.

### Q-12 — Empty-departments UX

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Disable assignment button + tooltip "Create a department first"; link to admin settings. | ✓ |
| (b) | Inline "Create department" flow — small + button next to selector. | |
| (c) | Hide assignment surface entirely until at least one department exists. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** No working admin-settings page exists; tooltip is informational only (no link target). T-5 documents the empty-dept gap as a Phase 5 known limitation.

### Q-13 — Duplicate-assignment guard (COUPLED with Q-22)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | DB UNIQUE on (policy_id, assignee_type, assignee_id) + ON CONFLICT DO NOTHING. | ✓ |
| (b) | App-layer check before insert — race-prone. | |
| (c) | Accept duplicates — store both rows; query uses DISTINCT or IN. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default. Consistent with Q-22(a).
**Notes:** Triggers CLAUDE.md ASK-FIRST for schema change; additive UNIQUE.

### Q-14 — Un-assign affordance scope

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Out of scope for Phase 5 — read-only list of assignments; deferred. | ✓ |
| (b) | In scope — same surface gets a 'Remove' button + confirm dialog. | |
| (c) | In scope but soft-delete only — add `revokedAt` column to policy_assignments. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Workaround for misassign: edit-policy + re-publish forces re-ack on the new version.

---

## Section 5: Append-Only CI Gate (scripts/check-acknowledgment-immutability.ts)

### Q-15 — Gate implementation approach

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | ts-morph AST traversal — type-aware; resilient to formatting/comments. | ✓ |
| (b) | Regex with comment-stripping — lighter dep footprint; misses aliased imports. | |
| (c) | Hybrid — ts-morph for repository + lib/policies/transitions.ts; regex elsewhere. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Mirror `scripts/check-policy-id-brand.ts` pattern.

### Q-16 — Scope of the scan

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Whole `lib/**/*.ts` excluding tests/types.ts fixture + tests/fixtures/* — broad sweep. | ✓ |
| (b) | Repository file only — tightest. | |
| (c) | Whole repo — most paranoid. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Defense-in-depth on top of Phase 2's `check-db-imports.ts`.

### Q-17 — Negative-control fixture wiring

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Sibling fixture under `tests/fixtures/ack-mutation-attempt.ts` + spawn the gate as subprocess; assert non-zero exit. | ✓ |
| (b) | Vitest unit test with inline-string fixture — gate exposes a testable function. | |
| (c) | No negative-control test — trust the gate code. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Implementation: single gate script with `--self-test` mode (default scans lib/, --self-test scans fixture and reverse-interprets) per CONTEXT D-20.

---

## Section 6: Test Strategy & verify:phase-5 Chain

### Q-18 — Vitest organization for Phase 5 tests

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Co-located unit tests + scripts/ integration tests — matches Phase 3+4 precedents. | ✓ |
| (b) | Centralized under `tests/phase-5/`. | |
| (c) | All co-located — even integration tests. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Co-located unit files: 6 new `.test.ts` files (acks/assignments/policies/qa_citation_grants repos + acknowledgment orchestrator + 2 Server Actions). Integration: `scripts/check-employee-portal.ts`.

### Q-19 — Integration test DB strategy

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Raw postgres-js + BYPASSRLS seed + SET LOCAL ROLE authenticated + ROLLBACK. | ✓ |
| (b) | Vitest + Drizzle on TEST DB — beforeAll seeds via Drizzle. | |
| (c) | Mocks for everything — vi.mock('@/lib/db') canned rows. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Mirrors Phase 2 `check-rls.ts` + Phase 3 G3 `check-policies-list-filters.ts`.

### Q-20 — verify:phase-5 chain composition

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | `verify:phase-4 && check:acknowledgment-immutability && check:employee-portal` — chain forward. | ✓ |
| (b) | Discrete — verify:phase-5 = typecheck + check:artifacts + new gates + test; skip Phase 3/4 gates. | |
| (c) | Hybrid — verify:phase-5 = verify:phase-4 && [Phase 5 gates]; add verify:phase-5-fast for inner loop. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default.
**Notes:** Co-located vitest `.test.ts` files run via chained `pnpm test` inside `verify:phase-3`. Self-test mode added for negative-control fixture per CONTEXT D-23.

---

## Section 7: Phase 4 Q&A Surface Reconciliation

### Q-21 — Employee-side Q&A affordance

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Omit entirely — no Q&A link, button, or sidebar item. ADR-029 + SPEC boundaries binding. | (initially selected, then corrected to (c)) |
| (b) | Disabled placeholder link — sidebar/topbar "Ask the AI" + "Coming soon" tooltip. | |
| (c) | Wire it through — ship thin `/my-policies/ask` page calling existing POST `/api/ai/qa`. | ✓ |
| (d) | Custom | |

**User's choice:** (c) — operator OVERRIDE of Claude's recommended (a).
**Notes:** Initially answered (a) in the HTML editor; operator corrected to (c) after the answer-application pass via the chat message "no 21 was c". This override triggered a SPEC.md amendment (R-6 added; Out-of-Scope rebalanced; ambiguity re-scored 0.183 → 0.162). See "Mid-flight Corrections" section below.

---

## Section 8: Schema Safety — UNIQUE Constraints

### Q-22 — UNIQUE on policy_assignments(policy_id, assignee_type, assignee_id) (COUPLED with Q-13)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Add it — new migration; mirrors 03-G3 T2/T3 belt-and-suspenders pattern. | ✓ |
| (b) | Skip — rely on app-layer dedup or accept duplicates. | |
| (c) | Add but defer to Phase 5.5 polish — track in follow-up issue. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default. Consistent with Q-13(a).
**Notes:** CLAUDE.md ASK-FIRST trigger; additive (no DROP). Operator approved by selecting (a). Combined into single migration `0010_phase5_uniques.sql` with Q-23(a) per T-6.

### Q-23 — UNIQUE on acknowledgments(user_id, policy_id, policy_version_id) (COUPLED with Q-05)

| Option | Description | Selected |
|--------|-------------|----------|
| (a) | Add it — new migration; enables ON CONFLICT DO NOTHING. | ✓ |
| (b) | Skip — accept duplicates; audit consumers dedupe at read time. | |
| (c) | Add but defer — Phase 5.5 polish. | |
| (d) | Custom | |

**User's choice:** (a) — recommended default. Consistent with Q-05(a).
**Notes:** CLAUDE.md ASK-FIRST trigger; additive. Combined into `0010_phase5_uniques.sql` per T-6.

---

## Tightening Pass (T-1..T-7) — Post-Power-Mode Ultrathink

Triggered by operator request: "ultrathink anything else you can think of that needs tightening down". Surfaced 7 load-bearing gaps the planner would have to guess from the 23 power-mode answers alone.

### T-1 — Dashboard query return shape (refines Q-01 + Q-09 + Q-10)

| Option | Description | Selected |
|--------|-------------|----------|
| (A) | Single bool `requiresReacknowledgment` — SPEC R-3 wording; needs second derivation in UI. | |
| (B) | Two bools `isAcknowledged + requiresReacknowledgment + ackedAt` — explicit but redundant (true,true is impossible). | |
| (C) | Single enum `ackState: 'none' \| 'current' \| 'stale' + ackedAt` — three legal states, exhaustive switch in UI. | ✓ |

**User's choice:** (C).
**Notes:** Matches PolicyStatusBadge exhaustive-switch precedent (Phase 3). Mid-discussion ultrathink surfaced that the original Q-01/Q-09/Q-10 trio didn't cover the "acked-current" UI state; (C) closes the gap.

### T-2 — Q&A citation accessibility (R-6 ripple)

| Option | Description | Selected |
|--------|-------------|----------|
| (1) | Filter server-side — drop unaccessible citations from response. Cleanest minimum-viable. | |
| (2) | Render-as-text fallback — citation `{title, id, accessible}`; UI renders link or plain text. | |
| (3) | Allow `/my-policies/[id]` to render any org-published — biggest scope. | |
| (4) | Hybrid: TL;DR-only view for unassigned-but-org-published — most nuanced. | ✓ |

**User's choice:** (4) — operator OVERRIDE of Claude's recommended (1).
**Notes:** Phase 5 SPEC R-6 + REQ-access-control had implicit conflict; operator chose the richest UX path. Triggered sub-question T-2-sub for scoping mechanism.

### T-2-sub — TL;DR-only access scoping mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| (4b) | Citation-referral query token `?via=citation` — spoofable but security boundary holds. | |
| (4a) | Universal — any org-published returns TL;DR. Conflicts with REQ-access-control wholesale. | |
| (4c) | Server-tracked Q&A→citation grant — DB row records grants; most audit-friendly. | ✓ |
| revert | Revert to T-2(1) — filter server-side, no TL;DR fallback. | |

**User's choice:** (4c) — operator override of Claude's recommended (4b).
**Notes:** Adds new `qa_citation_grants` table + repository + grant-issue step in `askQuestion` orchestrator + access-aware `/my-policies/[id]` rendering. Migration `0011_qa_citation_grants.sql`. R-6 expands accordingly per CONTEXT D-26 + D-27.

### T-3 — R-6 implementation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| (A) | Extract to `lib/ai/qa.ts::askQuestion(ctx, question)` — small Phase 4 refactor, DRY. | ✓ |
| (B) | Duplicate ~50 lines in Server Action — zero Phase 4 changes, drift risk. | |
| (C) | HTTP-fetch `/api/ai/qa` from Server Action — runtime weirdness, worst path. | |

**User's choice:** (A) — recommended default.
**Notes:** Refactors `app/api/ai/qa/route.ts` into a ~30-line HTTP wrapper around the extracted helper. Phase 4 D-41 validIds + D-33c LONG_CACHE + D-36 PII log + WARNING-4 raw-result all preserved as askQuestion invariants.

### T-4 — Error class location

| Option | Description | Selected |
|--------|-------------|----------|
| Recommended | New `lib/policies/errors.ts` with `PolicyDomainError` hierarchy mirroring ADR-026; widen check-error-discipline. | ✓ |

**User's choice:** Approved as recommended (no alternatives presented; in the T-4..T-7 batch approval).
**Notes:** New classes: `PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError`. Consumers narrow via `instanceof PolicyDomainError` then per-Class.

### T-5 — Empty-departments handling

| Option | Description | Selected |
|--------|-------------|----------|
| Recommended | Document as Phase 5 known limitation; operator seeds first dept via DB. R4 acceptance test seeds via BYPASSRLS. | ✓ |

**User's choice:** Approved as recommended.
**Notes:** `Departments.create()` body + admin dept-create UI deferred to Phase 6+ admin user-management.

### T-6 — Migration cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Recommended | Single combined `drizzle/0010_phase5_uniques.sql` covers Q-22 + Q-23 — matches Phase 4 `0007` bundle pattern. | ✓ |

**User's choice:** Approved as recommended.
**Notes:** A second migration `0011_qa_citation_grants.sql` was added separately for the new table per T-2(4c) — distinct logical concept.

### T-7 — ON CONFLICT DO NOTHING UX

| Option | Description | Selected |
|--------|-------------|----------|
| Recommended | Silent success — UI shows "Acknowledged ✓" identically whether INSERT lands or no-ops. Log no-op for ops observability. | ✓ |

**User's choice:** Approved as recommended.
**Notes:** Idempotency invisible to user is the point. Ops can monitor unusual no-op rates.

---

## Mid-flight Corrections

### Q-21 correction (a → c)

**Timeline:**
1. Operator answered all 23 questions in HTML; export PDF.
2. Claude scraped PDF, applied all answers as (a). Coupling check passed; committed `af0fdf5`.
3. Operator chat message: "no 21 was c".
4. Claude updated JSON Q-21 to (c). Surfaced SPEC conflict via AskUserQuestion.
5. Operator chose "Amend SPEC.md — add R-6 Q&A surface".
6. Claude amended SPEC.md (R-6 added, In-Scope/Out-of-Scope rebalanced, ambiguity re-scored 0.183 → 0.162, Interview Log marked Boundary Keeper "Q&A out" decision as OVERRIDDEN).
7. Committed `1254257` (combined Q-21 correction + SPEC amendment).

**Impact:** Triggered R-6 + T-2 + T-3 (R-6 ripple effects).

### SPEC.md amendment

**Date:** 2026-05-23 (mid-discussion, post-Q-21 correction).
**Triggered by:** Q-21 = (c) operator override.
**Changes:**
- Added R-6 (Employee Q&A surface) with Current / Target / Acceptance triplet
- Moved "Employee Q&A UI surface" from Out-of-Scope to In-Scope
- Added 13th acceptance criterion (employee submits Q&A → answer + citations)
- Updated verify:phase-5 chain reference R1–R5 → R1–R6
- Ambiguity re-scored: 0.183 → 0.162 (Boundary +0.07, AC +0.02)
- Interview Log gained new "Operator (Q-21)" row + Boundary Keeper auto-decision marked OVERRIDDEN

**Rationale documented in SPEC R-6:** ADR-029's "Phase 5 SC 1–5 do not consume Phase 4 AI surfaces" was motivated by Wave-1 parallel execution gating. Phase 4 shipped 2026-05-22, so Phase 5 consuming `/api/ai/qa` is no longer a parallelism blocker. No new ADR; ADR-029 stands as-ratified.

---

## Claude's Discretion

Per CONTEXT.md, the following are not explicit operator decisions; the planner has flexibility within the constraint set:
- Exact SQL formatting + JOIN order in `Policies.listAssignedAndPublishedForUser`
- Component file structure under `components/employee/` vs `components/policy/` for new Phase-5-specific UI bits
- Tailwind class composition for the TL;DR-only banner (D-27)
- Vitest mock factory shape for the R-6 integration test (mirror Phase 4 patterns)
- Order of operations inside the `askQuestion` orchestrator after `parseQaResponse` (grant-INSERT before or after the citations-array return)

---

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section. Summary of items raised during discussion or surfaced by codebase scout that belong in OTHER phases:

- Email notifications (Phase 7) — `policy_assigned`, `policy_updated`, `review_due`, `ack_reminder`
- In-app notification bell (Phase 7)
- Reviewer-role surface — Phase 6+
- Acknowledgment rate reports + CSV export + Recharts donut — Phase 8
- Individual-user assignment admin UI — Phase 6+
- `Departments.create()` body + admin dept-create UI — Phase 6+ (per T-5)
- Un-assign affordance + soft-delete — Phase 6+ or polish PR (per Q-14)
- Q&A rate-limiting / tier gating — Phase 6+ if Phase 4 D-46 cost trigger fires
- Q&A streaming response — Future polish phase
- `qa_citation_grants` cleanup cron — Phase 7+ if data volume warrants
- REQ-access-control narrow exception (D-27 grant-based TL;DR access) — treat as SPEC R-6 footnote if compliance audit raises

---

## Statistics

- **Questions asked:** 23 (power-mode) + 7 (tightening) + 1 (Q-21 correction prompt) + 1 (SPEC amendment confirmation) = 32 decision points
- **Operator-overrode-recommendation:** 2 (Q-21: a→c; T-2: 1→4 then sub 4b→4c)
- **Recommended-defaults accepted:** 22 power-mode + 5 tightening (T-1, T-3, T-4, T-5, T-6, T-7) = 28 (note: T-3, T-4, T-5, T-6, T-7 had implicit "recommended" framing in the T-4..T-7 batch approval)
- **chat_more notes:** 0 (no free-form annotations from operator)
- **Couplings verified consistent:** Q-05↔Q-23 (both a) + Q-13↔Q-22 (both a) — zero conflicts
- **CLAUDE.md ASK-FIRST triggers approved:** 3 additive schema migrations (Q-22, Q-23, T-2(4c))
- **SPEC.md amendments:** 1 (R-6 added)
- **New ADRs ratified:** 0 (ADR count stays at 29)

---

*Generated by `/gsd-discuss-phase 5 --full --power` finalize step.*
*Audit trail companion to `05-CONTEXT.md` (which is the canonical input for `/gsd-plan-phase 5`).*
