import type { ReactElement, ReactNode } from "react";

// post-sign-in/page.tsx reads Clerk's auth() → headers(), so it's inherently
// dynamic. Sign-in/sign-up pages also pass Clerk hooks. Mirror the
// app/(admin)/layout.tsx fix — propagates to every page under (auth)/.
export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      {children}
    </div>
  );
}
