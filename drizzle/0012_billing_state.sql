-- drizzle/0012_billing_state.sql
-- Phase 6 D-10/D-11/D-12 — additive billing-state columns for organizations.
-- Operator-approved 2026-05-27 per 06-SPEC.md Approved Phase 6 Implementation Decisions.
-- ADDITIVE ONLY — no existing columns, constraints, tables, or data are modified.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "stripe_price_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_current_period_end" timestamptz,
  ADD COLUMN IF NOT EXISTS "stripe_cancel_at_period_end" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "stripe_last_event_created" timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripe_customer_id_unique_idx"
  ON "organizations" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_stripe_subscription_id_unique_idx"
  ON "organizations" ("stripe_subscription_id")
  WHERE "stripe_subscription_id" IS NOT NULL;
