// lib/policies/types.ts — ADR-028 branded type for policies.id.
//
// PolicyIdSchema brands `string & uuid` into the nominal `PolicyId` type so a
// raw `string` (or a UUID-shaped string for a different entity — users.id,
// organizations.id, etc.) cannot be passed in PolicyId positions in
// repository / orchestrator signatures. tsc rejects the cross-assignment at
// compile time; scripts/check-policy-id-brand.ts pins the signature surface
// at CI so a future refactor that drops the brand fails fast.
//
// SLIPPERY-SLOPE POLICY (ADR-028 § Rationale): PolicyId is branded; UserId
// and OrgId are intentionally NOT branded yet. Brand coverage is
// opportunistic — future PRs touching User/Org-heavy code MAY brand those if
// friction warrants. Reasons:
//   - PolicyId is the primary cross-method-threaded entity ID with the
//     highest cross-confusion risk (threads through 7 transition
//     orchestrators + 5 repository methods + 7 Server Actions).
//   - UserId/OrgId mostly stay inside OrgContext / OrgScope, both of which
//     are constructed at one trust boundary (getOrgContext) and consumed via
//     a typed wrapper (withOrgScope) — well-contained.
//   - Branding every ID up-front for symmetry would add ~20 more signature
//     touches with marginal additional confusion-risk reduction.
//
// SCHEMA-INFERRED INSERT INPUTS are also intentionally out of brand scope.
// Drizzle's $inferInsert types (used by PolicyVersions.create input,
// PolicyAssignments.create input, etc.) infer policyId as `string` from the
// schema's `uuid('policy_id')` column type. Branding those would require
// hand-constructing the input type (no $inferInsert), losing the
// schema-as-source-of-truth invariant from ADR-003 (Drizzle ORM). The brand
// only covers EXPLICIT policyId parameter positions in method signatures
// where a future refactor could trivially mistype a different UUID. The FK
// + RLS catch any cross-org policyId at insert time regardless.
import { z } from 'zod';

/**
 * Zod schema for a branded PolicyId. `.parse(value)` validates that value is
 * a UUID string and brands it as `PolicyId`; throws `ZodError` on invalid
 * input. Use `policyIdFromString` (below) as the canonical lift helper.
 */
export const PolicyIdSchema = z.string().uuid().brand<'PolicyId'>();

/**
 * Branded nominal type for the policies.id UUID. Threaded through repository
 * and orchestrator signatures. Cannot be assigned from a raw `string` — must
 * go through `PolicyIdSchema.parse(...)` or `policyIdFromString(...)`.
 *
 * tests/types.ts (D-07) carries the `@ts-expect-error` line that fails tsc
 * if a future refactor stops the brand from rejecting raw-string assignment.
 */
export type PolicyId = z.infer<typeof PolicyIdSchema>;

/**
 * Validate + brand a raw string as `PolicyId`. Throws `ZodError` on invalid
 * (non-UUID) input. Use at trust boundaries (Server Actions accepting
 * FormData; route handlers reading URL params) to lift a raw `string` into
 * the branded type before passing into repository / orchestrator methods.
 *
 * Callers that already validated via `PolicyIdSchema.safeParse` can also use
 * the parsed value directly — `.safeParse().data` already carries the brand.
 */
export function policyIdFromString(value: string): PolicyId {
  return PolicyIdSchema.parse(value);
}
