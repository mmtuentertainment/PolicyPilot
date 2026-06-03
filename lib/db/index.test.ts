// lib/db/index.test.ts — Cause-B regression guard.
//
// `lib/db/index.ts` must be SIDE-EFFECT-FREE at import: importing it must not
// read DATABASE_URL or open a Postgres connection. Next 15's `next build`
// evaluates every route module during the "Collecting page data" phase, so an
// import-time throw (DATABASE_URL absent at build) detonates the build —
// "Failed to collect page data for /api/ai/consistency/[batchId]". The lazy
// Proxy in index.ts defers the env check + client construction to the first
// RUNTIME property access. These tests lock that contract in:
//   1. import must NOT throw when DATABASE_URL is absent;
//   2. the helpful error still fires on first db use when it is absent;
//   3. with DATABASE_URL set, the Proxy forwards to a real drizzle instance.
import "server-only";
import { describe, it, expect, afterEach, vi } from "vitest";

describe("lib/db lazy init (Cause-B regression)", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    vi.resetModules();
  });

  it("does NOT throw at import when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    await expect(import("@/lib/db")).resolves.toBeDefined();
  });

  it("throws the helpful error on first db use when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { db } = await import("@/lib/db");
    expect(() => db.select()).toThrow(/DATABASE_URL is not set/);
  });

  it("forwards to a real drizzle client when DATABASE_URL is set (lazy, offline-safe)", async () => {
    // postgres.js connects lazily on first query, so constructing the client +
    // building a statement performs zero I/O. This proves the Proxy resolves
    // and forwards to a genuine drizzle instance (binding methods) — not just
    // the throw path. A dummy DSN is sufficient; nothing connects.
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/policypilot_lazy_test";
    vi.resetModules();
    const { db } = await import("@/lib/db");
    const builder = db.select();
    expect(builder).toBeTruthy();
    expect(typeof builder.from).toBe("function");
  });

  it("binds methods so a detached/destructured call keeps correct `this`", async () => {
    // Guards the load-bearing `.bind(real)` in the Proxy get trap. drizzle's
    // query-builder methods live on the prototype and read `this.session` /
    // `this.dialect` synchronously, so a call detached from `db` (where `this`
    // is undefined) throws unless the Proxy bound the method to the real
    // instance. Without the bind, THIS case fails (TypeError) while the others
    // still pass — so a future refactor dropping the bind cannot stay green.
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/policypilot_lazy_test";
    vi.resetModules();
    const { db } = await import("@/lib/db");
    const { select } = db; // detached from `db`
    expect(() => select()).not.toThrow();
  });
});
