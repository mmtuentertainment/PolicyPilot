// app/(admin)/policies/[id]/page.tsx — Plan 03-11 Task 4.
//
// Edit policy detail page. Server Component reads Policies.findById inside
// withOrgScope (ADR-025) — RLS + application-layer eq(orgId) both fire.
//
// T-03-11-03 mitigation: a cross-org policyId resolves to zero rows →
// notFound() → HTTP 404. D-10 "advertise nothing" — never confirm the
// policy exists in another org.
//
// Layout:
//   Left  (3 cols): EditPolicyForm — editor + title + category + Save.
//                   Editor editability driven by status + editPublishedMode.
//   Right (2 cols): PolicyVersionHistory — Server Component that reads
//                   PolicyVersions.listForPolicy inside withOrgScope.
//   Header        : PolicyHeaderActions (Client wrapper hosting the
//                   transition menu + onEditPublished navigation).
//
// editPublishedMode wiring (B2 LOCKED):
//   - PolicyTransitionMenu renders "Edit policy" only for published rows.
//   - User clicks → confirm dialog → on confirm, onEditPublished() runs
//     (hosted by PolicyHeaderActions) → router.push('?edit=1').
//   - This page reads `searchParams.edit === '1'` AND `status==='published'`
//     and flips EditPolicyForm into editPublishedMode.
//   - Save changes posts editPublishedAction with NEW content + change-
//     summary → snapshot prior content into policy_versions + reset to
//     draft + bump version (SC #3 closure).
import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/auth/context";
import { withOrgScope } from "@/lib/db/scoped";
import { Policies } from "@/lib/db/repositories/policies";
import { PolicyStatusBadge } from "@/components/policy/PolicyStatusBadge";
import { PolicyHeaderActions } from "@/components/policy/PolicyHeaderActions";
import { PolicyVersionHistory } from "@/components/policy/PolicyVersionHistory";
import { EditPolicyForm } from "@/components/policy/EditPolicyForm";
import type { PolicyStatus } from "@/lib/policies/state-machine";

export default async function EditPolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const editPublished = sp.edit === "1";

  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) => Policies.findById(s, id));
  const policy = rows[0];
  if (!policy) notFound();
  const status = policy.status as PolicyStatus;

  return (
    <div>
      <Link
        href="/policies"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to library
      </Link>
      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-semibold">
            {policy.title || "Untitled policy"}
          </h1>
          <div className="mt-1">
            <PolicyStatusBadge status={status} />
          </div>
        </div>
        <PolicyHeaderActions policyId={policy.id} currentStatus={status} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <EditPolicyForm
            policyId={policy.id}
            initialTitle={policy.title ?? ""}
            initialCategory={policy.category ?? ""}
            initialContent={policy.contentJson}
            status={status}
            editPublishedMode={editPublished && status === "published"}
          />
        </div>
        <aside className="lg:col-span-2">
          <PolicyVersionHistory policyId={policy.id} />
        </aside>
      </div>
    </div>
  );
}
