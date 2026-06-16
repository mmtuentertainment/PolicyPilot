import { describe, expect, it } from 'vitest';
import { fetchMembershipsForProvisioning } from './provision-dev-org';

function membership(userId: string): { role: string; user: { id: string } } {
  return { role: 'org:employee', user: { id: userId } };
}

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
});
