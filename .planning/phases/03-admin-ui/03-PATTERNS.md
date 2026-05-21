# Phase 3: Admin UI - Pattern Map

**Mapped:** 2026-05-19
**Files analyzed:** 30 new/modified files
**Analogs found:** 27 / 30 (3 files have no in-repo analog — TipTap is greenfield)

This document maps each new/modified Phase 3 file to the closest existing in-repo analog (Phase 1 + Phase 2 code) so the planner can paste imports, top-of-file guards, and patterns verbatim. Every excerpt below is from `main`/`gsd/phase-3-admin-ui` HEAD on 2026-05-19. Line numbers reference the actual on-disk files.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/auth/require-admin.ts` | utility (server-only guard) | request-response (auth) | `lib/auth/context.ts` | exact (sibling) |
| `lib/policies/state-machine.ts` | utility (pure module) | transform | `lib/utils.ts` (cn helper, minimal sibling) | role-match |
| `lib/policies/transitions.ts` | service (orchestrator) | CRUD (transactional) | `lib/db/scoped.ts` + `lib/db/repositories/users.ts` | role-match |
| `lib/db/repositories/policies.ts` (EXTEND) | repository | CRUD | self (skeleton); `lib/db/repositories/users.ts` for filled-method shape | exact |
| `lib/db/repositories/policy_versions.ts` (EXTEND) | repository | CRUD (create + list only) | self (skeleton); `lib/db/repositories/acknowledgments.ts` for "no update/delete" pattern | exact |
| `lib/db/repositories/workflow_stages.ts` (EXTEND) | repository | CRUD | self (skeleton); `lib/db/repositories/users.ts` | exact |
| `middleware.ts` (MODIFY) | middleware | request-response | self (Phase 1+2 chokepoint) | exact |
| `app/(admin)/layout.tsx` | layout (Server Component) | request-response | `app/layout.tsx` + `app/(marketing)/layout.tsx` | role-match |
| `app/(admin)/dashboard/page.tsx` | page (Server Component, read) | request-response | `app/(marketing)/pricing/page.tsx` | role-match |
| `app/(admin)/policies/page.tsx` | page (Server Component, list+filter) | request-response | `app/(marketing)/page.tsx` + repository `listAll` pattern | role-match |
| `app/(admin)/policies/new/page.tsx` | page (form host, Server Component) | request-response | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` (Clerk widget mount) | partial |
| `app/(admin)/policies/[id]/page.tsx` | page (Server Component, read+nested) | request-response | new pattern; analog `app/(marketing)/page.tsx` shape | partial |
| `app/(admin)/policies/new/actions.ts` | Server Action | request-response (mutation) | new pattern; `app/api/webhooks/clerk/route.ts` is the closest mutation-handler analog (different mechanism but similar Zod-parse + DB-write shape) | partial |
| `app/(admin)/policies/[id]/actions.ts` | Server Action | request-response (mutation) | new pattern; same as `new/actions.ts` | partial |
| `app/(auth)/post-sign-in/page.tsx` | page (server redirect trampoline) | request-response | `app/sign-in-success/page.tsx` (placeholder to delete) + `lib/auth/context.ts` for `getOrgContext()` use | partial |
| `app/(onboarding)/onboarding/create-org/page.tsx` | page (Clerk widget mount) | request-response | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` (Clerk `<SignIn />` mount) | exact |
| `components/admin/AdminSidebar.tsx` | component (Server Component) | request-response | `app/(marketing)/layout.tsx` (nav shape) | role-match |
| `components/admin/AdminTopbar.tsx` | component (Server Component) | request-response | `app/(marketing)/layout.tsx` (header shape) | role-match |
| `components/policy/PolicyEditor.tsx` | component (Client Component) | event-driven | NO ANALOG — first Client Component in repo (greenfield) | none |
| `components/policy/PolicyView.tsx` | component (Server Component) | transform | NO ANALOG — first server HTML render (greenfield) | none |
| `components/policy/PolicyStatusBadge.tsx` | component (Server Component) | transform | `components/ui/button.tsx` (cva-variant pattern) | partial |
| `components/policy/PolicyTransitionMenu.tsx` | component (Client Component) | event-driven | NO ANALOG (greenfield Client Component) | none |
| `components/policy/PolicyVersionHistory.tsx` | component (Server Component) | request-response | repository `listForPolicy` consumer; analog `lib/db/repositories/policy_versions.ts` shape | role-match |
| `scripts/check-admin-routes.ts` | script (ts-morph audit) | batch | `scripts/check-db-imports.ts` | exact |
| `scripts/check-artifacts.ts` (EXTEND) | script (artifact regression) | batch | self | exact |
| `tests/types.ts` (EXTEND) | test (type-only) | transform | self (Phase 2 @ts-expect-error block) | exact |
| `package.json` (MODIFY) | config | n/a | self | exact |
| **DELETE:** `app/sign-in-success/page.tsx` | (delete) | — | n/a (REG-P1-01 closure per L-03) | n/a |

---

## Pattern Assignments

### `lib/auth/require-admin.ts` (utility, request-response)

**Analog:** `lib/auth/context.ts`

**Imports + server-only guard pattern** (`lib/auth/context.ts:11-15`):
```typescript
import 'server-only';
import { auth } from '@clerk/nextjs/server';

export type Role = 'admin' | 'reviewer' | 'employee';
export type OrgContext = { orgId: string; userId: string; role: Role };
```

**What to copy verbatim:** the `import 'server-only'` line as the first non-comment line; the typed `OrgContext` re-export.

**What differs:** `require-admin.ts` is a thin guard, not a session resolver. It calls `getOrgContext()` from `@/lib/auth/context` and `notFound()` from `next/navigation` on `role !== 'admin'` (per CONTEXT `<specifics>` § 1 + L-01 + D-10 "advertise nothing"). Returns `OrgContext` on success. No try/catch around `getOrgContext()` — that's already wrapped per `lib/auth/context.ts:43-54`.

---

### `lib/policies/state-machine.ts` (utility, transform)

**Analog:** none ideal in-repo. Closest sibling for "pure module + server-only" is `lib/utils.ts` (tiny). The `as const` + `satisfies` typing idiom is documented in CONTEXT `<specifics>` § 2.

**Pattern to copy** (CONTEXT.md `<specifics>` § 2, RESEARCH Pattern 2):
```typescript
export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';

export const ALLOWED_TRANSITIONS = {
  draft:        ['under_review', 'published'] as const,
  under_review: ['published', 'draft'] as const,
  published:    ['archived', 'draft'] as const,
  archived:     ['draft'] as const,
} satisfies Record<PolicyStatus, readonly PolicyStatus[]>;

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly PolicyStatus[]).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: PolicyStatus, public readonly to: PolicyStatus) {
    super(`Illegal policy transition: ${from} → ${to}. Allowed: ${ALLOWED_TRANSITIONS[from].join(', ')}`);
    this.name = 'IllegalTransitionError';
  }
}
```

**What to copy verbatim:** the entire module body. This is the locked CONTEXT specifics block; do not paraphrase.

**What differs from any analog:** No DB access, no Drizzle import, no `'server-only'` directive (the module is genuinely pure — RESEARCH explicitly notes it should be testable in isolation). Note: per CONTEXT D-03 "server-only" wording, planner may still add `import 'server-only'` for defense; it's a no-cost belt-and-suspenders since the module is only consumed by `lib/policies/transitions.ts` (also server-only).

---

### `lib/policies/transitions.ts` (service, CRUD orchestrator)

**Analog:** `lib/db/scoped.ts` (for the `withOrgScope` callsite shape) + `lib/db/repositories/users.ts` (for the OrgScope-first repo signature).

**Imports pattern** (`lib/db/scoped.ts:14-18`):
```typescript
import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { OrgContext } from '@/lib/auth/context';
```

**What to copy verbatim from `scoped.ts`:** the `import 'server-only'` first line, `import { sql } from 'drizzle-orm'` for the `sql\`now()\`` literal. **CRITICAL:** do NOT import `db` from `@/lib/db` here — that's reserved for `scoped.ts` and webhook/cron/test paths per `scripts/check-db-imports.ts:37-46` ALLOWLIST. Transitions import `withOrgScope` instead.

**Replacement imports for `transitions.ts`** (from CONTEXT `<specifics>` § 3 + RESEARCH Pattern 2):
```typescript
import 'server-only';
import { sql, eq } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { withOrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { policies } from '@/lib/db/schema';
import { canTransition, IllegalTransitionError, type PolicyStatus } from './state-machine';
```

**Core orchestrator pattern** (CONTEXT.md `<specifics>` § 3 — `publish` orchestrator, verbatim):
```typescript
export async function publish(policyId: string): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const [policy] = await Policies.findById(s, policyId);
    if (!policy) throw new Error('Policy not found');
    if (!canTransition(policy.status as PolicyStatus, 'published')) {
      throw new IllegalTransitionError(policy.status as PolicyStatus, 'published');
    }
    // CREATE policy_versions row capturing about-to-be-published content (D-04)
    await PolicyVersions.create(s, {
      policyId: policy.id,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: /* internal users.id via Users.findByClerkUserId lookup — RESEARCH Pitfall 7 */,
    });
    await s.tx
      .update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(eq(policies.id, policyId));
  });
}
```

**What differs from analog `scoped.ts`:** Caller of `withOrgScope`, not implementor. Uses `s.tx` for direct updates (idiomatic per `lib/db/repositories/policies.ts:34` which already uses `s.tx.select().from(...).where(...)`).

**Note:** All seven orchestrators (`submitForReview`, `approve`, `reject`, `publish`, `archive`, `restore`, `editPublished`) follow the same shape. `editPublished` body is in CONTEXT `<specifics>` § 4 verbatim.

---

### `lib/db/repositories/policies.ts` (EXTEND — repository, CRUD)

**Analog:** self (the skeleton at `lib/db/repositories/policies.ts:32-57`) + `lib/db/repositories/users.ts` for "filled method" reference shape (`Users.findByClerkUserId` at lines 28-35 is the cleanest in-repo example of a parameterized OrgScope read).

**Existing skeleton to extend** (`lib/db/repositories/policies.ts:32-57`):
```typescript
export const Policies = {
  listAll: (s: OrgScope) =>
    s.tx.select().from(policies).where(eq(policies.orgId, s.orgId)),

  findById: (s: OrgScope, id: string) =>
    s.tx
      .select()
      .from(policies)
      .where(and(eq(policies.orgId, s.orgId), eq(policies.id, id)))
      .limit(1),

  // Phase 3 (Admin UI) fills the body. Type signature is locked here so
  // tests/types.ts can assert ADR-005 from day one.
  create: (_s: OrgScope, _input: PolicyCreateInput) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },

  publish: (_s: OrgScope, _id: string) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },

  archive: (_s: OrgScope, _id: string) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI)');
  },
};
```

**Pattern for new methods (e.g., `listWithFilters`)** — directly from RESEARCH Pattern 5:
```typescript
listWithFilters: async (
  s: OrgScope,
  { q, status }: { q?: string; status?: PolicyStatus },
) => {
  const conditions = [eq(policies.orgId, s.orgId)];
  if (status) conditions.push(eq(policies.status, status));
  const baseWhere = and(...conditions);
  const where = q
    ? and(baseWhere, or(
        ilike(policies.title, `%${q}%`),
        ilike(policies.category, `%${q}%`),
      ))
    : baseWhere;
  return s.tx
    .select()
    .from(policies)
    .where(where)
    .orderBy(desc(policies.updatedAt))
    .limit(100);
},
```

**What to copy verbatim:** existing skeleton imports (`import 'server-only'`, OrgScope, `policies` schema, `and`/`eq` from drizzle-orm). The `PolicyCreateInput` Omit type at lines 27-30 stays unchanged (ADR-005 invariant).

**What differs:** new imports — `ilike`, `or`, `desc` from `drizzle-orm`. New `PolicyStatus` import from `@/lib/policies/state-machine` for the filter param. Phase-2 stub bodies (`throw new Error(...)`) are replaced with real bodies.

**Required new methods (D-11):** `create`, `findById` (already exists), `listAll` (already exists), `listWithFilters`, `updateDraft`, `incrementVersion`, `statusCounts` (for `/dashboard` per Claude's Discretion), `publish` (placeholder body for orchestrator handoff — actual transition happens in `lib/policies/transitions.ts`), `archive`.

---

### `lib/db/repositories/policy_versions.ts` (EXTEND — repository, append-only)

**Analog:** self (`lib/db/repositories/policy_versions.ts:20-43`) + **`lib/db/repositories/acknowledgments.ts:31-51`** for the "no `update`/`delete` keys" pattern. L-05 is `acknowledgments.ts` pattern applied to `policy_versions`.

**ADR-018-spirit pattern to copy from `acknowledgments.ts:48-51`:**
```typescript
  // NO update method. ADR-018 append-only.
  // NO delete method. ADR-018 append-only.
  // If you find yourself wanting to add one, STOP — read ADR-018 first.
```

**What to copy verbatim:** the comment block above (rephrased for L-05: replace ADR-018 reference with "L-05 — published version snapshots are immutable").

**What differs:** the repo exports ONLY `create`, `listForPolicy` (already a skeleton at line 27), `findByVersionNumber` (NEW). The existing `listAll` at line 21 can stay (read, no mutation). NO `update`, NO `delete`, NO `incrementVersion` (that lives on Policies, not PolicyVersions).

**Required new methods (D-11 + L-05):**
- `create` — copy `scope.orgId` into row per D-02 + RESEARCH Pitfall 7 for `createdBy` lookup
- `listForPolicy` — body already implemented at line 27 (verify it stays)
- `findByVersionNumber(s, policyId, versionNumber)` — new; same shape as `findById` on Policies but with composite (policyId + versionNumber) where clause

---

### `lib/db/repositories/workflow_stages.ts` (EXTEND — repository, CRUD)

**Analog:** self (`lib/db/repositories/workflow_stages.ts:16-38`) + `lib/db/repositories/users.ts` for filled-method shape.

**Existing skeleton** (verbatim — keep the imports + existing `listAll`/`listPendingForReviewer`):
```typescript
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { workflowStages } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

type WorkflowStageCreateInput = Omit<
  typeof workflowStages.$inferInsert,
  'orgId' | 'id'
>;

export const WorkflowStages = {
  listAll: (s: OrgScope) => /* ... */,
  listPendingForReviewer: (s: OrgScope, reviewerId: string) => /* ... */,
  create: (_s: OrgScope, _input: WorkflowStageCreateInput) => {
    throw new Error('Not yet implemented — Phase 3 (Admin UI — workflows)');
  },
};
```

**What differs:** Phase 3 fills `create` (used by `submitForReview` orchestrator transition `draft → under_review`), adds `recordSubmission(policyId, reviewerId)` and `recordDecision(stageId, decision, comment)` and `listForPolicy(policyId)` per D-11. INSERT methods must copy `s.orgId` into the row per D-02 (consistent with PolicyVersions pattern).

---

### `middleware.ts` (MODIFY — request-response chokepoint)

**Analog:** self (`middleware.ts:1-127`).

**Existing public-route + admin-route shape to keep** (`middleware.ts:14-34`):
```typescript
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/sign-in",
  "/sign-in/(.*)",
  "/sign-up",
  "/sign-up/(.*)",
]);

const isWebhookRoute = createRouteMatcher([
  "/api/webhooks/stripe",
  "/api/webhooks/clerk",
]);

const isCronRoute = createRouteMatcher([
  "/api/cron/(.*)",
]);

const isAdminRoute = createRouteMatcher([
  "/(admin)/(.*)",   // ← REPLACE THIS (L-02 / CR-02)
]);
```

**SF-M4 fold pattern to keep verbatim** (`middleware.ts:51-65` — the try/catch around `await auth()`):
```typescript
let sessionClaims;
try {
  const session = await auth();
  sessionClaims = session.sessionClaims;
} catch (err) {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[middleware] auth() failed in admin gate: ${detail}`);
  // D-10: 404, not 401 — don't advertise the route exists.
  return new NextResponse(null, { status: 404 });
}
```

**Replacement admin matcher (L-02 / CR-02 — CONTEXT `<specifics>` § 4):**
```typescript
const ADMIN_URL_PATTERNS: RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/policies(\/|$)/,
  /^\/onboarding(\/|$)/,
];
function isAdminRoute(pathname: string): boolean {
  return ADMIN_URL_PATTERNS.some((p) => p.test(pathname));
}
// ... change `if (isAdminRoute(req))` to `if (isAdminRoute(req.nextUrl.pathname))`
```

**Additional x-pathname injection (RESEARCH Pattern 7 / D-06):**
```typescript
// At the top of the clerkMiddleware handler, BEFORE the auth gates:
const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-pathname', req.nextUrl.pathname);

// ... existing branches unchanged ...

// At every `return NextResponse.next()`:
return NextResponse.next({ request: { headers: requestHeaders } });
```

**What to copy verbatim:** the SF-M4 fold try/catch (do NOT refactor it). The `pubMeta.role` narrow at lines 74-75 (`{ role?: unknown }` + typeof guard) — re-used unchanged.

**What differs:** `createRouteMatcher(["/(admin)/(.*)"])` is replaced by the explicit `ADMIN_URL_PATTERNS` array (the route-group `(admin)` never appears in URLs). Every `NextResponse.next()` call gets the headers override.

---

### `app/(admin)/layout.tsx` (NEW — layout Server Component)

**Analog:** `app/layout.tsx:22-38` (root layout shape) + `app/(marketing)/layout.tsx:3-33` (nested layout with header + main).

**`ClerkProvider` placement** (`app/layout.tsx:27-37` — already at root, do NOT re-add):
```typescript
return (
  <ClerkProvider>
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  </ClerkProvider>
);
```

**Nested layout shape from `app/(marketing)/layout.tsx:3-33`:**
```typescript
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">PolicyPilot</Link>
          <nav className="flex items-center gap-6 text-sm text-zinc-600"> {/* ... */} </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 text-sm text-zinc-500"> {/* ... */} </footer>
    </div>
  );
}
```

**Replacement pattern (RESEARCH Pattern 1):**
```typescript
import { cookies } from 'next/headers';
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();                              // L-01: notFound() if role !== 'admin'
  const cookieStore = await cookies();               // shadcn sidebar:state cookie restore
  const defaultOpen = cookieStore.get('sidebar:state')?.value !== 'false';
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar />
      <main className="flex flex-col flex-1">
        <AdminTopbar>
          <OrganizationSwitcher />
          <UserButton />
        </AdminTopbar>
        <div className="p-6">{children}</div>
      </main>
    </SidebarProvider>
  );
}
```

**What to copy verbatim from marketing layout:** the `<main className="flex-1">{children}</main>` content slot idiom. The `container mx-auto px-6` page-padding container.

**What differs:** Async Server Component (marketing layout is sync). Adds `await requireAdmin()` first line (L-01 authoritative gate). Adds `await cookies()` for shadcn sidebar persistence. Replaces nav with shadcn `<SidebarProvider>` + custom `<AdminSidebar>` + `<AdminTopbar>`. UPI-SPEC component inventory lists 12 shadcn primitives in use (UI-SPEC § Component Inventory).

---

### `app/(admin)/dashboard/page.tsx` (NEW — Server Component, read)

**Analog:** `app/(marketing)/pricing/page.tsx` (Card-grid layout shape; verify against `components/ui/card.tsx`).

**Card-import pattern from `components/ui/card.tsx:88-95`:**
```typescript
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

**Server Component read pattern from `lib/auth/context.ts` usage + RESEARCH:**
```typescript
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default async function DashboardPage() {
  const ctx = await getOrgContext();
  const counts = await withOrgScope(ctx, async (s) => Policies.statusCounts(s));
  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link href="/policies/new" className={buttonVariants({ variant: 'default' })}>
          Create policy
        </Link>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 4 Card tiles: Draft, Under Review, Published, Archived */}
      </div>
    </div>
  );
}
```

**What to copy verbatim from marketing page:** the `<Link className={buttonVariants(...)}>` CTA idiom (`app/(marketing)/page.tsx:32-38`) — operator's repo does NOT use shadcn `asChild`; CTAs are always `<Link className={buttonVariants(...)}>`.

**What differs:** Server Component awaits `getOrgContext()` + `withOrgScope()`. Counts come from a single SQL aggregate (`Policies.statusCounts(s)` per Claude's Discretion in CONTEXT). Webhook-race fallback (RESEARCH Pitfall 6) shows Skeleton tiles when `organizations` row hasn't landed yet.

---

### `app/(admin)/policies/page.tsx` (NEW — Server Component, list + URL-state filter)

**Analog:** `app/(marketing)/page.tsx` (page shape) + `lib/db/repositories/policies.ts:32-41` (`listAll` repository read).

**Repository read pattern from `lib/db/repositories/policies.ts:33-34`:**
```typescript
listAll: (s: OrgScope) =>
  s.tx.select().from(policies).where(eq(policies.orgId, s.orgId)),
```

**Replacement read pattern (using new `listWithFilters`):**
```typescript
type SearchParams = { q?: string; status?: PolicyStatus };
export default async function PoliciesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;                                    // Next.js 15: searchParams is async
  const ctx = await getOrgContext();
  const rows = await withOrgScope(ctx, async (s) =>
    Policies.listWithFilters(s, { q: sp.q, status: sp.status }),
  );
  return (
    <div>
      {/* search Input + status Select + shadcn Table */}
    </div>
  );
}
```

**What to copy verbatim:** the `await getOrgContext()` + `withOrgScope(ctx, async (s) => ...)` wrap-pattern. Mandated by ADR-019/023/025 + CLAUDE.md Multi-Tenancy Rules.

**What differs from analog:** URL-state filter (sp.q / sp.status), shadcn `<Table>` (new), `<PolicyStatusBadge>` cells (new), `<Link href="/policies/{id}">` per-row title cell.

---

### `app/(admin)/policies/new/page.tsx` (NEW — form host, Server Component)

**Analog:** `app/(auth)/sign-in/[[...sign-in]]/page.tsx:1-6` (minimal Clerk mount), but the form mechanism here is the new shape — there is no existing in-repo native `<form action={action}>` wired to a Server Action. Closest write-path analog is `app/api/webhooks/clerk/route.ts:99` (POST handler with Zod-ish validation), but the mechanism differs.

**Server Action wiring pattern** (from CONTEXT D-09 specifics):
```typescript
import { createPolicyAction } from './actions';
import { PolicyEditor } from '@/components/policy/PolicyEditor';
import { buttonVariants } from '@/components/ui/button';
// shadcn Input, Label, Select, Textarea, etc.

export default function NewPolicyPage() {
  return (
    <form action={createPolicyAction}>
      <Label htmlFor="title">Title</Label>
      <Input id="title" name="title" required maxLength={200} />
      {/* Category select + PolicyEditor + hidden content_json + actions row */}
      <button className={buttonVariants({ variant: 'default' })} type="submit">Save draft</button>
    </form>
  );
}
```

**What to copy verbatim:** the `<Input id name required maxLength>` HTML5-native validation pattern (per D-09 — NO React Hook Form). The `<Link className={buttonVariants(...)}>` CTA idiom (`app/(marketing)/page.tsx:32`).

**What differs:** First Server Action consumer. Hosts the `<PolicyEditor>` Client Component (first Client Component in repo). Uses `useActionState` (React 19 — RESEARCH State of the Art) for error rendering inside a small Client wrapper if needed.

---

### `app/(admin)/policies/new/actions.ts` (NEW — Server Action)

**Analog:** none direct. Closest write-path is `app/api/webhooks/clerk/route.ts:99-...` (POST handler with raw-body parse + DB write). The Server Action shape is documented in CONTEXT `<decisions>` D-09 + RESEARCH Pattern 6.

**Pattern to copy verbatim** (RESEARCH Pattern 6 — `redirect()` outside try/catch):
```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { Policies } from '@/lib/db/repositories/policies';

const CreatePolicySchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
  content_json: z.string().transform((s) => JSON.parse(s) as JSONContent),
});

export async function createPolicyAction(_prev: unknown, formData: FormData) {
  let policyId: string;
  try {
    const parsed = CreatePolicySchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const ctx = await getOrgContext();
    policyId = await withOrgScope(ctx, async (s) => {
      const [row] = await Policies.create(s, parsed.data);
      return row.id;
    });
  } catch (err) {
    return { error: { _form: ['Could not create policy. Please try again.'] } };
  }
  revalidatePath('/policies');
  redirect(`/policies/${policyId}`);    // ⚠ outside try/catch (RESEARCH Pitfall 3)
}
```

**What to copy verbatim:** the `'use server'` directive first line. The Zod-parse → withOrgScope → revalidatePath → redirect ordering (RESEARCH Pitfalls 3 + 4).

**What differs:** No analog in repo for Server Actions. This pattern is the canonical Phase 3 shape for all `actions.ts` files.

---

### `app/(admin)/policies/[id]/actions.ts` (NEW — Server Actions for transitions)

**Analog:** `new/actions.ts` (sibling) + `lib/policies/transitions.ts` (orchestrator delegation).

**Pattern to copy verbatim** (RESEARCH Pattern 2 — orchestrator-wrapper Server Action):
```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { publish, IllegalTransitionError } from '@/lib/policies/transitions';

export type ActionState = { ok: true } | { ok: false; error: string };

export async function publishAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const policyId = String(formData.get('policyId') ?? '');
  if (!policyId) return { ok: false, error: 'Missing policy id' };
  try {
    await publish(policyId);
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return { ok: false, error: err.message };
    }
    throw err;     // unexpected — bubble to error boundary
  }
  revalidatePath('/policies');
  revalidatePath(`/policies/${policyId}`);
  return { ok: true };
}
```

**What differs:** One exported action per transition (`publishAction`, `archiveAction`, etc.). Each delegates to its corresponding orchestrator in `lib/policies/transitions.ts`. No `redirect()` — page stays on `/policies/[id]` after transition; revalidatePath refreshes the list view.

---

### `app/(auth)/post-sign-in/page.tsx` (NEW — replaces `/sign-in-success`)

**Analog:** `app/sign-in-success/page.tsx` (the file being DELETED — L-03 closure).

**File to DELETE — current content at `app/sign-in-success/page.tsx:1-12`:**
```typescript
export default function SignInSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">You&apos;re signed in.</h1>
        <p className="mt-2 text-zinc-600">
          Thanks for signing up. Your workspace isn&apos;t built yet — check back soon.
        </p>
      </div>
    </div>
  );
}
```

**Replacement pattern at `app/(auth)/post-sign-in/page.tsx`** (RESEARCH Code Examples §):
```typescript
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/auth/context';

export default async function PostSignInPage() {
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (err) {
    // No active org (no orgId, or no role) → onboard
    redirect('/onboarding/create-org');
  }
  if (ctx.role === 'admin') redirect('/dashboard');
  redirect('/my-policies');     // Phase 5 stub OK in Phase 3
}
```

**What to copy verbatim from sign-in-success (none for body; only the location grammar of `app/(auth)/...`):** Place new file under `app/(auth)/post-sign-in/page.tsx` to match existing `app/(auth)/layout.tsx:3-13` grouping. NOTE: RESEARCH L-03 calls out that the live file is at `app/sign-in-success/page.tsx` (NOT inside `(auth)` group) — confirm before deleting.

**What differs:** Server-side `redirect()` (no rendered body). Calls `getOrgContext()` directly. Try/catch wraps the call to handle the no-active-org case (Clerk session exists, but `orgId` missing → onboarding).

**Companion update needed:** `scripts/check-foundation.ts` HTTP probe set updates from `/sign-in-success` to `/post-sign-in` (RESEARCH Runtime State Inventory edge case).

---

### `app/(onboarding)/onboarding/create-org/page.tsx` (NEW — Clerk widget mount)

**Analog:** `app/(auth)/sign-in/[[...sign-in]]/page.tsx:1-6` (Clerk widget mount).

**Existing analog content (verbatim):**
```typescript
import { SignIn } from "@clerk/nextjs";
import type { ReactElement } from "react";

export default function SignInPage(): ReactElement {
  return <SignIn />;
}
```

**Replacement pattern (RESEARCH Code Examples §):**
```typescript
import { CreateOrganization } from '@clerk/nextjs';

export default function CreateOrgPage() {
  return (
    <div className="flex items-center justify-center p-8">
      <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
    </div>
  );
}
```

**What to copy verbatim:** the bare Clerk-widget mount pattern. NOTE: the page must be reachable for signed-in users WITHOUT an active org. UI-SPEC § Page-by-Page recommends placing under `(admin)` and adapting `requireAdmin` to allow `orgId === null` users — alternatively, place outside the `(admin)` group to avoid the `requireAdmin()` 404. Planner: pick the documented choice. Middleware matcher must include `/onboarding(\/|$)` per CONTEXT specifics + L-02.

**What differs:** no `requireAdmin()` gate (user is mid-onboarding, no org yet). Layout-level gate must accommodate.

---

### `components/admin/AdminSidebar.tsx` (NEW — Server Component)

**Analog:** `app/(marketing)/layout.tsx:11-22` (nav shape).

**Marketing nav shape (verbatim):**
```typescript
<nav className="flex items-center gap-6 text-sm text-zinc-600">
  <Link href="/pricing" className="hover:text-zinc-900">Pricing</Link>
  <Link href="/sign-in" className="hover:text-zinc-900">Sign in</Link>
</nav>
```

**Replacement pattern (RESEARCH Pattern 7 — reads x-pathname from headers):**
```typescript
import { headers } from 'next/headers';
import {
  Sidebar, SidebarHeader, SidebarContent, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton,
} from '@/components/ui/sidebar';
import Link from 'next/link';

export async function AdminSidebar() {
  const pathname = (await headers()).get('x-pathname') ?? '/';
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild aria-current={pathname.startsWith('/dashboard') ? 'page' : undefined}>
              <Link href="/dashboard">Dashboard</Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* Policies, then grayed Employees/Reports/Settings per UI-SPEC */}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
```

**What to copy verbatim:** the `<Link href hover:...>` idiom. The `aria-current="page"` pattern for active highlighting.

**What differs:** Server Component (`async function`). Reads `x-pathname` header injected by middleware. Uses shadcn `<Sidebar>` primitives — new in Phase 3 per D-13. The greyed-out items list (Employees / Reports / Settings) is per UI-SPEC § Layout shape (D-06).

---

### `components/admin/AdminTopbar.tsx` (NEW — Server Component)

**Analog:** `app/(marketing)/layout.tsx:10-23` (header bar).

**Existing header shape (verbatim):**
```typescript
<header className="border-b">
  <div className="container mx-auto px-6 py-4 flex items-center justify-between">
    <Link href="/" className="text-lg font-semibold tracking-tight">PolicyPilot</Link>
    <nav>...</nav>
  </div>
</header>
```

**Replacement pattern:**
```typescript
import type { ReactNode } from 'react';

export function AdminTopbar({ children }: { children: ReactNode }) {
  return (
    <header className="border-b">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        {/* breadcrumbs slot — derive from x-pathname if needed */}
        <div className="flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
```

**What to copy verbatim:** the `border-b` + `container mx-auto px-6 py-4 flex items-center justify-between` shell.

**What differs:** Accepts `children` slot for `<OrganizationSwitcher />` + `<UserButton />` Clerk widgets (passed in from the layout).

---

### `components/policy/PolicyEditor.tsx` (NEW — Client Component)

**Analog:** NONE. No existing Client Component in the repo. RESEARCH Pattern 3 is the canonical shape; the project has no `'use client'` files today.

**Pattern to copy verbatim** (RESEARCH Pattern 3):
```typescript
'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/core';
import { useState } from 'react';

export function PolicyEditor({
  initialContent,
  name = 'content_json',
}: {
  initialContent: JSONContent | undefined;
  name?: string;
}) {
  const [json, setJson] = useState<JSONContent | undefined>(initialContent);
  const editor = useEditor({
    immediatelyRender: false,            // ⚠ MANDATORY for Next.js 15 SSR (RESEARCH Pitfall 1)
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    content: initialContent ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => setJson(editor.getJSON()),
  });
  return (
    <>
      <input type="hidden" name={name} value={JSON.stringify(json ?? {})} />
      <EditorContent editor={editor} />
    </>
  );
}
```

**What to copy verbatim:** the entire body. `immediatelyRender: false` is mandatory (RESEARCH Pitfall 1). The hidden-form-input pattern feeds the Server Action.

**What differs from anything in repo:** First `'use client'` Client Component in the codebase. First TipTap usage. Note: `scripts/check-admin-routes.ts` should grep-assert the `immediatelyRender: false` literal in this file per RESEARCH Pitfall 1.

---

### `components/policy/PolicyView.tsx` (NEW — Server Component)

**Analog:** NONE direct. The server-render-then-dangerouslySetInnerHTML pattern is greenfield. Closest in-repo pattern: any Server Component that returns JSX (e.g., `app/(marketing)/page.tsx`).

**Pattern to copy verbatim** (RESEARCH Pattern 4):
```typescript
import { generateHTML } from '@tiptap/html';     // ⚠ NOT @tiptap/core (browser-only)
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/core';

export function PolicyView({ content }: { content: JSONContent }) {
  const html = generateHTML(content, [StarterKit, Link]);
  return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

**What to copy verbatim:** the entire body. `@tiptap/html` (NOT `@tiptap/core`) is the server-render entry point.

**What differs:** First server-side rich-text render in repo. The `prose prose-sm max-w-none` Tailwind 4 `tw-typography` classes per UI-SPEC § Typography (rich-text body section).

---

### `components/policy/PolicyStatusBadge.tsx` (NEW — Server Component)

**Analog:** `components/ui/button.tsx:6-41` (cva-variant pattern).

**cva variant idiom from button.tsx:6-41:**
```typescript
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg ...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground ...",
        outline: "border-border bg-background ...",
        secondary: "bg-secondary text-secondary-foreground ...",
        ghost: "hover:bg-muted ...",
        destructive: "bg-destructive/10 text-destructive ...",
      },
      // ... size ...
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```

**What to copy verbatim:** the cva-variant idiom. PolicyStatusBadge wraps shadcn `<Badge>` and maps `PolicyStatus` → Badge variant per UI-SPEC § Color (Status badge mapping):
- `draft` → `<Badge variant="outline">`
- `under_review` → `<Badge variant="secondary">`
- `published` → `<Badge variant="default">`
- `archived` → `<Badge variant="outline" className="text-muted-foreground border-muted-foreground/40">`

**What differs:** Pure switch on `PolicyStatus`; no cva needed (the shadcn `<Badge>` already has cva-managed variants — this is a thin mapper).

---

### `components/policy/PolicyTransitionMenu.tsx` (NEW — Client Component)

**Analog:** NONE. Greenfield Client Component using shadcn `<DropdownMenu>`.

**Pattern:** Maps `ALLOWED_TRANSITIONS[currentStatus]` to `<DropdownMenuItem>` rows, each wrapping a `<form action={transitionAction}>`. Uses `useActionState` (React 19) to surface errors from `IllegalTransitionError`. UI-SPEC § Copywriting Contract has the exact button labels.

**What to copy verbatim:** Imports `ALLOWED_TRANSITIONS` from `@/lib/policies/state-machine`. Mirrors server-side state machine for UX only — the Server Action is authoritative (RESEARCH Anti-Patterns).

---

### `components/policy/PolicyVersionHistory.tsx` (NEW — Server Component)

**Analog:** `lib/db/repositories/policy_versions.ts:27-36` (`listForPolicy` consumer pattern).

**Repository read pattern (verbatim from `lib/db/repositories/policy_versions.ts:27-36`):**
```typescript
listForPolicy: (s: OrgScope, policyId: string) =>
  s.tx
    .select()
    .from(policyVersions)
    .where(
      and(
        eq(policyVersions.orgId, s.orgId),
        eq(policyVersions.policyId, policyId),
      ),
    ),
```

**Component pattern:**
```typescript
import { getOrgContext } from '@/lib/auth/context';
import { withOrgScope } from '@/lib/db/scoped';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';

export async function PolicyVersionHistory({ policyId }: { policyId: string }) {
  const ctx = await getOrgContext();
  const versions = await withOrgScope(ctx, async (s) =>
    PolicyVersions.listForPolicy(s, policyId),
  );
  return (
    <section>
      <h2 className="text-xl font-semibold mb-4">Version history</h2>
      <ul>{versions.map((v) => /* row format per UI-SPEC */)}</ul>
    </section>
  );
}
```

**What to copy verbatim:** the `getOrgContext()` + `withOrgScope(...)` wrap. Repository import.

**What differs:** Server Component reading nested resource. Renders chronological list per UI-SPEC § Page-by-Page (`/policies/[id]` version history block).

---

### `scripts/check-admin-routes.ts` (NEW — ts-morph audit script)

**Analog:** `scripts/check-db-imports.ts:1-167` (closest in shape — ts-morph project + import allow-list audit + positive control).

**Imports + setup pattern from `scripts/check-db-imports.ts:14-46`:**
```typescript
import { Project, SyntaxKind } from 'ts-morph';
import { resolve as resolvePath, sep as pathSep, relative as relPath } from 'node:path';

const project = new Project({
  tsConfigFilePath: resolvePath(process.cwd(), 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

project.addSourceFilesAtPaths([
  'app/**/*.{ts,tsx}',
  'lib/**/*.{ts,tsx}',
  'scripts/**/*.ts',
  'tests/**/*.ts',
  'middleware.ts',
]);
```

**Positive-control + violations exit pattern from `scripts/check-db-imports.ts:135-160`:**
```typescript
if (allowListedHits < 2) {
  console.error(`L-05 positive control failed: ...`);
  process.exit(1);
}

if (violations.length > 0) {
  console.error('ADR-023 / L-05 raw-`db` allow-list violations:');
  // ... loop ...
  process.exit(1);
}

console.log(`OK — ...`);
process.exit(0);
```

**main() invocation footer (`scripts/check-db-imports.ts:162-167`):**
```typescript
main().catch((err: unknown) => {
  console.error(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
  process.exit(1);
});
```

**What to copy verbatim:** the ts-morph `Project` setup with `skipAddingFilesFromTsConfig: true`. The positive-control + violation-loop + `process.exit(0/1)` pattern. The `main().catch(...)` footer.

**What differs:** parses `middleware.ts:ADMIN_URL_PATTERNS` array literal via ts-morph (per CONTEXT `<specifics>` § 5 / RESEARCH Code Examples § scripts/check-admin-routes.ts). Walks `app/(admin)/**/page.tsx` instead of `@/lib/db` import sites. Cross-checks pattern ↔ URL bidirectionally. Additionally walks `app/(admin)/**/actions.ts` and asserts each contains `withOrgScope(` literal (foot-gun catch per CONTEXT specifics).

---

### `scripts/check-artifacts.ts` (EXTEND — file-existence + content regression gate)

**Analog:** self (`scripts/check-artifacts.ts:1-1118`).

**Existing Phase 2 check shape from `scripts/check-artifacts.ts:925-948`** (`checkPhase2WebhookHandler`):
```typescript
function checkPhase2WebhookHandler(): Check[] {
  const out: Check[] = [];
  const path = "app/api/webhooks/clerk/route.ts";
  if (!exists(path)) {
    out.push(fail(`${path} exists`, "missing"));
    return out;
  }
  out.push(ok(`${path} exists (Plan 02-05)`));
  const s = read(path);
  assert(out, s.includes("import { Webhook") && s.includes("from 'svix'"),
    `${path}: imports svix Webhook`, "svix import missing");
  // ... more asserts ...
  return out;
}
```

**Main aggregation pattern from `scripts/check-artifacts.ts:1070-1093`:**
```typescript
const all: Check[] = [
  ...checkPackageJsonShape(),
  ...checkTsconfigHardening(),
  // ... existing checks ...
  // Phase 2 additions:
  ...checkPhase2Schema(),
  ...checkPhase2ScopedAndContext(),
  // ... etc ...
];
```

**What to copy verbatim:** the `function checkPhase3XXX(): Check[]` shape — top-of-function existence guard, then per-file content asserts using `assert(out, cond, label, detail)`. Plug into `main()`'s `all: Check[]` array as new `...checkPhase3XXX()` spreads.

**What differs:** Phase 3 checks add rows for: all 7 admin pages, 6 policy components, 2 admin-shell components, `lib/auth/require-admin.ts`, `lib/policies/state-machine.ts`, `lib/policies/transitions.ts`, `scripts/check-admin-routes.ts` existence + key invariants (e.g., `immediatelyRender: false` in `PolicyEditor.tsx`; `'use server'` + `withOrgScope(` in each `actions.ts`; `ADMIN_URL_PATTERNS` declaration in `middleware.ts`).

---

### `tests/types.ts` (EXTEND — type-only test)

**Analog:** self (`tests/types.ts:1-37`).

**Existing Phase 2 pattern (verbatim from `tests/types.ts:29-36`):**
```typescript
// @ts-expect-error — Acknowledgments must not expose `update` (ADR-018 append-only)
void Acknowledgments.update;

// @ts-expect-error — Acknowledgments must not expose `delete` (ADR-018 append-only)
void Acknowledgments.delete;

// @ts-expect-error — Policies.create input must omit `tldrSummary` (ADR-005 — generated at publish)
void Policies.create(ORG_SCOPE_STUB, { tldrSummary: 'x' });
```

**Phase 3 extension pattern to append** (verbatim from CONTEXT `<code_context>` Reusable Assets + RESEARCH Code Examples §):
```typescript
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';

// @ts-expect-error — PolicyVersions must not expose `update` (L-05 / ADR-018-spirit)
void PolicyVersions.update;
// @ts-expect-error — PolicyVersions must not expose `delete` (L-05 / ADR-018-spirit)
void PolicyVersions.delete;
```

**What to copy verbatim:** the `@ts-expect-error` directive + `void XxX.method;` pattern. Append after existing `void Policies.create(...)` line.

**What differs:** New imports for `PolicyVersions`. Two new directives.

**RESEARCH Pitfall 11 reminder:** the directive's polarity is inverted — when the property is MISSING (the invariant holds), `tsc --noEmit` passes; when the property is ADDED (regression), `tsc --noEmit` fails on the "unused @ts-expect-error" diagnostic.

---

### `package.json` (MODIFY)

**Analog:** self (`package.json:1-64`).

**Existing scripts shape from `package.json:9-24`:**
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "verify:phase-1": "tsx --env-file=.env.local scripts/check-foundation.ts && pnpm check:artifacts",
  "verify:phase-2": "tsx --env-file=.env.local scripts/check-data-layer.ts",
  "check:db": "tsx --conditions=react-server --env-file=.env.local scripts/check-db.ts",
  "check:artifacts": "tsx scripts/check-artifacts.ts",
  // ...
}
```

**Phase 3 additions** (RESEARCH Code Examples § package.json):
```json
{
  "scripts": {
    "verify:phase-3": "pnpm typecheck && tsx scripts/check-admin-routes.ts && pnpm check:artifacts",
    "check:admin-routes": "tsx scripts/check-admin-routes.ts"
  },
  "dependencies": {
    "@tiptap/react": "2.27.2",
    "@tiptap/starter-kit": "2.27.2",
    "@tiptap/extension-link": "2.27.2",
    "@tiptap/html": "2.27.2",
    "zod": "^3.23.5"
  }
}
```

**What to copy verbatim:** the `tsx --env-file=.env.local scripts/...` invocation style from the existing `verify:phase-2`. The `pnpm check:artifacts` chain composition style.

**What differs:** new `verify:phase-3` script orchestrates the new gates. zod 3.x (NOT 4.x per RESEARCH Pitfalls / Stack table). 4 new `@tiptap/*` deps at locked 2.27.2. Note: RESEARCH explicitly excludes `react-hook-form` and `@hookform/resolvers` per D-09 + Pitfall §9.

---

## Shared Patterns

### Server-only module guard

**Source:** `lib/auth/context.ts:11` + `lib/db/scoped.ts:14` + every repository.
**Apply to:** All new `lib/policies/*.ts`, all new `app/(admin)/**/actions.ts`, all server-only utilities.

```typescript
import 'server-only';
```

Must be the FIRST non-comment line of every server-only module. Triggers a hard build error if a Client Component or browser bundle imports it.

---

### `getOrgContext()` + `withOrgScope()` wrap

**Source:** `lib/auth/context.ts:42-64` (resolver) + `lib/db/scoped.ts:41-67` (wrapper).
**Apply to:** Every page (Server Component) and Server Action that reads/writes org-scoped data.

```typescript
const ctx = await getOrgContext();
const result = await withOrgScope(ctx, async (s) => {
  // repository calls take `s` as first arg
  return await Policies.findById(s, id);
});
```

Mandated by ADR-019 + ADR-023 + ADR-025 + CLAUDE.md "Multi-Tenancy Rules". Caught by `scripts/check-db-imports.ts` (Phase 2 gate) — Phase 3 does NOT widen the ALLOWLIST.

---

### Repository method shape: `OrgScope`-first signature

**Source:** every file in `lib/db/repositories/*.ts` (e.g., `users.ts:24-43`, `policies.ts:32-57`).
**Apply to:** all new repository methods filled in Phase 3.

```typescript
export const Repo = {
  methodName: (s: OrgScope, ...args) =>
    s.tx.select().from(table).where(eq(table.orgId, s.orgId)),
};
```

INSERT methods must additionally copy `s.orgId` into the row (D-02 denormalization invariant). Repository files MUST NOT import raw `db` from `@/lib/db` — only `OrgScope` from `@/lib/db/scoped`.

---

### SF-M4 fold: try/catch around `await auth()`

**Source:** `middleware.ts:51-65` + `lib/auth/context.ts:43-54`.
**Apply to:** Any new code path that calls Clerk's `auth()` directly.

```typescript
try {
  session = await auth();
} catch (err) {
  throw new Error(`Clerk auth() failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
}
```

Phase 3 generally does NOT call `auth()` directly — it goes through `getOrgContext()` (which already has the fold). But `app/(auth)/post-sign-in/page.tsx` may need its own try/catch around `getOrgContext()` to handle the no-org case.

---

### Server Action shape

**Source:** RESEARCH Pattern 6 (no in-repo analog — first Server Action shipment).
**Apply to:** `app/(admin)/policies/new/actions.ts`, `app/(admin)/policies/[id]/actions.ts`, any future Server Action.

```typescript
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
// ... Zod schema ...

export async function someAction(_prev: unknown, formData: FormData) {
  let result;
  try {
    const parsed = SomeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
    const ctx = await getOrgContext();
    result = await withOrgScope(ctx, async (s) => /* ... */);
  } catch (err) {
    return { error: { _form: ['Something went wrong'] } };
  }
  revalidatePath('/policies');           // ⚠ BEFORE redirect (RESEARCH Pitfall 4)
  redirect(`/policies/${result}`);       // ⚠ OUTSIDE try/catch (RESEARCH Pitfall 3)
}
```

---

### CTA pattern: `<Link className={buttonVariants(...)}>`

**Source:** `app/(marketing)/page.tsx:32-37`.
**Apply to:** All admin-page CTAs (Create policy, Save draft, Back to library, etc.).

```typescript
<Link href="/policies/new" className={buttonVariants({ variant: 'default' })}>
  Create policy
</Link>
```

The shadcn `base-nova` preset's `<Button>` does NOT expose `asChild` per the operator's comment at `app/(marketing)/page.tsx:4-7`. Always use `<Link className={buttonVariants(...)}>` for CTAs.

---

### ts-morph audit script footer

**Source:** `scripts/check-db-imports.ts:135-167`.
**Apply to:** `scripts/check-admin-routes.ts`.

```typescript
// At top of main():
if (positiveControlHits < EXPECTED_MIN) {
  console.error(`positive control failed: expected ≥${EXPECTED_MIN} hits, found ${positiveControlHits}`);
  process.exit(1);
}

// Per-violation:
if (violations.length > 0) {
  console.error('violations:');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`OK — N hits, 0 violations.`);
process.exit(0);

main().catch((err: unknown) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
```

---

### `@ts-expect-error` invariant block

**Source:** `tests/types.ts:29-36`.
**Apply to:** L-05 invariants for `PolicyVersions.update` and `PolicyVersions.delete`.

```typescript
// @ts-expect-error — REASON
void Module.forbiddenMethod;
```

Polarity is inverted: passes when property is MISSING, fails when added (RESEARCH Pitfall 11).

---

### Skeleton-extension repository pattern

**Source:** `lib/db/repositories/users.ts` (Phase-2-stubbed `create` body) + `lib/db/repositories/acknowledgments.ts` (no-update-no-delete shape).
**Apply to:** `lib/db/repositories/policies.ts`, `policy_versions.ts`, `workflow_stages.ts` extensions.

Existing skeleton header comments + imports + stub-throw signatures stay. New method bodies REPLACE the `throw new Error('Not yet implemented — Phase 3 (Admin UI)')` lines. ADR-005's `Omit<..., 'tldrSummary'>` invariant on `PolicyCreateInput` stays.

---

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `components/policy/PolicyEditor.tsx` | Client Component | event-driven | First `'use client'` file in repo. No analog. Use RESEARCH Pattern 3 verbatim. |
| `components/policy/PolicyView.tsx` | Server Component (HTML render) | transform | First server-side `dangerouslySetInnerHTML` usage. Use RESEARCH Pattern 4 verbatim. |
| `components/policy/PolicyTransitionMenu.tsx` | Client Component (DropdownMenu) | event-driven | First Client Component with shadcn `<DropdownMenu>` integration. No analog. Refer to UI-SPEC § Copywriting Contract + state-machine `ALLOWED_TRANSITIONS`. |

For these, the planner should:
1. Paste from RESEARCH Patterns 3 + 4 verbatim (PolicyEditor / PolicyView).
2. Compose PolicyTransitionMenu from shadcn `<DropdownMenu>` primitives + the `ALLOWED_TRANSITIONS` lookup, using a `<form action={transitionAction}>` per legal transition (Server Action authority — RESEARCH Anti-Patterns).
3. Add `scripts/check-admin-routes.ts` regex assertion that `PolicyEditor.tsx` contains the literal `immediatelyRender: false` (RESEARCH Pitfall 1).

---

## Metadata

**Analog search scope:** `app/`, `lib/`, `components/`, `middleware.ts`, `tests/`, `scripts/`.
**Files scanned:** 30 source files (all under 2KB-50KB range; full reads, no offset/limit needed).
**Pattern extraction date:** 2026-05-19
**On-disk commit:** `gsd/phase-3-admin-ui` HEAD (post-Phase-2 merge to `main` via PR #2).

## PATTERN MAPPING COMPLETE
