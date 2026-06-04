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

// LAZY SINGLETON — Cause-B-class build-coupling fix (companion to the lib/db
// lazy-init fix in PR #37, now merged to main; lib/db/index.ts is lazy too).
//
// `buildCatalog()` reads the six STRIPE_PRICE_* env vars and throws
// StripeCatalogConfigError when any is missing or duplicated (fail-closed).
// Calling it at module top level made *importing* this module a throwing side
// effect. Next 15's `next build` evaluates every route module during the
// "Collecting page data" phase, and the Stripe webhook route pulls this module
// in transitively (app/api/webhooks/stripe/route.ts -> lib/stripe/normalize.ts
// -> here), so the import-time throw detonates the build whenever the price ids
// are absent from the build environment — exactly the case in the Vercel
// Production scope (it holds none of the six). `export const dynamic =
// 'force-dynamic'` on the route does NOT exempt evaluation: Next still loads the
// module to read the directive, so only removing the import-time side effect is
// durable.
//
// Defer the build to first ACCESS: importing is now side-effect-free, while the
// fail-closed throw still fires on the first RUNTIME use (a checkout Server
// Action or a webhook normalize call) — where the vars ARE configured. The cache
// holds only on success, so a misconfigured environment is not memoized.
let cachedCatalog: readonly CatalogEntry[] | undefined;

export function getPriceCatalog(): readonly CatalogEntry[] {
  return (cachedCatalog ??= buildCatalog());
}

export function priceIdToTier(priceId: string): PlanTier | undefined {
  return getPriceCatalog().find((entry) => entry.priceId === priceId)?.tier;
}

export function tierAndIntervalToPriceId(
  tier: PlanTier,
  interval: PriceInterval,
): string | undefined {
  return getPriceCatalog().find((entry) => entry.tier === tier && entry.interval === interval)
    ?.priceId;
}
