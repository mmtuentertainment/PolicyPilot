import { db } from '@/lib/db';
import { withOrgScope, type OrgScope } from '@/lib/db/scoped';
import type { OrgContext } from '@/lib/auth/context';
import {
  organizations,
  reminderSends,
} from '@/lib/db/schema';
import { Notifications } from '@/lib/db/repositories/notifications';
import {
  Reminders,
  type AckReminderCandidate,
  type ReviewDueCandidate,
} from '@/lib/db/repositories/reminders';
import {
  sendNotificationEmail,
  type NotificationType,
} from '@/lib/email/send';
import { resolveRecipientEmail } from '@/lib/email/recipients';
import { acknowledgeUrl, reviewUrl } from '@/lib/email/urls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = ReviewDueCandidate | AckReminderCandidate;

type Winner = {
  type: Extract<NotificationType, 'review_due' | 'ack_reminder'>;
  userId: string;
  clerkUserId: string;
  policyId: string;
  policyTitle: string;
  orgName: string;
  dueDate?: Date | null;
};

function cronContext(orgId: string): OrgContext {
  return {
    orgId,
    userId: '',
    clerkOrgId: '',
    clerkUserId: '',
    role: 'admin',
  };
}

function payloadFor(candidate: Candidate): Record<string, unknown> {
  if (candidate.type === 'review_due') {
    return {
      policyId: candidate.policyId,
      policyTitle: candidate.policyTitle,
      dueDate: candidate.dueDate?.toISOString() ?? null,
    };
  }
  return {
    policyId: candidate.policyId,
    policyTitle: candidate.policyTitle,
    ackState: candidate.ackState,
  };
}

async function claimCandidate(
  candidate: Candidate,
  orgName: string,
  windowDate: string,
  s: OrgScope,
): Promise<Winner | null> {
  const inserted = await s.tx
    .insert(reminderSends)
    .values({
      orgId: s.orgId,
      userId: candidate.userId,
      policyId: candidate.policyId,
      type: candidate.type,
      windowDate,
      sentAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: reminderSends.id });

  if (inserted.length === 0) return null;

  await Notifications.create(s, {
    userId: candidate.userId,
    type: candidate.type,
    payloadJson: payloadFor(candidate),
    read: false,
  });

  return {
    type: candidate.type,
    userId: candidate.userId,
    clerkUserId: candidate.clerkUserId,
    policyId: candidate.policyId,
    policyTitle: candidate.policyTitle,
    orgName,
    dueDate: candidate.type === 'review_due' ? candidate.dueDate : undefined,
  };
}

async function sendWinnerEmail(winner: Winner): Promise<void> {
  try {
    const email = await resolveRecipientEmail(winner.clerkUserId);
    if (!email) return;
    await sendNotificationEmail(winner.type, email, {
      policyTitle: winner.policyTitle,
      orgName: winner.orgName,
      acknowledgeUrl: winner.type === 'ack_reminder'
        ? acknowledgeUrl(winner.policyId)
        : undefined,
      reviewUrl: winner.type === 'review_due'
        ? reviewUrl(winner.policyId)
        : undefined,
    });
  } catch (err) {
    console.error('[cron/reminders] email send failed', {
      event: 'cron_email_error',
      type: winner.type,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
  }
}

export async function GET(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let orgRows: Array<{ id: string; name: string }>;
  try {
    orgRows = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations);
  } catch (err) {
    console.error('[cron/reminders] org enumeration failed', {
      event: 'cron_preloop_db_error',
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return Response.json({ error: 'Database unavailable' }, { status: 503 });
  }

  const windowDate = new Date().toISOString().slice(0, 10);
  let reviewReminders = 0;
  let ackReminders = 0;

  for (const org of orgRows) {
    try {
      const winners = await withOrgScope(cronContext(org.id), async (s) => {
        const reviewCandidates = await Reminders.listReviewDueCandidatesForOrg(s);
        const ackCandidates = await Reminders.listAckReminderCandidatesForOrg(s);
        const claimed: Winner[] = [];
        for (const candidate of [...reviewCandidates, ...ackCandidates]) {
          const winner = await claimCandidate(candidate, org.name, windowDate, s);
          if (winner) claimed.push(winner);
        }
        return claimed;
      });

      reviewReminders += winners.filter((winner) => winner.type === 'review_due').length;
      ackReminders += winners.filter((winner) => winner.type === 'ack_reminder').length;

      for (const winner of winners) {
        await sendWinnerEmail(winner);
      }
    } catch (err) {
      console.error('[cron/reminders] org failed', {
        event: 'cron_org_error',
        orgIdSuffix: org.id.slice(-4),
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  return Response.json({ reviewReminders, ackReminders });
}
