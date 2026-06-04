# Phase 9 — Reviewer / Approval Workflows — SPEC (build-of-record)

> **Status:** §13 ASK-FIRST gates **SIGNED OFF by operator 2026-06-04 (session 16)** — decision **D-09-01**.
> This SPEC is **decision-locked** to those answers (no open options remain except the two derived
> refinements flagged in §13a). Build proceeds on this branch (`gsd/phase-9-reviewer`).
> **Phase:** 9 · **Depends on:** Phase 2 (data layer), Phase 3 (admin UI + state machine), Phase 6 (billing/tier flags).
> **Routing:** Operator GO (s14) + build routed to **Claude** (overrides default Codex routing — permitted by CLAUDE.md). Feature **un-parks on build start** (risk R-017).
> **Provenance:** Corrects ChatGPT Pro's returned design (s14 validation `wf_97d34374-237`); re-grounded s15 (`wf_756520ec-f70`) and s16 (this session, direct `file:line` reads of every anchor). Verification: s15 `wf_50aa4a2e-50b` (0 refuted).

---

## 0. Operator §13 decisions (D-09-01, 2026-06-04)

| Gate | Decision | Effect on this SPEC |
|---|---|---|
| **(a) Data model** | **②b — append-only `review_decisions` log** | Migration `0013` (additive, new table) + app-layer `IMMUTABLE_TABLES`. §5, §12. |
| **(b) Publish gate** | **Confirm §6** | Completeness gate **inside `publish()`** at `transitions.ts:169`, covers `approve()` alias. §6. |
| **(c) Direct publish** | **Require submission first** | Growth+ may publish **only from `under_review`** with an approved, no-pending workflow. Direct `draft→published` blocked for Growth+. §6. |
| **(d) Self-approval** | **Allow** | No separation-of-duties check; submitter may be the reviewer. No `SelfReviewForbiddenError`. §7. |

**Net:** audit-hardened + strict configuration. ONE additive migration (`0013`), no destructive DB change.

---

## 1. Goal

Ship the Growth+ "approval workflow" that today is a pre-declared, intentionally-unenforced tier flag (`approvalWorkflows`; `lib/stripe/products.ts:36-75` + risk R-017). When shipped: a Growth/Business org's policy must pass a reviewer's approval before it can be published; Starter keeps direct-publish. This closes the **publish-leak** (any approve-gate today is bypassable because `approve()` aliases `publish()` — `transitions.ts:133-135` — and the state machine allows `draft→published` directly — `state-machine.ts:23`) by enforcing completeness **inside `publish()`**, the only leak-proof locus.

**One-sentence outcome:** A Growth+ admin submits a policy for review (assigning a reviewer) → the assigned reviewer approves/rejects it from a dedicated reviewer surface → only an approved, currently-under-review policy can be published; every decision is recorded in an immutable `review_decisions` ledger; Starter is unaffected.

---

## 2. Scope (MVP) & Non-Goals

### MVP (thin vertical slice)
1. **New append-only `review_decisions` table** (②b) — migration `0013`; immutable decision ledger.
2. **Wire the existing dead seams** in `lib/db/repositories/workflow_stages.ts` (`recordDecision`, `listPendingForReviewer`, `listForPolicy` — defined, zero call sites today).
3. **New `ReviewDecisions` repository** (`lib/db/repositories/review_decisions.ts`) — `record` (insert) + `listForPolicy` (audit view); **no** update/delete (append-only).
4. **New review orchestrator** `recordReviewDecision` in `lib/policies/transitions.ts` (reviewer-or-admin scope): updates the stage projection + appends the immutable ledger row + (on reject) returns the policy to `draft` — all in one transaction.
5. **Reviewer surface** — `app/(reviewer)/` route group: pending-review queue + policy-detail review page (read-only render + comment + Approve/Reject).
6. **Reviewer guards** — `lib/auth/require-reviewer.ts` (`requireReviewerOrAdmin` page-gate + `requireReviewerOrAdminFromCtx` action-gate).
7. **Publish-leak closure** — tier-aware completeness gate **inside `publish()`** (`transitions.ts:169`), require-submission-first semantics.
8. **New `WorkflowIncompleteError`** (`lib/policies/errors.ts`) — 409/422 semantics, distinct from the tier-403; wired into `handleTransitionError`.
9. **Submit entitlement** — Starter cannot assign a reviewer (Growth+ feature) → `TierLimitExceededError` 403/upgrade; Growth+ must assign one.
10. **Post-sign-in routing** — route `role === 'reviewer'` → `/reviewer`.

### Non-Goals (MVP)
- Parallel / quorum / multi-stage workflows (`stageOrder` exists; MVP uses the single `stageOrder = 1` the repo already writes).
- Delegation, reviewer pools, SLA escalation.
- **Email / Railway-worker notifications → deferred to Phase 7.** MVP may write in-app rows to the **existing** `notifications` table (`schema.ts:152-162`) but builds **no** email/worker.
- External integrations (Slack), AI comment summarisation, granular per-policy RBAC, threaded inline comments.
- Per-reviewer RLS hardening (RLS stays org-level, as the rest of the schema; per-reviewer scoping is app-layer via `reviewerId` filter). Feasible later (sub = internal `users.id`) but out of MVP scope.

---

## 3. Ground-truth anchors (verified verbatim `file:line`, s16)

**Schema (`lib/db/schema.ts`):**
- D-02 invariant: every tenant table carries its own `org_id uuid NOT NULL ... onDelete:'cascade'`. Pattern e.g. `qaCitationGrants :262-287`, `workflowStages :328-339`.
- `workflowStages :328-339` → `id, orgId, policyId, stageOrder int NOT NULL, reviewerId uuid (nullable), status text NOT NULL default 'pending', reviewedAt ts (nullable), comment text (nullable)`; index on `orgId`. **No `created_at`.**
- `policies :181-200` → `status text NOT NULL default 'draft'` (plain text, not enum), `currentVersion int NOT NULL default 1`.
- `policyVersions :223-251`; `notifications :152-162` (exists); `users :296-326` (`role text NOT NULL default 'employee'`).
- File header currently: "14 tables: 12 tenant-scoped + 2 service-role aux" → becomes **15 tables: 13 tenant-scoped + 2 aux**.

**State machine (`lib/policies/state-machine.ts`):** `PolicyStatus = 'draft'|'under_review'|'published'|'archived'` `:7`; `ALLOWED_TRANSITIONS.draft = ['under_review','published']` `:23` (direct allowed — gated at app layer, machine unchanged); `IllegalTransitionError :33`.

**Transitions (`lib/policies/transitions.ts`):**
- `getAdminOrgContext() :64-68` = `getOrgContext()` + `requireAdminFromCtx(ctx)`.
- `loadAndAssertTransition(s, policyId, to) :81-99` → `Policies.findById`, throws `PolicyNotFoundError`/`IllegalTransitionError`; returns `{id,status,currentVersion,contentJson}`.
- `submitForReview(policyId, reviewerId: string|null) :106-124` → `loadAndAssertTransition(...,'under_review')` + `WorkflowStages.recordSubmission(s, policyId, reviewerId)` + `s.tx.update(policies).set({status:'under_review',...})`.
- `approve(policyId) :133-135` → `{ await publish(policyId); }` (literal alias).
- `reject(policyId,_reason) :141-152` → admin-scoped `under_review→draft`.
- `publish(policyId: PolicyId) :166-229` → `getAdminOrgContext()` → `withOrgScope(ctx, async (s) => { const policy = await loadAndAssertTransition(s, policyId, 'published'); /* GATE INSERTION POINT — line 169, before PolicyVersions.create */ await PolicyVersions.create(...); await s.tx.update(policies).set({status:'published',...}); })` then post-commit `generateSummaryForPolicy`.
- `WorkflowStages` imported `:42`, used only in `submitForReview :118`.

**Auth / scope:**
- `Role = 'admin'|'reviewer'|'employee'` `context.ts:35`; `reviewer` already end-to-end (`asRole :55-58`, Clerk `asAppRole`).
- `OrgContext = {orgId,userId (internal UUIDs), clerkOrgId, clerkUserId, role}` `context.ts:36-46`; `getOrgContext() :93-174`.
- `withOrgScope(ctx, fn) scoped.ts:41-67` — opens `db.transaction`, `SET LOCAL ROLE authenticated`, injects `request.jwt.claims = {sub: ctx.userId, org_id: ctx.orgId, role}`; `OrgScope = OrgContext & {tx}`; writes via `s.tx.insert/update` (**no `s.tx.run()`**).
- `requireAdminFromCtx(ctx) require-admin.ts:56-60` → throws `ForbiddenError('admin role required')`. `requireAdmin() :26-30` → page-gate, `notFound()` on non-admin.
- `ForbiddenError(reason) auth/errors.ts:223-229` (extends `BootstrapError`).

**Repositories (`lib/db/repositories/workflow_stages.ts`):**
- `recordSubmission(s, policyId: PolicyId, reviewerId: string|null) :52-66` — **WIRED**. Inserts `{orgId, policyId, stageOrder:1, reviewerId, status:'pending'}`.
- `recordDecision(s, stageId: string, decision:'approved'|'rejected', comment?) :74-93` — **DEAD**. `update set {status, comment, reviewedAt: now()} where org_id + id=stageId`.
- `listPendingForReviewer(s, reviewerId: string) :33-43` — **DEAD**. `where org_id + reviewerId + status='pending'`.
- `listForPolicy(s, policyId: PolicyId) :101-111`, `listAll(s) :27-31` — **DEAD**.

**Tier / errors:**
- `checkTierLimit(orgId, feature) products.ts:206-235` → non-throwing `{allowed, limit, current}`; for a boolean feature `allowed = TIER_LIMITS[tier][feature]`. **Use this** for the publish gate (clean Starter skip).
- `requireTierLimit(orgId, feature) :245-263` → throws `TierLimitExceededError(feature, limit, current, statusCode 429|403, requiredTier?)` (`stripe/errors.ts:25-40`); 403 for boolean (tier-bound) features.
- `TIER_LIMITS.approvalWorkflows` = Starter `false`, Growth `true`, Business `true` (`products.ts:48,57,69`).
- `PolicyDomainError` abstract base + `PolicyDomainErrorCode` union (`policies/errors.ts:51-70`); concrete subclasses carry `public readonly policyId` + literal `code` + `this.name`. **`check-error-discipline.ts` forbids raw `Error` subclasses in `lib/policies/**`** → new error MUST extend `PolicyDomainError`.

**Admin action wiring (`app/(admin)/policies/[id]/actions.ts`):**
- `handleTransitionError(err) :115-120` → maps **only** `IllegalTransitionError`; **rethrows everything else** (→ Next.js 500). **Must extend** to also map `WorkflowIncompleteError` and `TierLimitExceededError`.
- `submitForReviewAction :137-167` already validates `reviewerId` (nullable UUID) → `submitForReview(policyId, reviewerId)`.
- `approveAction :170-183` → `approve()`; `publishAction :203-216` → `publish()`. Both route errors through `handleTransitionError`.
- `revalidateAfter(policyId) :128-132` → `/policies`, `/policies/[id]`, `/dashboard`.

**Migrations / gates:**
- Canonical RLS (since `0008`): `USING (org_id::text = (SELECT auth.jwt()->>'org_id'))`. Mirror `0011_qa_citation_grants.sql` (CREATE TABLE → FKs → indexes → `ENABLE ROW LEVEL SECURITY` → `CREATE POLICY "org_isolation" FOR ALL USING (...)` → `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated`). Drizzle does **not** emit RLS/GRANT — hand-append.
- GRANT note (`0001:65-73`): GRANT includes UPDATE+DELETE for RLS symmetry; append-only is enforced at the **app layer** (ADR-018), not DB `REVOKE`/`FORCE RLS`.
- `check-rls.ts` `TENANT_TABLES :35-48` (12 tables) + two TRUNC lists (`:92-107` seed, `:191` cleanup) — add `review_decisions`; bump the "12 tenant-scoped tables" comment.
- `check-acknowledgment-immutability.ts` `IMMUTABLE_TABLES :46-49` (`acknowledgments`, `qaCitationGrants`) + `RAW_SQL_PATTERN :71-72` (table names hardcoded in BOTH alternations) + `--self-test` requires the fixture to trip **both** Drizzle `.update` AND raw-SQL for **every** immutable table (`expectedMinimum = IMMUTABLE_TABLES.length * 2`).
- `tests/fixtures/ack-mutation-attempt.ts` — negative-control fixture; add a `.update(reviewDecisions)` + a raw `sql\`DELETE FROM review_decisions\`` so the self-test passes.
- `check-policy-id-brand.ts` `REPO_TARGETS :52-68` pins `workflow_stages.ts: ['recordSubmission','listForPolicy']`; `ORCH_TARGETS :77-92` pins the `transitions.ts` functions. Add the new `review_decisions.ts: ['listForPolicy']` repo target and `recordReviewDecision` orchestrator target (both take `policyId: PolicyId`). `record` uses an object-literal insert input → out of brand scope (ADR-028, like `qa_citation_grants.upsert`).
- Latest migration `0012_billing_state`; `_journal.json` last idx 12 → next tag **`0013_review_decisions`**.

**Tooling:** `db:generate` = `drizzle-kit generate`; `db:migrate:test` applies to the test DB; `check:rls` reads `DATABASE_URL_TEST`. Verify chain: `verify:phase-6` ⊇ `verify:phase-5` ⊇ ... ⊇ `verify:phase-3` (tsc + db-imports + rls + brand + immutability + tests).

**UI:** read-only render = `components/policy/PolicyView.tsx`. Mirror `app/(employee)/layout.tsx` / `app/(admin)/layout.tsx` for `app/(reviewer)/layout.tsx`. (Exact internals to be read at build time before writing — no symbols invented here.)

---

## 4. Data model — `review_decisions` (②b) + event-log/projection

The repo already models single-stage review on `workflow_stages` (a `pending` submission row + a mutable decision). ②b **keeps that as the current-state projection** (so the existing `listPendingForReviewer` queue + `listForPolicy` gate read keep working) **and adds** an append-only `review_decisions` ledger for tamper-evident audit history.

- **`workflow_stages` (unchanged shape, mutable projection):** `recordSubmission` creates `pending`; `recordDecision` flips `status` to `approved`/`rejected` (drives the queue).
- **`review_decisions` (NEW, append-only ledger):** every Approve/Reject appends one immutable row. Never updated/deleted (app-layer `IMMUTABLE_TABLES` + repo exposes insert+select only).
- Both writes happen atomically in the **same** `withOrgScope` transaction (`recordReviewDecision`), so projection and ledger never diverge.
- The **publish gate** reads the projection (`WorkflowStages.listForPolicy`) for the completeness decision; the **ledger** is the immutable evidence + the audit-view data source. (They are written atomically; reading either is equivalent. Reading the projection reuses an existing seam → minimal new code.)

### Migration `0013_review_decisions.sql` (additive, NON-destructive)

```sql
-- drizzle/0013_review_decisions.sql
-- Phase 9 (R-017) D-09-01 — append-only reviewer-decision audit ledger.
-- Operator-approved §13(a)=②b 2026-06-04 (session 16), decision D-09-01.
-- ADDITIVE ONLY — new table; no existing column/constraint/table/data modified.
-- Append-only is enforced at the APP layer (ADR-018): ReviewDecisions repo
-- exposes insert+select only; review_decisions is added to IMMUTABLE_TABLES
-- (scripts/check-acknowledgment-immutability.ts). DB GRANT keeps UPDATE/DELETE
-- for RLS symmetry (mirrors acknowledgments / qa_citation_grants; 0001:65-73).
-- RLS predicate uses the post-0008 wrapped (SELECT auth.jwt()->>'org_id') form.

CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_stage_id_workflow_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "review_decisions_org_id_idx" ON "review_decisions" USING btree ("org_id");
--> statement-breakpoint
CREATE INDEX "review_decisions_policy_id_idx" ON "review_decisions" USING btree ("policy_id");
--> statement-breakpoint

-- RLS + GRANT (hand-written; Drizzle does not emit). Wrapped form per 0008.
ALTER TABLE "review_decisions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "org_isolation" ON "review_decisions"
  FOR ALL USING (org_id::text = (SELECT auth.jwt()->>'org_id'));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "review_decisions" TO authenticated;
```

> `decision` stays a plain `text` column (no DB CHECK) to **match the `workflow_stages.status` precedent**; the `'approved'|'rejected'` union is enforced at the app layer (repo signature). A CHECK is a possible additive hardening but is intentionally omitted for precedent-consistency.

Drizzle `schema.ts` adds `reviewDecisions` (alphabetical, between `qaCitationGrants` and `stripeEvents`) carrying its own `org_id NOT NULL` (D-02). Run `pnpm db:generate` to emit the table DDL, then hand-append the RLS+GRANT block (the established 0011 workflow); verify the generated DDL matches the above before committing.

---

## 5. State machine & publish-leak closure (gate b + c)

**No new `PolicyStatus`, no `markApproved`.** "Approved/complete" is computed, never stored.

**Gate inside `publish()` at `transitions.ts:169`** (immediately after `loadAndAssertTransition(s, policyId, 'published')`, inside `withOrgScope`, before `PolicyVersions.create`):

```ts
// Phase 9 (R-017, D-09-01) — tier-aware approval-workflow completeness gate.
// Leak-proof: lives INSIDE publish() so it also covers approve() (alias).
const wf = await checkTierLimit(s.orgId, 'approvalWorkflows'); // non-throwing read
if (wf.allowed) {
  // Growth+ : approval workflow REQUIRED (gate c = require submission first).
  // (i) Direct draft→published is blocked — must publish FROM under_review.
  //     This ALSO closes the stale-approval leak: a restored+edited policy is
  //     'draft', so an OLD approved stage from a prior cycle cannot satisfy
  //     the gate; the admin must resubmit (draft→under_review→approve).
  if (policy.status !== 'under_review') {
    throw new WorkflowIncompleteError(policyId, 0, 0);
  }
  // (ii) The current cycle must be approved with nothing pending.
  const stages = await WorkflowStages.listForPolicy(s, policyId);
  const pending = stages.filter((st) => st.status === 'pending').length;
  const approved = stages.filter((st) => st.status === 'approved').length;
  if (pending > 0 || approved < 1) {
    throw new WorkflowIncompleteError(policyId, pending, approved);
  }
}
```

- **Starter (`wf.allowed === false`):** gate skipped entirely — direct publish unchanged. No 403, no regression.
- **Why `status === 'under_review'` is load-bearing (the stale-approval fix):** `submitForReview` is the **only** path to `under_review` and always inserts a fresh `pending` stage; `canTransition('under_review','under_review') === false`, so a policy can't be re-submitted while already under review (exactly one cycle's stages exist in `under_review`). A restore goes `archived→draft` (not `under_review`), so a previously-approved-then-restored policy is `draft` and the `status` check forces a fresh submission. Without this check, "any approved, no pending" over all-time stages would let a restored+edited policy republish on a stale approval. **This refines operator gate (c) — confirm in §13a.**
- Gate covers **both** `publishAction`→`publish()` and `approveAction`→`approve()`→`publish()` (`:134`). State machine module is **unchanged**.

---

## 6. Reviewer decision orchestrator + repository

**`recordReviewDecision`** (new, `lib/policies/transitions.ts`) — reviewer-or-admin scope; single transaction:

```ts
export async function recordReviewDecision(
  policyId: PolicyId,
  stageId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
): Promise<void> {
  const ctx = await getReviewerOrAdminOrgContext(); // new helper (mirrors getAdminOrgContext)
  await withOrgScope(ctx, async (s) => {
    await WorkflowStages.recordDecision(s, stageId, decision, comment); // projection
    await ReviewDecisions.record(s, {            // immutable ledger (append-only)
      policyId, stageId, reviewerId: s.userId, decision, comment: comment ?? null,
    });
    if (decision === 'rejected') {
      await loadAndAssertTransition(s, policyId, 'draft'); // under_review→draft (allowed)
      await s.tx.update(policies)
        .set({ status: 'draft', updatedAt: sql`now()` })
        .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
    }
  });
}
```

- On **approve**: stage→`approved`, ledger appended; policy **stays** `under_review` (admin publishes separately — gate now passes).
- On **reject**: stage→`rejected`, ledger appended, policy→`draft` (admin edits + resubmits).
- `getReviewerOrAdminOrgContext()` = `getOrgContext()` + `requireReviewerOrAdminFromCtx(ctx)`.

**`ReviewDecisions` repository** (`lib/db/repositories/review_decisions.ts`) — append-only:
```ts
export const ReviewDecisions = {
  record: (s, input: { policyId: PolicyId; stageId: string; reviewerId: string;
                       decision: 'approved'|'rejected'; comment: string|null }) =>
    s.tx.insert(reviewDecisions).values({ orgId: s.orgId, ...input }).returning(),
  listForPolicy: (s, policyId: PolicyId) =>
    s.tx.select().from(reviewDecisions)
      .where(and(eq(reviewDecisions.orgId, s.orgId), eq(reviewDecisions.policyId, policyId)))
      .orderBy(desc(reviewDecisions.decidedAt)),
};
```
- **No `update`/`delete` keys** (append-only — type-system + `IMMUTABLE_TABLES` lock).
- `listForPolicy` keeps `policyId: PolicyId` (add to `check-policy-id-brand.ts` REPO_TARGETS). `record`'s object input is schema-inferred → out of brand scope (ADR-028).

---

## 7. Roles & guards (gate d = allow self-approval)

- **Reuse the existing `reviewer` role** (no edit to `Role`/`asAppRole`).
- **New `lib/auth/require-reviewer.ts`** (mirror `require-admin.ts`):
  - `requireReviewerOrAdmin(): Promise<OrgContext>` — page-gate; `notFound()` for non-(reviewer|admin) (the "advertise nothing" 404, like `requireAdmin()`), used by `app/(reviewer)/layout.tsx`.
  - `requireReviewerOrAdminFromCtx(ctx): void` — throws `ForbiddenError('reviewer or admin role required')` unless role ∈ {reviewer, admin}.
  - (Optionally `requireReviewerFromCtx` if a reviewer-only action emerges; MVP only needs the or-admin variants.)
- **Allow self-approval (gate d):** **no** submitter≠reviewer check. An admin assigned as reviewer may approve their own submission. No new error class. (Documented limitation; revisitable as a fast-follow if audit posture demands separation of duties.)
- Reviewer users are provisioned by Clerk `publicMetadata.role = 'reviewer'` (existing webhook mirror). No schema change.

---

## 8. Server actions, API & submit entitlement

All actions follow the canonical shape: `getOrgContext()` → `requireXFromCtx(ctx)` → `withOrgScope(ctx, async (s) => { ...s.tx... })` → `revalidatePath`. No `OrgScope`-as-first-arg, no `s.tx.run()`.

| Action (new) | Location | Guard | Body |
|---|---|---|---|
| `approveStageAction(prev, formData)` | `app/(reviewer)/.../actions.ts` | `requireReviewerOrAdminFromCtx` | parse `policyId`(branded)+`stageId`(uuid)+`comment` → `recordReviewDecision(policyId, stageId, 'approved', comment)` → revalidate `/reviewer` (+ `/reviewer/[policyId]`) |
| `rejectStageAction(prev, formData)` | same | `requireReviewerOrAdminFromCtx` | same → `recordReviewDecision(policyId, stageId, 'rejected', comment)` (orchestrator resets policy→draft) → revalidate |
| queue read | `app/(reviewer)/page.tsx` (server component) | `requireReviewerOrAdmin` | `withOrgScope(ctx, (s) => WorkflowStages.listPendingForReviewer(s, ctx.userId))` |

- Reviewer actions return the same `ActionState = {ok:true}|{ok:false;error}` shape as the admin actions; validate `stageId` as a UUID at the boundary (mirror `OptionalReviewerIdSchema`), `policyId` via `PolicyIdSchema`.

**Submit entitlement (item 9 / validation-gate Starter-403):** add to `submitForReview` (orchestrator) — keeps the legacy Starter `under_review` staging open, gates only the **reviewer-assignment** (the actual Growth+ feature):
```ts
// inside submitForReview, after getAdminOrgContext, before/within scope:
const wf = await checkTierLimit(ctx.orgId, 'approvalWorkflows');
if (!wf.allowed && reviewerId !== null) {
  // Starter trying to use the Growth+ reviewer-assignment feature → 403 upgrade.
  await requireTierLimit(ctx.orgId, 'approvalWorkflows'); // throws TierLimitExceededError(403, requiredTier:'growth')
}
if (wf.allowed && reviewerId === null) {
  // Growth+ must assign a reviewer (else the pending stage is unassignable
  // and publish() blocks forever). UI requires selection; orchestrator enforces.
  throw new WorkflowIncompleteError(policyId, 0, 0); // "assign a reviewer before submitting"
}
```
- Starter, `reviewerId === null`: unchanged legacy behavior (under_review staging).
- Net trust-boundary note: `reviewerId` is already validated as a nullable UUID in `submitForReviewAction :144-159`.

**`handleTransitionError` extension (`actions.ts:115-120`)** — add two arms (it currently rethrows non-`IllegalTransitionError`):
```ts
function handleTransitionError(err: unknown): ActionState {
  if (err instanceof IllegalTransitionError) return { ok: false, error: err.message };
  if (err instanceof WorkflowIncompleteError) return { ok: false, error: err.message }; // 409/422 semantics, NOT an upgrade
  if (err instanceof TierLimitExceededError)  return { ok: false, error: 'Approval workflows require the Growth plan — upgrade at /pricing.' };
  throw err;
}
```
(import `WorkflowIncompleteError` from `@/lib/policies/errors`, `TierLimitExceededError` from `@/lib/stripe/errors`.)

---

## 9. `WorkflowIncompleteError`

Add to `lib/policies/errors.ts` (extends `PolicyDomainError` — the `check-error-discipline.ts` gate forbids raw `Error` subclasses in `lib/policies/**`). Add `'WORKFLOW_INCOMPLETE'` to the `PolicyDomainErrorCode` union (`:51-55`).

```ts
export class WorkflowIncompleteError extends PolicyDomainError {
  readonly code = 'WORKFLOW_INCOMPLETE';
  constructor(
    public readonly policyId: string,
    public readonly pending: number,
    public readonly approved: number,
  ) {
    super(`Policy workflow incomplete: ${policyId} (pending=${pending}, approved=${approved})`);
    this.name = 'WorkflowIncompleteError';
  }
}
```
- Surfaced as a clean toast ("This policy still needs reviewer approval before publishing"), **never** a 403/upgrade. `policyId` in the message is acceptable (user already has it from URL); `orgId`/`userId` never appear (info-disclosure boundary, mirrors the existing domain errors).

---

## 10. Reviewer UI

`app/(reviewer)/` route group (mirror `(admin)`/`(employee)` conventions — internals read at build time, no invented symbols):
- `layout.tsx` — `requireReviewerOrAdmin()` page-gate; reviewer shell (no admin-only links).
- `page.tsx` — pending-review queue (shadcn Table): policy title, submitted, reviewer, action link. From `listPendingForReviewer(s, ctx.userId)`.
- `[policyId]/page.tsx` — detail: **read-only render via `components/policy/PolicyView.tsx`** of the policy draft, existing `comment`, a comment field, **Approve / Reject** buttons → `approveStageAction`/`rejectStageAction` (carry `policyId` + the pending `stageId`).
- **Post-sign-in routing** (`app/(auth)/post-sign-in/page.tsx:85-86`): add `if (ctx.role === 'reviewer') redirect('/reviewer');` before the `/my-policies` fallback (admin→`/dashboard` stays first).
- Middleware: confirm `(reviewer)` paths are authenticated (read `middleware.ts` at build; add a reviewer route matcher if admin paths are pattern-gated there).

---

## 11. Notifications — DEFERRED to Phase 7

MVP builds **no** email, **no** Railway worker. Optional: write an in-app row to the **existing** `notifications` table (`schema.ts:152-162`) on submit/decision (`type`, `payloadJson`). Do **not** create a new notifications table.

---

## 12. Append-only / audit wiring (②b)

`review_decisions` is append-only at the **app layer** (ADR-018):
- `ReviewDecisions` repo exposes **insert + select only** (no `update`/`delete` keys).
- Add `{ symbolName: 'reviewDecisions', sqlName: 'review_decisions' }` to `IMMUTABLE_TABLES` (`check-acknowledgment-immutability.ts:46-49`).
- Extend `RAW_SQL_PATTERN` (`:71-72`) to include `review_decisions` in **both** capture alternations.
- Extend `tests/fixtures/ack-mutation-attempt.ts` with a `.update(reviewDecisions)` and a raw `sql\`DELETE FROM review_decisions ...\`` so `--self-test` (`expectedMinimum = 3*2 = 6`, both paths per table) passes.
- DB keeps standard `SELECT,INSERT,UPDATE,DELETE` grants (RLS symmetry); **no** DB `REVOKE`/`FORCE RLS` (BD-05).
- Optionally add `tests/types.ts` `@ts-expect-error` invariants proving `ReviewDecisions` has no `update`/`delete` (mirror the acknowledgments lock) — confirm at build whether the gate suite expects it.

---

## 13. ASK-FIRST status

**Gates (a)-(d): SIGNED OFF (D-09-01, 2026-06-04).** Migration `0013` is **additive** (new table) — the §13(a)=②b approval covers the schema change; it is **not** destructive (no DROP/REVOKE/NOT-NULL-on-existing), so no destructive-migration ceremony is required, but the migration header records the approval + decision ID per migration discipline.

**Two derived refinements to confirm (within the spirit of the signed gates — flag, don't re-litigate):**
- **(13a-i)** The **stale-approval fix**: gate also requires `policy.status === 'under_review'` (direct `draft→published` blocked for Growth+). This is the correct reading of gate (c) "require submission first" and is necessary to close the restore+edit republish leak. **Default: include it.**
- **(13a-ii)** **Submit semantics**: Starter `+ reviewerId` → 403 upgrade; Growth+ `+ null reviewer` → `WorkflowIncompleteError` ("assign a reviewer"); Starter `+ null` → unchanged legacy `under_review`. **Default: as written.**

If the operator is silent on 13a, build proceeds with the defaults above.

---

## 14. File-change manifest

**New files:**
- `drizzle/0013_review_decisions.sql` (+ `drizzle/meta/_journal.json` idx 13 entry via `db:generate`/migrate)
- `lib/db/repositories/review_decisions.ts`
- `lib/auth/require-reviewer.ts`
- `app/(reviewer)/layout.tsx`, `app/(reviewer)/page.tsx`, `app/(reviewer)/[policyId]/page.tsx`, `app/(reviewer)/[policyId]/actions.ts` (or a shared `app/(reviewer)/actions.ts`)
- Possibly `app/(reviewer)/review-decision-form.tsx` (client form for Approve/Reject, mirrors existing `use client` form components)

**Edited files:**
- `lib/db/schema.ts` — add `reviewDecisions` table + header count.
- `lib/policies/transitions.ts` — publish() gate; `recordReviewDecision`; `getReviewerOrAdminOrgContext`; import `checkTierLimit`, `ReviewDecisions`, `WorkflowIncompleteError`; submit entitlement in `submitForReview`.
- `lib/policies/errors.ts` — `WorkflowIncompleteError` + union member.
- `app/(admin)/policies/[id]/actions.ts` — extend `handleTransitionError` (2 arms).
- `app/(auth)/post-sign-in/page.tsx` — reviewer redirect.
- `scripts/check-rls.ts` — add `review_decisions` to `TENANT_TABLES` + 2 TRUNC lists + comment.
- `scripts/check-acknowledgment-immutability.ts` — `IMMUTABLE_TABLES` + `RAW_SQL_PATTERN`.
- `tests/fixtures/ack-mutation-attempt.ts` — 2 new `review_decisions` violation fns.
- `scripts/check-policy-id-brand.ts` — `REPO_TARGETS` + `ORCH_TARGETS` additions.
- `middleware.ts` — reviewer route matcher (confirm at build).
- Tests: extend `lib/policies/transitions.test.ts` (gate paths), add reviewer-action + repository tests as the phase plan specifies.

---

## 15. Verification gate (build → PR)

1. `pnpm db:generate` → confirm emitted `0013` table DDL matches §4 → hand-append RLS+GRANT.
2. `pnpm db:migrate:test` (test DB) → `pnpm check:rls` (13 tenant tables isolate; positive control passes).
3. `pnpm tsc --noEmit` (zero errors; no `any`).
4. `pnpm check:acknowledgment-immutability` + `:self-test` (3 immutable tables, both paths).
5. `pnpm check:policy-id-brand`, `check:error-discipline`, `check:db-imports`, `check:admin-routes`, `check:auth-context`.
6. `pnpm test` (unit) + targeted transition/reviewer tests.
7. `pnpm build` (Next.js) — `(reviewer)` route group compiles.
8. `pnpm verify:phase-6` green (full chain) before PR. **No** staging/prod migrate. Operator merges.

> Test-DB dependency: steps 2/6 need `DATABASE_URL_TEST` reachable (local Supabase/Postgres). If the test DB isn't up at verify time, surface it to the operator — do not fabricate a pass.

---

## 16. Acceptance (UAT) — expand in plan-phase

- **Starter:** `draft→published` directly, unaffected (gate skipped). Submitting *with* a reviewer → 403 + `/pricing`.
- **Growth, happy path:** `submitForReview(reviewer)` → reviewer sees it in `/reviewer` → approve (stage approved, ledger row, policy stays under_review) → admin `publish()` succeeds.
- **Growth, reject:** reviewer rejects → ledger row, policy→draft, publish blocked.
- **Growth, submitted-not-approved:** `publish()` throws `WorkflowIncompleteError` (clean toast, not upgrade).
- **Growth, stale-approval (regression):** publish an approved policy → archive → restore → edit → `publish()` directly throws `WorkflowIncompleteError` (status≠under_review); must resubmit.
- **Append-only:** `review_decisions` rows never mutated; `check:acknowledgment-immutability` + self-test green with 3 tables.
- **Multi-tenancy:** reviewer in Org A never sees Org B's queue or ledger (`reviewerId`+`orgId` app filter + org RLS; `check:rls` covers `review_decisions`).
- `tsc` clean; no new deps.

---

*Authored s16 2026-06-04 on `gsd/phase-9-reviewer`. §13 gates signed off (D-09-01). Migration `0013` DDL + gate logic checkpointed with operator before code lands.*
