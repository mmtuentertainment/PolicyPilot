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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'tests/types.ts'],
  },
});
