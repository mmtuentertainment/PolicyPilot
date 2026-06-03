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
├── .planning/consultant/   — Consultant memory, map, risk, feature, backlog files
├── ops/deltas/             — Consultant delta reports for meaningful changes
├── CONSULTANT.md           — High-level consultant operating instructions
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
5. **Consultant operating layer** → `CONSULTANT.md` + `.planning/consultant/*.md`
6. **Consultant deltas** → `ops/deltas/*.md`
7. **Stack rationale (frozen)** → `reference/STACK.md`
8. **DB schema (frozen contract)** → `reference/SCHEMA.md`
9. **AI prompts (frozen contract)** → `reference/PROMPTS.md`
10. **Tier limits (frozen contract)** → `reference/TIER-LIMITS.md`
11. **API route specs (frozen contract)** → `reference/API-SPEC.md`

---

## Consultant Overlay (high-level)

Operate as a high-level product, technical, and operating consultant on the PolicyPilot build. The consultant layer is advisory and execution-oriented: challenge scope, preserve launch focus, surface tradeoffs, and recommend the smallest reversible change that improves revenue readiness, time-to-value, tenant trust, or audit integrity.

Role split:

- Matthew is the operator, product owner, and approval authority.
- ChatGPT is the consultant/research/risk-review/implementation-router/GSD-guide
  and prompt/handoff review layer.
- Claude Code is the long-horizon repo exploration, broad-audit, GSD
  research/planning, security/risk review, branch/state diagnosis,
  multi-file-consistency, and ambiguous-investigation agent. It is read-mostly
  by default and should hand exact patches, tests, PR updates, or verification
  instructions to Codex unless Matthew explicitly asks otherwise.
- Codex is the scoped implementation executor for exact patches, tests,
  verification gates, PR/delta updates, and small reversible fixes; its
  operating contract is `AGENTS.md`.
- Anthropic Claude API is the product AI layer. Claude Code and Codex are
  implementation agents, not product AI APIs.

The GSD operating chain is:

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

Before meaningful advice or implementation, read `AGENTS.md`, `CONSULTANT.md`, `.planning/consultant/working_context.md`, `.planning/consultant/system_map.md`, `.planning/consultant/feature_inventory.md`, `.planning/consultant/risk_register.md`, and `.planning/consultant/backlog.md` after the core GSD files above.

Keep-current rule: no meaningful project change is complete until the consultant file set is reviewed and either updated or explicitly marked `no-change` in `ops/deltas/<date>-<slug>.md`.

Current phase state comes from `.planning/STATE.md`. As of 2026-05-31, Phase 5 Employee Portal is shipped and Phase 6 Billing is shipped via PR #32 squash commit `243067e9f259561a595230e5e7d3e97634040157` on `main`. Plans 06-01..06-06 are committed; local `pnpm verify:phase-6` was green before merge; live Stripe test-mode UAT rows 1-11 are PASS with masked-only evidence; the hosted pre-merge gate was green/acceptable at PR head `1abca44dff89ccc7151d59b07fe1a93ce3d7be81`; and post-merge local `tsc` plus targeted Stripe/webhook tests passed. Phase 7 is not started. Do not weaken the gate, add dummy secrets, configure secrets in code, use live Stripe mode, or start Phase 7 until Matthew explicitly authorizes next-phase planning.

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
7. Review consultant files after meaningful changes and update them or mark `no-change` in the delta report

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

## Codebase Intelligence (fallow)

`fallow` (devDependency `fallow@^2.87.0`, added 2026-06-03 — operator-approved as a sanctioned exception to the "no unlisted packages" rule) is **deterministic codebase intelligence for TS/JS**: it answers structural questions (is this used? is this duplicated? circular deps? complexity hotspots? boundary violations?) about the whole module graph. **Ask fallow for structural truth instead of grepping-and-inferring.** It is syntactic (no type info), sub-second, deterministic — no AI inside, and does not replace review.

**Full wiki (operator-local, gitignored):** `.wiki/fallow/index.html` (decision router) · `.wiki/fallow/reference.html` (commands, flags, full config, issue types, MCP). MCP server `fallow` is wired in `.mcp.json` (tools incl. `fallow_explain`, `find_dupes`, `trace_export`, `check_health`).

**If you need to… → run this** (all via `pnpm exec fallow`; deep detail at the `reference.html` anchors):

| If you need to… | Use | → reference |
|---|---|---|
| know if a file / export / type / dep is **actually used** | `fallow dead-code` | `reference.html#commands` |
| find **duplicated** logic / a block's clone siblings | `fallow dupes` (`--trace f.ts:42`) | `reference.html#commands` |
| find **circular deps** / **boundary** violations | `fallow dead-code --circular-deps` / `--boundary-violations` | `reference.html#rules` |
| find the **riskiest / most complex** code | `fallow health --hotspots --targets --score` | `reference.html#commands` |
| **gate a change** before a PR (pass/warn/fail) | `fallow audit` | `reference.html#commands` |
| understand **why** X is (un)used | `fallow explain <rule>` · MCP `fallow_explain` | `reference.html#agent` |
| match **literal text / regex / a string** | the `Grep` tool — **NOT** fallow | `index.html#route-tool` |

**When fallow reports a finding** → choose one: (1) **fix** it in code, (2) **encode the narrowest exception** (`// fallow-ignore-next-line <issue-type>`, `ignoreExports`, `overrides`) with a documented reason, or (3) **change policy** in `.fallowrc.json`. Full rules: `index.html#route-finding`.

**Operating rules:**
- Invoke via `pnpm exec fallow`. For parsing use `--format json --quiet 2>$null`; **exit 1 = issues found (normal)** — only exit 2 is a real error.
- `.fallowrc.json` is **tracked** and ignores tests + `scripts/` for duplication/complexity, and softens cleanup rules to `warn` (architectural rules stay `error`). The `.fallow/` cache dir is gitignored.
- Never run `fallow watch` (never exits). Never enable telemetry (off by default; only Matthew may).
- It's syntactic — for type-aware navigation/rename use the LSP/tsserver, not fallow.

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
| `AGENTS.md` | Codex implementation-agent contract, GSD workflow, startup order, handoff format |
| `CLAUDE.md` | Primary AI/operator rules and project entrypoint |
| `CONSULTANT.md` | High-level consultant instructions and keep-current rule |
| `.planning/consultant/*.md` | Consultant memory, system map, feature inventory, risk register, and backlog |
| `ops/deltas/*.md` | Consultant delta reports for meaningful changes |
| `reference/STACK.md` | Stack decisions with full rationale and research |
| `reference/SCHEMA.md` | Complete Drizzle schema, all tables, RLS policies |
| `reference/API-SPEC.md` | Every API route: method, auth, request, response, errors |
| `reference/PROMPTS.md` | All Claude system prompts and prompt templates |
| `reference/TIER-LIMITS.md` | Feature gates and limits per plan tier |
| `.env.local.example` | All required environment variables |

---

*v1.0 — PolicyPilot MVP — May 2026 — Architect/Builder method*
