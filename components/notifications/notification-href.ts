export type NotificationType =
  | 'policy_assigned'
  | 'policy_updated'
  | 'review_due'
  | 'ack_reminder';

export type NotificationRow = {
  id: string;
  type: NotificationType;
  payloadJson: unknown;
  read: boolean;
};

export function isNotificationType(value: string): value is NotificationType {
  return (
    value === 'policy_assigned'
    || value === 'policy_updated'
    || value === 'review_due'
    || value === 'ack_reminder'
  );
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
}

export function policyIdFor(row: NotificationRow): string {
  const policyId = payloadRecord(row.payloadJson).policyId;
  return typeof policyId === 'string' ? policyId : '';
}

export function policyTitleFor(row: NotificationRow): string | null {
  const policyTitle = payloadRecord(row.payloadJson).policyTitle;
  return typeof policyTitle === 'string' ? policyTitle : null;
}

export function notificationHref(type: NotificationType, policyId: string): string {
  return type === 'review_due'
    ? `/policies/${policyId}`
    : `/my-policies/${policyId}`;
}

export function titleFor(type: NotificationType): string {
  switch (type) {
    case 'policy_assigned':
      return 'New policy assigned';
    case 'policy_updated':
      return 'Policy updated';
    case 'review_due':
      return 'Review due soon';
    case 'ack_reminder':
      return 'Acknowledgment reminder';
  }
}

export function secondaryFor(row: NotificationRow): string | null {
  const payload = payloadRecord(row.payloadJson);
  if (row.type === 'policy_updated') {
    const versionNumber = payload.versionNumber;
    return typeof versionNumber === 'number' ? `v${versionNumber}` : null;
  }
  if (row.type === 'ack_reminder') {
    const daysOverdue = payload.daysOverdue;
    return typeof daysOverdue === 'number' ? `${daysOverdue} days overdue` : null;
  }
  if (row.type === 'review_due') {
    const dueDate = payload.dueDate;
    if (typeof dueDate !== 'string') return null;
    const date = new Date(dueDate);
    if (Number.isNaN(date.getTime())) return null;
    return `Due ${date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })}`;
  }
  return null;
}
