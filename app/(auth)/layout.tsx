import type { ReactElement, ReactNode } from "react";

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
