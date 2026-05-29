import 'server-only';

function maskStripeId(value: string | null | undefined, prefix: 'cus' | 'sub'): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length <= 4) {
    return `${prefix}_***`;
  }

  return `${prefix}_***${normalized.slice(-4)}`;
}

export function maskCustomerId(id: string | null | undefined): string {
  return maskStripeId(id, 'cus');
}

export function maskSubscriptionId(id: string | null | undefined): string {
  return maskStripeId(id, 'sub');
}
