# Phase 5: Employee Portal — Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Employee-side surfaces for the policy library: `/my-policies` (assignment-aware list) + `/my-policies/[id]` (read + acknowledge) + `/my-policies/ask` (Q&A consuming Phase 4's endpoint). Repository bodies for `Acknowledgments.record` + `PolicyAssignments.create`. Admin-side thin "Assign to department" affordance on existing `/policies/[id]`. New CI gate enforcing acknowledgment-append-only invariant beyond the type-system layer. Two additive UNIQUE constraints (one combined migration) + one new table for citation-referral access tracking.

Phase 5 is the first phase that **consumes a Phase 4 surface** (R-6 Q&A surface — operator override Q-21=(c)). ADR-029's "Phase 5 SC 1–5 do not consume Phase 4 AI surfaces" parallelism rationale is moot post-Phase-4 ship (2026-05-22); the new R-6 dependency creates a Phase 5 → Phase 4 link that didn't exist when ADR-029 ratified. No new ADR — ADR-029 locked the DEPENDENCY GRAPH for parallelism gating; runtime-consumption of a now-shipped phase is orthogonal.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `05-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `05-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `app/(employee)/layout.tsx` — minimal auth gate
- `app/(employee)/my-policies/page.tsx` — real Server Component (replaces 03-G3 T9 stub)
- `app/(employee)/my-policies/[id]/page.tsx` — policy detail + Acknowledge button
- `app/(employee)/my-policies/[id]/actions.ts` — `acknowledgePolicyAction`
- `app/(employee)/my-policies/ask/page.tsx` — Q&A question form (R-6)
- `app/(employee)/my-policies/ask/actions.ts` — `askQuestionAction` (R-6)
- "Ask the AI" affordance on `/my-policies` header (R-6)
- Repository bodies: `Acknowledgments.record`, `PolicyAssignments.create`, `Policies.listAssignedAndPublishedForUser`
- `lib/policies/acknowledgment.ts` orchestrator (IP capture + version resolution)
- Thin admin "Assign to department" affordance on existing `/policies/[id]`
- `scripts/check-acknowledgment-immutability.ts` CI gate
- New verify chain entry `verify:phase-5`
- Re-acknowledgment indicator UI
- **NEW (T-2(4c)):** `lib/db/repositories/qa_citation_grants.ts` + new `qa_citation_grants` table + grant-issue step in `askQuestion` orchestrator + accessibility-aware `/my-policies/[id]` rendering

**Out of scope (from SPEC.md):**
- Email notifications (Phase 7)
- In-app notification bell (Phase 7)
- Individual-user assignment admin UI (deferred)
- Reviewer-role surface (Phase 6+)
- Acknowledgment rate reports + CSV export (Phase 8)
- Un-assign affordance (deferred)
- IPv6 normalization (record header verbatim)
- Bulk "acknowledge all" UX (single-policy only)

</spec_lock>

<decisions>
## Implementation Decisions

All 30 decisions below are LOCKED. 23 derived from operator's `/gsd-discuss-phase 5 --power` selections (Q-01..Q-23); 7 derived from the post-power ultrathink tightening pass (T-1..T-7). Decisions are grouped by topic for planner consumption.

### Dashboard Query (Q-01..Q-03, T-1)
- **D-01 (Q-01(a)):** Single SQL query with LEFT JOINs in `Policies.listAssignedAndPublishedForUser(s, userId)`. Joins: policies × policy_assignments (INNER on user-OR-dept-match) × policy_versions (INNER on current_version) × acknowledgments AS current_ack (LEFT on user+policy+current_version_pv.id) × acknowledgments AS prior_ack (LEFT on user+policy, distinct from current). Uses `SELECT DISTINCT` to deduplicate when a user is targeted both individually and via department for the same policy.
- **D-02 (Q-02(a)):** Department-less users (`users.departmentId IS NULL`) silently see only user-level assignments via standard SQL semantics — `assignee_id IN (NULL-returning subquery)` returns zero rows. No special-casing.
- **D-03 (Q-03(a)):** Department-id sub-select inline in the query: `assignee_id IN (SELECT department_id FROM users WHERE id = $userId AND org_id = $orgId)`. OrgContext stays minimal (no departmentId field added). One extra index lookup per query.
- **D-04 (T-1=C):** Return shape is `{ ...policy, ackState: 'none' | 'current' | 'stale', ackedAt: Date | null }`. SQL: `CASE WHEN current_ack.id IS NOT NULL THEN 'current' WHEN prior_ack.id IS NOT NULL THEN 'stale' ELSE 'none' END AS ack_state, current_ack.acknowledged_at AS acked_at`. Three legal states; UI uses exhaustive switch (TypeScript catches missing cases at compile time per PolicyStatusBadge precedent).
- **D-04a (mechanical):** Empty-state render — when `Policies.listAssignedAndPublishedForUser` returns 0 rows, `/my-policies` shows a Card with "No policies assigned yet — contact your administrator."

### Acknowledgment Server Action (Q-04..Q-08, T-7)
- **D-05 (Q-04(a)):** IP capture: `headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null`. Raw first hop, whitespace-trimmed only. No IPv6 normalization, no bracket-stripping. Document Vercel trust-boundary (Vercel strips client-supplied x-forwarded-for at edge; local dev returns null).
- **D-06 (Q-05(a)):** Schema UNIQUE on `acknowledgments(user_id, policy_id, policy_version_id)` + `INSERT ... ON CONFLICT DO NOTHING`. DB-enforced idempotency. UNIQUE does NOT include `org_id` (the UUIDs already imply org by FK).
- **D-07 (Q-06(a)):** Policy archived between page load + Acknowledge click → Server Action throws `PolicyArchivedError`. UI catches and shows "This policy was archived. Refresh to update your list." After refresh, policy disappears from `/my-policies` (archived ≠ assigned+published).
- **D-08 (Q-07(a)):** Policy unassigned between page load + click → throws `PolicyNotAssignedError`. UI: "You are no longer assigned this policy." Same recovery flow.
- **D-09 (Q-08(a)):** Server Action lives at `app/(employee)/my-policies/[id]/actions.ts` — co-located with detail page. Matches Phase 3 `app/(admin)/policies/[id]/actions.ts` precedent.
- **D-10 (T-7):** `ON CONFLICT DO NOTHING` returns empty `RETURNING` row when conflict fires — Server Action treats as silent success. UI shows "Acknowledged ✓" identically to a fresh ack. Server-side observability: `console.log('[ack] no-op (already acked)', { userId, policyId })` for ops monitoring of unusual rates.
- **D-10a (mechanical):** policyVersionId resolution race — orchestrator opens single `withOrgScope` transaction wrapping BOTH the `policies.current_version` read AND the `policy_versions` lookup AND the INSERT. Atomic; an `editPublished` landing mid-flight rolls back or commits as one unit. The schema UNIQUE constraint on `policy_versions(policy_id, version_number)` from 03-G3 T2/T3 makes the lookup deterministic.
- **D-10b (mechanical):** Server Action input validation — Zod schema `z.object({ policyId: PolicyIdSchema })`. The `PolicyIdSchema` brand from ADR-028 applies at the trust boundary; downstream orchestrator receives already-branded `PolicyId`.
- **D-10c (mechanical):** Server Action follows Phase 3 D-09 conventions — `redirect` / `revalidatePath` outside any try/catch block.

### Re-Acknowledgment UI (Q-09..Q-10)
- **D-11 (Q-09(a) + mechanical):** Re-ack badge uses Phase 3 PolicyStatusBadge override pattern — `<Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">Requires re-acknowledgment</Badge>` — NOT a new CVA variant in `components/ui/badge.tsx`. New component `components/policy/AckStatusBadge.tsx` mirroring PolicyStatusBadge structure. Three render branches matching D-04's `ackState`:
  - `'none'` → no badge, plain "Acknowledge" button
  - `'stale'` → amber badge "Requires re-acknowledgment" + "Re-acknowledge" button
  - `'current'` → green ✓ + "Acknowledged on {formatDate(ackedAt)}" timestamp text, no button
- **D-12 (Q-10(a)):** First-time-ack and re-ack visually distinct per D-11. Differentiates via D-04's `ackState` enum.

### Admin Bulk-Assignment UI (Q-11..Q-14, T-5)
- **D-13 (Q-11(a)):** Inline panel at bottom of `/policies/[id]`. Order on the page: PolicyView → PolicyTransitionMenu → new `PolicyAssignmentsPanel`. Panel contains read-only list of current assignments + dept selector + "Assign to department" button.
- **D-14 (Q-12(a)):** Empty-departments UX — disable the Assign button + tooltip "Create a department first" (no link target; admin-settings page doesn't exist yet). When `Departments.listAll(s)` returns 0 rows, the selector + button are both disabled.
- **D-15 (Q-13(a)):** DB UNIQUE on `policy_assignments(policy_id, assignee_type, assignee_id)` + `ON CONFLICT DO NOTHING`. UNIQUE does NOT include `org_id` (matches `policy_versions_policy_id_version_number_unique` precedent). Schema-enforced "exactly one row per (policy, assignee)".
- **D-16 (Q-14(a)):** Un-assign affordance OUT OF SCOPE for Phase 5. Read-only assignment list; admin cannot remove an assignment via UI. Workaround for misassign: edit-policy + re-publish forces re-ack on the new version (existing Phase 3 flow).
- **D-17 (T-5):** Empty-departments is a Phase 5 KNOWN LIMITATION. `Departments.create()` body + admin dept-create UI not in scope. Operator seeds the first department via DB out-of-band during dev. R4 acceptance test seeds via BYPASSRLS at TEST DB so test passes regardless. Phase 6+ admin user-management is the natural home for dept-create UI.

### Append-Only CI Gate (Q-15..Q-17)
- **D-18 (Q-15(a)):** `scripts/check-acknowledgment-immutability.ts` uses **ts-morph** AST traversal. Pattern mirrors `scripts/check-policy-id-brand.ts`: load Project via tsconfig, find import declarations of `acknowledgments` from `@/lib/db/schema`, resolve usages via Identifier nodes (handles aliased imports like `acknowledgments as ack`), walk parent CallExpressions, fail on any `.update(X)` or `.delete(X)` where X resolves to the acknowledgments schema symbol.
- **D-19 (Q-16(a)):** Gate scans `lib/**/*.ts` excluding `tests/fixtures/**` (the negative-control fixture must not trigger the production gate). Defense-in-depth on top of Phase 2's `check-db-imports.ts` raw-db allow-list.
- **D-20 (Q-17(a) + mechanical):** Negative-control fixture at `tests/fixtures/ack-mutation-attempt.ts` (file imports `acknowledgments` schema and calls `.update(acknowledgments).set({})` — a fixture, not a test). The gate has TWO modes: (a) default — scans `lib/**/*.ts`, exits 0 if no violations; (b) `--self-test` — scans only the fixture, exits 0 if EXACTLY 1+ violations found (reverse-interpreted). `verify:phase-5` runs both modes sequentially.

### Test Strategy & verify:phase-5 (Q-18..Q-20)
- **D-21 (Q-18(a)):** Co-located unit tests + scripts/ integration tests. Co-located unit `.test.ts` files (vitest): `lib/db/repositories/acknowledgments.test.ts`, `lib/db/repositories/policy_assignments.test.ts`, `lib/db/repositories/policies.test.ts` (extended), `lib/db/repositories/qa_citation_grants.test.ts` (new — T-2(4c)), `lib/policies/acknowledgment.test.ts`, `app/(employee)/my-policies/[id]/actions.test.ts`, `app/(employee)/my-policies/ask/actions.test.ts`. Integration script: `scripts/check-employee-portal.ts` covering R1+R3+R4+R6+cross-org isolation.
- **D-22 (Q-19(a)):** Integration test uses raw postgres-js + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)` + intentional ROLLBACK at end + final TRUNCATE for idempotency. Mirrors Phase 2 `scripts/check-rls.ts` + Phase 3 G3 `scripts/check-policies-list-filters.ts`.
- **D-23 (Q-20(a)):** `verify:phase-5 = pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal`. Chains forward, cumulative coverage from Phase 1–5. The co-located vitest `.test.ts` files run via the chained `pnpm test` inside `verify:phase-3`.
- **D-23a (mechanical):** R-6 Anthropic mocking for the integration test — mirror Phase 4 `scripts/check-ai-layer.test.ts` mocking pattern (`vi.mock('@/lib/ai/client')`). R-6 integration tests do NOT call live Anthropic.

### R-6 Q&A Surface (Q-21=(c), T-2, T-3)
- **D-24 (Q-21(c)):** Wire through Q&A. New `app/(employee)/my-policies/ask/page.tsx` (Server Component shell rendering a Client question-form component) + `app/(employee)/my-policies/ask/actions.ts` Server Action `askQuestionAction(prevState, formData)` using React 19's `useActionState` hook. New "Ask the AI" link/button in `/my-policies` header navigating to `/my-policies/ask`.
- **D-25 (T-3=A):** Extract Phase 4's inline Q&A logic into `lib/ai/qa.ts::askQuestion(ctx, question)` — pure function taking `OrgContext`, opening `withOrgScope` internally, returning `{ answer, citations }`. Refactor `app/api/ai/qa/route.ts` to a thin ~30-line HTTP wrapper around `askQuestion` (auth + Zod + askQuestion + error mapping). Server Action calls `askQuestion` directly (no HTTP). Phase 4 D-41 validIds defense + D-33c LONG_CACHE ordering + D-36 PII-safe logging + WARNING-4 raw-result audit-log all preserved as `askQuestion` invariants.
- **D-26 (T-2(4c)):** **Server-tracked Q&A→citation grants.** New `qa_citation_grants` table records {org_id, user_id, policy_id} for every citation returned by `askQuestion`. After Anthropic responds and `parseQaResponse` runs, the Server Action enumerates citations and UPSERTs grant rows (one per cited policy that the requesting user is NOT assigned to — assigned policies don't need a grant). Subsequent navigation to `/my-policies/[id]` checks: assigned? → full PolicyView; else has grant? → TL;DR-only view; else → 404. Grants are **non-expiring** for MVP (no expires_at column); pre-customer status accepts this simplicity. Phase 7+ cleanup cron can prune via separate ADR if data volume warrants.
- **D-27 (T-2(4c) — UI):** `/my-policies/[id]` page handler logic:
  ```
  if assigned-and-published(userId, policyId) → render full PolicyView
  else if has-grant(orgId, userId, policyId) AND status='published' → render TL;DR-only view
  else → notFound() // 404
  ```
  TL;DR-only view = render `policies.tldr_summary` only (ADR-005 cached at publish), with a banner "This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access." No Acknowledge button, no full content render.
- **D-27a (mechanical):** Citation accessibility flag — Server Action returns `citations: { title, id, accessibility: 'full' | 'tldr-only' }[]`. UI renders all citations as links; the link target `/my-policies/[id]` handles the access logic per D-27. The `accessibility` flag is for UI hint only (e.g., subtle italic for tldr-only) — security boundary is enforced server-side at the page handler.

### Schema Migrations (Q-22..Q-23, T-6, T-2(4c))
- **D-28 (T-6):** Single combined migration `drizzle/0010_phase5_uniques.sql` covers BOTH new UNIQUE constraints from Q-22 + Q-23 — matches Phase 4 `0007_ai_generations_audit_extensions.sql` bundle pattern. Header documents operator approval via Q-22(a) + Q-23(a). Additive (no DROP); pre-customer status per STATE.md.
- **D-29 (T-2(4c)):** Separate migration `drizzle/0011_qa_citation_grants.sql` introduces the new table:
  ```sql
  CREATE TABLE qa_citation_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id),
    policy_id uuid NOT NULL REFERENCES policies(id),
    granted_at timestamp DEFAULT now() NOT NULL,
    CONSTRAINT qa_citation_grants_org_user_policy_unique UNIQUE (org_id, user_id, policy_id)
  );
  CREATE INDEX qa_citation_grants_org_id_idx ON qa_citation_grants(org_id);
  CREATE INDEX qa_citation_grants_user_policy_idx ON qa_citation_grants(user_id, policy_id);
  ALTER TABLE qa_citation_grants ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "org_isolation" ON qa_citation_grants FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
  GRANT SELECT, INSERT, UPDATE, DELETE ON qa_citation_grants TO authenticated;
  ```
  Drizzle schema export in `lib/db/schema.ts` mirrors the structure. Repository `lib/db/repositories/qa_citation_grants.ts` exports `listForUser`, `upsert` (UPSERT-or-no-op via `ON CONFLICT (org_id, user_id, policy_id) DO NOTHING`), and `hasGrant` predicate.

### Error Classes (T-4)
- **D-30 (T-4):** New `lib/policies/errors.ts` defines policy-domain error hierarchy:
  ```ts
  export abstract class PolicyDomainError extends Error {
    abstract readonly code: PolicyDomainErrorCode;
  }
  export type PolicyDomainErrorCode = 'POLICY_NOT_FOUND' | 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED';
  export class PolicyNotFoundError extends PolicyDomainError { code = 'POLICY_NOT_FOUND' as const; ... }
  export class PolicyArchivedError extends PolicyDomainError { code = 'POLICY_ARCHIVED' as const; ... }
  export class PolicyNotAssignedError extends PolicyDomainError { code = 'POLICY_NOT_ASSIGNED' as const; ... }
  ```
  Mirrors ADR-026 `BootstrapError` hierarchy shape (abstract base + literal `code` field + explicit `this.name`). Widen `scripts/check-error-discipline.ts` to scan `lib/policies/**` (same pattern Phase 4 used to widen for `lib/stripe/`). Consumers narrow via `err instanceof PolicyDomainError` then `instanceof Class` for the specific code path.

### Claude's Discretion

The following are not explicit operator decisions; the planner has flexibility within the constraint set above:
- Exact SQL formatting + JOIN order in `Policies.listAssignedAndPublishedForUser` (D-01 + D-04)
- Component file structure under `components/employee/` vs `components/policy/` for new Phase-5-specific UI bits
- Tailwind class composition for the TL;DR-only banner in D-27
- Vitest mock factory shape for the R-6 integration test (mirror Phase 4 but exact stub shape is planner's call)
- Order of operations inside the `askQuestion` orchestrator after `parseQaResponse` (grant-INSERT before or after the citations-array return — either way both complete in the same withOrgScope tx)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 5 lock
- `.planning/phases/05-employee-portal/05-SPEC.md` — Locked requirements R-1..R-6, boundaries, acceptance criteria. **MUST READ BEFORE PLANNING.**
- `.planning/phases/05-employee-portal/05-DISCUSSION-LOG.md` — Per-question audit trail of operator selections + tightening rationale.

### Project lock
- `.planning/PROJECT.md` — All 29 locked ADRs including ADR-018 (append-only), ADR-019 (org_id in every WHERE), ADR-023 (per-aggregate repos), ADR-025 (`withOrgScope` + RLS), ADR-026 (typed errors in lib/auth/), ADR-027 (lookup-scoping), ADR-028 (PolicyId brand), ADR-029 (phase parallelization gating).
- `.planning/REQUIREMENTS.md` — REQ-acknowledgment-tracking + REQ-acknowledgment-rules (Phase 5 primary REQ); REQ-ai-policy-assistant (Phase 4 — relevant for R-6 reuse); REQ-access-control (Phase 3 — Phase 5 maintains employee-only-sees-assigned invariant except R-6 TL;DR fallback per D-27).
- `.planning/STATE.md` — Phase 4 SHIPPED status, locked decisions count (29), pre-paying-customer status (basis for ASK-FIRST approval of additive migrations).
- `.planning/ROADMAP.md` § Phase 5 Phase Details — Goal + Depends-on + Success Criteria 1–5 (R-6 is amendment via Q-21(c)).

### Frozen contracts (FOUNDRY-stage)
- `reference/SCHEMA.md` — Acknowledgments + PolicyAssignments + Policies + PolicyVersions table shapes. Phase 5 amends with two UNIQUE constraints (D-28) + new `qa_citation_grants` table (D-29).
- `reference/API-SPEC.md` — `POST /api/ai/qa` request/response contract. Phase 5 D-25 refactors the route to a thin wrapper around `lib/ai/qa.ts::askQuestion` — public contract unchanged.
- `reference/PROMPTS.md` § Q&A — system prompt template referenced by `askQuestion`. Unchanged in Phase 5.
- `reference/TIER-LIMITS.md` — Phase 5 doesn't introduce new tier gates; admin bulk-assign + employee Q&A are not tier-limited (Phase 4 D-46 unlimited-cost MVP).

### Phase 4 — primary source of Q&A reuse
- `.planning/phases/04-ai-layer/04-SPEC.md` — Phase 4 R4 Q&A contract (cite-only-from-published, validIds defense).
- `.planning/phases/04-ai-layer/04-CONTEXT.md` — D-41 (same-closure validIds), D-33c (LONG_CACHE ordering), D-36 (PII-safe log), D-46 (no tier limit), WARNING-4 (raw `ai_generations.result`).
- `app/api/ai/qa/route.ts` — Source of the inline logic to extract per D-25.
- `lib/ai/qa-extract.ts` + `lib/ai/qa-parser.ts` + `lib/ai/cache.ts` + `lib/ai/prompts.ts` + `lib/ai/client.ts` + `lib/ai/models.ts` + `lib/ai/extract.ts` + `lib/ai/schemas.ts` — Already-extracted helpers `askQuestion` re-assembles.

### Phase 3 — UI + patterns
- `components/policy/PolicyStatusBadge.tsx` — Precedent for `AckStatusBadge` per D-11 (exhaustive switch + className override on shadcn Badge, NOT a new CVA variant).
- `components/policy/PolicyView.tsx` — Reuse verbatim for assigned-policy detail page; reuse TL;DR portion for D-27 fallback view.
- `app/(admin)/policies/[id]/actions.ts` — Precedent for Server Action shape (Zod + redirect-outside-try/catch per Phase 3 D-09).
- `lib/policies/state-machine.ts` + `lib/policies/transitions.ts` — Phase 3 transition pattern. Phase 5's `acknowledgment.ts` orchestrator mirrors the withOrgScope-wrapped structure (no state-machine — ack writes don't change policy state).

### Phase 2 — repository + RLS patterns
- `lib/db/scoped.ts` + `lib/auth/context.ts` — `withOrgScope` + `OrgContext`. Every Phase 5 DB call MUST flow through `withOrgScope` (ADR-025).
- `lib/db/repositories/acknowledgments.ts` — Skeleton with throw-stub `record()` to fill per D-06+D-10+D-10a.
- `lib/db/repositories/policy_assignments.ts` — Skeleton with throw-stub `create()` to fill per D-15.
- `lib/db/repositories/policies.ts` — Phase 4 added `listPublishedForOrg`; Phase 5 adds `listAssignedAndPublishedForUser` per D-01..D-04.
- `lib/db/schema.ts` — Drizzle table exports. Phase 5 adds UNIQUE constraints (D-28) + new `qaCitationGrants` table (D-29).
- `tests/types.ts` D-07 — `@ts-expect-error` invariants enforcing ADR-018 append-only at compile time. Phase 5 MUST preserve these (R5 acceptance).

### Phase 2 — CI gate precedent
- `scripts/check-db-imports.ts` — Phase 5 D-19 layered defense; check-db-imports catches stray schema imports, check-acknowledgment-immutability catches writes inside allowed files.
- `scripts/check-rls.ts` — Pattern for the R-1/R-3/R-4/R-6 integration test in `scripts/check-employee-portal.ts` per D-22.
- `scripts/check-policies-list-filters.ts` — Closer precedent — exercises a specific repository method via real TEST DB.

### Phase 3 — error pattern + verify chain precedent
- `lib/auth/errors.ts` — ADR-026 typed-error hierarchy. Mirrored by D-30 for new `lib/policies/errors.ts`.
- `scripts/check-error-discipline.ts` — ts-morph gate to widen per D-30 (cover `lib/policies/**`).
- `scripts/check-policy-id-brand.ts` — ts-morph traversal pattern for D-18 (`scripts/check-acknowledgment-immutability.ts`).

### Phase 4 — verify chain precedent
- `package.json` — `verify:phase-4` chain composition. Phase 5 D-23 extends per the same pattern.
- `scripts/check-ai-layer.test.ts` — Anthropic mocking pattern for R-6 integration test (D-23a).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`withOrgScope` + `OrgContext`** (lib/db/scoped.ts, lib/auth/context.ts) — Every Phase 5 DB path. Repositories take `OrgScope` first (ADR-023); orchestrators open `withOrgScope(ctx, async (s) => {...})`.
- **`Policies.listPublishedForOrg(s)`** (Phase 4) — Used by `askQuestion` per D-25. Returns `{id, title, contentJson}` per org.
- **`PolicyView` Server Component** (Phase 3) — Reused verbatim for assigned `/my-policies/[id]`. TL;DR-only D-27 view renders `policies.tldr_summary` directly (no PolicyView).
- **`PolicyStatusBadge`** (Phase 3) — Pattern source for `AckStatusBadge` per D-11.
- **`PolicyId` brand** (Phase 3 ADR-028 + `lib/policies/types.ts`) — Threaded through both new Server Actions per ADR-028.
- **`parseQaResponse(rawText, validIds)`** (Phase 4 lib/ai/qa-parser.ts) — Reused by `askQuestion` extraction per D-25.
- **`AiGenerations.insert`** (Phase 4 lib/db/repositories/ai_generations.ts) — Reused by `askQuestion` for audit-log row.
- **`tests/types.ts` D-07** — Append-only invariants already enforced at compile time. Phase 5 D-18 ts-morph gate adds runtime defense beyond the type system.

### Established Patterns
- **OrgScope-first repository methods** (ADR-023). All new repository methods (`Policies.listAssignedAndPublishedForUser`, `QaCitationGrants.upsert`, etc.) follow.
- **withOrgScope-wrapped orchestrators** (ADR-025). Both new orchestrators (`acknowledgment.ts` + `askQuestion` in `lib/ai/qa.ts`) follow.
- **Typed errors with literal `code` discriminant** (ADR-026). D-30's new `lib/policies/errors.ts` mirrors `lib/auth/errors.ts` structure.
- **Server Action conventions** (Phase 3 D-09): Zod input validation, redirect/revalidatePath outside try/catch, no client-side state.
- **ts-morph CI gate** (Phase 2 D-08 / Phase 3 D-09 / Phase 4 patterns): scripts/check-*.ts files use ts-morph for type-aware AST traversal. D-18 follows.
- **Migration pairing** (Phase 4 D-29/D-34): hand-written RLS migration alongside Drizzle-generated DDL. D-28 follows for the UNIQUE adds; D-29 follows for the new qa_citation_grants table (RLS hand-written).
- **PolicyId brand at trust boundary** (ADR-028 / Phase 4 D-43): Zod schema in actions.ts files lifts string → PolicyId; downstream code accepts already-branded.
- **Phase 4 D-41 same-closure validIds defense**: when `askQuestion` is extracted (D-25), the validIds Set MUST be constructed inside the SAME withOrgScope closure that built libraryXml — non-negotiable cross-org-citation-leak defense (SP-1 from Phase 4).

### Integration Points
- **Acknowledge button → Server Action** (`acknowledgePolicyAction`) — Standard Phase 3 Server Action pattern with React 19 `useActionState` for inline state updates without page reload (R-2 acceptance).
- **Q&A form → Server Action** (`askQuestionAction`) — Same pattern; React 19 `useActionState` to render answer + citations inline after submission. Streaming not in scope (Phase 4 returns the full response at once; Phase 5 just renders it).
- **Bulk-assign Admin button → Server Action** (`bulkAssignToDepartmentAction`) — Admin-side, lives at `app/(admin)/policies/[id]/actions.ts` (extending Phase 3's file).
- **Citation link → `/my-policies/[id]`** — D-27 access-aware page handler enforces full / TL;DR-only / 404 branching.
- **`/my-policies` header → `/my-policies/ask`** — Plain `<Link>` from Next.js. No state propagation.

</code_context>

<specifics>
## Specific Ideas

- **`AckStatusBadge` component name** — operator-locked via D-11. Mirror `PolicyStatusBadge` file structure (Server Component, exhaustive switch).
- **TL;DR-only banner copy (D-27)** — "This policy was cited in your AI answer but isn't assigned to you. Summary only — contact your admin for full access." Exact wording locked.
- **Empty-state copy (D-04a)** — "No policies assigned yet — contact your administrator." Exact wording locked.
- **Migration ordering** — `0010_phase5_uniques.sql` BEFORE `0011_qa_citation_grants.sql` (numerical ordering in journal). Drizzle migrate applies in order.
- **Migration header documentation** — Both migrations document operator approval via the discuss-phase Q-NN selections + STATE.md pre-customer status (mirror the Phase 4 `0007_ai_generations_audit_extensions.sql` header pattern).
- **`POST /api/ai/qa` HTTP contract UNCHANGED** by D-25 refactor. Phase 4 API consumers (none today; Phase 5 employee Server Action uses internal call) see no observable change. D-25 is an internal-refactor only.

</specifics>

<deferred>
## Deferred Ideas

Items raised during discussion or surfaced by the codebase scout that explicitly belong in OTHER phases:

- **Email notifications for new assignment / re-ack required** → Phase 7 (REQ-notification-system; `policy_assigned` + `policy_updated` notification types via Resend + Railway cron).
- **In-app notification bell** → Phase 7 (REQ-notification-system; unread count from `notifications.read = false`).
- **Reviewer-role surface** (workflow_stages review queue UI) → Phase 6+ (Reviewer role is Growth+-tier-gated per REQ-tier-growth; tier gating ships in Phase 6).
- **Acknowledgment rate reports + CSV export + Recharts donut** → Phase 8 (REQ-compliance-dashboard).
- **Individual-user assignment admin UI** (`assigneeType='user'` from UI) → repository method already supports it via D-15; UI deferred (not in any current SPEC; bundled into Phase 6 admin user management or a polish PR).
- **`Departments.create()` body + admin dept-create UI** → Phase 6+ admin user/dept management. Phase 5 ships with operator-seeds-via-DB workaround per D-17.
- **Un-assign affordance + soft-delete** → Phase 6+ or polish PR (D-16 OUT OF SCOPE for Phase 5).
- **Q&A rate-limiting / tier gating** → Phase 6+ if `$50/org/mo` Sonnet cost trigger fires (Phase 4 D-46 watch criterion).
- **Q&A streaming response** → Future polish phase. R-6 returns full response at once per Phase 4 contract.
- **`qa_citation_grants` cleanup cron** → Phase 7+ if data-volume warrants (D-26 grants are non-expiring for MVP; volume scales with employee × Q&A submissions × unique-cited-policies — slow growth).
- **REQ-access-control narrow exception documentation** → D-27 adds an exception (TL;DR-only access via grant) that doesn't fit cleanly in REQ-access-control's "employees see only assigned" wording. If a Phase 5+ compliance audit raises this, treat as a SPEC R-6 footnote rather than a REQ amendment.
- **Phase 7+ webhook hardening** + **SF-CASCADE-AUDIT** (org-delete cascades to acknowledgments without audit-event emission) — STATE.md carry-forward; unchanged.

</deferred>

---

*Phase: 05-employee-portal*
*Context gathered: 2026-05-23*
