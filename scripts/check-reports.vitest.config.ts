import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
      'server-only': resolve(__dirname, '..', 'tests/stubs/server-only.ts'),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['scripts/check-reports.test.ts'],
    environment: 'node',
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST ?? '',
      DATABASE_URL_TEST: process.env.DATABASE_URL_TEST ?? '',
      DIRECT_URL_TEST: process.env.DIRECT_URL_TEST ?? '',
    },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
  },
});
