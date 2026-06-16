import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type ClerkUserFixture = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

type ReportFixture = {
  clerkUserId: string;
  policyId: string;
};

async function importWithClerkUsers(users: ClerkUserFixture[]) {
  const getUserList = vi.fn(async ({ userId }: { userId: string[]; limit: number }) => ({
    data: users.filter((user) => userId.includes(user.id)),
    totalCount: users.length,
  }));
  vi.resetModules();
  vi.doMock('@clerk/nextjs/server', () => ({
    clerkClient: vi.fn(async () => ({
      users: { getUserList },
    })),
  }));
  const mod = await import('@/lib/reports/enrich');
  return { enrichWithClerkIdentity: mod.enrichWithClerkIdentity, getUserList };
}

function row(clerkUserId: string): ReportFixture {
  return { clerkUserId, policyId: `policy-${clerkUserId}` };
}

describe('enrichWithClerkIdentity', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('fetches distinct result-set ids once and enriches rows with name and email', async () => {
    const { enrichWithClerkIdentity, getUserList } = await importWithClerkUsers([
      {
        id: 'user_1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        primaryEmailAddress: { emailAddress: 'ada@example.com' },
      },
      {
        id: 'user_2',
        username: 'grace',
        primaryEmailAddress: { emailAddress: 'grace@example.com' },
      },
    ]);

    const result = await enrichWithClerkIdentity([row('user_1'), row('user_2'), row('user_1')]);

    expect(getUserList).toHaveBeenCalledOnce();
    expect(getUserList).toHaveBeenCalledWith({ userId: ['user_1', 'user_2'], limit: 100 });
    expect(result).toEqual([
      { ...row('user_1'), name: 'Ada Lovelace', email: 'ada@example.com' },
      { ...row('user_2'), name: 'grace', email: 'grace@example.com' },
      { ...row('user_1'), name: 'Ada Lovelace', email: 'ada@example.com' },
    ]);
  });

  it('chunks more than 100 distinct ids', async () => {
    const users = Array.from({ length: 150 }, (_, index) => ({
      id: `user_${index}`,
      firstName: `User${index}`,
      primaryEmailAddress: { emailAddress: `user${index}@example.com` },
    }));
    const { enrichWithClerkIdentity, getUserList } = await importWithClerkUsers(users);

    await enrichWithClerkIdentity(users.map((user) => row(user.id)));

    expect(getUserList).toHaveBeenCalledTimes(2);
    expect(getUserList.mock.calls[0]?.[0].userId).toHaveLength(100);
    expect(getUserList.mock.calls[1]?.[0].userId).toHaveLength(50);
  });

  it('keeps rows with empty identity fallback when Clerk omits a user', async () => {
    const { enrichWithClerkIdentity } = await importWithClerkUsers([]);

    const result = await enrichWithClerkIdentity([row('missing_user')]);

    expect(result).toEqual([{ ...row('missing_user'), name: '', email: '' }]);
  });

  it('returns empty rows without calling Clerk', async () => {
    const { enrichWithClerkIdentity, getUserList } = await importWithClerkUsers([]);

    await expect(enrichWithClerkIdentity([])).resolves.toEqual([]);
    expect(getUserList).not.toHaveBeenCalled();
  });

  it('passes only result-set clerk user ids to Clerk', async () => {
    const { enrichWithClerkIdentity, getUserList } = await importWithClerkUsers([
      { id: 'user_a' },
      { id: 'user_b' },
      { id: 'outside_user' },
    ]);

    await enrichWithClerkIdentity([row('user_a'), row('user_b')]);

    expect(getUserList).toHaveBeenCalledWith({ userId: ['user_a', 'user_b'], limit: 100 });
  });
});
