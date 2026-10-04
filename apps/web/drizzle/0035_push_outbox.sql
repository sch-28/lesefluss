CREATE TABLE "social_push_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"friend_requests" boolean DEFAULT true NOT NULL,
	"shares" boolean DEFAULT true NOT NULL,
	"buddy_reads" boolean DEFAULT true NOT NULL,
	"discussion" boolean DEFAULT true NOT NULL,
	"previews" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_push_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"recipient_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"type" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"send_after" timestamp NOT NULL,
	CONSTRAINT "social_push_outbox_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "social_push_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_push_preferences" ADD CONSTRAINT "social_push_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_push_outbox" ADD CONSTRAINT "social_push_outbox_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_push_outbox" ADD CONSTRAINT "social_push_outbox_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_push_sent" ADD CONSTRAINT "social_push_sent_recipient_id_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_push_sent" ADD CONSTRAINT "social_push_sent_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_push_outbox_send_after_idx" ON "social_push_outbox" USING btree ("send_after");--> statement-breakpoint
CREATE INDEX "social_push_sent_recipient_idx" ON "social_push_sent" USING btree ("recipient_id","sent_at");
