import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProvisioningTarget } from './provision-dev-org-lib';
import { deriveProvisioningTarget, membershipUserId } from './provision-dev-org-lib';
import {
  fetchMembershipsForProvisioning,
  formatProvisioningFailure,
  main,
  upsertProvisionedRows,
} from './provision-dev-org';

function membership(userId: string): { role: string; user: { id: string } } {
  return { role: 'org:employee', user: { id: userId } };
}

function expectAbsentUserThrow(memberships: unknown[], requestedUserId: string): void {
  expect(() =>
    deriveProvisioningTarget({
      requestedOrgId: 'org_live_1234',
      requestedUserId,
      organization: { id: 'org_live_1234', name: 'Acme Policies', slug: 'acme' },
      memberships,
    }),
  ).toThrow(/did not include requested user/);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('provision-dev-org membership pagination', () => {
  it('fetches additional pages until the requested user is found', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      membership(`user_page1_${String(index).padStart(3, '0')}`),
    );
    const secondPage = [membership('user_target_1234')];
    const requestedPaths: string[] = [];

    const memberships = await fetchMembershipsForProvisioning({
      organizationId: 'org_live_1234',
      requestedUserId: 'user_target_1234',
      get: async (path) => {
        requestedPaths.push(path);
        return requestedPaths.length === 1
          ? { data: firstPage, total_count: 101 }
          : { data: secondPage, total_count: 101 };
      },
    });

    expect(requestedPaths).toEqual([
      '/organizations/org_live_1234/memberships?limit=100&offset=0',
      '/organizations/org_live_1234/memberships?limit=100&offset=100',
    ]);
    expect(memberships).toHaveLength(101);
    expect(memberships.at(-1)).toEqual(membership('user_target_1234'));
  });

  it('fetches only one small page when --user is omitted', async () => {
    const requestedPaths: string[] = [];

    const memberships = await fetchMembershipsForProvisioning({
      organizationId: 'org_live_1234',
      get: async (path) => {
        requestedPaths.push(path);
        return { data: [membership('user_only_1234')], total_count: 1 };
      },
    });

    expect(requestedPaths).toEqual(['/organizations/org_live_1234/memberships?limit=2&offset=0']);
    expect(memberships).toEqual([membership('user_only_1234')]);
  });

  it('stops on totalCount exhaustion when the requested user is absent', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      membership(`user_page1_${String(index).padStart(3, '0')}`),
    );
    const secondPage = Array.from({ length: 100 }, (_, index) =>
      membership(`user_page2_${String(index).padStart(3, '0')}`),
    );
    const requestedPaths: string[] = [];

    const memberships = await fetchMembershipsForProvisioning({
      organizationId: 'org_live_1234',
      requestedUserId: 'user_absent_1234',
      get: async (path) => {
        requestedPaths.push(path);
        return requestedPaths.length === 1
          ? { data: firstPage, total_count: 200 }
          : { data: secondPage, total_count: 200 };
      },
    });

    expect(requestedPaths).toEqual([
      '/organizations/org_live_1234/memberships?limit=100&offset=0',
      '/organizations/org_live_1234/memberships?limit=100&offset=100',
    ]);
    expect(memberships).toHaveLength(200);
    expect(memberships.some((item) => membershipUserId(item) === 'user_absent_1234')).toBe(
      false,
    );
    expectAbsentUserThrow(memberships, 'user_absent_1234');
  });

  it('stops on a short page when the requested user is absent', async () => {
    const requestedPaths: string[] = [];

    const memberships = await fetchMembershipsForProvisioning({
      organizationId: 'org_live_1234',
      requestedUserId: 'user_absent_5678',
      get: async (path) => {
        requestedPaths.push(path);
        return { data: [membership('user_only_1234')], total_count: null };
      },
    });

    expect(requestedPaths).toEqual(['/organizations/org_live_1234/memberships?limit=100&offset=0']);
    expect(memberships).toEqual([membership('user_only_1234')]);
    expectAbsentUserThrow(memberships, 'user_absent_5678');
  });

  it('throws after the membership page backstop is exceeded', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) =>
      membership(`user_loop_${String(index).padStart(3, '0')}`),
    );
    const requestedPaths: string[] = [];

    await expect(
      fetchMembershipsForProvisioning({
        organizationId: 'org_live_1234',
        requestedUserId: 'user_absent_loop',
        get: async (path) => {
          requestedPaths.push(path);
          return { data: fullPage, total_count: null };
        },
      }),
    ).rejects.toThrow(/exceeded 50 pages/);

    expect(requestedPaths).toHaveLength(50);
  });
});

describe('provision-dev-org safety guards', () => {
  it('refuses NODE_ENV=production before any Clerk fetch or DB call', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(main(['--org', 'org_live_1234', '--apply'])).rejects.toThrow(
      'Refusing to run with NODE_ENV=production',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses --apply against a Supabase pooler host without local/test intent', async () => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv(
      'DATABASE_URL',
      'postgres://postgres.project_ref:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres',
    );
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_1234');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(main(['--org', 'org_live_1234', '--apply'])).rejects.toThrow(
      /Refusing --apply against Supabase pooler host/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scrubs DSN details from top-level failure messages', () => {
    const detail = formatProvisioningFailure(
      new Error(
        'connect failed for postgres://postgres.project_ref:secret@aws-1-us-east-1.pooler.supabase.com:6543/postgres password "secret" user "postgres.project_ref"',
      ),
    );

    expect(detail).toContain('Error: connect failed for postgres://[redacted]');
    expect(detail).toContain('password "[redacted]"');
    expect(detail).toContain('user "[redacted]"');
    expect(detail).not.toContain('secret');
    expect(detail).not.toContain('project_ref');
    expect(detail).not.toContain('supabase.com');
  });

  it('keeps organization and user upserts inside one rollbackable transaction', async () => {
    type ProvisionSql = Parameters<typeof upsertProvisionedRows>[0];
    type TxQuery = <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;

    const pendingWrites: string[] = [];
    const committedWrites: string[] = [];
    const tx: TxQuery = async <T>(strings: TemplateStringsArray): Promise<T> => {
      const query = strings.join(' ');
      if (query.includes('INSERT INTO organizations')) {
        pendingWrites.push('organizations');
        return [{ id: 'org_internal_1234' }] as T;
      }
      if (query.includes('INSERT INTO users')) {
        pendingWrites.push('users');
        throw new Error('users insert failed');
      }
      throw new Error(`Unexpected query: ${query}`);
    };
    const sql = {
      begin: async <T>(fn: (txArg: TxQuery) => Promise<T>): Promise<T> => {
        pendingWrites.length = 0;
        try {
          const result = await fn(tx);
          committedWrites.push(...pendingWrites);
          return result;
        } catch (err) {
          pendingWrites.length = 0;
          throw err;
        }
      },
    } as unknown as ProvisionSql;
    const target: ProvisioningTarget = {
      clerkOrgId: 'org_live_1234',
      orgName: 'Acme Policies',
      orgSlug: 'acme',
      clerkUserId: 'user_live_1234',
      role: 'admin',
    };

    await expect(upsertProvisionedRows(sql, target)).rejects.toThrow('users insert failed');
    expect(committedWrites).toEqual([]);
    expect(pendingWrites).toEqual([]);
  });
});
