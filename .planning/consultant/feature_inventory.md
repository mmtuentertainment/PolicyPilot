# Consultant Feature Inventory — PolicyPilot

Updated: 2026-06-15 - Phase 7 (Crons + Email) SHIPPED to `main` via PR #44 squash commit `8b7019d` (2026-06-14) — 7th of 8 phases; branch deleted post-merge; main now `3df5223`. All Phase 7 features flip Hardening/in-PR -> Shipped / monitor. The hosted-CI red was environmental and is RESOLVED (merged with gates green). Phase 8 CSV-first slice authorized + planned on `gsd/phase-8-validation`, handed to Codex: CSV export → In progress; compliance dashboard donut still Deferred. R-006 shipped, R-007 partial+benchmark-deferred, R-018 shipped-but-open. Prior: 2026-06-14 - Phase 7 (Crons + Email) published as draft PR #44 from `gsd/phase-7-crons-email` (tip `9a3ebe2`); `verify:phase-7` green (tsc 0 / 39 vitest files·332 tests / check:rls / db:verify); ship-review `wf_0fa4b84e-ad3` = ship / 0 must-fix + 4 follow-ups (FU-2 folded `6fd033a`, FU-4 folded `aa6d8ab`, FU-1 false-positive, FU-3 hosted CI red = environmental); NOT merged, no deploy, no staging/prod migration, no live email send. Prior: 2026-06-05 - Phase 9 Reviewer / approval-workflow MVP shipped via PR #42 at `1122da5`; prior: Phase 6 shipped via PR #32

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
| Notification records + in-app bell | 5-7 | Shipped / monitor | System/employee | Indirect | Medium | Medium | Phase 7 implements `Notifications.create()`/`markRead()` (were throw-stubs) plus `markAllReadForUser` server action and the `NotificationBell`/`NotificationBellServer` UI (unread count from `notifications.read=false`; mark-as-read decrements without full reload). `notifications` stays intentionally mutable (NOT in IMMUTABLE_TABLES). SHIPPED to `main` via PR #44 squash commit `8b7019d` (2026-06-14); verify:phase-7 green (first green at `5d304b4`, re-verified after FU folds at `aa6d8ab`). |
| Stripe Checkout | 6 | Shipped / monitor | Buyer/admin | Direct | Low | Medium | Shipped via PR #32 at `243067e`: admin-only Server Action creates Checkout Sessions using server-derived org, catalog price, safe metadata, duplicate-subscription guard, and trusted success/cancel URLs. `b92a15f` fixed the first-checkout bug for new orgs seeded as `trialing` without a real `stripeCustomerId`; rows 1-3 PASS in test-mode UAT. |
| Stripe 5-event webhook | 6 | Shipped / monitor | System | Direct/Defensive | Medium | High | Shipped via PR #32: raw-body verify, all 5 events, canonical Subscription re-fetch, transaction-scoped idempotency, and M2 status matrix have unit + phase-gate coverage. Rows 4, 8, 9, 10, and 11 PASS with masked test-mode evidence, including true test-clock renewal and first-failure `past_due` proof. SF-WHSEC-1 remains operator-only before future live webhook smoke. |
| Tier gating | 6 | Shipped / monitor | Admin/system | Direct | Medium | High | Shipped via PR #32: `maxUsers` uses a real org-scoped user count and the Phase-4 403/429 contract is preserved. Tier-gate transition proof PASSed through row 5 and remained tied to webhook/database subscription truth. |
| Admin billing settings + Customer Portal | 6 | Shipped / monitor | Admin | Direct/Defensive | Medium | Medium | Shipped via PR #32: `/settings` is admin-gated, shows minimal DB-sourced billing status, and creates Stripe Customer Portal sessions using only the stored customer ID. Rows 6-8 PASS with masked evidence. |
| Phase 6 verifier + Stripe UAT checklist | 6 | Shipped / monitor | Operator/system | Defensive | Medium | Low | Plan 06-06 verifier wiring shipped via PR #32 at `243067e`: `verify:phase-6`, schema/artifact gates, hosted workflow, and masked UAT checklist exist. Local `pnpm db:verify`, pre-merge `pnpm verify:phase-6`, UAT rows 1-11, hosted PR #32 checks at `1abca44`, and post-merge targeted checks are green/acceptable. Actions secrets were set by operator-authorized Claude Code action from `.env.local` via stdin without values printed or committed; CI mutates only the approved dev/test Supabase target through TRUNCATE/seed. |
| Resend + React Email layer (`lib/email/*`) | 7 | Shipped / monitor | Employee/admin | Indirect | Medium | Medium | `lib/email/` ships a lazy Resend client (resend@6.12.3) + React Email templates (react-email@6.1.5, both ≥14d operator-approved) for all 4 types (ack-reminder, policy-assigned, policy-updated, review-due, base-layout) plus typed `send.ts`, `recipients.ts`, `urls.ts`, `errors.ts`. Send-call shape covered by `send.test.ts` (stub transport; FU-4 contained the `RESEND_FROM_EMAIL` env leak via `vi.stubEnv`/`vi.unstubAllEnvs` at `aa6d8ab`). SHIPPED via PR #44 `8b7019d`; verify:phase-7 green; no live send yet (operator-gated). |
| Idempotent reminders cron (`/api/cron/reminders` + `reminder_sends`) | 7 | Shipped / monitor | Employee/system | Indirect | High | Medium | `GET /api/cron/reminders` self-gates on `Bearer {CRON_SECRET}` (middleware bypasses Clerk for `/api/cron/*`), runs per-org via `withOrgScope`, returns `{reviewReminders,ackReminders}`. At-most-once via the additive `reminder_sends` ledger (natural-key UNIQUE on `(org_id,user_id,policy_id,type,window_date)` + claim-before-send `onConflictDoNothing` in-tx, mirroring `stripe_events`/`clerk_events`; migration `0014_reminder_sends`, applied to dev/TEST only — staging/prod operator-gated). `ack_reminder` fires for assignments unacked >7d (daily re-fire, dept fan-out); `review_due` for `next_review_date ≤ now+14d`. Closes R-006 / backlog rank-6. |
| Railway reminders worker | 7 | Shipped / monitor | Employee/system | Indirect | High | Medium | `worker/trigger-reminders.mjs` (dependency-free) + `railway.json` daily 08:00 UTC schedule hit the Vercel cron endpoint with `CRON_SECRET` per ADR-014. Artifact committed + node --check'd; the live Railway run remains operator-executed secret-safe evidence (R7-7 manual-only), not a CI gate. |
| `next_review_date`-on-publish writer + event-driven emission | 7 | Shipped / monitor | Admin/employee | Indirect | Medium | Medium | `lib/policies/transitions.ts` now writes `next_review_date = published_at + review_interval_months` on publish (so `review_due` has data — previously the column had no writer) and emits the post-commit `policy_updated` (on republish) email+notification per target user; the `policy_assigned` (on admin-assign) email+notification is emitted from the admin bulk-assign action in `app/(admin)/policies/[id]/actions.ts`. Both are RETURNING-gated against duplicates. |
| Phase 7 verifier + Clerk-webhook 409/catch scaffold | 7 | Shipped / monitor | Operator/system | Defensive | Medium | Low | `scripts/check-crons-email.ts` (TEST-DB integration for R7-2/3/5/6/8) + `check-artifacts.ts` additions + hosted `verify-phase-7.yml` wire `verify:phase-7` (cumulative over verify:phase-6). T8 Clerk-webhook 409/catch vitest carry-forward added. verify:phase-7 exits 0 (tsc 0, 39 files/332 tests, check:rls pass, db:verify pass — dev Supabase resumed this session, check:artifacts 543/543); first green at `5d304b4`, re-verified at `aa6d8ab` after folding FU-2/FU-4. The earlier full-suite RED was a CPU-starvation flake vs Vitest's 5s default `testTimeout`, fixed by a 30s shared `vitest.config` `testTimeout`/`hookTimeout` (gate not weakened). FU-2 (`6fd033a`) defaulted the vitest env to node and scoped jsdom to `**/*.test.tsx` via `environmentMatchGlobs`. The hosted-CI red (FU-3) was environmental and is RESOLVED — SHIPPED via PR #44 squash commit `8b7019d` (2026-06-14) with gates green (the lone en-route Phase 6 verifier red was the known transient TRUNCATE-deadlock flake, cleared by re-run). |
| Compliance dashboard | 8 | Deferred | Admin/auditor | Direct | High | Medium | Important buyer-visible proof once acknowledgments exist. Dashboard donut / recharts DEFERRED within the Phase 8 slice (ASK-FIRST + ≥14-day dep rule); aggregate widgets also deferred. |
| CSV export | 8 | In progress | Admin/auditor | Direct | High | Low | Small feature, high perceived value. Phase 8 CSV-first slice (AC#5) — planned on `gsd/phase-8-validation` (08-SPEC..08-UAT-INTENT), handed to Codex: `/api/reports/acknowledgments?format=json\|csv` + ack report query + hand-rolled CSV + tests + verify:phase-8. |
| Full acceptance-test pass | 8 | Pending | Operator/system | Defensive | High | Medium | Required before confident launch/demo. DEFERRED within the Phase 8 slice: Stripe test-clock renewal run (AC#6), beat-manual benchmark (SC#5), populated-org seed harness. |
| Reviewer / approval workflow | 9 | Shipped / monitor | Reviewer/admin | Direct | Medium | Medium | **Phase 9 Reviewer MVP** shipped via PR #42 at `1122da5` (D-09-01) — closes R-017: `publish()` enforces a Growth+ approval-completeness gate (status `under_review` + ≥1 approved + 0 pending), covering `approve()` (closes the publish-leak); Starter stays direct-publish. Shared `/reviewer` queue (`workflow_stages` projection) + immutable `review_decisions` ledger. Deferred → backlog rank-17/18: submit-entitlement + per-reviewer-assignment UI. |

---

## Revenue-Leverage View

Highest near-term revenue leverage:

1. Phase 7 reminders — completes the acknowledgment follow-up loop; SHIPPED to `main` via PR #44 squash commit `8b7019d` (2026-06-14). Next leverage is the operator-executed live Railway run (operator-gated; no live email send yet).
2. Phase 8 CSV export/reporting — produces buyer-visible audit evidence; the CSV-first slice is now in progress on `gsd/phase-8-validation` (handed to Codex).
3. Employee Q&A citation polish — keeps the AI differentiator trustworthy during launch review.
4. Employee Q&A citations — supports AI differentiation if reliable.

Lower leverage until core loop is complete:

- Extra dashboard polish.
- Additional AI surfaces beyond the four current Phase 4 surfaces.
- Broad integrations not required by the locked MVP.

---

## Keep-Current Rule

When a feature changes, update its status and consultant note. If the change materially affects pricing, scope, or the beat-manual gate, also update `backlog.md`, `risk_register.md`, and the relevant delta report.
