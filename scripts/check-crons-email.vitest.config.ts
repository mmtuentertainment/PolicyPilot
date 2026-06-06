import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '..'),
      'server-only': resolve(__dirname, '../tests/stubs/server-only.ts'),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['scripts/check-crons-email.ts'],
  },
});
