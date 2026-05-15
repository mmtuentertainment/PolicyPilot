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

Follow phases in order. Do not start Phase N+1 until Phase N compiles clean.

```
Phase 1: Foundation       — Next.js init, Clerk, Supabase, env vars
Phase 2: Data Layer       — Drizzle schema, RLS, Clerk webhooks, basic CRUD
Phase 3: Admin UI         — Layout, policy library, TipTap editor, publish flow
Phase 4: AI Layer         — Draft, summary, employee Q&A
Phase 5: Employee Portal  — My-policies, acknowledgment flow, notifications
Phase 6: Billing          — Stripe products, checkout, webhooks, tier gating
Phase 7: Crons + Email    — Railway worker, Resend templates, reminders
Phase 8: Validation       — Dashboard charts, CSV export, acceptance tests
```

End of each phase: run `tsc --noEmit` → fix all errors → report to Matthew.

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
