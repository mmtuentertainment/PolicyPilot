import 'server-only';
import type Stripe from 'stripe';
import { priceIdToTier } from './catalog';
import type { PlanTier } from './products';

type StripeObjectRef = string | { id?: string | null } | null | undefined;

type SubscriptionStatus = Stripe.Subscription.Status;

interface SubscriptionItemWithPeriodEnd extends Stripe.SubscriptionItem {
  current_period_end: number;
}

interface NormalizedSubscriptionBase {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionStatus: SubscriptionStatus;
  stripePriceId: string;
  stripeSubscriptionItemId: string;
  stripeCurrentPeriodEnd: Date | null;
  stripeCancelAtPeriodEnd: boolean;
  stripeLastEventCreated: Date;
  metadataOrgId: string | null;
}

export type NormalizedSubscription =
  | (NormalizedSubscriptionBase & {
      kind: 'entitled';
      planTier: PlanTier;
    })
  | (NormalizedSubscriptionBase & {
      kind: 'preserve-tier';
    })
  | (NormalizedSubscriptionBase & {
      kind: 'downgrade';
      planTier: 'starter';
    })
  | (NormalizedSubscriptionBase & {
      kind: 'link-only';
    });

function getObjectId(ref: StripeObjectRef): string | null {
  if (typeof ref === 'string') {
    return ref.trim() || null;
  }

  return ref?.id?.trim() || null;
}

function getMetadataOrgId(metadata: Stripe.Metadata | null | undefined): string | null {
  return metadata?.policyPilotOrgId?.trim() || null;
}

function getSingleRecurringItem(
  subscription: Stripe.Subscription,
): SubscriptionItemWithPeriodEnd | null {
  const items = subscription.items?.data ?? [];
  if (items.length !== 1) {
    return null;
  }

  const item = items[0] as SubscriptionItemWithPeriodEnd | undefined;
  if (!item?.price?.id || !item.price.recurring) {
    return null;
  }

  return item;
}

export function normalizeSubscription(
  subscription: Stripe.Subscription,
  eventCreatedAtUnix: number,
): NormalizedSubscription | null {
  const customerId = getObjectId(subscription.customer);
  if (!customerId) {
    return null;
  }

  const item = getSingleRecurringItem(subscription);
  if (!item) {
    return null;
  }

  const tier = priceIdToTier(item.price.id);
  if (!tier) {
    return null;
  }

  const base: NormalizedSubscriptionBase = {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status,
    stripePriceId: item.price.id,
    stripeSubscriptionItemId: item.id,
    stripeCurrentPeriodEnd: new Date(item.current_period_end * 1000),
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeLastEventCreated: new Date(eventCreatedAtUnix * 1000),
    metadataOrgId: getMetadataOrgId(subscription.metadata),
  };

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return { ...base, kind: 'entitled', planTier: tier };
    case 'past_due':
      return { ...base, kind: 'preserve-tier' };
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
    case 'unpaid':
      return { ...base, kind: 'downgrade', planTier: 'starter' };
    case 'incomplete':
      return { ...base, kind: 'link-only' };
    default:
      return null;
  }
}
