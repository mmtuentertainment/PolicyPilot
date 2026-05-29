# Consultant Feature Inventory — PolicyPilot

Updated: 2026-05-29 - Phase 6 Plan 06-01 foundation complete

Use this file to keep the product surface tied to revenue, risk, and the beat-manual gate. Update it whenever a feature ships, changes scope, moves phase, or becomes intentionally deferred.

Scoring:

- Revenue linkage: Direct, Indirect, Defensive, or None.
- Beat-manual linkage: High, Medium, Low.
- Status: Shipped, Hardening, Pending, Deferred.
- Remove cost: Low, Medium, High.

---

## Inventory

| Feature | Phase | Status | Primary user | Revenue linkage | Beat-manual linkage | Remove cost | Consultant note |
|---|---:|---|---|---|---|---|---|
| Marketing landing + pricing stub | 1 | Shipped | Buyer/admin | Indirect | Low | Low | Useful for acquisition narrative; not proof of product value. |
| Clerk auth + organizations | 1-2 | Shipped | Admin/employee | Defensive | Medium | High | Required for B2B tenancy; cannot weaken. |
| Supabase + Drizzle data layer | 2 | Shipped | System | Defensive | High | High | Product trust depends on scoped persistence and RLS. |
| Org-scoped repositories + RLS enforcement | 2 | Shipped | System | Defensive | High | High | Core moat for SMB trust; every future feature must use it. |
| Clerk provisioning webhooks | 2-3 | Shipped | System/admin | Defensive | Medium | High | Must stay idempotent; stuck event handling remains watchlist. |
| Admin dashboard shell | 3 | Shipped | Admin | Indirect | Medium | Medium | Entry point for policy operations. |
| Policy library list/search | 3 | Shipped | Admin | Direct | High | High | Replaces Drive folder discovery. |
| TipTap policy editor | 3 | Shipped | Admin | Direct | High | High | Core policy creation/editing workflow. |
| Policy lifecycle state machine | 3 | Shipped | Admin | Defensive | High | High | Audit-ready lifecycle beats ad hoc document folders. |
| Policy version history | 3 | Shipped | Admin/auditor | Defensive | High | High | Required for reliable acknowledgment reset behavior. |
| Claude draft generation | 4 | Shipped | Admin | Direct | High | Medium | Strong time-to-value driver; keep cost-gated and logged. |
| Claude TL;DR summaries | 4 | Shipped | Employee/admin | Indirect | Medium | Medium | Good usability feature; publish-time cache avoids repeated cost. |
| Employee Q&A over published policies | 4 | Shipped | Employee | Direct | High | Medium | Differentiator if citations remain reliable and scoped. |
| Consistency check via Batch API | 4 | Shipped | Admin | Direct | Medium | Medium | Growth+ candidate; avoid letting async complexity block core MVP. |
| Employee assigned-policies dashboard | 5 | Shipped | Employee | Direct | High | High | Shipped in PR #27; future phases must preserve assignment visibility and tenant scoping. |
| Append-only acknowledgment flow | 5 | Shipped / monitor | Employee/admin/auditor | Direct | High | High | Shipped in PR #27; future phases must preserve append-only audit integrity. |
| Notification records | 5-7 | Partial/Pending | System/employee | Indirect | Medium | Medium | Becomes valuable once email reminders ship. |
| Stripe Checkout | 6 | Planned | Buyer/admin | Direct | Low | Medium | Plan 06-04 plan-check PASSED; admin-only server-side checkout, dup-sub guard, success/cancel URLs. 06-01 foundation now complete; checkout itself is still pending. |
| Stripe 5-event webhook | 6 | Planned | System | Direct/Defensive | Medium | High | Plan 06-02: raw-body verify + transaction-scoped idempotency + canonical Subscription re-fetch; all 5 events + M2 status matrix locked. 06-01 billing columns now exist in TEST DB. |
| Tier gating | 6 | Planned | Admin/system | Direct | Medium | High | Plan 06-03: real `maxUsers` count; Phase-4 403/429 contract preserved. Turns AI + advanced features into monetizable packaging; gating remains pending after 06-01. |
| Railway reminders worker | 7 | Pending | Employee/system | Indirect | High | Medium | Drives completion rates; must be idempotent. |
| Resend email templates | 7 | Pending | Employee/admin | Indirect | Medium | Medium | Operational glue; avoid over-design before reminder rules are stable. |
| Compliance dashboard | 8 | Pending | Admin/auditor | Direct | High | Medium | Important buyer-visible proof once acknowledgments exist. |
| CSV export | 8 | Pending | Admin/auditor | Direct | High | Low | Small feature, high perceived value; likely a strong micro-batch. |
| Full acceptance-test pass | 8 | Pending | Operator/system | Defensive | High | Medium | Required before confident launch/demo. |

---

## Revenue-Leverage View

Highest near-term revenue leverage:

1. Phase 6 Stripe + tier gating — unlocks collection and packaging.
2. Phase 7 reminders — completes the acknowledgment follow-up loop.
3. Phase 8 CSV export/reporting — produces buyer-visible audit evidence.
4. Employee Q&A citations — supports AI differentiation if reliable.

Lower leverage until core loop is complete:

- Extra dashboard polish.
- Additional AI surfaces beyond the four current Phase 4 surfaces.
- Broad integrations not required by the locked MVP.

---

## Keep-Current Rule

When a feature changes, update its status and consultant note. If the change materially affects pricing, scope, or the beat-manual gate, also update `backlog.md`, `risk_register.md`, and the relevant delta report.
