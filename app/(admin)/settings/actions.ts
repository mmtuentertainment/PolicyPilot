'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getOrgContext } from '@/lib/auth/context';
import { requireAdminFromCtx } from '@/lib/auth/require-admin';
import { withOrgScope, type OrgScope } from '@/lib/db/scoped';
import { organizations } from '@/lib/db/schema';
import { tierAndIntervalToPriceId } from '@/lib/stripe/catalog';
import { getStripeClient } from '@/lib/stripe/client';

const CheckoutIntentSchema = z.object({
  tier: z.enum(['starter', 'growth', 'business']),
  interval: z.enum(['monthly', 'annual']),
});

type BillingOrgState = {
  stripeCustomerId: string | null;
  stripeSubscriptionStatus: string | null;
};

const DUPLICATE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return 'http://localhost:3000';
}

async function readBillingOrgState(scope: OrgScope): Promise<BillingOrgState> {
  const rows = await scope.tx
    .select({
      stripeCustomerId: organizations.stripeCustomerId,
      stripeSubscriptionStatus: organizations.stripeSubscriptionStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, scope.orgId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error('Billing organization row not found.');
  }
  return row;
}

export async function createPortalSessionAction(_formData?: FormData): Promise<void> {
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  const org = await withOrgScope(ctx, readBillingOrgState);
  if (!org.stripeCustomerId) {
    redirect('/settings?billing=setup');
  }

  const appUrl = getAppUrl();
  const stripe = getStripeClient();
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${appUrl}/settings`,
  });

  if (!portalSession.url) {
    throw new Error('Stripe Customer Portal Session did not return a URL.');
  }

  redirect(portalSession.url);
}

export type CreateCheckoutSessionState = { ok: false; error: string } | undefined;

export async function createCheckoutSessionAction(
  _prev: CreateCheckoutSessionState,
  formData: FormData,
): Promise<CreateCheckoutSessionState> {
  const ctx = await getOrgContext();
  requireAdminFromCtx(ctx);

  const parsed = CheckoutIntentSchema.safeParse({
    tier: formData.get('tier'),
    interval: formData.get('interval'),
  });
  if (!parsed.success) {
    throw new Error('Invalid checkout intent.');
  }

  const priceId = tierAndIntervalToPriceId(parsed.data.tier, parsed.data.interval);
  if (!priceId) {
    throw new Error('Invalid checkout intent.');
  }

  const org = await withOrgScope(ctx, readBillingOrgState);
  // Only treat the org as already-subscribed when a real Stripe customer
  // exists. New orgs carry the canonical seed status 'trialing' (written by the
  // Clerk organization.created webhook, app/api/webhooks/clerk/route.ts) with no
  // customer yet — that placeholder must NOT block the first checkout. This
  // mirrors the settings page's stripeCustomerId gate (page.tsx) so the
  // "Start checkout" button and this action stay consistent.
  if (
    org.stripeCustomerId &&
    org.stripeSubscriptionStatus &&
    DUPLICATE_SUBSCRIPTION_STATUSES.has(org.stripeSubscriptionStatus)
  ) {
    redirect('/settings?billing=manage');
  }

  const appUrl = getAppUrl();
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: ctx.orgId,
    metadata: { policyPilotOrgId: ctx.orgId },
    subscription_data: { metadata: { policyPilotOrgId: ctx.orgId } },
    ...(org.stripeCustomerId ? { customer: org.stripeCustomerId } : {}),
    success_url: `${appUrl}/settings?billing=success`,
    cancel_url: `${appUrl}/settings?billing=canceled`,
  });

  if (!session.url) {
    throw new Error('Stripe Checkout Session did not return a URL.');
  }

  redirect(session.url);
}
