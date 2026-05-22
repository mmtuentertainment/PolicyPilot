import 'server-only';
import { notFound } from 'next/navigation';
import { getOrgContext, type OrgContext } from '@/lib/auth/context';
import { ForbiddenError } from '@/lib/auth/errors';

/**
 * Server-side admin gate (L-01, ADR-009) — Phase 3 no-arg signature.
 *
 * Called at the top of `app/(admin)/layout.tsx` Server Component. Returns the
 * OrgContext on success; calls Next.js notFound() (HTTP 404) on non-admin role
 * per D-10 "advertise nothing" — preserves Phase 3 UX (admin URL discovery
 * prevented for non-admin signed-in users).
 *
 * Defense-in-depth: middleware.ts ALSO enforces this gate via
 * ADMIN_URL_PATTERNS; the layout-level check is the authoritative source.
 *
 * Note: getOrgContext() already wraps `await auth()` in try/catch (SF-M4
 * fold). Do NOT re-wrap here — let auth failures bubble for the framework
 * error boundary to handle.
 *
 * Phase 4 D-45 amendment: kept verbatim for backward-compat with Phase 3
 * admin PAGES (which want 404 to "advertise nothing"). New Phase 4 API
 * ROUTES use `requireAdminFromCtx(ctx)` below — that path throws
 * `ForbiddenError` → HTTP 403 per AC-26 acceptance.
 */
export async function requireAdmin(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (ctx.role !== 'admin') notFound();
  return ctx;
}

/**
 * Phase 4 D-45 (AC-26 resolution → 403 path).
 *
 * Takes a pre-resolved OrgContext and THROWS `ForbiddenError` on non-admin
 * role. The Next.js error boundary maps `ForbiddenError` to HTTP 403 with
 * body `{ error: 'forbidden' }` matching SPEC R2 acceptance text verbatim.
 *
 * Rationale for two functions side-by-side: Phase 3 admin PAGES want the
 * "advertise nothing" 404 path (D-10 — prevents URL probing). Phase 4 API
 * ROUTES want the contract-clean 403 path (AC-26 — well-formed REST error
 * response). The pattern parallels Phase 2's split between middleware
 * fail-closed redirects (UI surface) and endpoint typed errors (API surface).
 *
 * Per D-37: callers MUST place `getOrgContext()` + `requireAdminFromCtx`
 * OUTSIDE the route's try/catch — auth errors propagate to the Next.js
 * error boundary, not the 503 fallback.
 *
 * Example (Phase 4 endpoint outer auth pattern):
 *   export async function POST(req: Request) {
 *     const ctx = await getOrgContext();   // throws → 401 via BootstrapError handling
 *     requireAdminFromCtx(ctx);            // throws ForbiddenError → 403
 *     try { ... } catch (err) { ... }      // inner business-logic try/catch
 *   }
 */
export function requireAdminFromCtx(ctx: OrgContext): void {
  if (ctx.role !== 'admin') {
    throw new ForbiddenError('admin role required');
  }
}
