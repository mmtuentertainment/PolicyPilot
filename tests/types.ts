// tests/types.ts — D-07: lock ADR-018 + ADR-005 invariants at compile time.
//
// Each @ts-expect-error line MUST remain a compile error. If `tsc --noEmit`
// ever stops erroring on one, the invariant was broken — a future commit
// accidentally added `update`/`delete` to Acknowledgments (ADR-018) or
// made Policies.create accept `tldrSummary` (ADR-005).
//
// This file is NOT a runtime test; the body is intentionally dead code.
// The `void` calls + `as any` arg-shape prevent the lines from being
// type-erased before TS evaluates the error.
//
// Plan-phase note: the repository files imported below
// (lib/db/repositories/acknowledgments.ts, lib/db/repositories/policies.ts)
// are CREATED IN PLAN 02-04. Until then, `pnpm tsc --noEmit` will fail
// against this file with "Cannot find module '@/lib/db/repositories/...'"
// — that is the INTENDED state. Plan 02-06's `pnpm verify:phase-2` runs
// the final tsc check after the repositories ship.
/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-explicit-any */
import { Acknowledgments } from '@/lib/db/repositories/acknowledgments';
import { Policies } from '@/lib/db/repositories/policies';

// @ts-expect-error — Acknowledgments must not expose `update` (ADR-018 append-only)
void Acknowledgments.update;

// @ts-expect-error — Acknowledgments must not expose `delete` (ADR-018 append-only)
void Acknowledgments.delete;

// @ts-expect-error — Policies.create input must omit `tldrSummary` (ADR-005 — generated at publish)
void Policies.create({} as any, { tldrSummary: 'x' });
