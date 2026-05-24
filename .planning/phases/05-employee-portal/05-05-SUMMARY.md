---
phase: 05-employee-portal
plan: 05
subsystem: ui
tags: [nextjs, react-19, server-actions, useActionState, employee-portal, qa, rls]

# Dependency graph
requires:
  - phase: 05-employee-portal
    provides:
      - "lib/policies/acknowledgment.ts::recordAcknowledgment (Plan 05-04 Task 1)"
      - "lib/ai/qa.ts::askQuestion with D-27a accessibility annotation (Plan 05-04 Task 2)"
      - "lib/db/repositories/policies.ts::listAssignedAndPublishedForUser (Plan 05-03)"
      - "lib/db/repositories/qa_citation_grants.ts::hasGrant (Plan 05-03 / D-29)"
      - "components/policy/AckStatusBadge.tsx (Plan 05-07 / D-11)"
      - "lib/policies/errors.ts PolicyArchivedError + PolicyNotAssignedError + PolicyNotFoundError (Plan 05-02 / D-30)"
  - phase: 03-admin-ui
    provides:
      - "components/policy/PolicyView.tsx Server Component (reused verbatim for D-27 Branch A)"
      - "Server Action conventions (D-09): Zod parse + try/catch + revalidatePath outside try"
      - "PolicyIdSchema brand at trust boundaries (ADR-028)"
  - phase: 04-ai-layer
    provides:
      - "Anthropic.APIError → 503 envelope mapping pattern (HTTP route /api/ai/qa)"
      - "QaSchema attack-surface cap (max question length)"

provides:
  - "app/(employee)/layout.tsx — minimal force-dynamic employee shell, any-authenticated gate"
  - "app/(employee)/my-policies/page.tsx — real dashboard list (replaces 03-G3 T9 stub)"
  - "app/(employee)/my-policies/[id]/page.tsx — D-27 3-branch access-aware detail page"
  - "app/(employee)/my-policies/[id]/actions.ts — acknowledgePolicyAction Server Action"
  - "app/(employee)/my-policies/ask/page.tsx — R-6 Q&A surface shell"
  - "app/(employee)/my-policies/ask/actions.ts — askQuestionAction Server Action"
  - "components/employee/AcknowledgeButton.tsx — React 19 useActionState ack form"
  - "components/employee/AskQuestionForm.tsx — React 19 useActionState Q&A form with citation Links"
affects: [05-08-ci-gates, 05-09-integration-test, 05-10-uat]

# Tech tracking
tech-stack:
  added: []  # No new packages — operator-locked constraint per 05-CONTEXT.md
  patterns:
    - "components/employee/ directory for employee-only Client Components (vs components/policy/ for shared admin+employee components)"
    - "D-27 3-branch access-aware page handler inside ONE withOrgScope closure for atomic RLS evaluation"
    - "React 19 useActionState formState-over-isPending success rendering (RESEARCH Pitfall 5 / Next.js #82289 workaround)"
    - "Server Action with NO revalidatePath for non-mutating flows (askQuestionAction)"

key-files:
  created:
    - "app/(employee)/layout.tsx"
    - "app/(employee)/my-policies/[id]/page.tsx"
    - "app/(employee)/my-policies/[id]/actions.ts"
    - "app/(employee)/my-policies/ask/page.tsx"
    - "app/(employee)/my-policies/ask/actions.ts"
    - "components/employee/AcknowledgeButton.tsx"
    - "components/employee/AskQuestionForm.tsx"
  modified:
    - "app/(employee)/my-policies/page.tsx (wholesale replacement of 03-G3 T9 stub)"

key-decisions:
  - "components/employee/ chosen over components/policy/ for employee-only Client Components — keeps policy/ namespace for shared components (PolicyView, AckStatusBadge, PolicyStatusBadge)"
  - "Detail page 3-branch access logic encapsulated in a single withOrgScope closure returning a discriminated AccessResult union — atomic RLS evaluation across sub-queries"
  - "AcknowledgeButton renders success branch from state.ackedAt formState (not isPending) per RESEARCH Pitfall 5 — Next.js #82289 workaround documented inline"
  - "askQuestionAction omits revalidatePath entirely (Q&A is non-mutating); isPending is safe to observe for the in-flight button label"
  - "Cast policies.contentJson (Drizzle-typed unknown) to JSONContent at the PolicyView boundary — content is server-controlled jsonb (Phase 3 ADR-005), never user-supplied untrusted shape"
  - "AcknowledgeButton ackState prop union narrowed to 'none' | 'stale' (excludes 'current') — page handler gates render via `assignedRow.ackState !== 'current'`, so 'current' is structurally unreachable in this component"

patterns-established:
  - "Employee route group force-dynamic + getOrgContext gate (no admin role narrowing) — mirrors admin layout shape MINUS requireAdmin/AdminSidebar/OrganizationSwitcher"
  - "D-27 page handler 3-branch access pattern (assigned-and-published → has-grant + published → notFound) — security boundary at server, accessibility flag in UI is informational only"
  - "Server Action typed-error mapping for PolicyDomainError hierarchy (PolicyArchivedError → code='POLICY_ARCHIVED', etc.) with verbatim recovery copy"
  - "D-27a citation accessibility visual hint: italic + muted-foreground for tldr-only links; plain underline for full-access links"

requirements-completed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules

# Metrics
duration: ~45min
completed: 2026-05-24
---

# Phase 5 Plan 05: Employee Routes Summary

**Real employee portal surface replacing 03-G3 T9 stub: D-27 3-branch access-aware policy detail with React 19 useActionState acknowledge flow + R-6 Q&A page with D-27a accessibility-flagged citation links.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-05-24T01:32:00Z (approximate plan-load)
- **Completed:** 2026-05-24T02:17:41Z
- **Tasks:** 3
- **Files modified:** 8 (7 created + 1 wholesale-replaced stub)
- **Commits:** 3 (one per task)

## Accomplishments

- Wholesale replacement of the 03-G3 T9 employee-portal stub with the real Phase 5 surface (R-1 dashboard list, R-2 acknowledge, R-3 re-ack indicator via AckStatusBadge, R-6 AI Q&A).
- D-27 3-branch access logic implemented inside ONE withOrgScope closure: assigned-and-published → full PolicyView + AcknowledgeButton; else has-grant + published → TL;DR-only with banner; else notFound() (404).
- React 19 useActionState Client wrappers (AcknowledgeButton, AskQuestionForm) wired via formState-over-isPending pattern documented in RESEARCH Pitfall 5 (Next.js #82289 workaround).
- D-04a empty-state copy + D-27 TL;DR banner copy locked verbatim with Unicode U+2014 em-dash (grep-asserted in plan acceptance criteria).
- All eight target files compile clean under `pnpm tsc --noEmit` (CLAUDE.md ALWAYS rule #1).

## Task Commits

1. **Task 2: acknowledgePolicyAction + Client AcknowledgeButton** — `6883e84` (feat)
2. **Task 1: replace employee-portal stub with real dashboard + detail surface** — `0f9b6af` (feat)
3. **Task 3: R-6 Ask the AI surface (page + Server Action + Client form)** — `c4ddb01` (feat)

_Note: Task 2 was committed before Task 1 because Task 1's `[id]/page.tsx` imports `AcknowledgeButton` from Task 2 — committing Task 1 first would have failed `pnpm tsc --noEmit` on the missing-import error. The reorder respects the per-task atomicity intent of the plan while keeping every commit tsc-green per CLAUDE.md ALWAYS rule #1. The plan's logical task IDs (Task 1 / Task 2 / Task 3) are preserved in commit messages so SUMMARY traceability is intact._

## Files Created/Modified

- `app/(employee)/layout.tsx` — Minimal force-dynamic employee shell with getOrgContext gate. No admin role narrowing.
- `app/(employee)/my-policies/page.tsx` — Wholesale replacement of 03-G3 T9 stub Card. Real Server Component dashboard listing assigned+published policies via Policies.listAssignedAndPublishedForUser, with per-row AckStatusBadge and D-04a empty-state copy.
- `app/(employee)/my-policies/[id]/page.tsx` — D-27 access-aware Server Component. Branch A: full PolicyView + AckStatusBadge + AcknowledgeButton (gated on ackState !== 'current'). Branch B: amber-banner TL;DR-only view (no PolicyView, no Acknowledge button). Branch C: notFound() (404).
- `app/(employee)/my-policies/[id]/actions.ts` — `acknowledgePolicyAction` Server Action. Zod policyId brand parse, x-forwarded-for first-hop IP capture (D-05), typed-error mapping for PolicyArchivedError/PolicyNotAssignedError/PolicyNotFoundError, revalidatePath outside try/catch (D-10c).
- `app/(employee)/my-policies/ask/page.tsx` — R-6 RSC shell rendering AskQuestionForm + back-nav link.
- `app/(employee)/my-policies/ask/actions.ts` — `askQuestionAction` Server Action wrapping lib/ai/qa.ts::askQuestion. Zod max(2000) char cap, Anthropic.APIError → semantic 503 inline error. NO revalidatePath (non-mutating).
- `components/employee/AcknowledgeButton.tsx` — Client wrapper around acknowledgePolicyAction via React 19 useActionState. Success rendered from state.ackedAt (formState), not isPending (RESEARCH Pitfall 5).
- `components/employee/AskQuestionForm.tsx` — Client wrapper around askQuestionAction via React 19 useActionState. Renders answer + clickable citation Links with D-27a visual hint (italic + muted for tldr-only; plain underline for full).

## Decisions Made

- **components/employee/ directory** — Chose over components/policy/ for employee-only Client Components (AcknowledgeButton, AskQuestionForm). Rationale: keeps the policy/ namespace for shared admin+employee components (PolicyView, AckStatusBadge, PolicyStatusBadge). 05-CONTEXT.md "Claude's Discretion" explicitly permits either choice.
- **3-branch access logic in ONE withOrgScope** — All four sub-queries (assigned-list, full-policy load, hasGrant predicate, grant-policy load) run inside a single withOrgScope closure returning a discriminated AccessResult union (`full | tldr | notfound`). Atomicity guarantees RLS evaluates consistently across sub-queries; a race (e.g., admin archives policy mid-flight) either rolls back or commits as one unit. Pattern adapted from the lib/policies/acknowledgment.ts orchestrator's D-10a single-transaction shape.
- **Cast contentJson at the PolicyView boundary** — Drizzle types policies.contentJson as `unknown` from jsonb $inferSelect. PolicyView expects `JSONContent` from @tiptap/react. Cast `as JSONContent` at the page boundary is safe because the column is server-controlled (Phase 3 ADR-005, Drizzle-owned writes only). Mirrors the same `unknown → JSONContent` cast pattern in components/policy/EditPolicyForm.tsx (which types initialContent as unknown).
- **AcknowledgeButton ackState union narrowed to 'none' | 'stale'** — The 'current' branch is structurally unreachable in this Client component because the parent page gates render via `assignedRow.ackState !== 'current' && <AcknowledgeButton ... />`. Typing the prop as the two-member union (not the full three-member union) makes the button-label ternary exhaustive at compile time without a defensive else case.
- **Plain HTML button with buttonVariants className** — Used `<button className={buttonVariants(...)}>` rather than importing the Button component from @/components/ui/button in AcknowledgeButton and AskQuestionForm. Two equivalent options; chose the plain-element + className path for minimal Client JS bundle size (Button.tsx is itself a thin shadcn wrapper around a plain button with class composition). No semantic difference.

## Deviations from Plan

None — plan executed exactly as written. All 8 files created per `files_modified` spec, all D-NN decision references honored verbatim, all grep-asserted acceptance copy locked with correct Unicode em-dashes.

The one task-ordering adjustment (Task 2 committed before Task 1 to satisfy `tsc --noEmit` import-resolution) is documented above in the Task Commits section and does NOT change task boundaries, content, or scope — only commit order within the same plan.

## Self-Check

Verified via grep + git log:

```
✓ app/(employee)/layout.tsx — exists, contains force-dynamic, getOrgContext, NO requireAdmin (grep -c "requireAdmin" returns 0)
✓ app/(employee)/my-policies/page.tsx — calls listAssignedAndPublishedForUser, exact D-04a copy "No policies assigned yet — contact your administrator." present, stub copy "Employee portal — coming soon" GONE (grep -c returns 0), Link to /my-policies/ask present
✓ app/(employee)/my-policies/[id]/page.tsx — PolicyIdSchema.safeParse + notFound() calls (multiple), QaCitationGrants.hasGrant called, exact D-27 banner copy present, PolicyView + AckStatusBadge + AcknowledgeButton imports + renders
✓ app/(employee)/my-policies/[id]/actions.ts — 'use server', x-forwarded-for split(',')[0] first hop, 3 typed-error classes mapped to code discriminants (POLICY_ARCHIVED, POLICY_NOT_ASSIGNED, POLICY_NOT_FOUND), 2 revalidatePath calls outside try/catch (awk verified)
✓ components/employee/AcknowledgeButton.tsx — 'use client', useActionState wired, formState success rendering
✓ app/(employee)/my-policies/ask/actions.ts — 'use server', askQuestion(ctx, ...) call, Anthropic.APIError catch, z.string().min(1).max(2000) cap
✓ app/(employee)/my-policies/ask/page.tsx — renders AskQuestionForm
✓ components/employee/AskQuestionForm.tsx — 'use client', useActionState, citation Links with accessibility-flagged italic className for tldr-only
✓ pnpm tsc --noEmit exits 0 (verified after each of the 3 commits)
✓ git log --oneline shows all 3 commit hashes (6883e84, 0f9b6af, c4ddb01)
```

## Self-Check: PASSED

## Issues Encountered

None. Pre-flight reads confirmed all Wave 1 + Wave 2 dependencies were in place (recordAcknowledgment, askQuestion with D-27a annotation, listAssignedAndPublishedForUser, hasGrant, AckStatusBadge, PolicyView, lib/policies/errors.ts subclasses). Textarea shadcn primitive was verified present in components/ui/ — no fallback needed.

## User Setup Required

None — no external service configuration or environment variable changes required. All API surfaces (Anthropic via askQuestion, Clerk via getOrgContext, Supabase RLS via withOrgScope) are inherited from prior phases.

## Next Phase Readiness

Wave 3 sibling **Plan 05-06 (admin bulk-assign)** can now run — no file overlap with this plan; parallelization=false in the plan frontmatter will serialize via the orchestrator.

Downstream consumers ready:
- **Plan 05-08 ci-gates** — `scripts/check-acknowledgment-immutability.ts` will scan `app/(employee)/my-policies/[id]/actions.ts`. This file contains zero `.update(acknowledgments)` / `.delete(acknowledgments)` calls (acknowledgments writes are confined to `lib/policies/acknowledgment.ts` orchestrator via `Acknowledgments.record`). Will pass.
- **Plan 05-08 ci-gates** — `scripts/check-error-discipline.ts` widening to `lib/policies/**` AND `app/(employee)/**` — both Server Actions catch typed PolicyDomainError subclasses + Anthropic.APIError, never raw Error. Will pass.
- **Plan 05-08 ci-gates** — `scripts/check-policy-id-brand.ts` REPO_TARGETS extension. This plan touches three brand-bearing positions (`acknowledgePolicyAction` parses via PolicyIdSchema; `recordAcknowledgment` takes branded PolicyId; the page-handler safeParse lifts the URL string into a brand). All three are correctly branded.
- **Plan 05-09 integration-test** — Will create `app/(employee)/my-policies/[id]/actions.test.ts` + `ask/actions.test.ts` test files. The Server Actions exported here (acknowledgePolicyAction, askQuestionAction) export their typed ActionState types for the test fixtures to import.

No blockers or concerns for downstream waves.

---
*Phase: 05-employee-portal*
*Completed: 2026-05-24*
