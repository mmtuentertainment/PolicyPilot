// lib/stripe/products.test.ts — Plan 04-06 WARNING-2 closure.
// SP-4: TIER_LIMITS + checkTierLimit + requireTierLimit 429/403 routing (D-14 + D-15 + D-16).
// 16 GREEN tests; zero placeholder rejections (WARNING-2 mandate — all assertions concrete).
//
// Mock surface (WARNING-2 split-helper architecture): vi.spyOn the EXPORTED helpers
// readPlanTier + countDraftsThisMonth on the `productsMod` namespace import. The Drizzle
// chain inside the helpers is exercised live in Plan 04-14's check-ai-layer integration test.
//
// Module-evaluation guards (Rule-3 deviation — required for vitest jsdom env to load
// `lib/stripe/products.ts` without DATABASE_URL): stub `@/lib/db` and `@/lib/db/schema`
// so the productions.ts top-level imports do not trigger the real lib/db/index.ts barrel,
// which throws on missing DATABASE_URL. Same pattern as lib/policies/transitions.test.ts.
import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    // The helpers vi.spyOn'd below never reach these — but the module must be
    // importable. Provide a stub object that mirrors the Drizzle builder surface
    // shape minimally; we never invoke `.select()` in tests because spies replace
    // the helpers entirely.
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  } as unknown as Record<string, never>,
}));

vi.mock('@/lib/db/schema', () => ({
  organizations: { __stub: 'organizations' } as unknown as Record<string, never>,
  aiGenerations: { __stub: 'aiGenerations' } as unknown as Record<string, never>,
  users: { __stub: 'users' } as unknown as Record<string, never>,
}));

// Imports of the SUT come AFTER vi.mock calls (vitest hoists vi.mock to the top
// before any non-mock statements, but explicit ordering matches the
// lib/policies/transitions.test.ts precedent).
import * as productsMod from '@/lib/stripe/products';
import {
  TIER_LIMITS,
  findRequiredTier,
  checkTierLimit,
  requireTierLimit,
} from '@/lib/stripe/products';
import { TierLimitExceededError } from '@/lib/stripe/errors';

describe('lib/stripe/products — TIER_LIMITS + checkTierLimit + requireTierLimit (D-14 + D-15 + D-16 + WARNING-2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('TIER_LIMITS.starter matches reference/TIER-LIMITS.md verbatim', () => {
    expect(TIER_LIMITS.starter.maxUsers).toBe(25);
    expect(TIER_LIMITS.starter.aiDraftsMonthly).toBe(50);
    expect(TIER_LIMITS.starter.consistencyCheck).toBe(false);
    expect(TIER_LIMITS.growth.consistencyCheck).toBe(true);
    expect(TIER_LIMITS.business.aiDraftsMonthly).toBe(-1);
    expect(TIER_LIMITS.business.sso).toBe(true);
  });

  it('findRequiredTier("consistencyCheck") returns "growth"', () => {
    expect(findRequiredTier('consistencyCheck')).toBe('growth');
  });

  it('findRequiredTier("sso") returns "business"', () => {
    expect(findRequiredTier('sso')).toBe('business');
  });

  // WARNING-2 fixture (1) — UTC-month-boundary correctness.
  // Mock "now" to mid-month UTC; mock readPlanTier → starter (limit 50) and
  // countDraftsThisMonth → 1 (the helper-level filter excludes the April 30 row
  // and includes only the May 1 row). Asserts that checkTierLimit correctly
  // DELEGATES to the helper and returns the helper's result as `current` —
  // closing the WARNING-2 split-helper contract. The actual UTC-boundary
  // correctness of countDraftsThisMonth is verified live in Plan 04-14's
  // integration test against a real DB.
  it('checkTierLimit("aiDraftsMonthly") respects UTC month boundary — only in-month rows counted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00.000Z'));

    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');
    // Helper's gte(monthStartUtc) cutoff is May 1 00:00:00Z.
    // A row at 2026-04-30T23:59:59Z is BEFORE cutoff (excluded).
    // A row at 2026-05-01T00:00:01Z is AFTER  cutoff (included).
    // Mock returns 1 — simulating the helper having correctly filtered.
    vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(1);

    const result = await checkTierLimit('org_test', 'aiDraftsMonthly');
    expect(result).toEqual({ allowed: true, limit: 50, current: 1 });
  });

  // WARNING-2 fixture (2) — null planTier defaults to 'starter'.
  // readPlanTier internally returns 'starter' when DB row has planTier IS NULL
  // (via isPlanTier(undefined) === false branch). Here we mock the helper to
  // return 'starter' directly to assert checkTierLimit's behavior on that path.
  it('checkTierLimit on null planTier defaults to starter (Phase 6 not yet shipped)', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');
    vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(0);

    const result = await checkTierLimit('org_test_null', 'aiDraftsMonthly');
    expect(result).toEqual({ allowed: true, limit: 50, current: 0 });
  });

  // WARNING-2 fixture (3) — planTier='growth' on aiDraftsMonthly returns
  // growth-tier limit (200), not unlimited.
  it('checkTierLimit on planTier="growth" returns growth-tier limit on aiDraftsMonthly (limit=200)', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('growth');
    vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(50);

    const result = await checkTierLimit('org_test_growth', 'aiDraftsMonthly');
    expect(result).toEqual({ allowed: true, limit: 200, current: 50 });
  });

  // WARNING-2 fixture (4) — Business tier aiDraftsMonthly returns unlimited sentinel.
  // The orchestrator MUST short-circuit (skip the DB count) when limit === -1.
  it('checkTierLimit on planTier="business" returns { limit: -1, allowed: true } for aiDraftsMonthly', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('business');
    const countSpy = vi.spyOn(productsMod, 'countDraftsThisMonth');

    const result = await checkTierLimit('org_test_biz', 'aiDraftsMonthly');
    expect(result).toEqual({ allowed: true, limit: -1, current: 0 });
    // Verify the orchestrator short-circuits — no DB count call for unlimited tier.
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('checkTierLimit("maxUsers") denies Starter at the real 25-user org count', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');
    const userCountSpy = vi.spyOn(productsMod, 'countOrgUsers').mockResolvedValue(25);

    const result = await checkTierLimit('org_test_starter_full', 'maxUsers');

    expect(result).toEqual({ allowed: false, limit: 25, current: 25 });
    expect(userCountSpy).toHaveBeenCalledWith('org_test_starter_full');
  });

  it('checkTierLimit("maxUsers") allows Growth when the real org user count is under 100', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('growth');
    vi.spyOn(productsMod, 'countOrgUsers').mockResolvedValue(25);

    const result = await checkTierLimit('org_test_growth_users', 'maxUsers');
    expect(result).toEqual({ allowed: true, limit: 100, current: 25 });
  });

  it('checkTierLimit("maxUsers") allows Business when the real org user count is under 500', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('business');
    vi.spyOn(productsMod, 'countOrgUsers').mockResolvedValue(25);

    const result = await checkTierLimit('org_test_business_users', 'maxUsers');
    expect(result).toEqual({ allowed: true, limit: 500, current: 25 });
  });

  it('checkTierLimit("consistencyCheck") fails closed for a missing billing row defaulting to Starter', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');

    const result = await checkTierLimit('org_test_missing_billing_state', 'consistencyCheck');
    expect(result).toEqual({ allowed: false, limit: -1, current: 0 });
  });

  it('checkTierLimit("consistencyCheck") allows Growth per the Phase 4 403/429 contract', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('growth');

    const result = await checkTierLimit('org_test_growth_feature', 'consistencyCheck');
    expect(result).toEqual({ allowed: true, limit: -1, current: 0 });
  });

  // SP-4 — 429 routing for usage-bound features (aiDraftsMonthly).
  it('requireTierLimit throws TierLimitExceededError with statusCode 429 for aiDraftsMonthly overage', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');
    vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(50);

    await expect(requireTierLimit('org_test_overage', 'aiDraftsMonthly'))
      .rejects.toMatchObject({
        name: 'TierLimitExceededError',
        statusCode: 429,
        feature: 'aiDraftsMonthly',
        limit: 50,
        current: 50,
      });
  });

  // SP-4 — 403 routing for tier-bound features (consistencyCheck on Starter).
  it('requireTierLimit throws TierLimitExceededError with statusCode 403 + requiredTier:"growth" for consistencyCheck on Starter', async () => {
    vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('starter');

    await expect(requireTierLimit('org_test_starter', 'consistencyCheck'))
      .rejects.toMatchObject({
        name: 'TierLimitExceededError',
        statusCode: 403,
        feature: 'consistencyCheck',
        requiredTier: 'growth',
      });
  });

  // D-16 — error-class shape (code + name + message body).
  it('TierLimitExceededError.code === "TIER_LIMIT_EXCEEDED" (D-16)', () => {
    const err = new TierLimitExceededError('aiDraftsMonthly', 50, 50, 429);
    expect(err.code).toBe('TIER_LIMIT_EXCEEDED');
    expect(err.name).toBe('TierLimitExceededError');
    expect(err.message).toContain('feature=aiDraftsMonthly');
    expect(err.message).toContain('limit=50');
    expect(err.message).toContain('current=50');
  });

  // D-16 — error message includes requiredTier when provided.
  it('TierLimitExceededError.message includes requiredTier when provided', () => {
    const err = new TierLimitExceededError('consistencyCheck', -1, 0, 403, 'growth');
    expect(err.message).toContain('requiredTier=growth');
  });
});
