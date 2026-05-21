// lib/auth/require-admin.test.ts — Task 1 of Plan 03-02 (L-01 closure)
// + Plan 04-07 Task 2 (D-45 requireAdminFromCtx 403 path).
//
// Test contract per Plan 03-02 <behavior> (requireAdmin no-arg signature):
//   - role='admin'    → resolves to OrgContext
//   - role='employee' → calls notFound() → throws NEXT_NOT_FOUND (D-10)
//   - role='reviewer' → calls notFound() → throws NEXT_NOT_FOUND (D-10)
//   - getOrgContext() throws → bubbles (no swallow; SF-M4 fold lives one
//     layer down in lib/auth/context.ts already)
//
// Test contract per Plan 04-07 D-45 (requireAdminFromCtx signature):
//   - role='admin'    → returns silently
//   - role='employee' → throws ForbiddenError
//   - role='reviewer' → throws ForbiddenError with reason='admin role required' + code='FORBIDDEN'
//
// Mock pattern: vi.mock replaces `@/lib/auth/context` so each test can
// swap getOrgContext()'s return value. `next/navigation`'s `notFound()`
// is stubbed to throw a synchronous error containing 'NEXT_NOT_FOUND'
// so we can assert via `rejects.toThrow`.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const getOrgContextMock = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => getOrgContextMock(),
}));

// Import AFTER vi.mock declarations. Vitest hoists vi.mock above imports
// so this works, but the explicit ordering documents the intent.
import { requireAdmin, requireAdminFromCtx } from './require-admin';
import { ForbiddenError } from './errors';

describe('requireAdmin()', () => {
  beforeEach(() => {
    getOrgContextMock.mockReset();
  });

  it('returns OrgContext when role is admin', async () => {
    const ctx = {
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'admin' as const,
    };
    getOrgContextMock.mockResolvedValueOnce(ctx);
    await expect(requireAdmin()).resolves.toEqual(ctx);
  });

  it('calls notFound() when role is employee', async () => {
    getOrgContextMock.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'employee',
    });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound() when role is reviewer', async () => {
    getOrgContextMock.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'reviewer',
    });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('bubbles the underlying error when getOrgContext() throws', async () => {
    getOrgContextMock.mockRejectedValueOnce(
      new Error('Clerk auth() failed: NetworkError: ECONNREFUSED'),
    );
    await expect(requireAdmin()).rejects.toThrow('Clerk auth() failed');
  });
});

describe('requireAdminFromCtx (Phase 4 D-45 → 403 path)', () => {
  // Phase 4 endpoint outer-auth pattern: caller resolves ctx via
  // getOrgContext() OUTSIDE the route's try block (per D-37), then passes
  // the resolved ctx into requireAdminFromCtx — this lets ForbiddenError
  // propagate to the Next.js error boundary as HTTP 403 instead of
  // collapsing into the inner 503 fallback for Anthropic failures.
  //
  // Unlike the no-arg requireAdmin() which calls notFound() (404 — Phase 3
  // "advertise nothing" UX), this signature throws ForbiddenError (403 —
  // well-formed REST API error response per AC-26).

  it('returns silently when role is admin', () => {
    const ctx = {
      orgId: 'org_test',
      userId: 'user_test',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'admin' as const,
    };
    expect(() => requireAdminFromCtx(ctx)).not.toThrow();
  });

  it('throws ForbiddenError when role is employee', () => {
    const ctx = {
      orgId: 'org_test',
      userId: 'user_test',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'employee' as const,
    };
    expect(() => requireAdminFromCtx(ctx)).toThrow(ForbiddenError);
  });

  it('throws ForbiddenError with reason="admin role required" + code="FORBIDDEN" when role is reviewer', () => {
    const ctx = {
      orgId: 'org_test',
      userId: 'user_test',
      clerkOrgId: 'clerk_test_org',
      clerkUserId: 'clerk_test_user',
      role: 'reviewer' as const,
    };
    try {
      requireAdminFromCtx(ctx);
      throw new Error('expected ForbiddenError throw, got fall-through');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenError);
      expect((err as ForbiddenError).reason).toBe('admin role required');
      expect((err as ForbiddenError).code).toBe('FORBIDDEN');
      // Message contract: includes the reason for log-grep continuity.
      expect((err as ForbiddenError).message).toContain('admin role required');
    }
  });
});
