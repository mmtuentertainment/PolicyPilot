// components/admin/PolicyAssignmentsPanel.tsx — Plan 05-06 Task 2a.
//
// D-13 inline panel at bottom of /policies/[id]. Server Component reads
// PolicyAssignments.listForPolicy + Departments.listAll inside ONE
// withOrgScope closure (atomic snapshot of panel state — both queries
// see the same RLS-scoped view). Renders the read-only assignment list
// (D-16 — assignment removal deferred) above a Client child form for
// the dept selector + Assign button (D-14 — empty-departments handling
// lives in the Client child).
//
// Two-file split rationale: the Client child uses React 19
// `useActionState` and must be a Client Component; co-locating it in
// the same file as the Server Component shell is supported by Next.js
// but produces noisier import surfaces and breaks tree-shaking around
// the 'use client' boundary. Split mirrors the Plan 05-05 pattern
// (e.g. AcknowledgeButton.tsx alongside the [id]/page.tsx Server
// Component).
//
// D-17 — dept-only assignment for Phase 5 (R-4 scope). Individual-user
// assignment UI deferred. The repository's PolicyAssignments.create
// supports assigneeType='user' already; this panel only exposes the
// 'department' path. The read-only list renders user assignments too
// (for completeness — admin might see prior user-level rows seeded
// out-of-band) but the form only writes department rows.
import type { PolicyId } from '@/lib/policies/types';
import { withOrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { PolicyAssignments } from '@/lib/db/repositories/policy_assignments';
import { Departments } from '@/lib/db/repositories/departments';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { PolicyAssignmentsPanelForm } from './PolicyAssignmentsPanelForm';

export async function PolicyAssignmentsPanel({
  policyId,
}: {
  policyId: PolicyId;
}): Promise<React.JSX.Element> {
  const ctx = await getOrgContext();

  // ONE withOrgScope closure for atomic snapshot of panel state. The
  // RLS predicate evaluates uniformly across both sub-queries; a dept
  // created mid-flight either appears in BOTH lists or NEITHER.
  const [assignments, depts] = await withOrgScope(ctx, async (s) => {
    return Promise.all([
      PolicyAssignments.listForPolicy(s, policyId),
      Departments.listAll(s),
    ]);
  });

  // Build a deptId → name map so the read-only assignment list can
  // render department names instead of UUIDs. User-type rows fall
  // through to the assigneeId fallback (FUTURE: extend with a users
  // join when individual-user assignment UI lands in Phase 6+).
  const deptNameById = new Map(depts.map((d) => [d.id, d.name]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignments</CardTitle>
        <CardDescription>
          Departments assigned to this policy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {assignments.map((a) => (
              <li key={a.id}>
                {a.assigneeType === 'department'
                  ? `Department: ${deptNameById.get(a.assigneeId) ?? 'Unknown'}`
                  : `User: ${a.assigneeId}`}
              </li>
            ))}
          </ul>
        )}
        <PolicyAssignmentsPanelForm
          policyId={policyId}
          departments={depts.map((d) => ({ id: d.id, name: d.name }))}
        />
      </CardContent>
    </Card>
  );
}
