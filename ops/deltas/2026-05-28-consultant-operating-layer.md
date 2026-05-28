# Delta - Consultant Operating Layer

Date: 2026-05-28
Branch: `consultant/project-operating-system-2026-05-28`
PR: #30 - `docs(consultant): add PolicyPilot operating file set`
Type: docs / operating system / consultant memory

---

## Objective

Create a repo-native consultant operating layer for PolicyPilot so future AI
sessions can act as a high-level product, technical, and operating consultant
against the actual project state.

This increment adds durable instructions, a system map, project memory, feature
inventory, risk register, backlog, and a rule that these files must stay
current.

Codex replay addendum: the operating-layer work was moved off
`gsd/phase-6-billing` and replayed onto PR #30's branch. This PR is now the
single operating-layer target.

Current-state addendum: Phase 5 was later reconciled as shipped via PR #27 at
`3344847`; see `ops/deltas/2026-05-28-phase5-ship-reconcile.md`. Current next
steps are PR #30 merge readiness and keeping Phase 6 implementation unstarted
until Matthew intentionally resumes the proper Phase 6 GSD branch/spec/plan
path.

---

## Files Changed

1. `AGENTS.md`
   - Defines Matthew, ChatGPT, Claude Code, and Codex roles.
   - Distinguishes Codex as the implementation agent from the product AI layer.
   - Corrects product AI wording to Anthropic Claude API.
   - Encodes the GSD chain, startup read order, precedence, invariants,
     verification commands, Codex handoff format, and keep-current rule.

2. `CLAUDE.md`
   - Adds `.planning/consultant/`, `ops/deltas/`, and `CONSULTANT.md` to the
     visible project structure.
   - Adds `Consultant Overlay (high-level)` section.
   - Adds the keep-current rule to the always-on operating rules.
   - Adds consultant files to Key Files.
   - Points to `AGENTS.md` and defers current Phase 5 / Phase 6 truth to
     `.planning/STATE.md`.

3. `CONSULTANT.md`
   - Defines the high-level consultant role.
   - Defines session startup read order.
   - Defines consultant decision rule.
   - Defines the standing keep-current rule.
   - Defines ChatGPT's Codex prompt-writing and handoff-review
     responsibilities.

4. `.planning/consultant/README.md`
   - Explains the Matthew / ChatGPT / Claude Code / Codex operating loop.
   - Points back to the GSD stage chain and current Phase 5 shipped / Phase 6
     planning-only state.

5. `.planning/consultant/working_context.md`
   - Compact current-state memory for future consultant sessions.

6. `.planning/consultant/system_map.md`
   - Runtime architecture map.
   - Trust boundaries.
   - Primary user workflows.
   - Current phase map and hotspots.

7. `.planning/consultant/feature_inventory.md`
   - Feature list tied to status, revenue linkage, beat-manual linkage, and
     removal cost.

8. `.planning/consultant/risk_register.md`
   - Consultant risk register with probability, impact, score, mitigation, and
     escalation rule.

9. `.planning/consultant/backlog.md`
   - Consultant-level backlog with priority scoring and next micro-batch.

10. `ops/deltas/2026-05-28-consultant-operating-layer.md`
    - This delta report.

11. `ops/deltas/2026-05-28-codex-consultant-operating-layer.md`
    - Codex replay, verification, PR-body, and Phase 6 branch cleanup report.

---

## Instructions Now Embedded

Future AI sessions should operate as a high-level consultant on the PolicyPilot
build:

- Challenge scope when it does not improve launch readiness, revenue
  readiness, tenant trust, or audit integrity.
- Prefer the smallest reversible improvement.
- Preserve locked ADRs, phase discipline, tenant isolation, append-only
  acknowledgments, and server-side AI/billing rules.
- Read the consultant file set after the core GSD files before meaningful
  advice or implementation.
- Review and update the consultant files after every meaningful project change.

The Codex addendum also embeds:

- Matthew as operator/product owner.
- ChatGPT as consultant, researcher, risk reviewer, implementation-router, GSD
  guide, and prompt/handoff reviewer.
- Claude Code as the long-horizon exploration, audit, GSD research/planning,
  security/risk review, branch/state diagnosis, and multi-file consistency
  agent.
- Codex as the scoped implementation executor that verifies live repo state,
  applies exact changes, runs checks, and returns structured handoffs.
- Claude/Anthropic as the product AI API layer, not Codex.

---

## Keep-Current Rule

No meaningful project change is complete until these files are reviewed and
either updated or explicitly marked `no-change` in that change's delta report:

- `.planning/consultant/working_context.md`
- `.planning/consultant/system_map.md`
- `.planning/consultant/feature_inventory.md`
- `.planning/consultant/risk_register.md`
- `.planning/consultant/backlog.md`
- `ops/deltas/<date>-<slug>.md`

Meaningful change includes phase transition, architecture change, data model
change, security/billing/AI/email/deployment change, new material risk, major
review finding, or pricing/positioning/scope change.

---

## Verification

Docs-only change. No runtime code, dependencies, schema, migrations, or API
contracts changed.

Local verification is the verification surface for the Codex replay. Broad
build and test commands were intentionally skipped because the changes are
docs-only.

Manual content checks performed:

- Consultant read order points back to `AGENTS.md`, `CLAUDE.md`,
  `.planning/PROJECT.md`, `.planning/STATE.md`, and `.planning/ROADMAP.md`
  instead of replacing them.
- The consultant map reflects the current locked stack: Next.js 15, Supabase,
  Clerk, Stripe, Claude API, Resend, Railway, Vercel.
- Risk/backlog entries now preserve the current project state: Phase 5 shipped
  via PR #27, while Phase 6 remains pending/planning-only until deliberately
  resumed.
- `AGENTS.md` now distinguishes Claude/Anthropic product API behavior from
  Codex implementation-agent behavior.
- File count expanded from the original 8-file consultant set to include the
  Codex operating contract, consultant README, and Codex replay delta.

---

## Consultant File Update Status

- `working_context.md`: created; later reconciled to Phase 5 shipped state
- `system_map.md`: created; later reconciled to Phase 5 shipped state
- `feature_inventory.md`: created; later reconciled to Phase 5 shipped state
- `risk_register.md`: created; later reconciled to Phase 5 shipped state
- `backlog.md`: created; later reconciled to Phase 5 shipped state
- `README.md`: created
- `AGENTS.md`: updated
- `CLAUDE.md`: updated to point to consultant layer
- `CONSULTANT.md`: created / updated
- Delta reports: created / updated

---

## Next Micro-Batch

1. Review PR #30 for merge readiness.
2. Keep Phase 6 implementation unstarted until Matthew intentionally resumes
   Phase 6 through the proper GSD branch/spec/plan path.
3. Once PR #30 is accepted, mark it ready or merge it according to Matthew's
   direction.
