---
phase: 02
phase_name: "Data Layer"
project: "PolicyPilot"
generated: "2026-05-19"
counts:
  decisions: 10
  lessons: 12
  patterns: 10
  surprises: 8
missing_artifacts:
  - "02-UAT.md (operator deferred live-smoke to Phase 3 via Plan 02-06 approval; no UAT artifact written)"
---

# Phase 2 Learnings: Data Layer

7 plans shipped across 4 waves (02-01..02-07) + 4-gate retroactive audit. 35 commits over two days (2026-05-17 → 2026-05-18). Phase 2 established the tenant-isolation mechanism for the rest of the project — every downstream phase relies on `OrgScope`, the 9 repositories, the L-05 import allow-list, and the L-06 cross-org property test.

## Decisions

### ADR-025 — RLS via per-transaction JWT injection + `SET LOCAL ROLE`
User-facing repository traffic enters `withOrgScope(ctx, fn)` which opens a Drizzle transaction, runs `SET LOCAL ROLE authenticated` + `SELECT set_config('request.jwt.claims', <claims>, true)`, then dispatches to repository methods. RLS policies evaluate against the injected `org_id` claim. Allow-listed cross-org callers (webhooks, crons, test harness) continue to use raw `db` at the connection-level `postgres` role (BYPASSRLS).

**Rationale:** Two-layer defense (application `where` + database RLS) without the redundancy of a dual-pool split. Rejected alternatives: dual-pool (redundant with allow-list routing) + accept-the-gap (sacrifices the SMB-compliance "isolation at both layers" claim for negligible perf gain).
**Source:** 02-CONTEXT.md / .planning/intel/decisions.md ADR-025

---

### D-02 — `org_id` denormalized onto 5 child tables
`policy_versions`, `policy_assignments`, `acknowledgments`, `notifications`, `workflow_stages` each carry a non-nullable `org_id` FK to `organizations.id`. Every tenant-scoped table now has a direct `org_id` column, enabling uniform `USING (org_id = auth.jwt()->>'org_id')` RLS across 9 of the 10 tables.

**Rationale:** EXISTS-subquery RLS works but the planner can't always inline it; cross-table reads hit the parent's RLS twice. Denormalization makes RLS evaluate on the row itself in one comparison. ~16 bytes/row × 5 tables × low-write-volume SMB workloads = negligible cost.
**Source:** 02-CONTEXT.md D-02

---

### D-01 — Two-migration split (DDL + RLS hand-written)
`drizzle-kit generate` produces `drizzle/0000_initial.sql` (CREATE TABLE for 12 tables). A separate hand-written `drizzle/0001_rls_policies.sql` carries 10× `ENABLE ROW LEVEL SECURITY` + 10× `CREATE POLICY org_isolation` + 10× `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated` + 1× D-03a `CHECK` constraint on users.

**Rationale:** Drizzle 0.45's `pgPolicy()` syntax is nascent and undocumented for the Supabase + `set_config` pattern; hand-written SQL is the published working approach and is plain to review. Splitting schema-vs-policy migrations keeps each file single-purpose and grep-able.
**Source:** 02-CONTEXT.md D-01

---

### D-03 — 4-event Clerk webhook scope + idempotency via `clerk_events`
Phase 2 handles exactly four Clerk events: `organization.created`, `user.created`, `organizationMembership.created`, `organizationMembership.updated`. Idempotency via new `clerk_events(id text primary key)` table — handler runs `INSERT INTO clerk_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`; 0 rows = already processed → 200 short-circuit. Delete events (`*.deleted`) log-only per D-03c; retention design is Phase 7+.

**Rationale:** ROADMAP criterion 3 names three `*.created` events; adding `organizationMembership.updated` makes role changes a first-class operation. Dedicated idempotency table mirrors proven `stripe_events` pattern (ADR-020); generalizes to `*.updated` events better than `ON CONFLICT` on a `unique` constraint.
**Source:** 02-CONTEXT.md D-03 / 02-05-PLAN.md

---

### D-04 — Role lives in Clerk `publicMetadata.role`, propagated to `users.role`
`getOrgContext()` reads `(sessionClaims?.publicMetadata as { role?: unknown }).role` (stricter than middleware's narrowing). Webhook writes role to BOTH `users.role` (DB) AND Clerk's `publicMetadata.role` via Backend API — both writes are load-bearing for `getOrgContext()` to work.

**Rationale:** Clerk's `orgRole` is `org:admin`/`org:member` by default — doesn't align with our `{admin, reviewer, employee}` enum (reviewer is a PolicyPilot concept not a Clerk concept). `publicMetadata.role` propagates into `sessionClaims` automatically via session-claim template.
**Source:** 02-CONTEXT.md D-04 / 02-07-SUMMARY.md (CR-01 closure)

---

### D-05 — `DIRECT_URL` env split with `DATABASE_URL` fallback
`DATABASE_URL` (Transaction pooler :6543, prepare=false) — runtime queries. `DIRECT_URL` (Session pooler :5432) — migrations. `drizzle.config.ts` reads `DIRECT_URL ?? DATABASE_URL` with `console.warn` on fallback. Test variants: `DATABASE_URL_TEST` + `DIRECT_URL_TEST`.

**Rationale:** drizzle-kit migrate runs DDL that doesn't work cleanly over pgbouncer transaction-mode pools (CREATE INDEX CONCURRENTLY, some ALTER TABLE forms fail). Back-compat fallback keeps local dev working without operator action; production verify gates fail loudly until operator sets `DIRECT_URL`.
**Source:** 02-CONTEXT.md D-05 / 02-03-PLAN.md

---

### D-06 — Skeleton-with-minimum-bodies repositories
All 9 repository modules under `lib/db/repositories/` exist as files with type-safe exports. Phase 2 fills only methods needed by `scripts/check-rls.ts` happy-path SELECT + the D-07 type invariants. Phase 3+ fills the rest. Allow-listed cross-org callers (webhooks) do NOT use repositories — raw `db` directly.

**Rationale:** Phase 2's job is to lock the *mechanism* (OrgScope + repositories + RLS). The *features* belong to their phases. Premature stubbing would couple Phase 2 to Phase-3+ requirements and clutter execute-phase with bodies needing rework.
**Source:** 02-CONTEXT.md D-06 / 02-04-PLAN.md

---

### D-07 — `@ts-expect-error` type tests lock ADR-018 + ADR-005 invariants
`tests/types.ts` ships 3 active directives: `void Acknowledgments.update`, `void Acknowledgments.delete`, `void Policies.create({} as any, { tldrSummary: 'x' })`. `tsc --noEmit` fails if any line stops erroring — i.e., if a future commit accidentally adds the forbidden export.

**Rationale:** ADR-023 § "type system enforces the invariants, not discipline" needs an actual test. `@ts-expect-error` is the minimum-viable form. Cheaper than runtime tests for type-system enforceable invariants.
**Source:** 02-CONTEXT.md D-07 / 02-01-PLAN.md / tests/types.ts

---

### D-08 — 7-check `pnpm verify:phase-2` orchestrator
Chain: (1) tsc --noEmit (2) drizzle-kit migrate against TEST DB (3) L-05 AST allow-list (4) L-06 cross-org property test (5) D-08 schema audit via pg_catalog (6) check-artifacts (7) D-03a stale-null users audit. Modeled on Phase 1's verify:phase-1 shape.

**Rationale:** One orchestrator per phase that the operator runs to confirm all success criteria green. Adding step 5 (schema audit) closes the "migration claimed it but a transient rollback left it absent" gap that pure migration runs miss.
**Source:** 02-CONTEXT.md D-08 / 02-06-PLAN.md / scripts/check-data-layer.ts

---

### Worktree isolation disabled for Phase 2
Plans ran sequentially on the main working tree without `isolation="worktree"`, despite project config `use_worktrees: true`. Each executor agent committed directly to main.

**Rationale:** Phase 2 plans 02-03/05/06 need gitignored `.env.local` for DB credentials + Clerk webhook secret. Worktrees create separate working directories — gitignored files don't carry across, breaking the schema push + verify chain. With `parallelization: false` already in config, sequential-on-main has no parallelism cost.
**Source:** orchestrator decision logged in Plan 02-01 executor brief

---

## Lessons

### Clerk role keys carry `org:` prefix; webhook must strip
D-09 specified unprefixed lowercase keys (`admin`, `reviewer`, `employee`) but Clerk's role API always prefixes (`org:admin`, `org:reviewer`, `org:employee`). The webhook handler's `asAppRole` strips via `replace(/^org:/, '')` before passing to the DB `users.role` column.

**Context:** Discovered during Plan 02-02 dashboard inspection — fundamental Clerk behavior, not configurable. Mapping is a permanent contract in the webhook handler.
**Source:** 02-02-SUMMARY.md Task 1 / 02-05-PLAN.md asAppRole helper

---

### Supabase legacy direct-connection hostname is IPv6-only (SF-DB-2)
The `db.<project_ref>.supabase.co:5432` hostname returns `ENOTFOUND` from Windows + IPv4-only environments. Supabase deprecated it for IPv4 reachability in Jan 2024. Fix: use Session-pooler form `aws-1-us-east-1.pooler.supabase.com:5432` with user `postgres.<project_ref>` (same hostname as the Transaction pooler at :6543, different port).

**Context:** Surfaced mid-execution when Plan 02-03 Task 4 [BLOCKING] schema push failed. Required mid-phase `.env.local` fix.
**Source:** 02-03-SUMMARY.md POST-COMMIT UPDATE / STATE.md SF-DB-2

---

### Supabase free-tier 2-project ceiling
Operator account hit the ceiling (`policypilot-dev` + `realestate`). Options: pause an existing project (90-day grace, one-click restore) OR upgrade to Pro. Operator paused `realestate` to free a slot.

**Context:** Discovered when Plan 02-02 Task 3 attempted to create `policypilot-test`. Blocker SF-DB-1.
**Source:** 02-02-SUMMARY.md Task 3

---

### `tsx --env-file=.env.local.test` placeholder pattern doesn't work cleanly
The original Plan 02-03 `db:migrate:test` script reads `.env.local.test` for credentials. When `DATABASE_URL_TEST` and `DIRECT_URL_TEST` were populated in `.env.local` instead (per Plan 02-02 D-05), the test migration couldn't find them. Fix: orchestrator `check-data-layer.ts` reads `*_TEST` from `.env.local` (loaded by parent `tsx --env-file=.env.local`) and remaps to canonical `DATABASE_URL` / `DIRECT_URL` via `spawnSync`'s `env` field.

**Context:** Surfaced during Plan 02-06 first verify run. Environment remapping is more reliable than a parallel env file.
**Source:** 02-06-SUMMARY.md Deviations § Rule-3 db:migrate:test env-override

---

### drizzle-kit `--custom` flag is load-bearing (RESEARCH Pitfall 3)
Hand-dropping a `.sql` file into `drizzle/` does NOT register it in `_journal.json`. `drizzle-kit migrate` silently skips unregistered files. The fix: `pnpm db:generate --custom --name=rls_policies` creates an empty file AND adds the journal entry.

**Context:** Pre-known via 02-RESEARCH.md; Plan 02-03 Task 2 verified by inspecting `_journal.json` after the `--custom` invocation.
**Source:** 02-RESEARCH.md Pitfall 3 / 02-03-SUMMARY.md

---

### TS scans `//` line-comments for `@ts-expect-error`
A `//` header comment containing the literal phrase `the @ts-expect-error directive` was interpreted by `tsc` as a real directive applied to the next line, producing TS2578 "Unused '@ts-expect-error' directive." Fix: use a `/** ... */` JSDoc block comment for header documentation that needs to mention `@ts-expect-error`.

**Context:** Surfaced during Plan 02-04 Task 1 verify; affected `lib/db/repositories/acknowledgments.ts` header.
**Source:** 02-04-SUMMARY.md Rule-1 deviation

---

### D-04 dual-write contract was incomplete in must_haves (CR-01)
D-04 specified: *"the webhook handler writes our enum into `users.role` AND into the Clerk user's `publicMetadata.role`."* But the must_haves block in 02-05-PLAN.md only enforced the DB write. The executor shipped only the DB half. Verifier returned green (must_have satisfied). Security audit had no threat-model entry for "asymmetric DB↔Clerk write." Code reviewer caught it by reading code against INTENT, not against plan. Closed by Plan 02-07.

**Context:** This is a plan-completeness bug, not an execution bug. Decision text was right; must_haves enumeration was wrong.
**Source:** 02-REVIEW.md CR-01 / 02-07-SUMMARY.md

---

### Verifier + Security audits can be GREEN while real bugs exist
The four audit gates check different things: Verifier — "does code match must_haves?"; Security — "are threat-model mitigations present?"; Nyquist — "does test coverage prove the invariants?"; Code Review — "does code do the right thing given intent?". Only Code Review and Nyquist caught CR-01. Lesson: orthogonal gates are not redundant — each catches a different class of bug.

**Context:** Cross-gate synthesis from the 4-gate retroactive audit (Verifier `human_needed` + Security `clean` + Nyquist `gaps_found` + Code Review `issues_found`).
**Source:** 02-VERIFICATION.md / 02-SECURITY.md / 02-VALIDATION.md / 02-REVIEW.md

---

### Pooler password lookup has cache-warming lag
First `pnpm verify:phase-2` run by the operator immediately after a Supabase password reset failed with `28P01 password authentication failed for user "postgres"`. Retry ~30 seconds later succeeded with identical credentials.

**Context:** Supavisor (Supabase's pooler) appears to cache project credentials with a short TTL after rotation. Document this as a known transient — retries after password reset are expected.
**Source:** Plan 02-06 operator approval feedback

---

### Secrets in chat transcripts are persistent (SF-WHSEC-1)
Operator pasted `whsec_...` Clerk signing secret into chat during Plan 02-02 checkpoint resolution. The transcript carries this forever. Recommendation captured in STATE.md as SF-WHSEC-1: rotate via Svix Dashboard before live traffic.

**Context:** Operator memory `secrets-never-in-chat.md` exists for a reason. The transcript captures everything, including chat-pasted secrets.
**Source:** 02-02-SUMMARY.md SF-WHSEC-1 / STATE.md follow-up

---

### Verify orchestrator's `firstNonEmptyLine` can capture wrong error
`check-data-layer.ts` uses `firstNonEmptyLine(stderr + stdout)` to summarize child-process failures. drizzle-kit prints `"No config path provided, using default 'drizzle.config.ts'"` to stdout as INFO; this informational line got captured as the "error detail" when migrate actually failed for a different reason. Fix: orchestrators should look for `[ERROR]` markers or last-line patterns, not first non-empty line.

**Context:** Discovered when [2/7] FAIL surfaced the wrong message. Diagnostic noise made root-causing slower.
**Source:** Plan 02-06 first-run output

---

### Phase 1 regression discovered during Phase 2 close-out (REG-P1-01)
Plan 02-05's `middleware.ts` SF-M4 try/catch fold changed runtime behavior on the dev-only `/sign-in-success` placeholder route. `pnpm verify:phase-1` check 6/6 now fails with `TypeError: fetch failed`. Other 5/6 Phase-1 checks pass. The route is unused in production, so no impact; but the regression-gate output is misleading and warrants investigation during Phase 3 setup.

**Context:** Caught by the workflow's `regression_gate` step when running verify:phase-1 after Phase 2. The post-merge regression gate is doing its job — even on minor middleware changes.
**Source:** STATE.md REG-P1-01

---

## Patterns

### OrgScope pattern — type-carried tenant context + transaction
`OrgScope = OrgContext & { tx }` is passed as the first parameter to every repository method. `withOrgScope(ctx, fn)` opens the transaction, sets the JWT claim, and dispatches. Single source of tenant context; no per-method threading.

**When to use:** Any tenant-isolated query path. Generalizes beyond Phase 2 — Phases 3-7 use this for every repository call.
**Source:** lib/db/scoped.ts / lib/db/repositories/*.ts / 02-01-PLAN.md

---

### AST allow-list via ts-morph
`scripts/check-db-imports.ts` walks every `.ts`/`.tsx` under `app/`, `lib/`, `scripts/`; flags any import declaration whose source resolves to `@/lib/db` (the index) UNLESS the file path matches one of the 8 allow-list entries. AST-based, not regex — handles `import db from`, `import { db } from`, and re-exports robustly.

**When to use:** Bounding a dependency to a discrete list of files. Pairs with a CI gate. Pattern reuses for limiting other architectural escape hatches (e.g., "only X files may import Y").
**Source:** scripts/check-db-imports.ts / 02-RESEARCH.md Pattern 4

---

### Positive control before negative property test
`scripts/check-rls.ts` runs `SELECT 1 FROM organizations WHERE id = '<orgA.id>'` (must return 1) BEFORE the cross-org leak negative test (must return 0). Vacuously-passing tests (over-restrictive RLS that blocks everything) fail the positive control loudly.

**When to use:** Any property test where "0 rows" could mean "test passed" OR "the test ran against the wrong context." Positive control disambiguates.
**Source:** scripts/check-rls.ts / 02-RESEARCH.md Pitfall 1

---

### `@ts-expect-error` compile-time invariants
`tests/types.ts` ships 3 directives that MUST remain compile errors. `tsc --noEmit` is the test runner. If a future commit accidentally adds the forbidden export, the directive becomes "unused" and tsc fails.

**When to use:** Any invariant expressible in the type system. Cheaper than runtime tests; the "test framework" is `tsc`.
**Source:** tests/types.ts / 02-01-PLAN.md D-07

---

### Sentinel-substring verification for secret files (secrets-never-in-chat)
Verify `.env.local` keys without echoing values: check that the file contains specific substrings (`whsec_`, `:6543`, `:5432`, `postgresql://`). Exit codes and substring presence/absence are the only outputs; values stay in the file.

**When to use:** Any orchestrator step that needs to confirm credentials are present/well-formed without exposing them in logs, tool calls, or chat transcripts.
**Source:** 02-02-PLAN.md Task 4 / operator memory `secrets-never-in-chat.md`

---

### Result[] accumulator + spawnSync + firstNonEmptyLine orchestrator
`check-data-layer.ts` extends `check-foundation.ts` pattern: an array of `{ ok, label, detail? }` results, each populated by `spawnSync(process.execPath, [tsx, script], { env: {...} })`. CVE-2024-27980 hardening: invoke via `process.execPath` + JS entry, never via `shell: true`.

**When to use:** Any multi-check verification gate. Composable, parallelizable later (Phase 1 + Phase 2 use this; Phase 3+ will extend).
**Source:** scripts/check-data-layer.ts / 02-PATTERNS.md

---

### Body-before-verify for svix webhooks (RESEARCH Pitfall 4)
`await req.text()` BEFORE `svix.Webhook.verify(payload, headers)`. Consuming the stream via `req.json()` invalidates the signature; svix needs the raw payload.

**When to use:** Any webhook handler that uses svix (Clerk, Stripe via Svix, etc.). Pattern generalizes to any signature-verified webhook.
**Source:** app/api/webhooks/clerk/route.ts / 02-RESEARCH.md Pitfall 4

---

### ON CONFLICT DO NOTHING RETURNING id for idempotency
Webhook handler runs `INSERT INTO clerk_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`. If 0 rows are returned, the event was already processed — return 200 immediately without re-applying. Mirrors the `stripe_events` pattern from ADR-020.

**When to use:** Any external-event ingestion path where retries are expected. Single SQL statement handles both first-time + duplicate cases.
**Source:** app/api/webhooks/clerk/route.ts / 02-CONTEXT.md D-03b

---

### 4-gate retroactive audit pattern (Verifier + Security + Nyquist + Code Review)
Spawn 4 specialized audit agents in parallel, each producing a distinct artifact (`VERIFICATION.md`, `SECURITY.md`, `VALIDATION.md`, `REVIEW.md`). They read source code (read-only) and write to non-overlapping files. Total wall time ≈ one agent's duration.

**When to use:** End-of-phase quality gate. The four perspectives are ORTHOGONAL: completeness × defensive correctness × test adequacy × code quality. Each catches a different class of bug.
**Source:** Phase 2 audit invocation / cross-gate synthesis

---

### Skeleton-with-minimum-bodies for future-phase contracts
Ship typed exports with stubbed bodies (`throw new Error('Not yet implemented — Phase N')`). Type-system contract complete; bodies for downstream phases. The current phase tests the contract (type tests); future phases test the behavior.

**When to use:** Cross-phase contracts where the type surface stabilizes early but the implementation lands later. Avoids "we need to write the whole thing now to lock the type."
**Source:** lib/db/repositories/*.ts / 02-04-PLAN.md D-06

---

## Surprises

### SF-DB-2 surfaced mid-execution (legacy Supabase hostname)
Plan 02-03 Task 4 [BLOCKING] schema push failed because Plan 02-02 wrote `DIRECT_URL` with the legacy IPv6-only hostname. Required a 1-line `.env.local` fix mid-phase. **Impact:** Plan 02-03 partial-completed, then post-commit closure after the fix landed. Added ~15 minutes of debugging + a new STATE.md blocker entry.

**Source:** 02-03-SUMMARY.md / STATE.md SF-DB-2

---

### Verify gate produced misleading error
`[2/7] FAIL — drizzle-kit migrate against TEST DB — No config path provided, using default 'drizzle.config.ts'` — the printed error message was actually drizzle-kit's INFO stdout, not the failure cause. `firstNonEmptyLine(stderr+stdout)` captured the wrong line. **Impact:** Misdirected debugging on first verify run.

**Source:** Plan 02-06 first-run output / scripts/check-data-layer.ts

---

### Code reviewer caught CR-01 that 3 other audit gates missed
2 of the 4 audits (Verifier, Security) returned green for the code reviewer's CRITICAL CR-01 finding. CR-01 (webhook missing Clerk publicMetadata.role write) would crash every authenticated request after sign-up — but verifier checked must_haves (which were incomplete) and security checked threat-model entries (no entry for this gap). **Impact:** Validated the value of running all four gates — green from one gate doesn't mean clean.

**Source:** 02-REVIEW.md CR-01 / 02-VERIFICATION.md (independent green verdict)

---

### Clerk session token already had publicMetadata configured
Plan 02-02 Task 1 Step B (customize session token to add `publicMetadata` claim) was already done by the operator in a prior session. The JSON template `{"publicMetadata": "{{user.public_metadata}}"}` was present. **Impact:** Saved a setup step; documented as "already configured" in Plan 02-02 SUMMARY.

**Source:** 02-02-SUMMARY.md Task 1 Step B

---

### Plan 02-04's tsc failure from Plan 02-01 was intentional
Plan 02-01 shipped `tests/types.ts` importing repository modules that didn't exist yet. `pnpm tsc --noEmit` failed with `Cannot find module '@/lib/db/repositories/acknowledgments'` for ~3 plans (02-01 → 02-02 → 02-03 → 02-04). Plan 02-04 shipped the skeletons and closed the failure. **Impact:** Verifying tsc on every commit required understanding the deferred-baseline; verify scripts skipped tsc until 02-04 landed.

**Source:** 02-01-SUMMARY.md verification section / 02-04-SUMMARY.md (closure)

---

### 35 commits to ship Phase 2
Original plan suggested ~6 plans × ~3 commits = ~18 commits. Actual: 35. Drivers: per-task atomic commits in execute-plan workflow + metadata commits per plan + mid-phase blocker fixes (SF-DB-1, SF-DB-2) + 4-gate close-out audit + Plan 02-07 hotfix + ship-doc commit. **Impact:** PR diff is large but each commit is single-purpose; bisectable.

**Source:** git log

---

### Pooler password cache-warming lag (~30s after rotation)
First `pnpm verify:phase-2` run after the operator's Supabase test-project password reset failed with `28P01 password authentication failed for user "postgres"`. Identical credentials worked on retry ~30 seconds later. Suggests Supavisor caches project credentials with a short TTL after rotation. **Impact:** False-positive failures right after password resets — document as a known transient.

**Source:** Plan 02-06 operator approval feedback

---

### Phase 2's middleware fold broke a Phase 1 test (REG-P1-01)
The SF-M4 try/catch fold in Plan 02-05's `middleware.ts` changed runtime behavior on the dev-only `/sign-in-success` placeholder route. `pnpm verify:phase-1` check 6/6 now fails with `TypeError: fetch failed` — fetch couldn't reach the route at all. Other 5/6 Phase-1 checks pass. **Impact:** Regression gate output became misleading (only 1/6 actually broken, but it's a known harmless dev route).

**Source:** STATE.md REG-P1-01 / regression_gate step output

---
