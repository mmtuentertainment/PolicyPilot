import 'server-only';
import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { getOrgContext, type OrgContext } from '@/lib/auth/context';
import { BootstrapError, ForbiddenError } from '@/lib/auth/errors';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { Reports, type AckComplianceReportRow } from '@/lib/db/repositories/reports';
import { toCsv, type CsvCell } from '@/lib/reports/csv';
import {
  enrichWithClerkIdentity,
  type EnrichedRow,
} from '@/lib/reports/enrich';

export const dynamic = 'force-dynamic';

const SearchParamsSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  policyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
});

const CSV_HEADERS = [
  'Employee Name',
  'Email',
  'Department',
  'Policy Title',
  'Status',
  'Acknowledged At',
  'IP Address',
  'Assigned At',
  'Policy Version',
];

const ACK_STATUS_LABELS = {
  current: 'Acknowledged (current)',
  stale: 'Acknowledged - prior version, re-ack due',
  none: 'Pending',
} satisfies Record<AckComplianceReportRow['ackState'], string>;

function parseParams(req: Request): z.infer<typeof SearchParamsSchema> {
  const searchParams = new URL(req.url).searchParams;
  return SearchParamsSchema.parse({
    format: searchParams.get('format') ?? undefined,
    policyId: searchParams.get('policyId') ?? undefined,
    departmentId: searchParams.get('departmentId') ?? undefined,
  });
}

function buildSummary(rows: AckComplianceReportRow[]) {
  const acknowledged = rows.filter((row) => row.ackState === 'current').length;
  return {
    total: rows.length,
    acknowledged,
    pending: rows.length - acknowledged,
  };
}

function toIso(value: Date | null): string {
  return value?.toISOString() ?? '';
}

function toCsvRows(rows: EnrichedRow<AckComplianceReportRow>[]): CsvCell[][] {
  return rows.map((row) => [
    row.name,
    row.email,
    row.departmentName ?? '',
    row.policyTitle,
    ACK_STATUS_LABELS[row.ackState],
    toIso(row.acknowledgedAt),
    row.ipAddress ?? '',
    row.assignedAt.toISOString(),
    row.policyVersion,
  ]);
}

function loggableError(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message.slice(0, 120) };
  }
  return { name: 'NonError', message: String(err).slice(0, 120) };
}

export async function GET(req: Request): Promise<Response> {
  let ctx: OrgContext | undefined;

  try {
    ctx = await getOrgContext();
    requireAdminFromCtx(ctx);

    const params = parseParams(req);
    const rows = await withOrgScope(ctx, (s) =>
      Reports.listAckComplianceForOrg(s, {
        policyId: params.policyId,
        departmentId: params.departmentId,
      }),
    );
    const enrichedRows = await enrichWithClerkIdentity(rows);
    const summary = buildSummary(rows);

    if (params.format === 'csv') {
      const date = new Date().toISOString().slice(0, 10);
      const csv = toCsv(CSV_HEADERS, toCsvRows(enrichedRows));
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="acknowledgments-${ctx.orgId}-${date}.csv"`,
        },
      });
    }

    return NextResponse.json({ rows: enrichedRows, summary }, { status: 200 });
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (err instanceof BootstrapError) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    console.error('[reports/acknowledgments] failed', {
      orgId: ctx?.orgId,
      error: loggableError(err),
    });
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
