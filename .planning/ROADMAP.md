# ROADMAP — PolicyPilot

8-phase ASSEMBLY sequence. **Order** locked by ADR-007 (BLUEPRINT.md §5); **gating** amended by ADR-029 (2026-05-21) — phase boundaries must remain green on `main`, but in-flight phases may run on parallel branches off a common `main` ancestor. True minimum `Depends on` chain per `/gsd-manager --analyze-deps` 2026-05-21 (see ADR-029 § Decision table). Each phase still ships with `tsc --noEmit` + `verify:phase-N` both exiting 0 on its squash commit on `main`. Goal-backward success criteria preserve observable user value at every phase boundary.

Granularity: **standard** (8 phases — matches the locked build sequence).

---

## Phases

- [x] **Phase 1: Foundation** — Next.js 15 + Clerk + Supabase wired up, `localhost:3000` loads clean. ✓ 2026-05-16 (operator-approved; VERIFICATION.md PASS)
- [x] **Phase 2: Data Layer** — Drizzle schema + RLS + Clerk webhooks; `org_id` invariant established. ✓ 2026-05-18 (operator-approved; `pnpm verify:phase-2` 7/7 OK; webhook live-smoke deferred to Phase 3)
- [x] **Phase 3: Admin UI** — Policy library, TipTap editor, full lifecycle (Draft → Published → Archived). ✓ 2026-05-20 (12 main plans 03-00..03-11 + 3 gap-closure plans 03-G1/G2/G3 = 15 total; 6/6 HUMAN-UAT PASS; verify:phase-2 8/8 OK; verify:phase-3 8 gates + 270/270 artifacts + 53/53 vitest)
- [ ] **Phase 4: AI Layer** — Draft generation, TL;DR summaries, Employee Q&A, Consistency Check (Growth+).
- [ ] **Phase 5: Employee Portal** — Assigned-policies dashboard + append-only acknowledgment flow.
- [ ] **Phase 6: Billing** — Stripe Checkout + 5-event webhook + tier gating via `TIER_LIMITS`.
- [ ] **Phase 7: Crons + Email** — Railway worker + Resend templates + idempotent reminders.
- [ ] **Phase 8: Validation** — Compliance dashboard + CSV export + all 8 acceptance criteria green.

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
**Plans**: TBD

### Phase 5: Employee Portal
**Goal**: An employee can sign in, see only their assigned + published policies, read them, ask Q&A questions, and one-click acknowledge — with every acknowledgment captured append-only with timestamp and IP. Policy updates correctly require re-acknowledgment.
**Depends on**: Phase 3 *(amended by ADR-029 2026-05-21; was Phase 4 — Phase 5 SC 1–5 do not consume Phase 4 AI surfaces per `/gsd-manager --analyze-deps`; eligible for Wave 1 parallel with Phase 4)*
**Requirements**: REQ-acknowledgment-tracking, REQ-acknowledgment-rules
**Anchoring decisions**: ADR-018 (append-only), ADR-008 (route group `(employee)`), ADR-009 (employee gate)
**Success Criteria** (what must be TRUE):
  1. Employee dashboard shows only policies assigned to them or to their department AND in `status = 'published'` — Draft and Under Review policies never appear.
  2. One-click "Acknowledge" inserts a row into `acknowledgments` with `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}` and the UI updates without page reload.
  3. Editing a policy and re-publishing it surfaces "requires re-acknowledgment" to all assigned employees; prior acknowledgment rows remain untouched in the DB.
  4. Bulk assignment to a department creates one `policy_assignments` row with `assigneeType = 'department'` and is visible to every member of that department.
  5. No code path exists to DELETE or UPDATE rows in `acknowledgments` — verified by code inspection.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Billing
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
**Plans**: TBD
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
**Plans**: TBD

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
| 4. AI Layer | 0/0 | Not started | - |
| 5. Employee Portal | 0/0 | Not started | - |
| 6. Billing | 0/0 | Not started | - |
| 7. Crons + Email | 0/0 | Not started | - |
| 8. Validation | 0/0 | Not started | - |
