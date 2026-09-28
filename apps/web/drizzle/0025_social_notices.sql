ALTER TABLE "social_notification" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "social_notification" ADD COLUMN "payload" jsonb;--> statement-breakpoint
CREATE TABLE "social_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" text NOT NULL,
	"target_user_id" text,
	"target_snapshot" jsonb,
	"reason" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"notifier_user_id" text,
	"notifier_name" text,
	"notifier_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"decision" text,
	"decision_note" text,
	"mail_state" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "social_notice_status_created_idx" ON "social_notice" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "social_notice_target_decided_idx" ON "social_notice" USING btree ("target_user_id","decided_at");--> statement-breakpoint
CREATE TABLE "social_restriction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"until" timestamp,
	"reason" text NOT NULL,
	"notice_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"lifted_at" timestamp,
	"lifted_by" text
);
--> statement-breakpoint
CREATE INDEX "social_restriction_user_kind_idx" ON "social_restriction" USING btree ("user_id","kind");--> statement-breakpoint
CREATE TABLE "social_takedown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"origin_user_id" text,
	"origin_book_id" text,
	"notice_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "social_takedown_book_idx" ON "social_takedown" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE INDEX "social_takedown_origin_idx" ON "social_takedown" USING btree ("origin_user_id","origin_book_id");
