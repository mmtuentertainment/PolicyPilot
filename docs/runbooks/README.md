# Runbooks

Operational procedures for PolicyPilot deploys, incidents, and recurring maintenance.

## Index

| Runbook | When to use |
|---|---|
| [deploy-migrations.md](./deploy-migrations.md) | Before any deploy that includes a new Drizzle migration. Procedure for applying migrations to staging + prod with verify gates. |
| [launch-mvp.md](./launch-mvp.md) | Launching the MVP: sequences Milestone 1 (Phase 7 R-018 — Railway worker + cron + Resend domain + 0014 gate) then Milestone 2 (provision prod Supabase, prod migration/verify gate, first prod deploy + smoke test). |

## Adding a new runbook

1. Pick a kebab-case filename (`incident-<topic>.md`, `recurring-<task>.md`, `deploy-<topic>.md`).
2. Top-of-file frontmatter: last-updated date, audience, scope (one sentence).
3. Add a row to the Index above (alphabetical within type).
4. Cross-link from `CLAUDE.md` if the runbook governs a recurring discipline.
