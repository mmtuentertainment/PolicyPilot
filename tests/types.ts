// tests/types.ts — D-07: lock ADR-018 + ADR-005 invariants at compile time.
//
// Each @ts-expect-error line MUST remain a compile error. If `tsc --noEmit`
// ever stops erroring on one, the invariant was broken — a future commit
// accidentally added `update`/`delete` to Acknowledgments (ADR-018) or
// made Policies.create accept `tldrSummary` (ADR-005).
//
// This file is NOT a runtime test; the body is intentionally dead code.
// The `void` calls + extracted `OrgScope` placeholder prevent the lines
// from being type-erased before TS evaluates the error.
//
// Plan-phase note: the repository files imported below
// (lib/db/repositories/acknowledgments.ts, lib/db/repositories/policies.ts)
// are CREATED IN PLAN 02-04. Until then, `pnpm tsc --noEmit` will fail
// against this file with "Cannot find module '@/lib/db/repositories/...'"
// — that is the INTENDED state. Plan 02-06's `pnpm verify:phase-2` runs
// the final tsc check after the repositories ship.
import { Acknowledgments } from '@/lib/db/repositories/acknowledgments';
import { Policies } from '@/lib/db/repositories/policies';
import { PolicyVersions } from '@/lib/db/repositories/policy_versions';
import { QaCitationGrants } from '@/lib/db/repositories/qa_citation_grants';

// Extract the OrgScope shape from Policies.create's first parameter so we
// can supply a typed placeholder without reaching for `as any`. The third
// `@ts-expect-error` line targets the SECOND argument's shape — the first
// arg is just a stand-in for the surrounding `withOrgScope` transaction.
type OrgScopePlaceholder = Parameters<typeof Policies.create>[0];
const ORG_SCOPE_STUB = {} as OrgScopePlaceholder;

// @ts-expect-error — Acknowledgments must not expose `update` (ADR-018 append-only)
void Acknowledgments.update;

// @ts-expect-error — Acknowledgments must not expose `delete` (ADR-018 append-only)
void Acknowledgments.delete;

// @ts-expect-error — Policies.create input must omit `tldrSummary` (ADR-005 — generated at publish)
void Policies.create(ORG_SCOPE_STUB, { tldrSummary: 'x' });

// ---- Phase 3 L-05 invariants (PolicyVersions append-only spirit) ----
// Plan 03-04: PolicyVersions mirrors Acknowledgments' append-only contract.
// A version row IS the as-of-publish snapshot an acknowledgment points at
// (acknowledgments.policy_version_id FK). Mutating or deleting it would
// silently rewrite the audit trail. If the repository ever grows an
// `update` or `delete` key, tsc will SUCCEED on these lines and fail the
// build — that is the intended failure mode of the inverted-polarity guard.

// @ts-expect-error — PolicyVersions must not expose `update` (L-05 / ADR-018-spirit)
void PolicyVersions.update;
// @ts-expect-error — PolicyVersions must not expose `delete` (L-05 / ADR-018-spirit)
void PolicyVersions.delete;

// ---- Phase 5 D-29 grant immutability invariant ----
// Q&A citation grants are write-once/non-expiring for MVP. Cleanup, if
// needed, belongs to an explicit future cron path rather than ad hoc
// repository update/delete methods.

// @ts-expect-error — QaCitationGrants must not expose `update` (D-29 write-once grants)
void QaCitationGrants.update;
// @ts-expect-error — QaCitationGrants must not expose `delete` (D-29 write-once grants)
void QaCitationGrants.delete;

// ---- ADR-028 PolicyId brand invariant ----
// The branded `PolicyId` nominal type (from `lib/policies/types.ts`) MUST
// reject raw-string assignment at compile time. If the brand erodes (e.g.
// a future refactor that swaps `z.string().uuid().brand<'PolicyId'>()` for
// `z.string().uuid()` without the brand), tsc SUCCEEDS on the line below
// and fails the build — that is the intended failure mode of the
// inverted-polarity guard. scripts/check-policy-id-brand.ts is the
// complementary signature-level gate.
import type { PolicyId } from '@/lib/policies/types';

// @ts-expect-error — PolicyId must not accept a raw `string` via assignment (ADR-028 brand)
const _policyIdBrandTest: PolicyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
void _policyIdBrandTest;

// ---------------------------------------------------------------------------
// Phase 4 D-43 — Compile-time assertion: parseQaResponse return.citations must
// remain { title: string; id: string }[] forever. If a future refactor regresses
// citation shape to legacy string[] (or any other shape), `pnpm tsc --noEmit` fails.
//
// Reference: API-SPEC.md amended contract (Plan 04-01 Task 6) +
// SPEC.md R4 acceptance text (line 116).
// ---------------------------------------------------------------------------
import type { parseQaResponse } from '@/lib/ai/qa-parser';

type _QaCitations = ReturnType<typeof parseQaResponse>['citations'];

// POSITIVE assertion: shape matches API-SPEC.md amended contract { title, id }[].
const _qaCitationsCheck: { title: string; id: string }[] = [] as _QaCitations;
void _qaCitationsCheck;

// NEGATIVE assertion: prevent regression to legacy string[] shape.
// If a future refactor regresses citations to `string[]`, the assignment below
// becomes valid (string[] ↔ string[]) and the @ts-expect-error directive has
// nothing to suppress — TS then emits "Unused '@ts-expect-error' directive"
// which breaks the build. That is the intended failure mode of this inverted-
// polarity guard (mirrors the PolicyId brand pattern at line 62 above).
// @ts-expect-error — citations must be {title, id}[], not string[]
const _qaCitationsRegress: string[] = [] as _QaCitations;
void _qaCitationsRegress;
