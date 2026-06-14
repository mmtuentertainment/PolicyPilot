# Codebase Intelligence — fallow (reference)

> Moved out of `CLAUDE.md` 2026-06-14 (context-diet). `fallow` is **deterministic
> codebase intelligence for TS/JS** — ask it for structural truth (is this used?
> duplicated? circular deps? complexity hotspots? boundary violations?) instead
> of grepping-and-inferring. Syntactic (no type info), sub-second, deterministic,
> no AI inside; does not replace review. devDependency `fallow@^2.87.0` (added
> 2026-06-03 — operator-approved exception to the "no unlisted packages" rule).

**Full wiki (operator-local, gitignored):** `.wiki/fallow/index.html` (decision router) · `.wiki/fallow/reference.html` (commands, flags, full config, issue types, MCP). MCP server `fallow` is wired in `.mcp.json` (tools incl. `fallow_explain`, `find_dupes`, `trace_export`, `check_health`).

**If you need to… → run this** (all via `pnpm exec fallow`; deep detail at the `reference.html` anchors):

| If you need to… | Use | → reference |
|---|---|---|
| know if a file / export / type / dep is **actually used** | `fallow dead-code` | `reference.html#commands` |
| find **duplicated** logic / a block's clone siblings | `fallow dupes` (`--trace f.ts:42`) | `reference.html#commands` |
| find **circular deps** / **boundary** violations | `fallow dead-code --circular-deps` / `--boundary-violations` | `reference.html#rules` |
| find the **riskiest / most complex** code | `fallow health --hotspots --targets --score` | `reference.html#commands` |
| **gate a change** before a PR (pass/warn/fail) | `fallow audit` | `reference.html#commands` |
| understand **why** X is (un)used | `fallow explain <rule>` · MCP `fallow_explain` | `reference.html#agent` |
| match **literal text / regex / a string** | the `Grep` tool — **NOT** fallow | `index.html#route-tool` |

**When fallow reports a finding** → choose one: (1) **fix** it in code, (2) **encode the narrowest exception** (`// fallow-ignore-next-line <issue-type>`, `ignoreExports`, `overrides`) with a documented reason, or (3) **change policy** in `.fallowrc.json`. Full rules: `index.html#route-finding`.

**Operating rules:**
- Invoke via `pnpm exec fallow`. For parsing use `--format json --quiet 2>$null`; **exit 1 = issues found (normal)** — only exit 2 is a real error.
- `.fallowrc.json` is **tracked** and ignores tests + `scripts/` for duplication/complexity, and softens cleanup rules to `warn` (architectural rules stay `error`). The `.fallow/` cache dir is gitignored.
- Never run `fallow watch` (never exits). Never enable telemetry (off by default; only Matthew may).
- It's syntactic — for type-aware navigation/rename use the LSP/tsserver, not fallow.
