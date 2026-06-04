// lib/policies/errors.ts — D-30 typed error classes for lib/policies/ domain.
//
// Mirrors ADR-026 BootstrapError shape (abstract base + literal `code`
// field + explicit `this.name`). Thrown by lib/policies/acknowledgment.ts
// (Plan 05-03 + 05-04); caught by app/(employee)/my-policies/[id]/actions.ts
// (Plan 05-05) to map to typed ActionState responses with stable `code`
// discriminants the UI uses for recovery copy.
//
// Constructor shape matches lib/auth/errors.ts subclasses (InvalidRoleError
// public-readonly-param + ForbiddenError reason-param precedent):
// `public readonly policyId` param + explicit `this.name = 'ClassName'`.
// Each class exposes a stable `code: PolicyDomainErrorCode` literal so
// Phase-7+ structured logging can route on `err.code` without parsing
// the prose message.
//
// Message strings preserve verbatim wording at super(message) for ops
// log-greps. The `code` field is the universal log-discriminant (stable
// across translations + message refactors). policyId is stored as
// `public readonly policyId: string` for structured-log routing in
// Phase 7+ (per ADR-026 InvalidRoleError public-readonly precedent).
//
// INFO-DISCLOSURE BOUNDARY: policyId in the message is acceptable — the
// user already has it from URL navigation to /my-policies/[id], so it
// is not a secret. orgId / userId NEVER appear in the message OR in any
// exposed `public readonly` field (mirrors ADR-026 UserNotProvisionedError
// sub-discriminant rationale + ForbiddenError shape).
//
// SCOPE: Three concrete subclasses only (per D-30). No race-recovery
// intermediate base (cf. lib/auth/errors.ts ProvisioningRaceError) — both
// D-07 (PolicyArchivedError) and D-08 (PolicyNotAssignedError) are
// recoverable via the same single-message Server Action branch with
// distinct UI copy. The third class (PolicyNotFoundError) covers the
// D-10 "advertise nothing" RLS-denial-or-truly-missing union — caller
// cannot distinguish.
//
// Plan 05-08 widened scripts/check-error-discipline.ts to scan
// lib/policies/** — the ts-morph gate forbids built-in Error subclasses
// (Error, TypeError, RangeError, etc.) in this subtree exactly like
// Phase 3 PR #5 did for lib/auth/** and Phase 4 widened to lib/stripe/**.
// This file pre-emptively satisfies the widened gate.

/**
 * Stable wire-format discriminant for the `PolicyDomainError` hierarchy.
 * The abstract `code` field on `PolicyDomainError` is typed as this union
 * so a typo at a concrete-subclass initializer (e.g. `'POLICY_MISSING'`
 * instead of `'POLICY_NOT_FOUND'`) is a compile-time error rather than a
 * silent log-router miss. Adding a new `PolicyDomainError` subclass
 * requires adding the literal here first — that is the point. Mirrors
 * the ADR-026 `BootstrapErrorCode` precedent exactly.
 */
export type PolicyDomainErrorCode =
  | 'POLICY_NOT_FOUND'
  | 'POLICY_ARCHIVED'
  | 'POLICY_NOT_ASSIGNED'
  | 'ACKNOWLEDGMENT_NOT_RECORDED'
  | 'WORKFLOW_INCOMPLETE'
  | 'STAGE_NOT_ACTIONABLE';

/**
 * Marker abstract base for errors that lib/policies/ throws during
 * orchestrator flows (acknowledgment, assignment-check, etc.). Consumers
 * in app/(employee)/my-policies/[id]/actions.ts (Plan 05-05) narrow on
 * this base or its subclasses via `err instanceof PolicyDomainError`,
 * then dispatch on `err.code` to map to typed ActionState responses.
 *
 * The hierarchy is intentionally flat (no intermediate abstract layer
 * like lib/auth/errors.ts ProvisioningRaceError) — D-07/D-08 do not need
 * shared catch semantics, only distinct UI recovery copy.
 */
export abstract class PolicyDomainError extends Error {
  abstract readonly code: PolicyDomainErrorCode;
}

/**
 * Policies.findById(s, policyId) returned empty — either RLS denied the
 * row (cross-org policyId) OR the row truly does not exist. Per D-10
 * "advertise nothing" precedent the caller cannot distinguish; both
 * branches throw the same error. Server Action maps to a 404 (`notFound()`
 * Next.js pattern) or a typed ActionState depending on the surface.
 */
export class PolicyNotFoundError extends PolicyDomainError {
  readonly code = 'POLICY_NOT_FOUND';
  constructor(public readonly policyId: string) {
    super(`Policy not found: ${policyId}`);
    this.name = 'PolicyNotFoundError';
  }
}

/**
 * Policy `status === 'archived'` at orchestrator check time — typically
 * fired when an admin archived the policy between the employee's page
 * load and their Acknowledge click. Per D-07 the Server Action catches
 * and maps to UI copy: "This policy was archived. Refresh to update
 * your list." After refresh the policy disappears from /my-policies
 * (archived !== assigned+published).
 */
export class PolicyArchivedError extends PolicyDomainError {
  readonly code = 'POLICY_ARCHIVED';
  constructor(public readonly policyId: string) {
    super(`Policy is archived: ${policyId}`);
    this.name = 'PolicyArchivedError';
  }
}

/**
 * Neither user-level nor dept-level assignment exists for the requesting
 * userId at orchestrator check time — typically fired when an admin
 * removed the assignment (Phase 6+ un-assign affordance) between page
 * load and Acknowledge click, OR when the user's department membership
 * changed. Per D-08 the Server Action catches and maps to UI copy:
 * "You are no longer assigned this policy."
 */
export class PolicyNotAssignedError extends PolicyDomainError {
  readonly code = 'POLICY_NOT_ASSIGNED';
  constructor(public readonly policyId: string) {
    super(`Policy not assigned to user: ${policyId}`);
    this.name = 'PolicyNotAssignedError';
  }
}

export class AcknowledgmentNotRecordedError extends PolicyDomainError {
  readonly code = 'ACKNOWLEDGMENT_NOT_RECORDED';
  constructor(public readonly policyId: string) {
    super(`Acknowledgment not recorded: ${policyId}`);
    this.name = 'AcknowledgmentNotRecordedError';
  }
}

/**
 * Phase 9 (R-017 / D-09-01) — a Growth+ policy cannot be published because its
 * approval workflow is not complete. Thrown INSIDE publish() (lib/policies/
 * transitions.ts) when `approvalWorkflows` is enabled (Growth+) and EITHER:
 *   - the policy is not currently `under_review` (require-submission-first:
 *     direct draft→published is blocked for Growth+, which also prevents
 *     republishing on a STALE approval after archive→restore→edit), OR
 *   - the current review cycle is not complete (needs >=1 'approved' AND 0
 *     'pending').
 *
 * Distinct from TierLimitExceededError (403 upgrade): a paying Growth customer
 * is shown a workflow message, NEVER an upgrade prompt. handleTransitionError
 * (app/(admin)/policies/[id]/actions.ts) maps it to a clean { ok:false } toast.
 *
 * INFO-DISCLOSURE BOUNDARY: policyId in the message is acceptable (the admin
 * already has it from URL navigation); orgId/userId never appear. `pending` and
 * `approved` are non-sensitive counts for the admin's diagnostic UI.
 */
export class WorkflowIncompleteError extends PolicyDomainError {
  readonly code = 'WORKFLOW_INCOMPLETE';
  constructor(
    public readonly policyId: string,
    public readonly pending: number,
    public readonly approved: number,
  ) {
    super(
      `Policy workflow incomplete: ${policyId} (pending=${pending}, approved=${approved})`,
    );
    this.name = 'WorkflowIncompleteError';
  }
}

/**
 * Phase 9 (R-017 / D-09-01) — FIX-A (Phase 9 adversarial review). A reviewer or
 * admin POSTed a (policyId, stageId) pair whose targeted workflow_stages row is
 * NOT an actionable PENDING stage of THIS policy: the stageId belongs to a
 * different policy, the stage is no longer 'pending' (already approved / rejected
 * / superseded), or it does not exist in this org. recordReviewDecision
 * (lib/policies/transitions.ts) asserts WorkflowStages.recordDecision hit exactly
 * one such row (returning().length > 0) BEFORE appending the immutable
 * review_decisions ledger row — so a mismatched or crafted POST rolls back with
 * NO misattributed ledger entry and NO sibling-policy state change. (Org RLS
 * already held cross-tenant; this defends ledger integrity + sibling policies
 * WITHIN an org.)
 *
 * handleReviewError (app/(reviewer)/reviewer/actions.ts) maps it to a benign
 * "no longer available" toast — never a 500. INFO-DISCLOSURE BOUNDARY: policyId
 * only (the reviewer already has it from the queue); orgId/userId never appear.
 */
export class StageNotActionableError extends PolicyDomainError {
  readonly code = 'STAGE_NOT_ACTIONABLE';
  constructor(public readonly policyId: string) {
    super(`Workflow stage not actionable: ${policyId}`);
    this.name = 'StageNotActionableError';
  }
}
