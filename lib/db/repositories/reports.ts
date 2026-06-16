import 'server-only';
import { and, eq, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { OrgScope } from '@/lib/db/scoped';
import {
  acknowledgments,
  departments,
  policies,
  policyAssignments,
  policyVersions,
  users,
} from '@/lib/db/schema';

export type AckComplianceState = 'none' | 'current' | 'stale';

export type AckComplianceFilters = {
  policyId?: string;
  departmentId?: string;
};

export type AckComplianceReportRow = {
  userId: string;
  clerkUserId: string;
  departmentName: string | null;
  policyId: string;
  policyTitle: string;
  policyVersion: number;
  ackState: AckComplianceState;
  acknowledgedAt: Date | null;
  ipAddress: string | null;
  assignedAt: Date;
};

export const Reports = {
  listAckComplianceForOrg: async (
    s: OrgScope,
    filters: AckComplianceFilters = {},
  ): Promise<AckComplianceReportRow[]> => {
    const currentAck = alias(acknowledgments, 'current_ack');
    const priorAck = alias(acknowledgments, 'prior_ack');

    const rows = await s.tx
      .select({
        userId: users.id,
        clerkUserId: users.clerkUserId,
        departmentName: departments.name,
        policyId: policies.id,
        policyTitle: policies.title,
        policyVersion: policies.currentVersion,
        ackState: sql<AckComplianceState>`
          CASE
            WHEN count(${currentAck.id}) FILTER (WHERE ${currentAck.id} IS NOT NULL) > 0 THEN 'current'
            WHEN count(${priorAck.id}) FILTER (WHERE ${priorAck.id} IS NOT NULL) > 0 THEN 'stale'
            ELSE 'none'
          END`.as('ack_state'),
        acknowledgedAt: sql<string | null>`min(${currentAck.acknowledgedAt})`.as(
          'acknowledged_at',
        ),
        ipAddress: sql<string | null>`max(${currentAck.ipAddress})`.as('ip_address'),
        assignedAt: sql<string>`min(${policyAssignments.assignedAt})`.as('assigned_at'),
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
      .leftJoin(
        departments,
        and(
          eq(departments.orgId, s.orgId),
          eq(departments.id, users.departmentId),
        ),
      )
      .where(
        and(
          eq(users.orgId, s.orgId),
          eq(users.role, 'employee'),
          filters.policyId ? eq(policies.id, filters.policyId) : undefined,
          filters.departmentId ? eq(users.departmentId, filters.departmentId) : undefined,
        ),
      )
      .groupBy(
        users.id,
        users.clerkUserId,
        users.departmentId,
        departments.id,
        departments.name,
        policies.id,
        policies.title,
        policies.currentVersion,
      )
      .orderBy(users.id, policies.id);

    return rows.map((row) => ({
      ...row,
      acknowledgedAt: row.acknowledgedAt ? new Date(row.acknowledgedAt) : null,
      assignedAt: new Date(row.assignedAt),
    }));
  },
};
