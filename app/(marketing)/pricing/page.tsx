import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

// Tile CTAs render `buttonVariants({...})` applied to `<Link>` because the
// shadcn `base-nova` preset's `<Button>` does not expose `asChild`.

type BillingInterval = "monthly" | "annual";

type Tier = {
  name: string;
  key: "starter" | "growth" | "business";
  monthlyPriceLabel: string;
  monthlyPrice: number;
  users: string;
  aiDrafts: string;
  tagline: string;
  distinguishingBullet: string;
  highlighted: boolean;
};

const tiers: ReadonlyArray<Tier> = [
  {
    name: "Starter",
    key: "starter",
    monthlyPriceLabel: "$79",
    monthlyPrice: 79,
    users: "25",
    aiDrafts: "50",
    tagline: "For teams just getting policy management under control.",
    distinguishingBullet: "Acknowledgment tracking + audit trail",
    highlighted: false,
  },
  {
    name: "Growth",
    key: "growth",
    monthlyPriceLabel: "$199",
    monthlyPrice: 199,
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
    key: "business",
    monthlyPriceLabel: "$449",
    monthlyPrice: 449,
    users: "500",
    aiDrafts: "Unlimited",
    tagline: "Custom branding, SSO, and outbound API access.",
    distinguishingBullet: "Custom branding + SSO + API access",
    highlighted: false,
  },
];

function parseInterval(raw: string | undefined): BillingInterval {
  return raw === "annual" ? "annual" : "monthly";
}

function priceLabel(tier: Tier, interval: BillingInterval): string {
  if (interval === "monthly") return tier.monthlyPriceLabel;
  const price = interval === "annual"
    ? Math.round(tier.monthlyPrice * 12 * 0.8)
    : tier.monthlyPrice;
  return `$${price}`;
}

function intervalSuffix(interval: BillingInterval): string {
  return interval === "annual" ? "/yr" : "/mo";
}

type PricingSearchParams = { interval?: string };

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<PricingSearchParams>;
}) {
  const sp = await searchParams;
  const interval = parseInterval(sp.interval);
  const oppositeInterval = interval === "annual" ? "monthly" : "annual";

  return (
    <section className="container mx-auto px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">
        Simple, SMB-friendly pricing
      </h1>
      <p className="mt-2 text-zinc-600">
        Pick a plan when you&apos;re ready to deploy. Annual save 20%.
      </p>
      <div className="mt-8 inline-flex rounded-md border bg-background p-1">
        {(["monthly", "annual"] as const).map((option) => (
          <Link
            key={option}
            href={`/pricing?interval=${option}`}
            className={buttonVariants({
              variant: interval === option ? "default" : "ghost",
              size: "sm",
              className: "min-w-24",
            })}
            aria-current={interval === option ? "page" : undefined}
          >
            {option === "monthly" ? "Monthly" : "Annual"}
          </Link>
        ))}
      </div>
      <noscript>
        <p className="mt-3 text-sm text-zinc-600">
          Showing {interval} pricing. Switch to{" "}
          <Link
            href={`/pricing?interval=${oppositeInterval}`}
            className="underline"
          >
            {oppositeInterval}
          </Link>
          .
        </p>
      </noscript>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        {tiers.map((tier) => (
          <Card key={tier.name}>
            <CardHeader>
              <CardTitle>{tier.name}</CardTitle>
              <CardDescription>{tier.tagline}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {priceLabel(tier, interval)}
                <span className="text-base font-normal text-zinc-500">
                  {intervalSuffix(interval)}
                </span>
              </div>
              {interval === "annual" ? (
                <p className="mt-1 text-sm text-zinc-600">
                  Equivalent to ${Math.round(tier.monthlyPrice * 0.8)}/mo billed annually.
                </p>
              ) : null}
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
                href={`/sign-up?tier=${tier.key}&interval=${interval}`}
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
