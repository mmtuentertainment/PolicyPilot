# Consultant Coordination

This directory holds live coordination packets for the ChatGPT consultant layer
and the Codex implementation layer. It complements `.planning/STATE.md`,
`.planning/ROADMAP.md`, `.planning/PROJECT.md`, `AGENTS.md`, and
`CONSULTANT.md`; it does not replace them.

## Operating Loop

- Matthew is the operator, product owner, and approval authority.
- ChatGPT is the high-level consultant, researcher, risk reviewer, GSD guide,
  and Codex prompt-writer.
- Codex is the coding implementation agent and must verify actual repo state
  before changing files.

## GSD Stage Chain

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

Consultant packets should name the stage they support. Codex handoffs should
name which stages were represented and which checks were unavailable.

## Active Constraint

Phase 5 Employee Portal hardening remains the active constraint unless
`.planning/STATE.md` says otherwise. Do not treat a Phase 6 branch, phase
directory, or handoff as permission to start Phase 6 implementation.

## Keep Current

After a meaningful project change, update the relevant consultant files or
record `no-change` in the matching `ops/deltas/<date>-<slug>.md` report.
