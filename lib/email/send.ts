import 'server-only';
import { createElement, type ReactElement } from 'react';
import { getResendClient } from './client';
import { ResendSendError } from './errors';
import { AckReminderEmail } from './templates/ack-reminder';
import { PolicyAssignedEmail } from './templates/policy-assigned';
import { PolicyUpdatedEmail } from './templates/policy-updated';
import { ReviewDueEmail } from './templates/review-due';

export type NotificationType =
  | 'policy_assigned'
  | 'policy_updated'
  | 'review_due'
  | 'ack_reminder';

export type EmailContext = {
  policyTitle: string;
  orgName: string;
  acknowledgeUrl?: string;
  reviewUrl?: string;
};

type DispatchEntry = {
  subject: (ctx: EmailContext) => string;
  react: (ctx: EmailContext) => ReactElement;
};

function requireUrl(value: string | undefined, field: 'acknowledgeUrl' | 'reviewUrl'): string {
  if (!value) throw new Error(`${field} is required for notification email`);
  return value;
}

const DISPATCH_MAP: Record<NotificationType, DispatchEntry> = {
  policy_assigned: {
    subject: (ctx) => `New Policy: ${ctx.policyTitle}`,
    react: (ctx) =>
      createElement(PolicyAssignedEmail, {
        policyTitle: ctx.policyTitle,
        orgName: ctx.orgName,
        acknowledgeUrl: requireUrl(ctx.acknowledgeUrl, 'acknowledgeUrl'),
      }),
  },
  policy_updated: {
    subject: (ctx) => `Policy Updated: ${ctx.policyTitle}`,
    react: (ctx) =>
      createElement(PolicyUpdatedEmail, {
        policyTitle: ctx.policyTitle,
        orgName: ctx.orgName,
        acknowledgeUrl: requireUrl(ctx.acknowledgeUrl, 'acknowledgeUrl'),
      }),
  },
  review_due: {
    subject: (ctx) => `Policy Review Due: ${ctx.policyTitle}`,
    react: (ctx) =>
      createElement(ReviewDueEmail, {
        policyTitle: ctx.policyTitle,
        orgName: ctx.orgName,
        reviewUrl: requireUrl(ctx.reviewUrl, 'reviewUrl'),
      }),
  },
  ack_reminder: {
    subject: (ctx) => `Reminder: Acknowledge "${ctx.policyTitle}"`,
    react: (ctx) =>
      createElement(AckReminderEmail, {
        policyTitle: ctx.policyTitle,
        orgName: ctx.orgName,
        acknowledgeUrl: requireUrl(ctx.acknowledgeUrl, 'acknowledgeUrl'),
      }),
  },
};

function maskEmail(addr: string): string {
  const [local = '', domain = ''] = addr.split('@');
  const localPrefix = local.slice(0, 1) || '*';
  const localSuffix = local.length > 2 ? local.slice(-1) : '*';
  return `${localPrefix}***${localSuffix}@${domain || 'unknown'}`;
}

export async function sendNotificationEmail(
  type: NotificationType,
  to: string,
  ctx: EmailContext,
): Promise<string | null> {
  const entry = DISPATCH_MAP[type];
  const result = await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL?.trim() || 'noreply@policypilot.com',
    to,
    subject: entry.subject(ctx),
    react: entry.react(ctx),
  });
  if (result.error) {
    throw new ResendSendError(type, maskEmail(to), result.error);
  }
  return result.data?.id ?? null;
}
