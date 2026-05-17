// scripts/check-db-imports.ts
// L-05 — CI gate: enforce the ADR-023 raw-`db` import allow-list.
//
// ts-morph AST-walks the repo and flags any import whose module specifier
// resolves to `@/lib/db` (the raw db barrel) outside the allow-listed
// file paths below. RESEARCH Anti-pattern: do NOT regex-grep — AST
// catches re-exports (`export { db } from`), renamed imports
// (`import { db as d }`), and dynamic imports too.
//
// Pitfall 6 (RESEARCH): if a repository file (lib/db/repositories/*.ts)
// imports raw `db`, RLS would never fire because the connection-string
// user is BYPASSRLS. The repositories are intentionally NOT in this
// allow-list.
import { Project } from 'ts-morph';
import { resolve as resolvePath, sep as pathSep, relative as relPath } from 'node:path';

// ADR-023 allow-list with 4 logical entries (webhook(clerk|stripe), cron,
// test-harness) — the test-harness entry expands to: tests/**,
// scripts/check-rls.ts, scripts/check-schema.ts. Plus lib/db/scoped.ts as
// the wrapper that secures the channel.
//
// Note 1: scripts/check-artifacts.ts is NOT allow-listed — its @/lib/db
// references are string literals used by its grep walker (NOT ES imports);
// L-05's AST walker (getImportDeclarations) only catches actual imports.
// Audit performed by executor 2026-05-17 — confirmed no bare db import in
// scripts/check-artifacts.ts (only string-literal grep patterns).
//
// Note 2: scripts/check-db.ts IS the Phase 1 Drizzle smoke gate (Plan
// 01-04 deliverable; operator-approved 2026-05-16). It's the original
// legitimate raw-`db` importer that pre-dates ADR-023. Including it here
// as a Rule-3 deviation from the plan body — the plan's allow-list section
// scoped to Phase 2+ additions but the gate must accept the Phase 1
// baseline importer too. STATE.md SF-M1 / scripts/check-db.ts comments
// confirm this as the canonical scripts smoke gate.
//
// Patterns match POSIX-style relative paths (we normalize backslashes below).
const ALLOWLIST: RegExp[] = [
  /^app\/api\/webhooks\/clerk\/route\.ts$/,      // ADR-023 #1 (Plan 02-05)
  /^app\/api\/webhooks\/stripe\/route\.ts$/,     // ADR-023 #2 (Phase 6 — may not exist)
  /^app\/api\/cron\/.+\/route\.ts$/,             // ADR-023 #3 (Phase 7 — may not exist)
  /^tests\//,                                    // ADR-023 #4 — test harness
  /^scripts\/check-rls\.ts$/,                    // ADR-023 #4 — Phase 2 RLS gate
  /^scripts\/check-schema\.ts$/,                 // ADR-023 #4 — Phase 2 schema audit
  /^scripts\/check-db\.ts$/,                     // Phase 1 smoke gate (baseline raw-db importer; Rule-3 deviation)
  /^lib\/db\/scoped\.ts$/,                       // wrapper that secures the channel (Plan 02-01)
];

function isAllowed(rel: string): boolean {
  const posix = rel.split(pathSep).join('/');
  return ALLOWLIST.some((re) => re.test(posix));
}

async function main(): Promise<void> {
  const project = new Project({
    tsConfigFilePath: resolvePath(process.cwd(), 'tsconfig.json'),
    // Don't load all the type-checker — we only need AST + module spec strings.
    skipAddingFilesFromTsConfig: true,
  });

  // Explicitly add the directories we want to scan. This avoids ts-morph
  // walking node_modules / .next / etc.
  project.addSourceFilesAtPaths([
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'scripts/**/*.ts',
    'tests/**/*.ts',
    'middleware.ts',
  ]);

  const violations: { file: string; spec: string }[] = [];
  let allowListedHits = 0;

  const repoRoot = process.cwd();
  for (const sourceFile of project.getSourceFiles()) {
    const rel = relPath(repoRoot, sourceFile.getFilePath());
    for (const imp of sourceFile.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      // Match the BARREL `@/lib/db` exactly — NOT `@/lib/db/schema`,
      // `@/lib/db/scoped`, `@/lib/db/repositories/*`. These are sub-modules
      // that don't export the raw `db` connection.
      if (spec === '@/lib/db' || spec === '@/lib/db/index') {
        if (isAllowed(rel)) {
          allowListedHits += 1;
        } else {
          violations.push({ file: rel, spec });
        }
      }
    }
  }

  // POSITIVE CONTROL: confirm we found AT LEAST the wrapper + the webhook
  // (lib/db/scoped.ts + app/api/webhooks/clerk/route.ts both exist after
  // Plan 02-01 + Plan 02-05). If we found 0 legitimate hits, the walker
  // is broken (e.g., wrong path alias resolution, tsconfig paths bug).
  if (allowListedHits < 2) {
    console.error(
      `L-05 positive control failed: expected at least 2 allow-listed @/lib/db imports (lib/db/scoped.ts + app/api/webhooks/clerk/route.ts), found ${allowListedHits}. The AST walker may be broken.`,
    );
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error('ADR-023 / L-05 raw-`db` allow-list violations:');
    for (const v of violations) {
      console.error(`  ${v.file}: import '${v.spec}' (not allow-listed)`);
    }
    console.error('');
    console.error('See ADR-023 + .planning/phases/02-data-layer/02-CONTEXT.md L-05.');
    console.error('Allowed importers:');
    console.error('  - app/api/webhooks/{clerk,stripe}/route.ts');
    console.error('  - app/api/cron/**/route.ts');
    console.error('  - tests/** + scripts/check-{rls,schema,db}.ts');
    console.error('  - lib/db/scoped.ts (the wrapper that secures the channel)');
    process.exit(1);
  }

  console.log(`OK — L-05: ${allowListedHits} allow-listed @/lib/db import(s), 0 violations.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
