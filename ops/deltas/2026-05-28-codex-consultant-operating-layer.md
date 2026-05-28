# Delta - Codex Consultant Operating Layer Replay

Date: 2026-05-28
Branch: `consultant/project-operating-system-2026-05-28`
PR: #30 - `docs(consultant): add PolicyPilot operating file set`
Type: docs / operating system / Codex handoff

---

## Objective

Move the docs-only Codex/ChatGPT operating-layer work off
`gsd/phase-6-billing` and onto the existing operating-layer PR branch so Phase
6 is not implied to be active while Phase 5 Employee Portal hardening remains
the live constraint.

---

## Branch and PR Handling

- Initial local branch: `gsd/phase-6-billing`.
- Existing local docs work was preserved in a temporary Git stash named
  `codex-operating-layer-docs-temp`.
- `gsd/phase-6-billing` was verified clean after preservation.
- PR #30 was verified as branch
  `consultant/project-operating-system-2026-05-28`, base `main`, draft, and
  mergeable.
- The PR branch was fetched locally, checked out, rebased onto `origin/main`,
  and used as the replay target.
- The default-branch `AGENTS.md` was restored as the base and then updated with
  the operating-layer contract. No Phase 6 runtime work was carried forward.
- After commit and push, the temporary preservation stash was dropped.

Moved off `gsd/phase-6-billing`: yes.

---

## GSD Stages Represented

This correction used the docs/cross-cutting GSD subset:

```text
pr-branch -> checker -> execute -> verifier -> ship review
```

The full operating chain encoded in `AGENTS.md`, `CLAUDE.md`,
`CONSULTANT.md`, and `.planning/consultant/README.md` is:

```text
pr-branch -> spec -> discuss -> UAT intent -> research -> validate -> plan -> checker -> execute -> secure phase -> verifier -> ship review
```

GSD command note: no Codex-native `$gsd-*` command runner was available in this
runtime. The installed local evidence is documented in `AGENTS.md`: historical
repo artifacts use slash-form GSD prompts, while shell-level `gsd-sdk` and
`gsd-tools` query commands exist. No GSD command output was fabricated.

---

## Files Changed

- `AGENTS.md`
  - Added the Codex implementation-agent contract.
  - Corrected product AI wording to Anthropic Claude API.
  - Added startup read order, precedence rules, GSD chain, command fallback,
    PolicyPilot invariants, verification commands, handoff format, and
    keep-current rule.
- `CLAUDE.md`
  - Added the Matthew / ChatGPT / Codex role split.
  - Points meaningful sessions to `AGENTS.md`, `CONSULTANT.md`, and consultant
    packets.
  - Preserves the Phase 5 hardening guardrail.
- `CONSULTANT.md`
  - Names ChatGPT as consultant, researcher, risk reviewer, GSD guide, and
    Codex prompt writer.
  - Requires scoped Codex prompts and Codex handoff review against live repo
    evidence.
- `.planning/consultant/README.md`
  - Added the coordination overview for Matthew, ChatGPT, and Codex.
- `ops/deltas/2026-05-28-consultant-operating-layer.md`
  - Updated the original PR #30 delta to include `AGENTS.md`, the README, and
    this replay delta.
- `ops/deltas/2026-05-28-codex-consultant-operating-layer.md`
  - This replay and verification report.

Consultant files inspected but not otherwise changed:

- `.planning/consultant/working_context.md`
- `.planning/consultant/system_map.md`
- `.planning/consultant/feature_inventory.md`
- `.planning/consultant/risk_register.md`
- `.planning/consultant/backlog.md`

---

## Verification

Docs-only expected. Broad build/test commands were not run because no runtime
code, schemas, migrations, dependencies, package files, or API contracts were
touched.

Preflight and branch checks:

- `git status --short --branch`: started on `gsd/phase-6-billing` with only
  operating-layer docs work present; after preservation, the Phase 6 branch was
  clean.
- `jj status`: unavailable in this local runtime.
- `gh pr view 30`: PR #30 verified as draft, mergeable, base `main`, head
  `consultant/project-operating-system-2026-05-28`.
- `git fetch origin consultant/project-operating-system-2026-05-28:consultant/project-operating-system-2026-05-28`:
  PR branch fetched locally.
- `git rebase origin/main`: PR branch rebased onto current `main` before the
  Codex operating contract was replayed.

Local docs checks:

- `git diff --check`: pass.
- Product-AI misuse content check over `AGENTS.md`, `CLAUDE.md`,
  `CONSULTANT.md`, `.planning/consultant`, and `ops/deltas`: pass; no stale
  Codex-as-product-AI wording remains.
- Required operating-layer term check over `AGENTS.md`, `CLAUDE.md`,
  `CONSULTANT.md`, `.planning/consultant`, and `ops/deltas`: pass; required
  role, GSD, handoff, keep-current, and Phase 5 terms are represented.
- `rg -n "[ \t]+$" AGENTS.md CLAUDE.md CONSULTANT.md .planning/consultant ops/deltas`:
  pass; no trailing whitespace matches.
- `rg -n "\[[^\]]+\]\([^\)]*\)" AGENTS.md CLAUDE.md CONSULTANT.md .planning/consultant ops/deltas`:
  pass; no markdown inline links requiring validation.

---

## Risks and Uncertainties

- PR #30 remains a draft until Matthew chooses to mark it ready.
- Phase 5 remains the live constraint. This PR should not be interpreted as
  permission to start Phase 6 billing.
- No temporary stash remains from the replay.

---

## Next Micro-Batch

Review PR #30 for merge readiness, then return to the Phase 5 hardening queue
or explicitly pause/close Phase 5 before any Phase 6 work proceeds.
