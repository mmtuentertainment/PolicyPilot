// app/(reviewer)/reviewer/[policyId]/page.tsx — Phase 9 (R-017 / D-09-01) review detail.
//
// Read-only render of the policy under review (reuses components/policy/
// PolicyView.tsx — the server-safe @tiptap/html renderer) + the reviewer's
// Approve/Reject decision form. Loads the policy AND its pending stage in one
// withOrgScope so RLS + orgId filter both fire. policyId is validated/branded
// at the trust boundary before any DB access.
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { JSONContent } from '@tiptap/react';
import { requireReviewerOrAdmin } from '@/lib/auth/require-reviewer';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';
import { WorkflowStages } from '@/lib/db/repositories/workflow_stages';
import { PolicyView } from '@/components/policy/PolicyView';
import { PolicyIdSchema } from '@/lib/policies/types';
import { ReviewDecisionForm } from '../ReviewDecisionForm';

export const dynamic = 'force-dynamic';

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}): Promise<React.JSX.Element> {
  const { policyId: rawPolicyId } = await params;
  const parsed = PolicyIdSchema.safeParse(rawPolicyId);
  if (!parsed.success) notFound();
  const policyId = parsed.data;

  const ctx = await requireReviewerOrAdmin();

  const data = await withOrgScope(ctx, async (s) => {
    const policyRows = await Policies.findById(s, policyId);
    const policy = policyRows[0];
    if (!policy) return null;
    const stages = await WorkflowStages.listForPolicy(s, policyId);
    const pending = stages.find((st) => st.status === 'pending') ?? null;
    return { policy, pending };
  });

  if (!data) notFound();
  const { policy, pending } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/reviewer" className="text-sm underline">
          ← Back to queue
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{policy.title}</h1>
        <p className="text-sm text-muted-foreground">Status: {policy.status}</p>
      </div>

      <div className="rounded border p-4">
        <PolicyView content={policy.contentJson as JSONContent} />
      </div>

      {pending ? (
        <div className="rounded border p-4">
          <h2 className="mb-3 font-medium">Your decision</h2>
          {pending.comment ? (
            <p className="mb-2 text-sm text-muted-foreground">
              Previous note: {pending.comment}
            </p>
          ) : null}
          <ReviewDecisionForm policyId={policyId} stageId={pending.id} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          This policy has no pending review.
        </p>
      )}
    </div>
  );
}
