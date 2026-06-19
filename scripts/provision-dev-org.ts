import { pathToFileURL } from 'node:url';
import postgres from 'postgres';
import {
  ProvisioningInputError,
  deriveProvisioningTarget,
  maskClerkId,
  maskClerkOrgId,
  membershipUserId,
  parseProvisionArgs,
  type ProvisioningTarget,
} from './provision-dev-org-lib';

type ExistingOrgRow = {
  id: string;
  name: string;
  slug: string;
};

type ExistingUserRow = {
  id: string;
  org_id: string | null;
  role: string;
};

type UpsertResult = {
  orgId: string;
  userId: string;
};

const CLERK_API_BASE = 'https://api.clerk.com/v1';
const MEMBERSHIP_PAGE_LIMIT = 100;
const MAX_MEMBERSHIP_PAGES = 50;

function usage(): string {
  return [
    'Usage:',
    '  pnpm dev:provision-org -- --org org_... --user user_... --apply',
    '',
    'Purpose:',
    '  Repairs local-dev Clerk org provisioning when localhost did not receive',
    '  organization.created / user.created / organizationMembership.created webhooks.',
    '',
    'Safety:',
    '  Defaults to dry-run. Add --apply to write organizations/users rows and',
    '  mirror publicMetadata.role in Clerk. Never prints env values or secrets.',
    '  --apply requires NODE_ENV=development/test for non-local hosts unless',
    '  --allow-host is provided after manually verifying the target is not prod.',
  ].join('\n');
}

function dbHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable DATABASE_URL host)';
  }
}

function dbHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isLocalDbHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function assertSafeApplyHost(input: {
  apply: boolean;
  allowHost: boolean;
  dbUrl: string;
  nodeEnv: string | undefined;
}): void {
  if (!input.apply || input.allowHost) return;
  if (input.nodeEnv === 'development' || input.nodeEnv === 'test') return;

  const hostname = dbHostname(input.dbUrl);
  if (isLocalDbHost(hostname)) return;

  const target = dbHost(input.dbUrl);
  const reason = hostname.endsWith('.pooler.supabase.com')
    ? 'Supabase pooler host'
    : `non-local DB host ${target}`;
  throw new ProvisioningInputError(
    `Refusing --apply against ${reason}. Set NODE_ENV=development or NODE_ENV=test, or pass --allow-host after verifying this is not production.`,
  );
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s'")]+/gi, 'postgres://[redacted]')
    .replace(/\b(host|user|password|database)\s+"[^"]*"/gi, '$1 "[redacted]"')
    .replace(
      /\b(host|user|password|database|dsn|connection string)(\s*[:=]\s*)[^\s,;]+/gi,
      '$1$2[redacted]',
    )
    .replace(/\b[A-Za-z0-9.-]*supabase\.(?:co|com)\b/gi, '[redacted-host]');
}

function formatProvisioningFailure(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${sanitizeErrorMessage(err.message)}`;
  }
  return sanitizeErrorMessage(String(err));
}

function dataArray(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: unknown[] }).data;
  }
  return [];
}

function dataTotalCount(response: unknown): number | null {
  if (typeof response !== 'object' || response === null) return null;
  if ('totalCount' in response && typeof response.totalCount === 'number') return response.totalCount;
  if ('total_count' in response && typeof response.total_count === 'number') return response.total_count;
  return null;
}

async function readClerkResponse(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let errorCode = '';
    try {
      const parsed = JSON.parse(text) as { errors?: Array<{ code?: unknown }> };
      const code = parsed.errors?.find((item) => typeof item.code === 'string')?.code;
      errorCode = code ? ` (${code})` : '';
    } catch {
      errorCode = '';
    }
    throw new ProvisioningInputError(
      `Clerk API ${label} failed with HTTP ${response.status}${errorCode}. Check the Clerk org/user ids and local CLERK_SECRET_KEY.`,
    );
  }

  if (text.trim().length === 0) return {};
  return JSON.parse(text) as unknown;
}

async function clerkGet(secretKey: string, path: string, label: string): Promise<unknown> {
  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
  });
  return readClerkResponse(response, label);
}

type ClerkGetFn = (path: string, label: string) => Promise<unknown>;

function organizationMembershipsPath(organizationId: string, limit: number, offset: number): string {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return `/organizations/${organizationId}/memberships?${params.toString()}`;
}

async function fetchMembershipsForProvisioning(input: {
  organizationId: string;
  requestedUserId?: string;
  get: ClerkGetFn;
}): Promise<unknown[]> {
  const limit = input.requestedUserId ? MEMBERSHIP_PAGE_LIMIT : 2;
  const memberships: unknown[] = [];

  for (let offset = 0, pageCount = 0; ; offset += limit, pageCount += 1) {
    if (pageCount >= MAX_MEMBERSHIP_PAGES) {
      throw new ProvisioningInputError(
        `Clerk membership lookup exceeded ${MAX_MEMBERSHIP_PAGES} pages without finding the requested user`,
      );
    }

    const response = await input.get(
      organizationMembershipsPath(input.organizationId, limit, offset),
      'organization membership lookup',
    );
    const page = dataArray(response);
    memberships.push(...page);

    if (!input.requestedUserId) break;
    if (page.some((membership) => membershipUserId(membership) === input.requestedUserId)) break;

    const totalCount = dataTotalCount(response);
    if (totalCount !== null && offset + page.length >= totalCount) break;
    if (page.length < limit) break;
  }

  return memberships;
}

async function clerkPatch(
  secretKey: string,
  path: string,
  label: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${CLERK_API_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return readClerkResponse(response, label);
}

async function loadExisting(sql: ReturnType<typeof postgres>, target: ProvisioningTarget): Promise<{
  org: ExistingOrgRow | null;
  user: ExistingUserRow | null;
}> {
  const orgRows = await sql<ExistingOrgRow[]>`
    SELECT id, name, slug
    FROM organizations
    WHERE clerk_org_id = ${target.clerkOrgId}
    LIMIT 1
  `;
  const userRows = await sql<ExistingUserRow[]>`
    SELECT id, org_id, role
    FROM users
    WHERE clerk_user_id = ${target.clerkUserId}
    LIMIT 1
  `;
  return {
    org: orgRows[0] ?? null,
    user: userRows[0] ?? null,
  };
}

async function upsertProvisionedRows(
  sql: ReturnType<typeof postgres>,
  target: ProvisioningTarget,
): Promise<UpsertResult> {
  return sql.begin(async (tx) => {
    const orgRows = await tx<{ id: string }[]>`
      INSERT INTO organizations (clerk_org_id, name, slug, plan_tier, stripe_subscription_status)
      VALUES (${target.clerkOrgId}, ${target.orgName}, ${target.orgSlug}, 'starter', 'trialing')
      ON CONFLICT (clerk_org_id) DO UPDATE
      SET name = EXCLUDED.name,
          slug = EXCLUDED.slug
      RETURNING id
    `;
    const orgRow = orgRows[0];
    if (!orgRow) throw new Error('organizations upsert returned no row');

    const userRows = await tx<{ id: string }[]>`
      INSERT INTO users (org_id, clerk_user_id, role)
      VALUES (${orgRow.id}, ${target.clerkUserId}, ${target.role})
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET org_id = EXCLUDED.org_id,
          role = EXCLUDED.role
      RETURNING id
    `;
    const userRow = userRows[0];
    if (!userRow) throw new Error('users upsert returned no row');

    return { orgId: orgRow.id, userId: userRow.id };
  });
}

async function fetchProvisioningTarget(
  args: ReturnType<typeof parseProvisionArgs>,
  secretKey: string,
): Promise<ProvisioningTarget> {
  const organizationId = encodeURIComponent(args.orgId);
  const organization = await clerkGet(secretKey, `/organizations/${organizationId}`, 'organization lookup');
  const memberships = await fetchMembershipsForProvisioning({
    organizationId,
    requestedUserId: args.userId,
    get: (path, label) => clerkGet(secretKey, path, label),
  });

  return deriveProvisioningTarget({
    requestedOrgId: args.orgId,
    requestedUserId: args.userId,
    organization,
    memberships,
  });
}

async function updateClerkUserRole(secretKey: string, target: ProvisioningTarget): Promise<void> {
  await clerkPatch(secretKey, `/users/${encodeURIComponent(target.clerkUserId)}/metadata`, 'user metadata update', {
    public_metadata: { role: target.role },
  });
}

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseProvisionArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ProvisioningInputError('Refusing to run with NODE_ENV=production');
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new ProvisioningInputError('DATABASE_URL must be set in .env.local');
  assertSafeApplyHost({
    apply: args.apply,
    allowHost: args.allowHost,
    dbUrl,
    nodeEnv: process.env.NODE_ENV,
  });

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new ProvisioningInputError('CLERK_SECRET_KEY must be set in .env.local');
  }

  console.log(`[provision-dev-org] target=${dbHost(dbUrl)}`);
  const target = await fetchProvisioningTarget(args, clerkSecretKey);
  console.log(
    `[provision-dev-org] Clerk org=${maskClerkOrgId(target.clerkOrgId)} user=${maskClerkId(target.clerkUserId)} role=${target.role}`,
  );

  const sql = postgres(dbUrl, { max: 1, prepare: false });
  try {
    const existing = await loadExisting(sql, target);
    console.log(
      `[provision-dev-org] organizations row: ${existing.org ? 'present' : 'missing'}`,
    );
    console.log(`[provision-dev-org] users row: ${existing.user ? 'present' : 'missing'}`);
    if (existing.user?.org_id && existing.org && existing.user.org_id !== existing.org.id) {
      console.log(
        '[provision-dev-org] users row is linked to a different org; --apply will move it to the requested active org per ADR-027 one-org model.',
      );
    }

    if (!args.apply) {
      console.log('[provision-dev-org] DRY RUN: no DB rows or Clerk metadata were changed.');
      console.log('[provision-dev-org] Re-run with --apply to reconcile local dev state.');
      return;
    }

    const result = await upsertProvisionedRows(sql, target);
    await updateClerkUserRole(clerkSecretKey, target);

    console.log(
      `[provision-dev-org] OK: org row ${result.orgId} and user row ${result.userId} reconciled; Clerk publicMetadata.role=${target.role}`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err: unknown) => {
    const detail = formatProvisioningFailure(err);
    console.error(`[provision-dev-org] FAILED: ${detail}`);
    process.exit(1);
  });
}

export {
  fetchMembershipsForProvisioning,
  formatProvisioningFailure,
  main,
  upsertProvisionedRows,
};
