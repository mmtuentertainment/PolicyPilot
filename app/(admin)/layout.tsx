import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { requireAdmin } from "@/lib/auth/require-admin";

// Every admin route reads Clerk's session via requireAdmin() → headers(),
// AND reads the sidebar_state cookie below — both inherently dynamic. Next.js
// 15 still attempts static prerender on child pages unless the layout
// declares this explicitly; Vercel build prerender of /dashboard/consistency
// failed without it (ClerkAuthFailedError during DYNAMIC_SERVER_USAGE).
// Setting it here propagates to every page under (admin)/ so no per-page
// duplication is needed.
export const dynamic = "force-dynamic";

/**
 * Admin route-group layout (D-06 shell + L-01 authoritative gate).
 *
 * requireAdmin() runs unconditionally — calls notFound() (HTTP 404) on
 * non-admin role per D-10 "advertise nothing". Defense-in-depth:
 * middleware.ts also gates via ADMIN_ROLE_REQUIRED_PATTERNS; this layout
 * is the canonical source.
 *
 * CR-PR3-#16 closure (2026-05-20): /onboarding was previously nested
 * under app/(admin)/onboarding and bypassed requireAdmin() by reading
 * the x-pathname header. That header-derived role-bypass is now gone —
 * onboarding lives in its own (onboarding) route group with an auth-only
 * layout. The gate decision is path-structural instead of header-derived.
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
  await requireAdmin();

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
