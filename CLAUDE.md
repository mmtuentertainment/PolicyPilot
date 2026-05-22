# PolicyPilot — CLAUDE.md
# AI-Powered Policy & Procedure Management SaaS
# Operator: Matthew (MMTU Entertainment LLC) | Stack: Next.js 15 · Supabase · Clerk · Stripe · Claude API

---

## Project Structure

```
policypilot/
├── app/                    — Next.js 15 App Router (frontend + API routes)
│   ├── (marketing)/        — Public landing + pricing
│   ├── (auth)/             — Clerk auth flows
│   ├── (admin)/            — Admin dashboard, policy library, reports
│   ├── (employee)/         — Employee portal, acknowledgments, Q&A
│   └── api/                — Route handlers (webhooks, AI, cron)
├── components/             — UI components (policy/, dashboard/, shared/)
├── lib/                    — Clients and utilities (db/, ai/, stripe/, email/)
├── reference/              — STACK.md, SCHEMA.md, PROMPTS.md, TIER-LIMITS.md, API-SPEC.md
└── docs/                   — Policies, designs, runbooks
```

---

## How to Use (Any Model)

> **GSD overlay active.** Live planning is in `.planning/`. The files below
> are the frozen FOUNDRY-stage source; consult them for original rationale
> but author all updates in `.planning/`.

1. **Architecture (live)** → `.planning/PROJECT.md` · *frozen*: `BLUEPRINT.md`
2. **Business rules / domain (live)** → `.planning/REQUIREMENTS.md` · *frozen*: `REQUIREMENTS.md`
3. **Active roadmap** → `.planning/ROADMAP.md`
4. **Session memory** → `.planning/STATE.md`
5. **Stack rationale (frozen)** → `reference/STACK.md`
6. **DB schema (frozen contract)** → `reference/SCHEMA.md`
7. **AI prompts (frozen contract)** → `reference/PROMPTS.md`
8. **Tier limits (frozen contract)** → `reference/TIER-LIMITS.md`
9. **API route specs (frozen contract)** → `reference/API-SPEC.md`

---

## Stack (non-negotiable)

| Layer | Tool |
|---|---|
| Frontend + API | Next.js 15, TypeScript, Tailwind CSS (App Router only) |
| Auth | Clerk (`@clerk/nextjs`) |
| Database | Supabase (PostgreSQL) + Drizzle ORM |
| Billing | Stripe (Checkout + Webhooks + Customer Portal) |
| AI | Anthropic Claude API (Sonnet 4.6 primary / Haiku 4.5 summaries) |
| Email | Resend + React Email |
| Background jobs | Railway worker service (cron reminders) |
| Hosting | Vercel (frontend) + Railway (workers) |

Do not introduce unlisted packages without asking Matthew first.

---

## Build Sequence

Phase **order** locked by ADR-007. Phase **gating** amended by ADR-029 (2026-05-21): phase boundaries must remain green on `main`, but in-flight phases may run on parallel branches off a common `main` ancestor. True minimum `Depends on` chain in `.planning/ROADMAP.md` § Phase Details.

```
Phase 1: Foundation       — Next.js init, Clerk, Supabase, env vars             [Depends on: nothing]
Phase 2: Data Layer       — Drizzle schema, RLS, Clerk webhooks, basic CRUD     [Depends on: 1]
Phase 3: Admin UI         — Layout, policy library, TipTap editor, publish flow [Depends on: 2]
Phase 4: AI Layer         — Draft, summary, employee Q&A                        [Depends on: 3]
Phase 5: Employee Portal  — My-policies, acknowledgment flow, notifications     [Depends on: 3]  ← parallel with 4
Phase 6: Billing          — Stripe products, checkout, webhooks, tier gating    [Depends on: 4]
Phase 7: Crons + Email    — Railway worker, Resend templates, reminders         [Depends on: 5]  ← parallel with 6
Phase 8: Validation       — Dashboard charts, CSV export, acceptance tests      [Depends on: 6 + 7]
```

Wave grouping (operator chooses per-phase whether to run sequentially or in parallel):
- Wave 1: Phase 4 ‖ Phase 5
- Wave 2: Phase 6 ‖ Phase 7
- Wave 3: Phase 8

End of each phase: run `tsc --noEmit` AND `verify:phase-N` (both exit 0) → squash to `main` → `git pull --ff-only` locally → report to Matthew. `main` must be green between every phase squash.

---

## Multi-Tenancy Rules (critical)

1. Every DB query must include `org_id` in the WHERE clause. No exceptions.
2. RLS is the last line of defense — application layer must scope queries too.
3. Clerk Organization ID = Supabase `org_id`. Set via Clerk webhook on org creation.
4. Never query across organizations.

RLS pattern (all tables):
```sql
CREATE POLICY "org_isolation" ON [table]
FOR ALL USING (org_id = auth.jwt()->>'org_id');
```

---

## Always / Ask First / Never

### ALWAYS
1. `tsc --noEmit` passes before every commit — zero type errors, no exceptions
2. Include `org_id` in every DB query
3. Verify Stripe webhook signatures with raw body (`request.text()`)
4. Use prompt caching on all repeated Claude API system prompts
5. Store every Claude API call in `ai_generations` table
6. Check tier limits before every Claude API call — full spec in `reference/TIER-LIMITS.md`

### ASK FIRST
1. Any package not in the stack list above
2. Any architecture decision not in `BLUEPRINT.md`
3. Any DB schema change after Phase 2 is complete
4. Any security-relevant decision (auth, data access, webhooks)
5. TypeScript errors that require changing the data model

### NEVER
1. Roll custom auth — Clerk handles everything
2. Call Claude API client-side — API routes and Server Actions only
3. Trust client-side for subscription state — always read from DB
4. Use `any` TypeScript type
5. Delete or modify acknowledgment records — audit trail is append-only
6. Build features not in `REQUIREMENTS.md` (see Non-Goals below)

---

## Git Workflow

GSD branching + merge hygiene. Apply on every clone; do every PR merge.

### Branching
1. Per-phase feature branch — all phase work (planning artifacts AND implementation code) lives on `gsd/phase-N-<slug>`. Do NOT commit `.planning/phases/**` files directly to `main`.
2. One PR per phase, squash-merged to `main` with `--delete-branch` (single ship commit per phase).
3. Cross-cutting / meta changes (CLAUDE.md, infra) ride along on the active phase branch when small, or get their own short-lived branch.

### Local git config (set once per clone)
```bash
git config --local fetch.prune true   # auto-prune deleted remote branches on every fetch
git config --local pull.ff only        # refuse silent merge commits on divergent main
```

### Post-PR-merge checklist
1. `git checkout main && git pull --ff-only` — fast-forward to the new squash commit. **If FF fails, local main has divergent commits — STOP and investigate** (most likely because a prior session committed to main directly; resolve via `git reset --hard origin/main` after confirming the divergent commits are already in the squash).
2. `git log -1 main` — verify the squash commit landed.
3. For any in-flight feature branch, `git rebase main` from the feature branch when convenient (keeps it up to date with the merged ship).

(Conventions learned from PR #2 cleanup, 2026-05-19. Full incident in `gsd/phase-3-admin-ui` commit log + this CLAUDE.md change.)

---

## Database Migration Discipline

Migrations are immutable and ordered. Once a tag lands in `drizzle/meta/_journal.json`, the file cannot be edited — only forward migrations are allowed. The journal is the source of truth for "which migrations must be applied to every environment".

### Pre-deploy gate (BEFORE shipping code that depends on a new migration)

1. Apply migrations to the target env: `pnpm db:migrate:<env>` where `<env>` ∈ `{staging, prod}`.
2. Verify schema state: `pnpm db:verify:<env>`. Exits 0 ⇔ all migrations applied + RLS + GRANTs + Phase 4 column shape OK.
3. Deploy code only after step 2 exits 0.

Without this ordering, the deployed code's first request to the new schema 503s (missing table / column / index).

### Destructive migrations (DROP COLUMN, DROP TABLE, NOT NULL on existing column)

ASK FIRST. Operator approval required per the project's ASK-FIRST rule above. Migration file header must document:
- Rationale (e.g., "pre-paying-customer status verified per STATE.md")
- Operator-approval timestamp + decision ID

Example: `drizzle/0007_ai_generations_audit_extensions.sql` drops `tokens_used`; header documents the 2026-05-21 approval per `.planning/phases/04-ai-layer/04-CONTEXT.md` D-44.

### Procedure references

| Use case | File |
|---|---|
| Step-by-step manual procedure | `docs/runbooks/deploy-migrations.md` |
| CI/CD workflow (GitHub Actions) | `.github/workflows/migrate.yml` |
| Build-time gate (Vercel) | `vercel.json` → `pnpm deploy:preflight` → `scripts/deploy-preflight.ts` |
| Schema verifier (env-agnostic) | `scripts/check-deploy-schema.ts` |
| Test-DB sibling verifier (verify:phase-2) | `scripts/check-schema.ts` |

### Audit log

After every successful prod migration, append one line to `.planning/STATE.md` Session Continuity recording: timestamp, migration range, operator, additive-vs-destructive, soak observations. Template + example in `docs/runbooks/deploy-migrations.md` § Audit log.

---

## AI API Rules

- Sonnet 4.6 → draft generation, employee Q&A, consistency check
- Haiku 4.5 → TL;DR summaries only
- Batch API → consistency check (async, 50% cost reduction)
- Q&A system prompt must constrain to published policies only and cite source
- Full prompt templates → `reference/PROMPTS.md`

---

## Stripe Rules

Handle all subscription events — not just checkout:
- `checkout.session.completed` — initial subscription
- `invoice.paid` — renewal (miss this = users lose access after cycle 1)
- `invoice.payment_failed` — flag org for dunning
- `customer.subscription.deleted` — cancel org
- `customer.subscription.updated` — plan change

All handlers must be idempotent. Store processed Stripe event IDs.

---

## Validation Gate (ASSEMBLY complete when all pass)

- [ ] Admin creates policy from Claude draft in under 5 minutes from account creation
- [ ] Admin assigns policy; per-user acknowledgment status tracked correctly
- [ ] Employee acknowledgment persists in audit trail with timestamp
- [ ] Employee Q&A returns cited answer from policy library only
- [ ] Admin exports acknowledgment report to CSV
- [ ] Stripe subscription survives first billing cycle renewal
- [ ] Tier gating: Starter blocked from Growth features with 403 + upgrade prompt
- [ ] Multi-tenancy: Org A cannot access Org B data under any code path

---

## Non-Goals (do not build)

Mobile app · LMS / training · HR integrations · Document generation · Offline mode · Custom domains per org

---

## Key Files

| File | What |
|---|---|
| `REQUIREMENTS.md` | Domain knowledge, business rules, acceptance criteria |
| `BLUEPRINT.md` | Architecture, repo layout, API specs, build sequence |
| `reference/STACK.md` | Stack decisions with full rationale and research |
| `reference/SCHEMA.md` | Complete Drizzle schema, all tables, RLS policies |
| `reference/API-SPEC.md` | Every API route: method, auth, request, response, errors |
| `reference/PROMPTS.md` | All Claude system prompts and prompt templates |
| `reference/TIER-LIMITS.md` | Feature gates and limits per plan tier |
| `.env.local.example` | All required environment variables |

---

*v1.0 — PolicyPilot MVP — May 2026 — Architect/Builder method*
