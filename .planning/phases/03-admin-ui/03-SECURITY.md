---
phase: 03
slug: admin-ui
status: SECURED
threats_open: 0
threats_total: 67
threats_closed: 67
asvs_level: 2
created: 2026-05-21
audited_against_commit: db5ab77
register_authored_at_plan_time: true
state: B (retroactive)
---

# Phase 3 — Security

> Retroactive State-B audit. Threat register built from `<threat_model>` blocks in 14 PLAN files (03-00..03-11 + 03-G1/G2) and `## Threat Flags` sections in 15 SUMMARY files. 03-G3 has no `<threat_model>` (gap-closure plan referencing existing IDs). Verified against shipped code on `main` at commit `db5ab77`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → middleware | Clerk chokepoint; admin routes 404 on unauth + non-admin | session cookies, x-pathname header |
| middleware → Server Components | x-pathname overwritten from `req.nextUrl.pathname`; client headers clobbered | request-scoped header bag |
| `app/(admin)/layout.tsx` → Server Components | `requireAdmin()` defense-in-depth; calls `notFound()` on non-admin | OrgContext (orgId, userId, role) |
| Browser FormData → Server Action | Zod validates every field at the trust boundary; status changes only via transition actions | policyId (UUID), title, category, content_json |
| Server Action → orchestrator (transitions.ts) | Each orchestrator opens `withOrgScope` (1 tx); state-machine validates transition | OrgScope, policyId, newContent |
| Orchestrator → Postgres | Transaction sets `request.jwt.claims` for RLS; repositories never raw-`db` | parameterized Drizzle queries |
| Clerk webhook → DB | svix.verify against `req.text()` raw body BEFORE any JSON parse | webhook signature, Clerk event payload |
| TipTap JSON → PolicyView render | `generateHTML([StarterKit, Link])` allow-list; Link.isAllowedUri rejects `javascript:` (CVE-2025-14284 fix in @tiptap/extension-link 2.27.2) | policy contentJson, version snapshots |
| npm registry → developer machine | Supply chain — pinned versions, no postinstall on Phase 3 direct deps | dependency tree |

---

## Threat Register

### Plan 03-00 — Operator Clerk/Svix rotation
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-00-01 | Info Disclosure | Leaked Phase 2 whsec_ | mitigate | Operator rotated via Svix Dashboard per Plan 03-00 Task 1 (operator-config plan, no code surface) | closed |
| T-03-00-02 | Spoofing | Webhook caller forging with leaked secret | mitigate | Rotation invalidates leaked secret; svix.Webhook.verify rejects forgeries at app/api/webhooks/clerk/route.ts:177 | closed |
| T-03-00-03 | Tampering | Operator pastes new secret into chat | accept | Documented in MEMORY.md `secrets-never-in-chat.md` | closed (accepted) |
| T-03-00-04 | Repudiation | No audit log of rotation actor | accept | Svix Dashboard retains rotation actor+timestamp; low-freq event | closed (accepted) |

### Plan 03-01 — Phase-3 verify scaffolding
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01-01 | Tampering | vitest/RTL/jsdom/jest-dom install | mitigate | Per MEMORY.md `audit-before-security-changes`; all top-1k npm packages | closed |
| T-03-01-02 | DoS | vitest watching node_modules | accept | `test:watch` opt-in only; default `test` is one-shot | closed (accepted) |
| T-03-01-03 | Info Disclosure | check-admin-routes path parsing | accept | scripts/check-admin-routes.ts:78-94 — repo-relative paths only, no env-var leakage | closed (accepted) |
| T-03-01-04 | Tampering | RegExp literal eval | mitigate | scripts/check-admin-routes.ts:68-75 — RegExp constructor called only on text already parsed as regex literal | closed |
| T-03-01-SC | Tampering | Supply chain (5 dev deps) | mitigate | Phase 2 baseline `pnpm audit --prod` inherited; no [SUS]/[SLOP] verdicts | closed |

### Plan 03-02 — Middleware admin gate + trampoline (D-10 advertise-nothing)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-02-01 | EoP | Non-admin reaches /dashboard or /policies | mitigate | Two layers: middleware.ts:117-148 (404 on unauth + non-admin) AND app/(admin)/layout.tsx:38 `await requireAdmin()` → lib/auth/require-admin.ts:21 calls notFound() | closed |
| T-03-02-02 | Info Disclosure | 401 reveals admin route exists | mitigate | middleware.ts:108-121, :143-146 — all admin-gate failures return `new NextResponse(null, { status: 404 })`; require-admin.ts:21 calls notFound() (D-10) | closed |
| T-03-02-03 | Tampering | Admin matcher regex regression | mitigate | scripts/check-admin-routes.ts:97-123 cross-validates ADMIN_URL_PATTERNS ↔ on-disk pages | closed |
| T-03-02-04 | Spoofing | Client x-pathname header injection | mitigate | middleware.ts:76-78 OVERWRITES x-pathname from `req.nextUrl.pathname`; client value clobbered before Server Components read | closed |
| T-03-02-05 | DoS | getOrgContext throws → onboarding redirect even for valid orgs | mitigate | app/(admin)/dashboard/page.tsx:47-63 typed-class catch (ADR-026) handles ProvisioningRaceError as soft-retry with 2s meta-refresh; post-sign-in/page.tsx:49-53 hard-fails on the same class (asymmetry by design) | closed |

### Plan 03-03 — State-machine library (pure module)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-03-01 | Tampering | ALLOWED_TRANSITIONS edited without test | mitigate | lib/policies/state-machine.test.ts cross-product generator re-asserts every cell; any table edit breaks ≥1 test | closed |
| T-03-03-02 | EoP | Client bypasses state machine | mitigate | Library-only module; lib/policies/transitions.ts (orchestrators) is the authoritative server gate. Client menu (PolicyTransitionMenu) imports for UX rendering only | closed |

### Plan 03-04 — Per-aggregate repositories (org_id discipline + L-05 append-only)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-04-01 | Info Disclosure | Cross-org leak via missing orgId filter | mitigate | lib/db/repositories/policies.ts:49,55,82,116,132,147 — every WHERE includes `eq(policies.orgId, s.orgId)`. Defense-in-depth: withOrgScope sets RLS JWT; scripts/check-rls.ts (Phase 2) verifies cross-org returns 0 rows | closed |
| T-03-04-02 | Tampering | SQL injection via ilike | mitigate | policies.ts:89-91 — `ilike(col, \`%${q}%\`)` parameterizes pattern as bind variable (Drizzle) | closed |
| T-03-04-03 | EoP | PolicyVersions.update/.delete added later | mitigate | tests/types.ts:48,50 `@ts-expect-error void PolicyVersions.update/.delete`; lib/db/repositories/policy_versions.ts:102-104 explicitly absent | closed |
| T-03-04-04 | Tampering | UPDATE without WHERE orgId | mitigate | policies.ts:116,132 — mutation methods use `and(eq(orgId, s.orgId), eq(id, id))` — never by id alone | closed |
| T-03-04-05 | Info Disclosure | listWithFilters returns >100 rows | accept | policies.ts:99 — hard `.limit(100)` per D-05; SMB scale assumption documented in plan | closed (accepted) |

### Plan 03-05 — Webhook cleanup + maskClerkOrgId (L-06a/b)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-05-01 | Repudiation | Lost event after dispatch failure | mitigate | app/api/webhooks/clerk/route.ts:101-116 `deleteIdempotencyRow()` helper; wired at 4 non-2xx sites (lines 280, 291, 312, 406) — Clerk retry can re-fire | closed |
| T-03-05-02 | Info Disclosure | Org IDs in aggregated logs | mitigate | route.ts:50-53 `maskClerkOrgId()` defined; ≥4 call sites required by plan, actual count = 6 (verified via Grep) | closed |
| T-03-05-03 | Tampering | Cleanup delete fails silently | mitigate | route.ts:102-115 inner try/catch around delete; logs secondary failure with cleanup-detail (`cd`) string | closed |
| T-03-05-04 | Info Disclosure | maskClerkOrgId bypassed at new sites | accept | Manual contract until Phase 7+ structured logging; plan explicitly accepts | closed (accepted) |

### Plan 03-06 — Transition orchestrators (atomic snapshot+flip in withOrgScope)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-06-01 | EoP | Illegal transition slips past state machine | mitigate | lib/policies/transitions.ts:67-85 `loadAndAssertTransition` calls canTransition; every orchestrator (submitForReview, publish, archive, reject, restore, editPublished, approve) invokes it before any mutation | closed |
| T-03-06-02 | Integrity | Snapshot+status flip partial write | mitigate | transitions.ts:97,124,147,172,196,232 — each orchestrator wraps entire workflow in single `withOrgScope` callback = one Drizzle tx; failure rolls both back | closed |
| T-03-06-03 | Info Disclosure | Cross-org policy mutation | mitigate | transitions.ts:72 Policies.findById is orgId-scoped; updates run via `s.tx.update(policies).where(eq(policies.id, ...))` inside withOrgScope which sets RLS JWT (ADR-025) | closed (defense-in-depth: app + RLS) |
| T-03-06-04 | Tampering | editPublished on non-published creates phantom version | mitigate | transitions.ts:234-236 explicit `if (policy.status !== 'published') throw IllegalTransitionError`; tested | closed |
| T-03-06-05 | Repudiation | Lost track of who changed status | accept | transitions.ts:156,242 — PolicyVersions row captures `createdBy: s.userId` on every publish; Phase 8 expands audit trail | closed (accepted) |

### Plan 03-07 — Server Actions (Zod validation at trust boundary)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-07-01 | Tampering | Client posts arbitrary status field | mitigate | app/(admin)/policies/[id]/actions.ts:292-311 UpdateDraftSchema omits status; only title/category/content_json accepted; forged `status` silently dropped by safeParse | closed |
| T-03-07-02 | Spoofing | Forged policyId targeting another org | mitigate | actions.ts:48,277,329 `PolicyIdSchema = z.string().uuid()`; orchestrators run inside withOrgScope so findById is orgId-scoped → cross-org returns no rows → "Policy not found" | closed |
| T-03-07-03 | Info Disclosure | Unexpected stack trace to client | mitigate | actions.ts:99-104, 134-137, 356-358 — caught errors logged server-side, generic copy returned to client; new/actions.ts:132-137 same pattern | closed |
| T-03-07-04 | Tampering | redirect() trapped in try/catch | mitigate | app/(admin)/policies/new/actions.ts:138-142 — revalidatePath + redirect AFTER try/catch close (RESEARCH Pitfall 3) | closed |
| T-03-07-05 | DoS | Repeated invalid Zod payloads hammer DB | accept | Vercel platform DDoS; rate-limit deferred to Phase 7+ | closed (accepted) |

### Plan 03-08 — TipTap + shadcn dependencies (supply chain)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-08-01 | Tampering | Malicious npm package masquerading as @tiptap/* | mitigate | Operator checkpoint:human-verify gates pre-install; package.json:37-40 pins @tiptap/* at 2.27.2 (audit-cache/ tracks decisions) | closed |
| T-03-08-02 | Tampering | zod 4.x breaking changes | mitigate | package.json:53 `"zod": "^3.23.5"` — pinned to 3.x major; tsc gate catches API breakage | closed |
| T-03-08-03 | Tampering | shadcn registry serving compromised code | mitigate | components.json registries empty (no third-party); operator inspects components/ui/*.tsx diffs at commit | closed |
| T-03-08-04 | Info Disclosure | postinstall hook exfiltrating env vars | mitigate | Operator-verified zero postinstall on the 5 direct deps pre-install; transitive deps inherit Phase 1+2 lockfile lineage | closed |
| T-03-08-05-SC | Tampering | Supply chain general | mitigate | MEMORY.md `audit-before-security-changes` mandates pnpm audit pre+post; Phase 2 baseline documented | closed |

### Plan 03-09 — Admin shell layout (defense-in-depth)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-09-01 | EoP | Non-admin reaches admin shell | mitigate | app/(admin)/layout.tsx:38 `await requireAdmin()` runs unconditionally before chrome JSX renders; calls notFound() per L-01 + D-10 | closed |
| T-03-09-02 | Info Disclosure | Admin shell renders before role check | accept | Server Components render serially; requireAdmin() awaited before any chrome JSX | closed (accepted) |
| T-03-09-03 | Tampering | Client-supplied x-pathname forges active state | mitigate | components/admin/AdminSidebar.tsx:43 reads `headerStore.get("x-pathname")`; middleware.ts:76-78 overwrites before Server Component read | closed |
| T-03-09-04 | DoS | SidebarProvider cookie read fails | mitigate | app/(admin)/layout.tsx:45 `defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"` — `!==` fallback avoids throw on missing cookie | closed |

### Plan 03-10 — PolicyEditor + PolicyView (TipTap XSS surface)
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-10-01 | Tampering | XSS via TipTap content render | mitigate | components/policy/PolicyView.tsx:22 `generateHTML(content, [StarterKit, Link])` allow-list; @tiptap/extension-link 2.27.2 ≥ 2.10.4 (CVE-2025-14284 fix); JSON-only storage | closed |
| T-03-10-02 | Tampering | Editor JSON forged by client to bypass sanitization | mitigate | actions.ts:239-263 EditPublishedSchema parses content_json via Zod; generateHTML node allow-list drops unknown types | closed |
| T-03-10-03 | Info Disclosure | PolicyTransitionMenu reveals legal next states | accept | Only rendered inside (admin) routes; non-admins receive 404 (D-10) | closed (accepted) |
| T-03-10-04 | EoP | Client renders "Publish" item, bypasses state machine | mitigate | Menu is UX mirror only; Server Action invokes orchestrator → canTransition → state machine; client tampering doesn't reach DB | closed |
| T-03-10-05 | Repudiation | PolicyVersionHistory missing author name | accept | Schema lookup deferred to Phase 8 polish; not a security gap | closed (accepted) |

### Plan 03-11 — Admin pages wiring
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-11-01 | Info Disclosure | Cross-org policy list leakage | mitigate | app/(admin)/policies/page.tsx wraps queries in withOrgScope; check-rls (Phase 2 / Plan 02-06) verifies cross-org returns 0 rows | closed (defense-in-depth: app + RLS) |
| T-03-11-02 | Tampering | Status URL param forged | mitigate | app/(admin)/policies/page.tsx:54-78 `parseStatus` narrows to PolicyStatus union; unknown values dropped | closed |
| T-03-11-03 | Info Disclosure | Direct /policies/{id} of another org | mitigate | findById scoped by orgId → empty array → notFound() → 404 (D-10) | closed |
| T-03-11-04 | Repudiation | edit-published bypasses change-summary | accept | changeSummary optional per UI-SPEC; audit covered by policy_versions row + createdAt | closed (accepted) |
| T-03-11-05 | DoS | Search input hammers DB | mitigate | PolicyListSearch 250ms debounce + LIMIT 100 hard cap on listWithFilters | closed |
| T-03-11-06 | Spoofing | <CreateOrganization /> spoofs existing org name | accept | Clerk enforces org name uniqueness at provider; DB has clerk_org_id UNIQUE | closed (accepted) |

### Plan 03-G1 — getOrgContext DB-lookup hardening
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-G1-01 | Spoofing | session.orgId forging | mitigate | Clerk session signing + organizations.clerk_org_id UNIQUE constraint (lib/auth/context.ts maps Clerk text → DB UUID); no attack-surface widening | closed |
| T-03-G1-02 | Tampering | sessionClaims.publicMetadata.role narrowing | accept | Preserved from Phase 2; asRole() throws on non-Role values | closed (accepted) |
| T-03-G1-03 | Info Disclosure | Error messages leak Clerk org IDs | mitigate | lib/auth/context.ts:64-75,135,139 — `maskClerkOrgId` / `maskClerkId` applied to all error paths (last-4 chars only) | closed |
| T-03-G1-04 | DoS | Two extra DB roundtrips per request | accept | Parallelized via Promise.all; UNIQUE-index lookups <5ms; request-scoped caching = Phase 7+ | closed (accepted) |
| T-03-G1-05 | EoP | Clerk user missing from users DB → auth bypass | mitigate | context.ts:139 throws UserNotProvisionedError; dashboard catches as ProvisioningRaceError (W7 race), trampoline rethrows as 500 (drift) | closed |
| T-03-G1-06 | Tampering | Cross-org policyId → createdBy FK | mitigate | scope.userId now true users.id UUID; Postgres FK catches violations; transitions.test.ts asserts contract | closed |
| T-03-G1-SC | Tampering | npm/pip/cargo installs | accept | No new packages introduced by 03-G1 | closed (accepted) |

### Plan 03-G2 — Clerk fallback redirect env vars
| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-G2-01 | Info Disclosure | NEXT_PUBLIC_* in client bundle | accept | `/post-sign-in` already public route knowledge; no PII, no secret | closed (accepted) |
| T-03-G2-02 | Tampering | Operator copies example with wrong value | mitigate | scripts/check-foundation.ts:164-186 `checkClerkFallbackRedirectEnvVars` exact-match assertion in verify:phase-1 | closed |
| T-03-G2-03 | DoS | Missing env var → silent redirect to / | mitigate | check-foundation.ts presence assertion; verify:phase-1 gate fails if missing | closed |
| T-03-G2-SC | Tampering | npm installs | accept | No new packages | closed (accepted) |

### Plan 03-G3 — Gap closures (DUP-VN, SF-W5, MYPOL-STUB)

03-G3 had no `<threat_model>` block — it closed three discovered-at-UAT gaps. Verified the closures landed on `main`:

| Gap | Severity | Closure | Status |
|-----|----------|---------|--------|
| DUP-VN | BLOCKER | lib/policies/transitions.ts:202 `restore()` bumps `currentVersion`; lib/db/schema.ts:159 `unique('policy_versions_policy_id_version_number_unique')`; drizzle/0004_policy_versions_unique.sql self-healing migration; scripts/check-schema.ts:141 asserts constraint exists; lib/policies/transitions.test.ts:258,268 regression tests | closed |
| SF-W5 | HIGH | app/api/webhooks/clerk/route.ts:101-116 `deleteIdempotencyRow()` at 4 non-2xx sites (lines 280, 291, 312, 406) | closed (T8 vitest test deferred to Phase 7+ — documented in 03-G3-SUMMARY.md; T7 production code verified live via Svix Dashboard replay msg_3DzEmy2SCnImKwEcn6UBbTksJMF + UAT-6 fresh sign-up happy-path) |
| MYPOL-STUB | MEDIUM | app/(employee)/my-policies/page.tsx ships as server-component stub; /post-sign-in's employee/reviewer redirect lands on 200 | closed |

---

## Single-Layer-Only Notations

The following CLOSED threats rely on application-layer mitigation alone (per ADR-025 Phase 2 invariants which provide the second layer where noted, this section is informational only):

- **T-03-06-03** + **T-03-11-01** — Cross-org policy access. Both rely on `eq(policies.orgId, s.orgId)` at the application layer AND Phase 2 RLS via `withOrgScope` JWT-injection. Two-layer; scripts/check-rls.ts is the audit. Not single-layer.
- **T-03-04-01** — Same as above; two layers verified.

No threats in Phase 3 are CLOSED with single-layer-only.

---

## Threat Flags (from SUMMARY files)

| Summary | Threat Flags | Mapping |
|---------|--------------|---------|
| 03-02-SUMMARY.md | None — x-pathname spoofing fully mitigated by T-03-02-04 | Maps to T-03-02-04 (CLOSED) |
| 03-03-SUMMARY.md | None — T-03-03-01 + T-03-03-02 both noted as present | Maps to existing IDs (CLOSED) |
| 03-05-SUMMARY.md | None — surface hardening only; T-03-05-01..04 cover all | Maps to existing IDs (CLOSED) |
| 03-09-SUMMARY.md | None — x-pathname read covered by T-03-02-04 / T-03-09-03 | Maps to existing IDs (CLOSED) |
| 03-G1-SUMMARY.md | None — `<threat_model>` covered surface | Maps to existing IDs (CLOSED) |
| 03-G2-SUMMARY.md | None — T-03-G2-01..SC covers everything | Maps to existing IDs (CLOSED) |

**Unregistered flags:** None. Every SUMMARY explicitly declared "None" — no discovered-at-execution threats added beyond the plan-time registers.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-00-03 | Operator chat-paste secret tampering; mitigated by MEMORY.md `secrets-never-in-chat.md` policy | Matthew (operator) | 2026-05-16 (Plan 03-00 author) |
| AR-03-02 | T-03-00-04 | Rotation actor logging only at Svix; low-freq event doesn't warrant app log | Matthew | 2026-05-16 |
| AR-03-03 | T-03-01-02 | vitest watch only opt-in; default `test` is one-shot | Matthew | 2026-05-16 |
| AR-03-04 | T-03-01-03 | check-admin-routes paths repo-relative; no env-var leakage | Matthew | 2026-05-16 |
| AR-03-05 | T-03-04-05 | listWithFilters LIMIT 100 acceptable for SMB scale (<500 policies/org) | Matthew (D-05) | 2026-05-16 |
| AR-03-06 | T-03-05-04 | maskClerkOrgId manual contract; structured-log redaction = Phase 7+ | Matthew | 2026-05-16 |
| AR-03-07 | T-03-06-05 | Status-change actor on PolicyVersions.createdBy; full audit-trail = Phase 8 | Matthew | 2026-05-16 |
| AR-03-08 | T-03-07-05 | DoS via repeated invalid Zod payloads; rate-limit = Phase 7+; Vercel DDoS handles MVP | Matthew | 2026-05-16 |
| AR-03-09 | T-03-09-02 | Server Components serial render; requireAdmin awaited before chrome JSX | Matthew (architectural) | 2026-05-16 |
| AR-03-10 | T-03-10-03 | PolicyTransitionMenu visible only inside (admin) routes; non-admins 404 | Matthew | 2026-05-16 |
| AR-03-11 | T-03-10-05 | PolicyVersionHistory author name = Phase 8 polish | Matthew | 2026-05-16 |
| AR-03-12 | T-03-11-04 | changeSummary optional per UI-SPEC; audit via policy_versions.createdAt | Matthew | 2026-05-16 |
| AR-03-13 | T-03-11-06 | Clerk handles org name uniqueness; DB clerk_org_id UNIQUE constraint | Matthew | 2026-05-16 |
| AR-03-14 | T-03-G1-02 | publicMetadata.role narrowing preserved from Phase 2 | Matthew | 2026-05-19 |
| AR-03-15 | T-03-G1-04 | Two extra DB roundtrips parallelized; req-scoped caching = Phase 7+ | Matthew | 2026-05-19 |
| AR-03-16 | T-03-G1-SC | No new deps in 03-G1 | Matthew | 2026-05-19 |
| AR-03-17 | T-03-G2-01 | `/post-sign-in` route knowledge already public via bundle | Matthew | 2026-05-19 |
| AR-03-18 | T-03-G2-SC | No new deps in 03-G2 | Matthew | 2026-05-19 |
| AR-03-19 | T-03-G3-SF-W5-test | T8 vitest regression for SF-W5 deferred to Phase 7+; production code (T7) verified live via Svix replay + UAT-6 fresh sign-up. Documented in 03-G3-SUMMARY.md "Deviations from plan" | Matthew | 2026-05-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-21 | 67 | 67 | 0 | Claude Opus 4.7 (retroactive State-B audit, /gsd:secure-phase, attempt 2 — first attempt context-burned at 65%) |

**Audit-against-commit:** `db5ab77` on `main` (Phase 3 ship commit).
**Audit-against-branch:** Phase 3 work merged from `gsd/phase-3-admin-ui` (PRs #2..#7); PR #7 (`refactor/lookup-scoping`) NOT included — still open.

---

## ADR-026 cross-reference

PR #5 (commit `bf65712`) replaced string-matched bootstrap errors with class-based `instanceof` checks. Affected Phase 3 mitigation citations:

- **T-03-02-05 mitigation (dashboard fallback)** — original plan referenced substring matching in `lib/auth/bootstrap-errors.ts`; actual current mitigation is `matchesErrorClass(err, ONBOARDING_RACE_ERRORS)` at `app/(admin)/dashboard/page.tsx:61-63` against typed `NoActiveOrganizationError | ProvisioningRaceError | InvalidRoleError` classes. STRICTER than the planned mitigation. Marked CLOSED.
- **post-sign-in trampoline** — `BOOTSTRAP_ERRORS` array at `app/(auth)/post-sign-in/page.tsx:49-53` uses the same typed-class pattern. STRICTER than v0. Marked CLOSED.

The `lib/auth/bootstrap-errors.test.ts § hierarchy-contract` test locks the class hierarchy so future error additions cannot accidentally widen the catch list (ClerkAuthFailedError specifically NOT a BootstrapError).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: SECURED` set in frontmatter

**Approval:** SECURED 2026-05-21 (retroactive; ships Phase 3 with clean security register).

---

## Notes for next phase

- T8 (SF-W5 webhook vitest regression) is the most consequential carry-forward; track in Phase 7+ test-coverage epic alongside webhook structured logging.
- Phase 7+ rate-limit (T-03-07-05) and structured-log redaction (T-03-05-04) both close their respective accepted risks.
- Phase 8 covers T-03-10-05 (version history author name) and T-03-11-04 (status-change full audit trail).
- ADR-026 typed-class pattern should be replicated in any future auth/bootstrap error introduction.
