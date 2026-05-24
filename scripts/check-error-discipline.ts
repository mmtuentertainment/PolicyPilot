// scripts/check-error-discipline.ts — ADR-026 verify gate.
//
// Fails CI if any `throw new Error(...)` (or related built-in Error
// subclass — TypeError, RangeError, etc., with or without the `new`
// keyword) survives in lib/auth/ TypeScript files (both .ts and .tsx —
// .tsx is unlikely in lib/auth given the server-only convention but
// architecturally permitted, so the scope is symmetric to avoid a
// silent enforcement gap if a .tsx ever lands here), excluding the
// error class declarations in errors.ts itself and test/mock files.
// The convention
// from ADR-026: every throw in lib/auth/ uses a class from
// lib/auth/errors.ts, narrowable by `err instanceof Class` against the
// typed allow-lists in app/(admin)/dashboard/page.tsx and
// app/(auth)/post-sign-in/page.tsx.
//
// SCOPE: lib/auth/ + lib/stripe/ (Phase 4 D-16 extension) + lib/policies/
// (Phase 5 D-30 extension — typed PolicyDomainError hierarchy in
// lib/policies/errors.ts mirrors ADR-026 BootstrapError shape).
// A stray `throw new Error('No active organization')` in lib/db/scoped.ts
// or a repository is NOT caught by this gate — and would no longer be
// caught by the dashboard's race-recovery (which now narrows by class,
// not message). Other layers (Claude API integration leaf modules,
// repository invariants — which already use IllegalTransitionError /
// PolicyDomainError subclasses) may adopt the typed-error pattern with
// their own ADRs when their surface complexity warrants it. Broad
// project-wide enforcement would create dead-letter clauses for layers
// that haven't earned their typed-error decision yet.
//
// ENFORCEMENT LIMITS: this gate is a syntactic AST scan, not a
// type-resolved check. It catches:
//   - `throw new Error(...)` and `throw Error(...)` (no-new form)
//   - All built-in Error subclasses (TypeError, RangeError, SyntaxError,
//     ReferenceError, EvalError, URIError, AggregateError)
//
// It does NOT catch the following pathological patterns (documented
// limits rather than silent gaps):
//   - Aliased Error: `const E = Error; throw new E('...')`
//   - Data-flow throws: `const err = new Error('x'); throw err;`
//   - Wrapped constructions: `throw Object.assign(new Error(), {...})`
//   - Re-exported Error under a different name
//   - `Promise.reject(new Error(...))` returned from async code
// These would require type-resolution against the global lib.es5
// `ErrorConstructor` symbol, which is out of scope. Code review +
// the per-PR review-toolkit pass is the catch-all for these.
//
// Wired into `pnpm verify:phase-3` via the package.json script
// `check:error-discipline` (also runnable standalone).

import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

/** Built-in Error and Error-subclass constructors that must NOT be thrown
 *  directly from lib/auth/. Used for both `throw new X(...)` (NewExpression
 *  callee) and `throw X(...)` (CallExpression callee — both are valid JS
 *  for Error subclasses and produce equivalent runtime behavior).
 */
const BANNED_BUILTIN_ERRORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
]);

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

// Scope: lib/auth/**/*.ts and lib/auth/**/*.tsx EXCLUDING errors.ts
// itself (where the class hierarchy lives — its body should never
// `throw new Error` either, but excluding it keeps the gate's intent
// crisp: "consumers of errors.ts must use the classes") and test/mock
// files (Vitest's own `expect(...).toThrowError(new Error('...'))`
// would otherwise trip the gate).
//
// .tsx is included for scope symmetry: lib/auth is server-only by
// convention and has no .tsx files today, but the gate's stated intent
// is "every throw in lib/auth" — a future .tsx landing here (someone
// breaking the server-only convention) should not silently bypass.
//
// Broadened exclusion globs to cover Vitest's discovered file patterns
// (Vitest picks up .test.ts/.spec.ts AND .test.tsx/.spec.tsx by
// default), plus the standard __mocks__/ and __tests__/ directory
// conventions, and any future-generated .d.ts declarations.
project.addSourceFilesAtPaths([
  'lib/auth/**/*.ts',
  'lib/auth/**/*.tsx',
  '!lib/auth/errors.ts',
  '!lib/auth/**/*.test.ts',
  '!lib/auth/**/*.test.tsx',
  '!lib/auth/**/*.spec.ts',
  '!lib/auth/**/*.spec.tsx',
  '!lib/auth/**/*.d.ts',
  '!lib/auth/**/__mocks__/**',
  '!lib/auth/**/__tests__/**',
  // Phase 4 D-16: extend scan scope to lib/stripe/ — mirrors lib/auth scope.
  // TierLimitExceededError lives in lib/stripe/errors.ts (excluded below; it's the typed-error
  // definition file — the rule applies to consumers, not the definition site).
  'lib/stripe/**/*.ts',
  'lib/stripe/**/*.tsx',
  '!lib/stripe/errors.ts',
  '!lib/stripe/**/*.test.ts',
  '!lib/stripe/**/*.test.tsx',
  '!lib/stripe/**/*.spec.ts',
  '!lib/stripe/**/*.spec.tsx',
  '!lib/stripe/**/*.d.ts',
  '!lib/stripe/**/__mocks__/**',
  '!lib/stripe/**/__tests__/**',
  // Phase 5 D-30: extend scan scope to lib/policies/ — PolicyDomainError
  // hierarchy lives in lib/policies/errors.ts (excluded below as the
  // typed-error definition site; the rule applies to consumers).
  // lib/policies/transitions.ts had `throw new Error('Policy not found')`
  // until Plan 05-08 migrated it to `throw new PolicyNotFoundError(policyId)`
  // as part of this widening (Rule-1 deviation documented in SUMMARY).
  'lib/policies/**/*.ts',
  'lib/policies/**/*.tsx',
  '!lib/policies/errors.ts',
  '!lib/policies/**/*.test.ts',
  '!lib/policies/**/*.test.tsx',
  '!lib/policies/**/*.spec.ts',
  '!lib/policies/**/*.spec.tsx',
  '!lib/policies/**/*.d.ts',
  '!lib/policies/**/__mocks__/**',
  '!lib/policies/**/__tests__/**',
]);

interface Violation {
  filePath: string;
  line: number;
  className: string;
  form: 'new' | 'call';
}

const violations: Violation[] = [];

for (const sourceFile of project.getSourceFiles()) {
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.ThrowStatement) return;
    const throwStmt = node.asKindOrThrow(SyntaxKind.ThrowStatement);
    const expr = throwStmt.getExpression();
    if (!expr) return;
    const exprKind = expr.getKind();

    // `throw new Error(...)` shape.
    if (exprKind === SyntaxKind.NewExpression) {
      const newExpr = expr.asKindOrThrow(SyntaxKind.NewExpression);
      const className = newExpr.getExpression().getText();
      if (BANNED_BUILTIN_ERRORS.has(className)) {
        violations.push({
          filePath: sourceFile.getFilePath(),
          line: throwStmt.getStartLineNumber(),
          className,
          form: 'new',
        });
      }
      return;
    }

    // `throw Error(...)` shape (no `new` — legal JS, same runtime effect
    // for Error subclasses, can sneak past a NewExpression-only check).
    if (exprKind === SyntaxKind.CallExpression) {
      const callExpr = expr.asKindOrThrow(SyntaxKind.CallExpression);
      const calleeName = callExpr.getExpression().getText();
      if (BANNED_BUILTIN_ERRORS.has(calleeName)) {
        violations.push({
          filePath: sourceFile.getFilePath(),
          line: throwStmt.getStartLineNumber(),
          className: calleeName,
          form: 'call',
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('ADR-026 violation(s): direct built-in Error throw in lib/auth/');
  for (const { filePath, line, className, form } of violations) {
    const syntax = form === 'new' ? `throw new ${className}(...)` : `throw ${className}(...)`;
    console.error(`  ${filePath}:${line} — ${syntax}`);
  }
  console.error(
    `\nFix: add a class to lib/auth/errors.ts (or use an existing one) and ` +
      `throw an instance of it. See ADR-026 in .planning/PROJECT.md.`,
  );
  process.exit(1);
}

const checkedCount = project.getSourceFiles().length;
console.log(
  `OK — ADR-026 + Phase 4 D-16 + Phase 5 D-30: ${checkedCount} file(s) scanned in lib/auth/ + lib/stripe/ + lib/policies/; ` +
    `no direct built-in Error throws (new or no-new form, ${BANNED_BUILTIN_ERRORS.size} banned constructors).`,
);
process.exit(0);
