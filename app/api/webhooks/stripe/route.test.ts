import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const PRICE_ENV = {
  STRIPE_PRICE_STARTER_MONTHLY: 'starter_monthly_sentinel',
  STRIPE_PRICE_STARTER_ANNUAL: 'starter_annual_sentinel',
  STRIPE_PRICE_GROWTH_MONTHLY: 'growth_monthly_sentinel',
  STRIPE_PRICE_GROWTH_ANNUAL: 'growth_annual_sentinel',
  STRIPE_PRICE_BUSINESS_MONTHLY: 'business_monthly_sentinel',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'business_annual_sentinel',
} as const;

const ORG_ID = '00000000-0000-4000-8000-000000000602';
const EVENT_CREATED = 1_778_440_400;
const CURRENT_PERIOD_END = 1_781_119_200;

function customerId(): string {
  return ['cus', 'route_customer_sentinel'].join('_');
}

function subscriptionId(): string {
  return ['sub', 'route_subscription_sentinel'].join('_');
}

function itemId(): string {
  return ['si', 'route_item_sentinel'].join('_');
}

interface OrgRow {
  id: string;
  planTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface MutationRecord {
  orgId: string;
  values: Record<string, unknown>;
}

interface FakeDbState {
  orgRows: OrgRow[];
  processedEventIds: Set<string>;
  mutations: MutationRecord[];
  updateShouldFail: boolean;
}

class FakeTx {
  private stagedEventIds = new Set<string>();

  constructor(private readonly state: FakeDbState) {}

  insert(_table: unknown) {
    return {
      values: (values: { id: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (this.state.processedEventIds.has(values.id)) {
              return [];
            }

            this.stagedEventIds.add(values.id);
            return [{ id: values.id }];
          },
        }),
      }),
    };
  }

  update(_table: unknown) {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (_where: unknown) => ({
          returning: async () => {
            if (this.state.updateShouldFail) {
              throw new Error('db write failed');
            }

            const org = this.state.orgRows[0];
            if (!org) {
              return [];
            }

            this.state.mutations.push({ orgId: org.id, values });
            return [{ id: org.id }];
          },
        }),
      }),
    };
  }

  commit(): void {
    for (const eventId of this.stagedEventIds) {
      this.state.processedEventIds.add(eventId);
    }
  }
}

function createFakeDb(state: FakeDbState) {
  return {
    select: (_projection: unknown) => ({
      from: (_table: unknown) => ({
        where: (_where: unknown) => ({
          limit: async (_limit: number) => state.orgRows,
        }),
      }),
    }),
    transaction: async (callback: (tx: FakeTx) => Promise<unknown>) => {
      const tx = new FakeTx(state);
      const result = await callback(tx);
      tx.commit();
      return result;
    },
  };
}

function createStripeClient() {
  return {
    webhooks: {
      constructEvent: vi.fn(
        (_payload: string, _signature: string, _secret: string): Stripe.Event => eventFixture(),
      ),
    },
    subscriptions: {
      retrieve: vi.fn(async (_id: string): Promise<Stripe.Subscription> => subscriptionFixture()),
    },
  };
}

let dbState: FakeDbState;
let stripeClient: ReturnType<typeof createStripeClient>;

function stubCatalogEnv(): void {
  for (const [name, value] of Object.entries(PRICE_ENV)) {
    vi.stubEnv(name, value);
  }
}

async function importRoute() {
  vi.resetModules();
  stubCatalogEnv();
  vi.stubEnv('STRIPE_SECRET_KEY', 'configured_stripe_client_value');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'configured_endpoint_value');
  vi.doMock('@/lib/db', () => ({
    db: createFakeDb(dbState),
  }));
  vi.doMock('@/lib/stripe/client', () => ({
    getStripeClient: () => stripeClient,
  }));
  return import('@/app/api/webhooks/stripe/route');
}

function eventId(suffix: string): string {
  return ['event', suffix].join('_');
}

function eventFixture(
  type = 'checkout.session.completed',
  object: Stripe.Event.Data.Object = checkoutSessionFixture(),
  suffix = 'default',
): Stripe.Event {
  return {
    id: eventId(suffix),
    object: 'event',
    api_version: '2026-05-29.preview',
    created: EVENT_CREATED,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  } as unknown as Stripe.Event;
}

function checkoutSessionFixture(): Stripe.Checkout.Session {
  return {
    id: ['checkout', 'session_sentinel'].join('_'),
    object: 'checkout.session',
    customer: customerId(),
    subscription: subscriptionId(),
    client_reference_id: ORG_ID,
    metadata: { policyPilotOrgId: ORG_ID },
  } as unknown as Stripe.Checkout.Session;
}

function invoiceFixture(type: 'paid' | 'failed'): Stripe.Invoice {
  return {
    id: ['invoice', type, 'sentinel'].join('_'),
    object: 'invoice',
    customer: customerId(),
    metadata: {},
    parent: {
      type: 'subscription_details',
      quote_details: null,
      subscription_details: {
        subscription: subscriptionId(),
        metadata: { policyPilotOrgId: ORG_ID },
      },
    },
  } as unknown as Stripe.Invoice;
}

function subscriptionFixture(
  overrides: {
    status?: Stripe.Subscription.Status;
    priceId?: string;
    customer?: string;
    orgId?: string;
  } = {},
): Stripe.Subscription {
  return {
    id: subscriptionId(),
    object: 'subscription',
    customer: overrides.customer ?? customerId(),
    status: overrides.status ?? 'active',
    cancel_at_period_end: false,
    metadata: { policyPilotOrgId: overrides.orgId ?? ORG_ID },
    items: {
      object: 'list',
      data: [
        {
          id: itemId(),
          object: 'subscription_item',
          current_period_end: CURRENT_PERIOD_END,
          price: {
            id: overrides.priceId ?? PRICE_ENV.STRIPE_PRICE_GROWTH_MONTHLY,
            object: 'price',
            recurring: { interval: 'month', interval_count: 1 },
          },
        },
      ],
      has_more: false,
      url: '/v1/subscription_items',
    },
  } as unknown as Stripe.Subscription;
}

async function postSigned(rawBody = '{"stripe":"payload"}', signature: string | null = 'signed') {
  const { POST } = await importRoute();
  const headers = new Headers();
  if (signature) {
    headers.set('stripe-signature', signature);
  }

  return await POST(new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: rawBody,
  }));
}

function resetState(): void {
  dbState = {
    orgRows: [{
      id: ORG_ID,
      planTier: 'starter',
      stripeCustomerId: customerId(),
      stripeSubscriptionId: subscriptionId(),
    }],
    processedEventIds: new Set<string>(),
    mutations: [],
    updateShouldFail: false,
  };
  stripeClient = createStripeClient();
}

describe('app/api/webhooks/stripe/route', () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns 200 after a valid signed checkout event and canonical subscription sync', async () => {
    const event = eventFixture('checkout.session.completed', checkoutSessionFixture(), 'valid_success');
    stripeClient.webhooks.constructEvent.mockReturnValue(event);
    stripeClient.subscriptions.retrieve.mockResolvedValue(subscriptionFixture());

    const response = await postSigned();

    expect(response.status).toBe(200);
    expect(stripeClient.subscriptions.retrieve).toHaveBeenCalledWith(subscriptionId());
    expect(dbState.processedEventIds.has(event.id)).toBe(true);
    expect(dbState.mutations).toHaveLength(1);
    expect(dbState.mutations[0]?.values).toMatchObject({
      planTier: 'growth',
      stripeCustomerId: customerId(),
      stripeSubscriptionId: subscriptionId(),
      stripeSubscriptionStatus: 'active',
      stripePriceId: PRICE_ENV.STRIPE_PRICE_GROWTH_MONTHLY,
    });
  });

  it('fails closed when the webhook secret is missing', async () => {
    const { POST } = await importRoute();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');

    const response = await POST(new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'signed' },
      body: '{"stripe":"payload"}',
    }));

    expect(response.status).toBe(500);
    expect(stripeClient.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(dbState.mutations).toHaveLength(0);
  });

  it('rejects a missing signature before verifying or writing', async () => {
    const response = await postSigned('{"stripe":"payload"}', null);

    expect(response.status).toBe(400);
    expect(stripeClient.webhooks.constructEvent).not.toHaveBeenCalled();
    expect(dbState.mutations).toHaveLength(0);
  });

  it('rejects an invalid signature before writing', async () => {
    stripeClient.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('signature failed');
    });

    const response = await postSigned();

    expect(response.status).toBe(400);
    expect(dbState.mutations).toHaveLength(0);
  });

  it('returns 200 without a DB write for a valid unhandled event', async () => {
    stripeClient.webhooks.constructEvent.mockReturnValue(
      eventFixture('product.created', { id: ['product', 'sentinel'].join('_') } as unknown as Stripe.Event.Data.Object),
    );

    const response = await postSigned();

    expect(response.status).toBe(200);
    expect(stripeClient.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(dbState.processedEventIds.size).toBe(0);
    expect(dbState.mutations).toHaveLength(0);
  });

  it('does not reapply side effects for duplicate event ids', async () => {
    const event = eventFixture('checkout.session.completed', checkoutSessionFixture(), 'duplicate');
    dbState.processedEventIds.add(event.id);
    stripeClient.webhooks.constructEvent.mockReturnValue(event);

    const response = await postSigned();

    expect(response.status).toBe(200);
    expect(dbState.mutations).toHaveLength(0);
  });

  it('does not mark processed when canonical subscription retrieval fails', async () => {
    const event = eventFixture('invoice.paid', invoiceFixture('paid'), 'retrieve_failure');
    stripeClient.webhooks.constructEvent.mockReturnValue(event);
    stripeClient.subscriptions.retrieve.mockRejectedValue(new Error('temporary stripe failure'));

    const response = await postSigned();

    expect(response.status).toBe(500);
    expect(dbState.processedEventIds.has(event.id)).toBe(false);
    expect(dbState.mutations).toHaveLength(0);
  });

  it('does not mark processed when the DB transaction fails', async () => {
    const event = eventFixture('customer.subscription.updated', subscriptionFixture(), 'db_failure');
    dbState.updateShouldFail = true;
    stripeClient.webhooks.constructEvent.mockReturnValue(event);
    stripeClient.subscriptions.retrieve.mockResolvedValue(subscriptionFixture());

    const response = await postSigned();

    expect(response.status).toBe(500);
    expect(dbState.processedEventIds.has(event.id)).toBe(false);
    expect(dbState.mutations).toHaveLength(0);
  });

  it('uses canonical Stripe state instead of stale event payloads', async () => {
    const staleInvoice = invoiceFixture('paid');
    const event = eventFixture('invoice.paid', staleInvoice, 'out_of_order');
    stripeClient.webhooks.constructEvent.mockReturnValue(event);
    stripeClient.subscriptions.retrieve.mockResolvedValue(
      subscriptionFixture({ status: 'canceled', priceId: PRICE_ENV.STRIPE_PRICE_BUSINESS_MONTHLY }),
    );

    const response = await postSigned();

    expect(response.status).toBe(200);
    expect(dbState.mutations[0]?.values).toMatchObject({
      planTier: 'starter',
      stripeSubscriptionStatus: 'canceled',
      stripePriceId: PRICE_ENV.STRIPE_PRICE_BUSINESS_MONTHLY,
    });
  });

  it('passes the original raw body string into signature verification', async () => {
    const event = eventFixture('customer.subscription.deleted', subscriptionFixture(), 'raw_body');
    const rawBody = '{"data":{"object":{"metadata":{"policyPilotOrgId":"mutated-would-fail"}}}}';
    stripeClient.webhooks.constructEvent.mockImplementation((payload: string) => {
      expect(payload).toBe(rawBody);
      return event;
    });

    const response = await postSigned(rawBody);

    expect(response.status).toBe(200);
    expect(stripeClient.webhooks.constructEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps customer and subscription identifiers masked in logs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbState.orgRows = [];
    const event = eventFixture('checkout.session.completed', checkoutSessionFixture(), 'masked_logs');
    stripeClient.webhooks.constructEvent.mockReturnValue(event);

    const response = await postSigned();

    expect(response.status).toBe(200);
    const serializedLogs = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(serializedLogs).not.toContain(customerId());
    expect(serializedLogs).not.toContain(subscriptionId());
    expect(serializedLogs).toContain('cus_***inel');
    expect(serializedLogs).toContain('sub_***inel');
  });

  it('marks payment failures past_due without changing planTier', async () => {
    const event = eventFixture('invoice.payment_failed', invoiceFixture('failed'), 'payment_failed');
    stripeClient.webhooks.constructEvent.mockReturnValue(event);

    const response = await postSigned();

    expect(response.status).toBe(200);
    expect(dbState.mutations[0]?.values).toEqual({
      stripeSubscriptionStatus: 'past_due',
      stripeLastEventCreated: new Date(EVENT_CREATED * 1000),
    });
  });
});
