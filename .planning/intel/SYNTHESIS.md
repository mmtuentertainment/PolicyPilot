# Synthesis Summary

Single entry point for `gsd-roadmapper` and other downstream consumers. Summarizes what was synthesized from the 9-document FOUNDRY ingest. Detailed content lives in the per-type intel files; conflict detail lives in `INGEST-CONFLICTS.md`.

---

## Mode

`new` — fresh `.planning/` (no pre-existing context to merge against).

## Precedence

Default: `ADR > SPEC > PRD > DOC` (lower integer = higher precedence). Per-doc overrides via manifest were applied:

- `BLUEPRINT.md` — ADR, precedence 0, LOCKED
- `reference/STACK.md` — ADR, precedence 1, LOCKED
- `reference/SCHEMA.md` — SPEC, precedence 2
- `reference/API-SPEC.md` — SPEC, precedence 2
- `reference/PROMPTS.md` — SPEC, precedence 2
- `reference/TIER-LIMITS.md` — SPEC, precedence 2
- `REQUIREMENTS.md` — PRD, precedence 3
- `CLAUDE.md` — DOC, precedence 4
- `STATE.md` — DOC, precedence 4

---

## Document counts by type

- ADR: 2 (`BLUEPRINT.md`, `reference/STACK.md`)
- SPEC: 4 (`SCHEMA.md`, `API-SPEC.md`, `PROMPTS.md`, `TIER-LIMITS.md`)
- PRD: 1 (`REQUIREMENTS.md`)
- DOC: 2 (`CLAUDE.md`, `STATE.md`)
- Total: 9

## Decisions locked

- Count: 21 (ADR-001 through ADR-021)
- Locked sources:
  - `BLUEPRINT.md` (precedence 0, locked)
  - `reference/STACK.md` (precedence 1, locked)
- File: `decisions.md`
- Notable LOCKED decisions: system topology (ADR-001), no separate backend (ADR-002), Drizzle ORM (ADR-003, ADR-011), Clerk=org_id (ADR-004, ADR-019), Stack choices (ADR-010..ADR-016), 8-phase build sequence (ADR-007), append-only acknowledgments (ADR-018), Stripe 5-event idempotent handling (ADR-020), Batch API for consistency check (ADR-021).

## Requirements extracted

- Count: 17
- IDs:
  - `REQ-product-vision`
  - `REQ-user-roles`
  - `REQ-policy-library`
  - `REQ-ai-policy-assistant`
  - `REQ-acknowledgment-tracking`
  - `REQ-compliance-dashboard`
  - `REQ-notification-system`
  - `REQ-tier-starter`
  - `REQ-tier-growth`
  - `REQ-tier-business`
  - `REQ-multi-tenancy`
  - `REQ-policy-lifecycle`
  - `REQ-acknowledgment-rules`
  - `REQ-ai-usage-rules`
  - `REQ-access-control`
  - `REQ-integrations`
  - `REQ-non-goals`
  - `REQ-acceptance-criteria`
- File: `requirements.md`
- Source: `REQUIREMENTS.md` §§ 1–10

## Constraints extracted

- Count: 28
- Type breakdown:
  - schema: 13 (`SPEC-schema-*` — all Drizzle tables, RLS pattern, enums)
  - api-contract: 9 (`SPEC-api-*` — every API route)
  - protocol: 4 (`SPEC-prompts-*` — Claude prompt templates) + 2 partial (Stripe + Clerk webhook protocols, counted under api-contract)
  - nfr / feature-gate: 3 (`SPEC-tier-limits-*`)
- File: `constraints.md`
- Sources: `reference/SCHEMA.md`, `reference/API-SPEC.md`, `reference/PROMPTS.md`, `reference/TIER-LIMITS.md`

## Context topics

- Count: 12
- Topics: project identity, document navigation map, project structure overview, ALWAYS/ASK/NEVER rules, validation gate restatement, session continuity status, FOUNDRY artifact checklist, decisions log, parking lot, AI API operating notes, Stripe operating notes, stack operating notes, key files index.
- File: `context.md`
- Sources: `CLAUDE.md`, `STATE.md`

## Cycle detection

- Algorithm: DFS three-color marking over `cross_refs` graph, max depth 50.
- Cycles found at the navigational-pointer level: BLUEPRINT ↔ CLAUDE, BLUEPRINT ↔ STATE.
- Verdict: NOT a content-derivation cycle. These are doc-hub navigational pointers from FOUNDRY-authored docs. Per-type extraction is static and does not recurse on cross-refs, so synthesis cannot loop. Logged as INFO in `INGEST-CONFLICTS.md`. Proceeded with synthesis on the full set.

## Conflicts

- BLOCKERS: 0
- WARNINGS (competing-variants): 0
- INFO (auto-resolved): 4
- Detail: `C:\Users\matth\Desktop\PolicyPilot\.planning\INGEST-CONFLICTS.md`

The 4 INFO entries cover: (1) navigational-pointer cycles, (2) consistent LOCKED ADR overlap between BLUEPRINT and STACK, (3) DOC-precedence restatements of ADR/SPEC/PRD content in CLAUDE.md, (4) additive `docs/` folder mention in CLAUDE.md vs BLUEPRINT layout.

## Pointers

- Per-type intel:
  - `decisions.md` — 21 locked ADRs
  - `requirements.md` — 17 REQ entries
  - `constraints.md` — 28 SPEC entries (schema, api-contract, protocol, nfr)
  - `context.md` — 12 DOC topics
- Classifications: `.planning/intel/classifications/*.json` (9 files)
- Conflicts report: `.planning/INGEST-CONFLICTS.md`

## Status for downstream

READY — no blockers, no competing variants. `gsd-roadmapper` may proceed using this intel set as input.
