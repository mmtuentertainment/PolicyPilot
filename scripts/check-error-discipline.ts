// scripts/check-error-discipline.ts — ADR-026 verify gate.
//
// Fails CI if any `throw new Error(...)` syntax survives in lib/auth/**.ts
// (excluding the error class declarations in errors.ts itself and the
// test files). The convention from ADR-026: every throw in lib/auth/
// uses a class from lib/auth/errors.ts, narrowable by `err instanceof
// Class` against the typed allow-lists in
// app/(admin)/dashboard/page.tsx and app/(auth)/post-sign-in/page.tsx.
//
// Scope: lib/auth/ ONLY. Other layers (Stripe webhook in Phase 6,
// Claude API integration in Phase 4, repository invariants — which
// already use IllegalTransitionError) may adopt the typed-error pattern
// with their own ADRs when their surface complexity warrants it. This
// gate is intentionally scoped narrowly so it stays enforceable; broad
// project-wide enforcement would create dead-letter clauses for layers
// that haven't earned their typed-error decision yet.
//
// Wired into `pnpm verify:phase-3` via the package.json script
// `check:error-discipline` (also runnable standalone).

import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

// Scope: lib/auth/**/*.ts EXCLUDING errors.ts itself (where the class
// hierarchy lives — its body should never `throw new Error` either, but
// excluding it keeps the gate's intent crisp: "consumers of errors.ts
// must use the classes") and test files (Vitest's own `expect(...).
// toThrowError(new Error('...'))` would otherwise trip the gate).
project.addSourceFilesAtPaths([
  'lib/auth/**/*.ts',
  '!lib/auth/errors.ts',
  '!lib/auth/**/*.test.ts',
]);

interface Violation {
  filePath: string;
  line: number;
}

const violations: Violation[] = [];

for (const sourceFile of project.getSourceFiles()) {
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.ThrowStatement) return;
    const throwStmt = node.asKindOrThrow(SyntaxKind.ThrowStatement);
    const expr = throwStmt.getExpression();
    if (!expr) return;
    if (expr.getKind() !== SyntaxKind.NewExpression) return;
    const newExpr = expr.asKindOrThrow(SyntaxKind.NewExpression);
    const className = newExpr.getExpression().getText();
    if (className === 'Error') {
      violations.push({
        filePath: sourceFile.getFilePath(),
        line: throwStmt.getStartLineNumber(),
      });
    }
  });
}

if (violations.length > 0) {
  console.error('ADR-026 violation(s): `throw new Error(...)` in lib/auth/');
  for (const { filePath, line } of violations) {
    console.error(`  ${filePath}:${line}`);
  }
  console.error(
    `\nFix: add a class to lib/auth/errors.ts (or use an existing one) and ` +
      `throw an instance of it. See ADR-026 in .planning/PROJECT.md.`,
  );
  process.exit(1);
}

const checkedCount = project.getSourceFiles().length;
console.log(
  `OK — ADR-026: ${checkedCount} file(s) scanned in lib/auth/; no \`throw new Error(...)\` violations.`,
);
process.exit(0);
