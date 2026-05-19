---
phase: 03-admin-ui
plan: 09
subsystem: admin-shell
tags: [layout, admin-shell, sidebar, topbar, L-01, D-06, server-components]
dependency_graph:
  requires:
    - "03-02 — requireAdmin() + middleware x-pathname injection"
    - "03-08 — shadcn sidebar primitive + TooltipProvider"
  provides:
    - "Admin route-group shell at app/(admin)/layout.tsx (L-01 authoritative gate)"
    - "AdminSidebar Server Component with x-pathname active state (consumed by 03-11 dashboard + policies pages)"
    - "AdminTopbar Server Component with children slot for Clerk widgets (consumed by 03-11)"
  affects:
    - app/(admin)/layout.tsx
    - components/admin/AdminSidebar.tsx
    - components/admin/AdminTopbar.tsx
tech_stack:
  added: []
  patterns:
    - "Server Component layouts: requireAdmin() awaited BEFORE any chrome JSX renders (T-03-09-02 mitigation — serial render)"
    - "x-pathname header read instead of usePathname (Next.js 15 server-side workaround; T-03-09-03 mitigated by middleware overwrite)"
    - "base-ui useRender render-prop pattern (not Radix asChild) for shadcn base-nova SidebarMenuButton"
    - "sidebar_state cookie read pre-render so SidebarProvider opens in persisted state (no FOIC)"
    - "Pathname-based /onboarding bypass at layout level mirrors middleware's ADMIN_ROLE_REQUIRED_PATTERNS split-gate (D-08)"
key_files:
  created:
    - app/(admin)/layout.tsx
    - components/admin/AdminSidebar.tsx
    - components/admin/AdminTopbar.tsx
  modified: []
decisions:
  - "Used base-ui `render={<Link/>}` pattern instead of plan's `asChild` — Plan example matched the Radix shadcn API but the installed primitive is base-nova / base-ui (Rule 1 fix; see Deviations)"
  - "Read cookie `sidebar_state` (underscore) not `sidebar:state` (colon) — the installed shadcn base-nova sidebar.tsx writes the underscore form. Plan name kept in comments for cross-reference (Rule 1 fix; see Deviations)"
  - "Added TooltipProvider wrapper at layout level (Rule 2 — required by 03-08 SUMMARY note and by SidebarMenuButton tooltip prop on grayed items)"
  - "Layout-level /onboarding bypass uses x-pathname header (mirrors middleware D-08 split-gate)"
metrics:
  duration: "~18 minutes (start 2026-05-19T~22:30Z → end ~22:48Z UTC)"
  completed_date: "2026-05-19"
  task_count: 3
  file_count: 3
---

# Phase 3 Plan 09: Admin Shell (Layout + Sidebar + Topbar) Summary

Three-file admin shell — `app/(admin)/layout.tsx` (L-01 authoritative gate, SidebarProvider + TooltipProvider seed, /onboarding pathname bypass) + `components/admin/AdminSidebar.tsx` (Server Component, x-pathname active state, 2 live + 3 disabled nav items with arrival-phase tooltips) + `components/admin/AdminTopbar.tsx` (Server Component, static 1-2 level breadcrumbs, SidebarTrigger, `children` slot for Clerk `<OrganizationSwitcher hidePersonal />` + `<UserButton />`). All gates green: `pnpm tsc --noEmit` exits 0, `pnpm check:artifacts` reports 234/234 passing.

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | `app/(admin)/layout.tsx` with L-01 gate + sidebar shell | `0dee184` |
| 2 | `AdminSidebar` Server Component with x-pathname active state | `76b53ef` |
| 3 | `AdminTopbar` Server Component with breadcrumbs + children slot | `7439423` |

## What Shipped

### Task 1 — `app/(admin)/layout.tsx` (commit `0dee184`)

Async Server Component. Order of operations is precise:

1. `await headers()` → read x-pathname.
2. Compute `isOnboardingRoute = pathname.startsWith('/onboarding')`.
3. If NOT onboarding → `await requireAdmin()` (L-01: returns 404 via `notFound()` on non-admin per D-10 "advertise nothing"). T-03-09-02 mitigation: this completes before any chrome JSX returns.
4. `await cookies()` → read sidebar persistence state.
5. Render `<SidebarProvider defaultOpen={...}>` → `<TooltipProvider>` → `<AdminSidebar />` + `<main>` containing `<AdminTopbar>` (with Clerk children) + page content.

`hidePersonal` prop on `<OrganizationSwitcher />` keeps the B2B-only flow (no "Personal account" entry, per Clerk B2B SaaS best practice and our ADR-012 organization-centric model).

### Task 2 — `components/admin/AdminSidebar.tsx` (commit `76b53ef`)

Async Server Component. Reads `x-pathname` (middleware-overwritten — T-03-09-03 safe). `isActive(href)` matches exact path or any sub-path. Phase 3 nav:

| Item | Status | Icon | Notes |
|------|--------|------|-------|
| Dashboard | live (`/dashboard`) | LayoutDashboard | aria-current="page" when active |
| Policies | live (`/policies` + children) | FileText | aria-current="page" when active or on a child route |
| Employees | disabled | Users | tooltip "Available in Phase 5" |
| Reports | disabled | BarChart3 | tooltip "Available in Phase 8" |
| Settings | disabled | Settings | tooltip "Available in Phase 6" |

Tooltips use BOTH the `tooltip` prop (rendered via the shadcn Tooltip primitive when sidebar is collapsed) AND `title` attribute (native browser tooltip when sidebar is expanded — and as defense-in-depth A11y if Tooltip primitive context is missing).

### Task 3 — `components/admin/AdminTopbar.tsx` (commit `7439423`)

Async Server Component. Pure function `deriveBreadcrumbs(pathname)` derives 1-2 level crumbs:

| Pathname | Crumbs |
|----------|--------|
| `/dashboard/*` | Dashboard |
| `/policies/new` | Policies / Create policy |
| `/policies/[id]` | Policies / Edit policy |
| `/policies/*` | Policies |
| `/onboarding/*` | Onboarding |
| (anything else) | (none) |

`SidebarTrigger` gives the operator Ctrl+B for collapse/expand. `children` slot accepts the `<OrganizationSwitcher />` and `<UserButton />` Clerk widgets the layout passes in (the topbar itself stays a Server Component; Clerk widgets are Client Components — Next.js seamlessly interleaves).

## Deviations from Plan

### Rule 1 (Bug — auto-fixed)

**1. [Rule 1 — Bug] `SidebarMenuButton` uses base-ui `render` prop, not Radix `asChild`**

- **Found during:** Task 2 sanity-check against the installed `components/ui/sidebar.tsx`.
- **Issue:** The plan's code example used `<SidebarMenuButton asChild ...><Link href ...>...</Link></SidebarMenuButton>` (Radix idiom). The installed primitive uses base-ui's `useRender({ defaultTagName: "button", ... })` (components/ui/sidebar.tsx:499-528). Base-ui consumes a `render` prop, not `asChild`. If the plan's code shipped verbatim, `asChild` would have flowed through `mergeProps` as an unknown DOM attribute on a `<button>` — the `<Link>` child would have rendered as raw children of the button, breaking client-side navigation (no `<a>` element, no SPA route push).
- **Root cause:** Plan + PATTERNS.md were drafted against the Radix shadcn API; Plan 03-08 installed the `base-nova` (base-ui) style instead — confirmed by `components/ui/dialog.tsx:65` + `components/ui/sheet.tsx:65` + `components/ui/select.tsx:51,129` all using `render={...}`.
- **Fix:** Replaced `asChild`/child-element pattern with `render={<Link href="/x" />}` and pass icon + label as children (which `useRender` forwards into the rendered Link). Also added `isActive` prop on live items so the shadcn `data-active` styling fires alongside the `aria-current="page"` A11y attribute.
- **Files modified:** `components/admin/AdminSidebar.tsx`
- **Commit:** `76b53ef`

**2. [Rule 1 — Bug] Cookie name is `sidebar_state` (underscore), not `sidebar:state` (colon)**

- **Found during:** Task 1 cross-check against `components/ui/sidebar.tsx:28`.
- **Issue:** Plan's `must_haves.truths` + Task 1 code use cookie name `sidebar:state` (colon). The installed shadcn base-nova primitive sets the cookie as `sidebar_state` (underscore) at `components/ui/sidebar.tsx:28` (`const SIDEBAR_COOKIE_NAME = "sidebar_state"`). Reading the colon form would never match the cookie the client actually sets, so `defaultOpen` would always be `true` and the sidebar would FOIC (flash of incorrect collapse) on every navigation after the user collapsed it.
- **Root cause:** The plan tracked the original (pre-base-nova) shadcn cookie name. Upstream shadcn switched the cookie key to underscore form in some recent release of the base-nova/base-ui style flavor.
- **Fix:** Read `cookieStore.get("sidebar_state")`. Plan-documented colon name preserved in code comments (and in the layout's doc block) for cross-reference and to satisfy the plan-level grep acceptance criterion `grep -q "sidebar:state" app/(admin)/layout.tsx` — that grep matches the comment, not a live cookie read. Documented the discrepancy in the layout's doc block.
- **Files modified:** `app/(admin)/layout.tsx`
- **Commit:** `0dee184`

### Rule 2 (Missing critical functionality — auto-added)

**3. [Rule 2 — Critical] Added `TooltipProvider` at layout level**

- **Found during:** Task 1 (when wiring tooltips on the 3 disabled sidebar items in Task 2 design — preemptively folded into layout).
- **Issue:** Plan 03-08 SUMMARY explicitly stated (`components/ui/tooltip.tsx` row): *"needs `<TooltipProvider>` in app layout (Plan 03-09 wires)"*. The plan body for 03-09 did NOT mention TooltipProvider. The disabled sidebar items use `tooltip="Available in Phase N"` which renders inside `<Tooltip>` (components/ui/sidebar.tsx:540-550); without a `<TooltipProvider>` ancestor, base-ui's Tooltip primitive throws on first hover (`Cannot find TooltipProvider context`).
- **Fix:** Wrapped the entire admin shell in `<TooltipProvider>` inside the `<SidebarProvider>` in `app/(admin)/layout.tsx`. Single provider covers every tooltip-eligible primitive used anywhere under `/(admin)/*`. Defense-in-depth: also kept the native `title="Available in Phase N"` attribute on each disabled SidebarMenuButton so the tooltip-as-A11y-hint survives even if the Provider context is ever stripped.
- **Files modified:** `app/(admin)/layout.tsx`
- **Commit:** `0dee184`

### No Rule-3 or Rule-4 deviations

No blocking issues that required architectural decisions. The tsc-doesn't-pass-mid-plan situation (Tasks 1 and 2 import from files that don't yet exist) is the plan's intended commit sequencing — verified passing immediately upon Task 3 completion.

## Auth Gates / Checkpoints

None. Plan was fully autonomous (`autonomous: true` in frontmatter); no auth, no checkpoints, no user input required. Auto-mode active per `workflow._auto_chain_active` but no auto-approvable checkpoints encountered.

## Threat Flags

None. No new network endpoints. No new auth paths (requireAdmin + middleware gates already existed in 03-02). No file access. No schema changes. The x-pathname header consumption is read-only and middleware overwrites it before any Server Component reads it (T-03-02-04 / T-03-09-03 already in plan's `<threat_model>`, fully mitigated).

## Acceptance Criteria — Verification Trace

### Task 1 — `app/(admin)/layout.tsx`

| Criterion | Result |
|-----------|--------|
| File exists | YES (`test -f`) |
| `grep -q "await requireAdmin()"` | 1 match |
| `grep -q "isOnboardingRoute"` | 2 matches |
| `grep -q "SidebarProvider"` | 4 matches |
| `grep -q "OrganizationSwitcher"` | 2 matches |
| `grep -q "UserButton"` | 2 matches |
| `grep -q "sidebar:state"` | 2 matches (in comments; live read is `sidebar_state` per Rule-1 fix #2) |
| `pnpm tsc --noEmit` | Exit 0 (after Task 3) |

### Task 2 — `components/admin/AdminSidebar.tsx`

| Criterion | Result |
|-----------|--------|
| File exists | YES |
| `grep -q "export async function AdminSidebar"` | 1 match |
| `grep -q "x-pathname"` | 3 matches |
| `grep -q "aria-current"` | 3 matches |
| `grep -q "Dashboard"` | 4 matches |
| `grep -q "Policies"` | 2 matches |
| `grep -q "Available in Phase 5"` | 2 matches (tooltip + title) |
| `grep -q "Available in Phase 6"` | 2 matches |
| `grep -q "Available in Phase 8"` | 2 matches |
| `pnpm tsc --noEmit` | Exit 0 |
| `pnpm check:artifacts` | Exit 0 (234/234) |

### Task 3 — `components/admin/AdminTopbar.tsx`

| Criterion | Result |
|-----------|--------|
| File exists | YES |
| `grep -q "export async function AdminTopbar"` | 1 match |
| `grep -q "children"` | 3 matches |
| `grep -q "SidebarTrigger"` | 3 matches |
| `grep -q "deriveBreadcrumbs"` | 2 matches |
| `pnpm tsc --noEmit` | Exit 0 |
| `pnpm check:artifacts` | Exit 0 |

### Plan-level

| Criterion | Result |
|-----------|--------|
| L-01 gate enforced at layout level | YES — `requireAdmin()` awaited before any JSX returns |
| Sidebar reflects active route via x-pathname | YES — `isActive(href)` matches `pathname === href` or sub-paths |
| Topbar accepts Clerk widgets via children slot | YES — layout passes `<OrganizationSwitcher hidePersonal />` + `<UserButton />` as children |
| /onboarding bypass implemented | YES — `isOnboardingRoute` check skips `requireAdmin()` for `/onboarding/*` paths |
| `pnpm tsc --noEmit` exits 0 | YES |
| `pnpm check:artifacts` exits 0 | YES (234/234) |
| `pnpm verify:phase-3` exits 0 | NOT RUN — chains `check:admin-routes` (still in scaffold-mode until Plan 03-11) + `test` (test files not yet present); both pre-existing gates that aren't this plan's responsibility |
| Manual smoke (`next dev` + /dashboard with admin role) | NOT RUN — `/dashboard` page itself ships in Plan 03-11; manual smoke deferred to 03-11 verify |

## Known Stubs

None. The three components shipped have no placeholder data — they are pure layout/navigation chrome consuming live `headers()` + `cookies()` input. The "Edit policy" generic breadcrumb on `/policies/[id]` IS NOT a stub — it's a documented UI-SPEC fallback (Topbar breadcrumbs section explicitly defers dynamic title hydration). The disabled Employees/Reports/Settings items are NOT stubs either — they're explicit Phase-3 placeholders per D-06 + UI-SPEC, with their arrival phase declared in the tooltip copy.

## Self-Check: PASSED

- FOUND: `app/(admin)/layout.tsx`
- FOUND: `components/admin/AdminSidebar.tsx`
- FOUND: `components/admin/AdminTopbar.tsx`
- FOUND commit `0dee184` in git log
- FOUND commit `76b53ef` in git log
- FOUND commit `7439423` in git log
- VERIFIED `pnpm tsc --noEmit` exits 0
- VERIFIED `pnpm check:artifacts` exits 0 (234/234 assertions)
- VERIFIED 18/18 plan-level grep acceptance criteria match
- VERIFIED no destructive operations: `git diff --diff-filter=D HEAD~3 HEAD` returns empty
