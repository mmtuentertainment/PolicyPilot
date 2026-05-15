# Requirements (PRD Intel)

Extracted from `REQUIREMENTS.md`. REQ-IDs derived from the document's section structure (§3.1 Policy Library → `REQ-policy-library`, etc.). Each requirement preserves its source so downstream consumers can trace provenance.

---

## REQ-product-vision

- source: `REQUIREMENTS.md` § 1
- scope: product vision / positioning

### Description

PolicyPilot is a clean, AI-powered web application for companies with 25–300 employees to create, organize, distribute, and track company policies. It replaces Google Drive folders and SharePoint with a purpose-built tool: AI assistance, acknowledgment tracking, and compliance-ready audit trails at a price SMBs can afford. The primary differentiator is a Claude-powered AI layer no SMB-priced competitor offers.

### Acceptance Criteria

- Target buyer is HR Manager / Office Manager / Compliance Officer / COO at a 25–300-employee company.
- Pricing is positioned below enterprise tools (anchor for "SMBs can afford").
- AI features are present at MVP — not a roadmap promise.

---

## REQ-user-roles

- source: `REQUIREMENTS.md` § 2
- scope: user role model

### Description

Three user roles exist:

- **Admin** (HR Manager / Office Manager / Compliance Officer / COO): creates/edits/publishes/archives policies, manages approval workflows + accounts, views compliance dashboard + acknowledgment reports, configures policy review schedules.
- **Employee**: views and acknowledges assigned policies, asks AI questions about policy content, receives reminders for unread/unacknowledged policies.
- **Reviewer** (Growth+ tiers only): reviews and approves policies before publication, leaves comments on drafts, moves policies through approval workflow stages.

### Acceptance Criteria

- Role determines what UI surfaces are visible.
- Reviewer role is feature-gated to Growth tier and above.
- An employee belongs to exactly one organization (see REQ-multi-tenancy).

---

## REQ-policy-library

- source: `REQUIREMENTS.md` § 3.1
- scope: core feature — policy library (Starter tier baseline)

### Description

The policy library is the core organizational surface. Rich text editor (TipTap) for policy creation. Policies are organized by categories (HR, Safety, IT, Finance, etc.). Every edit is saved with timestamp + author (full version history). Audit trail captures viewed/acknowledged/edited events. Status states: Draft | Under Review | Published | Archived. Search by title, category, or content keyword.

### Acceptance Criteria

- TipTap is the editor (per stack).
- Every edit creates a `policy_versions` row.
- The four status states are exhaustive — no others.
- Search supports title, category, and content keyword.
- Audit trail is queryable per policy and per user.

---

## REQ-ai-policy-assistant

- source: `REQUIREMENTS.md` § 3.2
- scope: core feature — Claude-powered AI features

### Description

The AI Policy Assistant exposes four AI surfaces, powered by Claude:

- **Draft Generation** (Sonnet 4.6): Admin provides a short prompt → Claude generates a complete policy draft. Admin iterates with follow-up prompts. Tier limit: 50 drafts/month on Starter.
- **Employee Q&A** (Sonnet 4.6): Natural language question → answer from published policy library only. Always cites the source policy by name. Disclaimer on any legal-adjacent question.
- **TL;DR Summaries** (Haiku 4.5): Plain-English summary card auto-generated at publish time. Stored in DB; not regenerated per view.
- **Consistency Check** (Growth+ only, Sonnet 4.6 via Batch API): On-demand scan of the entire policy library for contradictory language; returns flagged conflicts with suggested resolutions.

### Acceptance Criteria

- Draft Generation respects `TIER_LIMITS.aiDraftsMonthly` per tier.
- Q&A NEVER answers from anything except published policies for the requesting org.
- Q&A response always includes citations to source policy names.
- Legal disclaimer is appended to any legal-adjacent Q&A answer.
- TL;DR is created once at publish and stored on the policy row.
- Consistency Check is feature-gated to Growth+ and uses Batch API.
- Every AI call is logged to `ai_generations`.

---

## REQ-acknowledgment-tracking

- source: `REQUIREMENTS.md` § 3.3
- scope: core feature — acknowledgment tracking

### Description

Admin assigns policies to users or departments. Employees see a "Policies requiring acknowledgment" dashboard. One-click acknowledge with timestamp stored to audit trail. Bulk assignment to entire department. Acknowledgment rate visible per policy, department, and employee.

### Acceptance Criteria

- Assignment supports both `user` and `department` assignee types (see `policy_assignments`).
- An acknowledgment records `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}`.
- Acknowledgment is one-click from the employee policy detail view.
- Acknowledgment rate is computable per policy, per department, and per employee.
- Acknowledgments are append-only (see REQ-acknowledgment-rules + ADR-018).

---

## REQ-compliance-dashboard

- source: `REQUIREMENTS.md` § 3.4
- scope: core feature — admin compliance dashboard

### Description

The admin compliance dashboard exposes: overall acknowledgment rate across active policies, employees with overdue acknowledgments, policies due for review (configurable cadence), CSV export of acknowledgment report, and a visual donut chart of acknowledged vs pending.

### Acceptance Criteria

- Dashboard chart is a Recharts donut.
- CSV export of acknowledgment report is supported.
- Policies due for review honor the per-policy `reviewIntervalMonths`.
- Acknowledgment rate is shown across all active policies.

---

## REQ-notification-system

- source: `REQUIREMENTS.md` § 3.5
- scope: core feature — notifications

### Description

Email notifications fire on: new policy assigned, policy updated, review reminder. In-app notification bell surfaces unread items. Email backend is Resend with React Email templates.

### Acceptance Criteria

- Email types: `policy_assigned`, `policy_updated`, `review_due`, `ack_reminder` (matches `notifications.type` enum in SCHEMA).
- Notification bell shows unread count from `notifications.read = false`.
- Reminder emails are sent by the Railway cron worker (see REQ-cron).
- No duplicate sends on retries.

---

## REQ-tier-starter

- source: `REQUIREMENTS.md` § 3
- scope: pricing tier — Starter ($79/month, 25 users)

### Description

Starter tier price is $79/month and supports up to 25 users. Includes all § 3 features: policy library, AI policy assistant (draft + Q&A + TL;DR), acknowledgment tracking, compliance dashboard, notification system. Excludes: approval workflows, Slack integration, consistency check, custom branding, SSO, API access.

### Acceptance Criteria

- `TIER_LIMITS.starter.maxUsers === 25`.
- `TIER_LIMITS.starter.aiDraftsMonthly === 50`.
- All non-Starter feature flags in `TIER_LIMITS.starter` are `false`.

---

## REQ-tier-growth

- source: `REQUIREMENTS.md` § 4
- scope: pricing tier — Growth ($199/month, 100 users)

### Description

Growth tier price is $199/month and supports up to 100 users. Includes all Starter features plus: multi-stage approval workflows before publication, Slack integration (policy updates to designated channel), AI Consistency Check, advanced reporting (acknowledgment trends over time), custom policy categories.

### Acceptance Criteria

- `TIER_LIMITS.growth.maxUsers === 100`.
- `TIER_LIMITS.growth.aiDraftsMonthly === 200`.
- `approvalWorkflows`, `slackIntegration`, `consistencyCheck` all `true` on Growth.
- Custom branding, SSO, and API access remain disabled on Growth.

---

## REQ-tier-business

- source: `REQUIREMENTS.md` § 5
- scope: pricing tier — Business ($449/month, 500 users)

### Description

Business tier price is $449/month and supports up to 500 users. Includes all Growth features plus: custom branding (logo, colors on employee portal), SSO via Clerk SAML, API access (outbound webhooks for policy events), priority support SLA.

### Acceptance Criteria

- `TIER_LIMITS.business.maxUsers === 500`.
- `TIER_LIMITS.business.aiDraftsMonthly === -1` (unlimited).
- All feature flags `true` on Business.
- SSO is delivered via Clerk SAML, not a custom IdP.

---

## REQ-multi-tenancy

- source: `REQUIREMENTS.md` § 6
- scope: tenancy invariant

### Description

Every paying customer is a Clerk Organization. All data is scoped by `org_id` at the database level. Supabase RLS enforces tenant isolation. Admins see only their organization's data. Employees belong to exactly one organization.

### Acceptance Criteria

- Org A cannot see Org B policies or users under any code path.
- RLS is enabled on all tenant-scoped tables.
- `org_id` is present in every application-layer query (see ADR-019).
- One employee = one organization membership at a time.

---

## REQ-policy-lifecycle

- source: `REQUIREMENTS.md` § 7
- scope: business rule — policy lifecycle

### Description

Policy lifecycle rules:

- Cannot publish without passing through Draft status first.
- On Growth+: cannot publish without approval workflow completing.
- Editing a published policy creates a new version → resets to Draft.
- Archiving removes from employee view but preserves audit trail.
- Acknowledgments are version-specific — updating a policy invalidates prior acknowledgments (employees must re-acknowledge).

### Acceptance Criteria

- Status state machine: Draft → Under Review → Published → Archived. No skipping forward past Draft.
- Growth+ orgs cannot bypass the approval workflow to publish.
- A new `policy_versions` row is created on every edit of a published policy, and `policies.status` resets to Draft.
- Archived policies still appear in audit reports.
- After re-publish, employees see "requires re-acknowledgment" against the new `policy_version_id`.

---

## REQ-acknowledgment-rules

- source: `REQUIREMENTS.md` § 7
- scope: business rule — acknowledgment integrity

### Description

Acknowledgment record shape: `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}`. Acknowledgments are NEVER deleted (audit trail integrity). On policy update, existing acknowledgments remain in history but the policy is flagged as "requires re-acknowledgment".

### Acceptance Criteria

- Acknowledgment table is append-only (see ADR-018).
- `ip_address` is captured at acknowledge time.
- Policy update does not mutate or remove prior acknowledgment rows.

---

## REQ-ai-usage-rules

- source: `REQUIREMENTS.md` § 7
- scope: business rule — AI safety

### Description

- Tier limits are enforced before every Claude API call.
- Employee Q&A answers from published policies ONLY.
- AI responses must cite the source policy.
- A legal disclaimer is required on any legal-adjacent question.
- All AI calls are logged to `ai_generations`.

### Acceptance Criteria

- 429 with `tier_limit_exceeded` is returned when `aiDraftsMonthly` is exceeded.
- Q&A prompt is constrained to the org's published policy library only.
- Q&A response includes a non-empty `citations` array referencing real policies.
- Every Claude call writes one row to `ai_generations` with `type` in `{draft, summary, qa, consistency}`.

---

## REQ-access-control

- source: `REQUIREMENTS.md` § 7
- scope: business rule — visibility

### Description

- Employees see only policies assigned to them or to their department.
- Employees cannot see Draft or Under Review policies.
- Admins see all policies in all statuses.
- Reviewers see only their review queue.

### Acceptance Criteria

- Employee policy queries filter to `status = 'published'` AND assignment match.
- Admin policy queries are unfiltered by status (but always scoped by `org_id`).
- Reviewer surface lists only `workflow_stages` rows where `reviewer_id = self` and `status = 'pending'`.

---

## REQ-integrations

- source: `REQUIREMENTS.md` § 8
- scope: integration roadmap

### Description

Integration targets, in delivery order:

- **MVP**: Stripe, Resend, Claude API, Clerk
- **v1.1**: Slack (policy update notifications)
- **v1.2**: Zapier/Make webhooks (outbound events)
- **v1.3**: Google Workspace import (bulk import from Drive)
- **Government path**: SAM.gov registration → GSA MAS IT Category

### Acceptance Criteria

- MVP integrations are live before launch.
- Slack is not built into MVP (see REQ-non-goals — explicit deferral).
- Outbound webhooks (REQ-tier-business `apiAccess`) align with v1.2 Zapier/Make plan.

---

## REQ-non-goals

- source: `REQUIREMENTS.md` § 9
- scope: explicit out-of-scope list for MVP

### Description

The following are explicitly NOT in MVP scope and must not be built:

- Training module / LMS
- HR system integrations (BambooHR, Workday)
- Mobile native app (responsive web is sufficient)
- Document generation (contracts, forms)
- Custom domain per organization
- Offline mode

### Acceptance Criteria

- No code paths exist for any non-goal item.
- Responsive web design is sufficient for mobile users — no React Native or iOS/Android shells.
- Custom domains are not configurable per org.

---

## REQ-acceptance-criteria

- source: `REQUIREMENTS.md` § 10
- scope: VALIDATION gate (ship criteria)

### Description

The system ships when ALL of these pass with real data:

1. Admin creates a policy from a Claude draft in under 5 minutes from account creation.
2. Admin assigns policy to all employees; acknowledgment status tracked correctly per user.
3. Employee acknowledges a policy; record persists in audit trail.
4. Employee asks natural language Q&A; receives cited answer from policy library only.
5. Admin exports acknowledgment report to CSV.
6. Stripe subscription processes from signup through first billing cycle renewal without manual intervention.
7. Tier gating: Starter org cannot access Growth features (403 + upgrade prompt).
8. Multi-tenancy: Org A cannot see Org B policies or users.

A ninth meta-criterion: the product must be demonstrably faster and more reliable than a Google Drive folder. If it can't beat manual, it doesn't ship.

### Acceptance Criteria

- All 8 numbered criteria pass against a populated org.
- The "beat-manual" criterion is satisfied via user testing or demonstrable benchmark.
