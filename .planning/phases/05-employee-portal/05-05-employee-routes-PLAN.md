---
phase: 05-employee-portal
plan: 05
type: execute
wave: 3
depends_on:
  - 05-01
  - 05-02
  - 05-03
  - 05-04
  - 05-07
files_modified:
  - app/(employee)/layout.tsx
  - app/(employee)/my-policies/page.tsx
  - app/(employee)/my-policies/[id]/page.tsx
  - app/(employee)/my-policies/[id]/actions.ts
  - app/(employee)/my-policies/ask/page.tsx
  - app/(employee)/my-policies/ask/actions.ts
  - components/employee/AcknowledgeButton.tsx
  - components/employee/AskQuestionForm.tsx
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "/my-policies renders only published policies assigned to the requesting user (directly or via dept) — replaces 03-G3 T9 stub"
    - "/my-policies/[id] page handler implements D-27 3-branch access logic: assigned → full PolicyView; else has-grant → TL;DR-only; else notFound()"
    - "/my-policies/[id] Acknowledge button submits to acknowledgePolicyAction via React 19 useActionState"
    - "/my-policies/ask page renders a Client question form posting to askQuestionAction"
    - "Empty-state copy (D-04a) verbatim: 'No policies assigned yet — contact your administrator.'"
    - "TL;DR-only banner copy (D-27) verbatim: 'This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access.'"
    - "Server Actions: Zod parse + try/catch + revalidatePath OUTSIDE try/catch per Phase 3 D-09"
    - "PolicyArchivedError → ok=false, code='POLICY_ARCHIVED'; PolicyNotAssignedError → ok=false, code='POLICY_NOT_ASSIGNED'"
    - "Ask the AI link in /my-policies header navigates to /my-policies/ask per D-24"
  artifacts:
    - path: "app/(employee)/layout.tsx"
      provides: "minimal employee auth gate (getOrgContext only; NO requireAdmin)"
      contains: "force-dynamic"
    - path: "app/(employee)/my-policies/page.tsx"
      provides: "Server Component dashboard list (replaces 03-G3 T9 stub)"
      contains: "listAssignedAndPublishedForUser"
    - path: "app/(employee)/my-policies/[id]/page.tsx"
      provides: "3-branch access-aware Server Component (full / TL;DR / 404)"
      contains: "QaCitationGrants.hasGrant"
    - path: "app/(employee)/my-policies/[id]/actions.ts"
      provides: "acknowledgePolicyAction Server Action"
      contains: "recordAcknowledgment"
    - path: "app/(employee)/my-policies/ask/page.tsx"
      provides: "R-6 RSC shell"
      contains: "AskQuestionForm"
    - path: "app/(employee)/my-policies/ask/actions.ts"
      provides: "askQuestionAction Server Action"
      contains: "askQuestion"
    - path: "components/employee/AcknowledgeButton.tsx"
      provides: "Client form wrapping acknowledgePolicyAction via useActionState"
      contains: "useActionState"
    - path: "components/employee/AskQuestionForm.tsx"
      provides: "Client form wrapping askQuestionAction via useActionState"
      contains: "useActionState"
  key_links:
    - from: "app/(employee)/my-policies/page.tsx"
      to: "Policies.listAssignedAndPublishedForUser"
      via: "withOrgScope(ctx, s => Policies.listAssignedAndPublishedForUser(s, ctx.userId))"
      pattern: "listAssignedAndPublishedForUser"
    - from: "app/(employee)/my-policies/[id]/page.tsx"
      to: "QaCitationGrants.hasGrant"
      via: "D-27 fallback branch check"
      pattern: "QaCitationGrants\\.hasGrant"
    - from: "app/(employee)/my-policies/[id]/actions.ts"
      to: "lib/policies/acknowledgment.ts recordAcknowledgment"
      via: "Server Action call inside try/catch"
      pattern: "recordAcknowledgment\\(ctx"
    - from: "app/(employee)/my-policies/ask/actions.ts"
      to: "lib/ai/qa.ts askQuestion"
      via: "Server Action call inside try/catch"
      pattern: "askQuestion\\(ctx"
---

<objective>
Wave 3. Replace the 03-G3 T9 employee-portal stub with the real Phase 5 surface. Create:

1. `app/(employee)/layout.tsx` — minimal force-dynamic layout with `getOrgContext()` gate (no requireAdmin; admins can also be policy-assigned per SPEC In-Scope).
2. `app/(employee)/my-policies/page.tsx` — real Server Component listing assigned+published policies with `AckStatusBadge` per row + "Ask the AI" header link. Empty-state copy locked per D-04a.
3. `app/(employee)/my-policies/[id]/page.tsx` — D-27 3-branch access-aware Server Component: assigned → full PolicyView + Acknowledge; has-grant → TL;DR-only + banner; else notFound().
4. `app/(employee)/my-policies/[id]/actions.ts` — `acknowledgePolicyAction` Server Action (Zod + IP capture from x-forwarded-for + recordAcknowledgment + typed catch).
5. `app/(employee)/my-policies/ask/page.tsx` — R-6 Server Component shell.
6. `app/(employee)/my-policies/ask/actions.ts` — `askQuestionAction` Server Action.
7. `components/employee/AcknowledgeButton.tsx` — Client wrapper using React 19 `useActionState`.
8. `components/employee/AskQuestionForm.tsx` — Client wrapper using React 19 `useActionState`.

Purpose: This plan is the user-visible surface of Phase 5 — SPEC R-1 dashboard, R-2 ack-click, R-3 re-ack indicator (rendered via AckStatusBadge from Plan 05-07), R-6 Q&A page. Depends on Wave 1 schema + Wave 2 repositories/orchestrators + Wave 3 sibling Plan 05-07 (AckStatusBadge component which this plan renders).

Output: Eight new/modified files implementing the full employee-visible surface; tsc clean.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/05-employee-portal/05-SPEC.md
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-RESEARCH.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@lib/auth/context.ts
@lib/db/scoped.ts
@lib/policies/types.ts
@lib/policies/errors.ts
@lib/policies/acknowledgment.ts
@lib/ai/qa.ts
@lib/db/repositories/policies.ts
@lib/db/repositories/qa_citation_grants.ts
@app/(admin)/layout.tsx
@app/(admin)/policies/page.tsx
@app/(admin)/policies/[id]/page.tsx
@app/(admin)/policies/[id]/actions.ts
@components/policy/PolicyView.tsx
@components/policy/AckStatusBadge.tsx
@app/(employee)/my-policies/page.tsx

<interfaces>
<!-- Wave 2 + 05-07 dependencies — what this plan calls/renders -->

From lib/policies/acknowledgment.ts (Plan 05-04):
```typescript
export async function recordAcknowledgment(ctx: OrgContext, policyId: PolicyId, ipAddress: string | null): Promise<{ ackedAt: string }>;
```

From lib/ai/qa.ts (Plan 05-04):
```typescript
export async function askQuestion(ctx: OrgContext, question: string): Promise<{
  answer: string;
  citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[];
}>;
```

From lib/db/repositories/policies.ts (Plan 05-03):
```typescript
listAssignedAndPublishedForUser: (s: OrgScope, userId: string) => Promise<{
  id: string; title: string; category: string; currentVersion: number;
  tldrSummary: string | null; ackState: 'none' | 'current' | 'stale'; ackedAt: Date | null;
}[]>;
findById: (s: OrgScope, policyId: PolicyId) => Promise<{...policy}[]>;  // existing Phase 3
```

From lib/db/repositories/qa_citation_grants.ts (Plan 05-03):
```typescript
hasGrant: (s: OrgScope, userId: string, policyId: PolicyId) => Promise<boolean>;
```

From components/policy/AckStatusBadge.tsx (Plan 05-07):
```typescript
export function AckStatusBadge({ ackState, ackedAt }: { ackState: 'none' | 'current' | 'stale'; ackedAt: Date | null }): JSX.Element | null;
```

From lib/policies/errors.ts (Plan 05-02):
```typescript
export class PolicyArchivedError extends PolicyDomainError { code = 'POLICY_ARCHIVED' }
export class PolicyNotAssignedError extends PolicyDomainError { code = 'POLICY_NOT_ASSIGNED' }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create app/(employee)/layout.tsx + replace stub app/(employee)/my-policies/page.tsx + ship app/(employee)/my-policies/[id]/page.tsx (D-27 access-aware)</name>
  <files>app/(employee)/layout.tsx, app/(employee)/my-policies/page.tsx, app/(employee)/my-policies/[id]/page.tsx</files>
  <read_first>
    - app/(admin)/layout.tsx (full file — closest layout analog; force-dynamic + auth gate header pattern; REPLACE `await requireAdmin();` with `await getOrgContext();` per SPEC In-Scope "any authenticated userId, no role narrowing")
    - app/(admin)/policies/page.tsx (full file — RSC list pattern with withOrgScope + Card empty-state + Table)
    - app/(admin)/policies/[id]/page.tsx (full file — RSC detail with PolicyIdSchema.safeParse + notFound + PolicyView pattern)
    - app/(employee)/my-policies/page.tsx (current 03-G3 T9 stub — REPLACE wholesale; preserve nothing structural)
    - components/policy/PolicyView.tsx (REUSE verbatim per D-27 full-branch render)
    - lib/db/repositories/policies.ts (post-Plan 05-03 — listAssignedAndPublishedForUser signature)
    - lib/db/repositories/qa_citation_grants.ts (Plan 05-03 — hasGrant signature)
    - lib/policies/types.ts (PolicyIdSchema.safeParse pattern at trust boundary)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Dashboard Query D-01..D-04a + R-6 Q&A Surface D-27 (3-branch logic) + § specifics (exact empty-state + TL;DR banner copy)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`app/(employee)/layout.tsx`" + "`app/(employee)/my-policies/page.tsx`" + "`app/(employee)/my-policies/[id]/page.tsx`"
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 5 (React 19 useActionState + revalidatePath quirk — informs Client component for Plan 05-07/05-05 Task 4)
  </read_first>
  <action>
**Sub-task 1a: `app/(employee)/layout.tsx` (NEW).**

Create a minimal layout file. Mirror `app/(admin)/layout.tsx` shape but:
- Imports: `ReactNode` from react; `getOrgContext` from `@/lib/auth/context`; `UserButton` from `@clerk/nextjs` (optional — minimal UI).
- `export const dynamic = "force-dynamic";` (mirror admin layout precedent — getOrgContext + headers() are inherently dynamic; without this, Vercel build prerender of /my-policies/[id] would fail with ClerkAuthFailedError per Phase 4 PR #19 lesson).
- `export default async function EmployeeLayout({ children }: { children: ReactNode })`:
  - `await getOrgContext();` (throws BootstrapError on no-session; Next.js error boundary handles — middleware will have intercepted in normal flow per ADR-009)
  - Body: minimal `<div className="min-h-screen bg-background"><header className="border-b"><div className="container mx-auto flex items-center justify-between p-4"><span className="font-semibold">My Policies</span><UserButton /></div></header><main className="container mx-auto p-6">{children}</main></div>`
- File-header comment: "app/(employee)/layout.tsx — Plan 05-05 Task 1a. Minimal force-dynamic employee shell per SPEC In-Scope. NO requireAdmin (admins can also be policy-assigned per SPEC). getOrgContext gate; middleware ADR-009 handles auth chokepoint upstream — this is the page-level fail-closed backup."

NO AdminSidebar / OrganizationSwitcher. NO requireAdmin or role-narrowing. Force-dynamic is non-negotiable per Phase 4 PR #19 lesson documented in admin/layout.tsx.

**Sub-task 1b: Replace `app/(employee)/my-policies/page.tsx` wholesale (currently 03-G3 T9 stub Card).**

Delete the existing stub body. New implementation:
- File-header comment: "app/(employee)/my-policies/page.tsx — Plan 05-05 Task 1b. Replaces 03-G3 T9 stub Card wholesale. Real Server Component dashboard per SPEC R-1 + D-01..D-04 + D-04a (empty-state) + D-24 (Ask the AI affordance)."
- Imports: `Link` from next/link; `Card, CardHeader, CardTitle, CardContent, CardDescription` from `@/components/ui/card`; `Badge`-related per Tailwind from `@/components/ui/badge` (already present); `withOrgScope` from `@/lib/db/scoped`; `getOrgContext` from `@/lib/auth/context`; `Policies` from `@/lib/db/repositories/policies`; `AckStatusBadge` from `@/components/policy/AckStatusBadge` (Plan 05-07).
- `export default async function MyPoliciesPage()`:
  - `const ctx = await getOrgContext();`
  - `const rows = await withOrgScope(ctx, async (s) => Policies.listAssignedAndPublishedForUser(s, ctx.userId));`
  - Header: `<div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-semibold">My Policies</h1><Link href="/my-policies/ask" className={buttonVariants({ variant: "outline" })}>Ask the AI</Link></div>` (or equivalent — discretion on exact Tailwind, but the link MUST navigate to `/my-policies/ask` per D-24)
  - Empty-state branch (`rows.length === 0`):
    - `<Card><CardHeader><CardTitle>No policies assigned yet</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">No policies assigned yet — contact your administrator.</p></CardContent></Card>`
    - The body text MUST contain the exact D-04a string: `No policies assigned yet — contact your administrator.` (use a long em-dash `—` per CONTEXT — match Unicode exactly; this is grep-asserted)
  - Non-empty branch: map `rows` to a list of Cards, each with:
    - `<Link href={\`/my-policies/${row.id}\`}>` wrapping the Card
    - Card contains title, category, and `<AckStatusBadge ackState={row.ackState} ackedAt={row.ackedAt} />` for the re-ack indicator
- NO PolicyListSearch / PolicyStatusFilter (admin-only; employee dashboard doesn't filter in Phase 5)
- NO "Create policy" button (admin only)

**Sub-task 1c: `app/(employee)/my-policies/[id]/page.tsx` (NEW) — D-27 access-aware 3-branch.**

- File-header comment: "app/(employee)/my-policies/[id]/page.tsx — Plan 05-05 Task 1c. D-27 access-aware Server Component. Three branches: (a) assigned-and-published → render full PolicyView + Acknowledge button; (b) else has-grant + published → render TL;DR-only with banner; (c) else notFound() (404). Security boundary is enforced server-side here; the D-27a accessibility flag on Q&A citation links is for UI hint only."
- Imports: `notFound` from next/navigation; `PolicyIdSchema` from `@/lib/policies/types`; `withOrgScope` from `@/lib/db/scoped`; `getOrgContext` from `@/lib/auth/context`; `Policies` from `@/lib/db/repositories/policies`; `QaCitationGrants` from `@/lib/db/repositories/qa_citation_grants`; `PolicyView` from `@/components/policy/PolicyView`; `AcknowledgeButton` from `@/components/employee/AcknowledgeButton` (Sub-task 1d Task 2); `AckStatusBadge` from `@/components/policy/AckStatusBadge` (Plan 05-07); `Card, CardHeader, CardTitle, CardContent` from `@/components/ui/card`.
- `export default async function MyPolicyDetailPage({ params }: { params: Promise<{ id: string }> })`:
  - `const { id } = await params;`
  - `const idParsed = PolicyIdSchema.safeParse(id); if (!idParsed.success) notFound();` (D-10 "advertise nothing" — malformed URL = 404, not 500)
  - `const ctx = await getOrgContext();`
  - Inside one `withOrgScope` closure:
    - `const assignedRows = await Policies.listAssignedAndPublishedForUser(s, ctx.userId);`
    - `const assignedRow = assignedRows.find(r => r.id === idParsed.data);`
    - Branch A (assigned): if `assignedRow` exists, ALSO load full content via `const fullRows = await Policies.findById(s, idParsed.data); const fullPolicy = fullRows[0]; if (!fullPolicy) notFound();` (defense-in-depth — should never happen because the assignment join was satisfied, but RLS could deny on race; return 404 not 500)
    - Branch B (grant): else `const granted = await QaCitationGrants.hasGrant(s, ctx.userId, idParsed.data); if (granted) { const grantRows = await Policies.findById(s, idParsed.data); const grantPolicy = grantRows[0]; if (grantPolicy && grantPolicy.status === 'published') return { branch: 'tldr', policy: grantPolicy }; }`
    - Branch C: else `notFound()`
  - Render based on branch:
    - **Branch A (full)**: `<div className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">{fullPolicy.title}</h1><AckStatusBadge ackState={assignedRow.ackState} ackedAt={assignedRow.ackedAt} /></div><PolicyView content={fullPolicy.contentJson} />{assignedRow.ackState !== 'current' && <AcknowledgeButton policyId={fullPolicy.id} ackState={assignedRow.ackState} />}</div>`
    - **Branch B (TL;DR-only)**: `<div className="space-y-4"><h1 className="text-2xl font-semibold">{grantPolicy.title}</h1><Card className="border-amber-200 bg-amber-50"><CardContent className="pt-6"><p className="text-sm text-amber-900">This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access.</p></CardContent></Card>{grantPolicy.tldrSummary ? <div className="prose prose-sm max-w-none"><p>{grantPolicy.tldrSummary}</p></div> : <p className="text-sm text-muted-foreground italic">No summary available yet.</p>}</div>`
    - The banner text MUST contain the exact D-27 string: `This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access.` (long em-dash; grep-asserted)
- DO NOT render the full PolicyView in branch B (TL;DR-only is the explicit security boundary per D-27)
- DO NOT show an Acknowledge button in branch B (no assignment = no ack semantics; grant doesn't elevate to ack-eligibility)

The branch logic MUST be inside ONE `withOrgScope` closure so RLS applies uniformly across all sub-queries (atomicity + consistency across the brief query window).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "No policies assigned yet — contact your administrator" app/\\(employee\\)/my-policies/page.tsx && grep -c "This policy was cited in your AI answer but isn't assigned to you" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx && grep -c "notFound" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `app/(employee)/layout.tsx` exists, contains `force-dynamic`, calls `getOrgContext`, does NOT contain `requireAdmin`
    - `app/(employee)/my-policies/page.tsx` exists, calls `listAssignedAndPublishedForUser`, contains the EXACT D-04a empty-state copy `No policies assigned yet — contact your administrator.`, contains a Link to `/my-policies/ask`
    - The stub `<Card><CardTitle>Employee portal — coming soon</CardTitle>` from 03-G3 T9 is GONE (`grep -c "Employee portal — coming soon" app/\\(employee\\)/my-policies/page.tsx` returns 0)
    - `app/(employee)/my-policies/[id]/page.tsx` exists, contains `PolicyIdSchema.safeParse`, contains `notFound()` calls (at least 2 — one for safeParse fail + one for else branch), calls `QaCitationGrants.hasGrant`, contains the EXACT D-27 banner copy
    - `grep -c "import { PolicyView }" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx` returns 1 (full-branch reuse)
    - `grep -c "AckStatusBadge" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx` returns at least 1 (full-branch render)
    - `grep -c "AcknowledgeButton" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx` returns at least 1 (full-branch render; Sub-task 1d Task 2 creates the component)
    - Page handler does NOT render PolicyView in the TL;DR branch (`grep -nA10 "tldrSummary" app/\\(employee\\)/my-policies/\\[id\\]/page.tsx | grep -c "PolicyView"` returns 0 in that scope — manual verify acceptable)
  </acceptance_criteria>
  <done>
    Employee layout shipped, dashboard list page replaces stub, D-27 access-aware detail page renders 3 distinct branches correctly; tsc clean; D-04a + D-27 exact copy strings present verbatim.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create components/employee/AcknowledgeButton.tsx + app/(employee)/my-policies/[id]/actions.ts</name>
  <files>components/employee/AcknowledgeButton.tsx, app/(employee)/my-policies/[id]/actions.ts</files>
  <read_first>
    - app/(admin)/policies/[id]/actions.ts (lines 1-100 file-header + policyIdFrom helper at lines 71-98 + revalidateAfter at lines 124-128 + publishAction at lines 199-212 — closest Server Action analog)
    - lib/policies/acknowledgment.ts (Plan 05-04 — recordAcknowledgment signature)
    - lib/policies/errors.ts (Plan 05-02 — PolicyArchivedError + PolicyNotAssignedError + PolicyNotFoundError)
    - lib/policies/types.ts (PolicyIdSchema for Zod boundary)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Acknowledgment Server Action (D-05..D-10c)
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Pitfall 5 (React 19 useActionState + revalidatePath quirk — return ackedAt in formState rather than relying on isPending)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`app/(employee)/my-policies/[id]/actions.ts`"
  </read_first>
  <action>
**Sub-task 2a: `app/(employee)/my-policies/[id]/actions.ts` (NEW).**

File-header comment block (mirror admin/policies/[id]/actions.ts lines 1-38 shape):
- "app/(employee)/my-policies/[id]/actions.ts — Plan 05-05 Task 2a. acknowledgePolicyAction Server Action per Phase 5 D-09 + D-10b + D-10c."
- "Wraps lib/policies/acknowledgment.ts::recordAcknowledgment. The orchestrator owns the transactional business logic; this file is the Server Action trust boundary (Zod parse + IP capture + typed-error mapping + revalidatePath)."
- "D-05 — IP capture from request: `headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null` (Vercel strips client-supplied values at edge; local dev returns null)."
- "D-10c — revalidatePath OUTSIDE try/catch per Phase 3 D-09 + Next.js 15 requirement."
- "RESEARCH Pitfall 5 — return `ackedAt` in formState so UI doesn't depend on `isPending` from useActionState (which stays stuck after revalidatePath under known Next.js issue #82289)."

Imports:
- `'use server'`
- `revalidatePath` from `next/cache`
- `headers` from `next/headers`
- `z` from `zod`
- `getOrgContext` from `@/lib/auth/context`
- `recordAcknowledgment` from `@/lib/policies/acknowledgment`
- `PolicyIdSchema` from `@/lib/policies/types`
- `PolicyArchivedError, PolicyNotAssignedError, PolicyNotFoundError` from `@/lib/policies/errors`

Type definitions:
```typescript
export type AcknowledgeActionState =
  | { ok: true; ackedAt: string }
  | { ok: false; error: string; code?: 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED' | 'POLICY_NOT_FOUND' };

const Schema = z.object({ policyId: PolicyIdSchema });
const INVALID_PAYLOAD: AcknowledgeActionState = { ok: false, error: 'Invalid action payload.' };
```

Action body:
```typescript
export async function acknowledgePolicyAction(
  _prev: AcknowledgeActionState | undefined,
  formData: FormData,
): Promise<AcknowledgeActionState> {
  const parsed = Schema.safeParse({ policyId: formData.get('policyId') });
  if (!parsed.success) return INVALID_PAYLOAD;

  // D-05 — read x-forwarded-for OUTSIDE try (so error path doesn't lose IP for ops logs).
  const ipAddress = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  let result: { ackedAt: string };
  try {
    const ctx = await getOrgContext();
    result = await recordAcknowledgment(ctx, parsed.data.policyId, ipAddress);
  } catch (err) {
    if (err instanceof PolicyArchivedError) {
      return { ok: false, error: 'This policy was archived. Refresh to update your list.', code: 'POLICY_ARCHIVED' };
    }
    if (err instanceof PolicyNotAssignedError) {
      return { ok: false, error: 'You are no longer assigned this policy.', code: 'POLICY_NOT_ASSIGNED' };
    }
    if (err instanceof PolicyNotFoundError) {
      return { ok: false, error: 'Policy not found.', code: 'POLICY_NOT_FOUND' };
    }
    throw err;  // bubble unknown errors to Next.js error boundary
  }

  // D-10c — revalidatePath outside try/catch (Next.js 15 throws specially for these;
  // catching breaks the revalidation).
  revalidatePath('/my-policies');
  revalidatePath(`/my-policies/${parsed.data.policyId}`);
  return { ok: true, ackedAt: result.ackedAt };
}
```

NO try/catch around revalidatePath. NO redirect (employee stays on the same page; UI updates via useActionState formState reading the new `ackedAt`).

**Sub-task 2b: `components/employee/AcknowledgeButton.tsx` (NEW Client Component).**

File-header comment: "components/employee/AcknowledgeButton.tsx — Plan 05-05 Task 2b. Client wrapper around acknowledgePolicyAction using React 19 `useActionState`. Renders based on D-11 ackState branches (none → 'Acknowledge'; stale → 'Re-acknowledge')."

Imports:
- `'use client'` at top
- `useActionState` from `react`
- `acknowledgePolicyAction, type AcknowledgeActionState` from `@/app/(employee)/my-policies/[id]/actions`
- `Button` from `@/components/ui/button`

Component:
```typescript
'use client';
import { useActionState } from 'react';
import { acknowledgePolicyAction, type AcknowledgeActionState } from '@/app/(employee)/my-policies/[id]/actions';
import { Button } from '@/components/ui/button';

const initialState: AcknowledgeActionState | undefined = undefined;

export function AcknowledgeButton({
  policyId,
  ackState,
}: {
  policyId: string;
  ackState: 'none' | 'stale';
}) {
  const [state, formAction, isPending] = useActionState<AcknowledgeActionState | undefined, FormData>(
    acknowledgePolicyAction,
    initialState,
  );

  const buttonLabel = ackState === 'stale' ? 'Re-acknowledge' : 'Acknowledge';

  // RESEARCH Pitfall 5 — render from formState, not isPending (which can stick after revalidatePath).
  // Successful submission: state.ok === true and state.ackedAt is set → UI shows "Acknowledged" inline.
  if (state?.ok) {
    return (
      <p className="text-sm text-green-700">
        ✓ Acknowledged on {new Date(state.ackedAt).toLocaleDateString('en-US')}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="policyId" value={policyId} />
      <Button type="submit" disabled={isPending}>
        {isPending ? 'Submitting…' : buttonLabel}
      </Button>
      {state && !state.ok && (
        <p className="text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
```

The `useActionState` initialState is explicitly `undefined` (D-09 + Phase 3 convention). The component does NOT render anything when `ackState === 'current'` (that path is handled in the page render — `assignedRow.ackState !== 'current' && <AcknowledgeButton ... />` per Task 1c).

NO direct DOM manipulation. NO useEffect. NO localStorage. Just useActionState + form.

Discretion: components/employee/ (NEW directory) chosen over components/policy/ — keeps the policy/ namespace for shared admin+employee components (PolicyView, AckStatusBadge) while components/employee/ holds employee-only Client Components. Operator may move later.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "use server" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts && grep -c "x-forwarded-for" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts && grep -c "PolicyArchivedError" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts && grep -c "useActionState" components/employee/AcknowledgeButton.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `app/(employee)/my-policies/[id]/actions.ts` exists, contains `'use server'`, exports `acknowledgePolicyAction` AND `AcknowledgeActionState` type
    - `grep -c "x-forwarded-for" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns 1
    - `grep -c "split(',')\\[0\\]" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns 1 (first hop only per D-05)
    - `grep -c "headers()" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns at least 1
    - `grep -cE "PolicyArchivedError|PolicyNotAssignedError|PolicyNotFoundError" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns at least 3
    - `grep -c "revalidatePath" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns at least 2 (one for /my-policies, one for /my-policies/[id])
    - The revalidatePath calls are NOT inside any try/catch (`awk '/try \\{/,/\\} catch/' app/\\(employee\\)/my-policies/\\[id\\]/actions.ts | grep -c "revalidatePath"` returns 0)
    - `components/employee/AcknowledgeButton.tsx` exists, contains `'use client'`, contains `useActionState`
    - `grep -c "POLICY_ARCHIVED" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns 1 (D-07 code discriminant)
    - `grep -c "POLICY_NOT_ASSIGNED" app/\\(employee\\)/my-policies/\\[id\\]/actions.ts` returns 1 (D-08 code discriminant)
  </acceptance_criteria>
  <done>
    Server Action exists with full typed-error mapping + IP capture + revalidatePath outside try; Client AcknowledgeButton wraps via useActionState; both tsc clean.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Create app/(employee)/my-policies/ask/page.tsx + app/(employee)/my-policies/ask/actions.ts + components/employee/AskQuestionForm.tsx (R-6)</name>
  <files>app/(employee)/my-policies/ask/page.tsx, app/(employee)/my-policies/ask/actions.ts, components/employee/AskQuestionForm.tsx</files>
  <read_first>
    - app/(admin)/policies/[id]/actions.ts (editPublishedAction at lines 285-302 — complex Zod payload + try/catch pattern)
    - lib/ai/qa.ts (Plan 05-04 — askQuestion signature returning {answer, citations[]})
    - lib/ai/schemas.ts (QaSchema if exists — for question max-length convention from Phase 4)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § R-6 Q&A Surface (D-24, D-27a)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`app/(employee)/my-policies/ask/page.tsx`" + "`app/(employee)/my-policies/ask/actions.ts`"
  </read_first>
  <action>
**Sub-task 3a: `app/(employee)/my-policies/ask/actions.ts` (NEW Server Action).**

File-header comment: "app/(employee)/my-policies/ask/actions.ts — Plan 05-05 Task 3a. R-6 askQuestionAction Server Action wrapping lib/ai/qa.ts::askQuestion. React 19 useActionState client form posts here."

Imports:
- `'use server'`
- `z` from `zod`
- `Anthropic` from `@anthropic-ai/sdk` (for APIError check)
- `getOrgContext` from `@/lib/auth/context`
- `askQuestion` from `@/lib/ai/qa`

Type definitions:
```typescript
export type AskActionState =
  | { ok: true; answer: string; citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[] }
  | { ok: false; error: string };

// Length cap per Phase 4 D-42 .strict() convention; 2000 chars is generous for any reasonable Q&A.
const Schema = z.object({ question: z.string().min(1).max(2000) });
const INVALID_PAYLOAD: AskActionState = { ok: false, error: 'Invalid action payload.' };
```

Action body:
```typescript
export async function askQuestionAction(
  _prev: AskActionState | undefined,
  formData: FormData,
): Promise<AskActionState> {
  const parsed = Schema.safeParse({ question: formData.get('question') });
  if (!parsed.success) return INVALID_PAYLOAD;
  try {
    const ctx = await getOrgContext();
    const result = await askQuestion(ctx, parsed.data.question);
    return { ok: true, answer: result.answer, citations: result.citations };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      // Match the HTTP route's 503 envelope semantically (UI-level).
      return { ok: false, error: 'AI service temporarily unavailable. Please try again.' };
    }
    throw err;  // bubble unknown errors to Next.js error boundary
  }
}
```

NO `revalidatePath` (Q&A doesn't mutate the policy library — useActionState renders the result inline).

**Sub-task 3b: `app/(employee)/my-policies/ask/page.tsx` (NEW RSC shell).**

File-header comment: "app/(employee)/my-policies/ask/page.tsx — Plan 05-05 Task 3b. R-6 RSC shell. Renders AskQuestionForm Client Component."

Imports:
- `getOrgContext` from `@/lib/auth/context`
- `AskQuestionForm` from `@/components/employee/AskQuestionForm`
- `Link` from next/link (for back-nav)

Body:
```typescript
export default async function AskQuestionPage() {
  await getOrgContext();  // auth gate (layout already does this, but defense-in-depth)
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ask the AI about your policies</h1>
        <Link href="/my-policies" className="text-sm underline">Back to my policies</Link>
      </div>
      <AskQuestionForm />
    </div>
  );
}
```

**Sub-task 3c: `components/employee/AskQuestionForm.tsx` (NEW Client Component).**

File-header comment: "components/employee/AskQuestionForm.tsx — Plan 05-05 Task 3c. Client form posting to askQuestionAction via React 19 useActionState. Renders answer + clickable citation Links per R-6 acceptance + D-27a accessibility italic-hint."

Imports:
- `'use client'`
- `useActionState` from react
- `Link` from next/link
- `askQuestionAction, type AskActionState` from `@/app/(employee)/my-policies/ask/actions`
- `Button` from `@/components/ui/button`
- `Textarea` from `@/components/ui/textarea` (if shadcn textarea installed; else `<textarea className="..." />` — Phase 3 D-08 added textarea)
- `Card, CardContent` from `@/components/ui/card`

Component:
```typescript
'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { askQuestionAction, type AskActionState } from '@/app/(employee)/my-policies/ask/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

const initialState: AskActionState | undefined = undefined;

export function AskQuestionForm() {
  const [state, formAction, isPending] = useActionState(askQuestionAction, initialState);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3">
        <Textarea
          name="question"
          placeholder="Ask a question about your company's policies…"
          required
          minLength={1}
          maxLength={2000}
          rows={4}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      {state && !state.ok && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6"><p className="text-sm text-red-900">{state.error}</p></CardContent>
        </Card>
      )}

      {state?.ok && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <p className="whitespace-pre-wrap text-sm">{state.answer}</p>
            </CardContent>
          </Card>
          {state.citations.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Sources</h2>
              <ul className="space-y-1 text-sm">
                {state.citations.map((cit) => (
                  <li key={cit.id}>
                    <Link
                      href={`/my-policies/${cit.id}`}
                      className={
                        cit.accessibility === 'tldr-only'
                          ? 'italic underline text-muted-foreground'
                          : 'underline'
                      }
                    >
                      {cit.title}
                    </Link>
                    {cit.accessibility === 'tldr-only' && (
                      <span className="ml-2 text-xs text-muted-foreground">(summary only)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

D-27a visual hint: tldr-only citations are styled italic + muted-foreground per CONTEXT specifics + ROADMAP (which the page handler in Task 1c re-evaluates for security; UI italic is purely informational).

If `@/components/ui/textarea` doesn't exist (verify via grep), use a plain `<textarea className="w-full border rounded-md p-2 text-sm" />` and document in SUMMARY.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "use server" app/\\(employee\\)/my-policies/ask/actions.ts && grep -c "askQuestion(ctx" app/\\(employee\\)/my-policies/ask/actions.ts && grep -c "useActionState" components/employee/AskQuestionForm.tsx && grep -c "AskQuestionForm" app/\\(employee\\)/my-policies/ask/page.tsx && grep -c "accessibility" components/employee/AskQuestionForm.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - `app/(employee)/my-policies/ask/page.tsx` exists, renders `<AskQuestionForm />`
    - `app/(employee)/my-policies/ask/actions.ts` exists, contains `'use server'`, exports `askQuestionAction` + `AskActionState` type
    - `grep -c "askQuestion(ctx" app/\\(employee\\)/my-policies/ask/actions.ts` returns 1
    - `grep -c "Anthropic.APIError" app/\\(employee\\)/my-policies/ask/actions.ts` returns 1
    - `grep -c "z.string().min(1).max(2000)" app/\\(employee\\)/my-policies/ask/actions.ts` returns 1 (length cap)
    - `components/employee/AskQuestionForm.tsx` exists, contains `'use client'`, uses `useActionState`, renders citations as Links with `href={\`/my-policies/${cit.id}\`}` shape
    - `grep -c "accessibility" components/employee/AskQuestionForm.tsx` returns at least 1 (D-27a visual hint applied)
    - `grep -c "italic" components/employee/AskQuestionForm.tsx` returns at least 1 (D-27a tldr-only italic styling)
  </acceptance_criteria>
  <done>
    R-6 ask page + Server Action + Client form all in place; tsc clean; D-27a italic hint applied to tldr-only citations; HTTP-style 503 mapping for Anthropic failures.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| URL → page handler | `/my-policies/[id]` `id` is raw string; PolicyIdSchema.safeParse + notFound() per CR-PR3-#23 spirit |
| FormData → Server Action | Zod safeParse at trust boundary lifts string → branded PolicyId for ack action |
| Server Action → useActionState → Client render | formState carries `ackedAt` + `citations[]`; RESEARCH Pitfall 5 mitigated by reading from formState not isPending |
| `/my-policies/[id]` D-27 fallback grant access | Page handler check (server-side) is the security boundary; D-27a accessibility flag on citation Link is UI hint only |
| Anthropic error → AskAction → UI | Server Action maps Anthropic.APIError to 503-style "AI service temporarily unavailable" error string for inline display |
| x-forwarded-for header | First-hop only, whitespace-trimmed, NULL on absent; Vercel edge strips client-supplied values per D-05 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-05-01 | Information Disclosure | BOLA on /my-policies/[id] — direct URL access to unrelated policy | mitigate | D-27 page handler 3-branch check: `assigned-and-published(userId, policyId)` (via listAssignedAndPublishedForUser query) → full; `hasGrant(orgId, userId, policyId)` AND `status='published'` → TL;DR-only; else `notFound()`. All queries flow through `withOrgScope` (RLS enforces org-scope). Plan 05-09 integration test asserts cross-org user gets 404 on URL of foreign policy. |
| T-05-05-02 | Information Disclosure | Cross-org citation leak via R-6 (Phase 5 sibling concern) | mitigate | Phase 4 D-41 same-closure validIds defense preserved in lib/ai/qa.ts (Plan 05-04). UI just renders whatever askQuestion returns; the cross-org filtering happened server-side at lib/ai/qa-parser.ts:54 `.filter(c => validIds.has(c.id))`. Plan 05-09 integration test seeds two orgs with overlapping UUIDs and asserts UI for Org-A user never gets Org-B citation. |
| T-05-05-03 | Tampering | acknowledge-while-archived race | mitigate | D-07 — Server Action catches PolicyArchivedError, returns `{ok: false, error: 'This policy was archived...', code: 'POLICY_ARCHIVED'}`. UI displays recovery copy; user refreshes; policy disappears from /my-policies (archived ≠ assigned+published per dashboard query). |
| T-05-05-04 | Tampering | acknowledge-while-unassigned race | mitigate | D-08 — Server Action catches PolicyNotAssignedError. Same recovery flow. |
| T-05-05-05 | Tampering | IP spoofing via crafted x-forwarded-for | mitigate (documented trust boundary) | D-05 explicit choice: read x-forwarded-for first hop verbatim. Vercel edge strips client-supplied x-forwarded-for. Local dev returns null. Header comment in actions.ts documents this trust boundary. |
| T-05-05-06 | Repudiation | ack row missing IP if header absent | accept | D-05 — store NULL when header absent. Audit consumer (Phase 8 reporting) can validate at read time. Acceptable for MVP — IPv6 normalization + GeoIP enrichment out of scope per CONTEXT `<deferred>`. |
| T-05-05-07 | Tampering | Q&A injection via crafted question | mitigate | Phase 4 D-31 layer-1 prompt meta-instruction + layer-2 XML escape (lib/ai/qa-extract.ts:33-44) — inherited verbatim via Plan 05-04 D-25 extraction. Zod max(2000) cap in Server Action limits attack surface. |
| T-05-05-08 | Information Disclosure | useActionState isPending stuck after revalidatePath (Next.js issue #82289) | mitigate | RESEARCH Pitfall 5 — UI reads `state.ackedAt` from formState (not `isPending`) for the success branch. Acknowledgment confirmation displays inline via formState after revalidate; isPending only drives the in-flight button label. |
| T-05-05-09 | Tampering | Malformed UUID in /my-policies/[id]/page params triggering 22P02 → 500 | mitigate | PolicyIdSchema.safeParse + notFound() (CR-PR3-#23 spirit). Malformed = same 404 as missing/cross-org per D-10 "advertise nothing". |
| T-05-05-10 | Tampering | Stale revalidatePath path arg causing stale dashboard render | accept | revalidatePath('/my-policies') + revalidatePath(\`/my-policies/${policyId}\`). Server-rendered page is re-fetched on next navigation; useActionState formState bridges the brief gap (RESEARCH Pitfall 5 mitigation). |
| T-05-05-SC | Tampering | npm installs | accept | No new packages. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0 across all 8 files
- `pnpm verify:phase-4` still exits 0 (no regression to admin surfaces — admin layout/page/action paths untouched by this plan)
- Manual smoke (not in execute-phase scope; covered by Plan 05-10 operator UAT): visit `/my-policies` while signed in as a non-admin user → see empty-state or assigned policies; click into a policy → see full content + AckStatusBadge + Acknowledge button; click Acknowledge → see "✓ Acknowledged on {date}"; visit `/my-policies/ask` → submit a question → see answer + citations with proper italic styling for tldr-only.
</verification>

<success_criteria>
- All 8 files exist and tsc clean
- D-04a empty-state copy + D-27 TL;DR banner copy verbatim in their respective files
- D-27 3-branch access logic implemented correctly in `/my-policies/[id]/page.tsx`
- Server Actions follow Phase 3 D-09 conventions (Zod + try/catch + revalidatePath outside try)
- React 19 useActionState properly wired; RESEARCH Pitfall 5 mitigated (formState carries ackedAt)
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-05-SUMMARY.md` when done — document the 8 files created/modified, the directory choice for Client components (components/employee/ vs components/policy/), and any shadcn primitive missing (e.g., textarea fallback noted).
</output>
