# Phase 3: Admin UI - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Mode:** `--all` (auto-selected all gray areas; decisions made autonomously per the operator's no-clarifying-questions directive, mirroring Phase 1 + Phase 2)

<domain>
## Phase Boundary

An admin signs in, lands on the admin shell (sidebar + content layout), creates a policy in a TipTap editor, walks it through `Draft → Under Review → Published → Archived` with the state machine enforced at the API boundary (illegal transitions return 4xx and the UI surfaces the rejection), sees every status transition reflected in the policy library list, and can search by title / category / content keyword scoped by `org_id`. Editing a Published policy creates a new `policy_versions` row AND resets `policies.status` to `'draft'`. Cross-org impersonation cannot view another org's policies (already enforced at the DB layer by Phase 2's RLS + ADR-023 import allow-list — Phase 3 must not regress this).

**In scope (from ROADMAP.md Phase 3 + carry-forwards from STATE.md):**
- `app/(admin)/layout.tsx` — admin shell with shadcn Sidebar pattern, top-bar with `<OrganizationSwitcher />` + `<UserButton />`, role-gated at the layout level (server-side `requireAdmin()` → 404 if not admin, per ADR-009).
- `app/(admin)/dashboard/page.tsx` — landing page after sign-in for admins. Phase 3 ships a minimal version: org name, policy counts by status, "Create policy" CTA. The compliance-dashboard charts are Phase 8.
- `app/(admin)/policies/page.tsx` — policy library list (table view, status filter, title+category search).
- `app/(admin)/policies/new/page.tsx` — create-policy page (title + category + TipTap editor).
- `app/(admin)/policies/[id]/page.tsx` — edit-policy page (same editor + status transition controls + version history sidebar).
- `lib/db/repositories/policies.ts` + `policy_versions.ts` + `workflow_stages.ts` — repository methods filled in (Phase 2 shipped them as throwing stubs).
- `lib/policies/state-machine.ts` — pure state-machine module: `canTransition(from, to)` returns `boolean`. Hub for all transition validation. Server-only.
- `lib/policies/transitions.ts` — server-only orchestrators: `submitForReview`, `approve`, `reject`, `archive`, `restoreFromArchive`, `editPublished`. Each opens `withOrgScope` and runs the transition through `state-machine` + repository methods atomically.
- Server actions (one per transition) co-located near the page that triggers them: `app/(admin)/policies/[id]/actions.ts`. POST-style mutations only — reads use Server Components directly.
- `components/policy/PolicyEditor.tsx` — Client Component wrapping TipTap with `useEditor` hook. JSON output bound to a hidden form field; submission via Server Action.
- `components/policy/PolicyStatusBadge.tsx` — display badge mapping `status` to shadcn `Badge` variant.
- `components/policy/PolicyTransitionMenu.tsx` — Client Component DropdownMenu showing the legal transitions from current status, calling the appropriate server action.
- `components/policy/PolicyVersionHistory.tsx` — Server Component reading `policy_versions` for a given `policyId`, listing versions with timestamp + author + change summary.
- `components/admin/AdminSidebar.tsx` + `AdminTopbar.tsx` — shadcn Sidebar + topbar shell shared by all admin pages.
- `app/(auth)/post-sign-in/page.tsx` — replaces the Phase 1 `sign-in-success` placeholder (REG-P1-01 fix). Server Component that calls `getOrgContext()` and redirects to `/dashboard` (admin) or `/my-policies` (employee, Phase 5 stub placeholder OK).
- `middleware.ts` admin matcher rewrite — CR-02 closure. Replace the dead `/(admin)/(.*)` matcher with explicit URL patterns matching the routes shipped above.
- `<CreateOrganization />` flow — admin onboarding: if signed-in user has no Clerk Organization, redirect from `/dashboard` to `/onboarding/create-org`. This is where the Phase 2 Clerk webhook gets its first end-to-end smoke (SF-WHSEC-1 should be rotated first).
- `scripts/check-admin-routes.ts` — Phase 3 verify-gate component. Asserts (a) the admin URL patterns in `middleware.ts` match the actual `app/(admin)/<route>/page.tsx` files on disk (closes CR-02 dead-code regression); (b) every server action under `app/(admin)/` runs through `withOrgScope` (grep-based or AST audit).
- `pnpm verify:phase-3` orchestrator that chains: `tsc --noEmit`, `pnpm check:db-imports` (re-run from Phase 2 — still passes), `pnpm check:rls` (still passes), `pnpm check:admin-routes` (new), `pnpm check:artifacts` (extended with Phase 3 file-existence rows), and a trailing `.tmp/svix-url.json` cleanup (L-06c).
- `app/api/webhooks/clerk/route.ts` — MODIFY per L-06 audit closures (silent-loss interim fix + `maskClerkOrgId()` helper + apply at all 4 log sites). No contract change; same file shipped in Phase 2.
- shadcn components added: `Sidebar`, `Table`, `DropdownMenu`, `Dialog`, `Form`, `Label`, `Select`, `Textarea`, `Badge`.

**Out of scope (deferred to later phases):**
- AI draft generation, TL;DR, Q&A, consistency check — Phase 4. Phase 3's create-policy form has NO "Generate with AI" button; manual title + TipTap content only.
- Employee Portal — Phase 5. The Phase 3 `(employee)` route group exists only as a stub redirect from `post-sign-in`.
- Stripe checkout + tier gating + reviewer-role enforcement — Phase 6. **Critical Phase 3 implication:** the state machine accepts admin-driven transitions for ALL stages including `under_review → published` (admin can self-approve). Phase 6 layers tier gating that BLOCKS admin self-approval on Growth+ orgs (REQ-policy-lifecycle: "Growth+ orgs cannot bypass approval workflow to publish"). Phase 3 ships the state machine; Phase 6 adds the gate. This is explicit and load-bearing.
- Crons + Email + notifications surface — Phase 7.
- Compliance dashboard charts / CSV export / acceptance-criteria validation — Phase 8.
- AI-generated TL;DR summary on publish — Phase 4. `policies.tldrSummary` stays NULL until then; the UI shows nothing for it.
- Policy assignment to users/departments (`policy_assignments` writes) — Phase 5 owns the assignment surface. Phase 3 ships `Policies` + `PolicyVersions` + `WorkflowStages` repository bodies; `PolicyAssignments` stays as Phase-2-stub.
- View / acknowledgment audit trail (REQ-policy-library mentions "viewed / acknowledged / edited"). Phase 3 covers `edited` via `policy_versions` rows; `viewed` is deferred to Phase 5 (employee view tracking) and `acknowledged` is Phase 5 (`acknowledgments` writes).
- Real-time updates / WebSocket / live presence indicators — never in scope; revisit post-MVP if customers ask.
- Mobile responsiveness for the admin surface — admin is desktop-first; mobile is best-effort but not a Phase 3 success-criterion. Employee Portal (Phase 5) gets mobile attention.
- Multi-language / i18n — out of scope for v1.

</domain>

<decisions>
## Implementation Decisions

### USER-LOCKED Constraints (from operator decisions + carry-forwards)

These are not gray areas; they are pre-locked obligations that flow into Phase 3 implementation without re-litigation. Plan-phase and execute-phase MUST honor them.

- **L-01: Admin gate enforcement model.** Server-side role check via `requireAdmin()` in `app/(admin)/layout.tsx`'s Server Component. On non-admin, `notFound()` (returns 404) — matches D-10's "advertise nothing" pattern from Phase 1 middleware. Middleware ALSO enforces (CR-02 closure below) but the layout is the authoritative source — middleware is defense-in-depth.
- **L-02: CR-02 closure — admin matcher rewrite.** `middleware.ts:isAdminRoute` regex `/(admin)/(.*)` is dead (route groups don't appear in URLs). Replace with an explicit pattern matching the Phase 3 admin URLs: `/^\/(dashboard|policies|onboarding)(\/|$)/`. List belongs in a `const ADMIN_URL_PATTERNS` array at the top of `middleware.ts` so future admin routes are a one-line addition. `scripts/check-admin-routes.ts` (new in Phase 3) cross-validates this list against the `app/(admin)/` directory on disk.
- **L-03: REG-P1-01 closure — delete `/sign-in-success`.** Phase 1's `app/(auth)/sign-in-success/page.tsx` placeholder is now misleading (the `pnpm verify:phase-1` 6/6 check `TypeError: fetch failed`s against it). Phase 3 replaces it with `app/(auth)/post-sign-in/page.tsx` — a real Server Component that calls `getOrgContext()` and `redirect()`s to `/dashboard` (admin) or `/my-policies` (employee, placeholder OK). Clerk app's "After sign-in URL" is updated in the operator-manual-config task (Plan 03-01) from `/sign-in-success` to `/post-sign-in`. The `sign-in-success` route is DELETED — not preserved as a redirect — because no real user agent has it bookmarked (it was a dev-only placeholder). `pnpm verify:phase-1` is then updated to probe `/post-sign-in` instead.
- **L-04: SF-WHSEC-1 closure — rotate Clerk webhook signing secret.** Operator-manual step (cannot be automated): Svix Dashboard → rotate signing secret → paste new `whsec_…` into `.env.local`. MUST happen before the Phase 3 webhook live-smoke (i.e., before the operator first clicks "Create organization" on the new `<CreateOrganization />` flow). The previous `whsec_…` was leaked into chat transcript during Plan 02-02 checkpoint resolution; one-click rotation invalidates it. Plan 03-01 (operator-manual-config) includes this as a checkpoint:human-action gate.
- **L-05: ADR-018 invariant under edit-of-published.** Editing a Published policy creates a NEW `policy_versions` row AND resets `policies.status = 'draft'`. The PRIOR `policy_versions` rows are NEVER deleted or modified — they remain as the as-of-publish snapshot the original acknowledgments point at. Type-system enforcement: `PolicyVersions` repository exports only `create` + `listForPolicy` + `findByVersionNumber`; no `update`, no `delete`. Mirrors the Acknowledgments pattern from Phase 2. The `tests/types.ts` from Phase 2 is extended with two new `@ts-expect-error` lines verifying these invariants.
- **L-06: Phase 2 webhook audit closures.** (Source: `audit-report/PHASE-2-API-AUDIT.md`, approved by operator 2026-05-19.) Phase 3 ships three small fixes inside `app/api/webhooks/clerk/route.ts` that emerged from the api-auditor scan of Phase 2's single API surface. None expand the route's contract; all are confined to the existing file.
  - **L-06a (F-01 interim — silent-loss fix on dispatch error):** Inside the `catch` block at the current L323-339, BEFORE `return new Response('Dispatch error logged', { status: 200 })`, add a `DELETE FROM clerk_events WHERE id = $1` (Drizzle: `await db.delete(clerkEvents).where(eq(clerkEvents.id, svixId))`). Wrap that delete in its own inner try/catch — if the cleanup itself fails, log + continue (Clerk retry is the user's safety net either way). The TODO comment that currently says "TODO(Phase 7+): invert idempotency-before-dispatch order" stays — the full transactional inversion remains a Phase 7+ obligation; this interim closes the silent-loss window NOW so retries can re-fire.
  - **L-06b (F-02 — mask org IDs in logs):** Add a `maskClerkOrgId(id: string): string` helper mirroring the existing `maskClerkId(id)` at L33-36 (`org_***${id.slice(-4)}` pattern). Apply it at every log site that interpolates an org id — currently L176 (`organization.created`), L227 (`org ${clerkOrgId} not found`), L235 (`org ${clerkOrgId} lookup returned empty`), L267 (`organizationMembership.created` log) — plus any new log line Phase 3 introduces in this file. Reason: user IDs are already masked; aggregated logs otherwise expose the tenant base to anyone with log-indexer access.
  - **L-06c (F-04 — `.tmp/` debug-token cleanup):** Add `rm -rf .tmp/svix-url.json` to a post-debug cleanup step. Concretely: extend the `package.json` `verify:phase-3` script (Wave 0 / Plan 03-00) with a tail `node -e "require('fs').rmSync('.tmp/svix-url.json', { force: true })"` so the file is wiped on every `verify:phase-3` invocation. The `.tmp/svix-url.json` file is the Svix Play one-time token surface; gitignored already, so this is hygiene-only.
  - **Not folded — stay deferred** (rationale: out-of-scope infra needed):
    - F-03 (no app-level rate limit on webhook) — requires Phase 7+ Railway worker; Vercel platform DDoS handles Phase 2/3 deploy. Already in STATE.md as Phase 7+ deliverable.
    - F-05 (`sk_test_*` Stripe key rotation) — pre-Phase-6-launch hygiene, no Phase 3 code change needed. Operator obligation; STATE.md tracks.
    - F-06 (structured log shipping, pino + redaction filter) — requires Phase 7+ Observability phase. Until then, hand-applied masking via L-06b is the contract.

### Implementation HOW Decisions (autonomous; operator can redirect)

The locked constraints above leave open the HOW questions. Decisions below resolve them so plan-phase and gsd-phase-researcher can proceed without re-asking. Each carries a short Why and a rejected alternative.

### Admin URL Structure

- **D-01: Five admin URLs ship in Phase 3.** Concrete paths (no route-group artifacts):
  1. `/dashboard` — admin landing (status counts + "Create policy" CTA + (Phase 8) compliance charts placeholder)
  2. `/policies` — library list with search + status filter
  3. `/policies/new` — create form
  4. `/policies/[id]` — edit page + version history + transition controls
  5. `/onboarding/create-org` — `<CreateOrganization />` for users without an active org
  - Plus: `/post-sign-in` (in the `(auth)` group, not `(admin)`) as the role-routing trampoline.
  - **Why these five:** Each maps to a ROADMAP Phase 3 success criterion (1–4) or to a carry-forward closure (`onboarding` drives webhook live-smoke; `dashboard` is the surface success criterion 4 verifies the list against). No `/settings` page in Phase 3 — Stripe Customer Portal link belongs in Phase 6.
  - **Rejected:** Single `/admin/...` URL prefix — works but adds an extra path segment to every URL with no Clerk-required reason (Clerk does NOT need the prefix; route groups already isolate the layout). Per-feature URL prefixes (`/policy-management/...`) — too verbose.

### TipTap Configuration

- **D-02: TipTap 2.x + StarterKit + Link extension only.** Editor configuration:
  - **Version:** TipTap 2.x stable (not 3.x beta). `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link` are the three packages. Three packages, all from the same major version.
  - **Extensions:** `StarterKit` (covers Bold, Italic, Strike, Code, Heading h1-h3, Paragraph, BulletList, OrderedList, ListItem, Blockquote, HorizontalRule, HardBreak, History, Document) PLUS `Link` (with `openOnClick: false` so clicks in editor don't navigate; `autolink: true` to recognize pasted URLs). Phase 3 ships no Image, no Table, no CodeBlock-with-syntax-highlight — those are post-MVP if customers ask.
  - **Output format:** TipTap's JSON output (`editor.getJSON()`) stored in `policies.contentJson` (jsonb) and `policy_versions.contentJson`. NOT HTML. JSON is the source of truth; HTML is rendered by `generateHTML(json, extensions)` (server-side, for `<PolicyView />` Server Component) or `EditorContent` (client-side, in `<PolicyEditor />`).
  - **Why JSON not HTML:** (1) Future AI Q&A (Phase 4) walks the JSON tree to extract structured text — HTML parsing in Node is messy. (2) The schema field is already `jsonb` per `reference/SCHEMA.md`. (3) HTML XSS is a hard problem; TipTap JSON has a known finite shape that's safe to round-trip.
  - **Server/Client split:** `PolicyEditor` is a Client Component (`'use client'`). It receives `initialContent: JSONContent` from a parent Server Component, manages local state via `useEditor`, and surfaces a `<form action={updatePolicyAction}>` with a hidden `<input name="content_json">` populated from `editor.getJSON()` on submit. The page-level `<PolicyView />` (read-only display) is a Server Component that calls `generateHTML(content, [StarterKit, Link])` and dangerously-sets the HTML — but the HTML originates from server-controlled JSON, so the XSS surface is the StarterKit allow-list (well-audited).
  - **Why Server Action over API route:** Next.js 15 Server Actions are the idiomatic form-mutation path. They get type-safe inputs, automatic CSRF protection, and `revalidatePath()` after success. API routes are still in the codebase (Phase 2 ships `/api/webhooks/clerk`; Phase 4 will add `/api/ai/*`), but mutations triggered by admin UI go through Server Actions. The 4xx-on-illegal-transition (success criterion 2) is returned by the Server Action throwing a typed error that the calling `<PolicyTransitionMenu />` surfaces via `useFormState`.
  - **Rejected:** TipTap 3.x beta (still moving), HTML output (XSS surface), API route for mutations (more boilerplate, less Next.js-idiomatic), client-side state machine (server is the authoritative gate per ADR-019; client mirrors for UX only).

### State Machine

- **D-03: Pure `state-machine.ts` module + server-action orchestrators.** Architecture:
  - **`lib/policies/state-machine.ts`** — pure functions, no DB access:
    ```typescript
    export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';
    export const ALLOWED_TRANSITIONS: Record<PolicyStatus, PolicyStatus[]> = {
      draft:        ['under_review', 'published'],   // admin can publish direct (Phase 3); gated to under_review only on Growth+ (Phase 6)
      under_review: ['published', 'draft'],          // approve or send back; 'draft' on reject
      published:    ['archived', 'draft'],           // archive OR edit-which-resets-to-draft
      archived:     ['draft'],                       // restore creates a new draft
    };
    export function canTransition(from: PolicyStatus, to: PolicyStatus): boolean { ... }
    ```
  - **`lib/policies/transitions.ts`** — server-only orchestrators, one per legal transition + one for edit-of-published:
    ```typescript
    'use server';
    // each opens withOrgScope, validates via state-machine, runs repository updates atomically
    export async function submitForReview(policyId: string, reviewerId: string | null): Promise<void>;
    export async function approve(policyId: string): Promise<void>;
    export async function reject(policyId: string, reason?: string): Promise<void>;
    export async function publish(policyId: string): Promise<void>;
    export async function archive(policyId: string): Promise<void>;
    export async function restore(policyId: string): Promise<void>;
    export async function editPublished(policyId: string, newContent: JSONContent, changeSummary?: string): Promise<void>;
    ```
  - **Server Actions** in `app/(admin)/policies/[id]/actions.ts` wrap these orchestrators with `revalidatePath('/policies')` + `revalidatePath('/policies/[id]')` calls. The action signatures take FormData (Next.js convention); they unmarshal + call into the orchestrator.
  - **Illegal-transition response shape:** orchestrators throw `IllegalTransitionError` with `{ from, to, allowedTransitions }`. Server Action catches → re-throws to client via Next.js error boundary OR returns a typed error in `useFormState` state. UI surfaces "Cannot transition from {from} to {to}. Allowed: {allowedTransitions}."
  - **Why split:** the pure state machine is a tiny module testable in isolation (the Phase 8 test harness will pound on it). The orchestrators add DB + revalidation. The Server Actions add Next.js plumbing. Three layers, three concerns.
  - **Rejected:** Single fat function per transition (mixes pure logic with DB calls — harder to test, harder to reuse for Phase 6 tier gating). Client-side state machine as authority (security hole — client could forge a `published` transition). XState (overkill for a 4-state DAG).

### Policy Versioning

- **D-04: New `policy_versions` row created ONLY on publish events.** Specific semantics:
  - **`draft` save (in-place edit on Draft):** NO new `policy_versions` row. The `policies.contentJson` is mutated in place. `currentVersion` stays at its current value.
  - **`draft → under_review`:** NO new version. Just status change.
  - **`under_review → published`:** **CREATE** a new `policy_versions` row capturing the about-to-be-published `contentJson` + `currentVersion`. `policies.currentVersion += 1` is updated as part of the same transaction. The new row is the canonical "as published vN" snapshot that any future `acknowledgments.policy_version_id` will reference.
  - **`under_review → draft` (reject):** NO new version.
  - **`published → draft` (edit-published):** **CREATE** a new `policy_versions` row capturing the current published `contentJson` (i.e., snapshot the pre-edit published state into history). Then update `policies.contentJson` with the new edit AND reset `status = 'draft'` AND `currentVersion += 1` (the next publish will create v(N+1)). This way the prior published version is preserved in `policy_versions` even after the admin starts editing.
  - **`published → archived`:** NO new version. Just status change.
  - **`archived → draft` (restore):** NO new version. The admin can edit + republish to create v(N+1).
  - **Why this rule:** REQ-policy-library says "Every edit creates a versioned record" — interpreted strictly, that would create a row on every Draft auto-save (heavy). REQ-policy-lifecycle is more specific: "Editing a published policy creates a new version and resets to Draft." We take the stricter reading: versions track the **published lineage**, not every Draft mutation. This matches the audit-trail intent (auditors want to see "what was published when," not "every keystroke"). Draft history is recoverable from git-style undo within TipTap's session — not from `policy_versions`.
  - **`changeSummary`:** Optional admin-supplied 1-line summary entered in a Dialog when triggering edit-of-published. Default empty. Stored on the `policy_versions` row.
  - **`createdBy` on version:** Always `getOrgContext().userId`. The Phase 2 `users.id` PK lookup is via `clerkUserId` — the orchestrator does this lookup once at entry.
  - **Rejected:** New row on every Draft save (noise + cost without auditor benefit), new row only on first publish (loses the pre-edit snapshot when admin re-edits a published policy).

### Search

- **D-05: Title + category ILIKE in Phase 3; content search deferred to Phase 4.**
  - **Phase 3 search:** `WHERE policies.org_id = scope.orgId AND (policies.title ILIKE '%' || $q || '%' OR policies.category ILIKE '%' || $q || '%')`. Case-insensitive. No tsvector. No ranking. Limit 100 results.
  - **Why ILIKE not tsvector:** SMB policy libraries are small (REQUIREMENTS.md says 25–300 employees). A 300-policy library searched with ILIKE on two indexed text columns completes in <5ms. tsvector + GIN index is the right answer at 10K+ policies; PolicyPilot is OLTP-tiny.
  - **Content search:** REQUIREMENTS REQ-policy-library says "Search by title, category, or content keyword." Content keyword is harder (jsonb walk or extracted-text column). Deferred to Phase 4 where the AI Q&A endpoint will need a similar primitive — Phase 4 will likely add an `extracted_text` column (extracted from `contentJson` on publish) + tsvector index. Phase 3 ships title+category only and a UI affordance ("Content search coming in v0.4" or similar — actually, just omit it; ship what works).
  - **Search input UX:** controlled `<Input />` at top of `/policies`, debounced 250ms, navigates to `/policies?q=...` (URL-state, not local state, so back-button works). Server-rendered with the search applied. No client-side filtering.
  - **Rejected:** tsvector + GIN now (premature for SMB scale; adds a column + index that's empty until Phase 4 needs it), client-side filtering of fetched-everything (doesn't scope by `org_id` at DB layer — that's the wrong architectural pattern even if it'd work).

### Admin UI Layout

- **D-06: shadcn Sidebar + Topbar pattern; desktop-first; left-side nav.**
  - **Layout shape:** `app/(admin)/layout.tsx` renders a flex container with `<AdminSidebar />` on the left (~240px wide) and `<main>` on the right. Topbar inside `<main>` with breadcrumbs + `<OrganizationSwitcher />` + `<UserButton />`.
  - **Sidebar items (Phase 3):** Dashboard (`/dashboard`), Policies (`/policies`), and an empty "Coming soon" placeholder list for Employees / Reports / Settings that grays them out with hover-tooltip "Available in Phase 5 / 7 / 6". This makes the eventual full surface visible without faking functionality.
  - **shadcn components from sidebar pattern:** `shadcn add sidebar` brings in `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarProvider`, `SidebarTrigger` (~9 files in `components/ui/sidebar.tsx` and friends — one shadcn command).
  - **Active-route highlight:** Sidebar item is `aria-current="page"` when the current pathname starts with its href. Server Component reads `headers().get('x-pathname')` via the standard Next.js 15 pattern (Next.js 15 doesn't expose `usePathname` server-side without middleware help; ship a tiny middleware addition: `requestHeaders.set('x-pathname', request.nextUrl.pathname)` in the existing `middleware.ts`).
  - **Mobile collapse:** shadcn Sidebar supports the collapse-to-icons pattern out of the box. Phase 3 ships the collapse but doesn't optimize the editor for narrow viewports — admin desktop-first per REQUIREMENTS.
  - **Theme:** Phase 1's zinc base / slate-700 accent (shadcn default). No theme overrides in Phase 3.
  - **Rejected:** Topbar-only (cramped at 5+ nav items by Phase 5+), hamburger menu only (slower for desktop admins who navigate frequently), custom layout from scratch (re-inventing what shadcn ships).

### Policy Library List

- **D-07: shadcn Table view with status badge column + search + status filter.**
  - **Columns:** Title (link to `/policies/[id]`), Category, Status (`<PolicyStatusBadge />`), Updated (relative time, e.g., "2 hours ago"), Created by (user name from `users.id` join).
  - **Sort:** default `updatedAt DESC`. Phase 3 ships ONE sort order; user-toggleable sort is Phase 8 polish.
  - **Filter:** A status filter (shadcn `Select`) at top with options: All, Draft, Under Review, Published, Archived. URL-state via `?status=`. Combines with `?q=` for search.
  - **Pagination:** None in Phase 3. `LIMIT 100` hard cap with a footer message: "Showing first 100 policies. Refine your search." Phase 8 (or earlier on customer ask) adds cursor pagination.
  - **Empty state:** "No policies yet. Create your first policy." with a primary `<Button asChild><Link href="/policies/new">Create policy</Link></Button>`.
  - **Why Table not Cards:** Admins scan policy lists like spreadsheets — title + status + last-updated at a glance. Cards inflate vertical space and hide status behind detail navigation. Table also makes Phase 8 export-to-CSV trivial (the columns ARE the CSV).
  - **Rejected:** Cards (verbose for spreadsheet-style scanning), virtualized table (premature for 100-row cap), client-side sort/filter (URL-state is the right primitive).

### Organization Onboarding

- **D-08: `<CreateOrganization />` at `/onboarding/create-org`; gated entry via `post-sign-in`.**
  - **Flow:** User signs in → Clerk redirects to `/post-sign-in` → Server Component reads `auth()` → if `userId` exists but `orgId` is null, `redirect('/onboarding/create-org')`. Otherwise dispatch to `/dashboard` (admin role) or `/my-policies` (employee role, stub OK).
  - **`/onboarding/create-org`:** Server Component renders Clerk's `<CreateOrganization afterCreateOrganizationUrl="/dashboard" />`. Form is Clerk-hosted; submission fires `organization.created` webhook to `/api/webhooks/clerk` (Phase 2 handler) which inserts the `organizations` row. Then Clerk redirects to `/dashboard`. This is the natural webhook live-smoke (carry-forward closure).
  - **Why route, not a modal:** A modal on `/dashboard` would require `/dashboard` to handle the no-org state, polluting the dashboard's happy-path. A dedicated route keeps `/dashboard` simple (assume org exists) and gives the operator a stable URL to bookmark / share with new admins.
  - **Operator manual step (Plan 03-01 / 03-02):** rotate `whsec_…` via Svix (SF-WHSEC-1 / L-04) BEFORE the first `<CreateOrganization />` click. Plan checkpoint:human-action gate.
  - **Rejected:** Auto-create the org from the user's email domain (wrong semantics — multiple users from `@acme.com` shouldn't auto-merge into one org), modal on dashboard (fragile no-org-state handling), in-line wizard inside `/dashboard` (clutters the landing).

### Form Validation

- **D-09: Server Actions + Zod schemas; minimal client-side validation.**
  - **Pattern:**
    ```typescript
    // app/(admin)/policies/new/actions.ts
    'use server';
    import { z } from 'zod';
    const CreatePolicySchema = z.object({
      title: z.string().min(1).max(200),
      category: z.string().min(1).max(50),
      content_json: z.string().transform((s) => JSON.parse(s) as JSONContent),
    });
    export async function createPolicyAction(prev: unknown, formData: FormData) {
      const parsed = CreatePolicySchema.safeParse(Object.fromEntries(formData));
      if (!parsed.success) return { error: parsed.error.flatten().fieldErrors };
      const ctx = await getOrgContext();
      const policyId = await withOrgScope(ctx, async (s) => {
        const [row] = await Policies.create(s, parsed.data);
        return row.id;
      });
      revalidatePath('/policies');
      redirect(`/policies/${policyId}`);
    }
    ```
  - **Client-side validation:** `<Form />` uses `useFormState` to render error messages. HTML `required` + `maxLength` attributes give the immediate "this field is required" feedback. NO React Hook Form in Phase 3 — Server Actions + native HTML5 + `useFormState` cover the surface without an extra dependency.
  - **Zod dependency check:** Confirm `zod` is in `package.json`. If absent, this is a **stack addition** that requires operator (Matthew) approval BEFORE running `pnpm add zod` — CLAUDE.md ASK FIRST rule #1 ("Any package not in the stack list above"). The plan that owns the actual install is 03-08; the approval gate is the **Task 2** legitimacy checkpoint (Task 1 in 03-08-PLAN handles `@tiptap/*`; zod is Task 2). CR-PR3-#9 closure (replaces an earlier autonomous-install instruction); CR-PR3-postreview corrected the Task number from 1 → 2.
  - **Why no React Hook Form:** RHF excels for complex multi-step forms with cross-field validation. Phase 3 forms are 2-3 fields; the marginal complexity isn't worth a package. Phase 6 (Stripe checkout) or Phase 8 (compliance dashboard filters) might revisit.
  - **Rejected:** Client-side-only validation (server is the gate, period), React Hook Form (overkill), Formik (deprecated trajectory).

### `tldrSummary` Display in Phase 3

- **D-10: Show TL;DR field as empty/disabled in Phase 3; populated by Phase 4.**
  - The edit form shows a `<Textarea readOnly placeholder="TL;DR will be auto-generated by AI on publish (Phase 4)">` field below the editor. This makes the planned shape visible without faking the AI surface.
  - On the policy detail view (`/policies/[id]`), if `tldrSummary` is `null`, hide the section entirely. Once Phase 4 lands and the publish flow populates the field, the section appears.
  - **Why surface a placeholder, not hide entirely:** Operator approval workflow review needs to know "the TL;DR slot exists; it'll fill in when AI ships." Hidden surfaces are forgotten surfaces.
  - **Rejected:** Manual entry of TL;DR (would conflict with the Phase-4 auto-fill on publish), hide-until-Phase-4 (out of sight, out of mind).

### Repository Bodies to Ship in Phase 3

- **D-11: Three repositories get real bodies in Phase 3.**
  - **`lib/db/repositories/policies.ts`** — `create`, `findById`, `listAll` (already partial from Phase 2), `listWithFilters({ q, status, limit })`, `updateDraft` (in-place content update on Draft), `incrementVersion` (used by edit-published path).
  - **`lib/db/repositories/policy_versions.ts`** — `create`, `listForPolicy`, `findByVersionNumber`. **NO `update`, NO `delete`** (L-05 type-system invariant).
  - **`lib/db/repositories/workflow_stages.ts`** — `recordSubmission(policyId, reviewerId)`, `recordDecision(stageId, decision, comment)`, `listForPolicy(policyId)`. The reviewer surface is Phase 6; Phase 3 ships the writes that happen on admin-driven transitions (`draft → under_review` writes a row).
  - **Repository methods stay `OrgScope`-first per ADR-023 / Phase 2 L-03.** No raw `db` usage anywhere in `app/(admin)/`.
  - **PolicyAssignments stays as Phase-2 stub** — Phase 5 owns the assignment surface. Phase 3 doesn't write assignments, but `Policies.listWithFilters` doesn't need them (admins see all org policies regardless of assignment).
  - **Rejected:** Ship all 9 repository bodies in Phase 3 (out of scope; couples Phase 3 to Phase 5+ semantics), use raw `db` for "just this one query" (breaks ADR-023 invariant — the `check-db-imports` gate would fail).

### Audit Trail in Phase 3

- **D-12: `policy_versions` rows ARE the edit-event audit trail. No separate audit_log table.**
  - REQ-policy-library mentions "audit trail captures viewed / acknowledged / edited events."
  - **`edited` events:** Phase 3 ships these as `policy_versions` rows (with `createdAt` + `createdBy` + optional `changeSummary`). Already covered by D-04.
  - **`acknowledged` events:** Phase 5 ships these as `acknowledgments` rows. Append-only per ADR-018.
  - **`viewed` events:** **DEFERRED.** No `policy_views` table in `reference/SCHEMA.md`. View tracking is a Phase 5+ feature (employee-side view tracking is more meaningful than admin self-views). The audit-report query for "edits" is `SELECT * FROM policy_versions WHERE policy_id = $1 ORDER BY created_at`. The acknowledgments query is Phase 5. View tracking is Phase 5+ (parking lot — surface to operator if customer asks).
  - **Rejected:** New `audit_log` table (premature; `policy_versions` + `acknowledgments` cover the spec).

### shadcn Components to Install in Phase 3

- **D-13: One `shadcn add` invocation, eight new components.**
  - `shadcn add table sidebar dropdown-menu dialog form label select textarea badge`
  - Already installed (Phase 1): `button card input`
  - Total Phase 3 surface after install: 11 components — minimum for the admin shell + policy library + editor.
  - **Why one invocation:** shadcn's `add` is idempotent; bundling reduces operator commands. Plan 03-02 ships this as a single shell step.
  - **No new packages beyond shadcn-installed:** TipTap is its own dependency add (`pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-link`) — 3 packages. Zod is checked against `package.json` and added if missing.

### Claude's Discretion

The following are left to plan-phase / executor judgment within the constraints above:

- **Exact wording of UI copy** (button labels, empty-state messages, error toasts) — Plan-phase writes reasonable defaults; operator can tweak post-Phase-3 without engineer intervention.
- **shadcn Table column widths + responsive truncation behavior** — Plan-phase picks sensible defaults; visual polish lands as needed.
- **Status badge color mapping** — recommendation: `draft` = `outline`, `under_review` = `secondary` (yellow), `published` = `default` (green-ish), `archived` = `muted`. Plan-phase free to pick alternatives within shadcn's variant set.
- **Whether `<PolicyEditor />` shows a sticky toolbar or a floating bubble menu** — recommendation: sticky toolbar (more discoverable for non-power users like HR managers). Floating menu is post-MVP polish.
- **Server Action error UI** — recommendation: shadcn `Sonner` toasts for transient errors, in-form red-text for validation errors. Plan-phase picks the wiring.
- **The exact regex / AST approach in `scripts/check-admin-routes.ts`** — recommendation: AST via ts-morph (already pinned by Phase 2 L-05 / D-08); reuses the existing tooling.
- **Whether `/dashboard` shows policy-status counts via repository call or SQL aggregate** — recommendation: SQL aggregate via `Policies.statusCounts(s)`. One query, four rows back. Plan-phase implements.

### Folded Todos

- **`SF-WHSEC-1: rotate Clerk whsec_… signing secret`** (STATE.md carry-forward) — folded as **L-04**, blocking operator-manual gate in Plan 03-01.
- **`CR-02: replace dead /(admin)/(.*) matcher with concrete URLs`** (STATE.md carry-forward) — folded as **L-02 + D-01**, executed in Plan 03-02 alongside the route shipment.
- **`REG-P1-01: /sign-in-success fetch failure`** (STATE.md carry-forward) — folded as **L-03**, executed in Plan 03-02 as the `/post-sign-in` rewrite.
- **`Webhook live-smoke deferred from Plan 02-06`** (STATE.md carry-forward) — folded as **D-08**, naturally exercised by the first `<CreateOrganization />` flow.
- **`SF-CASCADE-AUDIT: Phase 6+ tenant-delete audit hook`** (STATE.md carry-forward) — NOT folded into Phase 3; remains a Phase 6+ obligation when org-delete code path lands. Re-noted in `<deferred>`.
- **`Nyquist G-08a / G-09a / G-03a`** (STATE.md carry-forward) — NOT folded into Phase 3; these are Phase 2.1 hardening candidates orthogonal to the Admin UI surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (gsd-phase-researcher, gsd-planner) MUST read these before planning or implementing.**

### Architectural decisions (locked ADRs — read in full)

- `.planning/intel/decisions.md` — full text for **ADR-008** (Repository Layout — route groups `(admin)`, `(employee)`, etc.), **ADR-009** (Middleware = Clerk auth + role routing; admin gate via `publicMetadata.role === 'admin'`), **ADR-010** (Next.js 15 App Router only — Server Actions are the idiomatic mutation path), **ADR-018** (append-only acknowledgments; `policy_versions` follow the same NEVER-deleted rule per L-05), **ADR-019** (org_id-in-every-query — repositories enforce; admin pages always go through `withOrgScope`), **ADR-023** (per-aggregate repositories + raw-`db` allow-list — admin pages MUST NOT import raw `db`), **ADR-025** (RLS via per-transaction JWT injection — admin pages run inside `withOrgScope` which sets it up).
- `.planning/PROJECT.md` `<decisions>` block — short-form catalog of all 25 ADRs.

### Schema (frozen FOUNDRY contracts — Phase 2 amendments take precedence)

- `reference/SCHEMA.md` — `policies`, `policy_versions`, `policy_assignments`, `workflow_stages` table shapes. **Live source of truth is `lib/db/schema.ts`** post-Phase-2 (D-02 denormalized `org_id` onto child tables; 0003 added cascade-on-org + composite same-org dept FK).
- `lib/db/schema.ts` — read in-repo to confirm column names + nullability + cascade behavior.

### Requirements (Phase 3 anchoring)

- `.planning/REQUIREMENTS.md` **REQ-policy-library** — TipTap editor, categories, version history (D-04 implements), status states (D-03 implements), search (D-05 implements).
- `.planning/REQUIREMENTS.md` **REQ-policy-lifecycle** — state machine (D-03), Growth+ approval gate (Phase 6 layers on top), edit-published creates new version + resets to Draft (D-04 / L-05).
- `.planning/REQUIREMENTS.md` **REQ-access-control** — admins see all statuses scoped by org_id (Phase 3 admin surface); employees see only Published + assigned (Phase 5).
- `.planning/ROADMAP.md` Phase 3 — goal, depends-on Phase 2, anchoring decisions (ADR-008, ADR-009), five success criteria.

### API contracts (informational; Phase 3 uses Server Actions, not API routes)

- `reference/API-SPEC.md` — every API route contract. Phase 3 does not add API routes; mutations are Server Actions.

### Existing code from Phase 1 + Phase 2 (read before extending)

- `lib/auth/context.ts` — `getOrgContext()` returns `{ orgId, userId, role }`. Admin pages call this at the layout level for the role gate (L-01).
- `lib/db/scoped.ts` — `withOrgScope(ctx, fn)` wrapper. Every admin Server Action wraps its DB work in this.
- `lib/db/repositories/policies.ts` — Phase 2 ships skeleton with `create`, `findById`, `listAll` stubs. Phase 3 fills in real bodies per D-11.
- `lib/db/repositories/policy_versions.ts` — Phase 2 skeleton. Phase 3 fills bodies for `create`, `listForPolicy`, `findByVersionNumber` only. No update/delete per L-05.
- `lib/db/repositories/workflow_stages.ts` — Phase 2 skeleton. Phase 3 fills `recordSubmission`, `recordDecision`, `listForPolicy`.
- `middleware.ts` — Phase 1 + Phase 2 ships the chokepoint with SF-M4 fold. Phase 3 rewrites the `isAdminRoute` matcher per L-02.
- `app/(auth)/sign-in-success/page.tsx` — Phase 1 placeholder. **DELETE** in Phase 3 (L-03) and replace with `app/(auth)/post-sign-in/page.tsx`.
- `app/(marketing)/*` — Phase 1 landing + pricing. Phase 3 does not touch these.
- `app/api/webhooks/clerk/route.ts` — Phase 2 webhook handler. Phase 3 does NOT modify; just exercises end-to-end via `<CreateOrganization />`.
- `tests/types.ts` — Phase 2 type-test file. Phase 3 extends with two new `@ts-expect-error` lines for PolicyVersions invariants per L-05.
- `scripts/check-artifacts.ts` — Phase 1 + Phase 2 artifact gate. Phase 3 extends with rows for the new admin pages + components + the new check script.

### Operating rules (apply globally; called out for Phase 3 because they bind hard here)

- `CLAUDE.md` "Always / Ask First / Never" — TipTap is in stack (mentioned in BLUEPRINT §6); Zod likely already installed (verify in plan-phase). NEVER use raw `db` in `app/(admin)/*`. ALWAYS go through `withOrgScope` for any DB read or write in admin pages.
- `CLAUDE.md` "Multi-Tenancy Rules" — every Policies query gets `org_id` via `withOrgScope`; RLS is the last line of defense.
- Phase 2's `02-CONTEXT.md` D-04 — `publicMetadata.role` is the source of truth for the admin role check. Layout's `requireAdmin()` reads the same field as `middleware.ts`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 1 + Phase 2)

- **`getOrgContext()` + `withOrgScope()`** — the two primitives every admin page builds on. Layout-level role check uses `getOrgContext()` directly (throws on missing role); page-level DB work wraps in `withOrgScope(ctx, async (s) => ...)`.
- **`<ClerkProvider>` already at `app/layout.tsx`** — Phase 1 D-09. Admin layout adds `<OrganizationSwitcher />` + `<UserButton />` (Clerk-shipped components) inside the topbar without needing extra setup.
- **shadcn `Button`, `Card`, `Input`** — Phase 1 installed three components. Phase 3 adds eight more in one invocation per D-13.
- **`Policies` / `PolicyVersions` / `WorkflowStages` repository skeletons** — Phase 2 ships these with throw-stub bodies + correct `OrgScope`-first signatures. Phase 3 fills bodies; signatures stay.
- **`tests/types.ts` @ts-expect-error pattern** — Phase 2 D-07. Phase 3 extends with two new lines:
  ```typescript
  // @ts-expect-error — PolicyVersions must not expose update (L-05 / ADR-018-spirit)
  void PolicyVersions.update;
  // @ts-expect-error — PolicyVersions must not expose delete (L-05 / ADR-018-spirit)
  void PolicyVersions.delete;
  ```
- **`scripts/check-artifacts.ts` pattern** — Phase 3 adds Phase-3 file-existence rows + the new `scripts/check-admin-routes.ts` ts-morph audit.

### Established Patterns (carried forward verbatim)

- **`'server-only'`** at the top of every server module — including all new `lib/policies/*.ts`, all server actions, all repository extensions.
- **Server Actions** for mutations — `'use server'` directive at top of action files; FormData input; Zod validation; throw on auth/transition failure.
- **Server Components** for reads — page-level reads call `getOrgContext()` + `withOrgScope(ctx, async (s) => ...)`; data fetched at render time, no client-side fetch waterfall.
- **Migration env split** — no new migrations in Phase 3 (schema unchanged). If a Phase 3 amendment surfaces (unlikely), follow Phase 2 D-05 pattern.
- **shadcn add via CLI** — `shadcn add <component>` is the only sanctioned way to install. No hand-copied components.

### Integration Points

- **Clerk `<CreateOrganization />` ingress** — `/onboarding/create-org` is a new public-ish admin route (signed-in users only, but no `requireAdmin()` because they're being onboarded). middleware lets it through with regular auth (`'/onboarding/(.*)'` matcher addition).
- **Clerk webhook smoke** — the FIRST live-smoke of the Phase 2 webhook happens here. Operator opens `/onboarding/create-org`, Clerk fires `organization.created`, Phase 2 handler inserts the row. Plan 03-N includes operator-verification steps for this.
- **`policy_versions` writes** — only happen from inside `lib/policies/transitions.ts` orchestrators (`publish`, `editPublished`). Admin pages never write `policy_versions` directly.
- **TipTap editor lifecycle** — `useEditor` mounts on Client Component mount; content syncs to hidden form input on every keystroke (debounced 300ms in Phase 3 — heavier debounce can be Phase 8 polish). Submit unmounts the editor + posts the form to the Server Action.

</code_context>

<specifics>
## Specific Ideas

- **`requireAdmin()` exact body:**
  ```typescript
  // lib/auth/require-admin.ts
  import 'server-only';
  import { notFound } from 'next/navigation';
  import { getOrgContext, type OrgContext } from '@/lib/auth/context';

  export async function requireAdmin(): Promise<OrgContext> {
    const ctx = await getOrgContext();
    if (ctx.role !== 'admin') notFound();   // D-10 "advertise nothing"
    return ctx;
  }
  ```

- **`canTransition` exact body:**
  ```typescript
  // lib/policies/state-machine.ts
  export type PolicyStatus = 'draft' | 'under_review' | 'published' | 'archived';

  export const ALLOWED_TRANSITIONS = {
    draft:        ['under_review', 'published'] as const,
    under_review: ['published', 'draft'] as const,
    published:    ['archived', 'draft'] as const,   // 'draft' only via editPublished
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

- **`publish` orchestrator exact body (D-04 semantics):**
  ```typescript
  // lib/policies/transitions.ts
  'use server';
  import 'server-only';
  import { sql } from 'drizzle-orm';
  import { withOrgScope } from '@/lib/db/scoped';
  import { getOrgContext } from '@/lib/auth/context';
  import { Policies } from '@/lib/db/repositories/policies';
  import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
  import { canTransition, IllegalTransitionError } from './state-machine';

  export async function publish(policyId: string): Promise<void> {
    const ctx = await getOrgContext();
    await withOrgScope(ctx, async (s) => {
      const policy = await Policies.findById(s, policyId);
      if (!policy) throw new Error('Policy not found');
      if (!canTransition(policy.status, 'published')) {
        throw new IllegalTransitionError(policy.status, 'published');
      }
      // CREATE policy_versions row capturing about-to-be-published content
      await PolicyVersions.create(s, {
        policyId: policy.id,
        versionNumber: policy.currentVersion,
        contentJson: policy.contentJson,
        createdBy: s.userId,
      });
      // Update policy status (currentVersion stays at the just-snapshot value)
      await s.tx
        .update(policies)
        .set({ status: 'published', updatedAt: sql`now()` })
        .where(eq(policies.id, policyId));
    });
  }
  ```

- **`editPublished` orchestrator exact body:**
  ```typescript
  export async function editPublished(
    policyId: string,
    newContent: JSONContent,
    changeSummary?: string,
  ): Promise<void> {
    const ctx = await getOrgContext();
    await withOrgScope(ctx, async (s) => {
      const policy = await Policies.findById(s, policyId);
      if (!policy) throw new Error('Policy not found');
      if (policy.status !== 'published') {
        throw new IllegalTransitionError(policy.status, 'draft');
      }
      // Snapshot the prior published version BEFORE overwriting
      await PolicyVersions.create(s, {
        policyId: policy.id,
        versionNumber: policy.currentVersion,
        contentJson: policy.contentJson,        // the still-current published content
        createdBy: s.userId,
        changeSummary,
      });
      // Now overwrite + reset to draft + bump currentVersion
      await s.tx
        .update(policies)
        .set({
          contentJson: newContent,
          status: 'draft',
          currentVersion: policy.currentVersion + 1,
          updatedAt: sql`now()`,
        })
        .where(eq(policies.id, policyId));
    });
  }
  ```

- **`middleware.ts` admin matcher rewrite (CR-02 / L-02):**
  ```typescript
  // middleware.ts
  const ADMIN_URL_PATTERNS = [
    /^\/dashboard(\/|$)/,
    /^\/policies(\/|$)/,
    /^\/onboarding(\/|$)/,
  ];
  function isAdminRoute(pathname: string): boolean {
    return ADMIN_URL_PATTERNS.some((p) => p.test(pathname));
  }
  // ... existing middleware body, replacing the old `/(admin)/(.*)` regex with `isAdminRoute(pathname)`
  ```

- **`scripts/check-admin-routes.ts` exact intent:**
  1. Read `middleware.ts` and parse out the `ADMIN_URL_PATTERNS` array via ts-morph.
  2. Walk `app/(admin)/` and collect every `page.tsx` file. Convert the file path to a URL (strip `(admin)` route-group segments, drop `/page.tsx`).
  3. Assert: every URL collected in (2) matches at least one pattern in (1). And every pattern in (1) matches at least one URL in (2).
  4. Also walk `app/(admin)/**/actions.ts` and assert each Server Action body contains `withOrgScope(` somewhere (regex or AST). Catches the "forgot to wrap in withOrgScope" foot-gun.
  5. Exit 0 on all-pass.

- **Operator manual steps to call out in Plan 03-01 (mirror Plan 02-02 pattern):**
  1. **Svix Dashboard** → rotate Clerk webhook signing secret. Paste new `whsec_…` into `.env.local` `CLERK_WEBHOOK_SECRET`. **DO NOT paste into chat.** (L-04 / SF-WHSEC-1)
  2. **Clerk Dashboard** → app settings → "After sign-in URL": change from `/sign-in-success` (Phase 1 placeholder) to `/post-sign-in`. (L-03 / REG-P1-01)
  3. **Clerk Dashboard** → confirm Organizations toggle still ON (Phase 1 D-09 — should already be set, but verify).
  4. Run `pnpm verify:phase-2` once after the rotation to confirm webhook signature verification still works against the new secret (the verify script doesn't hit Clerk — it just confirms the env var is set; full live-smoke happens via `<CreateOrganization />`).

</specifics>

<deferred>
## Deferred Ideas

- **AI "Generate draft" button on `/policies/new`** — Phase 4 owns the Claude integration. Phase 3 ships an empty editor; admins type or paste manually. UI surface for the button stays out of Phase 3 to avoid faking the feature.
- **TL;DR auto-generation on publish** — Phase 4 wires this. Phase 3 leaves `policies.tldrSummary` NULL and shows a disabled placeholder field per D-10.
- **Reviewer-tier gating** — REQ-policy-lifecycle says "Growth+ orgs cannot bypass approval workflow to publish." Phase 6 (Billing) adds `requireTier('reviewer-workflow')` checks on the `publish` and `submitForReview` actions. Phase 3 lets admins do everything; the gating is layered later without modifying the state machine.
- **Reviewer surface (`workflow_stages` listing for reviewers)** — Phase 6 ships the reviewer-tier; Phase 6 OR Phase 7 ships the reviewer's "pending reviews" page. Phase 3 writes `workflow_stages` rows but doesn't read them back outside admin context.
- **Policy "viewed" tracking** — Phase 5 surfaces (employee viewing). No schema change needed in Phase 3.
- **Content-keyword search via tsvector** — Phase 4 likely adds an `extracted_text` column on `policies` (extracted from `contentJson` on publish) + a GIN index. Phase 3 search covers title + category only.
- **Cursor pagination on `/policies`** — Phase 8 polish. Phase 3 hard-caps at 100 results.
- **CSV export from policy library** — Phase 8 (compliance dashboard owner). Phase 3 ships only the read surface.
- **Mobile-responsive admin editor** — admin is desktop-first per REQUIREMENTS. Phase 8 may add responsive polish if customer demand surfaces.
- **Image / table / code-block extensions for TipTap** — post-MVP. Phase 3 ships StarterKit + Link only per D-02.
- **Sort-toggleable policy library columns** — Phase 8 polish; Phase 3 default-sorts by `updatedAt DESC`.
- **Auto-save Draft policies** — REQ-policy-library doesn't require it; Phase 3 ships explicit Save buttons. Auto-save is post-MVP UX polish.
- **SF-CASCADE-AUDIT (from STATE.md Phase 2 follow-ups)** — Phase 6+ obligation when tenant-delete code path lands. NOT a Phase 3 concern; Phase 3 doesn't add tenant-delete surface. Carry-forward stays in STATE.md.
- **Nyquist G-08a / G-09a / G-03a (from STATE.md Phase 2 follow-ups)** — Phase 2.1 hardening candidates (webhook runtime contract test + over-grant audit). Orthogonal to Phase 3 admin surface; pick up when convenient.
- **Audit-log table (separate from policy_versions + acknowledgments)** — D-12 covered this; revisit if a future requirement needs viewed-event tracking beyond what `acknowledgments.acknowledgedAt` already gives.
- **`<OrganizationProfile />` admin surface for managing org members** — Phase 5 (or wherever the employee CRUD surface lands).
- **"Restore from version" button on `<PolicyVersionHistory />`** — allow admin to roll back to a prior version. Phase 8 polish; semantically straightforward (call `editPublished` with the old version's `contentJson`) but UX-noise in MVP.

### Reviewed Todos (not folded)

- **SF-CASCADE-AUDIT** — not foldable into Phase 3 (Phase 6+ concern; surfaced for future-phase awareness).
- **Nyquist G-08a / G-09a / G-03a** — not foldable into Phase 3 (Phase 2.1 hardening; orthogonal to admin UI).
- **F-03 (audit) — Clerk webhook rate limit** — requires Phase 7+ Railway worker. Vercel platform handles Phase 2/3 DDoS. STATE.md tracks as Phase 7+ deliverable.
- **F-05 (audit) — rotate `sk_test_*` Stripe key** — hygiene action before Phase 6 launch. No Phase 3 code change.
- **F-06 (audit) — structured log shipping (pino + redaction filter)** — requires Phase 7+ Observability phase. Phase 3 ships L-06b hand-applied org-id masking as the interim contract; pino-level redaction replaces it later.

</deferred>

---

*Phase: 3-Admin UI*
*Context gathered: 2026-05-19*
</content>
</invoke>