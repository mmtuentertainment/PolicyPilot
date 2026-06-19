# Runbook: Dev Clerk Org Provisioning

**Last updated:** 2026-06-19
**Audience:** Operator (Matthew).
**Scope:** Repair local-dev `OrgNotProvisionedError` after creating a Clerk organization when localhost did not receive Clerk webhooks.

---

## When To Use

Use this only for local development when:

- You created a Clerk organization through the local app or Clerk UI.
- The active session has a Clerk org id.
- App routes show `OrgNotProvisionedError` or stay on "Setting up your organization..." because the local `/api/webhooks/clerk` endpoint was not reachable from Clerk.

This is a dev-ops repair path. Production should use a reachable Clerk webhook endpoint and should not need this script.

## What The Script Does

`pnpm dev:provision-org` reads Clerk and local DB credentials from `.env.local`, then:

1. Fetches the Clerk organization through the Backend API.
2. Fetches the target organization membership.
3. Upserts the matching `organizations` row to the same local end-state as `organization.created`: Starter + `trialing`; existing rows have Clerk name/slug refreshed.
4. Upserts the matching `users` row with the membership role, moving the user to that org if needed per the current one-user-one-org model.
5. Mirrors `publicMetadata.role` back to Clerk, matching the webhook handler behavior required by `getOrgContext()`.

It does not create fake `clerk_events` rows and does not replay Svix webhook payloads.

## Command

Dry-run first:

```powershell
$env:COREPACK_DEFAULT_TO_LATEST='0'
pnpm dev:provision-org -- --org org_... --user user_...
```

Apply:

```powershell
$env:COREPACK_DEFAULT_TO_LATEST='0'
$env:NODE_ENV='development'
pnpm dev:provision-org -- --org org_... --user user_... --apply
```

If the org has exactly one membership, `--user` can be omitted. If Clerk returns multiple memberships, the script stops and asks for `--user user_...` so it cannot pick the wrong account.

For non-local database hosts, `--apply` requires `NODE_ENV=development` or `NODE_ENV=test`. If the environment is intentionally different, use `--allow-host` only after verifying the database target is not staging or production.

## Inputs

Required `.env.local` values:

- `DATABASE_URL`
- `CLERK_SECRET_KEY`

The script prints only the DB host plus masked Clerk IDs. It never prints the database URL, Clerk secret, or webhook secret.

## Verification

After `--apply`:

1. Refresh the app.
2. If the old browser session still has stale Clerk claims, sign out and sign back in or switch the active organization again.
3. Run the read-only state check if needed:

```powershell
pnpm exec tsx --env-file=.env.local scripts/check-org-state.ts
```

Healthy local state has a row in `organizations` for the Clerk org and a row in `users` for the Clerk user with `org_id` set.

## Guardrails

- Do not run with production credentials.
- `--apply` refuses `NODE_ENV=production` and non-local hosts without explicit local/test intent or `--allow-host`.
- Do not paste secrets into chat or tracked files.
- Prefer a real webhook tunnel when testing the webhook handler itself. This script repairs local state; it does not prove Clerk webhook delivery.
