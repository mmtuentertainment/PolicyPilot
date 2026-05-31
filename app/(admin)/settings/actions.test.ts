import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotAuthenticatedError } from '@/lib/auth/errors';

vi.mock('server-only', () => ({}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getOrgContextMock = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => getOrgContextMock(),
}));

const requireAdminFromCtxMock = vi.fn();
vi.mock('@/lib/auth/require-admin', () => ({
  requireAdminFromCtx: (...args: unknown[]) => requireAdminFromCtxMock(...args),
}));

const tierAndIntervalToPriceIdMock = vi.fn();
vi.mock('@/lib/stripe/catalog', () => ({
  tierAndIntervalToPriceId: (...args: unknown[]) => tierAndIntervalToPriceIdMock(...args),
}));

const sessionsCreateMock = vi.fn();
const portalSessionsCreateMock = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: sessionsCreateMock,
      },
    },
    billingPortal: {
      sessions: {
        create: portalSessionsCreateMock,
      },
    },
  }),
}));

const withOrgScopeMock = vi.fn();
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: (...args: unknown[]) => withOrgScopeMock(...args),
}));

vi.mock('@/lib/db/schema', () => ({
  organizations: {
    id: 'organizations.id',
    stripeCustomerId: 'organizations.stripeCustomerId',
    stripeSubscriptionStatus: 'organizations.stripeSubscriptionStatus',
    planTier: 'organizations.planTier',
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (left: unknown, right: unknown) => ({ left, right }),
  };
});

const adminCtx = {
  orgId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  clerkOrgId: 'org_active',
  clerkUserId: 'user_admin',
  role: 'admin',
} as const;

const activeOrg = {
  stripeCustomerId: null,
  stripeSubscriptionStatus: null,
};

const updateMock = vi.fn();
const deleteMock = vi.fn();
const insertMock = vi.fn();
let lastWhereClause: unknown;

function makeScope(row: {
  stripeCustomerId: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus: string | null;
  planTier?: string;
  stripeCurrentPeriodEnd?: Date | null;
  stripeCancelAtPeriodEnd?: boolean;
}) {
  return {
    ...adminCtx,
    tx: {
      select: () => ({
        from: () => ({
          where: (predicate: unknown) => {
            lastWhereClause = predicate;
            return {
              limit: async () => [row],
            };
          },
        }),
      }),
      update: updateMock,
      delete: deleteMock,
      insert: insertMock,
    },
  };
}

function form(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set('tier', 'growth');
  formData.set('interval', 'monthly');
  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }
  return formData;
}

async function runAction(formData = form()): Promise<unknown> {
  const mod = await import('./actions');
  return mod.createCheckoutSessionAction(undefined, formData);
}

async function runPortalAction(formData = new FormData()): Promise<unknown> {
  const mod = await import('./actions');
  return mod.createPortalSessionAction(formData);
}

describe('createCheckoutSessionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWhereClause = undefined;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
    getOrgContextMock.mockResolvedValue(adminCtx);
    requireAdminFromCtxMock.mockImplementation(() => undefined);
    tierAndIntervalToPriceIdMock.mockReturnValue('growthMonthlyPriceSentinel');
    sessionsCreateMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    portalSessionsCreateMock.mockResolvedValue({
      url: 'https://billing.stripe.test/session',
    });
    withOrgScopeMock.mockImplementation(async (_ctx, fn) => fn(makeScope(activeOrg)));
  });

  it('creates a subscription Checkout Session with server-derived org metadata and price lookup', async () => {
    await expect(runAction()).rejects.toThrow(
      'NEXT_REDIRECT:https://checkout.stripe.test/session',
    );

    expect(getOrgContextMock).toHaveBeenCalledOnce();
    expect(requireAdminFromCtxMock).toHaveBeenCalledWith(adminCtx);
    expect(tierAndIntervalToPriceIdMock).toHaveBeenCalledWith('growth', 'monthly');
    expect(sessionsCreateMock).toHaveBeenCalledWith({
      mode: 'subscription',
      line_items: [{ price: 'growthMonthlyPriceSentinel', quantity: 1 }],
      client_reference_id: adminCtx.orgId,
      metadata: { policyPilotOrgId: adminCtx.orgId },
      subscription_data: { metadata: { policyPilotOrgId: adminCtx.orgId } },
      success_url: 'https://app.example.test/settings?billing=success',
      cancel_url: 'https://app.example.test/settings?billing=canceled',
    });
  });

  it.each([
    ['starter', 'monthly', 'starterMonthlyPriceSentinel'],
    ['starter', 'annual', 'starterAnnualPriceSentinel'],
    ['growth', 'monthly', 'growthMonthlyPriceSentinel'],
    ['growth', 'annual', 'growthAnnualPriceSentinel'],
    ['business', 'monthly', 'businessMonthlyPriceSentinel'],
    ['business', 'annual', 'businessAnnualPriceSentinel'],
  ])('accepts %s %s intent and asks the server catalog for the price', async (tier, interval, priceId) => {
    tierAndIntervalToPriceIdMock.mockReturnValueOnce(priceId);

    await expect(runAction(form({ tier, interval }))).rejects.toThrow(
      'NEXT_REDIRECT:https://checkout.stripe.test/session',
    );

    expect(tierAndIntervalToPriceIdMock).toHaveBeenCalledWith(tier, interval);
    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: priceId, quantity: 1 }],
      }),
    );
  });

  it('ignores forged client billing fields and keeps the active session org as the reference', async () => {
    await expect(runAction(form({
      orgId: 'forged-org',
      customer: 'forged_customer_sentinel',
      price: 'forgedPriceSentinel',
      client_reference_id: 'forged-ref',
      metadata: '{"policyPilotOrgId":"forged"}',
    }))).rejects.toThrow('NEXT_REDIRECT:https://checkout.stripe.test/session');

    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'growthMonthlyPriceSentinel', quantity: 1 }],
        client_reference_id: adminCtx.orgId,
        metadata: { policyPilotOrgId: adminCtx.orgId },
      }),
    );
    expect(JSON.stringify(sessionsCreateMock.mock.calls[0]?.[0])).not.toContain('forged');
  });

  it('includes the stored Stripe customer when the org is already linked', async () => {
    withOrgScopeMock.mockImplementationOnce(async (_ctx, fn) => fn({
      ...adminCtx,
      tx: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                stripeCustomerId: 'existing_customer_sentinel',
                stripeSubscriptionStatus: null,
              }],
            }),
          }),
        }),
      },
    }));

    await expect(runAction()).rejects.toThrow(
      'NEXT_REDIRECT:https://checkout.stripe.test/session',
    );

    expect(sessionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'existing_customer_sentinel' }),
    );
  });

  it.each(['active', 'trialing', 'past_due'])('does not create checkout when subscription status is %s', async (status) => {
    withOrgScopeMock.mockImplementationOnce(async (_ctx, fn) => fn({
      ...adminCtx,
      tx: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                stripeCustomerId: 'existing_customer_sentinel',
                stripeSubscriptionStatus: status,
              }],
            }),
          }),
        }),
      },
    }));

    await expect(runAction()).rejects.toThrow(
      'NEXT_REDIRECT:/settings?billing=manage',
    );
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('creates checkout for a new org with the seed status (trialing) and no customer', async () => {
    // Regression: the Clerk organization.created webhook seeds new orgs with
    // stripeSubscriptionStatus 'trialing' and NO customer. That placeholder must
    // NOT be read as an existing subscription — first checkout must proceed
    // (mirrors the settings page's stripeCustomerId gate).
    withOrgScopeMock.mockImplementationOnce(async (_ctx, fn) => fn({
      ...adminCtx,
      tx: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                stripeCustomerId: null,
                stripeSubscriptionStatus: 'trialing',
              }],
            }),
          }),
        }),
      },
    }));

    await expect(runAction()).rejects.toThrow(
      'NEXT_REDIRECT:https://checkout.stripe.test/session',
    );
    expect(sessionsCreateMock).toHaveBeenCalledOnce();
  });

  it('rejects invalid tier or interval before any Stripe call', async () => {
    await expect(runAction(form({ tier: 'enterprise', interval: 'monthly' })))
      .rejects.toThrow('Invalid checkout intent.');
    await expect(runAction(form({ tier: 'growth', interval: 'weekly' })))
      .rejects.toThrow('Invalid checkout intent.');
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('fails closed when the server-side catalog has no matching price', async () => {
    tierAndIntervalToPriceIdMock.mockReturnValueOnce(undefined);

    await expect(runAction()).rejects.toThrow('Invalid checkout intent.');
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('enforces auth and admin checks before Stripe access', async () => {
    getOrgContextMock.mockRejectedValueOnce(new NotAuthenticatedError());
    await expect(runAction()).rejects.toThrow(NotAuthenticatedError);
    expect(requireAdminFromCtxMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();

    getOrgContextMock.mockResolvedValueOnce({ ...adminCtx, role: 'employee' });
    requireAdminFromCtxMock.mockImplementationOnce(() => {
      throw new ForbiddenError('admin role required');
    });
    await expect(runAction()).rejects.toThrow(ForbiddenError);
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });
});

describe('createPortalSessionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWhereClause = undefined;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test/';
    getOrgContextMock.mockResolvedValue(adminCtx);
    requireAdminFromCtxMock.mockImplementation(() => undefined);
    sessionsCreateMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    portalSessionsCreateMock.mockResolvedValue({
      url: 'https://billing.stripe.test/session',
    });
    withOrgScopeMock.mockImplementation(async (_ctx, fn) => fn(makeScope({
      stripeCustomerId: 'stored_customer_sentinel',
      stripeSubscriptionId: 'stored_subscription_sentinel',
      stripeSubscriptionStatus: 'active',
    })));
  });

  it('creates a Customer Portal Session for the stored org customer with trusted return_url', async () => {
    await expect(runPortalAction()).rejects.toThrow(
      'NEXT_REDIRECT:https://billing.stripe.test/session',
    );

    expect(getOrgContextMock).toHaveBeenCalledOnce();
    expect(requireAdminFromCtxMock).toHaveBeenCalledWith(adminCtx);
    expect(withOrgScopeMock).toHaveBeenCalledWith(adminCtx, expect.any(Function));
    expect(lastWhereClause).toEqual({
      left: 'organizations.id',
      right: adminCtx.orgId,
    });
    expect(portalSessionsCreateMock).toHaveBeenCalledWith({
      customer: 'stored_customer_sentinel',
      return_url: 'https://app.example.test/settings',
    });
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('ignores forged client portal fields and uses only server-derived billing state', async () => {
    const forged = new FormData();
    forged.set('customer', 'forged_customer_sentinel');
    forged.set('customerId', 'forged_customer_id_sentinel');
    forged.set('return_url', 'https://attacker.example/return');
    forged.set('subscription', 'forged_subscription_sentinel');
    forged.set('price', 'forged_price_sentinel');
    forged.set('metadata', '{"policyPilotOrgId":"forged"}');
    forged.set('flow_data', '{"type":"subscription_cancel"}');

    await expect(runPortalAction(forged)).rejects.toThrow(
      'NEXT_REDIRECT:https://billing.stripe.test/session',
    );

    expect(portalSessionsCreateMock).toHaveBeenCalledWith({
      customer: 'stored_customer_sentinel',
      return_url: 'https://app.example.test/settings',
    });
    expect(JSON.stringify(portalSessionsCreateMock.mock.calls[0]?.[0])).not.toContain('forged');
  });

  it('redirects to setup when no stored Stripe customer is linked', async () => {
    withOrgScopeMock.mockImplementationOnce(async (_ctx, fn) => fn(makeScope({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: 'trialing',
    })));

    await expect(runPortalAction()).rejects.toThrow(
      'NEXT_REDIRECT:/settings?billing=setup',
    );

    expect(portalSessionsCreateMock).not.toHaveBeenCalled();
    expect(sessionsCreateMock).not.toHaveBeenCalled();
  });

  it('enforces auth and admin checks before portal creation', async () => {
    getOrgContextMock.mockRejectedValueOnce(new NotAuthenticatedError());
    await expect(runPortalAction()).rejects.toThrow(NotAuthenticatedError);
    expect(requireAdminFromCtxMock).not.toHaveBeenCalled();
    expect(portalSessionsCreateMock).not.toHaveBeenCalled();

    getOrgContextMock.mockResolvedValueOnce({ ...adminCtx, role: 'employee' });
    requireAdminFromCtxMock.mockImplementationOnce(() => {
      throw new ForbiddenError('admin role required');
    });
    await expect(runPortalAction()).rejects.toThrow(ForbiddenError);
    expect(portalSessionsCreateMock).not.toHaveBeenCalled();
  });

  it('does not mutate local subscription truth or acknowledgment-adjacent tables', async () => {
    await expect(runPortalAction()).rejects.toThrow(
      'NEXT_REDIRECT:https://billing.stripe.test/session',
    );

    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(portalSessionsCreateMock).toHaveBeenCalledOnce();
  });
});
