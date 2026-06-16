import { describe, expect, it } from 'vitest';
import {
  ProvisioningInputError,
  deriveProvisioningTarget,
  membershipUserId,
  normalizeClerkRole,
  parseProvisionArgs,
} from './provision-dev-org-lib';

describe('provision-dev-org helpers', () => {
  it('normalizes Clerk org roles into app roles', () => {
    expect(normalizeClerkRole('org:admin')).toBe('admin');
    expect(normalizeClerkRole('reviewer')).toBe('reviewer');
    expect(normalizeClerkRole('org:employee')).toBe('employee');
    expect(normalizeClerkRole('org:owner')).toBeNull();
  });

  it('parses dry-run and apply arguments without accepting unknown flags', () => {
    expect(parseProvisionArgs(['--org', 'org_1234', '--user=user_5678'])).toEqual({
      orgId: 'org_1234',
      userId: 'user_5678',
      apply: false,
      help: false,
    });
    expect(parseProvisionArgs(['--org=org_1234', '--apply']).apply).toBe(true);
    expect(() => parseProvisionArgs(['--org', 'bad'])).toThrow(ProvisioningInputError);
    expect(() => parseProvisionArgs(['--org=org_1234', '--wat'])).toThrow(ProvisioningInputError);
  });

  it('derives the provisioning target from Clerk organization and membership payloads', () => {
    const target = deriveProvisioningTarget({
      requestedOrgId: 'org_live_1234',
      requestedUserId: 'user_live_5678',
      organization: {
        id: 'org_live_1234',
        name: 'Acme Policies',
        slug: 'acme-policies',
      },
      memberships: [
        {
          role: 'org:admin',
          user: { id: 'user_live_5678' },
          organization: { id: 'org_live_1234' },
        },
      ],
    });

    expect(target).toEqual({
      clerkOrgId: 'org_live_1234',
      orgName: 'Acme Policies',
      orgSlug: 'acme-policies',
      clerkUserId: 'user_live_5678',
      role: 'admin',
    });
  });

  it('reads Clerk membership user ids across SDK and REST payload shapes', () => {
    expect(membershipUserId({ user: { id: 'user_from_object' } })).toBe('user_from_object');
    expect(membershipUserId({ publicUserData: { userId: 'user_from_camel' } })).toBe(
      'user_from_camel',
    );
    expect(membershipUserId({ public_user_data: { user_id: 'user_from_snake' } })).toBe(
      'user_from_snake',
    );
  });

  it('requires --user when Clerk returns multiple memberships', () => {
    expect(() =>
      deriveProvisioningTarget({
        requestedOrgId: 'org_live_1234',
        organization: { id: 'org_live_1234', name: 'Acme Policies', slug: 'acme' },
        memberships: [
          { role: 'org:admin', user: { id: 'user_live_1' } },
          { role: 'org:employee', user: { id: 'user_live_2' } },
        ],
      }),
    ).toThrow(/--user/);
  });
});
