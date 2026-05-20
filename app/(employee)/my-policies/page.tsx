// 03-G3 T9 — Phase 5 employee-portal stub.
//
// /post-sign-in (Plan 03-02, app/(auth)/post-sign-in/page.tsx) routes
// users with role='employee' OR role='reviewer' to /my-policies. The
// real employee portal lands in Phase 5 (REQ-acknowledgment-tracking).
// Until then, this stub returns 200 so a freshly-onboarded non-admin
// user doesn't hit a 404 trap on the canonical sign-in landing page.
//
// No layout file is needed for the (employee) route group — the root
// layout (app/layout.tsx) applies as fallback. Authentication is
// enforced by middleware.ts's default chokepoint branch (no role check;
// just userId presence), which is appropriate for any user that has a
// session, regardless of role.
//
// Closes the MYPOL-STUB gap surfaced during UAT-4 when Org B's brand-new
// sign-up hit the trampoline with stale role=employee before the
// organizationMembership.created webhook landed the role=admin mirror.
// The race window itself is now closed by 03-G3 T7 (SF-W5 fix), but the
// underlying /my-policies route still needs to return 200 for any
// legitimate non-admin user (e.g., real employees once Org admins start
// inviting team members in Phase 5+).
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MyPoliciesPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Employee portal — coming soon</CardTitle>
          <CardDescription>Launching in Phase 5</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            You&apos;ll be able to see and acknowledge policies assigned to you here
            once the employee portal ships. In the meantime, contact your administrator
            with any policy questions.
          </p>
          <p className="text-xs">
            If you&apos;re an administrator, you may have landed here by accident —
            your role is still being set up. Try signing out and back in.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
