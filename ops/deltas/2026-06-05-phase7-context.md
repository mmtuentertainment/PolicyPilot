# Consultant Delta — 2026-06-05 — Phase 7 (Crons + Email) CONTEXT gathered

**Trigger:** `/gsd-discuss-phase 7` completed (session 28). `07-CONTEXT.md` + `07-DISCUSSION-LOG.md` authored + committed (`cb1acfd`) and STATE.md session record committed (`02afc3c`) on `gsd/phase-7-crons-email`. Not pushed; no PR (operator owns push/PR). Extends the spec delta `2026-06-05-phase7-spec.md` (`cc3cf48`).

**What changed (planning artifact only — STILL no runtime/schema change):**
- New `.planning/phases/07-crons-email/07-CONTEXT.md` — **13 implementation (HOW) decisions D-01..D-13** (SPEC.md still owns the 10 WHAT requirements). All gray areas the operator selected + mechanical items resolved; every question answered with the recommended option (no Claude-discretion punts during discussion).
- Decisions locked: (1) loop-per-org via `withOrgScope`, RLS-enforced; (2) record-then-send at-most-once + per-user isolation; (3) `reminder_sends` daily ledger gates the **cron types only** (event types gate on action idempotency); (4) `reminder_sends` shape + additive migration `0013` (operator pre-approved authoring; header sign-off still required; dev/TEST-only); (5) `review_due` → org admins; (6) `ack_reminder` none+stale >7d; (7) `next_review_date` **forward-only** on publish (no backfill); (8) Railway native cron + dependency-free fetch script; (9) `lib/email/` shared base layout + typed dispatch map + lazy `getResendClient` + stub transport; (10) per-org-isolation cron resilience (200+counts, 5xx only on fatal); (11) bell UX → `/gsd-ui-phase 7`; (12) TEST-DB integration + unit-with-stub-transport tests; (13) cumulative `verify:phase-7`, live Railway run = manual operator evidence.

**Risk register touch:** R-006 (reminder idempotency / backlog rank-6) — design **further specified** (record-then-send + cron-only daily ledger + the exact tx ordering). Build pending Phase 7 execute → still **not mitigated** (no code yet). R-013 / SF-W5 / SF-WHSEC-1 unchanged (T8 test in scope; SF-W5 fix + secret rotation remain deferred).

**Other consultant files (`system_map`, `feature_inventory`, `working_context`, `backlog`):** **no material change at discuss stage** — Phase 7 still has zero runtime code. Substantive update lands at plan/ship per keep-current (system_map gains the cron route + `lib/email` + worker + `reminder_sends` table; feature_inventory gains the notification/reminder feature; risk_register flips R-006 to mitigated once built).

**Doc debt (carried, unchanged):** `reference/SCHEMA.md` notifications block STALE (omits live `org_id`) — reconcile at Phase 7 ship.

**Next:** `/clear` → `/gsd-plan-phase 7`. Build routes ASK-FIRST (operator's call: read-mostly Claude → Codex, unless operator directs Claude to build, per the s14/s17 Phase-9 precedent).
