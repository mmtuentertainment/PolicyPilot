---
phase: 05-employee-portal
plan: 10
type: execute
wave: 5
depends_on:
  - 05-01
  - 05-02
  - 05-03
  - 05-04
  - 05-05
  - 05-06
  - 05-07
  - 05-08
  - 05-09
files_modified:
  - package.json
autonomous: false
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "package.json verify:phase-5 chain target exists per D-23: pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal"
    - "pnpm verify:phase-5 exits 0 end-to-end against live dev DB + TEST DB"
    - "Operator UAT confirms 5 user-visible behaviors per SPEC R-1..R-6 acceptance"
    - "tests/types.ts D-07 @ts-expect-error invariants still pass (R-5 acceptance — type-system layer preserved end-to-end)"
  artifacts:
    - path: "package.json"
      provides: "verify:phase-5 chain target"
      contains: "verify:phase-5"
  key_links:
    - from: "package.json verify:phase-5"
      to: "Phase 4 chain + Phase 5 gates + Phase 5 integration test"
      via: "&& chained shell composition (sequential)"
      pattern: "verify:phase-5"
---

<objective>
Wave 5 phase-closeout. Two tasks:

1. **AMEND** `package.json` to add the `verify:phase-5` chain target per D-23. Wire the full chain: `pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal`. Then run it end-to-end and confirm exit 0.

2. **OPERATOR UAT CHECKPOINT** — checkpoint:human-verify gate per CLAUDE.md Validation Gate convention. Operator visits each Phase 5 surface in a live browser against the dev DB + Clerk dev session, confirms 5 user-visible behaviors per SPEC R-1..R-6 acceptance, and approves before phase-closeout.

Purpose: SPEC's 13th acceptance criterion is `pnpm verify:phase-5 exits 0`. The 11 user-visible acceptance criteria require operator eyeballs on the live UI to confirm shipping quality. This plan is the phase-closeout gate.

Output: One package.json amend + one operator-approved UAT checkpoint. After approval, this phase is ready for `/gsd-verify-work` → PR squash to main.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-VALIDATION.md
@CLAUDE.md
@package.json

<wave_grouping_rationale>
Wave 5 is the operator-gated phase-closeout. It depends on EVERY prior plan (05-01 through 05-09) because the verify chain runs them all. The UAT checkpoint is a `checkpoint:human-verify` gate per CLAUDE.md Validation Gate convention — operator approval required before phase-closeout. The chain composition is auto-derived from D-23.
</wave_grouping_rationale>

<interfaces>
<!-- D-23 chain composition (verbatim from CONTEXT.md):
verify:phase-5 = pnpm verify:phase-4
              && pnpm check:acknowledgment-immutability
              && pnpm check:acknowledgment-immutability:self-test
              && pnpm check:employee-portal
-->

Phase 4 chain (existing):
verify:phase-4 = pnpm verify:phase-3 && pnpm check:ai-prompts && pnpm check:ai-layer

Phase 3 chain (existing):
verify:phase-3 = pnpm typecheck && pnpm check:db-imports && pnpm check:rls && pnpm check:auth-context && pnpm check:policies-list-filters && pnpm check:admin-routes && pnpm check:error-discipline && pnpm check:policy-id-brand && pnpm check:artifacts && pnpm test && node -e "require('fs').rmSync('.tmp/svix-url.json', { force: true })"
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add verify:phase-5 chain target to package.json + run end-to-end</name>
  <files>package.json</files>
  <read_first>
    - package.json (whole file — scripts block at lines 9-46; existing verify:phase-4 entry at line 45; Plan 05-08 added check:acknowledgment-immutability + :self-test; Plan 05-09 added check:employee-portal)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Test Strategy & verify:phase-5 (D-23 verbatim)
  </read_first>
  <action>
Add the `verify:phase-5` chain target to `package.json` per D-23 verbatim:
```json
"verify:phase-5": "pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal",
```

Insert AFTER the existing `verify:phase-4` entry (line 45). Preserve all other script entries.

After saving, run `pnpm verify:phase-5` end-to-end. Expected behavior:
1. `pnpm verify:phase-4` chains into `verify:phase-3` (12 gates: tsc + db-imports + rls + auth-context + policies-list-filters + admin-routes + error-discipline + policy-id-brand + artifacts + test + svix-cleanup) → then check:ai-prompts + check:ai-layer
2. `pnpm check:acknowledgment-immutability` (Plan 05-08 D-18 gate) — scans lib/**/*.ts, exits 0
3. `pnpm check:acknowledgment-immutability:self-test` (Plan 05-08 D-20 reverse-interpreted mode) — scans tests/fixtures/ack-mutation-attempt.ts, exits 0 (proves gate non-vacuous)
4. `pnpm check:employee-portal` (Plan 05-09 integration test) — runs vitest against live TEST DB + mocked Anthropic, covers R-1+R-3+R-4+R-6+AC-10

Total runtime estimate: 60-90 seconds (Phase 4 chain ~30s + Phase 5 additions ~30-60s for integration test).

If any step fails:
- typecheck fail → tsc regression in prior plan's code; surface to operator (most likely Plan 05-03/05-04/05-05 typed-error mapping or PolicyId brand issue)
- check:rls fail on `'qa_citation_grants'` not found → Plan 05-08 TENANT_TABLES extension missing OR Plan 05-01 migration not applied
- check:policy-id-brand fail → Plan 05-08 brand-target dict extension missing OR Plan 05-03/05-04 surface signature missing PolicyId brand
- check:error-discipline fail in lib/policies/** → Plan 05-08 widening exposed a stray `throw new Error(...)` somewhere; address by typed-error class migration
- check:artifacts fail in Phase 5 block → Plan 05-08 assertion vs reality mismatch; reconcile
- check:acknowledgment-immutability fail in default mode → ADR-018 violation leaked past Plan 05-03 → URGENT; surface to operator
- check:acknowledgment-immutability:self-test fail → gate is broken (not detecting the intentional violation); fix detection logic
- check:employee-portal fail → integration test against TEST DB found a behavior mismatch; surface specific assertion that failed

Document end-to-end runtime in SUMMARY.

DO NOT add additional gates not specified in D-23. DO NOT short-circuit any step.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm verify:phase-5</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `pnpm verify:phase-5` exits 0 end-to-end (against live dev DB + TEST DB)
    - `grep -c "verify:phase-5" package.json` returns 1
    - The chain composition in package.json matches D-23 verbatim — `grep "verify:phase-5" package.json | grep -c "verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal"` returns 1
    - The whole package.json scripts block has 4 new total Phase 5 entries: check:acknowledgment-immutability, :self-test, check:employee-portal, verify:phase-5 — `grep -cE "(check:acknowledgment-immutability|check:employee-portal|verify:phase-5)" package.json` returns at least 4
    - All Phase 1-4 script entries preserved verbatim (no accidental removal)
    - SUMMARY.md notes the end-to-end runtime (target ≤90s per VALIDATION.md sampling rate)
  </acceptance_criteria>
  <done>
    verify:phase-5 chain wired and green; runtime within budget.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Operator UAT — visit all Phase 5 surfaces in live dev environment + confirm 5 user-visible behaviors per SPEC</name>
  <files>(no source files modified — operator UAT against live dev DB + Clerk dev session)</files>
  <action>Operator manually executes the 19 numbered verification steps in &lt;how-to-verify&gt; against live dev environment (pnpm dev + Clerk dev session). Confirms 5 user-visible SPEC acceptance behaviors (R-1 dashboard, R-2 ack, R-3 re-ack indicator, R-4 admin bulk-assign, R-6 Q&A surface) + 3-layer append-only invariant per R-5 (tsc + ts-morph gate + DB doc). Responds with `approved` to unblock phase-closeout; describes specific step + failure mode if any check fails.</action>
  <what-built>
    Phase 5 ships the full employee-portal surface:
    - Real `/my-policies` dashboard listing assigned+published policies (replacing the 03-G3 T9 stub)
    - One-click Acknowledge on `/my-policies/[id]` writing append-only row with IP + version
    - Re-acknowledgment indicator after admin republishes (amber badge "Requires re-acknowledgment")
    - Admin bulk-assign-to-department UI on existing `/policies/[id]` page
    - R-6 Q&A surface at `/my-policies/ask` with cited answers + tldr-only fallback access via grants

    All backed by 3-layer append-only invariant defense (type-test + ts-morph gate + DB GRANT-asymmetry-documented), 3 additive schema migrations (0010 + 0011), and verify:phase-5 chain (just-shipped Task 1).
  </what-built>
  <how-to-verify>
    **Setup (one-time):**
    1. Confirm dev environment is running: `pnpm dev` (Next.js dev server on http://localhost:3000)
    2. Confirm at least 1 admin user + 1 employee user provisioned in Clerk dev org (Plan 02-02 D-09 manual config)
    3. Sign in via http://localhost:3000/sign-in

    **For ADMIN-side test (use admin user — has `publicMetadata.role === 'admin'`):**
    1. Navigate to http://localhost:3000/policies — confirm Phase 3 admin list visible
    2. Click into an existing published policy (or create + publish one if none exist via Phase 3 flow)
    3. **R-4 / SPEC AC-7 + AC-8 check:** Scroll to bottom of `/policies/[id]` — confirm the new "Assignments" Card is visible AFTER PolicyTransitionMenu (D-13 placement)
    4. If 0 departments exist in the org: confirm dept-selector + Assign button are DISABLED with "Create a department first" tooltip text visible (D-14 empty-state UX)
    5. If departments exist: select a dept, click "Assign to department" — confirm "✓ Assigned" appears
    6. Refresh the page — confirm the assignment shows in the read-only list at top of the panel

    **For EMPLOYEE-side test (sign out, sign in as employee — `publicMetadata.role === 'employee'`):**
    7. Trampoline routes to http://localhost:3000/my-policies — confirm landing page
    8. **R-1 / SPEC AC-1 + AC-2 + D-04a check:**
       - If 0 policies assigned: confirm empty-state Card with EXACT copy `No policies assigned yet — contact your administrator.` (long em-dash)
       - If 1+ policies assigned: confirm only assigned-AND-published policies visible (Draft / Under Review never appear)
    9. **D-24 / R-6 affordance check:** Confirm "Ask the AI" link visible in /my-policies header
    10. Click into one assigned policy → `/my-policies/[id]`
    11. **R-2 / SPEC AC-3 + AC-4 check:** Confirm PolicyView renders full content + Acknowledge button visible (if ackState === 'none' or 'stale')
    12. Click Acknowledge → confirm "✓ Acknowledged on {date}" appears INLINE (no page reload, no infinite spinner — RESEARCH Pitfall 5 mitigation working)
    13. Refresh page → confirm green checkmark badge persists; Acknowledge button is gone
    14. **R-3 / SPEC AC-5 + AC-6 check:**
        - Switch to admin user; navigate to that same policy; click Edit → make a small change → Save Draft → Publish
        - Switch back to employee user; refresh `/my-policies`
        - Confirm policy now shows amber "Requires re-acknowledgment" badge per D-11
        - Click into policy → confirm "Re-acknowledge" button visible; click it; confirm new green badge with NEW date
        - Verify via dev DB query (psql or scripts/check-employee-portal pattern): `SELECT COUNT(*) FROM acknowledgments WHERE user_id=$employee AND policy_id=$policy` returns 2 (both v1 + v2 rows preserved per ADR-018)
    15. **R-6 / SPEC AC-11 check:** Navigate to `/my-policies/ask` → type a question → Submit
        - Confirm answer renders inline below the form
        - If any citations returned: confirm they're clickable Links to `/my-policies/[id]`
        - Confirm `accessibility: 'tldr-only'` citations have italic styling per D-27a
    16. **D-27 boundary check:** Click an italic (tldr-only) citation Link → confirm page shows:
        - Policy title
        - The amber-bordered banner with EXACT copy `This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access.`
        - Only the TL;DR summary (NOT the full PolicyView render)
        - NO Acknowledge button
    17. **Cross-org isolation check:** Manually navigate to `/my-policies/00000000-0000-4000-8000-000000000000` (random UUID NOT in DB) → confirm 404 NextNotFound page (D-10 advertise-nothing per CR-PR3-#23)

    **For administrative type-system invariant check:**
    18. Run `pnpm tsc --noEmit` → confirm exit 0 (tests/types.ts D-07 @ts-expect-error invariants still passing — R-5 acceptance partially)
    19. Run `pnpm verify:phase-5` end-to-end → confirm exit 0 (13th SPEC acceptance criterion + R-5 full)

    **Resume signal:** Type `approved` (case-insensitive) to confirm all 19 checks pass + Phase 5 ready for `/gsd-verify-work` and PR squash to main. If any check fails, describe the specific check + failure mode (e.g., "step 8 — empty-state copy says 'No policies' instead of the verbatim D-04a string") and Claude will fix before re-checkpointing.
  </how-to-verify>
  <verify>
    <automated>echo "Operator UAT — human-gated; resume-signal: approved"</automated>
  </verify>
  <done>Operator types `approved` after all 19 checks pass; Phase 5 ready for /gsd-verify-work + PR squash to main.</done>
  <resume-signal>Type `approved` (all 19 checks pass) OR describe specific failure (e.g., "step 12 shows infinite spinner")</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| operator local browser → Next.js dev server | dev env only; not exposed to internet; Clerk dev keys |
| dev DB writes from UAT clicks | persisted to dev Supabase; pre-paying-customer status per STATE.md (no production data to corrupt) |
| operator approval signal → phase closeout | binding human gate per CLAUDE.md Validation Gate convention |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-10-01 | Tampering | UAT happy-path passes but a future regression slips past automated gates | mitigate | verify:phase-5 chain combines 14 automated gates (Phase 1-4 cumulative + Phase 5 additions) plus integration test against live TEST DB. The append-only invariant is locked at 3 layers (type-test + ts-morph + GRANT-doc). Cross-org isolation tested integration-level + RLS-enforced runtime. Regression surface is small. |
| T-05-10-02 | Information Disclosure | UAT step 13 manual DB query exposes user/policy/org UUIDs in operator's terminal | accept | UUIDs are not secrets; operator-local terminal; no log forwarding. Acceptable. |
| T-05-10-03 | Repudiation | Operator approves but later contests phase quality | accept | The UAT checklist (19 numbered steps) is the contract; operator's `approved` signal is the audit-trail equivalent of git commit signature. Future disputes resolved by re-running the checklist. |
| T-05-10-SC | Tampering | npm installs | accept | No new packages — UAT only exercises shipped surfaces. |
</threat_model>

<verification>
- Task 1: `pnpm verify:phase-5` exits 0 end-to-end
- Task 2: operator approval via `approved` resume signal
- Final closeout check: `pnpm tsc --noEmit` + `pnpm verify:phase-5` both green; tests/types.ts D-07 invariants still pass
</verification>

<success_criteria>
- `verify:phase-5` chain target wired in package.json
- `pnpm verify:phase-5` exits 0 end-to-end
- Operator UAT approved — all 19 numbered checks pass
- Phase 5 ready for `/gsd-verify-work` → squash to main
- Append-only invariant verified at all 3 layers (type-test + ts-morph CI + DB doc)
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-10-SUMMARY.md` when done — document end-to-end runtime of `pnpm verify:phase-5`, the operator's UAT approval signal, any UAT-surfaced fixes that were resolved before approval, and the next-step note for `/gsd-verify-work` + PR squash-merge to main.

Also flag the staging+prod migration follow-up: per CLAUDE.md Database Migration Discipline, after PR squash-merge to main, operator runs `pnpm db:migrate:staging` + `pnpm db:verify:staging` (then operator-approval gate + `pnpm db:migrate:prod` + `pnpm db:verify:prod`) for migrations 0010 + 0011 to apply to staging/prod environments.
</output>
