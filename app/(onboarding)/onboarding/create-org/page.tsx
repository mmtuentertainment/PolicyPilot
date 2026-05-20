// app/(onboarding)/create-org/page.tsx — Plan 03-11 Task 5, relocated
// in CR-PR3-#16 closure from app/(admin)/onboarding/create-org/page.tsx.
//
// D-08 — <CreateOrganization /> wrapper.
//
// Reachable by signed-in users WITHOUT an active org. Lives in the
// (onboarding) route group so the admin layout's requireAdmin() gate
// doesn't apply here — the decision is now PATH-STRUCTURAL instead of
// header-derived. Middleware enforces auth-required via the default
// chokepoint (no role check). See app/(onboarding)/layout.tsx for the
// full design note.
//
// Flow:
//   1. New user signs up → Clerk after-sign-in-url → /post-sign-in
//      (Plan 03-02 trampoline).
//   2. /post-sign-in detects orgId===null → redirect to /onboarding/create-org.
//   3. Clerk renders <CreateOrganization />. User types an org name, submits.
//   4. Clerk fires `organization.created` + `organizationMembership.created`
//      webhooks. The Phase 2 handler (app/api/webhooks/clerk/route.ts)
//      verifies via svix, inserts organizations row + users row.
//   5. Clerk redirects to afterCreateOrganizationUrl=/dashboard.
//   6. /dashboard mounts. If the user beats the webhook, getOrgContext()
//      throws and the W7 fallback panel meta-refreshes after 2s.
//
// This is the natural Phase 2 webhook live-smoke surface (SF-WHSEC-1 +
// webhook-live-smoke carry-forward closure) — Task 6 (checkpoint) walks
// the operator through running it end-to-end against a live Clerk
// dashboard webhook target.
import { CreateOrganization } from "@clerk/nextjs";

export default function CreateOrgPage(): React.JSX.Element {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-semibold mb-2">Create your organization</h1>
      <p className="text-muted-foreground mb-8 text-center max-w-md">
        Set up your workspace to start managing policies.
      </p>
      <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
    </div>
  );
}
