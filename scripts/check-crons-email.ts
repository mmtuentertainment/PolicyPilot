import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Notifications } from '@/lib/db/repositories/notifications';
import { Reminders } from '@/lib/db/repositories/reminders';
import { reminderSends } from '@/lib/db/schema';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('Phase 7 crons + email static gates', () => {
  it('R7-6 markRead and markAllReadForUser stay org-scoped and mutable', () => {
    const notificationsSource = source('lib/db/repositories/notifications.ts');
    expect(typeof Notifications.markRead).toBe('function');
    expect(typeof Notifications.markAllReadForUser).toBe('function');
    expect(notificationsSource).toContain('eq(notifications.orgId, s.orgId)');
    expect(notificationsSource).toContain('eq(notifications.userId, userId)');
    expect(notificationsSource).toContain('eq(notifications.read, false)');
    expect(source('scripts/check-acknowledgment-immutability.ts')).not.toContain(
      "'notifications'",
    );
  });

  it('R7-5 reminder candidate queries use org scope and department fan-out', () => {
    const remindersSource = source('lib/db/repositories/reminders.ts');
    expect(typeof Reminders.listReviewDueCandidatesForOrg).toBe('function');
    expect(typeof Reminders.listAckReminderCandidatesForOrg).toBe('function');
    expect(remindersSource).toContain('eq(users.role, ');
    expect(remindersSource).toContain('users.departmentId');
    expect(remindersSource).toContain('eq(users.orgId, s.orgId)');
  });

  it('R7-2 reminder_sends ledger is declared with a daily dedup key', () => {
    const schemaSource = source('lib/db/schema.ts');
    const migrationSource = source('drizzle/0014_reminder_sends.sql');
    expect(reminderSends).toBeDefined();
    expect(schemaSource).toContain("unique('reminder_sends_dedup_key')");
    expect(migrationSource).toContain('reminder_sends_dedup_key');
    expect(migrationSource).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migrationSource).toContain('GRANT SELECT, INSERT, UPDATE, DELETE');
  });

  it('R7-8 publish writes nextReviewDate forward-only', () => {
    const transitionsSource = source('lib/policies/transitions.ts');
    expect(transitionsSource).toContain('nextReviewDate');
    expect(transitionsSource).toContain('Phase 7 D-08: forward-only writer');
    expect(transitionsSource).not.toContain('UPDATE policies SET next_review_date');
  });
});
