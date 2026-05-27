// app/(employee)/my-policies/page.tsx — Plan 05-05 Task 1b.
//
// Replaces 03-G3 T9 stub Card wholesale. Real Server Component dashboard
// per SPEC R-1 + D-01..D-04 + D-04a (empty-state) + D-24 (Ask the AI
// affordance).
//
// Reads Policies.listAssignedAndPublishedForUser (Plan 05-03 / D-01..D-04)
// inside withOrgScope per ADR-025 — RLS + application-layer eq(orgId) both
// fire. The dashboard query joins assignment + version + two-aliased ack
// rows in a single SELECT DISTINCT to dedupe user-AND-dept double
// assignments per D-01 + D-04.
//
// Renders an AckStatusBadge (Plan 05-07) per row for the re-ack indicator:
//   - 'none'    → no badge (default-state row)
//   - 'stale'   → amber "Requires re-acknowledgment"
//   - 'current' → green ✓ + timestamp
// The exhaustive switch lives in AckStatusBadge — this page treats it as
// an opaque prop pass-through.
//
// Empty-state branch (D-04a) MUST contain the EXACT copy:
//   "No policies assigned yet — contact your administrator."
// with a Unicode long em-dash (U+2014). This is grep-asserted in the
// plan's acceptance criteria. The string also lives in Plan 05-09's
// integration test expectations.
//
// "Ask the AI" header link (D-24) navigates to /my-policies/ask — the
// R-6 Q&A surface in Sub-task 3b.
//
// NO PolicyListSearch / PolicyStatusFilter (admin-only; employees don't
// filter in Phase 5). NO "Create policy" button (admin only).
import Link from "next/link";
import { getOrgContext } from "@/lib/auth/context";
import { withOrgScope } from "@/lib/db/scoped";
import { Policies } from "@/lib/db/repositories/policies";
import { AckStatusBadge } from "@/components/policy/AckStatusBadge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default async function MyPoliciesPage(): Promise<React.JSX.Element> {
  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) =>
    Policies.listAssignedAndPublishedForUser(s, ctx.userId),
  );

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">My Policies</h1>
        <Link
          href="/my-policies/ask"
          className={buttonVariants({ variant: "outline" })}
        >
          Ask the AI
        </Link>
      </header>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No policies assigned yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No policies assigned yet — contact your administrator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/my-policies/${row.id}`}
                className="block hover:no-underline"
              >
                <Card className="transition-colors hover:bg-muted/30">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">{row.title}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.category}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <AckStatusBadge
                        ackState={row.ackState}
                        ackedAt={row.ackedAt}
                      />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
