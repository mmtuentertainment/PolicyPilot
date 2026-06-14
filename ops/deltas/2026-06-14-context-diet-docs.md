# Delta — 2026-06-14 — Context-diet docs hygiene (CLAUDE.md compression)

**Change:** Token-hygiene refactor of `CLAUDE.md` (316 → 203 lines). Reference-grade prose moved to `reference/MIGRATIONS.md`, `reference/FALLOW.md`, `reference/STRIPE.md`, `reference/VALIDATION-GATE.md`; the Project-Structure tree and Build-Sequence table were collapsed to pointers (BLUEPRINT.md / ROADMAP.md); provenance lines wrapped in HTML comments (stripped before injection). The stale dated Phase-state narrative was replaced with a pointer to `.planning/STATE.md` + the standing guardrails.

**Invariants preserved inline (verified by presence-grep, 18/18):** Multi-Tenancy `org_id`-in-every-query + RLS pattern, full ALWAYS/ASK-FIRST/NEVER lists, Stack table, never-live-Stripe, no-secrets-in-code, never-weaken-gate, destructive-migrations=ASK-FIRST, migrations immutable+forward-only, append-only acknowledgments, Stripe raw-body signature, no-client-side-subscription-state, no-unlisted-packages, Clerk-only auth, no-`any`.

**Why:** Front-of-session context bloat reduction (operator-authorized "context diet" runbook, 2026-06-14). No behavior, schema, feature, or risk change.

**Consultant file set:** `no-change` — `working_context.md`, `system_map.md`, `feature_inventory.md`, `risk_register.md`, `backlog.md` all unaffected (this is documentation token-hygiene only; no code, schema, dependency, or runtime surface changed).

**Branch:** `docs/context-diet-claude-md` (off `main` `c90dd44`). Phase-7 branch untouched.
