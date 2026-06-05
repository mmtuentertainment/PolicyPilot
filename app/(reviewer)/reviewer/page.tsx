// app/(reviewer)/reviewer/page.tsx — Phase 9 (R-017 / D-09-01) review queue (/reviewer).
//
// Shared org review queue (MVP model): every PENDING workflow stage in the org,
// actionable by any reviewer OR admin. requireReviewerOrAdmin() both gates and
// returns the OrgContext; the list read runs inside withOrgScope so RLS + the
// app-layer orgId filter both fire.
import Link from 'next/link';
import { requireReviewerOrAdmin } from '@/lib/auth/require-reviewer';
import { withOrgScope } from '@/lib/db/scoped';
import { WorkflowStages } from '@/lib/db/repositories/workflow_stages';

export const dynamic = 'force-dynamic';

export default async function ReviewQueuePage(): Promise<React.JSX.Element> {
  const ctx = await requireReviewerOrAdmin();
  const rows = await withOrgScope(ctx, (s) => WorkflowStages.listPendingForOrg(s));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Review queue</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No policies are awaiting review.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 font-medium">Policy</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stageId} className="border-b">
                <td className="py-2">{r.policyTitle}</td>
                <td className="py-2">{r.policyStatus}</td>
                <td className="py-2 text-right">
                  <Link href={`/reviewer/${r.policyId}`} className="underline">
                    Review
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
