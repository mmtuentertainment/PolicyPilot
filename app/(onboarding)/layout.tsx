// app/(onboarding)/layout.tsx — CR-PR3-#16 closure.
//
// The /onboarding routes were previously nested under app/(admin)/ and the
// admin layout's requireAdmin() gate was conditionally bypassed by reading
// the x-pathname header (header-derived role bypass — fragile if a future
// refactor breaks the middleware's header-overwrite, AND a documented
// anti-pattern even when middleware overwrites are sound).
//
// This route group puts /onboarding/* on its own layout chain so the
// admin layout calls requireAdmin() unconditionally for everything under
// (admin)/ and onboarding routes are gated purely by middleware
// authentication (auth required, role-NOT required). The decision is
// PATH-STRUCTURAL, not header-derived.
//
// No UI chrome here — the page renders Clerk's <CreateOrganization />
// widget directly, plus its own minimal heading. We're inheriting the
// root layout (app/layout.tsx) for <html>/<body>/ClerkProvider scaffolding.
//
// Linked: middleware.ts removes /onboarding from ADMIN_URL_PATTERNS now
// that it doesn't need the admin-route branch for D-10 advertise-nothing;
// the default chokepoint at the bottom of clerkMiddleware handles the
// auth-required case via the existing redirect-to-sign-in logic.
import type { ReactNode } from 'react';

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return <>{children}</>;
}
