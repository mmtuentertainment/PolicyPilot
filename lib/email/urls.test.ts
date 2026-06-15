import { afterEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeUrl, appBaseUrl, reviewUrl } from './urls';

vi.mock('server-only', () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('appBaseUrl', () => {
  it('uses the explicit app URL without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test/');
    vi.stubEnv('VERCEL_URL', '');

    expect(appBaseUrl()).toBe('https://app.example.test');
    expect(acknowledgeUrl('policy_1')).toBe('https://app.example.test/my-policies/policy_1');
    expect(reviewUrl('policy_1')).toBe('https://app.example.test/policies/policy_1');
  });

  it('uses VERCEL_URL with an https protocol when no explicit app URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', 'policypilot.example.vercel.app/');

    expect(appBaseUrl()).toBe('https://policypilot.example.vercel.app');
  });

  it('keeps the local fallback outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NODE_ENV', 'test');

    expect(appBaseUrl()).toBe('http://localhost:3000');
  });

  it('fails closed in production when no base URL is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => appBaseUrl()).toThrow(
      'NEXT_PUBLIC_APP_URL or VERCEL_URL must be set in production.',
    );
  });
});
