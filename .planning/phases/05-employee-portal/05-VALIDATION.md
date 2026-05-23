---
phase: 5
slug: employee-portal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed dimension-by-dimension analysis lives in `05-RESEARCH.md` § Validation Architecture.
> This file is the executable contract; RESEARCH.md is the rationale.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (co-located `*.test.ts`) + raw postgres-js integration scripts |
| **Config file** | `vitest.config.ts` (Phase 3) + `scripts/check-employee-portal.ts` (new — Phase 5 D-22) |
| **Quick run command** | `pnpm tsc --noEmit && pnpm test --run lib/db/repositories lib/policies app/(employee)` |
| **Full suite command** | `pnpm verify:phase-5` |
| **Estimated runtime** | ~60-90 seconds (Phase 4 chain + new check-acknowledgment-immutability + check-employee-portal integration) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit` (D-21 guarantee per CLAUDE.md ALWAYS rule)
- **After every plan wave:** Run `pnpm test --run` (vitest co-located tests)
- **Before `/gsd:verify-work`:** `pnpm verify:phase-5` must be green
- **Max feedback latency:** ≤ 90 seconds for the full verify chain (per D-23 chained-coverage pattern)

---

## Per-Task Verification Map

> Populated by gsd-planner as plans are generated. Each task gets one row mapping to a SPEC requirement.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-XX-XX | _TBD by planner_ | _TBD_ | REQ-{ack-tracking,ack-rules} | _TBD_ | _TBD_ | unit / integration | _TBD_ | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Test infrastructure that must exist before tasks can execute. Phase 5 has minimal Wave 0 because Phase 4 already shipped most infra.

- [ ] `lib/db/repositories/acknowledgments.test.ts` — co-located vitest for `record()` body (per D-21)
- [ ] `lib/db/repositories/policy_assignments.test.ts` — co-located vitest for `create()` body (per D-21)
- [ ] `lib/db/repositories/policies.test.ts` — extend with `listAssignedAndPublishedForUser` cases (per D-21)
- [ ] `lib/db/repositories/qa_citation_grants.test.ts` — NEW (T-2(4c) — per D-21)
- [ ] `lib/policies/acknowledgment.test.ts` — orchestrator unit tests (per D-21)
- [ ] `app/(employee)/my-policies/[id]/actions.test.ts` — Server Action vitest mocking shape (per D-21)
- [ ] `app/(employee)/my-policies/ask/actions.test.ts` — R-6 Server Action vitest (mocking lib/ai/qa per D-23a, mirror Phase 4 check-ai-layer.test.ts pattern)
- [ ] `tests/fixtures/ack-mutation-attempt.ts` — NEGATIVE-CONTROL fixture (R-5 acceptance — proves D-18 gate non-vacuous via --self-test mode per D-20)
- [ ] `scripts/check-acknowledgment-immutability.ts` — NEW ts-morph CI gate (D-18; pattern mirrors `scripts/check-policy-id-brand.ts` per RESEARCH gap-4)
- [ ] `scripts/check-employee-portal.ts` — NEW integration script (D-22; pattern mirrors `scripts/check-rls.ts` + `scripts/check-policies-list-filters.ts`)
- [ ] `scripts/check-rls.ts` — extend `TENANT_TABLES` array to include `'qa_citation_grants'` (RESEARCH gap-2)
- [ ] `scripts/check-policy-id-brand.ts` — extend `REPO_TARGETS` + `OBJECT_FIELD_TARGETS` for Phase 5 brand-bearing surfaces (RESEARCH gap-4)
- [ ] `scripts/check-schema.ts` — extend Phase 5 column-shape assertions (acknowledgments UNIQUE constraint exists; qa_citation_grants table+columns+RLS exist)
- [ ] `scripts/check-artifacts.ts` — append-only Phase 5 block asserting all new files exist
- [ ] `package.json` — `check:acknowledgment-immutability` + `check:acknowledgment-immutability:self-test` + `check:employee-portal` script entries; `verify:phase-5` chain

**Wave 0 framework install:** None required — vitest + postgres-js + ts-morph are all Phase 1-4 dependencies.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Employee can sign in via Clerk and trampoline lands at `/my-policies` (not 404) | REQ-acknowledgment-tracking (R-1) | Clerk Org membership must be set in a real session; vitest mocks Clerk so the full sign-in→trampoline→/my-policies flow needs a live browser smoke | (1) Operator creates a new Clerk user via dev dashboard; (2) Assigns to test org; (3) Signs in via `/sign-in`; (4) Verifies landing is `/my-policies` with empty-state "No policies assigned yet" card visible |
| Admin "Assign to department" affordance is visible on `/policies/[id]` for admin users only | REQ-acknowledgment-tracking (R-4) | Combines Clerk role narrowing + RLS + UI render — easier to spot-check than to script | (1) Admin signs in; (2) Opens `/policies/<seeded-id>`; (3) Sees PolicyAssignmentsPanel below PolicyTransitionMenu per D-13; (4) Selects a seeded department; (5) Clicks "Assign to department"; (6) Refreshes — sees the assignment row appear in panel |
| `/my-policies/ask` UI renders citations as clickable links with the `accessibility` flag visual hint (D-27a) | REQ-acknowledgment-tracking (R-6) | Visual styling assertion (italic for tldr-only) — vitest can assert the prop but the rendered styling needs eyeballs | (1) Employee signs in; (2) Navigates to `/my-policies/ask`; (3) Submits a question; (4) Sees answer + citations list; (5) Verifies tldr-only citations have subtle italic styling per D-27a |
| TL;DR-only banner copy matches the exact wording from D-27/CONTEXT.md `<specifics>` | REQ-acknowledgment-tracking (R-6 boundary) | Exact-string assertion in vitest is brittle for UI copy; operator spot-check after first render | Operator visits `/my-policies/<id>` for a citation-granted-but-not-assigned policy; confirms banner reads exactly: "This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access." |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (planner must populate Per-Task Verification Map)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (planner enforces)
- [ ] Wave 0 covers all MISSING references (see Wave 0 Requirements above)
- [ ] No watch-mode flags (Phase 5 uses one-shot `--run` per D-21)
- [ ] Feedback latency < 90s (verify:phase-5 chain target)
- [ ] `nyquist_compliant: true` set in frontmatter (after planner populates verification map)

**Approval:** pending — planner populates verification map then operator approves
