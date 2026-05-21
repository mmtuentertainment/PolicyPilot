// scripts/check-policy-id-brand.ts — ADR-028 verify gate.
//
// Fails CI if any of the methods/functions listed below stops declaring its
// `policyId` parameter as the branded `PolicyId` type (from
// `@/lib/policies/types`). TypeScript's compiler already rejects callers
// that pass `string` where `PolicyId` is expected — the brand does the
// work. This gate's value is signature-drift prevention: a future refactor
// that "simplifies" `findById(scope: OrgScope, id: PolicyId)` back to
// `findById(scope: OrgScope, id: string)` would COMPILE (because callers
// would then receive `string`, which is broader than `PolicyId`) but
// silently erase the brand. This gate catches that at CI before the brand
// erodes.
//
// SCOPE: hardcoded file + method list matches ADR-028 § Decision (1) +
// § Carry-forward. If future repository files (e.g. when Phase 5's
// `Acknowledgments.findByPolicyId` lands) add policyId parameters, the
// gate's REPO_TARGETS / ORCH_TARGETS arrays must be extended in the same
// PR — failure to extend leaves a silent gap. Matches the
// `check-error-discipline.ts` hardcoded-scope discipline pattern.
//
// ENFORCEMENT MECHANISM: parses the syntax-level type annotation
// (`getTypeNode()?.getText()`) rather than the resolved type. Reasons:
//   - Resolved type may expand `PolicyId` into `string & ZodBranded<...>`
//     depending on TS display options — brittle to compiler version.
//   - Syntax-level "the user wrote `: PolicyId`" check is robust + matches
//     the spirit of the gate (the brand is a developer-facing contract;
//     erasing it requires changing the source text).
//
// LIMITS (documented, not silent gaps):
//   - Aliased imports: `import type { PolicyId as PolId } ...` would defeat
//     the substring check. We tolerate this because (a) it's contrived,
//     (b) the alias would still preserve type-safety, (c) catching it
//     would require resolving symbol references which is out-of-scope.
//   - Inline-defined alias: `type LocalPolicyId = PolicyId; method(id:
//     LocalPolicyId, ...)` — same tolerance, same reasoning.
//   - Constructor / class method shapes: this script handles object-
//     literal repositories (`export const Policies = { findById: (...) =>
//     ... }`) and top-level function declarations. Class methods are not
//     used in the current repository surface — would need extension.
//
// Wired into `pnpm verify:phase-3` via the package.json script
// `check:policy-id-brand` (also runnable standalone).
import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

/**
 * Per-file repository method targets. Each method's parameter named `id` OR
 * `policyId` (repositories use `id` for the primary key param; orchestrators
 * use `policyId`) MUST have its type annotation include the substring
 * `PolicyId`. Failure to match is a hard CI fail.
 */
const REPO_TARGETS: Record<string, string[]> = {
  'lib/db/repositories/policies.ts': ['findById', 'updateDraft', 'incrementVersion'],
  'lib/db/repositories/policy_versions.ts': ['listForPolicy', 'findByVersionNumber'],
  'lib/db/repositories/policy_assignments.ts': ['listForPolicy'],
  'lib/db/repositories/workflow_stages.ts': ['recordSubmission', 'listForPolicy'],
};

/**
 * Top-level orchestrator functions in `lib/policies/transitions.ts`. Each
 * function's FIRST parameter (named `policyId`) must have its type
 * annotation include `PolicyId`. The helper `loadAndAssertTransition` uses
 * `policyId` as its SECOND parameter (after `s: OrgScope`) — the check
 * scans all params named `policyId`, not by position.
 */
const ORCH_TARGETS: Record<string, string[]> = {
  'lib/policies/transitions.ts': [
    'submitForReview',
    'approve',
    'reject',
    'publish',
    'archive',
    'restore',
    'editPublished',
    'loadAndAssertTransition',
  ],
};

/**
 * PolicyVersions.create takes an object-literal parameter; the
 * `policyId` field inside that object must be branded. Handled
 * separately from the simple `id` / `policyId` param scan because the
 * type lives inside a TypeLiteral.
 */
const OBJECT_FIELD_TARGETS = [
  {
    file: 'lib/db/repositories/policy_versions.ts',
    method: 'create',
    paramIndex: 1, // second param (after `s: OrgScope`)
    field: 'policyId',
  },
];

type Failure = { kind: 'repo' | 'orch' | 'objField'; file: string; method: string; detail: string };

function checkObjectLiteralRepo(
  project: Project,
  filePath: string,
  methods: string[],
): Failure[] {
  const failures: Failure[] = [];
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    failures.push({ kind: 'repo', file: filePath, method: '<file>', detail: 'source file not found' });
    return failures;
  }
  // Repositories follow the pattern: `export const <Name> = { method: (...) => ... }`.
  // Walk all variable declarations; for each, find the object literal init;
  // for each, check the targeted methods.
  //
  // CR PR #13 closure: track per-method presence across the file. Without
  // this, a method that's been RENAMED or REMOVED entirely never matches
  // `obj.getProperty(methodName)` and the loop silently skips it — the gate
  // reports success even though the signature it's supposed to pin no
  // longer exists. Initialize all-false, set true on first match, push a
  // 'method not found' failure after the walk for any still-false entry.
  const found: Record<string, boolean> = {};
  for (const methodName of methods) {
    found[methodName] = false;
  }
  const varDecls = sourceFile.getVariableDeclarations();
  for (const decl of varDecls) {
    const init = decl.getInitializer();
    if (!init) continue;
    const obj = init.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!obj) continue;
    for (const methodName of methods) {
      const prop = obj.getProperty(methodName);
      if (!prop) continue; // method belongs to a different object in the file; skip
      found[methodName] = true;
      const propAssignment = prop.asKind(SyntaxKind.PropertyAssignment);
      if (!propAssignment) {
        failures.push({ kind: 'repo', file: filePath, method: methodName, detail: 'not a property assignment' });
        continue;
      }
      const arrow = propAssignment.getInitializer()?.asKind(SyntaxKind.ArrowFunction);
      if (!arrow) {
        failures.push({ kind: 'repo', file: filePath, method: methodName, detail: 'value is not an arrow function' });
        continue;
      }
      const params = arrow.getParameters();
      // Find param named 'id' OR 'policyId' (repositories use 'id' for the
      // primary-key param to match Drizzle column ergonomics).
      const policyParam = params.find((p) => ['id', 'policyId'].includes(p.getName()));
      if (!policyParam) {
        failures.push({ kind: 'repo', file: filePath, method: methodName, detail: 'no parameter named "id" or "policyId" found' });
        continue;
      }
      const typeText = policyParam.getTypeNode()?.getText() ?? '';
      if (!typeText.includes('PolicyId')) {
        failures.push({
          kind: 'repo',
          file: filePath,
          method: methodName,
          detail: `parameter "${policyParam.getName()}" type is "${typeText || '<no annotation>'}" — expected to include "PolicyId"`,
        });
      }
    }
  }
  // Post-walk: any method whose `found` flag stayed false was renamed,
  // removed, or moved out of the expected object-literal pattern. Fail
  // hard rather than silently pass.
  for (const methodName of methods) {
    if (!found[methodName]) {
      failures.push({
        kind: 'repo',
        file: filePath,
        method: methodName,
        detail: 'method not found — renamed, removed, or moved out of an exported object literal',
      });
    }
  }
  return failures;
}

function checkOrchestratorFunctions(
  project: Project,
  filePath: string,
  fnNames: string[],
): Failure[] {
  const failures: Failure[] = [];
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    failures.push({ kind: 'orch', file: filePath, method: '<file>', detail: 'source file not found' });
    return failures;
  }
  const fns = sourceFile.getFunctions();
  for (const fnName of fnNames) {
    const fn = fns.find((f) => f.getName() === fnName);
    if (!fn) {
      failures.push({ kind: 'orch', file: filePath, method: fnName, detail: 'function declaration not found' });
      continue;
    }
    const params = fn.getParameters();
    const policyParam = params.find((p) => p.getName() === 'policyId');
    if (!policyParam) {
      failures.push({ kind: 'orch', file: filePath, method: fnName, detail: 'no parameter named "policyId" found' });
      continue;
    }
    const typeText = policyParam.getTypeNode()?.getText() ?? '';
    if (!typeText.includes('PolicyId')) {
      failures.push({
        kind: 'orch',
        file: filePath,
        method: fnName,
        detail: `parameter "policyId" type is "${typeText || '<no annotation>'}" — expected to include "PolicyId"`,
      });
    }
  }
  return failures;
}

function checkObjectFieldTargets(project: Project): Failure[] {
  const failures: Failure[] = [];
  for (const target of OBJECT_FIELD_TARGETS) {
    const sourceFile = project.getSourceFile(target.file);
    if (!sourceFile) {
      failures.push({ kind: 'objField', file: target.file, method: target.method, detail: 'source file not found' });
      continue;
    }
    const varDecls = sourceFile.getVariableDeclarations();
    let found = false;
    for (const decl of varDecls) {
      const init = decl.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
      if (!init) continue;
      const prop = init.getProperty(target.method)?.asKind(SyntaxKind.PropertyAssignment);
      if (!prop) continue;
      const arrow = prop.getInitializer()?.asKind(SyntaxKind.ArrowFunction);
      if (!arrow) continue;
      const params = arrow.getParameters();
      const inputParam = params[target.paramIndex];
      if (!inputParam) {
        failures.push({ kind: 'objField', file: target.file, method: target.method, detail: `parameter index ${target.paramIndex} not found` });
        found = true;
        continue;
      }
      const typeNode = inputParam.getTypeNode();
      const typeLiteral = typeNode?.asKind(SyntaxKind.TypeLiteral);
      if (!typeLiteral) {
        failures.push({
          kind: 'objField',
          file: target.file,
          method: target.method,
          detail: `parameter index ${target.paramIndex} is not a TypeLiteral (got "${typeNode?.getText() ?? '<none>'}")`,
        });
        found = true;
        continue;
      }
      const field = typeLiteral.getProperty(target.field);
      if (!field) {
        failures.push({ kind: 'objField', file: target.file, method: target.method, detail: `field "${target.field}" not found in type literal` });
        found = true;
        continue;
      }
      const fieldTypeText = field.asKind(SyntaxKind.PropertySignature)?.getTypeNode()?.getText() ?? '';
      if (!fieldTypeText.includes('PolicyId')) {
        failures.push({
          kind: 'objField',
          file: target.file,
          method: target.method,
          detail: `field "${target.field}" type is "${fieldTypeText || '<no annotation>'}" — expected to include "PolicyId"`,
        });
      }
      found = true;
    }
    if (!found) {
      failures.push({ kind: 'objField', file: target.file, method: target.method, detail: 'method declaration not found in any exported object' });
    }
  }
  return failures;
}

function main(): void {
  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  const targetFiles = [
    ...Object.keys(REPO_TARGETS),
    ...Object.keys(ORCH_TARGETS),
  ];
  // De-dupe; addSourceFileAtPath throws on already-added files in older
  // ts-morph versions but addSourceFilesAtPaths is idempotent.
  project.addSourceFilesAtPaths(targetFiles);

  const allFailures: Failure[] = [];
  for (const [filePath, methods] of Object.entries(REPO_TARGETS)) {
    allFailures.push(...checkObjectLiteralRepo(project, filePath, methods));
  }
  for (const [filePath, fnNames] of Object.entries(ORCH_TARGETS)) {
    allFailures.push(...checkOrchestratorFunctions(project, filePath, fnNames));
  }
  allFailures.push(...checkObjectFieldTargets(project));

  // Positive-control: count how many signatures we successfully verified.
  const expectedRepoSignatures = Object.values(REPO_TARGETS).reduce((sum, methods) => sum + methods.length, 0);
  const expectedOrchSignatures = Object.values(ORCH_TARGETS).reduce((sum, fns) => sum + fns.length, 0);
  const expectedObjFieldSignatures = OBJECT_FIELD_TARGETS.length;
  const totalExpected = expectedRepoSignatures + expectedOrchSignatures + expectedObjFieldSignatures;
  const passedCount = totalExpected - allFailures.length;

  if (allFailures.length === 0) {
    console.log(
      `OK — check:policy-id-brand: ${passedCount}/${totalExpected} signatures verified ` +
        `(${expectedRepoSignatures} repo + ${expectedOrchSignatures} orchestrator + ${expectedObjFieldSignatures} object-field) — ADR-028 brand contract intact.`,
    );
    process.exit(0);
  }

  console.error(`FAIL — check:policy-id-brand: ${allFailures.length} signature(s) failed brand check:`);
  for (const f of allFailures) {
    console.error(`  [${f.kind}] ${f.file}::${f.method} — ${f.detail}`);
  }
  console.error(`\n${passedCount}/${totalExpected} signatures passed; ${allFailures.length} failed.`);
  console.error(`See ADR-028 (.planning/intel/decisions.md) for the brand contract.`);
  process.exit(1);
}

main();
