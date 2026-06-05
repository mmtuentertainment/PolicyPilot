// app/(reviewer)/layout.tsx — Phase 9 (R-017 / D-09-01) reviewer shell.
//
// Mirrors app/(employee)/layout.tsx: a minimal force-dynamic shell with a
// page-level fail-closed gate. requireReviewerOrAdmin() calls notFound()
// (HTTP 404 "advertise nothing" per D-10) for non-(reviewer|admin) roles.
//
// Middleware (ADR-009) enforces the auth chokepoint for /reviewer the same way
// it does for /my-policies — auth required, NO role check at the edge (only
// the ADMIN_URL_PATTERNS get an edge role gate). This layout is the
// authoritative role gate for the reviewer surface.
//
// `dynamic = "force-dynamic"` is non-negotiable: getOrgContext() reads
// headers() inherently (see app/(admin)/layout.tsx:11-17 for the Vercel
// prerender lesson).
import type { ReactNode } from 'react';
import { UserButton } from '@clerk/nextjs';
import { requireReviewerOrAdmin } from '@/lib/auth/require-reviewer';

export const dynamic = 'force-dynamic';

export default async function ReviewerLayout({
  children,
}: {
  children: ReactNode;
}): Promise<React.JSX.Element> {
  await requireReviewerOrAdmin();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between p-4">
          <span className="font-semibold">Review</span>
          <UserButton />
        </div>
      </header>
      <main className="container mx-auto p-6">{children}</main>
    </div>
  );
}
