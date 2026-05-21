// lib/auth/errors.ts — ADR-026 typed error classes for lib/auth/.
//
// Every throw inside lib/auth/ uses a class from this module instead of
// `throw new Error("string literal")`. Consumers in app/(admin)/dashboard/
// page.tsx + app/(auth)/post-sign-in/page.tsx narrow via `err instanceof
// Class`; see lib/auth/bootstrap-errors.ts for the typed matcher.
//
// Constructor shape matches lib/policies/state-machine.ts:33-40
// (IllegalTransitionError): `public readonly` params + explicit
// `this.name = 'ClassName'`. Each class additionally exposes a stable
// `code: BootstrapErrorCode` (or `'CLERK_AUTH_FAILED'` for the non-
// BootstrapError infra marker) constant for Phase-7+ structured logging —
// the hierarchy has multiple concrete classes so `name` alone is not
// enough to discriminate in log queries.
//
// Message strings preserved verbatim from the v0 string-literal throws
// at super(message) so operator log-greps for "No active organization"
// etc. continue to match err.message; future structured-logging swaps
// can read err.code (stable across translations and message refactors).

/**
 * Stable wire-format discriminant for the `BootstrapError` hierarchy. The
 * abstract `code` field on `BootstrapError` is typed as this union so a
 * typo at a concrete-subclass initializer (e.g. `'NO_ACTIVE_ORG'` instead
 * of `'NO_ACTIVE_ORGANIZATION'`) is a compile-time error rather than a
 * silent log-router miss. Adding a new `BootstrapError` subclass requires
 * adding the literal here first — that's the point. Pre-merge type-design
 * review recommendation; codes paired with concrete classes are also
 * locked at runtime by the uniqueness test in bootstrap-errors.test.ts.
 */
export type BootstrapErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NO_ACTIVE_ORGANIZATION'
  | 'INVALID_ROLE'
  | 'ORG_NOT_PROVISIONED'
  | 'USER_NOT_PROVISIONED';

/**
 * Marker abstract base for errors that lib/auth/context.ts throws during
 * the "bootstrap" phase of a request — i.e. session/org/role resolution,
 * NOT infrastructure failures. Bootstrap consumers narrow on this base
 * or its subclasses.
 *
 * NOTABLY EXCLUDES ClerkAuthFailedError — that's an infrastructure-
 * failure marker that MUST rethrow past both consumers. A test in
 * lib/auth/bootstrap-errors.test.ts pins
 * `ClerkAuthFailedError instanceof BootstrapError === false` so a
 * future "DRY refactor" cannot quietly fold it into the hierarchy.
 */
export abstract class BootstrapError extends Error {
  abstract readonly code: BootstrapErrorCode;
}

/**
 * Clerk session lookup returned no userId. Middleware should preempt
 * this in normal flows; appearance at the action/page layer signals a
 * middleware bypass. Trampoline catches and redirects to onboarding;
 * dashboard rethrows (middleware should have caught it).
 */
export class NotAuthenticatedError extends BootstrapError {
  readonly code = 'NOT_AUTHENTICATED';
  constructor() {
    super('Not authenticated: no Clerk session');
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Clerk session lookup succeeded but no orgId is active. Canonical
 * onboarding signal — both dashboard + trampoline catch this.
 */
export class NoActiveOrganizationError extends BootstrapError {
  readonly code = 'NO_ACTIVE_ORGANIZATION';
  constructor() {
    super('No active organization');
    this.name = 'NoActiveOrganizationError';
  }
}

/**
 * sessionClaims.publicMetadata.role is not one of
 * 'admin' | 'reviewer' | 'employee'. Typically a forged claim or a
 * stale session after a role schema change. Both consumers catch.
 */
export class InvalidRoleError extends BootstrapError {
  readonly code = 'INVALID_ROLE';
  constructor(public readonly value: unknown) {
    super(`Invalid role on session claims: ${String(value)}`);
    this.name = 'InvalidRoleError';
  }
}

/**
 * Common abstract base for "Clerk webhook hasn't landed yet OR
 * Clerk-DB drift" race conditions. Dashboard catches via this base
 * (single conceptual condition, 2s meta-refresh W7 UX); trampoline
 * deliberately does NOT include this base in its allow-list (treats
 * DB drift as real failure, returns 500).
 *
 * The divergence is intentional — see consumer page comment blocks
 * for the asymmetry rationale.
 */
export abstract class ProvisioningRaceError extends BootstrapError {}

/**
 * organizations.clerk_org_id lookup empty — the Clerk
 * organization.created webhook hasn't created the DB row yet, or DB
 * has drifted from Clerk. Subclass of ProvisioningRaceError.
 */
export class OrgNotProvisionedError extends ProvisioningRaceError {
  readonly code = 'ORG_NOT_PROVISIONED';
  constructor(public readonly maskedClerkOrgId: string) {
    super(
      `Org not provisioned in DB for ${maskedClerkOrgId} — Clerk organization.created webhook may not have fired or DB-Clerk drift`,
    );
    this.name = 'OrgNotProvisionedError';
  }
}

/**
 * Stable wire-format sub-discriminant for the two `UserNotProvisionedError`
 * throw paths inside `lib/auth/context.ts:getOrgContext` after ADR-027
 * lookup-scoping:
 *   - `'CLERK_USER_NOT_IN_DB'` — no `users` row at all matches
 *     `clerk_user_id` (the v0 case before ADR-027). Webhook user.created
 *     hasn't fired yet OR DB has drifted from Clerk.
 *   - `'USER_ORG_MISMATCH'` — `users` row exists for `clerk_user_id` but
 *     its `org_id` doesn't match the session's resolved org (the ADR-027
 *     case — multi-org Clerk user acting in non-most-recently-joined
 *     org; per ADR-027 this is product behavior, not bug).
 *
 * ADR-027 punted on this discriminant ("if structured logging Phase 7+
 * ever needs to distinguish... `code` field can be supplemented or split
 * then"). ADR-028 reconsiders that punt — the 4-agent pre-merge review on
 * PR #7 flagged the missing discriminant as a binding finding because
 * Phase-7+ structured logging is closer than originally scoped and the
 * supplement is cheap to add now (one extra indexed DB lookup on the
 * already-error path; no happy-path cost).
 *
 * INFO-DISCLOSURE BOUNDARY: the discriminant lives on a typed field, NOT
 * in the `super(message)` string. The internal `orgRow.id` UUID never
 * appears in the error message OR in any exposed `public readonly` field
 * — only the masked clerkUserId + the typed subCode. Consumers route on
 * `err.subCode === 'USER_ORG_MISMATCH'` without parsing prose; future
 * structured-logging routers don't need to ingest internal IDs to triage.
 */
export type UserNotProvisionedSubCode =
  | 'CLERK_USER_NOT_IN_DB'
  | 'USER_ORG_MISMATCH';

/**
 * users.clerk_user_id lookup empty — the Clerk user.created webhook
 * hasn't created the DB row yet, OR DB has drifted from Clerk, OR (per
 * ADR-027/028) the users row exists for `clerk_user_id` but its `org_id`
 * doesn't match the session's resolved org (multi-org Clerk user
 * acting in non-most-recently-joined org). Subclass of
 * ProvisioningRaceError.
 *
 * The `subCode` field discriminates the two cases for Phase-7+
 * structured-logging triage. See `UserNotProvisionedSubCode` for the
 * full rationale + info-disclosure boundary.
 */
export class UserNotProvisionedError extends ProvisioningRaceError {
  readonly code = 'USER_NOT_PROVISIONED';
  constructor(
    public readonly maskedClerkUserId: string,
    public readonly subCode: UserNotProvisionedSubCode,
  ) {
    super(
      `User not provisioned in DB for ${maskedClerkUserId} — Clerk user.created webhook may not have fired or DB-Clerk drift`,
    );
    this.name = 'UserNotProvisionedError';
  }
}

/**
 * Clerk's auth() call itself failed (network blip, Clerk backend
 * outage, malformed Clerk response). NOT a BootstrapError — both
 * bootstrap consumers MUST rethrow this so a real infra outage
 * surfaces as a 500 instead of being masked as onboarding race-window
 * UX. The hierarchy contract is locked by a test in
 * lib/auth/bootstrap-errors.test.ts that asserts
 * `new ClerkAuthFailedError(...) instanceof BootstrapError === false`.
 *
 * The `cause` field stores the original thrown value for chained
 * diagnostics. ES2022 Error.cause via the 2-arg `super(message,
 * { cause })` constructor isn't used because tsconfig target is ES2017
 * (Node 22 runtime supports it but compile-time signature isn't
 * guaranteed at the lower target). The explicit field with `override`
 * gives equivalent diagnostic value at any target.
 *
 * The `code` literal is the universal log-discriminant (orthogonal to
 * the `BootstrapErrorCode` union — this class is intentionally NOT a
 * `BootstrapError`); structured-logging consumers can switch on
 * `err.code` to route both bootstrap and infra failures.
 */
export class ClerkAuthFailedError extends Error {
  readonly code = 'CLERK_AUTH_FAILED';
  override readonly cause: unknown;
  constructor(cause: unknown) {
    const detail =
      cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
    super(`Clerk auth() failed: ${detail}`);
    this.cause = cause;
    this.name = 'ClerkAuthFailedError';
  }
}
