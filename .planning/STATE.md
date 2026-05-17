---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 02 — Plans 02-01 + 02-02 (partial) + 02-03 (FULL) + 02-04 shipped 2026-05-17; Plan 02-05 next
last_updated: "2026-05-17T14:30:38.000Z"
progress:
  total_phases: 8
  completed_phases: 1
  total_plans: 11
  completed_plans: 9
  percent: 81
---

# STATE — PolicyPilot

GSD session state. Updated each time a phase or plan transitions. Source of truth for "where are we right now".

---

## Project Reference

- **Project**: PolicyPilot — AI-powered policy & procedure management SaaS
- **Operator**: Matthew (MMTU Entertainment LLC) — `mmtuentertainment@gmail.com`
- **Core value**: Replaces Google Drive / SharePoint for SMB policy management with AI drafting, append-only acknowledgment tracking, and audit-ready compliance trails — at a price an SMB can afford.
- **Beat-manual gate**: Product must be demonstrably faster and more reliable than a Google Drive folder.
- **Current focus**: ASSEMBLY Phase 2 — Data Layer (Drizzle schema + RLS + Clerk webhooks). Phase 1 complete and operator-approved 2026-05-16.
- **Granularity**: standard (8 phases)

---

## Current Position

Phase: 02 — Plans 02-01 + 02-02 (partial) + 02-03 (FULL) + 02-04 (FULL) shipped 2026-05-17; Plan 02-05 next
Plan: 4 of 6 (with 02-02 deferred-test-DB caveat outstanding; 02-03 fully resolved)

- **Phase**: 2 — Data Layer **in progress** (2026-05-17 — Plans 02-01 + 02-02 + 02-03 + 02-04 shipped)
- **Plan**: 4 / 6 — Plan 02-04 FULLY complete (2/2 tasks). 9 repository skeletons under `lib/db/repositories/*.ts` shipped via commits `2973555` (4 critical: Policies + Acknowledgments + Users + PolicyVersions) and `e71000a` (5 remaining: PolicyAssignments + Departments + AiGenerations + Notifications + WorkflowStages). `pnpm tsc --noEmit` exits 0 in ~2.7s — closes the Plan 02-01 Task 3 baseline failure. D-07 type tests in `tests/types.ts` now actively enforce ADR-018 (Acknowledgments has no update/delete) + ADR-005 (Policies.create omits tldrSummary). Next step is Plan 02-05 (Clerk webhook handler + middleware SF-M4 fold).
- **Status**:
  - **Plan 02-01** shipped via commits `75b397e` (schema), `e7c6b43` (context + scoped), `2fff189` (type tests), `a381bd8` (metadata). 12 Drizzle tables; SF-M4 closed in `lib/auth/context.ts`. `tsc --noEmit` baseline failure was intentionally deferred — closed by Plan 02-04.
  - **Plan 02-02** partial: ✓ Clerk Org Roles (3 effective: `Admin` built-in customized + `employee` + `reviewer` — webhook handler must strip `org:` prefix per D-09 fallback); ✓ Clerk Session Token publicMetadata claim already configured; ✓ Svix webhook endpoint created with 4 events + signing secret captured in `.env.local`; ✓ `DIRECT_URL` populated; ✗ `policypilot-test` Supabase project BLOCKED (free-tier 2-project limit — see Blockers SF-DB-1).
  - **Plan 02-03** FULL: ✓ Task 1 (`c1dcf6f`), Task 2 (`0bbf321`), Task 3 (`f443cd0`), Task 4 (post-commit live-DB push after SF-DB-2 fix). Live dev DB verified 12/12 tables + 10/10 RLS-enabled tenant tables + 10/10 org_isolation policies + 40 GRANTs + D-03a CHECK. **SF-DB-2 RESOLVED.**
  - **Plan 02-04** FULL: ✓ Task 1 (`2973555` — Policies + Acknowledgments + Users + PolicyVersions: 4 critical files satisfying D-07 type invariants); ✓ Task 2 (`e71000a` — PolicyAssignments + Departments + AiGenerations + Notifications + WorkflowStages: 5 remaining files for Plan 02-06 positive-control). 9 files / 351 lines. 1 Rule-1 deviation (Acknowledgments header switched from `//` to `/** */` block-comment because TS scans line-comments for `@ts-expect-error` directives — acceptance substrings preserved verbatim).
- **Progress**: 1 / 8 phases complete; Phase 2: 4/6 plans complete (one SF-DB-1 caveat outstanding for Plan 02-06)

```
[█░░░░░░░] 1/8 phases  —  Foundation: 5/5 plans ✓  ·  Data Layer: 4/6 plans ▶ (02-01 ✓, 02-02 partial, 02-03 ✓, 02-04 ✓)
```

**Next action**: Proceed to Plan 02-05 (svix install + Clerk webhook handler + middleware SF-M4 fold). Code-only; no live DB dependency. **Halt before Plan 02-06** (RLS property test still needs SF-DB-1 resolved — test DB doesn't exist yet).

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases complete | 1 / 8 |
| Phase 1 plans drafted | 5 / 5 |
| Phase 1 plans executed | 5 / 5 |
| Phase 2 context | drafted 2026-05-17 |
| Phase 2 plans drafted | 6 / 6 |
| Phase 2 plans executed | 4 / 6 (02-01 ~7min/3 commits/4 files; 02-02 partial ~unknown/0 source commits; 02-03 14min/3 commits/9 files + post-commit Task 4; 02-04 ~4min15s/2 commits/9 files — tsc baseline closed) |
| Requirements mapped | 17 / 17 |
| Locked decisions | 25 (ADRs 001–025) |
| Phase implementation decisions | Phase 1: 15 (D-01..D-15); Phase 2: 9 (D-01..D-09) + 6 USER-LOCKED (L-01..L-06) |
| Constraints (SPEC) extracted | 28 |
| Acceptance criteria pending | 8 + 1 meta |

---

## Accumulated Context

### Locked decisions (do not re-litigate)

All 21 decisions in `PROJECT.md` `<decisions>` block are LOCKED via ADR-001 through ADR-021. Sourced from `BLUEPRINT.md` (precedence 0) and `reference/STACK.md` (precedence 1). Re-opening any requires a new ADR and operator approval.

Phase 1 added 15 implementation decisions (D-01 to D-15) at `.planning/phases/01-foundation/01-CONTEXT.md`.

Phase 2 added 9 implementation decisions (D-01 to D-09) at `.planning/phases/02-data-layer/02-CONTEXT.md` on top of 6 USER-LOCKED deliverables (L-01..L-06) reflecting ADR-023 + ADR-025. Highlights: two-migration split (schema generate + hand-written RLS+GRANT); `org_id` denormalization onto 5 child tables; 4-event Clerk webhook scope + new `clerk_events` idempotency table; `DIRECT_URL` env-var split for migrations; `@ts-expect-error` type-tests locking the ADR-018/005 invariants.

Plan 02-01 (2026-05-17) execution decisions:

- Kept `PgTransaction<any, any, any>` typing in `lib/db/scoped.ts` (default per CONTEXT specifics; RESEARCH Open Question 2 resolution). `Parameters<typeof db.transaction>[0]` tightening deferred to Phase 8 perf pass.
- Alphabetical table order in `lib/db/schema.ts` (Drizzle thunked references defer evaluation; alphabetical wins on review diffs).
- Stricter `{ role?: unknown }` cast in `lib/auth/context.ts` vs middleware's `{ role?: string }` — Phase 2 carries forward stricter form; middleware companion left to Plan 02-05.
- SF-M4 (try/catch around `await auth()`) closed in `lib/auth/context.ts:25-32`. Middleware companion (`middleware.ts:51, 61`) DEFERRED to Plan 02-05's middleware fold task.

### Todos

- [x] Plan 01-01: Scaffold Next.js 15 + install Phase 1 deps + shadcn + DATABASE_URL — **completed 2026-05-15** (commits 5d2057d, 3b74de5, f58aea7)
- [x] Plan 01-02: Operator creates Clerk dev app + Supabase project + populates .env.local — **completed 2026-05-16** (no source commits — `.env.local` is gitignored; only SUMMARY committed in 72ea3b8)
- [x] Plan 01-03: App shell (ClerkProvider + marketing landing + pricing stub + Clerk auth pages) — **completed 2026-05-16** (commits bd12768, 479b06c, b20a6ff)
- [x] Plan 01-04: middleware.ts + Drizzle skeleton + scripts/check-db.ts — **completed 2026-05-16** (commits 49e2826, 6dcd38a, ca568ce)
- [x] Plan 01-05: scripts/check-foundation.ts + verify:phase-1 implementation + operator human-verify — **completed 2026-05-16** (commit b43ed8c; operator approved 6/6 + 5 visual checks)
- [x] Verify `.env.local.example` is complete before Phase 1 plan execution — **folded D-11**: keys complete except `DATABASE_URL` (added by Plan 01-01)
- [x] Confirm pnpm vs npm package manager preference before Phase 1 init — **folded D-01**: pnpm
- [x] Plan 02-01: Drizzle schema (12 tables) + OrgScope + getOrgContext + D-07 type tests — **completed 2026-05-17** (commits 75b397e, e7c6b43, 2fff189); SF-M4 (try/catch around `await auth()`) closed in `lib/auth/context.ts:25-32`; `tsc --noEmit` intentionally failing on `tests/types.ts` until Plan 02-04 ships repository skeletons
- [~] Plan 02-02: Operator manual config — **PARTIAL completed 2026-05-17** (SUMMARY: `.planning/phases/02-data-layer/02-02-SUMMARY.md`). Done: Clerk Org Roles (3 effective; `org:` prefix to strip in webhook handler), Session Token publicMetadata claim, Svix webhook endpoint with 4 events, `DIRECT_URL` populated (BUT: legacy IPv6-only hostname — see SF-DB-2). Deferred (blocker SF-DB-1): `DATABASE_URL_TEST` + `DIRECT_URL_TEST` until Supabase test project resolved.
- [x] Plan 02-03: Drizzle migrations + drizzle.config DIRECT_URL split + schema push — **FULL completed 2026-05-17** (SUMMARY: `.planning/phases/02-data-layer/02-03-SUMMARY.md`). Tasks 1-3 shipped via commits `c1dcf6f`, `0bbf321`, `f443cd0`. Task 4 closed post-commit after SF-DB-2 1-line fix: `pnpm db:migrate` applied both migrations cleanly; live dev DB verified 12/12 tables + 10/10 RLS-enabled tenant tables + 10/10 org_isolation policies + 40 GRANTs + D-03a CHECK.
- [x] Plan 02-04: 9 repository skeletons under `lib/db/repositories/*.ts` — **FULL completed 2026-05-17** (SUMMARY: `.planning/phases/02-data-layer/02-04-SUMMARY.md`). Commits `2973555` (4 critical: Policies + Acknowledgments + Users + PolicyVersions) and `e71000a` (5 remaining: PolicyAssignments + Departments + AiGenerations + Notifications + WorkflowStages). 351 lines across 9 files. `pnpm tsc --noEmit` exits 0 (~2.7s) — closes Plan 02-01 Task 3 baseline failure; D-07 type tests in `tests/types.ts` now actively enforce ADR-018 + ADR-005. 1 Rule-1 deviation: Acknowledgments header switched from `//` to `/** */` block-comment (TS directive-scanner collision); acceptance substrings preserved.
- [ ] Plan 02-05: svix install + Clerk webhook handler + middleware SF-M4 fold (still needed in middleware.ts:51 + 61) — **next**
- [ ] Plan 02-06: ts-morph + L-05 check-db-imports + L-06 check-rls + D-08 check-schema + verify:phase-2 wiring

### Blockers

- **SF-DB-1**: Plan 02-06 (RLS property test via `scripts/check-rls.ts` + schema audit via `scripts/check-schema.ts`) blocked on missing `DATABASE_URL_TEST` + `DIRECT_URL_TEST` env vars. Root cause: operator Supabase free-tier account at 2-project limit (`policypilot-dev` + `realestate`). Resolution options:
  - **A (recommended):** Pause `realestate` project in Supabase Dashboard (data retained 90 days, restorable with one click), create `policypilot-test`, run Plan 02-06, then unpause `realestate`.
  - **B:** Upgrade Supabase organization to Pro (~$25/mo, removes the project-count limit).
  Plans 02-03 (partial — code artifacts done, live push deferred to SF-DB-2), 02-04, 02-05 proceed unblocked. Halt before Plan 02-06 until A or B chosen AND SF-DB-2 resolved.
- **SF-DB-2 (RESOLVED 2026-05-17)**: `DIRECT_URL` in `.env.local` updated from legacy IPv6-only `db.kdoahaxhmaftxaiwbtdw.supabase.co:5432` to Session-pooler form `aws-1-us-east-1.pooler.supabase.com:5432` (same hostname as DATABASE_URL, port 5432 instead of 6543, user pattern `postgres.<project_ref>`). `pnpm db:migrate` ran clean; live dev DB has all 12 tables + 10 RLS policies + 40 GRANTs + D-03a CHECK. Verification artifact at `.tmp/verify-dev-db.ts` (gitignored).
- **SF-WHSEC-1**: The Clerk webhook signing secret (`whsec_...`) was pasted into the chat transcript during Plan 02-02 checkpoint resolution. Recommend rotating it via Svix Dashboard before Plan 02-05 testing reaches a real dev tunnel. One-click rotation; no code change required. Closed once rotation done.

### Phase 2 follow-ups (deferred — opportunistic cleanup)

Items surfaced during Phase 2 planning + plan-checker review (2026-05-17) that are intentionally deferred. None block Phase 2 success criteria.

- **SF-W5** Plan 02-05 webhook handler writes `clerk_events` BEFORE dispatch. If dispatch silently fails, Clerk receives 200 and does not retry. Phase 7 should invert ordering OR add structured logging + alerts. (Plan-checker WARNING-05, 2026-05-17.)

### Phase 1 PR-review follow-ups (deferred — opportunistic cleanup)

Surfaced by `/pr-review-toolkit:review-pr` against PR #1 head `e3689d3` (silent-failure-hunter + comment-analyzer + code-reviewer). SF-H4, SF-M3, and the phase-reference comment rot were addressed in `2438f42` and `723ca58`. The items below are real findings that were intentionally deferred — none block Phase 1, none touch production code paths in ways that affect ROADMAP success criteria. Pick up when convenient (e.g. on a `/gsd-quick` between phases) or fold into the relevant phase plan if you're already touching the file.

**Silent-failure hardening** (verify scripts — operator-UX, not Phase-1-criterion gaps):

- **SF-H1** `scripts/check-foundation.ts:62-73, 178-192` — when `spawnSync` sets `result.error` (ENOENT, EACCES), both stdout/stderr are empty; current code reports the generic literal `"tsc failed"`. Branch on `result.error` first, surface `code` + `message`.
- **SF-H2** `scripts/check-foundation.ts:175, 191` — `result.status === null` (signal-killed, e.g. OOM/SIGTERM) is currently masked as `"unknown"`. Surface `result.signal` explicitly.
- **SF-H3** `scripts/check-artifacts.ts:776-784` — server-only walker doesn't try/catch `readdirSync`/`readFileSync` and doesn't skip symlinks. A permission flip mid-walk crashes the whole gate; a symlink loop hangs. Wrap each fs call + use `entry.isSymbolicLink()`; print files-walked count so near-zero is obvious.
- ~~**SF-M1** `scripts/check-db.ts:30-33` — surface `err.constructor.name` (e.g. `PostgresError` / `AbortError`) on the catch path.~~ **CLOSED by C-1 in `764df7a`** — bound catch now surfaces `${err.name}: ${err.message}` with the gate-context prefix `"Drizzle smoke check failed: …"`. Strictly more informative than `err.constructor.name`.
- **SF-M4** `middleware.ts:74, 85` — no try/catch around `await auth()`. Real production gap, but observability is acknowledged as a Phase-2+ concern (no logger wired). Fold into Phase 2 logging work, not now.
- **SF-M5** `scripts/check-artifacts.ts:28-30` — `read()` has no try/catch; TOCTOU between `exists()` and `read()` could nuke all 114 assertions on one transient FS hiccup. Wrap in try/catch, push a `fail()` Check, continue.
- **SF-L1** `scripts/check-foundation.ts:127` — `res.headers.get("location") ?? ""` ambiguates missing-header vs empty-header. Surface "Location header absent" explicitly.
- **SF-L2** `package.json:15` — `verify:phase-1` chain has `pnpm` shell invocation on the second half (`&& pnpm check:artifacts`), inconsistent with the IN-02 / `process.execPath` hardening on the first half. Cosmetic.

**Comment cleanup** — ~~all closed by `a58469d` (W1 refactor stripped the "Plan 01-05 strict regex, relaxed to substring" + "this file contains the needle" + "Plan 01-04 verify-block" comments) and `4582225` (N-3 trimmed the "Phase 1" coupling)~~. The remaining `Plan 01-NN` mentions in `scripts/check-artifacts.ts` are stable section dividers + frozen plan-doc anchors per the `.coderabbit.yaml` profile.

**Code-reviewer nits** (low-confidence, can defer indefinitely):

- `middleware.ts:75` — `as { role?: string } | undefined` cast on `sessionClaims?.publicMetadata`. Mirroring the `in/typeof` guard pattern from `scripts/check-db.ts` would be cleaner but the branch is dead in Phase 1. Defer to Phase 3 admin-matcher rewrite.
- `app/(marketing)/layout.tsx:28` — hardcoded `© 2026` footer. Bump annually or wire `new Date().getFullYear()`. Trivial.
- `app/(marketing)/pricing/page.tsx:73` — "Annual save 20%" reads ambiguously ("Save 20% annually"). Visible-to-users grammar nit.

---

### Phase 1 plan-checker findings (informational — not blocking)

1. **WARNING** — Plan 01-04 admin matcher pattern `/(admin)/(.*)` is dead code (route groups never appear in URLs). Acknowledged in code comment; Phase 3 will rewrite when real admin routes (`/dashboard`, `/policies`) land.
2. **WARNING** — Plan 01-01 Task 1 step 2 (`create-next-app` in non-empty repo root) carries a directory-overwrite risk. Fallback to temp + `Move-Item` is documented in the plan; execute-phase should treat the YES-to-overwrite path as fallback if the operator confirms collision risk.
3. **INFO** — `any`-detection regex in Plan 01-04 verify catches `: any,` / `: any)` but not `as any` / `<any>`. `tsc --noEmit` with strict mode would catch any genuine misuse, so the gap is theoretical.

### Parking lot (operator-tracked, do not address in MVP)

- DocTract pricing — verify before launch (closest real competitor)
- SAM.gov registration — post milestone 2 ($10K MRR)
- Slack integration — v1.1, not MVP

---

## Session Continuity

- **Ingest**: complete — FOUNDRY 9-document set ingested with 0 BLOCKERs / 0 WARNINGs (see `.planning/intel/SYNTHESIS.md`)
- **Roadmap**: created `2026-05-15` — derived directly from ADR-007's 8-phase locked build sequence
- **Phase 1 context**: captured `2026-05-15` via `/gsd-discuss-phase --all` — 15 implementation decisions (D-01 to D-15) at `.planning/phases/01-foundation/01-CONTEXT.md`
- **Phase 1 plans**: drafted `2026-05-15` via `/gsd-plan-phase 1 --auto` — 5 plans in 4 waves at `.planning/phases/01-foundation/01-0{1..5}-PLAN.md`; passed gsd-plan-checker verification
- **Phase 2 context**: gathered `2026-05-17` via `/gsd-discuss-phase 2 --all` under the operator's no-clarifying-questions directive. Absorbed 6 USER-LOCKED deliverables from ADR-023 + ADR-025 (L-01..L-06). Added 9 HOW decisions (D-01..D-09): hand-written `0001_rls_policies.sql` over inline `sql.raw()`; `org_id` denormalization onto five child tables; four-event Clerk webhook scope + new `clerk_events` idempotency table; `getOrgContext()` reads `publicMetadata.role` via the session-claim template; `DIRECT_URL` + `DATABASE_URL_TEST` env-var split; skeleton repository surface with type-system enforcement of ADR-018/005 invariants via `@ts-expect-error`; six-check `pnpm verify:phase-2` adding a schema audit; Clerk Dashboard role definitions (operator manual step). Folded Phase-1 PR-review todo SF-M4 (try/catch around `auth()`).
- **Last session**: Phase 2 execute-phase Plan 02-03 (2026-05-17 13:58:55Z–14:12:53Z UTC, 14min) — 3 task commits `c1dcf6f`, `0bbf321`, `f443cd0` + SUMMARY.md at `.planning/phases/02-data-layer/02-03-SUMMARY.md`. On-disk migration artifacts shipped: drizzle.config DIRECT_URL split (D-05), `drizzle/0000_initial.sql` (12 tables auto-DDL), `drizzle/0001_rls_policies.sql` (10×RLS + 10×POLICY + 10×GRANT + 1×CHECK on users for D-03a), `_journal.json` with both entries (RESEARCH Pitfall 3 mitigated). Deviations: 2 Rule-3 auto-handled (`.env.local.test` placeholder due to SF-DB-1; `drizzle/` `.gitignore` line removed) + 1 Rule-4 stopped-and-surfaced (Task 4 live DB push deferred — SF-DB-2 surfaced; resolved post-commit).
- **Latest session**: Phase 2 execute-phase Plan 02-04 (2026-05-17 14:26:23Z–14:30:38Z UTC, ~4m15s) — 2 task commits `2973555` (Task 1: Policies + Acknowledgments + Users + PolicyVersions) and `e71000a` (Task 2: PolicyAssignments + Departments + AiGenerations + Notifications + WorkflowStages) + SUMMARY.md at `.planning/phases/02-data-layer/02-04-SUMMARY.md`. 9 repository files / 351 lines under `lib/db/repositories/`. Each: `'server-only'` + OrgScope-first methods + ADR-019 `where(eq(orgId))` + no raw `@/lib/db` import + RESEARCH Pitfall 6 cited. `pnpm tsc --noEmit` exits 0 (~2.7s); D-07 type tests now active. 1 Rule-1 deviation (Acknowledgments header `//` → `/** */` because TypeScript scans line-comments for `@ts-expect-error` directives — TS2578 collision; acceptance substrings ADR-018 / append-only / Pitfall 6 preserved).
- **Next session entry point**: `.planning/phases/02-data-layer/02-05-PLAN.md` → `/gsd-execute-phase 2` to resume the chain at Plan 02-05 (svix install + Clerk webhook handler + middleware SF-M4 fold — code-only, no live DB dependency).

---

## Phase Roster

| # | Phase | Requirements | Status |
|---|-------|--------------|--------|
| 1 | Foundation | REQ-product-vision | Complete — 5/5 plans shipped 2026-05-16 (PR #1) |
| 2 | Data Layer | REQ-user-roles, REQ-multi-tenancy | In progress — Plans 02-01 + 02-02 (partial) + 02-03 + 02-04 shipped 2026-05-17 (4 / 6 plans complete); next: Plan 02-05 (Clerk webhook handler + SF-M4 middleware fold). One open blocker: SF-DB-1 (test project free-tier limit blocks Plan 02-06 only); SF-DB-2 RESOLVED. |
| 3 | Admin UI | REQ-policy-library, REQ-policy-lifecycle, REQ-access-control | Not started |
| 4 | AI Layer | REQ-ai-policy-assistant, REQ-ai-usage-rules | Not started |
| 5 | Employee Portal | REQ-acknowledgment-tracking, REQ-acknowledgment-rules | Not started |
| 6 | Billing | REQ-tier-starter, REQ-tier-growth, REQ-tier-business | Not started |
| 7 | Crons + Email | REQ-notification-system | Not started |
| 8 | Validation | REQ-compliance-dashboard, REQ-integrations, REQ-acceptance-criteria | Not started |
