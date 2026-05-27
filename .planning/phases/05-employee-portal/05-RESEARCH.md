# Phase 5: Employee Portal — Research

**Researched:** 2026-05-23
**Domain:** Next.js 15 Server Actions + Drizzle multi-tenant SQL + Phase 4 Q&A re-assembly + ts-morph append-only CI gate
**Confidence:** HIGH (operator pre-locked 30 decisions via CONTEXT.md; this pass surfaces gaps NOT in CONTEXT.md)

## Summary

The operator's framing was correct: **CONTEXT.md is comprehensive at the decision-layer.** All 6 requirements, all 30 implementation decisions (D-01..D-30), and the full per-file delta are locked. There is no ambiguity remaining at "what to build."

This research pass therefore drove deeper than CONTEXT.md and surfaced **6 concrete mechanical gaps** the planner must close before generating tasks, plus **2 React 19 / Next.js 15 pitfalls** the planner should bake into Server Action verification, plus **3 confirmations** of operator-asked hypotheticals (cross-org citation leak, dual-assignment dedup, IPv6/Vercel trust-boundary handling).

The gaps are NOT decisions to re-litigate — they are downstream of locked decisions and the planner can resolve them in plan tasks. The verbatim findings below let the planner emit concrete acceptance text and file-path-level instructions without re-reading every Phase 2/3/4 file from scratch.

**Primary recommendation:** Treat CONTEXT.md D-01..D-30 as the source of truth for "what." Layer this research's `## Risks and Edge Cases` and `## Validation Architecture` sections on top for "how to verify correctly." No CONTEXT.md decision needs amendment.

## User Constraints

Source: `.planning/phases/05-employee-portal/05-CONTEXT.md`. All 30 decisions D-01..D-30 are LOCKED per operator. Planner MUST honor.

### Locked Decisions (verbatim from CONTEXT.md `<decisions>`)

- **D-01..D-04a (Dashboard Query):** Single LEFT JOIN query in `Policies.listAssignedAndPublishedForUser(s, userId)`; SELECT DISTINCT to dedup user+dept double-assignment; dept-id sub-select inline (`SELECT department_id FROM users WHERE id = $userId AND org_id = $orgId`); return shape `{...policy, ackState: 'none' | 'current' | 'stale', ackedAt: Date | null}`; empty state Card with "No policies assigned yet — contact your administrator."
- **D-05..D-10c (Acknowledgment Action):** IP via `headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null`; UNIQUE(user_id, policy_id, policy_version_id) + `ON CONFLICT DO NOTHING`; throws `PolicyArchivedError`/`PolicyNotAssignedError`; co-located at `app/(employee)/my-policies/[id]/actions.ts`; conflict no-op = silent success + ops log; single `withOrgScope` transaction wrapping read+lookup+INSERT; Zod `z.object({ policyId: PolicyIdSchema })`; `redirect`/`revalidatePath` outside try/catch.
- **D-11, D-12 (Re-Ack UI):** New `components/policy/AckStatusBadge.tsx` via className override on shadcn Badge (NOT new CVA variant); three render branches matching D-04 enum.
- **D-13..D-17 (Admin Bulk-Assign):** Inline panel at bottom of `/policies/[id]`; disabled button + tooltip when 0 depts; UNIQUE(policy_id, assignee_type, assignee_id) + ON CONFLICT DO NOTHING; un-assign OUT; `Departments.create()` body deferred to Phase 6+.
- **D-18..D-20 (Append-Only CI Gate):** ts-morph AST traversal mirroring `check-policy-id-brand.ts`; scans `lib/**/*.ts` excl. `tests/fixtures/**`; negative-control fixture at `tests/fixtures/ack-mutation-attempt.ts` + `--self-test` mode reverse-interprets.
- **D-21..D-23a (Tests):** Co-located unit tests + `scripts/check-employee-portal.ts` integration; raw postgres-js + BYPASSRLS seed + `SET LOCAL ROLE authenticated` + intentional ROLLBACK + final TRUNCATE; `verify:phase-5 = verify:phase-4 && check:acknowledgment-immutability && check:acknowledgment-immutability:self-test && check:employee-portal`; Anthropic mocking via `vi.mock('@/lib/ai/client')`.
- **D-24..D-27a (R-6 Q&A):** New `/my-policies/ask` page + Server Action via React 19 `useActionState`; Phase 4 inline Q&A logic extracted to `lib/ai/qa.ts::askQuestion(ctx, question)`; `qa_citation_grants` table records {org_id, user_id, policy_id} per citation; `/my-policies/[id]` handler: assigned → full PolicyView, else has-grant+published → TL;DR-only, else 404; TL;DR banner copy verbatim.
- **D-28, D-29 (Migrations):** Combined `0010_phase5_uniques.sql` for both UNIQUEs; separate `0011_qa_citation_grants.sql` for the new table.
- **D-30 (Errors):** New `lib/policies/errors.ts` with `PolicyDomainError` abstract base + `PolicyNotFoundError` / `PolicyArchivedError` / `PolicyNotAssignedError` + literal `code` union; widen `check-error-discipline.ts` to scan `lib/policies/**`.

### Claude's Discretion (from CONTEXT.md)

- Exact SQL formatting + JOIN order in `Policies.listAssignedAndPublishedForUser`
- Component file structure under `components/employee/` vs `components/policy/` for new Phase-5 UI
- Tailwind class composition for the TL;DR-only banner
- Vitest mock factory shape for R-6 integration test (mirror Phase 4 but exact stub shape is planner's call)
- Order of operations inside `askQuestion` orchestrator after `parseQaResponse` (grant-INSERT before or after the citations-array return — either way both complete in the same `withOrgScope` tx)

### Deferred Ideas (OUT OF SCOPE per CONTEXT.md `<deferred>`)

- Email + in-app notifications → Phase 7
- Reviewer-role surface → Phase 6+
- Ack-rate reports + CSV + Recharts donut → Phase 8
- Individual-user assignment admin UI → deferred polish
- `Departments.create()` body + admin dept-create UI → Phase 6+
- Un-assign affordance + soft-delete → Phase 6+
- Q&A rate-limiting / tier gating → Phase 6+ if D-46 cost trigger fires
- Q&A streaming response → future polish
- `qa_citation_grants` cleanup cron → Phase 7+ if data volume warrants
- IPv6 normalization → out (record `x-forwarded-for` first hop verbatim)
- Bulk "acknowledge all" UX → out (single-policy only)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-acknowledgment-tracking | Admin assigns policies to users/depts; employees see dashboard; one-click ack with timestamp + IP; bulk-dept assignment; rate computable | R-1 + R-2 + R-3 + R-4 covered by D-01..D-15; ack-rate report deferred to Phase 8 per CONTEXT `<deferred>` |
| REQ-acknowledgment-rules | Append-only acknowledgments; `{user_id, policy_id, policy_version_id, acknowledged_at, ip_address}` shape; policy update = "requires re-ack" against new version_id without mutating prior rows | R-5 covered by D-18..D-20 (ts-morph gate) + preservation of D-07 `@ts-expect-error` in `tests/types.ts` + Phase 2 `0001_rls_policies.sql:70-73` documents the GRANT-vs-app-layer asymmetry (DB GRANTs UPDATE+DELETE for symmetry; ADR-018 is type-system + grep-layer enforced) |
| (consumed) REQ-ai-policy-assistant | Phase 4 — relevant for R-6 reuse: `askQuestion(ctx, q)` extracted from inline Phase 4 logic per D-25 | Confirmed `lib/ai/qa-parser.ts:54` strips hallucinated IDs via `validIds.has(c.id)`; `app/api/ai/qa/route.ts:56-58` constructs validIds in same `withOrgScope` closure (D-41 invariant) |
| (preserved) REQ-access-control | Phase 5 maintains "employees see only assigned" except R-6 TL;DR fallback per D-27 (citation-referral grant) | CONTEXT `<deferred>` notes this exception lives as a SPEC R-6 footnote rather than a REQ amendment |

## Project Constraints (from CLAUDE.md)

### ALWAYS (apply to every Phase 5 task)

1. `tsc --noEmit` passes before every commit — zero type errors
2. Include `org_id` in every DB query (ADR-019)
3. Verify Stripe webhook signatures with raw body — N/A this phase
4. Use prompt caching on all repeated Claude API system prompts — Phase 4 already covers; D-25 extraction preserves D-33c LONG_CACHE ordering
5. Store every Claude API call in `ai_generations` table — `askQuestion` preserves the Phase 4 `AiGenerations.insert` call (WARNING-4 raw-text store)
6. Check tier limits before every Claude API call — Phase 4 D-46 explicitly waives for Q&A (no tier gate); preserved by R-6 extraction

### ASK FIRST (operator must explicitly approve)

1. Any package not in stack list — **N/A: Phase 5 ships zero new packages** (CONTEXT decisions only reuse `ts-morph`, `postgres`, `vitest`, `drizzle-orm` already installed)
2. Any architecture decision not in BLUEPRINT.md — **CLEARED: ADR-029 already covers Phase 5/4 parallelism; D-27 narrow REQ-access-control exception is treated as SPEC R-6 footnote per CONTEXT `<deferred>`**
3. **Any DB schema change after Phase 2** — **CLEARED by operator selecting Q-22(a) + Q-23(a) + T-2(4c)** per DISCUSSION-LOG.md (3 additive schema migrations approved via discuss-phase). Migration headers MUST document this approval.
4. Any security-relevant decision (auth, data access, webhooks) — D-27 grant-table access boundary is covered by operator T-2(4c) override
5. TypeScript errors that require changing the data model — **none anticipated**; all 30 decisions are schema-compatible

### NEVER (apply to every Phase 5 file)

1. Roll custom auth — Clerk handles everything (employee gate per ADR-009)
2. Call Claude API client-side — Phase 5 R-6 is Server Action only per D-24
3. Trust client-side for subscription state — N/A this phase
4. Use `any` TypeScript type — applies to all new code
5. **Delete or modify acknowledgment records — audit trail is append-only** — locked by D-18..D-20 + preserved by D-07 `@ts-expect-error` in `tests/types.ts`
6. Build features not in REQUIREMENTS.md — Phase 5 ships ONLY R-1..R-6 per SPEC.md

### Database Migration Discipline (CLAUDE.md § "Database Migration Discipline")

Phase 5 ships TWO new migrations (0010 + 0011). Both require:
- Header documenting operator approval (Q-22(a) + Q-23(a) for 0010; T-2(4c) for 0011) + STATE.md pre-paying-customer status (no production data to break)
- Pre-deploy gate: `pnpm db:migrate:<env>` then `pnpm db:verify:<env>` exits 0 BEFORE deploying code
- Audit-log entry appended to STATE.md Session Continuity after prod apply

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/my-policies` list render | Frontend Server (RSC) | API/Backend (Drizzle repo) | Server Component reads via `withOrgScope`; no client JS for list |
| Acknowledge button click → DB write | Frontend Server (Server Action) | API/Backend (repo + RLS) | `acknowledgePolicyAction` runs server-side; opens `withOrgScope`; transactional INSERT |
| Bulk admin assignment | Frontend Server (Server Action) | API/Backend (repo + RLS) | `bulkAssignToDepartmentAction` on existing `/policies/[id]` page (admin) |
| Q&A submission → answer + citations | Frontend Server (Server Action) | API/Backend (Anthropic SDK + repo) | `askQuestionAction` → `askQuestion(ctx, q)` → Anthropic; React 19 `useActionState` for inline render |
| Citation link → access decision | Frontend Server (page handler) | Database (RLS + grant table) | `/my-policies/[id]` page Server Component checks assigned → grant → 404 |
| TL;DR-only fallback render | Frontend Server (RSC) | — | Reads `policies.tldr_summary` directly (no PolicyView reuse) |
| Append-only invariant enforcement | Build/CI (ts-morph) | Type System | `check-acknowledgment-immutability.ts` + `tests/types.ts` D-07; DB GRANTs UPDATE+DELETE (per 0001_rls_policies.sql:70-73) but app layer never reaches them |
| Cross-org isolation (R-6 grants) | Database (RLS) | API/Backend (`withOrgScope`) | New `qa_citation_grants` table needs RLS + GRANT + `(SELECT auth.jwt()->>'org_id')` wrapped predicate per 0008 baseline |

**Why this matters:** Phase 5 has no client-side state machine; React 19 `useActionState` makes the form a thin client wrapper. All authority lives in Server Actions, Server Components, and the DB.

## Standard Stack

### Core (versions verified from `package.json` 2026-05-23)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.18 | Server Components + Server Actions for `/my-policies` + `/my-policies/ask` | ADR-010 locked |
| React | 19.1.0 | `useActionState` hook for D-24 R-6 form | ADR-010 locked; React 19 is the only version that ships `useActionState` natively |
| `@clerk/nextjs` | ^7.3.4 | Employee auth gate via middleware | ADR-009 + ADR-012 locked |
| `drizzle-orm` | ^0.45.2 | Repository SQL composition | ADR-003 locked |
| `drizzle-kit` | ^0.31.10 | Migration generation (0010, 0011) | ADR-003 locked |
| `postgres` (node) | ^3.4.9 | Raw postgres-js for `scripts/check-employee-portal.ts` integration test | Matches Phase 2 `check-rls.ts` + Phase 3 `check-policies-list-filters.ts` pattern |
| `@anthropic-ai/sdk` | 0.97.1 | Re-assembled in `askQuestion` per D-25 | Already installed via Phase 4 |
| `@tiptap/react` + `@tiptap/html` + `@tiptap/starter-kit` + `@tiptap/extension-link` | 2.27.2 | `PolicyView` reuse for assigned-policy detail (D-27 full path) | Phase 3 already installed |
| `zod` | ^3.23.5 | Server Action input validation (D-10b + D-24) | Phase 3 already installed |
| `ts-morph` | 28.0.0 | New CI gate `check-acknowledgment-immutability.ts` per D-18 | Phase 2 D-08 + Phase 3 `check-policy-id-brand.ts` already use |
| `vitest` | ^1.6.0 | Co-located unit tests per D-21 + R-6 integration test per D-23a | Phase 4 `check-ai-layer.test.ts` precedent |

### Supporting (already installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | ^1.16.0 | Icon for "Ask the AI" link (if needed) | D-24 link on `/my-policies` header |
| `class-variance-authority` | ^0.7.1 | shadcn Badge override path for D-11 | NOT a new CVA variant — className override only |

### Alternatives Considered (not chosen)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useActionState` (D-24) | `useFormState` (legacy React 18) | `useFormState` deprecated in React 19; `useActionState` is the canonical replacement and ships in React 19.1.0 |
| ts-morph (D-18) | regex/grep | regex misses aliased imports (`acknowledgments as ack`); ts-morph type-aware traversal already proven in `check-policy-id-brand.ts` |
| Internal `import` call to `askQuestion` (D-25/T-3=A) | HTTP fetch to `/api/ai/qa` from Server Action | HTTP fetch is "C" option in T-3; rejected by operator for runtime weirdness; extraction is DRY-correct |

**Installation:** **No new packages.** Operator-locked constraint per CONTEXT specifics + CLAUDE.md ASK-FIRST rule #1.

## Package Legitimacy Audit

> **Not applicable** — Phase 5 installs ZERO new packages. All required libraries are already in `package.json` from Phase 1–4. Skipping slopcheck per protocol (no new deps to verify).

## Architecture Patterns

### System Architecture Diagram

```
                  Authenticated Employee
                          │
                          ▼
              Clerk session (middleware.ts)
                          │
                          ▼
        ┌─────────────────┴─────────────────┐
        │                                   │
        ▼                                   ▼
  /my-policies                       /my-policies/ask
  (RSC list)                         (RSC shell)
        │                                   │
        ├─ getOrgContext()                  ├─ getOrgContext()
        ├─ withOrgScope(ctx, async s => {   │
        │    Policies.list                  ▼
        │      AssignedAndPublishedForUser  Client form
        │      (s, userId)                  (useActionState)
        │    return rows                       │
        │  })                                  ▼
        │                                   askQuestionAction
        ▼                                   ├─ Zod parse
   Cards × N                                ├─ getOrgContext
   ├─ ackState='none'  → "Acknowledge" btn  ├─ askQuestion(ctx, q)
   ├─ ackState='stale' → AckStatusBadge     │   ├─ withOrgScope(ctx, s => {
   │                     "Re-acknowledge"   │   │    listPublishedForOrg
   └─ ackState='current'→ "Acknowledged on" │   │    validIds = new Set(rows.map(id))
                                            │   │    libraryXml (D-31 escape)
                                            │   │    Anthropic.messages.create
                                            │   │      [LONG_CACHE first, EPHEMERAL second]
                                            │   │    AiGenerations.insert(rawText, …)
        Acknowledge click                   │   │    {answer, citations} = parseQaResponse(
        ▼                                   │   │      rawText, validIds /* SAME closure */)
   acknowledgePolicyAction                  │   │    for cit of citations:
   ├─ Zod parse policyId → PolicyId         │   │      QaCitationGrants.upsert(s, {
   ├─ getOrgContext()                       │   │        orgId, userId, policyId: cit.id
   ├─ headers().get('x-forwarded-for')      │   │      })  // ON CONFLICT DO NOTHING
   │   .split(',')[0]?.trim() ?? null       │   │    return {answer, citations}
   ├─ withOrgScope(ctx, async s => {        │   │  })
   │    pol = Policies.findById            │   ├─ return to action
   │    if (status!='published')           │   ├─ map citations to
   │      throw PolicyArchivedError        │   │   {title, id, accessibility: 'full'|'tldr-only'}
   │    assign = check assignment match    │   └─ return formState
   │    if (!assign)                       │
   │      throw PolicyNotAssignedError     ▼
   │    pv = PolicyVersions.find           Client render
   │      ByVersionNumber(s, polId,         answer + citation links
   │       pol.currentVersion)
   │    INSERT acknowledgments
   │      ON CONFLICT DO NOTHING
   │  })                                    Citation click → /my-policies/[cit.id]
   ├─ revalidatePath outside try            ├─ page handler
   └─ return state                          │   ├─ assigned? → full PolicyView
                                            │   ├─ has grant + published? → TL;DR view
                                            │   └─ else → notFound()
```

### Recommended Project Structure

```
app/
├── (admin)/policies/[id]/
│   ├── page.tsx               # Phase 3 — EXTEND with PolicyAssignmentsPanel
│   └── actions.ts             # Phase 3 — EXTEND with bulkAssignToDepartmentAction
└── (employee)/                # Phase 3 03-G3 T9 stub — REPLACE WHOLESALE
    ├── layout.tsx             # NEW per D-24 / SPEC.md In-Scope: minimal auth gate
    └── my-policies/
        ├── page.tsx           # NEW — Server Component list (R-1)
        ├── [id]/
        │   ├── page.tsx       # NEW — access-aware: full / TL;DR / 404 (D-27)
        │   └── actions.ts     # NEW — acknowledgePolicyAction (R-2)
        └── ask/               # NEW per D-24 (R-6)
            ├── page.tsx       # NEW — Server Component shell
            └── actions.ts     # NEW — askQuestionAction
components/
├── policy/
│   ├── PolicyStatusBadge.tsx  # Phase 3 — PATTERN SOURCE for AckStatusBadge
│   ├── PolicyView.tsx         # Phase 3 — REUSE VERBATIM (D-27 full path)
│   └── AckStatusBadge.tsx     # NEW per D-11 (exhaustive switch on D-04 ackState)
└── employee/                  # NEW directory if Claude's-discretion chooses (vs policy/)
    └── (optional UI bits)
lib/
├── ai/
│   └── qa.ts                  # NEW per D-25 — askQuestion(ctx, q) extraction
├── policies/
│   ├── errors.ts              # NEW per D-30 — PolicyDomainError + 3 subclasses
│   └── acknowledgment.ts      # NEW per SPEC.md — IP capture + pv resolution + tx
└── db/
    ├── schema.ts              # EXTEND — qaCitationGrants table per D-29
    └── repositories/
        ├── acknowledgments.ts   # FILL throw-stub `record()` body per D-06+D-10+D-10a
        ├── policy_assignments.ts # FILL throw-stub `create()` body per D-15
        ├── policies.ts          # ADD listAssignedAndPublishedForUser per D-01..D-04
        └── qa_citation_grants.ts # NEW per D-29 — listForUser + upsert + hasGrant
drizzle/
├── 0010_phase5_uniques.sql    # NEW — both UNIQUE adds (D-28)
└── 0011_qa_citation_grants.sql # NEW — new table + RLS + GRANT (D-29)
scripts/
├── check-acknowledgment-immutability.ts  # NEW per D-18
├── check-employee-portal.ts              # NEW per D-22 integration test
├── check-artifacts.ts          # APPEND Phase 5 block
├── check-error-discipline.ts   # WIDEN to scan lib/policies/** per D-30
└── check-rls.ts                # ADD 'qa_citation_grants' to TENANT_TABLES ← GAP (see Risks §)
tests/
├── types.ts                    # PRESERVE D-07 @ts-expect-error lines (R-5 acceptance)
└── fixtures/
    └── ack-mutation-attempt.ts # NEW per D-20 negative-control
```

### Pattern 1: OrgScope-first repository methods (ADR-023)

**What:** Every repository function takes `OrgScope` as the first parameter, never bare `OrgContext`.
**When to use:** Every new repository method in Phase 5.
**Example:**
```typescript
// Source: lib/db/repositories/policies.ts:70-83 (Phase 4 D-12 precedent)
listPublishedForOrg: (s: OrgScope) =>
  s.tx
    .select({ id: policies.id, title: policies.title, contentJson: policies.contentJson })
    .from(policies)
    .where(and(eq(policies.orgId, s.orgId), eq(policies.status, 'published'))),
```
Phase 5's `listAssignedAndPublishedForUser` follows verbatim shape but adds JOINs.

### Pattern 2: withOrgScope-wrapped orchestrator (ADR-025)

**What:** Every user-facing DB path runs inside `withOrgScope(ctx, async (s) => {...})` — one Drizzle transaction with `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', ..., true)`.
**When to use:** `lib/policies/acknowledgment.ts` (new) and `lib/ai/qa.ts::askQuestion` (new per D-25).
**Example:**
```typescript
// Source: lib/policies/transitions.ts:153-173 (publish() precedent)
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    await PolicyVersions.create(s, { policyId, versionNumber: policy.currentVersion, … });
    await s.tx.update(policies).set({ status: 'published', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
  // Post-commit AI auto-trigger OUTSIDE the tx — Anthropic flakiness can't roll back
  try { await generateSummaryForPolicy(policyId, ctx); } catch (error) { … }
}
```
**Phase 5 acknowledgment.ts mirrors this:** load policy + assignment check + pv lookup + INSERT all inside ONE `withOrgScope` per D-10a.

### Pattern 3: Server Action conventions (Phase 3 D-09)

**What:** `'use server'` directive, Zod parse, redirect/`revalidatePath` OUTSIDE try/catch, returns typed `ActionState`.
**When to use:** `acknowledgePolicyAction`, `bulkAssignToDepartmentAction`, `askQuestionAction`.
**Example:**
```typescript
// Source: app/(admin)/policies/[id]/actions.ts:336-374 (updateDraftAction precedent)
export async function updateDraftAction(_prev, formData): Promise<ActionState> {
  const parsed = UpdateDraftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Invalid update payload.' };
  // ... business logic in try/catch
  try {
    const ctx = await getOrgContext();
    await withOrgScope(ctx, async (s) => { /* mutation */ });
  } catch (e) { /* return typed error */ }
  revalidateAfter(policyId);  // ← OUTSIDE try/catch per D-09 + Next.js 15 requirement
  return { ok: true };
}
```

### Pattern 4: Phase 4 D-41 same-closure validIds defense

**What:** `validIds = new Set(rows.map(r => r.id))` MUST be constructed inside the SAME `withOrgScope` closure that built the `libraryXml` block. Pass into `parseQaResponse(rawText, validIds)`. This is the SP-1 cross-org-citation-leak defense.
**When to use:** Phase 5 D-25 extraction of `askQuestion(ctx, q)` MUST preserve this invariant inside the new `lib/ai/qa.ts`. The grant-UPSERT in D-26 MUST iterate over the ALREADY-VALIDATED `result.citations` (not over the raw parser output before validIds filtering).
**Example:**
```typescript
// Source: app/api/ai/qa/route.ts:56-58 — DO NOT MOVE these lines apart
const result = await withOrgScope(ctx, async (s) => {
  const policies = await Policies.listPublishedForOrg(s);
  const validIds = new Set(policies.map((p) => p.id));     // ← D-41 SAME closure
  const libraryXml = policies.map((p) => `<policy id="${p.id}" …`).join('\n');
  // ... Anthropic call, AiGenerations.insert, parseQaResponse(rawText, validIds)
  return parseQaResponse(rawText, validIds);
});
```

### Pattern 5: ts-morph CI gate (D-18 mirrors check-policy-id-brand.ts)

**What:** Load tsconfig via `new Project({ tsConfigFilePath })`, traverse AST via `getSourceFile/getVariableDeclarations/asKind(SyntaxKind.…)`, fail process exit 1 on violations.
**When to use:** `scripts/check-acknowledgment-immutability.ts`.
**Reference:** `scripts/check-policy-id-brand.ts:43-322` is the full pattern.
**Key delta for D-18:** Walk `CallExpression` nodes (not `PropertyAssignment`), find `.update()` / `.delete()` calls whose argument resolves to the `acknowledgments` schema symbol (handle aliased imports).

### Anti-Patterns to Avoid

- **Hoisting `validIds` outside `withOrgScope`** in `askQuestion` (per Phase 4 SP-1). The Set MUST be built fresh inside the closure that built `libraryXml`.
- **Adding a `tldr_summary` column to repository `create` inputs** — locked by `tests/types.ts` D-07 + ADR-005.
- **Adding `update`/`delete` methods to `Acknowledgments` repository** — locked at compile time by D-07 + at CI time by new D-18 gate.
- **Adding `update`/`delete` to `PolicyVersions`** — same lock for L-05 (see `tests/types.ts:47-50`).
- **Calling `redirect()` or `revalidatePath()` inside the action's try/catch** — Next.js 15 throws specially for these; catching them breaks the redirect.
- **Using a new shadcn Badge CVA variant for D-11** — operator locked the className-override path (PolicyStatusBadge precedent at `components/policy/PolicyStatusBadge.tsx:37-44`).
- **Adding `assignee_type IS NOT NULL AND assignee_id IS NOT NULL` to the new UNIQUE (D-15)** — both are already `.notNull()` at the schema level; redundant predicate.
- **Forgetting RLS `(SELECT ...)` wrap on the new 0011 migration** — see Risks § for details.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent ack writes | App-layer SELECT-then-INSERT inside a transaction | `INSERT ... ON CONFLICT DO NOTHING` on the new UNIQUE | Race-free at the DB; operator locked via D-06 (also matches Q-23(a) coupling); `RETURNING` returns empty on conflict — server treats as silent success per D-10 |
| Append-only enforcement | Trigger or DDL constraint | TWO LAYERS: compile-time `@ts-expect-error` + runtime ts-morph grep on `lib/**/*.ts` | DB GRANTs include UPDATE+DELETE for `authenticated` role per `0001_rls_policies.sql:67-73` — the lock is intentionally at the app layer (ADR-018 documentation); D-18 closes the "future helper smuggles raw update" gap |
| Cross-org-leak prevention on Q&A citations | Filter at parser level only | Phase 4 D-41 same-closure validIds defense — INSIDE `askQuestion`'s `withOrgScope` | Already implemented at `qa-parser.ts:54` (`.filter((c) => validIds.has(c.id))`); D-25 extraction MUST preserve verbatim |
| IP capture from request | Reading `connection.remoteAddress` or building a fallback chain | `headers().get('x-forwarded-for')?.split(',')[0]?.trim() ?? null` per D-05 | Vercel strips client-supplied `x-forwarded-for` at edge; connection-level IP is the CDN's, not the user's. Locked. |
| Department-id at request time | Adding `departmentId` to `OrgContext` | Inline sub-select: `assignee_id IN (SELECT department_id FROM users WHERE id = $userId AND org_id = $orgId)` per D-03 | One extra index lookup vs +1 RTT to every `getOrgContext()`; the composite FK on `users(org_id, department_id) → departments(org_id, id)` (per `lib/db/schema.ts:246-254`) makes cross-org sub-select results impossible at the Postgres level |
| Cross-org dept assignment guard | App-layer "does this dept belong to this org" check | Composite FK already in place at `lib/db/schema.ts:246-254` | Postgres rejects `users.departmentId` referencing a `departments.id` in another org — fails at FK-check time, not RLS time |
| Re-ack derivation | Denormalized `users_policies_ack` cache or trigger-maintained column | LEFT JOIN with two ack joins per D-01 + return enum per D-04 | Cache invalidation = bug factory; LEFT JOIN is pure SQL, no maintenance window |
| Q&A grant access decision | Client-side check from response payload | Page-handler check in `/my-policies/[id]/page.tsx` per D-27 | D-27a explicitly marks `accessibility` flag as "UI hint only" — security boundary is server-side at the page handler |

**Key insight:** Phase 5 deliberately leans on database constraints (UNIQUE + composite FK) and database transactions (single `withOrgScope` wrapping read+lookup+INSERT) for correctness, NOT application-layer guards. This matches Phase 2's L-01..L-06 invariants and ADR-019/023/025.

## Runtime State Inventory

> Phase 5 ships new code + new schema; not a rename/refactor. Section included briefly because two migrations touch existing tables.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — pre-paying-customer per STATE.md line 5 | None |
| Live service config | None — no Datadog/n8n/Cloudflare bindings | None |
| OS-registered state | None — no Windows Task Scheduler / launchd entries | None |
| Secrets/env vars | New table `qa_citation_grants` — no new env vars; reuses `DATABASE_URL` + `DATABASE_URL_TEST` | None |
| Build artifacts | None — additive only | None |

**Migration risk: D-28 UNIQUE on `acknowledgments(user_id, policy_id, policy_version_id)` and `policy_assignments(policy_id, assignee_type, assignee_id)`.** Both tables are EMPTY in prod per STATE.md "pre-paying-customer status verified per STATE.md". Migration cannot fail on duplicate rows. Header MUST document this verification (matches `drizzle/0007_ai_generations_audit_extensions.sql:7-8` pattern: *"DROP COLUMN tokens_used is IRREVERSIBLE — pre-paying-customer status verified per STATE.md (no production AI calls exist yet). Operator approved 2026-05-21..."*).

## Common Pitfalls

### Pitfall 1: 0011 RLS predicate uses pre-0008 unwrapped form

**What goes wrong:** D-29's SQL block in CONTEXT.md shows:
```sql
CREATE POLICY "org_isolation" ON qa_citation_grants FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
```
This matches Phase 4's 0006 baseline. BUT migration `0008_rls_subquery_wrap.sql` (post-Phase-4 perf optimization) re-wrote ALL existing policies to use `(SELECT auth.jwt()->>'org_id')` for the `initPlan` optimization (~one JWT call per statement vs per row).

**Why it happens:** D-29 was written in CONTEXT.md from the SCHEMA.md frozen contract, which predates 0008. A new table added today must START at the post-0008 baseline.

**How to avoid:** **0011's CREATE POLICY MUST use the wrapped form:**
```sql
CREATE POLICY "org_isolation" ON qa_citation_grants
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
```
Otherwise the splinter lint rule `0003_auth_rls_initplan` flags it AND every `qa_citation_grants` SELECT re-evaluates `auth.jwt()` per row at scale.

**Warning signs:** EXPLAIN ANALYZE on a tenant-scoped SELECT from `qa_citation_grants` does NOT show `InitPlan 1 (returns $0)` before the row-source.

### Pitfall 2: check-rls.ts TENANT_TABLES array misses qa_citation_grants

**What goes wrong:** `scripts/check-rls.ts:35-47` hardcodes the table list:
```typescript
const TENANT_TABLES = [
  'organizations', 'users', 'departments', 'policies', 'policy_versions',
  'policy_assignments', 'acknowledgments', 'ai_generations', 'notifications',
  'workflow_stages', 'batch_jobs',  // Phase 4 D-29
] as const;
```

After Phase 5 ships, this array MUST grow to 12 entries (add `'qa_citation_grants'`). Without that, `pnpm verify:phase-3` runs `check:rls` (which `verify:phase-5` chains forward into) and silently never tests the new table's RLS — a cross-org leak in the new grant table would pass CI undetected.

**Why it happens:** The check-rls.ts table list is data-driven from a hardcoded array, not from `lib/db/schema.ts` introspection. Adding a new RLS table requires both the migration AND the array extension.

**How to avoid:** Phase 5 plan MUST include a task that extends `scripts/check-rls.ts:35-47` to add `'qa_citation_grants'`. Add to both the `TENANT_TABLES` const AND the TRUNCATE loops at lines 91-105 and 188-191. The same applies to `scripts/check-policies-list-filters.ts:60-70` TENANT_TABLES (used in TRUNCATE only; less critical because that script tests policies-not-grants).

**Warning signs:** `pnpm check:rls` reports 11 tables tested, not 12.

### Pitfall 3: D-26 grant UPSERT iterates over raw parser output

**What goes wrong:** D-26 says "After Anthropic responds and `parseQaResponse` runs, the Server Action enumerates citations and UPSERTs grant rows." If the grant-issue code reads from a citations variable BEFORE the validIds-strip pass in `parseQaResponse`, it would issue grants for HALLUCINATED policy IDs — and worse, hallucinated IDs that happen to UUID-collide with another org's policy would silently INSERT into `qa_citation_grants` with the current user's `org_id`, then when the user clicks the citation link, the page handler's `hasGrant` check would return TRUE — but the policy referenced has a different `org_id` and would 404 via RLS on the `policies` lookup. So the leak is closed, but the `qa_citation_grants` table accumulates garbage rows.

**Why it happens:** `parseQaResponse(rawText, validIds)` returns `{ answer, citations }` where `citations` is ALREADY filtered. The pitfall is misreading "after parseQaResponse runs" as "after the Anthropic call returns" and operating on the raw fence JSON.

**How to avoid:** In `lib/ai/qa.ts::askQuestion`, the grant-UPSERT loop MUST iterate over `result.citations` (the post-`parseQaResponse` filtered array), NOT over raw parsed fence JSON. The validIds Set already excluded hallucinated IDs at `lib/ai/qa-parser.ts:54`.

**Warning signs:** Integration test seeds Anthropic mock with a citation array containing a foreign-org policyId (Phase 4 SP-1 test pattern at `scripts/check-ai-layer.test.ts:564`); after the action returns, query `qa_citation_grants` for the user — there must be ZERO rows for the foreign-org policyId AND grant rows must match exactly the citations the user can see in the response.

### Pitfall 4: check-policy-id-brand.ts targets don't cover new Phase 5 surfaces

**What goes wrong:** `scripts/check-policy-id-brand.ts:52-96` hardcodes the file-and-method list. Phase 5 adds:
- `Acknowledgments.record(s, input)` — `input.policyId` is a brand-bearing field (object-literal pattern, like `PolicyVersions.create`)
- `PolicyAssignments.create(s, input)` — `input.policyId` is brand-bearing
- `QaCitationGrants.upsert(s, input)` — `input.policyId` is brand-bearing
- `lib/policies/acknowledgment.ts` orchestrator — first arg is `policyId: PolicyId`
- `lib/ai/qa.ts::askQuestion` — does NOT take policyId (takes question); not affected

Without extending the gate, a future refactor that drops the brand on any of these silently passes CI.

**Why it happens:** The gate is hardcoded to ADR-028's original scope (Phase 3 + Phase 4 D-09 `updateSummary` add). Phase 5 adds policyId surfaces that ADR-028's pattern obligates to brand.

**How to avoid:** Phase 5 plan MUST include extending `scripts/check-policy-id-brand.ts`:
- `REPO_TARGETS['lib/db/repositories/acknowledgments.ts'] = ['record']` (object-field pattern via OBJECT_FIELD_TARGETS)
- `REPO_TARGETS['lib/db/repositories/policy_assignments.ts'] = ['create']` (object-field pattern)
- `REPO_TARGETS['lib/db/repositories/qa_citation_grants.ts'] = ['upsert', 'hasGrant']`
- `ORCH_TARGETS['lib/policies/acknowledgment.ts'] = ['recordAcknowledgment']` (or whatever the exported fn is named)
- `OBJECT_FIELD_TARGETS` array — add entries for `record`/`create`/`upsert` input objects' `policyId` field

**Warning signs:** `pnpm check:policy-id-brand` reports X/X passed where X < the actual brand-bearing signature count.

### Pitfall 5: React 19 `useActionState` + `revalidatePath` leaves `isPending` stuck

**What goes wrong:** D-24 specifies React 19's `useActionState` hook. A known Next.js 15 issue (https://github.com/vercel/next.js/discussions/82289): when a Server Action wrapped in `useActionState` calls `revalidatePath()`, the action's `startTransition`-wrapped pending flag never resets and the UI stays in "submitting…" state indefinitely.

**Why it happens:** `useActionState` internally wraps the Server Action call in `startTransition`. `revalidatePath` schedules a server-side revalidation that completes asynchronously after the action returns. React 19.1's `isPending` doesn't observe that revalidation's completion.

**How to avoid:** Three options, ordered by preference:
1. (Preferred for Phase 5) Use `revalidatePath('/my-policies')` for the ack action — the page is server-rendered so the revalidation hits before the next navigation. For inline UI updates, return a state field like `{ ok: true, ackedAt: <iso> }` and have the Client Component update its local state from the returned formState. Skip the `isPending` UX read on the path that calls revalidatePath.
2. (Fallback) Wrap the Client Component's render of acknowledgment status in `useTransition` separately and use that local `isPending` for the button spinner.
3. (Reject) Use `router.refresh()` AFTER the action returns instead of `revalidatePath` inside the action. Not preferred because `revalidatePath` is the canonical Server Action pattern.

**Warning signs:** Vitest unit test for `acknowledgePolicyAction` asserts both `revalidatePath` is called AND the action returns successfully; manual smoke test of `/my-policies` after click should show "Acknowledged" without infinite spinner.

### Pitfall 6: Department-less user query semantics depend on driver behavior

**What goes wrong:** D-02 + D-03 lock the semantics: a user with `users.department_id IS NULL` should see ONLY user-level assignments. The inline subquery `assignee_id IN (SELECT department_id FROM users WHERE id = $userId AND org_id = $orgId)` returns a single NULL row when `department_id` is null. **In standard SQL, `assignee_id IN (NULL)` evaluates to UNKNOWN, not FALSE** — so a row with `assignee_id IS NULL` would match (UNKNOWN treated as FALSE in WHERE, so the row is excluded — correct). BUT: `assignee_id` is `.notNull()` in `lib/db/schema.ts:181` so this is moot. The dept-assignment row's `assignee_id` is always a real UUID; matching against NULL via IN returns no row, which is the desired D-02 behavior.

**Why it could still bite:** If the subquery returns ZERO rows (user does not exist in the org — which `getOrgContext` would have caught), `IN ()` is syntactically `IN (NULL-returning-subquery)` which is UNKNOWN. Drizzle's parameter binding handles this correctly. **No action needed if Drizzle composes the IN-subquery as a real SQL `IN (SELECT …)`** rather than expanding to a JS-level array.

**How to avoid:** The planner's R-1 SQL acceptance test MUST include a fixture row where `users.department_id IS NULL` AND a dept-level assignment exists for a different dept — and assert the dept-less user sees 0 dept-level rows. This proves the IN-subquery semantics work as D-02 asserts.

**Warning signs:** If Drizzle generates `IN ($1)` and the planner-emitted code passes a JS array `[null]`, behavior diverges from SQL semantics. Use the integration test in `scripts/check-employee-portal.ts` to verify.

### Pitfall 7: D-04 LEFT JOIN query plan without composite index

**What goes wrong:** D-01 + D-04's LEFT JOIN with TWO acknowledgments joins (`current_ack` on `(user_id, policy_id, policy_version_id)` + `prior_ack` on `(user_id, policy_id)` distinct from current) on a future 100-policy / 1000-acknowledgment table could fall back to seq scan without the right index.

**Why it's a non-issue at MVP scale BUT must be acknowledged:** The new D-06 UNIQUE constraint on `acknowledgments(user_id, policy_id, policy_version_id)` AUTO-CREATES a composite btree index — Postgres uses the unique constraint's index for the `current_ack` LEFT JOIN predicate. The `prior_ack` LEFT JOIN predicate is `(user_id, policy_id)` only, which is a PREFIX of the unique index → still uses the same btree.

**How to avoid:** No new index needed. The D-06 UNIQUE already covers both join predicates. Verify with `EXPLAIN ANALYZE` in the operator's dev DB after the migration applies — expect `Index Scan using acknowledgments_user_id_policy_id_policy_version_id_unique` for both join nodes.

**Warning signs:** Phase 8 dashboard query (Phase 8 SC #4: ack rate per policy + dept + employee) shows sequential scans on `acknowledgments`. If so, add a btree on `(policy_id, user_id)` for the rate aggregation path — but that's Phase 8, not Phase 5.

### Pitfall 8: D-10 silent-success "Acknowledged ✓" leaks unintended idempotency to user

**What goes wrong:** D-10 specifies "silent success" when the UNIQUE constraint fires — UI shows "Acknowledged ✓" identically to fresh ack. But the Server Action's `RETURNING` clause returns an empty array on conflict. If the code path checks `if (result.length === 0)` and throws an error, the user sees an error message for what is actually a successful (duplicate) ack — UX regression.

**Why it happens:** Drizzle's `.insert(table).values(...).onConflictDoNothing().returning()` returns `[]` on conflict (no row affected). A naive code path that checks for non-empty result misinterprets this as a write failure.

**How to avoid:** The acknowledgment.ts orchestrator MUST treat empty `RETURNING` as success per D-10. The Server Action MUST NOT throw on empty result. The console.log per D-10 is the only ops-side observability:
```typescript
const inserted = await s.tx.insert(acknowledgments).values({...}).onConflictDoNothing().returning();
if (inserted.length === 0) {
  console.log('[ack] no-op (already acked)', { userId: s.userId, policyId });
}
// fall through to return { ok: true, ackedAt: existing-row-or-just-inserted } regardless
```

**Warning signs:** Integration test scenario where user double-clicks Acknowledge should produce: 1 row in `acknowledgments`, action returns `{ ok: true }` BOTH times, console contains exactly 1 `[ack] no-op` log line.

## Code Examples

### LEFT JOIN dashboard query (D-01 + D-04 reference)

```typescript
// Source: lib/db/repositories/policies.ts — NEW method per Phase 5 D-01..D-04.
// Pattern adapted from listPublishedForOrg (Phase 4 D-12) + Phase 3 listWithFilters JOINs.
listAssignedAndPublishedForUser: async (
  s: OrgScope,
  userId: string,
) => {
  // Inline sub-select for user's departmentId per D-03 (no OrgContext extension).
  const userDeptSubquery = sql`(
    SELECT ${users.departmentId} FROM ${users}
    WHERE ${users.id} = ${userId} AND ${users.orgId} = ${s.orgId}
  )`;
  // Aliased acknowledgments joins per D-04.
  const currentAck = alias(acknowledgments, 'current_ack');
  const priorAck = alias(acknowledgments, 'prior_ack');
  return s.tx
    .selectDistinct({
      id: policies.id,
      title: policies.title,
      category: policies.category,
      currentVersion: policies.currentVersion,
      tldrSummary: policies.tldrSummary,
      ackState: sql<'none' | 'current' | 'stale'>`
        CASE
          WHEN ${currentAck.id} IS NOT NULL THEN 'current'
          WHEN ${priorAck.id}   IS NOT NULL THEN 'stale'
          ELSE 'none'
        END`.as('ack_state'),
      ackedAt: currentAck.acknowledgedAt,
    })
    .from(policies)
    .innerJoin(policyAssignments, and(
      eq(policyAssignments.policyId, policies.id),
      eq(policyAssignments.orgId, s.orgId),
      or(
        and(eq(policyAssignments.assigneeType, 'user'), eq(policyAssignments.assigneeId, userId)),
        and(eq(policyAssignments.assigneeType, 'department'),
            sql`${policyAssignments.assigneeId} = ${userDeptSubquery}`),
      ),
    ))
    .innerJoin(policyVersions, and(
      eq(policyVersions.policyId, policies.id),
      eq(policyVersions.versionNumber, policies.currentVersion),
      eq(policyVersions.orgId, s.orgId),
    ))
    .leftJoin(currentAck, and(
      eq(currentAck.userId, userId),
      eq(currentAck.policyId, policies.id),
      eq(currentAck.policyVersionId, policyVersions.id),
    ))
    .leftJoin(priorAck, and(
      eq(priorAck.userId, userId),
      eq(priorAck.policyId, policies.id),
      // distinct from current — any prior ack
      sql`${priorAck.policyVersionId} <> ${policyVersions.id}`,
    ))
    .where(and(
      eq(policies.orgId, s.orgId),
      eq(policies.status, 'published'),
    ));
}
```
*Note: planner has discretion per CONTEXT to pick JOIN order. The pattern above is illustrative; the integration test in `scripts/check-employee-portal.ts` validates the BEHAVIOR per R-1 + R-3 acceptance, not the exact SQL.*

### askQuestion(ctx, q) extraction (D-25 reference)

```typescript
// Source: lib/ai/qa.ts — NEW per Phase 5 D-25 / T-3=A.
// Refactors app/api/ai/qa/route.ts:41-117 inline logic into a pure function.
// CRITICAL: D-41 validIds defense MUST stay inside the withOrgScope closure.
import 'server-only';
import type { OrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { buildCachedSystem, buildLongCachedSystem } from '@/lib/ai/cache';
import { QA_SYSTEM_PROMPT_TEMPLATE } from '@/lib/ai/prompts';
import { policyToPromptText, xmlEscape } from '@/lib/ai/qa-extract';
import { extractText } from '@/lib/ai/extract';
import { parseQaResponse } from '@/lib/ai/qa-parser';
import { Policies } from '@/lib/db/repositories/policies';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { QaCitationGrants } from '@/lib/db/repositories/qa_citation_grants';

export async function askQuestion(
  ctx: OrgContext,
  question: string,
): Promise<{ answer: string; citations: { title: string; id: string; accessibility: 'full' | 'tldr-only' }[] }> {
  return await withOrgScope(ctx, async (s) => {
    const orgPolicies = await Policies.listPublishedForOrg(s);
    const validIds = new Set(orgPolicies.map((p) => p.id));         // D-41 SAME closure
    const libraryXml = orgPolicies
      .map((p) => `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`)
      .join('\n');
    const response = await getAnthropicClient().messages.create({
      model: MODEL_SONNET,
      max_tokens: 1024,
      system: [
        ...buildLongCachedSystem(libraryXml),                        // D-33c LONG_CACHE first
        ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),             // D-33c EPHEMERAL second
      ],
      messages: [{ role: 'user', content: question }],
    });
    const cacheCreation = response.usage.cache_creation_input_tokens ?? 0;
    const cacheRead = response.usage.cache_read_input_tokens ?? 0;
    const inputTokens = response.usage.input_tokens ?? 0;
    if (cacheCreation === 0 && cacheRead === 0) {
      console.warn('[ai/qa] cache miss likely', { orgId: ctx.orgId, inputTokens,
        likelyCause: inputTokens < 1024 ? 'below_1024_token_minimum_sonnet' : 'unknown' });
    }
    const rawText = extractText(response);
    await AiGenerations.insert(s, {                                  // WARNING-4 raw text
      policyId: null, type: 'qa', prompt: question, result: rawText,
      inputTokens: response.usage.input_tokens ?? null,
      outputTokens: response.usage.output_tokens ?? null,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
      idempotencyKey: null, model: MODEL_SONNET,
    });
    const parsed = parseQaResponse(rawText, validIds);                // D-41 strip-by-validIds
    // D-26 grant UPSERT — iterate over PARSED.CITATIONS (post-validIds), not raw fence.
    for (const cit of parsed.citations) {
      await QaCitationGrants.upsert(s, { userId: s.userId, policyId: cit.id });
      // ON CONFLICT (org_id, user_id, policy_id) DO NOTHING — idempotent
    }
    // Annotate accessibility for UI hint (security boundary is server at /my-policies/[id] page).
    const assignedSet = new Set(/* TODO: cheap query — listAssignedPolicyIdsForUser(s, ctx.userId) */);
    const annotated = parsed.citations.map((cit) => ({
      title: cit.title, id: cit.id,
      accessibility: (assignedSet.has(cit.id) ? 'full' : 'tldr-only') as const,
    }));
    return { answer: parsed.answer, citations: annotated };
  });
}
```
*Note: planner has discretion on the exact order of grant-UPSERT vs accessibility-annotation; both must occur within the same `withOrgScope` closure (atomicity).*

### Server Action with React 19 useActionState (R-2 reference)

```typescript
// Source: app/(employee)/my-policies/[id]/actions.ts — NEW per Phase 5 D-09 + D-10b + D-10c.
// Mirrors Phase 3 app/(admin)/policies/[id]/actions.ts:336-374 (updateDraftAction).
'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { recordAcknowledgment } from '@/lib/policies/acknowledgment';
import { PolicyIdSchema } from '@/lib/policies/types';
import { PolicyArchivedError, PolicyNotAssignedError } from '@/lib/policies/errors';

type ActionState =
  | { ok: true; ackedAt: string }
  | { ok: false; error: string; code?: 'POLICY_ARCHIVED' | 'POLICY_NOT_ASSIGNED' };

const Schema = z.object({ policyId: PolicyIdSchema });

export async function acknowledgePolicyAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const parsed = Schema.safeParse({ policyId: formData.get('policyId') });
  if (!parsed.success) return { ok: false, error: 'Invalid action payload.' };
  const ipAddress = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  try {
    const ctx = await getOrgContext();
    const result = await recordAcknowledgment(ctx, parsed.data.policyId, ipAddress);
    revalidatePath('/my-policies');                                  // OUTSIDE try/catch
    revalidatePath(`/my-policies/${parsed.data.policyId}`);
    return { ok: true, ackedAt: result.ackedAt };
  } catch (err) {
    if (err instanceof PolicyArchivedError) {
      return { ok: false, error: 'This policy was archived. Refresh to update your list.', code: 'POLICY_ARCHIVED' };
    }
    if (err instanceof PolicyNotAssignedError) {
      return { ok: false, error: 'You are no longer assigned this policy.', code: 'POLICY_NOT_ASSIGNED' };
    }
    throw err;  // bubble to Next.js error boundary
  }
}
```
*Note: this snippet shows the recovery branches per D-07/D-08; planner refines based on the actual orchestrator return shape.*

### AckStatusBadge (D-11 reference)

```typescript
// Source: components/policy/AckStatusBadge.tsx — NEW per Phase 5 D-11.
// Mirrors PolicyStatusBadge.tsx:28-46 exhaustive-switch pattern.
import { Badge } from '@/components/ui/badge';

type AckState = 'none' | 'current' | 'stale';

export function AckStatusBadge({
  ackState,
  ackedAt,
}: {
  ackState: AckState;
  ackedAt: Date | null;
}) {
  switch (ackState) {
    case 'none':
      return null;  // plain "Acknowledge" CTA per D-11 first branch
    case 'stale':
      return (
        <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700">
          Requires re-acknowledgment
        </Badge>
      );
    case 'current':
      return (
        <span className="inline-flex items-center gap-1 text-sm text-green-700">
          ✓ Acknowledged on {ackedAt && new Date(ackedAt).toLocaleDateString('en-US')}
        </span>
      );
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useFormState` (React 18) | `useActionState` (React 19) | React 19.0.0 (Dec 2024); installed React 19.1.0 | D-24 uses the canonical hook; signature is `(prevState, formData) => state` |
| Append-only enforced via DB trigger | Append-only enforced at type system + ts-morph CI | Phase 5 D-18..D-20 (this phase) | Two-layer defense; no DB trigger; planner ships type test + new gate |
| `auth.jwt()->>'org_id'` unwrapped in RLS | `(SELECT auth.jwt()->>'org_id')` wrapped (initPlan) | Phase 4 D-39 + `drizzle/0008_rls_subquery_wrap.sql` | Phase 5's 0011 MUST use wrapped form for the new `qa_citation_grants` policy (see Pitfall 1) |
| Single ack idempotency via app-layer SELECT-then-INSERT | DB UNIQUE + `ON CONFLICT DO NOTHING` | Phase 5 D-06 (this phase) | Race-free; matches Phase 4 D-32 partial-unique-index precedent |

**Deprecated/outdated:**
- `useFormState` from `react-dom` — superseded by `useActionState` from `react` in React 19. Phase 5 imports from `react` not `react-dom`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `acknowledgments(user_id, policy_id, policy_version_id)` UNIQUE auto-creates a btree usable by both `current_ack` and `prior_ack` join predicates | Pitfall 7 | Phase 8 dashboard may need explicit `(policy_id, user_id)` index — not Phase 5's problem |
| A2 | Drizzle composes `IN (SELECT …)` as a real SQL subquery rather than fetching the inner SELECT to JS and expanding to `IN ($1, $2, ...)` | Pitfall 6 | If wrong, dept-less-user behavior diverges from SQL semantics — integration test catches |
| A3 | Phase 4 `lib/ai/qa-parser.ts:54` `.filter((c) => validIds.has(c.id))` is sufficient to prevent ANY cross-org policyId from reaching the response (and therefore the grant UPSERT) | Pitfall 3 / R-6 cross-org leak | Verified by reading source — SP-1 closed for Phase 5 reuse |
| A4 | The `slugify`-style departments seed pattern in `scripts/check-policies-list-filters.ts:98-99` is transferable to the new `scripts/check-employee-portal.ts` (R-1 dept-membership fixtures) | Validation Architecture | Same pattern; low risk |
| A5 | Next.js 15.5.18 + React 19.1.0 `useActionState` exhibits the `isPending`-stuck pitfall documented in Next.js issue #82289 | Pitfall 5 | If fixed in 15.5.18, planner gains a free option to use `isPending` directly; either way Pitfall 5 advice is safe |

## Open Questions

None that block planning. The operator's hypothesis ("CONTEXT.md already locks 30 decisions") was correct — all 6 unknowns this research surfaced are MECHANICAL (file paths, array entries, RLS subquery form, brand-gate extensions), not architectural.

If the planner identifies new unknowns during plan generation, defer to operator via `/gsd:discuss-phase --reopen` or a clarifying AskUserQuestion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | 22 (per `engines.node`) | — |
| pnpm | All commands | ✓ | 9.15.9 (per `packageManager`) | — |
| Drizzle Kit | 0010 + 0011 migration generation | ✓ | 0.31.10 | — |
| TEST DB (Supabase) | `scripts/check-employee-portal.ts` integration test | ✓ | env: `DATABASE_URL_TEST` + `DIRECT_URL_TEST` per Plan 02-02 D-05 (SF-DB-1 CLOSED 2026-05-18 per STATE.md) | — |
| Anthropic API key | R-6 live smoke (post-merge UAT only) | ✓ | env: `ANTHROPIC_API_KEY` per Phase 4 ship | R-6 integration test MOCKS Anthropic per D-23a — no key needed for CI |
| ts-morph | D-18 new gate | ✓ | 28.0.0 | — |
| postgres-js | D-22 integration test | ✓ | 3.4.9 | — |
| vitest | Co-located unit tests + R-6 integration | ✓ | 1.6.0 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** Anthropic API key for live smoke (mock via vitest is the CI fallback per D-23a).

## Validation Architecture

> Per Nyquist standard (Phase 2+); workflow.nyquist_validation enabled by default.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.6.0 (co-located `.test.ts` files) + raw postgres-js (integration scripts) |
| Config file | `scripts/check-ai-layer.vitest.config.ts` precedent (planner may need a similar `scripts/check-employee-portal.vitest.config.ts` if D-23a R-6 test runs via vitest) |
| Quick run command | `pnpm test` (vitest) or `pnpm check:employee-portal` (integration) |
| Full suite command | `pnpm verify:phase-5` per D-23: `pnpm verify:phase-4 && pnpm check:acknowledgment-immutability && pnpm check:acknowledgment-immutability:self-test && pnpm check:employee-portal` |
| Phase gate | All four commands exit 0 before squash-merge to `main` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R-1 | Dashboard returns only assigned+published policies | unit + integration | `pnpm vitest run lib/db/repositories/policies.test.ts -t "listAssignedAndPublishedForUser"` + `pnpm check:employee-portal` | ❌ Wave 0 |
| R-2 | Acknowledge inserts exact 5-field row | unit + integration | `pnpm vitest run lib/policies/acknowledgment.test.ts` + `pnpm check:employee-portal` | ❌ Wave 0 |
| R-2 | UI updates without reload | unit (assert revalidatePath called) | `pnpm vitest run app/(employee)/my-policies/[id]/actions.test.ts -t "revalidatePath"` | ❌ Wave 0 |
| R-3 | Re-ack indicator on republish; prior rows intact | integration | `pnpm check:employee-portal` (covers seed → publish → ack → editPublished → publish → assert ackState='stale' + COUNT(*)=1 → re-ack → COUNT(*)=2 + ackState='current') | ❌ Wave 0 |
| R-4 | Bulk-assign creates exactly one row; all dept members see it | integration | `pnpm check:employee-portal` (covers dept-D seed with 3 users + bulk-assign + assert COUNT=1 + 3 users' lists each include P) | ❌ Wave 0 |
| R-5 | tsc still exits 0 with D-07 lines; gate exits 0 on prod + non-zero on fixture | unit + CI gate | `pnpm typecheck` + `pnpm check:acknowledgment-immutability` + `pnpm check:acknowledgment-immutability:self-test` | ❌ Wave 0 |
| R-6 | Q&A returns non-empty answer + cited policies + citation links | integration (mocked Anthropic) | `pnpm vitest run scripts/check-employee-portal.test.ts -t "R-6"` OR within `pnpm check:employee-portal` integration | ❌ Wave 0 |
| Cross-org isolation (R-1) | User in Org A with UUID-collision dept in Org B does NOT see Org B policies | integration | `pnpm check:employee-portal` (seed both orgs with overlapping UUIDs; assert 0 Org-B rows for Org-A user) | ❌ Wave 0 |
| Cross-org isolation (R-6 grants) | qa_citation_grants RLS prevents Org A from seeing Org B's grants | integration | `pnpm check:rls` (must include `qa_citation_grants` in TENANT_TABLES — see Pitfall 2) | ❌ Wave 0 — requires Pitfall-2 fix |
| Append-only enforcement (R-5) | acknowledgments table never UPDATED/DELETED via app code | CI gate | `pnpm check:acknowledgment-immutability` + `tests/types.ts` preserves D-07 lines | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm typecheck && pnpm check:acknowledgment-immutability` (fast; ~5s)
- **Per wave merge:** `pnpm verify:phase-5` (full chain ~60-90s assuming Phase 4 chain ~30s + Phase 5 additions ~30-60s for integration test against TEST DB)
- **Phase gate:** `pnpm verify:phase-5` green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/db/repositories/policies.test.ts` (EXTEND existing or create) — covers `listAssignedAndPublishedForUser` R-1 acceptance (4-row seed)
- [ ] `lib/db/repositories/acknowledgments.test.ts` — covers `record()` body + ON CONFLICT DO NOTHING semantics per D-06/D-10
- [ ] `lib/db/repositories/policy_assignments.test.ts` — covers `create()` body per D-15
- [ ] `lib/db/repositories/qa_citation_grants.test.ts` — covers `upsert` idempotency + `hasGrant` per D-29
- [ ] `lib/policies/acknowledgment.test.ts` — covers IP capture + pv resolution + tx atomicity per D-10a
- [ ] `app/(employee)/my-policies/[id]/actions.test.ts` — covers Zod parse + revalidatePath + PolicyArchivedError/PolicyNotAssignedError branches per D-07/D-08/D-10c
- [ ] `app/(employee)/my-policies/ask/actions.test.ts` — covers askQuestionAction Zod parse + askQuestion call + citations annotation per D-24
- [ ] `scripts/check-employee-portal.ts` — integration test covering R-1 + R-3 + R-4 + R-6 + cross-org isolation per D-22 + D-23a Anthropic mock
- [ ] `scripts/check-acknowledgment-immutability.ts` — new ts-morph gate per D-18; supports `--self-test` mode per D-20
- [ ] `tests/fixtures/ack-mutation-attempt.ts` — negative-control fixture per D-20
- [ ] `scripts/check-employee-portal.vitest.config.ts` — may be needed for R-6 mocking pattern (mirror `scripts/check-ai-layer.vitest.config.ts`)
- [ ] `scripts/check-rls.ts` — EXTEND TENANT_TABLES array to add `'qa_citation_grants'` (Pitfall 2)
- [ ] `scripts/check-policy-id-brand.ts` — EXTEND REPO_TARGETS + ORCH_TARGETS + OBJECT_FIELD_TARGETS for Phase 5 brand-bearing methods (Pitfall 4)
- [ ] `scripts/check-error-discipline.ts` — WIDEN to scan `lib/policies/**` per D-30

## Security Domain

> Phase 5 introduces a new tenant-scoped table + new Server Actions + a narrow exception to REQ-access-control. security_enforcement = enabled (default).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Clerk session; middleware-enforced employee gate per ADR-009 (no custom auth — NEVER #1) |
| V3 Session Management | yes | Clerk handles; React 19 useActionState forms read session via getOrgContext server-side only |
| V4 Access Control | yes | OrgScope + RLS + composite FK on users(org_id, department_id); R-6 narrow exception via qa_citation_grants table (D-26) — explicit grant model, default-deny |
| V5 Input Validation | yes | Zod `.safeParse` at every Server Action boundary; PolicyIdSchema brand at trust boundary per ADR-028 |
| V6 Cryptography | no | No new crypto in Phase 5 |
| V7 Error Handling | yes | Typed `PolicyDomainError` hierarchy per D-30; no message leakage of internal IDs (mirror lib/auth/errors.ts pattern) |
| V8 Data Protection | yes | IP capture sanitized at boundary (D-05: trim only, no validation); never echoed in responses; stored in audit-only `ip_address` column |
| V9 Communication | yes | Vercel TLS; `x-forwarded-for` trust boundary documented (D-05 — Vercel strips client-supplied values) |
| V10 Malicious Code | yes | TipTap StarterKit + Link allow-list (`PolicyView.tsx:6-11` documents CVE-2025-14284 mitigation); R-6 inherits Phase 4 D-31 layer-2 XML escape |
| V11 Business Logic | yes | Append-only invariant locked at 3 layers: type system (D-07), CI gate (D-18), DB GRANT-asymmetry-documented (intentional per `0001_rls_policies.sql:67-73`) |
| V12 File Upload | no | No file uploads in Phase 5 |
| V13 API | yes | Server Actions use Zod `.strict()` pattern from Phase 4 (`lib/ai/schemas.ts:35,40,44`) to prevent mass-assignment |
| V14 Configuration | yes | Migrations follow CLAUDE.md "Database Migration Discipline"; operator approval documented in headers |

### Known Threat Patterns for Phase 5 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged policyId in Server Action FormData | Tampering | PolicyIdSchema brand + Zod `.safeParse` at boundary per D-10b; Postgres rejects malformed UUID at query time (22P02) — verified by Phase 3 CR-PR3-#23 pattern |
| Cross-org grant via UUID collision (D-26 attack vector raised by operator) | Information Disclosure | Closed at TWO points: (1) `qa-parser.ts:54` validIds.has() strips before grant-UPSERT path even sees the citation; (2) page handler at `/my-policies/[id]` re-evaluates assignment + grant + policy status against RLS-scoped query → 404 on any mismatch |
| Dual-assignment grant duplication (operator: same policy assigned via user AND dept) | Repudiation | D-01 SELECT DISTINCT dedupes at query time; D-15 UNIQUE on `(policy_id, assignee_type, assignee_id)` permits both rows (different assignee_type) but rate calculations naturally collapse via D-04 enum |
| Acknowledge-while-archived race | Tampering | D-07 throws PolicyArchivedError inside the withOrgScope tx; tx rolls back; integration test asserts no row inserted post-archive |
| Acknowledge-while-unassigned race | Tampering | D-08 throws PolicyNotAssignedError; same tx-rollback pattern |
| Acknowledgment row UPDATE/DELETE smuggled past type system | Tampering / Repudiation | D-18 ts-morph gate scans `lib/**/*.ts` for `.update(acknowledgments)` / `.delete(acknowledgments)` calls; D-20 negative-control fixture proves gate is non-vacuous |
| Q&A injection via crafted question | Tampering | Phase 4 D-31 layer-1 prompt meta-instruction + layer-2 XML escape (`qa-extract.ts:33-44`) — inherited by D-25 extraction |
| Cross-org policy library leak via shared Anthropic prompt cache | Information Disclosure | Phase 4 D-33c LONG_CACHE is per-org-content (libraryXml is built from `Policies.listPublishedForOrg(s)` inside `withOrgScope`); cache key is the prompt block contents, which are unique per org — preserved by D-25 |
| IPv6 in x-forwarded-for stored without normalization | Information Disclosure (low) | OUT OF SCOPE per CONTEXT `<deferred>`; documented as audit-consumer responsibility (validate at read time) |
| Vercel edge `x-forwarded-for` spoofing | Tampering | Vercel strips client-supplied values at edge per D-05 documentation; local dev returns null — verified in D-05 spec |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/05-employee-portal/05-CONTEXT.md` — 30 locked decisions D-01..D-30
- `.planning/phases/05-employee-portal/05-SPEC.md` — 6 requirements + 13 acceptance criteria + ambiguity 0.162
- `.planning/phases/05-employee-portal/05-DISCUSSION-LOG.md` — operator selection audit trail
- `.planning/REQUIREMENTS.md` — REQ-acknowledgment-tracking + REQ-acknowledgment-rules
- `.planning/STATE.md` — Phase 4 SHIPPED 2026-05-22; pre-paying-customer status (basis for migration approval)
- `.planning/PROJECT.md` — 29 ADRs; especially 018 / 019 / 023 / 025 / 026 / 027 / 028 / 029
- `app/api/ai/qa/route.ts:41-147` — Phase 4 inline logic to extract per D-25; D-41 same-closure validIds verified at lines 56-58
- `lib/ai/qa-parser.ts:30-63` — D-41 strip implementation (line 54: `.filter((c) => validIds.has(c.id))`)
- `lib/ai/qa-extract.ts:33-44` — xmlEscape + policyToPromptText for D-25 re-assembly
- `lib/ai/cache.ts:22-43` — LONG_CACHE + EPHEMERAL_CACHE for D-33c preservation
- `lib/ai/schemas.ts:41-43` — QaSchema with .strict() (D-42 pattern Phase 5 R-6 inherits)
- `lib/db/scoped.ts:14-67` — OrgScope shape; SET LOCAL ROLE + set_config plumbing
- `lib/db/schema.ts:39-57, 176-186, 188-216, 225-255` — Acknowledgments + PolicyAssignments + PolicyVersions + Users shapes; composite FK on (org_id, department_id)
- `lib/db/repositories/acknowledgments.ts` — throw-stub `record()` to fill
- `lib/db/repositories/policy_assignments.ts` — throw-stub `create()` to fill
- `lib/db/repositories/policies.ts:70-83` — `listPublishedForOrg` precedent for `listAssignedAndPublishedForUser`
- `lib/auth/context.ts:93-174` — `getOrgContext` shape; OrgContext does NOT carry departmentId per D-03
- `lib/auth/errors.ts:51-229` — abstract base + typed-class hierarchy pattern for D-30 mirror
- `lib/policies/transitions.ts:153-216` — orchestrator pattern; publish() precedent for acknowledgment.ts
- `app/(admin)/policies/[id]/actions.ts:71-374` — Server Action precedent (Zod boundary, revalidatePath outside try/catch)
- `components/policy/PolicyStatusBadge.tsx:28-46` — exhaustive switch precedent for AckStatusBadge
- `components/policy/PolicyView.tsx:21-29` — TipTap render to reuse verbatim
- `scripts/check-rls.ts:32-47` — TENANT_TABLES array to extend (Pitfall 2)
- `scripts/check-policies-list-filters.ts:26-308` — full integration test pattern for check-employee-portal.ts
- `scripts/check-policy-id-brand.ts:43-322` — ts-morph gate pattern to mirror for D-18 AND to extend for Phase 5 brand surfaces (Pitfall 4)
- `scripts/check-ai-layer.test.ts:34-145, 419-511` — vitest + mocked Anthropic + scopedRef pattern for D-23a R-6 integration
- `scripts/check-error-discipline.ts` — referenced; widen pattern for D-30
- `drizzle/0001_rls_policies.sql:1-96` — RLS + GRANT baseline; line 67-73 documents append-only GRANT-vs-app-layer asymmetry
- `drizzle/0007_ai_generations_audit_extensions.sql:1-37` — header pattern for D-28 + D-29 migration headers
- `drizzle/0008_rls_subquery_wrap.sql:1-78` — initPlan wrap pattern (post-Phase-4 baseline) — D-29 MUST adopt (Pitfall 1)
- `drizzle/0009_org_id_indexes.sql:1-56` — index discipline; Phase 5 ack/grant tables already covered by existing org_id indexes; new qa_citation_grants table per D-29 SQL block adds its own org_id_idx + composite idx
- `tests/types.ts:1-91` — D-07 invariants + ADR-028 brand test + Phase 4 D-43 citation-shape lock; Phase 5 MUST preserve

### Secondary (MEDIUM confidence)

- `package.json:54-100` — verified installed versions (React 19.1.0, Next.js 15.5.18, Anthropic SDK 0.97.1, Drizzle ORM 0.45.2, postgres 3.4.9, ts-morph 28.0.0, vitest 1.6.0, zod ^3.23.5)
- WebSearch — React 19 useActionState + revalidatePath stuck-isPending pitfall (cross-verified at Next.js GitHub Discussion #82289)

### Tertiary (LOW confidence)

- None — every claim in this research was verified by reading source files in this repo or by cross-reference with Phase 4 SHIPPED implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from `package.json`; React 19 + Next.js 15 patterns confirmed via official docs cross-reference
- Architecture: HIGH — all patterns lifted verbatim from Phase 2/3/4 SHIPPED code in this repo
- Pitfalls: HIGH (6 confirmed by source code) + MEDIUM (1: React 19 pitfall confirmed via Next.js issue tracker)
- Validation Architecture: HIGH — full chain reuses Phase 4 D-23 forward-chaining pattern

**Research date:** 2026-05-23
**Valid until:** 2026-06-22 (30 days; stable stack, no fast-moving dependencies)

---

## RESEARCH COMPLETE

**Phase:** 5 — Employee Portal
**Confidence:** HIGH (CONTEXT.md was comprehensive at decision layer; this pass surfaces 6 mechanical gaps NOT in CONTEXT.md)

### Key Findings

- **Operator was correct:** No architectural decisions need amendment; all 30 CONTEXT decisions stand.
- **6 mechanical gaps NOT in CONTEXT.md surfaced:** (1) 0011 RLS predicate must use post-0008 `(SELECT auth.jwt()->>'org_id')` wrapped form; (2) `scripts/check-rls.ts:35-47` TENANT_TABLES array must add `'qa_citation_grants'`; (3) D-26 grant UPSERT must iterate over `parseQaResponse`-validated citations, NOT raw fence JSON; (4) `scripts/check-policy-id-brand.ts` must extend REPO_TARGETS + OBJECT_FIELD_TARGETS for Phase 5 brand-bearing methods; (5) React 19 `useActionState` + `revalidatePath` `isPending`-stuck pitfall — use returned formState for inline UI instead; (6) D-10 silent-success "Acknowledged ✓" requires careful handling of empty `RETURNING` array from `onConflictDoNothing()`.
- **3 operator-flagged unknowns CONFIRMED safe:** Phase 4 D-41 same-closure validIds defense (line `qa-parser.ts:54`) closes R-6 cross-org citation leak; dual-assignment via user + dept dedupes via D-01 SELECT DISTINCT; D-04 LEFT JOIN query plan needs no new index (D-06 UNIQUE auto-creates btree usable by both join predicates).
- **Append-only invariant has 3-layer defense** (operator's R-5 design): type system (D-07 `tests/types.ts`), new ts-morph CI gate (D-18..D-20), AND DB GRANT-asymmetry-documented (`0001_rls_policies.sql:67-73`).
- **Phase 5 ships ZERO new packages** — every required library is already in `package.json`. ASK-FIRST cleared for the 3 additive migrations via discuss-phase Q-22/Q-23/T-2(4c).

### File Created

`C:\Users\matth\Desktop\PolicyPilot\.planning\phases\05-employee-portal\05-RESEARCH.md`

### Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All versions verified from `package.json` |
| Architecture Patterns | HIGH | Lifted verbatim from Phase 2/3/4 SHIPPED code in this repo |
| Pitfalls (6 mechanical) | HIGH | Confirmed by reading source files |
| Pitfall 5 (React 19 quirk) | MEDIUM | Confirmed via Next.js GitHub Discussion #82289 |
| Validation Architecture | HIGH | Forward-chains from Phase 4 D-23 pattern |
| Security Domain | HIGH | All ASVS categories mapped to existing CONTEXT decisions |

### Open Questions

None blocking planning. CONTEXT.md is decision-complete; this research closes the mechanical gaps the planner needs.

### Ready for Planning

Research complete. Planner can consume CONTEXT.md (decisions) + this RESEARCH.md (gaps + patterns) and emit PLAN.md files for all 30 decisions + 6 mechanical fixes documented in `## Common Pitfalls` and `## Validation Architecture > Wave 0 Gaps`.
