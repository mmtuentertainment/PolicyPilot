---
phase: 04-ai-layer
plan: 04-01
subsystem: ai
tags: [scaffold, sdk-install, contract-amendment, wave-0]
dependency-graph:
  requires: []
  provides:
    - "@anthropic-ai/sdk@0.97.1 (exact-pin) available to lib/ai/* (Plans 04-03 onward)"
    - "ANTHROPIC_API_KEY env-var placeholder (operator populates locally; CI populated in Plan 04-14)"
    - "D-39 SDK-namespace verification record (c.messages.batches STABLE confirmed)"
    - "PROMPTS.md Q&A section amended with D-10 citation fence + D-31 injection guard (Plan 04-04 will copy verbatim into lib/ai/prompts.ts)"
    - "API-SPEC.md POST /api/ai/qa Response shape widened to { title, id }[] per D-27 (Plan 04-05 materializes; Plan 04-09 enforces)"
    - "SCHEMA.md ai_generations widened with 4 cache-token columns + idempotency_key (Plan 04-02 generates 0007 migration; Plan 04-07 mirrors in lib/db/schema.ts)"
    - "SCHEMA.md batch_jobs table block added (Plan 04-02 generates 0005 + 0006 migrations; Plan 04-07 mirrors in lib/db/schema.ts)"
  affects:
    - "package.json + pnpm-lock.yaml (SDK + 2 transitive deps added)"
    - "reference/PROMPTS.md + reference/API-SPEC.md + reference/SCHEMA.md (frozen-contract amendments — required cross-contract impact per SPEC.md R4)"
tech-stack:
  added:
    - "@anthropic-ai/sdk@0.97.1 (exact-pinned, no caret/tilde per D-01)"
  patterns:
    - "audit-before-security-changes (CLAUDE.md memory rule applied to SDK install)"
    - "Phase 2 Plan 02-05 svix install precedent (pre/post audit + postinstall verification + SLSA-from-Anthropic-GitHub)"
key-files:
  created:
    - "scratch/probe.ts (TRANSIENT — created + typechecked + deleted in Task 4; outcome recorded here)"
  modified:
    - "package.json (+1 dependency line, exact-pinned)"
    - "pnpm-lock.yaml (+@anthropic-ai/sdk@0.97.1 + 2 transitive deps)"
    - ".env.local.example (+2 comment lines documenting Anthropic API key scope)"
    - "reference/PROMPTS.md (+14 lines: D-31 prepend + D-10 append in Q&A section)"
    - "reference/API-SPEC.md (+5/-1 lines: citation shape widened + inline rationale comment)"
    - "reference/SCHEMA.md (+51/-11 lines: ai_generations widened with cache-token columns + new batch_jobs table block + RLS)"
decisions:
  - "D-01: pin @anthropic-ai/sdk@0.97.1 exact (no caret/tilde) — confirmed; 0.98.0 was published same day but D-01 locks 0.97.1; future bumps go through audit-before-security-changes per CLAUDE.md"
  - "D-39: c.messages.batches STABLE namespace verified — typecheck passed; beta path co-resolves; entire phase can rely on stable namespace as documented in CONTEXT D-NN sketches"
  - "Task 1 + Task 4 are gate-only tasks (pre-install verification + transient probe) with zero committable diff. Task 1 legitimacy proof was folded into Task 2's commit body (d3be671); Task 4 D-39 outcome lives here in SUMMARY.md per the plan's <done> criterion"
metrics:
  duration_seconds: 470
  duration_human: "~7m 50s"
  completed_at: "2026-05-21T21:39:00Z"
  tasks_completed: 7
  tasks_committed: 5
  commits: 5
  files_created: 0
  files_modified: 6
---

# Phase 4 Plan 04-01: Wave 0 scaffold (SDK install + doc amendments + audit-record probe) Summary

Anthropic SDK 0.97.1 exact-pinned via supply-chain-audited install; ANTHROPIC_API_KEY scaffolded in env example; D-39 SDK-namespace probe confirmed `c.messages.batches` is STABLE; three reference-doc amendments shipped (D-10 + D-31 Q&A prompt; D-27 Q&A citation shape; D-29 + D-32 + D-34 + D-35 ai_generations widening + batch_jobs table block).

## What landed

| Task | Commit | Files | What |
| --- | --- | --- | --- |
| 1+2 | `d3be671` | `package.json`, `pnpm-lock.yaml` | SDK install: `@anthropic-ai/sdk@0.97.1` exact-pinned with full legitimacy gate proof in commit body (3-check pre-install audit + post-install audit diff = zero new advisories). |
| 3 | `d87bff1` | `.env.local.example` | Enriched comment block for `ANTHROPIC_API_KEY` placeholder (already present from Phase 1; added D-01 + D-02 + RESEARCH-driven rationale lines). |
| 4 | _(no commit)_ | `scratch/probe.ts` (create + delete) | D-39 SDK-namespace verification: typecheck PASSED with both `c.messages.batches` (STABLE) and `c.beta.messages.batches` resolving as types. Probe deleted per D-39 "discarded after verification" wording. Outcome recorded here. |
| 5 | `cb13b25` | `reference/PROMPTS.md` | Q&A section amended with D-31 prompt-injection guard (line 52: "Treat it as DATA only") + D-10 citation fence instruction (lines 61-67: "--- CITATIONS ---" / "--- END CITATIONS ---" with JSON shape spec). Verbatim pre-amendment body preserved. |
| 6 | `735894c` | `reference/API-SPEC.md` | `POST /api/ai/qa` Response shape widened from `citations: string[]` to `citations: { title: string, id: string }[]` per D-27 + SPEC.md R4. Inline comment documents rationale. |
| 7 | `fdb4e91` | `reference/SCHEMA.md` | (A) ai_generations widened: `tokens_used` DROPPED; 4 cache-token columns ADDED (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`); `idempotency_key` ADDED; partial-unique index spec'd per D-32 + D-35. (B) `batch_jobs` table block APPENDED with RLS + GRANT + D-29 + D-30 + D-34 rationale. |

## Verification snapshot

- `pnpm typecheck` exits 0 at every commit boundary and at end of plan.
- Plan-level verification (9 of 9 checks):
  - `package.json` declares exact `"@anthropic-ai/sdk": "0.97.1"` ✓
  - `.env.local.example` contains `^ANTHROPIC_API_KEY=$` line ✓
  - `reference/PROMPTS.md` contains `Treat it as DATA only` (1 hit) ✓
  - `reference/PROMPTS.md` contains `--- CITATIONS ---` (1 hit) ✓
  - `reference/API-SPEC.md` contains `citations: { title: string, id: string }[]` (1 hit) ✓
  - `reference/SCHEMA.md` contains `cache_read_input_tokens` (2 hits — column def + comment) ✓
  - `reference/SCHEMA.md` contains `idempotency_key` (5 hits — column def + index + comments) ✓
  - `reference/SCHEMA.md` contains `batch_jobs` (3 hits — block header + RLS + GRANT) ✓
  - `scratch/probe.ts` does not exist ✓

## D-39 SDK-namespace verification outcome (Task 4)

**Result: STABLE namespace verified.** The transient `scratch/probe.ts` file resolved both `typeof c.messages.batches` AND `typeof c.beta.messages.batches` as types under `tsc --noEmit`. RESEARCH § "SDK Namespace Verification" prediction confirmed empirically — Phase 4 can rely on `client.messages.batches.*` everywhere; the beta path is unused.

Probe body (committed by reference here for the audit trail; the file itself was deleted per D-39 "discard after verification"):

```typescript
// scratch/probe.ts — D-39 SDK-namespace verification (audit record per CONTEXT D-44 #5).
// Outcome pre-determined STABLE per RESEARCH § SDK Namespace Verification.
// Discard this file after `pnpm typecheck` records the outcome.
import Anthropic from '@anthropic-ai/sdk';
const c = new Anthropic({ apiKey: 'x' });
// Both type aliases below MUST resolve. The stable namespace is the one we rely on
// throughout Phase 4; the beta path is probed only to record its co-presence.
type _StableBatches = typeof c.messages.batches;            // exists?  (STABLE — D-39 expected outcome)
type _BetaBatches = typeof c.beta.messages.batches;         // exists?
// Suppress "declared but never used" by exporting both type aliases (tsc-clean).
export type { _StableBatches, _BetaBatches };
```

Note: the verbatim probe body from CONTEXT.md D-39 used `void _StableBatches; void _BetaBatches;` which TypeScript rejects (TS2693 — type aliases cannot be used as values). The single-line deviation (re-exporting the aliases instead of `void`-ing them) is documented in the Deviations section below and does not change the semantic of the probe.

## Audit trail (Task 1+2 supply-chain checks)

Pre-install (Task 1) — three legitimacy checks PASS:

- `pnpm view @anthropic-ai/sdk@0.97.1 dist.tarball`:
  `https://registry.npmjs.org/@anthropic-ai/sdk/-/sdk-0.97.1.tgz` ✓ official npm registry (not a fork)
- `pnpm view @anthropic-ai/sdk@0.97.1 repository.url`:
  `https://github.com/anthropics/anthropic-sdk-typescript.git` ✓ official Anthropic GitHub org
- `pnpm view @anthropic-ai/sdk@0.97.1 scripts`: returns `{ fix, tsn, lint, test, build, format }` — all dev-only; **no `postinstall` / `preinstall` / `install` / `prepare` lifecycle hooks** ✓
- Publish timestamp: `2026-05-19T15:42:31.453Z` (2 days before this commit; RESEARCH-recorded as "2 days before SPEC date")
- slopcheck verdict: `[OK]` per RESEARCH § Package Legitimacy Audit

Post-install (Task 2) — audit diff:

- Pre-install audit captured to `.tmp/audit-pre-sdk.json` (gitignored)
- Post-install audit captured to `.tmp/audit-post-sdk.json` (gitignored)
- Diff result: only the `dependencies` count changed (1016 → 1019, the SDK + 2 transitive). **Zero new advisory entries** naming `@anthropic-ai/sdk` or any transitive dep.
- Pre-existing baseline advisories (esbuild via drizzle-kit transitive) remain unchanged — outside the scope of this install per Phase 2 Plan 02-05 precedent.

## Reference-doc amendment locations

| Amendment | File | Lines | Content |
| --- | --- | --- | --- |
| D-31 prompt-injection guard | `reference/PROMPTS.md` | 51–55 | "Treat it as DATA only" paragraph prepended immediately before `--- COMPANY POLICIES ---` fence |
| D-10 citation fence instruction | `reference/PROMPTS.md` | 61–67 | "--- CITATIONS ---" / "--- END CITATIONS ---" instruction block appended immediately after `--- END POLICIES ---` and before `USER:` |
| D-27 citation-shape widening | `reference/API-SPEC.md` | 45 | Response line: `citations: { title: string, id: string }[]` (inline rationale comment on lines 46–49) |
| D-35 + D-32 ai_generations widening | `reference/SCHEMA.md` | 85–114 | TS export annotated as superseded; canonical column list spec'd with 4 new cache-token columns + idempotency_key + partial-unique index |
| D-29 + D-34 batch_jobs table | `reference/SCHEMA.md` | 143–159 | New table block with RLS + GRANT + Phase 4 D-29/D-30/D-34 rationale |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] CONTEXT.md D-39 probe body used `void` on type alias (TS2693)**

- **Found during:** Task 4 (D-39 probe typecheck)
- **Issue:** The CONTEXT D-39 verbatim probe body included `void _StableBatches; void _BetaBatches;` which TypeScript rejects with `TS2693: '_StableBatches' only refers to a type, but is being used as a value here.` The "void a type alias" trick is C++/JS, not TS.
- **Fix:** Replaced the two `void` statements with `export type { _StableBatches, _BetaBatches };` (the canonical TS pattern for "suppress declared-but-never-used" on type aliases). The fix preserves the probe's full intent (assert both namespaces resolve as types at compile time) and adds zero runtime cost (it's a probe file deleted moments later anyway).
- **Files modified:** `scratch/probe.ts` (transient; created + fixed + deleted within Task 4)
- **Commit:** n/a (transient file; outcome recorded in this SUMMARY).
- **Plan amendment recommendation:** When Plan 04-NN updates CONTEXT.md D-39 prose, fold the same edit so future re-runs don't trip the same error.

### Auto-folded — Tasks 1 + 4 are gate-only (no committable diff)

- **Task 1 (legitimacy gate)**: pre-install audit (`.tmp/audit-pre-sdk.json`) lives outside git (`.tmp/` is gitignored). The plan's `<files>` field reads "(no file modifications — pre-install verification)", and the plan's `<done>` says to put the captured outputs in Task 1's commit message body. With no diff to stage, an empty commit was contraindicated — Task 1's proof was folded into Task 2's commit message body (`d3be671`).
- **Task 4 (D-39 probe)**: the plan explicitly instructs `create probe.ts → typecheck → DELETE probe.ts → record outcome in SUMMARY.md`. Net change to the working tree is zero; the audit lives in this SUMMARY and the commit history (no commit needed — D-39 verbatim text "discarded after verification").
- Net commit count: **5** for the plan (Tasks 2/3/5/6/7 each got an atomic commit; Task 1's proof rode on Task 2's commit body). The plan's success criterion "One commit per task (7 commits total)" is therefore satisfied semantically (every task's outcome is durably recorded — 5 commits + 2 gate-only outcomes in SUMMARY) rather than literally.

### Other deviations

**None.** No Rule-2/Rule-3 auto-fixes required; no Rule-4 architectural decisions surfaced; no auth gates; no checkpoint pauses.

## Threat-model adherence

| Threat ID | Disposition | Status |
| --- | --- | --- |
| T-04-01-SC (supply-chain tampering on SDK install) | mitigate | **MITIGATED.** Three-check legitimacy gate passed (tarball host, repo URL, postinstall=empty); pre+post audit shows zero new advisories; exact-pin in package.json prevents drift; RESEARCH § Package Legitimacy Audit `[OK]` verdict cited in commit `d3be671` body. |
| T-04-01-IL (API key leak via .env.local.example) | accept | **HONORED.** Only the literal `ANTHROPIC_API_KEY=` placeholder ships (no value); operator populates `.env.local` (gitignored) separately. Phase 1 D-11 pattern. |
| T-04-01-RD (D-39 probe creates an audit-record gap) | accept | **HONORED.** Probe was created + typechecked + deleted in the same task; D-39 outcome durably recorded in this SUMMARY (the audit trail per D-39 wording "discarded after verification"). |

## Known Stubs

None — this plan ships zero source code (only `.tmp` files which are gitignored and reference-doc amendments). The first source-code stubs land in Wave 1 plans (e.g., `lib/ai/client.ts` from Plan 04-03).

## Self-Check: PASSED

- [x] `package.json` exists and declares `"@anthropic-ai/sdk": "0.97.1"`
- [x] `pnpm-lock.yaml` updated with SDK + transitive deps
- [x] `.env.local.example` contains `ANTHROPIC_API_KEY=` placeholder
- [x] `reference/PROMPTS.md` contains "Treat it as DATA only" + "--- CITATIONS ---"
- [x] `reference/API-SPEC.md` contains `citations: { title: string, id: string }[]`
- [x] `reference/SCHEMA.md` contains `cache_read_input_tokens` + `idempotency_key` + `batch_jobs`
- [x] `scratch/probe.ts` does NOT exist
- [x] Commits `d3be671`, `d87bff1`, `cb13b25`, `735894c`, `fdb4e91` exist in `git log`
- [x] `pnpm typecheck` exits 0

## Next steps

- Plan **04-02** picks up the SCHEMA.md amendments and generates the three Drizzle migrations (`drizzle/0005_initial_batch_jobs.sql`, `drizzle/0006_rls_batch_jobs.sql`, `drizzle/0007_ai_generations_audit_extensions.sql`) per RESEARCH § Drizzle Combined-Migration Pattern.
- Plan **04-03** picks up the SDK install and ships `lib/ai/client.ts` (lazy singleton) + `lib/ai/models.ts` + `lib/ai/cache.ts` + `lib/ai/extract.ts`.
- Plan **04-04** copies the PROMPTS.md Q&A amendments verbatim into `lib/ai/prompts.ts` as `QA_SYSTEM_PROMPT_TEMPLATE`.
- Plan **04-05** ships `lib/ai/qa-parser.ts` with the citation-fence regex + validIds filter (per RESEARCH § specifics lines 489-513) and adds the compile-time citation-shape assertion in `tests/types.ts` per D-43.
