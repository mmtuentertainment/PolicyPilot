# Phase 8: Validation (CSV-first slice) — Research

**Researched:** 2026-06-15 · **Phase:** 08-validation
**Sources:** Context7 (`/websites/clerk`, `/clerk/clerk-docs`, `/vercel/next.js`) + `@clerk/javascript` source + official Clerk/Next docs. Repo versions: `@clerk/nextjs ^7.3.4`, `next 15.5.18`, `zod ^3.23.5`.

The two external HOW unknowns from `08-CONTEXT.md` (Clerk batch enrichment; Next CSV-response idiom) are resolved below. Everything else is grounded in the live repo (see `08-CONTEXT.md` § Canonical References).

## 1. Clerk batch identity enrichment — `clerkClient().users.getUserList`

**Invocation (v7 async form — confirmed in-repo at `app/api/webhooks/clerk/route.ts:72`):**
```ts
import { clerkClient } from '@clerk/nextjs/server';
const client = await clerkClient();                 // async in v6/v7 — MUST await
const { data, totalCount } = await client.users.getUserList({
  userId: chunk,    // string[] — filter by Clerk user IDs
  limit: 100,
});
```

- **`userId: string[]` is a batch filter** (REST `user_id[]`) — fetch many users by ID in one call. **Hard cap = 100 IDs per call** → **chunk the `clerkUserId` list at 100.** (`limit` default 10, max 500; with ≤100 IDs and `limit:100`, each chunk returns in a single page, no intra-chunk pagination.)
- **Return shape (v7): paginated `{ data: User[]; totalCount: number }`** — destructure `data` (NOT a bare array; that was pre-v5).
- **Field access on the backend `User`:**
  - name: `user.fullName` getter (`[firstName,lastName].join(' ').trim() || null`), or compose `firstName`/`lastName`/`username` manually.
  - email: `user.primaryEmailAddress?.emailAddress ?? null` — the `primaryEmailAddress` getter resolves `primaryEmailAddressId` against `emailAddresses[]` and returns an `EmailAddress` **object**; read `.emailAddress` for the string.
- **Implication for D-05:** collect distinct `clerkUserId`s from the org-scoped rows → chunk(100) → `await clerkClient()` once, `getUserList` per chunk → build `Map<clerkUserId,{name,email}>` → map onto rows; missing id → `{name:'',email:''}` fallback (row kept). Mock at the module boundary in tests (repo's existing mock shape: `vi.doMock('@clerk/nextjs/server', () => ({ clerkClient: vi.fn(async () => ({ users: { getUserList: vi.fn(...) } })) }))` — see `app/api/webhooks/clerk/route.test.ts:60-63`). **No live Clerk in CI.**

## 2. CSV file download from a Next.js 15 App Router GET handler

**Idiomatic (confirmed — official "Non-UI Responses"):** a plain `Response` (or `NextResponse`) with a **string body** is sufficient; no stream needed at one-org report scale.
```ts
export const dynamic = 'force-dynamic';   // Next 15 GET default is dynamic; explicit for tenant-scoped auth'd response

return new Response(csvString, {
  status: 200,
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="acknowledgments-${orgId}-${date}.csv"`,
  },
});
```
- **`Content-Type: text/csv; charset=utf-8`** (charset avoids mojibake on non-ASCII).
- **`Content-Disposition: attachment; filename="…"`** triggers the download (ASCII filename — internal org UUID + ISO date is ASCII-safe; no RFC-5987 `filename*` needed).
- **`Content-Length`:** runtime computes it for a string body — do not set manually.
- **JSON branch** uses `NextResponse.json({...}, { status })` (existing repo idiom). **CSV branch** uses plain `new Response(csvString, {headers})` — both valid; plain `Response` is cleaner for the CSV body. (Refines `08-CONTEXT.md` D-10 — either constructor is fine; plan uses plain `Response` for CSV.)
- **`export const dynamic = 'force-dynamic'`** on the route guarantees the tenant-scoped, auth'd response is never statically cached.

## 3. Confirmed-from-repo (no external lookup needed)
- `requireAdminFromCtx(ctx)` → `ForbiddenError` → 403 `{error:'forbidden'}` for API routes (`lib/auth/require-admin.ts:56-60`). `getOrgContext()` → 401 when unauth (`lib/auth/context.ts:93-174`).
- `withOrgScope(ctx, fn)` → RLS-enforced tx `s.tx` (`lib/db/scoped.ts:41-67`).
- Org-wide ack JOIN + dept fan-out: `lib/db/repositories/reminders.ts:79-163`. 3-state `ackState`: `lib/db/repositories/policies.ts:135-209`.
- Verify chain: `verify:phase-7` at `package.json:55`; TEST-DB integration pattern `scripts/check-rls.ts` / `scripts/check-employee-portal.ts`; CI flake guard `verify-phase-6.yml:3-10`.
- Import order: `'server-only'` → framework (`next/server`, `@clerk/nextjs/server`) → libs (`zod`, `drizzle-orm`) → `@/lib/*` (CONVENTIONS.md:122-126).
- `zod ^3.23.5`: `z.enum(['json','csv']).default('json')`, `z.string().uuid().optional()` available.

## 4. Open risk flagged for the plan
- **CSV/formula injection** on user-controlled fields (policy title; Clerk name/email/department) — the hand-rolled serializer MUST neutralize leading `= + - @` TAB CR (prefix `'`). Not a library concern (we hand-roll) → unit-tested.
- **Clerk enrichment is the one boundary-crossing call** — kept outside the DB tx, batched, fed only RLS-filtered ids (D-06), fallback-safe. A Clerk outage → 503 (whole report), logged masked; acceptable (admin retries) — noted in the threat model.

---

*Phase: 08-validation · Research 2026-06-15*
