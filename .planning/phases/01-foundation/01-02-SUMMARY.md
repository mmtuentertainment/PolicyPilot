---
phase: 01-foundation
plan: 02
status: complete
completed_at: 2026-05-16
tasks_completed: 3/3
files_created:
  - .env.local (gitignored — never committed; values held only in local working tree)
files_modified: []
commits: []  # Plan 01-02 produces no source commits; .env.local is gitignored. Only this SUMMARY.md is committed.
---

# Plan 01-02 — Operator Clerk + Supabase setup (Wave 2)

## Outcome
All three tasks complete. `.env.local` populated with the seven Phase 1 must-have keys. Wave 3 unblocked.

## Tasks

### Task 1 — Clerk dev app (operator manual)
Operator (Matthew) executed this via the Claude Chrome extension using an Opus 4.7 screen-control prompt. Per operator confirmation:
- Clerk application `PolicyPilot (dev)` created.
- Auth methods configured per D-09 (Email + Password + Google OAuth on; magic-link, phone, SSO off).
- **Organizations feature enabled** (ADR-004 precondition — Phase 2 webhooks depend on this).
- Paths configured per D-09 (`/sign-in`, `/sign-up`, `/sign-in-success` × 2).
- Publishable + secret keys captured to the operator's local secrets file.

Secret values are not echoed in this summary (see `secrets-never-in-chat` operator preference). The sentinel-substring check below confirms valid keys are in `.env.local`.

### Task 2 — Supabase dev project (operator manual)
Operator confirmed:
- Supabase project `policypilot-dev` provisioned on the free tier.
- Project status `Active`.
- DB password generated via dashboard's strong-password button and captured locally.
- Connection string captured from the **Transaction pooler** tab (D-06 — port 6543, *not* direct 5432).
- Four required values (URL, anon key, service-role key, DATABASE_URL) saved locally.

Project ref and region are not echoed here per `secrets-never-in-chat`. They are recoverable from `.env.local` if needed.

### Task 3 — Write `.env.local` (automated)
Pipeline:
1. Read operator's local secrets file (path withheld from logs).
2. Parsed 6 required keys via regex against `(?m)^\s*KEY\s*=\s*(.+?)\s*$`. All 6 found.
3. Read `.env.local.example` template (45 lines). Held in memory; never mutated on disk.
4. Substituted each `KEY=` line with the operator-supplied value.
5. Substituted `NEXT_PUBLIC_APP_URL=http://localhost:3000` (constant per plan).
6. All other keys (Clerk webhook secret, Stripe, Anthropic, Resend, CRON_SECRET, PostHog, Sentry) preserved blank as templated — they're consumed by Phases 2–8.
7. Wrote `.env.local` as UTF-8 (no BOM) via `[System.IO.File]::WriteAllText`.

## Verification — all 5 gates PASS

| # | Check | Result |
|---|-------|--------|
| 1 | `.env.local` exists at repo root | ✓ |
| 2 | `git check-ignore -v .env.local` exits 0 | ✓ |
| 3 | All 6 sentinel substrings present in `.env.local` (`pk_test_`, `sk_test_`, `https://`, `postgresql://`, `pooler.supabase.com:6543`, `http://localhost:3000`) | ✓ |
| 4 | `.env.local` not staged (`git diff --cached --name-only` does not match) | ✓ |
| 5 | `git status --short` does not reference `.env.local` | ✓ |

Sentinel verification used `node -e "...sentinels.filter(s => !r.includes(s))..."` with `process.exit(0/1)` — values were never printed; only the boolean inclusion result was used to determine pass/fail.

## Threat-model dispositions

| Threat ID | Result |
|-----------|--------|
| T-02-01 (HIGH — secret leak via VCS) | MITIGATED. `git check-ignore -v` exit 0 verified. `.gitignore` line 2 (`.env.local`) and line 3 (`.env*.local`) both catch the file. |
| T-02-02 (secrets in terminal logs) | MITIGATED. All verification commands use exit codes only. No `Get-Content .env.local`, no `Select-String -Pattern KEY=`, no echo of substring matches in the success path. |
| T-02-03 (publishable/secret swap) | MITIGATED. Sentinel check asserts `pk_test_` and `sk_test_` prefixes on the correct keys. |
| T-02-04 (direct URI vs pooler) | MITIGATED. Sentinel check asserts `pooler.supabase.com:6543` substring. |
| T-02-05 (Clerk Organizations not enabled) | ACCEPTED. Operator-confirmed via Chrome-extension prompt. Phase 2 webhook handler will fail-loudly if absent. |
| T-02-06 (service-role key in client component) | DEFERRED to Plan 04 / Phase 2. Phase 1 does not consume `SUPABASE_SERVICE_ROLE_KEY`. |

## Deviations from PLAN.md `<action>`

1. **Resume-signal protocol bypassed by operator preference.** PLAN.md's `<resume-signal>` blocks expected the operator to paste the 6 secret values directly into chat ("Option A"). Operator established a hard cross-session rule: secrets must never enter chat history. Saved as `secrets-never-in-chat` feedback memory. Resume signal was instead: "values dropped in local file at `<path>` — proceed". All future env-file plans should default to file-based handoff.
2. **No commit produced by Task 3.** PLAN.md does not require a commit for Task 3 (the only file written is gitignored), so this is not a deviation from the spec — but worth noting that Plan 01-02's total commit count is 1 (this SUMMARY.md), not 3 like Plan 01-01.
3. **Dashboard metadata captured-but-not-recorded.** PLAN.md `<output>` block asks the summary to record "Clerk org name + region" and "Supabase project ref + region". These are operator-side observations; recording them in this summary would arguably violate `secrets-never-in-chat` for the Supabase ref (semi-public but identifying). They are recoverable from `.env.local` by inspection.

## Confirmation
`git check-ignore -v .env.local` exits 0 — verified at 2026-05-16.
