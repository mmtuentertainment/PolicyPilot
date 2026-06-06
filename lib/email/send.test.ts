import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailContext, NotificationType } from './send';

vi.mock('server-only', () => ({}));

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/client', () => ({
  getResendClient: vi.fn(() => ({
    emails: {
      send: sendMock,
    },
  })),
}));

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'email_test_123' }, error: null });
  process.env.RESEND_FROM_EMAIL = '';
});

const baseCtx: EmailContext = {
  policyTitle: 'Handbook',
  orgName: 'Acme',
  acknowledgeUrl: 'https://app.example.test/my-policies/policy_1',
  reviewUrl: 'https://app.example.test/policies/policy_1',
};

const cases: Array<{ type: NotificationType; subjectToken: string }> = [
  { type: 'policy_assigned', subjectToken: 'New Policy' },
  { type: 'policy_updated', subjectToken: 'Policy Updated' },
  { type: 'review_due', subjectToken: 'Policy Review Due' },
  { type: 'ack_reminder', subjectToken: 'Reminder' },
];

describe('sendNotificationEmail', () => {
  for (const c of cases) {
    it(`sends ${c.type} with a React Email component and subject`, async () => {
      const { sendNotificationEmail } = await import('./send');

      await expect(
        sendNotificationEmail(c.type, 'person@example.test', baseCtx),
      ).resolves.toBe('email_test_123');

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@policypilot.com',
          to: 'person@example.test',
          subject: expect.stringContaining(c.subjectToken),
          react: expect.anything(),
        }),
      );
    });
  }

  it('uses RESEND_FROM_EMAIL when configured', async () => {
    process.env.RESEND_FROM_EMAIL = 'PolicyPilot <notify@example.test>';
    const { sendNotificationEmail } = await import('./send');

    await sendNotificationEmail('policy_assigned', 'person@example.test', baseCtx);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'PolicyPilot <notify@example.test>' }),
    );
  });

  it('throws a masked send error when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: new Error('nope') });
    const { sendNotificationEmail } = await import('./send');

    await expect(
      sendNotificationEmail('policy_assigned', 'person@example.test', baseCtx),
    ).rejects.toMatchObject({
      code: 'RESEND_SEND_ERROR',
      recipientMasked: 'p***n@example.test',
    });
  });
});
