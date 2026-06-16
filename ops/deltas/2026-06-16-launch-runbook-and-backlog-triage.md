# Consultant Delta — 2026-06-16 — Launch runbook + PR #48 review-nit triage + backlog/consultant keep-current

**Author:** Claude Code (planning/authoring) · **Branch:** `claude/plan-phase7-deploy-tx5hkt` (off `main` `7ba6ba2`) · **Type:** docs + CI-infra hardening + planning hygiene (non-functional; no product behavior change). **Not pushed; no PR; operator owns push/PR/merge.**

**Trigger:** Post-Phase-8-ship (PR #48 `03c18d4`, the 8th and FINAL phase → v1.0 build sequence complete on `main`) launch-readiness batch. With all phases shipped, the only remaining work is operator launch gates; this batch (a) authors the operator launch runbook that sequences those gates, (b) clears the safe PR #48 CodeRabbit review nits, (c) lands the two SF-1/SF-2 follow-ups, and (d) refreshes the consultant set per the keep-current rule. The keep-current rule requires this delta.

---

## Scope statement (guardrails honored)

- **No schema / migration / dependency change** — Drizzle journal stays **15 entries / newest `0014_reminder_sends`** (verified `drizzle/meta/_journal.json`); no files added under `drizzle/`; no new npm package.
- **No `any`** introduced; `tsc --noEmit` exits 0 (verified, after setting `COREPACK_DEFAULT_TO_LATEST=0` per the documented Corepack fix — no install performed, verification not disabled).
- **No secrets** — every credential/ref in the new runbook uses a `<PLACEHOLDER>` token; secret-pattern scan of `launch-mvp.md` is clean. The frozen `reference/SCHEMA.md` and `lib/db/schema.ts` were NOT touched.
- **No CI gate weakened** — the SF-2 digest pin strengthens (does not weaken) supply-chain posture; `pnpm verify:phase-N` commands are byte-identical; `check:artifacts` (secrets-by-name guard) unaffected.
- **No deploy / live-Stripe / live-email** — this batch is documentation + planning + CI-image-pin only. All deployment, prod-migration, live-send, and live-billing actions remain operator-gated and closed.

---

## Deliverable A — new launch runbook `docs/runbooks/launch-mvp.md`

New 12-section operator launch runbook (`## 1`..`## 12`, plus Intro + Related-files), sequencing the two remaining launch milestones:

- **Milestone 1 — Phase 7 R-018 deploy:** Railway worker (`worker/trigger-reminders.mjs` → `${NEXT_PUBLIC_APP_URL}/api/cron/reminders` with `Authorization: Bearer ${CRON_SECRET}`; `railway.json` `startCommand=node worker/trigger-reminders.mjs`, `cronSchedule 0 8 * * *` = 08:00 UTC), Resend sending-domain verification, and getting the additive `0014_reminder_sends` migration onto staging/prod.
- **Milestone 2 — prod launch:** provision prod Supabase (ADR-018 Pro + PITR — PITR protects the append-only acknowledgment audit-trail invariant), replace the `REPLACE_WITH_PROD_PROJECT_REF` placeholder (`scripts/deploy-config.json`), capture the prod pooler password via `store-deploy-password.ps1` into SecretStore, run the `db:migrate:prod` → `db:verify:prod` gate, first Vercel prod deploy, smoke test, confirm the daily Railway cron run (Phase 7 AC#2), then audit-log the prod migration.

Reconciled fully to the actual repo, not the prior-session plan. Every load-bearing fact verified against real files first: the exact `pnpm` scripts (`db:migrate:staging|prod`, `db:verify:staging|prod`, `db:wait-pooler-auth:prod`, `deploy:preflight`) exist in `package.json`; the cron route returns `401 {error:'Unauthorized'}` on bad auth, `200 {reviewReminders, ackReminders}` on success, `503 {error:'Database unavailable'}` on DB-down (`app/api/cron/reminders/route.ts`); staging user is `postgres.qwtbbbjbxffioeeazxrw` (the known TEST ref). Migration mechanics cross-link to `deploy-migrations.md` (not duplicated); the env-var matrix cross-links to `.planning/codebase/INTEGRATIONS.md` (not restated). Stripe is flagged **TEST MODE ONLY**. ADR-014 (Railway worker, NOT Vercel cron) confirmed. An index row was added to `docs/runbooks/README.md` per that README's own "Adding a new runbook" instructions; all 10 relative links in the new file resolve to real files.

**Accuracy correction recorded (deviation):** `deploy-migrations.md` claims `deploy:preflight` "Runs `pnpm tsc --noEmit`" first, but `scripts/deploy-preflight.ts` actually runs ONLY `check-deploy-schema.ts` (the `db:verify`) when `DIRECT_URL`/`DATABASE_URL` is set; type-checking happens in the separate `next build` step (`vercel.json`'s `pnpm deploy:preflight && pnpm build`). §7/§9 reflect the real script behavior. The load-bearing caveat — **preflight does NOT validate secret completeness** (a missing `CRON_SECRET`/Stripe/Resend key will not fail preflight) — is stated prominently and holds regardless.

**Files:** `docs/runbooks/launch-mvp.md` (new), `docs/runbooks/README.md` (index row).

---

## Deliverable C — three PR #48 documentation fixes + one verified false-positive

Applied three safe doc fixes against verified ground truth and confirmed one CodeRabbit false-positive **without** a code change.

- **C1 — `docs/runbooks/deploy-migrations.md` (line 248 verifier sample):** changed the stale sample verifier-output count `13 migrations applied` → `15 migrations applied` to match the 15-entry journal (`0000..0014`). Left the unrelated single-run illustration at line 220 (`2 migrations applied: 0008_…, 0009_…`) untouched — different sample. Surrounding prose (lines 216/223) already correctly said "15 entries (0000..0014)"; only the verifier-output count was stale.
- **C2 — `.planning/phases/08-validation/08-DISCUSSION-LOG.md` (two planning-time terms → shipped reality):** (a) the **D-02** row claimed `selectDistinct` for dedup; shipped `lib/db/repositories/reports.ts` actually dedups via **GROUP BY + `min(policyAssignments.assignedAt)`** (no `selectDistinct` in the file), collapsing a dual (user+department) assignment to one row — reworded accordingly. (b) the **D-12** row referenced `check-reports.ts`; the real integration-test file is `scripts/check-reports.test.ts` (no standalone `check-reports.ts` exists) — corrected.
- **C3 / COV-3 — `.planning/phases/08-validation/08-UAT-INTENT.md` (scenario #7 CSV safety):** augmented with two explicit coverage cases consistent with `lib/reports/csv.ts` + its tests: (a) **leading-whitespace-before-dangerous-prefix** — `needsFormulaGuard` inspects `value.trimStart()[0]`, so `" =danger"` / `"\t+danger"` still get the leading-quote guard and whitespace cannot bypass it (matches `csv.test.ts` 30-33); (b) **null/number (non-string) cells** — `csvField` coerces `null` to `''` and numbers via `String()`, so an unacked row's null Acknowledged-At/IP renders empty and a numeric Policy Version renders as its string form without throwing (matches `csv.test.ts` 35-39).

**FALSE-POSITIVE — verified real, NOT applied (CodeRabbit `r3417510475`):** the suggestion to remove `acknowledgments.orgId` from `08-SPEC.md` is a confirmed false-positive — the column is real and load-bearing: `lib/db/schema.ts:54` defines `orgId = uuid('org_id').notNull().references(...)` (the D-02 denormalization), `lib/db/repositories/reports.ts:104` uses `eq(currentAck.orgId, s.orgId)` in the `leftJoin` predicate, and `08-SPEC.md:18` correctly cites the live schema. No edit was made to `08-SPEC.md`, `lib/db/schema.ts`, or `reference/SCHEMA.md`. **This is a pending operator GitHub-thread action: resolve-without-change** (see Pending operator actions below).

**Files:** `docs/runbooks/deploy-migrations.md`, `.planning/phases/08-validation/08-DISCUSSION-LOG.md`, `.planning/phases/08-validation/08-UAT-INTENT.md`.

---

## Deliverable D — SF-1 + SF-2 PR #48 follow-ups

### SF-1 — acknowledgment-report single-row aggregate (behavior-preserving)

- **SF-1a (`lib/db/repositories/reports.ts`):** inserted a 6-line explanatory comment immediately above the `acknowledgedAt` select field (`min(currentAck.acknowledgedAt)`) inside `listAckComplianceForOrg`, matching the surrounding 8-space indentation. It documents the single-row-safe aggregate property — `acknowledgments` is UNIQUE on `(user_id, policy_id, policy_version_id)` and `policy_version_id` is fixed per GROUP, so at most one current-ack row exists per group and `min`/`max` collapse a single row without altering its value. **Comment only** — no query logic, ordering, or types changed (the `acknowledgedAt` field shifted to ~line 62, `ipAddress` and the GROUP BY unchanged).
- **SF-1b (`scripts/check-reports.test.ts`, the TEST-DB integration test):** extended the existing single test (per "prefer extending an existing relevant test") rather than adding a new block. The harness already seeds a `(userCurrent, pCurrent)` group collapsed by GROUP BY (direct + department assignment fan-out) with exactly ONE current ack (`ip 203.0.113.10`, `acknowledged_at 2026-06-01T00:00:00Z`). Added a type-safe value-preserving assertion right after the existing current-row checks: `expect(current?.acknowledgedAt?.toISOString().slice(0,10)).toBe('2026-06-01')` — proving `min(acknowledgedAt)` returns that ack's own value (not null, not a mutated row), complementing the pre-existing exact `ipAddress` assertion (`toBe('203.0.113.10')`) that covers the `max(ipAddress)` collapse. No new fixtures, no `any`. A UTC-date-pin (not full-instant equality) was used because `acknowledged_at` is a zone-naive `timestamp` column that round-trips through the runner's local offset — full-ISO equality would be brittle across runner timezones; the date-pin mirrors the existing COV-1 portability pattern. `pnpm tsc --noEmit` exits 0.

### SF-2 — postgres service-image digest pin (APPLIED)

**APPLIED** — pinned the postgres service image from `postgres:16` to `postgres:16@sha256:081f1bc7bd5e143dbb6e487b710bbc27712cdcfaced4c071b8e47349aa1b4171` in all three per-phase verifiers (`.github/workflows/verify-phase-6.yml`, `verify-phase-7.yml`, `verify-phase-8.yml`, all at line 28). The digest was obtained (not invented) from the official Docker Hub API for tag `16` and cross-verified: well-formed 71-char sha256, multi-arch manifest list (amd64 — what `ubuntu-latest` runners pull — present), tag `last_updated 2026-06-13`, identical across two independent fetches. This strengthens supply-chain posture (reproducible pull of the same content CI already uses) and does **not** weaken the gate — `postgres:16` still resolves to exactly this content, now pinned. **Backlog candidate flagged (deviation):** a FOURTH workflow `.github/workflows/verify.yml:28` also uses bare `image: postgres:16`; SF-2 was explicitly scoped to the three per-phase verifiers, so `verify.yml` was left UNCHANGED — the operator may want it pinned to the same digest for full consistency (out of this batch's named scope).

**Files:** `lib/db/repositories/reports.ts`, `scripts/check-reports.test.ts`, `.github/workflows/verify-phase-6.yml`, `verify-phase-7.yml`, `verify-phase-8.yml`.

---

## Deliverable B1 — backlog refresh + consultant keep-current review

Refreshed `backlog.md` and reconciled the consultant file set to ACTUAL repo HEAD (`7ba6ba2`, 2026-06-16). **All consultant files were EDITED; none marked NO-CHANGE** — the 8th and FINAL phase shipping (Phase 8 PR #48 `03c18d4`) made each file's stale "Phase 8 in progress" status materially wrong, which is exactly the keep-current trigger. Edits were minimal/targeted (status lines + runbook pointers + one new route), not rewrites.

**Keep-current outcome — per file:**

| Consultant file | Outcome | What changed |
|---|---|---|
| `backlog.md` | **EDITED** | HEAD-pin → `7ba6ba2`; rank-15 (prod Supabase/prod-deploy) now points at `docs/runbooks/launch-mvp.md`; rank-8 CSV export `In progress` → `Shipped` (`03c18d4`); added 7 ranked rows (21 COV-3, 22 SF-1, 23 recharts dashboard DEFERRED/ASK-FIRST, 24 Stripe test-clock AC#6 DEFERRED, 25 beat-manual SC#5 DEFERRED, 26 report seed harness DEFERRED, 27 SF-2 postgres digest pin = APPLIED-this-batch); `notifications.org_id` doc-debt CLOSED (verified present since `0000_initial.sql`); Next-Micro-Batch section → "all 8 phases shipped, launch-gates remaining". A new candidate is implied for SF-2 `verify.yml` pin (see Deliverable D). |
| `working_context.md` | **EDITED** | all 8 phases shipped + v1.0 complete + launch gates remaining; Current-State + Active-Watchlist reconciled (incl. residual "in progress" mentions cleaned). |
| `risk_register.md` | **EDITED** | header refresh; R-007 (beat-manual) → Phase 8 shipped status; R-015 / R-018 now point at `docs/runbooks/launch-mvp.md`. |
| `feature_inventory.md` | **EDITED** | CSV export `In progress` → `Shipped/monitor` (the exact keep-current trigger); full-acceptance-test row deferral pointers; Revenue-Leverage view "in progress" mention cleaned. |
| `system_map.md` | **EDITED** | phase map Phase 8 → shipped; added the new `GET /api/reports/acknowledgments` route + `reports.ts` to Hotspots; header note. |
| `README.md` (consultant dir) | **EDITED** | "Current Phase State" → v1.0 build complete (not in the named four-file set, but lives in the consultant dir and carried a stale "Phase 8 … in progress" line, so keep-current applies). |

Backlog table integrity verified (all rows balanced; rank-8's escaped `\|` inside `?format=json\|csv` is intentional). Guardrails held: journal still 15/0014, no `drizzle/` files added, no schema/`SCHEMA.md`/`schema.ts` touched.

**Files:** `.planning/consultant/backlog.md`, `working_context.md`, `risk_register.md`, `feature_inventory.md`, `system_map.md`, `README.md`.

---

## Deliverable E — STATE.md reconcile

**Edited — targeted delta-reconcile, by hand (no GSD finalizer).** `.planning/STATE.md` already carried `status: phase_8_shipped` / `completed_phases: 8` / `total_phases: 8` in its frontmatter (that reconcile landed with the PR #48 post-merge bookkeeping at `7ba6ba2`), so this batch did **not** advance phase state. It did, however, fix residual body staleness and record the session: (1) HEAD-pin `03c18d4` → `7ba6ba2` across the Current-focus / Branch / Main-HEAD lines (`03c18d4` kept beneath as the PR #48 ship commit); (2) Next-action rewritten to point at `docs/runbooks/launch-mvp.md` (Milestone 1 = Phase 7 R-018 deploy, Milestone 2 = prod launch) + the triaged backlog ranks 21–27, preserving the standing guardrail (no deploy / no staging-prod migration / no live email-Stripe); (3) Performance Metrics `7 / 8 merged` → `8 / 8 merged (v1.0 build sequence complete)`; (4) Phase Roster row 8 `Not started` → `SHIPPED 2026-06-16` (PR #48 `03c18d4`); (5) a new 2026-06-16 Session Continuity entry recording this working-tree-only batch. The pre-existing frontmatter `status: phase_8_shipped` was already true before this batch; the body/continuity edits above were made this batch.

**Files:** `.planning/STATE.md`.

---

## Pending operator actions

1. **GitHub thread `r3417510475`** — resolve-without-change (the `acknowledgments.orgId` removal suggestion is a verified false-positive; the column is real and load-bearing — see Deliverable C).
2. **Provision prod Supabase** (ADR-018 Pro + PITR), replace `REPLACE_WITH_PROD_PROJECT_REF` in `scripts/deploy-config.json`, and capture the prod pooler password into SecretStore (`store-deploy-password.ps1`) — Milestone 2, per `docs/runbooks/launch-mvp.md`.
3. **Resend sending-domain DNS** (SPF/DKIM/DMARC) + `RESEND_FROM_EMAIL`, then enable real email send (R-018) — currently operator-gated/closed.
4. **Run the staging → prod migration gate** (`db:migrate:<env>` → `db:verify:<env>`) to get the additive `0014_reminder_sends` onto staging/prod, then deploy code — currently dev/TEST only.
5. **Push / open PR / merge** for this batch (Claude does not push; operator owns).
6. **(Optional)** pin `.github/workflows/verify.yml` postgres image to the same digest for full SF-2 consistency; consider `/gsd-complete-milestone` now that the v1.0 build sequence is complete on `main`.

---

## Consultant set review (keep-current)

All six consultant files (`backlog`, `working_context`, `risk_register`, `feature_inventory`, `system_map`, `README`) were **EDITED** this batch — see Deliverable B1 for the per-file outcome. None qualified as no-change: Phase 8 (the final phase) shipping is a material status change. This delta satisfies the keep-current rule for the launch-runbook + PR #48 triage + SF-1/SF-2 batch.
