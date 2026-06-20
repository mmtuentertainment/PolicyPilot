# Runbook: Launch MVP — Phase 7 Deploy + Production Launch

**Last updated:** 2026-06-15
**Audience:** Operator (Matthew).
**Scope:** Sequential, executable steps for the two remaining launch milestones — (1) Phase 7 R-018 deploy (Railway worker + cron endpoint + Resend domain) and (2) the first production launch (provision the still-unprovisioned prod Supabase project, run the prod migration/verify gate, then deploy code).

---

## Intro

This runbook sequences **two milestones, in order**:

1. **Milestone 1 — Phase 7 R-018 deploy.** Stand up the Railway worker that triggers `GET /api/cron/reminders` daily, verify the Resend sending domain, and bring the deploy target's DB to journal HEAD (`0014_reminder_sends`) via the migration gate.
2. **Milestone 2 — Production launch.** Provision the prod Supabase project (which has **never** been deployed), run the prod migration + verify gate, wire prod secrets into Vercel + Railway, then ship the first prod deploy and smoke-test it.

Migration **mechanics** (the Pattern-3 credential wrapper, the `28P01` pooler-cache gate, rollback classes, CI path) are **not** restated here — they live in [`docs/runbooks/deploy-migrations.md`](./deploy-migrations.md). This runbook cross-links that file at each migration step and focuses on the launch *sequence* and the launch-specific setup (provisioning, DNS, env-var wiring, smoke test) around it.

**Standing guardrails (every step):** never weaken the CI / `verify:phase-N` gate; never put a real or dummy secret in any tracked file (`.env.local` is gitignored, secrets live in PowerShell SecretStore / Vercel / Railway env, not in the repo); **never use live Stripe mode** (test mode only — see §5); do not run a destructive migration without operator approval. Every `<PLACEHOLDER>` below is a token the operator fills in locally — nothing secret is ever echoed, printed, or committed.

---

## 1. Preconditions — staging vs prod migration state

Before any deploy, confirm where each DB sits relative to the Drizzle journal. The journal (`drizzle/meta/_journal.json`) is the source of truth and currently has **15 entries (`0000`..`0014`)**, newest `0014_reminder_sends` (the Phase 7 send-ledger). `pnpm db:migrate:<env>` brings each target up to this journal HEAD regardless of its starting point; `pnpm db:verify:<env>` asserts it arrived.

| Target | Project ref (`scripts/deploy-config.json` → `user`) | State today | Gate brings it to |
|---|---|---|---|
| **staging** | `postgres.qwtbbbjbxffioeeazxrw` | Confirmed in `deploy-config.json` `staging` block. This ref is the same Supabase project PolicyPilot uses as its **TEST** project — staging and the RLS cross-org TEST project are one and the same. Per `.planning/STATE.md` Session Continuity, staging last received `0008..0009` (2026-05-23); Phase 5/6/7 migrations (`0010`..`0014`) are pending unless re-checked. | journal HEAD (`0014`) |
| **prod** | `postgres.REPLACE_WITH_PROD_PROJECT_REF` (placeholder) | **Virgin — never provisioned, never deployed.** The `prod` block of `deploy-config.json` still carries the literal `REPLACE_WITH_PROD_PROJECT_REF` placeholder; `scripts/with-deploy-creds.ps1` rejects that string explicitly so any accidental `pnpm db:*:prod` fails fast. | journal HEAD (`0014`) — applies **all** of `0000`..`0014` on first migrate |

To check the live state of a target, run `pnpm db:verify:<env>` (see [`deploy-migrations.md` § Procedure](./deploy-migrations.md#procedure)). A target behind HEAD reports `X migrations applied (expected Y)`; that's expected before you run the gate, not an error.

> Note: the "staging == TEST project `qwtbbbjbxffioeeazxrw`" identity is asserted from the `staging` block of `deploy-config.json`. If a future edit splits staging onto its own project ref, re-read that file and treat staging as a distinct target.

---

## 2. Provision the prod Supabase project (Milestone 2)

The production Supabase project does not exist yet. Create it before touching any `db:*:prod` command.

1. Supabase Dashboard → **New project** in a separate Free organization. The target path is a **third Free project in a separate Free org** at **$0** because the current dev + TEST projects occupy org #1. Current Supabase billing docs still describe a two-active-Free-project entitlement across organizations where a user is Owner/Admin, so the Dashboard creation step is the feasibility check. If Supabase blocks the third active Free project for the operator account/team setup, stop and choose an operator-approved fallback such as pausing/transferring a non-prod project or upgrading the same prod project to Pro without PITR.
2. **Tier: Free for launch.** PITR is explicitly **waived by operator decision** for the pre-revenue production stand-up; this is not an ADR-018 hard requirement for the current launch path. The same project can later be upgraded to **Pro without PITR** from the Supabase Dashboard, with no code, migration, or env-var change.
3. **Free-tier idle-pause note.** Free projects pause after about a week of inactivity. The existing Railway daily cron (`railway.json` `0 8 * * *` → `/api/cron/reminders`) performs a database-backed org enumeration when it succeeds, so the Railway worker must be live with a matching `CRON_SECRET` to act as the default keep-alive.
4. Region: strongly prefer the existing projects' region (`aws-1-us-east-1`, the pooler host in `deploy-config.json`) so the documented `28P01` pooler-cache behavior and host template line up. If Supabase assigns a different pooler host, update the `prod.host` field in `scripts/deploy-config.json` at the same time as the project ref.
5. Note the new **project ref** from the Dashboard URL / Project Settings → General. You'll paste it in §3. (The project ref is half-credential at most — it appears in public URLs — so committing it to `deploy-config.json` is acceptable per that file's `$comment`.)

Do **not** run any command that prints a secret here. Setting the database password happens in §3 via the GUI-prompt helper.

---

## 3. Prod credentials — replace placeholder + store password

Two operator actions, in order:

### 3a. Replace the prod project-ref placeholder

Edit `scripts/deploy-config.json` → `prod` block → `user` field. Replace the placeholder token with the real ref captured in §2:

```
"user": "postgres.REPLACE_WITH_PROD_PROJECT_REF"   →   "user": "postgres.<PROD_PROJECT_REF>"
```

Leave `poolerPort` (6543), `directPort` (5432), `database` (`postgres`), and `secretName` (`PolicyPilotProdDB`) as-is. If the new project uses a pooler host other than `aws-1-us-east-1.pooler.supabase.com`, update `host` to the real pooler host from Supabase. Until the `user` replacement is done, `scripts/with-deploy-creds.ps1` rejects the placeholder string and every `pnpm db:*:prod` fails by design.

### 3b. Store the prod database password (interactive, never echoed)

The Supabase database password lives only in PowerShell SecretStore (DPAPI-encrypted, per-Windows-user) — never on disk, never in chat. Run:

```powershell
./scripts/store-deploy-password.ps1 prod
```

A Windows credential dialog appears. Paste the prod database password into the **Password** field (the UserName field is just the label `prod`). The helper validates length (8..128), stores it under secret name `PolicyPilotProdDB`, prints a one-way SHA-256[0..3] verification token (safe — it is not the password), and read-back-verifies the stored length. If it reports `REJECTED`, re-run (paste truncation); do not proceed on a partial store. Full credential-pattern detail: [`deploy-migrations.md` § Credential pattern](./deploy-migrations.md#credential-pattern-operator-side--pattern-3).

> One-time per machine, if not already done: install + register the SecretStore vault (`Install-Module ...`, `Register-SecretVault -Name PolicyPilot ...`, `Set-SecretStoreConfiguration -Authentication None -Interaction None`). Steps in [`deploy-migrations.md`](./deploy-migrations.md#credential-pattern-operator-side--pattern-3).

---

## 4. Resend — verify the sending domain

Email (Phase 7 reminders) sends through Resend + React Email. Production deliverability requires a verified sending domain.

1. Resend Dashboard → **Domains → Add domain** for the sending domain (e.g. `policypilot.com`).
2. Add the DNS records Resend issues at your DNS provider, and confirm all three authentication families verify green:
   - **SPF** — the `TXT` record authorizing Resend's sending IPs for the domain.
   - **DKIM** — the `CNAME`/`TXT` records Resend issues for cryptographic signing.
   - **DMARC** — a `_dmarc` `TXT` policy record (start `p=none` to monitor, tighten later).
3. Wait for Resend to mark the domain **Verified** before relying on prod sends (DNS propagation can take minutes to hours).
4. Set the email env vars (placeholders — real values go in Vercel + Railway env, never the repo):
   - `RESEND_API_KEY=<RESEND_API_KEY>`
   - `RESEND_FROM_EMAIL=<noreply@your-verified-domain>` — the address must be **on the verified domain** above. (`.env.local.example` shows the template default `noreply@policypilot.com`.)

---

## 5. Prod Clerk + Stripe — TEST MODE ONLY

> **Hard guardrail: live Stripe mode is forbidden.** Per CLAUDE.md NEVER-rules and the standing phase guardrails, PolicyPilot uses **Stripe test mode only** at launch. Do **not** flip Stripe to live mode in this runbook. Every Stripe key below is a **test-mode** key (`sk_test_…`, `pk_test_…`, `whsec_…` from a test-mode webhook).

### Clerk

1. Create/confirm the production Clerk instance (or continue with the dev instance for a soft launch — operator's call; for local-only Clerk org repair, use [`dev-clerk-org-provisioning.md`](./dev-clerk-org-provisioning.md)).
2. Capture the keys for §7: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`.
3. Set the two redirect env vars to `/post-sign-in` (both are asserted by `scripts/check-foundation.ts`): `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.
4. Point the Clerk webhook at `https://<PROD_APP_URL>/api/webhooks/clerk`; the handler is Svix-verified (`CLERK_WEBHOOK_SECRET`).

### Stripe (TEST MODE)

1. In the Stripe **test-mode** Dashboard, create the products + 6 prices and capture the price IDs for §7: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_ANNUAL`, `STRIPE_PRICE_GROWTH_MONTHLY`, `STRIPE_PRICE_GROWTH_ANNUAL`, `STRIPE_PRICE_BUSINESS_MONTHLY`, `STRIPE_PRICE_BUSINESS_ANNUAL`. All six are required at first `getPriceCatalog()` call (fail-closed `StripeCatalogConfigError` otherwise).
2. Create a **test-mode** webhook endpoint at `https://<PROD_APP_URL>/api/webhooks/stripe` and capture its signing secret as `STRIPE_WEBHOOK_SECRET`. The handler covers all 5 events (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.updated`) and verifies signatures against the raw body.
3. Capture `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`) and `STRIPE_SECRET_KEY` (`sk_test_…`).

---

## 6. Migration gate — apply schema to staging then prod

Run the gate **before** deploying any code that depends on `0014` (the whole Phase 7 cron/reminder path). Exact mechanics — the Pattern-3 wrapper, expected drizzle-kit output, what the verifier asserts — are in [`deploy-migrations.md` § Procedure](./deploy-migrations.md#procedure). Sequence:

```powershell
# 1. Staging first (== TEST project qwtbbbjbxffioeeazxrw)
pnpm db:migrate:staging      # applies pending entries up to journal HEAD (0014)
pnpm db:verify:staging       # MUST exit 0

# 2. OPERATOR APPROVAL GATE — do not proceed to prod unless ALL hold:
#    - staging migrate exited 0
#    - staging verify exited 0
#    - no app errors on staging in the soak window
#    (full checklist: deploy-migrations.md § Operator approval gate)

# 3. Production (only after the gate above)
pnpm db:migrate:prod         # virgin DB → applies ALL of 0000..0014
pnpm db:verify:prod          # MUST exit 0 before deploying code; schema/catalog gate only
```

`db:verify:<env>` **must exit 0 before you deploy code to that environment** — code shipped ahead of its schema 503s on first request (the whole point of the gate).

**Important RLS boundary.** `db:verify:prod` proves schema/catalog state: migration count, tenant tables with RLS enabled, policies present, grants present, and expected columns/indexes/constraints. It runs as the privileged database connection and does **not** prove cross-org isolation actually enforces under the `authenticated` role. The authoritative prod isolation proof is the post-deploy cross-org smoke in §10c.

**`28P01` pooler-password note.** If, immediately after first setting/rotating the prod database password, a `db:migrate`/`db:verify` returns `28P01 password authentication failed for user "postgres"`, the Supabase pooler is still serving the old cached secret — this is expected for a window with no documented upper bound. **Do not retry in a tight loop** (it trips a 2-minute circuit-breaker IP lockout). Run the paced gate `pnpm db:wait-pooler-auth:prod` and follow [`deploy-migrations.md` § Post-rotation auth-propagation gate](./deploy-migrations.md#post-rotation-auth-propagation-gate) (escalation: Dashboard → Restart project).

---

## 7. Vercel env-var matrix

Set the production environment variables in Vercel. **Reuse the authoritative matrix** in [`.planning/codebase/INTEGRATIONS.md` § Environment Variable Summary](../../.planning/codebase/INTEGRATIONS.md#environment-variable-summary) — it lists every variable, its service, and what it's required for. Do not re-derive the list here; that table is the single source of truth. The launch-specific values to set for prod:

| Variable | Prod value |
|---|---|
| `DATABASE_URL` | prod Supabase **pooler** URI (port 6543), `prepare:false`-compatible |
| `DIRECT_URL` | prod Supabase **direct** URI (port 5432), migrations |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | from §4 (verified-domain sender) |
| `CRON_SECRET` | `<CRON_SECRET>` — generate a strong random value; **must byte-match** the Railway value in §8 |
| `NEXT_PUBLIC_APP_URL` | `https://<PROD_APP_URL>` (drives Stripe redirect URLs and the cron worker's target) |
| Clerk keys | the 3 keys + 2 `/post-sign-in` redirect vars from §5 |
| Stripe keys | publishable + secret + webhook secret + 6 **test-mode** price IDs from §5 |
| `ANTHROPIC_API_KEY` | prod Anthropic key (server-only) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | from the prod Supabase project; currently runtime-inert because app DB access uses Drizzle/`postgres`, not `@supabase/supabase-js` |

> **Caveat — `deploy:preflight` does NOT validate secret completeness.** The Vercel build runs `pnpm deploy:preflight && pnpm build`. `deploy:preflight` (`scripts/deploy-preflight.ts`) runs **only** the schema verify (`check-deploy-schema.ts`) when `DIRECT_URL`/`DATABASE_URL` is set, and `next build` type-checks. **Neither checks that every other secret is present.** A missing `CRON_SECRET`, a missing Resend key, or a missing Stripe key will **not** fail preflight or the build — it surfaces only at runtime (e.g. cron 401, fail-closed `StripeCatalogConfigError`). Double-check this matrix by hand; the gate won't catch a gap.

---

## 8. Railway worker env

The Railway worker (`worker/trigger-reminders.mjs`, started by `railway.json` → `startCommand: node worker/trigger-reminders.mjs`, `cronSchedule: 0 8 * * *` = daily 08:00 UTC) calls `GET /api/cron/reminders` on the Vercel app with `Authorization: Bearer ${CRON_SECRET}`. Set on the Railway service:

| Variable | Value |
|---|---|
| `CRON_SECRET` | `<CRON_SECRET>` — **must byte-match** the Vercel `CRON_SECRET` from §7 exactly |
| `NEXT_PUBLIC_APP_URL` | `https://<PROD_APP_URL>` — same prod app URL (the worker builds the request URL as `${NEXT_PUBLIC_APP_URL}/api/cron/reminders`) |

**Why a mismatch breaks the cron call (401).** The route validates `authHeader === \`Bearer ${cronSecret}\`` against its own `process.env.CRON_SECRET` (the Vercel value). The worker sends `Bearer ${CRON_SECRET}` from *its* env (the Railway value). If the two `CRON_SECRET` values differ by even one byte (or one has a trailing space — both sides `.trim()`, but they must still match after trimming), the route returns **HTTP 401 Unauthorized**, the worker logs a non-`ok` status and exits non-zero, and **no reminders go out**. The worker also requires `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL`) to be set, else it exits 1 with `CRON_SECRET or BASE_URL not set` before making any request.

---

## 9. First Vercel production deploy

Only after §6 prod verify exited 0 and §7 env is set:

1. Trigger the production deploy (Vercel auto-deploy on the production branch, or `vercel --prod`).
2. The build runs `pnpm deploy:preflight && pnpm build`. `deploy:preflight` re-runs `check-deploy-schema.ts` against the prod `DATABASE_URL`/`DIRECT_URL` as a defense-in-depth schema gate — if the DB isn't at HEAD, the build fails (preventing a 503-on-first-request deploy). This is *in addition to* the manual §6 gate, not a substitute for it.
3. Confirm the deploy reaches **Ready**.

---

## 10. Smoke test

### 10a. Sign-in path

Open `https://<PROD_APP_URL>`, complete the Clerk sign-in/sign-up flow, and confirm the post-sign-in trampoline lands you in `/dashboard` (both Clerk redirect env vars must be `/post-sign-in`).

### 10b. Cron endpoint (auth + JSON shape)

Hit the cron endpoint exactly as the Railway worker does — `GET` with the Bearer header — and confirm the response:

```bash
# Correct secret → HTTP 200 + the typed counts object
curl -i https://<PROD_APP_URL>/api/cron/reminders \
  -H "Authorization: Bearer <CRON_SECRET>"
# Expect: 200, body { "reviewReminders": <number>, "ackReminders": <number> }

# Missing / wrong secret → HTTP 401
curl -i https://<PROD_APP_URL>/api/cron/reminders
# Expect: 401, body { "error": "Unauthorized" }
```

The exact success body is `{ "reviewReminders": <number>, "ackReminders": <number> }` (the route's `Response.json({ reviewReminders, ackReminders })`). On a freshly launched org with no due/overdue policies both counts are `0` — that's a healthy 200, not a failure. A `503` with `{ "error": "Database unavailable" }` means the org-enumeration query failed (check `DATABASE_URL`).

---

### 10c. Cross-org RLS smoke (hard blocking before real tenants)

Before admitting any real tenant, prove tenant isolation in the deployed production app under a real Clerk session. This is the production authority for RLS enforcement; the schema verifier in §6 is not enough.

1. Create or use two production test organizations: Org A and Org B.
2. Sign in as an Org A user and confirm the positive control: Org A can see its own expected rows.
3. Run a deliberate Org B probe through an Org A session and confirm the negative control: Org B rows return `0`.
4. Treat a result where Org A sees no rows at all as inconclusive, not as a pass. A broken/empty JWT claim can fail closed and hide every row.
5. Record the pass/fail evidence without secrets or raw third-party payloads.

This smoke is load-bearing because the runtime makes RLS fire by entering `withOrgScope()` and issuing `SET LOCAL ROLE authenticated` before tenant queries.

---

## 11. Confirm the daily Railway cron run (Phase 7 AC#2)

Phase 7 acceptance requires one successful scheduled run observable in Railway logs.

1. After the worker is deployed with §8 env, wait for the next **08:00 UTC** tick (`cronSchedule: 0 8 * * *`) — or trigger a manual run from the Railway dashboard to validate sooner.
2. In Railway logs, confirm a `[trigger-reminders] completed` line with `status: 200, ok: true` and the `{reviewReminders, ackReminders}` body echoed.
3. That single observed 200 run is the **Phase 7 AC#2** evidence (Railway worker triggers the cron daily — secret-safe evidence, operator-executed). Record it (see §12).

---

## 12. Audit-log the prod migration + close out

After a successful **prod** migration, append one line to `.planning/STATE.md` (Session Continuity section), using the audit-log template + example in [`deploy-migrations.md` § Audit log](./deploy-migrations.md#audit-log) (the same template referenced by [`reference/MIGRATIONS.md` § Audit log](../../reference/MIGRATIONS.md#audit-log)). Shape:

```markdown
- **Deploy migration YYYY-MM-DDTHH:MM:SSZ**: Applied drizzle/<N>..drizzle/<M> to staging at HH:MM (verify OK at HH:MM); applied to prod at HH:MM (verify OK at HH:MM). Operator: <name>. Migration types: <additive|destructive>. Notes: <any deviation or observation>.
```

For this launch the prod range is `0000..0014` (virgin DB, all additive — `0007`'s historical destructive `DROP COLUMN tokens_used` applies cleanly on a virgin DB with no rows to lose). Record the staging range applied this cycle and any `wait-pooler-auth` observations.

Optional, operator-run: once the milestone is confirmed live and the audit line is written, run `/gsd-complete-milestone` to archive the milestone per the GSD flow. This is an operator action — not part of the deploy itself.

---

## Related files

- [`docs/runbooks/deploy-migrations.md`](./deploy-migrations.md) — migration gate mechanics (Pattern-3 wrapper, `28P01` gate, rollback classes, CI path, audit-log template). Cross-linked throughout.
- [`reference/MIGRATIONS.md`](../../reference/MIGRATIONS.md) — migration discipline + verifier map + audit-log pointer.
- [`.planning/codebase/INTEGRATIONS.md`](../../.planning/codebase/INTEGRATIONS.md) — authoritative env-var matrix (reused in §7).
- `scripts/deploy-config.json` — per-env routing; prod `user` placeholder replaced in §3a.
- `scripts/store-deploy-password.ps1` — GUI-prompt password capture into SecretStore (§3b).
- `railway.json` — worker `startCommand` + `cronSchedule` (§8).
- `worker/trigger-reminders.mjs` — the worker that calls the cron endpoint (§8/§11).
- `app/api/cron/reminders/route.ts` — the cron route (401/200 + `{reviewReminders, ackReminders}`) smoke-tested in §10.
- `.planning/phases/07-crons-email/07-SPEC.md` — Phase 7 spec; ADR-014 (Railway worker, NOT Vercel cron).
- `.env.local.example` — required env var names + Resend default sender.
- `.planning/STATE.md` — audit-log destination (§12).
