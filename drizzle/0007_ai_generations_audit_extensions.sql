-- Phase 4 D-32 + D-35 combined migration.
-- Drops legacy ai_generations.tokens_used integer; replaces with the 4-column Anthropic Usage
-- shape (input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens)
-- plus the optional idempotency_key text column for /api/ai/draft Idempotency-Key dedup.
--
-- DROP COLUMN tokens_used is IRREVERSIBLE — pre-paying-customer status verified per STATE.md
-- (no production AI calls exist yet). Operator approved 2026-05-21 (CLAUDE.md ASK FIRST cleared
-- per CONTEXT.md D-44 #1 + #2).
--
-- The Drizzle-generated halves (DROP COLUMN + 5x ADD COLUMN) were assembled via the two-step
-- pattern documented in this plan's deviation log: schema.ts micromanaged to emit ADD COLUMN
-- ddl with tokens_used present (produced 0007_funny_magma intermediate), then schema.ts edited
-- to drop tokens_used (produced 0008_dry_masque intermediate). Intermediates collapsed into
-- THIS file; final snapshot derived from 0008's post-state with prevId rewritten to point to
-- 0006_rls_batch_jobs.json's id (so the journal chain stays linear without orphan ids).
-- Non-TTY pnpm db:generate cannot answer Drizzle Kit's column-rename prompt; this is the
-- documented workaround per the Task 4 deviation in 04-02-SUMMARY.md.
ALTER TABLE "ai_generations" DROP COLUMN "tokens_used";
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_read_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "cache_creation_input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "idempotency_key" text;
--> statement-breakpoint

-- Phase 4 D-32 hand-written: partial-unique index for Idempotency-Key dedup on /api/ai/draft.
-- Drizzle does NOT emit partial indexes from .unique() on a nullable column, so this is added
-- post-generation per the combined-migration pattern in drizzle/0004_policy_versions_unique.sql.
-- The WHERE clause keeps NULL keys (non-idempotent calls) out of the uniqueness check.
CREATE UNIQUE INDEX "ai_generations_org_idempotency_key"
  ON "ai_generations"("org_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
