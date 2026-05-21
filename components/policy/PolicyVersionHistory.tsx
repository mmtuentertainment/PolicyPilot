// PolicyVersionHistory — Server Component (D-12 / D-04).
//
// Reads PolicyVersions.listForPolicy inside withOrgScope (ADR-019/023/025).
// Each row = one entry in the published lineage per D-04 semantics:
//   - draft → under_review: NO new version
//   - under_review → published: NEW row (the as-of-publish snapshot)
//   - published → draft (editPublished): NEW row capturing the pre-edit
//     published content; then policies.contentJson is overwritten + status
//     resets to draft + currentVersion bumps
//   - archive / restore: NO new version
//
// Author-name lookup is intentionally NOT implemented in this iteration —
// the UI-SPEC version-history row format reads "Version {n} — published
// {date} by {author_name}" but joining users.id → name would require
// either (a) extending PolicyVersions.listForPolicy in Plan 03-04 to return
// a joined author or (b) a second repository call here for each row.
// Phase 3 ships the simplified shape (date + change summary); the author-
// name surface is deferred to a Phase 8 polish ticket. SUMMARY captures
// this deferral.
//
// No 'use client' directive: this file ships zero client JS.

import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import type { PolicyId } from '@/lib/policies/types';

function formatTimestamp(d: Date | string | null | undefined): string {
  if (!d) return 'unknown';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ADR-028: prop branded as `PolicyId` so the call to
// `PolicyVersions.listForPolicy` (which now requires `PolicyId`) typechecks
// without a runtime re-validation. Caller (the only one: `app/(admin)/
// policies/[id]/page.tsx`) already validated the URL `id` via
// `PolicyIdSchema.safeParse` + `notFound()` before render.
export async function PolicyVersionHistory({ policyId }: { policyId: PolicyId }) {
  const ctx = await getOrgContext();
  const versions = await withOrgScope(ctx, async (s) =>
    PolicyVersions.listForPolicy(s, policyId),
  );

  if (versions.length === 0) {
    return (
      <section aria-label="Version history">
        <h2 className="text-xl font-semibold mb-4">Version history</h2>
        <p className="text-sm text-muted-foreground">
          No published versions yet. Versions are created when a policy is published.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Version history">
      <h2 className="text-xl font-semibold mb-4">Version history</h2>
      <ul className="space-y-3">
        {versions.map((v) => (
          <li key={v.id} className="text-sm border-b pb-2">
            <div className="font-semibold">Version {v.versionNumber}</div>
            <div className="text-muted-foreground">
              published {formatTimestamp(v.createdAt)}
              {v.changeSummary ? <> — {v.changeSummary}</> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
