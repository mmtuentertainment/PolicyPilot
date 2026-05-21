# API Audit Report -- API Project
**Date:** 2026-05-19 16:43 UTC | **Auditor:** claude-api-auditor v1.0.0 | **SOP:** May 2026 (Research-Validated)

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical/High (VIOLATION) | 87 |
| Medium (WARNING) | 2 |
| **Total** | **89** |

## Route Inventory
- Total routes: **1** (Next.js App Router routes are not detected by the framework-agnostic indexer; `POST /api/webhooks/clerk` discovered via manual `app/api/**/route.ts` walk — see PHASE-2-API-AUDIT.md "Inputs to this Audit" table)
- Missing auth: **0** (webhook verifies svix signature with rotated `whsec_…` per SF-WHSEC-1 closure)
- Missing rate limit: **1** (`POST /api/webhooks/clerk` — Vercel surface; Phase 7+ Railway worker adds Redis sliding window per F-04)

## Critical Path -- Fix These First

| # | Domain | Finding | File | Line | OWASP |
|---|--------|---------|------|------|-------|
| 1 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/.previewinfo | .previewinfo | 1 | A03:2025 |
| 2 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/.previewinfo | .previewinfo | 1 | A03:2025 |
| 3 | Cryptography/Secrets | Secret: generic-api-key in .next/prerender-manifest.json | prerender-manifest.json | 8 | A03:2025 |
| 4 | Cryptography/Secrets | Secret: generic-api-key in .next/prerender-manifest.json | prerender-manifest.json | 9 | A03:2025 |
| 5 | Cryptography/Secrets | Secret: generic-api-key in .next/server/middleware-manifest. | middleware-manifest.json | 21 | A03:2025 |
| 6 | Cryptography/Secrets | Secret: generic-api-key in .next/server/middleware-manifest. | middleware-manifest.json | 23 | A03:2025 |
| 7 | Cryptography/Secrets | Secret: generic-api-key in .next/server/middleware-manifest. | middleware-manifest.json | 24 | A03:2025 |
| 8 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/.rscinfo | .rscinfo | 1 | A03:2025 |
| 9 | Cryptography/Secrets | Secret: generic-api-key in .next/server/server-reference-man | server-reference-manifest.json | 97 | A03:2025 |
| 10 | Cryptography/Secrets | Secret: stripe-access-token in .env.local | .env.local | 15 | A03:2025 |
| 11 | Cryptography/Secrets | Secret: generic-api-key in .env.local | .env.local | 14 | A03:2025 |
| 12 | Cryptography/Secrets | Secret: jwt in .env.local | .env.local | 7 | A03:2025 |
| 13 | Cryptography/Secrets | Secret: jwt in .env.local | .env.local | 8 | A03:2025 |
| 14 | Cryptography/Secrets | Secret: generic-api-key in .tmp/svix-url.json | svix-url.json | 1 | A03:2025 |
| 15 | Cryptography/Secrets | Secret: generic-api-key in .tmp/svix-url.json | svix-url.json | 1 | A03:2025 |
| 16 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 35542 | A03:2025 |
| 17 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 35543 | A03:2025 |
| 18 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 35544 | A03:2025 |
| 19 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 239878 | A03:2025 |
| 20 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 239994 | A03:2025 |
| 21 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333531 | A03:2025 |
| 22 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333532 | A03:2025 |
| 23 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333533 | A03:2025 |
| 24 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333538 | A03:2025 |
| 25 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333538 | A03:2025 |
| 26 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333624 | A03:2025 |
| 27 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333625 | A03:2025 |
| 28 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333626 | A03:2025 |
| 29 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333713 | A03:2025 |
| 30 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333714 | A03:2025 |
| 31 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333715 | A03:2025 |
| 32 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333792 | A03:2025 |
| 33 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333792 | A03:2025 |
| 34 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333878 | A03:2025 |
| 35 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333879 | A03:2025 |
| 36 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 333880 | A03:2025 |
| 37 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 503237 | A03:2025 |
| 38 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 503353 | A03:2025 |
| 39 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 503515 | A03:2025 |
| 40 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 339294 | A03:2025 |
| 41 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 339421 | A03:2025 |
| 42 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 339958 | A03:2025 |
| 43 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 340072 | A03:2025 |
| 44 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 595938 | A03:2025 |
| 45 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484732 | A03:2025 |
| 46 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484733 | A03:2025 |
| 47 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484734 | A03:2025 |
| 48 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484739 | A03:2025 |
| 49 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484739 | A03:2025 |
| 50 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484825 | A03:2025 |
| 51 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484826 | A03:2025 |
| 52 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484827 | A03:2025 |
| 53 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484914 | A03:2025 |
| 54 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484915 | A03:2025 |
| 55 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484916 | A03:2025 |
| 56 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484993 | A03:2025 |
| 57 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 484993 | A03:2025 |
| 58 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485079 | A03:2025 |
| 59 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485080 | A03:2025 |
| 60 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485081 | A03:2025 |
| 61 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485246 | A03:2025 |
| 62 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485247 | A03:2025 |
| 63 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485248 | A03:2025 |
| 64 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485328 | A03:2025 |
| 65 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485328 | A03:2025 |
| 66 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485414 | A03:2025 |
| 67 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485415 | A03:2025 |
| 68 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485416 | A03:2025 |
| 69 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485583 | A03:2025 |
| 70 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485584 | A03:2025 |
| 71 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 485585 | A03:2025 |
| 72 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/client-produc | 0.pack | 708336 | A03:2025 |
| 73 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 621489 | A03:2025 |
| 74 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 621603 | A03:2025 |
| 75 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 621763 | A03:2025 |
| 76 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 833653 | A03:2025 |
| 77 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 833780 | A03:2025 |
| 78 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 833966 | A03:2025 |
| 79 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 875527 | A03:2025 |
| 80 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 875527 | A03:2025 |
| 81 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 875613 | A03:2025 |
| 82 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 875614 | A03:2025 |
| 83 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 875615 | A03:2025 |
| 84 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 903175 | A03:2025 |
| 85 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 939550 | A03:2025 |
| 86 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 1033797 | A03:2025 |
| 87 | Cryptography/Secrets | Secret: generic-api-key in .next/cache/webpack/server-produc | 0.pack | 1033840 | A03:2025 |

## All Findings by Domain

### AuthN/AuthZ

**[MEDIUM]** SF-W5: idempotency row written BEFORE dispatch — a throw in the switch statement is caught at L323-339 and returns 200, but clerk_events already shows the svix-id as processed. Clerk's retry will short-circuit on the idempotency check. The event is silently lost. Code documents this as deferred (Phase 7+).  
File: `route.ts:147` | OWASP: API4:2023 / API9:2023  
Fix: Phase 7+: invert order — dispatch first, then insert clerk_events row inside the same transaction. If you cannot ship the transactional inversion, at minimum DELETE the clerk_events row inside the catch block so a Clerk retry can re-fire.  

### Cryptography/Secrets

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/.previewinfo  
File: `.previewinfo:1` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/.previewinfo  
File: `.previewinfo:1` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/prerender-manifest.json  
File: `prerender-manifest.json:8` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/prerender-manifest.json  
File: `prerender-manifest.json:9` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/server/middleware-manifest.json  
File: `middleware-manifest.json:21` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/server/middleware-manifest.json  
File: `middleware-manifest.json:23` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/server/middleware-manifest.json  
File: `middleware-manifest.json:24` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/.rscinfo  
File: `.rscinfo:1` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/server/server-reference-manifest.json  
File: `server-reference-manifest.json:97` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: stripe-access-token in .env.local  
File: `.env.local:15` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .env.local  
File: `.env.local:14` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: jwt in .env.local  
File: `.env.local:7` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: jwt in .env.local  
File: `.env.local:8` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .tmp/svix-url.json  
File: `svix-url.json:1` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .tmp/svix-url.json  
File: `svix-url.json:1` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:35542` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:35543` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:35544` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:239878` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:239994` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333531` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333532` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333533` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333538` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333538` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333624` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333625` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333626` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333713` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333714` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333715` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333792` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333792` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333878` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333879` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:333880` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:503237` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:503353` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:503515` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:339294` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:339421` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:339958` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:340072` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:595938` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484732` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484733` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484734` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484739` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484739` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484825` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484826` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484827` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484914` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484915` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484916` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484993` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:484993` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485079` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485080` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485081` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485246` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485247` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485248` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485328` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485328` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485414` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485415` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485416` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485583` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485584` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:485585` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/client-production/0.pack  
File: `0.pack:708336` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:621489` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:621603` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:621763` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:833653` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:833780` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:833966` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:875527` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:875527` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:875613` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:875614` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:875615` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:903175` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:939550` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:1033797` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[CRITICAL/HIGH]** Secret: generic-api-key in .next/cache/webpack/server-production/0.pack  
File: `0.pack:1033840` | OWASP: A03:2025  
Fix: Remove from source. Rotate credential. Use secrets manager.  

**[LOW]** .tmp/svix-url.json contains a Svix oneTimeToken in plaintext on disk. File is gitignored, but it grants access to the Svix Play test dashboard. No production exposure.  
File: `svix-url.json:1` | OWASP: API8:2023  
Fix: Delete .tmp/svix-url.json after debugging session ends. Consider adding `rm -rf .tmp/svix-url.json` to a post-debug hook or to the existing post-PR-merge cleanup checklist in CLAUDE.md.  

**[LOW]** gitleaks found 84 secrets in .next/cache/* and .next/server/* — these are Next.js BUILD ARTIFACTS (preview-mode signing keys, server-action encryption keys regenerated on every build). The entire .next/ directory is gitignored. No leak risk via git, but the keys exist on disk. .env.local additionally contains 4 real keys (Stripe test, Clerk publishable, two Supabase JWTs). All gitignored.  
File: `.env.local:7` | OWASP: Web Top 10 2025 — A02 (Secrets in Build Artifacts)  
Fix: No code change needed. Verify backup/sync tools (OneDrive, robocopy to D:\Backup) are not syncing .env.local or .next/ — confirmed earlier that D:\Backup excludes these per `C:\Users\matth\memory\context\drives.md`. Stripe key is test-mode (sk_test_*) — rotate after Phase 6 launch.  

### Observability

**[MEDIUM]** Clerk org IDs and slugs logged unmasked at L176, L197, L267, L298 (e.g. `organization.created ${data.id}`). User IDs are correctly masked via maskClerkId(); apply the same redaction to org IDs to prevent tenant enumeration via log aggregator access.  
File: `route.ts:176` | OWASP: API8:2023 / API9:2023  
Fix: Add maskClerkOrgId(id) helper mirroring maskClerkId. Replace `data.id` / `clerkOrgId` with `maskClerkOrgId(...)` in all four `[clerk-webhook]` log lines that interpolate org identifiers.  

**[LOW]** All logging is console.log/console.error with [clerk-webhook] prefix. Acceptable for Phase 2 Vercel deploy (Vercel captures stdout); not durable for Railway worker phase. No structured logging, no log shipping, no PII redaction filter — the maskClerkId helper is hand-applied per call site, easy to forget.  
File: `route.ts:60` | OWASP: API9:2023 / API10:2023  
Fix: Phase 7+ Observability phase: replace console.* with pino. Wire a redaction filter at the logger level (pino redact paths: ['*.clerkUserId', '*.clerkOrgId']) so masking is enforced, not opt-in per call site. Ship to Axiom or Logflare. Until then, keep the hand-applied masking and just extend it to org IDs (APIAU-OBSV-001).  

### Rate Limiting

**[LOW]** No application-layer rate limit on the webhook. Admission control is entirely svix signature verification. An attacker hammering the endpoint with junk signatures forces one HMAC-SHA256 per request. Low risk because svix.verify is cheap and Vercel provides platform DDoS protection — but worth tracking once the Railway worker (Phase 7) takes over.  
File: `route.ts:99` | OWASP: API4:2023  
Fix: No action for Phase 2 Vercel deploy. Phase 7+ Railway worker: add Redis-backed sliding-window rate limit keyed by source IP, with a 60s window and a 100-req cap.  

## Next Priority Action

**Webhook idempotency-before-dispatch ordering (Phase 7+ obligation)**

Current contract (Plan 02-05 + 03-G3 T7 interim fix): the Clerk webhook
handler at `app/api/webhooks/clerk/route.ts` writes the `clerk_events`
idempotency row BEFORE dispatching the event handler. T7 (commit
`2da89b4`) closes the silent-drop race by deleting the row before any
non-2xx return, so Clerk's exponential retry re-fires the handler.
Phase 7+ should invert the order entirely: only insert the
`clerk_events` row AFTER successful dispatch, and add structured
alerting on stuck rows. References:
- `app/api/webhooks/clerk/route.ts:14-21` — current SF-W5 doc block
- `.planning/phases/03-admin-ui/03-G3-SUMMARY.md` — T7 interim fix
- This file's auto-generated `.next/cache/.previewinfo` flag is triaged
  noise (gitignored; not in repo); the original `Next Priority Action`
  pointing at it was misleading per CR-PR3-#22.
