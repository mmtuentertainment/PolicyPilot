// lib/policies/state-machine.test.ts
// Plan 03-03 Task 1 (RED) — full 4x4 transition matrix coverage for the
// pure state-machine module (D-03). The implementation file
// `lib/policies/state-machine.ts` does NOT yet exist at the time this
// test file is committed — module-not-found is the expected RED state.
//
// Coverage:
//   - 7 legal transitions explicitly allowed (REQ-policy-lifecycle DAG)
//   - 9 forbidden transitions: 4 same-status round-trips + 5 cross-DAG hops
//   - ALLOWED_TRANSITIONS table shape (keys + per-status allow-lists)
//   - IllegalTransitionError constructor / inheritance / message contents
//
// Mirrors CONTEXT.md `<specifics>` § 2 + 03-PATTERNS.md `lib/policies/state-machine.ts`
// section + 03-RESEARCH.md Pattern 2.
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  IllegalTransitionError,
  ALLOWED_TRANSITIONS,
  type PolicyStatus,
} from './state-machine';

const STATUSES: PolicyStatus[] = ['draft', 'under_review', 'published', 'archived'];

const LEGAL: Array<[PolicyStatus, PolicyStatus]> = [
  ['draft', 'under_review'],
  ['draft', 'published'],
  ['under_review', 'published'],
  ['under_review', 'draft'],
  ['published', 'archived'],
  ['published', 'draft'],
  ['archived', 'draft'],
];

describe('canTransition (REQ-policy-lifecycle DAG)', () => {
  for (const [from, to] of LEGAL) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }

  // Cross-product complement: every (from, to) pair NOT in LEGAL must
  // return false. This catches both same-status round-trips and any
  // cross-DAG hop the table forbids.
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const isLegal = LEGAL.some(([f, t]) => f === from && t === to);
      if (isLegal) continue;
      it(`forbids ${from} → ${to}`, () => {
        expect(canTransition(from, to)).toBe(false);
      });
    }
  }
});

describe('ALLOWED_TRANSITIONS table shape', () => {
  it('has all four statuses as keys', () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([
      'archived',
      'draft',
      'published',
      'under_review',
    ]);
  });

  it('draft allows [under_review, published]', () => {
    expect([...ALLOWED_TRANSITIONS.draft].sort()).toEqual(['published', 'under_review']);
  });

  it('under_review allows [published, draft]', () => {
    expect([...ALLOWED_TRANSITIONS.under_review].sort()).toEqual(['draft', 'published']);
  });

  it('published allows [archived, draft]', () => {
    expect([...ALLOWED_TRANSITIONS.published].sort()).toEqual(['archived', 'draft']);
  });

  it('archived allows [draft] only', () => {
    expect([...ALLOWED_TRANSITIONS.archived]).toEqual(['draft']);
  });
});

describe('IllegalTransitionError', () => {
  it('is an Error subclass', () => {
    const err = new IllegalTransitionError('draft', 'archived');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IllegalTransitionError);
  });

  it('exposes from and to and name', () => {
    const err = new IllegalTransitionError('archived', 'published');
    expect(err.from).toBe('archived');
    expect(err.to).toBe('published');
    expect(err.name).toBe('IllegalTransitionError');
  });

  it('message references both status values', () => {
    const err = new IllegalTransitionError('draft', 'archived');
    expect(err.message).toContain('draft');
    expect(err.message).toContain('archived');
  });
});
