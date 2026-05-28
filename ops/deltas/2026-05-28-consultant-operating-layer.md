# Delta — Consultant Operating Layer

Date: 2026-05-28  
Branch: `consultant/project-operating-system-2026-05-28`  
PR: #30 — `docs(consultant): add PolicyPilot operating file set`  
Type: docs / operating system / consultant memory

---

## Objective

Create a repo-native consultant operating layer for PolicyPilot so future AI sessions can act as a high-level product, technical, and operating consultant against the actual project state.

This increment adds durable instructions, a system map, project memory, feature inventory, risk register, backlog, and a rule that these files must stay current.

---

## Files Changed

1. `CLAUDE.md`
   - Adds `.planning/consultant/`, `ops/deltas/`, and `CONSULTANT.md` to the visible project structure.
   - Adds `Consultant Overlay (high-level)` section.
   - Adds the keep-current rule to the always-on operating rules.
   - Adds consultant files to Key Files.

2. `CONSULTANT.md`
   - Defines the high-level consultant role.
   - Defines session startup read order.
   - Defines consultant decision rule.
   - Defines the standing keep-current rule.

3. `.planning/consultant/working_context.md`
   - Compact current-state memory for future consultant sessions.

4. `.planning/consultant/system_map.md`
   - Runtime architecture map.
   - Trust boundaries.
   - Primary user workflows.
   - Current phase map and hotspots.

5. `.planning/consultant/feature_inventory.md`
   - Feature list tied to status, revenue linkage, beat-manual linkage, and removal cost.

6. `.planning/consultant/risk_register.md`
   - Consultant risk register with probability, impact, score, mitigation, and escalation rule.

7. `.planning/consultant/backlog.md`
   - Consultant-level backlog with priority scoring and next micro-batch.

8. `ops/deltas/2026-05-28-consultant-operating-layer.md`
   - This delta report.

---

## Instructions Now Embedded

Future AI sessions should operate as a high-level consultant on the PolicyPilot build:

- Challenge scope when it does not improve launch readiness, revenue readiness, tenant trust, or audit integrity.
- Prefer the smallest reversible improvement.
- Preserve locked ADRs, phase discipline, tenant isolation, append-only acknowledgments, and server-side AI/billing rules.
- Read the consultant file set after the core GSD files before meaningful advice or implementation.
- Review and update the consultant files after every meaningful project change.

---

## Keep-Current Rule

No meaningful project change is complete until these files are reviewed and either updated or explicitly marked `no-change` in that change's delta report:

- `.planning/consultant/working_context.md`
- `.planning/consultant/system_map.md`
- `.planning/consultant/feature_inventory.md`
- `.planning/consultant/risk_register.md`
- `.planning/consultant/backlog.md`
- `ops/deltas/<date>-<slug>.md`

Meaningful change includes phase transition, architecture change, data model change, security/billing/AI/email/deployment change, new material risk, major review finding, or pricing/positioning/scope change.

---

## Verification

Docs-only change. No runtime code, dependencies, schema, migrations, or API contracts changed.

Connector limitation: local `jj status` and local build commands were not available through the GitHub connector. Remote branch/PR state is the verification surface for this increment.

Manual content checks performed:

- Consultant read order points back to `CLAUDE.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, and `.planning/ROADMAP.md` instead of replacing them.
- The consultant map reflects the current locked stack: Next.js 15, Supabase, Clerk, Stripe, Claude API, Resend, Railway, Vercel.
- Risk/backlog entries preserve the current project constraint: Phase 5 hardening before Phase 6 billing unless explicitly paused.
- File count kept to 8 changed files for the increment.

---

## Consultant File Update Status

- `working_context.md`: created
- `system_map.md`: created
- `feature_inventory.md`: created
- `risk_register.md`: created
- `backlog.md`: created
- `CLAUDE.md`: updated to point to consultant layer
- `CONSULTANT.md`: created
- Delta report: created

---

## Next Micro-Batch

1. Review PR #30 and merge when accepted.
2. Return to Phase 5 audit remediation.
3. Close or explicitly pause Phase 5 before starting Phase 6 billing work.
