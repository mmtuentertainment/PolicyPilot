// app/(employee)/layout.tsx — Plan 05-05 Task 1a.
//
// Minimal force-dynamic employee shell per SPEC In-Scope. NO admin role
// narrowing — admins can also be policy-assigned per SPEC. getOrgContext
// gate; middleware ADR-009 handles auth chokepoint upstream — this is the
// page-level fail-closed backup.
//
// Mirror of app/(admin)/layout.tsx shape, MINUS:
//   - admin-role gate — replaced with getOrgContext() (any-authenticated)
//   - AdminSidebar / AdminTopbar / sidebar_state cookie — employee surface
//     has no left rail per SPEC; navigation is contained inside
//     /my-policies header + /my-policies/ask link.
//   - OrganizationSwitcher — single-org users on the employee path; the
//     active-org switch is an admin-only affordance.
//
// `dynamic = "force-dynamic"` is non-negotiable: getOrgContext() reads
// headers() inherently. Without it, Vercel build prerender of
// /my-policies/[id] would fail with ClerkAuthFailedError per Phase 4
// PR #19 lesson documented in app/(admin)/layout.tsx:11-17.
//
// getOrgContext() throws ADR-026 BootstrapError subclasses (NotAuthenticated,
// OrgNotProvisioned, etc.) on no-session — middleware will have intercepted
// in normal flow per ADR-009, but defense-in-depth here keeps the page-
// level gate honest.
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { getOrgContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  await getOrgContext();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <span className="font-semibold">My Policies</span>
          <UserButton />
        </div>
      </header>
      <main className="container mx-auto p-6">{children}</main>
    </div>
  );
}
