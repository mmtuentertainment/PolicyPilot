# pnpm 10 Migration — BLOCKED

**Blocked date:** 2026-06-25  
**Blocking agent:** Scheduled cloud agent (automated supply-chain pre-flight)  
**Target version:** pnpm@10.34.3  
**Status:** BLOCKED — see findings below  

---

## Why This PR Exists

A scheduled cloud agent was tasked with migrating PolicyPilot from `pnpm@9.15.9`
to `pnpm@10.34.3`, subject to a hard supply-chain rule: **never adopt a package
version younger than 14 days** (the peak supply-chain-attack window).

The agent performed the full supply-chain audit before touching any code and
triggered the ABORT CONDITION. No application files were modified.

---

## Audit Findings

### 1. Release Date Verification

| Version | Release date | Days old on 2026-06-25 | 14-day rule |
|---------|-------------|------------------------|-------------|
| pnpm 10.34.3 | 2026-06-11 17:04 UTC | **14 days** | PASS ✓ |
| pnpm 10.34.4 | 2026-06-18 22:52 UTC | **7 days** | FAIL ✗ |

Sources: GitHub release pages for
[v10.34.3](https://github.com/pnpm/pnpm/releases/tag/v10.34.3) and
[v10.34.4](https://github.com/pnpm/pnpm/releases/tag/v10.34.4).

### 2. Active Security Advisories in pnpm 10.34.3

pnpm released **10.34.4 on 2026-06-18** as a security-only patch containing
four fixes. Two of these are material path-traversal advisories that affect
10.34.3 (and earlier 10.x versions):

#### GHSA-qrv3-253h-g69c — Config-dependency lockfile path traversal
- **Severity:** High  
- **Affects:** pnpm 10.x < 10.34.4 (and pnpm 11.x < 11.8.0)  
- **Vector:** A committed `pnpm-lock.yaml` with a traversal-shaped
  `configDependencies` name (e.g. `../../PWNED`) or version causes
  `pnpm install` to create symlinks or write package files outside
  `node_modules/.pnpm-config` and the store.  
- **Fixed in:** 10.34.4 / 11.8.0  
- **Status in 10.34.3:** **VULNERABLE** (unpatched)

#### GHSA-fr4h-3cph-29xv — Alias path traversal in hoisted node_modules
- **Severity:** High  
- **Affects:** pnpm 10.x with `nodeLinker: hoisted`, < 10.34.4  
- **Vector:** Malicious dependency aliases like `../../../escape` bypass
  alias validation in the hoisted graph builder; crafted lockfiles can
  place executable shims outside `node_modules`.  
- **Fixed in:** 10.34.4 / 11.8.0  
- **Status in 10.34.3:** **VULNERABLE** (unpatched)

#### Two additional security fixes in 10.34.4 (lower severity)
- `pnpm patch-remove` could delete files outside the patches directory.
- npm registry config hardening: `.npmrc` env-var warning suggestions now
  restricted to shell-safe characters.

### 3. Why the ABORT CONDITION Was Triggered

The supply-chain rule requires the chosen version to be **both**:
- ≥ 14 days old (to clear the attack window), **AND**
- Advisory-clean (no active unpatched security advisories)

| Version | ≥ 14 days? | Advisory-clean? | Eligible? |
|---------|-----------|-----------------|-----------|
| 10.34.3 | ✓ (14d)   | ✗ (2 active CVEs) | **NO** |
| 10.34.4 | ✗ (7d)    | ✓               | **NO** |

No pnpm 10.x version simultaneously satisfies both conditions as of 2026-06-25.

### 4. Previously-fixed advisories (not blocking, for reference)

These issues affect older 10.x ranges and are already fixed in 10.34.3:

| Advisory | Summary | Fixed in |
|----------|---------|----------|
| CVE-2025-69262 | Git dependency RCE via `prepare`/`prepack` scripts | 10.26.0 |
| CVE-2026-23890 | Bin-linking path traversal (`@`-scoped packages) | 10.28.1 |
| CVE-2026-24056 | Symlink traversal in `file:`/`git:` dependencies | 10.28.2 |
| GHSA-3qhv-2rgh-x77r | `.npmrc` env-var expansion leaks secrets to registry | 10.34.3 |

---

## When to Re-run the Migration

**Earliest eligible date for pnpm 10.34.4: 2026-07-02** (18 Jun + 14 days).

To proceed then:
1. Verify no newer patch has superseded 10.34.4 (check
   [pnpm releases](https://github.com/pnpm/pnpm/releases)).
2. Search for new advisories affecting 10.34.4.
3. If both checks pass, run this scheduled agent again (or repeat the
   migration manually), targeting `pnpm@10.34.4` instead of 10.34.3.

### Files that will need updating (for reference)

When the migration is unblocked, these files must all be updated to the
new version:

| File | Change needed |
|------|---------------|
| `package.json` | `"packageManager": "pnpm@9.15.9"` → `"pnpm@<target>"` |
| `.github/workflows/verify.yml` | 3× `version: 9.15.9` → `version: <target>` (jobs: full-verification, browser-smoke, live-verification) |
| `.github/workflows/verify-phase-6.yml` | `version: 9.15.9` → `version: <target>` |
| `.github/workflows/verify-phase-7.yml` | `version: 9.15.9` → `version: <target>` |
| `.github/workflows/verify-phase-8.yml` | `version: 9.15.9` → `version: <target>` |
| `pnpm-lock.yaml` | Regenerate with `pnpm install --no-frozen-lockfile` after version bump |

No `.npmrc`, `Dockerfile`, or `engines.pnpm` fields were found — no
additional changes required in those locations.

---

## pnpm 9→10 Breaking Changes (for when migration proceeds)

Key changes in pnpm 10.x that may affect PolicyPilot:

- **Lifecycle scripts disabled by default** — `onlyBuiltDependencies` is now
  the allowlist mechanism. If any dependency needs `postinstall`, it must be
  explicitly allowed. Run `pnpm install` and review any "lifecycle script
  blocked" warnings.
- **Strict peer dependencies** — pnpm 10 errors on missing peers by default.
  Review peer dependency warnings at install time.
- **Lockfile format bump** — `pnpm-lock.yaml` will be regenerated in the
  new format; this is expected and not a concern.

---

*This file was created automatically by the scheduled pnpm-migration cloud agent
on 2026-06-25. It should be deleted once the migration is successfully
completed and merged.*
