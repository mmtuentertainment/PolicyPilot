// scripts/check-ai-prompts.ts — Phase 4 D-26 ts-morph gate.
//
// Asserts each of the 4 prompt constants in lib/ai/prompts.ts contains a hardcoded
// 40-char (approx) anchor substring that ALSO appears verbatim in reference/PROMPTS.md.
//
// Rationale: lib/ai/prompts.ts is the runtime source of truth; reference/PROMPTS.md is the
// contract source of truth. Any drift between them (or any refactor that changes prompt
// wording in one place without the other) breaks this gate. The hardcoded anchor strategy
// (rather than regex-extracting from PROMPTS.md) ensures a conscious "update both anchors"
// step on any future prompt revision — surfacing the change to reviewers.
//
// Mirrors scripts/check-policy-id-brand.ts pattern (Phase 3 ADR-028 gate).
//
// WARNING-3 — typed-initializer access:
//   Each prompt constant MUST be a simple string literal — either a plain quoted string
//   ('single' / "double") or an untagged backtick template (`...` with no ${interpolation}).
//   The gate uses `getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral)` and
//   `getInitializerIfKind(SyntaxKind.StringLiteral)` to access the literal value WITHOUT
//   manual quote stripping. Other initializer shapes (string concatenation,
//   tagged templates, conditional expressions, function calls) throw a structured error
//   that names the offending constant and explains why the gate cannot anchor against it.
//
//   This closes a silent-fail trap in the prior quote-strip-regex approach (a regex
//   stripping the leading and trailing string delimiters off raw initializer text):
//   if a future refactor switched a prompt to string-concatenation form, the regex
//   would strip ONE delimiter and the resulting string would either accidentally
//   pass the 40-char anchor (false positive) or fail in a confusing way (false
//   negative). The typed-initializer access surfaces the refactor explicitly.
import { Project, SyntaxKind } from 'ts-morph';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Hardcoded ~40-char verbatim substrings — one per prompt constant.
 * Each MUST appear inside (a) the lib/ai/prompts.ts string-literal value AND
 * (b) the reference/PROMPTS.md file body.
 *
 * Substrings chosen for stability — pick text unlikely to be reworded:
 *   - DRAFT: domain-anchored "professional HR and compliance writer"
 *   - SUMMARY: action-anchored "Summarize the following company policy"
 *   - QA: behavior-locked "may ONLY use the policy documents provided" (per D-31)
 *   - CONSISTENCY: deliverable-anchored "contradictions and inconsistencies"
 *
 * If PROMPTS.md is amended to delete one of these phrases, the gate breaks intentionally —
 * forcing the operator to update both PROMPTS.md AND the anchor literal here together.
 */
const PROMPT_ANCHORS: Record<string, string> = {
  DRAFT_SYSTEM_PROMPT: 'You are a professional HR and compliance writer',
  SUMMARY_SYSTEM_PROMPT: 'Summarize the following company policy',
  QA_SYSTEM_PROMPT_TEMPLATE: 'may ONLY use the policy documents provided',
  CONSISTENCY_SYSTEM_PROMPT: 'contradictions and inconsistencies',
};

const errors: string[] = [];

function fail(msg: string): void {
  errors.push(msg);
}

/**
 * WARNING-3 — typed-initializer access. Returns the literal text for a prompt constant
 * whose initializer is a plain string literal or an untagged template. Throws a structured
 * Error for any other initializer shape (concatenation, tagged template, function call, etc.)
 * so a future refactor surfaces loudly instead of silently mis-anchoring.
 */
function loadPromptsModule(): Map<string, string> {
  const project = new Project({
    tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFileAtPath(resolve(process.cwd(), 'lib/ai/prompts.ts'));
  const source = project.getSourceFileOrThrow('lib/ai/prompts.ts');

  const found = new Map<string, string>();
  for (const decl of source.getVariableDeclarations()) {
    const name = decl.getName();
    if (!(name in PROMPT_ANCHORS)) continue;

    const initializer = decl.getInitializer();
    if (!initializer) {
      throw new Error(`Prompt constant ${name} has no initializer in lib/ai/prompts.ts`);
    }

    // WARNING-3: typed access via getInitializerIfKind (NO regex quote-strip).
    // SyntaxKind.NoSubstitutionTemplateLiteral covers `untagged-backtick-template` (no ${interp}).
    // SyntaxKind.StringLiteral covers 'single' and "double" quoted strings.
    const literalText =
      decl.getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral)?.getLiteralText() ??
      decl.getInitializerIfKind(SyntaxKind.StringLiteral)?.getLiteralText();

    if (literalText === undefined) {
      throw new Error(
        `Prompt constant ${name} must be a simple string literal (single-quoted, double-quoted, ` +
          `or untagged backtick-template). Got kind=${initializer.getKindName()}. ` +
          `String concatenation (e.g., 'foo' + 'bar') and tagged templates (e.g., sql\`...\`) are ` +
          `not supported by the verbatim-anchor gate — they prevent reliable static extraction ` +
          `of the prompt body. Inline the full prompt as a single literal and re-run check:ai-prompts.`,
      );
    }

    found.set(name, literalText);
  }
  return found;
}

function loadPromptsMd(): string {
  return readFileSync(resolve(process.cwd(), 'reference/PROMPTS.md'), 'utf8');
}

function main(): void {
  let constants: Map<string, string>;
  try {
    constants = loadPromptsModule();
  } catch (err) {
    console.error('[check-ai-prompts] FAIL — loader threw');
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const promptsMd = loadPromptsMd();

  for (const [name, anchor] of Object.entries(PROMPT_ANCHORS)) {
    const literalValue = constants.get(name);
    if (!literalValue) {
      fail(`prompt constant ${name} not exported from lib/ai/prompts.ts`);
      continue;
    }

    if (!literalValue.includes(anchor)) {
      fail(`anchor missing in lib/ai/prompts.ts ${name}: ${JSON.stringify(anchor.slice(0, 80))}`);
    }

    if (!promptsMd.includes(anchor)) {
      fail(`anchor missing in reference/PROMPTS.md for ${name}: ${JSON.stringify(anchor.slice(0, 80))}`);
    }
  }

  if (errors.length > 0) {
    console.error('[check-ai-prompts] FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('[check-ai-prompts] OK — 4 anchors verified in both lib/ai/prompts.ts and reference/PROMPTS.md');
}

main();
