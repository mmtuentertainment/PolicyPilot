# Runbooks

Operational procedures for PolicyPilot deploys, incidents, and recurring maintenance.

## Index

| Runbook | When to use |
|---|---|
| [deploy-migrations.md](./deploy-migrations.md) | Before any deploy that includes a new Drizzle migration. Procedure for applying migrations to staging + prod with verify gates. |

## Adding a new runbook

1. Pick a kebab-case filename (`incident-<topic>.md`, `recurring-<task>.md`, `deploy-<topic>.md`).
2. Top-of-file frontmatter: last-updated date, audience, scope (one sentence).
3. Add a row to the Index above (alphabetical within type).
4. Cross-link from `CLAUDE.md` if the runbook governs a recurring discipline.
