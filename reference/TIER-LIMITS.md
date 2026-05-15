# reference/TIER-LIMITS.md
# Feature gates and plan limits — checked before every gated operation

---

## TypeScript Constant (lib/stripe/products.ts)

```typescript
export const TIER_LIMITS = {
  starter: {
    maxUsers: 25,
    aiDraftsMonthly: 50,
    approvalWorkflows: false,
    slackIntegration: false,
    consistencyCheck: false,
    customBranding: false,
    sso: false,
    apiAccess: false,
  },
  growth: {
    maxUsers: 100,
    aiDraftsMonthly: 200,
    approvalWorkflows: true,
    slackIntegration: true,
    consistencyCheck: true,
    customBranding: false,
    sso: false,
    apiAccess: false,
  },
  business: {
    maxUsers: 500,
    aiDraftsMonthly: -1,       // unlimited
    approvalWorkflows: true,
    slackIntegration: true,
    consistencyCheck: true,
    customBranding: true,
    sso: true,
    apiAccess: true,
  },
} as const

export type PlanTier = keyof typeof TIER_LIMITS
```

---

## Stripe Price IDs (set in .env.local)

| Plan | Interval | Price | Env var |
|------|----------|-------|---------|
| Starter | Monthly | $79 | STRIPE_PRICE_STARTER_MONTHLY |
| Starter | Annual | $759 | STRIPE_PRICE_STARTER_ANNUAL |
| Growth | Monthly | $199 | STRIPE_PRICE_GROWTH_MONTHLY |
| Growth | Annual | $1,910 | STRIPE_PRICE_GROWTH_ANNUAL |
| Business | Monthly | $449 | STRIPE_PRICE_BUSINESS_MONTHLY |
| Business | Annual | $4,310 | STRIPE_PRICE_BUSINESS_ANNUAL |

Annual = 20% discount. Create all 6 products in Stripe Dashboard before Phase 6.

---

## Gate Check Pattern

```typescript
// lib/stripe/products.ts
export async function checkTierLimit(
  orgId: string,
  feature: keyof typeof TIER_LIMITS.starter
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId)
  })
  const tier = TIER_LIMITS[org.planTier as PlanTier]
  // check ai_generations count for monthly limits
  // return { allowed, limit, current }
}
```

On failure: return 403 `{ error: 'tier_limit_exceeded', tierLimit, currentUsage, upgradeUrl: '/pricing' }`
