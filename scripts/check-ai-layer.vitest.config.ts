import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Phase 4 — dedicated vitest config for scripts/check-ai-layer.test.ts (WARNING-6).
 *
 * Differs from the project-default vitest.config.ts in three ways:
 *   1. Includes ONLY scripts/check-ai-layer.test.ts (not the full test glob).
 *   2. Passes process.env.TEST_DATABASE_URL + DATABASE_URL_TEST + DIRECT_URL_TEST through
 *      to the test runtime (the integration harness reads these to connect to the live TEST DB).
 *   3. Uses `node` environment instead of `jsdom` (the integration harness has no DOM/React;
 *      pure server-side route-handler + DB tests).
 *
 * The `server-only` alias to a stub matches vitest.config.ts so the harness can dynamically
 * import @/app/api/ai/.../route.ts handlers (which all start with `import 'server-only'`)
 * without the real package's hard throw firing.
 *
 * Single-fork pool: DB tests can't safely parallelize against shared TEST DB — each test
 * relies on TRUNCATE + intentional ROLLBACK isolation, which would race if multiple workers
 * ran in parallel.
 *
 * Run via: pnpm vitest run scripts/check-ai-layer.test.ts --config scripts/check-ai-layer.vitest.config.ts
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
      // Same stub as the project-default vitest.config.ts (Plan 03-02 L-01) so dynamic imports
      // of @/app/api/ai/.../route.ts handlers (which start with `import 'server-only'`) don't throw.
      'server-only': resolve(__dirname, '..', 'tests/stubs/server-only.ts'),
    },
  },
  // Override PostCSS config so Vite does not try to load the repo's postcss.config.mjs
  // (which uses Tailwind v4's @tailwindcss/postcss string-plugin form rejected by plain Vite).
  // Unit tests don't need Tailwind compilation.
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['scripts/check-ai-layer.test.ts'],
    // Node env — the integration harness has no DOM/React; pure server-side route-handler + DB.
    environment: 'node',
    // Pass env vars through. Vitest forwards process.env by default; the explicit env block here
    // documents the contract and ensures DATABASE_URL_TEST is wired through even if a future
    // refactor narrows the default forwarding.
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? '',
      DIRECT_URL_TEST: process.env.DIRECT_URL_TEST ?? '',
    },
    // Single-threaded — DB tests can't safely parallelize against shared TEST DB.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Allow long-running DB seed + assertion bodies.
    testTimeout: 30_000,
  },
});
