---
phase: 02-data-layer
plan: 02
type: execute
status: partial
completed_tasks: 3
total_tasks: 4
deferred_tasks: 1
deferred_until: "DATABASE_URL_TEST + DIRECT_URL_TEST populated (blocked by Supabase free-tier 2-project limit)"
date: 2026-05-17
---

# Plan 02-02 SUMMARY — Operator Manual Config (Clerk + Supabase)

**Status:** Partial complete (3/4 tasks done). Phase 2 can proceed through Plans 02-03 → 02-05; **Plan 02-06 (RLS property test) is blocked** on the missing Supabase test project URLs.

---

## Task Outcomes

### Task 1 — Clerk Organization Roles + Session Token (D-09 + D-04)

**Status:** ✓ Complete

- **Organization Roles (D-09):** Three effective roles configured in Clerk Dashboard (verified via `GET https://api.clerk.com/v1/organization_roles`):
  - `Admin` (built-in, key=`org:admin`) — description customized to match D-09: "Full org admin — creates/edits/publishes policies, manages users"
  - `reviewer` (custom, key=`org:reviewer`) — "Growth+ only — approves drafts via workflow_stages"
  - `employee` (custom, key=`org:employee`) — "Reads + acknowledges assigned policies"
  - Clerk built-in `Member` (key=`org:member`) remains; D-09 fallback clause accepts this — `asRole()` narrowing in `lib/auth/context.ts` will throw `Invalid role on session claims: org:member` if it ever reaches `getOrgContext`, which is the desired fail-loud behavior.
  - **Note:** Clerk role keys carry the `org:` prefix (not stripped in the Dashboard). Plan 02-05's webhook handler MUST strip the prefix when mapping `organizationMembership.role` → `users.role` (so `org:admin` → `admin`, etc.).
- **Session Token customization (D-04):** Already configured. Dashboard shows the JWT template includes `"publicMetadata": "{{user.public_metadata}}"`. No changes needed.

### Task 2 — Clerk Webhook Endpoint (D-03)

**Status:** ✓ Complete (with placeholder URL — will be updated during Plan 02-05 end-to-end testing)

- Generated one-time Svix Dashboard URL via `POST https://api.clerk.com/v1/webhooks/svix_url`.
- Operator clicked through Svix Dashboard and created a webhook endpoint with EXACTLY 4 events subscribed:
  1. `organization.created`
  2. `user.created`
  3. `organizationMembership.created`
  4. `organizationMembership.updated`
- Endpoint URL is currently a placeholder (`https://placeholder-will-update-later.example.com/api/webhooks/clerk`). Plan 02-05 ships the actual handler; Plan 02-05 / 02-06 testing will update the URL to a real dev tunnel (ngrok/cloudflared).
- Signing secret captured. `.env.local` updated with `CLERK_WEBHOOK_SECRET=whsec_...`.

**⚠ Security follow-up:** During this checkpoint, the `whsec_...` signing secret was pasted into the chat transcript. The transcript is local but the secret is now in two places (the file + the transcript log). Operator should rotate the signing secret in Svix Dashboard before production traffic flows through Plan 02-05's handler. Rotation is a single button click; no code change required.

### Task 3 — Supabase Test Project (D-05)

**Status:** ✗ Blocked — free-tier 2-project limit hit

- The operator's Supabase account (`mmtuentertainment@gmail.com`) is at the free-tier 2-project ceiling: `policypilot-dev` (in use) + `realestate` (in use by another initiative).
- **Cannot create `policypilot-test` without:**
  - **Option A:** Pause or delete the `realestate` project (frees a slot; paused projects can be restored within 90 days).
  - **Option B:** Upgrade the Supabase organization to Pro (~$25/mo, removes the project limit).
- **DATABASE_URL_TEST** and **DIRECT_URL_TEST** are intentionally blank in `.env.local` with a TODO comment pointing here.

### Task 4 — `.env.local` updates

**Status:** ✓ Complete for unblocked keys; 2 keys intentionally blank pending Task 3

- `CLERK_WEBHOOK_SECRET=whsec_...` — populated.
- `DIRECT_URL=postgresql://postgres:<password>@db.kdoahaxhmaftxaiwbtdw.supabase.co:5432/postgres` — populated using the same password as `DATABASE_URL` (Supabase uses one password per project for both pooler and direct connections; the password was substituted from line 11 of `.env.local`, never echoed to chat).
- `DATABASE_URL_TEST=` — intentionally blank (blocked).
- `DIRECT_URL_TEST=` — intentionally blank (blocked).

---

## Sentinel Check Results

Per `secrets-never-in-chat` memory directive — values never echoed; only sentinel substring presence and exit codes:

| Sentinel | Status |
|----------|--------|
| `.env.local` exists | ✓ |
| `.env.local` gitignored (`git check-ignore -v` exits 0) | ✓ |
| `.env.local` not staged for commit | ✓ |
| `DIRECT_URL=postgresql://` substring present | ✓ |
| `CLERK_WEBHOOK_SECRET=whsec_` substring present | ✓ |
| `:6543` substring present (pooler keys) | ✓ |
| `:5432` substring present (direct keys) | ✓ |
| `DATABASE_URL_TEST=postgresql://` substring present | ✗ (deferred) |
| `DIRECT_URL_TEST=postgresql://` substring present | ✗ (deferred) |

**Phase 1 keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, NEXT_PUBLIC_APP_URL):** all preserved, unchanged.

---

## Downstream Impact

| Plan | Affected by partial completion? | Notes |
|------|---------------------------------|-------|
| 02-03 | No | Uses `DIRECT_URL` (populated) for migrations; uses `DATABASE_URL` for runtime. Both available. |
| 02-04 | No | Repository skeletons — type-only, no DB access in this phase. |
| 02-05 | No | Webhook handler needs `CLERK_WEBHOOK_SECRET` (populated). Smoke test deferred to ngrok-tunnel session. |
| 02-06 | **Yes** | `scripts/check-rls.ts` + `scripts/check-schema.ts` need `DATABASE_URL_TEST` + `DIRECT_URL_TEST`. Halt before Plan 02-06 until Task 3 resolved. |

---

## Deviations from Plan

- **Dashboard state was pre-configured.** Three of the four Dashboard tasks (org roles + session token + the prior CLERK_WEBHOOK_SECRET presence) were already in some state from earlier sessions. The prior `CLERK_WEBHOOK_SECRET` value in `.env.local` was actually empty; we set it now from the freshly-created Svix endpoint.
- **Clerk role keys carry `org:` prefix.** D-09's spec asks for unprefixed lowercase keys, but Clerk's role system always prefixes with `org:`. Plan 02-05's webhook handler must strip the prefix. Recording as a small contract: `mapClerkRole(clerkRole) = clerkRole.replace(/^org:/, '')`.
- **Svix endpoint URL is a placeholder.** Will be updated during Plan 02-05/02-06 testing with a real dev tunnel URL.

---

## Operator Memory / Follow-ups

- **SF-M5-FOLLOW**: rotate the `whsec_...` signing secret in Svix Dashboard once Plan 02-05 testing is complete. (Recorded in STATE.md follow-ups.)
- **SF-DB-1**: resolve Supabase 2-project limit before Plan 02-06. Options A/B above. Recommendation: pause `realestate` if it's idle — paused projects retain data for 90 days and can be unpaused with one click.

---

*Plan: 02-02 / Phase: 02-data-layer / Completed: 2026-05-17 (partial)*
