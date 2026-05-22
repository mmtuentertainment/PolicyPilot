# Phase 4: AI Layer - Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 41 (29 NEW + 12 MODIFY) + 3 SQL migrations + Wave-0 test stubs
**Analogs found:** 41 / 41 (100% — every Phase 4 file has a Phase 2/3 ship as analog)

Phase 4 is a thin orchestrator layer; every new file follows a Phase 2/3 ship pattern. The single CRITICAL drift requiring zero-analog innovation is the SDK→SPEC enum translator in `app/api/ai/consistency/[batchId]/route.ts` (no existing route handler reads from an external SDK with an internal enum to translate to).

---

## File Classification

### lib/ai/* (NEW — AI foundation)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/ai/client.ts` | service (singleton) | request-response | `lib/db/index.ts` | role-match (server-only lazy singleton) |
| `lib/ai/models.ts` | config (constants) | n/a | `app/(admin)/policies/new/actions.ts` `POLICY_CATEGORIES` | role-match |
| `lib/ai/cache.ts` | utility | transform | `lib/policies/state-machine.ts` `ALLOWED_TRANSITIONS` | role-match (pure const + builder) |
| `lib/ai/prompts.ts` | config (verbatim text) | n/a | `app/(admin)/policies/new/actions.ts` `POLICY_CATEGORIES` | role-match |
| `lib/ai/qa-parser.ts` | utility | transform | `lib/policies/state-machine.ts` `canTransition` + `IllegalTransitionError` | role-match (pure transform + warn-log) |
| `lib/ai/qa-extract.ts` | utility | transform | `components/policy/PolicyView.tsx` (generateHTML usage) | exact (server-side TipTap render) |
| `lib/ai/extract.ts` | utility | transform | `lib/policies/transitions.ts` `loadAndAssertTransition` helper | role-match (pure helper + typed throw) |
| `lib/ai/schemas.ts` | config (Zod schemas) | transform | `app/(admin)/policies/new/actions.ts` `CreatePolicySchema` block | exact |
| `lib/ai/summary.ts` | service (orchestrator) | request-response | `lib/policies/transitions.ts` `publish()` | role-match (withOrgScope orchestrator) |
| `lib/ai/responses.ts` (optional) | utility | transform | `lib/auth/bootstrap-errors.ts` `matchesErrorClass` | role-match (pure response helper) |

### lib/stripe/* (NEW — tier enforcement)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/stripe/products.ts` | service + config | request-response | `lib/db/repositories/policies.ts` (OrgScope-first methods) + `lib/policies/state-machine.ts` (`ALLOWED_TRANSITIONS` table) | role-match (constants + predicates) |
| `lib/stripe/errors.ts` | typed-error class | n/a | `lib/auth/errors.ts` (entire file) + `lib/policies/state-machine.ts:IllegalTransitionError` | exact |

### lib/db/* (NEW + MODIFY)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/db/repositories/batch_jobs.ts` (NEW) | repository | CRUD | `lib/db/repositories/policy_versions.ts` | exact (append-mostly per-aggregate repo) |
| `lib/db/repositories/ai-generations.ts` (MODIFY) | repository | CRUD | `lib/db/repositories/policies.ts` (`listWithFilters`/`statusCounts` shape) | exact |
| `lib/db/repositories/policies.ts` (MODIFY — add `listPublishedForOrg` + `updateSummary`) | repository | CRUD | `lib/db/repositories/policies.ts:78-160` (existing methods on same file) | exact (extend in-place) |
| `lib/db/schema.ts` (MODIFY — add `batchJobs` table + widen `aiGenerations`) | schema | n/a | `lib/db/schema.ts:54-64` (`aiGenerations` current shape) + `policyVersions` block at lines 139-164 | exact |

### app/api/ai/* (NEW — route handlers)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/ai/draft/route.ts` | controller | request-response | `app/api/webhooks/clerk/route.ts` (POST with auth + try/catch + structured-log) + `app/(admin)/policies/new/actions.ts` (Zod parse + withOrgScope + repository call) | role-match (composite — webhook handler is the only existing route.ts but is service-role; Server Action analog supplies the auth + withOrgScope shape) |
| `app/api/ai/summary/route.ts` | controller | request-response | Same as `draft/route.ts` + `lib/policies/transitions.ts:publish()` (post-commit graceful-degrade pattern) | role-match |
| `app/api/ai/qa/route.ts` | controller | request-response | Same as `draft/route.ts` (minus `requireAdmin`) | role-match |
| `app/api/ai/consistency/route.ts` (POST submit) | controller | request-response | Same as `draft/route.ts` + tier-403 path | role-match |
| `app/api/ai/consistency/[batchId]/route.ts` (GET poll) | controller | request-response | `app/(admin)/policies/[id]/page.tsx` (params destructuring) + this phase introduces the SDK→SPEC translator with no analog (RESEARCH-flagged drift) | partial-match (translator is net-new code) |

### app/(admin)/dashboard/consistency/* (NEW — admin runner page)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(admin)/dashboard/consistency/page.tsx` | Server Component shell | request-response | `app/(admin)/dashboard/page.tsx` (W7 race-recovery branching) + `app/(admin)/policies/[id]/page.tsx` (Server Component + withOrgScope + branch on data) | exact |
| `components/admin/ConsistencyCheckRunner.tsx` | Client Component | polling | `components/policy/PolicyTransitionMenu.tsx` (`'use client'` + `useState` + `useTransition` + Dialog) | role-match (no existing setInterval pattern in repo) |
| `components/admin/ConsistencyFindingsList.tsx` | Client/Server Component | render | `components/policy/PolicyVersionHistory.tsx` (Server Component list with empty-state branch) | role-match |
| `components/admin/ConsistencyEmptyState.tsx` | Server Component | render | `app/(admin)/policies/page.tsx` empty-state Card (lines 135-152) | exact |
| `components/admin/ConsistencyFailureState.tsx` | Server Component | render | Same as empty-state Card | exact |

### components/policy/* (NEW)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `components/policy/PolicyAiDraftDialog.tsx` (NEW — Client Component sibling) | Client Component | request-response | `components/policy/PolicyTransitionMenu.tsx` (Dialog + form onSubmit + useTransition + invoke pattern; lines 213-339) + `components/policy/CreatePolicyForm.tsx` (Select for POLICY_CATEGORIES; lines 87-106) | exact (composite — Dialog from TransitionMenu, Select from CreatePolicyForm) |
| `components/policy/PolicyRegenerateTldrButton.tsx` (NEW — Client Component sibling) | Client Component | request-response | `components/policy/PolicyHeaderActions.tsx` (Client wrapper with router.refresh after Server Action) | role-match |

### Migrations (drizzle/*.sql)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `drizzle/0005_initial_batch_jobs.sql` (Drizzle-generated) | migration | n/a | `drizzle/0000_initial.sql` (CREATE TABLE blocks) | exact |
| `drizzle/0006_rls_batch_jobs.sql` (hand-written) | migration | n/a | `drizzle/0001_rls_policies.sql` (RLS + GRANT pattern, per-table; lines 47-51 for the policies block) | exact |
| `drizzle/0007_ai_generations_audit_extensions.sql` (combined) | migration | n/a | `drizzle/0004_policy_versions_unique.sql` (combined Drizzle-generated + hand-written with `--> statement-breakpoint`) | exact |

### Scripts (verify gates) — MODIFY existing

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/check-ai-layer.ts` (NEW) | test | integration | `scripts/check-policies-list-filters.ts` (seed two orgs + truncate + withOrgScope) | exact |
| `scripts/check-ai-prompts.ts` (NEW — ts-morph) | test | static-analysis | `scripts/check-policy-id-brand.ts` (ts-morph AST walker with hardcoded targets) | exact |
| `scripts/check-error-discipline.ts` (MODIFY — widen scope to `lib/stripe/`) | test | static-analysis | `scripts/check-error-discipline.ts:87-98` (file-glob array — one-line addition) | exact (extend in-place) |
| `scripts/check-rls.ts` (MODIFY — add batch_jobs cross-org case) | test | integration | `scripts/check-rls.ts:34-45` (`TENANT_TABLES` array — append entry) | exact (extend in-place) |
| `scripts/check-artifacts.ts` (MODIFY — Phase 4 file rows) | test | static-analysis | `scripts/check-artifacts.ts:1108-1156` (Phase 3 scaffold check block) | exact (extend in-place) |

### Tests (Wave 0 — 17 new files per VALIDATION.md)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/policies/transitions.test.ts` (MODIFY — add SP-3 graceful-degrade) | test | unit | `lib/policies/transitions.test.ts` (entire file) | exact (extend in-place) |
| `lib/ai/client.test.ts` (NEW) | test | unit | `lib/auth/require-admin.test.ts` | role-match |
| `lib/ai/qa-parser.test.ts`, `qa-extract.test.ts`, `schemas.test.ts` (NEW) | test | unit | `lib/policies/state-machine.test.ts` + `tests/smoke.test.ts` | role-match (pure-unit pattern) |
| `lib/ai/summary.test.ts` (NEW) | test | unit | `lib/policies/transitions.test.ts` (orchestrator mocks + withOrgScope mock at lines 39-59) | exact |
| `lib/stripe/products.test.ts` (NEW) | test | unit | `lib/auth/bootstrap-errors.test.ts` (typed-error class test) + transitions.test.ts | role-match |
| `app/api/ai/*/route.test.ts` (5 NEW) | test | unit | `lib/policies/transitions.test.ts` (entire mock + assertion shape) | role-match |
| `components/policy/PolicyAiDraftDialog.test.tsx`, `components/admin/ConsistencyCheckRunner.test.tsx` (NEW) | test | unit (jsdom) | `components/policy/PolicyEditor.test.tsx` | exact |
| `app/(admin)/dashboard/consistency/page.test.tsx` (NEW) | test | unit | (no existing Server-Component page test — `app/(admin)/dashboard/page.tsx` has no test); analog = `transitions.test.ts` mock-and-assert | partial-match |
| `tests/types.ts` (MODIFY — D-43 citation compile-time assertion) | test | compile-time | `tests/types.ts:60-64` (PolicyId brand assertion block) | exact (extend in-place) |

### Reference docs (MODIFY — frozen contract amendments)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `reference/PROMPTS.md` (MODIFY — D-10 citation fence + D-31 injection guard) | doc | n/a | n/a (frozen-contract amendment) | n/a |
| `reference/API-SPEC.md` (MODIFY — D-27 citations shape) | doc | n/a | n/a | n/a |
| `reference/SCHEMA.md` (MODIFY — D-29 batch_jobs + D-35 ai_generations widening) | doc | n/a | n/a | n/a |

### Misc MODIFY

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` (add `@anthropic-ai/sdk` + `verify:phase-4` script) | config | n/a | `package.json:33` (existing `verify:phase-3` shape) | exact |
| `.env.local.example` (add `ANTHROPIC_API_KEY=`) | config | n/a | `.env.local.example` (entire file; verified by `scripts/check-artifacts.ts:198-244`) | exact |
| `lib/auth/require-admin.ts` (D-45 — `notFound()` → `ForbiddenError`) | auth | request-response | `lib/auth/context.ts` (typed throws from BootstrapError hierarchy) | exact |
| `lib/auth/errors.ts` (D-45 — add `ForbiddenError extends BootstrapError`) | typed-error class | n/a | `lib/auth/errors.ts:60-91` (existing classes like `NotAuthenticatedError`) | exact (extend in-place) |
| `lib/policies/transitions.ts` (D-19 — modify `publish` for post-commit summary) | service | request-response | `lib/policies/transitions.ts:151-172` (existing `publish()` body) | exact (modify in-place) |
| `components/policy/PolicyEditor.tsx`, `PolicyView.tsx` (render sibling components) | component | render | Existing files — only modify to render sibling Client Components | exact (sibling-add only) |
| `components/admin/AdminSidebar.tsx` (D-20 — add Consistency nav entry) | component | render | `components/admin/AdminSidebar.tsx:65-74` (existing `/policies` nav item) | exact (extend in-place) |

---

## Pattern Assignments

### lib/ai/client.ts (service, request-response)

**Analog:** `lib/db/index.ts` (lazy-init server-only singleton; not loaded in this session) + the verbatim D-33 body in CONTEXT.md `<amendments>` is the authoritative target.

**Source pattern (CONTEXT.md `<specifics>` lines 253-269 + `<amendments>` D-33 lines 697-712):**

```typescript
// lib/ai/client.ts (D-02 + D-33 combined target)
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  return cached ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    maxRetries: 0,        // SPEC R7 — no auto-retry on 5xx (default would be 2)
    timeout: 25_000,      // 25s per request (default would be 600_000)
  });
}
```

**Server-only convention** (per Pattern 4 in RESEARCH § Common Pitfalls):
- Line 1 MUST be `import 'server-only';` — enforced by Phase 4 extension to `scripts/check-artifacts.ts`.

**Test analog: `lib/auth/require-admin.test.ts` lines 14-30** for the `vi.mock` shape (planner uses `vi.mock('@anthropic-ai/sdk', ...)` for the SDK constructor mock; D-05 pattern is `vi.mock('@/lib/ai/client', () => ({ getAnthropicClient: () => mockClient }))`).

---

### lib/ai/models.ts (config, n/a)

**Analog:** `app/(admin)/policies/new/actions.ts` lines 28-38 (`POLICY_CATEGORIES` constant — single grep target convention).

**Source pattern:**

```typescript
// app/(admin)/policies/new/actions.ts:29-38
const POLICY_CATEGORIES = [
  'HR',
  'Safety',
  'IT',
  'Finance',
  'Operations',
  'Compliance',
  'Legal',
  'Other',
] as const;
```

**Phase 4 target (CONTEXT.md `<specifics>` lines 273-280):**

```typescript
// lib/ai/models.ts (D-04)
import 'server-only';
export const MODEL_SONNET = 'claude-sonnet-4-6' as const;
export const MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const;
export type ModelId = typeof MODEL_SONNET | typeof MODEL_HAIKU;
```

---

### lib/ai/cache.ts (utility, transform)

**Analog:** `lib/policies/state-machine.ts:22-31` (`ALLOWED_TRANSITIONS` const + `canTransition` builder; pure helper, no DB).

**Source pattern (lib/policies/state-machine.ts:22-31):**

```typescript
export const ALLOWED_TRANSITIONS = {
  draft:        ['under_review', 'published'] as const,
  under_review: ['published', 'draft'] as const,
  published:    ['archived', 'draft'] as const,
  archived:     ['draft'] as const,
} satisfies Record<PolicyStatus, readonly PolicyStatus[]>;

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly PolicyStatus[]).includes(to);
}
```

**Phase 4 target** (CONTEXT.md `<specifics>` lines 282-300 + `<amendments>` D-33(b) lines 716-728): const + builder, with `EPHEMERAL_CACHE` + `LONG_CACHE` + matching `buildCachedSystem` / `buildLongCachedSystem`.

---

### lib/ai/prompts.ts (config, n/a)

**Analog:** `app/(admin)/policies/new/actions.ts:29-38` (verbatim const exported as module symbol — same precedent as `POLICY_CATEGORIES`).

**Verbatim-text constraint:** The 4 prompt constants MUST match `reference/PROMPTS.md` body verbatim per SPEC R1 acceptance (40-char anchor substring match). The Q&A prompt gains the D-10 citation fence + D-31 injection guard appended after the verbatim block — both amendments mirrored back into `reference/PROMPTS.md` in the same commit.

**ts-morph gate analog:** `scripts/check-ai-prompts.ts` (NEW) mirrors `scripts/check-policy-id-brand.ts:43-91` (file-targets + AST walker + hardcoded anchor substrings).

---

### lib/ai/qa-parser.ts (utility, transform)

**Analog:** `lib/policies/state-machine.ts:33-40` (`IllegalTransitionError` typed-error class — pure transform module that throws/warns but doesn't touch DB).

**Source pattern (lib/policies/state-machine.ts:33-40):**

```typescript
export class IllegalTransitionError extends Error {
  constructor(public readonly from: PolicyStatus, public readonly to: PolicyStatus) {
    super(
      `Illegal policy transition: ${from} → ${to}. Allowed: ${ALLOWED_TRANSITIONS[from].join(', ')}`,
    );
    this.name = 'IllegalTransitionError';
  }
}
```

**Phase 4 target** (CONTEXT.md `<specifics>` lines 489-513 + `<amendments>` D-41 lines 908-931): tolerant parser that returns `{ answer, citations: [] }` on missing/malformed fence. Stripping-validIds-via-Set MUST come from the same `withOrgScope` closure as the library block (D-41 wiring).

---

### lib/ai/qa-extract.ts (utility, transform)

**Analog:** `components/policy/PolicyView.tsx:16-29` (server-side `generateHTML(content, [StarterKit, Link])` — EXACT match; same imports, same extension allow-list).

**Source pattern (components/policy/PolicyView.tsx:16-29):**

```typescript
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/react';

export function PolicyView({ content }: { content: JSONContent }) {
  const html = generateHTML(content, [StarterKit, Link]);
  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

**Phase 4 target** (RESEARCH § TipTap Server-Side Extraction + D-07/D-31): same import block + add `STRIP_TAGS = /<[^>]+>/g` regex + `COLLAPSE_WHITESPACE = /\s+/g` + `xmlEscape` helper. Returns plain text (not HTML) for embedding in `<policy>` XML element. No JSDOM polyfill needed (zeed-dom is transitive dep of `@tiptap/html`).

---

### lib/ai/extract.ts (utility, transform)

**Analog:** `lib/policies/transitions.ts:68-86` (`loadAndAssertTransition` — pure helper that throws typed Error on negative path).

**Source pattern (lib/policies/transitions.ts:68-86):**

```typescript
async function loadAndAssertTransition(
  s: OrgScope,
  policyId: PolicyId,
  to: PolicyStatus,
): Promise<PolicyRow> {
  const rows = await Policies.findById(s, policyId);
  const row = rows[0];
  if (!row) throw new Error('Policy not found');
  // ...
  if (!canTransition(policy.status, to)) {
    throw new IllegalTransitionError(policy.status, to);
  }
  return policy;
}
```

**Phase 4 target** (CONTEXT.md `<amendments>` D-38 lines 853-865):

```typescript
// lib/ai/extract.ts
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';

export function extractText(response: Anthropic.Messages.Message): string {
  const block = response.content.find(
    (b): b is Anthropic.Messages.TextBlock => b.type === 'text'
  );
  if (!block) throw new Error('Anthropic response contained no text block');
  return block.text;
}
```

---

### lib/ai/schemas.ts (config, transform)

**Analog:** `app/(admin)/policies/new/actions.ts:45-81` (Zod schema block — `.passthrough()`-free `.strict()` per D-42).

**Source pattern (app/(admin)/policies/new/actions.ts:59-81):**

```typescript
const CreatePolicySchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required.')
    .max(200, 'Title must be 200 characters or fewer.'),
  category: z.enum(POLICY_CATEGORIES, {
    errorMap: () => ({ message: 'Category is required.' }),
  }),
  content_json: z
    .string()
    .min(1, 'Policy content is required.')
    .transform((s, ctx) => {
      try {
        return ContentJsonSchema.parse(JSON.parse(s));
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Invalid policy content.',
        });
        return z.NEVER;
      }
    }),
});
```

**Phase 4 target** (CONTEXT.md `<amendments>` D-42 lines 935-951): centralized `.strict()` schemas for Draft/Summary/Qa. AC-33 verifies that extra keys → 400, length-exceed → 400.

---

### lib/ai/summary.ts (service, request-response)

**Analog:** `lib/policies/transitions.ts:151-172` (`publish()` — exact match for the `withOrgScope` orchestrator pattern).

**Source pattern (lib/policies/transitions.ts:151-172):**

```typescript
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const policy = await loadAndAssertTransition(s, policyId, 'published');
    await PolicyVersions.create(s, {
      policyId,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: s.userId,
    });
    await s.tx
      .update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)));
  });
}
```

**Phase 4 target** (CONTEXT.md `<specifics>` lines 426-466 — `generateSummaryForPolicy` body, signature `(policyId: PolicyId, ctx: OrgContext): Promise<void>`):

- Takes `ctx` as parameter (publisher already resolved it; helper opens its OWN `withOrgScope` so the transaction stays inside the AI domain — keeps state-transition atomic and AI side-effects post-commit).
- Idempotent: `if (policy.tldrSummary) return;` short-circuits per SPEC R3.
- Inserts `ai_generations` row + updates `policies.tldrSummary` inside the same `withOrgScope` transaction.

---

### lib/stripe/products.ts (service + config, request-response)

**Analog (constants part):** `lib/policies/state-machine.ts:22-31` (table-driven const + predicate function).
**Analog (predicate part):** `lib/db/repositories/policies.ts:79-101` (`listWithFilters` — async function with OrgScope-style param + DB read).

**Phase 4 target** (CONTEXT.md `<specifics>` lines 330-353 + SPEC R6):

- `TIER_LIMITS` const verbatim from `reference/TIER-LIMITS.md`.
- `PlanTier` type.
- `checkTierLimit(orgId, feature): Promise<{ allowed, limit, current }>` — reads `organizations.planTier` (null → `'starter'` default), counts `ai_generations` rows where `type='draft' AND created_at >= start of UTC month`.
- `requireTierLimit(orgId, feature): Promise<void>` — throws `TierLimitExceededError` on overage; D-15 status-routing (`aiDraftsMonthly|maxUsers` → 429; everything else → 403).

`scripts/check-error-discipline.ts` extension scans `lib/stripe/**.ts(x)` to enforce that every throw uses `TierLimitExceededError` (or another typed class), not bare `throw new Error`.

---

### lib/stripe/errors.ts (typed-error class, n/a)

**Analog:** `lib/auth/errors.ts:60-67` (`NotAuthenticatedError` — `extends Error` + `readonly code` + `this.name`). Same shape as `IllegalTransitionError` (`lib/policies/state-machine.ts:33-40`).

**Source pattern (lib/auth/errors.ts:60-67):**

```typescript
export class NotAuthenticatedError extends BootstrapError {
  readonly code = 'NOT_AUTHENTICATED';
  constructor() {
    super('Not authenticated: no Clerk session');
    this.name = 'NotAuthenticatedError';
  }
}
```

**Phase 4 target** (CONTEXT.md `<specifics>` lines 304-326):

```typescript
// lib/stripe/errors.ts (D-16)
import 'server-only';
import type { TIER_LIMITS, PlanTier } from './products';

type TierFeature = keyof typeof TIER_LIMITS.starter;

export class TierLimitExceededError extends Error {
  public readonly code = 'TIER_LIMIT_EXCEEDED' as const;
  constructor(
    public readonly feature: TierFeature,
    public readonly limit: number,
    public readonly current: number,
    public readonly statusCode: 429 | 403,
    public readonly requiredTier?: PlanTier,
  ) {
    super(
      `Tier limit exceeded: feature=${feature} limit=${limit} current=${current}` +
        (requiredTier ? ` requiredTier=${requiredTier}` : ''),
    );
    this.name = 'TierLimitExceededError';
  }
}
```

Note: `TierLimitExceededError extends Error` directly (NOT `BootstrapError`) per D-16 — tier errors are billing-domain, not auth-bootstrap.

---

### lib/db/repositories/batch_jobs.ts (repository, CRUD)

**Analog:** `lib/db/repositories/policy_versions.ts` (entire file — append-mostly per-aggregate repo with OrgScope-first signatures).

**Source pattern (lib/db/repositories/policy_versions.ts:28-101):**

```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { policyVersions } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import type { PolicyId } from '@/lib/policies/types';

export const PolicyVersions = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.orgId, s.orgId)),

  create: (
    s: OrgScope,
    input: {
      policyId: PolicyId;
      versionNumber: number;
      contentJson: unknown;
      createdBy: string;
      changeSummary?: string;
    },
  ) =>
    s.tx
      .insert(policyVersions)
      .values({
        ...input,
        orgId: s.orgId,
      })
      .returning(),

  listForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policyId),
        ),
      )
      .orderBy(desc(policyVersions.versionNumber)),

  findByVersionNumber: (
    s: OrgScope,
    policyId: PolicyId,
    versionNumber: number,
  ) =>
    s.tx
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policyId),
          eq(policyVersions.versionNumber, versionNumber),
        ),
      )
      .limit(1),
};
```

**Phase 4 target methods** (D-06 + D-30 + D-34): `insert`, `findByAnthropicBatchId`, `findLatestForOrg`, `updateStatus` (with `updatedAt: sql\`now()\``). Object-literal default-export style; `'server-only'`; no raw `db` import; all queries gated by `eq(batchJobs.orgId, s.orgId)`.

---

### lib/db/repositories/ai-generations.ts (MODIFY — repository, CRUD)

**Analog:** Existing file body (`lib/db/repositories/ai_generations.ts:1-25`) + `lib/db/repositories/policies.ts:48-160` for the populated-method shape.

**Source pattern (lib/db/repositories/policies.ts:141-160):**

```typescript
statusCounts: async (s: OrgScope) => {
  const rows = await s.tx
    .select({
      status: policies.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(policies)
    .where(eq(policies.orgId, s.orgId))
    .groupBy(policies.status);
  // ...
},
```

**Phase 4 target methods** (D-08): `insert(s, input)`, `countByTypeInMonth(s, type)` (drives `checkTierLimit`), `findByBatchId(s, anthropicBatchId)`, `findByIdempotencyKey(s, key)` (D-32). The Phase 2 skeleton `record()` throw-stub is REMOVED (renamed to `insert` body). `listAll` survives.

**Critical:** AC-32 requires writes to populate `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens` — NOT `tokensUsed` (column dropped in `drizzle/0007`).

---

### lib/db/repositories/policies.ts (MODIFY — add 2 methods)

**Analog:** Same file, existing methods (`listWithFilters` for the WHERE-clause pattern; `updateDraft` for the patch pattern).

**Source pattern (`updateDraft` at lines 109-118):**

```typescript
updateDraft: (
  s: OrgScope,
  id: PolicyId,
  patch: { title?: string; category?: string; contentJson?: unknown },
) =>
  s.tx
    .update(policies)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
    .returning(),
```

**Phase 4 targets:**

```typescript
// D-12: listPublishedForOrg — feeds Q&A library + Consistency batch payload
listPublishedForOrg: (s: OrgScope) =>
  s.tx
    .select({ id: policies.id, title: policies.title, contentJson: policies.contentJson })
    .from(policies)
    .where(and(eq(policies.orgId, s.orgId), eq(policies.status, 'published'))),

// D-09: updateSummary — single-purpose AI-write companion to updateDraft
updateSummary: (s: OrgScope, id: PolicyId, summary: string) =>
  s.tx
    .update(policies)
    .set({ tldrSummary: summary, updatedAt: sql`now()` })
    .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
    .returning(),
```

ADR-028: both methods take `PolicyId` (branded) — `scripts/check-policy-id-brand.ts` extends `REPO_TARGETS` entry for `policies.ts` to include both new method names.

---

### lib/db/schema.ts (MODIFY — add batchJobs + widen aiGenerations)

**Analog:** `lib/db/schema.ts:54-64` (current `aiGenerations` shape) + `lib/db/schema.ts:139-164` (`policyVersions` block with second-arg constraints array).

**Source pattern (aiGenerations current body at lines 54-64):**

```typescript
export const aiGenerations = pgTable('ai_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  policyId: uuid('policy_id').references(() => policies.id),
  type: text('type').notNull(), // 'draft' | 'summary' | 'qa' | 'consistency'
  prompt: text('prompt').notNull(),
  result: text('result').notNull(),
  tokensUsed: integer('tokens_used').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Phase 4 amendments:**

- Drop `tokensUsed` column; add 4 nullable integer columns (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`) per D-35.
- Add `idempotencyKey: text('idempotency_key')` per D-32.
- Add new `batchJobs` table per D-06 + D-29 + D-34 (with `.default('consistency')` on `type`, `.default('in_progress')` on `status`, `updatedAt: timestamp('updated_at').defaultNow().notNull()` per D-34).

**`scripts/check-artifacts.ts` extension** (mirroring `checkPhase2Schema` lines 811-865): add `batchJobs` to the table-list assertion array.

---

### app/api/ai/draft/route.ts (controller, request-response)

**Composite analog:**

1. **Webhook handler shape** — `app/api/webhooks/clerk/route.ts` (POST function, raw-body handling, structured `console.error` with masked identifiers, idempotency).
2. **Auth + withOrgScope shape** — `app/(admin)/policies/new/actions.ts` (Zod parse + `await getOrgContext()` + `withOrgScope(ctx, async (s) => { ... })`).
3. **Typed-error catch** — `lib/policies/state-machine.ts:IllegalTransitionError` discrimination at the boundary.

**Source pattern (app/(admin)/policies/new/actions.ts:107-143):**

```typescript
export async function createPolicyAction(
  _prev: CreatePolicyState | undefined,
  formData: FormData,
): Promise<CreatePolicyState> {
  let policyId: string;
  try {
    const parsed = CreatePolicySchema.safeParse(
      Object.fromEntries(formData),
    );
    if (!parsed.success) {
      return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
    }
    const ctx = await getOrgContext();
    policyId = await withOrgScope(ctx, async (s) => {
      const rows = await Policies.create(s, { /* ... */ });
      const first = rows[0];
      if (!first) throw new Error('Insert returned no row');
      return first.id;
    });
  } catch (err) {
    // T-03-07-03: log detail server-side, return generic copy to client.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[createPolicyAction] failed: ${detail}`);
    return { ok: false, error: 'Could not create policy. Please try again.' };
  }
  revalidatePath('/policies');
  redirect(`/policies/${policyId}`);
}
```

**Phase 4 target** (CONTEXT.md `<specifics>` lines 358-398 + `<amendments>` D-37 (auth outside try) + D-36 (sanitized log) + D-32 (idempotency-key dedup)):

```typescript
// app/api/ai/draft/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdmin } from '@/lib/auth/require-admin';
import { withOrgScope } from '@/lib/db/scoped';
import { getAnthropicClient } from '@/lib/ai/client';
import { MODEL_SONNET } from '@/lib/ai/models';
import { buildCachedSystem } from '@/lib/ai/cache';
import { DRAFT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { extractText } from '@/lib/ai/extract';
import { DraftSchema } from '@/lib/ai/schemas';
import { AiGenerations } from '@/lib/db/repositories/ai_generations';
import { requireTierLimit } from '@/lib/stripe/products';
import { TierLimitExceededError } from '@/lib/stripe/errors';

export async function POST(req: Request): Promise<Response> {
  // D-37: auth gates OUTSIDE try — typed errors propagate to Next.js boundary
  const ctx = await getOrgContext();
  await requireAdmin(ctx);   // throws ForbiddenError → 403 per D-45
  try {
    await requireTierLimit(ctx.orgId, 'aiDraftsMonthly');
    const body = DraftSchema.parse(await req.json());

    // D-32: optional idempotency-key dedup
    const idempotencyKey = req.headers.get('Idempotency-Key');
    if (idempotencyKey) {
      const existing = await withOrgScope(ctx, async (s) =>
        AiGenerations.findByIdempotencyKey(s, idempotencyKey));
      if (existing) return NextResponse.json(
        { draftContent: existing.result, tokensUsed: existing.inputTokens + existing.outputTokens },
        { status: 200 },
      );
    }

    const result = await withOrgScope(ctx, async (s) => {
      const response = await getAnthropicClient().messages.create({
        model: MODEL_SONNET,
        system: buildCachedSystem(DRAFT_SYSTEM_PROMPT),
        messages: [{ role: 'user', content: /* ... */ }],
        max_tokens: 4096,
      });
      const draftContent = extractText(response);
      await AiGenerations.insert(s, {
        policyId: null,
        type: 'draft',
        prompt: body.prompt,
        result: draftContent,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
        idempotencyKey: idempotencyKey ?? null,
        model: MODEL_SONNET,
      });
      return { draftContent, tokensUsed: response.usage.output_tokens };
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TierLimitExceededError) {
      return NextResponse.json(
        {
          error: 'tier_limit_exceeded',
          tierLimit: err.limit,
          currentUsage: err.current,
          upgradeUrl: '/pricing',
        },
        { status: err.statusCode },
      );
    }
    // D-36: PII-safe sanitized log
    console.error('[ai/draft] anthropic failed', {
      orgId: ctx.orgId,
      error: err instanceof Error ? { name: err.name, message: err.message.slice(0, 120) } : err,
    });
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
```

---

### app/api/ai/summary/route.ts (controller, request-response)

**Analog:** Same as `draft/route.ts` PLUS `lib/policies/transitions.ts:publish()` for the "return cached if already exists" branch (SPEC R3 idempotence — no Anthropic call on 2nd call).

**Key difference:** Schema is `SummarySchema` (`policyId: z.string().uuid()`), and the flow is:
1. `requireAdmin`.
2. Fetch policy via `Policies.findById(s, policyId)`.
3. If `policy.tldrSummary` is non-null → return `{ summary: policy.tldrSummary }` (no Anthropic, no `ai_generations` row).
4. Otherwise: delegate to `generateSummaryForPolicy(policyId, ctx)` (which opens its own `withOrgScope`).

---

### app/api/ai/qa/route.ts (controller, request-response)

**Analog:** Same as `draft/route.ts` MINUS `requireAdmin` (Q&A is any-authenticated-user per SPEC R4 + D-46 unlimited-cost-MVP-risk-accepted).

**Critical pattern — D-41 validIds wiring** (RESEARCH § Pattern 3 + CONTEXT.md `<amendments>` D-41 lines 908-931):

```typescript
const result = await withOrgScope(ctx, async (s) => {
  const policies = await Policies.listPublishedForOrg(s);
  const validIds = new Set(policies.map(p => p.id));   // ← MUST be same closure
  const libraryXml = policies
    .map(p => `<policy id="${p.id}" title="${xmlEscape(p.title)}"><content>${policyToPromptText(p)}</content></policy>`)
    .join('\n');
  const response = await getAnthropicClient().messages.create({
    model: MODEL_SONNET,
    max_tokens: 1024,
    system: [
      ...buildLongCachedSystem(libraryXml),                   // 1h TTL — order matters (D-33c)
      ...buildCachedSystem(QA_SYSTEM_PROMPT_TEMPLATE),        // 5min TTL — second
    ],
    messages: [{ role: 'user', content: body.question }],
  });
  // ...AiGenerations.insert + parseQaResponse(extractText(response), validIds)
});
```

**Order constraint:** longer-TTL block FIRST, shorter-TTL second — Anthropic returns HTTP 400 on inverse order. RESEARCH § Anti-Patterns to Avoid.

**Cache miss observability** (D-40): if `cache_creation_input_tokens === 0 && cache_read_input_tokens === 0`, log `[ai/qa] cache miss likely` with `inputTokens` + `likelyCause` (probably `'below_1024_token_minimum_sonnet'` for small libraries).

---

### app/api/ai/consistency/route.ts (POST submit) (controller, request-response)

**Analog:** Same as `draft/route.ts` PLUS the tier-403 path (`requireTierLimit(orgId, 'consistencyCheck')` → throws TierLimitExceededError with `statusCode: 403, requiredTier: 'growth'`).

**Submission shape** (RESEARCH § Batch API Mechanics):

```typescript
const batch = await getAnthropicClient().messages.batches.create({
  requests: [{
    custom_id: `consistency-${randomUUID()}`,
    params: {
      model: MODEL_SONNET,
      max_tokens: 8192,
      system: [{ type: 'text', text: CONSISTENCY_SYSTEM_PROMPT }],
      messages: [{ role: 'user', content: fullPolicyLibrary }],
    },
  }],
});
await BatchJobs.insert(s, {
  anthropicBatchId: batch.id,
  type: 'consistency',
  status: 'in_progress',
});
return NextResponse.json({ batchId: batch.id });
```

**Critical:** `ai_generations` row is NOT written at submission — only written by the polling endpoint when `processing_status === 'ended'` AND `succeeded > 0` (per D-06 SUCCESS-ONLY semantic).

---

### app/api/ai/consistency/[batchId]/route.ts (GET poll) (controller, request-response)

**Analog:** No direct analog for the SDK→SPEC enum translator (RESEARCH § Pitfall 1 — CRITICAL drift; this is the one piece of Phase 4 with zero pre-existing pattern).

**Closest analog for the request handler frame:** `app/(admin)/policies/[id]/page.tsx:39-65` (params destructuring + safeParse + `notFound()` fallback) — used here as the params-extraction analog only.

**MUST-SHIP code** (RESEARCH § Batch API Mechanics, lines 199-215):

```typescript
function translateProcessingStatus(batch: Anthropic.Messages.Batches.MessageBatch): 'in_progress' | 'completed' | 'failed' {
  if (batch.processing_status === 'in_progress' || batch.processing_status === 'canceling') {
    return 'in_progress';
  }
  // 'ended' — differentiate via request_counts
  const { succeeded, errored, expired, canceled } = batch.request_counts;
  if (errored > 0 || expired > 0 || canceled > 0) return 'failed';
  return succeeded > 0 ? 'completed' : 'failed';
}
```

**DB-cache stale-window pattern** (D-34): query `batch_jobs` row first; only call Anthropic `messages.batches.retrieve` if the row is older than `STALE_WINDOW_MS = 25_000` AND not yet completed. AC-30: 10 polls within 5s → exactly 1 SDK call.

**Results retrieval** when `status === 'completed'`: iterate `messages.batches.results(batchId)` (per RESEARCH lines 225-237), parse first `succeeded` result's text block as `ConsistencyFinding[]`, persist to `batch_jobs.resultJson` + write one `ai_generations` row.

---

### app/(admin)/dashboard/consistency/page.tsx (Server Component shell, request-response)

**Analog:** `app/(admin)/dashboard/page.tsx` (W7 race-recovery branching) + `app/(admin)/policies/[id]/page.tsx` (Server Component + withOrgScope + branch on data).

**Source pattern (app/(admin)/dashboard/page.tsx:79-104 — branching):**

```typescript
export default async function DashboardPage(): Promise<React.JSX.Element> {
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (err) {
    if (!isOnboardingRaceError(err)) throw err;
    return (/* race-recovery panel */);
  }
  const counts = await withOrgScope(ctx, async (s) => Policies.statusCounts(s));
  // ...branch on counts.total
}
```

**Phase 4 target** (CONTEXT.md `<amendments>` D-30 lines 626-638):

```typescript
// app/(admin)/dashboard/consistency/page.tsx
export default async function ConsistencyPage() {
  const ctx = await getOrgContext();
  await requireAdmin(ctx);
  const latest = await withOrgScope(ctx, async (s) =>
    BatchJobs.findLatestForOrg(s)
  );
  if (!latest) return <ConsistencyEmptyState />;
  if (latest.status === 'completed') return <ConsistencyFindingsList result={latest.resultJson} />;
  if (latest.status === 'failed') return <ConsistencyFailureState />;
  // 'in_progress' — resume polling from persisted ID
  return <ConsistencyCheckRunner batchId={latest.anthropicBatchId} startedAt={latest.createdAt} />;
}
```

---

### components/admin/ConsistencyCheckRunner.tsx (Client Component, polling)

**Analog:** `components/policy/PolicyTransitionMenu.tsx:213-339` (`'use client'`, `useState` for dialog state, `useTransition` for in-flight Server Action — the closest pre-existing Client Component shape).

**Phase 4 target** (CONTEXT.md `<amendments>` D-21 / D-30):

```typescript
'use client';
import { useEffect, useState } from 'react';

export function ConsistencyCheckRunner({ batchId, startedAt }: { batchId: string; startedAt: Date }) {
  const [status, setStatus] = useState<'in_progress' | 'completed' | 'failed'>('in_progress');
  const [findings, setFindings] = useState<ConsistencyFinding[] | undefined>();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/ai/consistency/${batchId}`);
      const data = await res.json();
      setStatus(data.status);
      if (data.status === 'completed') {
        setFindings(data.result);
        clearInterval(interval);
      } else if (data.status === 'failed') {
        clearInterval(interval);
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [batchId]);

  // ...render branching on status
}
```

**Status indicator copy:** "Checking... (started Xm ago)" updated each tick (CONTEXT.md `<specifics>` line 540 sketch + D-30 "Resuming check started Xm ago" on mount-time resume).

---

### components/admin/ConsistencyFindingsList.tsx (component, render)

**Analog:** `components/policy/PolicyVersionHistory.tsx` (Server Component list with empty-state branch + `<section aria-label>` + `<ul>` rendering pattern).

**Source pattern (components/policy/PolicyVersionHistory.tsx:43-75):**

```typescript
export async function PolicyVersionHistory({ policyId }: { policyId: PolicyId }) {
  const ctx = await getOrgContext();
  const versions = await withOrgScope(ctx, async (s) =>
    PolicyVersions.listForPolicy(s, policyId),
  );
  if (versions.length === 0) {
    return (
      <section aria-label="Version history">
        <h2 className="text-xl font-semibold mb-4">Version history</h2>
        <p className="text-sm text-muted-foreground">No published versions yet.</p>
      </section>
    );
  }
  return (
    <section aria-label="Version history">
      <h2 className="text-xl font-semibold mb-4">Version history</h2>
      <ul className="space-y-3">
        {versions.map((v) => (
          <li key={v.id} className="text-sm border-b pb-2">
            {/* ... */}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

**Phase 4 deviation:** Findings grouped by severity (high → medium → low per SPEC R5); each finding wrapped in shadcn `Collapsible` (D-23 — install via `pnpm dlx shadcn add collapsible`).

---

### components/policy/PolicyAiDraftDialog.tsx (Client Component, request-response)

**Composite analog:**

1. **Dialog shape** — `components/policy/PolicyTransitionMenu.tsx:272-337` (`Dialog open onOpenChange` + `DialogContent` + `DialogHeader/Title/Description` + form `onSubmit` + `Button` actions).
2. **Select for policyType** — `components/policy/CreatePolicyForm.tsx:87-106` (shadcn `Select` populated from a const list).

**Source pattern (PolicyTransitionMenu lines 272-337 — Dialog skeleton):**

```typescript
<Dialog
  open={true}
  onOpenChange={(open) => {
    if (!open) setConfirmOpen(null);
  }}
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{confirmOpen.confirm!.title}</DialogTitle>
      <DialogDescription>{confirmOpen.confirm!.body}</DialogDescription>
    </DialogHeader>
    <form onSubmit={(e) => { /* ... */ }}>
      <Textarea name="changeSummary" maxLength={200} placeholder="..." />
      <DialogFooter>
        <Button variant="outline" type="button" onClick={() => setConfirmOpen(null)}>
          Cancel
        </Button>
        <Button type="submit" variant={confirmOpen.destructive ? 'destructive' : 'default'}>
          {confirmOpen.confirm!.confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

**Phase 4 target** (CONTEXT.md `<specifics>` D-22 line 113 + `<amendments>` D-28 lines 585-594):

- Textarea for `prompt` + Select for `policyType` (POLICY_CATEGORIES const).
- Submit → `fetch('/api/ai/draft', { method: 'POST', body: JSON.stringify({ prompt, policyType }) })`.
- On success: `editor.commands.setContent(draftContent)` — **NOT `JSON.parse(draftContent)`** (D-28 CRITICAL fix; AC-23 fixture asserts `JSON.parse` would throw).
- On 429: render tier-limit copy with `/pricing` link.
- On 503: render "AI service temporarily unavailable" + retry hint.

**Note:** This is a SIBLING Client Component of `PolicyEditor` — NOT inside `PolicyEditor.tsx`. Receives a ref/callback to invoke `editor.commands.setContent` from the parent that owns both.

---

### components/policy/PolicyRegenerateTldrButton.tsx (Client Component, request-response)

**Analog:** `components/policy/PolicyHeaderActions.tsx` (entire file — Client Component wrapper that hosts `useRouter` and forwards a callback).

**Source pattern (PolicyHeaderActions.tsx:39-66):**

```typescript
export function PolicyHeaderActions({
  policyId,
  currentStatus,
}: {
  policyId: string;
  currentStatus: PolicyStatus;
}) {
  const router = useRouter();
  // ...
  return (
    <PolicyTransitionMenu
      policyId={policyId}
      currentStatus={currentStatus}
      actions={actions}
      onEditPublished={() => router.push(`/policies/${policyId}?edit=1`)}
    />
  );
}
```

**Phase 4 target** (SPEC R3 AC):

```typescript
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PolicyRegenerateTldrButton({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await fetch('/api/ai/summary', {
            method: 'POST',
            body: JSON.stringify({ policyId }),
          });
          router.refresh();   // re-render Server Component with new summary
        } finally {
          setLoading(false);
        }
      }}
    >
      Regenerate TL;DR
    </Button>
  );
}
```

---

### drizzle/0005_initial_batch_jobs.sql (migration, n/a)

**Analog:** `drizzle/0000_initial.sql` (CREATE TABLE blocks for the 12 existing tables; example: `ai_generations` block at lines 11-21).

**Source pattern (drizzle/0000_initial.sql:11-21):**

```sql
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"policy_id" uuid,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"result" text NOT NULL,
	"tokens_used" integer NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
```

**Phase 4 target** (CONTEXT.md `<specifics>` D-06 lines 519-528 + D-34 `updated_at` addition):

```sql
CREATE TABLE "batch_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"anthropic_batch_id" text NOT NULL,
	"type" text DEFAULT 'consistency' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"result_json" jsonb,
	CONSTRAINT "batch_jobs_anthropic_batch_id_unique" UNIQUE("anthropic_batch_id")
);
--> statement-breakpoint
ALTER TABLE "batch_jobs" ADD CONSTRAINT "batch_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
```

(Drizzle-generated via `pnpm db:generate` from the schema addition.)

---

### drizzle/0006_rls_batch_jobs.sql (migration, n/a)

**Analog:** `drizzle/0001_rls_policies.sql:47-51` (per-table RLS block — exact pattern, 4 statements per table: ENABLE RLS + CREATE POLICY + GRANT).

**Source pattern (drizzle/0001_rls_policies.sql:47-51):**

```sql
-- == policies ==
ALTER TABLE "policies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON "policies"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
GRANT SELECT, INSERT, UPDATE, DELETE ON "policies" TO authenticated;
```

**Phase 4 target** (CONTEXT.md `<amendments>` D-29 lines 597-613):

```sql
-- drizzle/0006_rls_batch_jobs.sql
-- Phase 4 D-29 — RLS for the new batch_jobs table.

-- 1. enable RLS (without this, the policy installs but is never evaluated)
ALTER TABLE "batch_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- 2. org_isolation policy — mirrors all tenant tables per ADR-025
CREATE POLICY "org_isolation" ON "batch_jobs"
  FOR ALL USING (org_id::text = auth.jwt()->>'org_id');
--> statement-breakpoint

-- 3. grant DML to authenticated role (required by withOrgScope's SET LOCAL ROLE)
GRANT SELECT, INSERT, UPDATE, DELETE ON "batch_jobs" TO authenticated;
```

Generated via `pnpm db:generate:rls --custom --name=rls_batch_jobs` (creates empty 0006 shell — body hand-written per RESEARCH § Pitfall 5).

**Note on numbering:** CONTEXT.md says 0004/0005 — RESEARCH § Drizzle Combined-Migration Pattern + the `_journal.json` snapshot confirm Phase 3 already shipped `0004_policy_versions_unique`, so Phase 4 starts at 0005/0006/0007.

---

### drizzle/0007_ai_generations_audit_extensions.sql (combined migration, n/a)

**Analog:** `drizzle/0004_policy_versions_unique.sql` (entire file — exact pattern for the combined Drizzle-generated + hand-written file with `--> statement-breakpoint`).

**Source pattern (drizzle/0004_policy_versions_unique.sql full body):**

```sql
-- Self-healing pre-step: drop accidental duplicate version_number rows...
DELETE FROM policy_versions a
USING policy_versions b
WHERE a.policy_id = b.policy_id
  AND a.version_number = b.version_number
  AND a.created_at > b.created_at;
--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_version_number_unique" UNIQUE("policy_id","version_number");
```

**Phase 4 target** (RESEARCH § Drizzle Combined-Migration Pattern):

```sql
-- drizzle/0007_ai_generations_audit_extensions.sql
-- Phase 4 D-32 + D-35 combined migration.

-- D-35: drop tokens_used, add 4 nullable cache-token columns
ALTER TABLE "ai_generations" DROP COLUMN "tokens_used";
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_read_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_creation_input_tokens" integer;
--> statement-breakpoint

-- D-32: idempotency_key column
ALTER TABLE "ai_generations" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint

-- D-32 hand-written: partial-unique index (Drizzle does NOT emit partial indexes from .unique())
CREATE UNIQUE INDEX "ai_generations_org_idempotency_key"
  ON "ai_generations"("org_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
```

**Critical:** Drop-column is **irreversible** — RESEARCH § Assumptions Log A4 confirms project is pre-paying-customer, so safe.

---

### scripts/check-ai-layer.ts (integration test)

**Analog:** `scripts/check-policies-list-filters.ts` (entire file — seed two orgs + truncate + use withOrgScope via dynamic import).

**Source pattern (scripts/check-policies-list-filters.ts:48-78):**

```typescript
async function loadScopedAndRepos(): Promise<{
  withOrgScope: typeof import('@/lib/db/scoped')['withOrgScope'];
  Policies: typeof import('@/lib/db/repositories/policies')['Policies'];
}> {
  process.env.DATABASE_URL = TEST_URL;
  process.env.DIRECT_URL = DIRECT_TEST;
  const { withOrgScope } = await import('@/lib/db/scoped');
  const { Policies } = await import('@/lib/db/repositories/policies');
  return { withOrgScope, Policies };
}

async function truncate(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    for (const t of [...TENANT_TABLES, 'clerk_events', 'stripe_events']) {
      await tx.unsafe(`TRUNCATE TABLE "${t}" CASCADE`);
    }
  });
}
```

**Phase 4 target coverage** (VALIDATION.md):

- SP-1 (cross-org citation leak): seed Org A + Org B, mocked Anthropic returns IDs from both — assert response.citations only contains Org A IDs.
- SP-2 (503 contract integration): mock Anthropic to throw, hit all 4 endpoints, assert 503 + no new `ai_generations` rows.
- SP-4 (tier-limit overage): seed Starter org with 50 draft rows, POST `/api/ai/draft` → assert 429 with the documented body shape.
- AC-24 (batch_jobs RLS): cross-org row isolation.
- AC-29 (Idempotency-Key dedup): second POST same key → same draftContent + count unchanged.
- AC-32 (cache-token columns): assert insert populated the 4 new columns.

---

### scripts/check-ai-prompts.ts (ts-morph gate)

**Analog:** `scripts/check-policy-id-brand.ts` (entire file — ts-morph file-target list + hardcoded substring anchors).

**Source pattern (scripts/check-policy-id-brand.ts:52-91):**

```typescript
const REPO_TARGETS: Record<string, string[]> = {
  'lib/db/repositories/policies.ts': ['findById', 'updateDraft', 'incrementVersion'],
  // ...
};

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

const targetFiles = [...Object.keys(REPO_TARGETS), ...Object.keys(ORCH_TARGETS)];
project.addSourceFilesAtPaths(targetFiles);
```

**Phase 4 target** (D-26):

```typescript
// scripts/check-ai-prompts.ts
const PROMPT_ANCHORS: Record<string, string> = {
  // Each anchor is a 40-char verbatim substring from reference/PROMPTS.md
  DRAFT_SYSTEM_PROMPT: 'You are a policy drafting assistant',  // placeholder — plan-phase picks
  SUMMARY_SYSTEM_PROMPT: 'TL;DR summary',
  QA_SYSTEM_PROMPT_TEMPLATE: 'may ONLY use the policy documents provided',  // RESEARCH § Claude's Discretion
  CONSISTENCY_SYSTEM_PROMPT: 'inconsistencies, contradictions',
};
// Read lib/ai/prompts.ts, extract the 4 exported string literals, assert each contains its anchor.
```

Wired into `verify:phase-4` per D-24.

---

### scripts/check-error-discipline.ts (MODIFY)

**Analog:** Same file, existing scope at lines 87-98.

**Source pattern (scripts/check-error-discipline.ts:87-98):**

```typescript
project.addSourceFilesAtPaths([
  'lib/auth/**/*.ts',
  'lib/auth/**/*.tsx',
  '!lib/auth/errors.ts',
  '!lib/auth/**/*.test.ts',
  '!lib/auth/**/*.test.tsx',
  '!lib/auth/**/*.spec.ts',
  '!lib/auth/**/*.spec.tsx',
  '!lib/auth/**/*.d.ts',
  '!lib/auth/**/__mocks__/**',
  '!lib/auth/**/__tests__/**',
]);
```

**Phase 4 modification** (D-16): add 7 mirror entries for `lib/stripe/**`:

```typescript
project.addSourceFilesAtPaths([
  'lib/auth/**/*.ts',
  'lib/auth/**/*.tsx',
  '!lib/auth/errors.ts',
  '!lib/auth/**/*.test.ts',
  // ...
  // Phase 4 D-16: extend to lib/stripe/
  'lib/stripe/**/*.ts',
  'lib/stripe/**/*.tsx',
  '!lib/stripe/errors.ts',
  '!lib/stripe/**/*.test.ts',
  // ...
]);
```

---

### scripts/check-rls.ts (MODIFY)

**Analog:** Same file, `TENANT_TABLES` array at lines 34-45.

**Source pattern (scripts/check-rls.ts:34-45):**

```typescript
const TENANT_TABLES = [
  'organizations',
  'users',
  'departments',
  'policies',
  'policy_versions',
  'policy_assignments',
  'acknowledgments',
  'ai_generations',
  'notifications',
  'workflow_stages',
] as const;
```

**Phase 4 modification** (D-29 — AC-24): append `'batch_jobs'`. Also extend the seed block (`scripts/check-rls.ts:102-112`) to INSERT one batch_jobs row per org so the negative-isolation loop has data to test against.

---

### scripts/check-artifacts.ts (MODIFY — Phase 4 file rows)

**Analog:** Same file, `checkPhase3Scaffold` function (lines 1108-1156) — Phase-3-specific artifact assertions.

**Source pattern (scripts/check-artifacts.ts:1108-1156):**

```typescript
function checkPhase3Scaffold(): Check[] {
  const out: Check[] = [];
  assert(out, exists("vitest.config.ts"), "vitest.config.ts exists (Plan 03-01)", "missing");
  // ...
  const pkg = read("package.json");
  assert(out, pkg.includes('"verify:phase-3"'), "package.json declares verify:phase-3", "script missing");
  // ...
}
```

**Phase 4 target:** new `checkPhase4Scaffold()` function asserting:

- All `lib/ai/*.ts` files exist + line 1 is `import 'server-only';`.
- `lib/stripe/products.ts` + `lib/stripe/errors.ts` exist.
- `lib/db/repositories/batch_jobs.ts` exists.
- All 5 `app/api/ai/*/route.ts` files exist.
- `drizzle/0005_*.sql` + `0006_*.sql` + `0007_*.sql` exist (numbering per RESEARCH § Drizzle Combined-Migration Pattern).
- `package.json` declares `"verify:phase-4"` script.
- `package.json` declares `"@anthropic-ai/sdk": "0.97.1"` exactly (no caret/tilde per D-01).
- `.env.local.example` includes `ANTHROPIC_API_KEY=`.

---

### lib/policies/transitions.ts (MODIFY — `publish` D-19)

**Analog:** Same file, existing `publish()` body at lines 151-172.

**Phase 4 target** (CONTEXT.md `<specifics>` D-19 lines 402-424):

```typescript
// lib/policies/transitions.ts (publish, modified)
export async function publish(policyId: PolicyId): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    // ...existing body (loadAndAssertTransition + PolicyVersions.create + s.tx.update)
  });
  // Post-commit AI auto-trigger. Graceful-degrade per SPEC R3.
  try {
    await generateSummaryForPolicy(policyId, ctx);
  } catch (error) {
    console.error('[publish] summary failed', { policyId, error });
  }
}
```

**Critical:** the AI call is OUTSIDE the `withOrgScope` (post-commit). Failure does NOT roll back the state transition. The helper opens its OWN `withOrgScope` so the AI domain stays self-contained.

---

### lib/auth/require-admin.ts (MODIFY — D-45)

**Analog:** `lib/auth/context.ts:55-58` (typed throw of `InvalidRoleError`).

**Phase 4 target** (CONTEXT.md `<amendments>` D-45 lines 977-991):

```typescript
// lib/auth/require-admin.ts — Phase 4 amendment
import 'server-only';
import type { OrgContext } from './context';
import { ForbiddenError } from './errors';   // ADR-026 typed-error pattern; new export

export function requireAdmin(ctx: OrgContext): void {
  if (ctx.role !== 'admin') {
    throw new ForbiddenError('admin role required');
  }
}
```

**Note the signature change:** now takes `ctx: OrgContext` as an arg (was `requireAdmin(): Promise<OrgContext>` in Phase 3 — internally called `getOrgContext()`). Phase 4 hoists `getOrgContext` to the caller per D-37 so auth gates run outside the try block.

**Test analog update:** `lib/auth/require-admin.test.ts:14-30` updated — mock returns OrgContext, assertion checks `requireAdmin(mockCtx)` throws `ForbiddenError` not `NEXT_NOT_FOUND`.

---

### lib/auth/errors.ts (MODIFY — D-45)

**Analog:** Same file, existing class declarations (`NotAuthenticatedError`, `NoActiveOrganizationError`, etc.).

**Phase 4 target:**

```typescript
// Add to lib/auth/errors.ts BootstrapErrorCode union (line 31):
export type BootstrapErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NO_ACTIVE_ORGANIZATION'
  | 'INVALID_ROLE'
  | 'ORG_NOT_PROVISIONED'
  | 'USER_NOT_PROVISIONED'
  | 'FORBIDDEN';   // NEW (D-45)

// Add new class (mirroring lib/auth/errors.ts:60-67 NotAuthenticatedError):
export class ForbiddenError extends BootstrapError {
  readonly code = 'FORBIDDEN';
  constructor(public readonly reason: string) {
    super(`Forbidden: ${reason}`);
    this.name = 'ForbiddenError';
  }
}
```

**Test analog:** `lib/auth/bootstrap-errors.test.ts` (not loaded but visible from `lib/auth/bootstrap-errors.ts:20-32` — uniqueness test + hierarchy contract). Phase 4 extends that test with `ForbiddenError instanceof BootstrapError === true` lock.

---

### tests/types.ts (MODIFY — D-43 citation shape compile-time assertion)

**Analog:** Same file, lines 60-64 (PolicyId brand assertion block).

**Source pattern (tests/types.ts:60-64):**

```typescript
import type { PolicyId } from '@/lib/policies/types';

// @ts-expect-error — PolicyId must not accept a raw `string` via assignment (ADR-028 brand)
const _policyIdBrandTest: PolicyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
void _policyIdBrandTest;
```

**Phase 4 target** (CONTEXT.md `<amendments>` D-43 lines 956-972):

```typescript
// tests/types.ts (Phase 4 addition)
import type { parseQaResponse } from '@/lib/ai/qa-parser';

type _QaCitations = ReturnType<typeof parseQaResponse>['citations'];

// Compile-time assertion: shape matches API-SPEC.md amended contract { title, id }[]
const _qaCitationsCheck: { title: string; id: string }[] = [] as _QaCitations;
void _qaCitationsCheck;

// Compile-time forbid: prevent regression to legacy string[] shape
// @ts-expect-error — citations must be {title, id}[], not string[]
const _qaCitationsRegress: string[] = [] as _QaCitations;
void _qaCitationsRegress;
```

---

### components/admin/AdminSidebar.tsx (MODIFY — D-20)

**Analog:** Same file, lines 65-74 (`/policies` nav item — direct precedent for the new entry).

**Source pattern (components/admin/AdminSidebar.tsx:65-74):**

```typescript
<SidebarMenuItem>
  <SidebarMenuButton
    isActive={isActive("/policies")}
    aria-current={isActive("/policies") ? "page" : undefined}
    render={<Link href="/policies" />}
  >
    <FileText className="size-4" aria-hidden="true" />
    <span>Policies</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```

**Phase 4 target** (D-20): add a "Consistency Check" entry below Dashboard with `isActive("/dashboard/consistency")`. Starter orgs see it disabled with upgrade-tooltip (mirror lines 76-87 disabled-placeholder pattern from same file).

---

## Shared Patterns

### Pattern A: `'server-only'` line 1 of every lib/ai/* file

**Source:** `lib/db/scoped.ts:14` + `lib/db/repositories/policies.ts:20` + `lib/db/repositories/policy_versions.ts:28` (all `import 'server-only';`).

```typescript
import 'server-only';
```

**Apply to:** Every new `lib/ai/*.ts` file. Enforced by Phase 4 extension to `scripts/check-artifacts.ts` per RESEARCH § Pitfall 4.

---

### Pattern B: withOrgScope + repository inside try; auth gates outside

**Source:** Combined from `app/(admin)/policies/new/actions.ts:107-143` + RESEARCH § Pattern 2 (D-37).

```typescript
export async function POST(req: Request): Promise<Response> {
  // 1. Auth gates OUTSIDE try — typed BootstrapError → 401/403/404 via Next.js boundary
  const ctx = await getOrgContext();
  await requireAdmin(ctx);   // D-45: throws ForbiddenError, NOT notFound()
  try {
    // 2. Tier check (throws TierLimitExceededError on overage)
    await requireTierLimit(ctx.orgId, '<feature>');
    // 3. Body validation (throws ZodError → 400)
    const body = <Schema>.parse(await req.json());
    // 4. AI + DB pair inside ONE withOrgScope transaction
    const result = await withOrgScope(ctx, async (s) => {
      // ...Anthropic call + AiGenerations.insert
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TierLimitExceededError) {
      return NextResponse.json(/* 429 or 403 body */, { status: err.statusCode });
    }
    // D-36: PII-safe structured log
    console.error('[ai/<endpoint>] anthropic failed', {
      orgId: ctx.orgId,
      error: err instanceof Anthropic.APIError
        ? { name: err.name, status: err.status, code: err.error?.type }
        : err instanceof Error
          ? { name: err.name, message: err.message.slice(0, 120) }
          : err,
    });
    return NextResponse.json(
      { error: 'ai_service_unavailable', retryAfter: 30 },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
```

**Apply to:** All 4 submit endpoints (`draft`, `summary`, `qa`, `consistency` POST). `consistency/[batchId]` GET varies slightly (no tier check; DB-cache stale window per D-34).

---

### Pattern C: Repository OrgScope-first signature, no raw `db` import

**Source:** `lib/db/repositories/policies.ts:20-23` (header comment + imports) + every method body at lines 48-160.

```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { <table> } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export const <Repository> = {
  someMethod: (s: OrgScope, ...args) =>
    s.tx.select().from(<table>).where(eq(<table>.orgId, s.orgId)),
};
```

**Critical:** NEVER `from '@/lib/db'` (raw db) — `scripts/check-db-imports.ts` (Phase 2 ts-morph gate) catches this. Use `s.tx` from OrgScope.

**Apply to:** `lib/db/repositories/batch_jobs.ts` (NEW) + `lib/db/repositories/ai_generations.ts` (MODIFY).

---

### Pattern D: Typed-error class shape

**Source:** `lib/auth/errors.ts:60-67` + `lib/policies/state-machine.ts:33-40` — identical shape.

```typescript
export class <Name>Error extends <Base = Error | BootstrapError> {
  readonly code = '<UPPER_SNAKE_CODE>' as const;
  constructor(public readonly <param1>: <T1>, public readonly <param2>: <T2>) {
    super(`<verbose message including ${param1} and ${param2}>`);
    this.name = '<Name>Error';
  }
}
```

**Apply to:**
- `TierLimitExceededError` in `lib/stripe/errors.ts` (D-16) — extends `Error` (NOT BootstrapError; billing domain).
- `ForbiddenError` in `lib/auth/errors.ts` (D-45) — extends `BootstrapError` (auth domain, 403 path).

---

### Pattern E: ts-morph verify gate with hardcoded targets

**Source:** `scripts/check-policy-id-brand.ts:43-91` (file-target dictionaries + hardcoded substring anchors).

```typescript
import { Project, SyntaxKind } from 'ts-morph';
import { resolve } from 'node:path';

const TARGETS: Record<string, string[]> = {
  'lib/<file>.ts': ['<symbol1>', '<symbol2>'],
};

const project = new Project({
  tsConfigFilePath: resolve(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths(Object.keys(TARGETS));

// Walk + assert anchors. On failure: process.exit(1) with structured error list.
```

**Apply to:** `scripts/check-ai-prompts.ts` (D-26 — verbatim PROMPTS.md anchors).

---

### Pattern F: vi.mock + test fixtures for orchestrators

**Source:** `lib/policies/transitions.test.ts:35-99` (module-scope mock state + `vi.mock` calls for `@/lib/db/scoped`, `@/lib/auth/context`, repositories).

```typescript
// Module-scope mock state — captured by reference for cross-test assertions
const txMock = { update: vi.fn() };
vi.mock('@/lib/db/scoped', () => ({
  withOrgScope: async (_ctx, fn) =>
    fn({ orgId: 'org_1', userId: 'user_1', /* ... */, tx: txMock }),
}));
vi.mock('@/lib/auth/context', () => ({
  getOrgContext: async () => ({ orgId: 'org_1', /* ... */ }),
}));

// Repository mocks
const findByIdMock = vi.fn();
vi.mock('@/lib/db/repositories/policies', () => ({
  Policies: { findById: (...args) => findByIdMock(...args) },
}));

// THEN import the SUT
import { publish } from './transitions';
```

**Apply to:** All `lib/ai/*.test.ts` + `app/api/ai/*/route.test.ts`. D-05 specifies the Anthropic-client mock shape:

```typescript
vi.mock('@/lib/ai/client', () => ({
  getAnthropicClient: () => mockAnthropicClient,
}));
const mockAnthropicClient = {
  messages: {
    create: vi.fn(),
    batches: { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() },
  },
};
```

---

### Pattern G: Drizzle migration combined-file format

**Source:** `drizzle/0004_policy_versions_unique.sql` (entire file — 22 lines).

```sql
-- Plan-phase rationale + diagnose link
-- Hand-written DELETE / data-fix SQL first
DELETE FROM <table> WHERE <condition>;
--> statement-breakpoint
-- Drizzle-generated DDL second
ALTER TABLE "<table>" ADD CONSTRAINT "<name>" <constraint>;
```

**Apply to:** `drizzle/0007_ai_generations_audit_extensions.sql` (D-32 + D-35 combined). Generated via `pnpm db:generate` for the schema-derived `ALTER TABLE ... ADD COLUMN` statements; partial-unique index hand-written and appended after a `--> statement-breakpoint`.

---

### Pattern H: Server Component empty-state Card branching

**Source:** `app/(admin)/policies/page.tsx:135-169` (empty + searching-empty + populated branches).

```typescript
{empty && !isSearching ? (
  <Card>
    <CardHeader>
      <CardTitle>No <thing> yet</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-muted-foreground mb-4">
        <empty-state body copy>
      </p>
      <Link href="/<action>" className={buttonVariants({ variant: "default" })}>
        <CTA label>
      </Link>
    </CardContent>
  </Card>
) : /* other branches */}
```

**Apply to:** `ConsistencyEmptyState.tsx` ("No consistency checks yet. Click Run consistency check to start.") + `ConsistencyFailureState.tsx` ("Last check failed. Run again." with retry CTA).

---

### Pattern I: Sibling Client Component + Server Component composition

**Source:** `app/(admin)/policies/[id]/page.tsx:39-103` (Server Component composes `EditPolicyForm` Client Component as a sibling of `PolicyVersionHistory` Server Component).

**Apply to:**

- `PolicyAiDraftDialog` — rendered next to `PolicyEditor` (NOT inside it) on `/policies/new`.
- `PolicyRegenerateTldrButton` — rendered next to `PolicyView` on `/policies/[id]`.
- `ConsistencyCheckRunner` — Client Component rendered by `app/(admin)/dashboard/consistency/page.tsx` Server Component shell when `latest.status === 'in_progress'`.

---

### Pattern J: Sanitized error logging (D-36)

**Source:** `app/api/webhooks/clerk/route.ts:38-53` (maskClerkId / maskClerkOrgId helpers) + RESEARCH § Common Pitfall 1 (PII-safe error log shape).

**Apply to:** All 4 AI submit endpoints + `lib/ai/summary.ts:generateSummaryForPolicy` (uses `[publish] summary failed` prefix per SPEC R3 verbatim). Never log raw request body. Truncate `err.message` to 120 chars OR use the structured-field branch (`{ name, status, code }`) for `Anthropic.APIError`.

```typescript
console.error('[ai/<endpoint>] anthropic failed', {
  orgId: ctx.orgId,
  error: err instanceof Anthropic.APIError
    ? { name: err.name, status: err.status, code: err.error?.type }
    : err instanceof Error
      ? { name: err.name, message: err.message.slice(0, 120) }
      : err,
});
```

---

## No Analog Found

Files with no close match in the codebase (planner uses RESEARCH.md patterns directly):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `app/api/ai/consistency/[batchId]/route.ts` SDK→SPEC translator | controller | request-response | No existing route handler reads from an external SDK with an internal-enum mismatch. RESEARCH § Batch API Mechanics lines 199-215 is the authoritative `translateProcessingStatus` body — plan-phase ships verbatim. |
| `components/admin/ConsistencyCheckRunner.tsx` `setInterval` polling | Client Component | polling | No existing Client Component uses `setInterval` + `fetch` polling. Closest analog is `PolicyTransitionMenu`'s `useTransition` pattern but it's request-response, not polling. Plan-phase composes from scratch per D-21 sketch + `useEffect` + `setInterval(..., 30_000)`. |
| `app/(admin)/dashboard/consistency/page.test.tsx` (Server Component page test) | test | unit (jsdom) | No existing Server Component page has a vitest file. Closest analog is `lib/policies/transitions.test.ts` mock-and-assert pattern, but page tests need different async-rendering shape. Plan-phase establishes the convention. |

---

## Metadata

**Analog search scope:** `lib/**`, `app/**`, `components/**`, `drizzle/**`, `scripts/**`, `tests/**`, `reference/**`, `package.json`.
**Files scanned:** 47 files read directly.
**Pattern extraction date:** 2026-05-21.

**Drizzle migration numbering correction:** CONTEXT.md `<code_context>` line 237 says 0004/0005; RESEARCH § Drizzle Combined-Migration Pattern + the journal at `drizzle/meta/_journal.json` confirm the correct numbering is **0005 (initial batch_jobs) / 0006 (RLS batch_jobs) / 0007 (ai_generations audit extensions)**. Plan-phase uses these numbers; pattern excerpts in this file use the corrected numbering.

**Critical no-analog item flagged for planner:** the `translateProcessingStatus` function in `app/api/ai/consistency/[batchId]/route.ts` is the one piece of Phase 4 with zero existing precedent in the codebase. RESEARCH supplies the verbatim body; plan-phase ships it without adaptation.
