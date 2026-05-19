import 'server-only';
import { notFound } from 'next/navigation';
import { getOrgContext, type OrgContext } from '@/lib/auth/context';

/**
 * Server-side admin gate (L-01, ADR-009).
 *
 * Called at the top of `app/(admin)/layout.tsx` Server Component.
 * Returns the OrgContext on success; calls Next.js notFound() (HTTP 404)
 * on non-admin role per D-10 "advertise nothing".
 *
 * Defense-in-depth: middleware.ts ALSO enforces this gate via
 * ADMIN_URL_PATTERNS; the layout-level check is the authoritative source.
 *
 * Note: getOrgContext() already wraps `await auth()` in try/catch (SF-M4
 * fold, lib/auth/context.ts:25-32). Do NOT re-wrap here — let auth
 * failures bubble for the framework error boundary to handle.
 */
export async function requireAdmin(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (ctx.role !== 'admin') notFound();
  return ctx;
}
