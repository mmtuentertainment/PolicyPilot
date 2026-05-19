---
phase: 03-admin-ui
plan: 01
subsystem: verify-harness
tags: [vitest, verify-harness, wave0, ts-morph, ci-gate]
dependency_graph:
  requires:
    - "Phase 2 verify-harness (scripts/check-db-imports.ts, scripts/check-rls.ts, scripts/check-artifacts.ts) — Plans 02-06/02-07"
  provides:
    - "vitest 1.6.1 framework operational under Node 22 with jsdom + RTL setup"
    - "pnpm verify:phase-3 orchestrator end-to-end green on Wave-0 state"
    - "scripts/check-admin-routes.ts scaffold (pass-through; Plan 03-02 flips to enforcement)"
    - "checkPhase3FileExistence() W10 auto-detect (no env-flag plumbing)"
    - "L-06c .tmp/svix-url.json cleanup tail wired into verify:phase-3"
  affects:
    - "package.json scripts: +test, +test:watch, +check:db-imports, +check:rls, +check:admin-routes, +verify:phase-3"
    - "scripts/check-artifacts.ts: +2 functions, +16 assertions (214 → 230)"
tech_stack:
  added:
    - "vitest@1.6.1 (devDep — Wave 0 test framework)"
    - "@testing-library/react@16.3.2 (devDep — component-test primitives for future plans)"
    - "@testing-library/jest-dom@6.9.1 (devDep — DOM matchers)"
    - "jsdom@24.1.3 (devDep — vitest environment)"
    - "@vitejs/plugin-react@4.7.0 (devDep — JSX transform for vitest)"
  patterns:
    - "vitest config: css.postcss = { plugins: [] } override so Vite skips the Tailwind-v4 PostCSS config (which uses the @tailwindcss/postcss string-plugin form Next.js understands but plain Vite rejects)"
    - "ts-morph Project setup copied verbatim from scripts/check-db-imports.ts (Phase 2 L-05 pattern)"
    - "Scaffold-mode detection via substring sniff on middleware.ts: when '/(admin)/(.*)' is present, exit 0 with a 'scaffold mode' log line; Plan 03-02 swaps the matcher and the script flips into enforcement"
    - "W10 auto-detect: checkPhase3FileExistence() returns an ok() skip row when app/(admin)/dashboard/page.tsx is absent, and the full file-existence enforcement matrix when it lands. No PHASE_3_COMPLETE env flag — file presence IS the signal."
key_files:
  created:
    - "vitest.config.ts"
    - "tests/setup.ts"
    - "tests/smoke.test.ts"
    - "scripts/check-admin-routes.ts"
  modified:
    - "package.json (scripts block; devDependencies)"
    - "pnpm-lock.yaml (lockfile for new devDeps)"
    - "scripts/check-artifacts.ts (+2 functions, +104 lines, +16 assertions; main() aggregation array)"
decisions:
  - "Stay on vitest 1.6.x (NOT 2.x) — keeps the test ecosystem aligned with the Next.js 15 LTS + the project's pinned Node 22 active-LTS. Vitest 1.6.1 installed cleanly on Node 22 on the first try; the documented fall-back to vitest@^2.1 was not needed."
  - "vitest css.postcss override: { plugins: [] } inline, NOT css: false. css: false still triggers Vite's PostCSS discovery walk; an empty inline plugin list short-circuits discovery. Tested empirically — css: false reproduced the Tailwind-v4 Invalid-PostCSS-Plugin crash; { plugins: [] } resolves it."
  - "scripts/check-admin-routes.ts ships in scaffold mode using a substring sniff on middleware.ts ('/(admin)/(.*)') rather than a positive ADMIN_URL_PATTERNS check, so the script lands cleanly BEFORE Plan 03-02 introduces the new matcher. Plan 03-02 deletes the substring and the enforcement branch fires."
metrics:
  duration_seconds: 438
  duration_human: "~7m18s"
  tasks_completed: 3
  files_created: 4
  files_modified: 3
  commits: 3
  completed_date: "2026-05-19"
  start_utc: "2026-05-19T18:00:06Z"
  end_utc: "2026-05-19T18:07:24Z"
  artifact_assertions_before: 214
  artifact_assertions_after: 230
  artifact_assertions_added: 16
---

# Phase 3 Plan 01: Wave-0 Test + Verify Harness Summary

vitest 1.6.1 + RTL + jsdom + jest-dom installed under Node 22; `pnpm verify:phase-3` chains tsc → check:db-imports → check:rls → check:admin-routes → check:artifacts → vitest → L-06c .tmp cleanup and exits 0; `scripts/check-admin-routes.ts` shipped in scaffold mode (auto-pass while the Phase 1+2 `/(admin)/(.*)` matcher is still in place); `scripts/check-artifacts.ts` extended with 16 Phase 3 assertions (214 → 230) including a W10 auto-detect that flips file-existence enforcement on when Plan 03-11 ships `app/(admin)/dashboard/page.tsx`.

---

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Install vitest + write vitest.config.ts + tests/setup.ts | `ca02631` | package.json, pnpm-lock.yaml, vitest.config.ts, tests/setup.ts, tests/smoke.test.ts |
| 2 | Ship scaffold of scripts/check-admin-routes.ts | `7653626` | scripts/check-admin-routes.ts |
| 3 | Wire verify:phase-3 + extend check-artifacts.ts | `c3ab6a7` | package.json, scripts/check-artifacts.ts |

All three commits land on `gsd/phase-3-admin-ui`. `pnpm tsc --noEmit` exits 0 on every commit boundary.

---

## Verification

- `pnpm tsc --noEmit` → exit 0
- `pnpm vitest run tests/smoke.test.ts` → 1/1 passed (4.07s end-to-end after Vite cold start; 1.59s warm)
- `pnpm check:admin-routes` → exit 0, "scaffold mode" log line
- `pnpm check:artifacts` → 230/230 OK (up from 214)
- `pnpm verify:phase-3` → exit 0 end-to-end:
  - typecheck OK
  - check:db-imports OK (Phase 2 L-05 gate still green; 2 allow-listed @/lib/db imports, 0 violations)
  - check:rls OK (Phase 2 L-06 gate still green against live TEST DB)
  - check:admin-routes OK (scaffold mode)
  - check:artifacts 230/230 OK
  - vitest run: 1/1 passed
  - `.tmp/svix-url.json` cleanup tail runs (file absent today; no-op as expected)
- `pnpm audit --prod` → 0 known vulnerabilities (pre- and post-install)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vitest cold-start crashed on Tailwind v4 PostCSS config**
- **Found during:** Task 1 verification (`pnpm vitest run tests/smoke.test.ts`)
- **Issue:** Vite (vitest's transformer) auto-discovers `postcss.config.mjs` at repo root. The repo's PostCSS config uses Tailwind v4's string-plugin form `plugins: ["@tailwindcss/postcss"]` — valid for Next.js's PostCSS loader but rejected by plain Vite/PostCSS 8 as "Invalid PostCSS Plugin found at: plugins[0]". The crash blocks every test run.
- **Fix:** Added `css: { postcss: { plugins: [] } }` to `vitest.config.ts`. Inline empty plugin list short-circuits Vite's PostCSS discovery walk. Verified empirically: an earlier attempt with `css: false` still triggered the discovery walk and reproduced the crash; only the inline empty-plugins form actually skips Tailwind v4 PostCSS entirely. Unit tests don't need Tailwind compilation; component tests in later plans can still render JSX — they just won't see styles applied at the DOM level, which is the correct behavior for assertion-based UI tests.
- **Files modified:** `vitest.config.ts`
- **Commit:** `ca02631` (folded into Task 1's single commit; the issue surfaced + was fixed before the first commit was cut)

### Notes / Non-Deviations

- **Peer-dep warning carry-forward:** `pnpm add` for vitest+RTL surfaced a Clerk vs React 19.1.0 peer warning ("unmet peer react@~19.0.3 || ~19.1.4 ..."). This is pre-existing — `react: 19.1.0` is the Phase 1 pin (`react: 19.1.0` in `package.json` since Plan 01-01) and Clerk 7.3.4's peer range happens to exclude this exact patch. Not introduced by this plan. Not a Rule-1 bug (Clerk works fine at runtime; the peer range is overly conservative on Clerk's side). Tracking forward only if Clerk 7.4+ tightens the range further.
- **Esbuild transitive audit:** vitest pulls in esbuild via Vite. `pnpm audit --prod` (production-only flag) returns 0 vulnerabilities. The known esbuild dev-only advisory carried over from drizzle-kit (Plan 02-06 SUMMARY) is unchanged.

No Rule-2 or Rule-4 deviations.

---

## Authentication Gates

None. No external services touched in this plan (vitest is local-only; no Clerk / Stripe / Supabase calls).

---

## Threat Model Coverage

All five threats in the plan's `<threat_model>` block were addressed:

- **T-03-01-01 (Tampering — dep install):** `pnpm audit --prod` ran pre + post install; 0 known vulnerabilities. MEMORY.md `audit-before-security-changes` honored.
- **T-03-01-02 (DoS — vitest watching):** Default `test` is `vitest run` (one-shot). `test:watch` is opt-in.
- **T-03-01-03 (Info Disclosure — paths):** All paths in `check-admin-routes.ts` are repo-relative; no env-var interpolation; ts-morph operates in-process.
- **T-03-01-04 (Tampering — RegExp eval):** The RegExp constructor in `check-admin-routes.ts` is called only on text already parsed by ts-morph as a regex literal in `middleware.ts` (project-controlled source), not user input.
- **T-03-01-SC (Supply chain — npm installs):** All four new devDeps are top-1k npm packages with multi-year track records. No new `postinstall` scripts introduced (only the pre-existing esbuild postinstall, which is benign and unchanged).

---

## Known Stubs

- **scripts/check-admin-routes.ts is in scaffold mode.** The enforcement branch (parsing `ADMIN_URL_PATTERNS` + walking `app/(admin)/`) is fully written but never executes today because middleware.ts still has the Phase 1+2 `/(admin)/(.*)` matcher. Plan 03-02 swaps the matcher and the enforcement branch fires. This is intentional and documented in the script's header docblock.
- **checkPhase3FileExistence() returns a skip row.** All 19 Phase 3 file-existence targets (Plans 03-02..03-11) are listed in the function but gated behind `existsSync('app/(admin)/dashboard/page.tsx')`. When Plan 03-11 ships the dashboard page, the function flips to enforcement automatically and any missing artifact RED-fails with the owning plan number. This is intentional (W10 closure) and documented inline.

Both stubs are by-design Wave-0 scaffolding and unblock Plans 03-02..03-11 without forcing them to add files retroactively.

---

## Self-Check: PASSED

Files claimed to exist:
- `vitest.config.ts` — FOUND
- `tests/setup.ts` — FOUND
- `tests/smoke.test.ts` — FOUND
- `scripts/check-admin-routes.ts` — FOUND

Commits claimed to exist:
- `ca02631` — FOUND on `gsd/phase-3-admin-ui` (chore(03-01): install vitest 1.6.1 + write vitest.config.ts + tests/setup.ts)
- `7653626` — FOUND on `gsd/phase-3-admin-ui` (feat(03-01): add scripts/check-admin-routes.ts (ts-morph scaffold))
- `c3ab6a7` — FOUND on `gsd/phase-3-admin-ui` (feat(03-01): wire verify:phase-3 orchestrator + extend check-artifacts.ts with Phase 3 rows)

End-to-end verify:
- `pnpm verify:phase-3` exits 0 with 230/230 check-artifacts assertions and 1/1 vitest passing.
