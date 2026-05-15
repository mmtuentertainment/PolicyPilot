## Conflict Detection Report

### BLOCKERS (0)

(none)

### WARNINGS (0)

(none)

### INFO (4)

[INFO] Mutual navigational cross-refs between FOUNDRY docs (no content cycle)
  Note: BLUEPRINT.md, CLAUDE.md, and STATE.md cross-reference each other as navigation hubs (e.g., BLUEPRINT lists CLAUDE.md, CLAUDE lists BLUEPRINT.md, STATE lists both). DFS cycle detection over `cross_refs` finds BLUEPRINT↔CLAUDE and BLUEPRINT↔STATE pointer pairs, but these are routing-map references, not transitive content derivation. Per-type extraction is static — synthesis does not loop on content. Treating as informational and proceeding.

[INFO] Auto-resolved: BLUEPRINT (ADR, precedence 0) and STACK (ADR, precedence 1) overlap on Drizzle/Clerk/Supabase/Claude — no contradiction
  Note: Both source `BLUEPRINT.md` and `reference/STACK.md` are LOCKED ADRs in the ingest set. Their overlapping decisions (Drizzle over Prisma, Clerk over Auth0, Supabase over standalone Postgres, Sonnet 4.6 primary + Haiku 4.5 summaries) state identical choices — no LOCKED-vs-LOCKED contradiction. Decisions are preserved per-source in `decisions.md` (ADR-003, ADR-010 through ADR-015).

[INFO] Auto-resolved: CLAUDE.md (DOC) restates rules already in ADRs/SPECs — DOC precedence is lowest, restated content is consistent
  Note: `CLAUDE.md` § Stack, § Multi-Tenancy Rules, § Stripe Rules, § AI API Rules, and § Validation Gate restate decisions canonical in `BLUEPRINT.md`/`reference/STACK.md` (ADRs) and `REQUIREMENTS.md` § 10 (PRD). No values diverge. CLAUDE.md content is recorded in `context.md` as informational; canonical claims live in `decisions.md`, `constraints.md`, and `requirements.md`. Source: `CLAUDE.md` lines 37-49 (Stack), 73-84 (Multi-Tenancy), 90-111 (Always/Ask/Never), 125-134 (Stripe), 138-147 (Validation Gate).

[INFO] Auto-resolved: CLAUDE.md mentions `docs/` folder absent from BLUEPRINT.md repo layout — non-contradictory addition
  Note: `CLAUDE.md` § Project Structure (line 20) lists a `docs/` folder for "Policies, designs, runbooks". `BLUEPRINT.md` § 2 enumerates the repo layout and does not include `docs/`. This is an additive human-work directory, not a contradicting build artifact — DOC is lower precedence than ADR, and BLUEPRINT remains canonical for the buildable layout. No remediation needed.
