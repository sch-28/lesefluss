CREATE TABLE "social_push_token" (
	"token" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "social_push_token_platform_check" CHECK ("social_push_token"."platform" IN ('android', 'ios'))
);
--> statement-breakpoint
ALTER TABLE "social_push_token" ADD CONSTRAINT "social_push_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_push_token" ADD CONSTRAINT "social_push_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_push_token_user_idx" ON "social_push_token" USING btree ("user_id");
