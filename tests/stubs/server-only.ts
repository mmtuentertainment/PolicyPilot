// Vitest alias target for the `server-only` package — the real module
// throws at import time when bundled into a Client Component / browser
// bundle (which is the desired behavior in Next.js). Under vitest's
// node-side jsdom runner that throw is a false positive: any server-only
// module a test imports would crash on the first line.
//
// Aliasing `server-only` to this empty module short-circuits the guard
// for tests only; the real `server-only` is still in node_modules and
// still fires inside `next dev` / `next build`.
//
// Wired in vitest.config.ts via `resolve.alias['server-only']`.
export {};
