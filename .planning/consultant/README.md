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

`.planning/STATE.md` is the source of truth for phase state. As of PR #30,
Phase 5 Employee Portal shipped via PR #27 at commit `3344847`, and Phase 6 is
pending/planning-only. Do not treat a Phase 6 branch, phase directory, or
handoff as permission to start Phase 6 implementation.

## Keep Current

After a meaningful project change, update the relevant consultant files or
record `no-change` in the matching `ops/deltas/<date>-<slug>.md` report.
