# Database Migration Discipline (reference)

> Moved out of `CLAUDE.md` 2026-06-14 (context-diet) for token hygiene. The
> **load-bearing rule stays inline in `CLAUDE.md`**: migrations are immutable +
> forward-only, and **destructive migrations (DROP COLUMN/TABLE, NOT NULL on an
> existing column) are ASK-FIRST** (operator approval). This file holds the
> procedure detail.

Migrations are immutable and ordered. Once a tag lands in `drizzle/meta/_journal.json`, the file cannot be edited — only forward migrations are allowed. The journal is the source of truth for "which migrations must be applied to every environment".

## Pre-deploy gate (BEFORE shipping code that depends on a new migration)

1. Apply migrations to the target env: `pnpm db:migrate:<env>` where `<env>` ∈ `{staging, prod}`.
2. Verify schema state: `pnpm db:verify:<env>`. Exits 0 ⇔ all migrations applied + RLS + GRANTs + Phase 4 column shape OK.
3. Deploy code only after step 2 exits 0.

Without this ordering, the deployed code's first request to the new schema 503s (missing table / column / index).

## Destructive migrations (DROP COLUMN, DROP TABLE, NOT NULL on existing column)

ASK FIRST. Operator approval required per the project's ASK-FIRST rule in `CLAUDE.md`. Migration file header must document:
- Rationale (e.g., "pre-paying-customer status verified per STATE.md")
- Operator-approval timestamp + decision ID

Example: `drizzle/0007_ai_generations_audit_extensions.sql` drops `tokens_used`; header documents the 2026-05-21 approval per `.planning/phases/04-ai-layer/04-CONTEXT.md` D-44.

## Procedure references

| Use case | File |
|---|---|
| Step-by-step manual procedure | `docs/runbooks/deploy-migrations.md` |
| CI/CD workflow (GitHub Actions) | `.github/workflows/migrate.yml` |
| Build-time gate (Vercel) | `vercel.json` → `pnpm deploy:preflight` → `scripts/deploy-preflight.ts` |
| Schema verifier (env-agnostic) | `scripts/check-deploy-schema.ts` |
| Test-DB sibling verifier (verify:phase-2) | `scripts/check-schema.ts` |

## Audit log

After every successful prod migration, append one line to `.planning/STATE.md` Session Continuity recording: timestamp, migration range, operator, additive-vs-destructive, soak observations. Template + example in `docs/runbooks/deploy-migrations.md` § Audit log.
