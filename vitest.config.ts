import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      // Alias the `server-only` package to an empty stub so unit tests
      // (jsdom env) can import server-only modules without the real
      // package's hard throw firing. The real `server-only` still ships
      // in node_modules and still triggers inside `next build` for any
      // accidental client-bundle import. Plan 03-02 Task 1 / L-01.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  // Override PostCSS config so Vite does not try to load the repo's
  // `postcss.config.mjs` (which uses Tailwind v4's `@tailwindcss/postcss`
  // string-plugin form — valid for Next.js' loader but rejected by plain
  // Vite/PostCSS as "Invalid PostCSS Plugin found at: plugins[0]"). Unit
  // tests don't need Tailwind compilation; an empty inline plugin list
  // short-circuits Vite's discovery walk. (Rule-3 deviation: this knob
  // isn't in the plan body but is required for vitest to load on a
  // Tailwind-v4 repo.)
  css: {
    postcss: { plugins: [] },
  },
  test: {
    // Default to node — most test files are node-only (.test.ts) and pay no DOM
    // cost. Only the React component tests (.test.tsx) get jsdom via
    // environmentMatchGlobs. (FU-2: jsdom-global was wasteful for node tests;
    // setup.ts is node-safe — RTL cleanup() no-ops on an empty mount registry,
    // and the matchMedia shim is `typeof window` guarded.)
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // Load-tolerant timeouts (Phase 7 verify:phase-7 flake fix, 2026-06-06).
    //
    // ROOT CAUSE: the full-suite `pnpm test` (inherited by verify:phase-3..7)
    // runs 39 files in parallel, each in a heavy jsdom environment. On a COLD
    // run (fresh checkout / CI / cleared FS cache) or a CPU-contended machine,
    // jsdom-env creation + Vite transform serialize behind the scheduler and
    // starve test event loops. The heaviest tests (AI route handlers building
    // prompt XML, the Stripe webhook handler) then exceed Vitest's DEFAULT 5s
    // testTimeout and abort mid-flight — surfacing as "Test timed out in
    // 5000ms" plus collateral 503/spy-count assertion failures when an aborted
    // route falls through to its catch-all. Proven flaky: identical parallel
    // runs alternate red/green; `--no-file-parallelism` is 100% green; a tight
    // `--testTimeout=500` reproduces the same timeout set on demand. The tests
    // are CORRECT (each passes in <1s of real work) — only the default budget
    // is miscalibrated for this suite's cold+parallel worst case.
    //
    // FIX (does NOT weaken the gate — no skips/quarantine; every test must
    // still pass): give correct-but-starved tests realistic headroom. 30s is
    // ~6x the heaviest observed cold-run test wall-clock, yet short enough that
    // a genuine hang still fails well inside the 45-min CI job budget.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Phase 4 — scripts/check-ai-layer.test.ts is the WARNING-6 integration harness; it has
    // its own dedicated config (scripts/check-ai-layer.vitest.config.ts) that runs in node env
    // with TEST_DATABASE_URL passthrough. Excluding it from the default `pnpm test` glob keeps
    // unit-test runs fast and DB-independent — the harness fires only via `pnpm check:ai-layer`
    // (Plan 04-14 Task 3 wires the dedicated config invocation into the verify:phase-4 chain).
    //
    // Phase 5 Plan 05-09 — same pattern for scripts/check-employee-portal.test.ts. It has its
    // own dedicated config (scripts/check-employee-portal.vitest.config.ts), requires DB env
    // vars, and fires via `pnpm check:employee-portal` (wired into verify:phase-5 by Plan 05-10).
    exclude: [
      'node_modules',
      '.next',
      'tests/types.ts',
      'tests/e2e/**',
      'scripts/check-ai-layer.test.ts',
      'scripts/check-employee-portal.test.ts',
    ],
  },
});
