# Phase 8: Validation (CSV-first slice) — Discussion Log

**Date:** 2026-06-15 · **Mode:** discuss `--power` (Claude/Opus) + operator decisions · **Phase:** 08-validation

Per-decision audit of the HOW choices in `08-CONTEXT.md`. Operator-locked decisions are marked **[OPERATOR]**; the rest are Claude/Opus discuss-`--power` calls grounded in recon of the live repo. Ambiguity going in was already low (handoff + recon pre-resolved most WHAT).

| # | Decision point | Options considered | Locked | Rationale |
|---|----------------|--------------------|--------|-----------|
| Q1 **[OPERATOR]** | CSV employee-identity columns (name/email live only in Clerk, not `users`) | (A) Clerk-enriched name+email; (B) DB-only IDs, defer enrichment; (C) email-only | **(A) Clerk-enriched name + email** | Audit usefulness + the R-007 beat-manual value prop need human-readable identity; opaque Clerk IDs make a weak audit CSV. `clerkClient` is already in-stack — NOT a new package, so it doesn't break the no-new-deps guardrail. Cost (a batched Clerk lookup + test mock) accepted. |
| Q2 **[OPERATOR]** | Fold the ASK-FIRST `reference/SCHEMA.md` notifications `org_id` doc-fix into this phase? | (A) Yes, fold in; (B) separate doc PR | **(A) Fold in** | Pure additive doc correction (the live schema already has `org_id`); no contract-behavior change. Clears long-standing doc-debt during the keep-current pass (R-009). |
| D-01 | Where does the report query live? | New `lib/db/repositories/reports.ts` vs a method on `policies`/`acknowledgments` repo | New `reports.ts` | 5-table read-only reporting JOIN with no write side; a dedicated module matches the route and keeps the acks/policies repos append-only-clean (ADR-018/023). |
| D-02 | Query JOIN + ack-state | New bespoke query vs reuse 07 D-09 + 05 D-01 | Reuse both | `reminders.ts:79-163` already does the org-wide user-direct-OR-department JOIN; `policies.ts:135-209` already does 3-state `ackState`. Mirror them (drop reminder window predicates) — proven, RLS-safe, no N+1. `selectDistinct` to avoid double-counting dual-assigned users. |
| D-04 | How is `stale` (acked prior version) counted? | Count stale as acknowledged vs as pending | **Pending / not-compliant on current version** | Matches 07 D-07 "re-publish forces re-ack"; honest for an auditor. `acknowledgedAt`/IP come from the current-version ack only (null for stale). |
| D-05 | Clerk enrichment placement | Inside the DB tx vs after; per-row vs batched | After `withOrgScope`, batched in `lib/reports/enrich.ts` | Never hold a boundary-crossing HTTP call inside a DB tx; batch `getUserList({ userId })` to avoid N+1; testable in isolation; mocked at module boundary in CI (no live Clerk). |
| D-06 | Enrichment input set | Result-set userIds only vs any caller-supplied set | **Result-set `clerkUserId`s only** | Security invariant: the only userIds sent to Clerk are those the RLS-scoped query already returned — no param/header can coerce a cross-org identity lookup. (Primary red-team target.) |
| D-08 | Param validation | Manual parsing vs zod | zod `safeParse` over `searchParams` | Consistent with existing route validation; unknown `format` (enum) and malformed UUID both → 400 `{error:'invalid_request'}` cleanly. |
| D-09 | CSV serializer | Add a CSV package vs hand-roll | **Hand-roll `lib/reports/csv.ts`** | No-new-deps guardrail; RFC-4180 escaping is small and well-understood. Added a formula/CSV-injection guard (prefix `'` on `= + - @ TAB CR` leads) on all string cells — a real spreadsheet-attack vector for user-controlled policy titles / names. |
| D-10 | CSV transport | String body vs stream | String body | One org's report is small; streaming adds complexity for no benefit at MVP scale (deferred if a single org's report grows unbounded). `Content-Disposition: attachment` + dated filename using internal org UUID (PII-free, no slug lookup). |
| D-12 | Test strategy | Mocks only vs +TEST-DB integration | Three layers (route unit + serializer unit + `check-reports.ts` TEST-DB integration) | Module mocks can't prove RLS cross-org isolation or real ack-state derivation; the TEST-DB integration (mirror `check-rls.ts`/`check-employee-portal.ts`) does. Clerk stubbed in integration. |
| D-13 | Verify wiring | New standalone gate vs cumulative | **Cumulative `verify:phase-8` wrapping `verify:phase-7`** | Guardrail: never weaken a gate. `verify:phase-8` runs `verify:phase-7` in full, then adds `check:reports` + reports tests + artifact assertions; `verify-phase-8.yml` mirrors `verify-phase-7.yml` (incl. the TRUNCATE-deadlock concurrency guard). |

## Scope guard (re-affirmed)

DEFERRED, not abandoned: compliance dashboard donut / Recharts (ASK-FIRST + ≥14-day rule when picked up), aggregate widgets, populated-org seed harness, Stripe test-clock renewal run (AC#6), beat-manual benchmark (SC#5), evidence-capture for the 6 already-shipped criteria. This slice builds acceptance criterion **#5 only**. No schema change (index `0014`); no new runtime package; dev/TEST only.

---

*Phase: 08-validation · Discussion logged 2026-06-15*
