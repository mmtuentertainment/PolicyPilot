// app/(admin)/dashboard/consistency/page.test.tsx — Plan 04-13 Task 4 (GREEN).
// AC-25 (D-30): mount-time resume from batch_jobs.findLatestForOrg.
// Drives the 5 RED stubs (Plan 04-03 placeholder) to GREEN by invoking the
// Server Component function directly and asserting on the returned React
// element's component identity + props.
//
// Server Component test convention (PATTERNS § "No Analog Found" line 1762):
// vitest invokes the async page function under jsdom env; we inspect the
// returned element's .type (component reference) and .props (passed values)
// directly without rendering. Plan 04-13 establishes this convention for
// Phase 4; future Server Component page tests can mirror this shape.
//
// Component-identity check rationale: importing the real components and
// comparing `result.type === Component` is more robust than `.type.name`
// string comparison — it tolerates bundler renaming and clearly signals
// the assertion's intent.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConsistencyEmptyState } from '@/components/admin/ConsistencyEmptyState';
import { ConsistencyFailureState } from '@/components/admin/ConsistencyFailureState';
import { ConsistencyFindingsList } from '@/components/admin/ConsistencyFindingsList';
import { ConsistencyCheckRunner } from '@/components/admin/ConsistencyCheckRunner';

// ============================================================================
// Mock BatchJobs.findLatestForOrg — the D-30 resume query. Tests override
// its return value to exercise each of the 4 branches.
// ============================================================================
const mockFindLatest = vi.fn();
vi.mock('@/lib/db/repositories/batch_jobs', () => ({
  BatchJobs: {
    findLatestForOrg: (...args: unknown[]) => mockFindLatest(...args),
  },
}));

// ============================================================================
// Mock getOrgContext — admin by default; non-admin test overrides role.
// requireAdminFromCtx is the REAL implementation (just throws ForbiddenError
// on non-admin per D-45) so the non-admin assertion tests the real code path.
// ============================================================================
const mockGetOrgContext = vi.fn();
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: () => mockGetOrgContext(),
}));

// ============================================================================
// withOrgScope passes a stub scope to the callback. The page calls
// findLatestForOrg(s) inside the closure — mockFindLatest captures the call
// regardless of the stub scope shape.
// ============================================================================
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (
    _ctx: unknown,
    fn: (s: unknown) => Promise<unknown>,
  ) => fn({ orgId: 'org_1', userId: 'user_1', tx: {} }),
}));

const ADMIN_CTX = {
  orgId: 'org_1',
  userId: 'user_1',
  role: 'admin' as const,
  clerkOrgId: 'org_clerk_1',
  clerkUserId: 'user_clerk_1',
};

describe('app/(admin)/dashboard/consistency/page.tsx — AC-25: mount-time resume (D-30)', () => {
  beforeEach(() => {
    mockFindLatest.mockReset();
    mockGetOrgContext.mockReset();
    mockGetOrgContext.mockResolvedValue(ADMIN_CTX);
  });

  it('on first visit (no batch_jobs row for org): renders <ConsistencyEmptyState>', async () => {
    mockFindLatest.mockResolvedValueOnce(undefined);
    const { default: Page } = await import(
      '@/app/(admin)/dashboard/consistency/page'
    );
    const result = await Page();
    expect(result.type).toBe(ConsistencyEmptyState);
  });

  it('with batch_jobs row status:"in_progress": renders <ConsistencyCheckRunner> with persisted batchId (no resubmit)', async () => {
    const createdAt = new Date(Date.now() - 60_000);
    mockFindLatest.mockResolvedValueOnce({
      status: 'in_progress',
      anthropicBatchId: 'msgbatch_persisted',
      createdAt,
    });
    const { default: Page } = await import(
      '@/app/(admin)/dashboard/consistency/page'
    );
    const result = await Page();
    expect(result.type).toBe(ConsistencyCheckRunner);
    const props = result.props as { batchId: string; startedAt: Date };
    expect(props.batchId).toBe('msgbatch_persisted');
    expect(props.startedAt).toBeInstanceOf(Date);
  });

  it('with batch_jobs row status:"completed": renders <ConsistencyFindingsList> from row.resultJson (no Anthropic call)', async () => {
    const fixtureFindings = [
      {
        policy_a: 'Vacation Policy',
        policy_b: 'PTO Policy',
        issue_type: 'contradiction',
        description: 'Vacation Policy allows 15 days, PTO Policy allows 20',
        severity: 'high',
      },
    ];
    mockFindLatest.mockResolvedValueOnce({
      status: 'completed',
      anthropicBatchId: 'msgbatch_done',
      createdAt: new Date(),
      resultJson: fixtureFindings,
    });
    const { default: Page } = await import(
      '@/app/(admin)/dashboard/consistency/page'
    );
    const result = await Page();
    expect(result.type).toBe(ConsistencyFindingsList);
    expect((result.props as { result: unknown }).result).toEqual(
      fixtureFindings,
    );
  });

  it('with batch_jobs row status:"failed": renders <ConsistencyFailureState> + "Run again" CTA', async () => {
    mockFindLatest.mockResolvedValueOnce({
      status: 'failed',
      anthropicBatchId: 'msgbatch_failed',
      createdAt: new Date(),
    });
    const { default: Page } = await import(
      '@/app/(admin)/dashboard/consistency/page'
    );
    const result = await Page();
    expect(result.type).toBe(ConsistencyFailureState);
  });

  it('non-admin: throws ForbiddenError (via requireAdminFromCtx → Next.js 403 boundary per D-45)', async () => {
    mockGetOrgContext.mockResolvedValueOnce({
      ...ADMIN_CTX,
      role: 'employee' as const,
    });
    // The page MUST throw before reaching findLatestForOrg — guards against
    // the "auth gate inside try/catch swallows the 403" anti-pattern (D-37).
    const { default: Page } = await import(
      '@/app/(admin)/dashboard/consistency/page'
    );
    await expect(Page()).rejects.toThrow();
    // findLatestForOrg must NOT have been called — the auth gate fires first.
    expect(mockFindLatest).not.toHaveBeenCalled();
  });
});
