// Single auth chokepoint per ADR-009 / D-10. See .coderabbit.yaml
// `middleware.ts` path_instructions for the full set of invariants.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Split each Clerk catch-all into exact + slash-prefixed children patterns.
// The greedy `(.*)` form (`/sign-in(.*)`) matches sibling paths that start with
// the same prefix — e.g. `/sign-in-success` (a private post-auth placeholder)
// gets matched by `/sign-in(.*)` and let through unauthenticated. The slash
// boundary stops that while still covering Clerk's nested factor routes
// (`/sign-in/factor-one`, `/sign-in/sso-callback`, etc.) via the
// `[[...sign-in]]` catch-all in `app/(auth)/sign-in/`.
const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/sign-in",
  "/sign-in/(.*)",
  "/sign-up",
  "/sign-up/(.*)",
]);

const isWebhookRoute = createRouteMatcher([
  "/api/webhooks/stripe",
  "/api/webhooks/clerk",
]);

const isCronRoute = createRouteMatcher([
  "/api/cron/(.*)",
]);

// L-02 / CR-02 closure (Plan 03-02 Task 2) — replaces the dead Phase 1+2
// route-group catch-all (the regex over the (admin) route group that
// never appears in URLs). ADMIN_URL_PATTERNS matches the real URLs admin
// pages live at (D-01). /onboarding is gated as "admin URL" so signed-in
// but orgless users hit the chokepoint (D-08), but
// ADMIN_ROLE_REQUIRED_PATTERNS (next) excludes /onboarding from the
// role-check 404 branch — those users are mid-onboarding without a role yet.
const ADMIN_URL_PATTERNS: RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/policies(\/|$)/,
  /^\/onboarding(\/|$)/,
];
function isAdminRoute(pathname: string): boolean {
  return ADMIN_URL_PATTERNS.some((p) => p.test(pathname));
}

// Subset of ADMIN_URL_PATTERNS that requires `publicMetadata.role ==='admin'`.
// /onboarding is auth-required but role-unrequired — the user is signing in
// for the first time and the org/role mapping has not been created yet
// (D-08 dispatches them via <CreateOrganization />). Splitting the gate this
// way keeps the chokepoint behavior consistent with D-10 ("advertise nothing"
// for true admin routes) while letting the onboarding trampoline land.
const ADMIN_ROLE_REQUIRED_PATTERNS: RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/policies(\/|$)/,
];
function requiresAdminRole(pathname: string): boolean {
  return ADMIN_ROLE_REQUIRED_PATTERNS.some((p) => p.test(pathname));
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // x-pathname injection (RESEARCH Pattern 7 / D-06) — every downstream
  // NextResponse.next() carries the original request pathname so Server
  // Components (e.g., AdminSidebar in Plan 03-09) can read it via
  // headers().get('x-pathname'). Next.js 15 dropped server-side
  // usePathname; this is the documented replacement.
  //
  // T-03-02-04 mitigation: we OVERWRITE x-pathname from req.nextUrl,
  // clobbering any client-supplied x-pathname header. Server Components
  // never see attacker-controlled values.
  const pathname = req.nextUrl.pathname;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  // Webhook + cron routes bypass Clerk; both verify their own credentials
  // in-route (signature for webhooks, CRON_SECRET header for cron).
  if (isWebhookRoute(req)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (isCronRoute(req)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isPublicRoute(req)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isAdminRoute(pathname)) {
    let sessionClaims;
    let userId: string | null;
    try {
      // SF-M4 fold (Phase 2): wrap auth() in try/catch — fail-closed
      // (return 404 to keep the admin gate's "advertise nothing" behavior
      // from D-10 — surfacing 401/redirect would confirm the route exists).
      // Mirrors the SF-M4 fold already applied in lib/auth/context.ts
      // (Plan 02-01 Task 2) so both auth() call sites share one shape.
      const session = await auth();
      sessionClaims = session.sessionClaims;
      userId = session.userId;
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[middleware] auth() failed in admin gate: ${detail}`);
      // D-10: 404, not 401 — don't advertise the route exists.
      return new NextResponse(null, { status: 404 });
    }

    // Unauthenticated user hitting an admin URL — for /onboarding (auth-only
    // but role-unrequired) redirect to /sign-in like the generic branch
    // below; for true admin routes, 404 per D-10. Both branches treat
    // sign-in as the recovery surface.
    if (!userId) {
      if (requiresAdminRole(pathname)) {
        // D-10: don't advertise that /dashboard or /policies exist to
        // unauthenticated callers — 404, not redirect.
        return new NextResponse(null, { status: 404 });
      }
      // /onboarding: ordinary auth-required redirect.
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set(
        "redirect_url",
        req.nextUrl.pathname + req.nextUrl.search,
      );
      return NextResponse.redirect(signInUrl);
    }

    if (requiresAdminRole(pathname)) {
      // HI-01 (Plan 02-07): narrow via `{ role?: unknown }` + typeof guard so
      // this site matches the stricter contract in lib/auth/context.ts:42.
      // A future Clerk session-token template that emits role as something
      // other than a string (numeric tier code, structured object) collapses
      // to undefined here instead of widening to `string` and lying to the
      // admin-gate comparison below. asRole() in context.ts remains the
      // single source of truth for the full enum check — middleware only
      // needs to detect the literal "admin".
      const pubMeta = sessionClaims?.publicMetadata as { role?: unknown } | undefined;
      const role = typeof pubMeta?.role === "string" ? pubMeta.role : undefined;
      if (role !== "admin") {
        // D-10: 404 instead of 403 — surfacing 403 would advertise that the
        // route exists.
        return new NextResponse(null, { status: 404 });
      }
    }
    // /onboarding: authenticated; role check intentionally skipped (D-08).
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let userId: string | null;
  try {
    // SF-M4 fold (Phase 2): wrap auth() in try/catch — fail-closed
    // (redirect to /sign-in, same as the unauthenticated branch — the
    // user gets a sign-in prompt and the failure is recoverable).
    // Mirrors the SF-M4 fold in lib/auth/context.ts (Plan 02-01).
    const session = await auth();
    userId = session.userId;
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[middleware] auth() failed at chokepoint: ${detail}`);
    // Fail-closed: redirect to sign-in. The user is unauthenticated
    // in practice (auth() failed); treating them as such is correct.
    // No redirect_url here — the request URL may itself be the cause
    // of the auth failure (e.g., malformed cookie + nextUrl); a redirect
    // loop is worse than landing the user on a clean /sign-in.
    const signInUrl = new URL("/sign-in", req.url);
    return NextResponse.redirect(signInUrl);
  }
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    // WR-01: pass only path+query — never the full URL. `req.url` would leak
    // any attacker-controlled Host header into the redirect target; restricting
    // to pathname+search keeps the redirect strictly same-origin by construction.
    // Clerk v7 already enforces same-origin on its side, but tightening this
    // here removes the Host-header trust dependency permanently.
    signInUrl.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: [
    // Run on everything except static files and Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // Always run on API routes (so the webhook/cron branches above can act).
    "/(api|trpc)(.*)",
  ],
};
