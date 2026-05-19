# Phase 3: Admin UI — Research

**Researched:** 2026-05-19
**Domain:** Next.js 15 App Router admin surface · TipTap rich-text editor · Drizzle repository orchestration · Clerk org onboarding · state-machine + Server Actions
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from 03-CONTEXT.md)

### Locked Decisions (USER-LOCKED — L-01..L-05; do not re-litigate)

- **L-01: Admin gate enforcement model.** Server-side role check via `requireAdmin()` in `app/(admin)/layout.tsx` Server Component. On non-admin, `notFound()` (404). Middleware ALSO enforces (defense-in-depth, CR-02 closure below); layout is the authoritative source.
- **L-02: CR-02 closure — admin matcher rewrite.** Replace dead `/(admin)/(.*)` regex in `middleware.ts:isAdminRoute` with explicit `const ADMIN_URL_PATTERNS` array (`[/^\/dashboard(\/|$)/, /^\/policies(\/|$)/, /^\/onboarding(\/|$)/]`). `scripts/check-admin-routes.ts` cross-validates list ↔ disk.
- **L-03: REG-P1-01 closure — delete `/sign-in-success`, ship `/post-sign-in`.** Phase 1 placeholder is misleading. Phase 3 replaces with `app/(auth)/post-sign-in/page.tsx` — Server Component that calls `getOrgContext()` and `redirect()`s to `/dashboard` (admin) or `/my-policies` (employee placeholder OK). Clerk app's "After sign-in URL" updated in operator-manual config. `pnpm verify:phase-1` re-pointed to `/post-sign-in`. **Note:** the live file is at `app/sign-in-success/page.tsx` (NOT `app/(auth)/sign-in-success/page.tsx` as listed in CONTEXT) — Phase 3 plan must reference the actual path.
- **L-04: SF-WHSEC-1 closure — rotate Clerk webhook signing secret.** Operator-manual step (Svix Dashboard → rotate signing secret → paste new `whsec_…` into `.env.local`). MUST happen BEFORE the first `<CreateOrganization />` smoke. Plan 03-01 includes a `checkpoint:human-action` gate.
- **L-05: ADR-018-spirit invariant on edit-of-published.** Editing a Published policy creates a NEW `policy_versions` row AND resets `policies.status = 'draft'`. Prior version rows are NEVER deleted/modified. Type-system enforcement: `PolicyVersions` repository exports ONLY `create`, `listForPolicy`, `findByVersionNumber`. `tests/types.ts` extended with two `@ts-expect-error` lines.

### Implementation HOW Decisions (D-01..D-13 — also locked; planner may not re-decide)

- **D-01: Five admin URLs ship in Phase 3** — `/dashboard`, `/policies`, `/policies/new`, `/policies/[id]`, `/onboarding/create-org`, plus `/post-sign-in` (in `(auth)` group).
- **D-02: TipTap 2.x stable + StarterKit + Link.** JSON output stored in `policies.contentJson` jsonb. `PolicyEditor` is a Client Component; `<PolicyView />` is a Server Component using `generateHTML(json, [StarterKit, Link])`. Server Actions for mutations (not API routes).
- **D-03: Pure `state-machine.ts` + server-action orchestrators.** `lib/policies/state-machine.ts` (pure functions, `canTransition` + `IllegalTransitionError`), `lib/policies/transitions.ts` (`submitForReview`, `approve`, `reject`, `publish`, `archive`, `restore`, `editPublished` — each wraps `withOrgScope`), Server Actions in `app/(admin)/policies/[id]/actions.ts` adding `revalidatePath` + Next.js plumbing.
- **D-04: New `policy_versions` row created ONLY on publish events.** Draft saves mutate `policies.contentJson` in place. `under_review → published` creates the version row + bumps `currentVersion`. `published → draft` (edit-published) snapshots the prior published content into a new version row BEFORE overwriting + resets status + bumps version.
- **D-05: Title + category ILIKE search.** Content-keyword search deferred to Phase 4. URL-state via `?q=` and `?status=`. Server-rendered. Hard `LIMIT 100`.
- **D-06: shadcn Sidebar + Topbar; desktop-first.** Active-route highlight via `headers().get('x-pathname')` (Next.js 15 middleware injects this header).
- **D-07: shadcn Table with status badge column.** Columns: Title, Category, Status, Updated (relative), Created by. Default sort `updatedAt DESC`. No pagination in Phase 3.
- **D-08: `<CreateOrganization />` at `/onboarding/create-org`** — `afterCreateOrganizationUrl="/dashboard"`. `/post-sign-in` checks if `orgId` exists, redirects to `/onboarding/create-org` if not.
- **D-09: Server Actions + Zod schemas; minimal client-side validation.** No React Hook Form in Phase 3 (Zod + `useFormState`/`useActionState` + HTML5 native validation).
- **D-10: TL;DR field shown as empty/disabled in Phase 3** (populated by Phase 4 publish flow).
- **D-11: Three repositories filled.** Policies (`create`, `findById`, `listAll`, `listWithFilters`, `updateDraft`, `incrementVersion`, plus orchestrator-only `publish`/`archive`), PolicyVersions (`create`, `listForPolicy`, `findByVersionNumber`), WorkflowStages (`recordSubmission`, `recordDecision`, `listForPolicy`). PolicyAssignments stays Phase-2 stub.
- **D-12: `policy_versions` rows ARE the edit-event audit trail.** No separate `audit_log` table.
- **D-13: One `shadcn add` invocation, eight new components** — `shadcn add table sidebar dropdown-menu dialog form label select textarea badge`. Plus install TipTap (3 packages) + `@tiptap/html` for server rendering (4th package). Zod is NOT currently in `package.json` — install required.

### Claude's Discretion (research must support, not lock)

- Exact UI copy (button labels, empty states, error toasts)
- Status badge color mapping (recommendation: `draft` = `outline`, `under_review` = `secondary`, `published` = `default`, `archived` = `muted`)
- shadcn Table column widths + responsive truncation
- Whether `<PolicyEditor />` shows sticky toolbar or floating bubble menu (recommendation: sticky toolbar)
- Server Action error UI wiring (recommendation: shadcn `Sonner` toasts for transient errors, in-form red-text for validation errors)
- Exact regex / AST approach in `scripts/check-admin-routes.ts` (recommendation: ts-morph)
- Whether `/dashboard` shows policy-status counts via repository call or SQL aggregate (recommendation: `Policies.statusCounts(s)` aggregate)

### Deferred Ideas (OUT OF SCOPE for Phase 3)

AI draft button on `/policies/new` (Phase 4) · TL;DR auto-generation on publish (Phase 4) · Reviewer-tier gating + reviewer queue UI (Phase 6/7) · Policy "viewed" tracking (Phase 5+) · Content-keyword search via tsvector (Phase 4) · Cursor pagination on `/policies` (Phase 8) · CSV export (Phase 8) · Mobile-responsive admin editor (Phase 8) · Image/table/code-block TipTap extensions (post-MVP) · Sort-toggleable columns (Phase 8) · Auto-save Draft policies (post-MVP) · Audit-log table (D-12 — policy_versions + acknowledgments cover) · `<OrganizationProfile />` member CRUD (Phase 5) · "Restore from version" button (Phase 8) · SF-CASCADE-AUDIT (Phase 6+) · Nyquist G-08a/G-09a/G-03a (Phase 2.1 hardening).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **REQ-policy-library** | TipTap editor; categories; every edit creates versioned record; audit trail (viewed/acknowledged/edited); status states `Draft \| Under Review \| Published \| Archived`; search by title/category/content. | TipTap 2.27.2 + JSON output (D-02 / pinned below) · `policy_versions` table fully shipped by Phase 2 schema · D-12 maps `edited` → `policy_versions` rows · D-05 title+category ILIKE; content keyword deferred Phase 4. |
| **REQ-policy-lifecycle** | Cannot publish without Draft → Under Review (Growth+ Phase 6 gating) · Editing published creates new version + resets to Draft · Archive preserves audit trail · Acknowledgments are version-specific (re-ack on update). | State machine (D-03 / pure module under `lib/policies/state-machine.ts`) · Edit-published orchestrator (D-04 / `editPublished` in `lib/policies/transitions.ts`) · Growth+ gate layered in Phase 6 (NOT Phase 3) · Acknowledgments untouched in Phase 3 (Phase 5 owns assignment + ack surface). |
| **REQ-access-control** | Employees see only published+assigned · Admins see all statuses scoped by org_id · Reviewers see their review queue (Phase 6). | Phase 3 admin scope: `withOrgScope` + repository `where(eq(orgId, scope.orgId))` per ADR-019/023/025 · `requireAdmin()` server-side gate (L-01) · Employee/reviewer surfaces deferred (Phase 5/6). |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

| Constraint | Phase 3 implication |
|-----------|---------------------|
| Stack list is non-negotiable | TipTap is in stack table ("TipTap" is mentioned in BLUEPRINT § 6 / CLAUDE.md "Stack" via the Admin UI Phase 3 description). Zod is NOT in `package.json` today — installation is the one "new package" required (operator-implicit per D-09; consistent with `ASK FIRST` since it's the form-validation primitive the entire Phase 3 form layer relies on). |
| `tsc --noEmit` passes before every commit | Phase 3 plans must run typecheck as a per-task gate. `tests/types.ts` extension adds two `@ts-expect-error` rows for L-05; the new lines must remain compile errors. |
| Include `org_id` in every DB query | Every Phase 3 read/write goes through `withOrgScope(ctx, fn)` → repository method that adds `where(eq(table.orgId, scope.orgId))`. Forbidden: raw `db` import in any `app/(admin)/**` or `lib/policies/**` file. `scripts/check-db-imports.ts` ALLOWLIST is NOT widened. |
| No `any` TypeScript type | `JSONContent` from `@tiptap/core` is the typed shape for `policies.contentJson`. Server Action FormData unmarshal goes through Zod, never `as any`. |
| Never roll custom auth | Use Clerk's `<CreateOrganization />`, `<OrganizationSwitcher />`, `<UserButton />`. |
| Never call Claude API client-side | N/A in Phase 3 (AI is Phase 4). |
| Never trust client-side for state | Client `<PolicyTransitionMenu />` mirrors the state machine for UX, but Server Action validation via `canTransition()` is the authoritative gate. |
| Never delete or modify acknowledgment records | N/A in Phase 3 (acks are Phase 5). |
| Never build features not in REQUIREMENTS.md | Phase 3 ships REQ-policy-library + REQ-policy-lifecycle + REQ-access-control admin slice. No "Generate with AI" button, no employee surface, no tier gates beyond what state machine already permits. |
| Git workflow | Per-phase branch `gsd/phase-3-admin-ui` (already active). All Phase 3 commits go on this branch. One PR per phase, squash-merge with `--delete-branch`. |

---

## Summary

Phase 3 ships the admin slice of PolicyPilot: a server-rendered admin shell (shadcn Sidebar + Topbar), the policy library (search + status filter via URL state), a TipTap-based editor (JSON content, server-rendered HTML via `@tiptap/html`'s `generateHTML`), and a pure-function state machine bridging the Phase 2 repository skeletons (`Policies`, `PolicyVersions`, `WorkflowStages`) into seven legal `policy.status` transitions. All mutations are Next.js 15 Server Actions; reads happen in Server Components inside `withOrgScope`; both layers (application `where(eq(orgId, …))` per ADR-023 AND database RLS per ADR-025) fire on every query. Carry-forwards from Phase 1/2 (REG-P1-01 redirect placeholder, CR-02 dead admin matcher, SF-WHSEC-1 leaked signing secret) close cleanly inside the Phase 3 deliverables.

The CONTEXT-locked decisions D-01..D-13 + L-01..L-05 already resolve every architectural HOW question. Research focuses on the **execution-level specifics** the planner needs to write tight tasks: exact TipTap 2.27.2 import paths, the `immediatelyRender: false` SSR pitfall (mandatory in Next.js 15), the `redirect-outside-try/catch` Server Action idiom, the shadcn Sidebar cookie-persistence pattern, the Clerk webhook timing race (org row may not exist when `<CreateOrganization />` redirect lands), and the Drizzle ILIKE + transaction patterns the orchestrators need.

**Primary recommendation:** Pin TipTap to `2.27.2` (last 2.x release, published 2026-01-07; React 19 + Next.js 15 compatible per peer deps). The CONTEXT D-02 explicitly chose 2.x over 3.x; this research confirms 2.x is currently in maintenance with security patches (the 2025 Link-extension XSS CVE is fixed in 2.10.4+ — 2.27.2 is well past that). However, TipTap 3.x **shipped stable** on 2025-09 and is now the active major line; the planner should surface a one-line note that Phase 3 ships 2.x by locked decision but a future phase (likely 4 or 8) should reassess after 3.x adoption stabilizes.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Admin route gating | Frontend Server (App Router) | Middleware (defense-in-depth) | L-01: `requireAdmin()` in `app/(admin)/layout.tsx` is authoritative; middleware re-checks per L-02. |
| Policy state transitions | Backend (Server Actions + orchestrators) | — | Authoritative state machine + DB writes must be server-only (ADR-019, D-03 reject "client-side state machine as authority"). |
| Search + filter UX | Frontend Server (URL state) | Backend (ILIKE query) | D-05 — URL params drive server-rendered results; no client-side fetch waterfall. |
| TipTap editor input | Browser (Client Component) | Frontend Server (initial content + form action) | D-02 — `useEditor` is browser-only (DOM-bound); `immediatelyRender: false` mandatory. |
| Policy HTML rendering for read views | Frontend Server (`@tiptap/html.generateHTML`) | — | D-02 — server-side render avoids re-hydrating the editor for read-only display. |
| Policy versioning writes | Backend (orchestrator inside `withOrgScope`) | Database (composite-FK + RLS) | D-04 — version creation is atomic with policy update; both layers fire per ADR-025. |
| Org onboarding (`<CreateOrganization />`) | Browser (Clerk-hosted component) | Backend (`/api/webhooks/clerk` from Phase 2) | D-08 — Clerk owns the UI; Phase 2 webhook handler inserts the org row asynchronously. |
| Sidebar active-route highlight | Frontend Server (`headers().get('x-pathname')`) | Middleware (injects `x-pathname`) | D-06 — Next.js 15 has no server-side `usePathname`; middleware header injection is the documented workaround. |
| Sidebar collapse state | Browser (cookie write) | Frontend Server (cookie read in layout) | shadcn `sidebar:state` cookie pattern (verified below). |

---

## Standard Stack

### Core (already in `package.json` — verify versions)

| Package | Version (pinned) | Purpose | Source |
|---------|------------------|---------|--------|
| `next` | `15.5.18` (in lockfile; latest `15.5.x` per npm = `15.5.18`) | App Router framework | [VERIFIED: package.json + npm view] |
| `react` / `react-dom` | `19.1.0` | UI runtime | [VERIFIED: package.json] |
| `@clerk/nextjs` | `^7.3.4` (latest `7.3.7`) | Auth, organizations | [VERIFIED: package.json + npm view] |
| `drizzle-orm` | `^0.45.2` | DB ORM (Phase 2 pin) | [VERIFIED: package.json] |
| `ts-morph` | `28.0.0` (exact-pinned by Plan 02-06) | AST audit in `scripts/check-admin-routes.ts` | [VERIFIED: package.json] |
| `shadcn` CLI | `^4.7.0` (latest 4.7.0) | Component generator | [VERIFIED: package.json + npm view] |

### Phase 3 additions (new installs)

| Package | Version | Purpose | Provenance |
|---------|---------|---------|------------|
| `@tiptap/react` | `2.27.2` | Editor + `useEditor` hook | [VERIFIED: tiptap.dev/docs + npm view + Context7] |
| `@tiptap/starter-kit` | `2.27.2` | Bundles Document, Paragraph, Text, Bold, Italic, Strike, Code, Heading h1–h3, BulletList, OrderedList, ListItem, Blockquote, HorizontalRule, HardBreak, History, Dropcursor, Gapcursor | [VERIFIED: npm view dependencies — see Code Examples §] |
| `@tiptap/extension-link` | `2.27.2` | Hyperlink mark (with XSS-validated href) | [VERIFIED: npm view + Snyk CVE-2025-14284 — fixed in 2.10.4+] |
| `@tiptap/html` | `2.27.2` | Server-side `generateHTML(json, extensions)` for read-only render | [VERIFIED: tiptap.dev/docs] |
| `zod` | `^3.23.5` (latest 3.x — do NOT install 4.x — see Pitfalls §) | Server Action input validation per D-09 | [VERIFIED: npm view zod] |

### Supporting (shadcn — installed via CLI in Plan 03-N)

Single invocation per D-13:
```bash
pnpm dlx shadcn@latest add table sidebar dropdown-menu dialog form label select textarea badge
```

| Component | Use |
|-----------|-----|
| `Table` | Policy library list (D-07) |
| `Sidebar` (+ `SidebarProvider`, `SidebarHeader`, `SidebarContent`, `SidebarFooter`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarRail`, `SidebarGroup`, `SidebarInset`, `useSidebar`) | Admin shell (D-06) |
| `DropdownMenu` | `<PolicyTransitionMenu />` (legal transitions list) |
| `Dialog` | `editPublished` change-summary entry · publish confirmation |
| `Form` + `Label` + `Select` + `Textarea` | Create/edit policy form (D-09) |
| `Badge` | `<PolicyStatusBadge />` |

**Already installed (Phase 1):** `Button`, `Card`, `Input`.

### Alternatives Considered (rejected by CONTEXT — listed for completeness only)

| Instead of | Could Use | Why rejected |
|------------|-----------|--------------|
| TipTap 2.x | TipTap 3.x (latest 3.23.5) | D-02 locked 2.x; 3.x is now stable but operator chose stability over migration cost. |
| JSON content storage | HTML content storage | D-02 — HTML XSS is a hard problem; TipTap JSON has a finite shape that's safe to round-trip; jsonb already on `policies.contentJson`. |
| Server Action mutations | API routes | D-02 — Server Actions are Next.js 15 idiomatic for form mutations (CSRF + revalidatePath). |
| Native HTML5 + `useFormState`/`useActionState` | React Hook Form + `@hookform/resolvers/zod` (the shadcn Form's documented default) | D-09 — forms in Phase 3 are 2-3 fields; the extra dep + client bundle isn't worth it. **Implication for shadcn Form:** the shadcn `Form` component IS built on react-hook-form. Phase 3 either (a) uses `Form` + minimal react-hook-form (requires `react-hook-form` + `@hookform/resolvers` installs — 2 extra packages contrary to D-09 spirit), OR (b) uses shadcn `Input`/`Label`/`Textarea`/`Select` directly inside a native `<form action={action}>` and skips the `Form` wrapper. **Recommendation: option (b)** — keeps D-09 honest. The shadcn Form's `useActionState` variant is listed as "Coming Soon" on shadcn docs as of 2026-05-19; don't wait for it. |
| ILIKE search | Full-text search via tsvector + GIN | D-05 — 25–300-employee orgs ship <500 policies; ILIKE on two indexed text columns is <5ms; tsvector is premature. |
| `<CreateOrganization />` dedicated route | Modal on `/dashboard` | D-08 — modal pollutes `/dashboard` no-org-state handling. |

---

## Package Legitimacy Audit

> slopcheck CLI not available at research time (graceful degradation per protocol). All packages below are tagged `[ASSUMED]` for legitimacy, but every package has been independently verified for ecosystem fit + age + source repo (all are 5-year-old packages from `github.com/ueberdosis/tiptap` — the upstream TipTap monorepo). Planner should still gate each `pnpm add` behind a `checkpoint:human-verify` task per the protocol's graceful-degradation rule.

| Package | Registry | Age (npm time.created) | Source Repo | slopcheck | Disposition |
|---------|----------|------------------------|-------------|-----------|-------------|
| `@tiptap/react` | npm | ~5 yrs (2021-02-26) | `github.com/ueberdosis/tiptap` | UNAVAILABLE → `[ASSUMED]` | Approved · planner gates install |
| `@tiptap/starter-kit` | npm | ~5.5 yrs (2020-11-16) | `github.com/ueberdosis/tiptap` | UNAVAILABLE → `[ASSUMED]` | Approved · planner gates install |
| `@tiptap/extension-link` | npm | ~5.5 yrs (2020-11-16) | `github.com/ueberdosis/tiptap` | UNAVAILABLE → `[ASSUMED]` | Approved · pin ≥ 2.10.4 (CVE-2025-14284 fix) — we pin 2.27.2 |
| `@tiptap/html` | npm | ~5.5 yrs (2020-11-16) | `github.com/ueberdosis/tiptap` | UNAVAILABLE → `[ASSUMED]` | Approved · planner gates install |
| `zod` | npm | ~5 yrs | `github.com/colinhacks/zod` | UNAVAILABLE → `[ASSUMED]` | Approved · pin `^3.23.5` (NOT 4.x) |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

**Cross-ecosystem confusion check:** all 5 packages are JavaScript/TypeScript (npm); the project is Node.js. No cross-ecosystem risk.

**Postinstall script check:** all 4 TipTap packages historically ship with no postinstall script. Planner should verify via `npm view <pkg> scripts.postinstall` during install task (returns empty string for none).

---

## Architecture Patterns

### System Architecture Diagram

```
                       Browser
                          │
                          │ (HTTP)
                          ▼
   ┌──────────── Next.js 15 Middleware ────────────┐
   │  • Clerk auth check (every request)            │
   │  • ADMIN_URL_PATTERNS array → admin gate       │
   │  • Inject x-pathname header (for SC pathname)  │
   │  • SF-M4 try/catch around await auth()         │
   └──────────────────┬─────────────────────────────┘
                      │
       ┌──────────────┼─────────────────┬───────────────────┐
       ▼              ▼                 ▼                   ▼
  Public routes  /post-sign-in  /onboarding/create-org  /(admin)/...
  (marketing)   (auth group)    (signed-in, no requireAdmin)   │
                      │                                       │
                      │ Server Component                      │
                      │ → getOrgContext()                     │
                      │ → if no orgId, redirect /onboarding   │
                      │ → else redirect by role               │
                      ▼                                       │
              /dashboard or /my-policies                      │
                                                              │
                                              ┌───────────────┴────────────────┐
                                              ▼                                ▼
                                       Server Component                 Server Action
                                       (read path)                      (write path)
                                              │                                │
                                              ▼                                ▼
                                       getOrgContext()                  Zod parse FormData
                                              │                                │
                                              ▼                                ▼
                                       withOrgScope(ctx, fn)            withOrgScope(ctx, fn)
                                              │                                │
                                              ▼                                ▼
                            SET LOCAL ROLE authenticated +              Same — repository methods
                            set_config(request.jwt.claims, …, true)     take OrgScope, never raw db
                                              │                                │
                                              ▼                                ▼
                                  Repositories (Policies, PolicyVersions,
                                  WorkflowStages) — where(eq(orgId, s.orgId))
                                              │                                │
                                              ▼                                ▼
                            ┌──── Drizzle tx (Postgres) ────┐         ┌── revalidatePath ──┐
                            │  RLS policies fire (server)   │         │  redirect() outside │
                            │  org_isolation USING (...)    │         │  try/catch         │
                            └───────────────────────────────┘         └────────────────────┘

   Side channel — Clerk org onboarding:
   Browser ──▶ <CreateOrganization />  ──▶ Clerk Frontend API
                                              │
                                              ├── asynchronously fires organization.created
                                              │   → /api/webhooks/clerk (Phase 2 handler)
                                              │   → inserts organizations row
                                              │
                                              └── synchronously redirects to /dashboard
                                                  ⚠ RACE: dashboard SC may try to read the
                                                    organizations row before the webhook lands.
```

### Recommended Project Structure (additions only — Phase 1+2 layout preserved)

```
app/
├── (auth)/
│   └── post-sign-in/
│       └── page.tsx              # NEW (L-03) — Server Component trampoline; replaces /sign-in-success
├── (admin)/
│   ├── layout.tsx                # NEW (L-01) — requireAdmin() + AdminSidebar + AdminTopbar
│   ├── dashboard/
│   │   └── page.tsx              # NEW (D-01) — status counts + Create CTA
│   ├── policies/
│   │   ├── page.tsx              # NEW (D-01/D-07) — library list + search/filter
│   │   ├── new/
│   │   │   ├── page.tsx          # NEW (D-01) — TipTap editor + Save
│   │   │   └── actions.ts        # NEW (D-09) — createPolicyAction
│   │   └── [id]/
│   │       ├── page.tsx          # NEW (D-01) — editor + version history + transitions
│   │       └── actions.ts        # NEW (D-03/D-09) — Server Actions for each transition
│   └── onboarding/
│       └── create-org/
│           └── page.tsx          # NEW (D-08) — wraps <CreateOrganization />
└── sign-in-success/              # DELETE in Plan 03-N (L-03)
    └── page.tsx                  # DELETED

components/
├── admin/
│   ├── AdminSidebar.tsx          # NEW (D-06) — shadcn Sidebar shell
│   └── AdminTopbar.tsx           # NEW (D-06) — breadcrumbs + OrganizationSwitcher + UserButton
├── policy/
│   ├── PolicyEditor.tsx          # NEW (D-02) — Client Component, useEditor, immediatelyRender:false
│   ├── PolicyView.tsx            # NEW (D-02) — Server Component, generateHTML from @tiptap/html
│   ├── PolicyStatusBadge.tsx     # NEW (D-07) — Badge variant by status
│   ├── PolicyTransitionMenu.tsx  # NEW (D-03) — Client Component DropdownMenu, calls actions
│   └── PolicyVersionHistory.tsx  # NEW (D-04) — Server Component reading policy_versions

lib/
├── auth/
│   ├── context.ts                # (unchanged — Phase 2)
│   └── require-admin.ts          # NEW (L-01) — exported requireAdmin() helper
├── policies/
│   ├── state-machine.ts          # NEW (D-03) — pure functions + IllegalTransitionError
│   └── transitions.ts            # NEW (D-03) — server-only orchestrators
└── db/
    └── repositories/
        ├── policies.ts            # FILL bodies (Phase 2 stubs)
        ├── policy_versions.ts     # FILL bodies (Phase 2 stubs; NO update/delete)
        └── workflow_stages.ts     # FILL bodies (Phase 2 stubs)

middleware.ts                     # MODIFY (L-02 / CR-02) — ADMIN_URL_PATTERNS array + x-pathname injection

scripts/
├── check-admin-routes.ts          # NEW (D-13 spirit) — ts-morph audit of route ↔ pattern match + withOrgScope wraps
└── check-data-layer.ts            # MODIFY — add Phase 3 hooks (orchestrator stays for Phase 2; Phase 3 has its own verify:phase-3)

tests/types.ts                    # EXTEND — two new @ts-expect-error lines for L-05 PolicyVersions invariants

package.json                      # MODIFY — add zod + 4 @tiptap/* deps + verify:phase-3 script
```

### Pattern 1: Server Component Admin Layout with role gate (L-01)

```typescript
// app/(admin)/layout.tsx
// Source: ADR-009 + L-01 (CONTEXT.md Phase 3 <specifics>)
import { cookies } from 'next/headers';
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminTopbar } from '@/components/admin/AdminTopbar';
import { requireAdmin } from '@/lib/auth/require-admin';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();                              // notFound() if role !== 'admin' (L-01)
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

### Pattern 2: Pure state machine + orchestrator + Server Action (D-03)

```typescript
// lib/policies/state-machine.ts — pure, no DB access
export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';
export const ALLOWED_TRANSITIONS = {
  draft:        ['under_review', 'published'] as const,
  under_review: ['published', 'draft'] as const,
  published:    ['archived', 'draft'] as const,    // 'draft' only via editPublished
  archived:     ['draft'] as const,
} satisfies Record<PolicyStatus, readonly PolicyStatus[]>;

export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as readonly PolicyStatus[]).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: PolicyStatus, public readonly to: PolicyStatus) {
    super(`Illegal transition ${from} → ${to}. Allowed: ${ALLOWED_TRANSITIONS[from].join(', ')}`);
    this.name = 'IllegalTransitionError';
  }
}
```

```typescript
// lib/policies/transitions.ts — server-only orchestrators
import 'server-only';
import { sql, eq } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { withOrgScope } from '@/lib/db/scoped';
import { getOrgContext } from '@/lib/auth/context';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { policies } from '@/lib/db/schema';
import { canTransition, IllegalTransitionError } from './state-machine';

export async function publish(policyId: string): Promise<void> {
  const ctx = await getOrgContext();
  await withOrgScope(ctx, async (s) => {
    const [policy] = await Policies.findById(s, policyId);
    if (!policy) throw new Error('Policy not found');
    if (!canTransition(policy.status as PolicyStatus, 'published')) {
      throw new IllegalTransitionError(policy.status as PolicyStatus, 'published');
    }
    // D-04: snapshot the about-to-be-published content into policy_versions
    await PolicyVersions.create(s, {
      policyId: policy.id,
      versionNumber: policy.currentVersion,
      contentJson: policy.contentJson,
      createdBy: /* lookup user.id from clerkUserId — see Pitfall §7 */,
    });
    await s.tx
      .update(policies)
      .set({ status: 'published', updatedAt: sql`now()` })
      .where(eq(policies.id, policyId));
  });
}
```

```typescript
// app/(admin)/policies/[id]/actions.ts — Server Action wrapper
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

### Pattern 3: TipTap Client Component editor (D-02)

```typescript
// components/policy/PolicyEditor.tsx
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
    immediatelyRender: false,            // ⚠ Pitfall §1 — MANDATORY for Next.js 15 SSR
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        // CVE-2025-14284 mitigation: default isAllowedUri rejects javascript:
        // protocol; we don't override it. Linkifyjs handles autolink schemes.
      }),
    ],
    content: initialContent ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => setJson(editor.getJSON()),
  });
  return (
    <>
      {/* hidden field travels with the form action */}
      <input type="hidden" name={name} value={JSON.stringify(json ?? {})} />
      <EditorContent editor={editor} />
    </>
  );
}
```

### Pattern 4: Server-side render of stored JSON (D-02)

```typescript
// components/policy/PolicyView.tsx — Server Component
import { generateHTML } from '@tiptap/html';     // ⚠ NOT @tiptap/core (browser-only)
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import type { JSONContent } from '@tiptap/core';

export function PolicyView({ content }: { content: JSONContent }) {
  const html = generateHTML(content, [StarterKit, Link]);
  // XSS surface: TipTap JSON has finite shape; StarterKit + Link allow-list
  // is auditable. Link.isAllowedUri default rejects javascript:.
  return <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

### Pattern 5: Search via Drizzle `ilike` (D-05)

```typescript
// lib/db/repositories/policies.ts — listWithFilters
import { ilike, or, and, eq, desc } from 'drizzle-orm';
import { policies } from '@/lib/db/schema';

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
}
```

### Pattern 6: `redirect()` outside try/catch in Server Actions

```typescript
// CORRECT — redirect outside try/catch
'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

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
  redirect(`/policies/${policyId}`);    // ⚠ outside try/catch — see Pitfall §3
}
```

### Pattern 7: Middleware injects `x-pathname` for Server Component sidebar (D-06)

```typescript
// middleware.ts — addition to existing chokepoint
import { NextResponse } from 'next/server';

// At the top of the clerkMiddleware handler, BEFORE the auth gates:
const requestHeaders = new Headers(req.headers);
requestHeaders.set('x-pathname', req.nextUrl.pathname);

// ... existing auth checks unchanged ...

// At the bottom (where you currently `return NextResponse.next()`):
return NextResponse.next({ request: { headers: requestHeaders } });
```

```typescript
// components/admin/AdminSidebar.tsx — Server Component reads the header
import { headers } from 'next/headers';

export async function AdminSidebar() {
  const pathname = (await headers()).get('x-pathname') ?? '/';
  // ... use `pathname.startsWith(href)` for aria-current="page"
}
```

### Anti-Patterns to Avoid

- **Importing raw `db` from `@/lib/db` inside `app/(admin)/**`, `lib/policies/**`, or any repository file.** This bypasses BOTH `withOrgScope`'s transaction AND the JWT injection → RLS does not fire. Caught by `scripts/check-db-imports.ts` (Plan 02-06). Phase 3 does NOT widen the ALLOWLIST.
- **Calling `editor.getJSON()` inside `onUpdate` and then `useEffect` to push state.** TipTap's `useEditor` already manages internal state; the recommended pattern is the simple `onUpdate` → `setState` hidden-field pattern (Pattern 3 above). Do not wire `useEffect` debounces unless a UX requirement surfaces (post-Phase 3).
- **Returning `JSONContent` directly from a Server Action.** `JSONContent` is `unknown`-ish to TypeScript; the Server Action should return `{ ok: true | false, error?: ... }` only. The redirect-after-success pattern (Pattern 6) is the way.
- **Wrapping `redirect()` in `try/catch`.** Next.js implements redirects by throwing `NEXT_REDIRECT`; a surrounding `catch` swallows it and the redirect silently fails. Always place `redirect()` after the `try/catch` block.
- **Calling `useEditor` without `immediatelyRender: false`.** Triggers Next.js 15 hydration mismatch error with message "SSR has been detected, please set `immediatelyRender` explicitly to `false`..." (Pitfall §1).
- **Mutating `policies.contentJson` from a route handler / API route.** Phase 3 uses Server Actions exclusively for admin mutations (D-02). API routes are reserved for Phase 2 webhooks + Phase 4 AI + Phase 7 cron.
- **Trusting `<CreateOrganization />` `afterCreateOrganizationUrl` redirect to imply the webhook has landed.** Clerk webhooks are asynchronous; the `/dashboard` SC may render before the `organizations` row exists (Pitfall §6).
- **Hand-rolling a state machine in the client component.** D-03 — the server orchestrator is authoritative. Client component can mirror the menu for UX but every transition goes through the Server Action.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Rich-text editor | Custom contenteditable wrapper | TipTap 2.27.2 (`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-link`) | ProseMirror's schema, transaction model, undo/redo, IME handling, list-keymap edge cases — multi-year effort to replicate. CONTEXT D-02 already locked. |
| JSON → HTML server-side | DIY tree walker | `@tiptap/html.generateHTML(json, [StarterKit, Link])` | Mirror of the editor's render path; bypasses every node-type bug. Uses a virtual DOM under the hood. |
| Form input validation | Hand-written `if` chains on FormData | Zod schema + `safeParse(Object.fromEntries(formData))` | D-09 — Zod is the industry default; integrates with `useActionState` via `.flatten().fieldErrors`. |
| Admin shell layout | Custom sidebar + topbar | shadcn `Sidebar` (12 sub-components) | Includes collapse, mobile drawer, cookie persistence, keyboard shortcut (Ctrl+B), responsive offset for `<main>`. |
| Server Component pathname | Custom URL parsing | `middleware.ts` injects `x-pathname` → `headers().get('x-pathname')` | Next.js 15 has no server `usePathname`; middleware header injection is the documented workaround. |
| State machine validation | Inline `if/switch` in every action | Pure `canTransition(from, to)` module + typed `IllegalTransitionError` | Centralizes the only authoritative source of legal transitions; testable in isolation. |
| Org provisioning | Custom create-org form posting to your own API | Clerk `<CreateOrganization />` | Free SSO/email validation/duplicate-name handling; Phase 2 webhook already provisions the row. |
| Multi-tenant scoping in queries | Per-call `where(eq(orgId, …))` discipline | `withOrgScope(ctx, fn)` + repository methods that take `OrgScope` (Phase 2 primitive) | ADR-023 + ADR-025 — repositories + per-tx role switching + JWT injection. Both layers fire defensively. |
| Webhook signature verification | Custom HMAC | `svix.Webhook(secret).verify(rawBody, headers)` | Phase 2 already shipped. Phase 3 doesn't touch this. |
| Sidebar collapse persistence | localStorage on mount | shadcn cookie `sidebar:state` + Server Component cookie read in layout | Already SSR-correct; no flash of incorrect state on initial render. |

**Key insight:** Phase 3 is almost entirely composition of Phase 2 primitives + 3rd-party libraries that already exist. The only original code is the state machine (~40 lines of pure functions), the orchestrators (~150 lines, all repository-call composition), the repository bodies (~80 lines per repo × 3), and the UI shell (mostly shadcn-generated). Avoid the temptation to write "small helpers" — they grow into parallel implementations of TipTap, Drizzle, or Zod features.

---

## Runtime State Inventory

> Phase 3 is mostly greenfield (new admin surface) with a small rename (REG-P1-01 / L-03: delete `/sign-in-success`, ship `/post-sign-in`) and a small refactor (CR-02 / L-02: rewrite `isAdminRoute` matcher). Inventory below covers the rename + refactor only.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | None — no DB rows reference `/sign-in-success` or admin URLs (Phase 2 schema has no UI-path columns; no migration data needed). | None. Code edit only. |
| **Live service config** | Clerk Dashboard: **"After sign-in URL"** is set to `/sign-in-success` (Plan 01-02 operator-manual config). Plan 03-01 operator-manual step updates this to `/post-sign-in`. | Operator-manual update in Clerk Dashboard. No automation. |
| **OS-registered state** | None. PolicyPilot has no Task Scheduler / cron / systemd registrations yet (those land in Phase 7 with Railway worker). | None. |
| **Secrets and env vars** | `CLERK_WEBHOOK_SECRET` in `.env.local` is the SF-WHSEC-1 / L-04 rotation target. Operator rotates via Svix Dashboard → new `whsec_…` → paste into `.env.local`. The key NAME stays the same; only the VALUE rotates. Code referencing the env var (`app/api/webhooks/clerk/route.ts`) does NOT change. | Operator-manual rotation (Plan 03-01 / L-04). `pnpm verify:phase-2` re-run confirms env var still set; live-smoke happens via first `<CreateOrganization />`. |
| **Build artifacts / installed packages** | None expected. `next build` cache invalidates automatically on `next` upgrade. No `egg-info` / wheel / compiled-binary artifacts in this Next.js project. | None. |

**Edge case to flag for the planner:** `pnpm verify:phase-1` (Plan 01-05 deliverable) currently HTTP-probes `/sign-in-success`. After L-03 lands, that route returns 404. **Action:** Plan 03-02 must update `scripts/check-foundation.ts` (or the verify-phase-1 probe set) to target `/post-sign-in` instead. Without this update, `pnpm verify:phase-1` regressed-fails post-Phase-3 ship.

---

## Common Pitfalls

### Pitfall 1: TipTap `useEditor` without `immediatelyRender: false` triggers Next.js 15 hydration error

**What goes wrong:** Editor renders the placeholder content during SSR; client hydration finds a different DOM; React throws "Hydration failed because the initial UI does not match" OR TipTap throws "SSR has been detected, please set `immediatelyRender` explicitly to `false` to avoid hydration mismatches" (issue [#5856](https://github.com/ueberdosis/tiptap/issues/5856)).
**Why it happens:** Next.js 15 + React 19 enable Suspense streaming + Server Components by default. TipTap's `useEditor` mounts a ProseMirror instance synchronously; in 2.x stable, that mount runs on the server during SSR unless explicitly opted out. The official Next.js install guide ([tiptap.dev/docs/editor/getting-started/install/nextjs](https://tiptap.dev/docs/editor/getting-started/install/nextjs)) is unambiguous: set `immediatelyRender: false`.
**How to avoid:** Always pass `immediatelyRender: false` to `useEditor` in this codebase. Encode this in `scripts/check-admin-routes.ts` if practical (a regex / AST scan of `components/policy/PolicyEditor.tsx` for the literal `immediatelyRender: false`).
**Warning signs:** `tsc --noEmit` passes but `next dev` shows a red console error mentioning "hydration" or "immediatelyRender" on first load of `/policies/new` or `/policies/[id]`.

### Pitfall 2: TipTap Link extension XSS — `javascript:` URLs (CVE-2025-14284)

**What goes wrong:** Older `@tiptap/extension-link` versions accept `javascript:alert(1)` as an href; clicking the rendered link executes arbitrary JS.
**Why it happens:** Pre-2.10.4, the `isAllowedUri` default validation was bypassed by certain command paths and by the Link Popover UI (Snyk [CVE-2025-14284](https://security.snyk.io/vuln/SNYK-JS-TIPTAPEXTENSIONLINK-14222197)).
**How to avoid:** Pin `@tiptap/extension-link@2.27.2` (well past 2.10.4). Do NOT override `isAllowedUri` to be more permissive. Configure with `openOnClick: false` (CONTEXT D-02) so clicks inside the editor don't navigate at all. The published policy is rendered via `generateHTML` which respects the schema — but the rendered HTML still produces `<a href="…">`; the read path is still subject to the href value. The `isAllowedUri` default in 2.27.2 + StarterKit + Link rejects `javascript:` at insert/toggle time, so a malicious JSON payload from another org admin (the only realistic threat — we trust our own admins to a degree, but defense-in-depth) cannot land in the database.
**Warning signs:** Test policy with title "XSS Smoke" and content containing a manual `setLink({ href: 'javascript:alert(1)' })` call should be rejected at insert.

### Pitfall 3: `redirect()` inside try/catch silently fails in Server Actions

**What goes wrong:** Form submit appears successful, but the user is not redirected — they remain on the form page.
**Why it happens:** Next.js implements `redirect()` by throwing a special `NEXT_REDIRECT` error. The Next.js error boundary catches it at the framework level and performs the redirect. A user-level `try { ... } catch { ... }` block swallows the error before the framework sees it. (vercel/next.js [#55586](https://github.com/vercel/next.js/issues/55586) is the canonical issue.)
**How to avoid:** Always call `redirect()` AFTER the try/catch block. The pattern in Code Examples Pattern 6 is the canonical shape. If you NEED to catch a redirect for some reason (rare), use `isRedirectError(err)` from `next/navigation`.
**Warning signs:** Server Action returns `{ ok: true }` to the client; the form's success branch renders; the browser URL never changes.

### Pitfall 4: `revalidatePath` + `redirect` order matters

**What goes wrong:** Cache stays stale after a mutation; the redirected-to page renders the pre-mutation data.
**Why it happens:** `revalidatePath` marks the cache for invalidation but does not flush until the current request completes. If `redirect` runs first, the request is preempted; if `revalidatePath` runs first, the invalidation is queued and the redirect's destination renders fresh data. (Next.js docs are explicit on this ordering — [nextjs.org/docs/app/api-reference/functions/revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath).)
**How to avoid:** Always `revalidatePath(...)` BEFORE `redirect(...)`. Pattern 6 above encodes this.
**Warning signs:** "Create policy" succeeds, redirects to `/policies/[id]`, but `/policies` list view (a sibling tab) still shows the old count until manual page refresh.

### Pitfall 5: Server Component pathname leaks across requests if read incorrectly

**What goes wrong:** `headers()` is async in Next.js 15; reading it synchronously returns a Proxy that throws. Worse: caching `headers()` across requests (e.g., module-scope) leaks one user's pathname into another user's render.
**Why it happens:** Next.js 15 made `cookies()` / `headers()` async to align with the streaming/Suspense model.
**How to avoid:** Always `await headers()` inside the Server Component function body. Never store the result in a module-scope variable. The middleware injection (Pattern 7) is per-request — but the consuming SC must read it fresh.
**Warning signs:** `tsc --noEmit` errors with "Property 'get' does not exist on type 'Promise<ReadonlyHeaders>'" if you forget the `await`.

### Pitfall 6: Clerk `<CreateOrganization />` webhook race — org row may not exist when `/dashboard` loads

**What goes wrong:** Admin clicks "Create Organization" → Clerk redirects to `/dashboard` per `afterCreateOrganizationUrl` → `/dashboard` Server Component calls `getOrgContext()` → reads `orgId` from Clerk session (which exists; Clerk knows about the new org immediately) → calls `withOrgScope(ctx, ...)` → queries `Policies.listAll` filtered by `org_id = ctx.orgId` → returns 0 rows BUT the `/dashboard` UI shows the org name in `<OrganizationSwitcher />` because Clerk-side state has it. **Worse case:** any operation that does `JOIN organizations` will fail or return nothing because the `organizations` row hasn't been INSERTed yet by the webhook handler.
**Why it happens:** Clerk webhooks are asynchronous ([clerk.com/docs/guides/development/webhooks/overview](https://clerk.com/docs/guides/development/webhooks/overview) — "Clerk webhooks are asynchronous… you can't rely on the webhook delivery as part of that flow"). The `organization.created` webhook may land milliseconds to several seconds AFTER the user is redirected.
**How to avoid (recommended for Phase 3):**
- **Option A — Best (defensive):** `/dashboard` SC catches the "organization not found" case from a `findById`-style read and renders a "Setting up your workspace…" placeholder that auto-refreshes after 1–2 seconds. Implementation: a small Client Component that polls `getOrgContext` until `Policies.listAll(s)` (or a dedicated `Organizations.findByClerkOrgId`) returns a row.
- **Option B — Acceptable for Phase 3 MVP:** Add a brief loading state. The race window is small (typically <500ms); the user clicking through `<CreateOrganization />` → seeing a 1-second skeleton → seeing real data is acceptable for the MVP and operator. Document the gap in `STATE.md` Phase 3 follow-ups as a Phase 5+ harden.
- **Option C — Not recommended:** Synchronously create the org row from a Server Action triggered by `<CreateOrganization />`'s `afterCreateOrganizationUrl`. Bypasses webhook idempotency (Phase 2 `clerk_events` table); creates two write paths to the same row; reasoned-against in Phase 2 architecture review.

**Warning signs:** Sporadic "Organization not found" errors on first `/dashboard` load after `<CreateOrganization />`. Refreshing the page makes it work.

### Pitfall 7: Looking up `users.id` from `clerkUserId` inside an orchestrator — N+1 risk

**What goes wrong:** `PolicyVersions.create(s, { createdBy: ??? })` needs the PK from `users.id`, not the Clerk `userId` string. Naive implementation issues one extra SELECT per orchestrator call.
**Why it happens:** Phase 2 schema separates `users.id` (uuid PK) from `users.clerkUserId` (Clerk's string ID). `OrgContext.userId` is the Clerk string; `policy_versions.createdBy` is the uuid PK.
**How to avoid:** Either (a) extend `OrgContext` to carry `internalUserId` (a Phase 2 follow-up — surface to operator) so the lookup happens once per request, or (b) accept the extra SELECT per orchestrator entry — it's a single indexed `clerkUserId` UNIQUE lookup, <1ms. **Recommendation: (b) for Phase 3**, with a `users.findInternalIdByClerkId(s, clerkUserId)` helper on the Users repository (Phase 2 stub). Phase 8 perf-pass can revisit.
**Warning signs:** Slow `publish` Server Action under load tests; orchestrator profile shows two DB round-trips per call instead of one.

### Pitfall 8: `policies.contentJson` jsonb is `unknown` to Drizzle — narrow it

**What goes wrong:** Drizzle types `jsonb` columns as `unknown`. Code like `policy.contentJson.type` fails `tsc --noEmit`.
**Why it happens:** Postgres jsonb is structurally unconstrained; Drizzle can't infer a shape.
**How to avoid:** Cast at the read boundary with a typed alias: `import type { JSONContent } from '@tiptap/core'` and `const content = policy.contentJson as JSONContent`. Zod schema in the Server Action provides the validated-input guarantee on the write boundary. NEVER use `any`.
**Warning signs:** `any` showing up in PR diffs around `contentJson`.

### Pitfall 9: shadcn Form expects react-hook-form — D-09 conflict

**What goes wrong:** Operator says "use shadcn Form" → planner installs `react-hook-form` + `@hookform/resolvers` → CONTEXT D-09 says "NO React Hook Form in Phase 3" → audit failure.
**Why it happens:** shadcn `Form` is documented at [ui.shadcn.com/docs/forms/react-hook-form](https://ui.shadcn.com/docs/forms/react-hook-form) and ships as a thin wrapper over react-hook-form. The shadcn-`useActionState` integration is listed as "Coming Soon" on shadcn docs as of 2026-05-19.
**How to avoid:** Phase 3 SHOULD STILL run `shadcn add form` (per D-13's invocation list) to install the primitives (Label, control wrappers), but USE the shadcn primitives `<Input />`, `<Label />`, `<Select />`, `<Textarea />` directly inside a native `<form action={action}>` element — bypass the wrapping shadcn `Form` (`FormField`, `FormItem`, etc., which require react-hook-form's `Controller`). Wire validation errors via `useActionState`'s returned state. This honors D-09 verbatim.
**Warning signs:** PR diff includes `react-hook-form` or `@hookform/resolvers` in `package.json` dependencies. Reject and re-route to native form action.

### Pitfall 10: Drizzle `OrgScope.tx` typed as `PgTransaction<any, any, any>` — keep the audited exception

**What goes wrong:** Phase 3 plan tries to "tighten" the `any` in `lib/db/scoped.ts:26` to honor CLAUDE.md NEVER #4 (no `any`).
**Why it happens:** Plan 02-01 documented this as an audited exception with operator approval (`.planning/phases/02-data-layer/02-CONTEXT.md <specifics>` block #1). Tightening to `Parameters<typeof db.transaction>[0]` produces a deep generic that doesn't re-export cleanly.
**How to avoid:** Phase 3 plan must NOT modify `lib/db/scoped.ts`. The exception is bounded, audited, and referenced by `scripts/check-artifacts.ts`. Defer to Phase 8 perf/quality pass per Plan 02-01's resolution.
**Warning signs:** Phase 3 PR shows `lib/db/scoped.ts` modified.

### Pitfall 11: `tests/types.ts` extension must remain a compile error

**What goes wrong:** Plan 03-N adds the two L-05 `@ts-expect-error` lines and runs `tsc --noEmit`. The build PASSES. Confusion: shouldn't `@ts-expect-error` mean it errors?
**Why it happens:** `@ts-expect-error` flips the polarity — the LINE BELOW must produce an error. If `PolicyVersions.update` exists as an exported method (regression), the `@ts-expect-error` line ITSELF becomes an "unused @ts-expect-error" error → `tsc --noEmit` fails on the directive line, which IS the gate firing correctly. The line works when the underlying property does NOT exist.
**How to avoid:** Don't get cute. Add the two lines verbatim (Code Examples below); confirm `tsc --noEmit` passes; mentally model "directive is silent when property is missing, errors when property exists" as the inverted-test pattern from Phase 2 D-07.
**Warning signs:** Plan attempts to "fix" a passing tsc by removing the `@ts-expect-error` directive.

### Pitfall 12: `is_local=true` on `set_config` and `SET LOCAL ROLE` already established — don't duplicate

**What goes wrong:** Phase 3 orchestrator opens its OWN `db.transaction` instead of receiving `s.tx` from `withOrgScope`. The Clerk JWT claims never get injected; RLS evaluates `auth.jwt()->>'org_id'` as NULL → returns 0 rows → orchestrator throws "Policy not found" mysteriously.
**Why it happens:** Phase 2 ADR-025 + Plan 02-01 fold these primitives into `lib/db/scoped.ts:withOrgScope`. The repository methods take `OrgScope` (which already has `s.tx`). Bypassing this is a recipe for cross-org leakage AND for silent RLS denial.
**How to avoid:** Orchestrators in `lib/policies/transitions.ts` ALWAYS call `withOrgScope(ctx, async (s) => { ... })`. Repository methods inside receive `s` and use `s.tx`. Never `db.transaction(...)` directly in a repository OR an orchestrator.
**Warning signs:** Import of `db` from `@/lib/db` in `lib/policies/*.ts` → `scripts/check-db-imports.ts` fails the gate. (Defense already in place from Phase 2.)

---

## Code Examples

Verified patterns from official sources + CONTEXT specifics:

### `tests/types.ts` — L-05 extension

```typescript
// tests/types.ts (extension — append after Phase 2 lines)
// Source: 03-CONTEXT.md <code_context> Reusable Assets — tests/types.ts pattern
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';

// @ts-expect-error — PolicyVersions must not expose `update` (L-05 / ADR-018-spirit)
void PolicyVersions.update;
// @ts-expect-error — PolicyVersions must not expose `delete` (L-05 / ADR-018-spirit)
void PolicyVersions.delete;
```

### `lib/auth/require-admin.ts` (L-01)

```typescript
// Source: 03-CONTEXT.md <specifics> § 1
import 'server-only';
import { notFound } from 'next/navigation';
import { getOrgContext, type OrgContext } from '@/lib/auth/context';

export async function requireAdmin(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (ctx.role !== 'admin') notFound();   // D-10 "advertise nothing"
  return ctx;
}
```

### `middleware.ts` admin matcher rewrite (L-02 / CR-02 closure)

```typescript
// Source: 03-CONTEXT.md <specifics> § 4
// Patch `middleware.ts` — replace the existing isAdminRoute block with:
const ADMIN_URL_PATTERNS: RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/policies(\/|$)/,
  /^\/onboarding(\/|$)/,
];
function isAdminRoute(pathname: string): boolean {
  return ADMIN_URL_PATTERNS.some((p) => p.test(pathname));
}
// ... in clerkMiddleware body, replace `if (isAdminRoute(req)) { ... }` with `if (isAdminRoute(req.nextUrl.pathname)) { ... }`.
// Also add (top of handler, before any auth check):
// const requestHeaders = new Headers(req.headers);
// requestHeaders.set('x-pathname', req.nextUrl.pathname);
// And at every NextResponse.next() return: NextResponse.next({ request: { headers: requestHeaders } })
```

### `lib/policies/state-machine.ts` (D-03)

(Full code in Pattern 2 above — verbatim from CONTEXT specifics § 2.)

### `lib/policies/transitions.ts` — `publish` + `editPublished` (D-04)

```typescript
// publish — verbatim from CONTEXT specifics § 3
// editPublished — verbatim from CONTEXT specifics § 4
// (See Pattern 2 / 3 above for full code.)
```

### `app/(auth)/post-sign-in/page.tsx` (L-03)

```typescript
// Source: D-08 + 03-CONTEXT.md domain
import { redirect } from 'next/navigation';
import { getOrgContext } from '@/lib/auth/context';

export default async function PostSignInPage() {
  let ctx;
  try {
    ctx = await getOrgContext();
  } catch (err) {
    // No active org → onboard
    redirect('/onboarding/create-org');
  }
  if (ctx.role === 'admin') redirect('/dashboard');
  redirect('/my-policies');     // Phase 5 stub OK in Phase 3
}
```

### `app/(admin)/onboarding/create-org/page.tsx` (D-08)

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

### `scripts/check-admin-routes.ts` — ts-morph audit shape

```typescript
// Source: 03-CONTEXT.md <specifics> § 5 + Phase 2's scripts/check-db-imports.ts pattern
import { Project, SyntaxKind } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';

const project = new Project({ tsConfigFilePath: resolvePath('tsconfig.json') });
const middlewareFile = project.getSourceFileOrThrow('middleware.ts');

// 1. Parse ADMIN_URL_PATTERNS array literal
const adminPatternsDecl = middlewareFile
  .getVariableDeclarationOrThrow('ADMIN_URL_PATTERNS');
const arrayLiteral = adminPatternsDecl
  .getInitializerIfKindOrThrow(SyntaxKind.ArrayLiteralExpression);
const declaredPatterns: RegExp[] = arrayLiteral
  .getElements()
  .map((el) => new RegExp(el.getText().replace(/^\/|\/[a-z]*$/g, ''))); // strip / delimiters

// 2. Walk app/(admin)/**/page.tsx
function walkPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkPages(full, out);
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}
const pageFiles = walkPages(resolvePath('app/(admin)'));
const urls = pageFiles.map((p) =>
  p
    .replace(/\\/g, '/')
    .replace(/.*\/app\/\(admin\)/, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/^$/, '/'),
);

// 3. Cross-check
for (const url of urls) {
  if (!declaredPatterns.some((re) => re.test(url))) {
    throw new Error(`Admin route ${url} has no ADMIN_URL_PATTERNS match`);
  }
}

// 4. Walk app/(admin)/**/actions.ts and assert each Server Action body contains `withOrgScope(`
const actionFiles = project.getSourceFiles('app/(admin)/**/actions.ts');
for (const file of actionFiles) {
  const text = file.getFullText();
  // crude but sufficient — every action file must include withOrgScope call
  if (!text.includes('withOrgScope(')) {
    throw new Error(`Server action file missing withOrgScope: ${file.getFilePath()}`);
  }
}

console.log('check-admin-routes: OK');
```

### `package.json` script additions

```json
{
  "scripts": {
    "verify:phase-3": "tsx --env-file=.env.local scripts/check-data-layer.ts && pnpm typecheck && tsx scripts/check-admin-routes.ts && pnpm check:artifacts",
    "check:admin-routes": "tsx scripts/check-admin-routes.ts"
  }
}
```

(The exact chain may simplify; orchestrator pattern from Phase 2 is the model.)

---

## State of the Art

| Old approach | Current approach | When changed | Impact for Phase 3 |
|--------------|------------------|--------------|--------------------|
| `useFormState` from `react-dom` | `useActionState` from `react` | React 19 (Apr 2024); re-exported as alias in React 19 | Use `useActionState` in client components. `useFormState` still works as alias but is deprecated path. |
| TipTap 2.x stable line | TipTap 3.x stable (3.23.5 as of 2026-05-19) | TipTap 3.0 stable shipped 2025-09 (approximately) | CONTEXT D-02 locks 2.x; Phase 3 ships 2.27.2. A future phase should reassess 3.x once 3.x adoption stabilizes (Phase 8 polish candidate or earlier on customer ask). |
| TipTap StarterKit (manual `Link` install) | TipTap 2.x StarterKit STILL does NOT include Link | unchanged | Confirms CONTEXT D-02 — three packages (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`) is correct. Add `@tiptap/html` as the 4th for server rendering. |
| shadcn `Form` (react-hook-form-based) | shadcn `Form` + react-hook-form (still current); shadcn `useActionState` variant "Coming Soon" | shadcn docs as of 2026-05-19 | Phase 3 D-09 chooses native form + Zod + `useActionState` — bypasses shadcn `Form` wrapper. See Pitfall §9. |
| `revalidatePath` + `redirect` order ambiguous | Documented order: `revalidatePath` FIRST, then `redirect` outside try/catch | Next.js docs as of 2026-05 | Pattern 6 above. |
| Server Component `usePathname` requested | Still unimplemented in Next.js 15.x — middleware header injection remains the documented workaround | unchanged | D-06 — `x-pathname` header. |
| Drizzle nested transactions via `tx.transaction(...)` | Same — savepoints (works in 2026) | unchanged | Orchestrators do NOT need nested transactions; one `withOrgScope` per Server Action is sufficient. |

**Deprecated/outdated:**
- `useFormState` (use `useActionState`)
- TipTap 2.x is in maintenance — security patches yes, new features no
- `app/sign-in-success/page.tsx` (delete per L-03)

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Operator accepts pinning TipTap to 2.27.2 (last 2.x release; 2.x in maintenance) per locked CONTEXT D-02, deferring 3.x migration to a future phase. | Standard Stack | Low. If operator decides to migrate to 3.x in Phase 3, peer deps change (StarterKit drops some extensions; Link package path may differ) — research effectively starts over for editor section. |
| A2 | Phase 3 does NOT install `react-hook-form` despite shadcn `Form`'s default — option (b) in Pitfall §9 (use shadcn primitives inside native form). | Don't Hand-Roll · Pitfall §9 | Medium. If operator prefers the shadcn `Form` wrapper for accessibility/error display ergonomics, plan-phase needs to add `react-hook-form` + `@hookform/resolvers` (2 packages) and CONTEXT D-09 amended. Surface this trade-off in plan-phase. |
| A3 | The Clerk webhook race (Pitfall §6) is acceptable to ship as Option B (brief loading state) for Phase 3 MVP. | Pitfall §6 | Medium. If operator wants Option A (defensive polling), plan-phase must add a small Client Component + a `Organizations.findByClerkOrgId(s, …)` repository method (new write — currently Phase 2 didn't add a public read on `organizations`). |
| A4 | The `users.findInternalIdByClerkId(s, clerkUserId)` helper is a Phase 3 add (Phase 2 ship is a stub). | Pitfall §7 | Low. Plan-phase confirms by inspecting `lib/db/repositories/users.ts` — if no such method exists, add it; if it exists with a different name, use that. |
| A5 | `app/sign-in-success/page.tsx` is at the path I confirmed (not `app/(auth)/sign-in-success/page.tsx` as listed in CONTEXT canonical refs). | User Constraints L-03 | Low. Direct filesystem read confirmed the live path. Plan-phase deletes the file at its actual location. |
| A6 | `verify:phase-1` HTTP-probes `/sign-in-success` and will regress after L-03 lands unless updated to `/post-sign-in`. | Runtime State Inventory | Low. Plan-phase must add a task that updates the probe target in `scripts/check-foundation.ts` (or wherever it lives). Confirmed by inspection that Phase 1's verify script existed; exact probe-target location should be re-verified by plan-phase. |
| A7 | The shadcn `Sidebar` cookie name is `sidebar:state`, default max-age 7 days, value `'true'`/`'false'`. | Pattern 1 | Very low. Documented at ui.shadcn.com/docs/components/sidebar and corroborated by community docs. The exact value to compare ("true" vs "false") may need verification once `shadcn add sidebar` runs and the actual file lands in `components/ui/sidebar.tsx`. |
| A8 | TipTap 2.27.2 peerDeps support React 19 (`react: '^17.0.0 || ^18.0.0 || ^19.0.0'`). | Standard Stack | Confirmed by `npm view @tiptap/react@2.27.2 peerDependencies` — `react: '^17.0.0 || ^18.0.0 || ^19.0.0'`. |
| A9 | The `@/lib/db` import allow-list does NOT need extension in Phase 3 (no new privileged callers). | Anti-Patterns | Very low. All Phase 3 server code goes through `withOrgScope`. Webhook handler (Phase 2) and cron (Phase 7) are the only allow-listed entries; Phase 3 introduces neither. |
| A10 | `policies.contentJson as JSONContent` is acceptable as a narrow boundary cast (it's a documented Drizzle jsonb limitation, not an `any` violation). | Pitfall §8 | Low. The cast is at a single boundary; the rest of the codebase sees `JSONContent`. If operator interprets this as `any` violation, plan can add a Zod-based narrowing helper `parseContentJson(unknown): JSONContent` at the boundary. |

---

## Open Questions (RESOLVED)

1. **`/dashboard` policy-status counts — repository call or SQL aggregate?**
   - What we know: CONTEXT discretion area says "recommendation: SQL aggregate via `Policies.statusCounts(s)`. One query, four rows back. Plan-phase implements."
   - What's unclear: Does the four-row aggregate join `policies` against itself once, or is it a `SELECT status, COUNT(*) FROM policies WHERE org_id = $1 GROUP BY status`?
   - **RESOLVED:** Latter (single GROUP BY query, returns up to 4 rows — one per status that has ≥1 policy). Plan-phase to confirm.

2. **Should Phase 3 introduce `Organizations.findByClerkOrgId(s, clerkOrgId)` as a read?**
   - What we know: Phase 2 did not ship a public read on `organizations` because its only purpose at the time was the webhook handler (which uses raw `db`).
   - What's unclear: For the Clerk webhook race mitigation (Pitfall §6 Option A) and any future `<OrganizationSwitcher />` integration, a read may be needed.
   - **RESOLVED:** Add the read method to `lib/db/repositories/organizations.ts` (creating that file if needed — Phase 2 may have skipped it). Plan-phase scopes this when picking Option A vs B for Pitfall §6.

3. **TipTap 3.x migration window**
   - What we know: 3.x is stable as of 2026-05. CONTEXT D-02 locked 2.x.
   - What's unclear: Whether operator wants a Phase 8 (or earlier) follow-up to migrate.
   - **RESOLVED:** Note in `STATE.md` as a `TIPTAP-3-MIGRATION` parking-lot item. Not blocking.

4. **`PolicyEditor` debounce — 300ms or none?**
   - What we know: CONTEXT D-02 mentions "debounced 300ms in Phase 3 — heavier debounce can be Phase 8 polish."
   - What's unclear: Is the debounce on the hidden-input update (which fires on every keystroke per the `onUpdate` callback in Pattern 3) or on a separate auto-save (deferred)?
   - **RESOLVED:** Phase 3 fires `setState` synchronously inside `onUpdate` (no debounce). The hidden input value is JSON-stringified once on form submit, not on every keystroke. Plan-phase confirms — adding a debounce here is YAGNI without a measured perf issue.

5. **What does `/policies/[id]` show when `currentVersion > 1`?**
   - What we know: D-04 — `policy_versions` rows are the historical snapshots. CONTEXT mentions `<PolicyVersionHistory />` lists versions.
   - What's unclear: Whether the editor view shows the CURRENT `policies.contentJson` (latest in-progress, possibly Draft) or the latest published version.
   - **RESOLVED:** Editor view ALWAYS shows `policies.contentJson` (the live, mutable state — Draft = editable, Published = read-only with "Edit" button that flips to `editPublished` flow). Version history is a separate panel showing `policy_versions` rows as immutable snapshots. Plan-phase confirms.

---

## Environment Availability

> Phase 3 dependencies: same Phase 1+2 toolchain (Node 22, pnpm, Next.js dev server, Supabase TEST DB connection, Clerk dev app). No new external services.

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | every script | ✓ | `>=22.0.0 <23.0.0` (per `engines.node`) | — |
| pnpm | install + scripts | ✓ | `9.15.9` (packageManager pin) | — |
| Postgres (Supabase TEST DB) | repository smoke tests | ✓ | (Phase 2 SF-DB-1 closed) | — |
| Clerk dev app | `<CreateOrganization />` live-smoke | ✓ | (Phase 1 Plan 01-02) | — |
| `whsec_…` rotated by operator | webhook live-smoke | ⏸ | Awaits L-04 operator action | None — blocks live-smoke only; rest of Phase 3 can ship code+tsc clean before this. |
| `npm view <pkg>` registry access | install verification | ✓ | — | If offline at install time, pin all versions in `package.json` first then `pnpm install`. |
| `shadcn` CLI (binary already in deps) | `shadcn add` invocations | ✓ | `^4.7.0` | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

---

## Validation Architecture

> `workflow.nyquist_validation: true` (default — `config.json` doesn't set it to false). Section emitted.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **No runtime test framework installed yet** — Phase 1+2 use static gates (`tsc --noEmit` + `pnpm verify:phase-N` orchestrators that include `check-data-layer`, `check-rls`, `check-schema`, `check-db-imports`, `check-artifacts`). Phase 2 added `tests/types.ts` as a compile-time invariant test. |
| Config file | `tsconfig.json` (typecheck); `package.json` `scripts.verify:phase-N` (gate orchestrators); `scripts/check-*.ts` (audits). |
| Quick run command | `pnpm typecheck` (~3s) |
| Full suite command | `pnpm verify:phase-3` (chains check-data-layer + typecheck + check-admin-routes + check-artifacts) |
| Phase gate | `pnpm verify:phase-3` exits 0 before `/gsd:verify-work` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-policy-library | Title + category ILIKE returns expected results scoped by org_id | static/AST audit + manual smoke | `pnpm check:admin-routes` (verifies every action wraps `withOrgScope`); manual smoke in `/policies?q=Safety` | ❌ check-admin-routes — Wave 0 |
| REQ-policy-library | `policy_versions` row created on publish events (D-04) | static (ts-morph confirms `PolicyVersions.create(s,` call in `lib/policies/transitions.ts`'s `publish` and `editPublished`) + manual smoke | extend `check-admin-routes.ts` with this AST assertion; manual smoke: publish a policy, assert via SQL `SELECT count(*) FROM policy_versions WHERE policy_id = $1` increments | ❌ Wave 0 |
| REQ-policy-library | TipTap editor JSON output stored in `policies.contentJson` | type test + manual smoke | `tests/types.ts` confirms `PolicyCreateInput` accepts `JSONContent`-shaped `content_json`; manual smoke: create policy, inspect DB row | ✅ tests/types.ts exists (Phase 2) — extend with content_json check |
| REQ-policy-library | Status states exhaustive — no others | type-system enforcement | `PolicyStatus` union in `lib/policies/state-machine.ts`; `tsc --noEmit` rejects literal that's not one of 4 | ❌ state-machine.ts — Wave 0 |
| REQ-policy-lifecycle | Status state machine: Draft → Under Review → Published → Archived; illegal transitions return 4xx with rejection surfaced | unit (pure function) | extend `tests/types.ts` (or add `tests/state-machine.test.ts`) — assert `canTransition('draft', 'archived')` is `false`; assert `IllegalTransitionError` instance is thrown by `publish` orchestrator on bad state | ❌ Wave 0 |
| REQ-policy-lifecycle | Editing a published policy creates new version + resets to Draft | static AST + manual smoke | `check-admin-routes.ts` asserts `editPublished` body contains BOTH `PolicyVersions.create(s,` AND `status: 'draft'`; manual: edit a published policy, verify SQL `SELECT status, current_version FROM policies WHERE id = $1` shows status='draft' + currentVersion incremented | ❌ Wave 0 |
| REQ-policy-lifecycle | Growth+ approval-workflow gate (Phase 6) | N/A in Phase 3 | — | — |
| REQ-policy-lifecycle | Archived policies still appear in audit reports | manual smoke (audit reports are Phase 8) | — | — |
| REQ-access-control | Admin policy queries unfiltered by status, always scoped by org_id | static + cross-org probe | existing `pnpm check:rls` (Phase 2 — runs against TEST DB with cross-org SELECT); existing `pnpm check:db-imports` confirms no raw `db` in `app/(admin)` | ✅ Phase 2 |
| REQ-access-control | `/post-sign-in` redirects by role | manual smoke + Phase-1 verify update | manually exercise sign-in as admin + as employee; update `scripts/check-foundation.ts` to probe `/post-sign-in` (replaces `/sign-in-success` probe) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm typecheck` (~3s; required by every Phase 1+2 plan)
- **Per wave merge:** `pnpm verify:phase-3` (chains all Phase 3 gates; expected runtime ~25–30s including the live DB checks Phase 2 brought in)
- **Phase gate:** `pnpm verify:phase-3` exits 0 + manual smoke checklist (Pitfall §6 mitigation, webhook live-smoke per L-04, admin↔employee role routing via `/post-sign-in`) green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `lib/policies/state-machine.ts` — pure module; required by every transition test
- [ ] `lib/policies/transitions.ts` — orchestrator surface; ts-morph audit target
- [ ] `scripts/check-admin-routes.ts` — admin-route ↔ ADMIN_URL_PATTERNS audit + `withOrgScope` AST audit
- [ ] `tests/types.ts` extension — two `@ts-expect-error` lines for L-05 (PolicyVersions has no `update`/`delete`)
- [ ] Update `scripts/check-foundation.ts` to probe `/post-sign-in` instead of `/sign-in-success` (closes the regress that L-03 would otherwise introduce in `pnpm verify:phase-1`)
- [ ] `scripts/check-artifacts.ts` extension — add file-existence rows for: `app/(admin)/layout.tsx`, `app/(admin)/dashboard/page.tsx`, `app/(admin)/policies/page.tsx`, `app/(admin)/policies/new/page.tsx`, `app/(admin)/policies/[id]/page.tsx`, `app/(admin)/onboarding/create-org/page.tsx`, `app/(auth)/post-sign-in/page.tsx`, `lib/auth/require-admin.ts`, `lib/policies/state-machine.ts`, `lib/policies/transitions.ts`, plus the `components/admin/` + `components/policy/` directories, plus the new `scripts/check-admin-routes.ts`
- [ ] `package.json` — add `verify:phase-3` + `check:admin-routes` scripts; install deps (zod + 4 @tiptap/* packages)
- [ ] Live webhook smoke (after L-04 secret rotation): operator manually creates an org via `<CreateOrganization />` and verifies the row lands in `organizations` AND a `users` row mirrors `publicMetadata.role = 'admin'`

**No runtime test framework install in Phase 3** — Phase 1+2 explicitly chose static gates over a Vitest/Jest harness. Phase 3 inherits that posture. A runtime test framework can land in Phase 8 (Validation) if the cross-tenant property test from ADR-023's "Validation-Gate item" needs it; Phase 2's `check-rls.ts` covers it for now.

---

## Security Domain

> `config.json` has no `security_enforcement` key — treat as enabled. Section emitted.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | YES | Clerk (`@clerk/nextjs`) — already in stack. Layout-level `requireAdmin()` (L-01) + middleware role gate (L-02) are the two enforcement layers. |
| V3 Session Management | YES | Clerk session cookies; Next.js Server Components read via `auth()` (wrapped in `getOrgContext()`). No custom session handling. |
| V4 Access Control | YES | ADR-019 + ADR-023 + ADR-025 enforce org-scoping at app + RLS layers. Role check via `publicMetadata.role` in `getOrgContext()` + `requireAdmin()`. |
| V5 Input Validation | YES | Zod schemas on every Server Action input (`createPolicyAction`, `publishAction`, `editPublishedAction`, etc.). TipTap JSON validated by schema-aware editor (StarterKit + Link node types only). |
| V6 Cryptography | YES (indirect) | Clerk handles auth tokens (JWT signing/verification). svix handles webhook signature verification (Phase 2). Phase 3 introduces no new cryptographic surface. |
| V7 Error Handling | YES | Server Actions return typed error states; orchestrators throw `IllegalTransitionError` (typed) — caught by Server Action and returned as `{ ok: false, error: ... }`. No raw error message leakage to client. |
| V8 Data Protection | YES | `org_id` scoping (ADR-019) + RLS (ADR-025) — tested by Phase 2's `check-rls.ts`. |
| V12 File Resources | NO | Phase 3 has no file upload surface (TipTap text-only — no Image extension per D-02). Defer to a future phase if image upload is requested. |
| V13 API & Web Service | YES | Server Actions (not API routes) — CSRF protected by Next.js; no public API in Phase 3. |
| V14 Configuration | YES | Env vars (`CLERK_WEBHOOK_SECRET`, `DATABASE_URL`, etc.) — operator rotation per L-04. No new env vars in Phase 3. |

### Known Threat Patterns for Next.js 15 + TipTap + Drizzle stack

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Cross-tenant policy read (Org A reads Org B policy) | Information Disclosure | `withOrgScope` + `where(eq(orgId, scope.orgId))` (app layer) + RLS `USING (org_id = auth.jwt()->>'org_id')` (DB layer). Tested by `check-rls.ts`. |
| Cross-tenant policy mutation | Tampering | Same as above; INSERT path also sets `orgId: scope.orgId` (Phase 2 D-02). |
| TipTap `javascript:` URL XSS via Link mark | Tampering / Elevation of Privilege | Pin `@tiptap/extension-link@2.27.2` (CVE-2025-14284 fixed in 2.10.4+). Don't override `isAllowedUri` to be more permissive. `openOnClick: false` mitigates in-editor click execution. |
| TipTap rendered HTML XSS via `dangerouslySetInnerHTML` | Tampering | `generateHTML` is schema-aware (StarterKit + Link node-type allow-list). XSS surface is the StarterKit + Link allow-list; both well-audited. JSON source originates from a controlled (admin-only) write path. |
| State machine bypass (client forges `published` transition) | Tampering | Server Action wraps every transition through `canTransition()`; `IllegalTransitionError` thrown server-side; client UI mirrors menu for UX but cannot bypass. |
| Role escalation (employee user changes `publicMetadata.role` to admin) | Elevation of Privilege | Clerk does not allow client-side `publicMetadata` writes by default. Phase 2 CR-01 mirrors `users.role` (server-side source of truth) into Clerk's `publicMetadata.role` from the webhook handler — server is always authoritative. |
| Webhook signing-secret leakage | Spoofing | L-04 — operator rotates `whsec_…` via Svix Dashboard before Phase 3 live-smoke. `secrets-never-in-chat` rule (operator's MEMORY.md) prohibits printing secrets. |
| CSRF on Server Actions | Tampering | Next.js automatically attaches CSRF protection to Server Actions (same-origin + signed action IDs). No additional config needed. |
| Open redirect via middleware `redirect_url` | Tampering | Phase 1 WR-01 hardening: middleware passes only `pathname + search` as redirect_url, never the full URL. Phase 3 introduces no new redirect surface. |
| Pasted TipTap content with malformed JSON | DoS | Zod schema on `content_json` includes a `.transform((s) => JSON.parse(s))` step that throws on malformed JSON; `safeParse` catches and returns user-friendly error. Max payload size enforced by Next.js body-size limit (1MB default). |

### Phase 3 Security Verification Checklist

- [ ] All admin pages (`app/(admin)/**/page.tsx`) call `requireAdmin()` via layout (L-01)
- [ ] All admin server actions (`app/(admin)/**/actions.ts`) wrap DB work in `withOrgScope` — enforced by `scripts/check-admin-routes.ts`
- [ ] No new entries added to `scripts/check-db-imports.ts` ALLOWLIST
- [ ] `@tiptap/extension-link` pinned to `2.27.2` (≥ 2.10.4 CVE fix)
- [ ] TipTap Link `openOnClick: false` configured
- [ ] Zod schemas on every Server Action input
- [ ] `redirect()` always outside try/catch in Server Actions
- [ ] L-04 webhook secret rotation operator-verified BEFORE first `<CreateOrganization />` smoke
- [ ] `tsc --noEmit` exits 0 (covers L-05 invariants via tests/types.ts)
- [ ] `pnpm check:rls` (Phase 2 gate, re-run) exits 0

---

## Sources

### Primary (HIGH confidence)

- **`.planning/phases/03-admin-ui/03-CONTEXT.md`** — every locked decision L-01..L-05 + D-01..D-13.
- **`.planning/intel/decisions.md`** — ADR-005, ADR-008, ADR-009, ADR-010, ADR-018, ADR-019, ADR-023, ADR-025.
- **`.planning/REQUIREMENTS.md`** — REQ-policy-library, REQ-policy-lifecycle, REQ-access-control.
- **`.planning/STATE.md`** — Phase 1+2 ship state + carry-forwards SF-WHSEC-1, REG-P1-01, CR-02, SF-CASCADE-AUDIT (deferred).
- **`.planning/ROADMAP.md`** Phase 3 — 5 success criteria + anchoring decisions.
- **`reference/SCHEMA.md`** — table shapes (policies, policy_versions, workflow_stages).
- **`reference/STACK.md`** — stack rationale.
- **`lib/db/schema.ts`** + **`lib/db/scoped.ts`** + **`lib/auth/context.ts`** + **`lib/db/repositories/{policies,policy_versions,workflow_stages}.ts`** + **`middleware.ts`** — live Phase 2 code.
- **`app/sign-in-success/page.tsx`** — live Phase 1 placeholder (path confirmed; CONTEXT canonical refs listed a slightly different path).
- **TipTap Next.js install guide**: [tiptap.dev/docs/editor/getting-started/install/nextjs](https://tiptap.dev/docs/editor/getting-started/install/nextjs) — `immediatelyRender: false` mandate.
- **TipTap generateHTML utility**: [tiptap.dev/docs/editor/api/utilities/html](https://tiptap.dev/docs/editor/api/utilities/html) — import path `@tiptap/html` for server side.
- **TipTap Link extension**: [tiptap.dev/docs/editor/extensions/marks/link](https://tiptap.dev/docs/editor/extensions/marks/link) — `isAllowedUri` default validation.
- **Snyk CVE-2025-14284**: [security.snyk.io/vuln/SNYK-JS-TIPTAPEXTENSIONLINK-14222197](https://security.snyk.io/vuln/SNYK-JS-TIPTAPEXTENSIONLINK-14222197) — fixed in 2.10.4+.
- **`npm view`** output verifying package versions and dates: `@tiptap/react@2.27.2` (2026-01-07), `@tiptap/starter-kit@2.27.2`, `@tiptap/extension-link@2.27.2`, `@tiptap/html@2.27.2`, `zod@3.23.5`, `next@15.5.18`, `@clerk/nextjs@7.3.7`.
- **shadcn Sidebar docs**: [ui.shadcn.com/docs/components/sidebar](https://ui.shadcn.com/docs/components/sidebar) — `SidebarProvider`, cookie persistence pattern.
- **Next.js redirect docs**: [nextjs.org/docs/app/api-reference/functions/redirect](https://nextjs.org/docs/app/api-reference/functions/redirect) — outside try/catch pattern.
- **Next.js revalidatePath docs**: [nextjs.org/docs/app/api-reference/functions/revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath) — order with redirect.
- **Clerk Webhooks overview**: [clerk.com/docs/guides/development/webhooks/overview](https://clerk.com/docs/guides/development/webhooks/overview) — "Clerk webhooks are asynchronous".
- **Clerk `<CreateOrganization />` docs**: [clerk.com/docs/nextjs/reference/components/organization/create-organization](https://clerk.com/docs/nextjs/reference/components/organization/create-organization) — `afterCreateOrganizationUrl`.
- **Drizzle ILIKE / Filters**: [orm.drizzle.team/docs/operators](https://orm.drizzle.team/docs/operators) — `ilike` operator.
- **Drizzle Transactions**: [orm.drizzle.team/docs/transactions](https://orm.drizzle.team/docs/transactions) — savepoints + PgTransaction.

### Secondary (MEDIUM confidence — community/blog with cross-verification)

- TipTap GitHub issue [#5856](https://github.com/ueberdosis/tiptap/issues/5856) — `immediatelyRender` SSR error.
- Next.js GitHub issue [#55586](https://github.com/vercel/next.js/issues/55586) — redirect-in-try-catch behavior.
- ShadCN PR [#5593](https://github.com/shadcn-ui/ui/pull/5593) — sidebar setOpen / cookie improvements.
- ShadCN issue [#6391](https://github.com/shadcn-ui/ui/issues/6391) — sidebar cookie name customization.

### Tertiary (LOW confidence — single source, kept only as supporting context)

- Blog posts on shadcn Sidebar UX (codeparrot.ai, harshalranjhani.in, achromatic.dev) — used only to corroborate Provider/Header/Content component list; not load-bearing.

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — TipTap package set verified directly via npm registry + tiptap.dev official docs; Zod / Clerk / Next versions confirmed; all 4 TipTap packages share an upstream monorepo (`github.com/ueberdosis/tiptap`) and a 5-year publish history.
- **Architecture patterns:** HIGH — Patterns derive from CONTEXT specifics (operator-authored) + Phase 2 live code (Drizzle / withOrgScope / repositories) + Next.js 15 docs (Server Actions, redirect/revalidatePath ordering, header injection).
- **Pitfalls:** HIGH for §1-5 (covered by Next.js / TipTap / Snyk official sources); MEDIUM for §6 (Clerk webhook timing — confirmed by Clerk docs but the practical mitigation choice is operator-dependent); HIGH for §7-12 (in-repo Phase 2 code is canonical).
- **Validation Architecture:** MEDIUM — Phase 1+2 chose static gates over a runtime test framework; Phase 3 inherits. If operator wants Vitest/Jest in Phase 3, this section needs revision.
- **Security Domain:** HIGH — ASVS V2/V3/V4/V5/V6/V7/V8/V13/V14 mapped directly to existing Phase 2 controls + Phase 3 net-new (Zod, TipTap pin, redirect/revalidatePath order, requireAdmin).
- **Package Legitimacy:** MEDIUM-HIGH — slopcheck unavailable; verified manually via npm registry age (5+ years), single canonical upstream repo, and active maintenance. Planner gates each install behind a checkpoint per the graceful-degradation rule.

**Research date:** 2026-05-19
**Valid until:** 2026-06-19 (30 days for stable stack; re-check TipTap 3.x stable adoption + shadcn `Form` `useActionState` variant status if Phase 3 plan-phase extends past this date).
