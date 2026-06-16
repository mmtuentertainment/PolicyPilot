import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';

const CLERK_USER_BATCH_SIZE = 100;

export type ReportRow = {
  clerkUserId: string;
};

export type EnrichedRow<T extends ReportRow = ReportRow> = T & {
  name: string;
  email: string;
};

type Identity = {
  name: string;
  email: string;
};

function chunks(values: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

export async function enrichWithClerkIdentity<T extends ReportRow>(
  rows: T[],
): Promise<EnrichedRow<T>[]> {
  const clerkUserIds = Array.from(new Set(rows.map((row) => row.clerkUserId)));
  if (clerkUserIds.length === 0) return [];

  const client = await clerkClient();
  const identities = new Map<string, Identity>();

  for (const userId of chunks(clerkUserIds, CLERK_USER_BATCH_SIZE)) {
    const { data } = await client.users.getUserList({ userId, limit: 100 });
    for (const user of data) {
      const name =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        '';
      identities.set(user.id, {
        name,
        email: user.primaryEmailAddress?.emailAddress ?? '',
      });
    }
  }

  return rows.map((row) => {
    const identity = identities.get(row.clerkUserId);
    return {
      ...row,
      name: identity?.name ?? '',
      email: identity?.email ?? '',
    };
  });
}
