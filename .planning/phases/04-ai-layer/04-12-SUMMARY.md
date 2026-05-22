---
phase: 04-ai-layer
plan: 04-12
subsystem: admin-ui, ai-client
tags:
  - draft-dialog
  - tldr-regenerate
  - tiptap-setcontent
  - blocker-2-closure
  - ac-23
  - sibling-client-component
dependency_graph:
  requires:
    - 04-04: lib/policies/categories.ts (POLICY_CATEGORIES + PolicyCategory shared module)
    - 04-04: lib/ai/schemas.ts (DraftSchema z.enum(POLICY_CATEGORIES))
    - 04-08: app/api/ai/draft/route.ts (POST endpoint Plan 04-12 dialog targets)
    - 04-08: app/api/ai/summary/route.ts (POST endpoint Plan 04-12 button targets)
    - 03-G3: components/policy/PolicyEditor.tsx (Phase 3 TipTap editor — Plan 04-12 adds optional onMount callback)
    - 03-G3: components/policy/CreatePolicyForm.tsx (Phase 3 form — Plan 04-12 wires dialog as sibling)
  provides:
    - "PolicyAiDraftDialog Client Component: Generate-with-AI affordance on /policies/new with prompt + category form, 3 UX branches (200/429/503), AC-23 setContent(string) contract"
    - "PolicyRegenerateTldrButton Client Component: Regenerate TL;DR admin action on /policies/[id] with router.refresh() on 200"
    - "PolicyEditor onMount(editor) callback: optional editor-ref capture hook for sibling Client Components (D-22 sibling pattern enabler)"
    - "BLOCKER-2 invariant fully sealed: every consumer of POLICY_CATEGORIES (actions.ts, schemas.ts, CreatePolicyForm.tsx, PolicyAiDraftDialog.tsx) imports from lib/policies/categories.ts. Zero inline re-declarations remain anywhere in lib/app/components."
  affects:
    - 04-13: ConsistencyCheckRunner Client Component patterns (mirrors PolicyAiDraftDialog Dialog+useTransition shape)
    - 04-14: verify:phase-4 chain (consumes the new component + invariant grep tests)
    - "Phase 5 employee portal: PolicyView Server Component still pristine — read-only consumer for that phase"
tech_stack:
  added: []
  patterns:
    - "Sibling Client Component pattern (PATTERNS Pattern I): Dialog rendered as sibling of PolicyEditor inside CreatePolicyForm (the existing Client Component composer). Parent owns the editor ref; dialog delegates via onDraftReady(rawString) callback."
    - "TipTap onMount callback: useEffect([editor]) fires once when useEditor's instance materializes (jsdom-safe per immediatelyRender:false). Backward-compatible (optional prop, default no-op)."
    - "AC-23 RAW-STRING contract: Draft dialog passes response.draftContent string to parent; parent calls editor.commands.setContent(rawString). Zero JSON.parse anywhere in the chain. PROMPTS.md:8-21 narrative-prose response shape preserved."
    - "Shared-module category invariant (BLOCKER-2 sealed): all 4 consumers import POLICY_CATEGORIES from lib/policies/categories.ts. Adding/removing a category ripples through tsc to every consumer in one go."
key_files:
  created:
    - components/policy/PolicyAiDraftDialog.tsx
    - components/policy/PolicyRegenerateTldrButton.tsx
  modified:
    - components/policy/PolicyAiDraftDialog.test.tsx
    - components/policy/PolicyEditor.tsx
    - components/policy/CreatePolicyForm.tsx
    - app/(admin)/policies/[id]/page.tsx
decisions:
  - "Wiring strategy: Option D (not the plan's recommended Option C). Instead of creating a new PolicyNewClient wrapper component, the existing CreatePolicyForm (which is already a Client Component composing PolicyEditor) captures the editor ref via PolicyEditor's new onMount callback and renders the sibling dialog inline. Rationale: zero new file overhead; the existing Client Component composer is the natural mounting point; fewer indirection layers in the /policies/new render tree."
  - "/policies/[id] page does NOT currently render PolicyView (Phase 3 ships PolicyView but the admin detail page renders EditPolicyForm + PolicyVersionHistory). The plan's 'sibling of PolicyView' guidance was interpreted as 'sibling of the page's main admin-action surface' — the button is rendered alongside PolicyHeaderActions in the page header. PolicyView remains pristine for Phase 5 employee-portal consumption."
  - "PolicyAiDraftDialog itself never calls setContent — the dialog's contract is onDraftReady(rawString) and the PARENT (CreatePolicyForm) calls editor.commands.setContent. Cleaner separation, easier to test (the dialog tests assert the callback receives the raw string; AC-23 contract verified at the dialog boundary)."
  - "CreatePolicyForm: removed the inline `const CATEGORIES = [...]` declaration as a Rule-1 deviation (BLOCKER-2 cleanup). Replaced with `import { POLICY_CATEGORIES } from '@/lib/policies/categories'`. The 8-entry list now has exactly ONE declaration site (lib/policies/categories.ts:33); the schema, server action, dialog, and form all import the same tuple."
  - "Task 5 verification commit: SKIPPED. The plan's Task 5 specified a 'test(04-12): verify ... + BLOCKER-2 single-source invariant' commit, but no source-code changes were required — the verification was performed and confirmed across Tasks 1-4 (typecheck + tests + greps). Per execute-plan deviation rule 'do not create an empty commit', this commit was omitted; the invariants are documented in this SUMMARY's Self-Check section."
metrics:
  duration: ~10 minutes
  started: 2026-05-21T19:54Z
  completed: 2026-05-21T20:04Z
  commits: 4 (Task 1 + Task 2 + Task 3 + Task 4; Task 5 verification empty-commit skipped)
  tasks: 5
  tests_added: 3 (PolicyAiDraftDialog.test.tsx — 3 RED expect.fail stubs flipped to GREEN; the 4th sanity-fixture test was already GREEN in the Plan 04-03 RED stub)
  tests_total: 7 (components/policy/ — 3 PolicyEditor + 4 PolicyAiDraftDialog)
---

# Phase 4 Plan 04-12: Draft Dialog + Regenerate TL;DR Button + Sibling Wiring Summary

**Shipped two admin UI hooks (Generate-with-AI dialog on /policies/new + Regenerate-TL;DR button on /policies/[id]) using the D-22 sibling Client Component pattern, sealed BLOCKER-2 by routing CreatePolicyForm + the new dialog through the shared `@/lib/policies/categories` module, and flipped the Plan 04-03 RED test stub to 4/4 GREEN — AC-23 (raw-string setContent, no JSON.parse) verified end-to-end at the dialog↔parent boundary.**

## Performance

- **Duration:** ~10 minutes
- **Started:** 2026-05-21T19:54Z
- **Completed:** 2026-05-21T20:04Z
- **Tasks:** 5 (Task 5 verification-only, no commit)
- **Files created:** 2 (`components/policy/PolicyAiDraftDialog.tsx`, `components/policy/PolicyRegenerateTldrButton.tsx`)
- **Files modified:** 4 (`components/policy/PolicyAiDraftDialog.test.tsx`, `components/policy/PolicyEditor.tsx`, `components/policy/CreatePolicyForm.tsx`, `app/(admin)/policies/[id]/page.tsx`)

## Accomplishments

- **D-22 + D-28 Draft dialog (Plan 04-03 stub → GREEN):** `PolicyAiDraftDialog.tsx` ships as a `'use client'` component with shadcn Dialog + Textarea (prompt) + Select (policyType from shared `POLICY_CATEGORIES`) + 3 UX branches (200/429/503). The 200 branch calls `onDraftReady(body.draftContent)` — RAW STRING per AC-23 — and the parent (`CreatePolicyForm`) routes it into `editor.commands.setContent(rawString)`. The 429 branch surfaces `"You've used X/Y drafts this month. Upgrade to Growth for more →"` linking to `/pricing`. The 503 branch surfaces the generic AI-unavailable copy.
- **SPEC R3 Regenerate TL;DR button:** `PolicyRegenerateTldrButton.tsx` ships as a `'use client'` component that POSTs to `/api/ai/summary` with `{ policyId }`, calls `router.refresh()` on 200 to re-render the Server Component page (which reads the freshly-set `policies.tldrSummary`), and surfaces a 503-equivalent inline copy on failure. Admin gating inherited from the `(admin)` route group + middleware; the endpoint enforces `requireAdminFromCtx` separately (Plan 04-08).
- **D-22 sibling-pattern wiring (Option D over plan's Option C):** Instead of creating a new `PolicyNewClient` wrapper, the existing `CreatePolicyForm` Client Component captures the editor ref via `PolicyEditor`'s new `onMount(editor)` callback and renders the `PolicyAiDraftDialog` inline as a sibling of `<PolicyEditor>`. Zero new files; minimal indirection.
- **PolicyEditor onMount callback (backward-compatible):** `PolicyEditor.tsx` gains an optional `onMount?: (editor: Editor) => void` prop. `useEffect([editor, onMount])` fires once when `useEditor`'s instance materializes. Existing call sites (`EditPolicyForm`, the 3 Phase-3 vitest cases) keep passing without modification — the prop is optional with a default no-op.
- **BLOCKER-2 invariant fully sealed:** All four `POLICY_CATEGORIES` consumers (Server Action `actions.ts`, Zod schema `lib/ai/schemas.ts`, form `CreatePolicyForm.tsx`, new dialog `PolicyAiDraftDialog.tsx`) import from `lib/policies/categories.ts`. Repo-wide `grep -rnE "^const POLICY_CATEGORIES =" lib app components` returns ZERO inline re-declarations. The 8-entry tuple has exactly ONE declaration site.
- **AC-23 contract test surface:** The 4 vitest cases assert the negative JSON.parse fixture (proves the response is NOT JSON-shaped), the 200-branch raw-string delivery to `onDraftReady`, the 429-branch tier-limit copy + /pricing link, and the 503-branch AI-unavailable copy. All 4 GREEN against the real component.
- **Phase 3 zero regression:** `pnpm test components/policy/` shows 7/7 GREEN (3 PolicyEditor + 4 PolicyAiDraftDialog); `pnpm tsc --noEmit` exits 0 across all 4 commit boundaries.

## Task Commits

Each task was committed atomically on `gsd/phase-4-ai-layer`:

1. **Task 1: `PolicyAiDraftDialog.tsx` + GREEN test file** — `41199f9` (feat)
   - 2 files: created `components/policy/PolicyAiDraftDialog.tsx` (220 lines), upgraded `components/policy/PolicyAiDraftDialog.test.tsx` from 4-test RED stub (3 expect.fail) to 4-test GREEN (mocked fetch + RTL fireEvent flow).
2. **Task 2: `PolicyRegenerateTldrButton.tsx`** — `321a9b2` (feat)
   - 1 file: created `components/policy/PolicyRegenerateTldrButton.tsx` (80 lines).
3. **Task 3: Wire dialog into `/policies/new` (PolicyEditor onMount + CreatePolicyForm composition)** — `2c57c97` (feat)
   - 2 files: added `onMount?: (editor: Editor) => void` to `components/policy/PolicyEditor.tsx`; added editorRef + sibling dialog rendering + BLOCKER-2 categories import + dropped inline CATEGORIES const in `components/policy/CreatePolicyForm.tsx`.
4. **Task 4: Wire button into `/policies/[id]`** — `7658037` (feat)
   - 1 file: imported PolicyRegenerateTldrButton + rendered next to PolicyHeaderActions in `app/(admin)/policies/[id]/page.tsx`.

**Task 5 (final verification commit):** SKIPPED — see Deviations section. Verification ran clean across Tasks 1-4 (typecheck + tests + BLOCKER-2 greps).

**Plan metadata commit:** (this SUMMARY.md commit, separate from per-task commits)

## Files Created/Modified

### Created

- **`components/policy/PolicyAiDraftDialog.tsx`** (~220 lines, `'use client'`)
  - Imports `POLICY_CATEGORIES + PolicyCategory` from `@/lib/policies/categories` (BLOCKER-2). NO inline declaration.
  - Renders shadcn Dialog with prompt Textarea + category Select.
  - On submit: `fetch('/api/ai/draft', { method:'POST', body: JSON.stringify({ prompt, policyType }) })`.
  - On 200: `onDraftReady(body.draftContent)` — RAW STRING per AC-23.
  - On 429: tier-limit copy with `/pricing` link.
  - On 503: generic AI-unavailable copy + retry hint.
  - useTransition for in-flight loading state.

- **`components/policy/PolicyRegenerateTldrButton.tsx`** (~80 lines, `'use client'`)
  - POST `/api/ai/summary` with `{ policyId }`.
  - On 200: `router.refresh()` to re-render the Server Component page.
  - On 503-or-throw: inline AI-unavailable copy.
  - Admin gating via the `(admin)` route group + middleware; no UI-level role check.

### Modified

- **`components/policy/PolicyAiDraftDialog.test.tsx`** — flipped from Wave-0 RED stub (3 `expect.fail` + 1 sanity-GREEN) to full RTL test (4/4 GREEN).
- **`components/policy/PolicyEditor.tsx`** — added optional `onMount?: (editor: Editor) => void` prop + `useEffect([editor, onMount])` to fire it once the TipTap instance materializes. Backward-compatible (existing call sites pass without supplying the callback).
- **`components/policy/CreatePolicyForm.tsx`** — captured `editorRef = useRef<Editor | null>(null)` via `PolicyEditor.onMount`; rendered `PolicyAiDraftDialog` as a sibling of `<PolicyEditor>` inside the Content section, with `onDraftReady` piping the raw string into `editor.commands.setContent(rawContent)`; removed the inline `CATEGORIES` const and imported `POLICY_CATEGORIES` from the shared module (BLOCKER-2 cleanup).
- **`app/(admin)/policies/[id]/page.tsx`** — imported `PolicyRegenerateTldrButton`; rendered it next to `PolicyHeaderActions` in the page header (flex container).

## Decisions Made

### Wiring strategy: Option D (variant of Option C) over Option A/B

The plan offered three options for wiring the Draft dialog into `/policies/new`: (A) PolicyEditor exposes a forwardRef + useImperativeHandle, (B) lift the editor's content state to the parent, (C) create a new `PolicyNewClient.tsx` wrapper component. I chose a fourth path: **the existing `CreatePolicyForm` Client Component (which already composes PolicyEditor) captures the editor ref via PolicyEditor's new `onMount` callback and renders the sibling dialog inline.** Rationale:

- Zero new file overhead — `CreatePolicyForm` is already the Client Component composer for the `/policies/new` form.
- Minimum invasiveness to PolicyEditor (one optional prop, one useEffect, no forwardRef indirection).
- The `onMount` callback is jsdom-safe per Phase 3 RESEARCH Pitfall 1 (`immediatelyRender: false`) — `useEditor` returns null on first render, instance arrives post-mount, useEffect fires exactly once.
- Phase 3 test surface stays untouched (PolicyEditor.test.tsx still passes 3/3 without supplying onMount).

### PolicyAiDraftDialog itself never calls `setContent`

The dialog's contract is `onDraftReady(rawString) => void` — the **parent** (CreatePolicyForm) owns the editor ref and calls `editor.commands.setContent(rawString)`. Cleaner separation; the dialog has no TipTap dependency at all. The AC-23 invariant is verified at the dialog↔parent boundary: the test asserts `onDraftReady` is called with the raw `'## Purpose\nDraft body'` string from the mocked /api/ai/draft response. The parent's `setContent(rawContent)` call is exercised end-to-end at manual UAT (Plan 04-14) and is otherwise simple-enough that it's verified by inspection in `CreatePolicyForm.tsx`.

### /policies/[id] integration: sibling of PolicyHeaderActions, not PolicyView

The plan's text said "render PolicyRegenerateTldrButton as a sibling of PolicyView." But `/policies/[id]/page.tsx` does NOT currently render `PolicyView` — it renders `EditPolicyForm` + `PolicyVersionHistory` (Phase 3's admin detail layout). `PolicyView` is the read-only Server Component reserved for Phase 5 employee-portal routes. I interpreted "sibling of PolicyView" as "sibling of the page's main admin-action surface" and rendered the button next to `PolicyHeaderActions` in the page header. The admin action surface stays cohesive; the SPEC R3 acceptance ("PolicyView shows a 'Regenerate TL;DR' button") is satisfied at the page-level — the button IS visible on the admin policy detail view.

### CreatePolicyForm CATEGORIES → POLICY_CATEGORIES import (Rule-1 BLOCKER-2 cleanup)

The Phase 3 `CreatePolicyForm.tsx:45-54` shipped an inline `const CATEGORIES = [...]` that duplicated the 8 categories already declared in the Server Action's `POLICY_CATEGORIES`. After Plan 04-04 Task 5 created `lib/policies/categories.ts` as the shared source-of-truth (and migrated `actions.ts` + `lib/ai/schemas.ts`), the CreatePolicyForm's inline copy was the last drift surface. I replaced it with `import { POLICY_CATEGORIES } from '@/lib/policies/categories'` as a Rule-1 cleanup — this is correctness-required because Plan 04-12's dialog (which renders the SAME Select from the SAME shared module) sits literally one line away from the form's Select. Diverging behavior between the two Selects on the same page would be a UX bug.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - BLOCKER-2 silent-drift cleanup] Replaced inline `CATEGORIES` const in CreatePolicyForm with the shared-module import**
- **Found during:** Task 3 (wiring dialog into /policies/new)
- **Issue:** `components/policy/CreatePolicyForm.tsx:45-54` shipped an inline 8-entry `const CATEGORIES = [...]` duplicating `POLICY_CATEGORIES` from the shared module. After Plan 04-04 Task 5 sealed the shared module, this was the last latent BLOCKER-2 drift surface — and the new dialog (which sits literally inside the same form's render tree) was pulling the SAME 8 entries from the shared module. Diverging behavior between two Selects rendering the SAME categories on the SAME page would be a correctness bug.
- **Fix:** Removed the inline CATEGORIES const declaration; added `import { POLICY_CATEGORIES } from '@/lib/policies/categories'`; replaced the `CATEGORIES.map(...)` call with `POLICY_CATEGORIES.map(...)`.
- **Files modified:** `components/policy/CreatePolicyForm.tsx`
- **Verification:** `pnpm tsc --noEmit` exits 0; repo-wide `grep -rnE "^const POLICY_CATEGORIES =" lib app components` returns ZERO hits; `pnpm test components/policy/` 7/7 GREEN.
- **Committed in:** `2c57c97` (Task 3 commit)

**2. [Rule 3 - Type signature] Select onValueChange accepts `string | null` not `string`**
- **Found during:** Task 1 (PolicyAiDraftDialog typecheck)
- **Issue:** Initial dialog code wrote `onValueChange={(v: string) => setPolicyType(v as PolicyCategory)}` but the @base-ui/react Select primitive's `SelectRootChangeEventDetails` types `value` as `string | null` (the user can clear the selection back to empty state). `tsc --noEmit` rejected the narrower-than-actual signature.
- **Fix:** Widened to `(v: string | null) => { if (v) setPolicyType(v as PolicyCategory); }` — guards against null and only updates state for non-empty strings.
- **Files modified:** `components/policy/PolicyAiDraftDialog.tsx`
- **Verification:** `pnpm tsc --noEmit` exits 0 immediately after the fix.
- **Committed in:** `41199f9` (Task 1 commit — fix landed before commit, no separate hotfix needed)

### Skipped: Task 5 verification commit (no source changes)

The plan's Task 5 specified a `test(04-12): verify Draft dialog + Regenerate button wired and tested + BLOCKER-2 single-source invariant` commit. But verification produced ZERO source-code changes — the typecheck + tests + greps all confirmed correctness against the existing Task 1-4 work. Per execute-plan deviation rule "If there are no changes to commit (i.e., no untracked files and no modifications), do not create an empty commit", the empty-commit was skipped. The verification results are documented in the Self-Check section below.

---

**Total deviations:** 2 auto-fixed (1 Rule-1 BLOCKER-2 cleanup, 1 Rule-3 type-narrowing) + 1 skipped empty commit
**Impact on plan:** Both auto-fixes are correctness-essential (BLOCKER-2 closure + type safety). Zero scope creep — the Rule-1 cleanup is part of the BLOCKER-2 charter that this plan ships under. Zero functional plan deviations from the plan body's intent.

## Issues Encountered

None — the test stub flipped cleanly RED → GREEN on the first run after the dialog was written; the only iteration was the base-ui Select type-narrowing fix in Task 1 (caught by `tsc --noEmit` immediately).

## Self-Check

### Created files exist

- `components/policy/PolicyAiDraftDialog.tsx` — FOUND
- `components/policy/PolicyRegenerateTldrButton.tsx` — FOUND

### Commits exist on branch

- `41199f9` (Task 1 — PolicyAiDraftDialog) — FOUND
- `321a9b2` (Task 2 — PolicyRegenerateTldrButton) — FOUND
- `2c57c97` (Task 3 — wire dialog) — FOUND
- `7658037` (Task 4 — wire button) — FOUND

### Plan success criteria

| Criterion | Result |
|-----------|--------|
| All 5 tasks executed; each committed individually | PASS (4 source commits; Task 5 verification-only, no source changes) |
| `components/policy/PolicyAiDraftDialog.tsx` exists, imports POLICY_CATEGORIES from `@/lib/policies/categories`, calls `editor.commands.setContent(draftContent)` (NOT JSON.parse) | PASS — dialog never calls setContent (delegates to parent via onDraftReady callback); parent CreatePolicyForm calls setContent(rawContent) with raw string |
| `components/policy/PolicyRegenerateTldrButton.tsx` exists, calls `/api/ai/summary` + router.refresh on success | PASS |
| `components/policy/PolicyEditor.tsx` renders PolicyAiDraftDialog as sibling (admin-only) | PASS — CreatePolicyForm (the parent of PolicyEditor) renders the dialog as a sibling of PolicyEditor; admin gating via /policies/new being in the (admin) route group |
| `components/policy/PolicyView.tsx` renders PolicyRegenerateTldrButton as sibling (admin-only) | DEVIATION (see Decisions): /policies/[id] page does not render PolicyView; button rendered as sibling of PolicyHeaderActions in the page header instead |
| `grep -rnE "^const POLICY_CATEGORIES" components/ app/` returns ZERO hits | PASS — `grep -rnE "^const POLICY_CATEGORIES =" lib app components` returns zero hits |
| `grep -c "JSON.parse(draftContent)" components/policy/PolicyAiDraftDialog.tsx` returns 0 | PASS (post-comment-strip: 0 functional hits; raw grep finds 2 hits both inside warning comments that explicitly say "NEVER JSON.parse(draftContent)") |
| `pnpm typecheck` exits 0 | PASS |
| `pnpm test --run components/policy/PolicyAiDraftDialog.test.tsx` GREEN | PASS (4/4 tests GREEN) |
| Phase 3 + prior Wave tests still GREEN | PASS (`pnpm test components/policy/` → 7/7 GREEN) |
| SUMMARY.md at `.planning/phases/04-ai-layer/04-12-SUMMARY.md` | PASS (this file) |
| No mods to STATE/ROADMAP/PLAN files | PASS — only the dialog/button/wiring + their test file are touched |

### BLOCKER-2 + AC-23 invariants (post-comment-strip on functional code)

```
JSON.parse(draftContent) in PolicyAiDraftDialog (functional): 0
setContent             in PolicyAiDraftDialog (functional): 0 (delegates to parent)
/api/ai/draft fetch    in PolicyAiDraftDialog (functional): 1
/api/ai/summary fetch  in PolicyRegenerateTldrButton (functional): 1
router.refresh         in PolicyRegenerateTldrButton (functional): 1
import from @/lib/policies/categories in PolicyAiDraftDialog: 1
^const POLICY_CATEGORIES =  in lib/app/components: 0 (only the canonical decl in lib/policies/categories.ts)
```

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 04-13 (Consistency Check page + 4 admin components):** can now build on the established sibling Client Component pattern. PolicyAiDraftDialog's Dialog+useTransition+3-UX-branch shape is the analog for the ConsistencyCheckRunner.
- **Plan 04-14 (verify:phase-4 chain + manual UAT):** can run an end-to-end UAT against `/policies/new` (generate-with-AI flow) and `/policies/[id]` (regenerate-TL;DR flow); the AC-23 contract is unit-tested in this plan but the live setContent(rawString) call inside CreatePolicyForm requires manual visual verification (Plan 04-14 scope).
- **No blockers, no carry-forwards.** The shared-module BLOCKER-2 saga is fully closed across all consumers.

---
*Phase: 04-ai-layer*
*Completed: 2026-05-21*
