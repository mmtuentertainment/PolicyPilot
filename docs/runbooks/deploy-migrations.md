# Runbook: Deploy Migrations to Staging / Production

**Last updated:** 2026-05-22 (Phase 4 deploy-prep, Issue #16 carry)
**Audience:** Operator (Matthew); future on-call ops if PolicyPilot scales beyond solo.
**Scope:** Applying Drizzle migrations to a Supabase Postgres database that is NOT the local dev DB.

---

## When to use this runbook

Run this BEFORE deploying any code that depends on a not-yet-applied migration. PolicyPilot's policy: **code cannot ship to an environment whose DB has not been migrated to that code's schema**. Without that ordering, the deployed code's first request to the new schema 503s (missing table / missing column / missing index).

PolicyPilot's first end-to-end deploy lands the journal at 0007 (`drizzle/meta/_journal.json` entries 0000..0007). Future migrations follow the same procedure.

---

## Pre-flight checklist

Before touching any non-dev database, confirm ALL of the following:

- [ ] `git status` clean; on `main`; `git pull --ff-only` is a no-op.
- [ ] `pnpm tsc --noEmit` exits 0.
- [ ] `pnpm verify:phase-4` (or whichever is the current latest verify chain) exits 0 against the **test** DB.
- [ ] `pnpm db:verify` against **dev** DB exits 0. (Confirms the verifier itself works before pointing at staging/prod. There is no `db:verify:test` — the test DB is covered by `scripts/check-schema.ts` via `verify:phase-2`.)
- [ ] Operator has reviewed every pending migration's SQL (`git diff $LAST_DEPLOYED_TAG..main -- drizzle/`).
- [ ] Operator has reviewed any **destructive** migrations (DROP COLUMN, DROP TABLE, NOT NULL on existing column, etc.) and approved per CLAUDE.md ASK-FIRST rule.

### Destructive-migration register (Phase 4)

| Migration | Destructive? | Notes |
|---|---|---|
| `0005_initial_batch_jobs.sql` | No (CREATE TABLE) | Reversible via `DROP TABLE batch_jobs CASCADE`. |
| `0006_rls_batch_jobs.sql` | No (RLS + GRANTs) | Reversible via `DROP POLICY org_isolation ON batch_jobs; ALTER TABLE batch_jobs DISABLE ROW LEVEL SECURITY; REVOKE ALL ON batch_jobs FROM authenticated;`. |
| `0007_ai_generations_audit_extensions.sql` | **YES — `DROP COLUMN tokens_used`** | Operator-approved 2026-05-21 per CLAUDE.md ASK-FIRST (CONTEXT.md D-44). Pre-paying-customer state verified — no production AI calls exist when this lands. **NOT REVERSIBLE without data loss** once any rows are written to the new columns. |

---

## Required env vars (per environment)

Both must be set:

| Variable | Purpose | Supabase URL form |
|---|---|---|
| `DATABASE_URL` | Runtime connection (Drizzle queries) | Transaction pooler, port **6543** |
| `DIRECT_URL` | Migration connection (drizzle-kit) | Direct, port **5432** |

The pooler chokes on some DDL (e.g., `CREATE INDEX CONCURRENTLY`); drizzle-kit uses `DIRECT_URL` per `drizzle.config.ts` D-05.

### Env file pattern (operator-side)

Stored in `secrets/` (gitignored). Each env gets its own file:

```
secrets/
├── anthropic-dev.txt        (existing — API key)
├── staging.env              (NEW — STAGING_DATABASE_URL + STAGING_DIRECT_URL)
└── prod.env                 (NEW — PROD_DATABASE_URL + PROD_DIRECT_URL)
```

**Format of `secrets/staging.env`** (mirrors `.env.local`):

```bash
DATABASE_URL=postgres://...@aws-...-pooler.supabase.com:6543/postgres
DIRECT_URL=postgres://postgres.<project_ref>:<password>@aws-...-pooler.supabase.com:5432/postgres
```

Same shape for `secrets/prod.env`.

**Never** commit these files (`secrets/` is gitignored as of `d0352a1`).

---

## Procedure

### 1. Migrate Staging

```powershell
# from C:\Users\matth\Desktop\PolicyPilot\

pnpm db:migrate:staging
```

This runs `drizzle-kit migrate` with `--env-file=secrets/staging.env`. Drizzle reads the journal, computes the diff against `drizzle.__drizzle_migrations` on the target DB, and applies the pending entries in order inside a single transaction (PostgreSQL DDL is transactional — a failure mid-migration rolls back all changes).

Expected output on first run:

```
> drizzle-kit migrate
2 migrations applied: 0005_initial_batch_jobs, 0006_rls_batch_jobs, 0007_ai_generations_audit_extensions
```

(Note: drizzle-kit's exact phrasing may vary; the key signal is exit 0.)

### 2. Verify Staging

```powershell
pnpm db:verify:staging
```

Runs `scripts/check-deploy-schema.ts` against `STAGING_DIRECT_URL`. Asserts:

- Journal entry count matches applied count
- All 11 tenant tables exist with RLS + `org_isolation` policy + 4 GRANTs
- 2 service-role tables exist with RLS **disabled**
- `ai_generations` has the 5 Phase 4 columns
- `ai_generations` has the `ai_generations_org_idempotency_key` partial-unique index
- `policy_versions` has UNIQUE(policy_id, version_number)
- `batch_jobs` has UNIQUE(anthropic_batch_id)

Expected output:

```
OK — deploy schema audit passed: 8 migrations applied, 11 tenant-scoped tables (RLS + policy + 4 GRANTs each), 2 service-role tables (no RLS), Phase 4 column shape + partial-unique index present, Phase 3 G3 + Phase 4 unique constraints present.
```

### 3. Operator approval gate

Before applying the same migrations to prod, **confirm**:

- [ ] Staging migrate succeeded (step 1 exit 0)
- [ ] Staging verify succeeded (step 2 exit 0)
- [ ] No app errors observed on staging in the 30 minutes following migration (check Vercel logs / Anthropic dashboard for 503s)
- [ ] If 0007 (or any future destructive migration) is in this batch: re-read `STATE.md` to confirm "pre-paying-customer" or "operator-approved" condition still holds

If any of those fail, **STOP** — do not proceed to prod. Roll back staging via the per-migration table above and investigate.

### 4. Migrate Production

```powershell
pnpm db:migrate:prod
```

Same shape as staging, against `secrets/prod.env`. **There is no auto-rollback once this succeeds** — the next step (verify) is mandatory.

### 5. Verify Production

```powershell
pnpm db:verify:prod
```

If exit 0: production schema is now caught up to the journal. Deploy is safe to land.

If exit 1: stop the deploy. Surface the failure detail to the operator. Likely causes:

- A migration applied partially (PostgreSQL DDL is transactional, so this implies a manual `psql` intervention happened — investigate the audit log of the Supabase project)
- A migration's drizzle-kit journal entry doesn't match the actual applied state (rare; indicates a `__drizzle_migrations` table tamper)
- A previously-applied destructive migration broke an invariant that this script catches

---

## Audit log

After every successful prod migration, append to `.planning/STATE.md` (Session Continuity section):

```markdown
- **Deploy migration YYYY-MM-DDTHH:MM:SSZ**: Applied drizzle/<N>..drizzle/<M> to staging at HH:MM (verify OK at HH:MM); applied to prod at HH:MM (verify OK at HH:MM). Operator: <name>. Migration types: <additive|destructive>. Notes: <any deviation or observation>.
```

Example (Phase 4 first deploy, 2026-05-22):

```markdown
- **Deploy migration 2026-05-23T14:00:00Z**: Applied drizzle/0005..0007 to staging at 13:42Z (verify OK at 13:43Z); applied to prod at 14:00Z (verify OK at 14:01Z). Operator: matthewutt. Migration types: 0005/0006 additive + 0007 destructive (DROP COLUMN tokens_used — operator-approved 2026-05-21 per pre-paying-customer status). No app errors observed in 30-min staging soak.
```

This is the load-bearing audit trail for compliance + future-troubleshooting.

---

## CI/CD path (alternative to manual)

`.github/workflows/migrate.yml` provides a manual-trigger CI workflow that runs the same migrate + verify steps using GitHub repository secrets `STAGING_DATABASE_URL` / `STAGING_DIRECT_URL` / `PROD_DATABASE_URL` / `PROD_DIRECT_URL`. Prod is gated by a GitHub Environment with manual approval.

Trigger:

```bash
gh workflow run migrate -f env=staging
# wait for green, then
gh workflow run migrate -f env=prod
# (will pause for environment approval)
```

The CI workflow is the recommended path once the operator is comfortable with the manual procedure — it preserves an audit trail in GitHub Actions history and removes the local-machine-credential risk.

---

## Vercel build-hook (`deploy:preflight`)

`vercel.json` includes a `buildCommand` that runs `pnpm deploy:preflight` before `pnpm build`. This step:

1. Runs `pnpm tsc --noEmit` (already part of `verify:phase-4`)
2. Runs `pnpm db:verify` against whichever DATABASE_URL is set in the Vercel environment

If `db:verify` fails, the Vercel build fails — preventing a deploy that would 503 on first request. This is a defense-in-depth gate; the operator is still expected to run `pnpm db:migrate:<env>` BEFORE pushing the build trigger.

`deploy:preflight` is **graceful** when `DATABASE_URL` is unset (returns OK with a "skipped: no DATABASE_URL configured" notice) so build doesn't break for branches that don't need a DB.

---

## Rollback procedures (per migration class)

### Additive migrations (CREATE TABLE, ADD COLUMN nullable, CREATE INDEX, ENABLE RLS)

Rollback is safe and reversible. Example for 0005 + 0006:

```sql
-- Roll back 0006 + 0005:
DROP POLICY IF EXISTS "org_isolation" ON batch_jobs;
ALTER TABLE batch_jobs DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON batch_jobs FROM authenticated;
DROP TABLE batch_jobs CASCADE;
DELETE FROM drizzle.__drizzle_migrations WHERE id IN (5, 6);
```

After: re-run `pnpm db:verify:<env>` — should fail with "X migrations applied (expected Y)".

### Destructive migrations (DROP COLUMN, DROP TABLE)

**Not reversible without restoring from backup.** Supabase keeps daily backups by default; the operator must restore via the Supabase Dashboard if a destructive migration needs to be undone.

Once any rows are written to columns added in 0007, those rows are gone if the migration is rolled back. The pre-paying-customer header on 0007 documents the operator's decision to accept this risk.

### Mixed (additive + destructive)

If a single migration mixes both (like 0007 does — drops `tokens_used` AND adds 5 new columns), roll back via Supabase Dashboard backup restore. Don't attempt manual SQL — partial rollback can leave the schema in an inconsistent state.

---

## Troubleshooting

### "relation drizzle.__drizzle_migrations does not exist"

Means no migration has ever been run against this DB. Run `pnpm db:migrate:<env>`.

### "X migrations applied (expected Y)"

Drift between journal and `__drizzle_migrations`. Causes:
- A migration was rolled back but its entry wasn't removed from `__drizzle_migrations`
- Someone applied a migration manually via SQL editor
- The journal was edited (NOT ALLOWED — see CLAUDE.md immutable-migration rule)

Fix: investigate the audit log of the Supabase project. Do not edit `__drizzle_migrations` directly without root-cause confirmed.

### "table batch_jobs not found"

Migration 0005 or 0006 didn't apply, or applied partially (unlikely — DDL is transactional). Re-run `pnpm db:migrate:<env>`.

### "ai_generations.input_tokens missing"

Migration 0007 didn't apply. Re-run `pnpm db:migrate:<env>`.

### "RLS enabled = false on tenant table"

Migration 0001_rls_policies.sql or 0006_rls_batch_jobs.sql didn't run, or someone disabled RLS via SQL editor. **Critical security gap — cross-org leak possible.** Stop the deploy and re-apply RLS immediately.

---

## Related files

- `scripts/check-deploy-schema.ts` — the verifier this runbook runs
- `drizzle.config.ts` — DIRECT_URL > DATABASE_URL precedence (D-05)
- `drizzle/meta/_journal.json` — source of truth for "all migrations expected"
- `.github/workflows/migrate.yml` — CI/CD equivalent of this manual procedure
- `vercel.json` — build-time `deploy:preflight` hook
- `CLAUDE.md` — "Database Migration Discipline" section
- `.planning/STATE.md` — audit log destination
- `scripts/check-schema.ts` — sibling verifier tied to TEST_URL (verify:phase-2)
