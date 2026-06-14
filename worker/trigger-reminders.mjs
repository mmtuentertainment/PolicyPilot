const secret = process.env.CRON_SECRET?.trim();
const baseUrlRaw = (
  process.env.NEXT_PUBLIC_APP_URL
  ?? process.env.VERCEL_URL
  ?? ''
).trim();

if (!secret || !baseUrlRaw) {
  console.error('[trigger-reminders] CRON_SECRET or BASE_URL not set');
  process.exit(1);
}

const baseUrl = baseUrlRaw.startsWith('http')
  ? baseUrlRaw.replace(/\/$/, '')
  : `https://${baseUrlRaw.replace(/\/$/, '')}`;
const url = `${baseUrl}/api/cron/reminders`;

try {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });
  const body = await response.text();
  console.log('[trigger-reminders] completed', {
    status: response.status,
    ok: response.ok,
    body,
  });
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error('[trigger-reminders] failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
