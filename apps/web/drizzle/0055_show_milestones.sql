ALTER TABLE "social_profile" ADD COLUMN "show_milestones" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- A reader who already hid their stats keeps their totals hidden: milestones start hidden too.
UPDATE "social_profile" SET "show_milestones" = "show_stats";
