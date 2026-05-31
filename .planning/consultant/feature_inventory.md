# Consultant Feature Inventory — PolicyPilot

Updated: 2026-05-31 - Phase 6 shipped via PR #32

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
| Stripe Checkout | 6 | Shipped / monitor | Buyer/admin | Direct | Low | Medium | Shipped via PR #32 at `243067e`: admin-only Server Action creates Checkout Sessions using server-derived org, catalog price, safe metadata, duplicate-subscription guard, and trusted success/cancel URLs. `b92a15f` fixed the first-checkout bug for new orgs seeded as `trialing` without a real `stripeCustomerId`; rows 1-3 PASS in test-mode UAT. |
| Stripe 5-event webhook | 6 | Shipped / monitor | System | Direct/Defensive | Medium | High | Shipped via PR #32: raw-body verify, all 5 events, canonical Subscription re-fetch, transaction-scoped idempotency, and M2 status matrix have unit + phase-gate coverage. Rows 4, 8, 9, 10, and 11 PASS with masked test-mode evidence, including true test-clock renewal and first-failure `past_due` proof. SF-WHSEC-1 remains operator-only before future live webhook smoke. |
| Tier gating | 6 | Shipped / monitor | Admin/system | Direct | Medium | High | Shipped via PR #32: `maxUsers` uses a real org-scoped user count and the Phase-4 403/429 contract is preserved. Tier-gate transition proof PASSed through row 5 and remained tied to webhook/database subscription truth. |
| Admin billing settings + Customer Portal | 6 | Shipped / monitor | Admin | Direct/Defensive | Medium | Medium | Shipped via PR #32: `/settings` is admin-gated, shows minimal DB-sourced billing status, and creates Stripe Customer Portal sessions using only the stored customer ID. Rows 6-8 PASS with masked evidence. |
| Phase 6 verifier + Stripe UAT checklist | 6 | Shipped / monitor | Operator/system | Defensive | Medium | Low | Plan 06-06 verifier wiring shipped via PR #32 at `243067e`: `verify:phase-6`, schema/artifact gates, hosted workflow, and masked UAT checklist exist. Local `pnpm db:verify`, pre-merge `pnpm verify:phase-6`, UAT rows 1-11, hosted PR #32 checks at `1abca44`, and post-merge targeted checks are green/acceptable. Actions secrets were set by operator-authorized Claude Code action from `.env.local` via stdin without values printed or committed; CI mutates only the approved dev/test Supabase target through TRUNCATE/seed. |
| Railway reminders worker | 7 | Pending | Employee/system | Indirect | High | Medium | Drives completion rates; must be idempotent. |
| Resend email templates | 7 | Pending | Employee/admin | Indirect | Medium | Medium | Operational glue; avoid over-design before reminder rules are stable. |
| Compliance dashboard | 8 | Pending | Admin/auditor | Direct | High | Medium | Important buyer-visible proof once acknowledgments exist. |
| CSV export | 8 | Pending | Admin/auditor | Direct | High | Low | Small feature, high perceived value; likely a strong micro-batch. |
| Full acceptance-test pass | 8 | Pending | Operator/system | Defensive | High | Medium | Required before confident launch/demo. |

---

## Revenue-Leverage View

Highest near-term revenue leverage:

1. Phase 7 reminders — completes the acknowledgment follow-up loop.
2. Phase 8 CSV export/reporting — produces buyer-visible audit evidence.
3. Employee Q&A citation polish — keeps the AI differentiator trustworthy during launch review.
4. Employee Q&A citations — supports AI differentiation if reliable.

Lower leverage until core loop is complete:

- Extra dashboard polish.
- Additional AI surfaces beyond the four current Phase 4 surfaces.
- Broad integrations not required by the locked MVP.

---

## Keep-Current Rule

When a feature changes, update its status and consultant note. If the change materially affects pricing, scope, or the beat-manual gate, also update `backlog.md`, `risk_register.md`, and the relevant delta report.
