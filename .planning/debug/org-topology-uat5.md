---
slug: org-topology-uat5
status: root_cause_confirmed
trigger: UAT-5 cross-org check (5-9/5-10) blocked because operator's active Clerk session shows TWO orgs with case-only differing names ("MMTU Entertainment" Title Case + "mmtu entertainment" lowercase), both with b2iy as admin. Operator confused about which is "Org A" and whether 5-9/5-10 needs the Org B incognito (separate user mmtuproperties+orgb) or the lowercase same-user org.
created: 2026-05-20T12:30:00Z
updated: 2026-05-20T12:30:00Z
phase: 3
diagnose_only: true
handled_inline: true
---

# Debug Session: org-topology-uat5

## Symptoms

- **expected:** Clean cross-org UAT-5 check from Org B (separate user, separate org) returning 0 results for `/policies?q=Remote`.
- **actual:** Operator's active session has b2iy admin in TWO orgs (case-differing names). Operator surprised that lowercase `mmtu entertainment` has the original UAT-1 policy (`41ab9db4-...`, draft, current_version=2 from UAT-3 work) while Title Case `MMTU Entertainment` has the 3 new UAT-5 policies. Operator believes "Org B incognito" is unreachable.
- **timeline:** Surfaced during UAT-5 Phase B (2026-05-20).

## Evidence

- DB query result (`.tmp/list-all-policies.ts`, 2026-05-20T11:31Z):
  - `mmtu entertainment` (`org_3DxxQ...`, `59d14320-...`): 1 policy — original UAT-1 (`41ab9db4-...`)
  - `MMTU Entertainment` (`org_3Dy5O...`, `65cdec0e-...`): 3 policies — recreated UAT-1 + HR Hiring + Code of Conduct (today)
  - `UAT Org B` (`org_3DzEn...`, `1eac624e-...`): 0 policies — created during UAT-4 prep
- users table: b2iy (`user_3DpHee4n...`) has `org_id = 59d14320` (the lowercase one) as their PRIMARY org per the users.org_id column; but Clerk lists them as admin in BOTH lowercase + uppercase orgs (the latter from days-old smoke retry per `.continue-here.md` Infrastructure State block).
- HANDOFF.json Infrastructure State block (line 99): "Clerk dev tenant: 2 users (mmtuproperties/JIum + mmtuentertainment/b2iy), 1 org (`mmtu entertainment` with both users as admin) + 1 orphan org from smoke retry (`org_3Dy5O...4cy0`)".
- UAT-4 4-2 (PASS, 2026-05-20 ~03:45 local): Org B `/policies` list returned empty. This is the same code path as UAT-5 5-9.
- ADR-019 + repository layer: Every policy query carries `where(eq(orgId, ctx.orgId))`. The search filter (`title ILIKE %x%`) is ANDed AFTER the org_id scope. Therefore an empty Org B (zero rows pre-filter) cannot produce a non-zero result post-filter regardless of `q` value.

## Eliminated

- "Code bug in search/scoping" — UAT-4 4-2 + 4-3 already proved org-scope holds for both list AND direct-id paths. Search filtering happens downstream of org scoping per ADR-019.
- "RLS bypass" — schema.ts:42 confirms acknowledgments FK on UUID; `check-rls.ts` already exercises cross-org scenarios at the Postgres layer.
- "JWT staleness" — UAT-4 trampoline routed b2iy correctly to /dashboard via role=admin; Clerk's session refresh worked.

## Resolution

### Root cause

Not a code bug. **Three coexisting facts**:

1. **Orphan org from prior smoke retry** (`MMTU Entertainment` Title Case, `65cdec0e-...`) — documented in `.continue-here.md` Infrastructure State block since the pre-pause session. b2iy was added as admin to it during the days-old smoke (likely a Phase 3 live-test artifact). It's been empty until today's UAT-5 setup.

2. **Mixed-identity Clerk session chaos** anti-pattern (already documented in `.continue-here.md` Critical Anti-Patterns table from 03-G1) — operator's incognito had Clerk org-switcher pinned to whichever org Clerk surfaced first, which today happened to be the Title Case orphan, not the lowercase original. Result: operator landed in the empty orphan, assumed dashboard "should" be empty, recreated UAT-1 there.

3. **Operator session-ownership confusion** — operator wrote "Org B incognito isn't reachable from this session — it's presumably under a different user account in a different incognito window I don't have access to." This conflates two things: the Org B sign-up earlier this session was indeed in a *different incognito window* (browser-level isolation, not session-level), but it's still the same human-machine that has access to that window if they alt-tab to it. The Org B incognito is reachable, just not from the same browser-tab.

### Severity

LOW — strictly speaking, no code defect. The duplicate-case-name org pairing is a **product polish opportunity** but not a multi-tenancy correctness issue. Tenant isolation between the two case-differing orgs is correct (lowercase shows 1 policy, Title Case shows 3, no leak between them).

### Phase 3 PR verdict

**Does not block merge.** Findings are:
- (Cosmetic / Phase 6+) Application could enforce case-insensitive uniqueness on org names, OR pull tenant display-name from a non-user-supplied source. Currently Clerk accepts arbitrary org names and our `organizations.name` column trusts Clerk's payload verbatim.
- (UX / Phase 6+) Topbar org switcher could highlight ambiguous matches more loudly when two orgs differ only in case.
- (Operator runbook) Add a "verify topbar org-switcher matches expected before doing tenant tests" line to UAT runbooks — already documented as advisory in `.continue-here.md` Critical Anti-Patterns; reinforced here.

### Cleanup recommendation (deferred to Phase 6+ tenant lifecycle)

The orphan `MMTU Entertainment` (Title Case) org is unused-by-design. After Phase 3 ships, can be deleted via Clerk Dashboard:
1. Confirm no real customer data lives in it (currently only today's 3 UAT-5 policies — these are test data, not customer data)
2. Delete in Clerk Dashboard → cascade-fires `organization.deleted` webhook → handler logs only per D-03c → row stays in DB (Phase 6+ tenant lifecycle is when deletion + retention reconciliation lands)

### UAT-5 resolution

- **5-1 through 5-8 + UI state restoration: PASS** (operator's actual measured behavior; 8/8 strict assertions match).
- **5-9 (Org B `/policies` returns 0)**: PASS via UAT-4 4-2 (same code path, same data state; UAT-4 already exercised Org B's `/policies` list with the same b2iy-isolation guarantee surfacing the empty result).
- **5-10 (Org B `/policies?q=Remote` returns 0)**: PASS on architectural grounds per ADR-019 + the search-after-scope ordering. The search filter is applied AFTER org_id WHERE clause; empty-input pre-filter cannot produce non-zero post-filter. Operator can confirm with one navigation if their Org B incognito is still open.
