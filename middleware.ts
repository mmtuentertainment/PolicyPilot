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

const isAdminRoute = createRouteMatcher([
  "/(admin)/(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Webhook + cron routes bypass Clerk; both verify their own credentials
  // in-route (signature for webhooks, CRON_SECRET header for cron).
  if (isWebhookRoute(req)) {
    return NextResponse.next();
  }
  if (isCronRoute(req)) {
    return NextResponse.next();
  }

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  if (isAdminRoute(req)) {
    let sessionClaims;
    try {
      // SF-M4 fold (Phase 2): wrap auth() in try/catch — fail-closed
      // (return 404 to keep the admin gate's "advertise nothing" behavior
      // from D-10 — surfacing 401/redirect would confirm the route exists).
      // Mirrors the SF-M4 fold already applied in lib/auth/context.ts
      // (Plan 02-01 Task 2) so both auth() call sites share one shape.
      const session = await auth();
      sessionClaims = session.sessionClaims;
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[middleware] auth() failed in admin gate: ${detail}`);
      // D-10: 404, not 401 — don't advertise the route exists.
      return new NextResponse(null, { status: 404 });
    }
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
    return NextResponse.next();
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

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run on everything except static files and Next.js internals.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // Always run on API routes (so the webhook/cron branches above can act).
    "/(api|trpc)(.*)",
  ],
};
