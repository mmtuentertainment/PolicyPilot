# REQUIREMENTS.md
# PolicyPilot — Domain Knowledge + Business Rules
# Stage: REFINERY output → FOUNDRY input
# Operator: Matthew (MMTU Entertainment LLC) | Updated: 2026-05-15

---

## 1. Product Vision

PolicyPilot is a clean, AI-powered web application for companies with
25–300 employees to create, organize, distribute, and track company
policies. Replaces Google Drive folders and SharePoint with a
purpose-built tool: AI assistance, acknowledgment tracking, and
compliance-ready audit trails at a price SMBs can afford.

Primary differentiator: Claude-powered AI layer no SMB-priced competitor offers.

---

## 2. User Roles

### Admin (HR Manager / Office Manager / Compliance Officer / COO)
- Creates, edits, publishes, and archives policies
- Manages approval workflows and user accounts
- Views compliance dashboard and acknowledgment reports
- Configures policy review schedules

### Employee
- Views and acknowledges assigned policies
- Asks AI questions about policy content in natural language
- Receives reminders for unread/unacknowledged policies

### Reviewer (Growth+ tiers only)
- Reviews and approves policies before publication
- Leaves comments on policy drafts
- Moves policies through approval workflow stages

---

## 3. Core Feature Set — Starter Tier ($79/month, 25 users)

### 3.1 Policy Library
- Rich text editor (TipTap) with policy creation
- Organize by categories (HR, Safety, IT, Finance, etc.)
- Full version history — every edit saved with timestamp + author
- Audit trail: viewed, acknowledged, edited, by whom, when
- Status states: Draft | Under Review | Published | Archived
- Search by title, category, content keyword

### 3.2 AI Policy Assistant (Claude Sonnet 4.6)

**Draft Generation**
- Admin provides short prompt → Claude generates complete policy draft
- Admin iterates with follow-up prompts
- Tier limit: 50 drafts/month (Starter)

**Employee Q&A**
- Natural language question → answer from published policy library only
- Always cites source policy by name
- Disclaimer on any question touching legal territory

**TL;DR Summaries**
- Plain-English summary card auto-generated at publish time
- Stored in DB — not regenerated each view (saves API cost)

**Consistency Check (Growth+ only)**
- On-demand scan of entire policy library for contradictory language
- Returns flagged conflicts with suggested resolutions

### 3.3 Acknowledgment Tracking
- Admin assigns policies to users or departments
- Employee sees "Policies requiring acknowledgment" dashboard
- One-click acknowledge with timestamp stored to audit trail
- Bulk assignment to entire department
- Acknowledgment rate visible per policy, department, employee

### 3.4 Compliance Dashboard (Admin)
- Overall acknowledgment rate across all active policies
- Employees with overdue acknowledgments
- Policies due for review (configurable cadence)
- Export acknowledgment report to CSV
- Visual summary: donut chart acknowledged vs pending

### 3.5 Notification System
- Email: new policy assigned, policy updated, review reminder
- In-app: notification bell for unread items
- Email backend: Resend + React Email templates

---

## 4. Growth Tier ($199/month, 100 users)

All Starter features plus:
- Approval workflows: multi-stage review chain before publication
- Slack integration: post policy updates to designated channel
- AI Consistency Check
- Advanced reporting: acknowledgment trends over time
- Custom policy categories

---

## 5. Business Tier ($449/month, 500 users)

All Growth features plus:
- Custom branding (logo, colors on employee portal)
- SSO via Clerk SAML
- API access (webhooks out for policy events)
- Priority support SLA

---

## 6. Multi-Tenancy Model

- Every paying customer is an "Organization" in Clerk
- All data scoped by org_id at database level
- Row Level Security in Supabase enforces tenant isolation
- Admins see only their organization's data
- Employees belong to exactly one organization

---

## 7. Business Rules

### Policy Lifecycle
- Cannot publish without passing through Draft status first
- Growth+: cannot publish without approval workflow completing
- Editing a published policy creates a new version → resets to Draft
- Archiving removes from employee view but preserves audit trail
- Acknowledgments are version-specific — updating a policy invalidates
  prior acknowledgments (employees must re-acknowledge)

### Acknowledgment Rules
- Acknowledgment record: {user_id, policy_id, policy_version_id,
  acknowledged_at, ip_address}
- Acknowledgments are NEVER deleted (audit trail integrity)
- Policy update → existing acknowledgments remain in history but
  policy shows "requires re-acknowledgment"

### AI Usage Rules
- Tier limits enforced before every Claude API call
- Employee Q&A answers from published policies ONLY
- AI responses must cite source policy
- Legal disclaimer required on any legal-adjacent question
- All AI calls logged to ai_generations table

### Access Control Rules
- Employees see only policies assigned to them or their department
- Employees cannot see Draft or Under Review policies
- Admins see all policies in all statuses
- Reviewers see only their review queue

---

## 8. Integration Targets

- MVP: Stripe, Resend, Claude API, Clerk
- v1.1: Slack (policy update notifications)
- v1.2: Zapier/Make webhooks (outbound events)
- v1.3: Google Workspace import (bulk import from Drive)
- Government path: SAM.gov registration → GSA MAS IT Category

---

## 9. Non-Goals (explicitly out of scope for MVP)

- Training module / LMS
- HR system integrations (BambooHR, Workday)
- Mobile native app (responsive web is sufficient)
- Document generation (contracts, forms)
- Custom domain per organization
- Offline mode

---

## 10. Acceptance Criteria (VALIDATION gate)

System ships when ALL of these pass with real data:

1. Admin creates a policy from a Claude draft in under 5 minutes
   from account creation
2. Admin assigns policy to all employees; acknowledgment status
   tracked correctly per user
3. Employee acknowledges a policy; record persists in audit trail
4. Employee asks natural language Q&A; receives cited answer from
   policy library only
5. Admin exports acknowledgment report to CSV
6. Stripe subscription processes from signup through first billing
   cycle renewal without manual intervention
7. Tier gating: Starter org cannot access Growth features (403 +
   upgrade prompt)
8. Multi-tenancy: Org A cannot see Org B policies or users

*Beat-manual criterion: demonstrably faster and more reliable than
a Google Drive folder. If it can't beat manual, it doesn't ship.*
