// scripts/check-acknowledgment-immutability.ts — Plan 05-08 Task 1a (D-18..D-20).
//
// ADR-018 append-only enforcement at CI time. Extended in the Phase 5
// hardening pass to cover both write-once capability tables:
// acknowledgments and qa_citation_grants. Three-layer defense:
//   1. TYPE SYSTEM — tests/types.ts D-07 @ts-expect-error invariants prove
//      Acknowledgments repository exports NO update/delete keys at compile
//      time (Phase 2 lock).
//   2. CI GATE — THIS FILE — ts-morph AST scan of lib/**/*.ts + app/**/*.ts(x) for
//      .update(table) / .delete(table) call expressions
//      (handles aliased imports like `import { acknowledgments as ack }`).
//      Sub-pass 2 regex scan catches raw-SQL bypass per EAPI advisor H-1:
//      `db.execute(sql`UPDATE/DELETE <immutable table>...`)` template literals.
//   3. DB GRANT-asymmetry-documented — drizzle/0001_rls_policies.sql:67-73 —
//      DB GRANTs UPDATE + DELETE for authenticated role (mandatory for RLS
//      symmetry); the lock is at the app layer (ADR-018), not DB. The
//      deferred 0012 REVOKE migration would close the gap at the DB layer
//      (ASK-FIRST per CLAUDE.md, documented in Plan 05-08 <deferred>).
//
// Two modes:
//   - DEFAULT — scans lib/**/*.ts + app/**/*.ts(x), exits 0 if no
//     violations.
//   - --self-test — scans ONLY tests/fixtures/ack-mutation-attempt.ts,
//     exits 0 if >= 2 violations found WITH BOTH hasDrizzle && hasRawSql
//     paths exercised (reverse-interpreted — proves both detection paths
//     non-vacuous per D-20 + EAPI H-1).
//
// Pattern source: scripts/check-policy-id-brand.ts (ts-morph Project +
// getSourceFile + getVariableDeclarations + asKind/SyntaxKind) — D-18
// explicit mirror.
//
// EAPI Critical Path H-1 closure:
//   The Drizzle-API AST walk (Sub-pass 1) catches .update(acknowledgments) /
//   .delete(acknowledgments) with aliased imports, repository-object
//   methods, etc. — but does NOT catch raw SQL bypassing Drizzle via
//   db.execute(sql`UPDATE acknowledgments...`). Phase 2's RLS GRANT block
//   does NOT block this at DB level; the regex scan in Sub-pass 2 is
//   therefore the sole runtime defense against the raw-SQL bypass class.
//   The negative-control fixture (tests/fixtures/ack-mutation-attempt.ts)
//   contains BOTH violation kinds so the --self-test mode exercises and
//   verifies BOTH detection paths every CI run.
import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

const SCHEMA_SYMBOL_FILE = 'lib/db/schema.ts';
const IMMUTABLE_TABLES = [
  { symbolName: 'acknowledgments', sqlName: 'acknowledgments' },
  { symbolName: 'qaCitationGrants', sqlName: 'qa_citation_grants' },
  // Phase 9 D-09-01 (R-017) — append-only reviewer-decision audit ledger (②b).
  { symbolName: 'reviewDecisions', sqlName: 'review_decisions' },
] as const;
const IMMUTABLE_SYMBOL_NAMES: Set<string> = new Set(
  IMMUTABLE_TABLES.map((table) => table.symbolName),
);
// Banned method names when called on immutable schema symbols.
// Mirrors repository keys excluded per ADR-018 spirit. The compile-time
// inverted-polarity invariants in tests/types.ts are the type-system layer
// of the same lock.
const VIOLATION_METHODS = new Set(['update', 'delete']);
const PROD_GLOBS = ['lib/**/*.ts', 'app/**/*.ts', 'app/**/*.tsx'];
const FIXTURE_FILE = 'tests/fixtures/ack-mutation-attempt.ts';

// Sub-pass 2 regex: catches raw-SQL bypass via tagged-template literals.
// Matches sql`UPDATE acknowledgments ...` or sql`DELETE FROM acknowledgments ...`
// (with optional double-quoting around the identifier). Multi-line OK because
// [^`]*? matches across newlines (template literals span lines).
// `g` for multiple matches per file; `i` for case-insensitive SQL keywords.
// The regex is conservative — only `sql`...`` tagged template literals (the
// canonical Drizzle escape hatch). Does NOT attempt `db.execute("...")`
// plain-string execution (rare in this codebase; would produce false
// positives on comments/docs). Documented secondary gap mitigated by ADR-018
// review discipline + tests/types.ts D-07 type-system invariant.
const RAW_SQL_PATTERN =
  /\bsql\s*`[^`]*?\b(UPDATE|DELETE\s+FROM)\s+(?:"(acknowledgments|qa_citation_grants|review_decisions)"|(acknowledgments|qa_citation_grants|review_decisions))\b[^`]*?`/gi;

type Violation = {
  file: string;
  line: number;
  table: string;
  method: string; // 'update' | 'delete' | 'raw SQL UPDATE' | 'raw SQL DELETE FROM'
};

function main(): void {
  const args = process.argv.slice(2);
  const selfTest = args.includes('--self-test');

  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  // Always load lib/db/schema.ts so symbol resolution can follow the
  // import { acknowledgments, qaCitationGrants } from '@/lib/db/schema'
  // chain in either mode.
  // Without this the Sub-pass 1 AST walk cannot resolve the schema symbol
  // and silently passes (false negative — hasDrizzle=false in self-test).
  project.addSourceFilesAtPaths(SCHEMA_SYMBOL_FILE);

  // Files that will be SCANNED for violations. Schema file is added above
  // for symbol resolution only — it's filtered out of the scan loop below.
  const scanPaths = new Set<string>();

  if (selfTest) {
    // Self-test mode: scan ONLY the negative-control fixture (but the
    // schema file is loaded into the Project so symbol resolution works).
    project.addSourceFilesAtPaths(FIXTURE_FILE);
    scanPaths.add(FIXTURE_FILE);
  } else {
    // Production mode: scan lib/**/*.ts plus app mutation surfaces.
    project.addSourceFilesAtPaths(PROD_GLOBS);
    // EXCLUDE tests/fixtures/** so the negative-control fixture doesn't
    // trigger the production gate per D-19. The PROD_GLOBS list
    // already excludes tests/ by path, but defense-in-depth removeSourceFile
    // covers the case where a future fixture lands under lib/__fixtures__/.
    const fixtureFile = project.getSourceFile(FIXTURE_FILE);
    if (fixtureFile) project.removeSourceFile(fixtureFile);
    for (const sf of project.getSourceFiles()) {
      scanPaths.add(sf.getFilePath());
    }
  }

  // Helper: should this source-file path be scanned for violations? In
  // self-test mode, only the fixture; in production mode, every file added
  // via PROD_GLOB. The schema file is loaded for resolution but never scanned.
  const shouldScan = (sf: import('ts-morph').SourceFile): boolean => {
    const fp = sf.getFilePath();
    if (selfTest) {
      return fp.endsWith(FIXTURE_FILE);
    }
    return scanPaths.has(fp);
  };

  // Comment-stripping for Sub-pass 2 (raw-SQL regex) is done inline below
  // with length-preserving whitespace so match.index maps to the original
  // source position. Mirrors scripts/check-artifacts.ts:56-65 +
  // scripts/check-policy-id-brand.ts comment-strip conventions. The
  // length-preserving variant is required because we need accurate
  // line numbers from getLineAndColumnAtPos against the original text.

  const violations: Violation[] = [];

  // ── Sub-pass 1: Drizzle-API CallExpression walk ────────────────────────
  // Walk every source file (filtered by shouldScan), walk every
  // CallExpression, check if the call target is `.update(X)` or `.delete(X)`
  // where X is an Identifier resolving to an immutable schema
  // symbol (via ts-morph's symbol resolution — handles aliased imports
  // like `acknowledgments as ack`).
  for (const sourceFile of project.getSourceFiles()) {
    if (!shouldScan(sourceFile)) continue;
    sourceFile.forEachDescendant((node) => {
      if (!node.isKind(SyntaxKind.CallExpression)) return;
      const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
      const callee = callExpr.getExpression();
      // Only PropertyAccessExpression callees can be .update(...) / .delete(...)
      if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) return;
      const propAccess = callee.asKindOrThrow(
        SyntaxKind.PropertyAccessExpression,
      );
      const methodName = propAccess.getName(); // 'update' or 'delete'
      if (!VIOLATION_METHODS.has(methodName)) return;

      // Inspect the first arg: must be an Identifier resolving to a locked table.
      const callArgs = callExpr.getArguments();
      if (callArgs.length === 0) return;
      const firstArg = callArgs[0];
      if (!firstArg || !firstArg.isKind(SyntaxKind.Identifier)) return;
      const ident = firstArg.asKindOrThrow(SyntaxKind.Identifier);
      const symbol = ident.getSymbol();
      if (!symbol) return;

      // Resolve via declarations — but first follow the import-alias chain
      // (import { acknowledgments } / import { acknowledgments as ack }).
      // ts-morph's getSymbol() returns the LOCAL import-binding symbol; its
      // declarations point to the ImportSpecifier in the current file, not
      // to the schema declaration. getAliasedSymbol() follows the chain to
      // the schema's `export const acknowledgments` declaration. Use it
      // when available; fall back to the original symbol for non-imported
      // identifiers (defensive — wouldn't normally apply to schema refs).
      const aliased = symbol.getAliasedSymbol() ?? symbol;
      // Only flag if the (resolved) symbol's name is one of the immutable schemas.
      const symbolName = aliased.getName();
      if (!IMMUTABLE_SYMBOL_NAMES.has(symbolName)) return;
      const table = IMMUTABLE_TABLES.find(
        (candidate) => candidate.symbolName === symbolName,
      );
      if (!table) return;

      for (const decl of aliased.getDeclarations()) {
        const declFile = decl.getSourceFile().getFilePath();
        // Match either the schema file directly OR a re-export chain through
        // a path containing /db/schema (covers future lib/db/schema/*
        // sub-modules if the schema is ever split). Normalize path
        // separators to forward slashes so the check is OS-agnostic
        // (Windows getFilePath() may use backslashes).
        const declFileNorm = declFile.replace(/\\/g, '/');
        if (
          declFileNorm.endsWith(SCHEMA_SYMBOL_FILE) ||
          declFileNorm.includes('/db/schema')
        ) {
          const lineNum = callExpr.getStartLineNumber();
          violations.push({
            file: sourceFile.getFilePath(),
            line: lineNum,
            table: table.sqlName,
            method: methodName,
          });
          break; // one violation per CallExpression
        }
      }
    });
  }

  // ── Sub-pass 2: Raw-SQL bypass detection (EAPI advisor H-1) ────────────
  // The Sub-pass 1 AST walk catches Drizzle-API calls (tx.update(acknowledgments),
  // aliased imports, repository-object methods) but does NOT catch raw SQL
  // passed via sql`` template literals to .execute() / .query(). This bypass
  // class is REAL because Phase 2 drizzle/0001_rls_policies.sql:69 GRANTs
  // UPDATE + DELETE on acknowledgments to the authenticated role — the DB
  // layer does NOT block db.execute(sql`UPDATE acknowledgments SET ...`) from
  // a future bug. The ts-morph gate is therefore the SOLE runtime-side
  // defense against raw-SQL mutation; until 0012 REVOKE migration ships
  // (ASK-FIRST per CLAUDE.md), this regex pass is the only thing preventing
  // a future contributor from silently bypassing ADR-018 via raw SQL.
  for (const sourceFile of project.getSourceFiles()) {
    if (!shouldScan(sourceFile)) continue;
    const filePath = sourceFile.getFilePath();
    // Strip comments BEFORE the regex pass so doc comments mentioning
    // `sql`UPDATE acknowledgments`` (e.g. in this file's own header) don't
    // produce false positives. Indices into the stripped text map back to
    // line numbers via the ORIGINAL source's line counts; we just preserve
    // the comment-replacement as same-length whitespace so character offsets
    // stay synchronized between stripped + original positions.
    const original = sourceFile.getFullText();
    const stripped = original
      // Preserve length: replace each comment with same-length spaces so
      // match.index maps cleanly to the original source position. We keep
      // newlines as-is so getLineAndColumnAtPos still reports correct lines.
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
      .replace(/\/\*[\s\S]*?\*\//g, (m) =>
        m.replace(/[^\n]/g, ' '),
      );
    // Reset lastIndex per file (RegExp state is per-instance across exec calls).
    RAW_SQL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RAW_SQL_PATTERN.exec(stripped)) !== null) {
      const pos = match.index;
      const lineCol = sourceFile.getLineAndColumnAtPos(pos);
      const verb = (match[1] ?? '').toUpperCase().replace(/\s+/g, ' ');
      const table = match[2] ?? match[3] ?? '<unknown>';
      violations.push({
        file: filePath,
        line: lineCol.line,
        table,
        method: `raw SQL ${verb}`,
      });
    }
  }

  // ── Result mode handling ────────────────────────────────────────────────
  if (selfTest) {
    // Reverse-interpretation: gate is proven non-vacuous if each immutable
    // table trips both detection paths in the fixture.
    // Per EAPI advisor H-1: BOTH detection paths must be exercised by the
    // negative-control fixture every CI run.
    const hasDrizzle = IMMUTABLE_TABLES.every((table) =>
      violations.some(
        (v) =>
          v.table === table.sqlName &&
          (v.method === 'update' || v.method === 'delete'),
      ),
    );
    const hasRawSql = IMMUTABLE_TABLES.every((table) =>
      violations.some(
        (v) => v.table === table.sqlName && v.method.startsWith('raw SQL'),
      ),
    );
    const expectedMinimum = IMMUTABLE_TABLES.length * 2;
    if (violations.length >= expectedMinimum && hasDrizzle && hasRawSql) {
      console.log(
        `OK — self-test: ${violations.length} violation(s) detected in ${FIXTURE_FILE} ` +
          `(gate is non-vacuous for ${IMMUTABLE_TABLES.length} immutable table(s); ` +
          `both Drizzle-API and raw-SQL detection paths exercised).`,
      );
      process.exit(0);
    }
    console.error(
      `FAIL — self-test: gate is broken. Found ${violations.length} violation(s); ` +
        `expected >= ${expectedMinimum} with both Drizzle-API and raw-SQL detection paths ` +
        `(hasDrizzle=${hasDrizzle}, hasRawSql=${hasRawSql}).`,
    );
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.method}(${v.table})`);
    }
    process.exit(1);
  }

  // Default (production) mode.
  if (violations.length === 0) {
    const filesScanned = project.getSourceFiles().length;
    const tableList = IMMUTABLE_TABLES.map((table) => table.sqlName).join(', ');
    console.log(
      `OK — ADR-018 append-only: 0 update/delete calls on ${tableList} ` +
        `(Drizzle-API or raw-SQL) in lib/** + app/** (${filesScanned} files scanned).`,
    );
    process.exit(0);
  }

  console.error(`FAIL — ADR-018 violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.method}(${v.table})`);
  }
  console.error(
    `\nSee ADR-018 in .planning/PROJECT.md (acknowledgment records are ` +
      `append-only — audit trail is immutable).`,
  );
  process.exit(1);
}

main();
