// lib/ai/client.test.ts — Plan 04-03 Wave-0 RED stub.
// AC-28 (D-33): singleton + maxRetries:0 + timeout:25_000.
// SUT module `lib/ai/client.ts` does NOT exist yet — Plan 04-04 creates it.
// Tests are RED until then.
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Variable-indirection so TS module resolution doesn't fail at compile time
// before Plan 04-04 lands lib/ai/client.ts. Vitest still resolves the path at
// runtime, where the SUT module's absence is the RED failure surface.
const CLIENT_PATH = '@/lib/ai/client';

describe('lib/ai/client — singleton + retry/timeout config (D-02 + D-33)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports getAnthropicClient as lazy singleton (D-02)', async () => {
    // Plan 04-04 creates lib/ai/client.ts with `let cached: Anthropic | null = null;`
    // and `getAnthropicClient` returns the cached singleton on 2nd+ calls.
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const m: { getAnthropicClient: () => unknown } = await import(CLIENT_PATH);
    const c1 = m.getAnthropicClient();
    const c2 = m.getAnthropicClient();
    expect(c1).toBe(c2);
  });

  it('configures maxRetries: 0 (D-33 — SPEC R7 no auto-retry)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    // Anthropic SDK exposes options at runtime via _options or similar — alternative is to
    // construct the SDK in a separate file the test can introspect.
    // Acceptable Plan-04-04 strategy: re-export `CLIENT_OPTIONS` const used at instantiation.
    // This test will assert maxRetries === 0 against that const.
    expect.fail('TODO: Plan 04-04 — assert CLIENT_OPTIONS.maxRetries === 0');
  });

  it('configures timeout: 25_000 (D-33 — 25s bounded ahead of Vercel default)', async () => {
    expect.fail('TODO: Plan 04-04 — assert CLIENT_OPTIONS.timeout === 25_000');
  });
});
