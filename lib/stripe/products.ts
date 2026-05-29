import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, aiGenerations, users } from '@/lib/db/schema';
import { TierLimitExceededError } from './errors';

// Self-namespace import — required for vi.spyOn(productsMod, 'readPlanTier') and
// vi.spyOn(productsMod, 'countDraftsThisMonth') to intercept calls made INSIDE this
// module by the checkTierLimit / requireTierLimit orchestrators. Vitest can only
// replace properties on the module-namespace object; local-binding closures captured
// at parse time bypass spies. The orchestrators below MUST call helpers via `self.fn(...)`,
// NEVER via bare `fn(...)` — see the WARNING-2 SPY CONTRACT comment block before
// checkTierLimit/requireTierLimit. The TypeScript namespace cycle is benign (same-file
// re-resolution — Node resolves it on second pass at load time without infinite recursion).
import * as self from './products';

/**
 * Phase 4 D-14 — single source-of-truth for tier limits + feature gating.
 *
 * Phase 4 ships READ-ONLY against `organizations.planTier`. Phase 6 ships the Stripe webhook
 * that WRITES to that column. Until Phase 6 lands, null/missing planTier defaults to 'starter'
 * (D-46 + SPEC R6 — Starter is the safe default).
 *
 * D-15 — throw-based enforcement: `requireTierLimit` is the API endpoint's gate. The 429/403
 * routing lives on TierLimitExceededError.statusCode (D-16), not at the catch site.
 *
 * WARNING-2 mandated architecture: `checkTierLimit` does NOT call Drizzle directly. All DB
 * access is delegated to two EXPORTED helpers — `readPlanTier` + `countDraftsThisMonth` —
 * which `lib/stripe/products.test.ts` mocks via `vi.spyOn`. This avoids the brittleness of
 * mocking Drizzle's chained-builder API in unit tests.
 *
 * Verbatim from reference/TIER-LIMITS.md (single grep target — if TIER-LIMITS.md changes,
 * this constant MUST change in lockstep; Plan 04-14's check-artifacts gate cross-references).
 */

export const TIER_LIMITS = {
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
    aiDraftsMonthly: -1, // unlimited (sentinel)
    approvalWorkflows: true,
    slackIntegration: true,
    consistencyCheck: true,
    customBranding: true,
    sso: true,
    apiAccess: true,
  },
} as const;

export type PlanTier = keyof typeof TIER_LIMITS;
export type TierFeature = keyof typeof TIER_LIMITS.starter;

const ALLOWED_TIERS = ['starter', 'growth', 'business'] as const;

function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === 'string' && (ALLOWED_TIERS as readonly string[]).includes(value);
}

/**
 * Numeric, usage-bound features. Throwing requireTierLimit uses statusCode 429 for these
 * (429 = "you used your quota"). Per D-15.
 */
const USAGE_BOUND_FEATURES = ['aiDraftsMonthly', 'maxUsers'] as const;

function isUsageBound(feature: TierFeature): boolean {
  return (USAGE_BOUND_FEATURES as readonly string[]).includes(feature);
}

/**
 * For a boolean feature, returns the lowest tier in which the feature is true. Used by
 * requireTierLimit to populate `requiredTier` on the 403 response body.
 */
export function findRequiredTier(feature: TierFeature): PlanTier | undefined {
  for (const tier of ALLOWED_TIERS) {
    if (TIER_LIMITS[tier][feature] === true) return tier;
  }
  return undefined;
}

// ===========================================================================================
// WARNING-2 mandated split-helpers. Exported so tests can vi.spyOn them.
//
// KEY DESIGN NOTE: these helpers import `db` directly from `@/lib/db`. This is the legitimate
// exception to ADR-023 + L-05 ("no raw db import outside lib/db/repositories/") because the
// gate-check runs BEFORE the endpoint's withOrgScope opens (per D-37). The queries are
// org-scoped at the application layer via `eq(organizations.id, orgId)` +
// `eq(aiGenerations.orgId, orgId)`. `scripts/check-db-imports.ts` (Phase 2 L-05) allow-list
// MUST include `lib/stripe/products.ts`; this is the one-line addition shipping with this
// plan (Rule-3 deviation if the gate trips during Task 4 verification).
// ===========================================================================================

/**
 * Phase 4 WARNING-2 — exported DB helper for testability.
 *
 * Reads `organizations.planTier` for the given orgId. Resolves null/invalid → 'starter'.
 * checkTierLimit (the public predicate) is a thin orchestrator on top of this helper.
 *
 * Tests mock via:
 *   vi.spyOn(productsMod, 'readPlanTier').mockResolvedValue('growth');
 */
export async function readPlanTier(orgId: string): Promise<PlanTier> {
  const rows = await db
    .select({ planTier: organizations.planTier })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const row = rows[0];
  return isPlanTier(row?.planTier) ? row!.planTier : 'starter';
}

/**
 * Phase 4 WARNING-2 — exported DB helper for testability + UTC-month-boundary correctness.
 *
 * Counts `ai_generations` rows where org_id matches, type='draft', and created_at falls
 * within the CURRENT CALENDAR MONTH UTC (not local time). The UTC boundary is derived from
 * `new Date(Date.UTC(...))` against the current Date — tests use `vi.setSystemTime` to
 * exercise edge cases like 2026-04-30T23:59:59Z vs 2026-05-01T00:00:01Z falling into
 * different month buckets.
 *
 * Tests mock via:
 *   vi.spyOn(productsMod, 'countDraftsThisMonth').mockResolvedValue(50);
 *
 * Or for the UTC-boundary fixture: leave it un-mocked and seed actual rows + use fake
 * timers — see lib/stripe/products.test.ts Task 2 below.
 */
export async function countDraftsThisMonth(orgId: string): Promise<number> {
  const now = new Date();
  const monthStartUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const rows = await db
    .select({ c: sql<number>`cast(count(*) as int)` })
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.orgId, orgId),
        eq(aiGenerations.type, 'draft'),
        gte(aiGenerations.createdAt, monthStartUtc),
      ),
    );
  return rows[0]?.c ?? 0;
}

/**
 * Phase 6 D-27 - exported DB helper for testability.
 *
 * Counts every current user row in the org. This is an org-wide seat limit, so
 * admins, reviewers, and employees all count toward maxUsers per 06-RESEARCH A5.
 */
export async function countOrgUsers(orgId: string): Promise<number> {
  const rows = await db
    .select({ c: sql<number>`cast(count(*) as int)` })
    .from(users)
    .where(eq(users.orgId, orgId));
  return rows[0]?.c ?? 0;
}

// ===========================================================================================
// Public API: checkTierLimit + requireTierLimit (orchestrators over the helpers above).
//
// WARNING-2 SPY CONTRACT: the orchestrators below call the helpers via the `self` namespace
// imported at the top of this file (NOT via local bindings). This ensures
// vi.spyOn(productsMod, 'readPlanTier') and vi.spyOn(productsMod, 'countDraftsThisMonth')
// intercept the helper calls — Vitest can only replace properties on the module-namespace
// object, not local bindings captured at parse time. Without the `self`-namespace
// indirection the orchestrators would invoke the original closures and the spies would be
// no-ops. This is the entire point of the WARNING-2 split-helper mandate.
// ===========================================================================================

/**
 * Phase 4 D-14 + SPEC R6 — tier-limit predicate.
 *
 * Reads planTier via `readPlanTier` (null/invalid → 'starter'). For 'aiDraftsMonthly' numeric
 * branch, calls `countDraftsThisMonth`. For tier-bound boolean features, reads the tier's
 * flag directly from TIER_LIMITS.
 *
 * Returns { allowed, limit, current }. limit === -1 sentinel for unlimited.
 */
export async function checkTierLimit(
  orgId: string,
  feature: TierFeature,
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const tier = await self.readPlanTier(orgId);
  const tierLimits = TIER_LIMITS[tier];
  const limitValue = tierLimits[feature];

  // Boolean feature path
  if (typeof limitValue === 'boolean') {
    return { allowed: limitValue, limit: -1, current: 0 };
  }

  // Numeric feature path
  const limit = limitValue;
  if (limit === -1) {
    // Unlimited (Business tier on aiDraftsMonthly) — short-circuit before DB count.
    return { allowed: true, limit: -1, current: 0 };
  }

  // Phase 6 maxUsers is a real org-scoped count; keep both helpers spyable.
  const current =
    feature === 'aiDraftsMonthly'
      ? await self.countDraftsThisMonth(orgId)
      : feature === 'maxUsers'
        ? await self.countOrgUsers(orgId)
        : 0;

  return { allowed: current < limit, limit, current };
}

/**
 * Phase 4 D-15 — throw-based tier enforcement.
 *
 * Endpoints call `await requireTierLimit(orgId, feature)` BEFORE the Anthropic call. On
 * overage, throws TierLimitExceededError with statusCode 429 (usage-bound features) or
 * 403 (tier-bound features); endpoint catch discriminates and routes via err.statusCode
 * (D-15 + D-16).
 */
export async function requireTierLimit(
  orgId: string,
  feature: TierFeature,
): Promise<void> {
  const check = await self.checkTierLimit(orgId, feature);
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
