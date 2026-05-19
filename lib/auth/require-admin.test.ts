// lib/auth/require-admin.test.ts — Task 1 of Plan 03-02 (L-01 closure).
//
// Test contract per Plan 03-02 <behavior>:
//   - role='admin'    → resolves to OrgContext
//   - role='employee' → calls notFound() → throws NEXT_NOT_FOUND (D-10)
//   - role='reviewer' → calls notFound() → throws NEXT_NOT_FOUND (D-10)
//   - getOrgContext() throws → bubbles (no swallow; SF-M4 fold lives one
//     layer down in lib/auth/context.ts already)
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
import { requireAdmin } from './require-admin';

describe('requireAdmin()', () => {
  beforeEach(() => {
    getOrgContextMock.mockReset();
  });

  it('returns OrgContext when role is admin', async () => {
    const ctx = { orgId: 'org_1', userId: 'user_1', role: 'admin' as const };
    getOrgContextMock.mockResolvedValueOnce(ctx);
    await expect(requireAdmin()).resolves.toEqual(ctx);
  });

  it('calls notFound() when role is employee', async () => {
    getOrgContextMock.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
      role: 'employee',
    });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calls notFound() when role is reviewer', async () => {
    getOrgContextMock.mockResolvedValueOnce({
      orgId: 'org_1',
      userId: 'user_1',
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
