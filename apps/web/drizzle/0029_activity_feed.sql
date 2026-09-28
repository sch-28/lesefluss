ALTER TABLE "social_profile" ADD COLUMN "feed_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE TABLE "social_feed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"book_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb,
	CONSTRAINT "social_feed_event_type_check" CHECK ("social_feed_event"."type" IN ('started', 'finished'))
);
--> statement-breakpoint
ALTER TABLE "social_feed_event" ADD CONSTRAINT "social_feed_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_feed_event_book_type_idx" ON "social_feed_event" USING btree ("actor_id","book_id","type");--> statement-breakpoint
CREATE INDEX "social_feed_event_actor_created_idx" ON "social_feed_event" USING btree ("actor_id","created_at","id");--> statement-breakpoint
CREATE INDEX "social_feed_event_created_idx" ON "social_feed_event" USING btree ("created_at");
