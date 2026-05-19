// app/(admin)/policies/page.tsx — Plan 03-11 Task 2.
//
// Policy library — Server Component. Reads Policies.listWithFilters inside
// withOrgScope (ADR-025). URL-state via ?q= and ?status=:
//   - PolicyListSearch (Client) debounces title-or-category search and
//     replace()s the URL.
//   - PolicyStatusFilter (Client) pushes ?status= on Select change.
// The Server Component re-runs on URL change because /policies/page.tsx
// reads searchParams (Next 15 makes it a Promise) — Next.js automatically
// invalidates the RSC tree.
//
// T-03-11-02 mitigation: parseStatus narrows raw query strings to the
// PolicyStatus union; unknown values silently fall through to undefined
// (forged "?status=evil" would resolve to "all"-equivalent).
//
// T-03-11-05 mitigation: listWithFilters has LIMIT 100 hard cap; the
// 250ms debounce on the search input is in PolicyListSearch.
//
// SC #4 + SC #5 (ROADMAP): every row is scoped by orgId at both the
// application layer (eq(policies.orgId, s.orgId)) AND the RLS policy
// fires inside withOrgScope's set_config('request.jwt.claims', ..., true)
// transaction.
import Link from "next/link";
import { getOrgContext } from "@/lib/auth/context";
import { withOrgScope } from "@/lib/db/scoped";
import { Policies } from "@/lib/db/repositories/policies";
import { PolicyStatusBadge } from "@/components/policy/PolicyStatusBadge";
import { PolicyListSearch } from "@/components/policy/PolicyListSearch";
import { PolicyStatusFilter } from "@/components/policy/PolicyStatusFilter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { PolicyStatus } from "@/lib/policies/state-machine";

const VALID_STATUSES: readonly PolicyStatus[] = [
  "draft",
  "under_review",
  "published",
  "archived",
] as const;

function parseStatus(raw: string | undefined): PolicyStatus | undefined {
  return raw && (VALID_STATUSES as readonly string[]).includes(raw)
    ? (raw as PolicyStatus)
    : undefined;
}

function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

type SP = { q?: string; status?: string };

export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const status = parseStatus(sp.status);
  const q = sp.q?.trim() || undefined;

  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) =>
    Policies.listWithFilters(s, { q, status }),
  );

  const empty = rows.length === 0;
  const isSearching = Boolean(q || status);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Policies</h1>
        <Link
          href="/policies/new"
          className={buttonVariants({ variant: "default" })}
        >
          Create policy
        </Link>
      </header>

      <div className="flex items-center gap-3 mb-4">
        <PolicyListSearch />
        <PolicyStatusFilter initialValue={status ?? "all"} />
        <noscript>
          {/* No-JS fallback: simple link-driven filters. The Server Component
              page re-runs on URL change so this works even without the
              Client filter component mounting. */}
          <span className="ml-2 text-xs text-muted-foreground">
            <Link href="/policies" className="underline mr-2">
              All statuses
            </Link>
            <Link href="/policies?status=draft" className="underline mr-2">
              Draft
            </Link>
            <Link
              href="/policies?status=under_review"
              className="underline mr-2"
            >
              Under Review
            </Link>
            <Link href="/policies?status=published" className="underline mr-2">
              Published
            </Link>
            <Link href="/policies?status=archived" className="underline">
              Archived
            </Link>
          </span>
        </noscript>
      </div>

      {empty && !isSearching ? (
        <Card>
          <CardHeader>
            <CardTitle>No policies yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Create your first policy to start building your library. Drafts
              are private until you publish.
            </p>
            <Link
              href="/policies/new"
              className={buttonVariants({ variant: "default" })}
            >
              Create your first policy
            </Link>
          </CardContent>
        </Card>
      ) : empty && isSearching ? (
        <Card>
          <CardHeader>
            <CardTitle>No policies match your search</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Try a different title or category, or clear filters.
            </p>
            <Link
              href="/policies"
              className={buttonVariants({ variant: "ghost" })}
            >
              Clear filters
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/policies/${p.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell>{p.category}</TableCell>
                  <TableCell>
                    <PolicyStatusBadge status={p.status as PolicyStatus} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <time
                      dateTime={
                        (p.updatedAt as Date | string | null)
                          ? new Date(
                              p.updatedAt as Date | string,
                            ).toISOString()
                          : undefined
                      }
                    >
                      {timeAgo(p.updatedAt as Date | string | null)}
                    </time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length >= 100 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing first 100 policies. Refine your search to see more.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
