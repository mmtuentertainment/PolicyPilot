# REQUIREMENTS — PolicyPilot

Authoritative merged requirements list for the GSD workflow. Extracted from FOUNDRY's `REQUIREMENTS.md` (PRD, precedence 3) and reconciled with `BLUEPRINT.md` (ADR), `reference/STACK.md` (ADR), and `reference/SCHEMA.md` / `API-SPEC.md` / `PROMPTS.md` / `TIER-LIMITS.md` (SPEC). Per-source detail with provenance lives in `.planning/intel/requirements.md`.

Every v1 requirement maps to exactly one ASSEMBLY phase. The traceability table at the bottom is the single source of truth for that mapping. Downstream `/gsd:plan-phase` consumes both the requirement bodies and the traceability table.

---

## REQ-product-vision

**Scope:** Product vision / positioning.
**Phase:** 1 — Foundation

PolicyPilot is a clean, AI-powered web application for companies with 25–300 employees to create, organize, distribute, and track company policies. It replaces Google Drive folders and SharePoint with a purpose-built tool: AI assistance, acknowledgment tracking, and compliance-ready audit trails at a price SMBs can afford. The primary differentiator is a Claude-powered AI layer no SMB-priced competitor offers.

**Acceptance:**
- Target buyer is HR Manager / Office Manager / Compliance Officer / COO at a 25–300-employee company.
- Pricing positioned below enterprise tools.
- AI features present at MVP — not a roadmap promise.

---

## REQ-user-roles

**Scope:** User role model.
**Phase:** 2 — Data Layer

Three roles: **Admin** (creates/edits/publishes/archives policies, manages workflows + accounts, views dashboard, sets review schedules), **Employee** (views and acknowledges assigned policies, asks AI questions, receives reminders), **Reviewer** (Growth+ only — approves drafts, comments, moves policies through workflow stages).

**Acceptance:**
- Role determines visible UI surfaces.
- Reviewer role is feature-gated to Growth tier and above.
- An employee belongs to exactly one organization.

---

## REQ-multi-tenancy

**Scope:** Tenancy invariant.
**Phase:** 2 — Data Layer

Every paying customer is a Clerk Organization. All data scoped by `org_id` at the DB layer. Supabase RLS enforces tenant isolation. Admins see only their organization's data. Employees belong to exactly one organization.

**Acceptance:**
- Org A cannot see Org B policies or users under any code path.
- RLS enabled on every tenant-scoped table.
- `org_id` present in every application-layer query (see ADR-019).
- One employee = one organization membership at a time.

---

## REQ-policy-library

**Scope:** Core feature — policy library (Starter baseline).
**Phase:** 3 — Admin UI

Rich text editor (TipTap) for policy creation. Categories (HR, Safety, IT, Finance, etc.). Every edit creates a versioned record with timestamp + author (full version history). Audit trail captures viewed / acknowledged / edited events. Status states: Draft | Under Review | Published | Archived. Search by title, category, or content keyword.

**Acceptance:**
- TipTap is the editor (per stack).
- Every edit creates a `policy_versions` row.
- Four status states are exhaustive — no others.
- Search supports title, category, content keyword.
- Audit trail is queryable per policy and per user.

---

## REQ-policy-lifecycle

**Scope:** Business rule — policy lifecycle.
**Phase:** 3 — Admin UI

Cannot publish without passing through Draft first. On Growth+, cannot publish without approval workflow completing. Editing a published policy creates a new version and resets to Draft. Archiving removes from employee view but preserves audit trail. Acknowledgments are version-specific — updating a policy invalidates prior acknowledgments (re-acknowledgment required).

**Acceptance:**
- Status state machine: Draft → Under Review → Published → Archived. No skipping forward past Draft.
- Growth+ orgs cannot bypass approval workflow to publish.
- New `policy_versions` row on every edit; `policies.status` resets to Draft.
- Archived policies still appear in audit reports.
- After re-publish, employees see "requires re-acknowledgment" against new `policy_version_id`.

---

## REQ-access-control

**Scope:** Business rule — visibility.
**Phase:** 3 — Admin UI (admin surface) — also enforced cross-surface in Phase 5

Employees see only policies assigned to them or their department. Employees cannot see Draft or Under Review policies. Admins see all policies in all statuses. Reviewers (and admins) see the organization's pending review queue — a shared queue in the MVP (see Acceptance).

**Acceptance:**
- Employee policy queries filter to `status = 'published'` AND assignment match.
- Admin policy queries unfiltered by status (always scoped by `org_id`).
- Reviewer surface (MVP, D-09-01 2026-06-05) lists `workflow_stages` rows where `org_id` = the caller's org AND `status = 'pending'` (policy `under_review`) — a **shared org-scoped review queue** (`WorkflowStages.listPendingForOrg`), actionable by any reviewer or admin. Per-reviewer `reviewer_id = self` filtering is **deferred to backlog rank-18** (the MVP ships no reviewer-assignment UI, so `workflow_stages.reviewer_id` is unpopulated and a self-filter would dark the queue). Tenant isolation holds — `org_id` is bound on both `workflow_stages` and `policies` + RLS, so no cross-org read — and the actual approver is recorded in the immutable `review_decisions` ledger via `reviewer_id`. The retained dead `listPendingForReviewer(s, ctx.userId)` seam is the rank-18 implementation hook.

---

## REQ-ai-policy-assistant

**Scope:** Core feature — Claude-powered AI features.
**Phase:** 4 — AI Layer

Four AI surfaces powered by Claude:
- **Draft Generation** (Sonnet 4.6): admin prompt → complete draft. 50 drafts/mo on Starter.
- **Employee Q&A** (Sonnet 4.6): NL question → answer from published library only, cites source policy, legal-adjacent disclaimer when needed.
- **TL;DR Summaries** (Haiku 4.5): auto-generated at publish time; stored in DB; not regenerated per view.
- **Consistency Check** (Growth+, Sonnet 4.6 via Batch API): on-demand scan of entire library for contradictions.

**Acceptance:**
- Draft Generation respects `TIER_LIMITS.aiDraftsMonthly`.
- Q&A NEVER answers from anything except published policies for the requesting org.
- Q&A response always includes citations to source policy names.
- Legal disclaimer appended to legal-adjacent Q&A.
- TL;DR created once at publish, stored on policy row.
- Consistency Check feature-gated to Growth+ and uses Batch API.
- Every AI call logged to `ai_generations`.

---

## REQ-ai-usage-rules

**Scope:** Business rule — AI safety.
**Phase:** 4 — AI Layer

Tier limits enforced before every Claude API call. Employee Q&A answers from published policies ONLY. AI responses must cite source policy. Legal disclaimer required on any legal-adjacent question. All AI calls logged to `ai_generations`.

**Acceptance:**
- 429 with `tier_limit_exceeded` when `aiDraftsMonthly` exceeded.
- Q&A prompt constrained to org's published policy library only.
- Q&A response includes non-empty `citations` array referencing real policies.
- Every Claude call writes one row to `ai_generations` with `type` in `{draft, summary, qa, consistency}`.

---

## REQ-acknowledgment-tracking

**Scope:** Core feature — acknowledgment tracking.
**Phase:** 5 — Employee Portal

Admin assigns policies to users or departments. Employees see "Policies requiring acknowledgment" dashboard. One-click acknowledge with timestamp stored to audit trail. Bulk assignment to entire department. Acknowledgment rate visible per policy, department, and employee.

**Acceptance:**
- Assignment supports `user` and `department` assignee types.
- An acknowledgment records `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}`.
- Acknowledgment is one-click from the employee policy detail view.
- Acknowledgment rate computable per policy, per department, per employee.
- Acknowledgments are append-only.

---

## REQ-acknowledgment-rules

**Scope:** Business rule — acknowledgment integrity.
**Phase:** 5 — Employee Portal

Acknowledgment shape: `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}`. Acknowledgments are NEVER deleted. On policy update, existing acknowledgments remain in history but the policy is flagged "requires re-acknowledgment".

**Acceptance:**
- Acknowledgment table append-only (ADR-018).
- `ip_address` captured at acknowledge time.
- Policy update does not mutate or remove prior acknowledgment rows.

---

## REQ-tier-starter

**Scope:** Pricing tier — Starter ($79/mo, 25 users).
**Phase:** 6 — Billing

Includes all §3 features: policy library, AI assistant (draft + Q&A + TL;DR), acknowledgment tracking, compliance dashboard, notifications. Excludes: approval workflows, Slack, consistency check, custom branding, SSO, API access.

**Acceptance:**
- `TIER_LIMITS.starter.maxUsers === 25`.
- `TIER_LIMITS.starter.aiDraftsMonthly === 50`.
- All non-Starter feature flags `false`.

---

## REQ-tier-growth

**Scope:** Pricing tier — Growth ($199/mo, 100 users).
**Phase:** 6 — Billing

All Starter features plus: multi-stage approval workflows, Slack integration (policy update notifications), AI Consistency Check, advanced reporting, custom policy categories.

**Acceptance:**
- `TIER_LIMITS.growth.maxUsers === 100`.
- `TIER_LIMITS.growth.aiDraftsMonthly === 200`.
- `approvalWorkflows`, `slackIntegration`, `consistencyCheck` all `true`.
- Custom branding, SSO, API access remain `false`.

---

## REQ-tier-business

**Scope:** Pricing tier — Business ($449/mo, 500 users).
**Phase:** 6 — Billing

All Growth features plus: custom branding (logo, colors on employee portal), SSO via Clerk SAML, API access (outbound webhooks for policy events), priority support SLA.

**Acceptance:**
- `TIER_LIMITS.business.maxUsers === 500`.
- `TIER_LIMITS.business.aiDraftsMonthly === -1` (unlimited).
- All feature flags `true`.
- SSO delivered via Clerk SAML, not custom IdP.

---

## REQ-notification-system

**Scope:** Core feature — notifications.
**Phase:** 7 — Crons + Email

Email notifications fire on: new policy assigned, policy updated, review reminder. In-app notification bell surfaces unread items. Email backend is Resend + React Email.

**Acceptance:**
- Email types: `policy_assigned`, `policy_updated`, `review_due`, `ack_reminder` (matches `notifications.type` enum).
- Notification bell shows unread count from `notifications.read = false`.
- Reminder emails sent by Railway cron worker.
- No duplicate sends on retries (idempotent).

---

## REQ-compliance-dashboard

**Scope:** Core feature — admin compliance dashboard.
**Phase:** 8 — Validation

Admin compliance dashboard exposes: overall acknowledgment rate across active policies, employees with overdue acknowledgments, policies due for review (configurable cadence), CSV export of acknowledgment report, visual donut chart of acknowledged vs pending.

**Acceptance:**
- Dashboard chart is a Recharts donut.
- CSV export of acknowledgment report supported.
- Policies due for review honor per-policy `reviewIntervalMonths`.
- Acknowledgment rate shown across all active policies.

---

## REQ-integrations

**Scope:** Integration roadmap.
**Phase:** 8 — Validation (MVP integrations confirmed live; v1.1+ deferred)

Delivery order: **MVP** → Stripe, Resend, Claude API, Clerk. **v1.1** → Slack. **v1.2** → Zapier/Make outbound webhooks. **v1.3** → Google Workspace import. **Government path** → SAM.gov → GSA MAS IT Category.

**Acceptance:**
- MVP integrations live before launch.
- Slack NOT built in MVP (see REQ-non-goals).
- Outbound webhooks (`apiAccess` flag) align with v1.2 plan.

---

## REQ-non-goals

**Scope:** Explicit out-of-scope list (cross-cutting constraint, not a deliverable).
**Phase:** Constraint — applies to all phases

The following are NOT in MVP and must not be built: Training module / LMS, HR integrations (BambooHR/Workday), mobile native app (responsive web suffices), document generation (contracts/forms), custom domain per org, offline mode.

**Acceptance:**
- No code paths exist for any non-goal item.
- Responsive web sufficient for mobile — no React Native or iOS/Android shells.
- Custom domains not configurable per org.

---

## REQ-acceptance-criteria

**Scope:** VALIDATION gate (ship criteria).
**Phase:** 8 — Validation

The system ships when ALL of these pass with real data:

1. Admin creates a policy from a Claude draft in under 5 minutes from account creation.
2. Admin assigns policy to all employees; ack status tracked correctly per user.
3. Employee acknowledges a policy; record persists in audit trail.
4. Employee asks NL Q&A; receives cited answer from policy library only.
5. Admin exports acknowledgment report to CSV.
6. Stripe subscription processes from signup through first billing cycle renewal without manual intervention.
7. Tier gating: Starter org cannot access Growth features (403 + upgrade prompt).
8. Multi-tenancy: Org A cannot see Org B policies or users.

Meta-criterion: the product must be demonstrably faster and more reliable than a Google Drive folder. If it can't beat manual, it doesn't ship.

**Acceptance:**
- All 8 numbered criteria pass against a populated org.
- "Beat-manual" criterion satisfied via user testing or demonstrable benchmark.

---

## Traceability

100% coverage. Every v1 requirement maps to exactly one phase (REQ-non-goals is a cross-cutting constraint, not a phase deliverable, and is tracked in PROJECT.md `<non_goals>`).

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-product-vision | 1 — Foundation | Pending |
| REQ-user-roles | 2 — Data Layer | Pending |
| REQ-multi-tenancy | 2 — Data Layer | Pending |
| REQ-policy-library | 3 — Admin UI | Pending |
| REQ-policy-lifecycle | 3 — Admin UI | Pending |
| REQ-access-control | 3 — Admin UI | Pending |
| REQ-ai-policy-assistant | 4 — AI Layer | Pending |
| REQ-ai-usage-rules | 4 — AI Layer | Pending |
| REQ-acknowledgment-tracking | 5 — Employee Portal | Complete |
| REQ-acknowledgment-rules | 5 — Employee Portal | Complete |
| REQ-tier-starter | 6 — Billing | Pending |
| REQ-tier-growth | 6 — Billing | Pending |
| REQ-tier-business | 6 — Billing | Pending |
| REQ-notification-system | 7 — Crons + Email | Pending |
| REQ-compliance-dashboard | 8 — Validation | Pending |
| REQ-integrations | 8 — Validation | Pending |
| REQ-acceptance-criteria | 8 — Validation | Pending |
| REQ-non-goals | constraint (all phases) | Active |

**Coverage: 17 / 17 v1 requirements mapped + 1 cross-cutting constraint declared.**
