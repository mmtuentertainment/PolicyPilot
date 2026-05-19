import { headers } from "next/headers";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

/**
 * AdminSidebar — Server Component (D-06).
 *
 * Reads x-pathname header injected by middleware.ts (Plan 03-02) so the
 * active item gets aria-current="page". Next.js 15 dropped server-side
 * usePathname; the middleware header is the documented workaround.
 *
 * T-03-09-03 (Tampering) mitigation: middleware OVERWRITES x-pathname from
 * req.nextUrl.pathname, clobbering any client-supplied value, so the
 * header read here is trustworthy.
 *
 * Phase 3 live items: Dashboard, Policies.
 * Phase 3 placeholder items (disabled, tooltip with arrival phase per
 *   UI-SPEC §Sidebar grayed-out items microcopy):
 *   Employees (Phase 5), Reports (Phase 8), Settings (Phase 6).
 *
 * Component-API note: shadcn base-nova's `SidebarMenuButton` uses base-ui's
 * `useRender` API (a `render` prop), NOT Radix's `asChild`. The marketing
 * pattern PATTERNS.md illustrates with `asChild` predates the base-nova
 * style install; we use `render={<Link ... />}` here. See plan deviation
 * Rule-1 fix #1 in the SUMMARY.
 */
export async function AdminSidebar() {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/";

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-3 font-semibold tracking-tight">
        PolicyPilot
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive("/dashboard")}
              aria-current={isActive("/dashboard") ? "page" : undefined}
              render={<Link href="/dashboard" />}
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              <span>Dashboard</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive("/policies")}
              aria-current={isActive("/policies") ? "page" : undefined}
              render={<Link href="/policies" />}
            >
              <FileText className="size-4" aria-hidden="true" />
              <span>Policies</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Placeholder items — disabled; arrival phase in tooltip per UI-SPEC microcopy. */}
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              tooltip="Available in Phase 5"
              title="Available in Phase 5"
              className="opacity-50 cursor-not-allowed"
            >
              <Users className="size-4" aria-hidden="true" />
              <span>Employees</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              tooltip="Available in Phase 8"
              title="Available in Phase 8"
              className="opacity-50 cursor-not-allowed"
            >
              <BarChart3 className="size-4" aria-hidden="true" />
              <span>Reports</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              disabled
              tooltip="Available in Phase 6"
              title="Available in Phase 6"
              className="opacity-50 cursor-not-allowed"
            >
              <Settings className="size-4" aria-hidden="true" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
