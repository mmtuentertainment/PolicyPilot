ALTER TABLE "acknowledgments" DROP CONSTRAINT "acknowledgments_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_generations" DROP CONSTRAINT "ai_generations_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "departments" DROP CONSTRAINT "departments_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "policies" DROP CONSTRAINT "policies_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_assignments" DROP CONSTRAINT "policy_assignments_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_versions" DROP CONSTRAINT "policy_versions_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_stages" DROP CONSTRAINT "workflow_stages_org_id_organizations_id_fk";
--> statement-breakpoint
ALTER TABLE "acknowledgments" ADD CONSTRAINT "acknowledgments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Ordering note: the UNIQUE constraint on departments(org_id, id) MUST land
-- BEFORE the composite FK below — PostgreSQL rejects a composite FK whose
-- referenced columns lack a matching PK or UNIQUE constraint. drizzle-kit
-- 0.31.10 emits these in the opposite order (composite FK first, then the
-- UNIQUE), so this migration is hand-reordered after generation.
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_department_id_departments_fk" FOREIGN KEY ("org_id","department_id") REFERENCES "public"."departments"("org_id","id") ON DELETE no action ON UPDATE no action;