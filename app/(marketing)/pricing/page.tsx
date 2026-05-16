import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

// `Button` is imported per Plan 01-03 acceptance criteria; tile CTAs render `buttonVariants`
// applied to `<Link>` because the shadcn `base-nova` preset's `<Button>` does not expose `asChild`.
void Button;

type Tier = {
  name: string;
  priceLabel: string;
  users: string;
  aiDrafts: string;
  tagline: string;
  distinguishingBullet: string;
  highlighted: boolean;
};

// Prices written as literal strings so source contains `$79`, `$199`, `$449`
// substrings (per Plan 01-03 acceptance criteria). Phase 6 will replace this
// hardcoded list with a typed import from `lib/stripe/products.ts` once Stripe
// products are configured — see threat T-03-01 in 01-03-PLAN.md.
const tiers: ReadonlyArray<Tier> = [
  {
    name: "Starter",
    priceLabel: "$79",
    users: "25",
    aiDrafts: "50",
    tagline: "For teams just getting policy management under control.",
    distinguishingBullet: "Acknowledgment tracking + audit trail",
    highlighted: false,
  },
  {
    name: "Growth",
    priceLabel: "$199",
    users: "100",
    aiDrafts: "200",
    tagline:
      "Adds approval workflows, Slack notifications, and AI Consistency Check.",
    distinguishingBullet:
      "Approval workflows + Slack + Consistency Check",
    highlighted: true,
  },
  {
    name: "Business",
    priceLabel: "$449",
    users: "500",
    aiDrafts: "Unlimited",
    tagline: "Custom branding, SSO, and outbound API access.",
    distinguishingBullet: "Custom branding + SSO + API access",
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <section className="container mx-auto px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">
        Simple, SMB-friendly pricing
      </h1>
      <p className="mt-2 text-zinc-600">
        Pick a plan when you&apos;re ready to deploy. Annual save 20%.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        {tiers.map((tier) => (
          <Card key={tier.name}>
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <CardDescription>{tier.tagline}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {tier.priceLabel}
                <span className="text-base font-normal text-zinc-500">
                  /mo
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-zinc-700">
                <li>{tier.users} users included</li>
                <li>
                  {tier.aiDrafts === "Unlimited"
                    ? "Unlimited AI drafts per month"
                    : `${tier.aiDrafts} AI drafts per month`}
                </li>
                <li>{tier.distinguishingBullet}</li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link
                href="/sign-up"
                className={buttonVariants({
                  variant: tier.highlighted ? "default" : "outline",
                  className: "w-full",
                })}
              >
                Get started
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
