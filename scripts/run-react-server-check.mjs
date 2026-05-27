#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/run-react-server-check.mjs <script.ts> [args...]');
  process.exit(1);
}

const root = process.cwd();

function findServerOnlyNodeModules() {
  if (existsSync(join(root, 'node_modules', 'server-only', 'package.json'))) {
    return join(root, 'node_modules');
  }

  const pnpmStore = join(root, 'node_modules', '.pnpm');
  if (!existsSync(pnpmStore)) {
    return null;
  }

  for (const entry of readdirSync(pnpmStore, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('server-only@')) {
      continue;
    }

    const candidate = join(pnpmStore, entry.name, 'node_modules');
    if (existsSync(join(candidate, 'server-only', 'package.json'))) {
      return candidate;
    }
  }

  return null;
}

const serverOnlyNodeModules = findServerOnlyNodeModules();

if (!serverOnlyNodeModules) {
  console.error(
    'server-only is not installed. Run the project package install before react-server checks.',
  );
  process.exit(1);
}

const nodePath = process.env.NODE_PATH
  ? `${serverOnlyNodeModules}${delimiter}${process.env.NODE_PATH}`
  : serverOnlyNodeModules;

const result = spawnSync(
  process.execPath,
  [
    'node_modules/tsx/dist/cli.mjs',
    '--conditions=react-server',
    '--env-file=.env.local',
    target,
    ...process.argv.slice(3),
  ],
  {
    cwd: root,
    env: { ...process.env, NODE_PATH: nodePath },
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
