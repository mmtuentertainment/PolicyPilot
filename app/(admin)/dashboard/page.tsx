// app/(admin)/dashboard/page.tsx — Plan 03-11 Task 1.
//
// Admin landing — status-count tiles + Create policy CTA. The landing
// surface after /post-sign-in (Plan 03-02 trampoline) dispatches admins
// here. Reads Policies.statusCounts inside withOrgScope (ADR-025) so the
// query carries the org's JWT and RLS fires.
//
// W7 closure — Clerk webhook race fallback. After the very first sign-up,
// the user may land on /dashboard milliseconds BEFORE Clerk's
// `organizationMembership.created` webhook lands and populates
// users.org_id. getOrgContext() throws `No active organization` in that
// window. Instead of a raw 500, we render a "Setting up your
// organization..." panel with a 2s meta-refresh — the next render lands
// after the webhook and the dashboard mounts normally.
import Link from "next/link";
import { getOrgContext } from "@/lib/auth/context";
import { matchesErrorClass } from "@/lib/auth/bootstrap-errors";
import {
  InvalidRoleError,
  NoActiveOrganizationError,
  ProvisioningRaceError,
} from "@/lib/auth/errors";
import { withOrgScope } from "@/lib/db/scoped";
import { Policies } from "@/lib/db/repositories/policies";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Errors getOrgContext() throws in the brief sign-up → webhook landing
// window (W7 fallback below renders for these). CR-PR3-#14 closure,
// upgraded to typed classes per ADR-026.
//
// The class hierarchy in lib/auth/errors.ts is the source of truth for
// what each error means; this list is the policy-level decision about
// which classes the dashboard treats as RACE (soft retry with 2s
// meta-refresh) vs RETHROW (let bubble to a real 500). The
// ProvisioningRaceError abstract base catches both OrgNotProvisionedError
// and UserNotProvisionedError as a single conceptual condition (Clerk
// webhook race). ClerkAuthFailedError is intentionally NOT a
// BootstrapError so it cannot accidentally land in this list — see
// lib/auth/bootstrap-errors.test.ts § hierarchy-contract for the lock.
//
// Cross-reference: app/(auth)/post-sign-in/page.tsx BOOTSTRAP_ERRORS list
// intentionally EXCLUDES ProvisioningRaceError (the trampoline treats DB
// drift as a hard failure, not a refresh-loop). The asymmetry is
// documented: dashboard = soft retry on webhook race; trampoline = hard
// fail on DB drift.
const ONBOARDING_RACE_ERRORS = [
  NoActiveOrganizationError,
  ProvisioningRaceError,
  InvalidRoleError,
] as const;

/**
 * Determines whether an error should be treated as an onboarding race condition.
 *
 * Checks if `err` matches any known onboarding-related error classes (e.g., provisioning or organization-not-ready errors).
 *
 * @param err - The error to classify
 * @returns `true` if the error is an onboarding race error, `false` otherwise.
 */
function isOnboardingRaceError(err: unknown): boolean {
  return matchesErrorClass(err, ONBOARDING_RACE_ERRORS);
}

/**
 * Render the admin dashboard or, if organization provisioning appears to be in progress, a brief "Setting up your organization..." panel that triggers a meta-refresh.
 *
 * @returns The dashboard page element; if onboarding provisioning is detected, returns a panel that refreshes after 2 seconds.
 *
 * @throws Any non-onboarding organization-context errors are rethrown so they surface as real failures.
 */
export default async function DashboardPage(): Promise<React.JSX.Element> {
  // W7: Clerk webhook race mitigation (Option B — brief loading state).
  // If the user signed in and reached /dashboard before the
  // `organizationMembership.created` webhook landed, users.org_id will
  // still be null and getOrgContext() throws. Render a "Setting up your
  // organization..." panel with a meta-refresh after 2s instead of a
  // raw 500. Backend failures (Clerk down, DB unreachable) rethrow so
  // they surface as real 500s and aren't masked as onboarding state.
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (err) {
    if (!isOnboardingRaceError(err)) throw err;
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-8 text-center">
        <meta httpEquiv="refresh" content="2" />
        <h1 className="text-xl font-semibold mb-2">
          Setting up your organization...
        </h1>
        <p className="text-muted-foreground max-w-md">
          We&apos;re finishing the setup of your workspace. This page will
          refresh in a moment.
        </p>
      </div>
    );
  }

  const counts = await withOrgScope(ctx, async (s) => Policies.statusCounts(s));
  const total =
    counts.draft + counts.under_review + counts.published + counts.archived;

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link
          href="/policies/new"
          className={buttonVariants({ variant: "default" })}
        >
          Create policy
        </Link>
      </header>
      {total === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No policies yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You haven&apos;t created any policies. Start with one — you can
              always add more.
            </p>
            <Link
              href="/policies/new"
              className={buttonVariants({ variant: "default" })}
            >
              Create your first policy
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Draft", count: counts.draft },
            { label: "Under Review", count: counts.under_review },
            { label: "Published", count: counts.published },
            { label: "Archived", count: counts.archived },
          ].map((tile) => (
            <Card key={tile.label} className="min-h-[96px]">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {tile.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{tile.count}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
