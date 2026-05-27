---
phase: 05-employee-portal
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/policies/errors.ts
autonomous: true
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
must_haves:
  truths:
    - "lib/policies/errors.ts exports PolicyDomainError abstract base + 3 concrete subclasses (PolicyNotFoundError, PolicyArchivedError, PolicyNotAssignedError)"
    - "Each subclass exposes a stable readonly literal `code` field discriminating the error path"
    - "Consumers can narrow via `err instanceof PolicyDomainError` then `err.code === 'POLICY_ARCHIVED'`"
  artifacts:
    - path: "lib/policies/errors.ts"
      provides: "PolicyDomainError hierarchy mirroring ADR-026 BootstrapError shape"
      contains: "abstract class PolicyDomainError"
      min_lines: 60
  key_links:
    - from: "lib/policies/errors.ts"
      to: "lib/policies/acknowledgment.ts (Wave 2)"
      via: "throw new PolicyArchivedError(...) / throw new PolicyNotAssignedError(...)"
      pattern: "throw new (PolicyArchived|PolicyNotAssigned)Error"
    - from: "lib/policies/errors.ts"
      to: "app/(employee)/my-policies/[id]/actions.ts (Wave 3)"
      via: "instanceof checks in catch branch"
      pattern: "instanceof PolicyDomainError|instanceof PolicyArchivedError"
---

<objective>
Wave 1 foundation parallel to Plan 05-01. Create `lib/policies/errors.ts` exporting the `PolicyDomainError` abstract base class + three concrete subclasses (`PolicyNotFoundError`, `PolicyArchivedError`, `PolicyNotAssignedError`) per D-30. Mirrors the ADR-026 `BootstrapError` hierarchy verbatim in shape: abstract base + literal `readonly code: PolicyDomainErrorCode` field + explicit `this.name`.

Purpose: D-07 (`PolicyArchivedError`) and D-08 (`PolicyNotAssignedError`) are thrown by the Wave 2 acknowledgment orchestrator. The Wave 3 Server Action catches them by class to map to typed `ActionState` responses with stable `code` discriminants the UI uses for recovery copy. The error hierarchy MUST exist before the orchestrator references it (compile order).

Output: One new file `lib/policies/errors.ts` (~60-90 lines) and a widened scope comment in `scripts/check-error-discipline.ts` deferred to Plan 05-08 (this plan does NOT touch the gate file — that lives in the CI-gates plan to keep concern boundaries clean).
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
@lib/auth/errors.ts
@lib/policies/state-machine.ts

<interfaces>
<!-- ADR-026 BootstrapError shape — D-30 mirrors this exactly for PolicyDomainError -->

From lib/auth/errors.ts:
```typescript
export type BootstrapErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NO_ACTIVE_ORGANIZATION'
  | ...;

export abstract class BootstrapError extends Error {
  abstract readonly code: BootstrapErrorCode;
}

export class NotAuthenticatedError extends BootstrapError {
  readonly code = 'NOT_AUTHENTICATED';
  constructor() {
    super('Not authenticated: no Clerk session');
    this.name = 'NotAuthenticatedError';
  }
}

export class OrgNotProvisionedError extends ProvisioningRaceError {
  readonly code = 'ORG_NOT_PROVISIONED';
  constructor(public readonly maskedClerkOrgId: string) {
    super(`Org not provisioned in DB for ${maskedClerkOrgId} — ...`);
    this.name = 'OrgNotProvisionedError';
  }
}
```

Phase 5 D-30 emits this exact shape for the new file:
- `PolicyDomainErrorCode` union: `'POLICY_NOT_FOUND' | 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED'`
- `abstract class PolicyDomainError extends Error` with abstract `code: PolicyDomainErrorCode`
- 3 concrete subclasses, each with literal `code` field + explicit `this.name` + `public readonly policyId: string` constructor param
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create lib/policies/errors.ts with PolicyDomainError hierarchy per D-30</name>
  <files>lib/policies/errors.ts</files>
  <read_first>
    - lib/auth/errors.ts (whole file — exact shape to mirror; BootstrapErrorCode literal union at lines 31-37; abstract base at 51-53; NotAuthenticatedError concrete subclass at 61-67; InvalidRoleError public-readonly-param subclass at 86-92; ForbiddenError Phase 4 D-45 amendment at 223-229)
    - lib/policies/state-machine.ts (the existing IllegalTransitionError — sibling typed-error in lib/policies/ that already exists and is preserved; Plan 05-08 will widen check-error-discipline.ts to scan lib/policies/** without breaking this existing class)
    - .planning/phases/05-employee-portal/05-CONTEXT.md § Error Classes (D-30 verbatim source)
    - .planning/phases/05-employee-portal/05-PATTERNS.md § "`lib/policies/errors.ts` (errors, no flow)"
    - .planning/PROJECT.md § ADR-026 (typed-error shape rationale)
  </read_first>
  <action>
Create new file `lib/policies/errors.ts` exporting the `PolicyDomainError` hierarchy.

File-header comment block (mirror lib/auth/errors.ts lines 1-19 structure):
- Plain-English description: "lib/policies/errors.ts — D-30 typed error classes for lib/policies/ domain. Mirrors ADR-026 BootstrapError shape (abstract base + literal `code` field + explicit `this.name`). Thrown by lib/policies/acknowledgment.ts (Plan 05-03 + 05-04); caught by app/(employee)/my-policies/[id]/actions.ts (Plan 05-05) to map to typed ActionState responses."
- Rationale: "Message strings preserved verbatim for ops log-greps. `code` field is the universal log-discriminant (stable across translations + message refactors). PolicyId stored as `public readonly policyId: string` for structured-log routing in Phase 7+ (per ADR-026 InvalidRoleError public-readonly precedent)."

Type union for stable codes (mirror BootstrapErrorCode at lines 31-37):
```typescript
export type PolicyDomainErrorCode =
  | 'POLICY_NOT_FOUND'
  | 'POLICY_ARCHIVED'
  | 'POLICY_NOT_ASSIGNED';
```

Abstract base class (mirror BootstrapError at lines 51-53):
```typescript
export abstract class PolicyDomainError extends Error {
  abstract readonly code: PolicyDomainErrorCode;
}
```

Three concrete subclasses (mirror BootstrapError subclass shape at lines 61-67 + 86-92 + 111-119). Each takes `public readonly policyId: string` as a constructor param and includes the policyId in the message (NOT the orgId — info-disclosure boundary per ADR-026 ForbiddenError pattern; policyId is already known to the requesting user since they navigated to /my-policies/[id], so it's not a secret). Each subclass sets `this.name = 'PolicyXxxError'` explicitly per ADR-026.

- `PolicyNotFoundError`: `code = 'POLICY_NOT_FOUND'`, message `Policy not found: ${policyId}` — used when `Policies.findById(s, policyId)` returns empty (RLS denial OR row truly missing — caller cannot distinguish per D-10 "advertise nothing" precedent; both branches throw the same error).
- `PolicyArchivedError`: `code = 'POLICY_ARCHIVED'`, message `Policy is archived: ${policyId}` — thrown by orchestrator per D-07 when policy `status === 'archived'` between page load + Acknowledge click.
- `PolicyNotAssignedError`: `code = 'POLICY_NOT_ASSIGNED'`, message `Policy not assigned to user: ${policyId}` — thrown by orchestrator per D-08 when neither user-level nor dept-level assignment exists for the requesting userId.

Do NOT throw any built-in `Error` subclass (`TypeError`, `RangeError`, etc.) from this file — Plan 05-08 will widen `check-error-discipline.ts` to scan `lib/policies/**` and BAN those exactly like Phase 3 PR #5 did for `lib/auth/**` per ADR-026 + Phase 4 widened lib/stripe/**.

Do NOT add any class that isn't listed in D-30. Do NOT add a `BootstrapError`-style ProvisioningRaceError-equivalent intermediate base (no race-recovery UX for ack errors — both throws are recoverable per D-07/D-08 single-message branches in the Server Action). Do NOT add an `accessToTL_DROnlyError` for the D-27 grant access path — D-27 uses `notFound()` (404) which is a Next.js pattern, not a thrown error.
  </action>
  <verify>
    <automated>pnpm tsc --noEmit && tsx -e "import { PolicyDomainError, PolicyArchivedError, PolicyNotAssignedError, PolicyNotFoundError } from '@/lib/policies/errors'; const e = new PolicyArchivedError('00000000-0000-4000-8000-000000000000'); if (!(e instanceof PolicyDomainError)) throw new Error('FAIL: PolicyArchivedError not instanceof PolicyDomainError'); if (e.code !== 'POLICY_ARCHIVED') throw new Error('FAIL: code wrong'); if (e.name !== 'PolicyArchivedError') throw new Error('FAIL: name wrong'); const u = new PolicyNotAssignedError('00000000-0000-4000-8000-000000000000'); if (u.code !== 'POLICY_NOT_ASSIGNED') throw new Error('FAIL'); const nf = new PolicyNotFoundError('00000000-0000-4000-8000-000000000000'); if (nf.code !== 'POLICY_NOT_FOUND') throw new Error('FAIL'); console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm tsc --noEmit` exits 0
    - The inline tsx probe (in `<automated>`) exits 0 — proves all 3 subclasses are `instanceof PolicyDomainError`, each has the correct literal `code` value, each has `name` set to the class name
    - `grep -n "abstract readonly code: PolicyDomainErrorCode" lib/policies/errors.ts` returns 1
    - `grep -nE "readonly code = 'POLICY_(NOT_FOUND|ARCHIVED|NOT_ASSIGNED)'" lib/policies/errors.ts | wc -l` returns 3 (all 3 literal codes covered)
    - `grep -nE "this\\.name = 'Policy(NotFound|Archived|NotAssigned)Error'" lib/policies/errors.ts | wc -l` returns 3
    - `grep -nE "public readonly policyId: string" lib/policies/errors.ts | wc -l` returns 3
    - File does NOT contain any `throw new Error(` or `throw new TypeError(` line (`grep -cE "throw new (Error|TypeError|RangeError|SyntaxError|ReferenceError|EvalError|URIError|AggregateError)\\(" lib/policies/errors.ts` returns 0) — Plan 05-08's widened gate will enforce this; this plan pre-emptively satisfies
  </acceptance_criteria>
  <done>
    `lib/policies/errors.ts` exists with the 3-subclass hierarchy mirroring ADR-026 shape; tsc clean; instanceof + code + name behavior verified via inline tsx probe.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| orchestrator throw → Server Action catch | The typed-error contract crosses lib/policies/ → app/(employee)/.../actions.ts; `instanceof` narrowing is the discriminator |
| error.message → log / UI | policyId in the message is acceptable (user already has it from URL); orgId MUST NOT appear (mirror ADR-026 UserNotProvisionedError sub-code discriminant rationale) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-02-01 | Information Disclosure | error.message leaking internal IDs | mitigate | policyId in message is acceptable (user has it from URL navigation); orgId / userId NEVER appear in message — only policyId on `public readonly policyId` field. Mirrors lib/auth/errors.ts ForbiddenError shape. |
| T-05-02-02 | Tampering | future refactor adds a subclass without registering its literal code in PolicyDomainErrorCode union | mitigate | TypeScript abstract `code: PolicyDomainErrorCode` field forces the new subclass to declare its literal — typos become compile errors (Phase 4 ADR-026 BootstrapErrorCode precedent). Plan 05-08's widened check-error-discipline.ts adds a second layer: bans built-in Error subclasses inside lib/policies/. |
| T-05-02-SC | Tampering | npm/pip/cargo installs | accept | No new packages. |
</threat_model>

<verification>
- `pnpm tsc --noEmit` exits 0
- Inline tsx probe (in Task 1 `<automated>`) exits 0
- `pnpm verify:phase-4` still exits 0 (no regression to existing typed-error gate scope — that gate currently scans lib/auth/** + lib/stripe/** only; Plan 05-08 widens to lib/policies/**)
</verification>

<success_criteria>
- `lib/policies/errors.ts` exists with all 3 typed errors + abstract base
- All 3 subclasses are `instanceof PolicyDomainError`
- All 3 have the correct literal `code` discriminant
- All 3 have the correct `name` set explicitly
- No regression — `pnpm verify:phase-4` exits 0
</success_criteria>

<output>
Create `.planning/phases/05-employee-portal/05-02-SUMMARY.md` when done — document the 3 subclasses, their codes, and the constructor signature with `public readonly policyId`.
</output>
