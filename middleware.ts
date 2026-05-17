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
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      // D-10: 404 instead of 403 — surfacing 403 would advertise that the
      // route exists.
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // 5. Default: any other route requires authentication. Redirect to /sign-in.
  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    // WR-01 (01-REVIEW): pass only path+query — never the full URL. `req.url`
    // would leak any attacker-controlled Host header into the redirect target;
    // restricting to pathname+search keeps the redirect strictly same-origin
    // by construction. Clerk v7 already enforces same-origin on its side, but
    // tightening this here removes the Host-header trust dependency permanently
    // before any Phase 3+ consumer reads `redirect_url`.
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
