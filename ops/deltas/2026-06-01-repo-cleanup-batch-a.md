# Repo Cleanup Batch A

Date: 2026-06-01
Branch: `chore/repo-cleanup-origin-main`
GSD stage: execute

## GSD Command Handling

- `gsd-tools --help` and `gsd-sdk --help` both exposed the installed `gsd-sdk` command surface: `run`, `auto`, `init`, and `query`.
- `gsd-sdk query --help` did not reveal a repo-specific scoped execute handler, and no `QUERY-HANDLERS.md` file was present in the repo.
- Fallback used: direct Codex execution of the validated cleanup prompt against live repo state, with the required git preflight, startup read, reference search, patch, verification, narrow staging, and commit. No GSD command output was fabricated.

## Summary

Applied the first smallest reversible origin-main cleanup patch:

- Stopped tracking generated scanner outputs:
  - `audit-report/audit-report.md`
  - `audit-report/audit-report.sarif`
- Kept the historical hand-written audit tracked:
  - `audit-report/PHASE-2-API-AUDIT.md`
- Added precise `.gitignore` entries for only the generated scanner outputs.
- Fixed the stale `scripts/check-rls.ts` live-script comment that still said the negative RLS loop checked 10 tenant-scoped tables; the live list contains 12.

## Investigation

- `git ls-files audit-report` confirmed all three audit-report files were tracked before cleanup.
- Reference search found generated-output mentions only in the generated report itself and in the preserved `PHASE-2-API-AUDIT.md` "Files Generated" table.
- No current live planning, operating, runtime, or consultant document requires the generated scanner outputs as live evidence.
- `.audit/` was read as local audit evidence and left untouched.

## Consultant Keep-Current

- `.planning/consultant/working_context.md`: reviewed, no-change.
- `.planning/consultant/system_map.md`: reviewed, no-change.
- `.planning/consultant/feature_inventory.md`: reviewed, no-change.
- `.planning/consultant/risk_register.md`: reviewed, no-change.
- `.planning/consultant/backlog.md`: reviewed, no-change.

No consultant-file update was needed because this batch removes stale generated outputs and fixes a script comment only; it does not change product behavior, architecture, phase state, risk posture, feature scope, or roadmap sequencing.

## Boundaries

- Product runtime behavior changed: no.
- Application code changed: no behavior change; comment only.
- Packages or lockfile changed: no.
- Schema, migrations, or Drizzle metadata changed: no.
- Secrets, env files, `.vercel/`, `.mcp.json`, operator/tool folders changed: no.
- `.audit/` changed: no.
- Phase 7 planning or code started: no.

## Verification

Completed before commit:

- PASS - `git diff --check`
- PASS - `pnpm tsc --noEmit`
- PASS - `pnpm check:rls`
  - Result: `OK - L-06: all 12 tenant-scoped tables RLS-isolated; positive control passed.`
  - Note: normal Postgres `TRUNCATE ... CASCADE` NOTICE output was emitted by the existing RLS script.
- PASS - `pnpm check:artifacts`
  - Result: `520/520 artifact assertions passed.`
- PASS - `git check-ignore audit-report/audit-report.md audit-report/audit-report.sarif`
  - Result: both generated scanner outputs are ignored by the new precise `.gitignore` entries.
- PASS - `git status --short --branch`
  - Result before staging: only the intended cleanup files plus the protected untracked `.audit/` path were present.
- PASS - `git ls-files audit-report/PHASE-2-API-AUDIT.md`
  - Result: `audit-report/PHASE-2-API-AUDIT.md` remains tracked.
- PASS - `git diff --name-status`
  - Result before staging: intended unstaged edits only (`.gitignore`, `scripts/check-rls.ts`); staged generated-output removals were checked separately with `git diff --cached --name-status`.
