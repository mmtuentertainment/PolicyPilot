import 'server-only';
import { alias } from 'drizzle-orm/pg-core';
import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { OrgScope } from '@/lib/db/scoped';
import {
  acknowledgments,
  organizations,
  policies,
  policyAssignments,
  policyVersions,
  users,
} from '@/lib/db/schema';
import type { PolicyId } from '@/lib/policies/types';

export type ReviewDueCandidate = {
  type: 'review_due';
  userId: string;
  clerkUserId: string;
  policyId: string;
  policyTitle: string;
  dueDate: Date | null;
};

export type AckReminderCandidate = {
  type: 'ack_reminder';
  userId: string;
  clerkUserId: string;
  policyId: string;
  policyTitle: string;
  ackState: 'none' | 'stale';
};

export type PolicyNotificationRecipient = {
  userId: string;
  clerkUserId: string;
  policyId: string;
  policyTitle: string;
  versionNumber: number;
  orgName: string;
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export const Reminders = {
  listReviewDueCandidatesForOrg: async (
    s: OrgScope,
    now = new Date(),
  ): Promise<ReviewDueCandidate[]> => {
    const cutoff = addDays(now, 14);
    const rows = await s.tx
      .select({
        type: sql<'review_due'>`'review_due'`.as('type'),
        userId: users.id,
        clerkUserId: users.clerkUserId,
        policyId: policies.id,
        policyTitle: policies.title,
        dueDate: policies.nextReviewDate,
      })
      .from(policies)
      .innerJoin(
        users,
        and(eq(users.orgId, s.orgId), eq(users.role, 'admin')),
      )
      .where(
        and(
          eq(policies.orgId, s.orgId),
          eq(policies.status, 'published'),
          isNotNull(policies.nextReviewDate),
          lte(policies.nextReviewDate, cutoff),
        ),
      );
    return rows;
  },

  listAckReminderCandidatesForOrg: async (
    s: OrgScope,
    now = new Date(),
  ): Promise<AckReminderCandidate[]> => {
    const currentAck = alias(acknowledgments, 'current_ack');
    const priorAck = alias(acknowledgments, 'prior_ack');
    const cutoff = addDays(now, -7);

    const rows = await s.tx
      .selectDistinct({
        type: sql<'ack_reminder'>`'ack_reminder'`.as('type'),
        userId: users.id,
        clerkUserId: users.clerkUserId,
        policyId: policies.id,
        policyTitle: policies.title,
        ackState: sql<'none' | 'stale'>`
          CASE
            WHEN ${priorAck.id} IS NOT NULL THEN 'stale'
            ELSE 'none'
          END`.as('ack_state'),
      })
      .from(users)
      .innerJoin(
        policyAssignments,
        and(
          eq(policyAssignments.orgId, s.orgId),
          or(
            and(
              eq(policyAssignments.assigneeType, 'user'),
              eq(policyAssignments.assigneeId, users.id),
            ),
            and(
              eq(policyAssignments.assigneeType, 'department'),
              eq(policyAssignments.assigneeId, users.departmentId),
            ),
          ),
        ),
      )
      .innerJoin(
        policies,
        and(
          eq(policies.orgId, s.orgId),
          eq(policies.id, policyAssignments.policyId),
          eq(policies.status, 'published'),
        ),
      )
      .innerJoin(
        policyVersions,
        and(
          eq(policyVersions.orgId, s.orgId),
          eq(policyVersions.policyId, policies.id),
          eq(policyVersions.versionNumber, policies.currentVersion),
        ),
      )
      .leftJoin(
        currentAck,
        and(
          eq(currentAck.orgId, s.orgId),
          eq(currentAck.userId, users.id),
          eq(currentAck.policyId, policies.id),
          eq(currentAck.policyVersionId, policyVersions.id),
        ),
      )
      .leftJoin(
        priorAck,
        and(
          eq(priorAck.orgId, s.orgId),
          eq(priorAck.userId, users.id),
          eq(priorAck.policyId, policies.id),
          sql`${priorAck.policyVersionId} <> ${policyVersions.id}`,
        ),
      )
      .where(
        and(
          eq(users.orgId, s.orgId),
          isNull(currentAck.id),
          or(
            and(
              isNull(priorAck.id),
              sql`coalesce(${policyAssignments.assignedAt}, ${policyVersions.createdAt}) <= ${cutoff}`,
            ),
            and(isNotNull(priorAck.id), lte(policyVersions.createdAt, cutoff)),
          ),
        ),
      );

    return rows;
  },

  listRecipientsForPolicy: (s: OrgScope, policyId: PolicyId) =>
    s.tx
      .selectDistinct({
        userId: users.id,
        clerkUserId: users.clerkUserId,
        policyId: policies.id,
        policyTitle: policies.title,
        versionNumber: policies.currentVersion,
        orgName: organizations.name,
      })
      .from(policyAssignments)
      .innerJoin(
        policies,
        and(
          eq(policies.orgId, s.orgId),
          eq(policies.id, policyAssignments.policyId),
          eq(policies.id, policyId),
        ),
      )
      .innerJoin(
        organizations,
        and(eq(organizations.id, s.orgId), eq(policies.orgId, organizations.id)),
      )
      .innerJoin(
        users,
        and(
          eq(users.orgId, s.orgId),
          or(
            and(
              eq(policyAssignments.assigneeType, 'user'),
              eq(policyAssignments.assigneeId, users.id),
            ),
            and(
              eq(policyAssignments.assigneeType, 'department'),
              eq(policyAssignments.assigneeId, users.departmentId),
            ),
          ),
        ),
      )
      .where(
        and(
          eq(policyAssignments.orgId, s.orgId),
          eq(policyAssignments.policyId, policyId),
        ),
      ),

  listDepartmentRecipientsForPolicy: (
    s: OrgScope,
    policyId: PolicyId,
    departmentId: string,
  ) =>
    s.tx
      .selectDistinct({
        userId: users.id,
        clerkUserId: users.clerkUserId,
        policyId: policies.id,
        policyTitle: policies.title,
        versionNumber: policies.currentVersion,
        orgName: organizations.name,
      })
      .from(users)
      .innerJoin(
        policies,
        and(eq(policies.orgId, s.orgId), eq(policies.id, policyId)),
      )
      .innerJoin(
        organizations,
        and(eq(organizations.id, s.orgId), eq(policies.orgId, organizations.id)),
      )
      .where(
        and(
          eq(users.orgId, s.orgId),
          eq(users.departmentId, departmentId),
        ),
      ),
};
