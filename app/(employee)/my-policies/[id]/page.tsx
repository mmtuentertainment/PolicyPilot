// app/(employee)/my-policies/[id]/page.tsx — Plan 05-05 Task 1c.
//
// D-27 access-aware Server Component. Three branches:
//   (a) assigned-and-published → render full PolicyView + Acknowledge button
//   (b) else has-grant + published → render TL;DR-only with banner
//   (c) else notFound() (404)
//
// Security boundary is enforced server-side HERE; the D-27a accessibility
// flag on Q&A citation links (lib/ai/qa.ts) is for UI hint only.
//
// ALL three branch checks run inside ONE withOrgScope closure so RLS
// applies uniformly across the brief query window (atomicity + consistency
// — a row archived between sub-queries either rolls back or commits as
// one unit).
//
// PolicyIdSchema.safeParse + notFound() at the boundary (CR-PR3-#23 spirit):
// a malformed URL `id` segment would trigger Postgres 22P02
// invalid_text_representation → unhandled exception → Next.js 500. Per
// D-10 "advertise nothing", malformed URLs return the same 404 as a
// missing/cross-org policy.
//
// Branch B (TL;DR-only) MUST contain the EXACT D-27 banner copy:
//   "This policy was cited in your AI answer but isn't assigned to you.
//    Summary only — contact your admin for full access."
// with a Unicode long em-dash (U+2014). Grep-asserted in plan acceptance.
//
// Branch B intentionally renders ONLY tldrSummary (no PolicyView, no
// Acknowledge button) — the explicit security boundary per D-27. Grant
// access does NOT elevate to ack-eligibility.
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/auth/context";
import { withOrgScope } from "@/lib/db/scoped";
import { Policies } from "@/lib/db/repositories/policies";
import { QaCitationGrants } from "@/lib/db/repositories/qa_citation_grants";
import { PolicyIdSchema } from "@/lib/policies/types";
import { PolicyView } from "@/components/policy/PolicyView";
import { AckStatusBadge } from "@/components/policy/AckStatusBadge";
import { AcknowledgeButton } from "@/components/employee/AcknowledgeButton";
import { Card, CardContent } from "@/components/ui/card";
import type { JSONContent } from "@tiptap/react";

type FullBranch = {
  branch: "full";
  policy: {
    id: string;
    title: string;
    contentJson: unknown;
  };
  assignedRow: {
    ackState: "none" | "current" | "stale";
    ackedAt: Date | null;
  };
};

type TldrBranch = {
  branch: "tldr";
  policy: {
    id: string;
    title: string;
    tldrSummary: string | null;
  };
};

type AccessResult = FullBranch | TldrBranch | { branch: "notfound" };

export default async function MyPolicyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  // D-10 "advertise nothing" — malformed URL = 404, not 500.
  const idParsed = PolicyIdSchema.safeParse(id);
  if (!idParsed.success) notFound();

  const ctx = await getOrgContext();

  // All branch checks inside ONE withOrgScope closure so RLS evaluates
  // consistently across sub-queries (atomicity per D-27 + D-10a spirit).
  const access: AccessResult = await withOrgScope(ctx, async (s) => {
    // Branch A — assigned-and-published.
    const assignedRows = await Policies.listAssignedAndPublishedForUser(
      s,
      ctx.userId,
    );
    const assignedRow = assignedRows.find((r) => r.id === idParsed.data);
    if (assignedRow) {
      // Defense-in-depth — assignment join was satisfied, but RLS could
      // deny on race (e.g., policy archived mid-flight by an admin).
      // Return 404 not 500 if the full row vanishes between queries.
      const fullRows = await Policies.findById(s, idParsed.data);
      const fullPolicy = fullRows[0];
      if (!fullPolicy) return { branch: "notfound" as const };
      return {
        branch: "full" as const,
        policy: {
          id: fullPolicy.id,
          title: fullPolicy.title,
          contentJson: fullPolicy.contentJson,
        },
        assignedRow: {
          ackState: assignedRow.ackState,
          ackedAt: assignedRow.ackedAt,
        },
      };
    }

    // Branch B — has-grant + published.
    const granted = await QaCitationGrants.hasGrant(
      s,
      ctx.userId,
      idParsed.data,
    );
    if (granted) {
      const grantRows = await Policies.findById(s, idParsed.data);
      const grantPolicy = grantRows[0];
      if (grantPolicy && grantPolicy.status === "published") {
        return {
          branch: "tldr" as const,
          policy: {
            id: grantPolicy.id,
            title: grantPolicy.title,
            tldrSummary: grantPolicy.tldrSummary,
          },
        };
      }
    }

    // Branch C — no assignment, no grant (or grant exists but policy is
    // not published / not found per RLS).
    return { branch: "notfound" as const };
  });

  if (access.branch === "notfound") notFound();

  if (access.branch === "full") {
    const { policy, assignedRow } = access;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{policy.title}</h1>
          <AckStatusBadge
            ackState={assignedRow.ackState}
            ackedAt={assignedRow.ackedAt}
          />
        </div>
        {/*
          policies.contentJson is jsonb (typed as `unknown` by Drizzle
          $inferSelect). PolicyView expects JSONContent. The cast is safe
          because the column is server-controlled (Drizzle-owned writes
          only — Phase 3 ADR-005); never user-supplied untrusted shape.
        */}
        <PolicyView content={policy.contentJson as JSONContent} />
        {assignedRow.ackState !== "current" && (
          <AcknowledgeButton
            policyId={policy.id}
            ackState={assignedRow.ackState}
          />
        )}
      </div>
    );
  }

  // Branch B — TL;DR-only.
  const { policy } = access;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{policy.title}</h1>
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <p className="text-sm text-amber-900">
            This policy was cited in your AI answer but isn&apos;t assigned to
            you. Summary only — contact your admin for full access.
          </p>
        </CardContent>
      </Card>
      {policy.tldrSummary ? (
        <div className="prose prose-sm max-w-none">
          <p>{policy.tldrSummary}</p>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          No summary available yet.
        </p>
      )}
    </div>
  );
}
