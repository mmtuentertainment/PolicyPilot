# Delta — PR #32 CodeRabbit triage (Phase 6) closed

**Date:** 2026-06-15
**Author:** Claude Code (Opus 4.8), operator-authorized
**Scope:** Triage + resolve the 5 untriaged CodeRabbit threads on merged PR #32; apply doc fixes; route the one real code bug to Codex.

## What happened

The 5 CR threads were re-verified against current `main` (745cb0d) by a 10-agent workflow
(`wf_59f7cf8a-864`: 1 fact-checker + 1 adversarial skeptic per thread). All verdicts
high-confidence, both agents agreeing. **Adversarial pass changed 2 verdicts vs the 14-day-old
triage memory.** All 5 replies posted + all 5 threads resolved under operator gh → **0 unresolved**.

| # | Thread | Verdict (re-verified) | Disposition |
|---|---|---|---|
| CR1 | `app/(admin)/settings/actions.ts` `getAppUrl()` | **Real code bug** (Major) | → Codex (below); posted "tracked follow-up" |
| CR2 | `lib/stripe/client.ts` apiVersion | False positive | Declined + resolved |
| CR3 | `lib/stripe/products.ts` raw `db` | False positive (live allow-list includes it) | Declined + resolved; header doc-debt fixed |
| CR4 | `.planning/codebase/CONCERNS.md:4` "no PR" | Auto-resolved by PR #39 (accurate at review time) | Resolved as already-fixed |
| CR5 | `.planning/codebase/INTEGRATIONS.md:251` `gsd/**` | Real drift, **wrong file** — actual stale text in `TESTING.md` | Doc-fixed (below) + resolved |

## Changes applied — branch `chore/pr32-triage-doc-hygiene`, commit `33f35e1`

- `.planning/codebase/TESTING.md` L431 (`verify.yml`) + L445 (`verify-phase-6.yml`): `main`/`gsd/**` → `main`
  (both workflows verified `main`-only; `verify.yml` keeps `+ nightly schedule`).
- `scripts/check-db-imports.ts`: header comment "4 logical entries" → describes the live 11-entry
  ALLOWLIST; violation error message now lists `lib/auth/context.ts` + `lib/stripe/products.ts`.
  Comment/string only — gate re-run green (exit 0, 11 allow-listed, 0 violations).

**Not yet pushed.** Operator owns push + PR for this branch.

## CR1 — Codex handoff packet (the one real code item)

**Bug:** `getAppUrl()` (`app/(admin)/settings/actions.ts:25-29`) falls back to `http://localhost:3000`
with no production guard; value feeds Stripe `return_url` (L60), `success_url` (L116), `cancel_url`
(L117). Missing `NEXT_PUBLIC_APP_URL` in prod → silent localhost Stripe URLs. Dormant today (prod
not deployed) but a latent Major. No test locks the unset path (`actions.test.ts:138,:321` always set a real URL), so a prod-throw is test-safe.

**Exact patch:**
```diff
 function getAppUrl(): string {
   const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
   if (configured) return configured.replace(/\/+$/, '');
-  return 'http://localhost:3000';
+  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000';
+  throw new Error('NEXT_PUBLIC_APP_URL must be set in production.');
 }
```

**Second occurrence (lower priority):** `lib/email/urls.ts:15` `appBaseUrl()` has the same localhost
fallback BUT falls through `VERCEL_URL` first (urls.ts:7-13), so it's less exposed on Vercel. Decide
whether to add the same prod-throw as the final fallback after the `VERCEL_URL` tier.

**Tests:** add a case asserting `getAppUrl()` throws when `NODE_ENV==='production'` and
`NEXT_PUBLIC_APP_URL` is unset (export the helper or exercise via the calling action). Keep the
existing real-URL tests green.

**Gates:** `tsc --noEmit` + `verify:phase-6` must stay green. Own branch off `main`, own PR.

## Consultant file set — keep-current

No-change to `working_context` / `system_map` / `feature_inventory` / `risk_register` / `backlog`:
this is post-merge hygiene on an already-shipped phase; no new feature, risk, or architecture decision.
R-017 / R-018 unaffected. The CR1 latent bug is captured here + routed to Codex, not a new risk-register
entry (dormant, scoped, owned).
