# PolicyPilot Audit Remediation Status

Last updated: 2026-05-27T12:31:00-04:00
Source findings: `.planning/audits/2026-05-27-current-state-audit/FINDINGS.md`
Plan: `.planning/audits/2026-05-27-current-state-audit/REMEDIATION_PLAN.md`

## Current Summary

All code-level P0/P1 audit blockers found in the current-state audit have been fixed or verified locally. The project is still not full SaaS MVP-ready because Phases 6-8 remain intentionally unbuilt: billing, email/crons, reporting/export, and final acceptance validation are still future phase scope.

The remaining items are operational or workspace decisions, not failing application code: restore the normal local Node/pnpm/Vercel CLI toolchain, decide whether to track `AGENTS.md`, handle staging/prod migration procedure when shipping, and optionally remove a malformed root directory after Matthew explicitly approves deletion.

## Fixed Or Verified

| Finding | Status | Fix | Evidence |
|---|---|---|---|
| P0 production build red because Tailwind scanned repo-local prototype export | Fixed | `app/globals.css` excludes `../Designprototypes`; ESLint also ignores `Designprototypes/**`. | `next build` passed. |
| P0 default ESLint failed on scratch files | Fixed | `eslint.config.mjs` ignores `.tmp/**` and `Designprototypes/**`; unused imports/params/stale directives were cleaned up. | `eslint .` passed with zero warnings. |
| P0 default Vitest was nondeterministic / leaked DOM | Fixed | `tests/setup.ts` runs Testing Library `cleanup()` after each test. | Default Vitest passed: 29 files, 237 tests. |
| P0 artifact gate failed Q&A route thin-wrapper contract | Fixed | `app/api/ai/qa/route.ts` delegates to `askQuestion(ctx, ...)` and is back under the thin-wrapper line limit. | `check-artifacts` passed; Q&A route assertion reports 38 lines. |
| P0 deploy schema verifier was stale for Phase 5 | Fixed | `scripts/check-deploy-schema.ts` now covers `qa_citation_grants`, Phase 5 uniques, wrapped RLS, columns, grants, and indexes. | Deploy schema check passed: 12 migrations, 12 tenant tables, 2 service-role tables. |
| P1 standalone `server-only` resolution failed | Fixed without new package | Added `scripts/run-react-server-check.mjs`; package checks and older Phase 1/2 wrappers now route affected scripts through it. | `check:db`, `check-auth-context`, `check-policies-list-filters`, `check-foundation`, `check-data-layer`, and `pnpm verify:phase-5` passed. |
| P1 artifact gate contract drift after runner change | Fixed | `scripts/check-artifacts.ts` validates the runner contract plus Phase 1/2 wrapper usage. | `check-artifacts` passed: 459/459. |
| P1 planning truth drift | Fixed | `.planning/ROADMAP.md` and `.planning/STATE.md` now reflect Phase 4 shipped, Phase 5 hardening, and Phases 6-8 incomplete. | Current diff and audit status align with roadmap/state. |
| Phase 5 fast-follow: employee Server Action error surfaces | Fixed | Acknowledge and Q&A actions now log sanitized server context; Q&A returns a retryable 503-equivalent envelope for Anthropic and non-Anthropic service failures. | Targeted tests plus default Vitest passed. |
| Phase 5 fast-follow: stale comments / metadata | Fixed | Removed or updated stale route line refs, "will widen" language, table-count comments, and Plan 05-08 future tense. | Typecheck and lint passed. |
| Phase 5 fast-follow: `qa_citation_grants` immutability | Fixed | The immutability scanner and type invariants now cover both `acknowledgments` and `qa_citation_grants`, including Drizzle and raw-SQL mutation paths. | Immutability gate passed; self-test detected 4 deliberate violations across 2 immutable tables. |
| Phase 5 fast-follow: assignment and Q&A test coverage | Fixed | Added assignment empty-state tests and stronger Q&A grant upsert assertions for repeat, hallucinated, and foreign-org citations. | Targeted component/action tests, employee harness, and default Vitest passed. |
| Browser/UAT follow-up tooling | Fixed | Added `@playwright/test`, repo Playwright config, `test:e2e` scripts, and a route smoke covering public, employee-protected, and intentionally hidden admin routes across Chromium/Firefox/WebKit. | `pnpm exec playwright --version` reports 1.60.0; browser binaries installed; `pnpm test:e2e` passed in all three engines. |
| Continuous verification gap | Fixed | Added `verify:full` and `.github/workflows/verify.yml` so lint, build, Phase 5 gates, deploy-schema verification, and Playwright e2e run as a single repeatable sweep on push, PR, manual dispatch, and nightly schedule. | Local non-browser gates passed after wiring; CI will run `pnpm verify:full` with Playwright browsers installed first. |

## Deferred By Phase

| Finding | Status | Rationale |
|---|---|---|
| Product is not MVP/customer-ready | Deferred by design | Phase 5 is an employee-portal milestone. Billing, email/crons, reporting, CSV export, and final acceptance validation belong to Phases 6-8. |
| Admin operations still have practical gaps | Deferred unless promoted | Department/user/notification management gaps are outside the current Phase 5 hardening scope. Promote only if internal UAT needs them before Phase 6. |
| Design direction needs product integration | Partly fixed, partly future design work | Prototype files no longer break build/lint. The clean Downloads prototype remains a design reference and has not been integrated into the app. |

## Workspace And Operational Decisions

| Item | Current State | Decision Needed |
|---|---|---|
| Local handoff artifacts | Removed from the ship diff. | None unless Matthew wants to keep them. |
| `.codex/`, `Designprototypes/`, `scratch/`, and malformed local directory | Ignored in `.gitignore`; still present locally. | Optional physical cleanup only. |
| Untracked `AGENTS.md` | Cleaned into ASCII project guidance with the pasted Context7 instructions; still untracked. | Decide whether to track it as project guidance or keep it local. |
| Malformed root directory `C:...PolicyPilot.planningphases04-ai-layer` | Still present and ignored. | Delete only with explicit approval. |
| Local toolchain | Valid toolchain exists at `C:\nvm4w\nodejs`: Node v22.12.0, npm 10.9.0, Corepack 0.35.0, pnpm 9.15.9, Vercel CLI 54.5.0. Default PATH still points `node` at the Codex app copy and does not expose npm/pnpm/corepack/vercel. | Optional PATH cleanup only; package gates can be run through `C:\nvm4w\nodejs\corepack.cmd pnpm ...`. |
| Staging/prod migrations | Local/test DB verification passed. | Run staging/prod migration and audit-log procedures only during ship with real operator approval/credentials. |

## Latest Verification Snapshot

- TypeScript: pass via `pnpm typecheck` inside `pnpm verify:phase-5`.
- ESLint: pass via `pnpm lint`.
- Artifact gate: pass, 459/459.
- Default Vitest: pass via `pnpm test`, 29 files and 237 tests.
- Production build: pass via `pnpm build`.
- Foundation verifier: pass, 7/7 against local built app on `localhost:3000`.
- Data-layer verifier: pass, 8/8 including idempotent test DB migration.
- Deploy schema: pass via `pnpm db:verify`, Phase 5 verifier updated and live schema checked.
- Static/security gates: pass for DB imports, admin routes, error discipline, policy ID brand, AI prompts, and acknowledgment immutability.
- DB/integration gates: pass for DB smoke, RLS, auth context, policies list filters, AI layer harness, and employee portal harness.
- Playwright: installed in repo, browsers installed, Chromium/Firefox/WebKit launch verified.
- Browser smoke: pass via `pnpm test:e2e`; `/`, `/pricing`, employee protected redirects, and admin "advertise nothing" 404 behavior matched current middleware contract in Chromium, Firefox, and WebKit.
- Phase package gate: pass via `C:\nvm4w\nodejs\corepack.cmd pnpm verify:phase-5`.
- Continuous sweep: `pnpm verify:full` is now the canonical full local/CI command; GitHub Actions runs it continuously after installing Playwright browsers.

## Next Safe Step

Review the final diff, decide the `AGENTS.md` tracking question, then stage/commit or squash this remediation branch. Do not call the product MVP-complete until Phases 6-8 are built and accepted.
