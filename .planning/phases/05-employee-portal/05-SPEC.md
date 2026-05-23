# Phase 5: Employee Portal — Specification

**Created:** 2026-05-23
**Ambiguity score:** 0.183 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

An authenticated employee on `/my-policies` sees every `status='published'` policy assigned to them or their department, can one-click acknowledge from the policy detail page (writing one append-only `acknowledgments` row with `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}`), and is re-prompted to acknowledge whenever an admin republishes the policy — with the prior acknowledgment row preserved verbatim.

## Background

The schema, RLS policies, and append-only invariant are all locked. `lib/db/repositories/acknowledgments.ts` and `lib/db/repositories/policy_assignments.ts` already export the correct OrgScope-first signatures with throw-stubs marked `"Not yet implemented — Phase 5"`; the type system already forbids `update`/`delete` on `Acknowledgments` (the repository object exports neither key, and `tests/types.ts` carries `@ts-expect-error` assertions that fail `tsc` if either is ever added). The `(employee)/my-policies` route exists from Plan 03-G3 T9 as a static "Employee portal — coming soon" Card so trampoline-routed non-admins land on a 200 instead of a 404; that page is replaced wholesale by this phase.

`publish()` and `editPublished()` in `lib/policies/transitions.ts` already produce the version lineage Phase 5 needs: `editPublished` snapshots the prior content into `policy_versions` and bumps `policies.current_version`, then the next `publish()` writes a new vN snapshot. The "requires re-acknowledgment" check is therefore a pure SELECT join — no new transition behavior is needed in this phase. Phase 4's `POST /api/ai/qa` endpoint is reachable by any authenticated user but has no employee UI surface; ADR-029 (2026-05-21) explicitly states Phase 5 SC 1–5 do not consume Phase 4 AI surfaces, so the Q&A UI is deferred.

## Requirements

1. **Assigned + published dashboard query**: `/my-policies` returns only policies that are `status='published'` AND have a `policy_assignments` row matching the viewer.
   - Current: `Policies.listPublishedForOrg(s)` returns *all* published policies in the org without any assignment filter. No assignment-aware repository method exists; `/my-policies/page.tsx` is the 03-G3 T9 stub Card that renders no data.
   - Target: New `Policies.listAssignedAndPublishedForUser(s, userId, departmentId)` returns the subset of org-scoped published policies where there exists a `policy_assignments` row with either `(assignee_type='user' AND assignee_id=userId)` OR `(assignee_type='department' AND assignee_id=departmentId)`. The new `/my-policies` page (Server Component) calls this method inside `withOrgScope` and renders one card per row.
   - Acceptance: Seed test (vitest + TEST DB) — 4 policies: P1 published+assigned-to-user, P2 published+assigned-to-dept (matching user's dept), P3 draft+assigned-to-user, P4 published+unassigned. Query returns exactly P1 and P2 (count = 2); P3 (draft) and P4 (unassigned) are absent.

2. **One-click acknowledgment write**: Clicking "Acknowledge" inserts one row into `acknowledgments` with the full 5-field shape.
   - Current: `Acknowledgments.record(_s, _input)` throws `"Not yet implemented — Phase 5 (Employee Portal)"`; no Server Action exists.
   - Target: New Server Action `acknowledgePolicyAction(formData)` at `app/(employee)/my-policies/[id]/actions.ts` — Zod-validates `policyId` (lifted to `PolicyId` brand per ADR-028); opens `withOrgScope`; resolves `policyVersionId` from the `policy_versions` row matching `(policy_id, version_number = policies.current_version)`; reads `ipAddress` from the `x-forwarded-for` request header (first comma-separated hop; `null` if header absent); calls `Acknowledgments.record(s, { policyId, policyVersionId, userId: s.userId, ipAddress })`; calls `revalidatePath('/my-policies')` and `revalidatePath('/my-policies/[id]', 'page')` (outside try/catch per Phase 3 D-09 convention).
   - Acceptance: Integration test — POST the Server Action with a known `policyId` against a published policy at version N; assert exactly one new row in `acknowledgments` with `user_id=s.userId`, `policy_id=policyId`, `policy_version_id` = the `policy_versions.id` for `(policy_id, version_number=N)`, `acknowledged_at` not null, `ip_address` matches the test's `x-forwarded-for` first hop. After action returns, a fresh GET of `/my-policies` shows the policy in "Acknowledged" state (no re-ack indicator).

3. **Re-acknowledgment indicator on republish**: After `editPublished()`+`publish()`, the policy reappears as "Requires re-acknowledgment" on `/my-policies` with prior ack rows untouched.
   - Current: `editPublished()` bumps `policies.current_version` and creates a new `policy_versions` row at the new version on the next `publish()`. No employee-facing query computes "user has not acked the current version" — the stub `/my-policies` renders no data.
   - Target: The list query from R1 returns a derived boolean `requiresReacknowledgment` per row, computed as: "no `acknowledgments` row exists where `user_id = s.userId` AND `policy_id = p.id` AND `policy_version_id = (SELECT id FROM policy_versions WHERE policy_id = p.id AND version_number = p.current_version)`". The UI renders a "Requires re-acknowledgment" badge (visually distinct shadcn `Badge` variant) when `requiresReacknowledgment === true` AND prior acknowledgments exist for this `(user, policy)` pair (so the badge differentiates "re-ack" from "first-time ack"; first-time acks get a plain "Acknowledge" CTA, not the badge). Existing `acknowledgments` rows are NEVER mutated.
   - Acceptance: Integration test — (a) employee acks policy P at v1, (b) admin runs `editPublished` then `publish` (v2 row written to `policy_versions`), (c) `/my-policies` query for that employee returns P with `requiresReacknowledgment=true`, (d) SELECT COUNT(*) FROM acknowledgments WHERE user_id=employee AND policy_id=P = 1 (the v1 row untouched), (e) after employee clicks Acknowledge again, COUNT becomes 2 (v1 + v2 rows both present) and `requiresReacknowledgment=false`.

4. **Bulk department assignment writes one row**: Assigning a policy to a department creates a single `policy_assignments` row with `assignee_type='department'`, visible to every user in that department.
   - Current: `PolicyAssignments.create(_s, _input)` throws `"Not yet implemented — Phase 5 (Employee Portal — bulk assign)"`; no admin UI exists for assignment in the policy detail page.
   - Target: Thin admin assignment surface on the existing `/policies/[id]` page (Phase 3) — a new Server Action `bulkAssignToDepartmentAction({ policyId, departmentId })` that calls `PolicyAssignments.create(s, { policyId, assigneeType: 'department', assigneeId: departmentId, assignedBy: s.userId })` inside `withOrgScope`. Admin UI presents a dropdown of org departments (sourced via `Departments.listAll`) and an "Assign to department" button. Single-user assignment (`assigneeType='user'`) is technically supported by the same repository method but no UI ships in Phase 5 for it (see Boundaries).
   - Acceptance: Integration test — Seed dept D with 3 members and policy P at status `published`. Admin calls `bulkAssignToDepartmentAction({ policyId: P, departmentId: D })`. SELECT COUNT(*) FROM policy_assignments WHERE policy_id=P AND assignee_type='department' AND assignee_id=D = exactly 1 (NOT 3). All 3 dept members' `/my-policies` queries (R1) return P.

5. **Append-only acknowledgments enforced in code + CI**: No application path mutates or deletes acknowledgment rows; the invariant is locked at both compile time and CI time.
   - Current: `lib/db/repositories/acknowledgments.ts` exports only `listForUser` + `record` (the latter still a throw-stub). `tests/types.ts` (D-07) carries `@ts-expect-error` lines proving the absence of `update` and `delete` keys at compile time. ADR-018 documents the rule. No grep-level CI gate exists yet.
   - Target: After Phase 5 ships, the type-system invariant still holds (`tsc --noEmit` still exits 0 with D-07 type tests active). A new ts-morph-grade CI gate `scripts/check-acknowledgment-immutability.ts` scans `lib/**/*.ts` (excluding `tests/types.ts` fixture) and fails non-zero on any call expression matching `.update(acknowledgments)`, `.delete(acknowledgments)`, `Acknowledgments.update`, or `Acknowledgments.delete`. The gate is wired into `pnpm verify:phase-5`.
   - Acceptance: `pnpm tsc --noEmit` exits 0 with the existing D-07 `@ts-expect-error` lines passing. `pnpm check:acknowledgment-immutability` exits 0 against the shipped phase-5 code; the same script exits non-zero against a deliberate negative-control fixture (a stubbed file under `tests/fixtures/ack-mutation-attempt.ts` that calls `.update(acknowledgments)`) — gate proven to actually catch the violation it claims to catch.

## Boundaries

**In scope:**
- `app/(employee)/layout.tsx` — minimal auth gate (any authenticated `userId`, no role narrowing — admins can also be policy-assigned, so role filtering would be wrong here)
- `app/(employee)/my-policies/page.tsx` — real Server Component listing assigned+published policies, replacing the 03-G3 T9 stub Card wholesale
- `app/(employee)/my-policies/[id]/page.tsx` — policy detail Server Component rendering TipTap `contentJson` via `generateHTML` (reuse the Phase 3 `PolicyView` component verbatim) + Acknowledge button (Client Component) wired to the Server Action
- `app/(employee)/my-policies/[id]/actions.ts` — `acknowledgePolicyAction` Server Action
- `lib/db/repositories/acknowledgments.ts` — fill `record()` body
- `lib/db/repositories/policy_assignments.ts` — fill `create()` body
- `lib/db/repositories/policies.ts` — add `listAssignedAndPublishedForUser(s, userId, departmentId)` method (returns rows + `requiresReacknowledgment` boolean column)
- `lib/policies/acknowledgment.ts` (new orchestrator) — IP capture from `x-forwarded-for`, `policyVersionId` resolution from `policies.current_version`, transaction-wrapped insert via `withOrgScope`
- Admin assignment UI: thin "Assign to department" affordance on the existing `/policies/[id]` page (Phase 3) — Server Action + `Departments.listAll` dropdown
- Server Action `bulkAssignToDepartmentAction` on the admin policy detail page
- `scripts/check-acknowledgment-immutability.ts` — new ts-morph CI gate
- `package.json` — new `check:acknowledgment-immutability` script + `verify:phase-5` chain entry
- `scripts/check-artifacts.ts` — append-only Phase 5 block asserting all new files exist
- `tests/fixtures/ack-mutation-attempt.ts` (or equivalent) — negative-control fixture proving the new CI gate actually catches violations (see R5 acceptance)
- Re-acknowledgment indicator UI (shadcn Badge variant) on `/my-policies` cards

**Out of scope:**
- Employee Q&A UI surface — ADR-029 (2026-05-21) explicitly states Phase 5 SC 1–5 do not consume Phase 4 AI surfaces. The `POST /api/ai/qa` endpoint already exists from Phase 4 and is reachable by any authenticated user, but no employee Q&A page or component ships in Phase 5. (The Phase 5 ROADMAP entry's goal narrative mentions Q&A; the explicit SC list does not — SC governs.)
- Email notifications (assignment / re-ack required / review-due / ack-reminder) — Phase 7 (REQ-notification-system; Resend + React Email + Railway cron)
- In-app notification bell with unread count — Phase 7
- Individual user assignment admin UI (`assigneeType='user'` from a UI) — repository method supports it, but Phase 5 SC #4 covers only the bulk-department case; individual assignment is deferred to a thin admin polish PR or absorbed into a later phase's scope
- Reviewer-role surface (`workflow_stages` queue UI) — Phase 6+ (Reviewer role is Growth+ gated per REQ-tier-growth; tier gating ships in Phase 6)
- Acknowledgment rate reports + CSV export — Phase 8 (REQ-compliance-dashboard)
- Recharts donut visualization — Phase 8
- "Policies due for review" cadence cron — Phase 7
- IP address validation, IPv6 normalization, GeoIP enrichment — record `x-forwarded-for` first hop verbatim or NULL; downstream consumers (audit reports) can validate at read time
- Acknowledgment receipt PDF / email-to-employee — out (not in any REQ)
- Bulk "acknowledge all" UX — single-policy ack only per SC #2

## Constraints

- Repository methods MUST take `OrgScope` first parameter (ADR-023) — no bare `OrgContext`.
- All user-facing DB traffic MUST go through `withOrgScope` (ADR-025) — RLS predicate plus application-layer `eq(orgId)` both fire.
- `Acknowledgments` repository MUST continue to export NO `update` or `delete` keys (ADR-018) — type-system enforced at compile time; new CI gate enforces at grep time.
- IP capture reads ONLY the `x-forwarded-for` request header's first comma-separated hop. If absent, store `NULL` (not connection-level IP — middleware runs at the Vercel edge and connection-level IP is the CDN's, not the user's).
- Policy content rendering MUST reuse the existing Phase 3 `PolicyView` component (`generateHTML` on TipTap `contentJson`) — no new render path.
- Server Actions MUST Zod-validate inputs (Phase 3 D-09 convention).
- Server Actions MUST call `redirect`/`revalidatePath` outside any try/catch block (Next.js 15 requirement; Phase 3 D-09).
- `policyId` parameters MUST adopt the `PolicyId` brand at the trust boundary (ADR-028); downstream code passes the already-branded value.
- No new schema migrations. No new ADRs. No new tables, columns, or indexes. The schema delta from Phase 2 onward already supports every Phase 5 requirement.
- No new packages beyond the locked stack — no new dependencies in `package.json`.
- `tsc --noEmit` MUST exit 0 on every commit boundary (CLAUDE.md ALWAYS rule).

## Acceptance Criteria

- [ ] `/my-policies` returns only policies where `status='published'` AND assignment matches the viewer's `(userId, departmentId)` — verified by 4-row seed test (R1 acceptance).
- [ ] Draft + Under Review policies never appear in any employee-facing query path — verified by R1 seed test (P3 draft is absent from result).
- [ ] One-click Acknowledge inserts exactly one `acknowledgments` row with all 5 fields populated (R2 acceptance).
- [ ] UI updates without page reload after acknowledgment — verified via `revalidatePath` call site present in `acknowledgePolicyAction` AND vitest assertion that the action calls revalidatePath.
- [ ] After `editPublished`+`publish` cycle, `/my-policies` shows the policy with "Requires re-acknowledgment" badge (R3 acceptance b–c).
- [ ] Prior `acknowledgments` rows persist unchanged across the republish — verified by SELECT COUNT(*) before/after edit (R3 acceptance d).
- [ ] Bulk-assign-to-department creates exactly one `policy_assignments` row with `assignee_type='department'` (R4 acceptance — explicit COUNT = 1, not N for N dept members).
- [ ] All members of the assigned department see the policy in their `/my-policies` (R4 acceptance final assertion).
- [ ] `pnpm tsc --noEmit` exits 0 — `tests/types.ts` D-07 `@ts-expect-error` lines still pass (Acknowledgments has no update/delete).
- [ ] `pnpm check:acknowledgment-immutability` exits 0 against shipped code AND exits non-zero against the negative-control fixture (R5 acceptance — gate proven non-vacuous).
- [ ] Cross-org isolation: User in Org A with a `departmentId` UUID that collides with a `departments.id` UUID in Org B (constructed test) does NOT see Org B policies — verified by integration test seeding both orgs with overlapping UUIDs and asserting `/my-policies` for the Org-A user contains zero Org-B rows.
- [ ] `pnpm verify:phase-5` exits 0 (orchestrator wires: tsc + check-artifacts Phase 5 block + check-acknowledgment-immutability + vitest suites for R1–R5).

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                                             |
|--------------------|-------|------|--------|---------------------------------------------------------------------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | 5 explicit SC; Q&A goal-text-vs-SC nuance resolved out by ADR-029                                 |
| Boundary Clarity   | 0.78  | 0.70 | ✓      | Bulk-dept admin UI required (SC #4 needs an actor); individual-user assignment intentionally out  |
| Constraint Clarity | 0.80  | 0.65 | ✓      | ADR-018/019/023/025/028 all locked; schema unchanged; IP capture = x-forwarded-for first hop      |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 12 pass/fail checks; type-test + new ts-morph gate both prove append-only invariant               |
| **Ambiguity**      | 0.183 | ≤0.20| ✓      | 1 − (0.35×0.85 + 0.25×0.78 + 0.20×0.80 + 0.20×0.82)                                                |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

`--auto` mode: initial ambiguity (0.183) already ≤ 0.20 with all dimensions ≥ their minimums on the first assessment — Socratic interview loop skipped per workflow Step 3 short-circuit. Decisions auto-derived from ROADMAP.md Phase 5 entry + REQ-acknowledgment-tracking + REQ-acknowledgment-rules + ADR-018/019/023/025/028/029 + STATE.md "Next: /gsd-spec-phase 5" entry point.

| Round | Perspective    | Decision auto-locked                                                                                   |
|-------|----------------|--------------------------------------------------------------------------------------------------------|
| 0     | Researcher (codebase scout) | `Acknowledgments.record` + `PolicyAssignments.create` are throw-stubs ready for Phase 5 body; D-07 `@ts-expect-error` invariant active; `/my-policies` is a 03-G3 T9 stub Card; ADR-018 append-only locked; `publish()`/`editPublished()` already produce the version lineage Phase 5 needs |
| 0     | Boundary Keeper (auto)      | Q&A UI is OUT — ROADMAP SC #1–5 don't mention it AND ADR-029 explicitly states "Phase 5 SC 1–5 do not consume Phase 4 AI surfaces". Goal-narrative mention is non-binding per SC-governs convention |
| 0     | Boundary Keeper (auto)      | Bulk-dept admin assignment UI is IN — SC #4 ("bulk assignment to a department creates one row... is visible to every member") cannot be exercised end-to-end without an admin actor; thin UI on existing `/policies/[id]` page |
| 0     | Failure Analyst (auto)      | Append-only enforcement gets a new ts-morph CI gate AND a negative-control fixture proving the gate is non-vacuous; type-test from Phase 2 is necessary but not sufficient (it covers the repository module only; a future helper could in principle smuggle a raw `.update(acknowledgments)` past the type test from a different file) |
| 0     | Failure Analyst (auto)      | IP capture from `x-forwarded-for` first hop only (Vercel edge; connection-level IP would be the CDN's); store NULL when header absent rather than synthesizing |
| 0     | Seed Closer (auto)          | Re-ack indicator computed as a SELECT-time join, not a denormalized column — no schema change required; the `policyVersions(policy_id, version_number)` UNIQUE constraint from 03-G3 T2/T3 makes the lookup deterministic |

---

*Phase: 05-employee-portal*
*Spec created: 2026-05-23*
*Next step: /gsd-discuss-phase 5 — implementation decisions (HOW: department-dropdown source for admin UI, IP-header parsing edge cases, re-ack badge variant, vitest fixture shape, ts-morph traversal pattern for the new CI gate, exact return-shape of `listAssignedAndPublishedForUser` including the `requiresReacknowledgment` boolean derivation)*
