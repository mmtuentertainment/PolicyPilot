<!-- context7 -->
Use the `ctx7` CLI to fetch current documentation whenever the user asks about
a library, framework, SDK, API, CLI tool, or cloud service, even well-known
ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot.
This includes API syntax, configuration, version migration, library-specific
debugging, setup instructions, and CLI tool usage. Use even when you think you
know the answer; training data may not reflect recent changes. Prefer this over
web search for library docs.

Do not use ctx7 for refactoring, writing scripts from scratch, debugging
business logic, code review, or general programming concepts.

Steps:

1. Resolve library: `npx ctx7@latest library <name> "<user's question>"`.
   Use the official library name with proper punctuation.
2. Pick the best match by exact name, description relevance, snippet count,
   source reputation, and benchmark score.
3. Fetch docs: `npx ctx7@latest docs <libraryId> "<user's question>"`.
4. Answer using the fetched documentation.

Always call `library` first unless the user directly provides a valid
`/org/project` library ID. Do not run more than 3 ctx7 commands per question.
Do not include secrets in queries. For version-specific docs, use the versioned
ID from the library output.

If ctx7 fails with quota errors, tell the user and suggest
`npx ctx7@latest login` or setting `CONTEXT7_API_KEY`. Do not silently fall
back to training data. Run ctx7 outside Codex's default sandbox. If ctx7 fails
with DNS or network errors, rerun it outside the sandbox.
<!-- context7 -->

# PolicyPilot - AGENTS.md

AI-powered policy and procedure management SaaS.

Operator: Matthew (MMTU Entertainment LLC)
Stack: Next.js 15, Supabase, Clerk, Stripe, Codex API

## Project Structure

```text
policypilot/
  app/                    Next.js 15 App Router
    (marketing)/          Public landing and pricing
    (auth)/               Clerk auth flows
    (admin)/              Admin dashboard, policy library, reports
    (employee)/           Employee portal, acknowledgments, Q&A
    api/                  Route handlers: webhooks, AI, cron
  components/             UI components
  lib/                    Clients and utilities
  reference/              STACK, SCHEMA, PROMPTS, TIER-LIMITS, API-SPEC
  docs/                   Policies, designs, runbooks
```

## Source Of Truth

The GSD overlay is active. Live planning is in `.planning/`. The files below
are frozen FOUNDRY-stage sources; consult them for original rationale but
author planning updates in `.planning/`.

1. Architecture live: `.planning/PROJECT.md`; frozen: `BLUEPRINT.md`
2. Business rules/domain live: `.planning/REQUIREMENTS.md`; frozen:
   `REQUIREMENTS.md`
3. Active roadmap: `.planning/ROADMAP.md`
4. Session memory: `.planning/STATE.md`
5. Stack rationale: `reference/STACK.md`
6. DB schema contract: `reference/SCHEMA.md`
7. AI prompts contract: `reference/PROMPTS.md`
8. Tier limits contract: `reference/TIER-LIMITS.md`
9. API route specs: `reference/API-SPEC.md`

## Stack

Non-negotiable stack:

| Layer | Tool |
|---|---|
| Frontend + API | Next.js 15, TypeScript, Tailwind CSS, App Router only |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase PostgreSQL + Drizzle ORM |
| Billing | Stripe Checkout, webhooks, customer portal |
| AI | Anthropic Codex API, Sonnet 4.6 primary, Haiku 4.5 summaries |
| Email | Resend + React Email |
| Background jobs | Railway worker service for cron reminders |
| Hosting | Vercel frontend + Railway workers |

Do not introduce unlisted packages without asking Matthew first.

## Build Sequence

Phase order is locked by ADR-007. Phase gating is amended by ADR-029
(2026-05-21): phase boundaries must remain green on `main`, but in-flight
phases may run on parallel branches off a common `main` ancestor.

```text
Phase 1: Foundation       Next.js init, Clerk, Supabase, env vars
Phase 2: Data Layer       Drizzle schema, RLS, Clerk webhooks, basic CRUD
Phase 3: Admin UI         Layout, policy library, editor, publish flow
Phase 4: AI Layer         Draft, summary, employee Q&A
Phase 5: Employee Portal  My policies, acknowledgment flow, notifications
Phase 6: Billing          Stripe products, checkout, webhooks, tier gating
Phase 7: Crons + Email    Railway worker, Resend templates, reminders
Phase 8: Validation       Dashboard charts, CSV export, acceptance tests
```

Wave grouping:

- Wave 1: Phase 4 and Phase 5
- Wave 2: Phase 6 and Phase 7
- Wave 3: Phase 8

End of each phase: run `tsc --noEmit` and `verify:phase-N`; both must exit 0.
Then squash to `main`, `git pull --ff-only` locally, and report to Matthew.
`main` must be green between every phase squash.

## Multi-Tenancy Rules

1. Every DB query must include `org_id` in the WHERE clause.
2. RLS is the last line of defense; application code must scope queries too.
3. Clerk Organization ID maps to Supabase `org_id`.
4. Never query across organizations.

RLS pattern:

```sql
CREATE POLICY "org_isolation" ON [table]
FOR ALL USING (org_id = auth.jwt()->>'org_id');
```

## Always

1. `tsc --noEmit` passes before every commit.
2. Include `org_id` in every DB query.
3. Verify Stripe webhook signatures with raw body via `request.text()`.
4. Use prompt caching on repeated Codex API system prompts.
5. Store every Codex API call in `ai_generations`.
6. Check tier limits before every Codex API call.

## Ask First

1. Any package not in the stack list.
2. Any architecture decision not in `BLUEPRINT.md`.
3. Any DB schema change after Phase 2.
4. Any security-relevant decision around auth, data access, or webhooks.
5. TypeScript errors that require changing the data model.

## Never

1. Roll custom auth; Clerk handles auth.
2. Call Codex API client-side.
3. Trust client-side subscription state; always read from DB.
4. Use `any` TypeScript type.
5. Delete or modify acknowledgment records; the audit trail is append-only.
6. Build features not in `REQUIREMENTS.md`.

## Git Workflow

Use GSD branching and merge hygiene:

1. Per-phase work lives on `gsd/phase-N-<slug>`.
2. Do not commit `.planning/phases/**` directly to `main`.
3. One PR per phase, squash-merged to `main` with the remote branch deleted.
4. Cross-cutting/meta changes ride on the active phase branch when small, or
   get their own short-lived branch.

Set once per clone:

```bash
git config --local fetch.prune true
git config --local pull.ff only
```

After every PR merge:

1. `git checkout main && git pull --ff-only`.
2. If fast-forward fails, stop and investigate local divergence.
3. `git log -1 main` to verify the squash commit.
4. Rebase in-flight feature branches onto `main` when convenient.

## Migration Discipline

Migrations are immutable and ordered. Once a tag lands in
`drizzle/meta/_journal.json`, do not edit the migration file; create a forward
migration.

Before deploying code that depends on a new migration:

1. Apply migrations to the target environment:
   `pnpm db:migrate:<env>`, where `<env>` is `staging` or `prod`.
2. Verify schema state: `pnpm db:verify:<env>`.
3. Deploy code only after verification exits 0.

Destructive migrations require operator approval. The migration header must
document rationale, approval timestamp, and decision ID.

Procedure references:

| Use case | File |
|---|---|
| Manual procedure | `docs/runbooks/deploy-migrations.md` |
| CI/CD workflow | `.github/workflows/migrate.yml` |
| Build-time gate | `vercel.json` -> `pnpm deploy:preflight` |
| Schema verifier | `scripts/check-deploy-schema.ts` |
| Test-DB verifier | `scripts/check-schema.ts` |

After every successful prod migration, append one line to `.planning/STATE.md`
with timestamp, migration range, operator, additive-vs-destructive status, and
soak observations.

## AI API Rules

- Sonnet 4.6: draft generation, employee Q&A, consistency check.
- Haiku 4.5: TL;DR summaries only.
- Batch API: consistency check, async, lower cost.
- Q&A prompt must constrain answers to published policies only and cite source.
- Full prompt templates live in `reference/PROMPTS.md`.

## Stripe Rules

Handle all subscription events, not only checkout:

- `checkout.session.completed`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

Handlers must be idempotent. Store processed Stripe event IDs.

## Validation Gate

Assembly is complete only when all pass:

- Admin creates a policy from a Codex draft in under 5 minutes from account
  creation.
- Admin assigns policy; per-user acknowledgment status is tracked correctly.
- Employee acknowledgment persists in audit trail with timestamp.
- Employee Q&A returns cited answer from policy library only.
- Admin exports acknowledgment report to CSV.
- Stripe subscription survives first billing-cycle renewal.
- Starter tier is blocked from Growth features with 403 and upgrade prompt.
- Org A cannot access Org B data under any code path.

## Non-Goals

Mobile app, LMS/training, HR integrations, document generation, offline mode,
custom domains per organization.

## Key Files

| File | Purpose |
|---|---|
| `REQUIREMENTS.md` | Domain knowledge, business rules, acceptance criteria |
| `BLUEPRINT.md` | Architecture, repo layout, API specs, build sequence |
| `reference/STACK.md` | Stack decisions and rationale |
| `reference/SCHEMA.md` | Complete Drizzle schema, tables, RLS policies |
| `reference/API-SPEC.md` | API routes, auth, request/response, errors |
| `reference/PROMPTS.md` | Codex system prompts and templates |
| `reference/TIER-LIMITS.md` | Feature gates and plan limits |
| `.env.local.example` | Required environment variables |

v1.0 - PolicyPilot MVP - May 2026 - Architect/Builder method
