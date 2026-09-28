CREATE TABLE "social_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"subject_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "social_notification" ADD CONSTRAINT "social_notification_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_notification" ADD CONSTRAINT "social_notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_notification_event_idx" ON "social_notification" USING btree ("recipient_id","type","actor_id","subject_id");--> statement-breakpoint
CREATE INDEX "social_notification_recipient_created_idx" ON "social_notification" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "social_notification_unread_idx" ON "social_notification" USING btree ("recipient_id") WHERE "social_notification"."read_at" IS NULL;
