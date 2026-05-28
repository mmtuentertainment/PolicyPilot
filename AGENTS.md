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

PolicyPilot is an AI-powered policy and procedure management SaaS for SMBs.
This file defines how AI agents operate in the repo. It is intentionally about
the development operating layer; the product itself still uses Anthropic Claude
for policy drafting, summaries, Q&A, and consistency checks.

## Operating Roles

- **Matthew** is the operator, product owner, and approval authority. He owns
  product scope, package approvals, schema approvals, security decisions,
  third-party dashboard actions, and final ship decisions.
- **ChatGPT** is the consultant layer: researcher, risk reviewer,
  implementation-router, GSD guide, architecture critic, prompt/handoff
  reviewer, and second-opinion reviewer. ChatGPT should produce
  evidence-backed prompts or review notes for Claude Code and Codex, not claim
  implementation work happened unless an implementation agent or the repo
  proves it.
- **Claude Code** is the long-horizon repo exploration and broad-audit agent.
  Claude Code is best for GSD research/planning, security and risk review,
  branch/state diagnosis, multi-file consistency analysis, and ambiguous
  codebase investigation. It is read-mostly by default and should hand exact
  patches, tests, PR updates, or verification instructions to Codex unless
  Matthew explicitly asks Claude Code to implement.
- **Codex** is the scoped implementation executor. Codex verifies the actual
  repo state, applies exact patches and small reversible fixes, runs tests and
  verification gates, updates PR/delta docs, and returns structured handoffs
  for Matthew, ChatGPT, and Claude Code.

Claude/Anthropic is the product AI layer. Claude Code and Codex are
implementation agents, not product AI APIs.

When Matthew supplies a ChatGPT- or Claude Code-authored GSD stage prompt,
Codex should treat it as implementation guidance, verify it against the live
repo, then return a structured handoff rather than an unstructured status note.

## Startup Read Order

At the start of non-trivial work, Codex should verify current state before
acting. Read in this order unless the user narrows the task:

1. `git status --short --branch`, current branch, and PR context.
2. `AGENTS.md`, `CLAUDE.md`, and `CONSULTANT.md` when present.
3. `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, and
   `.planning/REQUIREMENTS.md`.
4. Active phase files under `.planning/phases/<NN-slug>/`, especially
   `SPEC`, `CONTEXT`, `DISCUSSION-LOG`, `RESEARCH`, `VALIDATION`, `PLAN`,
   `SECURITY`, `VERIFICATION`, `REVIEW`, and `SUMMARY` artifacts.
5. `.planning/consultant/*.md` for ChatGPT/Codex coordination packets.
6. `ops/deltas/*.md` for dated operating-layer changes.
7. Frozen reference contracts only as needed: `reference/STACK.md`,
   `reference/SCHEMA.md`, `reference/PROMPTS.md`,
   `reference/TIER-LIMITS.md`, and `reference/API-SPEC.md`.

If GSD manager output, `HANDOFF.json`, branch names, and `.planning/STATE.md`
disagree, treat `.planning/STATE.md` and `.planning/ROADMAP.md` as the first
truth to reconcile. Do not assume a prior handoff or manager command succeeded.

## Precedence

1. Direct Matthew instruction in the current conversation.
2. This `AGENTS.md` file for Codex behavior.
3. `CLAUDE.md` for legacy project conventions and phase gates.
4. `CONSULTANT.md` for ChatGPT consultant behavior.
5. Live planning files in `.planning/`.
6. Frozen FOUNDRY/reference files.
7. Historical reports, handoffs, and generated summaries.

When documents conflict, report the conflict and follow the highest-precedence
current source. Never hide a conflict by silently choosing a convenient source.

## GSD Workflow

The operating workflow is:

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

Use the stages this way:

| Stage | ChatGPT role | Codex role |
|---|---|---|
| `pr-branch` | Recommend branch/PR framing and risk boundaries. | Verify branch/PR state; create or switch branches only when asked or required. |
| `spec` | Clarify WHAT, success criteria, non-goals, and approval gates. | Write or update spec artifacts only when asked; do not implement. |
| `discuss` | Surface decisions, ambiguity, constraints, and operator questions. | Capture decisions in `CONTEXT.md`/discussion artifacts. |
| `UAT intent` | Define what a human must prove and what evidence is safe to collect. | Encode UAT checklist or handoff; avoid exposing secrets. |
| `research` | Refresh current docs and best practices. | Use `ctx7` for library/API/cloud docs and local repo evidence for code facts. |
| `validate` | Check the plan against requirements and invariants. | Create or update validation artifacts and command gates. |
| `plan` | Review or draft implementation sequence and prompts for Codex. | Produce concrete plan files only after spec/context are stable. |
| `checker` | Critique plan completeness, risks, and missing tests. | Run/check plan validation; do not fake checker results. |
| `execute` | Stay out of the code path except for prompt/review support. | Implement the approved scope with minimal blast radius. |
| `secure phase` | Review security/privacy/auth/data-access risk. | Run or document security checks and fix still-valid findings. |
| `verifier` | Review evidence, gaps, and residual risk. | Run verification commands and preserve evidence in summaries. |
| `ship review` | Prepare risk-focused final review questions. | Check PR status, update PR body when applicable, and hand off cleanly. |

Claude Code normally supports the long-horizon `research`, `validate`,
`checker`, `secure phase`, `verifier`, and `ship review` lanes. It should
produce exact findings, patch plans, tests, and PR-body updates that Codex can
execute or verify.

## GSD Command Convention

Do not invent GSD command output. In this repo, historical planning artifacts
use slash form such as `/gsd-plan-phase 6`, while the local shell exposes
`gsd-sdk` and `gsd-tools` query commands. If a Codex/chat runtime exposes
`$gsd-command-name` tools, use that form. If only slash-form or shell-level
commands are available, follow the installed local convention and document the
fallback in the handoff.

## Phase Constraint

`.planning/STATE.md` is the source of truth for current phase state. As of PR
#30, Phase 5 Employee Portal shipped via PR #27 at commit `3344847` on
2026-05-27, and Phase 6 is pending/planning-only. Do not start Phase 6
implementation until Matthew intentionally resumes the proper Phase 6 GSD
branch/spec/plan path. A Phase 6 branch or handoff is not enough by itself.

## Stack

Non-negotiable stack:

| Layer | Tool |
|---|---|
| Frontend + API | Next.js 15, TypeScript, Tailwind CSS, App Router only |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase PostgreSQL + Drizzle ORM |
| Billing | Stripe Checkout, webhooks, customer portal |
| Product AI | Anthropic Claude API: Sonnet 4.6 primary, Haiku 4.5 summaries |
| Email | Resend + React Email |
| Background jobs | Railway worker service for cron reminders |
| Hosting | Vercel frontend + Railway workers |

Do not introduce unlisted packages without Matthew approval.

## PolicyPilot Invariants

- Every tenant-scoped DB query includes `org_id` in the WHERE clause.
- RLS is the database backstop; application code must still scope queries.
- Clerk Organization ID maps to Supabase `org_id`.
- Never query across organizations.
- Acknowledgment records are append-only. Do not delete or modify them.
- Stripe subscription state is trusted only from server/database state.
- Stripe webhooks verify raw-body signatures with `request.text()` and are
  idempotent.
- Claude calls are server-only, tier-gated, and logged in `ai_generations`.
- No `any` TypeScript type.
- No new packages, schema changes, migrations, or security-relevant decisions
  without Matthew approval.
- Build only what live requirements and phase artifacts authorize.

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

## Verification Commands

Use the narrowest check that fits the change.

- Docs-only changes: inspect rendered/content references as needed, run
  `git diff --check`, and use `rg` checks for required terms.
- Phase code changes: run `pnpm typecheck` and the relevant
  `pnpm verify:phase-N` chain.
- Billing/deploy-schema work: use the migration discipline and `db:verify`
  commands documented in `CLAUDE.md` and `docs/runbooks/deploy-migrations.md`.
- Browser/UAT work: collect safe evidence, never secrets or raw third-party
  payloads.

Do not run broad build/test for a docs-only change unless touched files require
it.

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

After every successful prod migration, append one line to `.planning/STATE.md`
with timestamp, migration range, operator, additive-vs-destructive status, and
soak observations.

## Codex Handoff Format

Every substantial Codex final handoff should include:

1. Branch and PR verified.
2. Files changed.
3. Exact diff summary.
4. Commands/checks run and results.
5. GSD stages represented.
6. Failed or unavailable checks.
7. Risks or uncertainties.
8. Consultant files updated or no-change status.
9. Next smallest proposed task.
10. Links or refs to relevant files and commits when available.

For ChatGPT review requests, provide one copy-block prompt that includes those
same ten points so Matthew can paste it directly into ChatGPT.

## Keep-Current Rule

Before trusting any planning or handoff artifact, re-check live git state,
branch/PR context, and `.planning/STATE.md`. If the repo has moved, update the
handoff or report the drift. If unrelated dirty work exists before starting,
stop and ask Matthew how to proceed.

v1.1 - PolicyPilot MVP operating layer - May 2026
