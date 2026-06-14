# Validation Gate — ASSEMBLY acceptance checklist (reference)

> Moved out of `CLAUDE.md` 2026-06-14 (context-diet). ASSEMBLY is complete when
> all checks pass. The operating invariants behind these checks (org_id in every
> query, append-only acknowledgments, tier gating, never trust client for
> subscription state) remain inline in `CLAUDE.md`. Acceptance criteria detail
> also lives in `REQUIREMENTS.md`.

- [ ] Admin creates policy from Claude draft in under 5 minutes from account creation
- [ ] Admin assigns policy; per-user acknowledgment status tracked correctly
- [ ] Employee acknowledgment persists in audit trail with timestamp
- [ ] Employee Q&A returns cited answer from policy library only
- [ ] Admin exports acknowledgment report to CSV
- [ ] Stripe subscription survives first billing cycle renewal
- [ ] Tier gating: Starter blocked from Growth features with 403 + upgrade prompt
- [ ] Multi-tenancy: Org A cannot access Org B data under any code path
