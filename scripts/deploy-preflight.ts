// scripts/deploy-preflight.ts
//
// Phase 4 deploy-prep (Issue #16 carry, 2026-05-22). Build-time pre-flight gate
// that runs check-deploy-schema.ts IFF DATABASE_URL is configured. Graceful
// for preview branches / local builds that don't have DB credentials wired up.
//
// Wired into vercel.json's buildCommand: `pnpm deploy:preflight && pnpm build`.
// If the schema verify fails, the build fails — preventing a deploy that would
// 503 on first request to a not-yet-migrated DB.

import { spawnSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';

const dbUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.log(
    '[deploy-preflight] skipped: no DATABASE_URL/DIRECT_URL in env (preview build or local install without DB credentials).',
  );
  process.exit(0);
}

const TSX = resolvePath(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
const SCRIPT = resolvePath(process.cwd(), 'scripts/check-deploy-schema.ts');

console.log('[deploy-preflight] DATABASE_URL/DIRECT_URL detected — running schema verify');

const result = spawnSync(process.execPath, [TSX, SCRIPT], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('[deploy-preflight] failed to spawn verify:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
