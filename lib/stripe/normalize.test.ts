import type Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const PRICE_ENV = {
  STRIPE_PRICE_STARTER_MONTHLY: 'starter_monthly_sentinel',
  STRIPE_PRICE_STARTER_ANNUAL: 'starter_annual_sentinel',
  STRIPE_PRICE_GROWTH_MONTHLY: 'growth_monthly_sentinel',
  STRIPE_PRICE_GROWTH_ANNUAL: 'growth_annual_sentinel',
  STRIPE_PRICE_BUSINESS_MONTHLY: 'business_monthly_sentinel',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'business_annual_sentinel',
} as const;

const CUSTOMER_ID = ['cus', 'normalize_customer_sentinel'].join('_');
const SUBSCRIPTION_ID = ['sub', 'normalize_subscription_sentinel'].join('_');
const ITEM_ID = ['si', 'normalize_item_sentinel'].join('_');
const EVENT_CREATED = 1_778_440_400;
const CURRENT_PERIOD_END = 1_781_119_200;
const ORG_ID = '00000000-0000-4000-8000-000000000602';

async function importNormalizer() {
  vi.resetModules();
  stubCompleteCatalogEnv();
  return import('@/lib/stripe/normalize');
}

function stubCompleteCatalogEnv(): void {
  for (const [name, value] of Object.entries(PRICE_ENV)) {
    vi.stubEnv(name, value);
  }
}

function subscriptionFixture(
  overrides: {
    status?: Stripe.Subscription.Status;
    priceId?: string;
    recurring?: Stripe.Price.Recurring | null;
    itemCount?: 0 | 1 | 2;
    cancelAtPeriodEnd?: boolean;
    customer?: string | null;
    metadataOrgId?: string | null;
  } = {},
): Stripe.Subscription {
  const item = {
    id: ITEM_ID,
    object: 'subscription_item',
    current_period_end: CURRENT_PERIOD_END,
    price: {
      id: overrides.priceId ?? PRICE_ENV.STRIPE_PRICE_GROWTH_MONTHLY,
      object: 'price',
      recurring: overrides.recurring === undefined
        ? { interval: 'month', interval_count: 1 }
        : overrides.recurring,
    },
  };

  const itemCount = overrides.itemCount ?? 1;
  const data = itemCount === 0
    ? []
    : itemCount === 1
      ? [item]
      : [item, { ...item, id: ['si', 'second_item_sentinel'].join('_') }];

  return {
    id: SUBSCRIPTION_ID,
    object: 'subscription',
    customer: overrides.customer === undefined ? CUSTOMER_ID : overrides.customer,
    status: overrides.status ?? 'active',
    cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
    metadata: overrides.metadataOrgId === null
      ? {}
      : { policyPilotOrgId: overrides.metadataOrgId ?? ORG_ID },
    items: {
      object: 'list',
      data,
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as unknown as Stripe.Subscription;
}

describe('lib/stripe/normalize', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('maps active recurring subscriptions to the configured tier', async () => {
    const { normalizeSubscription } = await importNormalizer();

    const result = normalizeSubscription(subscriptionFixture(), EVENT_CREATED);

    expect(result).toMatchObject({
      kind: 'entitled',
      planTier: 'growth',
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripeSubscriptionStatus: 'active',
      stripePriceId: PRICE_ENV.STRIPE_PRICE_GROWTH_MONTHLY,
      stripeSubscriptionItemId: ITEM_ID,
      stripeCancelAtPeriodEnd: false,
      metadataOrgId: ORG_ID,
    });
    expect(result?.stripeCurrentPeriodEnd?.toISOString()).toBe('2026-06-10T19:20:00.000Z');
    expect(result?.stripeLastEventCreated.toISOString()).toBe('2026-05-10T19:13:20.000Z');
  });

  it('keeps cancel_at_period_end subscriptions entitled until Stripe changes status', async () => {
    const { normalizeSubscription } = await importNormalizer();

    const result = normalizeSubscription(
      subscriptionFixture({ status: 'trialing', cancelAtPeriodEnd: true }),
      EVENT_CREATED,
    );

    expect(result).toMatchObject({
      kind: 'entitled',
      planTier: 'growth',
      stripeSubscriptionStatus: 'trialing',
      stripeCancelAtPeriodEnd: true,
    });
  });

  it('marks past_due as preserve-tier instead of downgrading', async () => {
    const { normalizeSubscription } = await importNormalizer();

    const result = normalizeSubscription(
      subscriptionFixture({ status: 'past_due' }),
      EVENT_CREATED,
    );

    expect(result).toMatchObject({
      kind: 'preserve-tier',
      stripeSubscriptionStatus: 'past_due',
    });
    expect(result).not.toHaveProperty('planTier');
  });

  it.each(['unpaid', 'canceled', 'incomplete_expired', 'paused'] as const)(
    'downgrades terminal status %s to starter',
    async (status) => {
      const { normalizeSubscription } = await importNormalizer();

      const result = normalizeSubscription(subscriptionFixture({ status }), EVENT_CREATED);

      expect(result).toMatchObject({
        kind: 'downgrade',
        planTier: 'starter',
        stripeSubscriptionStatus: status,
      });
    },
  );

  it('links incomplete subscriptions without granting a paid tier', async () => {
    const { normalizeSubscription } = await importNormalizer();

    const result = normalizeSubscription(
      subscriptionFixture({ status: 'incomplete' }),
      EVENT_CREATED,
    );

    expect(result).toMatchObject({
      kind: 'link-only',
      stripeSubscriptionStatus: 'incomplete',
    });
    expect(result).not.toHaveProperty('planTier');
  });

  it('fails closed for unknown prices and malformed subscription items', async () => {
    const { normalizeSubscription } = await importNormalizer();

    expect(
      normalizeSubscription(subscriptionFixture({ priceId: 'unmapped_price_sentinel' }), EVENT_CREATED),
    ).toBeNull();
    expect(normalizeSubscription(subscriptionFixture({ itemCount: 0 }), EVENT_CREATED)).toBeNull();
    expect(normalizeSubscription(subscriptionFixture({ itemCount: 2 }), EVENT_CREATED)).toBeNull();
    expect(
      normalizeSubscription(subscriptionFixture({ recurring: null }), EVENT_CREATED),
    ).toBeNull();
    expect(
      normalizeSubscription(subscriptionFixture({ customer: null }), EVENT_CREATED),
    ).toBeNull();
  });
});
