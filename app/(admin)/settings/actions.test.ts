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
vi.mock('@/lib/stripe/client', () => ({
  getStripeClient: () => ({
    checkout: {
      sessions: {
        create: sessionsCreateMock,
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

describe('createCheckoutSessionAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
    getOrgContextMock.mockResolvedValue(adminCtx);
    requireAdminFromCtxMock.mockImplementation(() => undefined);
    tierAndIntervalToPriceIdMock.mockReturnValue('growthMonthlyPriceSentinel');
    sessionsCreateMock.mockResolvedValue({
      url: 'https://checkout.stripe.test/session',
    });
    withOrgScopeMock.mockImplementation(async (_ctx, fn) => fn({
      ...adminCtx,
      tx: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [activeOrg],
            }),
          }),
        }),
      },
    }));
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
