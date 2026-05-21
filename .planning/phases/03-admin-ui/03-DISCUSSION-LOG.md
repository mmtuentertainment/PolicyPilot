# Phase 3: Admin UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 3 - Admin UI
**Mode:** `--all` (auto-selected all gray areas, autonomous decisions under the operator's no-clarifying-questions directive)
**Areas discussed:**
- USER-LOCKED constraints (5) — carry-forwards from STATE.md + Phase 2 architectural decisions
- Admin URL structure (closes CR-02)
- TipTap editor configuration
- State machine implementation
- Policy versioning trigger semantics
- Search implementation
- Admin UI layout pattern
- Policy library list rendering
- Organization onboarding flow (drives webhook live-smoke)
- Form validation pattern
- TL;DR display before Phase 4 ships AI
- Repository bodies in Phase 3
- Audit trail in Phase 3
- shadcn components to install

---

## USER-LOCKED Constraints

| Item | Description | Source |
|------|-------------|--------|
| L-01 | Admin gate enforcement: server-side `requireAdmin()` in layout + middleware defense-in-depth | ADR-009 + Phase 1 D-10 |
| L-02 | CR-02 closure: replace dead `/(admin)/(.*)` matcher with explicit URL patterns | STATE.md carry-forward (CR-02) |
| L-03 | REG-P1-01 closure: delete `/sign-in-success` placeholder, replace with `/post-sign-in` real router | STATE.md carry-forward (REG-P1-01) |
| L-04 | SF-WHSEC-1 closure: operator rotates Clerk `whsec_…` via Svix before Phase 3 webhook live-smoke | STATE.md carry-forward (SF-WHSEC-1) |
| L-05 | `PolicyVersions` exports no `update` / `delete` — `@ts-expect-error` invariants in `tests/types.ts` | ADR-018 spirit (audit-trail immutability) |

**Decision rationale:** All five are pre-locked by prior decisions / Phase-2 carry-forwards — not gray areas. Plan-phase + execute-phase MUST honor them. L-02 + L-03 close real bugs (dead-code matcher + fetch-failing placeholder); L-04 closes a security hygiene gap (leaked secret); L-05 extends Phase 2's @ts-expect-error pattern to the next audit-trail table.

---

## Admin URL Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 5 concrete URLs: `/dashboard`, `/policies`, `/policies/new`, `/policies/[id]`, `/onboarding/create-org` | One URL per ROADMAP success criterion or carry-forward; `(admin)` route group hides them from the URL | ✓ |
| `/admin/...` URL prefix | Visible prefix; adds a path segment without Clerk-required reason | |
| Per-feature URL prefixes (`/policy-management/...`) | Too verbose | |

**Selected:** 5 URLs (D-01). Each maps to a ROADMAP success criterion (#1 create, #2 transition, #3 edit-published, #4 library list) or a carry-forward closure (`/onboarding/create-org` drives the Phase 2 webhook live-smoke; `/post-sign-in` in the `(auth)` group is the role-routing trampoline). No `/settings` page in Phase 3 — Customer Portal link belongs in Phase 6.

---

## TipTap Editor Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| TipTap 2.x + StarterKit + Link, JSON output, Client Component | Stable major version; JSON in `policies.contentJson` jsonb; `'use client'` editor wrapper | ✓ |
| TipTap 3.x beta | Newer API but still moving; risk of mid-phase churn | |
| HTML output instead of JSON | Mirrors what most CMS tools do; XSS surface is larger and jsonb column was already designed for JSON | |
| Image / Table / CodeBlock extensions | Useful but not required by REQUIREMENTS; post-MVP unless customer asks | |

**Selected:** TipTap 2.x + StarterKit + Link only (D-02). JSON output is the source of truth (stored in `policies.contentJson` jsonb per Phase 2 schema). Server-rendered display uses `generateHTML(json, [StarterKit, Link])` against the known-safe extension allow-list. Client editor is a `'use client'` component wrapping `useEditor`. Mutation flows through Server Actions (Next.js 15 idiom), not API routes.

---

## State Machine Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| Pure `state-machine.ts` + orchestrators in `transitions.ts` + Server Action wrappers | Three layers, three concerns: pure logic, DB orchestration, Next.js plumbing | ✓ |
| Single fat function per transition (logic + DB intermixed) | Simpler shape but harder to test + harder to layer Phase 6 tier gating onto | |
| Client-side state machine as authority | Security hole — client could forge a `published` transition; server MUST be authoritative per ADR-019 | |
| XState | Overkill for a 4-state DAG | |

**Selected:** Three-layer split (D-03). The pure `lib/policies/state-machine.ts` is independently testable. `lib/policies/transitions.ts` orchestrators wrap each transition in `withOrgScope` and call repositories. Server Actions in `app/(admin)/policies/[id]/actions.ts` add Next.js plumbing (`revalidatePath`, FormData unmarshaling). Illegal-transition response: `IllegalTransitionError` thrown by orchestrator, caught by Server Action, surfaced to client via `useFormState`.

---

## Policy Versioning Trigger Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Create `policy_versions` row ONLY on publish events (`under_review → published` + `published → draft` edit) | Versions track the **published lineage**; Draft saves are mutable until publish | ✓ |
| Create row on every save (including Draft auto-saves) | Strict reading of REQ-policy-library "every edit creates a versioned record"; creates noise + cost | |
| Create row only on first publish (no snapshot at edit-published) | Loses the pre-edit published state when admin edits a published policy | |

**Selected:** Publish-only versioning (D-04). REQ-policy-lifecycle is explicit: "Editing a published policy creates a new version and resets to Draft." REQ-policy-library says "Every edit creates a versioned record" — interpreted as "every edit of published" rather than "every keystroke." This matches the audit-trail intent (auditors want as-of-publish snapshots, not draft churn). Acknowledgments point at the `policy_version_id` they were taken against, and those snapshots remain even after the admin starts re-editing.

---

## Search Implementation

| Option | Description | Selected |
|--------|-------------|----------|
| `ILIKE` on title + category, scoped by `org_id`, LIMIT 100 | SMB libraries are small (25–300 employees); ILIKE on indexed text columns completes in <5ms | ✓ |
| tsvector + GIN index over title + category + extracted_text | Correct for 10K+ policies; premature at SMB scale | |
| Client-side filtering of fetched-everything | Wrong architectural pattern (DB layer should scope by org_id, not the client) | |

**Selected:** ILIKE on title + category only (D-05). Content-keyword search is deferred to Phase 4 where the AI Q&A endpoint will likely add `extracted_text` + tsvector. Phase 3 doesn't pretend to support content search — UI omits the option to avoid misleading the user.

---

## Admin UI Layout

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn Sidebar (left, 240px) + topbar with `<OrganizationSwitcher />` + `<UserButton />`, desktop-first | Industry-standard SaaS admin shell; collapses to icons on narrow viewports; one shadcn `add sidebar` invocation | ✓ |
| Topbar-only (no sidebar) | Cramped at 5+ nav items by Phase 5+ | |
| Hamburger menu (mobile-first) | Slower for desktop admins who navigate frequently | |
| Custom layout from scratch | Re-invents what shadcn already ships | |

**Selected:** Sidebar + topbar (D-06). Sidebar items in Phase 3: Dashboard + Policies + grayed-out "Coming soon" placeholders for Employees / Reports / Settings (with tooltips indicating their phase). Active-route highlight via `headers().get('x-pathname')` (middleware ships the header on every request). Theme: Phase 1's zinc/slate default — no overrides.

---

## Policy Library List

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn Table with Title + Category + Status + Updated + Created-by columns; status filter; ILIKE search; LIMIT 100 cap | Admins scan like spreadsheets; table is denser than cards | ✓ |
| Card view | Verbose for spreadsheet-style scanning; inflates vertical space | |
| Virtualized table (e.g., react-window) | Premature for a 100-row cap | |

**Selected:** Table view with hard 100-row cap (D-07). Default sort: `updatedAt DESC`. Status filter via shadcn `Select`. URL-state for `?q=` and `?status=` (back-button works). Empty state: "No policies yet" + primary Create CTA. Pagination deferred to Phase 8 polish.

---

## Organization Onboarding Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `/onboarding/create-org` route, gated entry via `/post-sign-in` redirect chain | Stable URL; clean separation from dashboard happy-path; natural webhook smoke | ✓ |
| Modal on `/dashboard` | Forces dashboard to handle the no-org state, polluting the happy-path | |
| Auto-create org from email domain | Wrong semantics — multiple users at `@acme.com` shouldn't merge into one org | |
| In-line wizard on `/dashboard` | Clutters the landing | |

**Selected:** Dedicated `/onboarding/create-org` route (D-08). `/post-sign-in` Server Component reads `auth()` and redirects: no org → `/onboarding/create-org`, admin → `/dashboard`, employee → `/my-policies` (Phase 5 stub). The Clerk-hosted `<CreateOrganization />` fires `organization.created` → Phase 2 webhook handler → DB insert. This is the natural webhook live-smoke (carry-forward closure). Operator rotates `whsec_…` via Svix BEFORE the first click (L-04 / SF-WHSEC-1).

---

## Form Validation Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Server Actions + Zod + `useFormState` for error display; native HTML5 attributes for immediate feedback | Idiomatic Next.js 15; no extra package; server is the gate | ✓ |
| React Hook Form + Zod | Overkill for 2-3 field forms; useful at Phase 6+ checkout complexity | |
| Formik | Deprecated trajectory | |
| Client-side-only validation | Server MUST be the gate per ADR-019 | |

**Selected:** Server Actions + Zod (D-09). Zod is checked against `package.json`; added via `pnpm add zod` if absent. Native HTML5 (`required`, `maxLength`) gives the immediate UX; `useFormState` surfaces server-side errors. No React Hook Form in Phase 3 — revisit at Phase 6/8 if a multi-step or complex-conditional form arrives.

---

## TL;DR Display Before Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| Show disabled `<Textarea readOnly placeholder="TL;DR will be auto-generated by AI on publish (Phase 4)">` | Surface the planned shape; admin sees the slot for future awareness | ✓ |
| Allow manual TL;DR entry | Would conflict with Phase 4 auto-fill on publish | |
| Hide entirely until Phase 4 | Out of sight, out of mind — surface area surprises later | |

**Selected:** Disabled placeholder (D-10). On detail view (`/policies/[id]`), if `tldrSummary` is NULL the section is hidden entirely. Once Phase 4 ships and publishes start populating the field, the section appears automatically.

---

## Repository Bodies in Phase 3

| Option | Description | Selected |
|--------|-------------|----------|
| Three repos get real bodies: `Policies`, `PolicyVersions`, `WorkflowStages` | Each is touched by Phase 3's admin surface; PolicyAssignments stays Phase-2 stub for Phase 5 | ✓ |
| All 9 repos get full bodies in Phase 3 | Out of scope; couples Phase 3 to Phase 5+ semantics | |
| Use raw `db` for "just this one query" | Breaks ADR-023 invariant — `check-db-imports` gate would fail | |

**Selected:** Three-repo scope (D-11). `Policies` adds `listWithFilters`, `updateDraft`, `incrementVersion`. `PolicyVersions` adds `create`, `listForPolicy`, `findByVersionNumber` (no update / delete per L-05). `WorkflowStages` adds `recordSubmission`, `recordDecision`, `listForPolicy`. `PolicyAssignments` stays as Phase 2 stub — Phase 5 owns it.

---

## Audit Trail in Phase 3

| Option | Description | Selected |
|--------|-------------|----------|
| `policy_versions` rows ARE the edit-event audit trail; no separate `audit_log` table | REQ-policy-library mentions viewed/acknowledged/edited; Phase 3 ships only `edited` (via versions) | ✓ |
| New `audit_log` table for separate audit-event types | Premature; existing tables (`policy_versions` + `acknowledgments`) cover the spec | |

**Selected:** Re-use `policy_versions` (D-12). `acknowledged` events are Phase 5's `acknowledgments` table. `viewed` events deferred to Phase 5+ (no `policy_views` table in SCHEMA.md). Audit-report query for edits: `SELECT * FROM policy_versions WHERE policy_id = $1 ORDER BY created_at`.

---

## shadcn Components

| Option | Description | Selected |
|--------|-------------|----------|
| One `shadcn add` invocation: `table sidebar dropdown-menu dialog form label select textarea badge` | Eight new components in one operator step | ✓ |
| Add per-page as needed | More operator steps; risk of mismatched component versions if shadcn updates between adds | |

**Selected:** Bundled add (D-13). After install, total Phase 3 surface is 11 shadcn components (3 from Phase 1 + 8 new). TipTap pulls in 3 npm packages (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`). Zod is `pnpm add zod` if not already in `package.json`.

---

## Folded Todos

- **SF-WHSEC-1** (rotate Clerk webhook signing secret) → L-04, blocking operator-manual gate in Plan 03-01.
- **CR-02** (replace dead admin matcher) → L-02 + D-01, executed in Plan 03-02 alongside route shipment.
- **REG-P1-01** (`/sign-in-success` fetch failure) → L-03, executed in Plan 03-02 as `/post-sign-in` rewrite.
- **Webhook live-smoke** (deferred from Plan 02-06) → D-08, naturally exercised by `<CreateOrganization />`.

## Reviewed Todos (not folded)

- **SF-CASCADE-AUDIT** — Phase 6+ obligation when tenant-delete code path lands.
- **Nyquist G-08a / G-09a / G-03a** — Phase 2.1 hardening candidates orthogonal to admin surface.

---

*Phase: 3-Admin UI*
*Discussion log: 2026-05-19*
*Mode: `--all` (autonomous decisions under no-clarifying-questions directive)*
