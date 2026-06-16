export type AppRole = 'admin' | 'reviewer' | 'employee';

export type ProvisionArgs = {
  orgId: string;
  userId?: string;
  apply: boolean;
  help: boolean;
};

export type ProvisioningTarget = {
  clerkOrgId: string;
  orgName: string;
  orgSlug: string;
  clerkUserId: string;
  role: AppRole;
};

export class ProvisioningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProvisioningInputError';
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(root: unknown, path: readonly string[]): unknown {
  let cursor = root;
  for (const key of path) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function readString(root: unknown, path: readonly string[]): string | null {
  const value = readPath(root, path);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeClerkRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(/^org:/, '');
  if (stripped === 'admin' || stripped === 'reviewer' || stripped === 'employee') {
    return stripped;
  }
  return null;
}

export function maskClerkId(id: string): string {
  if (id.length <= 4) return '***';
  return `user_***${id.slice(-4)}`;
}

export function maskClerkOrgId(id: string): string {
  if (id.length <= 4) return '***';
  return `org_***${id.slice(-4)}`;
}

function validateClerkId(label: string, value: string, prefix: 'org_' | 'user_'): void {
  if (!value.startsWith(prefix)) {
    throw new ProvisioningInputError(`${label} must start with ${prefix}`);
  }
}

function membershipUserId(membership: unknown): string | null {
  return (
    readString(membership, ['user', 'id']) ??
    readString(membership, ['publicUserData', 'userId']) ??
    readString(membership, ['public_user_data', 'user_id'])
  );
}

function findTargetMembership(memberships: unknown[], requestedUserId?: string): unknown {
  if (requestedUserId) {
    const match = memberships.find((membership) => membershipUserId(membership) === requestedUserId);
    if (!match) {
      throw new ProvisioningInputError(
        `Clerk membership list did not include requested user ${maskClerkId(requestedUserId)}`,
      );
    }
    return match;
  }

  if (memberships.length !== 1) {
    throw new ProvisioningInputError(
      `Expected exactly one organization membership, found ${memberships.length}. Re-run with --user user_...`,
    );
  }

  const first = memberships[0];
  if (!first) {
    throw new ProvisioningInputError('Clerk membership list was empty');
  }
  return first;
}

export function deriveProvisioningTarget(input: {
  requestedOrgId: string;
  requestedUserId?: string;
  organization: unknown;
  memberships: unknown[];
}): ProvisioningTarget {
  validateClerkId('--org', input.requestedOrgId, 'org_');
  if (input.requestedUserId) validateClerkId('--user', input.requestedUserId, 'user_');

  const clerkOrgId = readString(input.organization, ['id']) ?? input.requestedOrgId;
  if (clerkOrgId !== input.requestedOrgId) {
    throw new ProvisioningInputError('Clerk returned a different organization id than requested');
  }

  const membership = findTargetMembership(input.memberships, input.requestedUserId);
  const clerkUserId = input.requestedUserId ?? membershipUserId(membership);
  if (!clerkUserId) {
    throw new ProvisioningInputError('Clerk membership did not include a user id');
  }
  validateClerkId('membership user id', clerkUserId, 'user_');

  const role = normalizeClerkRole(readPath(membership, ['role']));
  if (!role) {
    throw new ProvisioningInputError(
      'Clerk membership role must be one of org:admin, org:reviewer, org:employee, admin, reviewer, or employee',
    );
  }

  const orgName =
    readString(input.organization, ['name']) ??
    readString(membership, ['organization', 'name']) ??
    clerkOrgId;
  const orgSlug =
    readString(input.organization, ['slug']) ??
    readString(membership, ['organization', 'slug']) ??
    clerkOrgId;

  return {
    clerkOrgId,
    orgName,
    orgSlug,
    clerkUserId,
    role,
  };
}

export function parseProvisionArgs(argv: string[]): ProvisionArgs {
  const args: ProvisionArgs = { orgId: '', apply: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--org' || token === '--user') {
      const next = argv[i + 1];
      if (!next) throw new ProvisioningInputError(`${token} requires a value`);
      if (token === '--org') args.orgId = next;
      if (token === '--user') args.userId = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--org=')) {
      args.orgId = token.slice('--org='.length);
      continue;
    }
    if (token.startsWith('--user=')) {
      args.userId = token.slice('--user='.length);
      continue;
    }

    throw new ProvisioningInputError(`Unknown argument: ${token}`);
  }

  if (args.help) return args;
  if (!args.orgId) throw new ProvisioningInputError('--org org_... is required');
  validateClerkId('--org', args.orgId, 'org_');
  if (args.userId) validateClerkId('--user', args.userId, 'user_');
  return args;
}
