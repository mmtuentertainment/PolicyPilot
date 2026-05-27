# PolicyPilot Audit Remediation Plan

Date: 2026-05-27
Source audit: `.planning/audits/2026-05-27-current-state-audit/FINDINGS.md`
Goal: clean up and fix the current-state audit findings until the project has a realistic, verifiable path from Phase 5 release-hardening into Phases 6-8.

## Operating Rules

1. Do not widen scope silently. Fix the audit findings first, then resume feature work.
2. Keep every DB query tenant-scoped with `org_id`; RLS remains defense-in-depth, not the only defense.
3. Do not add packages without Matthew approval.
4. Do not delete or move local-only artifacts without Matthew approval.
5. Treat default repo commands as first-class gates. If a maintainer runs the obvious command, it should pass or fail for a real reason.
6. Preserve the clean design prototype at `C:\Users\matth\Downloads\index (4).html` as reference. Do not drop static prototype HTML into Tailwind's app scan path.

## Workstream 0 - Branch And Artifact Hygiene

Purpose: prevent local/session artifacts from contaminating the Phase 5 PR and unblock the build surface.

Tasks:

1. Decide the implementation base.
   - Preferred: create or continue a cleanup branch from `origin/gsd/phase-5-employee-portal` so the local pause-work commit is not accidentally shipped.
   - Alternative: stay on current branch but explicitly remove the handoff files from the ship diff before final PR/merge.
2. Classify untracked local artifacts:
   - `.planning/audits/` should be kept as the current remediation record.
   - `AGENTS.md` should be intentionally tracked or intentionally kept local.
   - `.codex/` should remain local unless a specific file is approved for tracking.
   - `Designprototypes/` should be moved, ignored, or converted into safe documentation; it must not remain Tailwind-scanned loose HTML.
3. Remove or quarantine the malformed root directory:
   - `CUsersmatthDesktopPolicyPilot.planningphases04-ai-layer`
   - This requires explicit approval before deletion because it is a filesystem cleanup.

Verification:

- `git status --short --branch` shows only intentional changes.
- `next build` no longer fails because of `Designprototypes/**`.
- No session handoff files are staged unless explicitly approved.

Ask-first points:

- Deleting/moving `Designprototypes/`.
- Deleting/moving the malformed `CUsers...` directory.
- Tracking `AGENTS.md`.
- Dropping or rewriting the local pause-work commit.

## Workstream 1 - Local Toolchain Restoration

Purpose: make the documented commands runnable in the same way future sessions and CI expect.

Tasks:

1. Restore normal Node/package-manager access.
   - Project declares `node >=22 <23` and `pnpm@9.15.9`.
   - Ensure `pnpm`, `npm`, and `corepack` are available on PATH, or document the approved local runtime path.
2. Install Vercel CLI globally when Matthew is ready:
   - Recommended command: `npm i -g vercel`
   - This unlocks `vercel env pull`, deployments, and logs.
3. Re-run the baseline commands through package scripts, not just bundled Node:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm verify:phase-5`

Verification:

- `pnpm --version` reports `9.15.9` or an approved compatible version.
- `node --version` satisfies the repo engine.
- `vercel --version` works if Vercel operations are needed.

Ask-first points:

- Any global install.
- Any package-manager upgrade or lockfile regeneration.

## Workstream 2 - Production Build And Lint Hygiene

Purpose: turn the obvious local gates green.

Tasks:

1. Fix the Tailwind/prototype build blocker.
   - Keep `C:\Users\matth\Downloads\index (4).html` as design reference.
   - Remove `Designprototypes/**` from Tailwind/Next scan impact by relocation, ignore config, or safe documentation conversion.
2. Update ESLint ignores so local scratch/build artifacts are excluded consistently.
   - At minimum mirror relevant `.gitignore` entries such as `.tmp/**`.
   - Consider whether `scratch/**`, `audit-cache/**`, and local generated folders should also be ignored by ESLint.
3. Run lint both ways:
   - `pnpm lint`
   - If needed for diagnosis only: `eslint . --ignore-pattern ".tmp/**"`

Verification:

- `pnpm build` / `next build` passes.
- `pnpm lint` passes without needing ad hoc command-line ignore flags.
- Remaining lint warnings, if any, are either fixed or documented as intentionally deferred.

Ask-first points:

- Moving/deleting files.
- Broad ignore additions that could hide source code from linting.

## Workstream 3 - Test Determinism

Purpose: make the test suite trustworthy as a release gate.

Tasks:

1. Add Testing Library cleanup in `tests/setup.ts`.
   - This should address duplicate DOM state like multiple `Policy content editor` labels.
2. Investigate AI test shared-state/timing behavior.
   - The default full suite failed while individual AI route tests passed.
   - Identify whether the cause is module state, timers, DB mocks, route-level mocks, or parallel worker behavior.
3. Decide whether the default Vitest config should use stricter isolation/single-fork behavior.
   - Prefer fixing state leaks first.
   - Use single-fork only if the tests are inherently stateful and the tradeoff is documented.
4. Re-run:
   - `pnpm test`
   - targeted AI route tests
   - `pnpm check:ai-layer`
   - `pnpm check:employee-portal`

Verification:

- Full default `pnpm test` passes from a clean run.
- Re-running the full suite still passes.
- Dedicated Phase 4 and Phase 5 harnesses continue passing.

Ask-first points:

- Weakening/excluding tests.
- Lowering concurrency globally instead of fixing an identifiable leak.

## Workstream 4 - Server-Only Resolution

Purpose: make standalone validation scripts resolve server-only modules correctly.

Tasks:

1. Confirm intended dependency shape.
   - The code imports `server-only`.
   - The lockfile references `server-only@0.0.1`, but it is absent from top-level `node_modules` in the audited install.
2. Choose one fix:
   - Add explicit `server-only` dependency, with Matthew approval.
   - Or update standalone validation runners/config so they resolve the existing test stub or Next-equivalent server condition safely.
3. Re-run:
   - `pnpm check:auth-context`
   - `pnpm check:policies-list-filters`
   - `pnpm verify:phase-5`

Verification:

- Both standalone checks pass without module-resolution failures.
- Client bundles still cannot accidentally import server-only code.

Ask-first points:

- Adding `server-only` to `package.json`.
- Any change that alters server/client bundling behavior.

## Workstream 5 - Artifact And Architecture Gates

Purpose: close red or stale custom gates rather than bypassing them.

Tasks:

1. Resolve `check-artifacts` Q&A route failure.
   - Preferred: restore `app/api/ai/qa/route.ts` to the intended thin-wrapper contract.
   - Alternative: update the contract only if the extra lines represent intentionally required behavior.
2. Update `scripts/check-deploy-schema.ts` for Phase 5.
   - Add `qa_citation_grants` to tenant-table checks.
   - Add Phase 5 unique-constraint assertions.
   - Add `qa_citation_grants` column-shape assertions.
   - Add wrapped-RLS and expected index assertions matching `scripts/check-schema.ts`.
   - Refresh stale comments and success output from Phase 4 to Phase 5.
3. Extend immutability coverage if needed.
   - Current acknowledgment immutability gate passes.
   - Consider whether `qa_citation_grants` needs its own mutation/append discipline gate or explicit documented exception.

Verification:

- `pnpm check:artifacts` passes.
- `pnpm db:verify` passes against local/dev target.
- `pnpm verify:phase-5` includes the updated deploy/schema confidence where appropriate.

Ask-first points:

- Changing artifact contract thresholds.
- Schema/data-model changes.
- Any destructive migration.

## Workstream 6 - Planning Truth Reconciliation

Purpose: make `.planning/` a reliable handoff source again.

Tasks:

1. Update `.planning/STATE.md` to reflect actual current position.
   - Phases 1-4 shipped.
   - Phase 5 code appears complete but is blocked by audit remediation until gates are green.
   - Phases 6-8 are not complete.
2. Update `.planning/ROADMAP.md` top-level checkboxes and phase status to match reality.
   - Phase 4 should not be shown as unchecked if it has shipped.
   - Phase 5 should be marked as in hardening/release review, not full product readiness.
3. Record this audit/remediation plan as the current continuation point.

Verification:

- `STATE.md`, `ROADMAP.md`, branch status, and audit plan no longer contradict each other.
- The next action is unambiguous for a fresh session.

Ask-first points:

- Marking Phase 5 as shipped/complete.
- Editing historical claims beyond status correction.

## Workstream 7 - Product Gaps And Phase Roadmap

Purpose: distinguish release-hardening from actual MVP completion.

Tasks:

1. Keep these out of Phase 5 remediation unless Matthew explicitly promotes them:
   - Billing and Stripe subscription lifecycle.
   - Renewal survival via `invoice.paid`.
   - Customer portal and checkout.
   - Resend email templates.
   - Railway worker/crons.
   - Dashboard charts and CSV export.
   - Final 8 acceptance criteria.
2. Create or update Phase 6/7/8 plans only after Phase 5 hardening gates are green.
3. Decide admin usability scope:
   - Implement department/user management now if internal UAT requires it.
   - Otherwise document manual seeding until the appropriate phase.

Verification:

- Phase 5 remediation does not pretend to close Phase 6-8.
- Product-readiness language is honest: employee portal milestone vs full SaaS MVP.

Ask-first points:

- Starting Phase 6/7/8 implementation.
- Adding new admin management features outside the locked phase scope.
- Any Stripe/security-relevant architecture decision.

## Workstream 8 - Final Verification Sweep

Purpose: prove the cleanup is done with current evidence.

Required final gates:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. `pnpm check:db-imports`
6. `pnpm check:rls`
7. `pnpm check:auth-context`
8. `pnpm check:policies-list-filters`
9. `pnpm check:admin-routes`
10. `pnpm check:error-discipline`
11. `pnpm check:policy-id-brand`
12. `pnpm check:artifacts`
13. `pnpm check:acknowledgment-immutability`
14. `pnpm check:acknowledgment-immutability:self-test`
15. `pnpm check:ai-prompts`
16. `pnpm check:ai-layer`
17. `pnpm check:employee-portal`
18. `pnpm db:verify`
19. `pnpm verify:phase-5`

Browser/UAT follow-up:

- Once `pnpm build` is green, run a local app smoke through the browser:
  - marketing page loads
  - admin policy list/editor still renders
  - employee my-policies page renders
  - employee Q&A page renders
  - no obvious layout overlap/regression

Completion criteria:

- All P0/P1 audit findings are fixed or intentionally reclassified with evidence.
- P2 findings are either fixed, documented as future-phase work, or converted into explicit roadmap tasks.
- The final report lists each audit finding with status: fixed, deferred by design, or superseded.
- The goal is not complete until the final verification sweep proves the current tree.
