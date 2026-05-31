import { describe, expect, it } from 'vitest';
import { maskCustomerId, maskSubscriptionId } from '@/lib/stripe/mask';

describe('lib/stripe/mask', () => {
  it('masks customer IDs to prefix plus last four characters', () => {
    const customerId = ['cus', 'abcdefghijkl'].join('_');

    expect(maskCustomerId(customerId)).toBe('cus_***ijkl');
  });

  it('masks subscription IDs to prefix plus last four characters', () => {
    const subscriptionId = ['sub', 'mnopqrstuvwx'].join('_');

    expect(maskSubscriptionId(subscriptionId)).toBe('sub_***uvwx');
  });

  it('does not return short or missing values verbatim', () => {
    expect(maskCustomerId('cus')).toBe('cus_***');
    expect(maskCustomerId(null)).toBe('cus_***');
    expect(maskSubscriptionId(undefined)).toBe('sub_***');
  });

  it('handles malformed values without revealing the full value', () => {
    expect(maskCustomerId('malformed-value')).toBe('cus_***alue');
    expect(maskSubscriptionId('bad')).toBe('sub_***');
  });
});
