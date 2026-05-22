// lib/ai/schemas.test.ts — Plan 04-04 GREEN: DraftSchema + SummarySchema + QaSchema
// .strict() bodies + BLOCKER-2 z.enum(POLICY_CATEGORIES) on DraftSchema.policyType.
// AC-33 satisfied.
import { describe, expect, it } from 'vitest';
import { DraftSchema, SummarySchema, QaSchema } from '@/lib/ai/schemas';
import { POLICY_CATEGORIES } from '@/lib/policies/categories';

describe('lib/ai/schemas — Zod .strict() bodies (D-42 + BLOCKER-2 enum)', () => {
  it('DraftSchema rejects extra keys (.strict() per AC-33)', () => {
    const r = DraftSchema.safeParse({ prompt: 'x', extra: 'evil' });
    expect(r.success).toBe(false);
  });

  it('DraftSchema rejects prompt > 10_000 chars', () => {
    const r = DraftSchema.safeParse({ prompt: 'x'.repeat(10_001) });
    expect(r.success).toBe(false);
  });

  it('DraftSchema rejects policyType outside POLICY_CATEGORIES (BLOCKER-2 enum constraint)', () => {
    const r = DraftSchema.safeParse({ prompt: 'x', policyType: 'NotARealCategory' });
    expect(r.success).toBe(false);
  });

  it('DraftSchema accepts each valid POLICY_CATEGORIES value', () => {
    for (const cat of POLICY_CATEGORIES) {
      const r = DraftSchema.safeParse({ prompt: 'x', policyType: cat });
      expect(r.success, `category=${cat} should parse`).toBe(true);
    }
  });

  it('DraftSchema accepts omitted policyType (optional)', () => {
    const r = DraftSchema.safeParse({ prompt: 'x' });
    expect(r.success).toBe(true);
  });

  it('SummarySchema rejects non-uuid policyId', () => {
    const r = SummarySchema.safeParse({ policyId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('QaSchema rejects question > 2_000 chars (AC-33 fixture)', () => {
    const r = QaSchema.safeParse({ question: 'x'.repeat(2_001) });
    expect(r.success).toBe(false);
  });

  it('QaSchema rejects extra keys (.strict())', () => {
    const r = QaSchema.safeParse({ question: 'valid', extraKey: 'evil' });
    expect(r.success).toBe(false);
  });

  it('All 3 schemas accept happy-path inputs', () => {
    expect(DraftSchema.safeParse({ prompt: 'Write a vacation policy' }).success).toBe(true);
    expect(SummarySchema.safeParse({ policyId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }).success).toBe(true);
    expect(QaSchema.safeParse({ question: 'How many sick days do I get?' }).success).toBe(true);
  });
});
