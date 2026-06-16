# Consultant Coordination

This directory holds live coordination packets for the ChatGPT consultant layer
and the Codex implementation layer. It complements `.planning/STATE.md`,
`.planning/ROADMAP.md`, `.planning/PROJECT.md`, `AGENTS.md`, and
`CONSULTANT.md`; it does not replace them.

## Operating Loop

- Matthew is the operator, product owner, and approval authority.
- ChatGPT is the high-level consultant, researcher, risk reviewer, GSD guide,
  implementation-router, and prompt/handoff reviewer.
- Claude Code is the long-horizon repo exploration, broad-audit, GSD
  research/planning, security/risk review, branch/state diagnosis,
  multi-file-consistency, and ambiguous-investigation agent. It is read-mostly
  by default and should hand exact patches, tests, PR updates, or verification
  instructions to Codex unless Matthew explicitly asks otherwise.
- Codex is the scoped implementation executor for exact patches, tests,
  verification gates, PR/delta updates, and small reversible fixes. Codex must
  verify actual repo state before changing files.
- Anthropic Claude API is the product AI layer. Claude Code and Codex are
  implementation agents, not product AI APIs.

## GSD Stage Chain

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

Consultant packets should name the stage they support. Codex handoffs should
name which stages were represented and which checks were unavailable.

## Current Phase State

`.planning/STATE.md` is the source of truth for phase state; the consultant
files (`working_context.md`, `system_map.md`, `feature_inventory.md`,
`risk_register.md`, `backlog.md`) carry the current detail. As of 2026-06-16
(HEAD `7ba6ba2`): **all 8 build-sequence phases are shipped on `main` — the v1.0
build is COMPLETE.** Phase 8 Validation (CSV-first slice, AC#5) shipped via PR #48
squash commit `03c18d4` (2026-06-16; final phase; STATE `phase_8_shipped`/100%);
Phase 7 Crons + Email via PR #44 `8b7019d` (2026-06-14); Phase 9 Reviewer MVP via
PR #42 `1122da5`; Phases 1-6 prior. Remaining work is operator launch gates only
(prod provision/deploy via `docs/runbooks/launch-mvp.md`, live email send, Phase 8
deferrals — see backlog rank-15/18/23-26). Do not treat a phase branch, phase
directory, or handoff as permission to start a phase the operator has not
authorized.

## Keep Current

After a meaningful project change, update the relevant consultant files or
record `no-change` in the matching `ops/deltas/<date>-<slug>.md` report.
