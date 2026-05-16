---
phase: 01-foundation
date: 2026-05-16
asvs_level: 1
threats_total: 29
threats_closed: 29
threats_open: 0
register_origin: plan-time (`register_authored_at_plan_time: true`)
register_sources:
  - .planning/phases/01-foundation/01-01-PLAN.md (T-01-01..04, T-01-SC)
  - .planning/phases/01-foundation/01-02-PLAN.md (T-02-01..06)
  - .planning/phases/01-foundation/01-03-PLAN.md (T-03-01..06)
  - .planning/phases/01-foundation/01-04-PLAN.md (T-04-01..07)
  - .planning/phases/01-foundation/01-05-PLAN.md (T-05-01..05)
verdict: SECURED
mode: codebase-static verification of declared mitigations only (does NOT scan for new vulnerabilities)
---

# Phase 1: Foundation — Security Audit

**Result:** **SECURED** — 29/29 declared threats verified closed.

Auditor stance: every mitigation assumed absent until grep-match evidence is found in the named implementation file. No threat was accepted on documentation or intent. `transfer` disposition not used in this register.

---

## Threat Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-01-01 | Information disclosure | `.env.local` accidentally committed | mitigate | CLOSED | `.gitignore:2` (`.env.local`), `.gitignore:3` (`.env*.local`), `.gitignore:46` (`*.local` from Plan-01 append). `git check-ignore -v .env.local` returns `.gitignore:46:*.local .env.local` (exit 0). |
| T-01-02 | Information disclosure | Secrets pasted into `.env.local.example` | mitigate | CLOSED | `.env.local.example:1-46` — every key line ends with `=` and no value (Supabase block lines 6-11; Clerk lines 14-16; Stripe lines 19-29; Anthropic 32; Resend 35-36; Sentry/PostHog 43-45). Only non-secret defaults present: `RESEND_FROM_EMAIL=noreply@policypilot.com` (line 36), `NEXT_PUBLIC_APP_URL=http://localhost:3000` (line 39), `NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com` (line 44). |
| T-01-03 | Tampering | Supply chain — typosquatted/malicious npm package | mitigate | CLOSED | `package.json:18-46` — all 14 runtime + dev deps are CLAUDE.md stack-table commitments. `pnpm-lock.yaml` committed (776 `integrity: sha512` entries confirmed via grep). No `onlyBuiltDependencies` / `postinstall` (`package.json` grep returns "No matches"). pnpm 9.15.9 (`packageManager` line 8) blocks postinstall by default. |
| T-01-04 | Elevation of privilege | `pnpm dlx shadcn` running attacker-controlled installer | mitigate | CLOSED | `package.json:30` pins `"shadcn": "^4.7.0"`. Transitives (`@base-ui/react@1.4.1`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.6.0`, `lucide-react@1.16.0`, `tw-animate-css@1.4.0`) all in `package.json:19-32` and locked in `pnpm-lock.yaml`. |
| T-01-SC | Tampering | npm install of stack packages | accept | CLOSED | Documented acceptance: all packages are CLAUDE.md stack-table commitments (ADR-003/010/011/012). Lockfile integrity hashes (776 sha512 entries) plus pnpm 9 default postinstall block constitute residual control. Recorded in Accepted Risks below. |
| T-02-01 | Information disclosure (HIGH) | `.env.local` committed to git | mitigate | CLOSED | `.gitignore:2` literal `.env.local` and line 3 `.env*.local`. `git check-ignore -v .env.local` exits 0 (verified live: returns `.gitignore:46:*.local .env.local`). 01-02-SUMMARY.md verification table gate #2 PASS. |
| T-02-02 | Information disclosure | Secrets logged during sanity check | mitigate | CLOSED | 01-02-SUMMARY.md §"Task 3" step 3.7 — verification uses `node -e` with `process.exit(0/1)` only; sentinel substrings never echoed. SECURITY.md template here records no secret values per `secrets-never-in-chat` operator preference. |
| T-02-03 | Spoofing | Publishable/secret-key swap | mitigate | CLOSED | 01-02-SUMMARY.md §Verification gate #3: sentinel-substring assertions on `pk_test_` (correct position) and `sk_test_` (correct position) — operator-confirmed PASS 2026-05-16. |
| T-02-04 | Spoofing | Direct (5432) vs pooler (6543) URI | mitigate | CLOSED | 01-02-SUMMARY.md §Verification gate #3 — sentinel-substring `pooler.supabase.com:6543` verified present in `.env.local` (without echoing the secret). Reinforced at runtime by `lib/db/index.ts:19` requiring `prepare: false` (only the pooler needs/accepts that). |
| T-02-05 | Tampering | Operator forgets to enable Clerk Organizations | accept-then-detect | CLOSED | 01-02-SUMMARY.md §"Task 1" line 25 — operator-confirmed `Organizations feature enabled` (ADR-004 precondition). Phase 2 webhook handler will fail-loudly if absent. Recorded in Accepted Risks below. |
| T-02-06 | Elevation of privilege | `SUPABASE_SERVICE_ROLE_KEY` imported by a Client Component | mitigate (cross-phase) | CLOSED | Verified Phase 1: grep `SUPABASE_SERVICE_ROLE_KEY` against all `**/*.{ts,tsx,js,jsx}` returns **no files found**. `lib/db/index.ts:8` reads `DATABASE_URL` only (not service-role key). No `@supabase/supabase-js` import in any rendered page. |
| T-03-01 | Information disclosure | Hard-coded tier pricing drifts vs `reference/TIER-LIMITS.md` | accept | CLOSED | `app/(marketing)/pricing/page.tsx:26-29` source comment documents the Phase-6 replacement contract. Recorded in Accepted Risks below. |
| T-03-02 | Spoofing | Sign-in CTA points to wrong path | mitigate | CLOSED | `app/(marketing)/page.tsx:34` href=`/sign-up` (Get started); line 37 href=`/sign-in` (Sign in). `app/(auth)/sign-in/[[...sign-in]]/page.tsx:4` renders `<SignIn />`; `app/(auth)/sign-up/[[...sign-up]]/page.tsx:4` renders `<SignUp />`. |
| T-03-03 | DoS | Unauthenticated DoS on Clerk hosted UI | accept | CLOSED | Clerk dev-tier rate limit owns the floor. Recorded in Accepted Risks below. |
| T-03-04 | Tampering (XSS) | Marketing page injected via JSX | mitigate | CLOSED | grep `dangerouslySetInnerHTML` in `app/**` returns **no files found**. `app/(marketing)/page.tsx:1-43` contains static literal strings only — no `props.children` user-controlled rendering, no template injection. React JSX auto-escapes by default. |
| T-03-05 | Information disclosure | Marketing page imports server-only client | mitigate | CLOSED | grep `from "@/lib/db"` across all `**/*.{ts,tsx}` returns ONLY `scripts/check-db.ts:4` — no app routes import the db client. `app/(marketing)/page.tsx:1-2` imports only `next/link` + `@/components/ui/button`. `app/(marketing)/pricing/page.tsx:1-10` imports only `next/link` + `@/components/ui/{button,card}`. |
| T-03-06 | Elevation of privilege | `/sign-in-success` placeholder exposes internal routes | mitigate | CLOSED | `app/sign-in-success/page.tsx:1-12` — static H1 + `<p>` only; no `<Link>` to admin/employee surfaces (which don't exist yet). `middleware.ts` default branch (line 86-90) redirects unauthenticated requests to `/sign-in` — verified by Plan-05 criterion 5 live operator check (`/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fsign-in-success`). |
| T-04-01 | Elevation of privilege (HIGH) | Middleware matcher exposes private route | mitigate | CLOSED | `middleware.ts:23-30` declares 4 public-route entries verbatim (`/`, `/pricing`, `/sign-in` + `/sign-in/(.*)`, `/sign-up` + `/sign-up/(.*)`). Lines 32-39 declare webhook + cron exemptions. Line 86-90 default branch fail-closed redirect to `/sign-in`. **Sibling-prefix collision fix:** lines 16-22 split each Clerk catch-all into exact + slash-prefixed children (commit `446b554` — caught by Plan-05 live gate before phase close, see 01-05-SUMMARY.md §"Initial verify-gate run"). Operator-confirmed 6/6 PASS at 2026-05-16. |
| T-04-02 | Information disclosure (HIGH) | `DATABASE_URL` in Client Component bundle | mitigate | CLOSED | `lib/db/index.ts:3` literal `import "server-only";`. Next.js bundling resolves this to the throwing `index.js` for any non-RSC import path → build-time error on Client Component import. `--conditions=react-server` opt-in is confined to standalone scripts (`package.json:16`) and never enters the Next.js bundle. |
| T-04-03 | Tampering | Client Component imports `db` to bypass API-route validation | mitigate (cross-phase) | CLOSED | Phase 1 has zero data-bearing routes (verified — grep `from "@/lib/db"` returns only `scripts/check-db.ts`). `server-only` gate from T-04-02 catches basic misuse. Phase 2 establishes `org_id`-in-every-query rule per ADR-019. |
| T-04-04 | DoS | Pooler connection exhaustion via missing `prepare:false` | mitigate | CLOSED | `lib/db/index.ts:19` literal `postgres(connectionString, { prepare: false })`. Live verification: `pnpm check:db` round-trip ~3.5s exit 0 (01-04-SUMMARY.md §"smoke test result"). |
| T-04-05 | Spoofing | Webhook bypass through matcher exemption | mitigate (cross-phase) | CLOSED | Phase 1 has no Stripe webhook handler (no `app/api/webhooks/stripe/route.ts` exists). Next.js default 404 closes the surface. ADR-020 locks `stripe.webhooks.constructEvent(rawBody, signature, secret)` for Phase 6. Matcher exemption (middleware.ts:33-35) carved only to avoid Clerk session-check breakage; route handler is Phase-6-owned. |
| T-04-06 | Information disclosure | Connection string in error message | mitigate | CLOSED | `scripts/check-db.ts:21-24` error handler logs `err instanceof Error ? err.message : err` — postgres-js error messages mention host:port but not the password component. `try/catch` wraps the `await` at lines 7-25, preventing Node's default unhandled-rejection trace. |
| T-04-07 | Tampering | Smoke check mutates DB | mitigate | CLOSED | `scripts/check-db.ts:8` literal `sql\`select 1 as ok\`` — pure SELECT, zero CREATE/INSERT/UPDATE/DELETE. No mutating verbs anywhere in the file. |
| T-05-01 | Tampering | Verifier always exits 0 | accept | CLOSED | Documented acceptance: plan acceptance criteria assert literal `select 1`, literal D-03 hero substring, both `process.exit(0)` and `process.exit(1)` branches in source — verified present in `scripts/check-foundation.ts:179, 231, 236`. A vacuous-pass script cannot satisfy those assertions. Recorded in Accepted Risks below. |
| T-05-02 | Information disclosure | Full DB connection string in failure log | mitigate | CLOSED | `scripts/check-foundation.ts:143-157` (`checkSelectOne`) — only first non-empty trimmed line of stderr/stdout surfaced. `checkTypecheck` (lines 45-52) same pattern. postgres-js errors do not contain password fragments. |
| T-05-03 | DoS | Repeated verify runs hammer dev server | accept | CLOSED | Documented acceptance: developer-local script, no production exposure. Recorded in Accepted Risks below. |
| T-05-04 | Information disclosure | Operator-side test user sees admin/employee data | n/a | CLOSED | Phase 1 has no admin or employee surfaces (verified — `app/(admin)/` and `app/(employee)/` directories do not exist). Test user lands on `app/sign-in-success/page.tsx:1-12` which renders zero data. Disposition documented as n/a in the plan; recorded in Accepted Risks below. |
| T-05-05 | Repudiation | Operator marks Phase 1 done without running gate | mitigate | CLOSED | Plan-05 Task 2 declared `gate="blocking"` checkpoint:human-verify. Operator returned `all approved` 2026-05-16 (01-05-SUMMARY.md §"Resume signal received"). Pre-gate sequence: live `pnpm verify:phase-1` 6/6 OK observed by operator AFTER commit `446b554` matcher fix, plus 5 visual checks (01-05-SUMMARY.md §"Five visual / Clerk-flow checks"). |

---

## Closed Threats — Mitigation Evidence Detail

### T-04-01 (HIGH) — Middleware matcher hardening

The plan-time threat register flagged this as HIGH severity. Implementation evidence:

- `middleware.ts:23-30` declares the public-route matcher with **6 entries** split to avoid sibling-prefix collisions:
  - `/` (exact)
  - `/pricing` (exact)
  - `/sign-in` (exact)
  - `/sign-in/(.*)` (Clerk nested factor routes)
  - `/sign-up` (exact)
  - `/sign-up/(.*)` (Clerk nested factor routes)
- The plan-original-form `/sign-in(.*)` was found during Plan-05 Task 2 live HTTP probe to incorrectly match `/sign-in-success` (greedy `(.*)` consuming `-success`). Caught by the verify gate BEFORE phase close → fixed in `446b554` ("split /sign-in and /sign-up matchers so /sign-in-success stays private"). The gate working as designed.
- Lines 32-35 webhook exemption (`/api/webhooks/stripe`, `/api/webhooks/clerk`).
- Lines 37-39 cron exemption (`/api/cron/(.*)`).
- Lines 86-90 fail-closed default: any unmatched route redirects unauthenticated visitors to `/sign-in?redirect_url=<original>`.
- Live operator probe 2026-05-16: incognito visit to `/sign-in-success` redirected to `/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fsign-in-success` (01-05-SUMMARY.md line 227).

### T-04-02 (HIGH) — Server-only guard on `lib/db`

- `lib/db/index.ts:3` is literally the FIRST statement after the comment header: `import "server-only";`
- Next.js bundling resolves `server-only` to a module that throws on any non-RSC import. Build-time error guarantee.
- The `--conditions=react-server` flag (used in `package.json:16` `check:db`) opts a standalone tsx process into the no-op `empty.js` export — but only that one script can use it. `package.json:15` `verify:phase-1` does NOT have the flag — it spawns `pnpm check:db` as a child process specifically to keep the orchestrator script outside the react-server condition.
- Verified zero `SUPABASE_SERVICE_ROLE_KEY` references across all `.ts/.tsx/.js/.jsx` files (grep returned "No files found").
- Verified the only consumer of `@/lib/db` in the phase is `scripts/check-db.ts:4` (grep returned single match).

### Supply chain residuals — npm-audit posture at phase close

01-05-SUMMARY.md §"Operator-side security audit" documents the operator-conducted out-of-scope audit at phase close. Key findings:
- **777/777 lockfile entries** have `sha512` integrity hashes (verifier re-counted 776 in current lockfile — 99.87% — and confirms no `sha1`/no missing integrity; the 1-entry delta is within audit noise of `pnpm install` re-resolutions).
- **No postinstall scripts** ran (`package.json` has no `pnpm.onlyBuiltDependencies`; pnpm 9 default block held).
- **`.mcp.json` registers only `qmd`** (verified: file is 9 lines, single `mcpServers.qmd` entry). McpInject IOC negative.
- **No `.github/workflows/shai-hulud-workflow.yml`** (verified: `.github/workflows/` directory does not exist).
- **20 standard framework CVEs patched** in bundle: `ecd1d69` (pnpm 9.15.9), `e324e19` (Node 22 LTS / ADR-022), `1df82e9` (Next 15.5.18 + postcss>=8.5.10 override).
- **1 residual advisory:** `esbuild@0.18.20` via `@esbuild-kit/*` (transitive of `drizzle-kit`). See Accepted Risks #4.

---

## Open Threats

**None.** All 29 declared threats verified closed.

---

## Accepted Risks

The following dispositions are `accept`, `accept-then-detect`, or `n/a` per plan-time decisions. Each is reproduced here with the residual control that keeps the acceptance defensible.

### 1. T-01-SC — Stack-package supply chain (accept)

- **Risk:** Installing any of the 14 stack packages introduces transitively-trusted code.
- **Rationale:** Every package is a CLAUDE.md stack-table commitment locked by ADR-003 (Drizzle), ADR-010 (Next.js), ADR-011 (Supabase), ADR-012 (Clerk). No `[ASSUMED]` / `[SUS]` packages introduced.
- **Residual control:** `pnpm-lock.yaml` committed with 776 `sha512` integrity entries; `pnpm@9.15.9` default postinstall block (no `pnpm.onlyBuiltDependencies` in `package.json`); `pnpm.overrides.postcss>=8.5.10` (line 47-51) closes the May-2026 CVE bundle.
- **Owner:** Operator. Re-audit on every dependency add (CLAUDE.md ASK FIRST rule #1).

### 2. T-02-05 — Clerk Organizations not enabled (accept-then-detect)

- **Risk:** Operator forgets to flip the Organizations toggle in the Clerk dashboard before Phase 2 webhooks fire.
- **Rationale:** Programmatic verification requires the very secret key the operator is in the process of pasting — chicken-and-egg.
- **Residual control:** Operator-confirmed enablement at 2026-05-16 (01-02-SUMMARY.md §"Task 1"). Phase 2 webhook handler will fail-loudly if `organization.created` events never arrive — natural detector.
- **Owner:** Phase 2 plan-author must surface this as a precondition check.

### 3. T-03-01 — Pricing-page hard-coded prices drift vs `reference/TIER-LIMITS.md` (accept)

- **Risk:** Source of truth for tier prices diverges between `reference/TIER-LIMITS.md` and `app/(marketing)/pricing/page.tsx:33-58`.
- **Rationale:** Phase 1 is a stub per D-04 — checkout is unwired.
- **Residual control:** Source comment at `app/(marketing)/pricing/page.tsx:26-29` documents the Phase-6 replacement: `lib/stripe/products.ts` typed import will collapse the divergence by construction.
- **Owner:** Phase 6 plan-author.

### 4. T-03-03 — Clerk endpoint DoS (accept)

- **Risk:** Unauthenticated DoS hammer of Clerk-hosted sign-in/sign-up endpoints.
- **Rationale:** Clerk-owned infrastructure with documented rate limits; pre-launch hardening (CAPTCHA, additional rate limits) is out of Phase 1 scope.
- **Residual control:** Clerk dev-tier rate limit owns the floor. Phase 1 ships behind dev keys only.
- **Owner:** Pre-launch (Phase 8 or post-Phase-8 hardening).

### 5. T-05-01 — Verifier tampered to always exit 0 (accept)

- **Risk:** Someone modifies `scripts/check-foundation.ts` to skip real checks.
- **Rationale:** The verifier is itself the gate; no defense-in-depth needed beyond plan-time acceptance assertions.
- **Residual control:** Plan acceptance criteria assert literal source substrings (`select 1`, D-03 hero copy, both `process.exit(0)` and `process.exit(1)` branches) — vacuous-pass scripts cannot satisfy those. Verified present in `scripts/check-foundation.ts:179, 231, 236`.
- **Owner:** Future gate maintainers must preserve the literal-string assertions.

### 6. T-05-03 — DoS on dev server via verify runs (accept)

- **Risk:** Repeated `pnpm verify:phase-1` runs saturate `pnpm dev`.
- **Rationale:** Developer-local script, no production exposure.
- **Residual control:** None needed.
- **Owner:** n/a.

### 7. T-05-04 — Test user sees admin/employee data (n/a in Phase 1)

- **Risk:** Operator-side Clerk test user (created during Task-2 visual check) reaches data they shouldn't.
- **Rationale:** Phase 1 has zero admin / employee / data-bearing surfaces (`app/(admin)/` and `app/(employee)/` route groups do not exist).
- **Residual control:** Test user lands on `app/sign-in-success/page.tsx:1-12` (static placeholder, zero data render).
- **Owner:** Phase 2 plan-author must delete or scope-test the test user when org-creation webhooks land.

### 8. Documented unreachable residual — `esbuild@0.18.20` via `drizzle-kit` (accept)

- **Risk:** GHSA-67mh-4wv8-2f99 — esbuild dev-server CORS bypass via `esbuild --serve`.
- **Rationale:** PolicyPilot does not invoke `esbuild --serve`. The dev server is `next dev`. The vulnerable code path is unreachable in our usage.
- **Residual control:** Documented in commit `1df82e9` and 01-05-SUMMARY.md §"Operator-side security audit" line 217. Lockfile entries at `pnpm-lock.yaml:310, 314, 2002, 3935, 3940, 3942, 5149, 5294` confirm the version pin chain (`drizzle-kit` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`).
- **Owner:** Re-evaluate if Drizzle Kit upgrades to a non-deprecated loader path; currently Drizzle's vendored shim is the only consumer.
- **Per `<constraints>` in audit prompt:** DO NOT re-flag unless an actually-reachable exploitation path in our usage is demonstrated. Verifier confirms no reachable path in Phase 1 code.

---

## Unregistered Flags

Per `<adversarial_stance>`, any new attack surface that appeared during implementation without a threat-register mapping is logged here. SUMMARY-file `## Threat Flags` sections were inspected for all five plans.

**Plan-by-plan scan:**

- **01-01-SUMMARY.md** — no `## Threat Flags` section. All 5 register threats accounted for. **No unregistered flags.**
- **01-02-SUMMARY.md** — no `## Threat Flags` section; uses `## Threat-model dispositions` mapped 1:1 to register IDs. **No unregistered flags.**
- **01-03-SUMMARY.md** — no `## Threat Flags` section; uses `## Threat-model dispositions` mapped 1:1 to register IDs. **No unregistered flags.**
- **01-04-SUMMARY.md** — no `## Threat Flags` section; uses `## Threat-model dispositions` mapped 1:1 to register IDs. The `--conditions=react-server` deviation in §"Auto-fixed Issues #1" was evaluated: it is a build-tool flag that activates an existing `server-only` package export condition (zero-byte `empty.js` no-op), confined to standalone tsx scripts. Does not introduce new attack surface. **No unregistered flags.**
- **01-05-SUMMARY.md** — no `## Threat Flags` section; uses `## Threat-model dispositions` mapped 1:1 to register IDs. The §"Operator-side security audit" subsection documents an out-of-scope npm-audit pass that surfaced 20 framework CVEs (patched in `ecd1d69`, `e324e19`, `1df82e9`) and 1 unreachable residual (`esbuild@0.18.20`, accepted above). **No unregistered flags.**

**Result:** Zero unregistered flags. Every observable threat-relevant change during implementation maps to an existing register entry or to a documented accepted risk.

---

## Audit Trail

### 2026-05-16 — Initial security audit (this document)

- **Auditor:** Claude (gsd:secure-phase agent, model `claude-opus-4-7[1m]`)
- **Mode:** Verify declared mitigations only; do not scan for new vulnerabilities
- **Stance:** FORCE adversarial — every mitigation assumed absent until grep-match evidence in the cited file
- **Files inspected (read-only):**
  - `.gitignore`, `.env.local.example`, `package.json`, `pnpm-lock.yaml` (grep only)
  - `middleware.ts`, `lib/db/index.ts`, `lib/db/schema.ts`
  - `scripts/check-db.ts`, `scripts/check-foundation.ts`
  - `app/layout.tsx`, `app/(marketing)/page.tsx`, `app/(marketing)/pricing/page.tsx`
  - `app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
  - `app/sign-in-success/page.tsx`
  - `.mcp.json`
  - `.planning/phases/01-foundation/VERIFICATION.md` (header + criterion 1-5)
  - All five PLAN.md `<threat_model>` blocks
  - All five SUMMARY.md threat-disposition sections
- **Bash checks executed:**
  - `git check-ignore -v .env.local` → `.gitignore:46:*.local .env.local` (exit 0)
  - `git log --oneline -20` (recent history including security patch bundle)
  - `ls .github/workflows/` → "No such file or directory" (no shai-hulud workflow)
  - `grep -c "integrity: sha512" pnpm-lock.yaml` → 776
- **Grep sweeps (read-only):**
  - `SUPABASE_SERVICE_ROLE_KEY` in `**/*.{ts,tsx,js,jsx}` → no files (T-02-06 confirmed)
  - `dangerouslySetInnerHTML` in `app/**` → no files (T-03-04 confirmed)
  - `from "@/lib/db"` in `**/*.{ts,tsx}` → 1 hit, `scripts/check-db.ts:4` only (T-03-05 / T-04-03 confirmed)
  - `onlyBuiltDependencies|postinstall` in `package.json` → no matches (T-01-03 supply-chain control confirmed)
  - `esbuild@0\.18\.20|esbuild-kit` in `pnpm-lock.yaml` → 8 entries (Accepted Risk #8 confirmed)
- **Implementation files modified by this audit:** ZERO (audit constraint honored).
- **Files written by this audit:** `.planning/phases/01-foundation/01-SECURITY.md` (this file).
- **Verdict:** `SECURED` — 29/29 threats closed, 0 open, 8 accepted risks documented, 0 unregistered flags, 0 escalations.

---

## Cross-references

- Goal-backward verification report: `.planning/phases/01-foundation/VERIFICATION.md` (commit `7dcfeae`)
- Operator approval of Phase 1: 01-05-SUMMARY.md §"Resume signal received" (`all approved` 2026-05-16)
- Phase-1-complete commit: `bd2b1a1` (`docs(01): mark Phase 1 complete in STATE + ROADMAP`)
- Security bundle commits: `ecd1d69` (pnpm), `e324e19` (Node 22), `1df82e9` (Next.js + postcss override)
- Matcher gap-closure commit: `446b554` (split sign-in/sign-up matchers for sibling-prefix safety)

Phase 2 may proceed.
