// lib/stripe/products.test.ts — Plan 04-03 Wave-0 RED stub.
// SP-4: TIER_LIMITS + checkTierLimit + requireTierLimit 429/403 routing (D-14 + D-15 + D-16).
// SUT module `lib/stripe/products.ts` does NOT exist yet — Plan 04-06 creates it.
import { describe, expect, it, vi } from 'vitest';

describe('lib/stripe/products — TIER_LIMITS + checkTierLimit + requireTierLimit (D-14 + D-15 + D-16)', () => {
  it('TIER_LIMITS.starter matches reference/TIER-LIMITS.md verbatim', async () => {
    // Plan 04-06 creates lib/stripe/products.ts.
    expect.fail('TODO: Plan 04-06 — assert TIER_LIMITS.starter.maxUsers === 25, aiDraftsMonthly === 50, etc.');
  });

  it('checkTierLimit("aiDraftsMonthly") returns { allowed: false, limit: 50, current: 50 } on 50 prior draft rows in current UTC month', async () => {
    expect.fail('TODO: Plan 04-06 — exhausted-tier branch');
  });

  it('checkTierLimit on null planTier defaults to starter (Phase 6 not yet shipped)', async () => {
    expect.fail('TODO: Plan 04-06 — null planTier ⇒ starter behavior');
  });

  it('requireTierLimit throws TierLimitExceededError with statusCode 429 for aiDraftsMonthly overage (SP-4)', async () => {
    expect.fail('TODO: Plan 04-06 — usageBound feature ⇒ 429');
  });

  it('requireTierLimit throws TierLimitExceededError with statusCode 403 + requiredTier:"growth" for consistencyCheck on Starter (SP-4)', async () => {
    expect.fail('TODO: Plan 04-06 — tier-bound feature ⇒ 403 + requiredTier');
  });

  it('TierLimitExceededError.code === "TIER_LIMIT_EXCEEDED" (D-16)', async () => {
    expect.fail('TODO: Plan 04-06 — error class shape');
  });
});
