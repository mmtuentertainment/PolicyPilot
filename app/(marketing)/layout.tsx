import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            PolicyPilot
          </Link>
          <nav className="flex items-center gap-6 text-sm text-zinc-600">
            <Link href="/pricing" className="hover:text-zinc-900">
              Pricing
            </Link>
            <Link href="/sign-in" className="hover:text-zinc-900">
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 text-sm text-zinc-500">
        <div className="container mx-auto px-6">
          © 2026 MMTU Entertainment LLC · PolicyPilot
        </div>
      </footer>
    </div>
  );
}
