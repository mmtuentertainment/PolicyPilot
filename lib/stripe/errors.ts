import 'server-only';
import type { TIER_LIMITS, PlanTier } from './products';

/**
 * Phase 4 D-16 — billing-domain typed error.
 *
 * Mirrors ADR-026 typed-error pattern (`lib/auth/errors.ts:NotAuthenticatedError` shape +
 * `lib/policies/state-machine.ts:IllegalTransitionError` shape) but extends `Error` directly,
 * NOT `BootstrapError`. Rationale: BootstrapError is auth-domain (session/org/role bootstrap);
 * tier overage is billing-domain (Stripe-driven plan limits, Phase 6 webhook owns the write).
 *
 * 429-vs-403 routing lives on the INSTANCE (`statusCode` field), not at the catch site:
 *   - 429 for usage-bound features (`aiDraftsMonthly`, `maxUsers`) — "you used your quota"
 *   - 403 for tier-bound features (`consistencyCheck`, `approvalWorkflows`, etc.) — "your plan doesn't have this"
 *
 * Endpoint catch blocks stay identical across the 4 routes (Plans 04-08, 04-09, 04-10):
 *   if (err instanceof TierLimitExceededError) return NextResponse.json({...}, { status: err.statusCode });
 *
 * scripts/check-error-discipline.ts (Phase 3 gate) widens its scan to lib/stripe/**.ts(x) per
 * Task 3 of Plan 04-06 — no raw `throw new Error(...)` permitted in this directory.
 */

type TierFeature = keyof typeof TIER_LIMITS.starter;

export class TierLimitExceededError extends Error {
  public readonly code = 'TIER_LIMIT_EXCEEDED' as const;
  constructor(
    public readonly feature: TierFeature,
    public readonly limit: number,
    public readonly current: number,
    public readonly statusCode: 429 | 403,
    public readonly requiredTier?: PlanTier,
  ) {
    super(
      `Tier limit exceeded: feature=${feature} limit=${limit} current=${current}` +
        (requiredTier ? ` requiredTier=${requiredTier}` : ''),
    );
    this.name = 'TierLimitExceededError';
  }
}

export class StripeConfigError extends Error {
  public readonly code = 'STRIPE_CONFIG_ERROR' as const;

  constructor(public readonly envVar: string) {
    super(`Stripe configuration error: required env var ${envVar} is not configured`);
    this.name = 'StripeConfigError';
  }
}

export class StripeCatalogConfigError extends Error {
  public readonly code = 'STRIPE_CATALOG_CONFIG_ERROR' as const;

  constructor(message: string) {
    super(`Stripe catalog configuration error: ${message}`);
    this.name = 'StripeCatalogConfigError';
  }
}
