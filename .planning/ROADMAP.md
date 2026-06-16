# ROADMAP — PolicyPilot

8-phase ASSEMBLY sequence. **Order** locked by ADR-007 (BLUEPRINT.md §5); **gating** amended by ADR-029 (2026-05-21) — phase boundaries must remain green on `main`, but in-flight phases may run on parallel branches off a common `main` ancestor. True minimum `Depends on` chain per `/gsd-manager --analyze-deps` 2026-05-21 (see ADR-029 § Decision table). Each phase still ships with `tsc --noEmit` + `verify:phase-N` both exiting 0 on its squash commit on `main`. Goal-backward success criteria preserve observable user value at every phase boundary.

Granularity: **standard** (8 phases — matches the locked build sequence).

---

## Phases

- [x] **Phase 1: Foundation** — Next.js 15 + Clerk + Supabase wired up, `localhost:3000` loads clean. ✓ 2026-05-16 (operator-approved; VERIFICATION.md PASS)
- [x] **Phase 2: Data Layer** — Drizzle schema + RLS + Clerk webhooks; `org_id` invariant established. ✓ 2026-05-18 (operator-approved; `pnpm verify:phase-2` 7/7 OK; webhook live-smoke deferred to Phase 3)
- [x] **Phase 3: Admin UI** — Policy library, TipTap editor, full lifecycle (Draft → Published → Archived). ✓ 2026-05-20 (12 main plans 03-00..03-11 + 3 gap-closure plans 03-G1/G2/G3 = 15 total; 6/6 HUMAN-UAT PASS; verify:phase-2 8/8 OK; verify:phase-3 8 gates + 270/270 artifacts + 53/53 vitest)
- [x] **Phase 4: AI Layer** — Draft generation, TL;DR summaries, Employee Q&A, Consistency Check (Growth+). ✓ 2026-05-22
- [x] **Phase 5: Employee Portal** — Assigned-policies dashboard + append-only acknowledgment flow. Shipped via PR #27 at `3344847` on 2026-05-27T22:06:16Z.
- [x] **Phase 6: Billing** — Stripe Checkout + 5-event webhook + tier gating via `TIER_LIMITS`. Shipped via PR #32 at `243067e` on 2026-05-31T22:34:30Z.
- [x] **Phase 7: Crons + Email** — Railway worker + Resend templates + idempotent reminders. Shipped via PR #44 at `8b7019d` on 2026-06-14.
- [ ] **Phase 8: Validation** — Compliance dashboard + CSV export + all 8 acceptance criteria green. *(CSV-export slice / AC#5 EXECUTED on `gsd/phase-8-validation`, PR open + pending merge; compliance-dashboard/donut half + remaining-criteria evidence DEFERRED.)*

> Out-of-band shipped mitigation: **Phase 9 Reviewer / approval-workflow MVP** shipped via PR #42 at `1122da5` on 2026-06-05, closing R-017 without changing the locked 8-phase assembly order. Phase 7 **SHIPPED** (PR #44 at `8b7019d`, 2026-06-14); Phase 8 (CSV-first validation slice, AC#5) **EXECUTED** on `gsd/phase-8-validation` (PR open, pending merge) — the compliance-dashboard/donut half remains DEFERRED.

---

## Phase Details

### Phase 1: Foundation
**Goal**: A deployable Next.js 15 shell exists, with Clerk auth and Supabase wired, that compiles clean and serves the marketing landing page.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-product-vision
**Anchoring decisions**: ADR-001, ADR-008, ADR-009, ADR-010, ADR-012
**Success Criteria** (what must be TRUE):
  1. `tsc --noEmit` returns zero errors against a fresh `pnpm install` (per BLUEPRINT.md §5 Phase 1 verify).
  2. `localhost:3000` loads the marketing landing page without runtime errors.
  3. Clerk sign-in / sign-up flow renders and successfully completes against Clerk dev keys.
  4. Supabase client connects (a trivial `select 1` succeeds via Drizzle's connection).
  5. `middleware.ts` enforces public-route policy: `/`, `/pricing`, `/sign-in`, `/sign-up` reachable unauthenticated; everything else redirects to sign-in.
**Plans**: 5 plans
- [x] 01-01-PLAN.md - Scaffold Next.js 15 + pnpm deps + tsconfig hardening + shadcn/ui (Button, Card, Input) + .env.local.example DATABASE_URL patch ✓ (2026-05-15)
- [x] 01-02-PLAN.md - Operator manual: create Clerk dev app + Supabase dev project, populate .env.local
- [x] 01-03-PLAN.md - App shell: ClerkProvider root layout + marketing landing + pricing stub + Clerk sign-in/sign-up + sign-in-success placeholder ✓ (2026-05-16)
- [x] 01-04-PLAN.md - middleware.ts (ADR-009/D-10) + Drizzle skeleton (D-06/D-07) + scripts/check-db.ts ✓ (2026-05-16)
- [x] 01-05-PLAN.md - scripts/check-foundation.ts + pnpm verify:phase-1 + operator human-verify of Clerk flow
**UI hint**: yes

### Phase 2: Data Layer
**Goal**: The complete Drizzle schema exists in code, RLS is enforced in Postgres, Clerk webhooks populate `organizations` and `users`, and basic tenant-scoped CRUD works end-to-end.
**Depends on**: Phase 1
**Requirements**: REQ-user-roles, REQ-multi-tenancy
**Anchoring decisions**: ADR-003, ADR-004, ADR-011, ADR-019, ADR-018 (acknowledgments table shape locked here)
**Success Criteria** (what must be TRUE):
  1. All tables from `reference/SCHEMA.md` exist via Drizzle migration and `tsc --noEmit` is clean.
  2. RLS is enabled on every tenant-scoped table (`organizations`, `users`, `departments`, `policies`, `policy_versions`, `policy_assignments`, `acknowledgments`, `ai_generations`, `notifications`, `workflow_stages`) with the `org_isolation` policy applied.
  3. Clerk webhooks at `/api/webhooks/clerk` create `organizations` on `organization.created` and `users` on `user.created`; role propagates on `organizationMembership.created`.
  4. Every application-layer DB query in `lib/db/*` includes `org_id` in its WHERE clause — verified by code inspection / grep audit.
  5. A direct cross-org Postgres query (impersonating Org A's JWT) returning Org B rows is blocked by RLS — verified with a service-role-bypassed test.
**Plans**: 7 plans (6 originally planned + 02-07 hotfix)
- [x] 02-01-PLAN.md — Drizzle schema (12 tables, D-02 denormalization, D-03a nullable users.org_id, D-03b clerk_events) + OrgScope/getOrgContext (L-01, L-02, D-04, SF-M4 fold) + D-07 type tests ✓ (2026-05-17; commits 75b397e, e7c6b43, 2fff189)
- [x] 02-02-PLAN.md — Operator manual config: Clerk org roles (D-09) + session token customization (D-04) + webhook endpoint + signing secret (D-03) + Supabase test project (D-05) + .env.local amendments ✓ (2026-05-18; SF-DB-1 closed by operator pre-Plan-06)
- [x] 02-03-PLAN.md — Drizzle migrations (0000_initial generate + 0001_rls_policies hand-written 10×RLS + 10×POLICY + 10×GRANT + D-03a CHECK) + drizzle.config DIRECT_URL split + schema push to dev + test ✓ (2026-05-17; commits `c1dcf6f`, `0bbf321`, `f443cd0` + post-commit live dev DB verified after SF-DB-2 resolved; TEST DB migrated via Plan 02-06 orchestrator step 2)
- [x] 02-04-PLAN.md — 9 repository skeletons (OrgScope-first; ADR-018 no update/delete on acks; ADR-005 Policies.create omits tldrSummary; D-06) ✓ (2026-05-17; commits 2973555, e71000a — closes Plan 02-01 tsc baseline failure)
- [x] 02-05-PLAN.md — svix install + Clerk webhook handler (4 events, svix verify, ON CONFLICT idempotency, D-03c delete log-only) + middleware SF-M4 fold ✓ (2026-05-17; commits a9301b2, 6ae44f5, c39ea98 — SF-M4 from Phase 1 PR review fully closed)
- [x] 02-06-PLAN.md — ts-morph + L-05 check-db-imports (AST allow-list) + L-06 check-rls (cross-org + positive control) + D-08 check-schema (pg_catalog audit) + check-data-layer orchestrator + Pitfall 5 stale-null audit + verify:phase-2 wiring + operator human-verify ✓ 2026-05-18 (commits `e160728`, `c31d1c8`, `a156dc5`, `ff82746`, `9888cf5`; `pnpm verify:phase-2` exits 0 with 7/7 OK against live TEST DB; Task 6 operator-approved; webhook live-smoke deferred to Phase 3)
- [x] 02-07-PLAN.md — Code-review hotfix: CR-01 (webhook mirrors role into Clerk publicMetadata via `clerkClient.users.updateUserMetadata` — D-04 dual-write contract end-to-end) + HI-01 (middleware narrowing matches lib/auth/context.ts `{ role?: unknown }` + typeof guard) ✓ 2026-05-18 (commits `5bdcbf9`, `13a9a30`; `pnpm verify:phase-2` 7/7 OK; closes CR-01 + HI-01 from `02-REVIEW.md`)

### Phase 3: Admin UI
**Goal**: An admin can sign in, create a policy in the TipTap editor, walk it through Draft → Under Review → Published → Archived, and see every status transition reflected in the policy library list.
**Depends on**: Phase 2
**Requirements**: REQ-policy-library, REQ-policy-lifecycle, REQ-access-control
**Anchoring decisions**: ADR-008 (route group `(admin)`), ADR-009 (admin gate)
**Success Criteria** (what must be TRUE):
  1. Admin can create a new policy from the dashboard, populate it in TipTap, and save it as Draft.
  2. The Draft → Under Review → Published → Archived state machine is enforced — illegal transitions return a 4xx and the UI surfaces the rejection.
  3. Editing a published policy automatically creates a new `policy_versions` row AND resets `policies.status` to Draft.
  4. Admin policy library list shows all policies in all statuses for the admin's org; an `org_id` impersonation cannot view another org's list.
  5. Search by title, category, and content keyword returns the expected results scoped by `org_id`.
**Plans**: 15 plans (12 main 03-00..03-11 + 3 gap-closure 03-G1/G2/G3)
- [x] 03-00-PLAN.md — Operator manual config: rotate Clerk whsec_… (L-04) + change Clerk After-sign-in URL to /post-sign-in (L-03 dashboard half) + verify Organizations toggle
- [x] 03-01-PLAN.md — Wave 0: vitest install + verify:phase-3 orchestrator + scripts/check-admin-routes.ts scaffold + check-artifacts Phase 3 extension + .tmp/svix-url.json cleanup tail (L-06c)
- [x] 03-02-PLAN.md — middleware admin matcher rewrite (L-02 / CR-02) + lib/auth/require-admin.ts (L-01) + delete app/sign-in-success + ship /post-sign-in trampoline (L-03)
- [x] 03-03-PLAN.md — lib/policies/state-machine.ts (D-03 pure module) + 16-case truth-table tests (TDD RED→GREEN)
- [x] 03-04-PLAN.md — Repository bodies: Policies + PolicyVersions (L-05 append-only) + WorkflowStages (D-11) + tests/types.ts L-05 invariants
- [x] 03-05-PLAN.md — Phase 2 webhook hardening: L-06a (silent-loss fix on dispatch error) + L-06b (maskClerkOrgId helper applied at 4+ log sites)
- [x] 03-06-PLAN.md — lib/policies/transitions.ts: 7 server-only orchestrators wrapping withOrgScope (D-03 + D-04 + L-05) — TDD with publish + editPublished snapshot semantics
- [x] 03-07-PLAN.md — Server Actions: createPolicyAction (new/actions.ts) + 8 transition actions ([id]/actions.ts) — Zod validation + revalidatePath + redirect-outside-try/catch (D-09)
- [x] 03-08-PLAN.md — Dependency install: @tiptap/* 2.27.2 (4 pkgs) + zod ^3.23.5 + shadcn add table/sidebar/dropdown-menu/dialog/form/label/select/textarea/badge (D-02 + D-09 + D-13) — legitimacy gated
- [x] 03-09-PLAN.md — Admin shell: app/(admin)/layout.tsx (L-01 gate + SidebarProvider) + AdminSidebar (x-pathname active state) + AdminTopbar (children slot for Clerk widgets)
- [x] 03-10-PLAN.md — Policy components: PolicyEditor (Client, immediatelyRender:false) + PolicyView (Server, generateHTML) + PolicyStatusBadge + PolicyTransitionMenu (Client) + PolicyVersionHistory (Server)
- [x] 03-11-PLAN.md — Admin pages: /dashboard + /policies + /policies/new + /policies/[id] + /onboarding/create-org — webhook live-smoke checkpoint + ROADMAP SC walkthrough
- [x] 03-G1-PLAN.md — Gap closure: GAP-1 (BLOCKER) getOrgContext Clerk-text → internal UUID translation + scripts/check-auth-context.ts integration test + 9 one-off smoke recovery scripts deletion ✓ 2026-05-19 (commit `ea68a0e`)
- [x] 03-G2-PLAN.md — Gap closure: GAP-3 (MINOR) embedded Clerk fallback redirect env vars + reference/STACK.md docs + scripts/check-foundation.ts 7th check ✓ 2026-05-19 (commit `eae3f77`)
- [x] 03-G3-PLAN.md — Gap closure: DUP-VN (BLOCKER) restore() bumps currentVersion + schema UNIQUE(policy_id, version_number) + cleanup migration + check-schema audit; SF-W5 (HIGH) webhook race fix via clerk_events deletion on non-2xx return; MYPOL-STUB (MEDIUM) /my-policies Phase 5 stub ✓ 2026-05-20 (commits `2da89b4` T7, `437b77d` T1+T5, `cef7a88` T2+T3+T4, `6706b32` T6, `43670bb` T9; T8 SF-W5 vitest deferred to Phase 7+ test-coverage plan)
**UI hint**: yes

### Phase 4: AI Layer
**Goal**: The four Claude-powered AI surfaces (Draft, TL;DR, Q&A, Consistency Check) are live behind tier gating, with prompt caching on Q&A, every call logged to `ai_generations`, and Q&A citing only published policies from the requesting org.
**Depends on**: Phase 3
**Requirements**: REQ-ai-policy-assistant, REQ-ai-usage-rules
**Anchoring decisions**: ADR-005, ADR-006, ADR-015, ADR-021
**Success Criteria** (what must be TRUE):
  1. `POST /api/ai/draft` returns a complete Sonnet 4.6 draft, enforces `TIER_LIMITS.aiDraftsMonthly` (returns 429 with `tier_limit_exceeded` on overage), and writes one row to `ai_generations`.
  2. `POST /api/ai/summary` generates a Haiku 4.5 TL;DR exactly once per policy and stores it on `policies.tldrSummary` — subsequent calls return the cached value without a Claude call.
  3. `POST /api/ai/qa` answers ONLY from the requesting org's published policies, returns a non-empty `citations` array of real policy names, and appends the legal disclaimer when the question is legal-adjacent.
  4. The Q&A endpoint uses Anthropic prompt caching (`cache_control: { type: "ephemeral" }`) on the policy-library block — cache hit observable via Anthropic API response metadata.
  5. `POST /api/ai/consistency` is feature-gated to Growth+ (403 on Starter), submits to Claude Batch API, returns a `batchId`, and a poll endpoint returns the strict JSON array result.
**Plans**: 14 plans
- [x] 04-01-PLAN.md — Wave 0: SDK install + .env.local.example + scratch/probe.ts D-39 audit + PROMPTS.md/API-SPEC.md/SCHEMA.md amendments (D-01/10/27/29/31/35)
- [x] 04-02-PLAN.md — Wave 0: Drizzle schema + migrations 0005/0006/0007 + BLOCKING pnpm db:migrate:test gate (D-06/29/32/34/35)
- [x] 04-03-PLAN.md — Wave 0: 14 RED test stubs + tests/ai-mocks.ts shared fixtures helper (covers AC-23..AC-33 + SP-1..SP-4)
- [x] 04-04-PLAN.md — Wave 1: lib/ai foundation (client/models/cache/prompts/extract/schemas) — D-02/03/04/33/38/42; AC-28 + AC-33 GREEN
- [x] 04-05-PLAN.md — Wave 1: lib/ai Q&A helpers (qa-extract/qa-parser) + tests/types.ts D-43 citation-shape compile-time guard
- [x] 04-06-PLAN.md — Wave 1: lib/stripe/products.ts + errors.ts + check-error-discipline.ts widening (D-14/15/16)
- [x] 04-07-PLAN.md — Wave 1: repositories (ai_generations fill + policies extend + batch_jobs new) + lib/auth/errors.ts ForbiddenError + require-admin.ts D-45 amendment
- [x] 04-08-PLAN.md — Wave 2: lib/ai/summary.ts + POST /api/ai/draft + POST /api/ai/summary (SPEC R2/R3 + D-19/32/35/36/37)
- [x] 04-09-PLAN.md — Wave 2: POST /api/ai/qa (SPEC R4 + D-33c/40/41/46 — no tier check, same-closure validIds, LONG_CACHE ordering)
- [x] 04-10-PLAN.md — Wave 2: POST /api/ai/consistency + GET /api/ai/consistency/[batchId] + SDK→SPEC translator + check-rls.ts batch_jobs extension (SPEC R5 + AC-24/30 + D-34)
- [x] 04-11-PLAN.md — Wave 2: publish() post-commit summary hook (D-19) + scripts/check-ai-prompts.ts ts-morph anchor gate (D-26)
- [x] 04-12-PLAN.md — Wave 3: PolicyAiDraftDialog + PolicyRegenerateTldrButton + wire into PolicyEditor / PolicyView (D-22/28 + AC-23)
- [x] 04-13-PLAN.md — Wave 3: /dashboard/consistency page + ConsistencyCheckRunner + 4 admin components + AdminSidebar entry (D-20/21/23/30 + AC-25)
- [x] 04-14-PLAN.md — Wave 4: scripts/check-ai-layer.ts integration test + check-artifacts.ts Phase 4 scaffold + verify:phase-4 chain (D-24) + operator UAT checkpoint

### Phase 5: Employee Portal
**Status**: Shipped to `main` via PR #27 at commit `3344847` on 2026-05-27T22:06:16Z.
**Goal**: An employee can sign in, see only their assigned + published policies, read them, ask Q&A questions, and one-click acknowledge — with every acknowledgment captured append-only with timestamp and IP. Policy updates correctly require re-acknowledgment.
**Depends on**: Phase 3 *(amended by ADR-029 2026-05-21; was Phase 4 — Phase 5 SC 1–5 do not consume Phase 4 AI surfaces per `/gsd-manager --analyze-deps`; eligible for Wave 1 parallel with Phase 4. R-6 Q&A surface added 2026-05-23 via discuss-phase Q-21(c) operator override creates a runtime-consumption link to Phase 4 — orthogonal to ADR-029's dependency-graph parallelism gating, which Phase 4 SHIPPED 2026-05-22 moots anyway.)*
**Requirements**: REQ-acknowledgment-tracking, REQ-acknowledgment-rules
**Anchoring decisions**: ADR-018 (append-only), ADR-008 (route group `(employee)`), ADR-009 (employee gate), ADR-023 (per-aggregate repos), ADR-025 (withOrgScope + RLS), ADR-026 (typed errors), ADR-028 (PolicyId brand)
**Success Criteria** (what must be TRUE):
  1. Employee dashboard shows only policies assigned to them or to their department AND in `status = 'published'` — Draft and Under Review policies never appear.
  2. One-click "Acknowledge" inserts a row into `acknowledgments` with `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}` and the UI updates without page reload.
  3. Editing a policy and re-publishing it surfaces "requires re-acknowledgment" to all assigned employees; prior acknowledgment rows remain untouched in the DB.
  4. Bulk assignment to a department creates one `policy_assignments` row with `assigneeType = 'department'` and is visible to every member of that department.
  5. No code path exists to DELETE or UPDATE rows in `acknowledgments` — verified by code inspection (tests/types.ts D-07 compile-time + scripts/check-acknowledgment-immutability.ts ts-morph CI + DB GRANT-asymmetry-documented).
  6. (R-6 — operator amendment 2026-05-23) Employee Q&A surface at `/my-policies/ask` consumes Phase 4 `askQuestion` orchestrator, returns cited answers, with citation Links navigating to `/my-policies/[id]` with D-27 access-aware page handler (assigned → full PolicyView; cited-but-not-assigned → TL;DR-only with banner; else 404).
**Plans**: 10 plans, all complete
- [x] 05-01-schema-migrations-PLAN.md — Wave 1: lib/db/schema.ts + drizzle/0010_phase5_uniques.sql (D-28) + drizzle/0011_qa_citation_grants.sql (D-29 + RESEARCH gap-1 wrapped-RLS) + pnpm db:migrate + pnpm db:migrate:test (BLOCKING) + scripts/check-schema.ts Phase 5 column-shape assertions
- [x] 05-02-errors-PLAN.md — Wave 1: lib/policies/errors.ts PolicyDomainError hierarchy per D-30 (mirrors ADR-026 BootstrapError shape) — parallel with 05-01 ✓ 2026-05-24T01:30Z (commit `2456b75`; abstract base + PolicyDomainErrorCode literal union + 3 concrete subclasses with public readonly policyId + literal readonly code + explicit this.name; pre-emptively satisfies Plan 05-08 widened gate)
- [x] 05-03-repositories-PLAN.md — Wave 2: Acknowledgments.record + PolicyAssignments.create fills (D-06/10/15 ON CONFLICT DO NOTHING) + Policies.listAssignedAndPublishedForUser (D-01..D-04 LEFT JOIN + ackState enum) + NEW lib/db/repositories/qa_citation_grants.ts (D-29 listForUser/upsert/hasGrant) ✓ 2026-05-24T01:55Z (commits `e23a4a4` Task 1 + `b8de7f1` Task 2; 3 modified + 1 created; 18/18 acceptance criteria pass; tsc clean; runtime probe OK; ADR-018/019/023/028 all preserved; zero deviations)
- [x] 05-04-orchestrators-PLAN.md — Wave 2: lib/policies/acknowledgment.ts (D-10a atomic withOrgScope wrapping read+lookup+INSERT + D-07/D-08 typed errors) + lib/ai/qa.ts (D-25 extraction preserving D-41/D-33c/WARNING-4 + D-26 grant UPSERT per RESEARCH gap-3 + D-27a accessibility flag) + app/api/ai/qa/route.ts refactored to thin wrapper ✓ 2026-05-23T22:00Z (commits `da235a5` Task 1 + `623f21e` Task 2 + `8faf5e6` Task 3; 2 created + 4 modified files; route.ts 147→49 lines; H-4 EAPI Critical Path finding closed via reference/API-SPEC.md amendment; pnpm verify:phase-4 exits 0 — 393/393 artifacts + 21/21 vitest files + 1/1 integration test file; Plan 05-03 carry-forward citation-shape check now PASSES; 1 Rule-1 test adaptation per plan `<verification>` fallback: extended app/api/ai/qa/route.test.ts + scripts/check-ai-layer.test.ts with mocks for Policies.listAssignedAndPublishedForUser + QaCitationGrants.upsert; tsc clean; zero new packages; zero `any` types)
- [x] 05-05-employee-routes-PLAN.md — Wave 3: app/(employee)/layout.tsx + my-policies/page.tsx (replaces 03-G3 T9 stub; D-04a empty-state) + my-policies/[id]/page.tsx (D-27 3-branch access logic; D-27 banner) + acknowledgePolicyAction (D-05 IP capture + D-07/D-08 typed catch) + my-policies/ask/page.tsx + askQuestionAction + components/employee/AcknowledgeButton.tsx + AskQuestionForm.tsx (React 19 useActionState) ✓ 2026-05-24T02:17Z (commits `6883e84` Task 2 + `0f9b6af` Task 1 + `c4ddb01` Task 3; 7 created + 1 modified files; 8/8 acceptance criteria pass; tsc clean on every commit boundary; D-04a empty-state + D-27 banner copy verbatim with U+2014 em-dash; 3-branch access logic inside ONE withOrgScope closure for atomic RLS evaluation; React 19 useActionState formState-over-isPending pattern per RESEARCH Pitfall 5; Task 2 committed before Task 1 because Task 1's [id]/page.tsx imports AcknowledgeButton — preserves per-task atomicity intent while keeping every commit tsc-green per CLAUDE.md ALWAYS rule #1; zero deviations; zero new packages; zero `any` types)
- [x] 05-06-admin-bulk-assign-PLAN.md — Wave 3: app/(admin)/policies/[id]/actions.ts bulkAssignToDepartmentAction + page.tsx renders PolicyAssignmentsPanel at bottom (D-13) + new components/admin/PolicyAssignmentsPanel.tsx (D-14 empty-dept disabled + tooltip; D-16 no Un-assign) + lib/db/repositories/departments.ts listAll method ✓ 2026-05-24T02:32Z (commits `a13934c` Task 1 + `7270d93` Task 2; 2 created + 3 modified files; tsc clean on every commit boundary; D-13 panel at very bottom in `<div className="mt-8">` wrapper after edit-form/version-history grid — PolicyHeaderActions hosts PolicyTransitionMenu in header; D-14 disabled select + disabled button + native `title="Create a department first"` tooltip + fallback `<p>` copy; D-15 ON CONFLICT DO NOTHING idempotency via Plan 05-03 + migration 0010 UNIQUE; D-16 NO removal action/button (acceptance grep `Unassign|Un-assign|unassign` returns 0); D-17 dept-only R-4 scope; two-file RSC+Client split per plan recommendation and AcknowledgeButton precedent; plain `<button>` + buttonVariants() to dodge Base UI form `disabled` typing friction; bulkAssignToDepartmentAction does NOT call handleTransitionError (not a state-machine path); inline revalidatePath set `/policies/[id]` + `/my-policies`; all 7 Phase 3 transition actions preserved verbatim; zero deviations; zero new packages; zero `any` types)
- [x] 05-07-ack-status-badge-PLAN.md — Wave 3 *(hoisted to Wave 1 by planner since component has zero deps)*: components/policy/AckStatusBadge.tsx (D-11 className override on shadcn Badge — NOT new CVA variant; exhaustive switch on D-04 enum) ✓ 2026-05-24T01:39Z (commit `a685d69`; 58 lines; Server Component; three branches none→null, stale→amber outline Badge, current→green ✓ inline span; components/ui/badge.tsx UNCHANGED — D-11 invariant satisfied; all 11 acceptance criteria pass; tsc clean)
- [x] 05-08-ci-gates-PLAN.md — Wave 4: NEW scripts/check-acknowledgment-immutability.ts ts-morph gate (D-18) + NEW tests/fixtures/ack-mutation-attempt.ts negative-control (D-20) + check-rls.ts TENANT_TABLES extension (RESEARCH gap-2) + check-policy-id-brand.ts brand-targets extension (RESEARCH gap-4) + check-error-discipline.ts widening to lib/policies/** (D-30) + check-artifacts.ts Phase 5 block
- [x] 05-09-integration-test-PLAN.md — Wave 4: NEW scripts/check-employee-portal.test.ts (846 lines) integration test (D-22 raw postgres-js + D-23a vi.mock('@/lib/ai/client') Anthropic mock; 9 tests covering R-1 dashboard 4-row + D-02 dept-less + D-01 SELECT DISTINCT + R-3 re-ack lifecycle + R-4 bulk-dept 1-row-3-members-idempotent + R-6 grant UPSERT idempotent + H-5 hallucinated UUID stripped + H-6 foreign-org real UUID stripped + AC-10 SET LOCAL ROLE authenticated isolation) + scripts/check-employee-portal.vitest.config.ts dedicated node-env single-fork config + 7 co-located vitest unit test files per D-21 (4 repos + lib/policies/acknowledgment.test.ts + 2 employee Server Actions = 56 new tests + ADR-018 runtime undefined check) + package.json check:employee-portal entry + vitest.config.ts exclusion mirroring Phase 4 pattern ✓ 2026-05-24T03:27Z (commits `d3b2215` Task 1 + `5ab844d` Task 2; 11 files (9 created + 2 modified); 2 task commits; tsc clean on every commit boundary; **EAPI advisor H-5 + H-6 CLOSED AT RUNTIME** — pure-hallucinated UUID + foreign-org real UUID both stripped + zero grants asserted at TWO layers (API shape + raw COUNT) — runtime complement to Plan 05-04 structural grep checks proving Phase 4 D-41 same-closure validIds defense holds in extracted lib/ai/qa.ts at runtime; pnpm check:employee-portal exits 0 (9/9) against live TEST DB; pnpm verify:phase-4 exits 0 — no regression; 1 Rule-3 scope-fix deviation documented: AC-10 reframed from UUID-collision seed (impossible — departments.id PK violation) to distinct-UUID + RLS isolation test under SET LOCAL ROLE authenticated, AC-10 invariant still asserted end-to-end via positive control + 2 negative assertions; zero new packages; zero `any` types)
- [x] 05-10-verify-chain-uat-PLAN.md — Wave 5: ✓ 2026-05-24T06:30Z. Task 1 commit `8d27d8a` (chain wired verbatim per D-23; verify:phase-5 exits 0 in 92s end-to-end). Task 2 UAT walked through interactively via /chrome by operator — 18 PASS + 1 PASS-with-finding across the 19-step checklist. **2 latent bugs surfaced and fixed inline as fast-follows during UAT:** (a) `afb7693` Phase 3 fix — removed duplicate `PolicyVersions.create` in `lib/policies/transitions.ts:296` editPublished() (DUP-VN-2; publish() already writes the snapshot row so editPublished was 23505'ing the 03-G3 T2 UNIQUE constraint on every published-policy edit — admin re-publish entirely broken pre-fix, undetected since Plan 03-G3 fixed only the equivalent restore() path); (b) `6ac3e4e` Phase 4 fix — relaxed qa-parser CITATION_FENCE regex to whitespace-tolerant `\s*` (QA-PARSER-FENCE; Sonnet 4.6 emits `---CITATIONS---` no-space variant while parser strict-matched `--- CITATIONS ---` only, causing every real Q&A to leak the fence text to UI and silently drop citations — mocked integration tests pass because mocks use documented format). Final commit `f-final` records UAT + STATE close. Phase 5 ready for `/gsd-verify-work` + PR squash to main.
**UI hint**: yes

### Phase 6: Billing
**Status**: Shipped (2026-05-31) — spec + discuss + research + validate + plan complete; plans 06-01..06-06 are committed; `pnpm db:verify` and pre-merge `pnpm verify:phase-6` passed; live Stripe test-mode UAT rows 1-11 are PASS with masked-only evidence. PR #32 was squash-merged to `main` at `243067e9f259561a595230e5e7d3e97634040157` from prior PR head `1abca44dff89ccc7151d59b07fe1a93ce3d7be81`. Hosted pre-merge PR #32 checks were green/acceptable: `Phase 6 verifier` PASS, `Verify full gate` PASS, `Browser e2e smoke` PASS, `Live full verification` intentionally SKIPPED, CodeRabbit PASS/skipped, and `mergeStateStatus` CLEAN. Post-merge local `pnpm tsc --noEmit`, `pnpm run test -- --run lib/stripe`, and `pnpm run test -- --run app/api/webhooks/stripe` passed; post-merge `pnpm verify:phase-6` was skipped because the worktree lacks the approved ignored env. Operator-approved exceptions: Claude Code configured repository Actions secrets from `.env.local` via stdin without printing or committing values, and Claude Code restricted verify workflow push triggers to `main` while preserving `pull_request` and main coverage to avoid duplicate branch+PR CI. CI Phase 6 verification uses the approved dev/test Supabase target and mutates it through TRUNCATE/seed; it is not staging/prod. SF-WHSEC-1 remains an operator follow-up before any future live webhook smoke if the current `CLERK_WEBHOOK_SECRET` was used before rotation. Do not weaken gates, add dummy secrets, inspect/print secrets, use live Stripe mode, or start Phase 7 until Matthew explicitly authorizes next-phase planning.
**Goal**: A new sign-up can pick a plan, complete Stripe Checkout, see their org's `planTier` synced from the webhook, hit tier limits with a clear 403 + upgrade prompt, and have their subscription survive the first billing-cycle renewal automatically.
**Depends on**: Phase 4 *(amended by ADR-029 2026-05-21; was Phase 5 — `checkTierLimit` is the binding dependency per Phase 4 SC #1/#5, not the employee portal; eligible for Wave 2 parallel with Phase 7)*
**Requirements**: REQ-tier-starter, REQ-tier-growth, REQ-tier-business
**Anchoring decisions**: ADR-013, ADR-017, ADR-020
**Success Criteria** (what must be TRUE):
  1. All 6 Stripe products (Starter/Growth/Business × Monthly/Annual) exist in Stripe Dashboard with the price IDs from `reference/TIER-LIMITS.md` wired into env vars.
  2. `POST /api/webhooks/stripe` verifies signatures against the raw body, deduplicates against `stripe_events`, and correctly handles all 5 events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`.
  3. A full checkout → webhook → DB sync → tier-gate cycle works end-to-end without manual intervention: a Stripe test-mode subscription survives one simulated billing-cycle renewal (`invoice.paid`) and `organizations.planTier` remains correct (REQUIREMENTS.md §10 #6).
  4. `checkTierLimit(orgId, feature)` returns the correct `{allowed, limit, current}` shape; a Starter org attempting a Growth-only feature (e.g. `consistencyCheck`) receives a 403 with `{ error: 'tier_limit_exceeded', upgradeUrl: '/pricing' }`.
  5. Customer Portal link from the admin settings page allows the org admin to update payment method and view invoices via Stripe-hosted UI.
**Plans**: 6 plans (planned 2026-05-29; all implemented and committed by 2026-05-30; local verifier green before merge; UAT 11/11 PASS; shipped via PR #32 at `243067e`)

- Wave 0 (foundation — operator-gated):
  - [x] 06-01-foundation-catalog-migration-PLAN.md — Stripe SDK install + 9 env vars + 6 Stripe products (operator) · closed price catalog · client singleton · mask helpers · additive `0012` migration applied to TEST DB (BLOCKING `db:migrate:test`)
- Wave 1 (parallel):
  - [x] 06-02-stripe-webhook-PLAN.md — `POST /api/webhooks/stripe`: raw-body signature verify · 5-event dispatch · canonical Subscription re-fetch · transaction-scoped `stripe_events` idempotency · fail-closed org mapping
  - [x] 06-03-tier-gates-maxusers-PLAN.md — `maxUsers` real org-scoped count in `checkTierLimit` + Phase 4 403/429 tier-contract regression guard
- Wave 2:
  - [x] 06-04-checkout-pricing-PLAN.md — admin-only `createCheckoutSessionAction` (server-derived org/price/metadata · dup-subscription guard · success/cancel URLs) + pricing-page monthly/annual intent; `b92a15f` fixed the first-checkout guard for new orgs seeded as `trialing` without a real `stripeCustomerId`
- Wave 3:
  - [x] 06-05-admin-settings-portal-PLAN.md — `/settings` billing page + Customer Portal action (DB `stripeCustomerId` only) + sidebar/middleware wiring
- Wave 4:
  - [x] 06-06-verify-chain-ci-uat-PLAN.md — cumulative `verify:phase-6` + schema/artifact verifier extensions + hosted CI + secret-safe Stripe test-mode UAT checklist; local verifier was green before merge, UAT rows 1-11 PASS with masked-only evidence, and hosted pre-merge PR #32 checks were green/acceptable at `1abca44`. PR #32 shipped Phase 6 at squash commit `243067e`. Repository Actions secrets were set by operator-authorized Claude Code action from `.env.local` via stdin without printing or committing values; this is a one-off exception. Verify workflow push triggers are restricted to `main`, while `pull_request` and main coverage remain active, to avoid duplicate branch+PR CI against the shared dev/test verifier DB.
**UI hint**: yes

### Phase 7: Crons + Email
**Goal**: Reminders and notifications go out automatically: the Railway cron worker runs daily, the Resend + React Email templates send for all 4 notification types, no duplicates fire on retry, and the in-app bell surfaces unread items.
**Depends on**: Phase 5 *(amended by ADR-029 2026-05-21; was Phase 6 — `ack_reminder` cron requires the Phase 5 acknowledgment flow, not billing; eligible for Wave 2 parallel with Phase 6)*
**Requirements**: REQ-notification-system
**Anchoring decisions**: ADR-014, ADR-016
**Success Criteria** (what must be TRUE):
  1. `GET /api/cron/reminders` is reachable only with `Authorization: Bearer {CRON_SECRET}`; unauthorized calls return 401.
  2. The Railway worker triggers the cron endpoint daily at 08:00 UTC; one successful run is observable in Railway logs.
  3. All 4 notification types (`policy_assigned`, `policy_updated`, `review_due`, `ack_reminder`) send via Resend using React Email templates and insert a corresponding `notifications` row.
  4. Re-running the same cron window does not send duplicate emails for the same `(user, policy, type)` tuple — idempotency verified.
  5. The in-app notification bell shows the correct unread count from `notifications.read = false` and marking-as-read updates immediately.
**Plans**: 7 plans
- [ ] 07-01-PLAN.md — Wave 0: RED test scaffolding (TEST-DB integration harness + cron auth + email dispatch unit tests)
- [ ] 07-02-PLAN.md — Wave 0: ASK-FIRST resend/react-email install + additive 0014 reminder_sends migration (operator-signed header) + schema export + dev/TEST apply
- [ ] 07-03-PLAN.md — Wave 1: lib/email layer (Resend singleton, typed errors, base layout + 4 templates, typed dispatch)
- [ ] 07-04-PLAN.md — Wave 1: Notifications.create/markRead (bell backend) + org-wide ack/review queries + next_review_date writer + cron FK audit
- [ ] 07-05-PLAN.md — Wave 2: GET /api/cron/reminders — auth gate + per-org withOrgScope loop + record-then-send idempotency
- [ ] 07-06-PLAN.md — Wave 2: policy_assigned/policy_updated event emission + dependency-free Railway worker + railway.json
- [ ] 07-07-PLAN.md — Wave 3: T8 Clerk 409/catch vitest + schema/artifact gate extensions + cumulative verify:phase-7 + CI job
**Waves**: W0 (07-01 ‖ 07-02) → W1 (07-03 ‖ 07-04) → W2 (07-05 ‖ 07-06) → W3 (07-07). W1 blocked on W0 (tests + 0014 migration + packages); W2 blocked on the lib/email layer + repo fills; W3 blocked on all prior.
**Cross-cutting constraints** (every plan): `org_id` in every query via `withOrgScope`/RLS (raw `db` only in the cron route per the ADR-023 allow-list); `tsc --noEmit` clean, no `any`; secrets (`CRON_SECRET`/`RESEND_API_KEY`) never echoed/committed; migration `0014_reminder_sends` additive/forward-only, dev/TEST apply only via `pnpm db:migrate` (ASK-FIRST operator-signed header); `resend@6.12.3` + `react-email@6.1.5` install is ASK-FIRST (verified ≥14-day-old); every plan carries a `<threat_model>` (block-on high).
**UI hint**: yes (bell UI surface deferred to /gsd-ui-phase 7)

### Phase 8: Validation
**Goal**: All 8 numbered acceptance criteria from REQUIREMENTS.md §10 pass with real data on a populated org, the admin compliance dashboard renders the Recharts donut + CSV export, and the product is demonstrably faster and more reliable than a Google Drive folder.
**Depends on**: Phase 6 AND Phase 7 *(amended by ADR-029 2026-05-21; was "Phase 7" alone — under the new DAG Phase 7 → Phase 5 no longer transitively covers Phase 6, but Phase 8 SC #4 requires the Phase 6 Stripe renewal test; both Wave 2 outputs are required for Phase 8 to start)*
**Requirements**: REQ-compliance-dashboard, REQ-integrations, REQ-acceptance-criteria
**Anchoring decisions**: All — final integration gate
**Success Criteria** (what must be TRUE):
  1. Admin compliance dashboard renders the Recharts donut (acknowledged vs pending) and `/api/reports/acknowledgments?format=csv` downloads a valid CSV with the expected columns.
  2. All 8 numbered acceptance criteria from REQUIREMENTS.md §10 are verified end-to-end against a populated org with at least 10 employees and 5 policies — captured as a checklist with evidence (screenshots or test output) per criterion.
  3. Multi-tenancy boundary test: provision Org A and Org B with overlapping titles; verify under all admin and employee surfaces that Org A cannot view, search for, or acknowledge Org B's policies (criterion 8).
  4. Stripe subscription created in Phase 6 has now ridden through one real billing-cycle renewal in test mode and is in `status = 'active'` post-renewal (criterion 6).
  5. Beat-manual benchmark: a same-day side-by-side test (same admin, same 3 policies, same 10 employees) shows PolicyPilot delivers faster ack collection and more reliable audit trail than a Google Drive folder — recorded as a short comparison note.
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 5/5 | Complete | 2026-05-16 |
| 2. Data Layer | 7/7 | Complete | 2026-05-18 |
| 3. Admin UI | 15/15 | Complete | 2026-05-20 |
| 4. AI Layer | 14/14 | Complete | 2026-05-22 |
| 5. Employee Portal | 10/10 | Complete - shipped via PR #27 at `3344847` | 2026-05-27 |
| 6. Billing | 6/6 | Complete - shipped via PR #32 at `243067e`; live Stripe test-mode UAT 11/11 rows PASS; hosted pre-merge PR #32 checks green/acceptable at `1abca44`; post-merge targeted checks PASS | 2026-05-31 |
| 7. Crons + Email | 8/8 | Complete - shipped via PR #44 at `8b7019d` | 2026-06-14 |
| 8. Validation | 1/1 | Executed (CSV slice, AC#5) - PR open on `gsd/phase-8-validation`; dashboard/donut + remaining criteria DEFERRED | 2026-06-15 |
