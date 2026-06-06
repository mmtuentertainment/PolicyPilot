import 'server-only';

export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith('http')
      ? vercelUrl
      : `https://${vercelUrl}`;
    return withProtocol.replace(/\/$/, '');
  }

  return 'http://localhost:3000';
}

export function acknowledgeUrl(policyId: string): string {
  return `${appBaseUrl()}/my-policies/${policyId}`;
}

export function reviewUrl(policyId: string): string {
  return `${appBaseUrl()}/policies/${policyId}`;
}
