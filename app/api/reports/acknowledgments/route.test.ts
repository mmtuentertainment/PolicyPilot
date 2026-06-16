import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotAuthenticatedError } from '@/lib/auth/errors';
import { GET } from '@/app/api/reports/acknowledgments/route';

vi.mock('server-only', () => ({}));

const ADMIN_CTX = {
  orgId: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  clerkOrgId: 'org_report_admin',
  clerkUserId: 'user_report_admin',
  role: 'admin' as const,
};

const EMPLOYEE_CTX = {
  ...ADMIN_CTX,
  role: 'employee' as const,
};

const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/context')>(
    '@/lib/auth/context',
  );
  return {
    ...actual,
    getOrgContext: () => mockGetOrgContext(),
  };
});

const mockListAckComplianceForOrg = vi.fn();
vi.mock('@/lib/db/repositories/reports', () => ({
  Reports: {
    listAckComplianceForOrg: (...args: unknown[]) =>
      mockListAckComplianceForOrg(...args),
  },
}));

const mockWithOrgScope = vi.fn(
  async (_ctx: unknown, fn: (scope: unknown) => Promise<unknown>) =>
    fn({ ...ADMIN_CTX, tx: {} }),
);
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: (...args: [unknown, (scope: unknown) => Promise<unknown>]) =>
    mockWithOrgScope(...args),
}));

const mockEnrichWithClerkIdentity = vi.fn();
vi.mock('@/lib/reports/enrich', () => ({
  enrichWithClerkIdentity: (...args: unknown[]) => mockEnrichWithClerkIdentity(...args),
}));

function request(url = 'http://localhost/api/reports/acknowledgments'): Request {
  return new Request(url, { method: 'GET' });
}

const reportRows = [
  {
    userId: '33333333-3333-4333-8333-333333333333',
    clerkUserId: 'user_current',
    departmentName: 'HR',
    policyId: '44444444-4444-4444-8444-444444444444',
    policyTitle: 'Employee Handbook',
    policyVersion: 2,
    ackState: 'current' as const,
    acknowledgedAt: new Date('2026-06-01T12:00:00.000Z'),
    ipAddress: '203.0.113.10',
    assignedAt: new Date('2026-05-01T12:00:00.000Z'),
  },
  {
    userId: '55555555-5555-4555-8555-555555555555',
    clerkUserId: 'user_stale',
    departmentName: null,
    policyId: '66666666-6666-4666-8666-666666666666',
    policyTitle: '=SUM(A1)',
    policyVersion: 3,
    ackState: 'stale' as const,
    acknowledgedAt: null,
    ipAddress: null,
    assignedAt: new Date('2026-05-02T12:00:00.000Z'),
  },
];

const currentReportRow = reportRows[0]!;
const staleReportRow = reportRows[1]!;

const enrichedRows = [
  { ...currentReportRow, name: 'Ada Lovelace', email: 'ada@example.com' },
  { ...staleReportRow, name: 'Grace Hopper', email: 'grace@example.com' },
];

describe('GET /api/reports/acknowledgments', () => {
  beforeEach(() => {
    mockGetOrgContext.mockReset();
    mockWithOrgScope.mockClear();
    mockListAckComplianceForOrg.mockReset();
    mockEnrichWithClerkIdentity.mockReset();
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
    mockListAckComplianceForOrg.mockResolvedValue(reportRows);
    mockEnrichWithClerkIdentity.mockResolvedValue(enrichedRows);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetOrgContext.mockRejectedValueOnce(new NotAuthenticatedError());

    const res = await GET(request());

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('returns 403 forbidden for non-admin users', async () => {
    mockGetOrgContext.mockResolvedValueOnce(EMPLOYEE_CTX);

    const res = await GET(request());

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('returns JSON by default with summary counts', async () => {
    const res = await GET(request());
    const jsonRows = enrichedRows.map((row) => ({
      ...row,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      assignedAt: row.assignedAt.toISOString(),
    }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      rows: jsonRows,
      summary: { total: 2, acknowledged: 1, pending: 1 },
    });
  });

  it('returns downloadable CSV when format=csv', async () => {
    const res = await GET(
      request('http://localhost/api/reports/acknowledgments?format=csv'),
    );
    const today = new Date().toISOString().slice(0, 10);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const body = Buffer.from(bytes).toString('utf8');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="acknowledgments-${ADMIN_CTX.orgId}-${today}.csv"`,
    );
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(body.startsWith('\ufeffEmployee Name,Email,Department,Policy Title')).toBe(
      true,
    );
    expect(body).toContain("'=SUM(A1)");
    expect(body).not.toContain('null');
  });

  it('returns 400 for an unknown format', async () => {
    const res = await GET(
      request('http://localhost/api/reports/acknowledgments?format=xml'),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_request' });
  });

  it('returns 400 for malformed UUID filters', async () => {
    const res = await GET(
      request('http://localhost/api/reports/acknowledgments?policyId=not-a-uuid'),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_request' });
  });

  it('returns 503 for downstream failures', async () => {
    mockWithOrgScope.mockRejectedValueOnce(new Error('database unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await GET(request());

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'service_unavailable' });
    expect(consoleError).toHaveBeenCalledWith(
      '[reports/acknowledgments] failed',
      expect.objectContaining({ orgId: ADMIN_CTX.orgId }),
    );
    consoleError.mockRestore();
  });
});
