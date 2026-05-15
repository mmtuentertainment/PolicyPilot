# reference/STACK.md
# Stack decisions with full rationale — read before changing any dependency

---

## Why Next.js 15 (not React + Node.js separately)
Next.js 15 App Router IS React + a production backend in one repo. API routes
and Server Actions replace a standalone Node/FastAPI service, eliminating a
separate deployment target at MVP. TypeScript crossed 43.6% pro dev adoption
in 2025 — default for all new SaaS. Create React App is dead.

## Why Supabase (not standalone PostgreSQL)
PostgreSQL holds 55.6% developer adoption — #1 database in 2026. Supabase
adds RLS + Auth fallback + Realtime + Storage on a free tier. $70M ARR, 4M
devs. Drizzle ORM preferred over Prisma: no code generation step,
TypeScript-first, SQL-transparent.

## Why Clerk (not Auth0)
Auth0: $0.07/MAU after 7.5K free. Clerk: $0.02/MAU after 10K free — 3.5x
cheaper. Clerk has pre-built Organization management (multi-tenant B2B), SAML
SSO, and native Next.js components. Auth working in under 10 minutes.
Auth0 only wins for Fortune 500 HIPAA — not our buyer.

## Why Stripe (not Paddle/Lemon Squeezy)
Stripe at 2.9% + 0.7% billing < Paddle at 5%+ for MRR over ~$3K/month.
Paddle's Merchant of Record is useful for global tax but overkill at MVP.
Stripe Checkout + Customer Portal handles the full subscription lifecycle.

## Why Vercel + Railway (not Vercel alone)
Vercel is purpose-built for Next.js (same team). But serverless functions have
execution time limits — not suitable for cron jobs or bulk email. Railway fills
that gap: persistent containers, no cold starts, app sleeping when idle, $5/mo.
The hybrid is the 2026 standard for Next.js SaaS.

## Why Claude Sonnet 4.6 (not Opus 4.7)
Opus 4.7 at $5/$25/M tokens is overkill for policy drafting. Sonnet 4.6 at
$3/$15 delivers needed quality. Haiku 4.5 at $1/$5 for summaries only.
With 70% prompt cache hit rate + Batch API for async tasks, effective cost
is under $300/month at 200 customers — well under 1% of revenue.

## Runner-ups considered and rejected
- FastAPI backend: adds infra complexity with no benefit at this scale
- Auth0: 3.5x MAU cost, worse DX than Clerk for B2B
- Prisma: code generation step adds friction vs Drizzle
- Paddle: higher fees, less control over checkout UX
- Neon: database only — Supabase gives more for same cost
