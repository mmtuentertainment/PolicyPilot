# PolicyPilot Current-State Audit

Date: 2026-05-27
Branch: `gsd/phase-5-employee-portal`
Local state: one local commit ahead of `origin/gsd/phase-5-employee-portal`
Scope: current local tracked repo plus visible untracked project state (`AGENTS.md`, `.codex/`, `Designprototypes/`). This audit does not prove absence of all issues; it records observed code, architecture, validation, planning, and product-readiness risks with reproducible checks.
Update after prototype review: the repo-local `Designprototypes/` file is not the clean design prototype. It is a Claude-style exported prompt/code-snippet document. The newer design prototype at `C:\Users\matth\Downloads\index (4).html` is a separate static landing/prototype concept centered on "one policy system, three lenses."

## Executive Summary

PolicyPilot is not currently in a realistic customer-ready state. The Phase 5 employee-portal work has substantial green evidence, especially around RLS, tenant scoping, route discipline, branded IDs, AI/employee harnesses, and acknowledgment immutability. However, the current local project state is blocked by a failed production build, unreliable default test/lint commands, missing local package-manager/runtime tooling, stale deployment verification, and planning documents that disagree about what is actually complete.

The most important near-term move is to stabilize the Phase 5 ship surface before starting Phase 6 billing. Treat this as a release-hardening pass: fix the build, make default gates deterministic, update deploy schema verification for Phase 5, clean local handoff/prototype state, and sync `.planning/` truth.

## Validation Matrix

| Gate | Result | Notes |
|---|---:|---|
| TypeScript: `tsc --noEmit` via bundled Node | PASS | No type errors observed. |
| Production build: `next build` | FAIL | Tailwind scans untracked `Designprototypes/...html` and emits broken CSS from escaped arbitrary URL syntax. |
| Default ESLint: `eslint .` | FAIL | `.tmp/**` scratch files are linted. |
| ESLint with `.tmp/**` ignored | PASS with warnings | 15 warnings remain. |
| Default Vitest full suite | FAIL | 230/235 passed; AI tests failed under full parallel run. |
| Vitest target AI files individually | PASS | Suggests shared-state/timing/test-isolation issue, not deterministic product failure in those files. |
| Vitest single-fork full suite | FAIL | AI failures cleared; `PolicyEditor` duplicate editor labels exposed missing cleanup/isolation. |
| `scripts/check-artifacts.ts` | FAIL | `app/api/ai/qa/route.ts` is 55 lines; gate expects <= 50. |
| `scripts/check-db-imports.ts` | PASS | Raw DB imports remain allow-listed. |
| `scripts/check-admin-routes.ts` | PASS | No admin route violations observed. |
| `scripts/check-error-discipline.ts` | PASS | Error discipline gate passed. |
| `scripts/check-policy-id-brand.ts` | PASS | 20/20 signatures branded. |
| `scripts/check-acknowledgment-immutability.ts` | PASS | No mutation calls found in `lib/**`. |
| `scripts/check-rls.ts` | PASS | 12 tenant-scoped tables isolated with positive control. |
| `scripts/check-auth-context.ts` | FAIL | Standalone runner cannot resolve `server-only`. |
| `scripts/check-policies-list-filters.ts` | FAIL | Same `server-only` module-resolution failure. |
| `scripts/check-ai-layer.test.ts` | PASS | 8 tests passed via dedicated config. |
| `scripts/check-employee-portal.test.ts` | PASS | 9 tests passed via dedicated config. |
| `scripts/check-schema.ts` | PASS | Test DB verifies 12 tenant tables and `qa_citation_grants`. |
| `scripts/check-deploy-schema.ts` | PASS but stale | Deploy verifier checks only 11 tenant tables; it does not yet cover Phase 5 `qa_citation_grants`. |
| `scripts/check-ai-prompts.ts` | PASS | Prompt contract gate passed. |

## Ranked Findings

### P0 - Current local production build is red

`next build` fails in the current local checkout because Tailwind scans an untracked repo-local prototype/export containing an escaped arbitrary URL class:

`Designprototypes/ookingforsomethingmoreaggressiveandcutting....html`

The emitted CSS tries to resolve `./&` from `app/globals.css`. This may not reproduce on clean CI if `Designprototypes/` is absent, but it makes the current project state non-buildable and dangerous to accidentally track. This is not caused by the cleaner `C:\Users\matth\Downloads\index (4).html` prototype.

Recommended fix: move the Claude-export/snippet file outside the app repo, add an explicit ignore/exclusion for `Designprototypes/**`, or normalize any intended prototype into a tracked design artifact that Tailwind does not scan.

### P0 - Phase 5 cannot be considered ship-clean until default gates are deterministic

The narrow Phase 5 harnesses pass, but default project validation does not:

- Full Vitest fails under the default parallel run.
- Single-fork Vitest still exposes a `PolicyEditor` DOM cleanup/isolation leak.
- Default ESLint fails because `.tmp/**` is not ignored.
- `check-artifacts` fails the Q&A route thin-wrapper line-count rule.

Recommended fix: make the default commands that a future maintainer will run match the project gates. Add Testing Library cleanup, fix or isolate shared test state, ignore scratch directories in ESLint, and either refactor `app/api/ai/qa/route.ts` below the contract or update the contract intentionally.

### P0 - Deploy schema verifier is stale for Phase 5

`scripts/check-schema.ts` verifies `qa_citation_grants`, but `scripts/check-deploy-schema.ts` still describes the deploy gate as Phase 4 deploy-prep and checks only 11 tenant tables. That means staging/prod deploy preflight can pass without proving the Phase 5 schema surface that employee Q&A citations depend on.

Recommended fix: update `scripts/check-deploy-schema.ts` to include `qa_citation_grants` RLS, grants, expected columns, uniqueness/index invariants, and any Phase 5 required shape.

### P1 - `server-only` is imported but not available to standalone validation runners

Many server modules import `server-only`, but `node_modules/server-only` is absent in the current local install. This blocks `check-auth-context` and `check-policies-list-filters`. The package is present in the lockfile but not available as a top-level module.

Recommended fix: ask Matthew before changing package declarations, then either add the explicit dependency or adjust the validation runtime so these standalone scripts resolve it exactly like Next.js does.

### P1 - Local tooling is not usable through declared package commands

`pnpm`, `npm`, and `corepack` were not available on PATH during audit, and system `node` returned Access denied in sandbox. Validation had to use Codex's bundled Node directly. Vercel CLI is also not installed.

Recommended fix: restore a normal local toolchain before Phase 6. At minimum, install/enable Node + pnpm/corepack and Vercel CLI so project scripts can be run exactly as documented.

### P1 - Planning truth has drifted

`.planning/STATE.md`, `.planning/ROADMAP.md`, handoff files, and branch reality disagree about current progress. Examples observed:

- `STATE.md` frontmatter says Phase 5 complete / 100%.
- The same file also says current focus is Phase 2 and progress is 4/8.
- `ROADMAP.md` has top-level Phase 4 and Phase 5 boxes unchecked while Phase Details say their plans are complete.
- Local branch contains a pause-work handoff commit ahead of remote.

Recommended fix: before more feature work, reconcile `.planning/STATE.md` and `.planning/ROADMAP.md` to a single source of truth: Phase 5 code complete but release-hardening blocked by this audit's P0/P1 items; Phases 6-8 not started/complete.

### P1 - Local handoff commit should not be blindly merged

The local branch is one commit ahead of remote with handoff artifacts:

- `.planning/HANDOFF.json`
- `.planning/phases/05-employee-portal/.continue-here.md`

These may be useful for local continuation, but they look like session artifacts rather than Phase 5 product deliverables.

Recommended fix: decide explicitly whether these belong in the PR. If not, continue from `origin/gsd/phase-5-employee-portal` or remove them before squash.

### P1 - Product is not yet MVP/customer-ready

Core Phase 1-5 surfaces are present, but the locked build sequence still has major unbuilt product obligations:

- Phase 6 billing and subscription state.
- Stripe webhooks and first-renewal survival.
- Phase 7 reminders, Resend email, worker/cron behavior.
- Phase 8 dashboard/reporting/CSV and final acceptance tests.

Recommended fix: do not treat Phase 5 approval as full product readiness. It is an employee-portal milestone, not the SaaS MVP finish line.

### P2 - Admin operations have practical product gaps

Several repository methods still throw "Not yet implemented", including department creation, user creation, notification creation, and notification read-state updates. The assignment panel supports department assignment but has no fully integrated admin path for creating/managing departments/users.

Recommended fix: decide whether these are Phase 8/admin-polish gaps or blockers for realistic internal testing. If manual DB seeding is required, document that honestly.

### P2 - Design direction needs to be separated from build inputs

The actual marketing page is basic and text-heavy. The newly reviewed `C:\Users\matth\Downloads\index (4).html` prototype is a coherent direction: "one policy system, three ways to see the truth," with Map, Editorial, and Command lenses over the same governance record. That is different from the repo-local `Designprototypes/` artifact, which is a Claude-generated design/code suggestion export and currently breaks the build when present.

Recommended fix: preserve the Downloads prototype as design reference, but keep static prototypes outside Tailwind's app scan path unless intentionally integrated. If it becomes part of the product direction, translate the "three lenses" idea into planned app surfaces instead of dropping static HTML into the Next.js app tree.

### P2 - Security/data audit positives should be preserved

The audit found meaningful green areas:

- RLS isolation passed with a positive cross-org control.
- Raw DB imports are allow-listed.
- Admin route and error discipline gates passed.
- Acknowledgment immutability passed for current `lib/**` mutation patterns.
- AI and employee portal dedicated integration harnesses passed.
- No obvious client-side Anthropic/Codex API usage was found.

Recommended fix: keep these gates in the release checklist and extend them rather than replacing them.

## Realistic Next Sequence

1. Clean the local ship surface: decide what to do with the local handoff commit, untracked `AGENTS.md`, `.codex/`, and `Designprototypes/`.
2. Fix the production build blocker caused by `Designprototypes/**` or Tailwind content scanning.
3. Restore normal local tooling: Node, pnpm/corepack, npm if needed, and Vercel CLI.
4. Resolve `server-only` so standalone validation scripts pass in the same environment as the app.
5. Stabilize tests: add cleanup/isolation, investigate shared state in AI tests, and make full Vitest deterministic.
6. Fix default ESLint by ignoring scratch/local artifact directories explicitly.
7. Update deploy schema verification for Phase 5, especially `qa_citation_grants`.
8. Resolve the `check-artifacts` Q&A route contract failure.
9. Reconcile `.planning/STATE.md` and `.planning/ROADMAP.md`.
10. Only then proceed to Phase 6 billing and Phase 7 email/crons, followed by Phase 8 validation and browser UAT.

## Blind Spots

- Browser UAT was not run because the local production build is red.
- Dependency audit could not be run through normal package-manager commands because `npm`/`pnpm` were unavailable.
- No production/staging dashboard, Clerk, Stripe, Anthropic/Codex, Resend, Railway, or Vercel live-state verification was performed.
- No external penetration test, load test, or accessibility audit was performed.
- Untracked local files were considered because they affect current local behavior, but clean CI may differ.
