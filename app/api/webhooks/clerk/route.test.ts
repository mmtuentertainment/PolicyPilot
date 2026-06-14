import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type ClerkEventFixture = {
  type: string;
  data: Record<string, unknown>;
};

let eventFixture: ClerkEventFixture;
let throwOnUserInsert = false;
let deletes = 0;

function createInsert(values: Record<string, unknown>) {
  if ('id' in values && !('clerkUserId' in values)) {
    return {
      onConflictDoNothing: () => ({
        returning: async () => [{ id: values.id }],
      }),
    };
  }
  if (throwOnUserInsert) {
    throw new Error('simulated user insert failure');
  }
  return undefined;
}

function createDb() {
  return {
    insert: vi.fn((_table: unknown) => ({
      values: (values: Record<string, unknown>) => createInsert(values),
    })),
    select: vi.fn((_projection: unknown) => ({
      from: (_table: unknown) => ({
        where: (_where: unknown) => ({
          limit: async (_limit: number) => [],
        }),
      }),
    })),
    delete: vi.fn((_table: unknown) => ({
      where: (_where: unknown) => {
        deletes += 1;
        return Promise.resolve();
      },
    })),
  };
}

async function importRoute() {
  vi.resetModules();
  vi.stubEnv('CLERK_WEBHOOK_SECRET', 'configured-clerk-secret');
  vi.doMock('svix', () => ({
    Webhook: class {
      constructor(_secret: string) {}
      verify(_payload: string, _headers: Record<string, string>) {
        return eventFixture;
      }
    },
  }));
  vi.doMock('@clerk/nextjs/server', () => ({
    clerkClient: vi.fn(async () => ({
      users: {
        updateUserMetadata: vi.fn(async () => undefined),
      },
    })),
  }));
  vi.doMock('@/lib/db', () => ({ db: createDb() }));
  vi.doMock('@/lib/email/client', () => ({
    getResendClient: vi.fn(() => ({
      emails: { send: vi.fn(async () => ({ data: { id: 'email_id' } })) },
    })),
  }));
  return import('@/app/api/webhooks/clerk/route');
}

function signedRequest(): Request {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'svix-id': 'msg_test_123',
      'svix-timestamp': '1770000000',
      'svix-signature': 'v1,test',
    },
    body: '{"clerk":"payload"}',
  });
}

describe('app/api/webhooks/clerk/route', () => {
  beforeEach(() => {
    eventFixture = {
      type: 'organizationMembership.created',
      data: {
        public_user_data: { user_id: 'user_test_1234' },
        organization: { id: 'org_test_1234' },
        role: 'org:employee',
      },
    };
    throwOnUserInsert = false;
    deletes = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns 409 and clears idempotency when membership references a missing org', async () => {
    const { POST } = await importRoute();

    const response = await POST(signedRequest());

    expect(response.status).toBe(409);
    expect(await response.text()).toBe('Org not yet created');
    expect(deletes).toBeGreaterThanOrEqual(1);
  });

  it('returns 200 and clears idempotency when dispatch throws', async () => {
    eventFixture = {
      type: 'user.created',
      data: { id: 'user_test_5678' },
    };
    throwOnUserInsert = true;
    const { POST } = await importRoute();

    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Dispatch error logged');
    expect(deletes).toBeGreaterThanOrEqual(1);
  });
});
