import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

function createDb(orgs: Array<{ id: string; name: string }> = []) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(async () => orgs),
    })),
  };
}

async function importRoute(orgs: Array<{ id: string; name: string }> = []) {
  vi.resetModules();
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.doMock('@/lib/db', () => ({ db: createDb(orgs) }));
  vi.doMock('@/lib/db/scoped', () => ({
    withOrgScope: vi.fn(async (_ctx, fn) =>
      fn({
        orgId: '00000000-0000-4000-8000-000000000701',
        userId: '',
        clerkOrgId: '',
        clerkUserId: '',
        role: 'admin',
        tx: {},
      }),
    ),
  }));
  vi.doMock('@/lib/email/recipients', () => ({
    resolveRecipientEmail: vi.fn(async () => 'person@example.test'),
  }));
  vi.doMock('@/lib/email/send', () => ({
    sendNotificationEmail: vi.fn(async () => 'email_id'),
  }));
  return import('@/app/api/cron/reminders/route');
}

describe('app/api/cron/reminders/route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns 401 when Authorization is missing', async () => {
    const { GET } = await importRoute();

    const response = await GET(new Request('http://localhost/api/cron/reminders'));

    expect(response.status).toBe(401);
  });

  it('returns 401 when Bearer token is incorrect', async () => {
    const { GET } = await importRoute();

    const response = await GET(new Request('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer wrong' },
    }));

    expect(response.status).toBe(401);
  });

  it('returns committed counts when Bearer token is correct', async () => {
    const { GET } = await importRoute();

    const response = await GET(new Request('http://localhost/api/cron/reminders', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    const body = await response.json() as {
      reviewReminders: number;
      ackReminders: number;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({ reviewReminders: 0, ackReminders: 0 });
  });
});
