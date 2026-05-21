// Plan 03-01 Wave-0 smoke test — proves vitest can run a single file under
// Node 22 with the jsdom + RTL setup. This file doubles as the positive
// control for `pnpm verify:phase-3`. Do NOT delete; future plans add real
// tests alongside it.
import { describe, it, expect } from 'vitest';

describe('vitest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
