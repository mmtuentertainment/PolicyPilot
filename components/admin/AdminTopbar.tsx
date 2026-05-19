import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * AdminTopbar — Server Component (D-06).
 *
 * Renders a 1-2 level breadcrumb derived from x-pathname (middleware
 * injection per Plan 03-02). The `children` slot accepts the layout-
 * passed Clerk widgets (<OrganizationSwitcher /> + <UserButton />).
 *
 * The SidebarTrigger gives the operator a Ctrl+B keyboard shortcut to
 * collapse/expand the sidebar (defined in components/ui/sidebar.tsx).
 *
 * Per UI-SPEC §Topbar breadcrumbs, Phase 3 ships static 1- or 2-level
 * breadcrumbs only; deeper trees and dynamic policy-title hydration are
 * deferred to a Phase 8 polish pass.
 */
function deriveBreadcrumbs(
  pathname: string,
): Array<{ label: string; href?: string }> {
  if (pathname.startsWith("/dashboard")) return [{ label: "Dashboard" }];
  if (pathname.startsWith("/policies/new")) {
    return [
      { label: "Policies", href: "/policies" },
      { label: "Create policy" },
    ];
  }
  if (/^\/policies\/[^/]+$/.test(pathname)) {
    // /policies/[id] — second crumb is the policy's title which the topbar
    // doesn't have access to at this level. Generic label for Phase 3;
    // page-level hydration deferred per UI-SPEC § Topbar breadcrumbs.
    return [
      { label: "Policies", href: "/policies" },
      { label: "Edit policy" },
    ];
  }
  if (pathname.startsWith("/policies")) return [{ label: "Policies" }];
  if (pathname.startsWith("/onboarding")) return [{ label: "Onboarding" }];
  return [];
}

export async function AdminTopbar({ children }: { children: ReactNode }) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/";
  const crumbs = deriveBreadcrumbs(pathname);

  return (
    <header className="border-b">
      <div className="px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <SidebarTrigger className="-ml-1" />
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex items-center gap-3">
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
              {i < crumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
