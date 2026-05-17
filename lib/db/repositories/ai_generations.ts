// lib/db/repositories/ai_generations.ts
// L-03 + D-06: per-aggregate AiGenerations repository.
// Phase 4 (AI Layer) fills body — every Claude API call writes one row here.
// RESEARCH Pitfall 6: NO raw `db` import. See policies.ts header.
import 'server-only';
import type { OrgScope } from '@/lib/db/scoped';
import { aiGenerations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type AiGenerationCreateInput = Omit<
  typeof aiGenerations.$inferInsert,
  'orgId' | 'id' | 'createdAt'
>;

export const AiGenerations = {
  listAll: (s: OrgScope) =>
    s.tx
      .select()
      .from(aiGenerations)
      .where(eq(aiGenerations.orgId, s.orgId)),

  record: (_s: OrgScope, _input: AiGenerationCreateInput) => {
    throw new Error('Not yet implemented — Phase 4 (AI Layer)');
  },
};
