---
phase: 3
slug: admin-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x (preferred; aligns with Next.js 15 + native ESM); fallback: existing `tsc --noEmit` + ts-morph audit scripts |
| **Config file** | `vitest.config.ts` (Wave 0 installs; absent in Phase 1+2) |
| **Quick run command** | `pnpm tsc --noEmit` (sub-30s; runs after every task commit) |
| **Full suite command** | `pnpm verify:phase-3` (chains: `tsc --noEmit` → `check:db-imports` → `check:rls` → `check:admin-routes` → `check:artifacts` → `vitest run`) |
| **Estimated runtime** | ~30–60 seconds (full); ~5–10 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit`
- **After every plan wave:** Run `pnpm verify:phase-3`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled in by the planner. Each task in each PLAN.md gets a row mapping its acceptance criteria → automated verifier. Empty rows are placeholders the planner expands.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | — | T-03-01 / Operator manual | Clerk `whsec_…` rotated; `.env.local` updated; chat transcript not leaked | manual | `pnpm verify:phase-3 # CLERK_WEBHOOK_SECRET non-empty` | ❌ W0 (script extension) | ⬜ pending |
| 03-02-01 | 02 | 1 | REQ-access-control | T-03-02 | Admin matcher rewritten; `app/(admin)/` URLs covered; non-admin routes 404 via layout | unit + script | `pnpm tsc --noEmit && pnpm check:admin-routes` | ❌ W0 (`scripts/check-admin-routes.ts`) | ⬜ pending |
| 03-03-01 | 03 | 1 | REQ-policy-lifecycle | T-03-03 | `state-machine.ts` pure; `canTransition` table covers DAG; `IllegalTransitionError` thrown on bad transition | unit | `vitest run lib/policies/state-machine.test.ts` | ❌ W0 (`vitest.config.ts` + test file) | ⬜ pending |
| 03-04-01 | 04 | 2 | REQ-policy-library | T-03-04 | Repository bodies wrap `OrgScope`; no raw `db` in `app/(admin)/*`; `check-db-imports` passes | unit + script | `pnpm tsc --noEmit && pnpm check:db-imports` | ✅ (extends Phase 2) | ⬜ pending |
| 03-05-01 | 05 | 2 | REQ-policy-library | T-03-05 | Server Actions for create/edit/publish/archive/restore wrap `withOrgScope` + Zod validate input + `revalidatePath` before `redirect` (outside try/catch) | unit | `vitest run lib/policies/transitions.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-01 | 06 | 2 | REQ-policy-library | T-03-06 | `PolicyEditor` uses `useEditor` with `immediatelyRender: false`; hidden form input bound to `getJSON()`; submit posts to Server Action | type + render | `pnpm tsc --noEmit && vitest run components/policy/PolicyEditor.test.tsx` | ❌ W0 | ⬜ pending |
| 03-07-01 | 07 | 3 | REQ-policy-library, REQ-access-control | T-03-07 | Library list scoped by `org_id` via `withOrgScope`; status filter + title/category ILIKE; cross-org impersonation 0 rows | integration | `vitest run app/policies/page.test.tsx` | ❌ W0 | ⬜ pending |
| 03-08-01 | 08 | 3 | REQ-policy-library | T-03-08 | `publish` orchestrator writes `policy_versions` row + flips status atomically (single transaction) | integration | `vitest run lib/policies/transitions.test.ts -t publish` | ❌ W0 | ⬜ pending |
| 03-09-01 | 09 | 3 | REQ-policy-lifecycle | T-03-09 | `editPublished` snapshots prior version + resets `status='draft'` + `currentVersion+=1` atomically; PolicyVersions has no `update`/`delete` (type-test) | type + integration | `pnpm tsc --noEmit && vitest run lib/policies/transitions.test.ts -t editPublished` | ❌ W0 | ⬜ pending |
| 03-10-01 | 10 | 3 | REQ-access-control | T-03-10 | `<CreateOrganization />` flow; `post-sign-in` Server Component routes by role; first webhook smoke succeeds; org row inserted before `/dashboard` renders OR loading state shown | manual + integration | `pnpm verify:phase-3 + operator click-through` | ❌ W0 (smoke harness) | ⬜ pending |
| 03-11-01 | 11 | 3 | REQ-access-control | T-03-11 | `requireAdmin()` returns 404 (notFound) for non-admin role; layout-level guard covers all `/(admin)/` pages | integration | `vitest run lib/auth/require-admin.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest framework install (`pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react`)
- [ ] `tests/setup.ts` — vitest globals + jsdom + RTL setup
- [ ] `lib/policies/state-machine.test.ts` — REQ-policy-lifecycle DAG coverage (canTransition truth table, IllegalTransitionError shape)
- [ ] `lib/policies/transitions.test.ts` — REQ-policy-lifecycle + REQ-policy-library (publish snapshot semantics; editPublished snapshot+reset+bump; submit/approve/reject/archive/restore round-trip)
- [ ] `lib/auth/require-admin.test.ts` — REQ-access-control (non-admin → notFound; admin → returns OrgContext)
- [ ] `scripts/check-admin-routes.ts` — Phase 3 verify gate (CR-02 closure + Server Action `withOrgScope` audit)
- [ ] `package.json` script `verify:phase-3` — chains: `tsc --noEmit` → `check:db-imports` → `check:rls` → `check:admin-routes` → `check:artifacts` → `vitest run`
- [ ] `scripts/check-artifacts.ts` — extend with Phase 3 file-existence rows (12 admin pages/components + new script files)
- [ ] `tests/types.ts` — extend with two new `@ts-expect-error` lines proving `PolicyVersions.update` and `PolicyVersions.delete` do not exist (L-05 / ADR-018-spirit)
- [ ] `app/policies/page.test.tsx` — REQ-policy-library + REQ-access-control (org-scoped list + filter + ILIKE search; cross-org impersonation returns 0 rows)
- [ ] `components/policy/PolicyEditor.test.tsx` — REQ-policy-library (editor mounts with `immediatelyRender:false`; hidden form input updates from `getJSON()` on change)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clerk webhook `whsec_…` rotation (SF-WHSEC-1 / L-04) | REQ-access-control | Svix Dashboard requires interactive human auth | 1) Open Svix Dashboard → Clerk app → rotate signing secret. 2) Paste new `whsec_…` into `.env.local` (DO NOT paste into chat). 3) Run `pnpm verify:phase-3` — env-var check must pass. |
| Clerk "After sign-in URL" config update (L-03 / REG-P1-01) | REQ-access-control | Clerk Dashboard requires interactive human auth | 1) Open Clerk Dashboard → app → "After sign-in URL". 2) Change from `/sign-in-success` to `/post-sign-in`. 3) Run `pnpm verify:phase-1` after — should now probe `/post-sign-in` successfully. |
| Clerk Organizations toggle verification | REQ-access-control | Clerk Dashboard config | 1) Open Clerk Dashboard → app → Organizations. 2) Confirm Organizations are enabled. (Should already be — Phase 1 D-09.) |
| `<CreateOrganization />` end-to-end smoke (D-08) | REQ-access-control | Requires real Clerk session + Svix delivery | 1) Sign in as test admin without an org. 2) Land on `/post-sign-in` → redirected to `/onboarding/create-org`. 3) Submit `<CreateOrganization />`. 4) Confirm `organizations` row inserted in Supabase. 5) Land on `/dashboard`. |
| TipTap editor visual smoke | REQ-policy-library | Interactive UI — verify toolbar renders + paste-link works + JSON serializes | 1) `/policies/new`. 2) Type title + category. 3) Type content with bold + bullet list. 4) Paste a URL — autolink should activate. 5) Save as Draft → verify `policies.contentJson` is the expected JSON shape. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
