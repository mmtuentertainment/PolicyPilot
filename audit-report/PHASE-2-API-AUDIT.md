# PolicyPilot — Phase 2 API Audit
**Date:** 2026-05-19 · **Branch:** `gsd/phase-3-admin-ui` · **Scope:** every `app/api/**/route.{ts,js}` shipped at HEAD
**Auditor:** Claude Opus 4.7 via `api-auditor` skill (Spectral / Semgrep / Vacuum not installed; gitleaks + manual semantic analysis)

---

## TL;DR

**Phase 2 ships exactly one API route** — `app/api/webhooks/clerk/route.ts`. It is **defensible**. There are no critical bugs, no signature-verification mistakes, no SQL injection surface, and no live secret leaks. The code shows clear awareness of webhook foot-guns (raw-text-before-JSON, replay defense, fail-closed missing-secret) and documents the one accepted correctness gap (SF-W5) inline.

**Real findings:** 2 medium, 4 low/note. None block Phase 3. All correlate to existing Phase 7+ obligations or trivial follow-ups.

**Re: the auto-renderer's "87 CRITICAL" count:** all 87 are gitleaks hits inside **gitignored files** (`.next/` build artifacts, `.env.local`, `.tmp/`). Zero secrets are in git-tracked source. The renderer can't distinguish — see [`audit-report.md`](./audit-report.md) for the raw output and below for triage.

---

## Route Inventory

| Method | Path | File | Auth Model | Status |
|--------|------|------|------------|--------|
| `POST` | `/api/webhooks/clerk` | `app/api/webhooks/clerk/route.ts` | Svix HMAC-SHA256 signature + clerk_events idempotency | ✅ Phase 2 |

That's the full list. `/api/webhooks/stripe` and `/api/cron/*` are referenced in `middleware.ts` as future bypass routes but the handlers don't exist yet (Phase 6 / Phase 7).

---

## Strengths (affirmative findings)

These are not bugs — they are correct design choices verified during the audit. Documenting so they don't get refactored away in later phases.

| # | What | Why it matters | Cite |
|---|------|---------------|------|
| S1 | `req.text()` BEFORE any JSON parse | Request body is a one-shot stream; calling `req.json()` first consumes it and `svix.verify()` fails. Pitfall #4 documented inline. | `route.ts:112` |
| S2 | `svix.verify()` not hand-rolled HMAC | Library handles constant-time compare, 5-min timestamp window, multi-sig rotation. Hand-rolling gets any of these wrong. | `route.ts:127-134` |
| S3 | Hard-fail on missing `CLERK_WEBHOOK_SECRET` → 500 (not 401) | Distinguishable from signature failure in Clerk Dashboard logs — operator can spot misconfig vs replay. | `route.ts:100-107` |
| S4 | `clerk_events` + `ON CONFLICT DO NOTHING` replay defense | Single round-trip atomic upsert. PostgreSQL primitive does the work — no race between SELECT and INSERT. | `route.ts:147-159` + `schema.ts:66` |
| S5 | Webhook bypasses Clerk middleware (`isWebhookRoute`) | Webhooks verify their own credentials; running Clerk middleware on them would 401 every incoming event (no session cookie). | `middleware.ts:23-26, 39-41` |
| S6 | `maskClerkId()` PII redaction on user IDs (last-4 retained for grep) | Clerk user IDs are PII-adjacent identifiers. Mask-but-keep-tail is the standard log-redaction trade-off. | `route.ts:33-36` |
| S7 | Service-role `db` import explicitly allow-listed (ADR-023 / L-05) | The `check-db-imports.ts` script enforces this file is the only exception. The architectural invariant has a build-time gate, not a code-review hope. | `route.ts:4-9` |
| S8 | `noUncheckedIndexedAccess` defensive narrowing on `orgRow[0]` | Catches the edge case where Drizzle returns an array but TypeScript would normally widen to `T[]`. | `route.ts:232-238` |
| S9 | Middleware fails closed on `auth()` errors → 404 in admin gate, redirect elsewhere | Per D-10 "advertise nothing" — surfacing 403/401 leaks route existence. | `middleware.ts:52-65` |
| S10 | `redirect_url` uses `req.nextUrl.pathname + search` not `req.url` | Removes Host-header injection vector permanently — does not trust `req.url` host. | `middleware.ts:106-113` (WR-01) |
| S11 | All DB writes are Drizzle parameterized — no raw SQL strings | No SQL injection surface anywhere in the webhook handler or middleware. | `route.ts:166-300` |
| S12 | `prepare: false` on the Postgres client (Supabase Transaction pooler) | Required for port-6543 pooler. Wrong choice here would leak prepared-statement state across pooled connections. | `lib/db/index.ts:18` |

---

## Findings — Triaged

### MEDIUM

#### F-01 · `APIAU-AUTH-001` · Idempotency row written before dispatch (SF-W5)
- **File:** `app/api/webhooks/clerk/route.ts:147-159, 323-339`
- **OWASP:** API4:2023 (Unrestricted Resource Consumption) — closest fit; really an availability/correctness issue.
- **What:** `clerk_events` row is `INSERT…ON CONFLICT DO NOTHING` BEFORE the `switch (evt.type)` dispatch. The `catch` at L323-339 logs the dispatch failure and returns **200**. Clerk's retry then short-circuits on the idempotency row. The event is **silently lost**.
- **Status:** Documented inline as `SF-W5 (Phase 7+)`. Operator-monitored via console logs in the meantime.
- **Fix:** Phase 7+: invert the order — dispatch first, then insert `clerk_events` inside the same transaction. **Minimum-viable interim fix** (15 lines, could ship in Phase 3 if desired): `DELETE FROM clerk_events WHERE id = $1` inside the catch block so Clerk retry can re-fire.

#### F-02 · `APIAU-OBSV-001` · Org IDs logged unmasked
- **File:** `app/api/webhooks/clerk/route.ts:176, 197, 267, 298`
- **OWASP:** API8:2023 / API9:2023 (Improper Inventory Management — exposes tenant IDs to log indexers)
- **What:** User IDs are masked via `maskClerkId()` — good — but `data.id` (org ID) and `clerkOrgId` flow into logs raw. Aggregated logs reveal the tenant base.
- **Fix (Phase 3 candidate):** Add `maskClerkOrgId(id)` mirroring `maskClerkId`. Update 4 call sites. ~10 lines.

  ```ts
  function maskClerkOrgId(id: string): string {
    if (id.length <= 4) return '***';
    return `org_***${id.slice(-4)}`;
  }
  // L176:  console.log(`[clerk-webhook] organization.created ${maskClerkOrgId(data.id)}`);
  // L227:  // already references clerkOrgId; mask it before logging
  // L267:  // organizationMembership.created log
  // L298:  // organizationMembership.updated log (currently does not log org id — verify)
  ```

### LOW / NOTE

#### F-03 · `APIAU-RATE-001` · No application-layer rate limit on the webhook
- **File:** `app/api/webhooks/clerk/route.ts:99`
- **OWASP:** API4:2023
- **What:** Admission control is entirely svix signature verification. Attacker hammering with junk signatures forces one HMAC-SHA256 per request. Cheap by design — not a real DoS surface on Vercel.
- **Fix:** No action for Phase 2 (Vercel platform DDoS handles this). Phase 7+ Railway worker: add Redis-backed sliding-window rate limit keyed by source IP (60s window, 100 req cap).

#### F-04 · `APIAU-CRYPTO-001` · `.tmp/svix-url.json` contains a Svix oneTimeToken in plaintext
- **File:** `.tmp/svix-url.json:1`
- **OWASP:** API8:2023
- **What:** File is gitignored. Token grants access to the Svix Play test dashboard for one app. Dev-only.
- **Fix:** `rm -rf .tmp/svix-url.json` after each debugging session. Optional: add to a post-debug cleanup hook.

#### F-05 · `APIAU-SECRETS-001` · 87 gitleaks findings — ALL in gitignored files
- **Scope:** `.next/cache/**` (84) + `.env.local` (4 — Stripe test, Clerk publishable + secret, two Supabase JWTs) + `.tmp/svix-url.json` (2 from F-04)
- **What:** `.next/` is Next.js build cache (preview-mode signing keys, server-action encryption keys — regenerated on every build). `.env.local` is local-only env. `.tmp/` is dev scratch.
- **Verified:** `git check-ignore` confirms all three paths are gitignored. `git ls-files .env.local` returns empty.
- **Cross-check:** Per `C:\Users\matth\memory\context\drives.md`, the `D:\Backup\` daily robocopy excludes `node_modules/` and likely `.next/`; verify `.env.local` is also excluded if backups leave the machine.
- **Fix:** None for source-of-truth. Rotate `sk_test_*` Stripe key as test-only hygiene before Phase 6 production launch.

#### F-06 · `APIAU-OBSV-002` · `console.log` only; no structured log shipping
- **File:** `app/api/webhooks/clerk/route.ts` (throughout)
- **OWASP:** API9:2023 / API10:2023
- **What:** Bracketed prefix `[clerk-webhook]` is consistent and good. `maskClerkId()` is hand-applied per call site — easy to forget.
- **Fix:** Phase 7+ Observability: pino + redaction filter at logger level (`redact: ['*.clerkUserId', '*.clerkOrgId']`) → ship to Axiom/Logflare. Enforces masking, not opt-in.

---

## Domain Scorecard

| Domain | Verdict | Notes |
|--------|---------|-------|
| **AuthN/AuthZ** | ✅ Strong | Svix HMAC + idempotency + fail-closed missing-secret. One known correctness gap (SF-W5) documented and accepted. |
| **Injection** | ✅ Clean | All DB calls are Drizzle parameterized. No raw SQL. No SSRF surface (the only outbound call is `clerkClient().users.updateUserMetadata()` — Clerk SDK manages the URL). |
| **Rate Limiting** | ⚠ Platform-delegated | Vercel handles DDoS. Re-flag at Phase 7+ Railway migration. |
| **Cryptography/Secrets** | ✅ Clean (no git-tracked leaks) | All 87 gitleaks hits are gitignored. Stripe test key rotation due before Phase 6 launch. |
| **API Contract** | ➖ N/A | Webhook receiver — OpenAPI doesn't apply. Spectral check skipped. |
| **Performance** | ✅ Clean | All four switch branches do bounded work — one or two SELECT/UPDATE/INSERT round trips. No loops. No N+1. |
| **Observability** | ⚠ Phase 7+ | Console-only logs; org IDs unmasked (F-02). |

---

## Priority Action (single)

**Ship F-02 (`maskClerkOrgId`) in Phase 3.** ~10 lines, mirrors the existing user-ID masking, prevents tenant enumeration via log indexers. Everything else can wait for Phase 7+ Observability.

If you want a second priority: ship the 15-line interim fix for **F-01** (delete `clerk_events` row in the catch block) so Clerk retries can succeed without waiting for Phase 7+. But it's strictly optional — the gap is documented and operator-monitored.

---

## Files Generated

| Path | What |
|------|------|
| `audit-report/audit-report.sarif` | SARIF 2.1 output (uploadable via `gh code-scanning upload-sarif`). Includes all 87 gitleaks hits — filter by `domain != "Cryptography/Secrets" OR file !~ /^\.next\\|^\.env\\|^\.tmp/` if you want to suppress the false-criticals. |
| `audit-report/audit-report.md` | Auto-generated raw report (uses gitleaks counts; not triaged for gitignore status). |
| `audit-report/PHASE-2-API-AUDIT.md` | **This file** — triaged executive summary. |
| `audit-cache/routes.json` | Route manifest. Next.js App Router routes not detected by the framework-agnostic indexer (Express/FastAPI/Flask/Gin regex only); manual `app/api/**/route.ts` discovery used instead. |
| `audit-cache/static/gitleaks.json` | Raw gitleaks output (87 findings, all gitignored). |
| `audit-cache/semantic.json` | 6 semantic findings (F-01 through F-06). |

---

*Audit complete. Phase 3 can proceed.*
