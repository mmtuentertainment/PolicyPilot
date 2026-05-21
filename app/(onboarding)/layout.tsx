// app/(onboarding)/layout.tsx — CR-PR3-#16 closure (route-group split).
//
// The /onboarding routes were previously nested under app/(admin)/onboarding/
// and the admin layout's requireAdmin() gate was conditionally bypassed by
// reading the x-pathname header (header-derived role bypass — fragile if a
// future refactor breaks the middleware's header-overwrite, AND a documented
// anti-pattern even when middleware overwrites are sound).
//
// This route group (app/(onboarding)/) puts /onboarding/* on its own layout
// chain so the admin layout calls requireAdmin() unconditionally for
// everything under (admin)/ and onboarding routes are gated purely by
// middleware authentication (auth required, role-NOT required). The
// decision is PATH-STRUCTURAL, not header-derived.
//
// Directory layout (CR-PR3-postreview):
//   app/
//   ├── (admin)/                          ← admin route group; layout calls requireAdmin()
//   │   ├── layout.tsx
//   │   ├── dashboard/page.tsx            ← URL /dashboard
//   │   └── policies/...
//   └── (onboarding)/                     ← onboarding route group; NO admin gate
//       ├── layout.tsx                    (this file)
//       └── onboarding/create-org/page.tsx ← URL /onboarding/create-org
//
// Route groups in parens do NOT add URL segments. The real `onboarding/`
// directory IS what makes the URL `/onboarding/create-org`. An earlier
// version of this commit accidentally collapsed the URL to `/create-org`
// by dropping the `onboarding/` directory — the pr-review-toolkit agents
// caught that as a BLOCK + the post-sign-in redirect target broke.
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
