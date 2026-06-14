# PolicyPilot — CLAUDE.md
# AI-Powered Policy & Procedure Management SaaS
# Operator: Matthew (MMTU Entertainment LLC) | Stack: Next.js 15 · Supabase · Clerk · Stripe · Claude API

<!-- Reference-grade prose was moved to reference/*.md on 2026-06-14 (context-diet) for token hygiene; load-bearing invariants stay inline here. Restore detail from reference/MIGRATIONS.md · reference/FALLOW.md · reference/STRIPE.md · reference/VALIDATION-GATE.md, or `git show` pre-c90dd44 CLAUDE.md. -->

---

## Project Structure

`app/` (Next.js 15 App Router: `(marketing)`/`(auth)`/`(admin)`/`(employee)` route groups + `api/` handlers) · `components/` · `lib/` (db/ai/stripe/email clients) · `reference/` (frozen contracts + moved detail) · `.planning/` (live planning + `consultant/`) · `ops/deltas/` (consultant deltas) · `docs/` (policies, designs, runbooks). Full annotated tree → `BLUEPRINT.md`.

---

## How to Use (Any Model)

> **GSD overlay active.** Live planning is in `.planning/`. The *frozen* files
> below are the FOUNDRY-stage source; consult them for original rationale but
> author all updates in `.planning/`.

1. **Architecture (live)** → `.planning/PROJECT.md` · *frozen*: `BLUEPRINT.md`
2. **Business rules / domain (live)** → `.planning/REQUIREMENTS.md` · *frozen*: `REQUIREMENTS.md`
3. **Active roadmap** → `.planning/ROADMAP.md`
4. **Session memory / live phase state** → `.planning/STATE.md`
5. **Consultant operating layer** → `CONSULTANT.md` + `.planning/consultant/*.md`
6. **Consultant deltas** → `ops/deltas/*.md`
7. **Frozen contracts** → `reference/STACK.md` · `SCHEMA.md` · `PROMPTS.md` · `TIER-LIMITS.md` · `API-SPEC.md`
8. **Moved detail** → `reference/MIGRATIONS.md` · `FALLOW.md` · `STRIPE.md` · `VALIDATION-GATE.md`

---

## Consultant Overlay (high-level)

Operate as a high-level product, technical, and operating consultant on the PolicyPilot build. The consultant layer is advisory and execution-oriented: challenge scope, preserve launch focus, surface tradeoffs, and recommend the smallest reversible change that improves revenue readiness, time-to-value, tenant trust, or audit integrity.

Role split:

- **Matthew** — operator, product owner, approval authority.
- **ChatGPT** — consultant/research/risk-review/implementation-router/GSD-guide and prompt/handoff review layer.
- **Claude Code** — long-horizon repo exploration, broad-audit, GSD research/planning, security/risk review, branch/state diagnosis, multi-file-consistency, and ambiguous-investigation agent. Read-mostly by default; hands exact patches, tests, PR updates, or verification instructions to Codex unless Matthew explicitly asks otherwise.
- **Codex** — scoped implementation executor for exact patches, tests, verification gates, PR/delta updates, and small reversible fixes; its contract is `AGENTS.md`.
- **Anthropic Claude API** — the product AI layer. Claude Code and Codex are implementation agents, not product AI APIs.

GSD operating chain:

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

Before meaningful advice or implementation, read `AGENTS.md`, `CONSULTANT.md`, and the consultant set `.planning/consultant/{working_context,system_map,feature_inventory,risk_register,backlog}.md` after the core GSD files above.

**Keep-current rule:** no meaningful project change is complete until the consultant file set is reviewed and either updated or explicitly marked `no-change` in `ops/deltas/<date>-<slug>.md`.

**Live phase + session state → `.planning/STATE.md`** (authoritative; the dated inline narrative that used to live here was removed — it duplicated STATE.md and went stale). **Standing guardrails, every phase:** never weaken the CI/`verify:phase-N` gate, never add dummy or real secrets in code or config, never use live Stripe mode, and do not start next-phase planning or execution without Matthew's explicit authorization.

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

Phase **order** locked by ADR-007. Phase **gating** by ADR-029 (2026-05-21): phase boundaries must stay green on `main`, but in-flight phases may run on parallel branches off a common `main` ancestor. Full phase table + true `Depends on` chain → `.planning/ROADMAP.md` § Phase Details. (Waves: 4‖5, then 6‖7, then 8.)

**End of each phase:** `tsc --noEmit` AND `verify:phase-N` both exit 0 → squash to `main` → `git pull --ff-only` locally → report to Matthew. `main` must be green between every phase squash.

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

**Branching:**
1. Per-phase feature branch — all phase work (planning artifacts AND implementation code) lives on `gsd/phase-N-<slug>`. Do NOT commit `.planning/phases/**` files directly to `main`.
2. One PR per phase, squash-merged to `main` with `--delete-branch` (single ship commit per phase).
3. Cross-cutting / meta changes (CLAUDE.md, infra) ride along on the active phase branch when small, or get their own short-lived branch.

**Local git config (set once per clone):**
```bash
git config --local fetch.prune true   # auto-prune deleted remote branches on every fetch
git config --local pull.ff only        # refuse silent merge commits on divergent main
```

**Post-PR-merge checklist:**
1. `git checkout main && git pull --ff-only` — fast-forward to the new squash commit. **If FF fails, local main has divergent commits — STOP and investigate** (usually a prior session committed to main directly; resolve via `git reset --hard origin/main` after confirming the divergent commits are already in the squash).
2. `git log -1 main` — verify the squash commit landed.
3. For any in-flight feature branch, `git rebase main` from the feature branch when convenient.

<!-- Conventions learned from PR #2 cleanup, 2026-05-19. Full incident in gsd/phase-3-admin-ui commit log + this CLAUDE.md change. -->

---

## Codebase Intelligence (fallow)

Ask `fallow` for structural truth (dead code, dupes, circular deps, complexity, boundary violations) instead of grepping-and-inferring — `pnpm exec fallow <cmd>` (deterministic, syntactic, sub-second; **exit 1 = issues found = normal**, only exit 2 is a real error). Full command table + operating rules → `reference/FALLOW.md`; operator-local wiki → `.wiki/fallow/`. Use `Grep` (not fallow) for literal text/regex. Never run `fallow watch`; never enable telemetry.

---

## Database Migration Discipline

Migrations are **immutable + forward-only** (`drizzle/meta/_journal.json` is the source of truth). **Destructive migrations (DROP COLUMN/TABLE, NOT NULL on an existing column) are ASK-FIRST** — operator approval + a migration-header documenting rationale, approval timestamp, and decision ID. **Pre-deploy gate:** `pnpm db:migrate:<env>` → `pnpm db:verify:<env>` exits 0 → only then deploy code (else the first request to the new schema 503s). Full procedure, audit-log template, and verifier map → `reference/MIGRATIONS.md`; deploy runbook → `docs/runbooks/deploy-migrations.md`.

---

## AI API Rules

- Sonnet 4.6 → draft generation, employee Q&A, consistency check
- Haiku 4.5 → TL;DR summaries only
- Batch API → consistency check (async, 50% cost reduction)
- Q&A system prompt must constrain to published policies only and cite source
- Full prompt templates → `reference/PROMPTS.md`

---

## Stripe Rules

Handle **all** subscription events (not just `checkout.session.completed` — also `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`). All handlers **idempotent**; **store processed event IDs**; verify webhook signatures with the raw body (`request.text()`); never trust client-side for subscription state. Per-event handling detail → `reference/STRIPE.md`.

---

## Validation Gate

ASSEMBLY is complete when the 8 acceptance checks pass (policy-from-draft in <5 min, per-user ack tracking, append-only ack audit trail, cited Q&A, CSV export, renewal survives first cycle, tier gating → 403 + upgrade prompt, cross-org isolation). Full checklist → `reference/VALIDATION-GATE.md`.

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
| `CONSULTANT.md` | High-level consultant instructions and keep-current rule |
| `.planning/consultant/*.md` | Consultant memory, system map, feature inventory, risk register, backlog |
| `ops/deltas/*.md` | Consultant delta reports for meaningful changes |
| `reference/*.md` | Frozen contracts (STACK/SCHEMA/API-SPEC/PROMPTS/TIER-LIMITS) + moved detail (MIGRATIONS/FALLOW/STRIPE/VALIDATION-GATE) |
| `.env.local.example` | All required environment variables |

<!-- v1.0 — PolicyPilot MVP — May 2026 — Architect/Builder method -->
