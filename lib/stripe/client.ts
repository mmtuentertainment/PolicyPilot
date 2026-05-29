import 'server-only';
import Stripe from 'stripe';
import { StripeConfigError } from './errors';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new StripeConfigError('STRIPE_SECRET_KEY');
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}
