# Context (DOC Intel)

Running notes extracted from DOC-type sources. Appended with source attribution. Lowest precedence (4) — informational; superseded by ADRs, SPECs, and PRDs on any contradiction.

---

## Topic: Project identity and operator

- source: `CLAUDE.md` header

PolicyPilot is the AI-Powered Policy & Procedure Management SaaS. Operator: Matthew (MMTU Entertainment LLC). Stack tag line: Next.js 15 · Supabase · Clerk · Stripe · Claude API.

---

## Topic: Document navigation map

- source: `CLAUDE.md` § How to Use (Any Model)

The "How to Use" section maps each subject to a canonical reference document:

1. Architecture → `BLUEPRINT.md`
2. Business rules / domain → `REQUIREMENTS.md`
3. Stack decisions + rationale → `reference/STACK.md`
4. DB schema → `reference/SCHEMA.md`
5. AI prompts → `reference/PROMPTS.md`
6. Tier limits + feature gates → `reference/TIER-LIMITS.md`
7. API route specs → `reference/API-SPEC.md`

This is the routing table downstream agents (and humans) use to find authoritative answers.

---

## Topic: Project structure overview

- source: `CLAUDE.md` § Project Structure

The intended top-level repo shape (informational; canonical version is BLUEPRINT.md § 2):

```
policypilot/
├── app/                — Next.js 15 App Router (frontend + API routes)
│   ├── (marketing)/    — Public landing + pricing
│   ├── (auth)/         — Clerk auth flows
│   ├── (admin)/        — Admin dashboard, policy library, reports
│   ├── (employee)/     — Employee portal, acknowledgments, Q&A
│   └── api/            — Route handlers (webhooks, AI, cron)
├── components/         — UI components (policy/, dashboard/, shared/)
├── lib/                — Clients and utilities (db/, ai/, stripe/, email/)
├── reference/          — STACK.md, SCHEMA.md, PROMPTS.md, TIER-LIMITS.md, API-SPEC.md
└── docs/               — Policies, designs, runbooks
```

Note: CLAUDE.md mentions a `docs/` folder for "Policies, designs, runbooks" — BLUEPRINT.md does not enumerate `docs/` in its layout but does include planning files at the repo root and the `reference/` subfolder. Both views are compatible (`docs/` is implied work-product, not a build artifact).

---

## Topic: ALWAYS / ASK FIRST / NEVER operating rules

- source: `CLAUDE.md` § Always / Ask First / Never

### ALWAYS

1. `tsc --noEmit` passes before every commit — zero type errors, no exceptions.
2. Include `org_id` in every DB query.
3. Verify Stripe webhook signatures with raw body (`request.text()`).
4. Use prompt caching on all repeated Claude API system prompts.
5. Store every Claude API call in `ai_generations`.
6. Check tier limits before every Claude API call (full spec: `reference/TIER-LIMITS.md`).

### ASK FIRST

1. Any package not in the stack list.
2. Any architecture decision not in `BLUEPRINT.md`.
3. Any DB schema change after Phase 2 is complete.
4. Any security-relevant decision (auth, data access, webhooks).
5. TypeScript errors that require changing the data model.

### NEVER

1. Roll custom auth — Clerk handles everything.
2. Call Claude API client-side — API routes and Server Actions only.
3. Trust client-side for subscription state — always read from DB.
4. Use `any` TypeScript type.
5. Delete or modify acknowledgment records — audit trail is append-only.
6. Build features not in `REQUIREMENTS.md` (see Non-Goals).

These rules are operational guardrails for any AI/human collaborator working in this codebase. They are restatements of decisions formalized in ADR and SPEC intel.

---

## Topic: Validation Gate restatement

- source: `CLAUDE.md` § Validation Gate

Ship checklist (restates REQUIREMENTS.md § 10):

- Admin creates policy from Claude draft in under 5 minutes from account creation.
- Admin assigns policy; per-user acknowledgment status tracked correctly.
- Employee acknowledgment persists in audit trail with timestamp.
- Employee Q&A returns cited answer from policy library only.
- Admin exports acknowledgment report to CSV.
- Stripe subscription survives first billing cycle renewal.
- Tier gating: Starter blocked from Growth features with 403 + upgrade prompt.
- Multi-tenancy: Org A cannot access Org B data under any code path.

Canonical version: `REQUIREMENTS.md` § 10 (see REQ-acceptance-criteria).

---

## Topic: Session continuity status

- source: `STATE.md` § Current Status

Phase: PRE-BUILD — FOUNDRY complete, ASSEMBLY not started.
Next action: open Claude Code, read `CLAUDE.md`, begin Phase 1.

Updated: 2026-05-15.

---

## Topic: FOUNDRY artifact completion checklist

- source: `STATE.md` § Completed

- [x] REFINERY — `REQUIREMENTS.md` written
- [x] FOUNDRY — `BLUEPRINT.md` written
- [x] `CLAUDE.md` (tight 170-line version)
- [x] reference/ files written (STACK, SCHEMA, PROMPTS, TIER-LIMITS, API-SPEC)
- [x] `STATE.md` initialized
- [x] `.env.local.example` written
- [x] Project folder created: `C:/Users/matth/Desktop/PolicyPilot`

---

## Topic: Decisions log (operator's running record)

- source: `STATE.md` § Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-15 | Next.js 15 over React+Node.js | Eliminates separate backend at MVP |
| 2026-05-15 | Clerk over Auth0 | 3.5× cheaper MAU, B2B orgs built-in |
| 2026-05-15 | Supabase over standalone PG | DB + RLS + free tier in one |
| 2026-05-15 | Drizzle over Prisma | No codegen, TypeScript-first |
| 2026-05-15 | Sonnet 4.6 primary, Haiku 4.5 summaries | Cost/quality balance |

These mirror the rationale in `reference/STACK.md` and are formalized in ADR-010 through ADR-015.

---

## Topic: Parking lot

- source: `STATE.md` § Blocked / Parking Lot

- DocTract pricing — verify before launch (may be closest real competitor).
- SAM.gov registration — post milestone 2 ($10K MRR).
- Slack integration — v1.1, not MVP.

These are deliberately out of MVP scope (see REQ-integrations and REQ-non-goals for the canonical scope boundary).

---

## Topic: AI API rules (operating notes)

- source: `CLAUDE.md` § AI API Rules

- Sonnet 4.6 → draft generation, employee Q&A, consistency check.
- Haiku 4.5 → TL;DR summaries only.
- Batch API → consistency check (async, 50% cost reduction).
- Q&A system prompt must constrain to published policies only and cite source.
- Full prompt templates → `reference/PROMPTS.md`.

Restates ADR-015, ADR-021, REQ-ai-usage-rules, and SPEC-prompts-qa.

---

## Topic: Stripe rules (operating notes)

- source: `CLAUDE.md` § Stripe Rules

Handle all five subscription events (not just checkout), all handlers idempotent, store processed Stripe event IDs in `stripe_events`. Restates ADR-020 and SPEC-api-stripe-webhook.

---

## Topic: Stack non-negotiables (operating notes)

- source: `CLAUDE.md` § Stack

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

"Do not introduce unlisted packages without asking Matthew first."

Restates ADR-010 through ADR-016.

---

## Topic: Key files index

- source: `CLAUDE.md` § Key Files

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
