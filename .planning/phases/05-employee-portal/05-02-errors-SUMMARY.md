---
phase: 05-employee-portal
plan: 02
type: execute
wave: 1
subsystem: lib/policies
tags:
  - errors
  - typed-errors
  - adr-026-shape
  - d-30
requirements:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
requirements_addressed:
  - REQ-acknowledgment-tracking
  - REQ-acknowledgment-rules
dependency_graph:
  requires: []
  provides:
    - PolicyDomainError abstract base (for instanceof narrowing in app/(employee)/my-policies/[id]/actions.ts Plan 05-05)
    - PolicyDomainErrorCode literal union (for log-router discrimination in Phase 7+)
    - PolicyNotFoundError concrete subclass (thrown by orchestrator on Policies.findById empty result per D-10)
    - PolicyArchivedError concrete subclass (thrown by acknowledgment orchestrator per D-07)
    - PolicyNotAssignedError concrete subclass (thrown by acknowledgment orchestrator per D-08)
  affects: []
tech_stack:
  added: []
  patterns:
    - ADR-026 typed-error hierarchy (abstract base + literal `readonly code` union + explicit `this.name`)
    - Public-readonly constructor params (ADR-026 InvalidRoleError + ForbiddenError precedent)
    - Info-disclosure boundary on error message (policyId acceptable — user navigated via URL; orgId / userId forbidden)
key_files:
  created:
    - lib/policies/errors.ts
  modified: []
decisions:
  - "Mirrored ADR-026 BootstrapError shape verbatim: abstract base + literal `readonly code: PolicyDomainErrorCode` union + explicit `this.name = 'ClassName'`"
  - "Hierarchy is intentionally flat — NO intermediate abstract layer like ProvisioningRaceError (D-07/D-08 do not share catch semantics, only distinct UI copy)"
  - "`public readonly policyId: string` constructor param on all 3 subclasses (matches ADR-026 InvalidRoleError public-readonly precedent for Phase 7+ structured-log routing)"
  - "policyId in message is acceptable (user already has it from URL navigation); orgId / userId NEVER appear in message or any public field"
  - "Pre-emptively satisfies Plan 05-08's widened scripts/check-error-discipline.ts gate by not throwing any built-in Error subclass"
metrics:
  duration_minutes: 4
  completed_at: "2026-05-24T01:30:00.000Z"
  files_created: 1
  files_modified: 0
  commits: 1
  tasks_completed: 1
  tasks_total: 1
---

# Phase 5 Plan 02: PolicyDomainError Hierarchy Summary

PolicyDomainError abstract base + 3 concrete subclasses (PolicyNotFoundError, PolicyArchivedError, PolicyNotAssignedError) at lib/policies/errors.ts mirroring ADR-026 BootstrapError shape per D-30.

---

## What Shipped

One new file `lib/policies/errors.ts` (118 lines) exporting:

| Export | Kind | Code | Purpose |
|--------|------|------|---------|
| `PolicyDomainErrorCode` | type union | — | Stable wire-format discriminant; typo at concrete-subclass initializer is a compile-time error |
| `PolicyDomainError` | abstract class | (abstract) | Marker base; consumers narrow via `err instanceof PolicyDomainError` |
| `PolicyNotFoundError` | concrete subclass | `'POLICY_NOT_FOUND'` | Policies.findById empty (RLS denial OR truly missing — D-10 "advertise nothing") |
| `PolicyArchivedError` | concrete subclass | `'POLICY_ARCHIVED'` | Policy archived between page load + Acknowledge click (D-07) |
| `PolicyNotAssignedError` | concrete subclass | `'POLICY_NOT_ASSIGNED'` | Neither user-level nor dept-level assignment exists (D-08) |

All 3 subclasses share an identical constructor signature:

```typescript
constructor(public readonly policyId: string) {
  super(`<verbatim message with ${policyId}>`);
  this.name = '<ClassName>';
}
```

This matches the ADR-026 `InvalidRoleError`/`ForbiddenError` `public readonly` precedent — policyId is exposed for Phase-7+ structured-log routing without requiring callers to parse the prose message.

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | exits 0 (no output) |
| Inline tsx probe (instanceof + code + name on all 3 subclasses) | prints `OK` |
| `grep -n "abstract readonly code: PolicyDomainErrorCode"` count | 1 ✓ |
| `grep -nE "readonly code = 'POLICY_(NOT_FOUND\|ARCHIVED\|NOT_ASSIGNED)'"` count | 3 ✓ |
| `grep -nE "this\.name = 'Policy(NotFound\|Archived\|NotAssigned)Error'"` count | 3 ✓ |
| `grep -nE "public readonly policyId: string"` count | 3 (one per constructor) ✓ |
| `grep -cE "throw new (Error\|TypeError\|RangeError\|SyntaxError\|ReferenceError\|EvalError\|URIError\|AggregateError)\("` | 0 ✓ (Plan 05-08 widened gate pre-satisfied) |

All acceptance criteria from `05-02-errors-PLAN.md` § Task 1 satisfied.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Documentation false-positive] Reworded docstring to keep literal `throw new Error(` grep gate at 0**

- **Found during:** Task 1 verification (post-Write)
- **Issue:** Initial file docstring contained the literal string ``throw new Error(`` inside a `//` comment block describing what Plan 05-08's CI gate will ban. The acceptance criterion `grep -cE "throw new (Error|TypeError|...)\("` returned 1 even though the ts-morph CI gate (Plan 05-08) would not flag a comment (Phase 3 PR #5 ts-morph precedent ignores comments). Since the plan's literal-text grep is the documented acceptance criterion, I sanitized the comment to use plain prose without the literal pattern, keeping all rationale intact.
- **Fix:** Rewrote the comment to describe the future gate using "(Error, TypeError, RangeError, etc.)" prose instead of the literal `throw new …(` pattern. No code change; documentation only.
- **Files modified:** `lib/policies/errors.ts` (one comment block)
- **Commit:** Same commit as Task 1 (single atomic commit per plan)

No other deviations — plan executed exactly as written.

---

## Threat Model Coverage

Per the plan's `<threat_model>`:

| Threat ID | Disposition | How Mitigated |
|-----------|-------------|----------------|
| T-05-02-01 (Info Disclosure: orgId in message) | mitigate | Only `policyId` appears in message + on public field; orgId/userId never referenced. File docstring documents the boundary. |
| T-05-02-02 (Tampering: new subclass with unregistered literal code) | mitigate | Abstract `code: PolicyDomainErrorCode` field forces declaration in the union; typos are compile errors. Plan 05-08 widened CI gate adds runtime defense. |
| T-05-02-SC (npm/cargo install supply chain) | accept | No new packages introduced. |

No new security-relevant surface beyond what the plan's threat model covered. No threat flags raised for downstream verifier.

---

## Downstream Consumers (Future Plans)

| Plan | File | How It Consumes errors.ts |
|------|------|---------------------------|
| 05-03 / 05-04 | `lib/policies/acknowledgment.ts` | `throw new PolicyArchivedError(policyId)` / `throw new PolicyNotAssignedError(policyId)` inside the withOrgScope orchestrator |
| 05-05 | `app/(employee)/my-policies/[id]/actions.ts` | `if (err instanceof PolicyDomainError) { switch (err.code) { ... } }` to map to typed ActionState |
| 05-08 | `scripts/check-error-discipline.ts` | Widen scan path to include `lib/policies/**`; verify file conforms (zero built-in `throw new Error(` calls) |

---

## Self-Check: PASSED

- File exists: `lib/policies/errors.ts` ✓
- Commit recorded: (see git log below) ✓
- tsc --noEmit: exits 0 ✓
- Inline tsx probe: `OK` ✓
- All 5 greppable acceptance assertions: pass ✓
- No CLAUDE.md violations: no `any` types, no new packages, branch `gsd/phase-5-employee-portal` ✓

---

*Plan 05-02 complete. Wave 1 progress: 2/3 (05-01 ✓ + 05-02 ✓ + 05-07 pending). Next: orchestrator spawns 05-07 (AckStatusBadge component).*
