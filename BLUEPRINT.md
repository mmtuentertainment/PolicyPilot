# BLUEPRINT.md
# PolicyPilot — System Architecture Blueprint
# Stage: FOUNDRY output → ASSEMBLY input
# Derived from: REQUIREMENTS.md | Updated: 2026-05-15

> **Frozen FOUNDRY output (2026-05-15).** Live updates: see `.planning/PROJECT.md` and `.planning/ROADMAP.md`.
> The decisions and 8-phase build sequence in this file were ingested as
> locked ADRs into `.planning/intel/decisions.md`.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────┐
│              VERCEL                      │
│  Next.js 15 App (frontend + API routes) │
│  ├── /app/(marketing)                   │
│  ├── /app/(auth)                        │
│  ├── /app/(admin)                       │
│  ├── /app/(employee)                    │
│  └── /app/api/                          │
└──────────────┬──────────────────────────┘
               │
        ┌──────┴──────┐
        │             │
   ┌────▼─────┐  ┌────▼───────────────┐
   │ SUPABASE │  │  RAILWAY WORKER    │
   │ Postgres │  │  cron + email jobs │
   │ + RLS    │  └────────────────────┘
   └────┬─────┘
        │
   ┌────▼──────────────────────────────┐
   │  EXTERNAL SERVICES                │
   │  Clerk · Stripe · Claude · Resend │
   └───────────────────────────────────┘
```

---

## 2. Repository Structure

```
policypilot/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   └── pricing/page.tsx
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (admin)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── policies/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── employees/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   ├── (employee)/
│   │   ├── layout.tsx
│   │   ├── my-policies/page.tsx
│   │   └── ask/page.tsx
│   └── api/
│       ├── webhooks/stripe/route.ts
│       ├── webhooks/clerk/route.ts
│       ├── ai/draft/route.ts
│       ├── ai/summary/route.ts
│       ├── ai/qa/route.ts
│       ├── ai/consistency/route.ts
│       └── cron/reminders/route.ts
```

```
├── components/
│   ├── ui/                    — shadcn/ui base components
│   ├── policy/
│   │   ├── PolicyEditor.tsx   — TipTap wrapper
│   │   ├── PolicyCard.tsx
│   │   ├── AIDraftPanel.tsx
│   │   └── AckButton.tsx
│   ├── dashboard/
│   │   ├── AckChart.tsx       — Recharts donut
│   │   └── PolicyStatusTable.tsx
│   └── shared/
│       └── NotificationBell.tsx
├── lib/
│   ├── db/
│   │   ├── schema.ts          — Drizzle schema (all tables)
│   │   ├── index.ts           — db + Supabase clients
│   │   └── migrations/
│   ├── ai/
│   │   ├── claude.ts          — Anthropic client + model routing
│   │   ├── prompts.ts         — prompt template functions
│   │   └── cache.ts           — prompt caching helpers
│   ├── stripe/
│   │   ├── client.ts
│   │   ├── products.ts        — TIER_LIMITS + price ID mapping
│   │   └── webhooks.ts        — event handler functions
│   └── email/
│       ├── resend.ts
│       └── templates/         — React Email components
├── middleware.ts               — Clerk auth + role routing
├── drizzle.config.ts
├── .env.local.example
├── CLAUDE.md
├── REQUIREMENTS.md
├── BLUEPRINT.md
├── STATE.md
└── reference/
    ├── STACK.md
    ├── SCHEMA.md
    ├── PROMPTS.md
    ├── TIER-LIMITS.md
    └── API-SPEC.md
```

---

## 3. Key Design Decisions

- **No separate backend service**: Next.js API routes handle all server logic.
  Railway is only for cron jobs and background tasks that exceed serverless limits.
- **Drizzle over Prisma**: No code generation step. TypeScript-first.
  Schema is the source of truth, types inferred at compile time.
- **Clerk org = Supabase org_id**: Established via Clerk webhook on org creation.
  Single source of identity. Never duplicated.
- **Summaries cached at publish**: TL;DR generated once, stored on policy record.
  Not regenerated per view. Haiku 4.5 keeps cost minimal.
- **Prompt caching on Q&A**: Policy library context cached across calls.
  Expected 60–80% cache hit rate → ~70% cost reduction on Q&A endpoint.

---

## 4. Middleware Architecture (middleware.ts)

```typescript
// Public routes (no auth required)
const publicRoutes = ['/', '/pricing', '/sign-in', '/sign-up']
const webhookRoutes = ['/api/webhooks/stripe', '/api/webhooks/clerk']

// Role routing
// /(admin)/* requires publicMetadata.role === 'admin'
// /(employee)/* requires any authenticated user
// /api/cron/* requires CRON_SECRET header match
```

---

## 5. Build Sequence (ASSEMBLY)

### Phase 1 — Foundation
1. `npx create-next-app@latest policypilot --typescript --tailwind --app`
2. Install: `@clerk/nextjs drizzle-orm drizzle-kit @supabase/supabase-js`
3. Configure Clerk middleware + env vars
4. Supabase project created, connection string in env
5. Create `.env.local` from `.env.local.example`
6. Verify: `tsc --noEmit` clean, app loads at localhost:3000

### Phase 2 — Data Layer
7. Write full Drizzle schema (`lib/db/schema.ts`) — all tables per SCHEMA.md
8. Run initial migration: `npx drizzle-kit push`
9. Apply RLS policies in Supabase SQL editor
10. Clerk webhook handler: user.created, org.created, membership.created
11. Basic CRUD functions for policies (create, read, update, archive)
12. Verify: org_id present in all queries, RLS blocks cross-org access

### Phase 3 — Admin UI
13. Admin layout shell + sidebar navigation
14. Policy library page: list, search, filter by status/category
15. Policy editor: TipTap rich text + category + review interval
16. Publish / archive flow with status state machine
17. Verify: admin can create and publish a policy end-to-end

### Phase 4 — AI Layer
18. Anthropic client setup + prompt caching (`lib/ai/`)
19. `POST /api/ai/draft` — tier check → generate → store in ai_generations
20. `POST /api/ai/summary` — check cache → generate with Haiku → store
21. `POST /api/ai/qa` — fetch published policies → cached context → answer
22. AI draft panel in policy editor UI
23. Employee Q&A page at `/(employee)/ask`
24. Verify: all three endpoints work, tier limits enforced, usage logged

### Phase 5 — Employee Portal
25. Employee layout + my-policies list (assigned + acknowledgment status)
26. Policy detail view with TL;DR card + full content + AckButton
27. AckButton: POST acknowledgment → update UI → append to audit trail
28. Notification bell + in-app notification list
29. Verify: employee cannot see unassigned or draft policies

### Phase 6 — Billing
30. Create Stripe products + prices in Dashboard; add price IDs to env
31. `lib/stripe/products.ts` — TIER_LIMITS constant + price ID mapping
32. Pricing page with Stripe Checkout Session creation
33. Webhook handler: all 5 subscription events, idempotent, stripe_events table
34. Tier gating middleware: check planTier before Growth/Business features
35. Stripe Customer Portal link in settings
36. Verify: full checkout → webhook → DB sync → tier gate cycle

### Phase 7 — Crons + Email
37. React Email templates: policy_assigned, policy_updated, review_due, ack_reminder
38. Resend client (`lib/email/resend.ts`)
39. Railway worker project: cron script for daily reminders
40. `GET /api/cron/reminders` endpoint with CRON_SECRET auth
41. Verify: reminder emails send correctly, no duplicate sends

### Phase 8 — Validation
42. Recharts donut chart: acknowledged vs pending on dashboard
43. Policy status table with acknowledgment rates
44. CSV export endpoint for acknowledgment reports
45. Run all 8 acceptance criteria from REQUIREMENTS.md with real data
46. Deploy to Vercel (frontend) + Railway (worker)
47. Smoke test production deployment

---

## 6. Explicit Non-Goals (Builder must not build)

Mobile app · LMS / training module · HR integrations · Document generation ·
Offline mode · Custom domain per org · Anything not in REQUIREMENTS.md
