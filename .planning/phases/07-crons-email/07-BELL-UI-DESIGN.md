# Phase 7 — Notification-Bell UI: Tightened Design Decisions (corrected)

**For:** `/gsd-ui-phase 7` (this is the clean design input → reconcile into `07-UI-SPEC.md`).
**Provenance:** ChatGPT design (`report.html`) → Claude read-only review against the live repo → corrections folded in here. Date: 2026-06-05.
**Status:** Design decisions LOCKED except where marked “operator confirm.” All component/API/route facts verified first-hand against the working tree (file:line cited in §10).

> **Scope guardrail:** Phase 7 R7-6 is *unread count + mark-read*. This spec stays inside that, plus one operator-approved +1 (`markAllReadForUser`). Everything bigger is in §9 Deferred. The backend is LOCKED (cron/idempotency/recipients/schema) — this is UI + a single backend method.

---

## 0. Decision ledger (corrections applied)

| # | Decision | Status |
|---|----------|--------|
| D1 | **Mark all read = IN**, backed by a new `markAllReadForUser(s, userId)` (one org-scoped `UPDATE`) + `markAllNotificationsReadAction`. A conscious +1 beyond D-12's `markRead(id)`. | LOCKED (operator-approved 2026-06-05) |
| D2 | **No “View all” / `/notifications` page.** That route does not exist and is not in Phase 7/8 scope. Overflow = the panel scrolls (`max-h-96 overflow-y-auto`). | LOCKED |
| D3 | **`notifications.user_id` is always the real recipient**, never empty. The cron's `userId=''` is only the synthesized `OrgContext` *scope*; 07-04's FK audit already prevents writing it to any FK. (Corrects ChatGPT Part-B #3.) | LOCKED (fact) |
| D4 | **Components are `@base-ui/react`, not Radix.** No `asChild` (use `render`), no Radix `onSelect` (use `onClick`). Mirror the working `components/policy/PolicyTransitionMenu.tsx` for exact wiring. | LOCKED |
| D5 | **No notification preferences / unsubscribe surface.** Transactional reminders; MVP has no settings (CONTEXT specifics). Dropped entirely. | LOCKED |
| D6 | **Bell mounts for `admin` + `employee` only.** Reviewers receive no notifications in Phase 7 (`review_due`→admins, D-06) → no bell on the reviewer header. Revisit only if reviews are later routed to reviewers. | LOCKED (revisit = backlog) |
| D7 | Refresh = **Server Component fetch → props → client bell**; mark actions = **Server Action + `revalidatePath`**; transient feedback = **`useOptimistic`** (not a `useState` mirror of the count). **No polling/SSE.** If tags are ever introduced it's `revalidateTag` (Next 15), never `updateTag` (that's Next 16 Cache Components). | LOCKED |
| D8 | Deep-links derived from `type`+`policyId`; `payload_json` stores only the minimal fields the bell needs (see §5). `acknowledgeUrl`/`reviewUrl` are NOT needed in the row for the bell. | LOCKED (backend coordinates) |

---

## 1. Scope — IN vs DEFERRED

**IN (Phase 7 bell MVP):** bell trigger + unread-count badge · desktop dropdown panel · mobile sheet · per-type item rendering with deep-link click-through · per-item mark-read · **mark-all-read** (D1) · empty/loading/error states · scroll-on-overflow · full a11y.

**DEFERRED (see §9):** `/notifications` “view all” page · notification preferences/unsubscribe · retention/expiration/auto-clear · grouping by type/policy · reviewer-header bell · real-time push.

---

## 2. Backend / API contract the UI depends on

All `OrgScope`-bound, RLS-enforced (org_id in every WHERE; `withOrgScope` sets the JWT claims).

| Method | State | Notes |
|--------|-------|-------|
| `Notifications.listUnreadForUser(s, userId)` | **LIVE** (`notifications.ts:22`) | Returns full unread rows for `(org_id=s.orgId, user_id=userId, read=false)`. Drives the count + list. |
| `Notifications.markRead(s, id)` | planned in **07-04** | `UPDATE … SET read=true WHERE id=:id AND org_id=s.orgId`. |
| `Notifications.markAllReadForUser(s, userId)` | **NEW — D1 (+1 to 07-04)** | `UPDATE notifications SET read=true WHERE org_id=s.orgId AND user_id=userId AND read=false`. One statement, org-scoped, idempotent. |

**Server Actions** (mirror the repo's `acknowledgePolicyAction` shape — typed `ActionState`, zod-validated, `revalidatePath` OUTSIDE try/catch):
- `markNotificationReadAction(id: string)` → zod id → `withOrgScope(ctx, s => Notifications.markRead(s, id))` → `revalidatePath(<bell layout path>)`.
- `markAllNotificationsReadAction()` → `withOrgScope(ctx, s => Notifications.markAllReadForUser(s, ctx.userId))` → `revalidatePath(<bell layout path>)`.

**Architecture (server/client split — REQUIRED):**
- A **Server Component** (the layout, or a thin server wrapper inside it) calls `const ctx = await getOrgContext(); const unread = await withOrgScope(ctx, s => Notifications.listUnreadForUser(s, ctx.userId))` and passes `unread` (+ `unread.length`) as **props** to a **Client** `<NotificationBell>` (`"use client"`). The data fetch is `server-only`; the interactive dropdown is client. Do not call the repo from a client component.
- A small client deep-link helper: `notificationHref(type, policyId)` (§5) — no URL stored in the row.

---

## 3. Design system (deltas only — reuse the app's tokens)

- **Color:** unread-count badge = `Badge variant="destructive"` (red `--destructive`). Timestamps/secondary metadata = `text-muted-foreground`. Dividers = `--border` (`divide-y`). Focus = `--ring` (base-ui focus-visible already wired in `button.tsx`). Light-mode only.
- **Spacing:** panel content padding `p-1`–`p-2`; list `max-h-96 overflow-y-auto divide-y`; item `px-1.5 py-2` (match `dropdown-menu.tsx` item paddings); `rounded-md` items.
- **Typography:** item title `text-sm`, `font-medium` when unread (normal when read); secondary metadata + timestamp `text-xs text-muted-foreground`. Geist Sans.
- **Icons (`lucide-react@^1.16.0`):** trigger = `BellIcon`; per-item mark-read = `CheckIcon`; empty = `BellOffIcon`. Optional per-type icons (`FilePlusIcon`/`FileTextIcon`/`ClockIcon`/`BellRingIcon`) are *nice-to-have* — **verify each alias exists in 1.16.0 at build**; if any is missing, fall back to `BellIcon` + the type label. (Don't block on type icons.)
- **Sizes:** trigger = `Button variant="ghost" size="icon"` (32px, `button.tsx:28`); per-item mark-read = `size="icon-xs"` (24px, `button.tsx:29`).

---

## 4. Component structure (base-ui-correct)

**Trigger** (ghost icon button, relative, with overlaid count badge):
- `<Button variant="ghost" size="icon" className="relative" aria-label="Notifications">` containing `<BellIcon className="size-5" aria-hidden />` and, when `count>0`, `<Badge variant="destructive" className="absolute -top-1 -right-1 …">{count>9?'9+':count}<span className="sr-only">{count} unread notifications</span></Badge>`.

**Desktop = `DropdownMenu`** (base-ui — wire exactly like `PolicyTransitionMenu.tsx`):
- `<DropdownMenu>` controlled via `open`/`onOpenChange` (base-ui Root supports these).
- `<DropdownMenuTrigger render={<the trigger button/>} />` — **`render`, not `asChild`.**
- `<DropdownMenuContent align="end" sideOffset={4} className="w-80 p-0">` — note Content defaults to `w-(--anchor-width)`, so the explicit `w-80` is required.
- Header row (`Notifications` + `{count} unread`), then the list, then a footer.
- **List items** = `<DropdownMenuItem onClick={() => markReadAndNavigate(n.id, href)}>` — **`onClick`, not `onSelect`.** The per-item secondary mark-read uses a nested `<Button size="icon-xs">` with `onClick={(e)=>{ e.stopPropagation(); markRead(n.id) }}`; set the item's `closeOnClick={false}` (base-ui) so the secondary action doesn't close the menu.
- **Footer:** `<Button variant="ghost" size="sm" disabled={count===0} onClick={markAllRead}>Mark all read</Button>`. **No “View all”** (D2).

**Mobile (<640px) = `Sheet`** (right side): `<Sheet open onOpenChange>` → `<SheetContent side="right">` (the panel container — required) → `<SheetHeader><SheetTitle>Notifications</SheetTitle>{count>0 && <SheetDescription>{count} unread</SheetDescription>}</SheetHeader>` → scrollable list (`flex-1 overflow-y-auto`) → `<SheetFooter>` with the same Mark-all-read button. Exports confirmed: `Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription` (`sheet.tsx`).

**Mount points (verified):**
- Admin → `components/admin/AdminTopbar.tsx`, the right `<div className="flex items-center gap-2">{children}</div>` slot, **first** → `[Bell][OrgSwitcher][UserButton]`.
- Employee → `app/(employee)/layout.tsx` header, between the “My Policies” title and `<UserButton/>` (wrap right-aligned).

---

## 5. Per-type rendering + minimal `payload_json`

Deep-link helper: `notificationHref(type, policyId)` → employee types → `/my-policies/${policyId}`; `review_due` → `/policies/${policyId}` (admin).

| Type | Title | Minimal `payload_json` | Secondary metadata | Deep-link | Notes |
|------|-------|------------------------|--------------------|-----------|-------|
| `policy_assigned` | “New policy assigned” | `{ policyId, policyTitle }` | — | `/my-policies/[policyId]` | recipient = assigned employee |
| `policy_updated` | “Policy updated” | `{ policyId, policyTitle, versionNumber? }` | “v{n}” if present | `/my-policies/[policyId]` | recipient = already-assigned employee |
| `ack_reminder` | “Acknowledgment reminder” | `{ policyId, policyTitle, daysOverdue? }` | “{n} days overdue” if present | `/my-policies/[policyId]` | recipient = unacked employee |
| `review_due` | “Review due soon” | `{ policyId, policyTitle, dueDate }` | “Due {Mon DD}” | `/policies/[policyId]` | recipient = **admins** (D-06) |

- Every type needs only `policyId` + `policyTitle`; the URL is derived (not stored). `acknowledgeUrl`/`reviewUrl` are **not** stored in the row (D8). The backend (07-03/07-04) should guarantee these minimal fields in `payload_json` — that's the one coordination point between the bell and the email layer.
- Read treatment: unread = `font-medium` title; read = normal weight + slightly muted. (No separate “read” section needed at MVP — the list is unread-only via `listUnreadForUser`, so “read” treatment matters only transiently after an in-panel mark-read before revalidate.)

---

## 6. Interaction & refresh

- **Count + list:** server-fetched (`listUnreadForUser`) → props. The displayed count is `unread.length` from props (re-renders on `revalidatePath`). Do **not** mirror it into client `useState` (stale-prop risk, M1).
- **Per-item:** clicking an item marks it read **and** navigates to the deep-link. A secondary `CheckIcon` button marks read **without** navigating (`stopPropagation`).
- **Mark all:** footer button → `markAllNotificationsReadAction()` (D1).
- **Immediate feel:** wrap the count in `useOptimistic` — decrement on mark-read / zero on mark-all; the Server Action's `revalidatePath` then re-syncs the real props. On action failure, the optimistic value reverts.
- **`revalidatePath` scope (important):** the action must revalidate the path whose layout renders the bell. Because the bell sits in the admin and employee **layouts**, revalidate the relevant root for the active persona (e.g. `revalidatePath('/dashboard')` / `revalidatePath('/my-policies')`, or the layout segment). Pass the current path (or persona) into the action so it revalidates the right tree. (Cross-persona staleness is a non-issue — a user is one persona per session.) **No `revalidateTag`/`updateTag`** unless a tag scheme is deliberately added.
- **No polling / SSE / websockets.** Daily-frequency notifications don't warrant a realtime layer, and the repo has none.

---

## 7. States

- **Empty** (`unread.length === 0`): `BellOffIcon` + “You’re all caught up”.
- **Loading:** `Skeleton` for the trigger (circular) + 3–4 placeholder rows.
- **Error:** a `Card` with a destructive border + “Unable to load notifications. Please try again.” + a retry. (No `Alert` primitive exists — use `Card`.)
- **Overflow:** the panel scrolls (`max-h-96 overflow-y-auto`). **No 8-item cap and no “View all” link** (D2). If the unread list is ever genuinely huge, that's a Deferred “view all page,” not MVP.

---

## 8. Accessibility (kept — it was strong)

- Trigger: `aria-label="Notifications"` + `aria-controls` → panel id. Count badge wrapped in `sr-only` text (“{n} unread notifications”).
- A separate polite live region: `<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">` updated when the count changes (polite, not assertive — these aren't critical alerts).
- Menu/keyboard semantics come from base-ui `Menu` (arrow-key nav, Enter/Space). Focus moves into the panel on open and returns to the trigger on close.
- Contrast: white text on the red badge; muted-gray secondary on white — ≥4.5:1.
- **No hover-only affordances** — the per-item mark-read button is keyboard-reachable with an `sr-only` label. Never auto-mark-read on open.
- Touch targets ≥44px on mobile; mobile uses the full-height `Sheet`.

---

## 9. Deferred / explicitly out of Phase 7

- **`/notifications` “view all” page** — not built, not scoped (Phase 8 owns dashboards/reports; a notifications page isn't planned).
- **Notification preferences / unsubscribe** — transactional MVP, no settings surface (CONTEXT specifics).
- **Retention / expiration / auto-clear** — none in Phase 7; rows persist until read. (Future cleanup-cron candidate, like the deferred `qa_citation_grants` cleanup.)
- **Grouping** (by type/policy) — defer; not needed at MVP volume.
- **Reviewer-header bell** — reviewers receive no notifications in Phase 7 (D-06).
- **Real-time push** (SSE/websocket/poll) — out; revalidate-on-action + on-navigation is sufficient.

---

## 10. Notes for `/gsd-ui-phase 7` + execution

- **Plan-home gap (act on this):** the bell *backend* is plan `07-04` (`markRead` + `listUnreadForUser`), but the **bell UI component is not in any current plan** (D-12 deferred the UX to this ui-phase). After `07-UI-SPEC.md` is produced, the bell component **+ the `markAllReadForUser` method/action (D1)** need a plan home — most likely `/gsd-plan-phase 7 --gaps` adding an `07-08` bell-UI plan, or amending `07-04`. Don't assume `/gsd-execute-phase 7` will build the bell without a plan for it.
- **base-ui, not Radix:** copy the trigger/item wiring from the working `components/policy/PolicyTransitionMenu.tsx`. Any `asChild`/`onSelect` in the sketch is wrong here.
- **Server/client boundary:** server fetch → props → client `<NotificationBell>` (§2). The repo enforces `server-only` on the repository.
- **Backend `markAllReadForUser`** is the single new query (§2) — org-scoped single `UPDATE`; covered by a TEST-DB assertion alongside the R7-6 markRead test.
- **Cron `userId` (kill the misread):** `notifications.user_id` is the recipient (real, NOT NULL). Nothing writes an empty `user_id`. No schema/FK concern here.

---

## 11. Verified-against-repo (so the next session can trust this)

- Components exist: `components/ui/{button,badge,dropdown-menu,sheet,skeleton,card,separator,tooltip}.tsx`. **No `popover`/`alert`** — use DropdownMenu+Sheet / Card.
- `dropdown-menu.tsx:4` imports `@base-ui/react/menu`; Trigger = `MenuPrimitive.Trigger` (`render`, no `asChild`); Item = `MenuPrimitive.Item` (`onClick`, no Radix `onSelect`). `button.tsx:1` = `@base-ui/react/button`; sizes incl. `icon`, `icon-xs`; variants incl. `ghost`, `destructive`, `link`.
- `notifications.ts:15-45` = `listAll`, `listUnreadForUser` (live), `create`+`markRead` (stubs). **No `markAllRead`** → D1 adds it.
- Routes confirmed: `/my-policies/[id]` (employee), `/policies/[id]` (admin). `notifications.user_id` NOT NULL (recipient).
- Mount points: `components/admin/AdminTopbar.tsx` children slot; `app/(employee)/layout.tsx` header.

---

*Compiled by Claude Code (Opus 4.8), 2026-06-05, from ChatGPT's `report.html` + a read-only repo validation. Decisions D1–D8 locked (D1 operator-approved this session). Hand this to `/gsd-ui-phase 7`.*
