# Codebase-Map Accuracy + Stale-Reference Cleanup (Action-D)

Date: 2026-06-04
Branch: `chore/doc-cleanup-stale-refs-2026-06-04` (off `main` @ `6f17412`)
GSD stage: consultant keep-current (Tier A — doc/comment accuracy only; no product/arch change)
Related open PR: **#39** `chore/codebase-map-refresh-2026-06-04` (codebase-map refresh, awaiting operator merge)

## Summary

Doc/comment-accuracy pass ("Action-D") that retires stale references left on `main`
after the post-Phase-6 prep PRs (#33–#38) and after the local `gsd/phase-6-billing`
branch was deleted, and that records a genuine tier-gating gap surfaced by the PR #39
map refresh. **No product behavior, schema, packages, secrets, or gates changed.**
This PR's file set is deliberately **disjoint** from PR #39 (which owns the five
`.planning/codebase/` map docs STACK/INTEGRATIONS/ARCHITECTURE/STRUCTURE/CONCERNS) to
avoid a merge collision — Action-D touches only `CONVENTIONS.md` from that directory,
which #39 does not.

## Context: PR #39 (separate, open)

PR #39 fast-scan-refreshes the `.planning/codebase/` map to `6f17412` and (via the
session-8 accuracy amend `48ade2d`, 6-agent-verified) already corrects the lazy-catalog
framing in INTEGRATIONS/STRUCTURE and the `approvalWorkflows`-not-enforced statement in
ARCHITECTURE.md — whose text forward-references "the consultant risk register." **This
Action-D PR creates that referenced risk row (R-017).** #39 remains operator-merge-pending;
nothing here merges or modifies it.

## What changed (all verified against `main` @ `6f17412`)

### Stale dead-branch retention claims (local `gsd/phase-6-billing` is deleted — confirmed absent from local AND origin)
- `.planning/STATE.md` — `:27` (Current focus), `:36` (Branch pointer), `:51` (Next-action topology note): "remains/can be retired until Matthew approves deletion" → "has since been deleted (no longer divergent)".
- `.planning/STATE.md:37` — "Main HEAD: `243067e`" → `6f17412`, with the post-Phase-6 prep range recorded (`fcac2ec` + PRs #33 `e2a7283` / #34 `9ef70bb` / #35 `8dc0a38` / #36 `2bcbb12` / #37 `3b4bdb5` / #38 `6f17412`). Phase 6 preserved as the last shipped **phase** at `243067e`.
- `.planning/consultant/working_context.md:18`, `system_map.md:83`, `backlog.md:53` — same dead-branch retire/retention clauses retired.

### Stale in-flight branch status (now merged)
- `.planning/consultant/working_context.md:3,19,36` — "Cause-B lazy-db fix in flight on `fix/db-lazy-init`" → shipped to `main` (PR #37 `3b4bdb5` lazy `lib/db` + PR #38 `6f17412` lazy Stripe catalog). *(Same-class staleness caught during Action-D verification; not in the original worklist, included for file coherence.)*

### Stale price-catalog framing (catalog is lazy since PR #38)
- `.planning/codebase/CONVENTIONS.md:297` — "read … at module load / `PRICE_CATALOG` export is frozen" → lazy `getPriceCatalog()` (`cachedCatalog ??= buildCatalog()`) framing; notes the eager `PRICE_CATALOG` export was removed in #38. *(The same staleness in ARCHITECTURE/INTEGRATIONS/STRUCTURE is owned + already fixed by PR #39 — left untouched here.)*
- `lib/stripe/catalog.ts:56-57` (source comment) — "lib/db/index.ts is still eager on this branch" → "now merged to main; lib/db/index.ts is lazy too" (#37 landed the lazy `lib/db` Proxy).

### `scripts/deploy-config.json:12` — ADR-018 reference CLARIFIED (not stripped) — DEVIATION FROM WORKLIST
The Action-D worklist proposed treating "(requires Pro tier + PITR add-on per ADR-018)"
as a *wrong* citation and removing the ADR-018 reference. **Independent re-verification
shows that is a misdiagnosis:** the deploy runbook (`docs/runbooks/deploy-migrations.md:15`)
states the linkage in full — *"Pro tier + PITR add-on required for the append-only
audit-trail invariant per ADR-018"* (PITR protects the ADR-018 append-only acknowledgment
audit trail in prod), and the same linkage appears in risk R-015 and the 2026-06-03 causeB
delta. The citation is an **intentional, repo-consistent** design rationale, not a stray
cross-ref; stripping it would *desync* deploy-config.json from the runbook. **Applied fix:**
align the terse comment to the runbook's fuller phrasing + add the runbook cross-ref,
preserving the (correct) ADR-018 linkage. (R-015's shorthand "(Pro+PITR per ADR-018)" and
the causeB delta:92 phrasing are correct and were left as-is.)

## Consultant keep-current

- `risk_register.md` — **updated**: added **R-017** (approvalWorkflows tier-gating gap; P3×I3=9; Open / confirm intent). Header bumped.
- `backlog.md` — **updated**: added **rank 16** (approvalWorkflows tier gate unimplemented; Pending / ASK-FIRST); retired the dead-branch clause in the Next-Recommended-Micro-Batch guard. Header bumped.
- `working_context.md`, `system_map.md` — **updated**: dead-branch + in-flight staleness retired; headers bumped.
- `feature_inventory.md` — reviewed, **no-change** (no product feature ships/changes/moves phase; the approvalWorkflows item is a risk/backlog change, not a shipped feature).
- New: `ops/proposals/2026-06-04-approvalworkflows-tier-gate.md` — ASK-FIRST proposal **draft** (no code) enumerating the gap, the required product-intent decision, and options A (orchestrator `requireTierLimit`) / B (UI Server-Component gate). Any fix routes through the ASK-FIRST/security path, NOT a doc PR.

## approvalWorkflows tier-gap (Q2 decision — file + propose, no code)

Per the operator Q2 decision, this PR only **files** the gap (R-017 + backlog rank 16)
and **drafts** the ASK-FIRST proposal. It applies **no** tier-gating code. The product-intent
question — gate the existing review workflow now, or pre-declared future flag — is open for
the operator. `transitions.ts:127-128` records the original Phase-3 intent ("approve will
require reviewer-tier") as evidence, but the decision is the operator's.

## Boundaries

- Product runtime behavior changed: **no** (doc + source-comment + JSON-comment edits only).
- Application code changed: comment-only in `lib/stripe/catalog.ts`; no logic touched.
- Packages / lockfile changed: **no**.
- Schema / migrations / Drizzle metadata changed: **no**.
- Secrets / env / Vercel / `.mcp.json` / passwords changed: **no** (read-only on secrets; no value printed).
- Security gate changed: **no** (the approvalWorkflows fix is proposed only, not applied).
- PR #39 modified or merged: **no**. Phase 7 started: **no**. Live Stripe mode: not touched.

## Verification

- `pnpm tsc --noEmit` — (recorded at commit; only a comment changed in TS).
- `fallow audit` on the changed set (PreToolUse `git commit` gate) — JSON/MD/TS-comment-only changes.
- `scripts/deploy-config.json` re-validated as parseable JSON after the comment edit.
- 6-agent adversarial diff review (independent) before commit — contradiction / historical-preservation / scope-collision / secret-clean lenses.
