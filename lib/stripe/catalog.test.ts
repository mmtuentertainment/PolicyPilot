import { afterEach, describe, expect, it, vi } from 'vitest';

const PRICE_ENV = {
  STRIPE_PRICE_STARTER_MONTHLY: 'starter_monthly_sentinel',
  STRIPE_PRICE_STARTER_ANNUAL: 'starter_annual_sentinel',
  STRIPE_PRICE_GROWTH_MONTHLY: 'growth_monthly_sentinel',
  STRIPE_PRICE_GROWTH_ANNUAL: 'growth_annual_sentinel',
  STRIPE_PRICE_BUSINESS_MONTHLY: 'business_monthly_sentinel',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'business_annual_sentinel',
} as const;

async function importCatalog() {
  vi.resetModules();
  return import('@/lib/stripe/catalog');
}

function stubCompleteCatalogEnv(
  overrides: Partial<Record<keyof typeof PRICE_ENV, string | undefined>> = {},
): void {
  for (const [name, value] of Object.entries({ ...PRICE_ENV, ...overrides })) {
    if (value === undefined) {
      vi.unstubAllEnvs();
      for (const [resetName, resetValue] of Object.entries({ ...PRICE_ENV, ...overrides })) {
        if (resetName !== name && resetValue !== undefined) {
          vi.stubEnv(resetName, resetValue);
        }
      }
      continue;
    }
    vi.stubEnv(name, value);
  }
}

describe('lib/stripe/catalog', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('round-trips all six configured tier and interval pairs', async () => {
    stubCompleteCatalogEnv();
    const { priceIdToTier, tierAndIntervalToPriceId } = await importCatalog();

    const pairs = [
      ['starter', 'monthly', PRICE_ENV.STRIPE_PRICE_STARTER_MONTHLY],
      ['starter', 'annual', PRICE_ENV.STRIPE_PRICE_STARTER_ANNUAL],
      ['growth', 'monthly', PRICE_ENV.STRIPE_PRICE_GROWTH_MONTHLY],
      ['growth', 'annual', PRICE_ENV.STRIPE_PRICE_GROWTH_ANNUAL],
      ['business', 'monthly', PRICE_ENV.STRIPE_PRICE_BUSINESS_MONTHLY],
      ['business', 'annual', PRICE_ENV.STRIPE_PRICE_BUSINESS_ANNUAL],
    ] as const;

    for (const [tier, interval, expectedPriceId] of pairs) {
      expect(tierAndIntervalToPriceId(tier, interval)).toBe(expectedPriceId);
      expect(priceIdToTier(expectedPriceId)).toBe(tier);
    }
  });

  it('returns undefined for an unknown price ID', async () => {
    stubCompleteCatalogEnv();
    const { priceIdToTier } = await importCatalog();

    expect(priceIdToTier('unmapped-catalog-sentinel')).toBeUndefined();
  });

  it('fails closed on a missing price env var without leaking configured values', async () => {
    stubCompleteCatalogEnv({ STRIPE_PRICE_GROWTH_MONTHLY: undefined });

    await expect(importCatalog()).rejects.toMatchObject({
      name: 'StripeCatalogConfigError',
      message: expect.stringContaining('STRIPE_PRICE_GROWTH_MONTHLY'),
    });
    await expect(importCatalog()).rejects.not.toThrow(PRICE_ENV.STRIPE_PRICE_STARTER_MONTHLY);
  });

  it('fails closed on duplicate price IDs without leaking the duplicate value', async () => {
    const duplicateValue = 'duplicated_catalog_sentinel';
    stubCompleteCatalogEnv({
      STRIPE_PRICE_STARTER_MONTHLY: duplicateValue,
      STRIPE_PRICE_GROWTH_MONTHLY: duplicateValue,
    });

    await expect(importCatalog()).rejects.toMatchObject({
      name: 'StripeCatalogConfigError',
      message: expect.stringContaining('STRIPE_PRICE_GROWTH_MONTHLY'),
    });
    await expect(importCatalog()).rejects.not.toThrow(duplicateValue);
  });
});
