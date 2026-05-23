---
phase: 05-employee-portal
plan: 07
type: execute
wave: 3
depends_on: []
files_modified:
  - components/policy/AckStatusBadge.tsx
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
must_haves:
  truths:
    - "components/policy/AckStatusBadge.tsx exports AckStatusBadge with exhaustive switch on D-04 ackState enum"
    - "Branch 'none' → null (no badge; plain Acknowledge button renders separately)"
    - "Branch 'stale' → outline Badge with amber className override; text 'Requires re-acknowledgment'"
    - "Branch 'current' → green ✓ inline-flex span with formatted date; NOT a Badge"
    - "Uses shadcn Badge with className override per D-11 (NOT a new CVA variant in components/ui/badge.tsx)"
  artifacts:
    - path: "components/policy/AckStatusBadge.tsx"
      provides: "AckStatusBadge Server Component (props: ackState, ackedAt)"
      contains: "AckStatusBadge"
  key_links:
    - from: "components/policy/AckStatusBadge.tsx"
      to: "components/ui/badge.tsx Badge"
      via: "import + className override on outline variant (D-11 NOT new CVA variant)"
      pattern: "Badge variant=\"outline\""
---

<objective>
Wave 3 parallel with Plans 05-05/05-06. Create `components/policy/AckStatusBadge.tsx` mirroring `PolicyStatusBadge.tsx` structure per D-11. Three exhaustive switch branches matching the `ackState` enum from D-04:
- `'none'` → return null (plain "Acknowledge" button renders separately by Plan 05-05 AcknowledgeButton)
- `'stale'` → amber `<Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">Requires re-acknowledgment</Badge>`
- `'current'` → green `<span>` with ✓ and "Acknowledged on {formatDate(ackedAt)}"

CRITICAL per D-11: use className override on shadcn Badge — do NOT add a new CVA variant to `components/ui/badge.tsx`. The PolicyStatusBadge precedent at `components/policy/PolicyStatusBadge.tsx:37-44` (the `archived` branch) uses this exact pattern.

Output: One new file (~30-50 lines) ready for Plan 05-05 to render.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/05-employee-portal/05-CONTEXT.md
@.planning/phases/05-employee-portal/05-PATTERNS.md
@CLAUDE.md
@components/policy/PolicyStatusBadge.tsx
@components/ui/badge.tsx

<interfaces>
<!-- D-04 return shape this component consumes -->
type AckState = 'none' | 'current' | 'stale';  // matches Plan 05-03 Policies.listAssignedAndPublishedForUser return field

// Component signature this plan ships, consumed by Plan 05-05 page render + Plan 05-05 AcknowledgeButton sibling:
export function AckStatusBadge({
  ackState,
  ackedAt,
}: {
  ackState: AckState;
  ackedAt: Date | null;
}): JSX.Element | null;
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create components/policy/AckStatusBadge.tsx with exhaustive switch on AckState per D-11</name>
  <files>components/policy/AckStatusBadge.tsx</files>
  <read_first>
    - components/policy/PolicyStatusBadge.tsx (whole file — D-11 explicit mirror; exhaustive switch + Badge className override pattern at lines 18-46; the `archived` case at lines 35-44 uses `className="text-muted-foreground border-muted-foreground/40"` — the EXACT pattern AckStatusBadge follows for the 'stale' case)
    - components/ui/badge.tsx (whole file — confirm variant prop accepts 'outline' value; do NOT modify this file)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Re-Acknowledgment UI (D-11 + D-12 verbatim)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`components/policy/AckStatusBadge.tsx`"
    - .planning/phases/05-employee-portal/05-RESEARCH.md § Code Examples AckStatusBadge reference at lines 694-727
  </read_first>
  <action>
Create new file `components/policy/AckStatusBadge.tsx`.

File-header comment block:
- "components/policy/AckStatusBadge.tsx — Plan 05-07. D-11 + D-12 — exhaustive-switch component on D-04 ackState enum."
- "Pattern locked by D-11: shadcn Badge with className override (NOT a new CVA variant in components/ui/badge.tsx). Mirrors PolicyStatusBadge.tsx:18-46 structure; the 'stale' branch mirrors the 'archived' branch's amber/border override pattern."
- "Three branches:"
  - "- 'none' → null (no badge; plain 'Acknowledge' button renders separately in AcknowledgeButton client component per Plan 05-05)"
  - "- 'stale' → amber outline badge 'Requires re-acknowledgment' + a 'Re-acknowledge' button (button is rendered by AcknowledgeButton — the badge is JUST the visual indicator)"
  - "- 'current' → green ✓ span with formatted date, NOT a Badge (different visual per D-11)"

Imports:
- `Badge` from `@/components/ui/badge`

Type:
```typescript
type AckState = 'none' | 'current' | 'stale';
```

Component (Server Component — no `'use client'`):
```typescript
import { Badge } from '@/components/ui/badge';

type AckState = 'none' | 'current' | 'stale';

export function AckStatusBadge({
  ackState,
  ackedAt,
}: {
  ackState: AckState;
  ackedAt: Date | null;
}) {
  switch (ackState) {
    case 'none':
      // No badge. Plain "Acknowledge" CTA renders separately (AcknowledgeButton in Plan 05-05).
      return null;
    case 'stale':
      // D-11 amber outline override — NOT a new CVA variant in badge.tsx.
      // Mirror PolicyStatusBadge.tsx:35-44 'archived' className-override pattern.
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">
          Requires re-acknowledgment
        </Badge>
      );
    case 'current':
      // D-11 explicitly NOT a Badge — different visual treatment (green ✓ + timestamp).
      return (
        <span className="inline-flex items-center gap-1 text-sm text-green-700">
          ✓ Acknowledged on {ackedAt && new Date(ackedAt).toLocaleDateString('en-US')}
        </span>
      );
  }
}
```

Notes for the executor:
- Use the en-US locale + default options for `toLocaleDateString` (matches Phase 3 `app/(admin)/policies/page.tsx:60-72` timeAgo style; deferred to operator preference per CONTEXT discretion bullet)
- The `ackedAt && new Date(ackedAt).toLocaleDateString('en-US')` guard handles the edge case where Drizzle returns null for acknowledgedAt (shouldn't happen for ackState='current' since the LEFT JOIN matched on currentAck.id, but TypeScript prefers defensive)
- Exhaustive switch — every union member has a case; tsc enforces (no `default` branch needed — the union has exactly 3 members)
- DO NOT add a new variant to `components/ui/badge.tsx`. DO NOT create a new shadcn primitive. DO NOT use lucide-react Check icon (use literal `✓` per CONTEXT — matches D-11 verbatim).

Component is a Server Component (no 'use client' directive — pure render based on props; no state, no effects, no interactivity).
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && grep -c "AckStatusBadge" components/policy/AckStatusBadge.tsx && grep -c "'none'" components/policy/AckStatusBadge.tsx && grep -c "'stale'" components/policy/AckStatusBadge.tsx && grep -c "'current'" components/policy/AckStatusBadge.tsx && grep -c "Requires re-acknowledgment" components/policy/AckStatusBadge.tsx && grep -c "Acknowledged on" components/policy/AckStatusBadge.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - File `components/policy/AckStatusBadge.tsx` exists
    - `grep -c "export function AckStatusBadge" components/policy/AckStatusBadge.tsx` returns 1
    - `grep -cE "'none'|'stale'|'current'" components/policy/AckStatusBadge.tsx` returns at least 3 (all three switch cases present)
    - `grep -c "Requires re-acknowledgment" components/policy/AckStatusBadge.tsx` returns 1 (D-11 stale-branch text verbatim)
    - `grep -c "Acknowledged on" components/policy/AckStatusBadge.tsx` returns 1 (D-11 current-branch text)
    - `grep -c "border-amber-500" components/policy/AckStatusBadge.tsx` returns 1 (D-11 amber override className)
    - `grep -c "text-green-700" components/policy/AckStatusBadge.tsx` returns 1 (D-11 current branch green)
    - File does NOT contain `'use client'` (Server Component — no state, no effects)
    - `components/ui/badge.tsx` UNCHANGED (no new CVA variant added per D-11) — `git diff components/ui/badge.tsx` returns empty
    - `grep -c "variant=\"outline\"" components/policy/AckStatusBadge.tsx` returns 1 (D-11 className-override-on-outline pattern)
    - File does NOT import any icon library or Check primitive (literal `✓` character used per D-11)
  </acceptance_criteria>
  <done>
    AckStatusBadge component exists with exhaustive switch + D-11 className-override pattern; no Badge.tsx modification; tsc clean.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| props → render | `ackState` is a type-narrowed union; `ackedAt` is nullable Date — TypeScript enforces the exhaustive switch; no runtime input validation needed (Server Component receives data from Server-side withOrgScope query) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-07-01 | Tampering | A future refactor adds a new ackState value but forgets to update this switch | mitigate | TypeScript exhaustive-switch behavior: the function returns `JSX.Element | null` implicitly because every branch returns; adding a 4th union member would change the function's return-type inference to `JSX.Element | null | undefined`, surfacing the missing branch at tsc time. The D-04 enum is canonical in `lib/db/repositories/policies.ts` listAssignedAndPublishedForUser return type — type-safe propagation. |
| T-05-07-02 | Information Disclosure | ackedAt timestamp leakage in component output | accept | ackedAt is the user's OWN acknowledgment date — already known to them (they performed the ack). Not a privacy concern. |
| T-05-07-SC | Tampering | npm installs | accept | No new packages — uses existing shadcn Badge. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- `pnpm verify:phase-4` still exits 0 (no regression)
- Visual check (Plan 05-10 UAT scope): three states render correctly when consumed by Plan 05-05 page handler
</verification>

<success_criteria>
- AckStatusBadge exists, exhaustive switch on D-04 enum, D-11 className-override pattern (NOT new CVA variant)
- `components/ui/badge.tsx` UNCHANGED (D-11 enforcement)
- tsc clean
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-07-SUMMARY.md` when done — document the file shape (~30-50 lines) and confirm `components/ui/badge.tsx` was NOT modified.
</output>
