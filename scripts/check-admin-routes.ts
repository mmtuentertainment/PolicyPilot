/**
 * scripts/check-admin-routes.ts — Phase 3 verify gate.
 *
 * Closes CR-02 regression: ensures middleware's ADMIN_URL_PATTERNS array
 * stays in lockstep with the app/(admin)/ directory on disk.
 *
 * Also asserts every server action under app/(admin)/ wraps its DB work
 * in withOrgScope( ... ) — catches the "forgot the scope" foot-gun before
 * it ships to production.
 *
 * Scaffold mode: while Phase 3 plans 03-02..03-11 are in flight, the
 * middleware.ts still uses the Phase 1+2 `createRouteMatcher(["/(admin)/(.*)"])`
 * regex. When the script detects that shape, it exits 0 with a "scaffold"
 * log line so plan 03-01 can land before plan 03-02 swaps the matcher.
 *
 * Enforcement mode (Plan 03-02+): middleware.ts exports
 * `const ADMIN_URL_PATTERNS: RegExp[] = [...]`. Script parses the array
 * via ts-morph, walks app/(admin)/**\/page.tsx, converts to URLs (strip
 * `(admin)` route-group segments), asserts every URL matches ≥1 pattern
 * AND every pattern matches ≥1 URL. Then walks app/(admin)/**\/actions.ts
 * (if any exist) and asserts each contains the literal `withOrgScope(`.
 */
import { Project, SyntaxKind } from 'ts-morph';
import { resolve as resolvePath, relative as relPath } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';

async function main(): Promise<void> {
  const project = new Project({
    tsConfigFilePath: resolvePath(process.cwd(), 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(['middleware.ts', 'app/**/*.{ts,tsx}']);

  const mw = project.getSourceFile('middleware.ts');
  if (!mw) {
    console.error('check-admin-routes: middleware.ts not found');
    process.exit(1);
  }
  const mwText = mw.getFullText();

  // Scaffold-mode detection: Plan 02-05 matcher still in place.
  if (mwText.includes('"/(admin)/(.*)"') || mwText.includes("'/(admin)/(.*)'")) {
    console.log(
      'check-admin-routes: scaffold mode (CR-02 matcher not yet rewritten; pass-through). Plan 03-02 will flip this into enforcement.',
    );
    process.exit(0);
  }

  // Enforcement mode (Plan 03-02+): middleware exports ADMIN_URL_PATTERNS.
  //
  // Phase-aware downgrade (Plan 03-02 Task 2 implementation note):
  // When app/(admin)/ has zero page.tsx files on disk (Plans 03-02..03-10
  // are mid-flight; only Plan 03-11 ships admin pages), every pattern is
  // "dead" by definition. Downgrade the dead-pattern check to a WARN in
  // that case; only enforce the "URL has no pattern" direction. Once Plan
  // 03-11 lands page.tsx files, both directions enforce.
  const patternsDecl = mw.getVariableDeclaration('ADMIN_URL_PATTERNS');
  if (!patternsDecl) {
    console.error('check-admin-routes: ADMIN_URL_PATTERNS const not found in middleware.ts');
    process.exit(1);
  }
  const arrInit = patternsDecl.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);
  if (!arrInit) {
    console.error('check-admin-routes: ADMIN_URL_PATTERNS is not an array literal');
    process.exit(1);
  }
  const patternSources = arrInit.getElements().map((el) => el.getText());
  const patterns: RegExp[] = patternSources.map((src) => {
    // src looks like /^\/dashboard(\/|$)/  — eval via RegExp constructor on the inner body
    const m = src.match(/^\/(.*)\/([gimsuy]*)$/);
    if (!m || typeof m[1] !== 'string') {
      throw new Error(`Cannot parse regex literal in ADMIN_URL_PATTERNS: ${src}`);
    }
    return new RegExp(m[1], m[2] ?? '');
  });

  // Walk app/(admin)/**/page.tsx → URLs
  const adminRoot = resolvePath(process.cwd(), 'app/(admin)');
  const urls: string[] = [];
  if (existsSync(adminRoot)) {
    const walk = (dir: string, urlPath: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = resolvePath(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          // strip route-group segments like (admin), (foo)
          const next = /^\(.*\)$/.test(entry) ? urlPath : `${urlPath}/${entry}`;
          walk(full, next);
        } else if (entry === 'page.tsx' || entry === 'page.ts') {
          urls.push(urlPath || '/');
        }
      }
    };
    walk(adminRoot, '');
  }

  const violations: string[] = [];
  // Every URL must match ≥1 pattern.
  for (const url of urls) {
    if (!patterns.some((p) => p.test(url))) {
      violations.push(`URL ${url} (page.tsx on disk) matches NO ADMIN_URL_PATTERNS entry`);
    }
  }
  // Every pattern must match ≥1 URL.
  // Phase-aware downgrade: when app/(admin)/ contains zero page.tsx files
  // (Plan 03-02 through 03-10 inclusive — admin pages don't land until
  // Plan 03-11), the dead-pattern check would fire on EVERY pattern by
  // definition. Demote to WARN until pages exist; only enforce the
  // "URL has no pattern" direction in the meantime.
  const adminPagesExist = urls.length > 0;
  for (let i = 0; i < patterns.length; i++) {
    const pat = patterns[i];
    const src = patternSources[i];
    if (!pat || !src) continue;
    if (!urls.some((u) => pat.test(u))) {
      const msg = `ADMIN_URL_PATTERNS[${i}] = ${src} matches NO URL on disk (dead pattern — CR-02 regression)`;
      if (adminPagesExist) {
        violations.push(msg);
      } else {
        console.warn(`check-admin-routes: WARN — ${msg} (downgraded — no admin pages on disk yet; Plan 03-11 enables enforcement)`);
      }
    }
  }

  // Actions.ts withOrgScope grep — every Server Action under app/(admin)/
  // must wrap its DB work in withOrgScope( ... ).
  project.getSourceFiles('app/(admin)/**/actions.ts').forEach((sf) => {
    const txt = sf.getFullText();
    if (!txt.includes('withOrgScope(')) {
      violations.push(
        `${relPath(process.cwd(), sf.getFilePath())} — Server Action does not call withOrgScope()`,
      );
    }
  });

  if (violations.length > 0) {
    console.error('check-admin-routes: violations:');
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `check-admin-routes: OK — ${urls.length} admin URL(s), ${patterns.length} pattern(s), 0 violations.`,
  );
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
