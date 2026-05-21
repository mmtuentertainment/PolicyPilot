// lib/auth/bootstrap-errors.test.ts — ADR-026 typed matcher tests.
//
// Locks the class-based matching contract that both consumers
// (dashboard race-recovery + post-sign-in trampoline hard-fail) rely on
// for narrowing getOrgContext() / asRole() throws. Preserves the
// divergence-lock intent from the v0 string-matcher tests (each named
// `it` block keeps the same intent; only the mechanics change from
// substring to instanceof).
//
// Three additional tests lock the type-system contracts that the v0
// string matcher couldn't express:
//   - ClerkAuthFailedError IS NOT a BootstrapError (rethrow contract)
//   - ProvisioningRaceError abstract base matches both concrete subclasses
//   - ClerkAuthFailedError extends Error but not BootstrapError (compile)
import { describe, it, expect } from 'vitest';
import { matchesErrorClass } from './bootstrap-errors';
import {
  BootstrapError,
  ClerkAuthFailedError,
  InvalidRoleError,
  NoActiveOrganizationError,
  NotAuthenticatedError,
  OrgNotProvisionedError,
  ProvisioningRaceError,
  UserNotProvisionedError,
} from './errors';

// Mirror of app/(admin)/dashboard/page.tsx allow-list. INTENTIONALLY uses
// the ProvisioningRaceError abstract base instead of listing both
// OrgNotProvisionedError + UserNotProvisionedError separately — single
// conceptual condition (Clerk webhook race), single allow-list entry.
const ONBOARDING_RACE_ERRORS = [
  NoActiveOrganizationError,
  ProvisioningRaceError,
  InvalidRoleError,
] as const;

// Mirror of app/(auth)/post-sign-in/page.tsx allow-list. INTENTIONALLY
// excludes ProvisioningRaceError — trampoline treats DB drift as hard
// failure; dashboard treats same shape as soft refresh. Divergence by
// design.
const BOOTSTRAP_ERRORS = [
  NotAuthenticatedError,
  InvalidRoleError,
  NoActiveOrganizationError,
] as const;

describe('matchesErrorClass', () => {
  it('returns false for non-Error inputs', () => {
    expect(matchesErrorClass(null, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass(undefined, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass('No active organization', ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass({ message: 'No active organization' }, ONBOARDING_RACE_ERRORS)).toBe(false);
  });

  it('returns true when the error is an instance of any allow-listed class', () => {
    expect(matchesErrorClass(new NoActiveOrganizationError(), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(new OrgNotProvisionedError('org_***1234'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(new UserNotProvisionedError('user_***5678'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(new InvalidRoleError('foo'), ONBOARDING_RACE_ERRORS)).toBe(true);
  });

  it('returns false when the error is not an instance of any allow-listed class', () => {
    expect(matchesErrorClass(new ClerkAuthFailedError(new Error('NetworkError')), ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass(new NotAuthenticatedError(), ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass(new Error('DB connection lost'), ONBOARDING_RACE_ERRORS)).toBe(false);
  });
});

describe('ONBOARDING_RACE_ERRORS vs BOOTSTRAP_ERRORS divergence (locks the design)', () => {
  // The two lists are intentionally different. If anyone "DRYs" them
  // into one constant, the design intent breaks and one of these tests
  // catches it.
  it('dashboard treats Org/User-not-provisioned as RACE (soft retry)', () => {
    expect(matchesErrorClass(new OrgNotProvisionedError('org_***'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(new UserNotProvisionedError('user_***'), ONBOARDING_RACE_ERRORS)).toBe(true);
  });

  it('trampoline treats Org/User-not-provisioned as HARD-FAIL (rethrow)', () => {
    expect(matchesErrorClass(new OrgNotProvisionedError('org_***'), BOOTSTRAP_ERRORS)).toBe(false);
    expect(matchesErrorClass(new UserNotProvisionedError('user_***'), BOOTSTRAP_ERRORS)).toBe(false);
  });

  it('trampoline catches Not-authenticated (dashboard does NOT — middleware should preempt)', () => {
    const err = new NotAuthenticatedError();
    expect(matchesErrorClass(err, BOOTSTRAP_ERRORS)).toBe(true);
    expect(matchesErrorClass(err, ONBOARDING_RACE_ERRORS)).toBe(false);
  });

  it('both lists catch No-active-organization (the canonical onboarding signal)', () => {
    const err = new NoActiveOrganizationError();
    expect(matchesErrorClass(err, ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(err, BOOTSTRAP_ERRORS)).toBe(true);
  });

  it('both lists catch Invalid-role', () => {
    const err = new InvalidRoleError('NaN');
    expect(matchesErrorClass(err, ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorClass(err, BOOTSTRAP_ERRORS)).toBe(true);
  });

  it('both lists let Clerk-auth-failed RETHROW (backend outage)', () => {
    const err = new ClerkAuthFailedError(new Error('ETIMEDOUT'));
    expect(matchesErrorClass(err, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorClass(err, BOOTSTRAP_ERRORS)).toBe(false);
  });
});

describe('ClerkAuthFailedError is NOT a BootstrapError (hierarchy contract)', () => {
  // The v0 string matcher couldn't express this contract — it lived only
  // as "Clerk auth() failed: ETIMEDOUT" not being in either consumer's
  // needle list. The class hierarchy expresses it directly: if someone
  // refactors errors.ts to "DRY" the hierarchy by making
  // ClerkAuthFailedError extend BootstrapError, this test fails. That
  // refactor would mask Clerk outages as onboarding race-windows — the
  // dashboard would show "Setting up your organization..." indefinitely
  // while Clerk is actually down.
  it('ClerkAuthFailedError instanceof BootstrapError === false', () => {
    const err = new ClerkAuthFailedError(new Error('ETIMEDOUT'));
    expect(err instanceof BootstrapError).toBe(false);
    expect(err instanceof Error).toBe(true);
  });

  it('ClerkAuthFailedError preserves the underlying cause for diagnostics', () => {
    const underlying = new Error('ETIMEDOUT');
    const err = new ClerkAuthFailedError(underlying);
    expect(err.cause).toBe(underlying);
    expect(err.message).toContain('Clerk auth() failed:');
    expect(err.message).toContain('ETIMEDOUT');
  });
});

describe('ProvisioningRaceError abstract base matches both concrete subclasses', () => {
  // Dashboard's allow-list uses the abstract base — one entry catches
  // both Org + User race conditions. This test pins the inheritance
  // chain so a flattened hierarchy (subclasses extending BootstrapError
  // directly, skipping ProvisioningRaceError) fails here.
  it('OrgNotProvisionedError is a ProvisioningRaceError', () => {
    expect(new OrgNotProvisionedError('org_***') instanceof ProvisioningRaceError).toBe(true);
  });

  it('UserNotProvisionedError is a ProvisioningRaceError', () => {
    expect(new UserNotProvisionedError('user_***') instanceof ProvisioningRaceError).toBe(true);
  });

  it('NoActiveOrganizationError is NOT a ProvisioningRaceError (different concept)', () => {
    expect(new NoActiveOrganizationError() instanceof ProvisioningRaceError).toBe(false);
  });
});
