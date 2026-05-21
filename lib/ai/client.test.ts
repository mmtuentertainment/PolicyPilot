// @vitest-environment node
// lib/ai/client.test.ts — Plan 04-04 GREEN: lib/ai/client.ts created with
// singleton + CLIENT_OPTIONS per D-02 + D-33. AC-28 satisfied.
//
// Rule-3 deviation (Plan 04-04 Task 1): vitest.config.ts sets `environment: 'jsdom'`
// globally (Phase 3 setup for React component tests). The Anthropic SDK's BaseAnthropic
// constructor refuses to instantiate when it detects a browser-like env (CVE-style
// guard against bundling secrets into client code) — it throws unless
// `dangerouslyAllowBrowser: true` is passed. Since `lib/ai/client.ts` is a server-only
// module by design (D-02 + CLAUDE.md NEVER #2), the correct fix is to force the
// 'node' environment for this test file via the file-level docblock above. This is
// the documented vitest pattern for per-file environment override.
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('lib/ai/client — singleton + retry/timeout config (D-02 + D-33)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test-fixture';
  });

  it('exports getAnthropicClient as lazy singleton (D-02)', async () => {
    const m = await import('@/lib/ai/client');
    const c1 = m.getAnthropicClient();
    const c2 = m.getAnthropicClient();
    expect(c1).toBe(c2);
  });

  it('configures maxRetries: 0 (D-33 — SPEC R7 no auto-retry)', async () => {
    const m = await import('@/lib/ai/client');
    expect(m.CLIENT_OPTIONS.maxRetries).toBe(0);
  });

  it('configures timeout: 25_000 (D-33 — 25s bounded ahead of Vercel default)', async () => {
    const m = await import('@/lib/ai/client');
    expect(m.CLIENT_OPTIONS.timeout).toBe(25_000);
  });
});
