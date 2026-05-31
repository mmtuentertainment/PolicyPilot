import 'server-only';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { organizations, stripeEvents } from '@/lib/db/schema';
import { getStripeClient } from '@/lib/stripe/client';
import { maskCustomerId, maskSubscriptionId } from '@/lib/stripe/mask';
import {
  normalizeSubscription,
  type NormalizedSubscription,
} from '@/lib/stripe/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET_ENV = 'STRIPE_WEBHOOK_SECRET';
const SIGNATURE_HEADER = 'stripe-signature';

const HANDLED_EVENT_TYPES = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
  'customer.subscription.updated',
] as const;

type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];
type StripeObjectRef = string | { id?: string | null } | null | undefined;
type OrgBillingUpdate = Partial<typeof organizations.$inferInsert>;

interface OrgMatchRow {
  id: string;
  planTier: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

interface OrgResolutionCandidates {
  eventType: string;
  orgIds: readonly string[];
  customerId: string | null;
  subscriptionId: string | null;
}

interface ProcessedResult {
  status: 'processed' | 'duplicate';
}

interface RouteResult {
  status: number;
  body: {
    received: boolean;
    status: string;
  };
}

interface InvoiceWithSubscription extends Stripe.Invoice {
  subscription?: StripeObjectRef;
}

function response(result: RouteResult): NextResponse {
  return NextResponse.json(result.body, { status: result.status });
}

function ok(status: string): RouteResult {
  return { status: 200, body: { received: true, status } };
}

function retry(status: string): RouteResult {
  return { status: 500, body: { received: false, status } };
}

function badRequest(status: string): RouteResult {
  return { status: 400, body: { received: false, status } };
}

function isHandledEventType(type: string): type is HandledEventType {
  return HANDLED_EVENT_TYPES.some((eventType) => eventType === type);
}

function getObjectId(ref: StripeObjectRef): string | null {
  if (typeof ref === 'string') {
    return ref.trim() || null;
  }

  return ref?.id?.trim() || null;
}

function getMetadataOrgId(metadata: Stripe.Metadata | null | undefined): string | null {
  return metadata?.policyPilotOrgId?.trim() || null;
}

function getInvoiceSubscriptionId(invoice: InvoiceWithSubscription): string | null {
  return getObjectId(invoice.subscription)
    ?? getObjectId(invoice.parent?.subscription_details?.subscription);
}

function getInvoiceOrgHint(invoice: Stripe.Invoice): string | null {
  return getMetadataOrgId(invoice.parent?.subscription_details?.metadata)
    ?? getMetadataOrgId(invoice.metadata);
}

function getOrgHints(...values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  );
}

function logNoop(reason: string, candidates: OrgResolutionCandidates): void {
  console.warn('[stripe-webhook] no-op', {
    reason,
    eventType: candidates.eventType,
    customerId: maskCustomerId(candidates.customerId),
    subscriptionId: maskSubscriptionId(candidates.subscriptionId),
    orgHintCount: candidates.orgIds.length,
  });
}

function logFailure(reason: string): void {
  console.error('[stripe-webhook] failed', { reason });
}

function buildOrgWhere(filters: SQL[]): SQL | null {
  if (filters.length === 0) {
    return null;
  }

  if (filters.length === 1) {
    return filters[0] ?? null;
  }

  return or(...filters) ?? null;
}

async function resolveOrg(candidates: OrgResolutionCandidates): Promise<OrgMatchRow | null> {
  const filters: SQL[] = [];

  for (const orgId of candidates.orgIds) {
    filters.push(eq(organizations.id, orgId));
  }

  if (candidates.customerId) {
    filters.push(eq(organizations.stripeCustomerId, candidates.customerId));
  }

  if (candidates.subscriptionId) {
    filters.push(eq(organizations.stripeSubscriptionId, candidates.subscriptionId));
  }

  const where = buildOrgWhere(filters);
  if (!where) {
    logNoop('missing_mapping_identifiers', candidates);
    return null;
  }

  const rows = await db
    .select({
      id: organizations.id,
      planTier: organizations.planTier,
      stripeCustomerId: organizations.stripeCustomerId,
      stripeSubscriptionId: organizations.stripeSubscriptionId,
    })
    .from(organizations)
    .where(where)
    .limit(2);

  if (rows.length !== 1) {
    logNoop('org_match_count_not_one', candidates);
    return null;
  }

  const row = rows[0];
  if (!row) {
    logNoop('org_match_missing', candidates);
    return null;
  }

  if (candidates.orgIds.length > 0 && !candidates.orgIds.includes(row.id)) {
    logNoop('org_hint_mismatch', candidates);
    return null;
  }

  if (
    row.stripeCustomerId &&
    candidates.customerId &&
    row.stripeCustomerId !== candidates.customerId
  ) {
    logNoop('customer_id_mismatch', candidates);
    return null;
  }

  if (
    row.stripeSubscriptionId &&
    candidates.subscriptionId &&
    row.stripeSubscriptionId !== candidates.subscriptionId
  ) {
    logNoop('subscription_id_mismatch', candidates);
    return null;
  }

  return row;
}

function normalizedUpdate(normalized: NormalizedSubscription): OrgBillingUpdate {
  const update: OrgBillingUpdate = {
    stripeCustomerId: normalized.stripeCustomerId,
    stripeSubscriptionId: normalized.stripeSubscriptionId,
    stripeSubscriptionStatus: normalized.stripeSubscriptionStatus,
    stripePriceId: normalized.stripePriceId,
    stripeSubscriptionItemId: normalized.stripeSubscriptionItemId,
    stripeCurrentPeriodEnd: normalized.stripeCurrentPeriodEnd,
    stripeCancelAtPeriodEnd: normalized.stripeCancelAtPeriodEnd,
    stripeLastEventCreated: normalized.stripeLastEventCreated,
  };

  if (normalized.kind === 'entitled' || normalized.kind === 'downgrade') {
    update.planTier = normalized.planTier;
  }

  return update;
}

async function commitProcessedEvent(
  eventId: string,
  orgId: string | null,
  update: OrgBillingUpdate | null,
): Promise<ProcessedResult> {
  return await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: eventId })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });

    if (inserted.length === 0) {
      return { status: 'duplicate' };
    }

    if (orgId && update) {
      const updated = await tx
        .update(organizations)
        .set(update)
        .where(eq(organizations.id, orgId))
        .returning({ id: organizations.id });

      if (updated.length !== 1) {
        throw new StripeWebhookMutationError('org_update_failed');
      }
    }

    return { status: 'processed' };
  });
}

class StripeWebhookMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookMutationError';
  }
}

async function commitNoop(eventId: string): Promise<RouteResult> {
  const result = await commitProcessedEvent(eventId, null, null);
  return ok(result.status === 'duplicate' ? 'duplicate' : 'noop');
}

async function commitOrgUpdate(
  eventId: string,
  orgId: string,
  update: OrgBillingUpdate,
): Promise<RouteResult> {
  const result = await commitProcessedEvent(eventId, orgId, update);
  return ok(result.status);
}

async function processNormalizedSubscription(
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  orgHints: readonly string[],
): Promise<RouteResult> {
  const normalized = normalizeSubscription(subscription, event.created);
  const candidates: OrgResolutionCandidates = {
    eventType: event.type,
    orgIds: getOrgHints(...orgHints, normalized?.metadataOrgId),
    customerId: normalized?.stripeCustomerId ?? getObjectId(subscription.customer),
    subscriptionId: subscription.id,
  };

  if (!normalized) {
    logNoop('subscription_normalization_failed', candidates);
    return await commitNoop(event.id);
  }

  const org = await resolveOrg(candidates);
  if (!org) {
    return await commitNoop(event.id);
  }

  return await commitOrgUpdate(event.id, org.id, normalizedUpdate(normalized));
}

async function retrieveSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    logFailure('canonical_subscription_retrieve_failed');
    return null;
  }
}

async function handleCheckoutCompleted(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<RouteResult> {
  const session = event.data.object as Stripe.Checkout.Session;
  const subscriptionId = getObjectId(session.subscription);
  if (!subscriptionId) {
    logNoop('missing_subscription_id', {
      eventType: event.type,
      orgIds: getOrgHints(session.client_reference_id, getMetadataOrgId(session.metadata)),
      customerId: getObjectId(session.customer),
      subscriptionId: null,
    });
    return await commitNoop(event.id);
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId);
  if (!subscription) {
    return retry('canonical_subscription_retrieve_failed');
  }

  return await processNormalizedSubscription(
    event,
    subscription,
    getOrgHints(session.client_reference_id, getMetadataOrgId(session.metadata)),
  );
}

async function handleInvoicePaid(stripe: Stripe, event: Stripe.Event): Promise<RouteResult> {
  const invoice = event.data.object as InvoiceWithSubscription;
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    logNoop('missing_subscription_id', {
      eventType: event.type,
      orgIds: getOrgHints(getInvoiceOrgHint(invoice)),
      customerId: getObjectId(invoice.customer),
      subscriptionId: null,
    });
    return await commitNoop(event.id);
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId);
  if (!subscription) {
    return retry('canonical_subscription_retrieve_failed');
  }

  return await processNormalizedSubscription(
    event,
    subscription,
    getOrgHints(getInvoiceOrgHint(invoice)),
  );
}

async function handlePaymentFailed(event: Stripe.Event): Promise<RouteResult> {
  const invoice = event.data.object as InvoiceWithSubscription;
  const candidates: OrgResolutionCandidates = {
    eventType: event.type,
    orgIds: getOrgHints(getInvoiceOrgHint(invoice)),
    customerId: getObjectId(invoice.customer),
    subscriptionId: getInvoiceSubscriptionId(invoice),
  };
  const org = await resolveOrg(candidates);
  if (!org) {
    return await commitNoop(event.id);
  }

  return await commitOrgUpdate(event.id, org.id, {
    stripeSubscriptionStatus: 'past_due',
    stripeLastEventCreated: new Date(event.created * 1000),
  });
}

async function handleSubscriptionDeleted(event: Stripe.Event): Promise<RouteResult> {
  const subscription = event.data.object as Stripe.Subscription;
  const candidates: OrgResolutionCandidates = {
    eventType: event.type,
    orgIds: getOrgHints(getMetadataOrgId(subscription.metadata)),
    customerId: getObjectId(subscription.customer),
    subscriptionId: subscription.id,
  };
  const org = await resolveOrg(candidates);
  if (!org) {
    return await commitNoop(event.id);
  }

  return await commitOrgUpdate(event.id, org.id, {
    planTier: 'starter',
    stripeCustomerId: getObjectId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: 'canceled',
    stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
    stripeLastEventCreated: new Date(event.created * 1000),
  });
}

async function handleSubscriptionUpdated(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<RouteResult> {
  const eventSubscription = event.data.object as Stripe.Subscription;
  const subscription = await retrieveSubscription(stripe, eventSubscription.id);
  if (!subscription) {
    return retry('canonical_subscription_retrieve_failed');
  }

  return await processNormalizedSubscription(
    event,
    subscription,
    getOrgHints(getMetadataOrgId(eventSubscription.metadata)),
  );
}

async function dispatchEvent(stripe: Stripe, event: Stripe.Event): Promise<RouteResult> {
  if (!isHandledEventType(event.type)) {
    return ok('unhandled');
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return await handleCheckoutCompleted(stripe, event);
    case 'invoice.paid':
      return await handleInvoicePaid(stripe, event);
    case 'invoice.payment_failed':
      return await handlePaymentFailed(event);
    case 'customer.subscription.deleted':
      return await handleSubscriptionDeleted(event);
    case 'customer.subscription.updated':
      return await handleSubscriptionUpdated(stripe, event);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env[WEBHOOK_SECRET_ENV]?.trim();
  if (!webhookSecret) {
    logFailure('webhook_secret_missing');
    return response({ status: 500, body: { received: false, status: 'webhook_secret_missing' } });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!signature) {
    logFailure('signature_missing');
    return response(badRequest('signature_missing'));
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    logFailure('signature_invalid');
    return response(badRequest('signature_invalid'));
  }

  try {
    return response(await dispatchEvent(stripe, event));
  } catch {
    logFailure('processing_failed');
    return response(retry('processing_failed'));
  }
}
