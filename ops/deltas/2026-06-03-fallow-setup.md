# Fallow Setup (codebase intelligence)

Date: 2026-06-03
Branch: `chore/fallow-setup`
GSD stage: execute (dev tooling)

## Summary

Set up `fallow` (deterministic codebase intelligence for TS/JS, `fallow-rs/fallow` @ v2.87.0) for PolicyPilot, per operator request and three operator decisions (devDependency install · `.wiki/fallow/` wiki home · wire MCP server).

Changes:
- **Installed** `fallow@^2.87.0` as a devDependency (operator-approved exception to the "no unlisted packages" rule). Tracked: `package.json`, `pnpm-lock.yaml`.
- **`.fallowrc.json`** (tracked, new): `duplicates.ignore` + `health.ignore` suppress the 38 tracked test files, the `scripts/check-*` verification harness, `*.vitest.config.ts`, and `lib/db/schema.ts` (Drizzle per-table column repeats); cleanup `rules` set to `warn` for staged adoption while architectural/resolution rules stay `error` (defaults).
- **`.gitignore`** (tracked): added `.fallow/` (fallow cache / base-snapshot worktrees / impact history). The `.fallowrc.json` config itself stays tracked.
- **HTML wiki** (operator-local, gitignored `.wiki/`): `.wiki/fallow/index.html` (decision router — "which tool / what to do with a finding") and `.wiki/fallow/reference.html` (commands, flags, full config, issue types, MCP tools, gotchas).
- **`CLAUDE.md`** (tracked): new "## Codebase Intelligence (fallow)" section with an "if you need to… → run this" routing table pointing into `reference.html`, plus operating rules.
- **`.mcp.json`** (operator-local, gitignored): added `fallow` stdio MCP server (`node node_modules/fallow/bin/fallow-mcp`, `env.FALLOW_AGENT_SOURCE=claude_code`). Existing `qmd`/`supabase`/`stripe` servers preserved verbatim.

## Supply-chain sweep (audit-before-deps rule)

Performed before install:
- npm `fallow` uses the **optionalDependencies pattern** (platform binaries `@fallow-cli/<platform>` + one runtime dep `detect-libc@2.1.2`). **No `preinstall`/`postinstall`/`prepare` script** — the `scripts` block is test-only. No install-time code execution.
- Binary is **signature-verified on first run** (`scripts/verify-binary.js`; sentinel `.fallow-verified` written). Confirmed live: `fallow --version` → `2.87.0 · verified: yes`.
- Registry metadata: `fallow@2.87.0` is `latest`; maintainer `bartwaardenburg` matches the `@fallow-cli/win32-x64-msvc` binary maintainer and the `fallow-rs/fallow` repo; integrity hashes present; MIT.
- Current-month (June 2026) threat-intel search surfaced no `fallow` / `@fallow-cli/*` compromise. (General npm campaigns noted; the wrapper's *devDependency* `@tanstack/intent` is not pulled into a consumer `-D` install.)
- Lockfile delta verified: only `fallow` + 8 `@fallow-cli/*` platform packages + `detect-libc` (already present transitively). No surprise packages.
- Residual risk: single-maintainer project (account-takeover surface) — accepted, mitigated by no-postinstall + signature-verified binary design.

## Baseline (fallow 2.87.0, this repo)

- Health score **66 / C** (full score incl. churn hotspots; deductions: hotspots −10.0, unit size −10.0, unused deps −8.1, dead exports −3.2, coupling −2.3, dead files −0.5). 29 functions over complexity threshold (tests/scripts excluded; 506 files analyzed). NOTE: `fallow health --score` alone reports 76/B because it shows hotspots as N/A and omits the −10 hotspots penalty; the canonical/JSON score is 66/C.
- Dead-code: 70 issues (45 unused exports, 5 unused files, 13 unused class members, 4 unused types, 2 deps, 1 dup export) — surfaced as `warn`.
- Duplication: **10** genuine product clone groups after ignores (was 85 before; ~75% were tests/scripts).

## Consultant Keep-Current

- `.planning/consultant/working_context.md`: reviewed, no-change.
- `.planning/consultant/system_map.md`: reviewed, no-change.
- `.planning/consultant/feature_inventory.md`: reviewed, no-change.
- `.planning/consultant/risk_register.md`: reviewed, no-change (devDependency supply-chain risk swept and accepted above; no product/security-posture change).
- `.planning/consultant/backlog.md`: reviewed, no-change (follow-ups recorded below rather than promoted, pending operator decision).

No consultant-file update needed: this adds dev/analysis tooling and a vetted devDependency. It does not change product behavior, architecture, phase state, feature scope, multi-tenancy/RLS, or roadmap sequencing. Phase 7 not started.

## Boundaries

- Product runtime behavior changed: no.
- Application/source code changed: no (config, docs, tooling only).
- Packages or lockfile changed: yes — `fallow` devDependency added (operator-approved); swept.
- Schema, migrations, or Drizzle metadata changed: no.
- Secrets / env files / `.vercel/` changed: no. `.mcp.json` changed: yes — added `fallow` stdio server (no inline secrets; existing servers preserved). `.wiki/` changed: yes (gitignored docs).
- Live Stripe mode / dummy secrets / gate weakening: no.
- Phase 7 planning or code started: no.

## Verification

- PASS — `pnpm tsc --noEmit` (exit 0; fallow devDep does not perturb types).
- PASS — `.mcp.json` parses as valid JSON; servers: `qmd, supabase, stripe, fallow`.
- PASS — `fallow --version` → `2.87.0`, signature `verified: yes`.
- PASS — `.fallowrc.json` loaded by fallow (`loaded config: …\.fallowrc.json`); schema-valid (rejects unknown keys).
- PASS — `fallow dupes` after config: 85 → 10 clone groups (test/script noise removed, product clones retained).
- Tracked change set on branch: `M .gitignore`, `M CLAUDE.md`, `M package.json`, `M pnpm-lock.yaml`, `?? .fallowrc.json`, `?? ops/deltas/2026-06-03-fallow-setup.md` (this report). (`.mcp.json` + `.wiki/fallow/` are gitignored by design.)

## Follow-ups (backlog candidates, not yet promoted)

1. Triage the 70 dead-code findings (esp. 45 unused exports — verify framework/test-only false positives with `fallow explain` / MCP `trace_export` before deleting); promote cleaned rules `warn` → `error`.
2. Consolidate or document the 10 product clone groups (api/ai routes, dashboard↔policies, webhooks/stripe↔normalize, ai_generations↔products, middleware).
3. Optional: wire `fallow audit` as a Phase 8 / CI quality gate or a pre-commit hook (`fallow hooks install`).
4. Decide whether the `.wiki/fallow/` reference should be promoted to tracked `docs/fallow/` so it travels with the repo (currently operator-local; CLAUDE.md discloses it as gitignored, so its anchor links resolve only on this machine).
5. Triage fallow's unused-dependency findings: `@supabase/supabase-js` appears imported nowhere in `app/`/`lib/`/`components/` (only a string in `scripts/check-artifacts.ts` + docs) — likely a genuine unused production dep (the app uses `postgres.js`/Drizzle directly); `eslint-config-next` is likely a false positive (consumed via the ESLint flat config). Verify before removing/suppressing.

## Post-setup adversarial review (2026-06-03)

Ran a 5-dimension review workflow (config · MCP · docs · governance · adversary) with independent re-verification of load-bearing findings (7 agents). Outcome: setup is sound; claims C1/C2/C4/C5/C6/C7 confirmed with evidence — including a **live MCP `initialize`/`tools/list` handshake** proving the `fallow` server boots and exposes 22 tools (incl. `fallow_explain`, `find_dupes`, `trace_export`, `check_health`), and an independent confirmation that fallow respects `.gitignore` (probe in tracked `lib/` discovered; identical probe in gitignored `scratch/` not). Corrections applied this pass:
- **C3 fixed:** health score 76/B → **66/C** (the `--score`-only view omitted the −10 hotspots penalty). Corrected here and in the wiki.
- **`.fallowrc.json` comment fixed:** `.planning` is skipped as a non-allowlisted dotdir (ADR-006), not because it is gitignored (it is tracked).
- **`reference.html` fixed:** `annotations` is a GitHub-Action mode, not a CLI `--format` value (the 2.87.0 binary rejects `--format annotations`); softened "All top-level config keys" heading; trimmed an unconfirmed env-var.
- **`.mcp.json` hardened:** fallow server `args` changed from a cwd-relative path to an absolute path (removes the "fails if launched from non-repo-root cwd" caveat; the file is operator-local/gitignored so an absolute path is fine). The server will require one-time approval on next Claude Code launch (normal).
- Governance clean: `tsc` 0, `lint` 0 errors (12 pre-existing warnings), lockfile delta only fallow + platform binaries + detect-libc, no secrets, no guardrail violations, nothing committed.
