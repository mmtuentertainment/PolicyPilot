---
phase: 06-billing
plan: 03
type: execute
wave: 1
depends_on: ["06-01"]
files_modified:
  - lib/stripe/products.ts
  - lib/stripe/products.test.ts
requirements: [REQ-tier-starter, REQ-tier-growth, REQ-tier-business]
autonomous: true

must_haves:
  truths:
    - "checkTierLimit(orgId, 'maxUsers') returns the real org-scoped user count, not 0 (D-27, SPEC R4, SC#4)."
    - "checkTierLimit preserves the { allowed, limit, current } shape for all tier features (SPEC R4)."
    - "A Starter org with 25 users returns allowed=false for maxUsers; Business returns unlimited drafts with limit=-1 (REQ acceptance)."
    - "The existing Phase 4 tier contract is unbroken: Starter consistencyCheck -> 403 { error:'tier_limit_exceeded', upgradeUrl:'/pricing' }; Growth allowed (D-29, D-30, SC#4)."
    - "maxUsers is a non-destructive predicate only — Phase 6 builds no invite/user-management flow and deletes no users (D-28, D-28a)."
    - "Tier gating stays in the application layer; middleware is never given billing authority (D-29, ADR-024)."
  artifacts:
    - path: "lib/stripe/products.ts"
      provides: "countOrgUsers() exported helper + maxUsers wired into checkTierLimit"
      contains: "countOrgUsers"
    - path: "lib/stripe/products.test.ts"
      provides: "maxUsers real-count cases + preserved Phase 4 tier-contract regression"
      contains: "maxUsers"
  key_links:
    - from: "lib/stripe/products.ts checkTierLimit"
      to: "self.countOrgUsers(orgId)"
      via: "maxUsers numeric branch calls the split-helper via the self namespace"
      pattern: "self\\.countOrgUsers"
    - from: "lib/stripe/products.ts countOrgUsers"
      to: "users table count WHERE org_id"
      via: "drizzle count scoped by eq(users.orgId, orgId)"
      pattern: "users\\.orgId"
---

<objective>
Turn `maxUsers` from a hardcoded `current = 0` into a real org-scoped user count, wired into the existing `checkTierLimit` orchestrator via the established WARNING-2 split-helper pattern — without breaking the Phase 4 tier-gate contract that AI endpoints depend on.

Purpose: SC#4 / SPEC R4 require checkTierLimit to return correct counts for both aiDraftsMonthly and maxUsers. The read path already gates drafts and consistencyCheck; this plan completes the maxUsers predicate. No new write surface — Phase 6 only makes the predicate correct (D-28).
Output: `countOrgUsers` helper + maxUsers branch in `lib/stripe/products.ts`, plus extended tests including a Phase 4 regression guard.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-billing/06-SPEC.md
@.planning/phases/06-billing/06-CONTEXT.md
@.planning/phases/06-billing/06-RESEARCH.md
@reference/TIER-LIMITS.md
@CLAUDE.md

<interfaces>
<!-- Existing lib/stripe/products.ts (DO NOT break) -->
export const TIER_LIMITS = { starter:{maxUsers:25,aiDraftsMonthly:50,...}, growth:{maxUsers:100,...}, business:{maxUsers:500,aiDraftsMonthly:-1,...} } as const;
export type PlanTier; export type TierFeature;
export async function readPlanTier(orgId: string): Promise<PlanTier>;          // WARNING-2 split-helper (vi.spyOn target)
export async function countDraftsThisMonth(orgId: string): Promise<number>;     // WARNING-2 split-helper (vi.spyOn target)
export async function checkTierLimit(orgId, feature): Promise<{ allowed; limit; current }>;
export async function requireTierLimit(orgId, feature): Promise<void>;          // throws TierLimitExceededError (429 usage / 403 tier-bound)
import * as self from './products';   // SPY CONTRACT: orchestrators MUST call helpers via self.fn(...)

<!-- WARNING-2 SPY CONTRACT: checkTierLimit calls helpers via the `self` namespace so vi.spyOn
     can intercept. countOrgUsers MUST be exported AND called via self.countOrgUsers(...). -->
<!-- products.ts is ALREADY allow-listed for raw @/lib/db (check-db-imports ALLOWLIST). users table is in @/lib/db/schema. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: countOrgUsers helper + maxUsers branch + tests (incl. Phase 4 regression)</name>
  <files>lib/stripe/products.ts, lib/stripe/products.test.ts</files>
  <behavior>
    - checkTierLimit(org, 'maxUsers') with a Starter org and 25 users -> { allowed:false, limit:25, current:25 } (REQ-tier-starter acceptance).
    - checkTierLimit(org, 'maxUsers') with a Growth org and 25 users -> { allowed:true, limit:100, current:25 }.
    - checkTierLimit(org, 'maxUsers') with a Business org and 25 users -> { allowed:true, limit:500, current:25 }.
    - countOrgUsers returns the count of users WHERE org_id = orgId (counts all active org members regardless of role — org-wide seat limit per 06-RESEARCH Open Question #2 / Assumption A5).
    - REGRESSION (must still pass): checkTierLimit(starter,'consistencyCheck') -> { allowed:false } and requireTierLimit throws TierLimitExceededError with statusCode 403 + requiredTier 'growth'.
    - REGRESSION: checkTierLimit(growth,'consistencyCheck') -> { allowed:true }.
    - REGRESSION: checkTierLimit(business,'aiDraftsMonthly') -> { allowed:true, limit:-1 } (unlimited short-circuit, no DB count).
    - REGRESSION: requireTierLimit(starter,'aiDraftsMonthly') at 50/50 throws with statusCode 429 (usage-bound).
  </behavior>
  <read_first>
    - lib/stripe/products.ts (FULL file — WARNING-2 SPY CONTRACT comment block; countDraftsThisMonth as the split-helper template; the `current = feature === 'aiDraftsMonthly' ? ... : 0` branch to extend)
    - lib/stripe/products.test.ts (vi.mock('@/lib/db'), vi.spyOn(productsMod, 'readPlanTier'/'countDraftsThisMonth') style)
    - 06-RESEARCH.md Pattern 6 (maxUsers Real Count) + Open Question #2 (count scope: all roles) + Pitfall 8 (DB import mocking)
    - lib/db/schema.ts (users table — orgId column)
  </read_first>
  <action>
    Extend `lib/stripe/products.test.ts` FIRST (RED) with the maxUsers cases and the Phase 4 regression cases above, using `vi.spyOn(productsMod, 'readPlanTier')` and a new `vi.spyOn(productsMod, 'countOrgUsers')` to drive counts deterministically (mirror the countDraftsThisMonth spy pattern). Then add an exported `countOrgUsers(orgId: string): Promise<number>` to `lib/stripe/products.ts` following the exact countDraftsThisMonth shape: `db.select({ c: sql<number>\`cast(count(*) as int)\` }).from(users).where(eq(users.orgId, orgId))`, returning `rows[0]?.c ?? 0`. Add the `users` import to the existing `@/lib/db/schema` import. In `checkTierLimit`, extend the numeric-branch `current` computation so `feature === 'maxUsers'` calls `await self.countOrgUsers(orgId)` (via the self namespace per the SPY CONTRACT — NEVER a bare call); keep `aiDraftsMonthly` and the unlimited/`-1` short-circuit untouched. Count ALL org users regardless of role (org-wide seat limit, 06-RESEARCH OQ#2); add a one-line code comment noting the operator-confirm point. Do NOT add any user-creation/invite/deletion surface (D-28, D-28a). Do NOT touch requireTierLimit's 429/403 routing — maxUsers stays usage-bound (429) per the existing USAGE_BOUND_FEATURES list. (D-27, D-28, D-28a, D-29, D-30, SPEC R4)
  </action>
  <verify>
    <automated>pnpm test -- --run lib/stripe/products.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm test -- --run lib/stripe/products.test.ts` passes all new maxUsers cases AND all preserved Phase 4 regression cases.
    - grep confirms `checkTierLimit` calls `self.countOrgUsers(` (self-namespace SPY CONTRACT), not a bare `countOrgUsers(`.
    - grep confirms `countOrgUsers` filters by `eq(users.orgId, orgId)` (org-scoped count).
    - No invite/user-management/user-deletion code added (grep: no `db.insert(users` / `db.delete(users` in products.ts).
    - `pnpm check:db-imports` still passes (products.ts already allow-listed; no new raw-db importer).
    - `pnpm typecheck` exits 0.
  </acceptance_criteria>
  <done>maxUsers returns the real org-scoped count; the Phase 4 tier-gate contract is preserved; tests green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| caller -> checkTierLimit(orgId) | orgId must come from server auth context (getOrgContext), never client input |
| products.ts -> users table (raw db) | RLS-bypassing read; org-scoped at the application layer via eq(users.orgId, orgId) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-6-13 | Elevation of Privilege | tier-gate bypass via client-trusted plan state | mitigate | checkTierLimit reads planTier from DB (readPlanTier); no client subscription state trusted (D-29, SPEC R4) |
| T-6-14 | Information Disclosure | cross-org user count leak | mitigate | countOrgUsers scoped by eq(users.orgId, orgId); orgId is server-derived only |
| T-6-15 | Tampering | regression breaks Phase 4 403/429 contract | mitigate | Regression test cases lock the existing consistencyCheck 403 + aiDraftsMonthly 429 behavior before refactor |
| T-6-16 | Elevation of Privilege | billing authority leaks into middleware | accept | Out of scope by design — ADR-024 keeps gating app-layer; this plan touches only lib/stripe/products.ts (D-29) |
</threat_model>

<verification>
- `pnpm test -- --run lib/stripe/products.test.ts` passes (maxUsers + Phase 4 regression).
- `pnpm typecheck` exits 0.
- `pnpm check:db-imports` passes.
</verification>

<success_criteria>
- maxUsers returns the real org-scoped count via the WARNING-2 split-helper.
- { allowed, limit, current } shape preserved for all features.
- Phase 4 tier contract (403 consistencyCheck / 429 drafts) unbroken.
- No new write/invite surface; gating stays app-layer.
</success_criteria>

<output>
Create `.planning/phases/06-billing/06-03-SUMMARY.md` when done.
</output>
