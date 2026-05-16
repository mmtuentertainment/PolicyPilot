// Single auth chokepoint per ADR-009 / D-10.
// Public routes: /, /pricing, /sign-in, /sign-up
// Webhook exempt: /api/webhooks/{stripe,clerk} (Phase 2 + Phase 6 wire handlers)
// Cron exempt: /api/cron/* (Phase 7 wires handlers; CRON_SECRET enforced in-route)
// Everything else: requires authentication (redirect to /sign-in)
//
// Note (Phase 1): the /(admin)/(.*) matcher is dead code in Phase 1 — route
// groups (parens) never appear in URLs, and no admin routes exist yet.
// Plan-checker flagged this WARNING; the matcher is wired so the gate is
// already in place. Phase 3 will rewrite this matcher to target the real
// admin route surface (/dashboard, /policies, etc.) once those land.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/sign-in(.*)",
  "/sign-up(.*)",
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
  // 1. Webhook routes — bypass auth entirely. Signature verification happens
  // inside the route handler (Phase 2 for Clerk, Phase 6 for Stripe).
  if (isWebhookRoute(req)) {
    return NextResponse.next();
  }

  // 2. Cron routes — auth via CRON_SECRET header, NOT Clerk session.
  // Phase 7 wires the actual route; in Phase 1 the matcher is exempted
  // so that Phase 7's route lands cleanly without needing to revisit
  // middleware.
  if (isCronRoute(req)) {
    return NextResponse.next();
  }

  // 3. Public routes — landing, pricing, sign-in, sign-up — no auth.
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // 4. Role-gated admin routes (ADR-009). Phase 1 has no /(admin)/* routes
  // yet — these route group folders don't exist. The matcher is wired so
  // that when Phase 3 adds them, the gate is already in place. Until then
  // this branch is unreachable. Note: route groups (parens) do NOT appear
  // in the URL — the matcher uses the conventional /(admin)/(.*) pattern
  // for clarity, but in practice Phase 3 admin routes will be at /dashboard,
  // /policies, etc., not /admin/*. Phase 3 PLAN will adjust this matcher
  // when those routes are actually defined.
  if (isAdminRoute(req)) {
    const { sessionClaims } = await auth();
    const role = (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      // D-10: return 404 in Phase 1 (admin routes don't exist; surfacing
      // a 403 would imply they do). Phase 3 may convert this to a redirect.
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // 5. Default: any other route requires authentication. Redirect to /sign-in.
  const { userId } = await auth();
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
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
