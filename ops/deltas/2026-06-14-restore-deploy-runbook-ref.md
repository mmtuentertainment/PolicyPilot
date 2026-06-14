# Delta — 2026-06-14 — Restore deploy-migration runbook ref (PR #45, `b4b2160`)

**Change:** PR #45 (merged `b4b2160`, 2026-06-14) restored a single line in `CLAUDE.md`
(§ Database Migration Discipline) — re-adding the `deploy runbook → docs/runbooks/deploy-migrations.md`
pointer that PR #43's context-diet compression had dropped. This restores the invariant that
`scripts/check-artifacts.ts` asserts, so `pnpm check:artifacts` passes again. One file, +1/−1.

**Why:** CI hygiene only. PR #43's context-diet compression (`CLAUDE.md` 316 → 203 lines) dropped a
line that the artifact check treats as required, regressing `check:artifacts`. PR #45 reverses that one
sub-line to restore the invariant. No behavior, schema, dependency, feature, or risk change.

**Consultant file set:** `no-change` — `working_context.md`, `system_map.md`, `feature_inventory.md`,
`risk_register.md`, `backlog.md`, and `README.md` are all unaffected. A 1-line `CLAUDE.md` CI-hygiene
docs fix touches no code, schema, dependency, runtime, feature, risk, or backlog item. It is a strict
subset-reversal of PR #43's context-diet, which was itself adjudged `no-change`
(see `ops/deltas/2026-06-14-context-diet-docs.md`); the same determination applies a fortiori. Each of
the 6 files was independently re-checked by an adversarial verification workflow (`wf_eefa9baf-73f`,
2026-06-14) that returned `no-change` per file with rationale.

**Branch:** PR #45 shipped on `fix/check-artifacts-migrations-ref` (now pruned), squash-merged to `main`
at `b4b2160`. This closure delta is authored during the Phase 7 ship session to satisfy the keep-current
rule and close the residual flagged after the PR #44/#45 ship.
