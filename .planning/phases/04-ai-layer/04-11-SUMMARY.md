---
phase: 04-ai-layer
plan: 04-11
subsystem: policy-transitions, ai-verify
tags:
  - publish-hook
  - ts-morph-gate
  - graceful-degrade
  - warning-3-closure
dependency_graph:
  requires:
    - 04-04: lib/ai/prompts.ts (4 verbatim PROMPTS.md exports)
    - 04-08: lib/ai/summary.ts (generateSummaryForPolicy helper)
    - 03-G3: lib/policies/transitions.ts (Phase 3 publish() shape)
  provides:
    - "publish() post-commit auto-trigger: every published policy schedules a TL;DR summary"
    - "verbatim-anchor drift gate: lib/ai/prompts.ts <-> reference/PROMPTS.md must stay in sync"
    - "WARNING-3 closure: typed-initializer access blocks future silent mis-anchoring refactors"
  affects:
    - 04-13: PolicyView Regenerate TL;DR button (consumes graceful-degrade path)
    - 04-14: verify:phase-4 chain (consumes check:ai-prompts script entry)
tech_stack:
  added: []
  patterns:
    - "Post-commit hook: side-effect runs OUTSIDE the state-transition transaction"
    - "ts-morph typed-initializer access (getInitializerIfKind + SyntaxKind narrowing)"
    - "Verbatim-anchor contract gate (hardcoded substrings, not regex-extracted)"
key_files:
  created:
    - scripts/check-ai-prompts.ts
  modified:
    - lib/policies/transitions.ts
    - lib/policies/transitions.test.ts
    - package.json
decisions:
  - "D-19 SP-3 graceful-degrade: try/catch around generateSummaryForPolicy with [publish] summary failed log"
  - "D-26 anchor strategy: 4 hardcoded ~40-char substrings (one per prompt) — chosen for stability"
  - "WARNING-3 closure: typed getInitializerIfKind() blocks future concat/tagged-template refactors that would silently mis-anchor"
metrics:
  duration: ~12 minutes
  completed: 2026-05-21
  commits: 3
  tasks: 4
  tests_added: 3 (SP-3 block flipped RED -> GREEN)
  tests_total: 19 (transitions.test.ts) -> 67 with regression scope
---

# Phase 4 Plan 11: publish() Post-Commit Summary Hook + Verbatim-Anchor Gate Summary

Wired the D-19 auto-trigger into `publish()` with SPEC R3 graceful-degrade (Anthropic failure never blocks publication), and shipped `scripts/check-ai-prompts.ts` — a ts-morph gate that anchors `lib/ai/prompts.ts` to `reference/PROMPTS.md` via 4 hardcoded substrings with WARNING-3 typed-initializer-kind narrowing as the loader (no quote-strip regex).

## Files Created / Modified

| File | Lines | Type | Purpose |
|------|-------|------|---------|
| `lib/policies/transitions.ts` | 285 (+19) | MODIFY | Add `generateSummaryForPolicy` import + try/catch post-commit hook inside `publish()` |
| `lib/policies/transitions.test.ts` | 411 (+89, -3 stubs) | MODIFY | Replace SP-3 expect.fail stubs with 3 real assertions; add `vi.mock('@/lib/ai/summary')` to mock chain |
| `scripts/check-ai-prompts.ts` | 147 | NEW | ts-morph verbatim-anchor gate (D-26) with WARNING-3 typed-initializer access (getInitializerIfKind x2) |
| `package.json` | 86 (+1) | MODIFY | Add `check:ai-prompts` script entry (`tsx scripts/check-ai-prompts.ts`) |

Total: 1 new file + 3 modifications across 3 commits.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `de11c8e` | feat | publish() post-commit summary hook per D-19 + SPEC R3 (SP-3 GREEN) |
| `879203c` | feat | scripts/check-ai-prompts.ts — D-26 ts-morph gate with WARNING-3 typed-initializer access |
| `b52c2d9` | chore | package.json — add check:ai-prompts script entry |

(SUMMARY.md ships in a follow-up doc commit at end of plan execution.)

## Test Deltas

### SP-3 Block (3 tests RED -> GREEN)

`lib/policies/transitions.test.ts` block `publish — D-19 post-commit summary graceful-degrade (SP-3, SPEC R3)`:

1. **Graceful-degrade**: `on generateSummaryForPolicy throw: publish() does NOT throw; state transition stays committed`
   - Mocks `findById` to return a Draft policy, then `mockRejectedValueOnce(new Error('Anthropic 503'))` on `generateSummaryForPolicy`
   - Asserts `publish()` resolves to `undefined`, `PolicyVersions.create` was called BEFORE the hook (state-transition committed), `txSetMock` was called with `{ status: 'published' }`, and `generateSummaryForPolicy` was invoked once (then threw)
2. **Happy path**: `on Anthropic-success path: publish() calls generateSummaryForPolicy ONCE after state commit`
   - Asserts the helper is called with `(POLICY_ID_FIXTURE, ctx)` where ctx matches `{ orgId, userId, role }` from `getOrgContext`
3. **Log contract**: `logs "[publish] summary failed" with policyId on graceful-degrade path (D-19 + D-18)`
   - Captures `console.error` and asserts exact call shape: `('[publish] summary failed', { policyId, error })` with the underlying error attached

### Test Suite Stability

| Suite | Before | After |
|-------|--------|-------|
| `lib/policies/transitions.test.ts` | 16 passed + 3 expect.fail stubs | **19 passed** |
| `lib/policies/state-machine.test.ts` (regression) | 24 passed | 24 passed |
| `lib/auth/bootstrap-errors.test.ts` (regression) | 24 passed | 24 passed |
| Phase 3+4 combined regression | 64 passed + 3 stubs | **67 passed** |

`pnpm tsc --noEmit` exits 0 (silent).

## D-26 Anchors Chosen

The 4 hardcoded ~40-character verbatim substrings — one per prompt constant — that anchor the ts-morph drift gate:

| Constant | Anchor | Char Count |
|----------|--------|-----------|
| `DRAFT_SYSTEM_PROMPT` | `You are a professional HR and compliance writer` | 48 |
| `SUMMARY_SYSTEM_PROMPT` | `Summarize the following company policy` | 39 |
| `QA_SYSTEM_PROMPT_TEMPLATE` | `may ONLY use the policy documents provided` | 43 |
| `CONSISTENCY_SYSTEM_PROMPT` | `contradictions and inconsistencies` | 34 |

Anchor selection rationale (per CONTEXT.md D-26 "Claude's Discretion"):

- **DRAFT**: Domain-anchored — "professional HR and compliance writer" is the identity sentence at the start of the system prompt. Unlikely to be reworded without intent.
- **SUMMARY**: Action-anchored — the imperative verb + direct object that opens the prompt. Reworking summarization wording would force a conscious anchor update.
- **QA**: Behavior-locked (per D-31) — "may ONLY use the policy documents provided" is the constraint sentence that defines Q&A's safety model. Carries the load-bearing capitalized ONLY — drift here would be a SPEC-R4 violation.
- **CONSISTENCY**: Deliverable-anchored — "contradictions and inconsistencies" names the two output categories that drive the JSON schema. Reworking this would change the output contract.

## Verification

```
$ pnpm typecheck
(exit 0 — silent)

$ pnpm test lib/policies/transitions.test.ts
✓ lib/policies/transitions.test.ts (19 tests)
Tests       19 passed (19)

$ pnpm check:ai-prompts
[check-ai-prompts] OK — 4 anchors verified in both lib/ai/prompts.ts and reference/PROMPTS.md

$ pnpm test lib/policies/transitions.test.ts lib/policies/state-machine.test.ts lib/auth/bootstrap-errors.test.ts
✓ lib/policies/state-machine.test.ts (24 tests)
✓ lib/auth/bootstrap-errors.test.ts (24 tests)
✓ lib/policies/transitions.test.ts (19 tests)
Tests       67 passed (67)
```

## WARNING-3 Closure Confirmation

The script enforces typed-initializer access:

```
$ grep -c "getInitializerIfKind" scripts/check-ai-prompts.ts
5
$ grep -c "SyntaxKind.NoSubstitutionTemplateLiteral" scripts/check-ai-prompts.ts
3
$ grep -c "SyntaxKind.StringLiteral" scripts/check-ai-prompts.ts
3
$ grep -c "replace(/" scripts/check-ai-prompts.ts
0
```

- `getInitializerIfKind` appears 5 times (2 typed-access calls in the loader + 3 references in the WARNING-3 documentation block).
- The loader uses `getInitializerIfKind(SyntaxKind.NoSubstitutionTemplateLiteral)?.getLiteralText() ?? getInitializerIfKind(SyntaxKind.StringLiteral)?.getLiteralText()` — typed kind narrowing returns `StringLiteral | NoSubstitutionTemplateLiteral | undefined`, no manual stripping.
- Any other initializer shape (string concatenation, tagged template, function call, conditional expression) makes both `getInitializerIfKind` calls return `undefined`, triggering a structured `Error` that names the offending constant + the detected kind + an actionable fix message ("Inline the full prompt as a single literal and re-run check:ai-prompts").
- **Zero `replace(/...)` regex patterns** in the file — quote-strip approach fully eliminated.

## Plan Verification Invariants (all GREEN)

```
generateSummaryForPolicy in transitions.ts: 2  (1 import + 1 call — see Deviations)
[publish] summary failed in transitions.ts: 1  ✓
PROMPT_ANCHORS in check-ai-prompts.ts:      3  ✓ (>= 1)
ts-morph in check-ai-prompts.ts:            2  ✓ (>= 1)
getInitializerIfKind in check-ai-prompts.ts: 5  ✓ (>= 2)
SyntaxKind.NoSubstitutionTemplateLiteral:   3  ✓ (>= 1)
SyntaxKind.StringLiteral:                   3  ✓ (>= 1)
check:ai-prompts in package.json:           1  ✓ (>= 1)
replace(/ in check-ai-prompts.ts loader:    0  ✓ (= 0)
```

## Deviations from Plan

### Minor — Grep count drift

The plan verification section expects:

- `grep -c "generateSummaryForPolicy" lib/policies/transitions.ts` = 1
- `grep -c "SyntaxKind.NoSubstitutionTemplateLiteral" scripts/check-ai-prompts.ts` = 1

Actual:

- `generateSummaryForPolicy` appears **2** times in `lib/policies/transitions.ts` — once in the `import` statement and once in the `try { await generateSummaryForPolicy(policyId, ctx) }` call. A value of 1 would mean either the import is missing (compile error) or the call is missing (D-19 not wired). The plan's expectation was an under-estimate; the file's invariants are satisfied.
- `SyntaxKind.NoSubstitutionTemplateLiteral` appears **3** times: (a) one typed-access call in the loader, (b) one mention in the WARNING-3 documentation block (which explains what kind the loader narrows against), and (c) one mention in the structured Error message that helps debug a future refactor. The plan's `>= 1` invariant is satisfied; the literal `= 1` was an under-estimate.

Both drifts are upward (more occurrences than minimum-spec), not downward — no structural invariant is violated. No code change required.

### Minor — Documentation polish

When initially written, the WARNING-3 documentation block included a comment showing the exact rejected regex (`raw.replace(/^['"\`]/,'').replace(/['"\`]$/,'')`). This satisfies the spirit of the verify check `grep -c "replace(/" scripts/check-ai-prompts.ts returns 0` (no regex in the LOADER) but trips the literal grep because the comment text matches.

Resolved by paraphrasing the comment to describe the rejected pattern abstractly ("a regex stripping the leading and trailing string delimiters") without quoting the regex. Functional behavior unchanged; grep verifier now passes.

No deviations of substance — no Rules 1-4 triggered.

## Known Stubs

None. The 3 SP-3 stubs in `lib/policies/transitions.test.ts` were the only known stubs scoped to this plan, and all 3 have been replaced with passing assertions.

## Self-Check: PASSED

- [x] `lib/policies/transitions.ts` exists, contains `generateSummaryForPolicy` import + call inside try/catch
- [x] `lib/policies/transitions.test.ts` 19/19 tests GREEN (SP-3 block 3/3 GREEN)
- [x] `scripts/check-ai-prompts.ts` exists (147 lines, ts-morph + getInitializerIfKind ×5)
- [x] `package.json` has `check:ai-prompts` script entry
- [x] Commit `de11c8e` in git log (publish hook)
- [x] Commit `879203c` in git log (ts-morph gate)
- [x] Commit `b52c2d9` in git log (package.json script)
- [x] `pnpm tsc --noEmit` exits 0
- [x] `pnpm check:ai-prompts` exits 0
- [x] Phase 3 regression: `lib/policies/state-machine.test.ts` + `lib/auth/bootstrap-errors.test.ts` 48/48 GREEN
