import { CreditCard, ExternalLink } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/require-admin";
import { withOrgScope, type OrgScope } from "@/lib/db/scoped";
import { organizations } from "@/lib/db/schema";
import type { PlanTier } from "@/lib/stripe/products";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  createCheckoutSessionAction,
  createPortalSessionAction,
} from "./actions";

type BillingSettingsState = {
  planTier: string;
  stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type SettingsSearchParams = {
  billing?: string;
  tier?: string;
  interval?: string;
};

type CheckoutInterval = "monthly" | "annual";

const PLAN_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  business: "Business",
};

const INTERVAL_LABELS: Record<CheckoutInterval, string> = {
  monthly: "monthly",
  annual: "annual",
};

function parsePlanTier(value: string | undefined): PlanTier | undefined {
  return value === "starter" || value === "growth" || value === "business"
    ? value
    : undefined;
}

function parseInterval(value: string | undefined): CheckoutInterval | undefined {
  return value === "monthly" || value === "annual" ? value : undefined;
}

function planLabel(value: string): string {
  const tier = parsePlanTier(value);
  return tier ? PLAN_LABELS[tier] : "Starter";
}

function formatSubscriptionStatus(status: string | null): string {
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function statusVariant(
  stripeSubscriptionId: string | null,
  stripeSubscriptionStatus: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (stripeSubscriptionId == null) return "outline";
  if (stripeSubscriptionStatus === "active" || stripeSubscriptionStatus === "trialing") {
    return "default";
  }
  if (stripeSubscriptionStatus === "past_due") return "destructive";
  return "secondary";
}

function noticeForBillingParam(value: string | undefined): string | null {
  switch (value) {
    case "success":
      return "Checkout completed. Billing state updates after Stripe webhook confirmation.";
    case "canceled":
      return "Checkout canceled. Your current billing state is unchanged.";
    case "setup":
      return "Start checkout before opening billing management.";
    case "manage":
      return "Use Manage billing to update payment details or subscription settings.";
    default:
      return null;
  }
}

async function readBillingSettings(scope: OrgScope): Promise<BillingSettingsState> {
  const rows = await scope.tx
    .select({
      planTier: organizations.planTier,
      stripeSubscriptionStatus: organizations.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: organizations.stripeCurrentPeriodEnd,
      stripeCancelAtPeriodEnd: organizations.stripeCancelAtPeriodEnd,
      stripeCustomerId: organizations.stripeCustomerId,
      stripeSubscriptionId: organizations.stripeSubscriptionId,
    })
    .from(organizations)
    .where(eq(organizations.id, scope.orgId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Billing organization row not found.");
  }
  return row;
}

async function startCheckoutSessionAction(formData: FormData): Promise<void> {
  "use server";
  await createCheckoutSessionAction(undefined, formData);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>;
}) {
  const sp = await searchParams;
  const ctx = await requireAdmin();
  const billing = await withOrgScope(ctx, readBillingSettings);

  const stripeSubscriptionId = billing.stripeSubscriptionId;
  const stripeSubscriptionStatus = billing.stripeSubscriptionStatus;
  const displayStatus =
    stripeSubscriptionId == null
      ? "No active subscription"
      : formatSubscriptionStatus(stripeSubscriptionStatus);
  const notice = noticeForBillingParam(sp.billing);
  const checkoutTier = parsePlanTier(sp.tier) ?? "growth";
  const checkoutInterval = parseInterval(sp.interval) ?? "monthly";

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Billing status for your current organization.
        </p>
      </header>

      {notice ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {notice}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Billing</CardTitle>
              <CardDescription>
                Manage subscription details through Stripe-hosted billing.
              </CardDescription>
            </div>
            <Badge
              variant={statusVariant(stripeSubscriptionId, stripeSubscriptionStatus)}
              className="self-start"
            >
              {displayStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Current plan
              </dt>
              <dd className="mt-1 text-base font-medium">
                {planLabel(billing.planTier)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Subscription status
              </dt>
              <dd className="mt-1 text-base font-medium">{displayStatus}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Current period end
              </dt>
              <dd className="mt-1 text-base font-medium">
                {formatDate(billing.stripeCurrentPeriodEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted-foreground">
                Renewal
              </dt>
              <dd className="mt-1 text-base font-medium">
                {billing.stripeCancelAtPeriodEnd
                  ? "Cancels at period end"
                  : "Renews automatically"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {billing.stripeCustomerId ? (
              <form action={createPortalSessionAction}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "default" })}
                >
                  <CreditCard className="size-4" aria-hidden="true" />
                  Manage billing
                </button>
              </form>
            ) : (
              <form action={startCheckoutSessionAction}>
                <input type="hidden" name="tier" value={checkoutTier} />
                <input type="hidden" name="interval" value={checkoutInterval} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "default" })}
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Start checkout
                </button>
              </form>
            )}
            {!billing.stripeCustomerId ? (
              <p className="text-sm text-muted-foreground sm:self-center">
                {planLabel(checkoutTier)} {INTERVAL_LABELS[checkoutInterval]}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
