---
phase: 7
slug: crons-email
status: draft
shadcn_initialized: true
preset: base-nova / neutral / CSS-variables / no-prefix (components.json)
created: 2026-06-05
---

# Phase 7 — UI Design Contract

> Visual and interaction contract for the Phase 7 notification-bell UI.
> THIS IS A RECONCILIATION DOCUMENT — all decisions come from `07-BELL-UI-DESIGN.md`
> (D1–D8 LOCKED) and `07-CONTEXT.md` (D-01–D-13 LOCKED). Nothing in this file
> re-decides or re-litigates those decisions. The executor must read `07-BELL-UI-DESIGN.md`
> alongside this spec; this file translates that document into the canonical UI-SPEC
> template format consumed by `gsd-ui-checker`, `gsd-planner`, and `gsd-executor`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (style: base-nova) |
| Preset | base-nova / neutral / CSS-variables (components.json — `"style": "base-nova"`, `"baseColor": "neutral"`, `"cssVariables": true`) |
| Component library | `@base-ui/react@^1.4.1` (NOT Radix — no `asChild`, no `onSelect`; use `render` and `onClick`) |
| Icon library | `lucide-react@^1.16.0` |
| Font | Geist Sans (`--font-sans` / `--font-geist-mono`) |
| Config | Tailwind v4 CSS-first — tokens live in `app/globals.css`; NO `tailwind.config.*` |

---

## Spacing Scale

Declared values (multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px (`p-1`) | Icon gaps, count badge overlap offset |
| sm | 8px (`p-2`) | Panel header / footer inner padding |
| md | 16px | Default element spacing (not directly used in bell panel) |
| lg | 24px | Section padding (not used in bell panel) |
| xl | 32px | Layout gaps (not used in bell panel) |
| 2xl | 48px | Major section breaks (not used in bell panel) |
| 3xl | 64px | Page-level spacing (not used in bell panel) |

**Exception — 6px (`px-1.5`):** The bell's list items use `px-1.5 py-2` for item padding. This matches the existing `DropdownMenuItem` padding in `components/ui/dropdown-menu.tsx:91` (`px-1.5 py-1` label, `px-1.5 py-1` item) and is the established component-level exception to the 4-multiple grid. This is a documented exception; the checker's spacing dimension must not block on it.

**Bell-specific spacing from `07-BELL-UI-DESIGN.md` §3:**

| Context | Value | Class |
|---------|-------|-------|
| Panel content padding | 4–8px | `p-1` (list wrapper) |
| Panel list scroll container | 384px max height | `max-h-96 overflow-y-auto divide-y` |
| Item inner padding | 6px horizontal / 8px vertical | `px-1.5 py-2` |
| Item border-radius | 6px | `rounded-md` |
| Trigger badge position | −4px top / −4px right | `absolute -top-1 -right-1` |
| Trigger size | 32px | `size-8` (Button `size="icon"`) |
| Per-item mark-read button | 24px | `size-6` (Button `size="icon-xs"`) |
| Panel width (desktop) | 320px | `w-80` (explicit — default is `w-(--anchor-width)`) |
| Dropdown side offset | 4px | `sideOffset={4}` |

---

## Typography

Source: `07-BELL-UI-DESIGN.md` §3 + `app/globals.css` type scale (Tailwind v4 defaults via `@import "tailwindcss"`).

The app's full scale is the Tailwind v4 default (`text-xs`=12px, `text-sm`=14px, `text-base`=16px, `text-lg`=18px, `text-xl`=20px, `text-2xl`=24px). The bell uses this subset:

| Role | Class | Size | Weight | Line Height | Usage in Bell |
|------|-------|------|--------|-------------|---------------|
| Item title (unread) | `text-sm font-medium` | 14px | 500 | 1.5 (Tailwind default) | Notification title when unread |
| Item title (read) | `text-sm font-normal` | 14px | 400 | 1.5 | Notification title after mark-read (transient — list is unread-only via `listUnreadForUser`) |
| Secondary / timestamp | `text-xs text-muted-foreground` | 12px | 400 | 1.5 | Secondary metadata, timestamps, "N days overdue", "Due Mon DD" |
| Panel header | `text-sm font-semibold` | 14px | 600 | 1.25 | "Notifications" heading in panel header |
| CTA button | `text-sm` | 14px | 500 (Button default) | — | "Mark all read" footer button |

**Active weights in the bell: 400 (read/secondary), 500 (unread title / button), 600 (panel header).**
Font: Geist Sans (loaded via Next.js `--font-sans` custom property).

---

## Color

Source: `app/globals.css` `:root` block + `07-BELL-UI-DESIGN.md` §3. Light-mode only (Phase 7 scope; dark mode deferred).

| Role | CSS Token | OKLCH Value (light mode) | Usage |
|------|-----------|--------------------------|-------|
| Dominant (60%) | `--background` | `oklch(1 0 0)` — pure white | Page background, panel surface |
| Secondary (30%) | `--card` / `--muted` | `oklch(1 0 0)` / `oklch(0.97 0 0)` | Panel popup background (`bg-popover` = same as `--background`), item hover (`focus:bg-accent` = `--accent` = `oklch(0.97 0 0)`) |
| Accent | `--accent` | `oklch(0.97 0 0)` — near-white warm gray | Item hover/focus state only (`focus:bg-accent focus:text-accent-foreground`). NOT used for the unread badge. |
| Destructive | `--destructive` | `oklch(0.577 0.245 27.325)` — red | Unread-count badge (`Badge variant="destructive"`). Used for the count badge ONLY. |
| Foreground | `--foreground` | `oklch(0.145 0 0)` — near-black | Item title text |
| Muted foreground | `--muted-foreground` | `oklch(0.556 0 0)` — medium gray | Secondary metadata, timestamps, "N unread" subheading |
| Border | `--border` | `oklch(0.922 0 0)` — light gray | Item dividers (`divide-y`), panel ring |
| Ring / Focus | `--ring` | `oklch(0.708 0 0)` — medium gray | focus-visible ring on trigger + items (base-ui handles this automatically via `button.tsx`) |

**Accent reserved for:** item hover/focus background state only. The unread-count badge uses `--destructive` (red), NOT accent. There is no other accent use in this component.

**Contrast notes (from `07-BELL-UI-DESIGN.md` §8):** White text on the red badge meets ≥4.5:1. Muted-gray secondary (`oklch(0.556 0 0)`) on white background (`oklch(1 0 0)`) meets ≥4.5:1.

---

## Copywriting Contract

Source: `07-BELL-UI-DESIGN.md` §5 + §7 (LOCKED).

| Element | Copy |
|---------|------|
| Primary CTA | "Mark all read" (footer button; disabled when count === 0) |
| Panel heading | "Notifications" |
| Panel subheading | "{N} unread" (only shown when count > 0; `text-muted-foreground`) |
| Empty state heading | "You're all caught up" |
| Empty state body | (no second line at MVP — heading alone is sufficient; `BellOffIcon` precedes it) |
| Error state | "Unable to load notifications. Please try again." + a retry action (rendered in a `Card` with destructive border — no `Alert` component exists) |
| Trigger aria-label | "Notifications" |
| Badge sr-only text | "{N} unread notifications" |
| Live region (sr-only) | "{N} unread notification{s}" — polite, updated on count change |
| Per-item mark-read sr-only | "Mark as read" |
| Destructive confirmation | N/A — mark-read and mark-all-read are non-destructive (no audit record is deleted or modified; `notifications.read` is a mutable flag, explicitly NOT in `IMMUTABLE_TABLES` per D-12 / ADR-018) |

**Per-type item titles (LOCKED from `07-BELL-UI-DESIGN.md` §5):**

| Type | Title | Secondary metadata copy |
|------|-------|-------------------------|
| `policy_assigned` | "New policy assigned" | — |
| `policy_updated` | "Policy updated" | "v{n}" if `payload_json.versionNumber` present |
| `ack_reminder` | "Acknowledgment reminder" | "{n} days overdue" if `payload_json.daysOverdue` present |
| `review_due` | "Review due soon" | "Due {Mon DD}" from `payload_json.dueDate` |

---

## Registry Safety

Source: `components.json` (verified 2026-06-05). `"registries": {}` — empty object; no third-party registries declared.

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | button, badge, dropdown-menu, sheet, skeleton, card, separator, tooltip (all already installed in `components/ui/`) | not required (official registry) |
| Third-party | none | not applicable — no third-party registry declared in `components.json` |

`@base-ui/react` and `lucide-react` are first-party dependencies already in `package.json` and vetted through prior phases. No new registry entries are introduced by the bell UI. Registry vetting gate: **not applicable**.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Bell-Specific Contract (Extension)

The sections below extend the template with the bell component's full design contract. The executor must implement from this section directly — it is prescriptive, not exploratory.

---

### Scope: IN vs DEFERRED

**IN (Phase 7 bell MVP):**
- Bell trigger button with overlaid unread-count badge
- Desktop: `DropdownMenu` panel (320px, right-aligned)
- Mobile (<640px): `Sheet` panel (right side)
- Per-type item rendering with deep-link click-through
- Per-item mark-read (secondary `CheckIcon` button)
- Mark-all-read footer action (D1 — operator-approved 2026-06-05)
- Empty / loading / error states
- Scroll-on-overflow (`max-h-96 overflow-y-auto`)
- Full accessibility (§ Accessibility below)
- Mount points: admin header + employee header

**DEFERRED (out of Phase 7):**
- `/notifications` "view all" page (not built, not scoped)
- Notification preferences / unsubscribe surface
- Retention / expiration / auto-clear
- Grouping by type or policy
- Reviewer-header bell (reviewers receive no Phase 7 notifications — D6)
- Real-time push (SSE / websocket / polling)

---

### Backend / API Contract the Bell Depends On

All `OrgScope`-bound, RLS-enforced (`org_id` in every WHERE; `withOrgScope` sets JWT claims).

| Method | State | Signature / Notes |
|--------|-------|-------------------|
| `Notifications.listUnreadForUser(s, userId)` | **LIVE** (`notifications.ts:22`) | Returns full unread rows for `(org_id=s.orgId, user_id=userId, read=false)`. Drives count + list. |
| `Notifications.markRead(s, id)` | planned in **07-04** | `UPDATE … SET read=true WHERE id=:id AND org_id=s.orgId`. |
| `Notifications.markAllReadForUser(s, userId)` | **NEW — D1 (+1 to 07-04)** | `UPDATE notifications SET read=true WHERE org_id=s.orgId AND user_id=userId AND read=false`. One statement, org-scoped, idempotent. |

**Server Actions** (mirror `acknowledgePolicyAction` shape — typed `ActionState`, zod-validated, `revalidatePath` OUTSIDE try/catch):

```typescript
// markNotificationReadAction(id: string)
// → zod id → withOrgScope(ctx, s => Notifications.markRead(s, id))
// → revalidatePath(<bell layout path>)

// markAllNotificationsReadAction()
// → withOrgScope(ctx, s => Notifications.markAllReadForUser(s, ctx.userId))
// → revalidatePath(<bell layout path>)
```

**Architecture (server/client boundary — REQUIRED):**
- A Server Component (the layout, or a thin server wrapper inside it) calls `listUnreadForUser` and passes `unread` array and `unread.length` as props to a Client `<NotificationBell>` (`"use client"`).
- Data fetch is `server-only`. The interactive dropdown is client-side.
- Do NOT call the repository from a client component.
- A small client deep-link helper `notificationHref(type, policyId)` (see Per-Type Rendering) lives in the client component — no URL stored in the row (D8).

**`revalidatePath` scope:** The action must revalidate the path whose layout renders the bell. Revalidate `/dashboard` for admin persona and `/my-policies` for employee persona (or the applicable layout segment). Pass the current path or persona indicator into the action. No `revalidateTag` / `updateTag` — those are deferred (D7).

---

### Component Structure

#### Trigger

```
<Button variant="ghost" size="icon" className="relative" aria-label="Notifications"
        aria-controls="{panel-id}">
  <BellIcon className="size-5" aria-hidden />
  {count > 0 && (
    <Badge variant="destructive"
           className="absolute -top-1 -right-1 size-5 rounded-full p-0 text-[10px] flex items-center justify-center">
      {count > 9 ? '9+' : count}
      <span className="sr-only">{count} unread notifications</span>
    </Badge>
  )}
</Button>
```

- `Button` from `@base-ui/react/button` (via `components/ui/button.tsx`); `size="icon"` = 32px (`size-8`)
- Badge is `variant="destructive"` — red, white text

#### Desktop Panel (`DropdownMenu` — base-ui)

Wire exactly like `components/policy/PolicyTransitionMenu.tsx`:

```
<DropdownMenu open={open} onOpenChange={setOpen}>
  <DropdownMenuTrigger render={<the trigger button above />} />
  <DropdownMenuContent align="end" sideOffset={4} className="w-80 p-0">

    {/* Header */}
    <div className="flex items-center justify-between px-3 py-2 border-b">
      <span className="text-sm font-semibold">Notifications</span>
      {count > 0 && (
        <span className="text-xs text-muted-foreground">{count} unread</span>
      )}
    </div>

    {/* List */}
    <div className="max-h-96 overflow-y-auto divide-y" role="list">
      {unread.map(n => (
        <DropdownMenuItem key={n.id}
          onClick={() => markReadAndNavigate(n.id, notificationHref(n.type, n.policyId))}
          closeOnClick={false}
          className="px-1.5 py-2 rounded-md flex items-start gap-2"
          role="listitem">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{titleFor(n.type)}</p>
            {secondaryFor(n) && (
              <p className="text-xs text-muted-foreground">{secondaryFor(n)}</p>
            )}
          </div>
          <Button variant="ghost" size="icon-xs"
            onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
            aria-label="Mark as read">
            <CheckIcon aria-hidden />
          </Button>
        </DropdownMenuItem>
      ))}
    </div>

    {/* Footer */}
    <div className="px-3 py-2 border-t">
      <Button variant="ghost" size="sm"
        disabled={count === 0}
        onClick={markAllRead}
        className="w-full">
        Mark all read
      </Button>
    </div>

  </DropdownMenuContent>
</DropdownMenu>
```

**Critical base-ui wiring:**
- `<DropdownMenuTrigger render={<button />} />` — use `render`, NOT `asChild`
- `<DropdownMenuItem onClick={…} />` — use `onClick`, NOT `onSelect`
- `closeOnClick={false}` on items where the secondary mark-read button must not close the panel
- `w-80` is explicit and required — default is `w-(--anchor-width)` which matches the narrow trigger

#### Mobile Panel (`Sheet` — <640px)

```
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Notifications</SheetTitle>
      {count > 0 && <SheetDescription>{count} unread</SheetDescription>}
    </SheetHeader>
    <div className="flex-1 overflow-y-auto divide-y">
      {/* same item rendering as desktop */}
    </div>
    <SheetFooter>
      <Button variant="ghost" size="sm"
        disabled={count === 0}
        onClick={markAllRead}
        className="w-full">
        Mark all read
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

Sheet exports used: `Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription`
(verified in `components/ui/sheet.tsx`; `SheetTrigger` and `SheetClose` are also available but not needed here since the bell trigger is the `DropdownMenuTrigger` on desktop and a state-controlled open on mobile).

#### Mount Points (verified against repo)

| Persona | File | Slot | Position |
|---------|------|------|----------|
| Admin | `components/admin/AdminTopbar.tsx:67` | `<div className="flex items-center gap-2">{children}</div>` | First child → `[Bell][OrgSwitcher][UserButton]` |
| Employee | `app/(employee)/layout.tsx` header | Between "My Policies" title and `<UserButton/>` | Wrap right-aligned |

No bell on the reviewer header (D6 — reviewers receive no Phase 7 notifications).

---

### Per-Type Rendering + `payload_json`

**Deep-link helper** (client-side, no URL in DB row — D8):

```typescript
function notificationHref(type: NotificationType, policyId: string): string {
  // employee types → my-policies; review_due → admin policies
  return type === 'review_due'
    ? `/policies/${policyId}`
    : `/my-policies/${policyId}`;
}
```

Route existence verified: `/my-policies/[id]` (`app/(employee)/my-policies/[id]/`) and `/policies/[id]` (`app/(admin)/policies/[id]/`) both exist.

**Per-type rendering table:**

| Type | Item Title | Minimal `payload_json` shape | Secondary metadata | Deep-link destination |
|------|-----------|------------------------------|--------------------|-----------------------|
| `policy_assigned` | "New policy assigned" | `{ policyId: string, policyTitle: string }` | — | `/my-policies/{policyId}` |
| `policy_updated` | "Policy updated" | `{ policyId: string, policyTitle: string, versionNumber?: number }` | "v{n}" if present | `/my-policies/{policyId}` |
| `ack_reminder` | "Acknowledgment reminder" | `{ policyId: string, policyTitle: string, daysOverdue?: number }` | "{n} days overdue" if present | `/my-policies/{policyId}` |
| `review_due` | "Review due soon" | `{ policyId: string, policyTitle: string, dueDate: string }` | "Due {Mon DD}" | `/policies/{policyId}` |

**Read treatment:** Unread = `font-medium` (500) title. Read = `font-normal` (400). The list is `listUnreadForUser` so "read" treatment applies only transiently after an in-panel mark-read, before `revalidatePath` re-syncs. No separate "read items" section is shown.

**Backend coordination point:** The email + cron layer (plans 07-03/07-04) must guarantee these minimal `payload_json` fields. The bell does not store `acknowledgeUrl` or `reviewUrl` in the row (D8).

---

### Icons

Source: `07-BELL-UI-DESIGN.md` §3. All icons from `lucide-react@^1.16.0`.

| Use | Icon | Status |
|-----|------|--------|
| Bell trigger | `BellIcon` | Required — verified in lucide v1.x |
| Per-item mark-read | `CheckIcon` | Required — verified (`dropdown-menu.tsx:7` already imports it) |
| Empty state | `BellOffIcon` | Required — verify exists at build; fallback to `BellIcon` if missing |
| Per-type (optional): `policy_assigned` | `FilePlusIcon` | Nice-to-have — verify alias exists in `^1.16.0` at build; fall back to `BellIcon` + type label if missing |
| Per-type (optional): `policy_updated` | `FileTextIcon` | Nice-to-have — same fallback rule |
| Per-type (optional): `review_due` | `ClockIcon` | Nice-to-have — same fallback rule |
| Per-type (optional): `ack_reminder` | `BellRingIcon` | Nice-to-have — same fallback rule |

**Rule:** Do not block the bell on optional per-type icons. `BellIcon` as fallback is always correct. `CheckIcon` and `BellOffIcon` are required — if either is absent, that is a blocking issue.

All `[Xx]Icon` names are lucide v5 tree-shaking aliases (lucide-react v0.4xx+). `lucide-react@^1.16.0` is a major-version bump in lucide's new versioning scheme — confirm each alias at import time. `CheckIcon` is confirmed present (imported in `dropdown-menu.tsx:7`).

---

### Interaction Contract and Refresh

Source: `07-BELL-UI-DESIGN.md` §6 (LOCKED — D7).

| Interaction | Behavior |
|-------------|----------|
| Count + list data | Server-fetched (`listUnreadForUser`) → passed as props. Displayed count = `unread.length` from props. Do NOT mirror into client `useState`. |
| Click item | Marks item read AND navigates to deep-link via `markNotificationReadAction(id)` → `revalidatePath`. |
| Secondary `CheckIcon` button | Marks item read WITHOUT navigating. `e.stopPropagation()` required to prevent menu close on desktop. |
| "Mark all read" | Calls `markAllNotificationsReadAction()` → `revalidatePath`. Disabled when `count === 0`. |
| Optimistic count | Wrap count in `useOptimistic` — decrement on per-item mark-read, zero on mark-all. Server Action's `revalidatePath` re-syncs real props. On action failure, optimistic value reverts. |
| Refresh mechanism | `revalidatePath` only. NO polling, NO SSE, NO websocket, NO `revalidateTag`/`updateTag`. |
| Auto-mark-read on open | NEVER. Explicit user action required for every read state change. |

---

### States

Source: `07-BELL-UI-DESIGN.md` §7.

| State | Trigger | UI |
|-------|---------|-----|
| Empty | `unread.length === 0` | `BellOffIcon` (centered, `text-muted-foreground`) + "You're all caught up" (`text-sm text-center text-muted-foreground`). Full height of the scroll area centered. |
| Loading | Suspense / pending server fetch | `Skeleton` (circular) for the trigger count area + 3–4 `Skeleton` placeholder rows in the panel list. |
| Error | Data fetch throws | A `Card` with a destructive border (`border-destructive`) containing "Unable to load notifications. Please try again." + a retry button. No `Alert` primitive — use `Card` (verified: no `alert.tsx` in `components/ui/`). |
| Overflow | `unread.length > visible items` | Panel scrolls (`max-h-96 overflow-y-auto`). No item cap. No "View all" link (D2). Overflow at MVP volume is not expected. |

---

### Accessibility

Source: `07-BELL-UI-DESIGN.md` §8 (the accessibility section was "kept — it was strong").

| Requirement | Implementation |
|-------------|----------------|
| Trigger label | `aria-label="Notifications"` on the trigger button |
| Trigger panel link | `aria-controls="{panel-id}"` on trigger; panel has matching `id` |
| Badge count | Count digit visible; `<span className="sr-only">{count} unread notifications</span>` inside badge (screen readers read the sr-only span) |
| Live region | `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` updated when count changes. Polite (not assertive — these are not critical alerts). |
| Keyboard nav | Base-ui `Menu` provides arrow-key navigation, Enter/Space. Focus moves into panel on open; returns to trigger on close. |
| Per-item mark-read button | Keyboard-reachable; `aria-label="Mark as read"` (not hover-only). |
| Touch targets | Trigger = 32px (≥44px on mobile via touch-target expansion or `Sheet` context). Sheet items use full-width rows. |
| Contrast | White text on red badge ≥4.5:1. Muted-gray secondary on white ≥4.5:1. |
| Auto-mark-read | NEVER auto-mark-read on open. Always requires explicit user action. |
| No hover-only | All affordances (including per-item mark-read button) must be keyboard-reachable. |

**Mobile touch target note:** The 32px trigger (`size="icon"`) is below the 44px WCAG guideline on mobile. Implement a touch-target wrapper or `min-h-11 min-w-11` transparent hit area class on mobile, OR accept that the Sheet (which opens on mobile) uses full-row tap targets that meet the guideline. The trigger itself should have a touch target expansion.

---

### Verified Against Repo (2026-06-05)

Claims from `07-BELL-UI-DESIGN.md` §10–§11 re-verified during this UI-SPEC session:

| Claim | File:Line | Status |
|-------|-----------|--------|
| `components/ui/dropdown-menu.tsx` imports `@base-ui/react/menu`; Trigger = `MenuPrimitive.Trigger`; Item = `MenuPrimitive.Item` | `dropdown-menu.tsx:4,17,76` | CONFIRMED |
| `button.tsx` uses `@base-ui/react/button`; sizes `icon` (32px) and `icon-xs` (24px) present; variants `ghost`, `destructive` present | `button.tsx:1,28-30` | CONFIRMED |
| `notifications.ts:22` — `listUnreadForUser` LIVE | `notifications.ts:22-32` | CONFIRMED |
| `notifications.ts:34` — `markRead` is a throw-stub (Phase 7 to fill) | `notifications.ts:40-44` | CONFIRMED |
| `notifications.ts` — NO `markAllReadForUser` method | `notifications.ts` (full file) | CONFIRMED — D1 adds it |
| Components `button`, `badge`, `dropdown-menu`, `sheet`, `skeleton`, `card`, `separator`, `tooltip` all exist | `components/ui/*.tsx` glob | CONFIRMED (16 UI components found) |
| No `popover.tsx` or `alert.tsx` | `components/ui/*.tsx` glob | CONFIRMED — use DropdownMenu+Sheet / Card |
| `PolicyTransitionMenu.tsx` exists (base-ui wiring reference) | `components/policy/PolicyTransitionMenu.tsx` | CONFIRMED |
| Admin mount point: `AdminTopbar.tsx:67` `<div className="flex items-center gap-2">{children}</div>` | `AdminTopbar.tsx:67` | CONFIRMED |
| Employee mount point: `app/(employee)/layout.tsx` | exists | CONFIRMED |
| Routes `/my-policies/[id]` and `/policies/[id]` exist | `app/(employee)/my-policies/[id]/` + `app/(admin)/policies/[id]/` | CONFIRMED |
| `components.json` style: base-nova, no third-party registries | `components.json:4,24` | CONFIRMED (`"registries": {}`) |

**Drift notes:** None found. All doc §10–§11 claims hold against the current working tree.

---

### Plan-Home Gap (EXECUTOR / PLANNER: act on this before execute)

**This is a blocking gap — do not run `/gsd-execute-phase 7` until it is resolved.**

The bell UI component and `Notifications.markAllReadForUser` (D1) are NOT in any current plan. The existing `07-04` plan covers `Notifications.markRead` and `listUnreadForUser` (backend only), but the bell UI component itself (`<NotificationBell>`, the server wrapper, the two Server Actions, and the `markAllReadForUser` method) have no plan home.

**Resolution options (from `07-BELL-UI-DESIGN.md` §10):**
1. Run `/gsd-plan-phase 7 --gaps` → add `07-08` as a new bell-UI plan.
2. Amend `07-04` to include the bell UI component + `markAllReadForUser`.

**Required deliverables for the new/amended plan:**
- `Notifications.markAllReadForUser(s, userId)` — one `UPDATE`, org-scoped, idempotent
- `markNotificationReadAction(id)` Server Action — zod + `withOrgScope` + `revalidatePath`
- `markAllNotificationsReadAction()` Server Action — same pattern
- `<NotificationBell>` client component — trigger, DropdownMenu (desktop), Sheet (mobile), states
- Server wrapper in admin layout + employee layout (data fetch → props → `<NotificationBell>`)
- Mount the component in `AdminTopbar.tsx` children slot + `app/(employee)/layout.tsx` header
- TEST-DB assertion for `markAllReadForUser` (alongside the R7-6 `markRead` test in `check-crons-email.ts`)

---

*Reconciled by Claude Code (Sonnet 4.6), 2026-06-05, from `07-BELL-UI-DESIGN.md` D1–D8 (all LOCKED) + live repo verification. All values pre-populated from upstream artifacts; zero user questions required.*
