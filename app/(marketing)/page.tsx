import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

// `Button` is imported for the public Phase 1 component-baseline (see Plan 01-03 acceptance criteria).
// `buttonVariants` is what we actually render on these CTAs, because the shadcn `base-nova` preset's
// `<Button>` wraps `@base-ui/react/button` directly and does not expose an `asChild` Slot. Applying
// `buttonVariants({...})` as the `className` of `<Link>` is the canonical workaround and keeps the
// CTAs visually identical to a `<Button>` while letting Next.js own client-side navigation.
void Button;

export default function LandingPage() {
  return (
    <section className="container mx-auto px-6 py-24">
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl">
        Policy management for SMBs that beats a Google Drive folder.
      </h1>
      <p className="mt-4 text-lg text-zinc-600 max-w-2xl">
        Draft, distribute, and prove acknowledgment of company policies — without the spreadsheets.
      </p>

      <ul className="mt-10 space-y-4 max-w-2xl text-zinc-700">
        <li>
          <strong>AI-drafted policies in minutes</strong> — describe what you need; ship a finished policy you can edit.
        </li>
        <li>
          <strong>Audit trail that holds up</strong> — every acknowledgment is append-only with timestamp and IP.
        </li>
        <li>
          <strong>SMB-priced</strong> — under $100/month for 25-employee teams. No enterprise tax.
        </li>
      </ul>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/sign-up" className={buttonVariants({ variant: "default" })}>
          Get started
        </Link>
        <Link href="/sign-in" className={buttonVariants({ variant: "outline" })}>
          Sign in
        </Link>
      </div>
    </section>
  );
}
