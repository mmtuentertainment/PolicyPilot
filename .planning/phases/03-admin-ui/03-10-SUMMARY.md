---
phase: 03-admin-ui
plan: 10
subsystem: ui
tags: [components, tiptap, server-component, client-component, D-02, D-04, D-07, base-ui, base-nova, shadcn]

# Dependency graph
requires:
  - phase: 03-admin-ui
    provides: lib/policies/state-machine.ts (ALLOWED_TRANSITIONS, PolicyStatus) from Plan 03-03
  - phase: 03-admin-ui
    provides: shadcn primitives (Badge, Dialog, DropdownMenu, Textarea, Button) + TipTap 2.27.2 packages from Plan 03-08
  - phase: 02-data-layer
    provides: PolicyVersions.listForPolicy + withOrgScope (ADR-019/023/025)
provides:
  - PolicyEditor (Client Component, immediatelyRender:false, sticky toolbar with 9 marks/nodes)
  - PolicyView (Server Component, @tiptap/html generateHTML, no client JS shipped)
  - PolicyStatusBadge (Server Component, exhaustive PolicyStatus → Badge variant mapper)
  - PolicyTransitionMenu (Client Component, DropdownMenu of ALLOWED_TRANSITIONS, B2 onEditPublished wiring)
  - PolicyVersionHistory (Server Component, PolicyVersions.listForPolicy reader)
  - Local ActionState / TransitionAction / TransitionActions types (mirror Plan 03-07's contract)
affects: [03-11, 04-ai-layer, 05-employee-portal]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client Component with TipTap 2.x useEditor — immediatelyRender:false MANDATORY for Next.js 15 SSR"
    - "Server Component server-rendering JSONContent via @tiptap/html generateHTML"
    - "PolicyStatus → shadcn Badge variant exhaustive switch (TS exhaustiveness gate)"
    - "Client Component mirroring ALLOWED_TRANSITIONS for UX, server-authoritative validation"
    - "Server Component reading repository inside withOrgScope (no raw db)"
    - "Action-functions-as-props pattern (decouple Wave-3 component from Wave-4 actions.ts)"

key-files:
  created:
    - components/policy/PolicyEditor.tsx
    - components/policy/PolicyEditor.test.tsx
    - components/policy/PolicyView.tsx
    - components/policy/PolicyStatusBadge.tsx
    - components/policy/PolicyTransitionMenu.tsx
    - components/policy/PolicyVersionHistory.tsx
  modified: []

key-decisions:
  - "Editor toolbar set (9 buttons): Bold/Italic/Strike/Code + H1/H2/H3 + BulletList/OrderedList — covers UI-SPEC §Interaction-contracts toolbar; Link.configure handles paste-to-link"
  - "JSONContent imported from @tiptap/react (re-exports @tiptap/core) — @tiptap/core not directly in package.json (transitive); avoids widening deps"
  - "PolicyTransitionMenu accepts Server Actions as PROPS instead of importing — Plan 03-07 ships actions.ts in Wave 4; this is Wave 3, forward-import would break tsc. Plan 03-11 wires the real actions"
  - "DropdownMenuItem uses Base UI's onClick (not Radix's onSelect) — Base UI Menu API"
  - "closeOnClick={false} on items that open confirm Dialogs — prevents auto-dismiss before Dialog mounts"
  - "B2 LOCKED — onEditPublished prop: when target='draft' AND status='published', Dialog onSubmit defers to parent callback (Plan 03-11 navigates to ?edit=1, drops the changeSummary which the edit page collects separately via EditPolicyForm)"
  - "PolicyVersionHistory ships date + change summary (no author name join) — Phase 8 polish ticket"

patterns-established:
  - "TipTap SSR-safe mount: 'use client' + useEditor({ immediatelyRender: false, ... }) + null-check render guard + hidden form input synced from editor.getJSON()"
  - "Server-side TipTap render: import generateHTML from '@tiptap/html' (NOT @tiptap/core), wrap in prose prose-sm max-w-none, dangerouslySetInnerHTML on server-controlled JSON"
  - "PolicyStatus switch with Record<PolicyStatus, label> lookup — adding a new status causes a tsc error at the switch site, not a runtime gap"
  - "Action-functions-as-props for cross-wave decoupling — components stay independently shippable while parent pages bind real Server Actions later"

requirements-completed: [REQ-policy-library, REQ-policy-lifecycle]

# Metrics
duration: ~10 min
completed: 2026-05-19
---

# Phase 03 Plan 10: Five Policy Components Summary

**5 policy components shipped: PolicyEditor (Client, TipTap 2.27.2 + immediatelyRender:false sticky toolbar) + PolicyView (Server, @tiptap/html generateHTML) + PolicyStatusBadge (Server, exhaustive variant switch) + PolicyTransitionMenu (Client, ALLOWED_TRANSITIONS DropdownMenu with B2 onEditPublished wiring) + PolicyVersionHistory (Server, withOrgScope reader).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-19T19:30:00Z (approx)
- **Completed:** 2026-05-19T19:40:00Z (approx)
- **Tasks:** 5
- **Files created:** 6 (5 components + 1 test)
- **Files modified:** 0

## Accomplishments

- **3 Server Components / 2 Client Components** — correct server/client split per D-02 (server-rendered reads via @tiptap/html; client interactivity isolated to PolicyEditor + PolicyTransitionMenu).
- **D-02 SSR mandate honored** — `immediatelyRender: false` in PolicyEditor (RESEARCH Pitfall 1 closed; Next.js 15 SSR won't hydrate-mismatch).
- **UI-SPEC Copywriting Contract locked verbatim** — Submit for review · Approve and publish · Send back to draft · Archive · Restore as draft · Edit policy · Publish, plus all four destructive-confirmation Dialog copy strings.
- **D-07 Status badge mapper** — exhaustive PolicyStatus switch with Record<PolicyStatus, label> table, on-disk-palette compliant (neutral OKLCH grayscale base-nova; outline → secondary → default → muted hierarchy).
- **B2 cross-plan wiring contract locked** — PolicyTransitionMenu's `onEditPublished?: () => void` prop. When target='draft' AND status='published' AND callback provided, the Dialog onSubmit defers to the parent (Plan 03-11 navigates to `/policies/[id]?edit=1`). When the callback is missing, the Dialog falls through to `invoke()` — the component stays independently shippable.
- **Lego pieces ready for Plan 03-11** — pages can compose `<PolicyEditor>`, `<PolicyView>`, `<PolicyStatusBadge>`, `<PolicyTransitionMenu actions={…} onEditPublished={…}>`, `<PolicyVersionHistory>` directly.

## Task Commits

Each task was committed atomically:

1. **Task 1: PolicyEditor.tsx + PolicyEditor.test.tsx (TDD)** — `44a7830` (feat)
2. **Task 2: PolicyView.tsx** — `9a80b3b` (feat)
3. **Task 3: PolicyStatusBadge.tsx** — `7e28143` (feat)
4. **Task 4: PolicyTransitionMenu.tsx** — `9a3e6ee` (feat)
5. **Task 5: PolicyVersionHistory.tsx** — `87160d5` (feat)

## Files Created/Modified

- `components/policy/PolicyEditor.tsx` — Client Component, TipTap 2.27.2 useEditor + StarterKit + Link, sticky toolbar with 9 buttons (Bold/Italic/Strike/Code/H1/H2/H3/BulletList/OrderedList), hidden form input synced from editor.getJSON(), `immediatelyRender: false` SSR-safe, loading placeholder during SSR pre-mount.
- `components/policy/PolicyEditor.test.tsx` — 3 Vitest assertions: hidden input wiring with initial JSON · empty-doc default when initialContent undefined · aria-label="Policy content editor" or loading placeholder presence.
- `components/policy/PolicyView.tsx` — Server Component, `generateHTML(content, [StarterKit, Link])` from @tiptap/html, `<div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{__html: html}}>`. No client JS shipped.
- `components/policy/PolicyStatusBadge.tsx` — Server Component, exhaustive switch over PolicyStatus → shadcn Badge variant: `draft` = outline, `under_review` = secondary, `published` = default, `archived` = outline + muted-foreground text/border. `Record<PolicyStatus, string>` lookup table gives TS exhaustiveness.
- `components/policy/PolicyTransitionMenu.tsx` — Client Component, DropdownMenu rendering ONLY `ALLOWED_TRANSITIONS[currentStatus]`, destructive variants for Send-back-to-draft + Archive, confirm Dialogs with UI-SPEC copy locked verbatim, `onEditPublished` B2 prop, action-functions-as-props pattern, local `ActionState` / `TransitionAction` / `TransitionActions` type exports.
- `components/policy/PolicyVersionHistory.tsx` — Server Component, `await getOrgContext() + withOrgScope(ctx, s => PolicyVersions.listForPolicy(s, policyId))`, reverse-chronological list, empty state when no versions exist.

## Decisions Made

- **TipTap JSONContent import path.** Plan code imports from `@tiptap/core` (transitive dep, not in `package.json`). Switched to `@tiptap/react` which re-exports the type. Same TS shape; avoids widening direct deps. Applied to PolicyEditor.tsx + PolicyEditor.test.tsx + PolicyView.tsx.
- **DropdownMenuItem onClick (not onSelect).** Base UI's Menu primitive uses `onClick`, not Radix's `onSelect`. The plan literal text was wrong. Also added `closeOnClick={false}` for items that open confirm Dialogs so the menu doesn't auto-dismiss.
- **Server Actions as PROPS (not direct imports).** Plan 03-07 ships `app/(admin)/policies/[id]/actions.ts` in Wave 4. Plan 03-10 is Wave 3 — the actions.ts file doesn't exist yet when this plan runs. Forward-import would break `tsc --noEmit`. Instead, PolicyTransitionMenu accepts a `TransitionActions` prop bag; Plan 03-11 supplies the real actions when the edit page mounts. Component stays independently shippable.
- **Author-name join deferred** in PolicyVersionHistory. UI-SPEC row format reads "Version {n} — published {date} by {author_name}" — joining `users.id → name` requires either extending `PolicyVersions.listForPolicy` in Plan 03-04 (already closed) or a second repository call per row. Phase 3 ships the simpler date + change-summary shape; surface to Phase 8 polish ticket.
- **DropdownMenuTrigger uses `render` prop (not Radix's `asChild`).** Base UI's Trigger API uses `render={<Button…/>}`. The plan code used `asChild` which would have failed tsc.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] JSONContent import path corrected**

- **Found during:** Task 1 (PolicyEditor TypeScript check)
- **Issue:** Plan code imports `import type { JSONContent } from '@tiptap/core'`. `@tiptap/core` is a transitive dependency (pulled in by `@tiptap/react` etc.) but is NOT listed in `package.json`. tsc resolution failed: `error TS2307: Cannot find module '@tiptap/core'`.
- **Fix:** Switched import to `@tiptap/react` which re-exports everything from `@tiptap/core` (verified via `node_modules/.../@tiptap/react/dist/index.d.ts` line 13: `export * from '@tiptap/core';`). Same TS shape; no widening of direct deps.
- **Files modified:** components/policy/PolicyEditor.tsx, components/policy/PolicyEditor.test.tsx, components/policy/PolicyView.tsx
- **Verification:** `pnpm tsc --noEmit` exits 0.
- **Committed in:** `44a7830` (Task 1), `9a80b3b` (Task 2)

**2. [Rule 1 — Bug] DropdownMenuItem prop API: onClick (not onSelect)**

- **Found during:** Task 4 (PolicyTransitionMenu construction)
- **Issue:** Plan literal code used `onSelect={(e) => { e.preventDefault(); ... }}` — that's the Radix DropdownMenu API. The repo uses Base UI's Menu primitive (verified: `components/ui/dropdown-menu.tsx` imports from `@base-ui/react/menu`, and `MenuItemProps` in `node_modules/@base-ui/react/menu/item/MenuItem.d.ts` declares `onClick` + `closeOnClick` but no `onSelect`).
- **Fix:** Switched to `onClick`. Added `closeOnClick={!opt.confirm}` so items that open a confirm Dialog don't auto-dismiss the menu before the Dialog mounts.
- **Files modified:** components/policy/PolicyTransitionMenu.tsx
- **Verification:** `pnpm tsc --noEmit` exits 0.
- **Committed in:** `9a3e6ee` (Task 4)

**3. [Rule 3 — Blocking] DropdownMenuTrigger uses `render` prop (not Radix `asChild`)**

- **Found during:** Task 4
- **Issue:** Plan literal code used `<DropdownMenuTrigger asChild><Button>...</Button></DropdownMenuTrigger>` — that's the Radix API. Base UI's Trigger uses `render={<Button…/>}`.
- **Fix:** Rewrote the trigger as `<DropdownMenuTrigger render={<Button variant="outline" size="sm">Actions <ChevronDown … /></Button>} />`.
- **Files modified:** components/policy/PolicyTransitionMenu.tsx
- **Verification:** `pnpm tsc --noEmit` exits 0.
- **Committed in:** `9a3e6ee` (Task 4)

**4. [Rule 3 — Blocking] Server Actions as PROPS (forward-import avoidance)**

- **Found during:** Task 4
- **Issue:** Plan literal code imports `submitForReviewAction, approveAction, rejectAction, publishAction, archiveAction, restoreAction, editPublishedAction, type ActionState` from `@/app/(admin)/policies/[id]/actions`. That file ships in Plan 03-07 (Wave 4). This plan (03-10) is Wave 3 — the file does not yet exist. Forward-import would cause `error TS2307: Cannot find module`. The plan's `depends_on: [03-03, 03-08]` doesn't list 03-07.
- **Fix:** Defined `ActionState`, `TransitionAction`, and `TransitionActions` locally in `PolicyTransitionMenu.tsx`. The component accepts a `TransitionActions` prop bag whose keys are optional. Plan 03-11 wires the real actions through the prop when the edit page mounts. Component is independently shippable; verify still passes tsc.
- **Files modified:** components/policy/PolicyTransitionMenu.tsx
- **Verification:** `pnpm tsc --noEmit` exits 0.
- **Committed in:** `9a3e6ee` (Task 4)

**5. [Rule 1 — Bug] PolicyView comment containing the literal string `'use client'` triggered the absence-grep**

- **Found during:** Task 2 acceptance check
- **Issue:** Comment text `// NO 'use client' directive…` contained the literal string `'use client'`. The acceptance criterion `grep -L "'use client'"` matched the file as containing the directive (false positive).
- **Fix:** Rephrased the comment to "No client directive. This file ships zero client JS…" — preserves the rationale, removes the false positive.
- **Files modified:** components/policy/PolicyView.tsx
- **Verification:** `grep -L "'use client'" components/policy/PolicyView.tsx` now returns the path (absence confirmed).
- **Committed in:** `9a80b3b` (Task 2)

---

**Total deviations:** 5 auto-fixed (3 blocking, 2 bugs)
**Impact on plan:** All deviations preserve the plan's intent and acceptance criteria. The largest deviation (Server Actions as props) is a structural change required by the wave ordering of dependent plans — it actually IMPROVES the component's encapsulation by removing a circular-feeling import from Wave 3 → Wave 4 deliverables.

## Editor Toolbar Set (Task 1 — for plan output spec)

PolicyEditor's sticky toolbar surfaces 9 toggles, each with `aria-pressed` reflecting `editor.isActive(...)`:

| Mark / Node | Toolbar button | TipTap command |
|-------------|----------------|----------------|
| Bold | `<Bold />` icon | `toggleBold()` |
| Italic | `<Italic />` icon | `toggleItalic()` |
| Strikethrough | `<Strikethrough />` icon | `toggleStrike()` |
| Inline code | `<Code />` icon | `toggleCode()` |
| Heading 1 | `<Heading1 />` icon | `toggleHeading({ level: 1 })` |
| Heading 2 | `<Heading2 />` icon | `toggleHeading({ level: 2 })` |
| Heading 3 | `<Heading3 />` icon | `toggleHeading({ level: 3 })` |
| Bullet list | `<List />` icon | `toggleBulletList()` |
| Ordered list | `<ListOrdered />` icon | `toggleOrderedList()` |

Plus paste-to-link via `Link.configure({ openOnClick: false, autolink: true })`.

## editPublished Menu Wiring Approach (B2 LOCKED — for plan output spec)

Option (a) — **state-only signal via `onEditPublished` callback**:

1. PolicyTransitionMenu declares `onEditPublished?: () => void` on its prop signature.
2. The "Edit policy" menu item (target=`draft`, current=`published`) opens its confirm Dialog as before.
3. When the user submits the Dialog AND `currentStatus === 'published'` AND `confirmOpen.to === 'draft'` AND `typeof onEditPublished === 'function'`:
   - The Dialog's onSubmit handler calls `onEditPublished()` and `setConfirmOpen(null)`.
   - `invoke()` is NOT called — the Server Action is deferred.
4. When `onEditPublished` is NOT provided (e.g., menu used outside the edit page), the Dialog falls through to `invoke()` with the changeSummary attached. This keeps the component independently shippable.
5. The `changeSummary` Textarea remains in the Dialog regardless; if `onEditPublished` fires, the summary is dropped (the edit page collects it separately via EditPolicyForm in Plan 03-11).

Plan 03-11 supplies the callback to navigate the user to `/policies/[id]?edit=1` so the editor flips into editable mode and saves via `editPublishedAction`.

## Deferred Items (for plan output spec)

- **Author-name join in PolicyVersionHistory** — UI-SPEC §Copywriting reads "Version {n} — published {date} by {author_name}". This iteration ships date + change summary only. Joining `users.id → name` requires extending `PolicyVersions.listForPolicy` (closed in Plan 03-04) or a second repository call per row. Surface to Phase 8 polish ticket.

## Issues Encountered

None outside the deviations documented above. tsc baseline was clean at plan start and remains clean at plan end.

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- All 5 policy components are typed, tested (PolicyEditor has 3 vitest assertions), and TS-clean.
- **Ready consumers:** Plan 03-11 (admin pages) can import:
  - `PolicyEditor` for `/policies/new` + `/policies/[id]?edit=1`
  - `PolicyView` for read-only display on `/policies/[id]`
  - `PolicyStatusBadge` for the policy library Table status column + the edit-page header
  - `PolicyTransitionMenu` with `actions={…}` and `onEditPublished={…}` props on `/policies/[id]`
  - `PolicyVersionHistory` for the right-sidebar lineage list on `/policies/[id]`
- **B2 contract** locked between this plan and 03-11 — both sides have the same prop signature and semantics.
- **Forward dependencies satisfied** without import coupling — Plan 03-07's `actions.ts` (Wave 4) can ship after this plan; the action shape is declared locally and structurally compatible with 03-07's exports.

## Threat Surface Scan

No new threat surface introduced beyond what the plan's `<threat_model>` already covers. Threats T-03-10-01..T-03-10-05 all remain accurate:
- T-03-10-01 (XSS via TipTap render) — mitigated by @tiptap/html allow-list + 2.27.2 pin (CVE-2025-14284 fix).
- T-03-10-02 (Forged JSON) — Server Action Zod-validates (Plan 03-07); generateHTML allow-list drops unknown nodes.
- T-03-10-03 (Menu reveals legal next states) — accept (admin-only routes).
- T-03-10-04 (Client tampering to publish) — mitigated by server-authoritative orchestrators.
- T-03-10-05 (No author name on version history) — accept (deferred).

## Self-Check: PASSED

- File `components/policy/PolicyEditor.tsx` exists — confirmed
- File `components/policy/PolicyEditor.test.tsx` exists — confirmed
- File `components/policy/PolicyView.tsx` exists — confirmed
- File `components/policy/PolicyStatusBadge.tsx` exists — confirmed
- File `components/policy/PolicyTransitionMenu.tsx` exists — confirmed
- File `components/policy/PolicyVersionHistory.tsx` exists — confirmed
- Commit `44a7830` (Task 1) — confirmed in git log
- Commit `9a80b3b` (Task 2) — confirmed in git log
- Commit `7e28143` (Task 3) — confirmed in git log
- Commit `9a3e6ee` (Task 4) — confirmed in git log
- Commit `87160d5` (Task 5) — confirmed in git log
- `pnpm tsc --noEmit` exits 0 — confirmed
- `pnpm vitest run components/policy/PolicyEditor.test.tsx` exits 0 (3 passing) — confirmed
- `pnpm check:db-imports` exits 0 — confirmed
- STATE.md NOT modified — confirmed (executor-agent constraint honored)
- ROADMAP.md NOT modified — confirmed (executor-agent constraint honored)

---
*Phase: 03-admin-ui*
*Completed: 2026-05-19*
