# Supabase GitHub Integration

This directory exists so the Supabase Dashboard GitHub Integration can find a
standard top-level `supabase/` project folder.

Dashboard setup:

- Repository: `mmtuentertainment/PolicyPilot`
- Working directory: `.`
- Automatic branching: allowed for Supabase preview branches
- Supabase changes only: recommended when available
- Deploy to production: off

PolicyPilot remains Drizzle-first for database migrations. The authoritative
migration files are in `../drizzle/`, and staging/prod migrations run through
`pnpm db:migrate:<env>`, `pnpm db:verify:<env>`, or the manual GitHub Actions
workflow in `../.github/workflows/migrate.yml`.

Do not add files under `supabase/migrations/` or turn Supabase production deploy
on unless Matthew explicitly approves moving migration authority away from
Drizzle.
