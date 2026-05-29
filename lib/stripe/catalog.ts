import 'server-only';
import type { PlanTier } from './products';
import { StripeCatalogConfigError } from './errors';

export type PriceInterval = 'monthly' | 'annual';

export interface CatalogEntry {
  tier: PlanTier;
  interval: PriceInterval;
  priceId: string;
}

interface CatalogSlot {
  envVar: string;
  tier: PlanTier;
  interval: PriceInterval;
}

const CATALOG_SLOTS = [
  { envVar: 'STRIPE_PRICE_STARTER_MONTHLY', tier: 'starter', interval: 'monthly' },
  { envVar: 'STRIPE_PRICE_STARTER_ANNUAL', tier: 'starter', interval: 'annual' },
  { envVar: 'STRIPE_PRICE_GROWTH_MONTHLY', tier: 'growth', interval: 'monthly' },
  { envVar: 'STRIPE_PRICE_GROWTH_ANNUAL', tier: 'growth', interval: 'annual' },
  { envVar: 'STRIPE_PRICE_BUSINESS_MONTHLY', tier: 'business', interval: 'monthly' },
  { envVar: 'STRIPE_PRICE_BUSINESS_ANNUAL', tier: 'business', interval: 'annual' },
] satisfies readonly CatalogSlot[];

export function buildCatalog(): readonly CatalogEntry[] {
  const catalog: CatalogEntry[] = [];
  const seenByPriceId = new Map<string, string>();

  for (const slot of CATALOG_SLOTS) {
    const priceId = process.env[slot.envVar]?.trim();
    if (!priceId) {
      throw new StripeCatalogConfigError(`required env var ${slot.envVar} is not configured`);
    }

    const priorEnvVar = seenByPriceId.get(priceId);
    if (priorEnvVar) {
      throw new StripeCatalogConfigError(
        `duplicate price configuration for ${slot.envVar}; conflicts with ${priorEnvVar}`,
      );
    }

    seenByPriceId.set(priceId, slot.envVar);
    catalog.push({
      tier: slot.tier,
      interval: slot.interval,
      priceId,
    });
  }

  return Object.freeze(catalog);
}

export const PRICE_CATALOG: readonly CatalogEntry[] = buildCatalog();

export function priceIdToTier(priceId: string): PlanTier | undefined {
  return PRICE_CATALOG.find((entry) => entry.priceId === priceId)?.tier;
}

export function tierAndIntervalToPriceId(
  tier: PlanTier,
  interval: PriceInterval,
): string | undefined {
  return PRICE_CATALOG.find((entry) => entry.tier === tier && entry.interval === interval)
    ?.priceId;
}
