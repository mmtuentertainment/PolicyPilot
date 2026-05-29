import { afterEach, describe, expect, it, vi } from 'vitest';

const stripeInstances: Array<{ key: string; options: Record<string, unknown> | undefined }> = [];

vi.mock('stripe', () => {
  return {
    default: class StripeMock {
      constructor(key: string, options?: Record<string, unknown>) {
        stripeInstances.push({ key, options });
      }
    },
  };
});

async function importClient() {
  vi.resetModules();
  stripeInstances.length = 0;
  return import('@/lib/stripe/client');
}

describe('lib/stripe/client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    stripeInstances.length = 0;
  });

  it('throws a typed config error when the secret key is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const { getStripeClient } = await importClient();

    expect(() => getStripeClient()).toThrowError(
      expect.objectContaining({
        name: 'StripeConfigError',
        message: expect.stringContaining('STRIPE_SECRET_KEY'),
      }),
    );
  });

  it('creates one cached client without pinning apiVersion', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'configured_test_key_sentinel');
    const { getStripeClient } = await importClient();

    const first = getStripeClient();
    const second = getStripeClient();

    expect(first).toBe(second);
    expect(stripeInstances).toHaveLength(1);
    expect(stripeInstances[0]?.options?.apiVersion).toBeUndefined();
  });
});
