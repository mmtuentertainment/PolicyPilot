# reference/API-SPEC.md
# Every API route — method, auth, request, response, errors

---

## POST /api/ai/draft
Auth: Clerk session, admin role required
Body: `{ prompt: string, policyType?: string }`
Process:
  1. Verify admin role from Clerk session
  2. Check ai_generations count vs TIER_LIMITS.aiDraftsMonthly
  3. Build system prompt from PROMPTS.md draft template
  4. Call claude-sonnet-4-6 with prompt caching on system prompt
  5. Store result in ai_generations table
  6. Return draft
Response: `{ draftContent: string, tokensUsed: number }`
Errors:
  403 — not admin
  429 — `{ tierLimit: number, currentUsage: number, upgradeUrl: string }`

---

## POST /api/ai/summary
Auth: Clerk session, admin role
Body: `{ policyId: string }`
Process:
  1. Fetch policy, verify org_id match
  2. Check if tldrSummary exists on current version → return if cached
  3. Call claude-haiku-4-5 with summary prompt
  4. Update policy.tldrSummary in DB
  5. Return summary
Response: `{ summary: string }`

---

## POST /api/ai/qa
Auth: Clerk session, any authenticated user
Body: `{ question: string }`
Process:
  1. Fetch all published policies for org (scoped by org_id)
  2. Build Q&A prompt with policy library (use prompt caching)
  3. Call claude-sonnet-4-6
  4. Log to ai_generations (type: 'qa')
  5. Return answer + citations
Response: `{ answer: string, citations: { title: string, id: string }[] }`
# Citation shape widened in Phase 4 ship (SPEC.md R4 + CONTEXT D-27) — { title, id } enables
# client-side rendering of "Cited: Policy Name" links without a second DB lookup. Old string[]
# shape is removed (no parallel endpoint version). Application layer strips hallucinated IDs
# (those not in the requesting org's published-policy set) before returning to client.

---

## POST /api/ai/consistency
Auth: Clerk session, admin role, Growth+ tier required
Body: `{ }` (uses org's full published policy library)
Process:
  1. Verify Growth+ tier
  2. Fetch all published policies for org
  3. Submit to Claude Batch API (async)
  4. Return batch job ID
  5. Client polls /api/ai/consistency/[batchId] for result
Response: `{ batchId: string }`

---

## POST /api/webhooks/stripe
Auth: Stripe-Signature header, raw body required
Events handled:
  checkout.session.completed → upsert subscription record, set planTier
  invoice.paid              → extend subscription, clear payment_failed flag
  invoice.payment_failed    → set stripeSubscriptionStatus = 'past_due'
  customer.subscription.deleted → set status = 'canceled', downgrade tier
  customer.subscription.updated → sync planTier from price ID
All events: check stripe_events table first (idempotency)
Response: 200 on success, 400 on signature failure

---

## POST /api/webhooks/clerk
Auth: svix webhook verification headers
Events handled:
  user.created              → INSERT into users table
  organization.created      → INSERT into organizations table
  organizationMembership.created → sync role to user record
Response: 200 always (Clerk retries on non-200)

---

## GET /api/cron/reminders
Auth: Authorization: Bearer {CRON_SECRET} header
Schedule: Called by Railway cron daily at 08:00 UTC
Process:
  1. Find policies where next_review_date <= now + 14 days
  2. Find policy_assignments with no acknowledgment older than 7 days
  3. Send emails via Resend for each
  4. INSERT notification records
  5. Return counts
Response: `{ reviewReminders: number, ackReminders: number }`

---

## GET /api/reports/acknowledgments
Auth: Clerk session, admin role
Query params: `policyId?`, `departmentId?`, `format=json|csv`
Process: Join acknowledgments + users + policies scoped by org_id
Response: JSON array or CSV download attachment
