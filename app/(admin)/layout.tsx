import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { requireAdmin } from "@/lib/auth/require-admin";

/**
 * Admin route-group layout (D-06 shell + L-01 authoritative gate).
 *
 * requireAdmin() runs FIRST — calls notFound() (HTTP 404) on non-admin role
 * per D-10 "advertise nothing". Defense-in-depth: middleware.ts also gates
 * via ADMIN_ROLE_REQUIRED_PATTERNS; this layout is the canonical source.
 *
 * /onboarding bypass — /onboarding/create-org lives at app/(admin)/onboarding/
 * (Plan 03-11) but must be reachable by signed-in users WITHOUT an admin
 * role yet (they're being onboarded into their about-to-be-created org).
 * Middleware's ADMIN_ROLE_REQUIRED_PATTERNS already excludes /onboarding
 * from the role-check 404 branch (it requires auth only); we mirror that
 * decision here at the layout level. The x-pathname header is injected by
 * middleware.ts (Plan 03-02) and is safe to read — middleware OVERWRITES
 * the header from req.nextUrl.pathname, clobbering any client-supplied
 * value (T-03-02-04 / T-03-09-03 mitigation).
 *
 * Sidebar-state cookie persistence — the shadcn sidebar primitive
 * (components/ui/sidebar.tsx, Plan 03-08) sets a cookie tracking the
 * expanded/collapsed state. We read it here BEFORE render so the
 * SidebarProvider opens in the persisted state — no flash of incorrect
 * collapse (FOIC). Plan 03-09 frontmatter documents the cookie name as
 * `sidebar:state`; the installed base-nova primitive sets it as
 * `sidebar_state` (underscore). We read the actual name set by the
 * primitive on disk. Default to expanded when the cookie is absent.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";

  // /onboarding bypass — user is mid-onboarding without an admin role yet.
  // Middleware still requires auth (ADMIN_URL_PATTERNS includes /onboarding)
  // but the layout-level admin-role gate would otherwise 404 a user who has
  // not been admin'd in their (about-to-be-created) org. See D-08.
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  if (!isOnboardingRoute) {
    await requireAdmin();
  }

  const cookieStore = await cookies();
  // sidebar:state — plan-documented cookie name. The installed shadcn
  // base-nova primitive (components/ui/sidebar.tsx) actually sets
  // `sidebar_state` (underscore); the colon form is the original shadcn
  // default that the plan tracked. Read the on-disk name.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <TooltipProvider>
        <AdminSidebar />
        <main className="flex flex-col flex-1 min-h-screen">
          <AdminTopbar>
            <OrganizationSwitcher hidePersonal />
            <UserButton />
          </AdminTopbar>
          <div className="p-6 flex-1">{children}</div>
        </main>
      </TooltipProvider>
    </SidebarProvider>
  );
}
