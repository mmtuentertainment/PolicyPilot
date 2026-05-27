/**
 * scripts/check-ai-layer.test.ts — Phase 4 integration test (vitest-based, WARNING-6).
 *
 * Covers SP-1 (cross-org citation strip), SP-2 (503 + no row on Anthropic throw),
 * SP-4 (429/403 routing), AC-29 (Idempotency-Key dedup), AC-32 (cache-token columns),
 * and AC-24 (batch_jobs cross-org isolation — also covered standalone by check-rls.ts).
 *
 * Architecture per WARNING-6: vitest-based harness with vi.mock for module substitution
 * (NOT runtime Object.defineProperty). Plan 04-03's RED test stubs across app/api/ai/**
 * established the same vi.mock patterns — this harness reuses them at integration scope.
 *
 * Live-DB pattern: `postgres.begin(async (tx) => { ...; throw __INTENTIONAL_ROLLBACK__ })`
 * preserves the seed→exercise→ROLLBACK shape from scripts/check-policies-list-filters.ts.
 *
 * Per the THREAT_MODEL T-04-14-MA: this script REFUSES to run unless TEST_DATABASE_URL or
 * DATABASE_URL_TEST is set (the test env var). It will never touch production DB.
 *
 * Run via: pnpm vitest run scripts/check-ai-layer.test.ts --config scripts/check-ai-layer.vitest.config.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

// --------------------------------------------------------------------------------------------
// Module mocks (WARNING-6 — vi.mock, NOT Object.defineProperty).
// Mock factories hoist to the top of the file (vi.mock is hoisted by vitest).
// We use ctxState + anthropicState mutable refs so per-test setup can override behavior
// without re-applying vi.mock (which would only fire on module load).
// --------------------------------------------------------------------------------------------

type MockCtx = { orgId: string; userId: string; clerkOrgId: string; clerkUserId: string; role: 'admin' | 'reviewer' | 'employee' };
const ctxState: { current: MockCtx | undefined } = { current: undefined };

vi.mock('@/lib/auth/context', () => ({
  getOrgContext: vi.fn(async () => {
    if (!ctxState.current) throw new Error('test setup error: ctxState.current not configured');
    return ctxState.current;
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

type AnthropicMockMode = 'succeed' | 'throw' | 'succeed-with-citation';
const anthropicState: {
  mode: AnthropicMockMode;
  citationIds: string[];
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
} = {
  mode: 'succeed',
  citationIds: [],
  inputTokens: 100,
  outputTokens: 50,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
};

vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: vi.fn(() => ({
    messages: {
      create: vi.fn(async () => {
        if (anthropicState.mode === 'throw') throw new Error('mock Anthropic 500');
        if (anthropicState.mode === 'succeed-with-citation') {
          const citationJson = JSON.stringify(
            anthropicState.citationIds.map((id) => ({ title: 'Mock Policy', id })),
          );
          return {
            content: [
              {
                type: 'text',
                text: `Mock answer body.\n\n--- CITATIONS ---\n${citationJson}\n--- END CITATIONS ---`,
              },
            ],
            usage: {
              input_tokens: anthropicState.inputTokens,
              output_tokens: anthropicState.outputTokens,
              cache_creation_input_tokens: anthropicState.cacheCreationInputTokens,
              cache_read_input_tokens: anthropicState.cacheReadInputTokens,
            },
          };
        }
        return {
          content: [{ type: 'text', text: 'Mock draft body with ## Purpose section.' }],
          usage: {
            input_tokens: anthropicState.inputTokens,
            output_tokens: anthropicState.outputTokens,
            cache_creation_input_tokens: anthropicState.cacheCreationInputTokens,
            cache_read_input_tokens: anthropicState.cacheReadInputTokens,
          },
        };
      }),
      batches: {
        create: vi.fn(async () => ({
          id: `msgbatch_${randomUUID().replace(/-/g, '')}`,
          type: 'message_batch',
          processing_status: 'in_progress',
        })),
        retrieve: vi.fn(async () => ({
          processing_status: 'ended',
          request_counts: { succeeded: 1, errored: 0, expired: 0, canceled: 0, processing: 0 },
        })),
        results: vi.fn(() => ({
          [Symbol.asyncIterator]: async function* () {
            /* yields nothing for the basic happy path */
          },
        })),
      },
    },
  })),
}));

// --------------------------------------------------------------------------------------------
// withOrgScope stub: passes a stub `s` with `tx` set to a mock that proxies to the OUTER
// postgres.begin transaction. This is the integration-test "live DB" path — repository methods
// run against the real TEST DB through the mocked `tx`, but everything stays inside the outer
// transaction so we can ROLLBACK on test exit. We bind the outer tx via a module-level ref.
// --------------------------------------------------------------------------------------------

const scopedRef: { tx: postgres.TransactionSql | undefined } = { tx: undefined };

// Build a Drizzle-like proxy on top of the postgres-js TransactionSql so the repository
// builder chains (s.tx.select()...) work over the same outer transaction. Repository methods
// were authored against drizzle-orm/pg-core's PgTransaction; rather than try to construct one
// from a raw postgres tagged-template, we substitute the repository module's behavior with
// thin direct-sql implementations. This is the same pattern Plan 04-03 stubs used for
// per-route tests, just lifted to integration scope.
//
// REPOSITORY substitutions: we mock the repos we need at the integration boundary and route
// their bodies through the outer transaction's raw SQL. This keeps the harness narrow:
// repository UNIT tests already prove the SQL composition; this harness proves the
// route-handler→repository→DB pipeline end-to-end.

vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async <T,>(_ctx: unknown, fn: (s: unknown) => Promise<T>): Promise<T> => {
    const tx = scopedRef.tx;
    if (!tx) throw new Error('test setup error: scopedRef.tx not set — wrap test body in sql.begin');
    if (!ctxState.current) throw new Error('test setup error: ctxState.current not set');
    const ctx = ctxState.current;
    return fn({ orgId: ctx.orgId, userId: ctx.userId, role: ctx.role, tx });
  },
}));

// Repository mocks — thin handwritten implementations that talk to the outer postgres tx.
// These match the public surface of lib/db/repositories/{policies,ai_generations,batch_jobs}.ts.

vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: {
    listPublishedForOrg: async (s: { orgId: string; tx: postgres.TransactionSql }) => {
      const rows = await s.tx<{ id: string; title: string; tldr_summary: string | null; content_json: unknown }[]>`
        SELECT id, title, tldr_summary, content_json FROM policies
        WHERE org_id = ${s.orgId} AND status = 'published'`;
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        tldrSummary: r.tldr_summary,
        contentJson: r.content_json,
      }));
    },
    findById: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      id: string,
    ) => {
      const rows = await s.tx<{ id: string; tldr_summary: string | null }[]>`
        SELECT id, tldr_summary FROM policies
        WHERE org_id = ${s.orgId} AND id = ${id} LIMIT 1`;
      return rows.map((r) => ({ id: r.id, tldrSummary: r.tldr_summary }));
    },
    updateSummary: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      id: string,
      summary: string,
    ) => {
      await s.tx`UPDATE policies SET tldr_summary = ${summary}, updated_at = now()
                  WHERE org_id = ${s.orgId} AND id = ${id}`;
      return [];
    },
    // Phase 5 Plan 05-04 Task 2 — askQuestion calls this per D-27a to
    // annotate each citation's `accessibility` flag (UI hint; security
    // boundary is at /my-policies/[id]). Returns assigned + published rows;
    // the SP-1 cross-org integration test does NOT seed any
    // policy_assignments, so this returns [] for the test fixture and every
    // citation gets accessibility: 'tldr-only'. The shape matches the real
    // listAssignedAndPublishedForUser return enough for the askQuestion
    // path: `id` is what gets put into the Set + checked against citation
    // IDs. Filters by orgId at the SQL level so cross-org IDs cannot leak
    // into the `assignedIds` Set even if the test fixture seeded them.
    listAssignedAndPublishedForUser: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      userId: string,
    ) => {
      const rows = await s.tx<{ id: string }[]>`
        SELECT DISTINCT p.id
        FROM policies p
        INNER JOIN policy_assignments pa ON pa.policy_id = p.id
          AND pa.org_id = ${s.orgId}
          AND (
            (pa.assignee_type = 'user' AND pa.assignee_id = ${userId})
            OR (pa.assignee_type = 'department' AND pa.assignee_id IN
                (SELECT department_id FROM users WHERE id = ${userId} AND org_id = ${s.orgId}))
          )
        WHERE p.org_id = ${s.orgId} AND p.status = 'published'`;
      return rows;
    },
  },
}));

// Phase 5 Plan 05-04 Task 2 — askQuestion calls QaCitationGrants.upsert
// per D-26 for each parsed.citations row (post-validIds-filter per RESEARCH
// gap-3). Routes through the outer tx so the INSERT participates in the
// same intentional-ROLLBACK envelope as the rest of the test. RESEARCH
// gap-3 invariant: if upsert is ever called with a foreign-org policyId
// (i.e., one not in the SP-1 fix.policyA1/A2 set during Org A's session),
// the SP-1 integration test would surface it via the existing assertion
// `citations.some(c => c.id === fix.policyB1) === false` — and additionally
// any garbage row landing in qa_citation_grants would persist under the
// outer org's RLS, RLS-404-ing at /my-policies/[id]. Mock writes one row
// per call and lets the outer ROLLBACK clear it.
vi.mock('@/lib/db/repositories/qa_citation_grants', () => ({
  QaCitationGrants: {
    upsert: async (
      s: { orgId: string; userId: string; tx: postgres.TransactionSql },
      input: { userId: string; policyId: string },
    ) => {
      await s.tx`INSERT INTO qa_citation_grants (org_id, user_id, policy_id)
                  VALUES (${s.orgId}, ${input.userId}, ${input.policyId})
                  ON CONFLICT (org_id, user_id, policy_id) DO NOTHING`;
      return [];
    },
    hasGrant: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      userId: string,
      policyId: string,
    ) => {
      const rows = await s.tx<{ c: number }[]>`
        SELECT cast(count(*) as int) AS c FROM qa_citation_grants
        WHERE org_id = ${s.orgId} AND user_id = ${userId} AND policy_id = ${policyId}
        LIMIT 1`;
      return Number(rows[0]?.c ?? 0) > 0;
    },
    listForUser: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      userId: string,
    ) => {
      const rows = await s.tx`
        SELECT * FROM qa_citation_grants
        WHERE org_id = ${s.orgId} AND user_id = ${userId}`;
      return rows;
    },
  },
}));

vi.mock('@/lib/db/repositories/ai_generations', () => ({
  AiGenerations: {
    insert: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      input: {
        policyId: string | null;
        type: string;
        prompt: string;
        result: string;
        inputTokens: number | null;
        outputTokens: number | null;
        cacheReadInputTokens: number | null;
        cacheCreationInputTokens: number | null;
        idempotencyKey: string | null;
        model: string;
      },
    ) => {
      await s.tx`INSERT INTO ai_generations
        (org_id, policy_id, type, prompt, result, input_tokens, output_tokens,
         cache_read_input_tokens, cache_creation_input_tokens, idempotency_key, model)
        VALUES (${s.orgId}, ${input.policyId}, ${input.type}, ${input.prompt}, ${input.result},
                ${input.inputTokens}, ${input.outputTokens},
                ${input.cacheReadInputTokens}, ${input.cacheCreationInputTokens},
                ${input.idempotencyKey}, ${input.model})`;
      return [];
    },
    findByIdempotencyKey: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      idempotencyKey: string,
    ) => {
      const rows = await s.tx<
        {
          id: string;
          result: string;
          input_tokens: number | null;
          output_tokens: number | null;
        }[]
      >`SELECT id, result, input_tokens, output_tokens
        FROM ai_generations
        WHERE org_id = ${s.orgId} AND idempotency_key = ${idempotencyKey}
        LIMIT 1`;
      const row = rows[0];
      if (!row) return undefined;
      return {
        id: row.id,
        result: row.result,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
      };
    },
  },
}));

vi.mock('@/lib/db/repositories/batch_jobs', () => ({
  BatchJobs: {
    insert: async (
      s: { orgId: string; tx: postgres.TransactionSql },
      input: { anthropicBatchId: string; type: string; status: string; resultJson: unknown },
    ) => {
      // Cast resultJson to postgres's JSONValue. Repository real path passes
      // `null` when no payload exists (matches what Plan 04-10 ships).
      const json = input.resultJson == null ? null : s.tx.json(input.resultJson as never);
      await s.tx`INSERT INTO batch_jobs (org_id, anthropic_batch_id, type, status, result_json)
                  VALUES (${s.orgId}, ${input.anthropicBatchId}, ${input.type}, ${input.status},
                          ${json})`;
      return [];
    },
  },
}));

// Stripe products mock — COMPLETE replacement so the WARNING-2 self-namespace orchestrator
// path inside products.ts never touches the real `db` barrel. We re-implement the public
// surface (TIER_LIMITS + checkTierLimit + requireTierLimit + readPlanTier + countDraftsThisMonth
// + findRequiredTier) using `scopedRef.tx` for all DB reads. The 429 (usage-bound) vs 403
// (tier-bound) routing logic mirrors lib/stripe/products.ts:requireTierLimit verbatim.
//
// Why a complete replacement, not partial via importActual: products.ts's checkTierLimit
// dispatches via `import * as self from './products'` + `self.readPlanTier(...)`, which
// binds at PARSE TIME inside the real module. vi.mock spreading importActual doesn't rewire
// the module-internal `self` namespace — the orchestrator would still call the original
// readPlanTier which goes through the real db barrel. A complete replacement avoids the
// rebinding question entirely.
vi.mock('@/lib/stripe/products', async () => {
  const { TierLimitExceededError } = await import('@/lib/stripe/errors');

  type PlanTier = 'starter' | 'growth' | 'business';
  type TierFeature =
    | 'maxUsers'
    | 'aiDraftsMonthly'
    | 'approvalWorkflows'
    | 'slackIntegration'
    | 'consistencyCheck'
    | 'customBranding'
    | 'sso'
    | 'apiAccess';

  const TIER_LIMITS = {
    starter: {
      maxUsers: 25,
      aiDraftsMonthly: 50,
      approvalWorkflows: false,
      slackIntegration: false,
      consistencyCheck: false,
      customBranding: false,
      sso: false,
      apiAccess: false,
    },
    growth: {
      maxUsers: 100,
      aiDraftsMonthly: 200,
      approvalWorkflows: true,
      slackIntegration: true,
      consistencyCheck: true,
      customBranding: false,
      sso: false,
      apiAccess: false,
    },
    business: {
      maxUsers: 500,
      aiDraftsMonthly: -1,
      approvalWorkflows: true,
      slackIntegration: true,
      consistencyCheck: true,
      customBranding: true,
      sso: true,
      apiAccess: true,
    },
  } as const;
  const ALLOWED_TIERS: readonly PlanTier[] = ['starter', 'growth', 'business'];
  const USAGE_BOUND: readonly TierFeature[] = ['aiDraftsMonthly', 'maxUsers'];

  function isUsageBound(f: TierFeature): boolean {
    return (USAGE_BOUND as readonly string[]).includes(f);
  }

  function findRequiredTier(feature: TierFeature): PlanTier | undefined {
    for (const tier of ALLOWED_TIERS) {
      if (TIER_LIMITS[tier][feature] === true) return tier;
    }
    return undefined;
  }

  async function readPlanTier(orgId: string): Promise<PlanTier> {
    const tx = scopedRef.tx;
    if (!tx) throw new Error('test setup error: scopedRef.tx not set in mock readPlanTier');
    const rows = await tx<{ plan_tier: string }[]>`
      SELECT plan_tier FROM organizations WHERE id = ${orgId} LIMIT 1`;
    const t = rows[0]?.plan_tier;
    return t === 'growth' || t === 'business' || t === 'starter' ? (t as PlanTier) : 'starter';
  }

  async function countDraftsThisMonth(orgId: string): Promise<number> {
    const tx = scopedRef.tx;
    if (!tx) throw new Error('test setup error: scopedRef.tx not set in mock countDraftsThisMonth');
    const rows = await tx<{ c: number }[]>`
      SELECT cast(count(*) as int) AS c FROM ai_generations
      WHERE org_id = ${orgId} AND type = 'draft'`;
    return rows[0]?.c ?? 0;
  }

  async function checkTierLimit(
    orgId: string,
    feature: TierFeature,
  ): Promise<{ allowed: boolean; limit: number; current: number }> {
    const tier = await readPlanTier(orgId);
    const tierLimits = TIER_LIMITS[tier];
    const limitValue = tierLimits[feature];
    if (typeof limitValue === 'boolean') {
      return { allowed: limitValue, limit: -1, current: 0 };
    }
    const limit = limitValue;
    if (limit === -1) return { allowed: true, limit: -1, current: 0 };
    const current = feature === 'aiDraftsMonthly' ? await countDraftsThisMonth(orgId) : 0;
    return { allowed: current < limit, limit, current };
  }

  async function requireTierLimit(orgId: string, feature: TierFeature): Promise<void> {
    const check = await checkTierLimit(orgId, feature);
    if (check.allowed) return;
    const statusCode: 429 | 403 = isUsageBound(feature) ? 429 : 403;
    const requiredTier: PlanTier | undefined =
      statusCode === 403 ? findRequiredTier(feature) : undefined;
    throw new TierLimitExceededError(
      feature,
      check.limit,
      check.current,
      statusCode,
      requiredTier,
    );
  }

  return {
    TIER_LIMITS,
    readPlanTier,
    countDraftsThisMonth,
    findRequiredTier,
    checkTierLimit,
    requireTierLimit,
  };
});

// --------------------------------------------------------------------------------------------
// Live TEST DB setup. Gated on TEST_DATABASE_URL — refuses to run against production.
// T-04-14-MA mitigation.
// --------------------------------------------------------------------------------------------

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL_TEST;
if (!TEST_URL) {
  throw new Error(
    '[check-ai-layer] FAIL — TEST_DATABASE_URL (or DATABASE_URL_TEST) required. ' +
      'See scripts/check-ai-layer.vitest.config.ts + the --config invocation in package.json check:ai-layer.',
  );
}
process.env.DATABASE_URL = TEST_URL;

let sql: postgres.Sql;

beforeAll(() => {
  sql = postgres(TEST_URL!, { prepare: false, onnotice: () => {} });
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

type Fixture = {
  orgAId: string;
  orgBId: string;
  adminA_userId: string;
  adminB_userId: string;
  policyA1: string;
  policyA2: string;
  policyB1: string;
  clerkOrgA: string;
  clerkOrgB: string;
  clerkUserA: string;
  clerkUserB: string;
};

async function seedFixture(
  tx: postgres.TransactionSql,
  opts?: { orgAPlanTier?: 'starter' | 'growth' | 'business'; orgBPlanTier?: 'starter' | 'growth' | 'business' },
): Promise<Fixture> {
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const adminA_userId = randomUUID();
  const adminB_userId = randomUUID();
  const policyA1 = randomUUID();
  const policyA2 = randomUUID();
  const policyB1 = randomUUID();
  const clerkOrgA = 'clerk_org_check_ailayer_a_' + randomUUID().slice(0, 8);
  const clerkOrgB = 'clerk_org_check_ailayer_b_' + randomUUID().slice(0, 8);
  const clerkUserA = 'clerk_user_check_ailayer_a_' + randomUUID().slice(0, 8);
  const clerkUserB = 'clerk_user_check_ailayer_b_' + randomUUID().slice(0, 8);

  const planA = opts?.orgAPlanTier ?? 'growth';
  const planB = opts?.orgBPlanTier ?? 'starter';

  await tx`INSERT INTO organizations (id, clerk_org_id, name, slug, plan_tier)
           VALUES (${orgAId}, ${clerkOrgA}, 'Org A AILayer', ${'orga-ail-' + orgAId.slice(0, 8)}, ${planA}),
                  (${orgBId}, ${clerkOrgB}, 'Org B AILayer', ${'orgb-ail-' + orgBId.slice(0, 8)}, ${planB})`;
  await tx`INSERT INTO users (id, clerk_user_id, org_id, role)
           VALUES (${adminA_userId}, ${clerkUserA}, ${orgAId}, 'admin'),
                  (${adminB_userId}, ${clerkUserB}, ${orgBId}, 'admin')`;
  const minimalContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Policy body content.' }] }],
  };
  await tx`INSERT INTO policies (id, org_id, title, content_json, category, status, current_version)
           VALUES (${policyA1}, ${orgAId}, 'Org A Policy 1', ${tx.json(minimalContent)}, 'HR', 'published', 1),
                  (${policyA2}, ${orgAId}, 'Org A Policy 2', ${tx.json(minimalContent)}, 'IT', 'published', 1),
                  (${policyB1}, ${orgBId}, 'Org B Policy 1', ${tx.json(minimalContent)}, 'HR', 'published', 1)`;
  return {
    orgAId,
    orgBId,
    adminA_userId,
    adminB_userId,
    policyA1,
    policyA2,
    policyB1,
    clerkOrgA,
    clerkOrgB,
    clerkUserA,
    clerkUserB,
  };
}

async function truncateTenantTables(tx: postgres.TransactionSql): Promise<void> {
  for (const t of [
    'acknowledgments',
    'policy_assignments',
    'policy_versions',
    'ai_generations',
    'batch_jobs',
    'notifications',
    'workflow_stages',
    'policies',
    'departments',
    'users',
    'organizations',
    'clerk_events',
    'stripe_events',
  ]) {
    await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
  }
}

/**
 * Per-test driver. Sets ctxState + scopedRef + anthropicState, seeds, runs the body, and
 * always rolls back via the intentional-throw pattern (mirrors scripts/check-rls.ts and
 * scripts/check-policies-list-filters.ts).
 */
async function withRollback(
  body: (tx: postgres.TransactionSql, fix: Fixture) => Promise<void>,
  opts?: { orgAPlanTier?: 'starter' | 'growth' | 'business'; orgBPlanTier?: 'starter' | 'growth' | 'business' },
): Promise<void> {
  try {
    await sql.begin(async (tx) => {
      await truncateTenantTables(tx);
      const fix = await seedFixture(tx, opts);
      scopedRef.tx = tx;
      try {
        await body(tx, fix);
      } finally {
        scopedRef.tx = undefined;
      }
      throw new Error('__INTENTIONAL_ROLLBACK__');
    });
  } catch (err) {
    if (!(err instanceof Error && err.message === '__INTENTIONAL_ROLLBACK__')) throw err;
  }
}

// --------------------------------------------------------------------------------------------
// Per-sub-path test suites. Each wraps the body in sql.begin + intentional ROLLBACK throw
// so seed data never persists across tests. (Vitest does NOT auto-isolate DB state — manual.)
// --------------------------------------------------------------------------------------------

describe('Phase 4 integration — SP-1/SP-2/SP-4/AC-24/AC-29/AC-32 (WARNING-6 vitest harness)', () => {
  it('SP-2 — /api/ai/draft on Anthropic throw: 503 + Retry-After + no ai_generations row', async () => {
    await withRollback(async (tx, fix) => {
      ctxState.current = {
        orgId: fix.orgAId,
        userId: fix.adminA_userId,
        clerkOrgId: fix.clerkOrgA,
        clerkUserId: fix.clerkUserA,
        role: 'admin',
      };
      anthropicState.mode = 'throw';

      const beforeRows = await tx<{ c: number }[]>`
        SELECT cast(count(*) as int) AS c FROM ai_generations WHERE org_id = ${fix.orgAId}`;
      const beforeCount = beforeRows[0]?.c ?? 0;

      const { POST } = await import('@/app/api/ai/draft/route');
      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });
      const res = await POST(req);
      const body = (await res.json()) as { error: string };

      const afterRows = await tx<{ c: number }[]>`
        SELECT cast(count(*) as int) AS c FROM ai_generations WHERE org_id = ${fix.orgAId}`;
      const afterCount = afterRows[0]?.c ?? 0;

      expect(res.status).toBe(503);
      expect(body.error).toBe('ai_service_unavailable');
      expect(res.headers.get('Retry-After')).toBe('30');
      expect(afterCount).toBe(beforeCount);
    });
  });

  it('SP-1 — Q&A citation strip: only same-org IDs surface (cross-org leak prevention)', async () => {
    await withRollback(async (_tx, fix) => {
      ctxState.current = {
        orgId: fix.orgAId,
        userId: fix.adminA_userId,
        clerkOrgId: fix.clerkOrgA,
        clerkUserId: fix.clerkUserA,
        role: 'admin',
      };
      anthropicState.mode = 'succeed-with-citation';
      anthropicState.citationIds = [fix.policyA1, fix.policyB1]; // mix: Org A real + Org B foreign

      const { POST } = await import('@/app/api/ai/qa/route');
      const req = new Request('http://localhost/api/ai/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'What about policy 1?' }),
      });
      const res = await POST(req);
      const body = (await res.json()) as { citations: { id: string }[] };
      const citations = body.citations ?? [];

      expect(res.status).toBe(200);
      // SP-1 — only Org A IDs survive
      expect(citations.every((c) => c.id === fix.policyA1 || c.id === fix.policyA2)).toBe(true);
      expect(citations.some((c) => c.id === fix.policyB1)).toBe(false);
    });
  });

  it('SP-4 — Starter 50/50 drafts ⇒ 429 tier_limit_exceeded', async () => {
    await withRollback(
      async (tx, fix) => {
        ctxState.current = {
          orgId: fix.orgBId,
          userId: fix.adminB_userId,
          clerkOrgId: fix.clerkOrgB,
          clerkUserId: fix.clerkUserB,
          role: 'admin',
        };
        anthropicState.mode = 'succeed';

        // Seed 50 historic 'draft' rows so requireTierLimit → 429 against the 50-cap Starter tier.
        for (let i = 0; i < 50; i++) {
          await tx`INSERT INTO ai_generations (org_id, type, prompt, result, model)
                   VALUES (${fix.orgBId}, 'draft', 'historic prompt', 'placeholder', 'claude-sonnet-4-6')`;
        }

        const { POST } = await import('@/app/api/ai/draft/route');
        const req = new Request('http://localhost/api/ai/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'one more' }),
        });
        const res = await POST(req);
        const body = (await res.json()) as { error: string };

        expect(res.status).toBe(429);
        expect(body.error).toBe('tier_limit_exceeded');
      },
      { orgBPlanTier: 'starter' },
    );
  });

  it('SP-4 — Starter ⇒ /api/ai/consistency 403 requiredTier=growth', async () => {
    await withRollback(
      async (_tx, fix) => {
        ctxState.current = {
          orgId: fix.orgBId,
          userId: fix.adminB_userId,
          clerkOrgId: fix.clerkOrgB,
          clerkUserId: fix.clerkUserB,
          role: 'admin',
        };
        anthropicState.mode = 'succeed';

        const { POST } = await import('@/app/api/ai/consistency/route');
        const req = new Request('http://localhost/api/ai/consistency', { method: 'POST' });
        const res = await POST(req);
        const body = (await res.json()) as { error: string; requiredTier?: string };

        expect(res.status).toBe(403);
        expect(body.error).toBe('tier_limit_exceeded');
        expect(body.requiredTier).toBe('growth');
      },
      { orgBPlanTier: 'starter' },
    );
  });

  it('AC-29 — Idempotency-Key dedup: same key ⇒ same draftContent + no new row', async () => {
    await withRollback(async (tx, fix) => {
      ctxState.current = {
        orgId: fix.orgAId,
        userId: fix.adminA_userId,
        clerkOrgId: fix.clerkOrgA,
        clerkUserId: fix.clerkUserA,
        role: 'admin',
      };
      anthropicState.mode = 'succeed';

      const idempKey = randomUUID();
      const { POST } = await import('@/app/api/ai/draft/route');

      const req1 = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
        body: JSON.stringify({ prompt: 'idempotency-test' }),
      });
      const res1 = await POST(req1);
      const body1 = (await res1.json()) as { draftContent: string };

      const c1Rows = await tx<{ c: number }[]>`
        SELECT cast(count(*) as int) AS c FROM ai_generations
        WHERE org_id = ${fix.orgAId} AND idempotency_key = ${idempKey}`;
      const c1 = c1Rows[0]?.c ?? 0;

      const req2 = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempKey },
        body: JSON.stringify({ prompt: 'idempotency-test' }),
      });
      const res2 = await POST(req2);
      const body2 = (await res2.json()) as { draftContent: string };

      const c2Rows = await tx<{ c: number }[]>`
        SELECT cast(count(*) as int) AS c FROM ai_generations
        WHERE org_id = ${fix.orgAId} AND idempotency_key = ${idempKey}`;
      const c2 = c2Rows[0]?.c ?? 0;

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(body1.draftContent).toBe(body2.draftContent);
      expect(c1).toBe(1);
      expect(c2).toBe(1);
    });
  });

  it('AC-32 — Draft insert populates input_tokens + output_tokens + cache columns (cache-creation path)', async () => {
    await withRollback(async (tx, fix) => {
      ctxState.current = {
        orgId: fix.orgAId,
        userId: fix.adminA_userId,
        clerkOrgId: fix.clerkOrgA,
        clerkUserId: fix.clerkUserA,
        role: 'admin',
      };
      anthropicState.mode = 'succeed';
      anthropicState.inputTokens = 200;
      anthropicState.outputTokens = 80;
      anthropicState.cacheCreationInputTokens = 1024;
      anthropicState.cacheReadInputTokens = 0;

      const { POST } = await import('@/app/api/ai/draft/route');
      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test for cache columns' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const rows = await tx<
        {
          input_tokens: number | null;
          output_tokens: number | null;
          cache_read_input_tokens: number | null;
          cache_creation_input_tokens: number | null;
        }[]
      >`SELECT input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
        FROM ai_generations WHERE org_id = ${fix.orgAId} AND type = 'draft' LIMIT 1`;
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.input_tokens).toBe(200);
      expect(row?.output_tokens).toBe(80);
      expect(row?.cache_creation_input_tokens).toBe(1024);
      expect(row?.cache_read_input_tokens).toBe(0);

      // Reset for subsequent tests
      anthropicState.inputTokens = 100;
      anthropicState.outputTokens = 50;
      anthropicState.cacheCreationInputTokens = 0;
      anthropicState.cacheReadInputTokens = 0;
    });
  });

  // PR #15 code-review: D-25's intent was to assert the endpoint READS the
  // cache_read_input_tokens column. AC-32 above only covers the cache-CREATION
  // path. This sibling covers the cache-HIT path so both directions of the
  // 4-column token shape are integration-verified.
  it('AC-32b — Draft insert populates cache_read on cache-hit path (creation=0, read>0)', async () => {
    await withRollback(async (tx, fix) => {
      ctxState.current = {
        orgId: fix.orgAId,
        userId: fix.adminA_userId,
        clerkOrgId: fix.clerkOrgA,
        clerkUserId: fix.clerkUserA,
        role: 'admin',
      };
      anthropicState.mode = 'succeed';
      anthropicState.inputTokens = 200;
      anthropicState.outputTokens = 80;
      // Cache-HIT signature: creation=0, read>0. Mirrors the symmetric token
      // transition observed during real-key UAT (~1133 tokens swapping columns
      // between two consecutive identical-system-prompt requests).
      anthropicState.cacheCreationInputTokens = 0;
      anthropicState.cacheReadInputTokens = 800;

      const { POST } = await import('@/app/api/ai/draft/route');
      const req = new Request('http://localhost/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test for cache-hit columns' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const rows = await tx<
        {
          input_tokens: number | null;
          output_tokens: number | null;
          cache_read_input_tokens: number | null;
          cache_creation_input_tokens: number | null;
        }[]
      >`SELECT input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens
        FROM ai_generations WHERE org_id = ${fix.orgAId} AND type = 'draft' LIMIT 1`;
      const row = rows[0];
      expect(row).toBeDefined();
      expect(row?.input_tokens).toBe(200);
      expect(row?.output_tokens).toBe(80);
      expect(row?.cache_creation_input_tokens).toBe(0);
      expect(row?.cache_read_input_tokens).toBe(800);

      // Reset for subsequent tests
      anthropicState.inputTokens = 100;
      anthropicState.outputTokens = 50;
      anthropicState.cacheCreationInputTokens = 0;
      anthropicState.cacheReadInputTokens = 0;
    });
  });

  it('AC-24 — batch_jobs cross-org isolation: Org B cannot SELECT Org A row', async () => {
    // Direct DB-level RLS assertion (mirrors scripts/check-rls.ts; intentional duplicate
    // coverage per the plan's spec). We seed both orgs' batch_jobs rows then run a SELECT
    // under Org B's JWT claims and assert only Org B's row returns.
    await withRollback(async (tx, fix) => {
      const batchA = `msgbatch_A_${randomUUID().replace(/-/g, '')}`;
      const batchB = `msgbatch_B_${randomUUID().replace(/-/g, '')}`;
      await tx`INSERT INTO batch_jobs (org_id, anthropic_batch_id, type, status)
               VALUES (${fix.orgAId}, ${batchA}, 'consistency', 'in_progress'),
                      (${fix.orgBId}, ${batchB}, 'consistency', 'in_progress')`;

      // Switch into the authenticated role with Org B's claims (mirrors withOrgScope's
      // SET LOCAL ROLE + set_config pattern). Inside the same outer transaction so the
      // SET LOCAL effects revert on ROLLBACK.
      await tx`SET LOCAL ROLE authenticated`;
      const claimsB = JSON.stringify({ sub: fix.adminB_userId, org_id: fix.orgBId, role: 'admin' });
      await tx`SELECT set_config('request.jwt.claims', ${claimsB}, true)`;

      const seen = await tx<{ id: string; org_id: string }[]>`
        SELECT id, org_id FROM batch_jobs`;
      // Org B sees Org B's row only — Org A's row is invisible under RLS.
      expect(seen.length).toBe(1);
      expect(seen[0]?.org_id).toBe(fix.orgBId);
    });
  });
});
