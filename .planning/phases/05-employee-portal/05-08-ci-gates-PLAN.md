---
phase: 05-employee-portal
plan: 08
type: execute
wave: 4
depends_on:
  - 05-01
  - 05-02
  - 05-03
  - 05-04
  - 05-05
  - 05-06
  - 05-07
files_modified:
  - scripts/check-acknowledgment-immutability.ts
  - tests/fixtures/ack-mutation-attempt.ts
  - scripts/check-rls.ts
  - scripts/check-policy-id-brand.ts
  - scripts/check-error-discipline.ts
  - scripts/check-artifacts.ts
  - package.json
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "scripts/check-acknowledgment-immutability.ts ts-morph gate exists per D-18 — scans lib/**/*.ts excluding tests/fixtures/** for .update(acknowledgments) / .delete(acknowledgments) calls"
    - "Gate INCLUDES a raw-SQL bypass sub-pass per EAPI advisor H-1: detects `db.execute(sql\\`UPDATE/DELETE acknowledgments...\\`)` template literals — closes the bypass class NOT caught by Drizzle-API CallExpression matching (Phase 2 0001_rls_policies.sql:69 GRANTs UPDATE+DELETE to authenticated so the DB layer does NOT prevent raw SQL bypass)"
    - "tests/fixtures/ack-mutation-attempt.ts negative-control fixture exists per D-20 — calls BOTH .update(acknowledgments).set({}) AND db.execute(sql\\`UPDATE acknowledgments...\\`) — proves BOTH detection paths non-vacuous"
    - "Gate has --self-test mode per D-20 — scans ONLY the fixture, exits 0 if EXACTLY 2+ violations found (reverse-interpreted; 1 Drizzle-API + 1 raw-SQL)"
    - "scripts/check-rls.ts TENANT_TABLES array extended with 'qa_citation_grants' per RESEARCH gap-2"
    - "scripts/check-policy-id-brand.ts REPO_TARGETS + ORCH_TARGETS + OBJECT_FIELD_TARGETS extended for Phase 5 brand-bearing surfaces per RESEARCH gap-4"
    - "scripts/check-error-discipline.ts widened to scan lib/policies/** per D-30"
    - "scripts/check-artifacts.ts appended with Phase 5 block asserting all new files exist"
    - "package.json gains 3 new script entries: check:acknowledgment-immutability, check:acknowledgment-immutability:self-test, check:employee-portal — verify:phase-5 chain target NOT YET wired (Plan 05-10 does that after Plan 05-09 ships the script)"
  artifacts:
    - path: "scripts/check-acknowledgment-immutability.ts"
      provides: "ts-morph gate detecting Acknowledgments mutations"
      contains: "ts-morph"
      min_lines: 80
    - path: "tests/fixtures/ack-mutation-attempt.ts"
      provides: "Negative-control fixture proving the gate non-vacuous"
      contains: ".update(acknowledgments)"
    - path: "scripts/check-rls.ts"
      provides: "Extended TENANT_TABLES with qa_citation_grants"
      contains: "'qa_citation_grants'"
    - path: "scripts/check-policy-id-brand.ts"
      provides: "Extended brand-target dicts for Phase 5 surfaces"
      contains: "qa_citation_grants.ts"
    - path: "scripts/check-error-discipline.ts"
      provides: "Widened scope to lib/policies/**"
      contains: "lib/policies"
    - path: "scripts/check-artifacts.ts"
      provides: "Phase 5 block asserting all new file existence"
      contains: "Phase 5"
    - path: "package.json"
      provides: "3 new script entries"
      contains: "check:acknowledgment-immutability"
  key_links:
    - from: "scripts/check-acknowledgment-immutability.ts default mode"
      to: "lib/db/repositories/acknowledgments.ts (and all of lib/**/*.ts)"
      via: "ts-morph CallExpression walk + Identifier resolution to acknowledgments schema symbol"
      pattern: "addSourceFilesAtPaths.*lib"
    - from: "scripts/check-acknowledgment-immutability.ts --self-test mode"
      to: "tests/fixtures/ack-mutation-attempt.ts"
      via: "scans ONLY this file; reverse-interprets exit code (0 = at least 1 violation found)"
      pattern: "--self-test|self-test"
---

<objective>
Wave 4. Build out the CI gate layer per D-18..D-20 + RESEARCH gaps 1-5. Five CI-gate file changes + one new gate file + one new fixture file + package.json script registrations:

1. **NEW** `scripts/check-acknowledgment-immutability.ts` per D-18 — ts-morph gate detecting `.update(acknowledgments)` / `.delete(acknowledgments)` calls in `lib/**/*.ts` excluding `tests/fixtures/**`.
2. **NEW** `tests/fixtures/ack-mutation-attempt.ts` per D-20 — negative-control fixture intentionally calling `.update(acknowledgments).set({})` so `--self-test` mode proves the gate is non-vacuous.
3. **EXTEND** `scripts/check-rls.ts` TENANT_TABLES array — add `'qa_citation_grants'` per RESEARCH gap-2.
4. **EXTEND** `scripts/check-policy-id-brand.ts` REPO_TARGETS + ORCH_TARGETS + OBJECT_FIELD_TARGETS per RESEARCH gap-4.
5. **WIDEN** `scripts/check-error-discipline.ts` to scan `lib/policies/**` per D-30 (Phase 4 widened for `lib/stripe/` — same pattern).
6. **APPEND** `scripts/check-artifacts.ts` with Phase 5 block asserting all 8+ new file paths exist.
7. **AMEND** `package.json` with 3 new script entries (NOT yet wiring `verify:phase-5` chain target — Plan 05-10 does that after Plan 05-09 ships the integration test script).

Purpose: This plan locks the R-5 append-only invariant at the 3rd defense layer (ts-morph runtime grep on top of the existing tests/types.ts D-07 compile-time invariant + the documented DB GRANT asymmetry per 0001_rls_policies.sql:67-73). Closes RESEARCH gaps 2 + 4. Sets up everything Plan 05-10 needs to wire `verify:phase-5` chain.

Output: Six CI-gate files modified + 2 new files; all existing gates still pass; new gate passes against shipped Phase 5 code AND fails against negative-control fixture (proven via --self-test mode).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@scripts/check-policy-id-brand.ts
@scripts/check-error-discipline.ts
@scripts/check-rls.ts
@scripts/check-schema.ts
@scripts/check-artifacts.ts
@package.json
@lib/db/schema.ts
@lib/db/repositories/acknowledgments.ts
@tests/types.ts

<interfaces>
<!-- Existing CI gate dict shapes — this plan extends -->

From scripts/check-policy-id-brand.ts (lines 52-96):
```typescript
const REPO_TARGETS: Record<string, string[]> = {
  'lib/db/repositories/policies.ts': ['findById', 'updateDraft', 'incrementVersion', 'updateSummary'],
  'lib/db/repositories/policy_versions.ts': ['listForPolicy', 'findByVersionNumber'],
  'lib/db/repositories/policy_assignments.ts': ['listForPolicy'],
  'lib/db/repositories/workflow_stages.ts': ['recordSubmission', 'listForPolicy'],
};
const ORCH_TARGETS: Record<string, string[]> = {
  'lib/policies/transitions.ts': ['submitForReview', 'approve', 'reject', 'publish', 'archive', 'restore', 'editPublished', 'loadAndAssertTransition'],
};
const OBJECT_FIELD_TARGETS = [
  { file: 'lib/db/repositories/policy_versions.ts', method: 'create', paramIndex: 1, field: 'policyId' },
];
```

From scripts/check-rls.ts (lines 35-47):
```typescript
const TENANT_TABLES = ['organizations', 'users', 'departments', 'policies', 'policy_versions', 'policy_assignments', 'acknowledgments', 'ai_generations', 'notifications', 'workflow_stages', 'batch_jobs'] as const;
```

From scripts/check-error-discipline.ts (lines 16-25):
- Scope: lib/auth/ + lib/stripe/ (per Phase 4 widening)
- Phase 5 widens to add lib/policies/ (per D-30)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create scripts/check-acknowledgment-immutability.ts (D-18) + tests/fixtures/ack-mutation-attempt.ts (D-20 negative-control) + 2 new package.json script entries</name>
  <files>scripts/check-acknowledgment-immutability.ts, tests/fixtures/ack-mutation-attempt.ts, package.json</files>
  <read_first>
    - scripts/check-policy-id-brand.ts (whole file — D-18 explicit mirror; ts-morph Project init pattern at lines 43-49; object-literal repo traversal at lines 100-150; OBJECT_FIELD_TARGETS handler at line 219; main loop at lines 280-322)
    - scripts/check-error-discipline.ts (lines 47-100 — glob scope + AST walk pattern; tightening pattern for AST resolution)
    - lib/db/repositories/acknowledgments.ts (whole file — the ONLY file in lib/** that should resolve the `acknowledgments` symbol AND legitimately uses it via `.insert(acknowledgments)`; the gate's job is to detect `.update()` / `.delete()` against this symbol — `.insert()` is legitimate)
    - lib/db/schema.ts (search for `export const acknowledgments` — the symbol the gate resolves against)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Append-Only CI Gate (D-18..D-20)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`scripts/check-acknowledgment-immutability.ts`" + § "`tests/fixtures/ack-mutation-attempt.ts`"
    - package.json scripts block (lines 9-46)
  </read_first>
  <action>
**Sub-task 1a: Create `scripts/check-acknowledgment-immutability.ts` per D-18.**

File-header comment block:
- "scripts/check-acknowledgment-immutability.ts — Plan 05-08 Task 1a (D-18..D-20)."
- "ADR-018 append-only enforcement at CI time. Three-layer defense:"
  - "1. TYPE SYSTEM — tests/types.ts D-07 @ts-expect-error invariants prove Acknowledgments repository exports NO update/delete keys at compile time"
  - "2. CI GATE — THIS FILE — ts-morph AST scan of lib/**/*.ts for .update(acknowledgments) / .delete(acknowledgments) call expressions (handles aliased imports like `import { acknowledgments as ack }`)"
  - "3. DB GRANT-asymmetry-documented — drizzle/0001_rls_policies.sql:67-73 — DB GRANTs UPDATE+DELETE for authenticated role (mandatory for RLS symmetry); the lock is at the app layer (ADR-018), not DB"
- "Two modes:"
  - "- DEFAULT — scans lib/**/*.ts excluding tests/fixtures/**, exits 0 if no violations"
  - "- --self-test — scans ONLY tests/fixtures/ack-mutation-attempt.ts, exits 0 if EXACTLY 1+ violations found (reverse-interpreted — proves the gate is non-vacuous per D-20)"
- "Pattern source: scripts/check-policy-id-brand.ts (ts-morph Project + getSourceFile + getVariableDeclarations + asKind/SyntaxKind) — D-18 explicit mirror"

Imports:
- `Project, SyntaxKind, Node` from `ts-morph`
- `resolve` from `node:path`

Constants:
- `const ACK_SYMBOL_FILE = 'lib/db/schema.ts'` — file declaring `export const acknowledgments`
- `const ACK_SYMBOL_NAME = 'acknowledgments'`
- `const VIOLATION_METHODS = new Set(['update', 'delete'])` — banned method names when called on the acknowledgments symbol
- `const PROD_GLOB = 'lib/**/*.ts'`
- `const FIXTURE_FILE = 'tests/fixtures/ack-mutation-attempt.ts'`

Mode parsing:
```typescript
const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
```

Project setup:
```typescript
const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

if (selfTest) {
  project.addSourceFilesAtPaths(FIXTURE_FILE);
} else {
  project.addSourceFilesAtPaths(PROD_GLOB);
  // EXCLUDE tests/fixtures/** so the negative-control fixture doesn't trigger the production gate.
  const fixtureFile = project.getSourceFile(FIXTURE_FILE);
  if (fixtureFile) project.removeSourceFile(fixtureFile);
}
```

Detection algorithm — walk every source file, walk every CallExpression, check if call target is `.update(X)` or `.delete(X)` where X is an Identifier resolving to the `acknowledgments` schema symbol:

```typescript
type Violation = { file: string; line: number; method: string };
const violations: Violation[] = [];

for (const sourceFile of project.getSourceFiles()) {
  sourceFile.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const callExpr = node.asKindOrThrow(SyntaxKind.CallExpression);
    const callee = callExpr.getExpression();
    // Only PropertyAccessExpression callees can be .update(...) / .delete(...)
    if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const propAccess = callee.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName();  // 'update' or 'delete'
    if (!VIOLATION_METHODS.has(methodName)) return;

    // Inspect the first arg: must be an Identifier resolving to acknowledgments
    const args = callExpr.getArguments();
    if (args.length === 0) return;
    const firstArg = args[0];
    if (!firstArg.isKind(SyntaxKind.Identifier)) return;
    const ident = firstArg.asKindOrThrow(SyntaxKind.Identifier);
    const symbol = ident.getSymbol();
    if (!symbol) return;

    // Resolve via declarations — handles aliased imports
    for (const decl of symbol.getDeclarations()) {
      const declFile = decl.getSourceFile().getFilePath();
      // Match either the schema file directly OR an import-alias chain
      if (declFile.endsWith(ACK_SYMBOL_FILE) || declFile.includes('/db/schema')) {
        const name = symbol.getName();
        if (name === ACK_SYMBOL_NAME) {
          const lineNum = callExpr.getStartLineNumber();
          violations.push({ file: sourceFile.getFilePath(), line: lineNum, method: methodName });
        }
      }
    }
  });
}
```

Also detect `Acknowledgments.update(...)` / `Acknowledgments.delete(...)` (the repository object) — the same CallExpression walk: check if `propAccess.getExpression()` is an Identifier resolving to `Acknowledgments` from `lib/db/repositories/acknowledgments`. Optional but recommended for defense-in-depth.

**Sub-pass 2: Raw-SQL bypass detection (EAPI advisor H-1).**

The above AST walk catches Drizzle-API calls (`tx.update(acknowledgments)`, aliased imports, repository-object methods) but does NOT catch raw SQL passed via `sql\`\`` template literals to `.execute()` / `.query()`. This bypass class is REAL because Phase 2 `drizzle/0001_rls_policies.sql:69` GRANTs `UPDATE, DELETE` on `acknowledgments` to the `authenticated` role — the DB layer does NOT block `db.execute(sql\`UPDATE acknowledgments SET ...\`)` from a future bug. The ts-morph gate is therefore the SOLE runtime-side defense against raw-SQL mutation.

Add this sub-pass AFTER the Drizzle-API walk completes:

```typescript
// Sub-pass 2: regex scan for raw SQL bypass (EAPI advisor H-1).
// Catches: sql`UPDATE acknowledgments SET ...`
//          sql`DELETE FROM acknowledgments WHERE ...`
//          sql`DELETE FROM "acknowledgments" ...`
//          Multi-line variants via . matching \n through s-flag substitute below.
const RAW_SQL_PATTERN =
  /\bsql\s*`[^`]*?\b(UPDATE|DELETE\s+FROM)\s+(?:"acknowledgments"|acknowledgments)\b[^`]*?`/gi;

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  // Same exclude as Sub-task 1a (tests/fixtures/** excluded in default mode; included in --self-test).
  if (!shouldScan(filePath)) continue;
  const text = sourceFile.getFullText();
  let match: RegExpExecArray | null;
  // Reset lastIndex per file (RegExp state is per-instance).
  RAW_SQL_PATTERN.lastIndex = 0;
  while ((match = RAW_SQL_PATTERN.exec(text)) !== null) {
    const pos = match.index;
    const lineCol = sourceFile.getLineAndColumnAtPos(pos);
    violations.push({
      file: filePath,
      line: lineCol.line,
      method: `raw SQL ${match[1].toUpperCase().replace(/\s+/g, ' ')}`,
    });
  }
}
```

The regex is conservative — it only matches `sql\`...\`` tagged template literals (the canonical Drizzle escape hatch). It does NOT attempt to catch arbitrary `db.execute("...")` string literals because (a) plain-string execution is rare in this codebase and (b) regex on free-form strings produces false positives in comments/docs. The Drizzle convention is `sql\`...\`` (per `lib/db/scoped.ts` precedent); if a future contributor uses raw `db.execute("UPDATE acknowledgments SET ...")` as a string, this gate will not catch it — that's a documented secondary gap, mitigated by ADR-018 review discipline and the type-system D-07 invariant.

**Self-test expectation update:** the fixture now contains 2+ violations (1 Drizzle-API + 1 raw-SQL), so the self-test reverse-interpretation must require `>= 2` violations instead of `>= 1` per Sub-task 1b's updated fixture.

Result mode handling:
```typescript
if (selfTest) {
  // Reverse-interpretation: gate is proven non-vacuous if 2+ violations found in fixture
  // (1 Drizzle-API .update(acknowledgments) + 1 raw-SQL sql`UPDATE acknowledgments...`).
  // Per EAPI advisor H-1: BOTH detection paths must be exercised by the negative-control fixture.
  const hasDrizzle = violations.some(v => v.method === 'update' || v.method === 'delete');
  const hasRawSql = violations.some(v => v.method.startsWith('raw SQL'));
  if (violations.length >= 2 && hasDrizzle && hasRawSql) {
    console.log(`OK — self-test: ${violations.length} violation(s) detected in ${FIXTURE_FILE} (gate is non-vacuous; both Drizzle-API and raw-SQL detection paths exercised)`);
    process.exit(0);
  }
  console.error(`FAIL — self-test: gate is broken. Found ${violations.length} violations; expected ≥2 with both Drizzle-API and raw-SQL detection paths (hasDrizzle=${hasDrizzle}, hasRawSql=${hasRawSql})`);
  process.exit(1);
} else {
  if (violations.length === 0) {
    const filesScanned = project.getSourceFiles().length;
    console.log(`OK — ADR-018 append-only: 0 .update(acknowledgments) / .delete(acknowledgments) calls in lib/** (${filesScanned} files scanned).`);
    process.exit(0);
  }
  console.error(`FAIL — ADR-018 violation(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  .${v.method}(acknowledgments)`);
  }
  process.exit(1);
}
```

**Sub-task 1b: Create `tests/fixtures/ack-mutation-attempt.ts` per D-20.**

File-header comment block:
- "tests/fixtures/ack-mutation-attempt.ts — Plan 05-08 Task 1b (D-20)."
- "NEGATIVE-CONTROL fixture for scripts/check-acknowledgment-immutability.ts --self-test mode."
- "Intentionally violates ADR-018 by calling .update(acknowledgments). The self-test mode of the gate scans THIS FILE and exits 0 ONLY when at least 1 violation is detected."
- "DO NOT IMPORT OR CALL FROM PRODUCTION CODE."
- "DO NOT EXECUTE — this is a STATIC fixture for AST scanning; the function body is unreachable at runtime."
- "The production gate's default-mode glob (lib/**/*.ts) EXCLUDES tests/fixtures/** so this file does not trigger the production gate per D-19."

Body (updated per EAPI advisor H-1 — covers BOTH Drizzle-API + raw-SQL detection paths):
```typescript
import 'server-only';
import { sql } from 'drizzle-orm';
import { acknowledgments } from '@/lib/db/schema';

// Intentional ADR-018 violations — fixture proves D-18 ts-morph gate is non-vacuous
// across BOTH detection paths (Drizzle-API CallExpression + raw-SQL template literal).
// DO NOT IMPORT FROM PRODUCTION CODE. DO NOT INVOKE. The functions exist ONLY so
// scripts/check-acknowledgment-immutability.ts --self-test detects 2+ violations here.

type FakeTx = {
  update: (t: typeof acknowledgments) => { set: (v: Record<string, unknown>) => Promise<unknown> };
  execute: (q: unknown) => Promise<unknown>;
};

// Violation 1: Drizzle-API .update(acknowledgments) — Sub-task 1a AST walk.
export function _violationFixtureDrizzle(tx: FakeTx) {
  return tx.update(acknowledgments).set({});
}

// Violation 2: Raw-SQL bypass — Sub-pass 2 regex (EAPI advisor H-1 closure).
// Phase 2 drizzle/0001_rls_policies.sql:69 GRANTs UPDATE+DELETE to authenticated
// so this would succeed at DB level; the ts-morph gate is the sole runtime defense.
export function _violationFixtureRawSql(tx: FakeTx) {
  return tx.execute(sql`UPDATE acknowledgments SET ip_address = '0.0.0.0'`);
}
```

The file MUST contain BOTH (a) at least ONE `.update(acknowledgments)` / `.delete(acknowledgments)` Drizzle-API call AND (b) at least ONE `sql\`UPDATE/DELETE acknowledgments...\`` raw-SQL template literal — for the self-test mode to detect both detection paths and exit 0.

**Sub-task 1c: Add 2 new script entries to package.json.**

In the `"scripts"` block, AFTER the existing `"check:policy-id-brand"` entry (around line 39), ADD:
```json
"check:acknowledgment-immutability": "tsx scripts/check-acknowledgment-immutability.ts",
"check:acknowledgment-immutability:self-test": "tsx scripts/check-acknowledgment-immutability.ts --self-test",
```

DO NOT add the `check:employee-portal` entry yet (Plan 05-09 ships that script + its package.json entry).
DO NOT add a `verify:phase-5` chain entry yet (Plan 05-10 wires that after all dependencies ship).

PRESERVE all existing script entries verbatim.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && tsx scripts/check-acknowledgment-immutability.ts --self-test && tsx scripts/check-acknowledgment-immutability.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `tsx scripts/check-acknowledgment-immutability.ts` exits 0 — production gate against shipped Phase 5 code (post-Plan 05-03) MUST pass; if it fails, Plan 05-03 leaked a `.update(acknowledgments)` call past the type test (highly improbable but possible)
    - `tsx scripts/check-acknowledgment-immutability.ts --self-test` exits 0 — proves the gate is non-vacuous across BOTH detection paths (Drizzle-API + raw-SQL)
    - `grep -c "check:acknowledgment-immutability" package.json` returns at least 2 (two new script entries)
    - `grep -c "check:acknowledgment-immutability:self-test" package.json` returns 1
    - `grep -c "ts-morph" scripts/check-acknowledgment-immutability.ts` returns at least 1
    - `grep -c "VIOLATION_METHODS\|update\|delete" scripts/check-acknowledgment-immutability.ts` returns multiple (method-name detection set + the check)
    - `grep -c "tests/fixtures" scripts/check-acknowledgment-immutability.ts` returns at least 1 (exclusion glob)
    - `grep -c "--self-test" scripts/check-acknowledgment-immutability.ts` returns at least 1
    - **EAPI advisor H-1 closure** — gate INCLUDES raw-SQL bypass sub-pass: `grep -cE "RAW_SQL_PATTERN|sql\\\\s\\*\`" scripts/check-acknowledgment-immutability.ts` returns ≥ 1 (regex literal for the bypass class)
    - **EAPI advisor H-1 closure** — gate REJECTS self-test if either detection path missing: `grep -c "hasDrizzle\|hasRawSql" scripts/check-acknowledgment-immutability.ts` returns ≥ 2 (both flags checked in self-test branch)
    - `grep -c "_violationFixture" tests/fixtures/ack-mutation-attempt.ts` returns 2 (both Drizzle + raw-SQL fixture functions present per H-1)
    - `grep -c ".update(acknowledgments)" tests/fixtures/ack-mutation-attempt.ts` returns 1 (Drizzle-API violation present)
    - `grep -cE "sql\`UPDATE acknowledgments" tests/fixtures/ack-mutation-attempt.ts` returns 1 (raw-SQL violation present per H-1)
    - Manual smoke: introduce a temporary `tx.execute(sql\`UPDATE acknowledgments SET foo = 'x'\`)` in any `lib/**/*.ts` file → `tsx scripts/check-acknowledgment-immutability.ts` exits non-zero; remove → exits 0. (Operator verifies during UAT Plan 05-10.)
    - `pnpm verify:phase-4` still exits 0 (no regression; tests/fixtures/** scanning is opt-in via --self-test)
  </acceptance_criteria>
  <done>
    Gate works in both modes across BOTH detection paths: default mode green against shipped Phase 5 code (no Drizzle-API or raw-SQL acknowledgments-mutation calls); --self-test mode green against the 2-violation fixture (proving non-vacuous on both paths). 2 new package.json entries. EAPI advisor H-1 finding closed at CI layer; defense-in-depth REVOKE migration recommended as ASK-FIRST deferred item (see deferred section below).
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extend scripts/check-rls.ts (gap-2) + scripts/check-policy-id-brand.ts (gap-4) + widen scripts/check-error-discipline.ts (D-30) + append Phase 5 block to scripts/check-artifacts.ts</name>
  <files>scripts/check-rls.ts, scripts/check-policy-id-brand.ts, scripts/check-error-discipline.ts, scripts/check-artifacts.ts</files>
  <read_first>
    - scripts/check-rls.ts (whole file — TENANT_TABLES at lines 35-47, TRUNCATE arrays at lines 91-105 + 188-191 per PATTERNS.md note)
    - scripts/check-policy-id-brand.ts (whole file — REPO_TARGETS at lines 52-61, ORCH_TARGETS at lines 70-81, OBJECT_FIELD_TARGETS at lines 89-96; final summary log at line 301 reads `expectedRepoSignatures + expectedOrchSignatures + expectedObjFieldSignatures`)
    - scripts/check-error-discipline.ts (whole file — scope comment lines 16-25; addSourceFilesAtPaths glob around lines 80-100)
    - scripts/check-artifacts.ts (find the Phase 4 block — search for `Phase 4 (AI Layer)` divider per PATTERNS.md hint around line 1500)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Error Classes D-30 + § R-6 D-29 (informs gap-4 brand extension)
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 2 (gap-2 RLS TENANT_TABLES extension) + § Pitfall 4 (gap-4 brand-target extension)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`scripts/check-rls.ts`" + § "`scripts/check-policy-id-brand.ts`" + § "`scripts/check-error-discipline.ts`" + § "`scripts/check-artifacts.ts`"
  </read_first>
  <action>
**Sub-task 2a: Extend `scripts/check-rls.ts` TENANT_TABLES + TRUNCATE arrays per RESEARCH gap-2.**

Edit 1 — TENANT_TABLES const (lines 35-47): append `'qa_citation_grants',` with inline comment `// Phase 5 D-29 — new tenant table for Q&A citation-referral grants per T-2(4c).`

Edit 2 — TRUNCATE arrays (lines 91-105 + lines 188-191 per RESEARCH note): append `'qa_citation_grants',` to BOTH arrays. Order: put it BEFORE `'organizations'` and `'clerk_events'` / `'stripe_events'` (child tables truncated before parents to avoid FK CASCADE confusion; but `ON DELETE CASCADE` from `0003_fk_hardening` handles either order — preserve the existing CHILD→PARENT order for readability).

Edit 3 — final summary log (line ~203): the existing `"OK — L-06: all ${TENANT_TABLES.length} tenant-scoped tables..."` line auto-updates because it reads `.length`; no code change.

DO NOT modify the cross-org positive-control logic. DO NOT change the SET LOCAL ROLE authenticated pattern. The for-loop over TENANT_TABLES at lines 164-180 auto-covers the new table.

**Sub-task 2b: Extend `scripts/check-policy-id-brand.ts` per RESEARCH gap-4.**

Edit 1 — `REPO_TARGETS` (lines 52-61): add entry `'lib/db/repositories/qa_citation_grants.ts': ['upsert', 'hasGrant']` — both methods take a PolicyId-typed policyId. Also extend the existing `'lib/db/repositories/policy_assignments.ts'` entry from `['listForPolicy']` to `['listForPolicy', 'create']` if the gate's REPO_TARGETS detection covers methods that don't have brand-typed first-param (it does — `create` takes an object input with policyId field which is brand-checked via OBJECT_FIELD_TARGETS; the REPO_TARGETS list is method-existence-check only).

Edit 2 — `ORCH_TARGETS` (lines 70-81): add entry `'lib/policies/acknowledgment.ts': ['recordAcknowledgment']` — the orchestrator's first arg is `ctx`, second is the branded `policyId: PolicyId` per ADR-028.

Edit 3 — `OBJECT_FIELD_TARGETS` (lines 89-96): append THREE new entries for object-literal inputs with brand-bearing `policyId` fields:
```typescript
{ file: 'lib/db/repositories/acknowledgments.ts', method: 'record', paramIndex: 1, field: 'policyId' },
{ file: 'lib/db/repositories/policy_assignments.ts', method: 'create', paramIndex: 1, field: 'policyId' },
{ file: 'lib/db/repositories/qa_citation_grants.ts', method: 'upsert', paramIndex: 1, field: 'policyId' },
```

Edit 4 — verify the summary log line at ~line 301 auto-computes from the extended dicts (`expectedRepoSignatures + expectedOrchSignatures + expectedObjFieldSignatures` — should auto-bump from current totals to reflect the new entries).

DO NOT remove or reorder existing entries. The gate's assertion count will rise from `X` to `X + N` for the Phase 5 additions; the gate's pass/fail logic auto-adjusts because it iterates the dicts.

**Sub-task 2c: Widen `scripts/check-error-discipline.ts` to scan `lib/policies/**` per D-30.**

Edit 1 — update the SCOPE comment around lines 16-25 to reflect the new coverage:
- Add bullet: `// - lib/policies/**  - Phase 5 D-30 — PolicyDomainError hierarchy mirrors ADR-026 BootstrapError shape; this gate enforces no built-in Error subclasses inside lib/policies/`

Edit 2 — find the `project.addSourceFilesAtPaths(...)` call (or equivalent glob list) around lines 80-100 — ADD `'lib/policies/**/*.ts'` to the glob list. Pattern source: how Phase 4 widened to add `'lib/stripe/**/*.ts'`.

Edit 3 — file exclusion list: ensure `lib/policies/errors.ts` is EXCLUDED from the scan (where the new class hierarchy lives — same exclusion logic as `lib/auth/errors.ts` being excluded today). The existing scan likely already excludes `*/errors.ts` files; verify or add explicitly.

Edit 4 — PRESERVE the existing `IllegalTransitionError` exception path — `lib/policies/state-machine.ts` already throws `IllegalTransitionError` (a typed error class per Phase 3 D-09); the widening does NOT break this (the gate only bans `Error`, `TypeError`, `RangeError`, etc. — not user-defined typed errors).

Run `tsx scripts/check-error-discipline.ts` after this edit — if it fails inside `lib/policies/**`, it means a file (e.g., `lib/policies/transitions.ts`) has a stray `throw new Error('...')` that needs migration to a typed-error class. Surface and address before completing this task.

**Sub-task 2d: Append Phase 5 block to `scripts/check-artifacts.ts`.**

Find the Phase 4 block (search for `// ─── Phase 4 (AI Layer)` divider per PATTERNS.md hint around line 1500). Add a new function `checkPhase5Artifacts(): Check[]` returning the list of assertions, and call it from the main `run()` function.

The new block asserts (`exists()` + content checks per existing Phase 4 pattern) each of:
- Files created by Plan 05-01: `drizzle/0010_phase5_uniques.sql`, `drizzle/0011_qa_citation_grants.sql`
- Files modified by Plan 05-01: `lib/db/schema.ts` contains `qaCitationGrants`, `acknowledgments_user_id_policy_id_policy_version_id_unique`, `policy_assignments_policy_id_assignee_type_assignee_id_unique`, `qa_citation_grants_org_user_policy_unique`
- File modified by Plan 05-01: `scripts/check-schema.ts` contains `'qa_citation_grants'` (TENANT_TABLES extension) + `(SELECT auth.jwt(` (RLS wrapped-form assertion)
- File created by Plan 05-02: `lib/policies/errors.ts` exports `PolicyDomainError`, `PolicyArchivedError`, `PolicyNotAssignedError`, `PolicyNotFoundError`
- Files modified by Plan 05-03: `lib/db/repositories/acknowledgments.ts` contains `.onConflictDoNothing()` (record body filled) AND does NOT contain `update:` or `delete:` exported methods; `lib/db/repositories/policy_assignments.ts` contains `.onConflictDoNothing()`; `lib/db/repositories/policies.ts` contains `listAssignedAndPublishedForUser`
- File created by Plan 05-03: `lib/db/repositories/qa_citation_grants.ts` exports `QaCitationGrants` with `listForUser`, `upsert`, `hasGrant`
- Files created by Plan 05-04: `lib/policies/acknowledgment.ts` exports `recordAcknowledgment`; `lib/ai/qa.ts` exports `askQuestion`
- File modified by Plan 05-04: `app/api/ai/qa/route.ts` contains `askQuestion(ctx` (delegation to extracted helper) AND is ≤ 50 lines
- Files created by Plan 05-05: `app/(employee)/layout.tsx`, `app/(employee)/my-policies/page.tsx` (replaces stub), `app/(employee)/my-policies/[id]/page.tsx`, `app/(employee)/my-policies/[id]/actions.ts`, `app/(employee)/my-policies/ask/page.tsx`, `app/(employee)/my-policies/ask/actions.ts`, `components/employee/AcknowledgeButton.tsx`, `components/employee/AskQuestionForm.tsx` — all exist
- Files modified by Plan 05-06: `app/(admin)/policies/[id]/actions.ts` contains `bulkAssignToDepartmentAction`; `app/(admin)/policies/[id]/page.tsx` contains `PolicyAssignmentsPanel`
- Files created by Plan 05-06: `components/admin/PolicyAssignmentsPanel.tsx` (+ optional `PolicyAssignmentsPanelForm.tsx`)
- File created by Plan 05-07: `components/policy/AckStatusBadge.tsx` exports `AckStatusBadge`
- Files created/modified by this plan (Plan 05-08): `scripts/check-acknowledgment-immutability.ts`, `tests/fixtures/ack-mutation-attempt.ts`, `scripts/check-rls.ts` contains `'qa_citation_grants'`, `scripts/check-policy-id-brand.ts` contains `qa_citation_grants.ts`
- Migration journal: `drizzle/meta/_journal.json` includes `"0010_phase5_uniques"` and `"0011_qa_citation_grants"`
- package.json script entries: `"check:acknowledgment-immutability"`, `"check:acknowledgment-immutability:self-test"` (Plan 05-09 will add `"check:employee-portal"`; Plan 05-10 will add `"verify:phase-5"` chain)

Use the same `assert(out, condition, message, ...)` shape as the Phase 4 block. Wire `checkPhase5Artifacts()` into the main `run()` function's check accumulator.

DO NOT remove any existing Phase 1-4 assertions. DO NOT modify the assertion helper.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && tsx --env-file=.env.local scripts/check-rls.ts && tsx scripts/check-policy-id-brand.ts && tsx scripts/check-error-discipline.ts && tsx scripts/check-artifacts.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `tsx --env-file=.env.local scripts/check-rls.ts` exits 0 (now tests 12 tenant tables including qa_citation_grants)
    - `tsx scripts/check-policy-id-brand.ts` exits 0 — the gate's expected-signature count auto-bumped from extended dicts; if Wave 2/3 plans correctly applied PolicyId brand, the gate passes
    - `tsx scripts/check-error-discipline.ts` exits 0 — gate now scans lib/policies/** and finds no banned built-in Error throws (lib/policies/state-machine.ts uses IllegalTransitionError class, lib/policies/transitions.ts uses... need to verify — surface any violation found)
    - `tsx scripts/check-artifacts.ts` exits 0 — Phase 5 block passes (all expected files exist + contain expected substrings)
    - `grep -c "'qa_citation_grants'" scripts/check-rls.ts` returns at least 2 (TENANT_TABLES + at least one TRUNCATE array)
    - `grep -c "qa_citation_grants.ts" scripts/check-policy-id-brand.ts` returns at least 1 (REPO_TARGETS extension)
    - `grep -c "'lib/policies/acknowledgment.ts'" scripts/check-policy-id-brand.ts` returns at least 1 (ORCH_TARGETS extension)
    - `grep -c "lib/policies" scripts/check-error-discipline.ts` returns at least 1 (scope widened)
    - `grep -c "Phase 5" scripts/check-artifacts.ts` returns at least 1 (block divider added)
    - `pnpm verify:phase-4` still exits 0 (no regression to phase-4 chain — the extended gates run cleanly with the existing assertions plus the new ones for Phase 5)
  </acceptance_criteria>
  <done>
    Four CI-gate files extended; all gates pass cleanly against shipped Phase 5 code; Phase 4 chain still green.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ts-morph AST → CI gate verdict | The gate's symbol-resolution logic crosses source-AST → exit-code; correctness is the whole point of D-18 |
| Negative-control fixture → production gate | tests/fixtures/** MUST be excluded from the default-mode glob OR the gate fires on its own fixture (D-19 + D-20 explicit) |
| Wave 0 vs Wave 4 invariant | The append-only invariant is locked at 3 layers; this plan ships the runtime layer (CI); the type-system layer (tests/types.ts D-07) was locked in Phase 2 and verified preserved in Plan 05-03 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-08-01 | Tampering | Future refactor adds `.update(acknowledgments)` from a previously-untouched file in lib/** | mitigate | D-18 ts-morph gate scans ALL lib/**/*.ts (excluding fixtures); detects on next CI run. Phase 2 check-db-imports.ts catches stray schema imports; D-18 catches writes inside allowed files. Defense-in-depth. |
| T-05-08-02 | Tampering | Aliased imports (`import { acknowledgments as ack }`) bypassing string-grep | mitigate | ts-morph symbol resolution via getDeclarations() handles aliased imports — the gate detects via SYMBOL, not local-name string. Acceptance criterion test scenario covers this. |
| T-05-08-03 | Repudiation | Gate is vacuous (always exits 0 because detection logic is broken) | mitigate | D-20 negative-control fixture + --self-test mode prove non-vacuous: a known-bad file MUST trigger detection. Acceptance criterion `tsx scripts/check-acknowledgment-immutability.ts --self-test` exits 0 only if 1+ violation found. |
| T-05-08-04 | Information Disclosure | gate's stderr output leaks repository internal file paths | accept | The gate's purpose is to surface violations with file:line for ops triage; file paths are not secrets. CI logs are operator-only. |
| T-05-08-05 | Tampering | qa_citation_grants RLS untested because TENANT_TABLES not extended | mitigate | RESEARCH gap-2 — Sub-task 2a extends `scripts/check-rls.ts:35-47` TENANT_TABLES with `'qa_citation_grants'`. Without this, the new table's RLS goes untested at CI time. Acceptance criterion grep verifies. |
| T-05-08-06 | Information Disclosure | Phase 5 brand-bearing surfaces missing brand → policyId mistype reaches DB | mitigate | RESEARCH gap-4 — Sub-task 2b extends REPO_TARGETS + ORCH_TARGETS + OBJECT_FIELD_TARGETS for all Phase 5 surfaces with brand-bearing policyId params. Gate fails at CI if any signature drops the brand. Postgres 22P02 FK + RLS would catch at runtime regardless, but compile-time + CI-time defense is preferred. |
| T-05-08-07 | Tampering | New typed-error class in lib/policies/errors.ts violates the discipline (e.g., extends Error directly without PolicyDomainError base) | mitigate | check-error-discipline widening per D-30; if a file in lib/policies/** throws raw `new Error(...)` (instead of typed-class subclass), the gate fails at CI. Plan 05-02 satisfies pre-emptively. |
| T-05-08-SC | Tampering | npm installs | accept | No new packages — ts-morph already installed Phase 2 D-08. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `tsx scripts/check-acknowledgment-immutability.ts` exits 0
- `tsx scripts/check-acknowledgment-immutability.ts --self-test` exits 0
- `tsx --env-file=.env.local scripts/check-rls.ts` exits 0 (12 tenant tables)
- `tsx scripts/check-policy-id-brand.ts` exits 0 (extended dicts pass)
- `tsx scripts/check-error-discipline.ts` exits 0 (widened scope passes)
- `tsx scripts/check-artifacts.ts` exits 0 (Phase 5 block passes)
- `pnpm verify:phase-4` still exits 0 (no regression — the extended check-artifacts, check-rls, check-policy-id-brand, check-error-discipline are all part of the verify:phase-3 → verify:phase-4 chain, so this regression check exercises them)
</verification>

<success_criteria>
- D-18 ts-morph gate exists with both default + --self-test modes; both green
- D-20 negative-control fixture exists and triggers --self-test mode (proves non-vacuous)
- RESEARCH gap-2 closed (check-rls.ts TENANT_TABLES extended)
- RESEARCH gap-4 closed (check-policy-id-brand.ts brand dicts extended)
- D-30 enforcement widened (check-error-discipline.ts scans lib/policies/**)
- Phase 5 file inventory asserted (check-artifacts.ts block added)
- 2 new package.json script entries (3rd entry — check:employee-portal — added by Plan 05-09)
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-08-SUMMARY.md` when done — document the file deltas, confirm both modes of check-acknowledgment-immutability green (Drizzle-API + raw-SQL detection paths both exercised per EAPI advisor H-1), list any unexpected lib/policies/** violations that surfaced + how addressed, and note check:employee-portal + verify:phase-5 entries remain pending for Plans 05-09 / 05-10.
</output>

<deferred>
## Deferred — ASK-FIRST candidates (post-execute follow-up)

**EAPI advisor H-1 follow-up: defense-in-depth REVOKE migration.** Phase 2 `drizzle/0001_rls_policies.sql:69` GRANTs `UPDATE, DELETE` on `acknowledgments` to the `authenticated` role. Plan 05-08's ts-morph gate is the SOLE runtime-side defense against raw SQL bypass; a determined attacker with code-write access to `lib/**/*.ts` could in principle craft a non-`sql\`...\`` execute path that evades the regex (e.g., string concatenation into `db.execute("UPDATE acknowledgments ...")`). The cleanest defense-in-depth is a new migration `drizzle/0012_acknowledgments_revoke_mutation.sql`:

```sql
-- Plan 05-08 follow-up — EAPI advisor H-1 defense-in-depth (ASK-FIRST per CLAUDE.md).
-- Phase 2 0001_rls_policies.sql:69 granted SELECT, INSERT, UPDATE, DELETE on acknowledgments.
-- ADR-018 append-only invariant means UPDATE + DELETE should never fire from application code.
-- Revoke at DB layer so even a raw `db.execute("UPDATE acknowledgments...")` bypass would 42501.
REVOKE UPDATE, DELETE ON "acknowledgments" FROM authenticated;
-- service_role (BYPASSRLS) retains UPDATE+DELETE for migration/backfill operations.
```

Rationale to ASK FIRST before applying:
1. **Destructive** in the CLAUDE.md sense — removes capabilities from existing role; requires operator approval per "Destructive migrations (DROP COLUMN, DROP TABLE, NOT NULL on existing column): ASK FIRST." block. REVOKE matches the spirit (removes capability) even if not the literal pattern.
2. **Operator-impact** — admin restore workflows (Phase 7+ tenant lifecycle) MAY need UPDATE/DELETE in narrow cases (e.g., GDPR right-to-erasure). Confirm with operator before locking.
3. **Pre-paying-customer status** — same basis as 0010/0011 ASK-FIRST approvals; safer to apply now than after first customer.

If approved, this migration ships as 0012 in Phase 5.5 polish PR or absorbed into Phase 7 (notifications) where tenant-lifecycle code paths land. Until then, the ts-morph gate (default mode + --self-test mode) is the operative defense.
</deferred>
