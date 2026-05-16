---
phase: 01-foundation
plan: 05
subsystem: verification-gate
tags: [verify, smoke-check, e2e-gate, phase-1-completion, checkpoint-pending]
one_liner: "Single-script Phase 1 verification gate at scripts/check-foundation.ts — wires all 5 ROADMAP success criteria to `pnpm verify:phase-1`; Task 1 complete + committed, Task 2 (operator human-verify) pending"
status: task-1-complete-task-2-pending-operator
dependency_graph:
  requires:
    - 01-01  # verify:phase-1 script slot reserved + tsx installed
    - 01-03  # /, /pricing, /sign-in, /sign-up, /sign-in-success exist on disk
    - 01-04  # middleware.ts in place + pnpm check:db wired
  provides:
    - "`pnpm verify:phase-1` — single-command gate for ROADMAP Phase 1 success criteria 1–5"
    - "scripts/check-foundation.ts orchestrator (tsc + HTTP probes + DB smoke + middleware redirect)"
  affects: [01-end-of-phase]  # Phase 1 closes once Task 2 returns `approved`
tech_stack:
  added:
    runtime: []  # No new packages — only orchestration of existing tooling
    dev: []
    shadcn_transitive: []
  patterns:
    - "spawnSync('pnpm', ['check:db'], { shell: true }) — Windows-compatible delegation to the Plan 01-04 DB smoke gate"
    - "Result accumulator pattern: every check returns a Result {ok,label,detail}; the script continues through all 6 checks even on failure so the operator sees the full failure set, not just the first"
    - "fetch(url, { redirect: 'manual' }) — the only way to assert a 307 in Node 22; the default `redirect: 'follow'` would mask middleware behaviour"
    - "Failure-detail sanitisation: only the first non-empty line of stderr/stdout is surfaced (T-05-02 — keeps DB connection-string fragments out of the failure summary)"
key_files:
  created:
    - scripts/check-foundation.ts
  modified:
    - package.json  # verify:phase-1 now → tsx --env-file=.env.local scripts/check-foundation.ts
decisions:
  - "Delegate the Drizzle smoke check to `pnpm check:db` via spawnSync instead of importing `db` + `sql` directly. Rationale: importing `@/lib/db` would force this script to also pass `--conditions=react-server` to tsx (to defeat the `server-only` guard on `lib/db/index.ts`). With `--conditions=react-server` between `tsx` and `--env-file=`, the plan's verify regex `verify:phase-1.*tsx --env-file=\\.env\\.local scripts/check-foundation\\.ts` does not match (the regex uses `.*` between `verify:phase-1` and `tsx`, but requires `tsx --env-file=` adjacent). Delegating via child process is the cleanest path that satisfies BOTH the plan's strict regex AND the orchestrator's success criterion. The plan's `<action>` block explicitly allows this approach (`scripts/check-db.ts — model for the Drizzle-side check; can be inlined into the foundation script OR spawned as a child process`)."
  - "Six sub-checks across five ROADMAP criteria. Criterion 3 splits into /sign-in (3a) and /sign-up (3b) — both rendered server-side mounts — to give the operator a more granular failure signal. Criterion 5 (middleware redirect) is logged separately as `[6/6]` rather than folded into the totals so the per-check log is unambiguous. Final summary line reads `✓ All 6 checks passed.`"
  - "All Result.detail values strip stderr/stdout to the first non-empty line. Acceptance criteria for T-05-02 (information disclosure via verifier logs) — postgres-js error messages include host:port but not the password fragment of the connection URI, and trimming to one line keeps a hypothetical multi-line stack from leaking other env values."
metrics:
  duration_minutes: ~12
  tasks_completed: 1  # Task 1 only — Task 2 is the operator checkpoint
  files_touched: 2  # 1 created + 1 modified
  commits: 1  # this SUMMARY commit will bring the total to 2 once landed
completed: null  # Task 2 not yet completed
---

# Phase 01 Plan 05: Phase 1 Verification Gate — Summary

## Task status overview

| # | Task | Type | Status | Commit |
|---|------|------|--------|--------|
| 1 | Write `scripts/check-foundation.ts` + wire `pnpm verify:phase-1` | auto | **complete** | `b43ed8c` |
| 2 | Operator runs `pnpm verify:phase-1` + visually confirms Clerk sign-in flow | checkpoint:human-verify (blocking) | **awaiting operator** | — |

**Phase 1 is NOT yet complete.** Task 2 is the final gate. The orchestrator should surface Task 2's `<how-to-verify>` instructions to the operator and not advance Phase 1 → Phase 2 until the operator returns the `approved` resume signal.

## What Task 1 built

A single TypeScript orchestrator at `scripts/check-foundation.ts` that asserts every ROADMAP Phase 1 success criterion programmatically. Invocation: `pnpm verify:phase-1`, which resolves to:

```
tsx --env-file=.env.local scripts/check-foundation.ts
```

The script runs six sub-checks across the five ROADMAP success criteria:

| # | ROADMAP criterion | Sub-check label | How it's asserted |
|---|-------------------|-----------------|-------------------|
| 1 | tsc --noEmit zero errors | `tsc --noEmit zero errors` | `spawnSync('pnpm', ['tsc', '--noEmit'], { shell: true })`; pass if exit 0 |
| 2 | localhost:3000 loads marketing landing | `GET / returns 200 with D-03 hero copy` | `fetch('/', { redirect: 'manual' })`; pass if 200 AND body contains the literal D-03 hero string |
| 3a | Clerk sign-in renders | `GET /sign-in returns 200 (Clerk SignIn mount)` | `fetch('/sign-in', { redirect: 'manual' })`; pass if 200 |
| 3b | Clerk sign-up renders | `GET /sign-up returns 200 (Clerk SignUp mount)` | `fetch('/sign-up', { redirect: 'manual' })`; pass if 200 |
| 4 | Supabase select 1 via Drizzle | `Drizzle select 1 round-trip` | `spawnSync('pnpm', ['check:db'], { shell: true })`; delegates to the Plan 01-04 smoke gate |
| 5 | Middleware redirects private route | `Middleware redirects /sign-in-success → /sign-in unauthenticated` | `fetch('/sign-in-success', { redirect: 'manual' })`; pass if 307/308/302 AND Location header includes `/sign-in` |

Failures are accumulated in a `Result[]` and reported as a summary at the end — the script does NOT short-circuit on the first failure. Final exit code is 0 only if every sub-check passes.

### Decision: spawn `pnpm check:db` instead of importing `db` directly

Plan 01-05's `<action>` block offered two paths for the DB smoke check:
1. Inline the Drizzle call (`await db.execute(sql\`select 1 as ok\`)`) — but `lib/db/index.ts` declares `import "server-only";`, which throws unless tsx is invoked with `--conditions=react-server`.
2. Spawn `scripts/check-db.ts` (Plan 01-04's existing gate) as a child process.

I chose option 2. The driver was the plan's own verify regex:

```
verify:phase-1.*tsx --env-file=\.env\.local scripts/check-foundation\.ts
```

The regex uses `.*` between `verify:phase-1` and `tsx`, but then requires `tsx --env-file=` adjacent. Adding `--conditions=react-server` between `tsx` and `--env-file=` (the only place tsx accepts the node flag) breaks the regex. Spawning `pnpm check:db` as a child process sidesteps the `server-only` guard entirely — `check:db` already runs with `--conditions=react-server` per Plan 01-04 — and leaves `verify:phase-1` clean.

Side benefit: responsibility stays crisp. `check:db` owns the DB-connectivity gate; `check-foundation.ts` is just the orchestrator.

## Acceptance criteria (Task 1)

| Criterion | Result | Evidence |
|-----------|--------|----------|
| `scripts/check-foundation.ts` exists | PASS | `git ls-files scripts/check-foundation.ts` returns the path |
| Contains literal `select 1` | PASS | The comment block describing the Drizzle smoke check, and the `Drizzle select 1 round-trip` label, contain the literal string |
| Contains literal D-03 hero string `Policy management for SMBs that beats a Google Drive folder` | PASS | Inside `checkHttp("/", 200, ..., (body) => body.includes("Policy management for SMBs that beats a Google Drive folder"))` |
| Probes all four paths: `/`, `/sign-in`, `/sign-up`, `/sign-in-success` | PASS | All four literal string paths appear in the script |
| Calls both `process.exit(0)` AND `process.exit(1)` | PASS | Both branches present in `main()` |
| No `: any` annotations | PASS | regex sweep `\bany\b\s*[:,)]` clean |
| `package.json` `verify:phase-1` resolves to `tsx --env-file=.env.local scripts/check-foundation.ts` | PASS | exact regex match against the strict plan-verify regex `verify:phase-1.*tsx --env-file=\.env\.local scripts/check-foundation\.ts` |
| `pnpm tsc --noEmit` exits 0 | PASS | verified post-Task-1 commit |

## Live HTTP probe — deferred to Task 2

The plan's `<verify><automated>` block explicitly defers the live HTTP probes to Task 2 (`Write-Output "OK (live HTTP probe deferred to checkpoint Task 2)"`). Task 1's contract is type-clean + script-on-disk; running the gate against a live dev server is Task 2's job.

## Task 2 — operator action required (verbatim from `01-05-PLAN.md`)

The plan's `<how-to-verify>` block (paraphrased here as instructions for the orchestrator and operator) requires the following steps. The operator must execute them and return a `<resume-signal>` reply.

### Prerequisites

- `pnpm install` completed (Plan 01-01).
- `.env.local` populated with the seven Phase 1 must-have keys (Plan 01-02).

### Steps the operator must run

1. Open a terminal at the repo root.
2. Start the dev server: `pnpm dev` — wait until you see `▲ Next.js 15.x.y - Ready in ...ms` on `http://localhost:3000`.
3. In a **second** terminal at repo root, run: `pnpm verify:phase-1`.
4. **Expected output:** each check prints `OK`, final line `✓ All 6 checks passed.`, exit code 0.
5. If anything prints `FAIL`, read the detail line and identify which plan owns the broken artifact:
   - `tsc --noEmit zero errors` → introduced by whatever you last edited; usually a Plan 01-01 / 01-03 / 01-04 file.
   - `GET / returns 200 with D-03 hero copy` → Plan 01-03 (`app/(marketing)/page.tsx`).
   - `GET /sign-in` / `GET /sign-up` → Plan 01-03 (`app/(auth)/sign-{in,up}/[[...sign-{in,up}]]/page.tsx`).
   - `Drizzle select 1 round-trip` → Plan 01-04 (`lib/db/index.ts`, `scripts/check-db.ts`) — or check that `.env.local` has the right `DATABASE_URL`.
   - `Middleware redirects /sign-in-success → /sign-in` → Plan 01-04 (`middleware.ts`).

### Visual / interactive Clerk flow checks (criterion 3 interactive half)

6. Browser → `http://localhost:3000/`. Confirm:
   - Literal headline: `Policy management for SMBs that beats a Google Drive folder.`
   - Three value-prop bullets render.
   - Two CTAs: `Get started` (primary) and `Sign in` (secondary).
   - Footer reads `© 2026 MMTU Entertainment LLC · PolicyPilot`.
   - No `Error` overlay, no React hydration warnings in the browser console.

7. Browser → `http://localhost:3000/pricing`. Confirm:
   - Three plan cards labeled `Starter`, `Growth`, `Business`.
   - Prices visible: `$79`, `$199`, `$449`.
   - Each card's `Get started` button is enabled and points to `/sign-up`.

8. Browser → `http://localhost:3000/sign-in`. Confirm:
   - Clerk's hosted sign-in form renders.
   - Email + Password fields plus a `Sign in with Google` button.
   - No `Missing publishable key` red banner.

9. **Sign up a real test user** (criterion 3 interactive half):
   - Click `Sign up` in the Clerk form's footer (or visit `/sign-up`).
   - Use a real or `+test` Gmail (e.g. `mmtuentertainment+test@gmail.com`).
   - Complete the email verification step.
   - Confirm Clerk redirects to `/sign-in-success` (D-09 placeholder) and the page says `You're signed in.`.

10. **Confirm middleware redirect** (criterion 5 visual confirm):
    - Open a **private/incognito** window.
    - Visit `http://localhost:3000/sign-in-success` directly.
    - Browser should redirect to `/sign-in?redirect_url=...`.

11. **Stop the dev server** when done: `Ctrl+C` in the `pnpm dev` terminal.

### Resume signal

The operator replies one of:

- `approved` — if all 6 automated checks passed AND the visual / Clerk-flow checks all succeeded. Phase 1 is then complete and Phase 2 is unlocked.
- A specific failure description — e.g. `verify:phase-1 reports FAIL on Drizzle select 1 round-trip — connection timed out`, or `Clerk shows Missing publishable key banner`. The orchestrator then decides whether to spawn a gap-closure plan, re-run a specific Wave 3 plan, or accept a deviation with rationale.

## Deviations from Plan

### Auto-fixed Issues

None.

### Architectural changes

None.

### Plan-author intent vs strict regex (resolved without architectural change)

The plan's `<environment_notes>` (from the executor prompt) anticipated that `--conditions=react-server` could be added to the `verify:phase-1` script without breaking the strict verify regex. In practice, the regex `verify:phase-1.*tsx --env-file=\.env\.local scripts/check-foundation\.ts` requires `tsx --env-file=` to be adjacent — `--conditions=react-server` would have to live elsewhere on the command line. Resolved by spawning `pnpm check:db` as a child process from inside the orchestrator script (option 2 from the plan's `<action>` block), which removes the need for `--conditions=react-server` on `verify:phase-1` altogether. Net result: the strict plan-verify regex matches AND the `server-only` guard on `lib/db/index.ts` remains intact in every code path.

## Threat-model dispositions (Plan 01-05 register)

| Threat ID | Result |
|-----------|--------|
| T-05-01 (Tampering — verifier always exits 0) | MITIGATED (Task 1). Acceptance criteria assert the literal `select 1` substring, the literal D-03 hero substring, the literal `process.exit(1)` branch, and all four probe paths in source. A vacuous-pass script cannot satisfy those checks. |
| T-05-02 (Information disclosure — full DB connection string in failure log) | MITIGATED (Task 1). `checkSelectOne` surfaces only the first non-empty trimmed line of `stderr`/`stdout` from the spawned `pnpm check:db` process. postgres-js error messages mention host:port but not the password fragment of the URI. |
| T-05-03 (DoS — repeated verify runs hammer dev server) | ACCEPTED. Developer-local script; no production exposure. |
| T-05-04 (Information disclosure — operator-side test user sees admin/employee data) | n/a in Phase 1. No admin or employee surfaces exist; the test user lands on `/sign-in-success` which renders zero data. Phase 2 deletes or scopes the test user. |
| T-05-05 (Repudiation — operator marks Phase 1 done without running gate) | MITIGATED (deferred to Task 2's checkpoint protocol). The task is `checkpoint:human-verify` with `gate=blocking` — the executor cannot proceed without an explicit `approved` resume signal. |

ASVS L1: no `high` severity threats. The plan is a verification gate, not a production code path.

## Acceptance Criteria Status (Plan 01-05 success_criteria)

| Criterion | Result |
|-----------|--------|
| `pnpm verify:phase-1` exits 0 | DEFERRED to Task 2 (live HTTP probes require operator to start `pnpm dev`). |
| Operator confirmed Clerk sign-in completes against dev keys (criterion 3 interactive) | DEFERRED to Task 2. |
| Operator confirmed middleware redirect from private route (criterion 5 visual) | DEFERRED to Task 2. |
| No `: any` types introduced | PASS — `\bany\b\s*[:,)]` regex sweep clean across `scripts/check-foundation.ts`. |
| No new dependencies installed beyond what Plan 01 specified | PASS — script uses only `node:child_process` (stdlib) and the Web `fetch` global. |

## Self-Check: PASSED

- File existence: `scripts/check-foundation.ts` — FOUND.
- File modified: `package.json` — modified, `verify:phase-1` now points at the script.
- Commit `b43ed8c` — FOUND in `git log --oneline -3`.
- `pnpm tsc --noEmit`: exit 0 verified post-Task-1 commit.
- Plan strict verify regex `verify:phase-1.*tsx --env-file=\.env\.local scripts/check-foundation\.ts` matches against `package.json`: VERIFIED via PowerShell `-match`.
- No `: any` annotations in `scripts/check-foundation.ts`: VERIFIED via regex sweep.
- All four probe paths (`"/"`, `"/sign-in"`, `"/sign-up"`, `"/sign-in-success"`) present in the script: VERIFIED.
- Both `process.exit(0)` and `process.exit(1)` branches present: VERIFIED.
- No secret values referenced in committed code, summary, or commit messages: VERIFIED (no `.env.local` reads, no environment-value echoes).

## Notes for downstream

- **Orchestrator (immediate next action):** Surface Task 2 to the operator using the steps in this summary. Do NOT advance Phase 1 → Phase 2 until the operator returns `approved`. The plan declares Task 2 with `gate="blocking"`.
- **`pnpm verify:phase-1:full` convenience script:** Not added. The plan's `<action>` block offered an optional `concurrently`-based one-terminal variant ("Skip this if `concurrently` is not installed — do NOT install new packages just for convenience"); `concurrently` is not in the stack list, so per CLAUDE.md "ASK FIRST" rule #1 the convenience script was deferred. Operator runs two terminals manually per the steps above.
- **Phase 2 readiness:** Once Task 2 returns `approved`, Phase 1 is complete. Phase 2's first plan can start without revisiting any Phase 1 artifact. The Drizzle skeleton (`lib/db/{index,schema}.ts`) is ready to be populated from `reference/SCHEMA.md`; the middleware webhook exemption for `/api/webhooks/clerk` is already in place (Plan 01-04).
- **Future tsx-invoked scripts that need `db`:** Follow Plan 01-04's pattern — pass `--conditions=react-server` to tsx. OR, if the script is an orchestrator that doesn't strictly need to import `db`, follow this plan's pattern and spawn `pnpm check:db` (or whatever finer-grained DB-side gate is appropriate) as a child process.
