---
phase: 03-admin-ui
plan: G2
type: execute
wave: 1
depends_on: []
files_modified:
  - .env.local.example
  - reference/STACK.md
  - scripts/check-foundation.ts
autonomous: true
requirements:
  - REQ-access-control
gap_closure: true
gap_source: .planning/phases/03-admin-ui/03-SMOKE.md
closes_gaps:
  - GAP-3 (MINOR) — Embedded SignIn redirect needs explicit env var

must_haves:
  truths:
    - ".env.local.example documents both NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL and NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL with /post-sign-in as the canonical value for PolicyPilot"
    - "reference/STACK.md's Clerk section documents that embedded <SignIn /> + <SignUp /> components honor the FALLBACK_REDIRECT_URL env vars, separately from Clerk Account Portal's hosted-portal config"
    - "scripts/check-foundation.ts asserts both env vars are present and non-empty in .env.local so the gap can't silently regress after a future .env.local copy from the example"
  artifacts:
    - path: ".env.local.example"
      provides: "Documented Clerk fallback redirect env vars"
      contains: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"
    - path: ".env.local.example"
      provides: "Sign-up companion"
      contains: "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL"
    - path: "reference/STACK.md"
      provides: "Clerk section explanation of embedded vs hosted-portal redirect config"
      contains: "FALLBACK_REDIRECT_URL"
    - path: "scripts/check-foundation.ts"
      provides: "Env-var presence assertion"
      contains: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"
  key_links:
    - from: "app/(auth)/sign-in/[[...sign-in]]/page.tsx (embedded <SignIn />)"
      to: ".env.local NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"
      via: "Clerk's NEXT_PUBLIC_* convention — read by @clerk/nextjs at module load"
      pattern: "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"
    - from: "scripts/check-foundation.ts (verify:phase-1)"
      to: ".env.local presence check"
      via: "process.env lookup + non-empty assertion"
      pattern: "FALLBACK_REDIRECT_URL"
---

<objective>
Fix GAP-3 (MINOR from 03-SMOKE.md): The embedded Clerk `<SignIn />` and
`<SignUp />` components require `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
+ `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` env vars to honor the
`/post-sign-in` trampoline (Plan 03-02 L-03). Without them, users land on
`/` after sign-in. The smoke fixed this ad-hoc in `.env.local`; this plan
locks it in by adding both env vars to `.env.local.example`, documenting
the difference between embedded-component redirect config and Clerk
Account Portal hosted-portal config in `reference/STACK.md`, and (optional
safety) extending `scripts/check-foundation.ts` to assert both env vars
are present in `.env.local`.

Purpose: Prevent a fresh-clone operator from re-hitting GAP-3 when they
copy `.env.local.example` → `.env.local`. The env vars are documented +
asserted so the foundation gate catches missing values.

Output:
- `.env.local.example` extended with the two env vars + an explanatory comment block
- `reference/STACK.md` Clerk section gains a "Embedded component redirect config" subsection
- `scripts/check-foundation.ts` adds a `checkClerkFallbackRedirectEnvVars` step to its 6-check chain (becoming 7)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/03-admin-ui/03-SMOKE.md
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Document Clerk fallback redirect env vars in .env.local.example</name>
  <files>.env.local.example</files>
  <read_first>
    - .env.local.example (current — see existing Clerk section at lines 13-17)
    - .planning/phases/03-admin-ui/03-SMOKE.md (GAP-3 description at lines 109-124)
    - app/(auth)/sign-in/[[...sign-in]]/page.tsx (the embedded SignIn — confirm it exists)
    - app/(auth)/sign-up/[[...sign-up]]/page.tsx (the embedded SignUp)
    - app/(auth)/post-sign-in/page.tsx (the trampoline — target of the redirect)
  </read_first>
  <action>
    Open `.env.local.example`. The existing Clerk section runs from line 13
    (`# ─── Clerk ──────────...`) through line 17 (`CLERK_WEBHOOK_SECRET=`).

    Replace the Clerk section block with this expanded version (preserving
    the existing 3 env vars and adding the 2 new ones plus a comment block):

    ```
    # ─── Clerk ──────────────────────────────────────────────────
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
    CLERK_SECRET_KEY=
    CLERK_WEBHOOK_SECRET=
    # After-sign-in redirect for the EMBEDDED <SignIn /> / <SignUp /> components
    # shipped by Plan 03-11 at app/(auth)/sign-in/ and app/(auth)/sign-up/.
    # These are read by @clerk/nextjs at module load.
    #
    # IMPORTANT: These env vars are DISTINCT from Clerk Account Portal's
    # "After sign-in fallback" config in the Clerk Dashboard — the Dashboard
    # config governs Clerk's HOSTED portal only (clerk.<your-app>.com flows);
    # the env vars below govern the embedded components in app/(auth)/.
    # Both must point at the same /post-sign-in trampoline for the
    # ROADMAP Phase 3 SC walkthrough to land in /dashboard. See GAP-3 in
    # .planning/phases/03-admin-ui/03-SMOKE.md.
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in
    ```

    Notes:
    - The first three vars stay BLANK (operator supplies values).
    - The two new vars are pre-populated with `/post-sign-in` because the
      target route is project-fixed (Plan 03-02 L-03). An operator copying
      `.env.local.example` → `.env.local` gets the correct value out of the box.
    - Preserve the rest of the file unchanged (Stripe section, Anthropic, Resend, App, Analytics, Phase 2 sections).
  </action>
  <acceptance_criteria>
    - `grep -cE '^NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in$' .env.local.example` is 1.
    - `grep -cE '^NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in$' .env.local.example` is 1.
    - `grep -cE 'distinct from Clerk Account Portal' .env.local.example` is at least 1 (the documentation block landed).
    - The existing Clerk vars are preserved (presence-only check via `grep`, header excluded):
      - `grep -v '^#' .env.local.example | grep -cE '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' .env.local.example` is 1.
      - `grep -v '^#' .env.local.example | grep -cE '^CLERK_SECRET_KEY=' .env.local.example` is 1.
      - `grep -v '^#' .env.local.example | grep -cE '^CLERK_WEBHOOK_SECRET=' .env.local.example` is 1.
    - The Stripe section + everything below it is unchanged: `grep -cE '^# ─── Stripe' .env.local.example` is 1 AND `grep -cE '^# ─── Phase 2' .env.local.example` is 1.
  </acceptance_criteria>
  <verify>
    <automated>grep -cE '^NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in$' .env.local.example | grep -c '^1$' && grep -cE '^NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in$' .env.local.example | grep -c '^1$'</automated>
  </verify>
  <done>
    `.env.local.example` documents both Clerk fallback redirect env vars with the canonical `/post-sign-in` value and an inline explanation of why these are separate from the Clerk Dashboard's hosted-portal config.
  </done>
</task>

<task type="auto">
  <name>Task 2: Document embedded vs hosted-portal redirect config in reference/STACK.md</name>
  <files>reference/STACK.md</files>
  <read_first>
    - reference/STACK.md (the Clerk section starts at line 18 per `grep -n "## Why Clerk"` — read at least lines 1-80 to understand the file's section structure)
    - .planning/phases/03-admin-ui/03-SMOKE.md (GAP-3 description for the rationale)
    - .env.local.example (post-Task-1 — confirms canonical env var names)
  </read_first>
  <action>
    Open `reference/STACK.md`. Locate the Clerk section. After the existing
    Clerk-related content (cost comparison + Organizations + SAML), append
    a new subsection titled `### Embedded component redirect config (GAP-3 lock)`.

    Add this subsection verbatim, placed AFTER the existing Clerk content
    and BEFORE the next top-level `## Why ...` heading:

    ```markdown
    ### Embedded component redirect config

    The embedded `<SignIn />` and `<SignUp />` components shipped by
    `app/(auth)/sign-in/[[...sign-in]]/page.tsx` and
    `app/(auth)/sign-up/[[...sign-up]]/page.tsx` honor TWO env vars to
    decide where to redirect after a successful auth flow:

    - `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/post-sign-in`
    - `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/post-sign-in`

    Both MUST point at `/post-sign-in` (the trampoline created by Plan 03-02
    L-03). Without these env vars, the components default to redirecting
    to `/`, which dead-ends marketing-page users back on the marketing
    page instead of the admin dashboard.

    **Embedded vs hosted-portal:** The Clerk Account Portal's "After
    sign-in fallback" config in the Clerk Dashboard governs ONLY the
    hosted portal (clerk.<your-app>.com domains). It does NOT govern the
    embedded components in `app/(auth)/`. PolicyPilot ships the embedded
    components, so the env-var path is the load-bearing one. Both
    Dashboard config and env vars should still point at `/post-sign-in`
    for consistency, since the post-sign-in trampoline handles both
    inbound paths idempotently.

    **Verification:** `scripts/check-foundation.ts` asserts both env vars
    are present and non-empty in `.env.local` (see `pnpm verify:phase-1`).
    Surfaced by GAP-3 in `.planning/phases/03-admin-ui/03-SMOKE.md`.
    ```

    Preserve the rest of `reference/STACK.md` unchanged. The Clerk section
    is a documentation/rationale anchor — DO NOT collapse, reorder, or
    truncate any existing content in this section. Only append.
  </action>
  <acceptance_criteria>
    - `grep -cE '### Embedded component redirect config' reference/STACK.md` is 1.
    - `grep -cE 'NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL' reference/STACK.md` is at least 1.
    - `grep -cE 'NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL' reference/STACK.md` is at least 1.
    - `grep -cE 'Embedded vs hosted-portal' reference/STACK.md` is 1.
    - `grep -cE 'GAP-3' reference/STACK.md` is at least 1.
    - The existing "## Why Clerk (not Auth0)" heading is still present: `grep -cE '## Why Clerk' reference/STACK.md` is 1.
    - No existing reference/STACK.md content was removed: `wc -l reference/STACK.md` is GREATER than the pre-edit line count (purely additive).
  </acceptance_criteria>
  <verify>
    <automated>grep -cE '### Embedded component redirect config' reference/STACK.md && grep -cE 'NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL' reference/STACK.md && grep -cE 'NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL' reference/STACK.md</automated>
  </verify>
  <done>
    `reference/STACK.md` Clerk section explains the embedded-vs-hosted-portal distinction and pins `/post-sign-in` as the canonical value for both env vars.
  </done>
</task>

<task type="auto">
  <name>Task 3: Extend check-foundation.ts to assert both env vars are present in .env.local</name>
  <files>scripts/check-foundation.ts</files>
  <read_first>
    - scripts/check-foundation.ts (current — read entire file; the verify chain pattern at line 154+ `main()` and the existing checks at lines 30-152)
    - .env.local.example (post-Task-1)
    - .planning/phases/03-admin-ui/03-SMOKE.md (GAP-3)
  </read_first>
  <behavior>
    - Given both env vars present in process.env with non-empty values: the new check returns `{ ok: true, label: 'GAP-3 — Clerk fallback redirect env vars present' }`.
    - Given EITHER env var missing or empty: returns `{ ok: false, ... }` with a detail string listing exactly which vars are missing or empty (e.g. `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL missing, NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL empty`).
    - Given a wrong value (anything other than `/post-sign-in`): returns `{ ok: false, ... }` with a detail string explaining the expected value. Rationale: anything else means the operator misread the example and pointed at the wrong route.
    - The check is added to `main()` as a NEW step. Bump the total step count in the existing logResult calls from 6 to 7.
  </behavior>
  <action>
    1. In `scripts/check-foundation.ts`, add a new function near the other check functions (after `checkSelectOne` at ~line 152):

       ```typescript
       /**
        * GAP-3 (.planning/phases/03-admin-ui/03-SMOKE.md): the embedded
        * <SignIn /> and <SignUp /> components shipped at app/(auth)/sign-in
        * and app/(auth)/sign-up require both env vars below to redirect
        * to /post-sign-in after a successful auth flow. Without them, the
        * embedded components default to redirecting to / — dead-end UX.
        * Assert both are set and non-empty. Wrong-value (anything other
        * than the canonical /post-sign-in) is also a fail — anything else
        * indicates the operator misread .env.local.example.
        */
       function checkClerkFallbackRedirectEnvVars(): Result {
         const expected = '/post-sign-in';
         const signIn = process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL;
         const signUp = process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL;
         const issues: string[] = [];
         if (!signIn) issues.push('NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL not set or empty in .env.local');
         else if (signIn !== expected) issues.push(`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=${signIn} (expected ${expected})`);
         if (!signUp) issues.push('NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL not set or empty in .env.local');
         else if (signUp !== expected) issues.push(`NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=${signUp} (expected ${expected})`);
         if (issues.length > 0) {
           return {
             ok: false,
             label: 'GAP-3 — Clerk fallback redirect env vars present',
             detail: issues.join('; '),
           };
         }
         return { ok: true, label: 'GAP-3 — Clerk fallback redirect env vars present' };
       }
       ```

    2. In the existing `main()` function (starts at ~line 154), modify ALL `logResult` calls to use total=7 instead of total=6 (every `logResult(N, 6, ...)` → `logResult(N, 7, ...)`).

    3. Insert the new check AS THE LAST step in `main()` (after the existing `checkSelectOne` call, before the failure-summary block):

       ```typescript
       const c7 = checkClerkFallbackRedirectEnvVars();
       results.push(c7);
       logResult(7, 7, c7);
       ```

    4. Locate the existing total-count constant or magic number if any. The current file uses `6` as a magic number repeated in each `logResult` call (per the grep result). Update ALL of them to 7. Use Edit/Read carefully — the file is ~225 lines per the foundation.ts read; there should be exactly 6 logResult call sites.

    5. Verify the script still runs cleanly under the existing `pnpm verify:phase-1` invocation (`tsx --env-file=.env.local scripts/check-foundation.ts`). The new check exits 0 when both env vars are set to `/post-sign-in` (post-Task-1 .env.local.example shape).

    6. The operator MUST also have copied the new env vars into their actual `.env.local` (not just `.env.local.example`). Per the smoke report 03-SMOKE.md lines 116-121, the operator already added these during the smoke. If a fresh-clone operator hits `verify:phase-1` failures on this check, the error message tells them exactly what to add.
  </action>
  <acceptance_criteria>
    - `grep -cE 'function checkClerkFallbackRedirectEnvVars' scripts/check-foundation.ts` is 1.
    - `grep -cE 'NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL' scripts/check-foundation.ts` is at least 2 (declared + checked).
    - `grep -cE 'NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL' scripts/check-foundation.ts` is at least 2.
    - `grep -cE 'logResult\([0-9]+, 7,' scripts/check-foundation.ts` is exactly 7 (7 logResult calls in main()).
    - `grep -cE 'logResult\([0-9]+, 6,' scripts/check-foundation.ts` is 0 (no leftover 6-of-6 callsites).
    - `pnpm tsc --noEmit` exits 0.
    - `pnpm verify:phase-1` exits 0 — but only AFTER the operator's `.env.local` actually contains both env vars set to `/post-sign-in`. Per 03-SMOKE.md, the operator already added these. If verify:phase-1 fails on this check, the failure detail string says exactly which var is missing — that's the expected UX.
  </acceptance_criteria>
  <verify>
    <automated>pnpm tsc --noEmit && pnpm verify:phase-1</automated>
  </verify>
  <done>
    `scripts/check-foundation.ts` adds a 7th check that fails loudly if either Clerk fallback redirect env var is missing/empty/wrong-value. `pnpm verify:phase-1` exits 0 against the operator's current `.env.local` (which already has both vars set per 03-SMOKE.md).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator-local .env.local → @clerk/nextjs module load | NEXT_PUBLIC_* env vars are inlined into the client bundle at build time |
| Operator-local .env.local → verify:phase-1 gate | check-foundation.ts reads process.env to assert presence |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-G2-01 | Information Disclosure | NEXT_PUBLIC_* env vars exposed in client bundle | accept | `/post-sign-in` is a route path — already public knowledge from the bundle. No PII, no secret. |
| T-03-G2-02 | Tampering | Operator copies the example with wrong value | mitigate | Task 3's check-foundation.ts assertion fails verify:phase-1 with an exact-mismatch error message. |
| T-03-G2-03 | Denial of Service | Missing env var causes silent redirect-to-/ instead of /post-sign-in | mitigate | check-foundation.ts enforces presence; the smoke walkthrough now has a verify gate so this can't regress unnoticed. |
| T-03-G2-SC | Tampering | npm/pip/cargo installs | accept | No new packages introduced by this plan. |
</threat_model>

<verification>
## Phase-level gates

1. `pnpm tsc --noEmit` — zero errors.
2. `pnpm verify:phase-1` — exits 0 with 7/7 OK (was 6/6 before this plan).
3. Sanity probe: `grep -E '^NEXT_PUBLIC_CLERK_SIGN_(IN|UP)_FALLBACK_REDIRECT_URL=' .env.local.example | wc -l` returns 2 — both env vars present and pre-populated with `/post-sign-in`.
4. Documentation sanity: `reference/STACK.md` Clerk section has a new `### Embedded component redirect config` subsection.
</verification>

<success_criteria>
- Fresh clone + `cp .env.local.example .env.local` + populate remaining secrets → `pnpm verify:phase-1` exits 0 without operator needing to discover the env vars on their own (the gap surfaced in 03-SMOKE.md is now impossible to re-hit).
- `reference/STACK.md` documents the embedded-vs-hosted-portal distinction so the next operator (or LLM in a future session) understands the boundary.
- `pnpm verify:phase-1` will EMIT a specific actionable failure message if either env var is missing/empty/wrong-value — operator never has to discover the bug via a redirect-to-/ regression in production.
</success_criteria>

<output>
Create `.planning/phases/03-admin-ui/03-G2-SUMMARY.md` when done with:
- Commit hashes for each task
- Confirmation that `pnpm verify:phase-1` exits 0 (7/7 OK)
- The line range added to reference/STACK.md
- Any deviations from this plan with rationale
</output>
