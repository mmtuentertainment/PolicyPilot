// lib/auth/bootstrap-errors.test.ts — locks the substring-matching
// contract that both consumers (dashboard page + post-sign-in trampoline)
// rely on for narrowing getOrgContext() / asRole() throws. CR-PR3-postreview
// per pr-test-analyzer FLAG (criticality 8 — was uncovered).
import { describe, it, expect } from 'vitest';
import { matchesErrorMessage } from './bootstrap-errors';

// Exact dashboard allow-list (mirror of app/(admin)/dashboard/page.tsx).
const ONBOARDING_RACE_ERRORS = [
  'No active organization',
  'Org not provisioned',
  'User not provisioned',
  'Invalid role',
] as const;

// Exact trampoline allow-list (mirror of app/(auth)/post-sign-in/page.tsx).
// INTENTIONALLY excludes 'Org/User not provisioned' — trampoline treats DB
// drift as hard failure; dashboard treats same shape as soft refresh.
const BOOTSTRAP_ERRORS = [
  'Not authenticated',
  'Invalid role',
  'No active organization',
] as const;

describe('matchesErrorMessage', () => {
  it('returns false for non-Error inputs', () => {
    expect(matchesErrorMessage(null, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage(undefined, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage('No active organization', ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage({ message: 'No active organization' }, ONBOARDING_RACE_ERRORS)).toBe(false);
  });

  it('returns true when the message contains any allow-list needle', () => {
    expect(matchesErrorMessage(new Error('No active organization'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorMessage(new Error('Org not provisioned in DB for org_***'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorMessage(new Error('User not provisioned in DB for user_***'), ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorMessage(new Error('Invalid role on session claims: foo'), ONBOARDING_RACE_ERRORS)).toBe(true);
  });

  it('returns false when the message does not contain any needle', () => {
    expect(matchesErrorMessage(new Error('Clerk auth() failed: NetworkError'), ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage(new Error('Not authenticated: no Clerk session'), ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage(new Error('DB connection lost'), ONBOARDING_RACE_ERRORS)).toBe(false);
  });
});

describe('ONBOARDING_RACE_ERRORS vs BOOTSTRAP_ERRORS divergence (locks the design)', () => {
  // The two lists are intentionally different. If anyone "DRYs" them
  // into one constant, the design intent breaks and one of these tests
  // catches it.
  it('dashboard treats Org/User-not-provisioned as RACE (soft retry)', () => {
    const err = new Error('Org not provisioned in DB for org_***');
    expect(matchesErrorMessage(err, ONBOARDING_RACE_ERRORS)).toBe(true);
  });

  it('trampoline treats Org/User-not-provisioned as HARD-FAIL (rethrow)', () => {
    const err = new Error('Org not provisioned in DB for org_***');
    expect(matchesErrorMessage(err, BOOTSTRAP_ERRORS)).toBe(false);
  });

  it('trampoline catches Not-authenticated (dashboard does NOT — middleware should preempt)', () => {
    const err = new Error('Not authenticated: no Clerk session');
    expect(matchesErrorMessage(err, BOOTSTRAP_ERRORS)).toBe(true);
    expect(matchesErrorMessage(err, ONBOARDING_RACE_ERRORS)).toBe(false);
  });

  it('both lists catch No-active-organization (the canonical onboarding signal)', () => {
    const err = new Error('No active organization');
    expect(matchesErrorMessage(err, ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorMessage(err, BOOTSTRAP_ERRORS)).toBe(true);
  });

  it('both lists catch Invalid-role', () => {
    const err = new Error('Invalid role on session claims: NaN');
    expect(matchesErrorMessage(err, ONBOARDING_RACE_ERRORS)).toBe(true);
    expect(matchesErrorMessage(err, BOOTSTRAP_ERRORS)).toBe(true);
  });

  it('both lists let Clerk-auth-failed RETHROW (backend outage)', () => {
    const err = new Error('Clerk auth() failed: ETIMEDOUT');
    expect(matchesErrorMessage(err, ONBOARDING_RACE_ERRORS)).toBe(false);
    expect(matchesErrorMessage(err, BOOTSTRAP_ERRORS)).toBe(false);
  });
});
