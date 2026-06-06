import 'server-only';
import { Resend } from 'resend';
import { ResendConfigError } from './errors';

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new ResendConfigError('RESEND_API_KEY');
  resendClient = new Resend(apiKey);
  return resendClient;
}
