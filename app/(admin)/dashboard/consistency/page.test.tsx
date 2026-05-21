// app/(admin)/dashboard/consistency/page.test.tsx — Plan 04-03 Wave-0 RED stub.
// AC-25 (D-30): mount-time resume from batch_jobs.findLatestForOrg.
// SUT page `app/(admin)/dashboard/consistency/page.tsx` does NOT exist yet — Plan 04-14 creates it.
import { describe, expect, it } from 'vitest';

describe('app/(admin)/dashboard/consistency/page.tsx — AC-25: mount-time resume (D-30)', () => {
  it('on first visit (no batch_jobs row for org): renders <ConsistencyEmptyState>', async () => {
    // Plan 04-14 creates the page Server Component.
    expect.fail('TODO: Plan 04-14 — BatchJobs.findLatestForOrg returns null ⇒ EmptyState');
  });

  it('with batch_jobs row status:"in_progress": renders <ConsistencyCheckRunner> with persisted batchId (no resubmit)', async () => {
    expect.fail('TODO: Plan 04-14 — findLatestForOrg returns in_progress row ⇒ Runner');
  });

  it('with batch_jobs row status:"completed": renders <ConsistencyFindingsList> from row.resultJson (no Anthropic call)', async () => {
    expect.fail('TODO: Plan 04-14 — findLatestForOrg returns completed row + resultJson ⇒ FindingsList');
  });

  it('with batch_jobs row status:"failed": renders <ConsistencyFailureState> + "Run again" CTA', async () => {
    expect.fail('TODO: Plan 04-14 — findLatestForOrg returns failed row ⇒ FailureState');
  });

  it('non-admin: throws ForbiddenError (via requireAdmin → Next.js 403 boundary per D-45)', async () => {
    expect.fail('TODO: Plan 04-14 — non-admin Clerk session ⇒ ForbiddenError');
  });
});
