# STATE.md
# PolicyPilot — Session Continuity
# Updated: 2026-05-15 | Operator: Matthew

---

## Current Status

**Phase:** PRE-BUILD — FOUNDRY complete, ASSEMBLY not started
**Next action:** Open Claude Code, read CLAUDE.md, begin Phase 1

---

## Completed

- [x] REFINERY — REQUIREMENTS.md written
- [x] FOUNDRY — BLUEPRINT.md written
- [x] CLAUDE.md (tight 170-line version)
- [x] reference/ files written (STACK, SCHEMA, PROMPTS, TIER-LIMITS, API-SPEC)
- [x] STATE.md initialized
- [x] .env.local.example written
- [x] Project folder created: C:/Users/matth/Desktop/PolicyPilot

---

## In Progress

- [ ] Phase 1: Foundation (Next.js init, Clerk, Supabase, env vars)

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-15 | Next.js 15 over React+Node.js | Eliminates separate backend at MVP |
| 2026-05-15 | Clerk over Auth0 | 3.5x cheaper MAU, B2B orgs built-in |
| 2026-05-15 | Supabase over standalone PG | DB + RLS + free tier in one |
| 2026-05-15 | Drizzle over Prisma | No codegen, TypeScript-first |
| 2026-05-15 | Sonnet 4.6 primary, Haiku 4.5 summaries | Cost/quality balance |

---

## Blocked / Parking Lot

- DocTract pricing — verify before launch (may be closest real competitor)
- SAM.gov registration — post milestone 2 ($10K MRR)
- Slack integration — v1.1, not MVP

---

## Session Notes

<!-- Append notes here each Claude Code session -->
